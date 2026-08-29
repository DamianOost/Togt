async function appendTrustEvent(client, {
  aggregateType,
  aggregateId,
  sequence,
  eventType,
  actor,
  payload = {},
}) {
  const eventResult = await client.query(
    `INSERT INTO grounded_trust_events (
       aggregate_type, aggregate_id, aggregate_sequence,
       event_type, actor_user_id, actor_role, payload
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     RETURNING id, occurred_at`,
    [
      aggregateType,
      aggregateId,
      sequence,
      eventType,
      actor.id,
      actor.role,
      JSON.stringify(payload),
    ]
  );
  const event = eventResult.rows[0];
  const envelope = {
    eventId: event.id,
    eventType,
    schemaVersion: 1,
    aggregateType,
    aggregateId,
    revision: Number(sequence),
    actorRole: actor.role === 'labourer' ? 'worker' : actor.role,
    occurredAt: new Date(event.occurred_at).toISOString(),
    ...payload,
  };
  await client.query(
    `INSERT INTO grounded_trust_outbox (
       event_id, aggregate_type, aggregate_id, aggregate_sequence, payload
     ) VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [event.id, aggregateType, aggregateId, sequence, JSON.stringify(envelope)]
  );
  await client.query(
    `INSERT INTO audit_log (
       actor_type, actor_user_id, action, resource_type, resource_id,
       status_code, metadata
     ) VALUES ('user', $1, $2, $3, $4, 200, $5::jsonb)`,
    [
      actor.id,
      `domain.${eventType}`,
      aggregateType,
      aggregateId,
      JSON.stringify({ eventId: event.id, revision: Number(sequence) }),
    ]
  );
  return event;
}

module.exports = { appendTrustEvent };
