import { describe, expect, it } from 'vitest';
import { dispatch, makeEnv } from './helpers';

describe('GET /twenty/callback', () => {
  it('serves the success fallback page without reflecting parameters', async () => {
    const res = await dispatch(
      makeEnv(),
      '/twenty/callback?code=SECRETCODE&state=SECRETSTATE&iss=https://evil.example&scope=api',
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
});
