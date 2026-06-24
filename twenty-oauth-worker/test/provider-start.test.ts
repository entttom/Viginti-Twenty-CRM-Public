import { describe, expect, it } from 'vitest';
import { dispatch, makeEnv, makeProvider } from './helpers';

const STATE = 'a'.repeat(43);
const CHALLENGE = 'b'.repeat(43);

describe('GET /twenty/oauth/providers/:id/start', () => {
  it('builds the authorization redirect using only D1 values', async () => {
    const env = makeEnv([await makeProvider()]);
    const res = await dispatch(
      env,
      `/twenty/oauth/providers/twenty-cloud/start?state=${STATE}&code_challenge=${CHALLENGE}`,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('Cache-Control')).toBe('no-store');

    const location = new URL(res.headers.get('Location')!);
    expect(`${location.origin}${location.pathname}`).toBe(
      'https://api.twenty.com/oauth2/authorize',
    );
    expect(location.searchParams.get('client_id')).toBe('client-abc123');
    expect(location.searchParams.get('response_type')).toBe('code');
    expect(location.searchParams.get('redirect_uri')).toBe(
      'https://viginti.entner.org/twenty/callback',
    );
    expect(location.searchParams.get('scope')).toBe('api profile');
    expect(location.searchParams.get('state')).toBe(STATE);
    expect(location.searchParams.get('code_challenge')).toBe(CHALLENGE);
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('rejects an invalid state', async () => {
    const env = makeEnv([await makeProvider()]);
    const res = await dispatch(
      env,
      `/twenty/oauth/providers/twenty-cloud/start?state=short&code_challenge=${CHALLENGE}`,
    );
    expect(res.status).toBe(400);
  });

  it('rejects an invalid code_challenge', async () => {
    const env = makeEnv([await makeProvider()]);
    const res = await dispatch(
      env,
      `/twenty/oauth/providers/twenty-cloud/start?state=${STATE}&code_challenge=tooshort`,
    );
    expect(res.status).toBe(400);
  });

  it('cannot be pointed at a foreign authorization endpoint via the request', async () => {
    const env = makeEnv([await makeProvider()]);
    const res = await dispatch(
      env,
      `/twenty/oauth/providers/twenty-cloud/start?state=${STATE}&code_challenge=${CHALLENGE}` +
        `&authorization_endpoint=https://evil.example/authorize&redirect_uri=https://evil.example/cb`,
    );
    const location = res.headers.get('Location')!;
    expect(location.startsWith('https://api.twenty.com/oauth2/authorize')).toBe(true);
    expect(location).not.toContain('evil.example');
  });

  it('returns generic provider_not_found for an unknown provider', async () => {
    const res = await dispatch(
      makeEnv(),
      `/twenty/oauth/providers/unknown-prov/start?state=${STATE}&code_challenge=${CHALLENGE}`,
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'provider_not_found' });
  });
});
