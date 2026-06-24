// Worker entry point.
//
// Validates the environment, assigns a request id, routes the request and
// guarantees every response carries an X-Request-ID. Only the path (never the
// query string or body) is logged.

import { validateEnv } from './config';
import { log, logRequest } from './logger';
import { internalError } from './responses';
import { route } from './router';
import type { Env, RequestContext } from './types';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = crypto.randomUUID();
    const url = new URL(request.url);
    const ctx: RequestContext = {
      requestId,
      method: request.method.toUpperCase(),
      path: url.pathname,
      rayId: request.headers.get('cf-ray'),
      startedAt: Date.now(),
    };

    try {
      validateEnv(env);
    } catch {
      // Misconfiguration: fail closed without leaking which check failed.
      log({
        requestId,
        method: ctx.method,
        path: ctx.path,
        status: 500,
        errorClass: 'env_invalid',
      });
      return ensureRequestId(internalError(requestId), requestId);
    }

    try {
      const { response, providerId } = await route(request, env, url, requestId);
      const finalResponse = ensureRequestId(response, requestId);
      logRequest(ctx, finalResponse.status, providerId ? { providerId } : undefined);
      return finalResponse;
    } catch {
      logRequest(ctx, 500, { errorClass: 'unhandled' });
      return ensureRequestId(internalError(requestId), requestId);
    }
  },
} satisfies ExportedHandler<Env>;

/** Guarantee the X-Request-ID header is present on the outgoing response. */
function ensureRequestId(response: Response, requestId: string): Response {
  if (response.headers.has('X-Request-ID')) {
    return response;
  }
  const headers = new Headers(response.headers);
  headers.set('X-Request-ID', requestId);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
