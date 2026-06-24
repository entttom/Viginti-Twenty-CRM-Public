#!/usr/bin/env node
// Disable a managed OAuth broker provider (sets enabled = 0).
//
// Usage:
//   node scripts/disable-managed-provider.mjs --provider-id "kunde-a" [--remote] [--local]
//
// A disabled provider returns the generic `provider_not_found` from every
// public endpoint. The row and its encrypted secret are kept for audit/rollback.

import { execFileSync } from 'node:child_process';
import { confirm, parseArgs } from './lib.mjs';

const PROVIDER_ID_RE = /^[a-z0-9-]{3,64}$/;
const DB_NAME = 'viginti-oauth';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const providerId = args['provider-id'];
  if (!providerId || !PROVIDER_ID_RE.test(providerId)) {
    fail('Invalid --provider-id (3-64 chars: a-z, 0-9, hyphen).');
  }
  const target = args.local ? '--local' : '--remote';

  const ok = await confirm(`Disable provider "${providerId}"?`);
  if (!ok) {
    console.log('Aborted.');
    process.exit(0);
  }

  const now = new Date().toISOString();
  const sql = `UPDATE oauth_providers SET enabled = 0, updated_at = '${now}' WHERE id = '${escapeSql(providerId)}';`;
  execFileSync('npx', ['wrangler', 'd1', 'execute', DB_NAME, target, '--command', sql], {
    encoding: 'utf8',
    stdio: 'inherit',
  });

  console.log(`Provider "${providerId}" disabled.`);
}

function escapeSql(value) {
  return String(value).replace(/'/g, "''");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

main().catch((err) => fail(err.message));
