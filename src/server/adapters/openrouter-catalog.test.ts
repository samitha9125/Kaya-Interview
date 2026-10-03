import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import fixture from "@/test/fixtures/openrouter-models.json";
import { OpenRouterCatalog } from "./openrouter-catalog";

let server: Server | undefined;
let received: { url?: string; headers: IncomingHttpHeaders }[] = [];

// A real local HTTP server serving a recorded shape of OpenRouter's
// models API.
async function catalogServing(status: number, body: string) {
  received = [];
  server = createServer((request, response) => {
    received.push({ url: request.url, headers: request.headers });
    response.writeHead(status, { "content-type": "application/json" });
    response.end(body);
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return new OpenRouterCatalog({ baseURL: `http://127.0.0.1:${port}` });
}

afterEach(async () => {
  const running = server;
  server = undefined;
  if (!running) return;
  running.closeAllConnections();
  await new Promise((resolve) => running.close(resolve));
});

const FIXTURE = JSON.stringify(fixture);

describe("adapters/openrouter-catalog: the model list (FR-SET-02)", () => {
  it("FR-SET-02: only models that support tool calls, with fixed prices, are listed", async () => {
    const catalog = await catalogServing(200, FIXTURE);

    const result = await catalog.listToolModels();

    expect(result.ok && result.models.map((model) => model.id)).toEqual([
      "z-ai/glm-5.3-flash",
      "openai/gpt-5.6-luna",
    ]);
  });

  it("FR-SET-02: price per 1M tokens (in integer micro-dollars) and context size come with each model", async () => {
    const catalog = await catalogServing(200, FIXTURE);

    const result = await catalog.listToolModels();

    expect(result.ok && result.models[0]).toEqual({
      id: "z-ai/glm-5.3-flash",
      name: "Z.ai: GLM 5.3 Flash",
      contextLength: 131_072,
      inputMicroUsdPerMTok: 150_000,
      outputMicroUsdPerMTok: 500_000,
    });
  });

  it("asks for tool-capable models and sends no API key: the list is public", async () => {
    const catalog = await catalogServing(200, FIXTURE);

    await catalog.listToolModels();

    expect(received[0]?.url).toBe("/models?supported_parameters=tools");
    expect(received[0]?.headers.authorization).toBeUndefined();
  });

  it.each([
    { status: 500, body: "{}" },
    { status: 200, body: "not json" },
    { status: 200, body: JSON.stringify({ models: [] }) },
  ])("FR-SET-02: an unusable answer ($status, $body) → unavailable", async ({ status, body }) => {
    const catalog = await catalogServing(status, body);

    await expect(catalog.listToolModels()).resolves.toEqual({ ok: false });
  });
});
