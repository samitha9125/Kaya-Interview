import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { HttpMockBureauAdmin } from "./http-mock-bureau-admin";

type Received = { path: string; body: string };

let server: Server | undefined;

// A local server standing in for the mock's admin routes.
async function adminReplying(status: number) {
  const received: Received[] = [];
  server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      received.push({ path: request.url ?? "", body });
      response.writeHead(status).end();
    });
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { admin: new HttpMockBureauAdmin(`http://127.0.0.1:${port}/api/mock-gov`), received };
}

afterEach(async () => {
  const running = server;
  server = undefined;
  await new Promise((resolve) => running?.close(resolve));
});

describe("adapters/http-mock-bureau-admin (FR-SET-04/05)", () => {
  it("FR-SET-04: a reset posts to the mock's reset route", async () => {
    const { admin, received } = await adminReplying(200);

    expect(await admin.resetDailyLimit()).toBe(true);
    expect(received).toEqual([{ path: "/api/mock-gov/admin/reset", body: "{}" }]);
  });

  it("FR-SET-05: a failure mode is posted as JSON", async () => {
    const { admin, received } = await adminReplying(200);

    expect(await admin.setFailureMode("down")).toBe(true);
    expect(received).toEqual([
      { path: "/api/mock-gov/admin/failure-mode", body: '{"mode":"down"}' },
    ]);
  });

  it("BR-SET-01: a refused call (the mock's 404 outside demo mode) reports failure", async () => {
    const { admin } = await adminReplying(404);

    expect(await admin.resetDailyLimit()).toBe(false);
  });

  it("FR-SET-04: an unreachable mock reports failure instead of throwing", async () => {
    const { admin } = await adminReplying(200);
    await new Promise((resolve) => server?.close(resolve));

    expect(await admin.resetDailyLimit()).toBe(false);
  });
});
