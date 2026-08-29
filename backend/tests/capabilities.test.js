const { request, app } = require('./helpers');

describe('GET /api/capabilities', () => {
  test('publishes a short-lived, fail-closed P0 capability snapshot', async () => {
    const res = await request(app).get('/api/capabilities');

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toMatch(/max-age=300/);
    expect(res.body.schema_version).toBe(1);
    expect(res.body.ttl_seconds).toBe(300);
    expect(res.body.minimum_app_version).toBe('1.0.0');
    expect(res.body.generated_at).toBeTruthy();

    for (const feature of [
      'peach_checkout',
      'cash_settlement',
      'identity_verification',
      'selfie_identity_verification',
      'remote_push',
      'background_tracking',
      'public_live_share',
      'operated_sos',
    ]) {
      expect(res.body.features[feature].available).toBe(false);
      expect(res.body.features[feature].reason_code).toBeTruthy();
    }
  });
});
