import { describe, it, expect } from 'vitest';
import { buildPayload, makeQR, contrastRatio, DEFAULT_FIELDS } from './qr.js';

const f = (o) => ({ ...DEFAULT_FIELDS, ...o });

describe('payloads', () => {
  it('adds https:// when the scheme is missing', () => {
    expect(buildPayload('url', f({ url: 'example.com/a' })).payload).toBe('https://example.com/a');
  });
  it('rejects invalid URLs', () => {
    expect(buildPayload('url', f({ url: 'not a url' })).errors.url).toBeTruthy();
    expect(buildPayload('url', f({ url: 'javascript://x' })).errors.url).toBeTruthy();
  });
  it('rejects empty text', () => {
    expect(buildPayload('text', f({ text: '  ' })).errors.text).toBeTruthy();
  });
  it('builds mailto with encoded params', () => {
    const { payload } = buildPayload('email', f({ email: 'a@b.com', subject: 'Hi there' }));
    expect(payload).toBe('mailto:a@b.com?subject=Hi%20there');
  });
  it('validates email and phone', () => {
    expect(buildPayload('email', f({ email: 'nope' })).errors.email).toBeTruthy();
    expect(buildPayload('phone', f({ phone: 'abc' })).errors.phone).toBeTruthy();
    expect(buildPayload('phone', f({ phone: '+1 (555) 123-4567' })).payload).toBe('tel:+15551234567');
  });
  it('builds and escapes Wi-Fi payloads', () => {
    const { payload } = buildPayload('wifi', f({ ssid: 'My;Net', password: 'pass:word1', encryption: 'WPA' }));
    expect(payload).toBe('WIFI:T:WPA;S:My\\;Net;P:pass\\:word1;;');
  });
  it('requires a valid WPA password', () => {
    expect(buildPayload('wifi', f({ ssid: 'x', password: 'short' })).errors.password).toBeTruthy();
    expect(buildPayload('wifi', f({ ssid: 'x', encryption: 'nopass' })).errors).toEqual({});
  });
});

describe('qr + contrast', () => {
  it('generates a matrix', () => {
    expect(makeQR('hello', 'M').qr.getModuleCount()).toBeGreaterThanOrEqual(21);
  });
  it('fails gracefully on oversized content', () => {
    expect(makeQR('x'.repeat(5000), 'H').error).toBeTruthy();
  });
  it('computes contrast', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
  });
});
