// Behind the TLS-terminating reverse proxy (ARCHITECTURE §12), the proxy
// sets X-Forwarded-For and its first entry is the caller. Without a proxy
// the header could be forged, so it's only trusted in that deployment.
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "unknown";
}
