type HeaderOptions = { nonce: string; isDevelopment: boolean; isProduction: boolean };

// FR-WEB-06. The nonce lets Next.js's own inline scripts and styles run
// while anything injected is blocked (the Next.js CSP guide). React needs
// 'unsafe-eval' in development only, for its error overlay.
// upgrade-insecure-requests is left out: HSTS already keeps production on
// HTTPS, and it would break the plain-HTTP localhost runs used in tests.
// The dev error overlay injects styles without the nonce, so development
// allows inline styles; a browser ignores 'unsafe-inline' once a nonce is
// listed, so the nonce is dropped there too.
export function securityHeaders({ nonce, isDevelopment, isProduction }: HeaderOptions) {
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' ${isDevelopment ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
  return {
    "Content-Security-Policy": csp,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    ...(isProduction ? { "Strict-Transport-Security": "max-age=63072000; includeSubDomains" } : {}),
  };
}
