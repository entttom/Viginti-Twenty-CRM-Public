// Centralized security headers.

/** Headers applied to every JSON API response. */
export function baseJsonHeaders(requestId: string): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Request-ID': requestId,
  };
}

/** Headers for sensitive (non-cacheable) JSON responses. */
export function noStoreJsonHeaders(requestId: string): Record<string, string> {
  return {
    ...baseJsonHeaders(requestId),
    'Cache-Control': 'no-store',
    Pragma: 'no-cache',
  };
}

/** Content-Security-Policy for the static callback fallback HTML page. */
export const CALLBACK_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
