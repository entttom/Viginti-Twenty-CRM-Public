// Shared types for the Viginti Twenty OAuth Worker.

/**
 * Cloudflare Workers native rate limiting binding. Edge-enforced and
 * distributed — not in-memory. Configured under `unsafe.bindings` in
 * wrangler.jsonc.
 */
export interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/**
 * Worker runtime environment. Non-secret values come from `wrangler.jsonc`
 * `vars`. `PROVIDER_SECRET_ENCRYPTION_KEY` is a Worker secret and is NEVER
 * stored in source, git, README, tests, logs or D1.
 */
export interface Env {
  PUBLIC_BASE_URL: string;
  DEFAULT_TWENTY_ISSUER: string;
  OAUTH_SCOPE: string;
  APPLE_TEAM_ID: string;
  IOS_BUNDLE_ID: string;

  PROVIDER_SECRET_ENCRYPTION_KEY: string;

  OAUTH_DB: D1Database;

  /** Token + refresh: 20 req/min per IP. */
  RL_TOKEN: RateLimit;
  /** Authorization start: 60 req/min per IP. */
  RL_START: RateLimit;
}

export type TokenEndpointAuthMethod = 'none' | 'client_secret_post';

/**
 * Row shape of the `oauth_providers` D1 table. Only ever populated by the
 * local admin scripts — never from a public request.
 */
export interface OAuthProviderRow {
  id: string;
  display_name: string;
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string | null;
  client_id: string;
  token_endpoint_auth_method: TokenEndpointAuthMethod;
  encrypted_client_secret: string | null;
  scope: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

/** A request-scoped logging/identity context. */
export interface RequestContext {
  requestId: string;
  method: string;
  path: string;
  rayId: string | null;
  startedAt: number;
}
