jest.mock('../src/config/capabilities', () => {
  const actual = jest.requireActual('../src/config/capabilities');
  return {
    ...actual,
    FEATURES: {
      ...actual.FEATURES,
      identity_verification: {
        ...actual.FEATURES.identity_verification,
        available: true,
      },
    },
  };
});

const { request, app, db, truncateAll, registerUser, authHeader } = require('./helpers');

// Valid SA ID fixtures (structurally valid, pass Luhn checksum)
const VALID_ADULT_ID = '9001049818080';      // 1990-01-04 male citizen
const UNDERAGE_ID = '1003155000089';         // 2010-03-15 male citizen (~16 in 2026)

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  if (db.end) await db.end();
});

describe('POST /api/kyc/verify-id (POC structural validation)', () => {
  test('valid adult SA ID -> pending only, with no verified identity claim', async () => {
    const u = await registerUser({ role: 'labourer' });
    const res = await request(app)
      .post('/api/kyc/verify-id')
      .set(authHeader(u.accessToken))
      .send({ idNumber: VALID_ADULT_ID, firstName: 'Test', lastName: 'Labourer' });

    expect(res.status).toBe(202);
    expect(res.body.verified).toBe(false);
    expect(res.body.status).toBe('pending_review');
    expect(res.body.assurance).toBe('structural_only');
    expect(res.body.name).toBeUndefined();
    expect(res.body.id_last4).toBe('8080');
    expect(res.body.dob).toBeUndefined();
    expect(res.body.parsed_is_citizen).toBeUndefined();

    const userRow = await db.query('SELECT kyc_status FROM users WHERE id = $1', [u.user.id]);
    expect(userRow.rows[0].kyc_status).toBe('pending');

    const kycRow = await db.query(
      `SELECT id_number, status, provider, verified_name, parsed_dob, parsed_sex,
              parsed_is_citizen, id_last4, id_blind_index, raw_input_discarded_at
         FROM kyc_verifications WHERE user_id = $1`,
      [u.user.id]
    );
    expect(kycRow.rows).toHaveLength(1);
    expect(kycRow.rows[0].status).toBe('pending');
    expect(kycRow.rows[0].provider).toBe('poc_structural');
    expect(kycRow.rows[0].verified_name).toBeNull();
    expect(kycRow.rows[0].id_number).toBeNull();
    expect(kycRow.rows[0].parsed_dob).toBeNull();
    expect(kycRow.rows[0].parsed_sex).toBeNull();
    expect(kycRow.rows[0].parsed_is_citizen).toBeNull();
    expect(kycRow.rows[0].id_last4).toBe('8080');
    expect(kycRow.rows[0].id_blind_index).toMatch(/^[a-f0-9]{64}$/);
    expect(kycRow.rows[0].raw_input_discarded_at).toBeTruthy();
  });

  test('invalid checksum -> 400 id_invalid_checksum, kyc_status set to failed', async () => {
    const u = await registerUser({ role: 'customer' });
    const res = await request(app)
      .post('/api/kyc/verify-id')
      .set(authHeader(u.accessToken))
      .send({ idNumber: '9001049818081', firstName: 'Test', lastName: 'User' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('id_invalid_checksum');

    const userRow = await db.query('SELECT kyc_status FROM users WHERE id = $1', [u.user.id]);
    expect(userRow.rows[0].kyc_status).toBe('failed');
  });

  test('wrong length -> 400 id_invalid_format', async () => {
    const u = await registerUser({ role: 'customer' });
    const res = await request(app)
      .post('/api/kyc/verify-id')
      .set(authHeader(u.accessToken))
      .send({ idNumber: '12345', firstName: 'T', lastName: 'U' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('id_invalid_format');
  });

  test('underage -> 400 id_underage', async () => {
    const u = await registerUser({ role: 'customer' });
    const res = await request(app)
      .post('/api/kyc/verify-id')
      .set(authHeader(u.accessToken))
      .send({ idNumber: UNDERAGE_ID, firstName: 'Young', lastName: 'User' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('id_underage');
  });

  test('missing fields -> 400', async () => {
    const u = await registerUser({ role: 'customer' });
    const res = await request(app)
      .post('/api/kyc/verify-id')
      .set(authHeader(u.accessToken))
      .send({ idNumber: VALID_ADULT_ID });
    expect(res.status).toBe(400);
  });

  test('unauthenticated -> 401', async () => {
    const res = await request(app)
      .post('/api/kyc/verify-id')
      .send({ idNumber: VALID_ADULT_ID, firstName: 'T', lastName: 'U' });
    expect(res.status).toBe(401);
  });

  test('idempotent: verifying twice updates same row, not a new one', async () => {
    const u = await registerUser({ role: 'customer' });
    await request(app)
      .post('/api/kyc/verify-id')
      .set(authHeader(u.accessToken))
      .send({ idNumber: VALID_ADULT_ID, firstName: 'First', lastName: 'Try' });

    await request(app)
      .post('/api/kyc/verify-id')
      .set(authHeader(u.accessToken))
      .send({ idNumber: VALID_ADULT_ID, firstName: 'Second', lastName: 'Try' });

    const rows = await db.query('SELECT verified_name, id_last4 FROM kyc_verifications WHERE user_id = $1', [u.user.id]);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].verified_name).toBeNull();
    expect(rows.rows[0].id_last4).toBe('8080');
  });
});

describe('GET /api/kyc/status', () => {
  test('before any verify: returns unverified', async () => {
    const u = await registerUser({ role: 'customer' });
    const res = await request(app).get('/api/kyc/status').set(authHeader(u.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.kyc_status).toBe('unverified');
    expect(res.body.verification).toBeNull();
  });

  test('after structural validation: remains pending', async () => {
    const u = await registerUser({ role: 'customer' });
    await request(app)
      .post('/api/kyc/verify-id')
      .set(authHeader(u.accessToken))
      .send({ idNumber: VALID_ADULT_ID, firstName: 'Test', lastName: 'User' });

    const res = await request(app).get('/api/kyc/status').set(authHeader(u.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.kyc_status).toBe('pending');
    expect(res.body.verification).toBeDefined();
    expect(res.body.verification.status).toBe('pending');
    expect(res.body.verification.id_last4).toBe('8080');
    expect(res.body.verification.id_number).toBeUndefined();
  });
});

describe('POST /api/kyc/selfie-enroll', () => {
  test('fails closed instead of minting a selfie success claim', async () => {
    const u = await registerUser({ role: 'customer' });
    await request(app)
      .post('/api/kyc/verify-id')
      .set(authHeader(u.accessToken))
      .send({ idNumber: VALID_ADULT_ID, firstName: 'Test', lastName: 'User' });

    const res = await request(app)
      .post('/api/kyc/selfie-enroll')
      .set(authHeader(u.accessToken))
      .send({ selfieBase64: 'iVBORw0KGgoA...' });
    expect(res.status).toBe(503);
    expect(res.body.enrolled).toBe(false);
    expect(res.body.error).toBe('capability_unavailable');
  });
});
