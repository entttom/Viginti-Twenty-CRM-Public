import { afterEach, describe, expect, it } from 'vitest';
import { dispatch, makeEnv, makeProvider, mockUpstream, readJson } from './helpers';

const VERIFIER = 'c'.repeat(64);

function jsonBody(obj: unknown): {
  method: string;
  headers: Record<string, string>;
  body: string;
} {
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

describe('POST /twenty/oauth/providers/:id/token', () => {
  it('exchanges a code at the D1 token endpoint without a secret (none)', async () => {
    const env = makeEnv([await makeProvider({ authMethod: 'none' })]);
    const mock = mockUpstream(() => {
      return new Response(
        JSON.stringify({
          access_token: 'AT',
          refresh_token: 'RT',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'api profile',
          id_token: 'LEAK',
          set_cookie_should_not_matter: true,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json', 'Set-Cookie': 'x=1' } },
      );
    });
    restore = mock.restore;

    const res = await dispatch(
      env,
      '/twenty/oauth/providers/twenty-cloud/token',
      jsonBody({
        code: 'auth-code-123',
        codeVerifier: VERIFIER,
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Set-Cookie')).toBeNull();

    const body = await readJson(res);
    expect(body).toEqual({
      access_token: 'AT',
      refresh_token: 'RT',
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'api profile',
    });
    expect('id_token' in body).toBe(false);

    // Upstream request used the D1 token endpoint and carried no client_secret.
    expect(mock.calls[0].url).toBe('https://api.twenty.com/oauth2/token');
    const sent = new URLSearchParams(mock.calls[0].init.body as string);
    expect(sent.get('grant_type')).toBe('authorization_code');
    expect(sent.get('client_id')).toBe('client-abc123');
    expect(sent.get('redirect_uri')).toBe('https://viginti.entner.org/twenty/callback');
    expect(sent.get('code_verifier')).toBe(VERIFIER);
    expect(sent.has('client_secret')).toBe(false);
    expect(mock.calls[0].init.redirect).toBe('manual');
  });

  it('sends the decrypted client_secret for confidential providers', async () => {
    const env = makeEnv([
      await makeProvider({ authMethod: 'client_secret_post', clientSecret: 'topsecret' }),
    ]);
    const mock = mockUpstream(
      () =>
        new Response(JSON.stringify({ access_token: 'AT', token_type: 'Bearer' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    restore = mock.restore;

    const res = await dispatch(
      env,
      '/twenty/oauth/providers/twenty-cloud/token',
      jsonBody({
        code: 'auth-code-123',
        codeVerifier: VERIFIER,
      }),
    );
    expect(res.status).toBe(200);

    const sent = new URLSearchParams(mock.calls[0].init.body as string);
    expect(sent.get('client_secret')).toBe('topsecret');
  });

  it('rejects unexpected fields such as issuer/endpoint/redirectUri', async () => {
    const env = makeEnv([await makeProvider()]);
    const res = await dispatch(
      env,
      '/twenty/oauth/providers/twenty-cloud/token',
      jsonBody({
        code: 'auth-code-123',
        codeVerifier: VERIFIER,
        tokenEndpoint: 'https://evil.example/token',
      }),
    );
    expect(res.status).toBe(400);
    expect((await readJson(res)).error).toBe('invalid_request');
  });

  it('rejects a non-JSON content type with 415', async () => {
    const env = makeEnv([await makeProvider()]);
    const res = await dispatch(env, '/twenty/oauth/providers/twenty-cloud/token', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'x',
    });
    expect(res.status).toBe(415);
  });

  it('rejects an oversized body with 413', async () => {
    const env = makeEnv([await makeProvider()]);
    const big = 'x'.repeat(40 * 1024);
    const res = await dispatch(
      env,
      '/twenty/oauth/providers/twenty-cloud/token',
      jsonBody({
        code: big,
        codeVerifier: VERIFIER,
      }),
    );
    expect(res.status).toBe(413);
  });

  it('maps an invalid_grant upstream error to 400', async () => {
    const env = makeEnv([await makeProvider()]);
    const mock = mockUpstream(
      () =>
        new Response(
          JSON.stringify({ error: 'invalid_grant', error_description: 'bad code' }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
    );
    restore = mock.restore;
    const res = await dispatch(
      env,
      '/twenty/oauth/providers/twenty-cloud/token',
      jsonBody({
        code: 'auth-code-123',
        codeVerifier: VERIFIER,
      }),
    );
    expect(res.status).toBe(400);
    expect((await readJson(res)).error).toBe('invalid_grant');
  });

  it('rejects an upstream redirect from the token endpoint', async () => {
    const env = makeEnv([await makeProvider()]);
    const mock = mockUpstream(
      () => new Response(null, { status: 302, headers: { Location: 'https://evil.example' } }),
    );
    restore = mock.restore;
    const res = await dispatch(
      env,
      '/twenty/oauth/providers/twenty-cloud/token',
      jsonBody({
        code: 'auth-code-123',
        codeVerifier: VERIFIER,
      }),
    );
    expect(res.status).toBe(502);
    expect((await readJson(res)).error).toBe('oauth_upstream_failed');
  });

  it('returns 504 on an upstream timeout/abort', async () => {
    const env = makeEnv([await makeProvider()]);
    const mock = mockUpstream(() => {
      throw new DOMException('aborted', 'AbortError');
    });
    restore = mock.restore;
    const res = await dispatch(
      env,
      '/twenty/oauth/providers/twenty-cloud/token',
      jsonBody({
        code: 'auth-code-123',
        codeVerifier: VERIFIER,
      }),
    );
    expect(res.status).toBe(504);
  });

  it('only accepts POST', async () => {
    const env = makeEnv([await makeProvider()]);
    const res = await dispatch(env, '/twenty/oauth/providers/twenty-cloud/token');
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('POST');
  });
});
