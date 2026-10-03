import "server-only";
import type { MockBureauAdmin, MockFailureMode } from "@/server/modules/settings";

const TIMEOUT_MS = 5_000;

// The demo controls reach the mock over HTTP, like every other caller
// (ARCHITECTURE §4); its admin routes exist only in demo mode.
export class HttpMockBureauAdmin implements MockBureauAdmin {
  constructor(private readonly baseUrl: string) {}

  resetDailyLimit() {
    return this.post("/admin/reset", {});
  }

  setFailureMode(mode: MockFailureMode) {
    return this.post("/admin/failure-mode", { mode });
  }

  private async post(path: string, body: object): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: "error",
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
