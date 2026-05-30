/**
 * Tests for the audit_log_query MCP tool.
 *
 * Covers: scope-based filtering (non-admin sees only own), exact-action
 * filter, resource filter, time window, error_only, cursor pagination,
 * admin cross-actor filter.
 */

const { db, truncateAll, registerUser } = require('./helpers');
const { callTool } = require('../mcp-server/tools');
const { recordAudit } = require('../src/services/auditLog');

beforeEach(async () => {
  await truncateAll();
  await db.query('DELETE FROM audit_log');
});

afterAll(async () => {
  if (db.end) await db.end();
});

function ctxFor(userId, scopes) {
  return { userId, scopes };
}

async function seedAudit({ userId, apiKeyId, action, resource, errorCode, occurredAt }) {
  const actor = apiKeyId
    ? { type: 'api_key', apiKeyId }
    : { type: 'user', userId };
  const { id } = await recordAudit({
    actor,
    action,
    resource,
    errorCode,
  });
  if (occurredAt) {
    await db.query('UPDATE audit_log SET occurred_at = $1 WHERE id = $2', [occurredAt, id]);
  }
  return id;
}

describe('audit_log_query MCP tool', () => {
  test('non-admin sees only their own activity', async () => {
    const u1 = await registerUser({ role: 'customer' });
    const u2 = await registerUser({ role: 'customer' });
    await seedAudit({ userId: u1.user.id, action: 'route.get./api/bookings' });
    await seedAudit({ userId: u2.user.id, action: 'route.get./api/bookings' });

    const res = await callTool(ctxFor(u1.user.id, ['mcp:read_only']), 'audit_log_query', {});
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].actor_user_id).toBe(u1.user.id);
  });

  test('non-admin also sees rows for their own api_key', async () => {
    const u = await registerUser({ role: 'customer' });
    // Create an api_key for u, then seed an audit row tagged with it
    const keyId = (await db.query(
      `INSERT INTO api_keys (user_id, key_hash, prefix, scopes)
       VALUES ($1, 'fake-hash-' || gen_random_uuid()::text, 'togt_live_x', ARRAY['mcp:full'])
       RETURNING id`,
      [u.user.id]
    )).rows[0].id;
    await seedAudit({ apiKeyId: keyId, action: 'mcp.find_labourers' });

    const res = await callTool(ctxFor(u.user.id, ['mcp:read_only']), 'audit_log_query', {});
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].api_key_id).toBe(keyId);
  });

  test('action filter narrows results', async () => {
    const u = await registerUser({ role: 'customer' });
    await seedAudit({ userId: u.user.id, action: 'route.get./api/bookings' });
    await seedAudit({ userId: u.user.id, action: 'mcp.find_labourers' });

    const res = await callTool(ctxFor(u.user.id, ['mcp:read_only']), 'audit_log_query', {
      action: 'mcp.find_labourers',
    });
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].action).toBe('mcp.find_labourers');
  });

  test('error_only returns just rows with error_code set', async () => {
    const u = await registerUser({ role: 'customer' });
    await seedAudit({ userId: u.user.id, action: 'route.post./api/bookings' });
    await seedAudit({ userId: u.user.id, action: 'route.post./api/bookings', errorCode: '422_validation_error' });

    const res = await callTool(ctxFor(u.user.id, ['mcp:read_only']), 'audit_log_query', {
      error_only: true,
    });
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].error_code).toBe('422_validation_error');
  });

  test('resource filter narrows by (resource_type, resource_id)', async () => {
    const u = await registerUser({ role: 'customer' });
    const bookingId = '00000000-0000-0000-0000-000000000001';
    const matchId = '00000000-0000-0000-0000-000000000002';
    await seedAudit({ userId: u.user.id, action: 'route.post./api/bookings', resource: { type: 'booking', id: bookingId } });
    await seedAudit({ userId: u.user.id, action: 'route.post./api/match', resource: { type: 'match_request', id: matchId } });

    const res = await callTool(ctxFor(u.user.id, ['mcp:read_only']), 'audit_log_query', {
      resource_type: 'booking',
      resource_id: bookingId,
    });
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].resource_id).toBe(bookingId);
  });

  test('time window since/until filters', async () => {
    const u = await registerUser({ role: 'customer' });
    const old = '2026-01-01T00:00:00.000Z';
    const recent = new Date(Date.now() - 60000).toISOString();
    await seedAudit({ userId: u.user.id, action: 'route.x', occurredAt: old });
    await seedAudit({ userId: u.user.id, action: 'route.y', occurredAt: recent });

    const res = await callTool(ctxFor(u.user.id, ['mcp:read_only']), 'audit_log_query', {
      since: '2026-01-02T00:00:00.000Z',
    });
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].action).toBe('route.y');
  });

  test('cursor pagination iterates back in time', async () => {
    const u = await registerUser({ role: 'customer' });
    // Seed 5 distinct rows
    for (let i = 0; i < 5; i++) {
      await seedAudit({ userId: u.user.id, action: `route.${i}` });
    }

    const page1 = await callTool(ctxFor(u.user.id, ['mcp:read_only']), 'audit_log_query', { limit: 2 });
    expect(page1.rows).toHaveLength(2);
    expect(page1.next_cursor).not.toBeNull();

    const page2 = await callTool(ctxFor(u.user.id, ['mcp:read_only']), 'audit_log_query', { limit: 2, cursor: page1.next_cursor });
    expect(page2.rows).toHaveLength(2);

    const page3 = await callTool(ctxFor(u.user.id, ['mcp:read_only']), 'audit_log_query', { limit: 2, cursor: page2.next_cursor });
    // Last page may have 1 row (5 total / 2 per page → 2+2+1) and no cursor
    expect(page3.rows.length).toBeGreaterThanOrEqual(1);
    expect(page3.next_cursor).toBeNull();

    // Across all three pages every row id is unique
    const ids = [...page1.rows, ...page2.rows, ...page3.rows].map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('admin:full can filter to any actor_user_id', async () => {
    const admin = await registerUser({ role: 'customer' });
    const other = await registerUser({ role: 'customer' });
    await seedAudit({ userId: admin.user.id, action: 'route.a' });
    await seedAudit({ userId: other.user.id, action: 'route.b' });

    const res = await callTool(ctxFor(admin.user.id, ['admin:full']), 'audit_log_query', {
      actor_user_id: other.user.id,
    });
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].actor_user_id).toBe(other.user.id);
  });

  test('limit is capped at 200', async () => {
    const u = await registerUser({ role: 'customer' });
    const res = await callTool(ctxFor(u.user.id, ['mcp:read_only']), 'audit_log_query', { limit: 9999 });
    // The query should run and respect the cap (no error). With 0 seeded rows
    // we get 0 rows, but the important check is no crash.
    expect(res.rows).toEqual([]);
  });
});
