const PHASES = Object.freeze([
  'matching',
  'assigned',
  'scheduled',
  'en_route',
  'arrived',
  'scope_confirmation',
  'work_active',
  'completion_review',
  'payment_pending',
  'closed',
]);

const ACTIVE_LOCATION_PHASES = new Set([
  'en_route',
  'arrived',
  'scope_confirmation',
  'work_active',
  'completion_review',
]);

const PAYMENT_TERMINAL_STATUSES = new Set(['paid', 'refunded']);

function paymentStatus(row = {}) {
  return row.payment_status || null;
}

function deriveOperationalPhase(row = {}) {
  if (row.completion_status === 'requested' || row.completion_status === 'disputed') {
    return 'completion_review';
  }

  switch (row.status) {
    case 'pending':
      return row.operational_phase === 'assigned' ? 'assigned' : 'matching';
    case 'accepted':
      if (['assigned', 'scheduled', 'en_route', 'arrived', 'scope_confirmation'].includes(row.operational_phase)) {
        return row.operational_phase;
      }
      return 'scheduled';
    case 'in_progress':
      return row.completion_status ? 'completion_review' : 'work_active';
    case 'completed':
      return PAYMENT_TERMINAL_STATUSES.has(paymentStatus(row)) ? 'closed' : 'payment_pending';
    case 'cancelled':
    case 'terminated_after_start':
      return 'closed';
    default:
      return PHASES.includes(row.operational_phase) ? row.operational_phase : 'closed';
  }
}

function projectSegment(row = {}) {
  const phase = deriveOperationalPhase(row);
  if (row.completion_status === 'disputed') return 'active';
  if (row.status === 'completed' && phase === 'payment_pending') return 'active';
  if (row.status === 'completed' || row.status === 'cancelled' || row.status === 'terminated_after_start') {
    return 'past';
  }
  if (['pending', 'accepted'].includes(row.status) && ['assigned', 'scheduled'].includes(phase)) {
    return 'upcoming';
  }
  return 'active';
}

const CUSTOMER_PROJECTION = Object.freeze({
  matching: ['Finding a worker', 'view_progress'],
  assigned: ['Waiting for worker confirmation', 'review_details'],
  scheduled: ['Worker confirmed', 'review_details'],
  en_route: ['Worker on the way', 'track_worker'],
  arrived: ['Worker has arrived', 'review_scope'],
  scope_confirmation: ['Review the work', 'confirm_scope'],
  work_active: ['Work in progress', 'monitor_work'],
  completion_review: ['Confirm completion', 'decide_completion'],
  payment_pending: ['Payment required or processing', 'review_payment'],
  closed: ['Job complete', 'view_receipt'],
});

const WORKER_PROJECTION = Object.freeze({
  matching: ['Offer pending', 'review_offer'],
  assigned: ['Job assigned', 'review_job'],
  scheduled: ['Job confirmed', 'review_job'],
  en_route: ['Navigating', 'mark_arrived'],
  arrived: ['At the job', 'review_scope'],
  scope_confirmation: ['Confirm on-site scope', 'confirm_scope'],
  work_active: ['Job in progress', 'request_completion'],
  completion_review: ['Waiting for customer', 'view_completion'],
  payment_pending: ['Payment pending', 'view_payment_status'],
  closed: ['Job complete', 'view_history'],
});

function projectionFor(row, viewerRole) {
  const phase = deriveOperationalPhase(row);
  const projection = viewerRole === 'customer' ? CUSTOMER_PROJECTION : WORKER_PROJECTION;
  const knownStatus = ['pending', 'accepted', 'in_progress', 'completed', 'cancelled', 'terminated_after_start']
    .includes(row.status);
  if (!knownStatus || !projection[phase]) {
    return {
      phase,
      label: 'Status unavailable',
      dominantAction: 'view_support',
      readOnly: true,
    };
  }
  const [label, dominantAction] = projection[phase] || ['Status unavailable', 'view_support'];

  if (row.completion_status === 'disputed') {
    return {
      phase,
      label: 'Under review',
      dominantAction: 'view_issue',
      readOnly: true,
    };
  }

  if (row.status === 'cancelled') {
    return { phase, label: 'Cancelled', dominantAction: 'view_support', readOnly: true };
  }
  if (row.status === 'terminated_after_start') {
    return { phase, label: 'Work stopped', dominantAction: 'view_support', readOnly: true };
  }

  return { phase, label, dominantAction, readOnly: !projection[phase] };
}

function canRevealExactJobLocation(row, viewerRole) {
  if (viewerRole === 'customer') return true;
  const phase = deriveOperationalPhase(row);
  return row.status !== 'completed'
    && row.status !== 'cancelled'
    && row.status !== 'terminated_after_start'
    && ACTIVE_LOCATION_PHASES.has(phase);
}

function canRevealParticipantContact(row) {
  const phase = deriveOperationalPhase(row);
  return row.status !== 'completed'
    && row.status !== 'cancelled'
    && row.status !== 'terminated_after_start'
    && ACTIVE_LOCATION_PHASES.has(phase);
}

module.exports = {
  PHASES,
  ACTIVE_LOCATION_PHASES,
  deriveOperationalPhase,
  projectSegment,
  projectionFor,
  canRevealExactJobLocation,
  canRevealParticipantContact,
};
