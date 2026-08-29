const {
  deriveOperationalPhase,
  projectSegment,
  projectionFor,
  canRevealExactJobLocation,
  canRevealParticipantContact,
} = require('./state');

const SCHEMA = 'togt.project.v1';
const LIVE_FRESH_MS = 45_000;
const LIVE_HARD_HIDE_MS = 5 * 60_000;

function stripUndefined(value) {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .map(([key, child]) => [key, stripUndefined(child)])
  );
}

function displayFirstName(name) {
  if (typeof name !== 'string') return 'Customer';
  const first = name.trim().split(/\s+/)[0];
  return first || 'Customer';
}

function approximateCoordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(2)) : undefined;
}

function redactSensitiveText(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/\b(?:\+?27|0)\s?\d(?:[\s-]?\d){8}\b/g, '[contact removed]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[contact removed]');
}

function sanitizeScopeValue(value, depth = 0) {
  if (depth > 5) return '[content omitted]';
  if (typeof value === 'string') return redactSensitiveText(value).slice(0, 500);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeScopeValue(item, depth + 1));
  if (!value || typeof value !== 'object') return undefined;

  const blockedKey = /(address|phone|email|contact|latitude|longitude|\blat\b|\blng\b|gps|pin)/i;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !blockedKey.test(key))
      .slice(0, 50)
      .map(([key, child]) => [key, sanitizeScopeValue(child, depth + 1)])
      .filter(([, child]) => child !== undefined)
  );
}

function locationFor(row, viewerRole) {
  if (canRevealExactJobLocation(row, viewerRole)) {
    return stripUndefined({
      precision: 'exact',
      address: row.address,
      coordinate: {
        latitude: Number(row.location_lat),
        longitude: Number(row.location_lng),
      },
    });
  }

  return stripUndefined({
    precision: 'approximate',
    label: 'Approximate job area',
    coordinate: {
      latitude: approximateCoordinate(row.location_lat),
      longitude: approximateCoordinate(row.location_lng),
    },
  });
}

function workerLiveLocation(row, viewerRole, now = Date.now()) {
  if (viewerRole !== 'customer') return undefined;
  if (!['en_route', 'arrived', 'scope_confirmation', 'work_active'].includes(deriveOperationalPhase(row))) {
    return undefined;
  }
  if (row.current_lat === null || row.current_lat === undefined
      || row.current_lng === null || row.current_lng === undefined
      || !row.location_updated_at) return undefined;

  const updatedAt = new Date(row.location_updated_at);
  const ageMs = now - updatedAt.getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > LIVE_HARD_HIDE_MS) return undefined;

  return {
    coordinate: { latitude: Number(row.current_lat), longitude: Number(row.current_lng) },
    updatedAt: updatedAt.toISOString(),
    freshness: ageMs <= LIVE_FRESH_MS ? 'fresh' : 'stale',
  };
}

function participantsFor(row, viewerRole) {
  const revealContact = canRevealParticipantContact(row);
  const customer = {
    id: viewerRole === 'customer' ? row.customer_id : undefined,
    role: 'customer',
    displayName: viewerRole === 'customer' ? row.customer_name : displayFirstName(row.customer_name),
    avatarUrl: row.customer_avatar || undefined,
    phone: revealContact && viewerRole !== 'customer' ? row.customer_phone : undefined,
  };
  const worker = {
    id: row.labourer_id,
    role: 'worker',
    displayName: row.labourer_name,
    avatarUrl: row.labourer_avatar || undefined,
    phone: revealContact && viewerRole === 'customer' ? row.labourer_phone : undefined,
    trust: {
      rating: row.rating_avg === null || row.rating_count === 0 ? undefined : Number(row.rating_avg),
      reviewCount: Number(row.rating_count || 0),
      verified: Boolean(row.labourer_verified),
    },
  };
  return { customer: stripUndefined(customer), worker: stripUndefined(worker) };
}

function paymentFor(row) {
  return stripUndefined({
    status: row.payment_status || 'not_created',
    recordId: row.payment_id || undefined,
    amount: row.payment_amount === null || row.payment_amount === undefined
      ? undefined
      : String(row.payment_amount),
    currency: row.payment_currency || 'ZAR',
    updatedAt: row.payment_created_at ? new Date(row.payment_created_at).toISOString() : undefined,
  });
}

