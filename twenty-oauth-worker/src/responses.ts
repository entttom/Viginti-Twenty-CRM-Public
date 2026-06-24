// Response builders. Every response carries an X-Request-ID.

import { baseJsonHeaders, noStoreJsonHeaders } from './security-headers';

/** Build a JSON response with the given status and header set. */
export function jsonResponse(
  body: unknown,
  status: number,
  headers: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

/** A cacheable public JSON response. */
export function publicJson(body: unknown, requestId: string, maxAgeSeconds: number): Response {
  return jsonResponse(body, 200, {
    ...baseJsonHeaders(requestId),
    'Cache-Control': `public, max-age=${maxAgeSeconds}`,
  });
}

/** A non-cacheable JSON response. */
export function noStoreJson(body: unknown, status: number, requestId: string): Response {
  return jsonResponse(body, status, noStoreJsonHeaders(requestId));
}

/** A normalized error response (`{ error, error_description? }`). */
export function errorJson(
  error: string,
  status: number,
  requestId: string,
  errorDescription?: string,
  extraHeaders?: Record<string, string>,
): Response {
  const body: Record<string, string> = { error };
  if (errorDescription) {
    body.error_description = errorDescription;
  }
  return jsonResponse(body, status, {
    ...noStoreJsonHeaders(requestId),
    ...(extraHeaders ?? {}),
  });
}

export function notFound(requestId: string): Response {
  return errorJson('not_found', 404, requestId);
}

export function providerNotFound(requestId: string): Response {
  return errorJson('provider_not_found', 404, requestId);
}

export function methodNotAllowed(requestId: string, allow: string): Response {
  return errorJson('method_not_allowed', 405, requestId, undefined, { Allow: allow });
}

export function internalError(requestId: string): Response {
  return errorJson('internal_error', 500, requestId);
}
