// Read-only D1 access for managed providers.
//
// Public requests can only ever name a provider id; every endpoint, client id
// and secret is read from D1 here. There is intentionally no write path — rows
// are created/updated exclusively by the local admin scripts.

import type { Env, OAuthProviderRow } from './types';

const SELECT_ENABLED =
  'SELECT id, display_name, issuer, authorization_endpoint, token_endpoint, ' +
  'registration_endpoint, client_id, token_endpoint_auth_method, ' +
  'encrypted_client_secret, scope, enabled, created_at, updated_at ' +
  'FROM oauth_providers WHERE id = ?1 AND enabled = 1';

/**
 * Fetch an enabled provider by id, or `null` if it does not exist or is
 * disabled. Callers must NOT distinguish the two cases to the client.
 */
export async function getEnabledProvider(
  env: Env,
  providerId: string,
): Promise<OAuthProviderRow | null> {
  const row = await env.OAUTH_DB.prepare(SELECT_ENABLED)
    .bind(providerId)
    .first<OAuthProviderRow>();
  return row ?? null;
}
