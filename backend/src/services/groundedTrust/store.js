const BOOKING_RELATIONSHIP_SELECT = `
  SELECT b.*,
         worker.name AS worker_name,
         worker.avatar_url AS worker_avatar,
         completion.status AS completion_status,
         payment.id AS payment_id,
         payment.status AS payment_status,
         payment.amount AS payment_amount,
         payment.currency AS payment_currency,
         agreement.service_id AS agreement_service_id,
         agreement.service_version AS agreement_service_version,
         agreement.service_snapshot AS agreement_service_snapshot,
         agreement.scope_snapshot AS agreement_scope_snapshot,
         current_scope.scope_snapshot AS current_scope_snapshot,
         current_scope.source AS current_scope_source,
         agreement.commercial_snapshot AS agreement_commercial_snapshot,
         catalogue.cancellation_policy_version,
         catalogue.recurrence_eligible
    FROM bookings b
    JOIN users worker ON worker.id = b.labourer_id
    LEFT JOIN grounded_project_completions completion ON completion.booking_id = b.id
    LEFT JOIN LATERAL (
      SELECT p.id, p.status, p.amount, p.currency
        FROM payments p
       WHERE p.booking_id = b.id
       ORDER BY p.created_at DESC, p.id DESC
       LIMIT 1
    ) payment ON TRUE
    LEFT JOIN grounded_booking_agreement_snapshots agreement ON agreement.booking_id = b.id
    LEFT JOIN LATERAL (
      SELECT scope.scope_snapshot, scope.source
        FROM grounded_scope_versions scope
       WHERE scope.booking_id = b.id AND scope.status = 'confirmed'
       ORDER BY scope.version DESC
       LIMIT 1
    ) current_scope ON TRUE
    LEFT JOIN service_catalogue_versions catalogue
      ON catalogue.service_id = agreement.service_id
     AND catalogue.service_version = agreement.service_version
`;

async function getRelationshipBooking(queryable, bookingId, actor, { forUpdate = false } = {}) {
  const result = await queryable.query(
    `${BOOKING_RELATIONSHIP_SELECT}
      WHERE b.id = $1
        AND (b.customer_id = $2 OR b.labourer_id = $2)
      ${forUpdate ? 'FOR UPDATE OF b' : ''}`,
    [bookingId, actor.id]
  );
  return result.rows[0] || null;
}

async function relationshipEligible(queryable, booking) {
  const result = await queryable.query(
    'SELECT grounded_relationship_eligible($1, $2, $3) AS eligible',
    [booking.id, booking.customer_id, booking.labourer_id]
  );
  return Boolean(result.rows[0]?.eligible);
}

async function pairBlocked(queryable, userA, userB) {
  const result = await queryable.query(
    'SELECT grounded_relationship_pair_blocked($1, $2) AS blocked',
    [userA, userB]
  );
  return Boolean(result.rows[0]?.blocked);
}

async function listFavouriteRows(queryable, customerId) {
  const result = await queryable.query(
    `SELECT f.*, u.name AS worker_name, u.avatar_url AS worker_avatar
       FROM grounded_favourites f
       JOIN users u ON u.id = f.worker_id
      WHERE f.customer_id = $1 AND f.status = 'active'
      ORDER BY f.updated_at DESC, f.id DESC`,
    [customerId]
  );
  return result.rows;
}

async function getRebookDraft(queryable, draftId, customerId, { forUpdate = false } = {}) {
  const result = await queryable.query(
    `SELECT d.*, u.name AS worker_name
       FROM grounded_rebook_drafts d
       JOIN users u ON u.id = d.preferred_worker_id
      WHERE d.id = $1 AND d.customer_id = $2
      ${forUpdate ? 'FOR UPDATE OF d' : ''}`,
    [draftId, customerId]
  );
  return result.rows[0] || null;
}

async function listRebookDrafts(queryable, customerId) {
  const result = await queryable.query(
    `SELECT d.*, u.name AS worker_name
       FROM grounded_rebook_drafts d
       JOIN users u ON u.id = d.preferred_worker_id
      WHERE d.customer_id = $1
      ORDER BY d.updated_at DESC, d.id DESC`,
    [customerId]
  );
  return result.rows;
}

