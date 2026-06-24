#!/usr/bin/env node
// Generate a base64-encoded random 32-byte key for PROVIDER_SECRET_ENCRYPTION_KEY.
//
// Usage:
//   node scripts/generate-encryption-key.mjs
//
// Then set it as a Worker secret (it is NEVER stored in git/wrangler/D1):
//   npx wrangler secret put PROVIDER_SECRET_ENCRYPTION_KEY

import { webcrypto as crypto } from 'node:crypto';

const key = crypto.getRandomValues(new Uint8Array(32));
const base64 = Buffer.from(key).toString('base64');

process.stdout.write(`${base64}\n`);
process.stderr.write(
  '\nCopy the value above and set it with:\n' +
    '  npx wrangler secret put PROVIDER_SECRET_ENCRYPTION_KEY\n' +
    'Do not commit it, log it, or store it in D1.\n',
);
