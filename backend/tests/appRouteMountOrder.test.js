const { request, app, db } = require('./helpers');

const SERVICE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

beforeEach(async () => {
  await db.query('TRUNCATE TABLE users, service_catalogue_versions RESTART IDENTITY CASCADE');
  await db.query(
    `INSERT INTO service_catalogue_versions (
       service_id, service_version, canonical_key, category_key,
       label_en_za, description_en_za, pricing_mode, fulfilment_mode,
       risk_tier, required_question_ids, brief_schema, pricing_rules,
       materials_rules, change_order_rules, cancellation_policy_version,
       worker_eligibility, is_published, published_at
     ) VALUES (
       $1, 1, 'mount_order_quote', 'home_repairs',
       'Mount order repair', 'Synthetic public catalogue route regression fixture.',
       'remote_quote', 'receive_quotes', 'standard', '{}',
       '{"questions":[]}'::jsonb, '{"finalPrice":"accepted_quote_only"}'::jsonb,
       '{}'::jsonb, '{}'::jsonb, 'mount-order-test-v1', '{}'::jsonb,
       true, NOW()
     )`,
    [SERVICE_ID]
  );
});

afterAll(async () => {
  await db.end();
});

describe('full application route mount order', () => {
  test('keeps the public catalogue reachable without weakening Trust authentication', async () => {
    const list = await request(app).get('/api/catalogue/services');
    expect(list.status).toBe(200);
    expect(list.body.services).toEqual([
      expect.objectContaining({ id: SERVICE_ID, canonicalKey: 'mount_order_quote' }),
    ]);

    const detail = await request(app).get(`/api/catalogue/services/${SERVICE_ID}?version=1`);
    expect(detail.status).toBe(200);
    expect(detail.body.service).toMatchObject({ id: SERVICE_ID, version: 1 });

    const protectedTrustRoute = await request(app).get('/api/trust/fairness');
    expect(protectedTrustRoute.status).toBe(401);
  });
});
