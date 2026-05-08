/**
 * Tests for maintenanceSweepers — the periodic cleanup of expired
 * idempotency_keys and refresh_tokens rows. These tables otherwise grow
 * unbounded.
 */

const { db, truncateAll, registerUser } = require('./helpers');
const sweepers = require('../src/services/maintenanceSweepers');

beforeEach(async () => {
  await truncateAll();
  await db.query('DELETE FROM idempotency_keys');
  await db.query('DELETE FROM refresh_tokens');
});

afterAll(async () => {
  if (db.end) await db.end();
});

describe('sweepIdempotencyKeys', () => {
  test('deletes rows older than 24h, keeps fresh ones', async () => {
    const u = await registerUser({ role: 'customer' });
    // 25h-old row — should be deleted
    await db.query(
      `INSERT INTO idempotency_keys (key, user_id, method, path, request_hash, response_status, response_body, created_at)
       VALUES ('old-key', $1, 'POST', '/api/match', 'h1', 200, '{}'::jsonb, NOW() - INTERVAL '25 hours')`,
      [u.user.id]
    );
    // 1h-old row — should stay
    await db.query(
      `INSERT INTO idempotency_keys (key, user_id, method, path, request_hash, response_status, response_body, created_at)
       VALUES ('fresh-key', $1, 'POST', '/api/match', 'h2', 200, '{}'::jsonb, NOW() - INTERVAL '1 hour')`,
      [u.user.id]
    );
    const deleted = await sweepers.sweepIdempotencyKeys();
    expect(deleted).toBe(1);
    const { rows } = await db.query(`SELECT key FROM idempotency_keys ORDER BY key`);
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe('fresh-key');
  });

  test('returns 0 when nothing to delete', async () => {
    const deleted = await sweepers.sweepIdempotencyKeys();
    expect(deleted).toBe(0);
  });
});

describe('sweepRefreshTokens', () => {
  test('deletes rows expired > 7 days ago, keeps recent and live tokens', async () => {
    const u = await registerUser({ role: 'customer' });
    // expires 8d ago — past 7d grace, delete
    await db.query(
      `INSERT INTO refresh_tokens (jti, user_id, expires_at)
       VALUES (gen_random_uuid(), $1, NOW() - INTERVAL '8 days')`,
      [u.user.id]
    );
    // expires 1d ago — within 7d grace, keep
    await db.query(
      `INSERT INTO refresh_tokens (jti, user_id, expires_at)
       VALUES (gen_random_uuid(), $1, NOW() - INTERVAL '1 day')`,
      [u.user.id]
    );
    // expires in future — definitely keep
    await db.query(
      `INSERT INTO refresh_tokens (jti, user_id, expires_at)
       VALUES (gen_random_uuid(), $1, NOW() + INTERVAL '7 days')`,
      [u.user.id]
    );
    // registerUser already inserted one fresh token, so + 3 we manually add = 4
    const before = await db.query(`SELECT COUNT(*)::int AS n FROM refresh_tokens WHERE user_id = $1`, [u.user.id]);
    expect(before.rows[0].n).toBe(4);

    const deleted = await sweepers.sweepRefreshTokens();
    expect(deleted).toBe(1);

    const after = await db.query(`SELECT COUNT(*)::int AS n FROM refresh_tokens WHERE user_id = $1`, [u.user.id]);
    expect(after.rows[0].n).toBe(3);
  });
});

describe('tick', () => {
  test('sweeps both tables and updates stats', async () => {
    const u = await registerUser({ role: 'customer' });
    await db.query(
      `INSERT INTO idempotency_keys (key, user_id, method, path, request_hash, response_status, response_body, created_at)
       VALUES ('stale', $1, 'POST', '/api/match', 'h', 200, '{}'::jsonb, NOW() - INTERVAL '48 hours')`,
      [u.user.id]
    );
    await db.query(
      `INSERT INTO refresh_tokens (jti, user_id, expires_at)
       VALUES (gen_random_uuid(), $1, NOW() - INTERVAL '10 days')`,
      [u.user.id]
    );

    const before = { ...sweepers.stats };
    await sweepers.tick();

    expect(sweepers.stats.ticks_total).toBe(before.ticks_total + 1);
    expect(sweepers.stats.idempotency_deleted_total).toBeGreaterThanOrEqual(before.idempotency_deleted_total + 1);
    expect(sweepers.stats.refresh_tokens_deleted_total).toBeGreaterThanOrEqual(before.refresh_tokens_deleted_total + 1);
    expect(sweepers.stats.last_tick_at).not.toBeNull();
  });
});
