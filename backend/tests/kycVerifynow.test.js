// Mock the verifynow module BEFORE the app under test loads it.
jest.mock('../src/services/verifynow', () => {
  const mockVerifyId = jest.fn();
  return {
    isConfigured: () => true,
    verifyId: (...args) => mockVerifyId(...args),
    __mockVerifyId: mockVerifyId,
  };
});

const { request, app, db, truncateAll, registerUser, authHeader } = require('./helpers');
const verifynow = require('../src/services/verifynow');
const mockVerifyId = verifynow.__mockVerifyId;

const VALID_ADULT_ID = '9001049818080';

beforeEach(async () => {
  await truncateAll();
  mockVerifyId.mockReset();
});

afterAll(async () => {
  if (db.end) await db.end();
});

describe('POST /api/kyc/verify-id with VerifyNow configured', () => {
  test('VerifyNow says verified -> provider=verifynow, HANIS name used, vendor metadata returned', async () => {
    mockVerifyId.mockResolvedValueOnce({
      verified: true,
      name: 'Thabo James',
      surname: 'Mokoena',
      smart_card: true,
      on_hanis: true,
      on_npr: true,
      dead_indicator: false,
      blocked: false,
      marital_status: 'SINGLE',
      vendor_request_id: 'req-abc',
      mode: 'sandbox',
      raw: {},
    });

    const u = await registerUser({ role: 'labourer' });
    const res = await request(app)
      .post('/api/kyc/verify-id')
      .set(authHeader(u.accessToken))
      .send({ idNumber: VALID_ADULT_ID, firstName: 'Test', lastName: 'Labourer' });

    expect(res.status).toBe(200);
    expect(res.body.verified).toBe(true);
    expect(res.body.provider).toBe('verifynow');
    expect(res.body.poc_mode).toBe(false);
    expect(res.body.name).toBe('Thabo James Mokoena');
    expect(res.body.vendor.request_id).toBe('req-abc');
    expect(res.body.vendor.on_npr).toBe(true);
    expect(res.body.vendor.smart_card).toBe(true);

    const kyc = await db.query(
      'SELECT provider, verified_name, status FROM kyc_verifications WHERE user_id = $1',
      [u.user.id]
    );
    expect(kyc.rows[0].provider).toBe('verifynow');
    expect(kyc.rows[0].verified_name).toBe('Thabo James Mokoena');
    expect(kyc.rows[0].status).toBe('verified');

    expect(mockVerifyId).toHaveBeenCalledTimes(1);
    expect(mockVerifyId.mock.calls[0][0]).toMatchObject({
      idNumber: VALID_ADULT_ID,
      firstName: 'Test',
      lastName: 'Labourer',
    });
  });

  test('VerifyNow says NOT verified (ID not in NPR) -> 400, status=failed, provider=verifynow', async () => {
    mockVerifyId.mockResolvedValueOnce({ verified: false, raw: { Error: '1234' } });

    const u = await registerUser({ role: 'labourer' });
    const res = await request(app)
      .post('/api/kyc/verify-id')
      .set(authHeader(u.accessToken))
      .send({ idNumber: VALID_ADULT_ID, firstName: 'Fake', lastName: 'Person' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('id_not_in_npr');

    const kyc = await db.query(
      'SELECT provider, status FROM kyc_verifications WHERE user_id = $1',
      [u.user.id]
    );
    expect(kyc.rows[0].provider).toBe('verifynow');
    expect(kyc.rows[0].status).toBe('failed');

    const userRow = await db.query('SELECT kyc_status FROM users WHERE id = $1', [u.user.id]);
    expect(userRow.rows[0].kyc_status).toBe('failed');
  });

  test('VerifyNow throws (network/timeout) -> falls back to structural-only, provider=poc_structural', async () => {
    mockVerifyId.mockRejectedValueOnce(new Error('ECONNRESET'));

    const u = await registerUser({ role: 'labourer' });
    const res = await request(app)
      .post('/api/kyc/verify-id')
      .set(authHeader(u.accessToken))
      .send({ idNumber: VALID_ADULT_ID, firstName: 'Test', lastName: 'Labourer' });

    expect(res.status).toBe(200);
    expect(res.body.verified).toBe(true);
    expect(res.body.provider).toBe('poc_structural');
    expect(res.body.poc_mode).toBe(true);
    expect(res.body.name).toBe('Test Labourer');

    const kyc = await db.query(
      'SELECT provider FROM kyc_verifications WHERE user_id = $1',
      [u.user.id]
    );
    expect(kyc.rows[0].provider).toBe('poc_structural');
  });

  test('Structural fail short-circuits before VerifyNow is called (saves a credit)', async () => {
    const u = await registerUser({ role: 'labourer' });
    const res = await request(app)
      .post('/api/kyc/verify-id')
      .set(authHeader(u.accessToken))
      .send({ idNumber: '9001049818081', firstName: 'Test', lastName: 'Labourer' }); // bad checksum

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('id_invalid_checksum');
    expect(mockVerifyId).not.toHaveBeenCalled();
  });
});
