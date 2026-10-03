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
  return new HttpGovBureau({ baseUrl: `http://127.0.0.1:${port}`, timeoutMs, clock: fixedClock() });
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
  it("FR-CRED-02: a 200 with an integer score in 300–900 is a score", async () => {
    const bureau = await bureauReplying(json(200, { score: 742 }));

    await expect(bureau.fetchScore(NIC)).resolves.toEqual({ kind: "score", score: 742 });
  });

  it("FR-CRED-02: the NIC is posted to /credit-score as JSON", async () => {
    const bureau = await bureauReplying(json(200, { score: 742 }));

    await bureau.fetchScore(NIC);

    expect(received).toEqual([{ url: "/credit-score", body: JSON.stringify({ nic: NIC }) }]);
  });

  it.each([{ score: 300 }, { score: 900 }])(
    "FR-CRED-02: the edge score $score is accepted",
    async ({ score }) => {
      const bureau = await bureauReplying(json(200, { score }));

      await expect(bureau.fetchScore(NIC)).resolves.toEqual({ kind: "score", score });
    },
  );

  it("BR-CRED-06: 404 means no credit history", async () => {
    const bureau = await bureauReplying(json(404, { error: "no_credit_history" }));

    await expect(bureau.fetchScore(NIC)).resolves.toEqual({ kind: "no_history" });
  });
});

describe("adapters/http-gov-bureau: malformed answers are failures, never scores (P0-11)", () => {
  it.each([
    { case: "a score below 300", body: { score: 299 } },
    { case: "a score above 900", body: { score: 901 } },
    { case: "a fractional score", body: { score: 742.5 } },
    { case: "a score as text", body: { score: "742" } },
    { case: "no score", body: {} },
    { case: "extra data about the person", body: { score: 742, nextEvaluation: "2027-01-01" } },
    { case: "not an object", body: [742] },
  ])("P0-11: $case → failure", async ({ body }) => {
    const bureau = await bureauReplying(json(200, body));

    await expect(bureau.fetchScore(NIC)).resolves.toEqual({
      kind: "failure",
      cause: "malformed",
      isRetryable: false,
    });
  });

  it("P0-11: a body that isn't JSON → failure", async () => {
    const bureau = await bureauReplying((_request, response) => {
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<html>maintenance</html>");
    });

    await expect(bureau.fetchScore(NIC)).resolves.toMatchObject({
      kind: "failure",
      cause: "malformed",
    });
  });
});

describe("adapters/http-gov-bureau: errors", () => {
  it.each([{ status: 400 }, { status: 401 }, { status: 403 }, { status: 422 }])(
    "BR-CRED-06: $status is a failure that isn't retried",
    async ({ status }) => {
      const bureau = await bureauReplying(json(status, {}));

      await expect(bureau.fetchScore(NIC)).resolves.toEqual({
        kind: "failure",
        cause: "client_error",
        isRetryable: false,
      });
    },
  );

  it.each([{ status: 500 }, { status: 502 }, { status: 503 }])(
    "BR-CRED-05: $status is a retryable server error",
    async ({ status }) => {
      const bureau = await bureauReplying(json(status, {}));

      await expect(bureau.fetchScore(NIC)).resolves.toEqual({
        kind: "failure",
        cause: "server_error",
        isRetryable: true,
      });
    },
  );

  it("BR-CRED-05: no answer within the timeout is a retryable timeout", async () => {
    const bureau = await bureauReplying(() => {}, 50);

    await expect(bureau.fetchScore(NIC)).resolves.toEqual({
      kind: "failure",
      cause: "timeout",
      isRetryable: true,
    });
  });

  it("BR-CRED-05: the timeout per attempt is 5 seconds", () => {
    expect(GOV_BUREAU_TIMEOUT_MS).toBe(5_000);
  });

  it("BR-CRED-05: a refused connection is a retryable network error", async () => {
    const bureau = new HttpGovBureau({ baseUrl: "http://127.0.0.1:1", clock: fixedClock() });

    await expect(bureau.fetchScore(NIC)).resolves.toEqual({
      kind: "failure",
      cause: "network",
      isRetryable: true,
    });
  });
});

describe("adapters/http-gov-bureau: 429 (BR-CRED-04)", () => {
  it("BR-CRED-04: Retry-After in seconds becomes a time to wait until", async () => {
    const bureau = await bureauReplying(json(429, {}, { "retry-after": "3600" }));

    await expect(bureau.fetchScore(NIC)).resolves.toEqual({
      kind: "rate_limited",
      retryAfter: new Date("2026-10-03T11:00:00.000Z"),
    });
  });

  it("BR-CRED-04: Retry-After as an HTTP date is used as it is", async () => {
    const bureau = await bureauReplying(
      json(429, {}, { "retry-after": "Sat, 03 Oct 2026 18:30:00 GMT" }),
    );

    await expect(bureau.fetchScore(NIC)).resolves.toEqual({
      kind: "rate_limited",
      retryAfter: new Date("2026-10-03T18:30:00.000Z"),
    });
  });

  it.each([{ header: undefined }, { header: "soon" }])(
    "BR-CRED-04: a missing or unreadable Retry-After ($header) leaves the wait to the policy",
    async ({ header }) => {
      const bureau = await bureauReplying(json(429, {}, header ? { "retry-after": header } : {}));

      await expect(bureau.fetchScore(NIC)).resolves.toEqual({
        kind: "rate_limited",
        retryAfter: null,
      });
    },
  );

  it("BR-CRED-03: the adapter declares the service's 5 calls a day", async () => {
    const bureau = await bureauReplying(json(200, { score: 742 }));

    expect(bureau.callsPerDay).toBe(5);
  });
});
