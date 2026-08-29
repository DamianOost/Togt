const express = require('express');
const supertest = require('supertest');
process.env.WORKER_FOREGROUND_LOCATION_EXPLANATION_VERSION = 'foreground-location-2026.08';
process.env.WORKER_SAFETY_POLICY_VERSION = 'worker-safety-2026.08';
process.env.WORKER_FIRST_JOB_READINESS_VERSION = 'first-job-readiness-2026.08';
const db = require('../src/config/db');
const { signAccessToken } = require('../src/lib/jwtTokens');
const groundedWorkerRouter = require('../src/routes/groundedWorker');
const { problemHandler } = require('../src/lib/problemJson');

const app = express();
app.use(express.json());
app.use('/api/worker', groundedWorkerRouter);
app.use(problemHandler);
const request = supertest(app);

const SERVICE_ID = '44444444-4444-4444-8444-444444444444';
const CREDENTIAL_SERVICE_ID = '55555555-5555-4555-8555-555555555555';

function token(user) {
  return signAccessToken({ id: user.id, role: user.role });
}

function auth(user) {
  return { Authorization: `Bearer ${token(user)}` };
}

function commandHeaders(user, key, revision = 1) {
  return { ...auth(user), 'Idempotency-Key': key, 'If-Match': `"${revision}"` };
}

async function resetDatabase() {
  await db.query('TRUNCATE TABLE users, service_catalogue_versions RESTART IDENTITY CASCADE');
}

async function createUser(role, suffix, { verified = true } = {}) {
  const result = await db.query(
    `INSERT INTO users (
       name, email, phone, password_hash, role, is_verified, avatar_url, emergency_contact
     ) VALUES ($1, $2, $3, 'test-hash', $4, $5, $6, $7)
     RETURNING id, role`,
    [
      role === 'labourer' ? `Thabo ${suffix}` : `Naledi ${suffix}`,
      `${role}-${suffix}@worker.example.test`,
      role === 'labourer' ? `083${suffix.padStart(7, '0')}` : `082${suffix.padStart(7, '0')}`,
      role,
      verified,
      role === 'labourer' ? 'https://images.example.test/worker.jpg' : null,
      role === 'labourer' ? '0840000000' : null,
    ]
  );
  const user = result.rows[0];
  if (role === 'labourer') {
    await db.query(
      `INSERT INTO labourer_profiles (user_id, bio, is_available)
       VALUES ($1, 'Experienced household repair professional.', false)`,
      [user.id]
    );
  }
  return user;
}

async function seedService({
  serviceId = SERVICE_ID,
  canonicalKey = 'home_repair_quote',
  workerEligibility = {},
} = {}) {
  await db.query(
    `INSERT INTO service_catalogue_versions (
       service_id, service_version, canonical_key, category_key,
       label_en_za, description_en_za, pricing_mode, fulfilment_mode,
       risk_tier, required_question_ids, brief_schema, pricing_rules,
       materials_rules, change_order_rules, cancellation_policy_version,
       worker_eligibility, is_published, published_at
     ) VALUES (
       $1, 1, $2, 'home_repairs', 'Home repair quote',
       'A scoped remote quote for household repair work.',
       'remote_quote', 'receive_quotes', 'standard', '{}',
       '{"questions":[]}'::jsonb, '{"finalPrice":"accepted_quote_only"}'::jsonb,
       '{}'::jsonb, '{}'::jsonb, 'worker-test-v1', $3::jsonb, true, NOW()
     )`,
    [serviceId, canonicalKey, JSON.stringify(workerEligibility)]
  );
}

beforeEach(async () => {
  await resetDatabase();
  await seedService();
});

afterAll(async () => {
  await db.end();
});