async function getIncident(queryable, incidentId, reporterId, { forUpdate = false } = {}) {
  const result = await queryable.query(
    `SELECT * FROM grounded_support_incidents
      WHERE id = $1 AND reporter_user_id = $2
      ${forUpdate ? 'FOR UPDATE' : ''}`,
    [incidentId, reporterId]
  );
  return result.rows[0] || null;
}

async function listIncidents(queryable, reporterId, kind) {
  const result = await queryable.query(
    `SELECT * FROM grounded_support_incidents
      WHERE reporter_user_id = $1
        AND ($2::text IS NULL OR case_kind = $2)
      ORDER BY created_at DESC, id DESC
      LIMIT 100`,
    [reporterId, kind || null]
  );
  return result.rows;
}

async function getSeriesRow(queryable, seriesId, actor, { forUpdate = false } = {}) {
  const result = await queryable.query(
    `SELECT s.*, worker.name AS worker_name
       FROM grounded_recurring_series s
       JOIN users worker ON worker.id = s.worker_id
      WHERE s.id = $1
        AND (s.customer_id = $2 OR s.worker_id = $2)
      ${forUpdate ? 'FOR UPDATE OF s' : ''}`,
    [seriesId, actor.id]
  );
  return result.rows[0] || null;
}

async function getSeriesBundle(queryable, seriesId, actor, { forUpdate = false } = {}) {
  const series = await getSeriesRow(queryable, seriesId, actor, { forUpdate });
  if (!series) return null;

  const revisions = [series.current_terms_revision, series.proposed_terms_revision]
    .filter((value, index, values) => value && values.indexOf(value) === index);
  // `queryable` may be one checked-out transactional pg Client. A Client can
  // execute only one query at a time; issuing concurrent queries here relies
  // on pg's deprecated internal queueing and will become an error in pg 9.
  // Keep the reads ordered so the same function is safe for Pool and Client.
  const termsResult = await queryable.query(
      `SELECT * FROM grounded_recurring_terms
        WHERE series_id = $1
          AND terms_revision = ANY($2::int[])
        ORDER BY terms_revision`,
      [series.id, revisions]
    );
  const acceptancesResult = await queryable.query(
      `SELECT a.*, s.customer_id, s.worker_id
         FROM grounded_recurring_acceptances a
         JOIN grounded_recurring_series s ON s.id = a.series_id
        WHERE a.series_id = $1
          AND a.terms_revision = ANY($2::int[])
        ORDER BY a.terms_revision, a.accepted_at`,
      [series.id, revisions]
    );
  const occurrencesResult = await queryable.query(
      `SELECT * FROM grounded_recurring_occurrences
        WHERE series_id = $1
          AND terms_revision = ANY($2::int[])
        ORDER BY terms_revision, sequence_number`,
      [series.id, revisions]
    );
  const changesResult = await queryable.query(
      `SELECT c.*, s.customer_id, s.worker_id
         FROM grounded_recurring_occurrence_changes c
         JOIN grounded_recurring_series s ON s.id = c.series_id
        WHERE c.series_id = $1 AND c.status = 'pending'
        ORDER BY c.requested_at, c.id`,
      [series.id]
    );
  const termByRevision = new Map(termsResult.rows.map((row) => [Number(row.terms_revision), row]));
  return {
    series,
    currentTerms: termByRevision.get(Number(series.current_terms_revision)) || null,
    proposedTerms: termByRevision.get(Number(series.proposed_terms_revision)) || null,
    acceptances: acceptancesResult.rows,
    occurrences: occurrencesResult.rows,
    changes: changesResult.rows,
  };
}

async function listSeriesBundles(queryable, actor) {
  const result = await queryable.query(
    `SELECT id FROM grounded_recurring_series
      WHERE customer_id = $1 OR worker_id = $1
      ORDER BY updated_at DESC, id DESC
      LIMIT 100`,
    [actor.id]
  );
  const bundles = [];
  for (const row of result.rows) {
    const bundle = await getSeriesBundle(queryable, row.id, actor);
    if (bundle) bundles.push(bundle);
  }
  return bundles;
}

module.exports = {
  BOOKING_RELATIONSHIP_SELECT,
  getRelationshipBooking,
  relationshipEligible,
  pairBlocked,
  listFavouriteRows,
  getRebookDraft,
  listRebookDrafts,
  getIncident,
  listIncidents,
  getSeriesRow,
  getSeriesBundle,
  listSeriesBundles,
};
