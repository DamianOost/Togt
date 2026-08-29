const { SCHEMA, EMERGENCY_FALLBACK } = require('./contracts');

function iso(value) {
  return value ? new Date(value).toISOString() : undefined;
}

function stripUndefined(value) {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .map(([key, child]) => [key, stripUndefined(child)])
  );
}

function serializeIncident(row, { detail = false } = {}) {
  return stripUndefined({
    schema: SCHEMA,
    id: row.id,
    kind: row.case_kind,
    category: row.category,
    state: row.state,
    revision: Number(row.revision),
    bookingReference: row.booking_id || undefined,
    summary: detail ? row.summary : undefined,
    channel: {
      accepted: row.intake_channel,
      supportLevel: 'record_only',
      operationsAlerted: false,
      humanAcknowledgementExpected: false,
      emergencyServicesDispatched: false,
    },
    stateMachine: {
      canonical: ['received', 'acknowledged', 'escalated', 'resolved', 'failed'],
      operatedTransitionsAvailable: false,
      reasonCode: 'operations_acknowledgement_not_staffed',
    },
    emergencyFallback: EMERGENCY_FALLBACK,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    acknowledgedAt: iso(row.acknowledged_at),
    escalatedAt: iso(row.escalated_at),
    resolvedAt: iso(row.resolved_at),
    failedAt: iso(row.failed_at),
  });
}

function serializeFavourite(row) {
  return {
    schema: SCHEMA,
    id: row.id,
    worker: {
      id: row.worker_id,
      displayName: row.worker_name,
      avatarUrl: row.worker_avatar || undefined,
    },
    sourceProjectReference: row.source_booking_id,
    status: row.status,
    revision: Number(row.revision),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function serializeBlock(row) {
  return {
    schema: SCHEMA,
    id: row.id,
    counterpartReference: row.blocked_user_id,
    sourceProjectReference: row.source_booking_id,
    status: row.status,
    revision: Number(row.revision),
    effects: {
      futureMatchingAllowed: false,
      newContactAllowed: false,
      recurringRelationshipAllowed: false,
    },
    createdAt: iso(row.created_at),
  };
}

function serializeRebookDraft(row) {
  return stripUndefined({
    schema: SCHEMA,
    id: row.id,
    revision: Number(row.revision),
    status: row.status,
    sourceProjectReference: row.source_booking_id,
    preferredWorker: {
      id: row.preferred_worker_id,
      displayName: row.worker_name,
    },
    service: { label: row.source_service_label },
    editableScope: row.editable_scope,
    broadAreaLabel: row.broad_area_label || undefined,
    requestedStartsAt: iso(row.requested_starts_at),
    confirmationsRequired: {
      currentPrice: true,
      location: true,
      schedule: true,
      workerAvailability: true,
    },
    substitution: {
      policy: 'none',
      alternativeRequiresExplicitSelection: true,
    },
    submission: {
      submitted: false,
      bookingCreated: false,
      supportedByThisEndpoint: false,
    },
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  });
}

function serializeAcceptance(row) {
  return {
    participantRole: row.user_id === row.customer_id ? 'customer' : 'worker',
    termsRevision: Number(row.terms_revision),
    acceptedAt: iso(row.accepted_at),
  };
}

function serializeOccurrence(row) {
  return stripUndefined({
    id: row.id,
    sequence: Number(row.sequence_number),
    termsRevision: Number(row.terms_revision),
    scheduledAt: iso(row.scheduled_at),
    status: row.status,
    bookingReference: row.booking_id || undefined,
  });
}

function serializeOccurrenceChange(row) {
  return stripUndefined({
    id: row.id,
    occurrenceReference: row.occurrence_id,
    kind: row.change_kind,
    proposedScheduledAt: iso(row.proposed_scheduled_at),
    status: row.status,
    requestedByRole: row.requested_by === row.customer_id ? 'customer' : 'worker',
    decidedByRole: row.decided_by
      ? (row.decided_by === row.customer_id ? 'customer' : 'worker')
      : undefined,
    requestedAt: iso(row.requested_at),
    decidedAt: iso(row.decided_at),
  });
}

function participantRole(series, userId) {
  if (!userId) return null;
  if (userId === series.customer_id) return 'customer';
  if (userId === series.worker_id) return 'worker';
  return null;
}

function serializeSeries(bundle) {
  const { series, currentTerms, proposedTerms, acceptances, occurrences, changes } = bundle;
  const terms = (row) => row ? {
    revision: Number(row.terms_revision),
    service: row.service_snapshot,
    schedule: row.schedule_snapshot,
    commercial: row.commercial_snapshot,
    substitutionPolicy: row.substitution_policy,
    cancellationPolicyVersion: row.cancellation_policy_version,
    proposedByRole: row.proposed_by === series.customer_id ? 'customer' : 'worker',
    createdAt: iso(row.created_at),
  } : undefined;
  return stripUndefined({
    schema: SCHEMA,
    id: series.id,
    revision: Number(series.revision),
    status: series.status,
    sourceProjectReference: series.source_booking_id,
    participants: {
      customer: { id: series.customer_id },
      worker: { id: series.worker_id, displayName: series.worker_name },
    },
    currentTerms: terms(currentTerms),
    proposedTerms: terms(proposedTerms),
    acceptances: acceptances.map(serializeAcceptance),
    occurrences: occurrences.map(serializeOccurrence),
    pendingOccurrenceChanges: changes.map(serializeOccurrenceChange),
    pendingRequests: {
      resumeRequestedByRole: series.status === 'resume_requested'
        ? participantRole(series, series.resume_requested_by)
        : null,
      cancellationRequestedByRole: series.status === 'cancellation_requested'
        ? participantRole(series, series.cancellation_requested_by)
        : null,
    },
    controls: {
      occurrenceAndWholeSeriesAreDistinct: true,
      bookingCreationIsAutomatic: false,
      eachOccurrenceRequiresBookingConfirmation: true,
      substitutionIsAutomatic: false,
      mutualAcceptanceRequired: true,
    },
    createdAt: iso(series.created_at),
    updatedAt: iso(series.updated_at),
    activatedAt: iso(series.activated_at),
    cancelledAt: iso(series.cancelled_at),
  });
}

module.exports = {
  stripUndefined,
  serializeIncident,
  serializeFavourite,
  serializeBlock,
  serializeRebookDraft,
  serializeSeries,
};
