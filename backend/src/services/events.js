const { v4: uuidv4 } = require('uuid');

const EVENT_TYPES = Object.freeze([
  'booking.created',
  'booking.accepted',
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

// Postgres binds at most 65535 parameters per prepared statement (uint16
// limit in the libpq protocol). Each delivery row uses 4 placeholders, so
// we cap each INSERT at INSERT_CHUNK_ROWS rows and do multiple inserts if
// needed. With 5000 rows/chunk we use 20000 params (well below the cap)
// and avoid the protocol error AND the giant single-statement plan cost.
const INSERT_CHUNK_ROWS = 5000;

const ERROR_MSG_MAX_CHARS = 1024;

/**
 * Emit a lifecycle event.
 *
 * @param client Required pg Client/Pool. Use withTx(...) so the resource
 *   mutation and the delivery rows commit/rollback together (transactional
 *   outbox). emitEvent throws if absent.
 * @param opts.eventType One of EVENT_TYPES.
 * @param opts.resourceType e.g. 'booking', 'match_request', 'payment'.
 * @param opts.resourceId UUID of the resource that changed.
 * @param opts.actorUserIds REQUIRED non-empty array of user IDs who own
 *   this event. Subscribers only receive the event if their
 *   webhook_subscriptions.owner_user_id is in this list. For a booking,
 *   pass [customer_id, labourer_id]. For a match_request, [customer_id].
 *   For a payment, [booking.customer_id, booking.labourer_id].
 * @param opts.previousState Optional state before the transition.
 * @param opts.state Optional state after the transition.
 * @param opts.data Snapshot of the resource at event time (jsonb payload).
 * @param opts.occurredAt Defaults to new Date().
 */
async function emitEvent(client, {
  eventType,
  resourceType,
  resourceId,
  actorUserIds,
  previousState = null,
  state = null,
  data,
  occurredAt = new Date(),
}) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('emitEvent: client is required (pass a pg Client or the pool — use withTx() to share a transaction with your mutation)');
  }
  if (!EVENT_TYPES.includes(eventType)) {
    throw new Error(`Unknown event type: ${eventType}`);
  }
  if (!Array.isArray(actorUserIds) || actorUserIds.length === 0) {
    throw new Error('emitEvent: actorUserIds is required (non-empty array of user UUIDs that own this event)');
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

  // Per-tenant scoping: only subscriptions OWNED BY one of the actor users
  // get a delivery row. This is the per-tenant fan-out fix — without it,
  // a single subscription would receive every booking on the platform.
  const { rows: subs } = await client.query(
    `SELECT id FROM webhook_subscriptions
       WHERE enabled = true
         AND event_types && ARRAY[$1]::text[]
         AND owner_user_id = ANY($2::uuid[])`,
    [eventType, actorUserIds]
  );
  if (subs.length === 0) return { eventId, deliveryCount: 0 };

  // Chunk the INSERT to stay under Postgres' 65535-parameter cap.
  for (let i = 0; i < subs.length; i += INSERT_CHUNK_ROWS) {
    const chunk = subs.slice(i, i + INSERT_CHUNK_ROWS);
    const placeholders = chunk.map((_, j) =>
      `($${j * 4 + 1}, $${j * 4 + 2}, $${j * 4 + 3}, $${j * 4 + 4})`
    ).join(', ');
    const values = chunk.flatMap(s => [s.id, eventId, eventType, envelope]);
    await client.query(
      `INSERT INTO webhook_deliveries (subscription_id, event_id, event_type, payload) VALUES ${placeholders}`,
      values
    );
  }
  return { eventId, deliveryCount: subs.length };
}

module.exports = { emitEvent, EVENT_TYPES, INSERT_CHUNK_ROWS, ERROR_MSG_MAX_CHARS };
