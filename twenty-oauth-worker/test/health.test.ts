import { describe, expect, it } from 'vitest';
import { dispatch, makeEnv } from './helpers';

describe('GET /health', () => {
  it('returns ok status with no-store and a request id', async () => {
    const res = await dispatch(makeEnv(), '/health');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({ status: 'ok', service: 'viginti-twenty-oauth' });

    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(res.headers.get('X-Request-ID')).toMatch(/[0-9a-f-]{36}/);
  });

  it('exposes no provider or secret data', async () => {
    const res = await dispatch(makeEnv(), '/health');
    const text = await res.text();
    expect(text).not.toContain('client');
    expect(text).not.toContain('secret');
    expect(text).not.toContain('token');
  });

  it('rejects non-GET with 405 and Allow header', async () => {
    const res = await dispatch(makeEnv(), '/health', { method: 'POST' });
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('GET');
    expect(await res.json()).toEqual({ error: 'method_not_allowed' });
  });
});
