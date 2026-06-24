import { describe, expect, it } from 'vitest';
import { dispatch, makeEnv, makeProvider } from './helpers';

describe('security', () => {
  it('has no open proxy or discovery routes', async () => {
    const env = makeEnv();
    for (const path of [
      '/proxy?url=https://evil.example',
      '/fetch?url=https://evil.example',
      '/discover?issuer=https://evil.example',
      '/oauth/token?endpoint=https://evil.example',
      '/setup',
      '/admin/providers',
      '/providers',
    ]) {
      const res = await dispatch(env, path);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'not_found' });
    }
  });

  it('rejects provider registration via any public method', async () => {
    const env = makeEnv();
    const res = await dispatch(env, '/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ issuer: 'https://evil.example' }),
    });
    expect(res.status).toBe(404);
  });

  it('does not allow a free issuer URL to influence the start redirect', async () => {
    const env = makeEnv([await makeProvider()]);
    const state = 'a'.repeat(43);
    const challenge = 'b'.repeat(43);
    const res = await dispatch(
      env,
      `/twenty/oauth/providers/twenty-cloud/start?state=${state}&code_challenge=${challenge}` +
        `&issuer=https://evil.example&token_endpoint=https://evil.example/token`,
    );
    const location = res.headers.get('Location') ?? '';
    expect(location).not.toContain('evil.example');
    expect(location.startsWith('https://api.twenty.com')).toBe(true);
  });

  it('sets no permissive CORS headers', async () => {
    const res = await dispatch(makeEnv(), '/twenty/oauth/config');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(res.headers.get('Access-Control-Allow-Methods')).toBeNull();
  });

  it('answers OPTIONS with 405', async () => {
    const res = await dispatch(makeEnv(), '/twenty/oauth/config', { method: 'OPTIONS' });
    expect(res.status).toBe(405);
  });

  it('includes an X-Request-ID on every response', async () => {
    const env = makeEnv([await makeProvider()]);
    for (const path of [
      '/health',
      '/apple-app-site-association',
      '/twenty/oauth/config',
      '/twenty/callback',
      '/twenty/oauth/providers/twenty-cloud/config',
      '/unknown-path',
    ]) {
      const res = await dispatch(env, path);
      expect(res.headers.get('X-Request-ID')).toMatch(/[0-9a-f-]{36}/);
    }
  });

  it('returns 404 for unknown paths and 405 for wrong methods', async () => {
    const env = makeEnv();
    expect((await dispatch(env, '/nope')).status).toBe(404);
    expect((await dispatch(env, '/health', { method: 'DELETE' })).status).toBe(405);
  });

  it('fails closed when the environment is misconfigured', async () => {
    const env = makeEnv();
    (env as { PUBLIC_BASE_URL: string }).PUBLIC_BASE_URL = 'https://wrong.example';
    const res = await dispatch(env, '/health');
    expect(res.status).toBe(500);
    expect(res.headers.get('X-Request-ID')).toMatch(/[0-9a-f-]{36}/);
  });
});
