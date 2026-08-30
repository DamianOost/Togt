const SCHEMA = 'togt.fulfilment.v1';
const {
  LEGACY_MATERIALS_RESPONSIBILITY,
  canonicalScopeSnapshot,
  scopeMaterialsResolved,
} = require('./scope');

function iso(value) {
  return value == null ? null : new Date(value).toISOString();
}

function scrub(value, depth = 0) {
  if (depth > 5) return '[omitted]';
  if (typeof value === 'string') {
    return value
      .replace(/(?:\+?27|0)[\s-]?[6-8][\d\s-]{7,12}\d/g, '[contact removed]')
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[contact removed]');
  }
  if (Array.isArray(value)) return value.map((item) => scrub(item, depth + 1));
  if (!value || typeof value !== 'object') return value;
  const blocked = /(address|phone|email|contact|latitude|longitude|gps|pin|secret|token)/i;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !blocked.test(key))
      .map(([key, child]) => [key, scrub(child, depth + 1)])
  );
}

function workerExactAccess(booking) {
  return booking.route_access_granted_at != null
    && booking.fulfilment_access_revoked_at == null
    && ['en_route', 'arrived', 'scope_confirmation', 'work_active', 'completion_review']
      .includes(booking.operational_phase)
    && !['completed', 'cancelled', 'terminated_after_start'].includes(booking.status);
}

function locationFor(booking, actor) {
  if (actor.role === 'customer' || (actor.role === 'labourer' && workerExactAccess(booking))) {
    return {
      precision: 'exact',
      address: booking.address,
      coordinate: { latitude: Number(booking.location_lat), longitude: Number(booking.location_lng) },
    };
  }
  return {
    precision: 'approximate',
    label: 'Approximate job area',
    coordinate: {
      latitude: Number(Number(booking.location_lat).toFixed(2)),
      longitude: Number(Number(booking.location_lng).toFixed(2)),
    },
  };
}

function participantsFor(booking, actor) {
  const reveal = workerExactAccess(booking);
  return {
    customer: {
      displayName: actor.role === 'customer'
        ? booking.customer_name
        : String(booking.customer_name || 'Customer').trim().split(/\s+/)[0],
      avatarUrl: booking.customer_avatar || null,
      phone: actor.role === 'labourer' && reveal ? booking.customer_phone : null,
    },
    worker: {
      displayName: booking.worker_name,
      avatarUrl: booking.worker_avatar || null,
      phone: actor.role === 'customer' && reveal ? booking.worker_phone : null,
    },
  };
}

function scopeDto(row, actor) {
  if (!row) return null;
  const snapshot = canonicalScopeSnapshot(row.scope_snapshot, row.source);
  return {
    version: Number(row.version),
    baseVersion: row.base_version == null ? null : Number(row.base_version),
    status: row.status,
    source: row.source,
    proposedByRole: row.proposed_by_role === 'labourer' ? 'worker' : row.proposed_by_role,
    snapshot: actor.role === 'labourer' ? scrub(snapshot) : snapshot,
    confirmations: {
      customer: iso(row.customer_confirmed_at),
      worker: iso(row.worker_confirmed_at),
    },
    declinedAt: iso(row.declined_at),
    createdAt: iso(row.created_at),
  };
}

function pinDto(pin, actions) {
  if (!pin) {
    return {
      status: 'not_issued',
      customerCanReveal: actions.revealStartPin,
      workerMustEnter: false,
    };
  }
  return {
    status: pin.status,
    scopeVersion: Number(pin.scope_version),
    failedAttempts: Number(pin.failed_attempts),
    attemptsRemaining: Math.max(0, Number(pin.max_attempts) - Number(pin.failed_attempts)),
    expiresAt: iso(pin.expires_at),
    customerCanReveal: pin.status === 'active' && actions.revealStartPin,
    workerMustEnter: pin.status === 'active' && actions.startWork,
  };
}

function rescheduleDto(row) {
  return {
    id: row.id,
    version: Number(row.version),
    scheduleRevision: Number(row.schedule_revision),
    status: row.status,
    proposedByRole: row.proposed_by_role === 'labourer' ? 'worker' : row.proposed_by_role,
    originalStartsAt: iso(row.original_scheduled_at),
    proposedStartsAt: iso(row.proposed_scheduled_at),
    reason: row.reason,
    expiresAt: iso(row.expires_at),
    decidedAt: iso(row.decided_at),
  };
}

function changeDto(row) {
  return {
    id: row.id,
    version: Number(row.version),
    baseScopeVersion: Number(row.base_scope_version),
    status: row.status,
    description: row.description,
    addedScopeItems: row.added_scope_items,
    extraMinutes: row.extra_minutes == null ? null : Number(row.extra_minutes),
    commercial: {
      labourAmount: String(row.labour_amount),
      materialsAmount: String(row.materials_amount),
      additionalAmount: String(row.additional_amount),
      originalTotalAmount: String(row.original_total_amount),
      revisedTotalAmount: String(row.revised_total_amount),
      currency: row.currency,
    },
    expiresAt: iso(row.expires_at),
    decidedAt: iso(row.decided_at),
  };
}

