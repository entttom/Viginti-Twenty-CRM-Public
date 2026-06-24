import { describe, expect, it } from 'vitest';
import { dispatch, makeEnv, makeProvider } from './helpers';

describe('GET /twenty/oauth/config', () => {
  it('returns only public global values', async () => {
    const res = await dispatch(makeEnv(), '/twenty/oauth/config');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300');

    const body = await res.json();
    expect(body).toEqual({
      callbackURL: 'https://viginti.entner.org/twenty/callback',
      defaultIssuer: 'https://api.twenty.com',
      discoveryPath: '/.well-known/oauth-authorization-server',
      clientRegistrationRequired: true,
      directPublicClientSupported: true,
      managedBrokerSupported: true,
      scope: 'api profile',
      pkceMethod: 'S256',
      appleApplicationIdentifier: 'RG7FE682S2.org.entner.twenty.Twenty',
    });
  });

  it('never lists providers or secrets even when providers exist', async () => {
    const env = makeEnv([await makeProvider({ authMethod: 'client_secret_post' })]);
    const res = await dispatch(env, '/twenty/oauth/config');
    const text = await res.text();
    expect(text).not.toContain('twenty-cloud');
    expect(text).not.toContain('encrypted');
    expect(text).not.toContain('client_id');
    expect(text).not.toContain('providerId');
  });
});
