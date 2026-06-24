import { describe, expect, it } from 'vitest';
import { dispatch, makeEnv, readJson } from './helpers';

const PATHS = ['/.well-known/apple-app-site-association', '/apple-app-site-association'];

describe('Apple App Site Association', () => {
  for (const path of PATHS) {
    it(`serves the AASA document at ${path}`, async () => {
      const res = await dispatch(makeEnv(), path);
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('application/json');
      expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600');
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      // No redirect, no cookies, no content-disposition.
      expect(res.headers.get('Location')).toBeNull();
      expect(res.headers.get('Set-Cookie')).toBeNull();
      expect(res.headers.get('Content-Disposition')).toBeNull();

      const body = await readJson(res);
      const detail = body.applinks.details[0];
      expect(detail.appIDs).toEqual(['RG7FE682S2.org.entner.twenty.Twenty']);
      expect(detail.components).toEqual([
        { '/': '/twenty/callback', comment: 'Twenty OAuth callback for Viginti' },
      ]);
      // webcredentials is required for the ASWebAuthenticationSession HTTPS callback.
      expect(body.webcredentials.apps).toEqual(['RG7FE682S2.org.entner.twenty.Twenty']);
    });
  }

  it('only associates the /twenty/callback path', async () => {
    const res = await dispatch(makeEnv(), '/apple-app-site-association');
    const body = await readJson(res);
    const components = body.applinks.details[0].components;
    expect(components).toHaveLength(1);
    expect(components[0]['/']).toBe('/twenty/callback');
  });

  it('does not depend on query parameters', async () => {
    const res = await dispatch(makeEnv(), '/apple-app-site-association?foo=bar');
    expect(res.status).toBe(200);
  });
});
