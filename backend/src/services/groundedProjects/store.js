const PROJECT_SELECT = `
  SELECT b.*,
         cu.name AS customer_name,
         cu.phone AS customer_phone,
         cu.avatar_url AS customer_avatar,
         lu.name AS labourer_name,
         lu.phone AS labourer_phone,
         lu.avatar_url AS labourer_avatar,
         lu.is_verified AS labourer_verified,
         lp.rating_avg,
         lp.rating_count,
         lp.current_lat,
         lp.current_lng,
         lp.location_updated_at,
         pay.id AS payment_id,
         pay.status AS payment_status,
         pay.amount AS payment_amount,
         pay.currency AS payment_currency,
         pay.created_at AS payment_created_at,
         completion.status AS completion_status,
         completion.requested_at AS completion_requested_at,
         completion.decided_at AS completion_decided_at,
         snapshot.id AS snapshot_id,
         snapshot.version AS snapshot_version,
         snapshot.captured_at AS snapshot_captured_at,
         issue.id AS issue_id,
         issue.status AS issue_status,
         issue.reason AS issue_reason,
         issue.opened_at AS issue_opened_at,
         agreement.service_id AS catalogue_service_id,
         agreement.service_version AS catalogue_service_version,
         agreement.service_snapshot AS catalogue_service_snapshot,
         agreement.scope_snapshot AS catalogue_scope_snapshot,
         agreement.commercial_snapshot AS catalogue_commercial_snapshot,
         agreement.schedule_snapshot AS catalogue_schedule_snapshot,
         agreement.quote_id AS agreement_quote_id,
         agreement.quote_version AS agreement_quote_version
    FROM bookings b
    JOIN users cu ON cu.id = b.customer_id
    JOIN users lu ON lu.id = b.labourer_id
    JOIN labourer_profiles lp ON lp.user_id = b.labourer_id
    LEFT JOIN LATERAL (
      SELECT p.id, p.status, p.amount, p.currency, p.created_at
        FROM payments p
       WHERE p.booking_id = b.id
       ORDER BY p.created_at DESC, p.id DESC
       LIMIT 1
    ) pay ON TRUE
    LEFT JOIN grounded_project_completions completion ON completion.booking_id = b.id
    LEFT JOIN grounded_project_commercial_snapshots snapshot ON snapshot.id = completion.snapshot_id
    LEFT JOIN grounded_project_issues issue ON issue.id = completion.dispute_issue_id
    LEFT JOIN grounded_booking_agreement_snapshots agreement ON agreement.booking_id = b.id
`;

async function listProjects(queryable, viewer, { limit = 100 } = {}) {
  const result = await queryable.query(
    `${PROJECT_SELECT}
      WHERE b.customer_id = $1 OR b.labourer_id = $1
      ORDER BY COALESCE(b.phase_updated_at, b.created_at) DESC, b.id DESC
      LIMIT $2`,
    [viewer.id, limit]
  );
  return result.rows;
}

async function getProject(queryable, projectId, viewer, { forUpdate = false } = {}) {
  const result = await queryable.query(
    `${PROJECT_SELECT}
      WHERE b.id = $1
        AND (b.customer_id = $2 OR b.labourer_id = $2)
      ${forUpdate ? 'FOR UPDATE OF b' : ''}`,
    [projectId, viewer.id]
  );
  return result.rows[0] || null;
}

async function getTimeline(queryable, projectId) {
  const result = await queryable.query(
    `SELECT id, aggregate_sequence, event_type, actor_role,
            booking_status, operational_phase, occurred_at
       FROM grounded_project_events
      WHERE booking_id = $1
      ORDER BY aggregate_sequence ASC`,
    [projectId]
  );
  return result.rows;
}

async function ensureCreationEvent(client, booking) {
  await client.query(
    `INSERT INTO grounded_project_events (
       booking_id, aggregate_sequence, event_type, actor_user_id, actor_role,
       booking_status, operational_phase, payload, occurred_at
     )
     VALUES ($1, 0, 'project.created', $2, 'customer', $3, $4, $5::jsonb, $6)
     ON CONFLICT (booking_id, aggregate_sequence) DO NOTHING`,
    [
      booking.id,
      booking.customer_id,
      booking.status,
      booking.operational_phase || 'matching',
      JSON.stringify({ projectId: booking.id, revision: 0 }),
      booking.created_at,
    ]
  );
}

