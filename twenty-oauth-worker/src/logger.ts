// Allowlist-based structured logging.
//
// Only the fields below are ever emitted. Anything that could carry a secret,
// token, code, state, issuer from user input, query string or request body is
// intentionally absent and must never be added.

import type { RequestContext } from './types';

export interface LogFields {
  requestId: string;
  method?: string;
  /** Path WITHOUT query string. Never pass a full URL here. */
  path?: string;
  status?: number;
  durationMs?: number;
  providerId?: string;
  /** Generic error class, e.g. "oauth_upstream_failed". Never a stacktrace. */
  errorClass?: string;
  rayId?: string | null;
}

const ALLOWED_KEYS: (keyof LogFields)[] = [
  'requestId',
  'method',
  'path',
  'status',
  'durationMs',
  'providerId',
  'errorClass',
  'rayId',
];

/**
 * Emit a single structured log line containing only allowlisted fields.
 * Unknown / disallowed properties are silently dropped.
 */
export function log(fields: LogFields): void {
  const safe: Record<string, unknown> = {};
  for (const key of ALLOWED_KEYS) {
    const value = fields[key];
    if (value !== undefined && value !== null) {
      safe[key] = value;
    }
  }
  console.log(JSON.stringify(safe));
}

/** Log the completion of a request using the request context. */
export function logRequest(
  ctx: RequestContext,
  status: number,
  extra?: { providerId?: string; errorClass?: string },
): void {
  log({
    requestId: ctx.requestId,
    method: ctx.method,
    path: ctx.path,
    status,
    durationMs: Date.now() - ctx.startedAt,
    rayId: ctx.rayId,
    ...(extra?.providerId ? { providerId: extra.providerId } : {}),
    ...(extra?.errorClass ? { errorClass: extra.errorClass } : {}),
  });
}
