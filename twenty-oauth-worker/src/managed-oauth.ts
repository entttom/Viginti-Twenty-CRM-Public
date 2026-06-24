// Managed OAuth broker (Mode B).
//
// Used only for providers that the Viginti operator has registered into D1 via
// the admin scripts. Public requests can only name a provider id; the worker
// reads issuer, endpoints, client id and (encrypted) client secret exclusively
// from D1. No issuer / endpoint / redirect_uri / client_id / scope value from
// the request is ever trusted.

import { CALLBACK_URL, MAX_BODY_BYTES, PKCE_METHOD, UPSTREAM_TIMEOUT_MS } from './config';
import { decryptSecret } from './provider-crypto';
import { getEnabledProvider } from './provider-repository';
import { errorJson, providerNotFound, publicJson } from './responses';
import { noStoreJsonHeaders } from './security-headers';
import type { Env, OAuthProviderRow } from './types';
import {
  hasOnlyKeys,
  isValidAuthorizationCode,
  isValidCodeChallenge,
  isValidCodeVerifier,
  isValidPrompt,
  isValidRefreshToken,
  isValidState,
} from './validation';

const ACCEPTED_CONTENT_TYPES = new Set([
  'application/json',
  'application/json; charset=utf-8',
]);

/** Fields that are safe to forward from an upstream token response. */
const ALLOWED_TOKEN_FIELDS = [
  'access_token',
  'refresh_token',
  'token_type',
  'expires_in',
  'scope',
  'refresh_token_expires_in',
] as const;

// ---------------------------------------------------------------------------
// GET /twenty/oauth/providers/:providerId/config
// ---------------------------------------------------------------------------

export async function handleProviderConfig(
  env: Env,
  providerId: string,
  requestId: string,
): Promise<Response> {
  const provider = await getEnabledProvider(env, providerId);
  if (!provider) {
    return providerNotFound(requestId);
  }

  // Deliberately omit token_endpoint, registration_endpoint, secrets and any
  // D1 metadata. Only the auth method *name* is exposed.
  const body = {
    providerId: provider.id,
    displayName: provider.display_name,
    issuer: provider.issuer,
    authorizationEndpoint: provider.authorization_endpoint,
    callbackURL: CALLBACK_URL,
    clientId: provider.client_id,
    scope: provider.scope,
    pkceMethod: PKCE_METHOD,
    tokenEndpointAuthMethod: provider.token_endpoint_auth_method,
  };

  return publicJson(body, requestId, 300);
}

// ---------------------------------------------------------------------------
// GET /twenty/oauth/providers/:providerId/start
// ---------------------------------------------------------------------------

export async function handleProviderStart(
  url: URL,
  env: Env,
  providerId: string,
  requestId: string,
): Promise<Response> {
  const state = url.searchParams.get('state');
  const codeChallenge = url.searchParams.get('code_challenge');
  const prompt = url.searchParams.get('prompt');

  if (!isValidState(state)) {
    return errorJson('invalid_request', 400, requestId, 'Invalid state.');
  }
  if (!isValidCodeChallenge(codeChallenge)) {
    return errorJson('invalid_request', 400, requestId, 'Invalid code_challenge.');
  }
  if (prompt !== null && !isValidPrompt(prompt)) {
    return errorJson('invalid_request', 400, requestId, 'Invalid prompt.');
  }

  const provider = await getEnabledProvider(env, providerId);
  if (!provider) {
    return providerNotFound(requestId);
  }

  // Authorization endpoint, client id and scope come ONLY from D1.
  const authUrl = new URL(provider.authorization_endpoint);
  authUrl.searchParams.set('client_id', provider.client_id);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', CALLBACK_URL);
  authUrl.searchParams.set('scope', provider.scope);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', PKCE_METHOD);
  if (prompt) {
    authUrl.searchParams.set('prompt', prompt);
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: authUrl.toString(),
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Request-ID': requestId,
    },
  });
}

