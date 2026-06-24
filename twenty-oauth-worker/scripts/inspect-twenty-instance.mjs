#!/usr/bin/env node
// Inspect a Twenty instance's OAuth discovery document.
//
// Usage:
//   node scripts/inspect-twenty-instance.mjs --issuer "https://crm.example.com"
//
// Reads ONLY the published discovery document, validates it and reports whether
// the instance is suitable for the direct iOS PKCE flow. Stores nothing.

import { evaluateDiscovery, loadDiscovery, normalizeIssuer, parseArgs } from './lib.mjs';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.issuer) {
    fail(
      'Missing --issuer.\nUsage: node scripts/inspect-twenty-instance.mjs --issuer "https://crm.example.com"',
    );
  }

  let issuer;
  try {
    issuer = normalizeIssuer(args.issuer);
  } catch (err) {
    fail(`Invalid issuer: ${err.message}`);
  }

  let meta;
  try {
    meta = await loadDiscovery(issuer);
  } catch (err) {
    fail(`Discovery failed: ${err.message}`);
  }

  const report = evaluateDiscovery(meta);

  console.log('');
  console.log(`Issuer:                 ${report.issuer ?? '(missing)'}`);
  console.log(`Authorization Endpoint: ${report.authorizationEndpoint ?? '(missing)'}`);
  console.log(`Token Endpoint:         ${report.tokenEndpoint ?? '(missing)'}`);
  console.log(`Registration Endpoint:  ${report.registrationEndpoint ?? '(missing)'}`);
  console.log(`PKCE-Support:           ${report.pkceMethods.join(', ') || '(none)'}`);
  console.log(`Grant Types:            ${report.grantTypes.join(', ') || '(none)'}`);
  console.log(`Scopes:                 ${report.scopes.join(', ') || '(not advertised)'}`);
  console.log(
    `Token Auth Methods:     ${report.authMethods.join(', ') || '(none advertised)'}`,
  );
  console.log('');
  console.log(`Für direkten iOS-Login geeignet: ${report.directIosSuitable ? 'ja' : 'nein'}`);

  if (report.reasons.length > 0) {
    console.log('');
    console.log('Hinweise:');
    for (const reason of report.reasons) {
      console.log(`  - ${reason}`);
    }
  }
  if (!report.supportsNone && report.supportsSecretPost) {
    console.log('');
    console.log(
      'Diese Instanz verlangt client_secret_post. Sie kann nur als verwalteter\n' +
        'Broker-Provider registriert werden und muss vom Cloudflare-Worker erreichbar sein.',
    );
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

main().catch((err) => fail(err.message));