describe('canonical worker profile and activation API', () => {
  test('requires an authenticated worker and never returns private contact values', async () => {
    const worker = await createUser('labourer', '1000001');
    const customer = await createUser('customer', '1000002');

    expect((await request.get('/api/worker/profile')).status).toBe(401);
    expect((await request.get('/api/worker/profile').set(auth(customer))).status).toBe(403);

    const response = await request.get('/api/worker/profile').set(auth(worker));
    expect(response.status).toBe(200);
    expect(response.body.servicesProfile.publicProfile.profileId).toBe(worker.id);
    expect(response.body.servicesProfile.capabilities.payoutAccount.status).toBe('unavailable');
    expect(JSON.stringify(response.body)).not.toContain('0831000001');
    expect(JSON.stringify(response.body)).not.toContain('0840000000');
  });

  test('profile mutation is strict, optimistic and replay safe', async () => {
    const worker = await createUser('labourer', '1000003');
    const body = {
      displayName: 'Thabo the repair specialist',
      about: 'I provide careful household repairs with clear scope confirmation.',
    };
    expect((await request.patch('/api/worker/profile').set(auth(worker)).send(body)).status).toBe(428);

    const first = await request.patch('/api/worker/profile')
      .set(commandHeaders(worker, 'profile-save-key-0001'))
      .send(body);
    expect(first.status).toBe(200);
    expect(first.body.publicProfile.stateVersion).toBe(1);

    const replay = await request.patch('/api/worker/profile')
      .set(commandHeaders(worker, 'profile-save-key-0001'))
      .send(body);
    expect(replay.status).toBe(200);
    expect(replay.headers['idempotent-replay']).toBe('true');

    const reused = await request.patch('/api/worker/profile')
      .set(commandHeaders(worker, 'profile-save-key-0001'))
      .send({ ...body, displayName: 'A different value' });
    expect(reused.status).toBe(422);

    const updated = await request.patch('/api/worker/profile')
      .set(commandHeaders(worker, 'profile-save-key-0002'))
      .send({ ...body, displayName: 'Updated public name' });
    expect(updated.status).toBe(200);
    expect(updated.body.publicProfile.stateVersion).toBe(2);

    const stale = await request.patch('/api/worker/profile')
      .set(commandHeaders(worker, 'profile-save-key-0003', 1))
      .send(body);
    expect(stale.status).toBe(412);
  });

  test('rejects contact details from every Grounded public profile and offering write', async () => {
    const worker = await createUser('labourer', '1000013');
    const profileCases = [
      {
        displayName: 'Call 082 555 0111',
        about: 'I provide careful household repairs with clear scope confirmation.',
      },
      {
        displayName: 'Thabo the repair specialist',
        about: 'I provide careful repairs. Email private.worker@example.com for details.',
      },
    ];
    for (const [index, body] of profileCases.entries()) {
      const response = await request.patch('/api/worker/profile')
        .set(commandHeaders(worker, `profile-contact-reject-${index + 1}`))
        .send(body);
      expect(response.status).toBe(422);
      expect(response.body.type).toContain('worker_public_text_contact_details');
    }

    const created = await request.post('/api/worker/offerings')
      .set(commandHeaders(worker, 'offering-contact-create-1'))
      .send({ serviceId: SERVICE_ID, serviceVersion: 1 });
    expect(created.status).toBe(201);
    const offeringId = created.body.offering.offeringId;
    const offeringCases = [
      { title: 'Call 083 555 0112' },
      { description: 'Careful household repairs. Email offering.worker@example.com before booking.' },
      { serviceAreaLabel: 'WhatsApp 084 555 0113' },
    ];
    for (const [index, body] of offeringCases.entries()) {
      const response = await request.patch(`/api/worker/offerings/${offeringId}`)
        .set(commandHeaders(worker, `offering-contact-reject-${index + 1}`))
        .send(body);
      expect(response.status).toBe(422);
      expect(response.body.type).toContain('worker_public_text_contact_details');
    }

    const storedProfile = await db.query(
      'SELECT 1 FROM grounded_worker_public_profiles WHERE worker_id = $1',
      [worker.id]
    );
    const storedOffering = await db.query(
      `SELECT customer_facing_title, description, service_area_label
         FROM grounded_worker_service_offerings WHERE id = $1`,
      [offeringId]
    );
    expect(storedProfile.rowCount).toBe(0);
    expect(storedOffering.rows[0]).toMatchObject({
      customer_facing_title: 'Home repair quote',
      description: 'A scoped remote quote for household repair work.',
      service_area_label: null,
    });
  });

  test('creates an exact inactive catalogue offering, checks ownership, then activates only configured evidence', async () => {
    const worker = await createUser('labourer', '1000004');
    const other = await createUser('labourer', '1000005');

    const created = await request.post('/api/worker/offerings')
      .set(commandHeaders(worker, 'offering-create-key-001'))
      .send({ serviceId: SERVICE_ID, serviceVersion: 1 });
    expect(created.status).toBe(201);
    expect(created.body.offering.active).toBe(false);
    expect(created.body.offering.facts.serviceId).toBe(SERVICE_ID);
    const offeringId = created.body.offering.offeringId;

    const forbiddenAsNotFound = await request.get(`/api/worker/offerings/${offeringId}`).set(auth(other));
    expect(forbiddenAsNotFound.status).toBe(404);

    const configured = await request.patch(`/api/worker/offerings/${offeringId}`)
      .set(commandHeaders(worker, 'offering-update-key-001'))
      .send({
        title: 'Careful household repair quote',
        description: 'I inspect the supplied brief and send a clear scoped repair quote.',
        serviceAreaLabel: 'Rondebosch, Cape Town',
        active: true,
      });
    expect(configured.status).toBe(200);
    expect(configured.body.offering.active).toBe(true);
    expect(configured.body.offering.eligibility.eligible).toBe(true);

    const unknownField = await request.patch(`/api/worker/offerings/${offeringId}`)
      .set(commandHeaders(worker, 'offering-update-key-002', 2))
      .send({ canonicalCategory: 'electrician' });
    expect(unknownField.status).toBe(422);

    const retiredMutation = await db.query(
      `UPDATE service_catalogue_versions SET retired_at = NOW()
        WHERE service_id = $1 RETURNING service_version`,
      [SERVICE_ID]
    );
    expect(retiredMutation.rowCount).toBe(1);
    const retired = await request.patch(`/api/worker/offerings/${offeringId}`)
      .set(commandHeaders(worker, 'offering-update-key-003', 2))
      .send({ active: false });
    expect(retired.status).toBe(200);
    expect(retired.body.offering.active).toBe(false);
  });

  test('required credentials remain missing and prevent activation', async () => {
    await seedService({
      serviceId: CREDENTIAL_SERVICE_ID,
      canonicalKey: 'credentialled_home_repair',
      workerEligibility: { credentialIds: ['trade.registration'] },
    });
    const worker = await createUser('labourer', '1000006');
    const created = await request.post('/api/worker/offerings')
      .set(commandHeaders(worker, 'credential-offering-create'))
      .send({ serviceId: CREDENTIAL_SERVICE_ID, serviceVersion: 1 });
    const offeringId = created.body.offering.offeringId;

    const activated = await request.patch(`/api/worker/offerings/${offeringId}`)
      .set(commandHeaders(worker, 'credential-offering-active'))
      .send({
        title: 'Registered repair work',
        description: 'Credential-dependent work offered only after evidence review.',
        serviceAreaLabel: 'Cape Town City Bowl',
        active: true,
      });
    expect(activated.status).toBe(422);
    expect(activated.body.type).toContain('worker_credentials_unavailable');

    const stored = await db.query(
      `SELECT i.status
         FROM catalogue_worker_opt_ins i
        WHERE worker_id = $1 AND service_id = $2`,
      [worker.id, CREDENTIAL_SERVICE_ID]
    );
    expect(stored.rows[0].status).toBe('inactive');
  });

  test('acknowledgements are revisioned, replay safe and do not claim device permission', async () => {
    const worker = await createUser('labourer', '1000007');
    const initial = await request.get('/api/worker/activation').set(auth(worker));
    expect(initial.status).toBe(200);
    expect(initial.body.activation.acknowledgementPolicies).toHaveLength(3);
    expect(initial.body.activation.acknowledgementPolicies[0]).toEqual(expect.objectContaining({
      status: 'available',
      expectedRevision: 1,
      acknowledgedCurrent: false,
      policyVersion: expect.any(String),
      body: expect.any(String),
    }));
    const stale = await request.put('/api/worker/activation/acknowledgements/foreground_location')
      .set(commandHeaders(worker, 'foreground-ack-stale-001'))
      .send({ policyVersion: 'foreground-location-old' });
    expect(stale.status).toBe(409);
    expect(stale.body.type).toContain('worker_activation_content_stale');

    const response = await request.put('/api/worker/activation/acknowledgements/foreground_location')
      .set(commandHeaders(worker, 'foreground-ack-key-001'))
      .send({ policyVersion: 'foreground-location-2026.08' });
    expect(response.status).toBe(200);
    expect(response.body.acknowledgement).toMatchObject({
      stateVersion: 1,
      scope: 'server_record_only',
      devicePermissionVerified: false,
    });
    expect(response.body.activation.onlinePermission.value.allowed).toBe(false);

    const replay = await request.put('/api/worker/activation/acknowledgements/foreground_location')
      .set(commandHeaders(worker, 'foreground-ack-key-001'))
      .send({ policyVersion: 'foreground-location-2026.08' });
    expect(replay.headers['idempotent-replay']).toBe('true');

    const eventCount = await db.query(
      `SELECT COUNT(*)::int AS count FROM grounded_worker_activation_ack_events
        WHERE worker_id = $1 AND acknowledgement_kind = 'foreground_location'`,
      [worker.id]
    );
    expect(eventCount.rows[0].count).toBe(1);
  });

  test('private emergency contact is revisioned, replay safe and never returned publicly', async () => {
    const worker = await createUser('labourer', '1000017');
    await db.query('UPDATE users SET emergency_contact = NULL WHERE id = $1', [worker.id]);

    const invalid = await request.put('/api/worker/activation/emergency-contact')
      .set(commandHeaders(worker, 'emergency-contact-invalid-001'))
      .send({ phone: 'not a phone' });
    expect(invalid.status).toBe(422);
    expect(invalid.body.type).toContain('worker_emergency_contact_invalid');

    const saved = await request.put('/api/worker/activation/emergency-contact')
      .set(commandHeaders(worker, 'emergency-contact-save-001'))
      .send({ phone: '082 555 0199' });
    expect(saved.status).toBe(200);
    expect(JSON.stringify(saved.body)).not.toContain('082 555 0199');
    expect(saved.body.activation.items.find((item) => item.kind === 'safety_emergency').status).toBe('incomplete');

    const stored = await db.query('SELECT emergency_contact FROM users WHERE id = $1', [worker.id]);
    expect(stored.rows[0].emergency_contact).toBe('082 555 0199');

    const replay = await request.put('/api/worker/activation/emergency-contact')
      .set(commandHeaders(worker, 'emergency-contact-save-001'))
      .send({ phone: '082 555 0199' });
    expect(replay.status).toBe(200);
    expect(replay.headers['idempotent-replay']).toBe('true');
  });

  test('offer inbox exposes only persisted active attempts and withholds unsupported evidence', async () => {
    const worker = await createUser('labourer', '1000008');
    const customer = await createUser('customer', '1000009');
    const matchResult = await db.query(
      `INSERT INTO match_requests (
         customer_id, skill_needed, address, location_lat, location_lng,
         scheduled_at, hours_est, notes, expires_at
       ) VALUES ($1, 'Tap repair', '99 Private Street', -33.9249, 18.4241,
                 NOW() + INTERVAL '2 hours', 1.5, 'Private customer note',
                 NOW() + INTERVAL '10 minutes')
       RETURNING id`,
      [customer.id]
    );
    const matchId = matchResult.rows[0].id;
    await db.query(
      `INSERT INTO match_attempts (match_request_id, labourer_id)
       VALUES ($1, $2)`,
      [matchId, worker.id]
    );

    const inbox = await request.get('/api/worker/offers').set(auth(worker));
    expect(inbox.status).toBe(200);
    expect(inbox.body.schema).toBe('togt.worker-offers.v1');
    expect(inbox.body.serverNow).toEqual(expect.any(String));
    expect(inbox.body.offers).toHaveLength(1);
    expect(inbox.body.offers[0]).toMatchObject({
      id: matchId,
      kind: 'instant',
      matchingMode: 'fast_match',
      status: 'open',
      serviceLabel: 'Tap repair',
      acceptancePermission: {
        allowed: false,
        reasonCode: 'worker_offline',
      },
      travel: null,
      commercial: null,
      scopeSummary: 'Tap repair',
      attachmentCount: null,
    });
    const serialized = JSON.stringify(inbox.body);
    expect(serialized).not.toContain('99 Private Street');
    expect(serialized).not.toContain('Private customer note');
    expect(serialized).not.toContain(customer.id);

    await db.query(
      `UPDATE match_attempts
          SET status = 'timeout', responded_at = NOW()
        WHERE match_request_id = $1 AND labourer_id = $2`,
      [matchId, worker.id]
    );
    const refreshed = await request.get('/api/worker/offers').set(auth(worker));
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.offers).toEqual([]);

    const detail = await request.get(`/api/worker/offers/${matchId}`).set(auth(worker));
    expect(detail.status).toBe(200);
    expect(detail.body.offer.status).toBe('expired');
    expect(detail.body.offer.acceptancePermission.allowed).toBe(false);
  });
});
