process.env.GROUNDED_FULFILMENT_POLICY_APPROVED = 'true';
process.env.GROUNDED_FULFILMENT_POLICY_VERSION = 'quote-test-fulfilment-v1';
process.env.GROUNDED_FULFILMENT_ROUTE_REVEAL_LEAD_MINUTES = '60';
process.env.GROUNDED_FULFILMENT_ARRIVAL_EVIDENCE_MODE = 'worker_attestation';
process.env.GROUNDED_FULFILMENT_NO_SHOW_GRACE_MINUTES = '15';
process.env.GROUNDED_FULFILMENT_START_PIN_TTL_MINUTES = '60';
process.env.GROUNDED_FULFILMENT_START_PIN_MAX_ATTEMPTS = '3';
process.env.GROUNDED_FULFILMENT_RESCHEDULE_EXPIRY_MINUTES = '120';
process.env.GROUNDED_FULFILMENT_CHANGE_ORDER_EXPIRY_MINUTES = '120';

const express = require('express');
const supertest = require('supertest');
const db = require('../src/config/db');
const { signAccessToken } = require('../src/lib/jwtTokens');
const {
  catalogueRouter,
  quoteRequestRouter,
  quoteRouter,
} = require('../src/routes/groundedQuotes');
const { problemHandler } = require('../src/lib/problemJson');
const groundedFulfilmentRoutes = require('../src/routes/groundedFulfilment');
const bookingRoutes = require('../src/routes/bookings');
const bookingExtensionRoutes = require('../src/routes/bookingExtensions');

const app = express();
app.use(express.json());
app.use('/api/catalogue', catalogueRouter);
app.use('/api/quote-requests', quoteRequestRouter);
app.use('/api/quotes', quoteRouter);
app.use('/api/bookings', bookingRoutes);
app.use('/api/bookings', bookingExtensionRoutes);
app.use('/api/projects', groundedFulfilmentRoutes);
app.use(problemHandler);
const request = supertest(app);

const SERVICE_ID = '11111111-1111-4111-8111-111111111111';

function token(user) {
  return signAccessToken({ id: user.id, role: user.role });
}

function auth(user) {
  return { Authorization: `Bearer ${token(user)}` };
}

function key(value) {
  return { 'Idempotency-Key': value };
}

function future(days, hours = 0) {
  return new Date(Date.now() + ((days * 24 + hours) * 60 * 60 * 1000)).toISOString();
}

async function resetDatabase() {
  await db.query('TRUNCATE TABLE users, service_catalogue_versions RESTART IDENTITY CASCADE');
}

async function createUser(role, suffix, { verified = true } = {}) {
  const result = await db.query(
    `INSERT INTO users (name, email, phone, password_hash, role, is_verified)
     VALUES ($1, $2, $3, 'test-hash', $4, $5)
     RETURNING id, name, role, is_verified`,
    [
      role === 'customer' ? `Naledi ${suffix}` : `Thabo ${suffix}`,
      `${role}-${suffix}@quotes.example.test`,
      role === 'customer' ? `082${suffix.padStart(7, '0')}` : `083${suffix.padStart(7, '0')}`,
      role,
      verified,
    ]
  );
  const user = result.rows[0];
  if (role === 'labourer') {
    await db.query(
      `INSERT INTO labourer_profiles (
         user_id, skills, hourly_rate, bio, is_available, rating_avg, rating_count
       ) VALUES ($1, ARRAY['Plumbing'], 425.00, 'Qualified plumbing worker', false, 4.80, 25)`,
      [user.id]
    );
  }
  return user;
}

