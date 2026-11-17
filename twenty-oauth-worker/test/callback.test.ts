import { describe, expect, it } from 'vitest';
import { negotiateCallbackLanguage } from '../src/callback';
import { dispatch, makeEnv } from './helpers';

const DE = { headers: { 'Accept-Language': 'de-AT,de;q=0.9,en;q=0.8' } };

describe('GET /twenty/callback', () => {
  it('serves the success fallback page without reflecting parameters', async () => {
    const res = await dispatch(
      makeEnv(),
      '/twenty/callback?code=SECRETCODE&state=SECRETSTATE&iss=https://evil.example&scope=api',
      DE,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/html; charset=utf-8');

    const html = await res.text();
    expect(html).toContain('Anmeldung abgeschlossen');
    expect(html).not.toContain('SECRETCODE');
    expect(html).not.toContain('SECRETSTATE');
    expect(html).not.toContain('evil.example');
    expect(html).not.toContain('scope');
  });

  it('serves the error fallback page when error is present, without details', async () => {
    const res = await dispatch(
      makeEnv(),
      '/twenty/callback?error=access_denied&error_description=User%20bailed',
      DE,
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Anmeldung nicht abgeschlossen');
    expect(html).not.toContain('access_denied');
    expect(html).not.toContain('bailed');
  });

  it('applies the strict security headers', async () => {
    const res = await dispatch(makeEnv(), '/twenty/callback');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Pragma')).toBe('no-cache');
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
    expect(res.headers.get('Set-Cookie')).toBeNull();
    expect(res.headers.get('X-Request-ID')).toMatch(/[0-9a-f-]{36}/);
  });

  it('serves English pages when the browser does not prefer German', async () => {
    const success = await dispatch(makeEnv(), '/twenty/callback?code=X', {
      headers: { 'Accept-Language': 'en-US,en;q=0.9,de;q=0.5' },
    });
    const successHtml = await success.text();
    expect(successHtml).toContain('<html lang="en">');
    expect(successHtml).toContain('Sign-in complete');
    expect(success.headers.get('Content-Language')).toBe('en');
    expect(success.headers.get('Vary')).toBe('Accept-Language');

    const failure = await dispatch(makeEnv(), '/twenty/callback?error=access_denied');
    const failureHtml = await failure.text();
    expect(failureHtml).toContain('Sign-in not completed');
    expect(failureHtml).not.toContain('access_denied');
  });

  it('serves the German page with lang=de for German browsers', async () => {
    const res = await dispatch(makeEnv(), '/twenty/callback', DE);
    expect(res.headers.get('Content-Language')).toBe('de');
    expect(await res.text()).toContain('<html lang="de">');
  });

  it('never reflects the Accept-Language header', async () => {
    const res = await dispatch(makeEnv(), '/twenty/callback', {
      headers: { 'Accept-Language': 'de-<script>alert(1)</script>' },
    });
    const html = await res.text();
    expect(html).not.toContain('<script>');
    expect(html).toContain('Anmeldung abgeschlossen');
  });
});

describe('negotiateCallbackLanguage', () => {
  it.each([
    [null, 'en'],
    ['', 'en'],
    ['de', 'de'],
    ['de-DE', 'de'],
    ['fr-FR,fr;q=0.9', 'en'],
    ['fr-FR,de;q=0.8,en;q=0.7', 'de'],
    ['en-GB,de;q=0.9', 'en'],
    ['de;q=0.2,en;q=0.9', 'en'],
    ['de;q=0,en;q=0.1', 'en'],
    ['de, en', 'de'],
    ['en, de', 'en'],
    ['*', 'en'],
  ])('maps %j to %s', (header, expected) => {
    expect(negotiateCallbackLanguage(header)).toBe(expected);
  });
});
