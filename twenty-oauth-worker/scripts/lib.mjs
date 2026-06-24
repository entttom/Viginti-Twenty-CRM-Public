// Shared helpers for the local admin scripts.
//
// These run on the operator's machine (Node 18+) — never inside the worker.
// They perform OAuth discovery, dynamic client registration and AES-256-GCM
// secret encryption that is byte-compatible with src/provider-crypto.ts.

import { webcrypto as crypto } from 'node:crypto';

export const CALLBACK_URL = 'https://viginti.entner.org/twenty/callback';
export const APP_NAME = 'Viginti – Twenty Client';
export const SCOPE = 'api profile';
export const DISCOVERY_PATH = '/.well-known/oauth-authorization-server';
export const MAX_DISCOVERY_BYTES = 64 * 1024;

/** Parse `--key value` / `--key=value` style CLI arguments. */
export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const eq = token.indexOf('=');
    if (eq !== -1) {
      args[token.slice(2, eq)] = token.slice(eq + 1);
    } else {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[token.slice(2)] = next;
        i++;
      } else {
        args[token.slice(2)] = true;
      }
    }
  }
  return args;
}

/**
 * Normalize and validate an issuer URL. Rejects path, query, fragment and
 * userinfo; lower-cases the host; requires HTTPS.
 */
export function normalizeIssuer(input) {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new Error('issuer is required');
  }
  let url;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error('issuer is not a valid URL');
  }
  if (url.protocol !== 'https:') {
    throw new Error('issuer must be https');
  }
  if (url.username || url.password) {
    throw new Error('issuer must not contain credentials');
  }
  if (url.search || url.hash) {
    throw new Error('issuer must not contain query or fragment');
  }
  if (url.pathname !== '/' && url.pathname !== '') {
    throw new Error('issuer must not contain a path');
  }
  url.hostname = url.hostname.toLowerCase();
  // Canonical issuer string without trailing slash.
  return `${url.protocol}//${url.host}`;
}

/** Fetch a JSON document with a size limit and without following redirects. */
async function fetchJsonLimited(url, init, maxBytes) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let res;
  try {
    res = await fetch(url, { ...init, redirect: 'manual', signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  if (res.status >= 300 && res.status < 400) {
    throw new Error(`unexpected redirect from ${url}`);
  }
  const text = await res.text();
  if (Buffer.byteLength(text, 'utf8') > maxBytes) {
    throw new Error('response too large');
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('response is not valid JSON');
  }
  return { status: res.status, json };
}

/** Load and validate the OAuth discovery document for an issuer. */
export async function loadDiscovery(issuer) {
  const discoveryUrl = `${issuer}${DISCOVERY_PATH}`;
  const { status, json } = await fetchJsonLimited(
    discoveryUrl,
    { method: 'GET', headers: { Accept: 'application/json' } },
    MAX_DISCOVERY_BYTES,
  );
  if (status !== 200) {
    throw new Error(`discovery returned HTTP ${status}`);
  }
  return json;
}

/** Validate a discovery document and return a structured suitability report. */
export function evaluateDiscovery(meta) {
  const reasons = [];
  const httpsEndpoint = (value) => typeof value === 'string' && value.startsWith('https://');

  if (typeof meta.issuer !== 'string') reasons.push('missing issuer');
  if (!httpsEndpoint(meta.authorization_endpoint))
    reasons.push('authorization_endpoint must be https');
  if (!httpsEndpoint(meta.token_endpoint)) reasons.push('token_endpoint must be https');
  if (!httpsEndpoint(meta.registration_endpoint))
    reasons.push('registration_endpoint must be https');

  const grants = arr(meta.grant_types_supported);
  if (!grants.includes('authorization_code')) reasons.push('authorization_code grant missing');
  if (!grants.includes('refresh_token')) reasons.push('refresh_token grant missing');

  const responseTypes = arr(meta.response_types_supported);
  if (!responseTypes.includes('code')) reasons.push('response type "code" missing');

  const pkce = arr(meta.code_challenge_methods_supported);
  if (!pkce.includes('S256')) reasons.push('PKCE S256 missing');

  const scopes = arr(meta.scopes_supported);
  if (scopes.length && !scopes.includes('api')) reasons.push('scope "api" missing');
  if (scopes.length && !scopes.includes('profile')) reasons.push('scope "profile" missing');

  const authMethods = arr(meta.token_endpoint_auth_methods_supported);
  const supportsNone = authMethods.length === 0 || authMethods.includes('none');
  const supportsSecretPost = authMethods.includes('client_secret_post');
  if (!supportsNone && !supportsSecretPost) {
    reasons.push('no supported token_endpoint_auth_method (none / client_secret_post)');
  }

  return {
    issuer: meta.issuer,
    authorizationEndpoint: meta.authorization_endpoint,
    tokenEndpoint: meta.token_endpoint,
    registrationEndpoint: meta.registration_endpoint,
    grantTypes: grants,
    responseTypes,
    pkceMethods: pkce,
    scopes,
    authMethods,
    supportsNone,
    supportsSecretPost,
    directIosSuitable: reasons.length === 0 && supportsNone,
    reasons,
  };
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

/** Dynamically register the Viginti client at a registration endpoint. */
export async function registerClient(registrationEndpoint) {
  const body = {
    client_name: APP_NAME,
    redirect_uris: [CALLBACK_URL],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    scope: SCOPE,
  };
  const { status, json } = await fetchJsonLimited(
    registrationEndpoint,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    },
    MAX_DISCOVERY_BYTES,
  );
  if (status !== 200 && status !== 201) {
    throw new Error(`registration returned HTTP ${status}`);
  }
  if (typeof json.client_id !== 'string' || json.client_id.length === 0) {
    throw new Error('registration response missing client_id');
  }
  return json;
}

// --- AES-256-GCM (byte-compatible with src/provider-crypto.ts) -------------

const VERSION = 'v1';
const IV_LENGTH = 12;

function base64urlEncode(bytes) {
  return Buffer.from(bytes).toString('base64url');
}

async function importKey(base64Key) {
  const raw = Buffer.from(base64Key, 'base64');
  if (raw.length !== 32) {
    throw new Error('PROVIDER_SECRET_ENCRYPTION_KEY must decode to 32 bytes');
  }
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt']);
}

export async function encryptSecret(plaintext, base64Key, providerId, issuer) {
  const key = await importKey(base64Key);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const aad = new TextEncoder().encode(`${providerId}|${issuer}`);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad },
    key,
    new TextEncoder().encode(plaintext),
  );
  return `${VERSION}:${base64urlEncode(iv)}:${base64urlEncode(new Uint8Array(ciphertext))}`;
}

/** Read a value from stdin without echoing (best-effort for secrets). */
export async function promptHidden(question) {
  process.stdout.write(question);
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    let value = '';
    const onData = (chunk) => {
      for (const byte of chunk) {
        if (byte === 0x0a || byte === 0x0d) {
          if (stdin.isTTY) stdin.setRawMode(wasRaw);
          stdin.pause();
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(value);
          return;
        } else if (byte === 0x03) {
          process.exit(1);
        } else if (byte === 0x7f || byte === 0x08) {
          value = value.slice(0, -1);
        } else if (byte >= 0x20) {
          value += String.fromCharCode(byte);
        }
      }
    };
    stdin.on('data', onData);
  });
}

/** Read a yes/no confirmation from stdin. */
export async function confirm(question) {
  process.stdout.write(`${question} [y/N] `);
  return new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.once('data', (chunk) => {
      process.stdin.pause();
      resolve(/^y(es)?$/i.test(chunk.toString().trim()));
    });
  });
}
