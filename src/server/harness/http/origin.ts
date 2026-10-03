// FR-WEB-01: a state-changing request must come from our own pages. The
// browser sets Origin on every cross-site POST and can't be made to fake
// it, so a missing or foreign Origin is refused. Compared with the Host
// header the request arrived on, which the reverse proxy passes through.
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
