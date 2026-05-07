const { db, truncateAll, registerUser } = require('./helpers');
const { callTool } = require('../mcp-server/tools');
const { decryptSecret } = require('../src/lib/webhookSecretCrypto');

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  if (db.end) await db.end();
});

function ctxFor(userId, scopes) {
  return { userId, scopes };
}

describe('webhook MCP tools', () => {
  test('create_webhook_subscription returns secret once and stores it encrypted', async () => {
    const u = await registerUser({ role: 'customer' });
    const ctx = ctxFor(u.user.id, ['mcp:full']);
    const res = await callTool(ctx, 'create_webhook_subscription', {
      url: 'https://example.test/h',
      event_types: ['booking.created', 'booking.completed'],
      description: 'mcp test',
    });
    expect(res.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.secret).toMatch(/^whsec_[a-f0-9]{64}$/);
    expect(res.event_types).toEqual(['booking.created', 'booking.completed']);
    expect(res.decision_context.secret_visible_only_now).toBe(true);
    expect(res.decision_context.signature_header).toBe('X-Togt-Signature');

    const { rows } = await db.query("SELECT secret_encrypted FROM webhook_subscriptions WHERE id = $1", [res.id]);
    expect(rows[0].secret_encrypted).not.toContain(res.secret.slice(6));
    expect(decryptSecret(rows[0].secret_encrypted)).toBe(res.secret);
  });

  test('create_webhook_subscription rejects unknown event types', async () => {
    const u = await registerUser({ role: 'customer' });
    const ctx = ctxFor(u.user.id, ['mcp:full']);
    await expect(callTool(ctx, 'create_webhook_subscription', {
      url: 'https://example.test/h',
      event_types: ['invented.event'],
    })).rejects.toThrow(/Unknown event_types/);
  });

  test('list_webhook_subscriptions excludes any secret-shaped field', async () => {
    const u = await registerUser({ role: 'customer' });
    const ctx = ctxFor(u.user.id, ['mcp:full']);
    await callTool(ctx, 'create_webhook_subscription', {
      url: 'https://example.test/h',
      event_types: ['booking.created'],
    });
    const res = await callTool(ctx, 'list_webhook_subscriptions', {});
    expect(Array.isArray(res.subscriptions)).toBe(true);
    expect(res.subscriptions.length).toBe(1);
    for (const s of res.subscriptions) {
      expect(s.secret).toBeUndefined();
      expect(s.secret_encrypted).toBeUndefined();
      expect(s.secret_previous_encrypted).toBeUndefined();
    }
  });

  test('mcp:read_only cannot create_webhook_subscription', async () => {
    const u = await registerUser({ role: 'customer' });
    const ctx = ctxFor(u.user.id, ['mcp:read_only']);
    await expect(callTool(ctx, 'create_webhook_subscription', {
      url: 'https://example.test/h',
      event_types: ['booking.created'],
    })).rejects.toThrow(/scope mcp:full/);
  });

  test('mcp:read_only CAN list_webhook_subscriptions', async () => {
    const u = await registerUser({ role: 'customer' });
    const fullCtx = ctxFor(u.user.id, ['mcp:full']);
    await callTool(fullCtx, 'create_webhook_subscription', {
      url: 'https://example.test/h',
      event_types: ['booking.created'],
    });
    const readCtx = ctxFor(u.user.id, ['mcp:read_only']);
    const res = await callTool(readCtx, 'list_webhook_subscriptions', {});
    expect(res.subscriptions.length).toBe(1);
  });

  test('delete_webhook_subscription removes it; second call returns deleted=false', async () => {
    const u = await registerUser({ role: 'customer' });
    const ctx = ctxFor(u.user.id, ['mcp:full']);
    const created = await callTool(ctx, 'create_webhook_subscription', {
      url: 'https://example.test/del',
      event_types: ['booking.created'],
    });
    const first = await callTool(ctx, 'delete_webhook_subscription', { id: created.id });
    expect(first.deleted).toBe(true);
    const second = await callTool(ctx, 'delete_webhook_subscription', { id: created.id });
    expect(second.deleted).toBe(false);
  });

  test('rotate_webhook_secret returns a new secret + 24h previous-expiry, stores rotation', async () => {
    const u = await registerUser({ role: 'customer' });
    const ctx = ctxFor(u.user.id, ['mcp:full']);
    const created = await callTool(ctx, 'create_webhook_subscription', {
      url: 'https://example.test/rot',
      event_types: ['booking.created'],
    });
    const rotated = await callTool(ctx, 'rotate_webhook_secret', { id: created.id });
    expect(rotated.secret).toMatch(/^whsec_[a-f0-9]{64}$/);
    expect(rotated.secret).not.toBe(created.secret);
    const expiry = new Date(rotated.previous_secret_expires_at).getTime();
    expect(Math.abs(expiry - (Date.now() + 24 * 3600 * 1000))).toBeLessThan(60_000);

    const { rows } = await db.query(
      `SELECT secret_encrypted, secret_previous_encrypted FROM webhook_subscriptions WHERE id = $1`,
      [created.id]
    );
    expect(decryptSecret(rows[0].secret_encrypted)).toBe(rotated.secret);
    expect(decryptSecret(rows[0].secret_previous_encrypted)).toBe(created.secret);
  });

  test('mcp:read_only cannot rotate_webhook_secret', async () => {
    const u = await registerUser({ role: 'customer' });
    const fullCtx = ctxFor(u.user.id, ['mcp:full']);
    const created = await callTool(fullCtx, 'create_webhook_subscription', {
      url: 'https://example.test/rot2',
      event_types: ['booking.created'],
    });
    const readCtx = ctxFor(u.user.id, ['mcp:read_only']);
    await expect(callTool(readCtx, 'rotate_webhook_secret', { id: created.id }))
      .rejects.toThrow(/scope mcp:full/);
  });

  test('replay_webhook_delivery resets a dead delivery to pending', async () => {
    const u = await registerUser({ role: 'customer' });
    const ctx = ctxFor(u.user.id, ['mcp:full']);
    const created = await callTool(ctx, 'create_webhook_subscription', {
      url: 'https://example.test/r',
      event_types: ['booking.completed'],
    });
    const ins = await db.query(
      `INSERT INTO webhook_deliveries
         (subscription_id, event_id, event_type, payload, status, attempt_count, dead_at, last_error)
       VALUES ($1, gen_random_uuid(), 'booking.completed', '{"event_id":"x"}'::jsonb, 'dead', 5, NOW(), 'gave up')
       RETURNING id`,
      [created.id]
    );
    const res = await callTool(ctx, 'replay_webhook_delivery', {
      subscription_id: created.id,
      delivery_id: ins.rows[0].id,
    });
    expect(res.status).toBe('pending');

    const { rows } = await db.query(`SELECT status, attempt_count FROM webhook_deliveries WHERE id = $1`, [ins.rows[0].id]);
    expect(rows[0].status).toBe('pending');
    expect(rows[0].attempt_count).toBe(0);
  });

  test('replay_webhook_delivery refuses to replay another user delivery', async () => {
    const owner = await registerUser({ role: 'customer' });
    const ownerCtx = ctxFor(owner.user.id, ['mcp:full']);
    const created = await callTool(ownerCtx, 'create_webhook_subscription', {
      url: 'https://example.test/private',
      event_types: ['booking.created'],
    });
    const ins = await db.query(
      `INSERT INTO webhook_deliveries (subscription_id, event_id, event_type, payload, status, dead_at)
       VALUES ($1, gen_random_uuid(), 'booking.created', '{"event_id":"x"}'::jsonb, 'dead', NOW())
       RETURNING id`,
      [created.id]
    );
    const intruder = await registerUser({ role: 'customer' });
    const intruderCtx = ctxFor(intruder.user.id, ['mcp:full']);
    await expect(callTool(intruderCtx, 'replay_webhook_delivery', {
      subscription_id: created.id,
      delivery_id: ins.rows[0].id,
    })).rejects.toThrow(/subscription not found/);
  });
});
