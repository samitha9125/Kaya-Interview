import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { fixedClock } from "@/test/fakes";
import { GOV_BUREAU_TIMEOUT_MS, HttpGovBureau } from "./http-gov-bureau";

type Reply = (request: IncomingMessage, response: ServerResponse) => void;

let server: Server | undefined;
let received: { url?: string; body: string }[] = [];

// A real HTTP server on a random local port: the adapter is tested through
// its actual fetch, timeout and parsing, never a mocked fetch.
async function bureauReplying(reply: Reply, timeoutMs = GOV_BUREAU_TIMEOUT_MS) {
  received = [];
  server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk: Buffer) => (body += chunk.toString()));
    request.on("end", () => {
      received.push({ url: request.url, body });
      reply(request, response);
    });
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return new HttpGovBureau({
    baseUrl: `http://127.0.0.1:${port}`,
    apiKey: "test-key",
    timeoutMs,
    clock: fixedClock(),
  });
}

const json =
  (status: number, body: unknown, headers: Record<string, string> = {}): Reply =>
  (_request, response) => {
    response.writeHead(status, { "content-type": "application/json", ...headers });
    response.end(JSON.stringify(body));
  };

afterEach(async () => {
  const running = server;
  server = undefined;
  if (!running) return;
  running.closeAllConnections();
  await new Promise((resolve) => running.close(resolve));
});

// Made-up NIC. secret-scan:ignore
const NIC = "199012345678";

describe("adapters/http-gov-bureau: valid answers", () => {
  it.each([{ score: 900 }])("FR-CRED-02: the edge score $score is accepted", async ({ score }) => {
    const bureau = await bureauReplying(json(200, { score }));

    await expect(bureau.fetchScore(NIC)).resolves.toEqual({ kind: "score", score });
  });
});

describe("adapters/http-gov-bureau: no credit history (BR-CRED-06)", () => {
  it("BR-CRED-06: a 404 → no history, not a failure", async () => {
    const bureau = await bureauReplying(json(404, { error: "not_found" }));

    await expect(bureau.fetchScore(NIC)).resolves.toEqual({ kind: "no_history" });
  });
});

describe("adapters/http-gov-bureau: malformed answers are failures, never scores (P0-11)", () => {
  it.each([
    { case: "a score above 900", body: { score: 901 } },
    { case: "extra data about the person", body: { score: 742, nextEvaluation: "2027-01-01" } },
  ])("P0-11: $case → failure", async ({ body }) => {
    const bureau = await bureauReplying(json(200, body));

    await expect(bureau.fetchScore(NIC)).resolves.toEqual({
      kind: "failure",
      cause: "malformed",
      isRetryable: false,
    });
  });
});
