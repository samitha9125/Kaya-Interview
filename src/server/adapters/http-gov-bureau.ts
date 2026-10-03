import "server-only";
import { z } from "zod";
import type { BureauResult, CreditBureau } from "@/server/modules/gov-credit";
import type { Clock } from "@/server/platform/clock";

// BR-CRED-05: 5 seconds per attempt.
export const GOV_BUREAU_TIMEOUT_MS = 5_000;
// The service's published limit (BR-CRED-03).
const CALLS_PER_DAY = 5;

// FR-CRED-02: strict, so a malformed or out-of-range answer, or one that
// carries more than a score, is a failure and never becomes a score.
const ScoreResponse = z.strictObject({ score: z.int().min(300).max(900) });

type Options = { baseUrl: string; clock: Clock; timeoutMs?: number };

export class HttpGovBureau implements CreditBureau {
  readonly callsPerDay = CALLS_PER_DAY;
  private readonly url: string;
  private readonly timeoutMs: number;
  private readonly clock: Clock;

  constructor({ baseUrl, clock, timeoutMs = GOV_BUREAU_TIMEOUT_MS }: Options) {
    this.url = `${baseUrl.replace(/\/$/, "")}/credit-score`;
    this.clock = clock;
    this.timeoutMs = timeoutMs;
  }

  async fetchScore(nic: string): Promise<BureauResult> {
    let response: Response;
    try {
      response = await fetch(this.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nic }),
        signal: AbortSignal.timeout(this.timeoutMs),
        redirect: "error",
      });
    } catch (error) {
      const isTimeout = error instanceof DOMException && error.name === "TimeoutError";
      return { kind: "failure", cause: isTimeout ? "timeout" : "network", isRetryable: true };
    }
    return this.interpret(response);
  }

  private async interpret(response: Response): Promise<BureauResult> {
    if (response.status === 404) return { kind: "no_history" };
    if (response.status === 429) {
      return {
        kind: "rate_limited",
        retryAfter: this.retryAfter(response.headers.get("retry-after")),
      };
    }
    if (response.status >= 500)
      return { kind: "failure", cause: "server_error", isRetryable: true };
    if (response.status !== 200)
      return { kind: "failure", cause: "client_error", isRetryable: false };
    const body: unknown = await response.json().catch(() => undefined);
    const parsed = ScoreResponse.safeParse(body);
    if (!parsed.success) return { kind: "failure", cause: "malformed", isRetryable: false };
    return { kind: "score", score: parsed.data.score };
  }

  // Retry-After is either delay-seconds or an HTTP date (RFC 9110 §10.2.3).
  private retryAfter(header: string | null): Date | null {
    if (!header) return null;
    if (/^\d+$/.test(header)) return new Date(this.clock.now().getTime() + Number(header) * 1_000);
    const date = new Date(header);
    return Number.isNaN(date.getTime()) ? null : date;
  }
}
