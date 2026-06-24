// Fixed project values and per-request environment validation.
//
// Every value here is a hard project constant for the Viginti app. Hosts, URLs
// and issuers are always treated normalized and lower-cased.

import type { Env } from './types';

export const APP_NAME = 'Viginti – Twenty Client';

export const PUBLIC_BASE_URL = 'https://viginti.entner.org';
export const PUBLIC_HOST = 'viginti.entner.org';

export const DEFAULT_TWENTY_ISSUER = 'https://api.twenty.com';

export const OAUTH_SCOPE = 'api profile';
export const PKCE_METHOD = 'S256';

export const APPLE_TEAM_ID = 'RG7FE682S2';
export const IOS_BUNDLE_ID = 'org.entner.twenty.Twenty';
export const APPLE_APPLICATION_IDENTIFIER = `${APPLE_TEAM_ID}.${IOS_BUNDLE_ID}`;

export const CALLBACK_PATH = '/twenty/callback';
export const CALLBACK_URL = `${PUBLIC_BASE_URL}${CALLBACK_PATH}`;

export const DISCOVERY_PATH = '/.well-known/oauth-authorization-server';

/** Upstream OAuth request timeout (token / refresh). */
export const UPSTREAM_TIMEOUT_MS = 15_000;

/** Maximum request body size for token/refresh routes (32 KiB). */
export const MAX_BODY_BYTES = 32 * 1024;

/** Maximum discovery / registration document size for admin scripts (64 KiB). */
export const MAX_DISCOVERY_BYTES = 64 * 1024;

/**
 * Validate the environment at the start of every request. Throws on any
 * mismatch; the caller turns this into a generic 500 without leaking detail.
 *
 * The fixed `vars` are asserted to match the project constants so a
 * mis-deployment cannot silently change OAuth behaviour. The encryption key is
 * only checked for *shape* (base64, 32 bytes) — never logged.
 */
export function validateEnv(env: Env): void {
  assertEquals('PUBLIC_BASE_URL', env.PUBLIC_BASE_URL, PUBLIC_BASE_URL);
  assertEquals('DEFAULT_TWENTY_ISSUER', env.DEFAULT_TWENTY_ISSUER, DEFAULT_TWENTY_ISSUER);
  assertEquals('OAUTH_SCOPE', env.OAUTH_SCOPE, OAUTH_SCOPE);
  assertEquals('APPLE_TEAM_ID', env.APPLE_TEAM_ID, APPLE_TEAM_ID);
  assertEquals('IOS_BUNDLE_ID', env.IOS_BUNDLE_ID, IOS_BUNDLE_ID);

  if (!env.OAUTH_DB || typeof env.OAUTH_DB.prepare !== 'function') {
    throw new Error('env_invalid: OAUTH_DB binding missing');
  }

  if (!env.RL_TOKEN || typeof env.RL_TOKEN.limit !== 'function') {
    throw new Error('env_invalid: RL_TOKEN binding missing');
  }
  if (!env.RL_START || typeof env.RL_START.limit !== 'function') {
    throw new Error('env_invalid: RL_START binding missing');
  }

  assertEncryptionKeyShape(env.PROVIDER_SECRET_ENCRYPTION_KEY);
}

function assertEquals(name: string, actual: string, expected: string): void {
  if (actual !== expected) {
    throw new Error(`env_invalid: ${name} mismatch`);
  }
}

/**
 * The provider secret encryption key must be a base64-encoded random 32-byte
 * key. We validate length without ever logging or returning the value.
 */
export function assertEncryptionKeyShape(key: string): void {
  if (typeof key !== 'string' || key.length === 0) {
    throw new Error('env_invalid: PROVIDER_SECRET_ENCRYPTION_KEY missing');
  }
  let bytes: Uint8Array;
  try {
    bytes = decodeBase64(key);
  } catch {
    throw new Error('env_invalid: PROVIDER_SECRET_ENCRYPTION_KEY not base64');
  }
  if (bytes.length !== 32) {
    throw new Error('env_invalid: PROVIDER_SECRET_ENCRYPTION_KEY must be 32 bytes');
  }
}

/** Strict standard-base64 decode (used for the 32-byte key). */
export function decodeBase64(value: string): Uint8Array {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new Error('invalid base64');
  }
  const binary = atob(normalized);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}
