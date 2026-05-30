/**
 * Tests for the audit_log service + middleware.
 *
 * recordAudit() is exercised against the real togt_test DB so we cover
 * the actual schema CHECK constraints. The middleware's pure helpers
 * (buildActionKey, resolveActor) are tested in isolation.
 */

const { db, truncateAll, registerUser } = require('./helpers');
const { recordAudit, recordAuditFireAndForget, ACTOR_TYPES } = require('../src/services/auditLog');
const { buildActionKey, resolveActor } = require('../src/middleware/auditLog');

beforeEach(async () => {
  await truncateAll();
  await db.query('DELETE FROM audit_log');
});

afterAll(async () => {
  if (db.end) await db.end();
});

describe('recordAudit', () => {
  test('rejects unknown actor.type', async () => {
    await expect(recordAudit({
      actor: { type: 'invalid' },
      action: 'route.test',
    })).rejects.toThrow(/actor.type must be one of/);
  });

  test('rejects actor.type=user without actor.userId', async () => {
    await expect(recordAudit({
      actor: { type: 'user' },
      action: 'route.test',
    })).rejects.toThrow(/actor.type=user requires actor.userId/);
  });

  test('rejects actor.type=api_key without actor.apiKeyId', async () => {
    await expect(recordAudit({
      actor: { type: 'api_key' },
      action: 'route.test',
    })).rejects.toThrow(/actor.type=api_key requires actor.apiKeyId/);
  });

  test('rejects missing action', async () => {
    await expect(recordAudit({
      actor: { type: 'system' },
      action: null,
    })).rejects.toThrow(/action is required/);
  });

  test('inserts a user-actor row with all fields populated', async () => {
    const u = await registerUser({ role: 'customer' });
    const result = await recordAudit({
      actor: { type: 'user', userId: u.user.id },
      action: 'route.post./api/bookings',
      resource: { type: 'booking', id: '00000000-0000-0000-0000-000000000aaa' },
      requestId: '00000000-0000-0000-0000-000000000bbb',
      ip: '127.0.0.1',
      statusCode: 201,
      latencyMs: 42,
      metadata: { key: 'value' },
    });
    expect(result.id).toMatch(/^[0-9a-f-]{36}$/);

    const { rows } = await db.query(`SELECT * FROM audit_log WHERE id = $1`, [result.id]);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.actor_type).toBe('user');
    expect(row.actor_user_id).toBe(u.user.id);
    expect(row.api_key_id).toBeNull();
    expect(row.action).toBe('route.post./api/bookings');
    expect(row.resource_type).toBe('booking');
    expect(row.resource_id).toBe('00000000-0000-0000-0000-000000000aaa');
    expect(row.status_code).toBe(201);
    expect(row.latency_ms).toBe(42);
    expect(row.metadata).toEqual({ key: 'value' });
    expect(row.error_code).toBeNull();
  });

  test('inserts a system-actor row (no user, no api_key)', async () => {
    const result = await recordAudit({
      actor: { type: 'system' },
      action: 'webhook.delivery.dead',
      resource: { type: 'webhook_delivery', id: '00000000-0000-0000-0000-000000000ccc' },
      metadata: { attempts: 25 },
    });
    const { rows } = await db.query(`SELECT actor_type, actor_user_id, api_key_id FROM audit_log WHERE id = $1`, [result.id]);
    expect(rows[0].actor_type).toBe('system');
    expect(rows[0].actor_user_id).toBeNull();
    expect(rows[0].api_key_id).toBeNull();
  });

  test('records error_code when an action failed', async () => {
    const u = await registerUser({ role: 'customer' });
    const result = await recordAudit({
      actor: { type: 'user', userId: u.user.id },
      action: 'route.post./api/bookings',
      statusCode: 422,
      errorCode: '422_validation_error',
    });
    const { rows } = await db.query(`SELECT error_code FROM audit_log WHERE id = $1`, [result.id]);
    expect(rows[0].error_code).toBe('422_validation_error');
  });

  test('exports the ACTOR_TYPES enum', () => {
    expect(ACTOR_TYPES).toEqual(['user', 'api_key', 'system']);
  });
});

describe('recordAuditFireAndForget', () => {
  test('does not throw on invalid actor — logs to stderr and returns', async () => {
    const origErr = console.error;
    let logged = null;
    console.error = (...args) => { logged = args; };
    try {
      // Synchronous return — the .catch on the promise is asynchronous,
      // so we sample on the next tick.
      recordAuditFireAndForget({ actor: { type: 'invalid' }, action: 'x' });
      await new Promise(resolve => setImmediate(resolve));
      expect(logged).not.toBeNull();
      expect(logged[0]).toMatch(/recordAudit failed/);
    } finally {
      console.error = origErr;
    }
  });
});

describe('middleware: resolveActor', () => {
  test('prefers req.apiKey over req.user when both present', () => {
    const req = {
      apiKey: { id: 'k-1' },
      user: { id: 'u-1' },
    };
    expect(resolveActor(req)).toEqual({ type: 'api_key', apiKeyId: 'k-1' });
  });

  test('falls back to req.user when only JWT is present', () => {
    const req = { user: { id: 'u-1' } };
    expect(resolveActor(req)).toEqual({ type: 'user', userId: 'u-1' });
  });

  test('returns null when unauthenticated', () => {
    expect(resolveActor({})).toBeNull();
  });
});

describe('middleware: buildActionKey', () => {
  test('uses route.path when matched', () => {
    const req = { method: 'POST', baseUrl: '/api/bookings', route: { path: '/:id/cancel' } };
    expect(buildActionKey(req)).toBe('route.post./api/bookings/:id/cancel');
  });

  test('falls back to req.path when route is not matched', () => {
    const req = { method: 'GET', path: '/anything' };
    expect(buildActionKey(req)).toBe('route.get./anything');
  });

  test('lowercases method', () => {
    const req = { method: 'DELETE', path: '/api/api-keys/abc' };
    expect(buildActionKey(req)).toBe('route.delete./api/api-keys/abc');
  });
});