async function seedService({ published = true } = {}) {
  await db.query(
    `INSERT INTO service_catalogue_versions (
       service_id, service_version, canonical_key, category_key,
       label_en_za, description_en_za, pricing_mode, fulfilment_mode,
       risk_tier, required_question_ids, brief_schema, pricing_rules,
       materials_rules, change_order_rules, minimum_duration_minutes,
       cancellation_policy_version, worker_eligibility,
       is_published, published_at
     ) VALUES (
       $1, 1, 'complex_plumbing_quote', 'plumbing',
       'Complex plumbing repair', 'Structured remote quote for variable work.',
       'remote_quote', 'receive_quotes', 'standard',
       ARRAY['leak_location','water_isolated'],
       $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, 60,
       'quote-cancellation-v1', $6::jsonb, $7, CASE WHEN $7 THEN NOW() ELSE NULL END
     )`,
    [
      SERVICE_ID,
      JSON.stringify({ questions: [
        {
          id: 'leak_location',
          type: 'single_select',
          label: 'Where is the leak?',
          options: [{ value: 'kitchen', label: 'Kitchen' }, { value: 'bathroom', label: 'Bathroom' }],
        },
        { id: 'water_isolated', type: 'boolean', label: 'Is the water isolated?' },
        {
          id: 'preferred_tools',
          type: 'multi_select',
          label: 'Any preferred tools?',
          options: [{ value: 'hand_tools', label: 'Hand tools' }, { value: 'power_tools', label: 'Power tools' }],
        },
      ] }),
      JSON.stringify({ finalPrice: 'accepted_quote_only' }),
      JSON.stringify({ disclosure: 'required' }),
      JSON.stringify({ approval: 'customer' }),
      JSON.stringify({ requiresIdentityVerified: true, credentialIds: ['plumbing_identity'] }),
      published,
    ]
  );
}

async function optIn(worker) {
  await db.query(
    `INSERT INTO catalogue_worker_opt_ins (worker_id, service_id, service_version)
     VALUES ($1, $2, 1)`,
    [worker.id, SERVICE_ID]
  );
}

function requestBody(overrides = {}) {
  return {
    serviceId: SERVICE_ID,
    serviceVersion: 1,
    brief: {
      answers: {
        leak_location: 'kitchen',
        water_isolated: true,
      },
      materialsResponsibility: 'worker',
      media: [{ id: 'safe-media-reference', kind: 'image' }],
      summary: 'A connector is leaking. Email owner@example.com.',
    },
    broadAreaLabel: 'Rondebosch, Cape Town',
    privateLocation: {
      address: '12 Exact Street, Rondebosch, Cape Town',
      latitude: -33.9618,
      longitude: 18.4732,
      accessInstructions: 'Gate code 1234',
    },
    schedule: {
      startsAt: future(4),
      endsAt: future(4, 2),
      timezone: 'Africa/Johannesburg',
      flexibility: 'Any time in this window',
    },
    questionsDeadlineAt: future(1),
    quotesCloseAt: future(2),
    ...overrides,
  };
}

function completeQuoteBody(overrides = {}) {
  return {
    quote: {
      scope: 'Replace the failed connector and pressure-test the repair.',
      deliverables: ['Remove failed connector', 'Fit replacement', 'Pressure test'],
      exclusions: ['Cabinet repairs'],
      assumptions: ['Isolation valve remains operational'],
      proposedStartAt: future(4),
      proposedEndAt: future(4, 2),
      durationMinutes: 120,
      labourAmount: '750.00',
      materialsAmount: '250.00',
      validUntil: future(1),
      ...(overrides.quote || {}),
    },
    submit: overrides.submit ?? true,
  };
}

async function createRequest(customer, suffix = 'create-request-key', body = requestBody()) {
  return request
    .post('/api/quote-requests')
    .set(auth(customer))
    .set(key(suffix))
    .send(body);
}

async function createSubmittedQuote(worker, requestId, suffix) {
  return request
    .post(`/api/quote-requests/${requestId}/quotes`)
    .set(auth(worker))
    .set(key(suffix))
    .send(completeQuoteBody());
}

beforeEach(resetDatabase);

afterAll(async () => {
  await db.end();
});

