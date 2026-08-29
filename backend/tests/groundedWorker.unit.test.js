const {
  identityEvidence,
  requiredCredentials,
  pricingEvidence,
  offeringEligibility,
  serializeOffering,
  serializeActivation,
  serializeServicesProfile,
} = require('../src/services/groundedWorker/projections');
const {
  rejectUnknownFields,
  assertPolicyVersion,
} = require('../src/services/groundedWorker/contracts');

const WORKER_ID = '11111111-1111-4111-8111-111111111111';
const SERVICE_ID = '22222222-2222-4222-8222-222222222222';
const OFFERING_ID = '33333333-3333-4333-8333-333333333333';

function worker(overrides = {}) {
  return {
    worker_id: WORKER_ID,
    account_name: 'Thabo Ndlovu',
    contact_present: true,
    legacy_account_verified: true,
    kyc_status: 'pending',
    avatar_url: null,
    profile_photo: null,
    emergency_contact: null,
    legacy_bio: 'Experienced repair professional.',
    current_lat: null,
    current_lng: null,
    location_updated_at: null,
    is_available: false,
    public_display_name: null,
    about_experience: null,
    profile_revision: null,
    verification_status: 'pending',
    verification_provider: 'poc_structural',
    verification_verified_at: null,
    activation_revision: 1,
    activation_updated_at: new Date('2026-08-29T08:00:00Z'),
    ...overrides,
  };
}

function offering(overrides = {}) {
  return {
    id: OFFERING_ID,
    worker_id: WORKER_ID,
    service_id: SERVICE_ID,
    service_version: 4,
    customer_facing_title: 'Careful plumbing repairs',
    description: 'Careful assessment and repair for household plumbing problems.',
    hourly_rate_minor: null,
    minimum_duration_minutes: 60,
    call_out_amount_minor: null,
    service_area_label: 'Rondebosch, Cape Town',
    revision: 2,
    updated_at: new Date('2026-08-29T08:00:00Z'),
    opt_in_status: 'active',
    canonical_key: 'plumbing_remote_quote',
    category_key: 'plumbing',
    label_en_za: 'Plumbing repair quote',
    description_en_za: 'Receive a scoped quote for variable plumbing work.',
    pricing_mode: 'remote_quote',
    fulfilment_mode: 'receive_quotes',
    risk_tier: 'standard',
    catalogue_minimum_duration_minutes: 60,
    catalogue_call_out_fee: null,
    currency: 'ZAR',
    pricing_rules: { finalPrice: 'accepted_quote_only' },
    worker_eligibility: { requiresIdentityVerified: true, credentialIds: ['trade.plumbing'] },
    is_published: true,
    retired_at: null,
    ...overrides,
  };
}

describe('grounded worker contracts and projections', () => {
  test('structural-only KYC never becomes authoritative identity evidence', () => {
    expect(identityEvidence(worker({
      kyc_status: 'verified',
      verification_status: 'verified',
      verification_provider: 'poc_structural',
      verification_verified_at: new Date(),
    }))).toEqual({ status: 'unverified', authoritative: false });

    expect(identityEvidence(worker({
      kyc_status: 'verified',
      verification_status: 'verified',
      verification_provider: 'verifynow',
      verification_verified_at: new Date(),
    }))).toEqual({ status: 'verified', authoritative: true });
  });

  test('required credentials are exact, deduplicated and never fabricated as verified', () => {
    expect(requiredCredentials(offering({
      worker_eligibility: { credentialIds: ['trade.plumbing', 'trade.plumbing', '../bad'] },
    }))).toEqual(['trade.plumbing']);

    const dto = serializeOffering(offering(), worker());
    expect(dto.credentialEvidence).toEqual([{
      credentialId: 'trade.plumbing',
      label: 'trade.plumbing',
      status: 'missing',
    }]);
    expect(dto.eligibility.eligible).toBe(false);
    expect(dto.facts.fixedCustomerAmount.status).toBe('unavailable');
    expect(dto.portfolio).toEqual([]);
  });

  test('hourly readiness requires a whole-cent worker rate inside exact catalogue bounds', () => {
    const row = offering({
      pricing_mode: 'hourly_estimated',
      pricing_rules: { hourlyRateBounds: { minimumMinor: 25000, maximumMinor: 60000 } },
      hourly_rate_minor: '42500',
      worker_eligibility: {},
    });
    expect(pricingEvidence(row).ready).toBe(true);
    expect(offeringEligibility(row, worker()).eligible).toBe(true);
    expect(pricingEvidence({ ...row, hourly_rate_minor: '70000' }).ready).toBe(false);
    expect(pricingEvidence({ ...row, pricing_rules: {} }).ready).toBe(false);
  });

  test('activation explains blockers and treats disabled payout as not required, never ready', () => {
    const snapshot = serializeActivation(worker(), [offering()], []);
    const payout = snapshot.items.find((item) => item.kind === 'payout_method');
    expect(payout).toMatchObject({ status: 'not_required', required: false });
    expect(snapshot.onlinePermission.value.allowed).toBe(false);
    expect(snapshot.onlinePermission.value.explanation).toContain('Identity assurance');
    expect(JSON.stringify(snapshot)).not.toContain('082');
  });

  test('services profile exposes only status labels for private details', () => {
    const snapshot = serializeServicesProfile(worker({ emergency_contact: '0821234567' }), [offering()]);
    expect(snapshot.publicProfile.privateDetailLabels).toContainEqual({
      detailId: 'emergency_contact',
      label: 'Emergency contact',
      statusLabel: 'Stored privately',
    });
    expect(JSON.stringify(snapshot)).not.toContain('0821234567');
    expect(snapshot.capabilities.payoutAccount.status).toBe('unavailable');
  });

  test('public profile projection quarantines direct-DB contact-bearing identity and area text', () => {
    const snapshot = serializeServicesProfile(worker({
      account_name: 'Call 082 555 0121',
      public_display_name: 'Email display@example.com',
      legacy_bio: 'Call 083 555 0122 for repair work.',
      about_experience: 'Email about@example.com for repair work.',
    }), [offering({ service_area_label: 'WhatsApp 084 555 0123' })]);

    expect(snapshot.publicProfile).toMatchObject({
      displayName: 'Worker',
      about: '',
      serviceAreaLabel: '',
    });
  });

  test('strict allowlists and stable policy versions reject unexpected input', () => {
    expect(() => rejectUnknownFields({ displayName: 'Thabo', role: 'admin' }, ['displayName']))
      .toThrow('Request contains unsupported fields');
    expect(() => assertPolicyVersion('../latest')).toThrow('Policy version is invalid');
    expect(assertPolicyVersion('worker-safety-2026.08')).toBe('worker-safety-2026.08');
  });
});
