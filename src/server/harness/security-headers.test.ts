import { describe, expect, it } from "vitest";
import { securityHeaders } from "./security-headers";

const production = { nonce: "abc123", isDevelopment: false, isProduction: true };

describe("harness/security-headers (FR-WEB-06)", () => {
  it("FR-WEB-06: CSP defaults to self, forbids framing and allows only nonced scripts", () => {
    const csp = securityHeaders(production)["Content-Security-Policy"];

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-inline");
  });

  it("FR-WEB-06: nosniff and no referrer on every response", () => {
    expect(securityHeaders(production)).toMatchObject({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    });
  });

  it.each([
    { isProduction: true, hasHsts: true },
    { isProduction: false, hasHsts: false },
  ])(
    "FR-WEB-06: HSTS only in production (production $isProduction)",
    ({ isProduction, hasHsts }) => {
      const headers = securityHeaders({ ...production, isProduction });

      expect("Strict-Transport-Security" in headers).toBe(hasHsts);
    },
  );

  it.each([
    { isDevelopment: true, allowsEval: true },
    { isDevelopment: false, allowsEval: false },
  ])(
    "FR-WEB-06: 'unsafe-eval' only in development ($isDevelopment)",
    ({ isDevelopment, allowsEval }) => {
      const csp = securityHeaders({ ...production, isDevelopment })["Content-Security-Policy"];

      expect(csp.includes("'unsafe-eval'")).toBe(allowsEval);
    },
  );
});
