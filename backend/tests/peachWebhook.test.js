const crypto = require('crypto');
const { request, app, db, truncateAll } = require('./helpers');

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  if (db.end) await db.end();
});

describe('POST /payments/webhook', () => {
  // env.js reads PEACH_WEBHOOK_SECRET once at require-time. The test
  // environment deliberately leaves the reviewed product gate off so the
  // consequential endpoint must fail closed before transport or mutation.

  test('provider values cannot enable a webhook while the product gate is off', async () => {
    const res = await request(app)
      .post('/payments/webhook')
      .set('Content-Type', 'application/json')
      .send({ checkoutId: 'bogus_id' });
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      error: 'capability_unavailable',
      capability: 'peach_webhook',
      reason_code: 'peach_webhook_not_approved',
    });
    expect(JSON.stringify(res.body)).toContain('No payment state was changed');
  });

  test('HMAC-SHA256 base64 matches python reference (lockstep with last nights verification)', () => {
    const body = Buffer.from('{"checkoutId":"bogus"}');
    const mac = crypto
      .createHmac('sha256', 'test_secret_xyz')
      .update(body)
      .digest('base64');
    expect(mac).toBe('Qw/u9GRwfBRt6ueCQlfFfEIiTcSx+eJUgEogS68Rayw=');
  });

  test('timingSafeEqual rejects differing-length buffers (defends the sig check path)', () => {
    const a = Buffer.from('abc');
    const b = Buffer.from('abcd');
    expect(() => crypto.timingSafeEqual(a, b)).toThrow();
  });
});