function allowedActions(booking, state, actor) {
  const worker = actor.role === 'labourer';
  const customer = actor.role === 'customer';
  const accepted = booking.status === 'accepted';
  const known = ['pending', 'accepted', 'in_progress', 'completed', 'cancelled', 'terminated_after_start']
    .includes(booking.status)
    && ['matching', 'assigned', 'scheduled', 'en_route', 'arrived', 'scope_confirmation',
      'work_active', 'completion_review', 'payment_pending', 'closed']
      .includes(booking.operational_phase);
  const policy = Boolean(booking.policy_version);
  const accessActive = booking.fulfilment_access_revoked_at == null;
  const noOpenRecovery = !state.noShows.some((row) => ['received', 'replacement_requested'].includes(row.status));
  const proposal = state.scopes.find((row) => row.status === 'proposed');
  const currentScope = state.scopes.find((row) => row.status === 'confirmed');
  const currentScopeReady = Boolean(currentScope
    && Number(currentScope.version) === Number(booking.current_scope_version)
    && scopeMaterialsResolved(currentScope));
  const reschedule = state.reschedules.find((row) => row.status === 'pending');
  return {
    startRoute: known && policy && accessActive && worker && accepted
      && booking.operational_phase === 'scheduled' && noOpenRecovery,
    markArrived: known && policy && accessActive && worker && accepted
      && booking.operational_phase === 'en_route' && noOpenRecovery,
    proposeScope: known && policy && accessActive && accepted
      && ['arrived', 'scope_confirmation'].includes(booking.operational_phase)
      && !proposal && noOpenRecovery,
    decideScope: known && policy && accessActive && accepted && Boolean(proposal)
      && proposal.proposed_by !== actor.id && noOpenRecovery,
    revealStartPin: known && policy && accessActive && customer && accepted
      && booking.operational_phase === 'scope_confirmation'
      && currentScopeReady && !proposal && noOpenRecovery,
    startWork: known && policy && accessActive && worker && accepted
      && booking.operational_phase === 'scope_confirmation'
      && currentScopeReady && !proposal && !reschedule && noOpenRecovery,
    proposeReschedule: known && policy && accessActive && accepted
      && booking.operational_phase === 'scheduled' && !reschedule && noOpenRecovery,
    decideReschedule: known && policy && accessActive && accepted && Boolean(reschedule)
      && reschedule.proposed_by !== actor.id && noOpenRecovery,
    proposeChangeOrder: known && policy && accessActive && worker && booking.status === 'in_progress'
      && booking.operational_phase === 'work_active'
      && !state.changes.some((row) => row.status === 'pending') && noOpenRecovery,
    decideChangeOrder: known && policy && accessActive && customer && booking.status === 'in_progress'
      && booking.operational_phase === 'work_active'
      && state.changes.some((row) => row.status === 'pending') && noOpenRecovery,
    reportNoShow: known && policy && accepted && noOpenRecovery
      && ['scheduled', 'en_route'].includes(booking.operational_phase),
    requestReplacement: known && policy && customer && accepted
      && state.noShows.some((row) => row.absent_role === 'labourer'
        && ['received', 'replacement_requested'].includes(row.status))
      && !state.replacement,
  };
}

function serializeFulfilment(booking, state, actor) {
  const currentScope = state.scopes.find((row) => row.status === 'confirmed') || null;
  const proposal = state.scopes.find((row) => row.status === 'proposed') || null;
  const actions = allowedActions(booking, state, actor);
  return {
    schema: SCHEMA,
    projectId: booking.id,
    revision: Number(booking.lifecycle_revision || 0),
    transactionalStatus: booking.status,
    operationalPhase: booking.operational_phase,
    schedule: {
      revision: Number(booking.schedule_revision || 1),
      startsAt: iso(booking.scheduled_at),
    },
    travel: {
      enRouteAt: iso(booking.en_route_at),
      arrivedAt: iso(booking.arrived_at),
      exactAccessGrantedAt: iso(booking.route_access_granted_at),
      accessRevokedAt: iso(booking.fulfilment_access_revoked_at),
      accessRevokedReason: booking.fulfilment_access_revoked_reason || null,
    },
    location: locationFor(booking, actor),
    participants: participantsFor(booking, actor),
    scope: {
      current: scopeDto(currentScope, actor),
      proposal: scopeDto(proposal, actor),
      history: state.scopes.map((row) => ({
        version: Number(row.version), status: row.status, createdAt: iso(row.created_at),
      })),
    },
    start: {
      ...pinDto(state.pin, actions),
      workStartedAt: iso(booking.work_started_at),
    },
    reschedules: state.reschedules.map(rescheduleDto),
    changeOrders: state.changes.map(changeDto),
    recovery: {
      noShows: state.noShows.map((row) => ({
        id: row.id,
        absentRole: row.absent_role === 'labourer' ? 'worker' : row.absent_role,
        status: row.status,
        reportedAt: iso(row.reported_at),
      })),
      replacement: state.replacement ? {
        id: state.replacement.id,
        status: state.replacement.status,
        createdAt: iso(state.replacement.created_at),
      } : null,
    },
    integrity: {
      policySnapshotPresent: Boolean(booking.policy_version),
      policyVersion: booking.policy_version || null,
      readOnly: !booking.policy_version
        || !['pending', 'accepted', 'in_progress', 'completed', 'cancelled', 'terminated_after_start']
          .includes(booking.status)
        || !['matching', 'assigned', 'scheduled', 'en_route', 'arrived', 'scope_confirmation',
          'work_active', 'completion_review', 'payment_pending', 'closed']
          .includes(booking.operational_phase),
    },
    allowedActions: actions,
    updatedAt: iso(booking.phase_updated_at || booking.created_at),
  };
}

module.exports = {
  SCHEMA,
  LEGACY_MATERIALS_RESPONSIBILITY,
  canonicalScopeSnapshot,
  scopeMaterialsResolved,
  scrub,
  workerExactAccess,
  serializeFulfilment,
};
