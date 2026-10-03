import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { OpenRouterProvider } from "./openrouter-provider";

type Received = { url?: string; headers: IncomingHttpHeaders; body: Record<string, unknown> };

let server: Server | undefined;
let received: Received[] = [];

const COMPLETION = {
  id: "gen-1",
  model: "z-ai/glm-5.3-flash",
  choices: [{ index: 0, message: { role: "assistant", content: "Hello" }, finish_reason: "stop" }],
  usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
};

// A real local HTTP server standing in for OpenRouter: what's asserted is
// the request that would leave the bank.
async function openRouterReplying(status = 200) {
  received = [];
  server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk: Buffer) => (body += chunk.toString()));
    request.on("end", () => {
      received.push({ url: request.url, headers: request.headers, body: JSON.parse(body) });
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(status === 200 ? COMPLETION : { error: { message: "boom" } }));
    });
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return new OpenRouterProvider({ apiKey: "test-key", baseURL: `http://127.0.0.1:${port}` });
}

afterEach(async () => {
  const running = server;
  server = undefined;
  if (!running) return;
  running.closeAllConnections();
  await new Promise((resolve) => running.close(resolve));
});

const LOAN = {
  modelId: "z-ai/glm-5.3-flash",
  reasoningEffort: "low",
  maxOutputTokens: 400,
} as const;

describe("adapters/openrouter-provider: what every request carries", () => {
  it("SPEC §7 privacy: only zero-data-retention providers that deny data collection, never the China-hosted endpoints", async () => {
    const provider = await openRouterReplying();

    await provider.chatModel(LOAN).invoke("Hi");

    expect(received[0]?.body.provider).toEqual({
      zdr: true,
      data_collection: "deny",
      ignore: ["z-ai", "siliconflow"],
    });
  });

  it("TD6, FR-AGT-11: the chosen model, its reasoning effort and the output limit are sent", async () => {
    const provider = await openRouterReplying();

    await provider.chatModel(LOAN).invoke("Hi");

    expect(received[0]?.body).toMatchObject({
      model: "z-ai/glm-5.3-flash",
      reasoning: { effort: "low" },
      max_tokens: 400,
    });
  });

  it("TD6: with no reasoning effort set, none is sent and the model keeps its default", async () => {
    const provider = await openRouterReplying();

    await provider.chatModel({ ...LOAN, reasoningEffort: null }).invoke("Hi");

    expect(received[0]?.body).not.toHaveProperty("reasoning");
  });

  it("bring your own key: the bank's key goes as a bearer token to the chat endpoint", async () => {
    const provider = await openRouterReplying();

    await provider.chatModel(LOAN).invoke("Hi");

    expect(received[0]?.url).toBe("/chat/completions");
    expect(received[0]?.headers.authorization).toBe("Bearer test-key");
  });

  it("FR-AGT-12: the client never retries on its own; retries belong to the agent", async () => {
    const provider = await openRouterReplying(500);

    await expect(provider.chatModel(LOAN).invoke("Hi")).rejects.toThrow();
    expect(received).toHaveLength(1);
  });
});
