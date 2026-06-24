import { afterEach, describe, expect, it } from 'vitest';
import { dispatch, makeEnv, makeProvider, mockUpstream, readJson } from './helpers';

function jsonBody(obj: unknown) {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  };
}

let restore: (() => void) | undefined;
afterEach(() => {
  restore?.();
  restore = undefined;
});

describe('POST /twenty/oauth/providers/:id/refresh', () => {
  it('refreshes using the correct grant type and D1 client id, no secret (none)', async () => {
    const env = makeEnv([await makeProvider({ authMethod: 'none' })]);
    const mock = mockUpstream(
      () =>
        new Response(
          JSON.stringify({
            access_token: 'AT2',
            refresh_token: 'RT2',
            token_type: 'Bearer',
            expires_in: 3600,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    restore = mock.restore;

    const res = await dispatch(
      env,
      '/twenty/oauth/providers/twenty-cloud/refresh',
      jsonBody({ refreshToken: 'old-refresh-token' }),
    );
    expect(res.status).toBe(200);

    const body = await readJson(res);
    expect(body.access_token).toBe('AT2');
    expect(body.refresh_token).toBe('RT2');

    const sent = new URLSearchParams(mock.calls[0].init.body as string);
    expect(sent.get('grant_type')).toBe('refresh_token');
    expect(sent.get('refresh_token')).toBe('old-refresh-token');
    expect(sent.get('client_id')).toBe('client-abc123');
    expect(sent.has('client_secret')).toBe(false);
  });

  it('includes the secret for confidential providers', async () => {
    const env = makeEnv([
      await makeProvider({ authMethod: 'client_secret_post', clientSecret: 'rsecret' }),
    ]);
    const mock = mockUpstream(
      () =>
        new Response(JSON.stringify({ access_token: 'AT' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    restore = mock.restore;

    await dispatch(
      env,
      '/twenty/oauth/providers/twenty-cloud/refresh',
      jsonBody({ refreshToken: 'old-refresh-token' }),
    );
    const sent = new URLSearchParams(mock.calls[0].init.body as string);
    expect(sent.get('client_secret')).toBe('rsecret');
  });

  it('rejects unexpected fields', async () => {
    const env = makeEnv([await makeProvider()]);
    const res = await dispatch(
      env,
      '/twenty/oauth/providers/twenty-cloud/refresh',
      jsonBody({ refreshToken: 'rt', clientId: 'evil' }),
    );
    expect(res.status).toBe(400);
  });

  it('rejects an empty refresh token', async () => {
    const env = makeEnv([await makeProvider()]);
    const res = await dispatch(
      env,
      '/twenty/oauth/providers/twenty-cloud/refresh',
      jsonBody({ refreshToken: '' }),
    );
    expect(res.status).toBe(400);
  });
});
