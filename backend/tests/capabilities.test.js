const { request, app } = require('./helpers');
const { featuresFor, featureAvailable } = require('../src/config/capabilities');

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
      'ai_assisted_intake',
      'explainable_recommendations',
      'android_live_updates',
      'contextual_safety_education',
      'maps_display',
      'address_search',
      'address_resolution',
      'address_provenance_recording',
    ]) {
      expect(res.body.features[feature].available).toBe(false);
      expect(res.body.features[feature].reason_code).toBeTruthy();
    }
  });

  test('address and map gates require exact release evidence and keep Wave 2 providers off', () => {
    const disabled = featuresFor({
      MAPS_DISPLAY_RELEASE_ENABLED: 'TRUE',
      ADDRESS_PROVENANCE_RECORDING_ENABLED: '1',
    });
    expect(disabled.maps_display).toEqual({
      available: false,
      reason_code: 'maps_display_release_disabled',
    });
    expect(disabled.address_provenance_recording).toEqual({
      available: false,
      reason_code: 'address_provenance_contract_unavailable',
    });

    const waveOne = featuresFor({
      MAPS_DISPLAY_RELEASE_ENABLED: 'true',
      ADDRESS_PROVENANCE_RECORDING_ENABLED: 'true',
    });
    expect(waveOne.maps_display).toEqual({ available: true, mode: 'android_google_maps' });
    expect(waveOne.address_provenance_recording).toEqual({
      available: true,
      mode: 'nullable_audit_recording',
    });
    expect(featureAvailable('maps_display', { MAPS_DISPLAY_RELEASE_ENABLED: 'true' })).toBe(true);

    const configuredWaveTwo = featuresFor({
      ADDRESS_SEARCH_RELEASE_ENABLED: 'true',
      ADDRESS_RESOLUTION_RELEASE_ENABLED: 'true',
      ADDRESS_PROVIDER: 'google',
      GOOGLE_ADDRESS_PROVIDER_API_KEY: 'server-only-key-with-enough-length',
    });
    expect(configuredWaveTwo.address_search).toEqual({
      available: false,
      reason_code: 'address_provider_boundary_not_implemented',
    });
    expect(configuredWaveTwo.address_resolution).toEqual({
      available: false,
      reason_code: 'address_provider_boundary_not_implemented',
    });
  });
});
