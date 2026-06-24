#!/usr/bin/env node
// Register (or update) a managed OAuth broker provider in D1.
//
// Usage:
//   PROVIDER_SECRET_ENCRYPTION_KEY="<base64-32-byte>" \
//   node scripts/register-managed-provider.mjs \
//     --provider-id "twenty-cloud" \
//     --display-name "Twenty Cloud" \
//     --issuer "https://api.twenty.com" \
//     [--remote] [--local]
//
// Steps: discovery -> validate -> dynamic client registration -> evaluate the
// ACTUAL server response -> encrypt client_secret if confidential -> upsert the
// D1 row via wrangler. Plaintext secrets are never printed or written to disk.

import { execFileSync } from 'node:child_process';
import {
  CALLBACK_URL,
  SCOPE,
  confirm,
  encryptSecret,
  evaluateDiscovery,
  loadDiscovery,
  normalizeIssuer,
  parseArgs,
  promptHidden,
  registerClient,
} from './lib.mjs';

const PROVIDER_ID_RE = /^[a-z0-9-]{3,64}$/;
const DB_NAME = 'viginti-oauth';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const providerId = args['provider-id'];
  const displayName = args['display-name'];

  if (!providerId || !PROVIDER_ID_RE.test(providerId)) {
    fail('Invalid --provider-id (3-64 chars: a-z, 0-9, hyphen).');
  }
  if (!displayName || typeof displayName !== 'string') {
    fail('Missing --display-name.');
  }
  if (!args.issuer) {
    fail('Missing --issuer.');
  }

  const target = args.local ? '--local' : '--remote';
  const issuer = normalizeIssuer(args.issuer);

  // 1-2. Discovery + validation.
  const meta = await loadDiscovery(issuer);
  const report = evaluateDiscovery(meta);
  if (report.reasons.length > 0 && !report.supportsSecretPost && !report.supportsNone) {
    fail(`Discovery is not usable:\n  - ${report.reasons.join('\n  - ')}`);
  }
  if (typeof report.registrationEndpoint !== 'string') {
    fail('Discovery has no usable registration_endpoint.');
  }

  // 3-5. Dynamic client registration; the actual response is authoritative.
  console.log(`Registering client at ${report.registrationEndpoint} ...`);
  const registration = await registerClient(report.registrationEndpoint);
  const clientId = registration.client_id;
  const authMethod =
    registration.token_endpoint_auth_method === 'client_secret_post'
      ? 'client_secret_post'
      : 'none';

  let encryptedSecret = null;
  if (authMethod === 'client_secret_post') {
    const key = process.env.PROVIDER_SECRET_ENCRYPTION_KEY;
    if (!key) {
      fail(
        'This client is confidential. Set PROVIDER_SECRET_ENCRYPTION_KEY to encrypt the secret.',
      );
    }
    let secret = registration.client_secret;
    if (!secret) {
      // Server requires a secret but did not return one in the response.
      secret = await promptHidden('Enter client_secret (hidden): ');
    }
    if (!secret) {
      fail('No client_secret available for a confidential client.');
    }
    encryptedSecret = await encryptSecret(secret, key, providerId, issuer);
    secret = null; // drop plaintext reference
  }

  // 6. Confirm before overwriting an existing provider.
  if (providerExists(providerId, target)) {
    const ok = await confirm(`Provider "${providerId}" already exists. Overwrite?`);
    if (!ok) {
      console.log('Aborted.');
      process.exit(0);
    }
  }

  // 7. Upsert.
  upsertProvider(
    {
      id: providerId,
      displayName,
      issuer,
      authorizationEndpoint: report.authorizationEndpoint,
      tokenEndpoint: report.tokenEndpoint,
      registrationEndpoint: report.registrationEndpoint,
      clientId,
      authMethod,
      encryptedSecret,
      scope: SCOPE,
    },
    target,
  );

  console.log('');
  console.log(`Provider "${providerId}" registered (${authMethod}).`);
  console.log(`Callback URL: ${CALLBACK_URL}`);
  if (authMethod === 'client_secret_post') {
    console.log('Client secret stored encrypted in D1. Plaintext was not persisted.');
  }
}

function d1Query(sql, target, json) {
  const cmdArgs = ['d1', 'execute', DB_NAME, target, '--command', sql];
  if (json) cmdArgs.push('--json');
  const out = execFileSync('npx', ['wrangler', ...cmdArgs], { encoding: 'utf8' });
  return out;
}

function providerExists(providerId, target) {
  try {
    const out = d1Query(
      `SELECT id FROM oauth_providers WHERE id = '${escapeSql(providerId)}';`,
      target,
      true,
    );
    const parsed = JSON.parse(out);
    const results = Array.isArray(parsed) ? parsed[0]?.results : parsed?.results;
    return Array.isArray(results) && results.length > 0;
  } catch {
    return false;
  }
}

function upsertProvider(p, target) {
  const now = new Date().toISOString();
  const secretValue =
    p.encryptedSecret === null ? 'NULL' : `'${escapeSql(p.encryptedSecret)}'`;
  const sql = `
INSERT INTO oauth_providers (
  id, display_name, issuer, authorization_endpoint, token_endpoint,
  registration_endpoint, client_id, token_endpoint_auth_method,
  encrypted_client_secret, scope, enabled, created_at, updated_at
) VALUES (
  '${escapeSql(p.id)}', '${escapeSql(p.displayName)}', '${escapeSql(p.issuer)}',
  '${escapeSql(p.authorizationEndpoint)}', '${escapeSql(p.tokenEndpoint)}',
  '${escapeSql(p.registrationEndpoint)}', '${escapeSql(p.clientId)}',
  '${p.authMethod}', ${secretValue}, '${escapeSql(p.scope)}', 1, '${now}', '${now}'
)
ON CONFLICT(id) DO UPDATE SET
  display_name = excluded.display_name,
  issuer = excluded.issuer,
  authorization_endpoint = excluded.authorization_endpoint,
  token_endpoint = excluded.token_endpoint,
  registration_endpoint = excluded.registration_endpoint,
  client_id = excluded.client_id,
  token_endpoint_auth_method = excluded.token_endpoint_auth_method,
  encrypted_client_secret = excluded.encrypted_client_secret,
  scope = excluded.scope,
  enabled = 1,
  updated_at = excluded.updated_at;`;
  d1Query(sql, target, false);
}

function escapeSql(value) {
  return String(value).replace(/'/g, "''");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

main().catch((err) => fail(err.message));