describe('versioned public service catalogue', () => {
  test('returns only published current versions and explicitly excludes availability', async () => {
    await seedService();
    const list = await request.get('/api/catalogue/services?pricingMode=remote_quote');
    expect(list.status).toBe(200);
    expect(list.body.meta).toEqual({
      count: 1,
      availability: 'not_included',
      locale: 'en-ZA',
      currency: 'ZAR',
    });
    expect(list.body.services[0]).toMatchObject({
      id: SERVICE_ID,
      version: 1,
      pricingMode: 'remote_quote',
      fulfilmentMode: 'receive_quotes',
      requiredQuestionIds: ['leak_location', 'water_isolated'],
    });
    expect(list.body.services[0].briefSchema.questions[0].options).toEqual([
      { value: 'kitchen', label: 'Kitchen' },
      { value: 'bathroom', label: 'Bathroom' },
    ]);
    expect(list.body.services[0]).not.toHaveProperty('workers');

    const detail = await request.get(`/api/catalogue/services/${SERVICE_ID}?version=1`);
    expect(detail.status).toBe(200);
    expect(detail.body.service.workerEligibility.requiresIdentityVerified).toBe(true);
  });

  test('does not expose an unpublished service version', async () => {
    await seedService({ published: false });
    const list = await request.get('/api/catalogue/services');
    expect(list.status).toBe(200);
    expect(list.body.services).toEqual([]);
    const detail = await request.get(`/api/catalogue/services/${SERVICE_ID}`);
    expect(detail.status).toBe(404);
  });
});

describe('quote request creation and privacy', () => {
  test('requires catalogue questions and replays the exact versioned request idempotently', async () => {
    await seedService();
    const customer = await createUser('customer', '1000001');
    const incomplete = requestBody({ brief: { answers: { leak_location: 'kitchen' }, materialsResponsibility: 'worker' } });
    const rejected = await request
      .post('/api/quote-requests')
      .set(auth(customer))
      .set(key('incomplete-request-key'))
      .send(incomplete);
    expect(rejected.status).toBe(422);
    expect(rejected.body.type).toMatch(/quote_brief_incomplete$/);
    expect(rejected.body.extensions.missingQuestionIds).toEqual(['water_isolated']);

    for (const [suffix, answers, invalidQuestionId] of [
      ['off-option', { leak_location: 'garage', water_isolated: true }, 'leak_location'],
      ['wrong-boolean', { leak_location: 'kitchen', water_isolated: 'maybe' }, 'water_isolated'],
    ]) {
      const invalid = await createRequest(
        customer,
        `invalid-answer-${suffix}`,
        requestBody({ brief: { answers, materialsResponsibility: 'worker' } })
      );
      expect(invalid.status).toBe(422);
      expect(invalid.body.type).toMatch(/quote_brief_answer_invalid$/);
      expect(invalid.body.extensions.invalidQuestionIds).toEqual([invalidQuestionId]);
    }
    await db.query(
      `UPDATE service_catalogue_versions
          SET required_question_ids = ARRAY['leak_location','water_isolated','preferred_tools']
        WHERE service_id = $1 AND service_version = 1`,
      [SERVICE_ID]
    );
    const emptyRequiredMulti = await createRequest(
      customer,
      'invalid-answer-empty-multi',
      requestBody({
        brief: {
          answers: { leak_location: 'kitchen', water_isolated: true, preferred_tools: [] },
          materialsResponsibility: 'worker',
        },
      })
    );
    expect(emptyRequiredMulti.status).toBe(422);
    expect(emptyRequiredMulti.body.type).toMatch(/quote_brief_incomplete$/);
    expect(emptyRequiredMulti.body.extensions.missingQuestionIds).toEqual(['preferred_tools']);
    await db.query(
      `UPDATE service_catalogue_versions
          SET required_question_ids = ARRAY['leak_location','water_isolated']
        WHERE service_id = $1 AND service_version = 1`,
      [SERVICE_ID]
    );

    const stableBody = requestBody();
    const first = await createRequest(customer, 'same-request-key', stableBody);
    const replay = await createRequest(customer, 'same-request-key', stableBody);
    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.headers['idempotent-replay']).toBe('true');
    expect(replay.body).toEqual(first.body);
    expect(first.body.quoteRequest.service.version).toBe(1);
    expect(first.body.quoteRequest.privateLocation.address).toContain('Exact Street');
    const count = await db.query('SELECT COUNT(*)::int AS count FROM grounded_quote_requests');
    expect(count.rows[0].count).toBe(1);
  });

  test('worker inbox requires a real opt-in and exposes only broad-area, contact-scrubbed request data', async () => {
    await seedService();
    const customer = await createUser('customer', '1000002');
    const worker = await createUser('labourer', '2000002');
    const created = await createRequest(customer, 'privacy-request-key');
    const requestId = created.body.quoteRequest.id;

    const hidden = await request.get(`/api/quote-requests/${requestId}`).set(auth(worker));
    expect(hidden.status).toBe(404);

    await optIn(worker);
    const detail = await request.get(`/api/quote-requests/${requestId}`).set(auth(worker));
    expect(detail.status).toBe(200);
    expect(detail.body.quoteRequest.area).toEqual({ label: 'Rondebosch, Cape Town', precision: 'broad' });
    expect(detail.body.quoteRequest).not.toHaveProperty('privateLocation');
    expect(detail.body.quoteRequest).not.toHaveProperty('customerId');
    const serialized = JSON.stringify(detail.body);
    expect(serialized).not.toContain('Exact Street');
    expect(serialized).not.toContain('1234');
    expect(serialized).not.toContain('082 123');
    expect(serialized).not.toContain('owner@example.com');
  });

  test('unverified worker is excluded when the immutable service snapshot requires verification', async () => {
    await seedService();
    const customer = await createUser('customer', '1000003');
    const worker = await createUser('labourer', '2000003', { verified: false });
    await optIn(worker);
    const created = await createRequest(customer, 'verified-gate-request');
    const inbox = await request.get('/api/quote-requests').set(auth(worker));
    expect(inbox.status).toBe(200);
    expect(inbox.body.quoteRequests).toEqual([]);
    const submit = await createSubmittedQuote(worker, created.body.quoteRequest.id, 'unverified-submit');
    expect(submit.status).toBe(403);
    expect(submit.body.type).toMatch(/quote_worker_not_eligible$/);
  });
});