function commercialFor(row) {
  return stripUndefined({
    currency: 'ZAR',
    agreedTotal: row.total_amount === null || row.total_amount === undefined
      ? undefined
      : String(row.total_amount),
    estimatedHours: row.hours_est === null || row.hours_est === undefined
      ? undefined
      : String(row.hours_est),
    source: 'server_booking_record',
    frozenSnapshot: row.snapshot_id ? {
      id: row.snapshot_id,
      version: Number(row.snapshot_version),
      capturedAt: new Date(row.snapshot_captured_at).toISOString(),
    } : undefined,
    acceptedQuote: row.agreement_quote_id ? {
      quoteId: row.agreement_quote_id,
      quoteVersion: Number(row.agreement_quote_version),
      scope: row.catalogue_scope_snapshot,
      commercial: row.catalogue_commercial_snapshot,
      schedule: row.catalogue_schedule_snapshot,
    } : undefined,
  });
}

function completionFor(row) {
  if (!row.completion_status) return { status: 'not_requested' };
  return stripUndefined({
    status: row.completion_status,
    requestedAt: row.completion_requested_at
      ? new Date(row.completion_requested_at).toISOString()
      : undefined,
    decidedAt: row.completion_decided_at
      ? new Date(row.completion_decided_at).toISOString()
      : undefined,
    issue: row.issue_id ? {
      id: row.issue_id,
      status: row.issue_status,
      reason: row.issue_reason,
      openedAt: new Date(row.issue_opened_at).toISOString(),
    } : undefined,
  });
}

const TIMELINE_LABELS = Object.freeze({
  'project.created': 'Project created',
  'completion.requested': 'Worker requested completion',
  'completion.confirmed': 'Customer confirmed completion',
  'completion.disputed': 'Customer reported an issue',
  'booking.completed': 'Job marked complete',
});

function timelineFor(eventRows = []) {
  return eventRows.map((event) => ({
    id: event.id,
    sequence: Number(event.aggregate_sequence),
    type: event.event_type,
    label: TIMELINE_LABELS[event.event_type] || 'Project updated',
    phase: event.operational_phase,
    bookingStatus: event.booking_status,
    actorRole: event.actor_role === 'labourer' ? 'worker' : event.actor_role,
    occurredAt: new Date(event.occurred_at).toISOString(),
  }));
}

function serializeProject(row, viewer, { detail = false, events = [], now = Date.now() } = {}) {
  const viewerRole = viewer.role;
  const projection = projectionFor(row, viewerRole);
  const base = {
    schema: SCHEMA,
    id: row.id,
    revision: Number(row.lifecycle_revision || 0),
    segment: projectSegment(row),
    transactionalStatus: row.status,
    operational: projection,
    service: stripUndefined({
      id: row.catalogue_service_id || undefined,
      version: row.catalogue_service_version === null || row.catalogue_service_version === undefined
        ? undefined
        : Number(row.catalogue_service_version),
      label: row.skill_needed,
      snapshot: row.catalogue_service_snapshot || undefined,
    }),
    schedule: {
      startsAt: new Date(row.scheduled_at).toISOString(),
      estimatedHours: row.hours_est === null || row.hours_est === undefined
        ? undefined
        : String(row.hours_est),
    },
    area: locationFor(row, viewerRole),
    participants: participantsFor(row, viewerRole),
    commercial: commercialFor(row),
    payment: paymentFor(row),
    completion: completionFor(row),
    updatedAt: new Date(row.phase_updated_at || row.completed_at || row.created_at).toISOString(),
  };

  if (detail) {
    base.scope = stripUndefined({
      serviceLabel: row.skill_needed,
      items: viewerRole === 'customer'
        ? (row.scope_items || [])
        : sanitizeScopeValue(row.scope_items || []),
      customerNotes: viewerRole === 'customer' ? row.notes || undefined : undefined,
      confirmedByCustomer: Boolean(row.scope_confirmed_by_customer),
      confirmedByWorker: Boolean(row.scope_confirmed_by_labourer),
      confirmedAt: row.scope_confirmed_at
        ? new Date(row.scope_confirmed_at).toISOString()
        : undefined,
    });
    base.workerLiveLocation = workerLiveLocation(row, viewerRole, now);
    base.timeline = timelineFor(events);
  }

  return stripUndefined(base);
}

module.exports = {
  SCHEMA,
  LIVE_FRESH_MS,
  LIVE_HARD_HIDE_MS,
  approximateCoordinate,
  redactSensitiveText,
  sanitizeScopeValue,
  serializeProject,
  timelineFor,
};
