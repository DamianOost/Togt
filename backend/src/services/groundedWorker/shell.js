const {
  loadWorkerProfile,
  listWorkerOfferings,
  listAcknowledgements,
} = require('./store');
const { serializeActivation } = require('./projections');
const { matchScopeSummary } = require('../../lib/privacy');

const OFFER_SCHEMA = 'togt.worker-offers.v1';

function firstName(value) {
  if (typeof value !== 'string') return 'Customer';
  return value.trim().split(/\s+/)[0] || 'Customer';
}

function iso(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function approximateArea(row) {
  const latitude = Number(row.location_lat);
  const longitude = Number(row.location_lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return `Approx. area ${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;
}

function offerStatus(row, now, pingTimeoutMs) {
  if (row.attempt_status === 'accepted') return 'accepted';
  if (row.attempt_status === 'declined') return 'declined';
  if (row.attempt_status === 'timeout') return 'expired';
  if (row.attempt_status === 'cancelled' || row.match_status === 'cancelled') return 'withdrawn';
  if (row.match_status === 'matched') {
    return row.matched_labourer_id === row.labourer_id ? 'accepted' : 'taken';
  }
  if (row.match_status === 'expired') return 'expired';
  const requestExpiry = new Date(row.request_expires_at).getTime();
  const attemptExpiry = new Date(row.pinged_at).getTime() + pingTimeoutMs;
  if (!Number.isFinite(requestExpiry) || !Number.isFinite(attemptExpiry)) return 'expired';
  return row.match_status === 'pending' && Math.min(requestExpiry, attemptExpiry) > now.getTime()
    ? 'open'
    : 'expired';
}

function offerExpiry(row, pingTimeoutMs) {
  const requestExpiry = new Date(row.request_expires_at).getTime();
  const attemptExpiry = new Date(row.pinged_at).getTime() + pingTimeoutMs;
  const value = Math.min(requestExpiry, attemptExpiry);
  return Number.isFinite(value) ? new Date(value).toISOString() : null;
}

async function workerAcceptancePermission(queryable, workerId, now) {
  const worker = await loadWorkerProfile(queryable, workerId);
  if (!worker) return null;
  const [offerings, acknowledgements] = await Promise.all([
    listWorkerOfferings(queryable, workerId),
    listAcknowledgements(queryable, workerId),
  ]);
  const activation = serializeActivation(worker, offerings, acknowledgements, now);
  const readiness = activation.onlinePermission?.status === 'supported'
    ? activation.onlinePermission.value
    : null;
  if (worker.is_available !== true) {
    return {
      allowed: false,
      reasonCode: 'worker_offline',
      explanation: 'The server-confirmed Worker availability state is Offline.',
    };
  }
  if (!readiness?.allowed) {
    return {
      allowed: false,
      reasonCode: readiness?.reasonCode || 'worker_online_permission_unavailable',
      explanation: readiness?.explanation
        || 'The server could not confirm every prerequisite required for this offer.',
    };
  }
  return {
    allowed: true,
    reasonCode: 'worker_offer_acceptance_prerequisites_passed',
    explanation: 'The server confirmed current Worker availability and activation prerequisites.',
  };
}

const OFFER_SELECT = `
  SELECT a.id AS attempt_id, a.labourer_id, a.status AS attempt_status,
         a.pinged_at, a.responded_at,
         m.id AS match_id, m.status AS match_status, m.skill_needed,
         m.address AS private_address,
         m.location_lat, m.location_lng, m.scheduled_at, m.hours_est,
         m.expires_at AS request_expires_at, m.matched_labourer_id,
         m.created_at, u.name AS customer_name, u.is_verified AS customer_verified
    FROM match_attempts a
    JOIN match_requests m ON m.id = a.match_request_id
    JOIN users u ON u.id = m.customer_id
`;

async function listOfferRows(queryable, workerId, { offerId = null, limit = 100 } = {}) {
  const parameters = [workerId];
  let where = 'WHERE a.labourer_id = $1';
  if (offerId) {
    parameters.push(offerId);
    where += ` AND m.id = $${parameters.length}`;
  }
  parameters.push(limit);
  const result = await queryable.query(
    `${OFFER_SELECT}
      ${where}
      ORDER BY a.pinged_at DESC, a.id DESC
      LIMIT $${parameters.length}`,
    parameters
  );
  return result.rows;
}

function serializeWorkerOffer(row, permission, now, pingTimeoutMs) {
  const status = offerStatus(row, now, pingTimeoutMs);
  const scopeSummary = matchScopeSummary(row);
  const durationMinutes = row.hours_est === null || row.hours_est === undefined
    ? null
    : Number(row.hours_est) * 60;
  const validDuration = Number.isFinite(durationMinutes) && durationMinutes > 0
    ? Math.round(durationMinutes)
    : null;
  return {
    id: row.match_id,
    kind: 'instant',
    matchingMode: 'fast_match',
    status,
    serverExpiresAt: offerExpiry(row, pingTimeoutMs),
    serviceLabel: scopeSummary,
    customer: {
      displayName: firstName(row.customer_name),
      trust: row.customer_verified === true
        ? [{ kind: 'verified_account', label: 'Server account verification recorded' }]
        : [],
    },
    broadAreaLabel: approximateArea(row),
    schedule: {
      kind: 'scheduled',
      startsAt: iso(row.scheduled_at),
      timezone: 'Africa/Johannesburg',
    },
    expectedDuration: validDuration === null
      ? null
      : { minimumMinutes: validDuration, maximumMinutes: validDuration },
    travel: null,
    scopeSummary,
    attachmentCount: null,
    commercial: null,
    acceptancePermission: status === 'open'
      ? permission
      : {
          allowed: false,
          reasonCode: `worker_offer_${status}`,
          explanation: 'The server no longer reports this offer as open.',
        },
    observedAt: now.toISOString(),
  };
}

async function listWorkerOffers(queryable, workerId, { now = new Date(), pingTimeoutMs }) {
  const [rows, permission] = await Promise.all([
    listOfferRows(queryable, workerId),
    workerAcceptancePermission(queryable, workerId, now),
  ]);
  if (!permission) return null;
  return rows
    .map((row) => serializeWorkerOffer(row, permission, now, pingTimeoutMs))
    .filter((offer) => offer.status === 'open');
}

async function getWorkerOffer(queryable, workerId, offerId, { now = new Date(), pingTimeoutMs }) {
  const [rows, permission] = await Promise.all([
    listOfferRows(queryable, workerId, { offerId, limit: 1 }),
    workerAcceptancePermission(queryable, workerId, now),
  ]);
  if (!permission) return null;
  return rows[0] ? serializeWorkerOffer(rows[0], permission, now, pingTimeoutMs) : undefined;
}

module.exports = {
  OFFER_SCHEMA,
  offerStatus,
  serializeWorkerOffer,
  listWorkerOffers,
  getWorkerOffer,
};
