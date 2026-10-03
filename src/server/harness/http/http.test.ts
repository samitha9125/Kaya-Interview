import { describe, expect, it } from "vitest";
import { clientIp } from "./client-ip";
import { isSameOrigin } from "./origin";
import { clearedSessionCookie, readSessionToken, sessionCookie } from "./session-cookie";

function requestWith(headers: Record<string, string | undefined>): Request {
  const defined = Object.entries(headers).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  );
  return new Request("http://localhost:3000/api/chat", { method: "POST", headers: defined });
}

describe("harness/http: origin check (FR-WEB-01)", () => {
  it("FR-WEB-01: a request from our own page passes", () => {
    const request = requestWith({ origin: "http://localhost:3000", host: "localhost:3000" });

    expect(isSameOrigin(request)).toBe(true);
  });

  it.each([
    { case: "a missing Origin", headers: { host: "localhost:3000" } },
    {
      case: "a foreign Origin",
      headers: { origin: "https://evil.example", host: "localhost:3000" },
    },
    { case: "another port", headers: { origin: "http://localhost:4000", host: "localhost:3000" } },
    {
      case: "a lookalike host",
      headers: { origin: "http://localhost:3000.evil.example", host: "localhost:3000" },
    },
    { case: "Origin: null", headers: { origin: "null", host: "localhost:3000" } },
  ])("FR-WEB-01: $case is refused", ({ headers }) => {
    expect(isSameOrigin(requestWith(headers))).toBe(false);
  });
});

describe("harness/http: session cookie (FR-AUTH-02)", () => {
  it("FR-AUTH-02: the cookie is __Host-, HttpOnly, Secure and SameSite=Strict", () => {
    expect(sessionCookie("tok")).toBe(
      "__Host-session=tok; Path=/; HttpOnly; Secure; SameSite=Strict",
    );
  });

  it("FR-AUTH-04: clearing the cookie expires it with the same flags", () => {
    expect(clearedSessionCookie()).toBe(
      "__Host-session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0",
    );
  });

  it.each([
    { cookie: "__Host-session=abc", expected: "abc" },
    { cookie: "theme=dark; __Host-session=abc; other=1", expected: "abc" },
    { cookie: "session=abc", expected: undefined },
    { cookie: "__Host-session=", expected: undefined },
  ])("FR-AUTH-02: reads the token from '$cookie'", ({ cookie, expected }) => {
    expect(readSessionToken(requestWith({ cookie }))).toBe(expected);
  });
});

describe("harness/http: client IP", () => {
  it.each([
    { headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" }, expected: "203.0.113.7" },
    { headers: {}, expected: "unknown" },
  ])("FR-WEB-02: the caller's IP from $headers", ({ headers, expected }) => {
    expect(clientIp(requestWith(headers))).toBe(expected);
  });
});
