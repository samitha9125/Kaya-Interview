import { describe, expect, it } from "vitest";
import { securityHeaders } from "./security-headers";

const styleSrc = (isDevelopment: boolean) =>
  securityHeaders({ nonce: "abc", isDevelopment, isProduction: !isDevelopment })
    ["Content-Security-Policy"].split("; ")
    .find((directive) => directive.startsWith("style-src"));

describe("harness/security-headers: style-src", () => {
  it.each([
    { isDevelopment: false, expected: "style-src 'self' 'nonce-abc'" },
    { isDevelopment: true, expected: "style-src 'self' 'unsafe-inline'" },
  ])(
    "FR-WEB-06: inline styles only in development (development: $isDevelopment)",
    ({ isDevelopment, expected }) => {
      expect(styleSrc(isDevelopment)).toBe(expected);
    },
  );
});
