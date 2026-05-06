const { signPayload, verifySignature } = require('../src/lib/webhookSignature');

describe('webhookSignature', () => {
  const secret = 'whsec_testtesttesttesttesttesttest';
  const body = JSON.stringify({ event_type: 'booking.created', resource_id: 'abc' });

  test('signPayload returns Stripe-shape header t=<ts>,v1=<hex>', () => {
    const { header, timestamp, v1 } = signPayload(secret, body, 1735689600);
    expect(header).toBe(`t=1735689600,v1=${v1}`);
    expect(timestamp).toBe('1735689600');
    expect(v1).toMatch(/^[a-f0-9]{64}$/);
  });

  test('verifySignature accepts a freshly-signed body', () => {
    const { header } = signPayload(secret, body);
    expect(verifySignature(secret, body, header)).toBe(true);
  });

  test('verifySignature rejects tampered body', () => {
    const { header } = signPayload(secret, body);
    expect(verifySignature(secret, body + 'x', header)).toBe(false);
  });

  test('verifySignature rejects wrong secret', () => {
    const { header } = signPayload(secret, body);
    expect(verifySignature('whsec_other', body, header)).toBe(false);
  });

  test('verifySignature rejects stale timestamps beyond tolerance', () => {
    const { header } = signPayload(secret, body, Math.floor(Date.now() / 1000) - 600);
    expect(verifySignature(secret, body, header, 300)).toBe(false);
  });

  test('verifySignature rejects malformed header', () => {
    expect(verifySignature(secret, body, '')).toBe(false);
    expect(verifySignature(secret, body, 'garbage')).toBe(false);
    expect(verifySignature(secret, body, 't=123')).toBe(false);
  });

  test('signPayload with previousSecret produces multi-v1 header', () => {
    const { header, v1, v1Previous } = signPayload(secret, body, 1735689600, 'whsec_old');
    expect(header.match(/v1=/g)).toHaveLength(2);
    expect(header).toBe(`t=1735689600,v1=${v1},v1=${v1Previous}`);
    expect(v1Previous).toMatch(/^[a-f0-9]{64}$/);
    expect(v1Previous).not.toBe(v1);
  });

  test('verifySignature accepts either secret in a multi-v1 header (grace window)', () => {
    const { header } = signPayload('whsec_new', body, undefined, 'whsec_old');
    expect(verifySignature('whsec_new', body, header)).toBe(true);
    expect(verifySignature('whsec_old', body, header)).toBe(true);
    expect(verifySignature('whsec_unrelated', body, header)).toBe(false);
  });
});
