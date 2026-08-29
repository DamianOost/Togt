const db = require('../../config/db');
const { fail } = require('./contracts');

const QUOTE_SELECT = `
  SELECT q.*,
         v.scope, v.deliverables, v.exclusions, v.assumptions,
         v.proposed_start_at, v.proposed_end_at, v.duration_minutes,
         v.labour_amount, v.materials_amount, v.customer_total_amount,
         v.currency, v.platform_fee_snapshot, v.worker_net_snapshot,
         v.valid_until, v.authored_as, v.content_hash,
         u.name AS worker_name, COALESCE(u.avatar_url, u.profile_photo) AS worker_avatar,
         u.is_verified AS worker_is_verified,
         o.status AS worker_opt_in_status,
         lp.rating_avg, lp.rating_count
    FROM grounded_quotes q
    JOIN grounded_quote_requests qr ON qr.id = q.quote_request_id
    JOIN grounded_quote_versions v
      ON v.quote_id = q.id AND v.version = q.current_version
    JOIN users u ON u.id = q.worker_id
    LEFT JOIN labourer_profiles lp ON lp.user_id = q.worker_id
    LEFT JOIN catalogue_worker_opt_ins o
      ON o.worker_id = q.worker_id
     AND o.service_id = qr.service_id
     AND o.service_version = qr.service_version
`;

async function expireStale(queryable = db, requestId = null) {
  const params = requestId ? [requestId] : [];
  const requestFilter = requestId ? 'AND r.id = $1' : '';
  const quoteFilter = requestId ? 'AND q.quote_request_id = $1' : '';
  await queryable.query(
    `WITH closed_requests AS (
       UPDATE grounded_quote_requests r
          SET status = CASE
                WHEN EXISTS (
                  SELECT 1 FROM grounded_quotes prior
                   WHERE prior.quote_request_id = r.id AND prior.submitted_at IS NOT NULL
                ) THEN 'expired'
                ELSE 'no_quotes'
              END,
              request_version = request_version + 1,
              updated_at = NOW()
        WHERE r.status IN ('open', 'receiving')
          AND r.quotes_close_at <= NOW()
          ${requestFilter}
        RETURNING r.id
     )
     UPDATE grounded_quotes q
        SET status = 'expired', expired_at = NOW(), updated_at = NOW()
       FROM grounded_quote_versions v
      WHERE v.quote_id = q.id
        AND v.version = q.current_version
        AND q.status = 'submitted'
        AND (v.valid_until <= NOW() OR q.quote_request_id IN (SELECT id FROM closed_requests))
        ${quoteFilter}`,
    params
  );
}

async function getCatalogueService(queryable, serviceId, serviceVersion = null) {
  const params = [serviceId];
  let versionClause = '';
  if (serviceVersion != null) {
    params.push(serviceVersion);
    versionClause = `AND service_version = $2`;
  }
  const result = await queryable.query(
    `SELECT *
       FROM service_catalogue_versions
      WHERE service_id = $1
        ${versionClause}
        AND is_published = true
        AND retired_at IS NULL
      ORDER BY service_version DESC
      LIMIT 1`,
    params
  );
  return result.rows[0] || null;
}

async function listCatalogueServices({ categoryKey, pricingMode } = {}) {
  const params = [];
  const clauses = ['is_published = true', 'retired_at IS NULL'];
  if (categoryKey) {
    params.push(categoryKey);
    clauses.push(`category_key = $${params.length}`);
  }
  if (pricingMode) {
    params.push(pricingMode);
    clauses.push(`pricing_mode = $${params.length}`);
  }
  const result = await db.query(
    `SELECT * FROM service_catalogue_versions
      WHERE ${clauses.join(' AND ')}
      ORDER BY category_key, label_en_za, canonical_key`,
    params
  );
  return result.rows;
}

