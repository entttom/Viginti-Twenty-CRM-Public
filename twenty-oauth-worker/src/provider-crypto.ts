// AES-256-GCM encryption for managed-provider client secrets.
//
// Storage format:  v1:<base64url-iv>:<base64url-ciphertext+tag>
//
// The GCM auth tag is appended to the ciphertext by WebCrypto. The Additional
// Authenticated Data binds each ciphertext to its provider id and issuer so a
// secret cannot be transplanted to a different provider row.

import { decodeBase64 } from './config';

const VERSION = 'v1';
const IV_LENGTH = 12;

/** Build the AAD that binds a secret to its provider identity. */
function buildAad(providerId: string, issuer: string): Uint8Array {
  return new TextEncoder().encode(`${providerId}|${issuer}`);
}

function base64urlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9\-_]+$/.test(value)) {
    throw new Error('invalid base64url');
  }
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

async function importKey(base64Key: string): Promise<CryptoKey> {
  const raw = decodeBase64(base64Key);
  if (raw.length !== 32) {
    throw new Error('invalid key length');
  }
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

/**
 * Encrypt a client secret. Returns the `v1:iv:ciphertext` storage string.
 * The plaintext is never logged or returned in any other form.
 */
export async function encryptSecret(
  plaintext: string,
  base64Key: string,
  providerId: string,
  issuer: string,
): Promise<string> {
  const key = await importKey(base64Key);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: buildAad(providerId, issuer) },
    key,
    new TextEncoder().encode(plaintext),
  );
  return `${VERSION}:${base64urlEncode(iv)}:${base64urlEncode(new Uint8Array(ciphertext))}`;
}

/**
 * Decrypt a stored client secret. Any structural or authentication failure
 * results in a generic error — the cause is never surfaced or logged, and the
 * plaintext is only ever returned, never logged.
 */
export async function decryptSecret(
  stored: string,
  base64Key: string,
  providerId: string,
  issuer: string,
): Promise<string> {
  try {
    const parts = stored.split(':');
    if (parts.length !== 3 || parts[0] !== VERSION) {
      throw new Error('format');
    }
    const iv = base64urlDecode(parts[1]);
    if (iv.length !== IV_LENGTH) {
      throw new Error('iv');
    }
    const ciphertext = base64urlDecode(parts[2]);
    const key = await importKey(base64Key);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: buildAad(providerId, issuer) },
      key,
      ciphertext,
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error('secret_decrypt_failed');
  }
}