async function acceptedChangeOrders(client, bookingId) {
  const result = await client.query(
    `SELECT id, description, extra_hours, extra_amount, responded_at, created_at
       FROM change_orders
      WHERE booking_id = $1 AND status = 'accepted'
      ORDER BY created_at ASC, id ASC`,
    [bookingId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    description: row.description,
    extraHours: row.extra_hours === null ? null : String(row.extra_hours),
    extraAmount: row.extra_amount === null ? null : String(row.extra_amount),
    approvedAt: row.responded_at || row.created_at,
  }));
}

async function hasOpenChangeOrder(client, bookingId) {
  const result = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM change_orders WHERE booking_id = $1 AND status = 'pending'
     ) AS exists`,
    [bookingId]
  );
  return Boolean(result.rows[0]?.exists);
}

async function hasSafetyHold(client, bookingId) {
  // The legacy SOS table has no resolution state. Treat any row as an open
  // hold instead of guessing it was resolved and closing fulfilment over it.
  const result = await client.query(
    'SELECT EXISTS (SELECT 1 FROM sos_events WHERE booking_id = $1) AS exists',
    [bookingId]
  );
  return Boolean(result.rows[0]?.exists);
}

async function createCommercialSnapshot(client, booking) {
  const changes = await acceptedChangeOrders(client, booking.id);
  const versionResult = await client.query(
    `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
       FROM grounded_project_commercial_snapshots
      WHERE booking_id = $1`,
    [booking.id]
  );
  const version = Number(versionResult.rows[0].next_version);
  const result = await client.query(
    `INSERT INTO grounded_project_commercial_snapshots (
       booking_id, version, booking_revision, currency, agreed_total_amount,
       estimated_hours, service_label, scope_items, accepted_change_orders,
       payment_status_at_capture, capture_reason
     )
     VALUES ($1, $2, $3, 'ZAR', $4, $5, $6, $7::jsonb, $8::jsonb, $9,
             'completion_requested')
     RETURNING *`,
    [
      booking.id,
      version,
      booking.lifecycle_revision,
      booking.total_amount,
      booking.hours_est,
      booking.skill_needed,
      JSON.stringify(booking.scope_items || []),
      JSON.stringify(changes),
      booking.payment_status,
    ]
  );
  return result.rows[0];
}

async function appendLifecycleEvent(client, {
  booking,
  sequence,
  eventType,
  actor,
  bookingStatus,
  operationalPhase,
  payload = {},
}) {
  const eventResult = await client.query(
    `INSERT INTO grounded_project_events (
       booking_id, aggregate_sequence, event_type, actor_user_id, actor_role,
       booking_status, operational_phase, payload
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     RETURNING id, occurred_at`,
    [
      booking.id,
      sequence,
      eventType,
      actor.id,
      actor.role,
      bookingStatus,
      operationalPhase,
      JSON.stringify(payload),
    ]
  );
  const event = eventResult.rows[0];
  const envelope = {
    eventId: event.id,
    eventType,
    schemaVersion: 1,
    projectId: booking.id,
    revision: sequence,
    bookingStatus,
    operationalPhase,
    actorRole: actor.role === 'labourer' ? 'worker' : actor.role,
    occurredAt: new Date(event.occurred_at).toISOString(),
  };
  await client.query(
    `INSERT INTO grounded_project_outbox (
       event_id, aggregate_id, aggregate_sequence, payload
     ) VALUES ($1, $2, $3, $4::jsonb)`,
    [event.id, booking.id, sequence, JSON.stringify(envelope)]
  );
  return event;
}

module.exports = {
  PROJECT_SELECT,
  listProjects,
  getProject,
  getTimeline,
  ensureCreationEvent,
  acceptedChangeOrders,
  hasOpenChangeOrder,
  hasSafetyHold,
  createCommercialSnapshot,
  appendLifecycleEvent,
};
