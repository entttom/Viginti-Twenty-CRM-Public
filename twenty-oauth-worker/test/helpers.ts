// Test helpers: an in-memory fake D1, env construction and request dispatch.
//
// The worker code only uses Web-standard globals, so tests run on Node. D1 is
// faked here and all upstream OAuth calls are mocked per-test.

import worker from '../src/index';
import { encryptSecret } from '../src/provider-crypto';
import type { Env, OAuthProviderRow, TokenEndpointAuthMethod } from '../src/types';

/** Deterministic 32-byte base64 key — TEST ONLY, never a real secret. */
export const TEST_ENCRYPTION_KEY = 'DRQbIikwNz5FTFNaYWhvdn2Ei5KZoKeutbzDytHY3+Y=';

const BASE_VARS = {
  PUBLIC_BASE_URL: 'https://viginti.entner.org',
  DEFAULT_TWENTY_ISSUER: 'https://api.twenty.com',
  OAUTH_SCOPE: 'api profile',
  APPLE_TEAM_ID: 'RG7FE682S2',
  IOS_BUNDLE_ID: 'org.entner.twenty.Twenty',
};

/** Build an Env backed by an in-memory fake D1 holding the given providers. */
export function makeEnv(providers: OAuthProviderRow[] = []): Env {
  const map = new Map(providers.map((p) => [p.id, p]));

  const db = {
    prepare(_sql: string) {
      let boundId: string | undefined;
      const stmt = {
        bind(...args: unknown[]) {
          boundId = args[0] === undefined ? undefined : String(args[0]);
          return stmt;
        },
        async first<T>(): Promise<T | null> {
          const row = boundId ? map.get(boundId) : undefined;
          if (!row || row.enabled !== 1) {
            return null;
          }
          return row as unknown as T;
        },
      };
      return stmt;
    },
  } as unknown as Env['OAUTH_DB'];

  return {
    ...BASE_VARS,
    PROVIDER_SECRET_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
    OAUTH_DB: db,
  };
}

interface ProviderOptions {
  id?: string;
  issuer?: string;
  authMethod?: TokenEndpointAuthMethod;
  enabled?: number;
  clientSecret?: string;
}

/** Build a provider row, encrypting the client secret when confidential. */
export async function makeProvider(opts: ProviderOptions = {}): Promise<OAuthProviderRow> {
  const id = opts.id ?? 'twenty-cloud';
  const issuer = opts.issuer ?? 'https://api.twenty.com';
  const authMethod = opts.authMethod ?? 'none';

  let encrypted: string | null = null;
  if (authMethod === 'client_secret_post') {
    encrypted = await encryptSecret(
      opts.clientSecret ?? 'super-secret-value',
      TEST_ENCRYPTION_KEY,
      id,
      issuer,
    );
  }

  const now = '2026-06-24T00:00:00.000Z';
  return {
    id,
    display_name: 'Twenty Cloud',
    issuer,
    authorization_endpoint: `${issuer}/oauth2/authorize`,
    token_endpoint: `${issuer}/oauth2/token`,
    registration_endpoint: `${issuer}/oauth2/register`,
    client_id: 'client-abc123',
    token_endpoint_auth_method: authMethod,
    encrypted_client_secret: encrypted,
    scope: 'api profile',
    enabled: opts.enabled ?? 1,
    created_at: now,
    updated_at: now,
  };
}

export interface DispatchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

/** Dispatch a request to the worker against the given env. */
export function dispatch(
  env: Env,
  path: string,
  opts: DispatchOptions = {},
): Promise<Response> {
  const init: RequestInit = { method: opts.method ?? 'GET' };
  if (opts.headers) init.headers = opts.headers;
  if (opts.body !== undefined) init.body = opts.body;
  const request = new Request(`https://viginti.entner.org${path}`, init);
  return worker.fetch(request, env);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Read a response body as JSON without strict typing (test convenience). */
export async function readJson(res: Response): Promise<any> {
  return res.json();
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Install a one-shot global fetch mock and return a restore function. */
export function mockUpstream(
  handler: (url: string, init: RequestInit) => Response | Promise<Response>,
): { calls: Array<{ url: string; init: RequestInit }>; restore: () => void } {
  const original = globalThis.fetch;
  const calls: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push({ url, init: init ?? {} });
    return handler(url, init ?? {});
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}
