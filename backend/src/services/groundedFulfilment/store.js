const BOOKING_SELECT = `
  SELECT b.*,
         customer.name AS customer_name, customer.phone AS customer_phone,
         customer.avatar_url AS customer_avatar,
         worker.name AS worker_name, worker.phone AS worker_phone,
         worker.avatar_url AS worker_avatar,
         policy.policy_version, policy.source AS policy_source,
         policy.route_reveal_lead_minutes, policy.arrival_evidence_mode,
         policy.no_show_grace_minutes, policy.start_pin_ttl_minutes,
         policy.start_pin_max_attempts, policy.reschedule_expiry_minutes,
         policy.change_order_expiry_minutes
    FROM bookings b
    JOIN users customer ON customer.id = b.customer_id
    JOIN users worker ON worker.id = b.labourer_id
    LEFT JOIN grounded_fulfilment_policy_snapshots policy ON policy.booking_id = b.id
`;

async function getBooking(queryable, bookingId, actor, { forUpdate = false } = {}) {
  const result = await queryable.query(
    `${BOOKING_SELECT}
      WHERE b.id = $1 AND (b.customer_id = $2 OR b.labourer_id = $2)
      ${forUpdate ? 'FOR UPDATE OF b' : ''}`,
    [bookingId, actor.id]
  );
  return result.rows[0] || null;
}

async function getPolicy(queryable, bookingId) {
  const result = await queryable.query(
    'SELECT * FROM grounded_fulfilment_policy_snapshots WHERE booking_id = $1',
    [bookingId]
  );
  return result.rows[0] || null;
}

async function getScopes(queryable, bookingId) {
  const result = await queryable.query(
    `SELECT * FROM grounded_scope_versions
      WHERE booking_id = $1 ORDER BY version DESC`,
    [bookingId]
  );
  return result.rows;
}

async function getConfirmedScope(queryable, bookingId, { forUpdate = false } = {}) {
  const result = await queryable.query(
    `SELECT * FROM grounded_scope_versions
      WHERE booking_id = $1 AND status = 'confirmed'
      ORDER BY version DESC LIMIT 1 ${forUpdate ? 'FOR UPDATE' : ''}`,
    [bookingId]
  );
  return result.rows[0] || null;
}

async function getPendingScope(queryable, bookingId, { forUpdate = false } = {}) {
  const result = await queryable.query(
    `SELECT * FROM grounded_scope_versions
      WHERE booking_id = $1 AND status = 'proposed'
      ORDER BY version DESC LIMIT 1 ${forUpdate ? 'FOR UPDATE' : ''}`,
    [bookingId]
  );
  return result.rows[0] || null;
}

async function getScopeVersion(queryable, bookingId, version, { forUpdate = false } = {}) {
  const result = await queryable.query(
    `SELECT * FROM grounded_scope_versions
      WHERE booking_id = $1 AND version = $2 ${forUpdate ? 'FOR UPDATE' : ''}`,
    [bookingId, version]
  );
  return result.rows[0] || null;
}

async function getActivePin(queryable, bookingId, { forUpdate = false } = {}) {
  const result = await queryable.query(
    `SELECT * FROM grounded_start_pin_challenges
      WHERE booking_id = $1 AND status = 'active'
      ORDER BY generation DESC LIMIT 1 ${forUpdate ? 'FOR UPDATE' : ''}`,
    [bookingId]
  );
  return result.rows[0] || null;
}

async function getLatestPin(queryable, bookingId) {
  const result = await queryable.query(
    `SELECT * FROM grounded_start_pin_challenges
      WHERE booking_id = $1 ORDER BY generation DESC LIMIT 1`,
    [bookingId]
  );
  return result.rows[0] || null;
}

async function getPinById(queryable, challengeId) {
  const result = await queryable.query(
    'SELECT * FROM grounded_start_pin_challenges WHERE id = $1',
    [challengeId]
  );
  return result.rows[0] || null;
}

