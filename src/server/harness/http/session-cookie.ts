// FR-AUTH-02: __Host- makes the browser insist on Secure, Path=/ and no
// Domain, so no subdomain can set or read it. No Max-Age: the server
// enforces the idle and absolute timeouts, and the cookie dies with the
// browser session.
export const SESSION_COOKIE = "__Host-session";

const FLAGS = "Path=/; HttpOnly; Secure; SameSite=Strict";

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; ${FLAGS}`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; ${FLAGS}; Max-Age=0`;
}

export function readSessionToken(request: Request): string | undefined {
  const cookies = request.headers.get("cookie")?.split(";") ?? [];
  const prefix = `${SESSION_COOKIE}=`;
  const value = cookies.map((part) => part.trim()).find((part) => part.startsWith(prefix));
  return value ? value.slice(prefix.length) || undefined : undefined;
}