describe('worker quote builder and private competition', () => {
  test('saves a partial draft, edits a new version, submits a complete current version, and withdraws', async () => {
    await seedService();
    const customer = await createUser('customer', '1000004');
    const worker = await createUser('labourer', '2000004');
    await optIn(worker);
    const created = await createRequest(customer, 'draft-request-key');
    const requestId = created.body.quoteRequest.id;
    const draft = await request
      .post(`/api/quote-requests/${requestId}/quotes`)
      .set(auth(worker))
      .set(key('create-draft-key'))
      .send({ quote: { scope: 'Replace the leaking connector' }, submit: false });
    expect(draft.status).toBe(201);
    expect(draft.body.quote).toMatchObject({ status: 'draft', version: 1 });
    expect(draft.body.quote.commercial.customerTotalAmount).toBeNull();

    const quoteId = draft.body.quote.id;
    const edited = await request
      .put(`/api/quotes/${quoteId}`)
      .set(auth(worker))
      .set(key('edit-draft-key'))
      .send(completeQuoteBody({ submit: false }));
    expect(edited.status).toBe(200);
    expect(edited.body.quote).toMatchObject({ status: 'draft', version: 2 });

    const beforeSubmit = await request
      .get(`/api/quote-requests/${requestId}/quotes`)
      .set(auth(customer));
    expect(beforeSubmit.body.quotes).toEqual([]);

    const submitted = await request
      .post(`/api/quotes/${quoteId}/submit`)
      .set(auth(worker))
      .set(key('submit-draft-key'))
      .send({});
    expect({ status: submitted.status, body: submitted.body }).toMatchObject({ status: 200 });
    expect(submitted.body.quote).toMatchObject({ status: 'submitted', version: 3 });
    expect(submitted.body.quote.commercial).toMatchObject({
      labourAmount: '750.00',
      materialsAmount: '250.00',
      customerTotalAmount: '1000.00',
      currency: 'ZAR',
      platformFee: { state: 'not_configured', amount: null },
      workerNet: { state: 'not_available', amount: null },
    });

    const withdrawn = await request
      .post(`/api/quotes/${quoteId}/withdraw`)
      .set(auth(worker))
      .set(key('withdraw-quote-key'))
      .send({});
    expect(withdrawn.status).toBe(200);
    expect(withdrawn.body.quote.status).toBe('withdrawn');
  });

  test('workers can read only their own private quote, while customer sees complete submitted offers with factual evidence', async () => {
    await seedService();
    const customer = await createUser('customer', '1000005');
    const workerA = await createUser('labourer', '2000005');
    const workerB = await createUser('labourer', '3000005');
    await optIn(workerA);
    await optIn(workerB);
    const created = await createRequest(customer, 'private-quotes-request');
    const requestId = created.body.quoteRequest.id;
    const quoteA = await createSubmittedQuote(workerA, requestId, 'private-quote-a');
    const quoteB = await createSubmittedQuote(workerB, requestId, 'private-quote-b');

    const workerList = await request
      .get(`/api/quote-requests/${requestId}/quotes`)
      .set(auth(workerA));
    expect(workerList.status).toBe(200);
    expect(workerList.body.meta.visibility).toBe('own_quote_only');
    expect(workerList.body.quotes.map((quote) => quote.id)).toEqual([quoteA.body.quote.id]);
    expect(JSON.stringify(workerList.body)).not.toContain(quoteB.body.quote.id);

    const customerList = await request
      .get(`/api/quote-requests/${requestId}/quotes`)
      .set(auth(customer));
    expect(customerList.status).toBe(200);
    expect(customerList.body.quotes).toHaveLength(2);
    expect(customerList.body.quotes[0].worker).toMatchObject({
      verification: { identityVerified: true },
      rating: { state: 'rated', average: 4.8, count: 25 },
      serviceOptIn: 'active',
    });
    expect(JSON.stringify(customerList.body)).not.toContain('@quotes.example.test');
  });
});

