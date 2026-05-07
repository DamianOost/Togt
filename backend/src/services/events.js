const { v4: uuidv4 } = require('uuid');

const EVENT_TYPES = Object.freeze([
  'booking.created',
  'booking.accepted',
  'booking.matched',
  'booking.in_progress',
  'booking.completed',
  'booking.cancelled',
  'match_request.created',
  'match_request.matched',
  'match_request.expired',
  'match_request.cancelled',
  'payment.succeeded',
  'payment.failed',
]);

async function emitEvent(client, { eventType, resourceType, resourceId, previousState = null, state = null, data, occurredAt = new Date() }) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('emitEvent: client is required (pass a pg Client or the pool — use withTx() to share a transaction with your mutation)');
  }
  if (!EVENT_TYPES.includes(eventType)) {
    throw new Error(`Unknown event type: ${eventType}`);
  }
  const eventId = uuidv4();
  const envelope = {
    event_id: eventId,
    event_type: eventType,
    resource_type: resourceType,
    resource_id: resourceId,
    previous_state: previousState,
    state,
    occurred_at: occurredAt.toISOString(),
    data,
  };
  const { rows: subs } = await client.query(
    `SELECT id FROM webhook_subscriptions
       WHERE enabled = true AND event_types && ARRAY[$1]::text[]`,
    [eventType]
  );
  if (subs.length === 0) return { eventId, deliveryCount: 0 };
  const placeholders = subs.map((_, i) => `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`).join(', ');
  const values = subs.flatMap(s => [s.id, eventId, eventType, envelope]);
  await client.query(
    `INSERT INTO webhook_deliveries (subscription_id, event_id, event_type, payload) VALUES ${placeholders}`,
    values
  );
  return { eventId, deliveryCount: subs.length };
}

module.exports = { emitEvent, EVENT_TYPES };
