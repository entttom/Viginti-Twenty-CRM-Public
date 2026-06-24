import { describe, expect, it } from 'vitest';
import { dispatch, makeEnv, makeProvider, readJson } from './helpers';

describe('GET /twenty/oauth/providers/:id/config', () => {
  it('returns the safe public provider config for an enabled provider', async () => {
    const env = makeEnv([await makeProvider()]);
    const res = await dispatch(env, '/twenty/oauth/providers/twenty-cloud/config');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300');

    const body = await res.json();
    expect(body).toEqual({
      providerId: 'twenty-cloud',
      displayName: 'Twenty Cloud',
      issuer: 'https://api.twenty.com',
      authorizationEndpoint: 'https://api.twenty.com/oauth2/authorize',
      callbackURL: 'https://viginti.entner.org/twenty/callback',
      clientId: 'client-abc123',
      scope: 'api profile',
      pkceMethod: 'S256',
      tokenEndpointAuthMethod: 'none',
    });
  });

  it('never exposes token endpoint, registration endpoint or secret', async () => {
    const env = makeEnv([await makeProvider({ authMethod: 'client_secret_post' })]);
    const res = await dispatch(env, '/twenty/oauth/providers/twenty-cloud/config');
    const body = await readJson(res);
    const text = JSON.stringify(body);
    expect(body.tokenEndpointAuthMethod).toBe('client_secret_post');
    expect(text).not.toContain('oauth2/token');
    expect(text).not.toContain('oauth2/register');
    expect(text).not.toContain('encrypted_client_secret');
    expect(text).not.toContain('super-secret-value');
    expect(text).not.toContain('v1:');
  });

  it('returns generic provider_not_found for an unknown provider', async () => {
    const res = await dispatch(makeEnv(), '/twenty/oauth/providers/does-not-exist/config');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'provider_not_found' });
  });

  it('returns the same generic 404 for a disabled provider', async () => {
    const env = makeEnv([await makeProvider({ enabled: 0 })]);
    const res = await dispatch(env, '/twenty/oauth/providers/twenty-cloud/config');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'provider_not_found' });
  });
});