describe('atomic single-winner quote acceptance', () => {
  test('two simultaneous accepts create one Project/agreement and close the competing quote without leaking it', async () => {
    await seedService();
    const customer = await createUser('customer', '1000006');
    const workerA = await createUser('labourer', '2000006');
    const workerB = await createUser('labourer', '3000006');
    await optIn(workerA);
    await optIn(workerB);
    const created = await createRequest(customer, 'race-request-key');
    const requestId = created.body.quoteRequest.id;
    const quoteA = await createSubmittedQuote(workerA, requestId, 'race-quote-a');
    const quoteB = await createSubmittedQuote(workerB, requestId, 'race-quote-b');

    const [acceptA, acceptB] = await Promise.all([
      request.post(`/api/quotes/${quoteA.body.quote.id}/accept`)
        .set(auth(customer)).set(key('race-accept-a')).send({}),
      request.post(`/api/quotes/${quoteB.body.quote.id}/accept`)
        .set(auth(customer)).set(key('race-accept-b')).send({}),
    ]);
    expect([acceptA.status, acceptB.status].sort()).toEqual([200, 409]);
    const winner = acceptA.status === 200 ? acceptA : acceptB;
    expect(winner.body.project).toMatchObject({ status: 'accepted', operationalPhase: 'scheduled' });
    expect(winner.body.project.agreement.commercial).toEqual({
      schemaVersion: 1,
      pricingMode: 'remote_quote',
      labourAmount: '750.00',
      materialsAmount: '250.00',
      customerTotalAmount: '1000.00',
      currency: 'ZAR',
      platformFee: { state: 'not_configured', amount: null },
      workerNet: { state: 'not_available', amount: null },
    });

    const fulfilment = await request
      .get(`/api/projects/${winner.body.project.id}/fulfilment`)
      .set(auth(customer));
    expect(fulfilment.status).toBe(200);
    expect(fulfilment.body.fulfilment).toMatchObject({
      projectId: winner.body.project.id,
      transactionalStatus: 'accepted',
      operationalPhase: 'scheduled',
      scope: {
        current: {
          version: 1,
          status: 'confirmed',
          source: 'accepted_agreement',
          proposedByRole: 'worker',
          snapshot: {
            items: ['Remove failed connector', 'Fit replacement', 'Pressure test'],
            materialsResponsibility: 'Worker supplies materials or parts.',
            materialsResponsibilityCode: 'worker',
          },
        },
        proposal: null,
      },
      integrity: {
        policySnapshotPresent: true,
        policyVersion: 'quote-test-fulfilment-v1',
        readOnly: false,
      },
    });

    const state = await db.query(
      `SELECT
         (SELECT COUNT(*)::int FROM bookings) AS bookings,
         (SELECT COUNT(*)::int FROM grounded_booking_agreement_snapshots) AS snapshots,
         (SELECT COUNT(*)::int FROM grounded_fulfilment_policy_snapshots) AS policies,
         (SELECT COUNT(*)::int FROM grounded_scope_versions WHERE status = 'confirmed') AS scopes,
         (SELECT COUNT(*)::int FROM grounded_quotes WHERE status = 'accepted') AS accepted,
         (SELECT COUNT(*)::int FROM grounded_quotes WHERE status = 'lost') AS lost`
    );
    expect(state.rows[0]).toEqual({
      bookings: 1,
      snapshots: 1,
      policies: 1,
      scopes: 1,
      accepted: 1,
      lost: 1,
    });
    const agreement = await db.query('SELECT * FROM grounded_booking_agreement_snapshots');
    expect(agreement.rows[0].quote_version).toBe(1);
    expect(agreement.rows[0].service_version).toBe(1);
    expect(agreement.rows[0].scope_snapshot.scope).toContain('pressure-test');
    expect(agreement.rows[0].scope_snapshot.items).toEqual([
      'Remove failed connector',
      'Fit replacement',
      'Pressure test',
    ]);
    expect(agreement.rows[0].scope_snapshot.materialsResponsibility)
      .toBe('Worker supplies materials or parts.');
    expect(agreement.rows[0].scope_snapshot.materialsResponsibilityCode).toBe('worker');
    const canonicalBooking = await db.query('SELECT scope_items FROM bookings');
    expect(canonicalBooking.rows[0].scope_items).toEqual([
      'Remove failed connector',
      'Fit replacement',
      'Pressure test',
    ]);
    expect(agreement.rows[0].commercial_snapshot.customerTotalAmount).toBe('1000.00');
  });

  test('rejects conflicting materials terms at submission and again at legacy acceptance', async () => {
    await seedService();
    const customer = await createUser('customer', '1000012');
    const worker = await createUser('labourer', '2000012');
    await optIn(worker);
    const body = requestBody();
    body.brief.materialsResponsibility = 'customer';
    const created = await createRequest(customer, 'customer-materials-request', body);
    const rejectedSubmission = await createSubmittedQuote(
      worker,
      created.body.quoteRequest.id,
      'customer-materials-quote'
    );
    expect(rejectedSubmission.status).toBe(422);
    expect(rejectedSubmission.body.type).toMatch(/quote_materials_terms_conflict$/);
    expect((await db.query('SELECT COUNT(*)::int AS count FROM grounded_quotes')).rows[0].count).toBe(0);

    const legacyDraft = await request
      .post(`/api/quote-requests/${created.body.quoteRequest.id}/quotes`)
      .set(auth(worker))
      .set(key('customer-materials-legacy-draft'))
      .send(completeQuoteBody({ submit: false }));
    expect(legacyDraft.status).toBe(201);
    const rejectedSubmit = await request
      .post(`/api/quotes/${legacyDraft.body.quote.id}/submit`)
      .set(auth(worker))
      .set(key('customer-materials-submit-draft'))
      .send({});
    expect(rejectedSubmit.status).toBe(422);
    expect(rejectedSubmit.body.type).toMatch(/quote_materials_terms_conflict$/);
    const rejectedEditSubmit = await request
      .put(`/api/quotes/${legacyDraft.body.quote.id}`)
      .set(auth(worker))
      .set(key('customer-materials-edit-submit'))
      .send({ quote: {}, submit: true });
    expect(rejectedEditSubmit.status).toBe(422);
    expect(rejectedEditSubmit.body.type).toMatch(/quote_materials_terms_conflict$/);
    await db.query(
      `UPDATE grounded_quotes
          SET status = 'submitted', submitted_at = NOW(), updated_at = NOW()
        WHERE id = $1`,
      [legacyDraft.body.quote.id]
    );

    const accepted = await request
      .post(`/api/quotes/${legacyDraft.body.quote.id}/accept`)
      .set(auth(customer))
      .set(key('customer-materials-accept'))
      .send({});
    expect(accepted.status).toBe(409);
    expect(accepted.body.type).toMatch(/quote_materials_terms_conflict$/);
    expect((await db.query('SELECT COUNT(*)::int AS count FROM bookings')).rows[0].count).toBe(0);
  });

  test('legacy requests without materials evidence accept as not recorded and cannot reveal a start PIN', async () => {
    await seedService();
    const customer = await createUser('customer', '1000013');
    const worker = await createUser('labourer', '2000013');
    await optIn(worker);
    const created = await createRequest(customer, 'legacy-materials-request');
    const quote = await createSubmittedQuote(
      worker,
      created.body.quoteRequest.id,
      'legacy-materials-quote'
    );
    await db.query(
      `UPDATE grounded_quote_requests
          SET brief_snapshot = brief_snapshot - 'materialsResponsibility'
        WHERE id = $1`,
      [created.body.quoteRequest.id]
    );

    const accepted = await request
      .post(`/api/quotes/${quote.body.quote.id}/accept`)
      .set(auth(customer))
      .set(key('legacy-materials-accept'))
      .send({});
    expect(accepted.status).toBe(200);
    await db.query(
      `UPDATE bookings SET operational_phase = 'scope_confirmation' WHERE id = $1`,
      [accepted.body.project.id]
    );
    const fulfilment = await request
      .get(`/api/projects/${accepted.body.project.id}/fulfilment`)
      .set(auth(customer));
    expect(fulfilment.status).toBe(200);
    expect(fulfilment.body.fulfilment.scope.current.snapshot.materialsResponsibilityCode)
      .toBe('not_recorded');
    expect(fulfilment.body.fulfilment.allowedActions.revealStartPin).toBe(false);
    const reveal = await request
      .post(`/api/projects/${accepted.body.project.id}/start-pin-reveals`)
      .set(auth(customer))
      .set('If-Match', '0')
      .set(key('legacy-materials-reveal'))
      .send({});
    expect(reveal.status).toBe(409);
    expect(reveal.body.type).toMatch(/start_materials_responsibility_unresolved$/);
  });

  test('successful acceptance replays exactly and rejects the same key with a changed payload', async () => {
    await seedService();
    const customer = await createUser('customer', '1000007');
    const worker = await createUser('labourer', '2000007');
    await optIn(worker);
    const created = await createRequest(customer, 'replay-request-key');
    const quote = await createSubmittedQuote(worker, created.body.quoteRequest.id, 'replay-quote-key');
    const path = `/api/quotes/${quote.body.quote.id}/accept`;
    const first = await request.post(path).set(auth(customer)).set(key('accept-replay-key')).send({});
    const replay = await request.post(path).set(auth(customer)).set(key('accept-replay-key')).send({});
    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(replay.headers['idempotent-replay']).toBe('true');
    expect(replay.body).toEqual(first.body);

    const contradiction = await request
      .post(path)
      .set(auth(customer))
      .set(key('accept-replay-key'))
      .send({ changed: true });
    expect(contradiction.status).toBe(422);
    expect(contradiction.body.type).toMatch(/idempotency_key_reused$/);
    const count = await db.query('SELECT COUNT(*)::int AS count FROM bookings');
    expect(count.rows[0].count).toBe(1);

    const bookingId = first.body.project.id;
    const beforeLegacyAttempts = await db.query(
      `SELECT status, total_amount, lifecycle_revision, current_scope_version,
              scope_confirmed_by_customer, scope_confirmed_by_labourer,
              scope_confirmed_at
         FROM bookings WHERE id = $1`,
      [bookingId]
    );
    const legacyConfirm = await request
      .patch(`/api/bookings/${bookingId}/confirm-scope`)
      .set(auth(customer));
    const legacyStart = await request
      .put(`/api/bookings/${bookingId}/start`)
      .set(auth(worker))
      .send({ start_pin: '123456' });
    const legacyChange = await request
      .post(`/api/bookings/${bookingId}/change-order`)
      .set(auth(worker))
      .send({ description: 'Legacy bypass', extra_amount: 500 });
    const legacyCancel = await request
      .put(`/api/bookings/${bookingId}/cancel`)
      .set(auth(customer));
    const genericLegacyCancel = await request
      .patch(`/api/bookings/${bookingId}/status`)
      .set(auth(customer))
      .send({ status: 'cancelled' });
    for (const response of [legacyConfirm, legacyStart, legacyChange, legacyCancel, genericLegacyCancel]) {
      expect(response.status).toBe(409);
    }
    const afterLegacyAttempts = await db.query(
      `SELECT status, total_amount, lifecycle_revision, current_scope_version,
              scope_confirmed_by_customer, scope_confirmed_by_labourer,
              scope_confirmed_at,
              (SELECT COUNT(*)::int FROM change_orders WHERE booking_id = $1) AS legacy_change_orders
         FROM bookings WHERE id = $1`,
      [bookingId]
    );
    expect(afterLegacyAttempts.rows[0]).toEqual({
      ...beforeLegacyAttempts.rows[0],
      legacy_change_orders: 0,
    });
  });

  test('unapproved or incomplete policy fails before quote, request or booking mutation', async () => {
    await seedService();
    const customer = await createUser('customer', '1000010');
    const worker = await createUser('labourer', '2000010');
    await optIn(worker);
    const created = await createRequest(customer, 'policy-gate-request-key');
    const quote = await createSubmittedQuote(
      worker,
      created.body.quoteRequest.id,
      'policy-gate-quote-key'
    );
    const path = `/api/quotes/${quote.body.quote.id}/accept`;
    const approved = process.env.GROUNDED_FULFILMENT_POLICY_APPROVED;
    const ttl = process.env.GROUNDED_FULFILMENT_START_PIN_TTL_MINUTES;
    let unapproved;
    let incomplete;
    try {
      process.env.GROUNDED_FULFILMENT_POLICY_APPROVED = 'false';
      unapproved = await request
        .post(path)
        .set(auth(customer))
        .set(key('policy-unapproved-key'))
        .send({});
      process.env.GROUNDED_FULFILMENT_POLICY_APPROVED = 'true';
      process.env.GROUNDED_FULFILMENT_START_PIN_TTL_MINUTES = '14';
      incomplete = await request
        .post(path)
        .set(auth(customer))
        .set(key('policy-incomplete-key'))
        .send({});
    } finally {
      process.env.GROUNDED_FULFILMENT_POLICY_APPROVED = approved;
      process.env.GROUNDED_FULFILMENT_START_PIN_TTL_MINUTES = ttl;
    }
    expect(unapproved.status).toBe(503);
    expect(unapproved.body.type).toMatch(/\/errors\/fulfilment_policy_unavailable$/);
    expect(unapproved.body.extensions.reasonCode).toBe('fulfilment_policy_not_approved');
    expect(incomplete.status).toBe(503);
    expect(incomplete.body.extensions).toMatchObject({
      reasonCode: 'fulfilment_policy_configuration_incomplete',
      invalidFields: ['GROUNDED_FULFILMENT_START_PIN_TTL_MINUTES'],
    });
    const state = await db.query(
      `SELECT r.status AS request_status, q.status AS quote_status,
              (SELECT COUNT(*)::int FROM bookings) AS bookings,
              (SELECT COUNT(*)::int FROM grounded_quote_command_receipts
                WHERE command_type = 'accept_quote') AS acceptance_receipts
         FROM grounded_quote_requests r
         JOIN grounded_quotes q ON q.quote_request_id = r.id
        WHERE r.id = $1 AND q.id = $2`,
      [created.body.quoteRequest.id, quote.body.quote.id]
    );
    expect(state.rows[0]).toEqual({
      request_status: 'receiving',
      quote_status: 'submitted',
      bookings: 0,
      acceptance_receipts: 0,
    });
  });

  test('an outsider cannot read or mutate an existing customer request or quote', async () => {
    await seedService();
    const customer = await createUser('customer', '1000008');
    const outsider = await createUser('customer', '1000009');
    const worker = await createUser('labourer', '2000008');
    await optIn(worker);
    const created = await createRequest(customer, 'outsider-request-key');
    const quote = await createSubmittedQuote(worker, created.body.quoteRequest.id, 'outsider-quote-key');

    const requestRead = await request
      .get(`/api/quote-requests/${created.body.quoteRequest.id}`)
      .set(auth(outsider));
    expect(requestRead.status).toBe(404);
    const quoteRead = await request.get(`/api/quotes/${quote.body.quote.id}`).set(auth(outsider));
    expect(quoteRead.status).toBe(404);
    const accept = await request
      .post(`/api/quotes/${quote.body.quote.id}/accept`)
      .set(auth(outsider))
      .set(key('outsider-accept-key'))
      .send({});
    expect(accept.status).toBe(404);
    const count = await db.query('SELECT COUNT(*)::int AS count FROM bookings');
    expect(count.rows[0].count).toBe(0);
  });
});
