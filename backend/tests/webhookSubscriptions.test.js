const db = require('../src/config/db');

describe('webhooks schema (migration 014)', () => {
  test('webhook_subscriptions table exists with expected columns', async () => {
    const { rows } = await db.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'webhook_subscriptions' ORDER BY ordinal_position
    `);
    const cols = Object.fromEntries(rows.map(r => [r.column_name, r.data_type]));
    expect(cols.id).toBe('uuid');
    expect(cols.owner_user_id).toBe('uuid');
    expect(cols.url).toBe('text');
    expect(cols.secret_encrypted).toBe('text');
    expect(cols.secret_previous_encrypted).toBe('text');
    expect(cols.secret_previous_expires_at).toBe('timestamp with time zone');
    expect(cols.event_types).toBe('ARRAY');
    expect(cols.enabled).toBe('boolean');
    expect(cols.consecutive_failures).toBe('integer');
  });

  test('webhook_deliveries table exists with expected columns', async () => {
    const { rows } = await db.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'webhook_deliveries' ORDER BY ordinal_position
    `);
    const cols = Object.fromEntries(rows.map(r => [r.column_name, r.data_type]));
    expect(cols.id).toBe('uuid');
    expect(cols.subscription_id).toBe('uuid');
    expect(cols.event_id).toBe('uuid');
    expect(cols.event_type).toBe('text');
    expect(cols.payload).toBe('jsonb');
    expect(cols.attempt_count).toBe('integer');
    expect(cols.status).toBe('text');
    expect(cols.next_retry_at).toBe('timestamp with time zone');
  });
});