// ---------------------------------------------------------------------------
// POST /twenty/oauth/providers/:providerId/token
// ---------------------------------------------------------------------------

export async function handleProviderToken(
  request: Request,
  env: Env,
  providerId: string,
  requestId: string,
): Promise<Response> {
  const parsed = await readJsonBody(request, requestId);
  if (parsed instanceof Response) {
    return parsed;
  }

  if (!hasOnlyKeys(parsed, ['code', 'codeVerifier'])) {
    return errorJson('invalid_request', 400, requestId, 'Unexpected fields.');
  }
  const { code, codeVerifier } = parsed as { code?: unknown; codeVerifier?: unknown };
  if (!isValidAuthorizationCode(code)) {
    return errorJson('invalid_request', 400, requestId, 'Invalid code.');
  }
  if (!isValidCodeVerifier(codeVerifier)) {
    return errorJson('invalid_request', 400, requestId, 'Invalid code_verifier.');
  }

  const provider = await getEnabledProvider(env, providerId);
  if (!provider) {
    return providerNotFound(requestId);
  }

  const form = new URLSearchParams();
  form.set('grant_type', 'authorization_code');
  form.set('code', code);
  form.set('redirect_uri', CALLBACK_URL);
  form.set('client_id', provider.client_id);
  form.set('code_verifier', codeVerifier);

  await applyClientAuth(form, provider, env);

  return exchangeWithUpstream(provider, form, requestId);
}

// ---------------------------------------------------------------------------
// POST /twenty/oauth/providers/:providerId/refresh
// ---------------------------------------------------------------------------