async function loadRequest(queryable, requestId, { lock = false } = {}) {
  const result = await queryable.query(
    `SELECT r.*, a.booking_id
       FROM grounded_quote_requests r
       LEFT JOIN grounded_booking_agreement_snapshots a ON a.quote_request_id = r.id
      WHERE r.id = $1
      ${lock ? 'FOR UPDATE OF r' : ''}`,
    [requestId]
  );
  return result.rows[0] || null;
}

async function loadQuote(queryable, quoteId, { lock = false } = {}) {
  const result = await queryable.query(
    `${QUOTE_SELECT} WHERE q.id = $1 ${lock ? 'FOR UPDATE OF q' : ''}`,
    [quoteId]
  );
  return result.rows[0] || null;
}

async function findQuoteRequestId(queryable, quoteId) {
  const result = await queryable.query('SELECT quote_request_id FROM grounded_quotes WHERE id = $1', [quoteId]);
  return result.rows[0]?.quote_request_id || null;
}

async function isEligibleWorker(queryable, request, workerId) {
  const result = await queryable.query(
    `SELECT u.is_verified
       FROM catalogue_worker_opt_ins o
       JOIN users u ON u.id = o.worker_id AND u.role = 'labourer'
      WHERE o.worker_id = $1
        AND o.service_id = $2
        AND o.service_version = $3
        AND o.status = 'active'`,
    [workerId, request.service_id, request.service_version]
  );
  if (!result.rows[0]) return false;
  const requiresVerified = request.service_snapshot?.workerEligibility?.requiresIdentityVerified === true;
  return !requiresVerified || result.rows[0].is_verified === true;
}

async function canWorkerReadRequest(queryable, request, workerId) {
  if (await isEligibleWorker(queryable, request, workerId)) return true;
  const own = await queryable.query(
    'SELECT 1 FROM grounded_quotes WHERE quote_request_id = $1 AND worker_id = $2',
    [request.id, workerId]
  );
  return own.rows.length > 0;
}

async function listRequestsForUser(user, status) {
  await expireStale();
  const params = [user.id];
  let statusClause = '';
  if (status) {
    params.push(status);
    statusClause = `AND r.status = $${params.length}`;
  }
  if (user.role === 'customer') {
    const result = await db.query(
      `SELECT r.*, a.booking_id
         FROM grounded_quote_requests r
         LEFT JOIN grounded_booking_agreement_snapshots a ON a.quote_request_id = r.id
        WHERE r.customer_id = $1 ${statusClause}
        ORDER BY r.created_at DESC`,
      params
    );
    return result.rows;
  }
  if (user.role === 'labourer') {
    const result = await db.query(
      `SELECT DISTINCT r.*, NULL::uuid AS booking_id
         FROM grounded_quote_requests r
         JOIN catalogue_worker_opt_ins o
           ON o.service_id = r.service_id
          AND o.service_version = r.service_version
          AND o.worker_id = $1
          AND o.status = 'active'
         JOIN users u ON u.id = o.worker_id AND u.role = 'labourer'
        WHERE (
          COALESCE(r.service_snapshot->'workerEligibility'->>'requiresIdentityVerified', 'false') <> 'true'
          OR u.is_verified = true
        )
          ${statusClause}
        ORDER BY r.created_at DESC`,
      params
    );
    return result.rows;
  }
  fail('auth_forbidden_role', 'Quote requests require a customer or worker role', 403);
}

async function listQuotes(queryable, requestId, viewer) {
  const params = [requestId];
  let visibility;
  if (viewer.role === 'customer') {
    visibility = `AND q.status <> 'draft'`;
  } else {
    params.push(viewer.id);
    visibility = `AND q.worker_id = $2`;
  }
  const result = await queryable.query(
    `${QUOTE_SELECT}
      WHERE q.quote_request_id = $1
        ${visibility}
      ORDER BY q.created_at, q.id`,
    params
  );
  return result.rows;
}

module.exports = {
  QUOTE_SELECT,
  expireStale,
  getCatalogueService,
  listCatalogueServices,
  loadRequest,
  loadQuote,
  findQuoteRequestId,
  isEligibleWorker,
  canWorkerReadRequest,
  listRequestsForUser,
  listQuotes,
};
