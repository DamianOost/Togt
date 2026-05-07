const { request, app, db } = require('./helpers');

afterAll(async () => {
  if (db.end) await db.end();
});

describe('Self-description endpoints (agent discovery)', () => {
  test('GET /.well-known/openapi.json returns valid OpenAPI 3.1 spec', async () => {
    const res = await request(app).get('/.well-known/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');
    expect(res.body.info.title).toBe('Togt API');
    expect(res.body.paths['/api/match'].post.operationId).toBe('create_match_request');
    expect(res.body.components.schemas.Problem).toBeDefined();
    expect(res.body['x-error-types']).toBeDefined();
    expect(Array.isArray(res.body['x-error-types'])).toBe(true);
  });

  test('GET /openapi.json (alias) returns the same spec', async () => {
    const a = await request(app).get('/.well-known/openapi.json');
    const b = await request(app).get('/openapi.json');
    expect(b.status).toBe(200);
    expect(b.body.openapi).toBe(a.body.openapi);
    expect(Object.keys(b.body.paths)).toEqual(Object.keys(a.body.paths));
  });

  test('GET /.well-known/agents.json advertises available interfaces', async () => {
    const res = await request(app).get('/.well-known/agents.json');
    expect(res.status).toBe(200);
    expect(res.body.schema_version).toBeDefined();
    expect(res.body.interfaces.find((i) => i.type === 'rest+openapi')).toBeDefined();
    expect(res.body.capabilities.error_format).toBe('rfc-9457');
    expect(res.body.capabilities.idempotency).toBe(true);
  });

  test('OpenAPI spec lists every error type from x-error-types and references Problem schema', async () => {
    const res = await request(app).get('/.well-known/openapi.json');
    const types = res.body['x-error-types'].map((e) => e.type);
    expect(types).toContain('idempotency_key_reused');
    expect(types).toContain('id_invalid_checksum');
    expect(types).toContain('already_matched');
    expect(types).toContain('refresh_token_reuse');
  });

  test('OpenAPI spec lists every webhook subscription endpoint and the WebhookEventEnvelope schema', async () => {
    const res = await request(app).get('/.well-known/openapi.json');
    expect(res.body.paths['/api/webhook-subscriptions']).toBeDefined();
    expect(res.body.paths['/api/webhook-subscriptions/{id}']).toBeDefined();
    expect(res.body.paths['/api/webhook-subscriptions/{id}/rotate-secret']).toBeDefined();
    expect(res.body.paths['/api/webhook-subscriptions/{id}/deliveries']).toBeDefined();
    expect(res.body.paths['/api/webhook-subscriptions/{id}/deliveries/{deliveryId}/replay']).toBeDefined();
    expect(res.body.components.schemas.WebhookEventEnvelope).toBeDefined();
    expect(res.body.components.schemas.WebhookSubscription).toBeDefined();
    expect(res.body.components.schemas.WebhookDelivery).toBeDefined();
    const types = res.body['x-error-types'].map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining([
      'webhook-not-found',
      'webhook-delivery-not-replayable',
      'unknown-event-type',
      'invalid-event-types',
      'invalid-webhook-url',
    ]));
  });

  test('agents.json declares the webhooks block + flips capabilities.webhooks=true', async () => {
    const res = await request(app).get('/.well-known/agents.json');
    expect(res.body.capabilities.webhooks).toBe(true);
    expect(res.body.webhooks).toBeDefined();
    expect(res.body.webhooks.signature_header).toBe('X-Togt-Signature');
    expect(res.body.webhooks.retry_policy.schedule_seconds).toEqual([30, 120, 600, 3600]);
    expect(res.body.webhooks.retry_policy.dead_after_seconds).toBe(86400);
    expect(res.body.webhooks.rotation_supported).toBe(true);
    expect(res.body.webhooks.grace_window_hours).toBe(24);
    expect(res.body.webhooks.event_types).toEqual(expect.arrayContaining([
      'booking.created', 'booking.completed', 'payment.succeeded', 'match_request.matched',
    ]));
  });
});
