/**
 * MCP HTTP transport smoke — boundary checks only.
 *
 * The full JSON-RPC envelope contracts are unit-tested elsewhere. This
 * smoke proves the route is wired into the Express stack with the right
 * auth gate. Deep payload assertions over StreamableHTTPServerTransport
 * (SSE-style frames) are deferred to a follow-up smoke once the transport
 * adapter is settled.
 */

const { app, request, db, truncateAll, closeDb, registerUser, mintApiKey } = require('./harness');

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeDb();
});

test('POST /mcp requires authentication (401 without bearer)', async () => {
  const res = await request(app)
    .post('/mcp')
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json, text/event-stream')
    .send({ jsonrpc: '2.0', method: 'tools/list', params: {}, id: 1 });
  expect(res.status).toBe(401);
});

test('POST /mcp rejects unknown bearer (401)', async () => {
  const res = await request(app)
    .post('/mcp')
    .set('Authorization', 'Bearer togt_live_obviously_not_a_real_key_abcdef0123')
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json, text/event-stream')
    .send({ jsonrpc: '2.0', method: 'tools/list', params: {}, id: 1 });
  expect(res.status).toBe(401);
});

test('GET /mcp returns a self-description JSON', async () => {
  // The convenience endpoint that tells callers how to use /mcp.
  const res = await request(app)
    .get('/mcp');
  expect(res.status).toBe(200);
  expect(res.body.name).toMatch(/togt/i);
  expect(res.body.transport).toBe('streamable-http');
  expect(res.body.auth).toMatch(/^Authorization/);
});

test('POST /mcp with a valid scoped key reaches the MCP handler (status 200 or 202)', async () => {
  // The transport may return 200 with a body, or 202 + SSE chunks
  // depending on the @modelcontextprotocol/sdk version. Both indicate
  // the request was accepted; deeper payload parsing is left to follow-up.
  const u = await registerUser({ role: 'customer' });
  const key = await mintApiKey(u.user.id, ['mcp:read_only']);
  const res = await request(app)
    .post('/mcp')
    .set('Authorization', `Bearer ${key.value}`)
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json, text/event-stream')
    .send({ jsonrpc: '2.0', method: 'tools/list', params: {}, id: 1 });
  expect([200, 202]).toContain(res.status);
});