async function getReschedules(queryable, bookingId) {
  const result = await queryable.query(
    `SELECT * FROM grounded_reschedule_proposals
      WHERE booking_id = $1 ORDER BY version DESC`,
    [bookingId]
  );
  return result.rows;
}

async function getReschedule(queryable, bookingId, proposalId, { forUpdate = false } = {}) {
  const result = await queryable.query(
    `SELECT * FROM grounded_reschedule_proposals
      WHERE booking_id = $1 AND id = $2 ${forUpdate ? 'FOR UPDATE' : ''}`,
    [bookingId, proposalId]
  );
  return result.rows[0] || null;
}

async function getChanges(queryable, bookingId) {
  const result = await queryable.query(
    `SELECT * FROM grounded_change_orders
      WHERE booking_id = $1 ORDER BY version DESC`,
    [bookingId]
  );
  return result.rows;
}

async function getChange(queryable, bookingId, changeId, { forUpdate = false } = {}) {
  const result = await queryable.query(
    `SELECT * FROM grounded_change_orders
      WHERE booking_id = $1 AND id = $2 ${forUpdate ? 'FOR UPDATE' : ''}`,
    [bookingId, changeId]
  );
  return result.rows[0] || null;
}

async function getNoShows(queryable, bookingId) {
  const result = await queryable.query(
    `SELECT * FROM grounded_no_show_reports
      WHERE booking_id = $1 ORDER BY reported_at DESC`,
    [bookingId]
  );
  return result.rows;
}

async function getReplacement(queryable, bookingId) {
  const result = await queryable.query(
    'SELECT * FROM grounded_replacement_requests WHERE booking_id = $1',
    [bookingId]
  );
  return result.rows[0] || null;
}

async function getState(queryable, booking) {
  // A checked-out pg Client executes one statement at a time. Keep these
  // reads explicitly ordered so command transactions never rely on pg's
  // deprecated concurrent-query queueing behaviour.
  const scopes = await getScopes(queryable, booking.id);
  const pin = await getLatestPin(queryable, booking.id);
  const reschedules = await getReschedules(queryable, booking.id);
  const changes = await getChanges(queryable, booking.id);
  const noShows = await getNoShows(queryable, booking.id);
  const replacement = await getReplacement(queryable, booking.id);
  return { scopes, pin, reschedules, changes, noShows, replacement };
}

async function appendEvent(client, {
  booking,
  revision,
  eventType,
  actor,
  status,
  phase,
  payload = {},
}) {
  const eventResult = await client.query(
    `INSERT INTO grounded_project_events (
       booking_id, aggregate_sequence, event_type, actor_user_id, actor_role,
       booking_status, operational_phase, payload
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     RETURNING id, occurred_at`,
    [
      booking.id,
      revision,
      eventType,
      actor.id,
      actor.role,
      status,
      phase,
      JSON.stringify(payload),
    ]
  );
  const event = eventResult.rows[0];
  const envelope = {
    eventId: event.id,
    eventType,
    schemaVersion: 1,
    projectId: booking.id,
    revision,
    bookingStatus: status,
    operationalPhase: phase,
    actorRole: actor.role === 'labourer' ? 'worker' : actor.role,
    occurredAt: new Date(event.occurred_at).toISOString(),
  };
  await client.query(
    `INSERT INTO grounded_project_outbox (
       event_id, aggregate_id, aggregate_sequence, payload
     ) VALUES ($1, $2, $3, $4::jsonb)`,
    [event.id, booking.id, revision, JSON.stringify(envelope)]
  );
  return event;
}

module.exports = {
  BOOKING_SELECT,
  getBooking,
  getPolicy,
  getScopes,
  getConfirmedScope,
  getPendingScope,
  getScopeVersion,
  getActivePin,
  getLatestPin,
  getPinById,
  getReschedules,
  getReschedule,
  getChanges,
  getChange,
  getNoShows,
  getReplacement,
  getState,
  appendEvent,
};
