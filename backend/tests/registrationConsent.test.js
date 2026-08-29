const { request, app, db, truncateAll } = require('./helpers');
const {
  createRegistrationPolicy,
  registrationConsentFor,
} = require('../src/config/registrationPolicy');

function account(overrides = {}) {
  const unique = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  return {
    name: 'Policy Test',
    email: `policy-${unique}@togt.test`,
    phone: `+27${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`,
    password: 'Policy!1234',
    role: 'customer',
    ...overrides,
  };
}

describe('registration policy consent', () => {
  beforeEach(truncateAll);

  test('publishes the two required policies without bundling marketing', async () => {
    const response = await request(app).get('/auth/registration-policy');
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toMatchObject({
      schema: 'togt.registration-policy.v1',
      available: true,
      releaseChannel: 'internal_testing',
      productionApproved: false,
    });
    expect(response.body.revision).toMatch(/^[a-f0-9]{64}$/);
    expect(response.body.documents.map((document) => document.kind)).toEqual(['terms', 'privacy']);
    expect(JSON.stringify(response.body)).not.toMatch(/marketing/i);
  });

  test('creates no account when explicit consent is absent or stale', async () => {
    const missing = await request(app).post('/auth/register').send(account());
    expect(missing.status).toBe(428);
    expect(missing.body.error).toBe('policy_consent_required');

    const stale = await request(app).post('/auth/register').send(account({
      policyConsent: {
        revision: '0'.repeat(64),
        termsAccepted: true,
        privacyAccepted: true,
      },
    }));
    expect(stale.status).toBe(409);
    expect(stale.body.error).toBe('policy_version_outdated');

    const count = await db.query('SELECT count(*)::int AS count FROM users');
    expect(count.rows[0].count).toBe(0);
  });

  test('records both current policy acceptances atomically with registration', async () => {
    const policy = createRegistrationPolicy();
    const response = await request(app).post('/auth/register').send(account({
      policyConsent: registrationConsentFor(policy),
    }));
    expect(response.status).toBe(201);

    const evidence = await db.query(
      `SELECT policy_kind, policy_version, policy_revision, document_url, acceptance_source
       FROM registration_policy_acceptances
       WHERE user_id = $1
       ORDER BY policy_kind`,
      [response.body.user.id]
    );
    expect(evidence.rows).toHaveLength(2);
    expect(evidence.rows.map((row) => row.policy_kind).sort()).toEqual(['privacy', 'terms']);
    expect(evidence.rows.every((row) => row.policy_revision === policy.revision)).toBe(true);
    expect(evidence.rows.every((row) => row.acceptance_source === 'registration_api')).toBe(true);
  });

  test('production fails closed without explicit approval and valid HTTPS documents', () => {
    const unavailable = createRegistrationPolicy({ NODE_ENV: 'production' });
    expect(unavailable).toMatchObject({
      available: false,
      productionApproved: false,
      reasonCode: 'registration_policy_not_approved',
    });

    const approved = createRegistrationPolicy({
      NODE_ENV: 'production',
      REGISTRATION_POLICY_APPROVED: 'true',
      REGISTRATION_TERMS_VERSION: 'terms-v1',
      REGISTRATION_TERMS_URL: 'https://legal.togt.example/terms',
      REGISTRATION_PRIVACY_VERSION: 'privacy-v1',
      REGISTRATION_PRIVACY_URL: 'https://legal.togt.example/privacy',
    });
    expect(approved).toMatchObject({ available: true, productionApproved: true });
  });
});