export async function handleProviderRefresh(
  request: Request,
  env: Env,
  providerId: string,
  requestId: string,
): Promise<Response> {
  const parsed = await readJsonBody(request, requestId);
  if (parsed instanceof Response) {
    return parsed;
  }

  if (!hasOnlyKeys(parsed, ['refreshToken'])) {
    return errorJson('invalid_request', 400, requestId, 'Unexpected fields.');
  }
  const { refreshToken } = parsed as { refreshToken?: unknown };
  if (!isValidRefreshToken(refreshToken)) {
    return errorJson('invalid_request', 400, requestId, 'Invalid refresh token.');
  }

  const provider = await getEnabledProvider(env, providerId);
  if (!provider) {
    return providerNotFound(requestId);
  }

  const form = new URLSearchParams();
  form.set('grant_type', 'refresh_token');
  form.set('refresh_token', refreshToken);
  form.set('client_id', provider.client_id);

  await applyClientAuth(form, provider, env);

  return exchangeWithUpstream(provider, form, requestId);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Add `client_secret` for `client_secret_post` providers. The decrypted secret
 * lives only in this local scope, is never logged and is not retained.
 */
async function applyClientAuth(
  form: URLSearchParams,
  provider: OAuthProviderRow,
  env: Env,
): Promise<void> {
  if (provider.token_endpoint_auth_method !== 'client_secret_post') {
    return;
  }
  if (!provider.encrypted_client_secret) {
    throw new Error('provider_missing_secret');
  }
  const secret = await decryptSecret(
    provider.encrypted_client_secret,
    env.PROVIDER_SECRET_ENCRYPTION_KEY,
    provider.id,
    provider.issuer,
  );
  form.set('client_secret', secret);
}

/**
 * Read, size-limit and JSON-parse a request body. Returns the parsed object,
 * or a ready-made error Response on any failure.
 */
async function readJsonBody(
  request: Request,
  requestId: string,
): Promise<Record<string, unknown> | Response> {
  const contentType = (request.headers.get('content-type') ?? '').trim().toLowerCase();
  if (!ACCEPTED_CONTENT_TYPES.has(contentType)) {
    return errorJson('unsupported_media_type', 415, requestId);
  }

  const declared = request.headers.get('content-length');
  if (declared && Number(declared) > MAX_BODY_BYTES) {
    return errorJson('payload_too_large', 413, requestId);
  }

  const raw = await request.text();
  if (byteLength(raw) > MAX_BODY_BYTES) {
    return errorJson('payload_too_large', 413, requestId);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return errorJson('invalid_request', 400, requestId, 'Invalid JSON.');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return errorJson('invalid_request', 400, requestId, 'Invalid JSON object.');
  }
  return parsed as Record<string, unknown>;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/**
 * Perform the upstream token/refresh request and normalize the response. The
 * token endpoint comes ONLY from D1. Redirects are rejected. Only allowlisted
 * fields are forwarded; upstream Set-Cookie / Location / Server / Via headers
 * are dropped.
 */
async function exchangeWithUpstream(
  provider: OAuthProviderRow,
  form: URLSearchParams,
  requestId: string,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  let upstream: Response;
  try {
    upstream = await fetch(provider.token_endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: form.toString(),
      redirect: 'manual',
      signal: controller.signal,
    });
  } catch {
    return errorJson(
      'oauth_upstream_failed',
      504,
      requestId,
      'The OAuth request could not be completed.',
    );
  } finally {
    clearTimeout(timer);
  }

  // Reject any redirect from the token endpoint. With `redirect: "manual"` the
  // runtime surfaces the 3xx status (or an opaqueredirect type) instead of
  // following it.
  if (
    (upstream.type as string) === 'opaqueredirect' ||
    upstream.status === 0 ||
    (upstream.status >= 300 && upstream.status < 400)
  ) {
    return errorJson(
      'oauth_upstream_failed',
      502,
      requestId,
      'The OAuth request could not be completed.',
    );
  }

  let payload: unknown;
  try {
    payload = await upstream.json();
  } catch {
    return errorJson(
      'oauth_upstream_failed',
      502,
      requestId,
      'The OAuth request could not be completed.',
    );
  }

  if (typeof payload !== 'object' || payload === null) {
    return errorJson(
      'oauth_upstream_failed',
      502,
      requestId,
      'The OAuth request could not be completed.',
    );
  }

  if (!upstream.ok) {
    return normalizeOAuthError(upstream.status, payload as Record<string, unknown>, requestId);
  }

  // Success: reduce to allowlisted fields only.
  const source = payload as Record<string, unknown>;
  const safe: Record<string, unknown> = {};
  for (const field of ALLOWED_TOKEN_FIELDS) {
    if (field in source && source[field] !== undefined && source[field] !== null) {
      safe[field] = source[field];
    }
  }

  return new Response(JSON.stringify(safe), {
    status: 200,
    headers: noStoreJsonHeaders(requestId),
  });
}

/**
 * Normalize an upstream OAuth error into a safe `{ error, error_description }`
 * with a sensible status. Only string `error` / `error_description` fields are
 * forwarded; no other upstream detail is leaked.
 */
function normalizeOAuthError(
  upstreamStatus: number,
  payload: Record<string, unknown>,
  requestId: string,
): Response {
  const error = typeof payload.error === 'string' ? sanitize(payload.error) : 'oauth_error';
  const description =
    typeof payload.error_description === 'string'
      ? sanitize(payload.error_description)
      : undefined;

  let status: number;
  if (error === 'invalid_client' || upstreamStatus === 401) {
    status = 401;
  } else if (error === 'invalid_grant') {
    status = 400;
  } else if (upstreamStatus === 429) {
    status = 429;
  } else if (upstreamStatus >= 400 && upstreamStatus < 500) {
    status = 400;
  } else {
    status = 502;
  }

  return errorJson(error, status, requestId, description);
}

/** Keep only a conservative set of characters in forwarded OAuth error text. */
function sanitize(value: string): string {
  return value.replace(/[^A-Za-z0-9 ._:-]/g, '').slice(0, 300);
}
