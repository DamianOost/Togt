const { request, app, db, truncateAll, registerUser, authHeader } = require('./helpers');
const { generateKey, hashKey, keyPrefix, createKey, lookupKey, revokeKey } = require('../src/lib/apiKey');

beforeEach(async () => {
  await truncateAll();
  await db.query('DELETE FROM api_keys');
});

afterAll(async () => {
  if (db.end) await db.end();
});

describe('apiKey lib', () => {
  test('generateKey produces a togt_live_ prefixed key with 32 trailing chars', () => {
    const k = generateKey();
    expect(k.startsWith('togt_live_')).toBe(true);
    expect(k.length).toBe(10 + 32);
  });

  test('hashKey is deterministic + different keys hash differently', () => {
    const a = 'togt_live_abcdef';
    expect(hashKey(a)).toBe(hashKey(a));
    expect(hashKey(a)).not.toBe(hashKey('togt_live_xyzabc'));
    expect(hashKey(a)).toMatch(/^[a-f0-9]{64}$/);
  });

  test('createKey + lookupKey round-trip', async () => {
    const u = await registerUser({ role: 'customer' });
    const created = await createKey({ userId: u.user.id, scopes: ['mcp:full'], description: 'unit test' });
    expect(created.key.startsWith('togt_live_')).toBe(true);
    expect(created.scopes).toEqual(['mcp:full']);

    const found = await lookupKey(created.key);
    expect(found).not.toBeNull();
    expect(found.user_id).toBe(u.user.id);
    expect(found.scopes).toEqual(['mcp:full']);
  });

  test('revoked keys do not look up', async () => {
    const u = await registerUser({ role: 'customer' });
    const created = await createKey({ userId: u.user.id, scopes: ['mcp:read_only'] });
    expect(await lookupKey(created.key)).not.toBeNull();
    await revokeKey(created.id, u.user.id);
    expect(await lookupKey(created.key)).toBeNull();
  });

  test('lookupKey rejects non-prefixed keys', async () => {
    expect(await lookupKey('not-a-togt-key')).toBeNull();
    expect(await lookupKey('Bearer xyz')).toBeNull();
  });
});

describe('POST /api/api-keys (mint)', () => {
  test('mints a new key with valid scopes', async () => {
    const u = await registerUser({ role: 'customer' });
    const res = await request(app).post('/api/api-keys')
      .set(authHeader(u.accessToken))
      .send({ scopes: ['mcp:full'], description: 'test' });
    expect(res.status).toBe(201);
    expect(res.body.key.startsWith('togt_live_')).toBe(true);
    expect(res.body.warning).toMatch(/will not be shown again/);
    expect(res.body.scopes).toEqual(['mcp:full']);
  });

  test('rejects empty scopes', async () => {
    const u = await registerUser({ role: 'customer' });
    const res = await request(app).post('/api/api-keys')
      .set(authHeader(u.accessToken))
      .send({ scopes: [] });
    expect(res.status).toBe(400);
    expect(res.body.type).toContain('/errors/api_key_scopes_required');
  });

  test('rejects unknown scopes with detail', async () => {
    const u = await registerUser({ role: 'customer' });
    const res = await request(app).post('/api/api-keys')
      .set(authHeader(u.accessToken))
      .send({ scopes: ['mcp:full', 'foo:bar'] });
    expect(res.status).toBe(400);
    expect(res.body.type).toContain('/errors/api_key_invalid_scope');
    expect(res.body.extensions.invalid_scopes).toEqual(['foo:bar']);
  });

  test('GET /api/api-keys lists user keys (NEVER returns the raw key)', async () => {
    const u = await registerUser({ role: 'customer' });
    await request(app).post('/api/api-keys').set(authHeader(u.accessToken))
      .send({ scopes: ['mcp:read_only'], description: 'k1' });

    const list = await request(app).get('/api/api-keys').set(authHeader(u.accessToken));
    expect(list.status).toBe(200);
    expect(list.body.keys).toHaveLength(1);
    expect(list.body.keys[0].prefix).toMatch(/^togt_live_/);
    expect(list.body.keys[0].key).toBeUndefined();
  });

  test('DELETE /api/api-keys/:id revokes', async () => {
    const u = await registerUser({ role: 'customer' });
    const minted = await request(app).post('/api/api-keys').set(authHeader(u.accessToken))
      .send({ scopes: ['mcp:full'] });
    const keyId = minted.body.id;

    const del = await request(app).delete(`/api/api-keys/${keyId}`).set(authHeader(u.accessToken));
    expect(del.status).toBe(200);

    // Repeat delete returns 404
    const del2 = await request(app).delete(`/api/api-keys/${keyId}`).set(authHeader(u.accessToken));
    expect(del2.status).toBe(404);
  });
});

describe('apiKeyMiddleware (gates /mcp)', () => {
  test('no Bearer token -> 401 api_key_required', async () => {
    const res = await request(app).get('/mcp/');
    // /mcp accepts GET without auth (info endpoint), so test POST instead
    const res2 = await request(app).post('/mcp').send({ jsonrpc: '2.0', method: 'initialize' });
    expect(res2.status).toBe(401);
    expect(res2.body.type).toContain('/errors/api_key_required');
  });

  test('invalid token -> 401 api_key_invalid', async () => {
    const res = await request(app).post('/mcp')
      .set('Authorization', 'Bearer togt_live_notarealkey00000000000000000000')
      .send({ jsonrpc: '2.0', method: 'initialize' });
    expect(res.status).toBe(401);
    expect(res.body.type).toContain('/errors/api_key_invalid');
  });
});
