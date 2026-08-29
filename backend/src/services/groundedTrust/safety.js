const { executeCommand } = require('./command');
const { appendTrustEvent } = require('./events');
const {
  EMERGENCY_FALLBACK,
  fail,
  boundedText,
} = require('./contracts');
const { getRelationshipBooking, getIncident, listIncidents } = require('./store');
const { serializeIncident } = require('./privacy');

const SUPPORTED_CHANNEL = 'in_app_record';
const UNSUPPORTED_OPERATED_CHANNELS = new Set([
  'operated_sos',
  'togt_dispatch',
  'emergency_dispatch',
]);

function rejectUnsupportedChannel(requestedChannel) {
  if (UNSUPPORTED_OPERATED_CHANNELS.has(requestedChannel)) {
    fail(
      'operated_sos_unavailable',
      'Operated SOS and dispatch are unavailable',
      503,
      'TOGT has not alerted an operator or dispatched emergency services. Use the direct emergency fallback if anyone is in danger.',
      {
        capability: 'operated_sos',
        available: false,
        reasonCode: 'operations_acknowledgement_not_staffed',
        emergencyFallback: EMERGENCY_FALLBACK,
      }
    );
  }
  if (requestedChannel !== SUPPORTED_CHANNEL) {
    fail(
      'support_channel_unsupported',
      'The requested support channel is unavailable',
      422,
      `The supported channel is '${SUPPORTED_CHANNEL}'.`,
      { supportedChannels: [SUPPORTED_CHANNEL], emergencyFallback: EMERGENCY_FALLBACK }
    );
  }
}

async function createIncident(context) {
  rejectUnsupportedChannel(context.body.requestedChannel);
  return executeCommand({ ...context, commandType: `create_${context.body.kind}_case` }, async (client) => {
    if (context.body.bookingId) {
      const booking = await getRelationshipBooking(
        client,
        context.body.bookingId,
        context.actor,
        { forUpdate: true }
      );
      if (!booking) {
        fail(
          'incident_project_not_found',
          'Project not found',
          404,
          'No participant-visible Project exists for this incident.'
        );
      }
    }
    const summary = boundedText(context.body.summary, 'summary', { min: 3, max: 2000 });
    const inserted = await client.query(
      `INSERT INTO grounded_support_incidents (
         reporter_user_id, booking_id, case_kind, category, summary
       ) VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        context.actor.id,
        context.body.bookingId || null,
        context.body.kind,
        context.body.category,
        summary,
      ]
    );
    const incident = inserted.rows[0];
    await appendTrustEvent(client, {
      aggregateType: context.body.kind === 'safety' ? 'safety_incident' : 'support_case',
      aggregateId: incident.id,
      sequence: incident.revision,
      eventType: `${context.body.kind}.case_received`,
      actor: context.actor,
      payload: {
        kind: incident.case_kind,
        category: incident.category,
        state: incident.state,
        bookingReference: incident.booking_id,
        intakeChannel: incident.intake_channel,
        operationsAlerted: false,
        emergencyServicesDispatched: false,
      },
    });
    return {
      status: 201,
      resourceId: incident.id,
      body: { incident: serializeIncident(incident, { detail: true }) },
    };
  });
}

async function getIncidentForReporter(queryable, incidentId, actor, kind) {
  const incident = await getIncident(queryable, incidentId, actor.id);
  if (!incident || (kind && incident.case_kind !== kind)) {
    fail(
      'incident_not_found',
      'Incident not found',
      404,
      'No reporter-visible incident exists for this identifier.'
    );
  }
  return serializeIncident(incident, { detail: true });
}

async function listIncidentsForReporter(queryable, actor, kind) {
  const rows = await listIncidents(queryable, actor.id, kind);
  return rows.map((row) => serializeIncident(row));
}

function rejectOperationsTransition(action) {
  fail(
    'safety_operations_unavailable',
    `Safety incident ${action} is unavailable`,
    503,
    'No staff-authenticated, MFA-protected safety operations channel has passed its release gate. No state was changed.',
    {
      capability: 'operated_sos',
      available: false,
      stateChanged: false,
      operationsAlerted: false,
      reasonCode: 'operations_acknowledgement_not_staffed',
      emergencyFallback: EMERGENCY_FALLBACK,
    }
  );
}

module.exports = {
  SUPPORTED_CHANNEL,
  UNSUPPORTED_OPERATED_CHANNELS,
  rejectUnsupportedChannel,
  createIncident,
  getIncidentForReporter,
  listIncidentsForReporter,
  rejectOperationsTransition,
};
