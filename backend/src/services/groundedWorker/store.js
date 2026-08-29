const db = require('../../config/db');

const WORKER_PROFILE_SELECT = `
  SELECT u.id AS worker_id, u.name AS account_name,
         u.email IS NOT NULL AS contact_present,
         u.is_verified AS legacy_account_verified,
         u.kyc_status, u.avatar_url, u.profile_photo,
         u.emergency_contact,
         lp.bio AS legacy_bio, lp.current_lat, lp.current_lng,
         lp.location_updated_at, lp.is_available,
         p.public_display_name, p.about_experience, p.revision AS profile_revision,
         k.status AS verification_status, k.provider AS verification_provider,
         k.verified_at AS verification_verified_at,
         COALESCE(s.revision, 1) AS activation_revision,
         COALESCE(s.updated_at, u.created_at) AS activation_updated_at
    FROM users u
    JOIN labourer_profiles lp ON lp.user_id = u.id
    LEFT JOIN grounded_worker_public_profiles p ON p.worker_id = u.id
    LEFT JOIN grounded_worker_activation_state s ON s.worker_id = u.id
    LEFT JOIN LATERAL (
      SELECT status, provider, verified_at
        FROM kyc_verifications
       WHERE user_id = u.id
       ORDER BY created_at DESC, id DESC
       LIMIT 1
    ) k ON true
   WHERE u.id = $1 AND u.role = 'labourer'
`;

const OFFERING_SELECT = `
  SELECT o.id, o.worker_id, o.service_id, o.service_version,
         o.customer_facing_title, o.description, o.hourly_rate_minor,
         o.minimum_duration_minutes, o.call_out_amount_minor,
         o.service_area_label, o.revision, o.updated_at,
         i.status AS opt_in_status, i.opted_in_at, i.deactivated_at,
         c.canonical_key, c.category_key, c.label_en_za, c.description_en_za,
         c.pricing_mode, c.fulfilment_mode, c.risk_tier,
         c.minimum_duration_minutes AS catalogue_minimum_duration_minutes,
         c.call_out_fee AS catalogue_call_out_fee, c.currency,
         c.pricing_rules, c.worker_eligibility,
         c.is_published, c.published_at, c.retired_at
    FROM grounded_worker_service_offerings o
    JOIN service_catalogue_versions c
      ON c.service_id = o.service_id AND c.service_version = o.service_version
    LEFT JOIN catalogue_worker_opt_ins i
      ON i.worker_id = o.worker_id
     AND i.service_id = o.service_id
     AND i.service_version = o.service_version
`;

async function loadWorkerProfile(queryable = db, workerId, { lock = false } = {}) {
  const result = await queryable.query(
    `${WORKER_PROFILE_SELECT} ${lock ? 'FOR UPDATE OF u, lp' : ''}`,
    [workerId]
  );
  return result.rows[0] || null;
}

async function listWorkerOfferings(queryable = db, workerId, { lock = false } = {}) {
  const result = await queryable.query(
    `${OFFERING_SELECT}
      WHERE o.worker_id = $1
      ORDER BY c.category_key, c.label_en_za, o.id
      ${lock ? 'FOR UPDATE OF o' : ''}`,
    [workerId]
  );
  return result.rows;
}

async function loadWorkerOffering(queryable, workerId, offeringId, { lock = false } = {}) {
  const result = await queryable.query(
    `${OFFERING_SELECT}
      WHERE o.worker_id = $1 AND o.id = $2
      ${lock ? 'FOR UPDATE OF o' : ''}`,
    [workerId, offeringId]
  );
  return result.rows[0] || null;
}

async function loadCatalogueService(queryable, serviceId, serviceVersion, { lock = false } = {}) {
  const result = await queryable.query(
    `SELECT * FROM service_catalogue_versions
      WHERE service_id = $1 AND service_version = $2
        AND is_published = true AND retired_at IS NULL
      ${lock ? 'FOR SHARE' : ''}`,
    [serviceId, serviceVersion]
  );
  return result.rows[0] || null;
}

async function listAcknowledgements(queryable = db, workerId) {
  const result = await queryable.query(
    `SELECT acknowledgement_kind, policy_version, acknowledged_at, revision
       FROM grounded_worker_activation_acknowledgements
      WHERE worker_id = $1
      ORDER BY acknowledgement_kind`,
    [workerId]
  );
  return result.rows;
}

async function loadAcknowledgement(queryable, workerId, kind, { lock = false } = {}) {
  const result = await queryable.query(
    `SELECT acknowledgement_kind, policy_version, acknowledged_at, revision
       FROM grounded_worker_activation_acknowledgements
      WHERE worker_id = $1 AND acknowledgement_kind = $2
      ${lock ? 'FOR UPDATE' : ''}`,
    [workerId, kind]
  );
  return result.rows[0] || null;
}

async function ensureActivationState(queryable, workerId) {
  const result = await queryable.query(
    `INSERT INTO grounded_worker_activation_state (worker_id)
     VALUES ($1)
     ON CONFLICT (worker_id) DO UPDATE SET worker_id = EXCLUDED.worker_id
     RETURNING revision, updated_at`,
    [workerId]
  );
  return result.rows[0];
}

async function bumpActivationState(queryable, workerId) {
  const result = await queryable.query(
    `INSERT INTO grounded_worker_activation_state (worker_id, revision)
     VALUES ($1, 2)
     ON CONFLICT (worker_id) DO UPDATE
       SET revision = grounded_worker_activation_state.revision + 1,
           updated_at = NOW()
     RETURNING revision, updated_at`,
    [workerId]
  );
  return result.rows[0];
}

module.exports = {
  WORKER_PROFILE_SELECT,
  OFFERING_SELECT,
  loadWorkerProfile,
  listWorkerOfferings,
  loadWorkerOffering,
  loadCatalogueService,
  listAcknowledgements,
  loadAcknowledgement,
  ensureActivationState,
  bumpActivationState,
};
