import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from '../src/provider-crypto';
import { TEST_ENCRYPTION_KEY } from './helpers';

const OTHER_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
const PROVIDER = 'twenty-cloud';
const ISSUER = 'https://api.twenty.com';

describe('provider-crypto (AES-256-GCM)', () => {
  it('round-trips a secret', async () => {
    const stored = await encryptSecret('s3cr3t', TEST_ENCRYPTION_KEY, PROVIDER, ISSUER);
    expect(stored.startsWith('v1:')).toBe(true);
    const plain = await decryptSecret(stored, TEST_ENCRYPTION_KEY, PROVIDER, ISSUER);
    expect(plain).toBe('s3cr3t');
  });

  it('produces a different ciphertext each time (random IV)', async () => {
    const a = await encryptSecret('same', TEST_ENCRYPTION_KEY, PROVIDER, ISSUER);
    const b = await encryptSecret('same', TEST_ENCRYPTION_KEY, PROVIDER, ISSUER);
    expect(a).not.toBe(b);
  });

  it('fails with the wrong key', async () => {
    const stored = await encryptSecret('s3cr3t', TEST_ENCRYPTION_KEY, PROVIDER, ISSUER);
    await expect(decryptSecret(stored, OTHER_KEY, PROVIDER, ISSUER)).rejects.toThrow(
      'secret_decrypt_failed',
    );
  });

  it('fails when the provider id (AAD) changes', async () => {
    const stored = await encryptSecret('s3cr3t', TEST_ENCRYPTION_KEY, PROVIDER, ISSUER);
    await expect(
      decryptSecret(stored, TEST_ENCRYPTION_KEY, 'other-provider', ISSUER),
    ).rejects.toThrow('secret_decrypt_failed');
  });

  it('fails when the issuer (AAD) changes', async () => {
    const stored = await encryptSecret('s3cr3t', TEST_ENCRYPTION_KEY, PROVIDER, ISSUER);
    await expect(
      decryptSecret(stored, TEST_ENCRYPTION_KEY, PROVIDER, 'https://evil.example'),
    ).rejects.toThrow('secret_decrypt_failed');
  });

  it('fails on tampered ciphertext', async () => {
    const stored = await encryptSecret('s3cr3t', TEST_ENCRYPTION_KEY, PROVIDER, ISSUER);
    const parts = stored.split(':');
    const tamperedCt = parts[2].slice(0, -2) + (parts[2].endsWith('A') ? 'BB' : 'AA');
    const tampered = `${parts[0]}:${parts[1]}:${tamperedCt}`;
    await expect(
      decryptSecret(tampered, TEST_ENCRYPTION_KEY, PROVIDER, ISSUER),
    ).rejects.toThrow('secret_decrypt_failed');
  });

  it('fails on an invalid format', async () => {
    await expect(
      decryptSecret('v2:abc:def', TEST_ENCRYPTION_KEY, PROVIDER, ISSUER),
    ).rejects.toThrow('secret_decrypt_failed');
    await expect(
      decryptSecret('garbage', TEST_ENCRYPTION_KEY, PROVIDER, ISSUER),
    ).rejects.toThrow('secret_decrypt_failed');
  });
});
