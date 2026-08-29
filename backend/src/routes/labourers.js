const express = require('express');
const db = require('../config/db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { problemResponse } = require('../lib/problemJson');
const { publicReviewComment } = require('../lib/publicReview');
const { containsPublicContactDetails, publicTextOrNull } = require('../lib/publicText');
const { isLocationFresh, serializeLabourerPublic, serializeLabourerOwnProfile } = require('../lib/privacy');
const {
  loadWorkerProfile,
  listWorkerOfferings,
  listAcknowledgements,
} = require('../services/groundedWorker/store');
const { assertUuid } = require('../services/groundedWorker/contracts');
const {
  offeringEligibility,
  serializeActivation,
  serializeOffering,
  serializePublicProfile,
} = require('../services/groundedWorker/projections');

const router = express.Router();
const GROUNDED_PUBLIC_PROFILE_SCHEMA = 'togt.grounded-worker-public-profile.v1';

function requireMarketplaceRole(req, res, next) {
  if (req.user?.role === 'customer' || req.user?.role === 'labourer') return next();
  return problemResponse(res, {
    type: 'auth_forbidden_role',
    title: 'Requires a marketplace role',
    status: 403,
    detail: 'This endpoint is restricted to authenticated customer and labourer accounts.',
    instance: req.originalUrl,
  });
}

function publicGroundedOffering(row, worker) {
  const offering = serializeOffering(row, worker);
  return {
    offeringId: offering.offeringId,
    serviceId: offering.facts.serviceId,
    serviceVersion: offering.facts.serviceVersion,
    canonicalCategory: offering.facts.canonicalCategory,
    catalogueLabel: offering.facts.catalogueLabel,
    title: publicTextOrNull(offering.customerFacingTitle, { maxLength: 120 }) || '',
    description: publicTextOrNull(offering.description, { maxLength: 1_500 }) || '',
    pricingMode: offering.facts.pricingMode,
    fixedCustomerAmount: offering.facts.fixedCustomerAmount,
    hourlyRate: offering.hourlyRate,
    minimumDurationMinutes: offering.minimumDurationMinutes,
    callOutAmount: offering.callOutAmount,
    serviceAreaLabel: publicTextOrNull(offering.serviceAreaLabel, { maxLength: 160 }) || '',
  };
}

// Haversine formula to calculate distance in km
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// GET /labourers?lat=&lng=&skill=&radius=
router.get('/', async (req, res, next) => {
  try {
    const { lat, lng, skill, radius = 25 } = req.query;

    let query = `
      SELECT u.id, u.name, u.avatar_url,
             lp.skills, lp.hourly_rate, lp.bio,
             lp.is_available, lp.current_lat, lp.current_lng, lp.location_updated_at,
             lp.rating_avg, lp.rating_count
      FROM users u
      JOIN labourer_profiles lp ON u.id = lp.user_id
      WHERE u.role = 'labourer' AND lp.is_available = true
    `;
    const params = [];

    if (skill) {
      params.push(`%${skill.toLowerCase()}%`);
      query += ` AND EXISTS (
        SELECT 1 FROM unnest(lp.skills) s WHERE lower(s) LIKE $${params.length}
      )`;
    }

    const result = await db.query(query, params);
    let labourers = result.rows;

    // Filter by radius if coordinates provided
    if (lat && lng) {
      const userLat = parseFloat(lat);
      const userLng = parseFloat(lng);
      const maxRadius = parseFloat(radius);

      labourers = labourers
        .filter((l) => l.current_lat && l.current_lng && isLocationFresh(l))
        .map((l) => ({
          ...l,
          distance_km: haversineKm(userLat, userLng, l.current_lat, l.current_lng),
        }))
        .filter((l) => l.distance_km <= maxRadius)
        .sort((a, b) => a.distance_km - b.distance_km);
    }

    res.json({ labourers: labourers.map(serializeLabourerPublic) });
  } catch (err) {
    next(err);
  }
});

// GET /labourers/profile — get own profile (labourer)
router.get('/profile', authMiddleware, requireRole('labourer'), async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT lp.*, u.name, u.email, u.phone, u.avatar_url, u.emergency_contact
       FROM labourer_profiles lp
       JOIN users u ON lp.user_id = u.id
       WHERE lp.user_id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    res.json({ profile: serializeLabourerOwnProfile(result.rows[0]) });
  } catch (err) {
    next(err);
  }
});

// Authenticated customer-facing Grounded worker profile. This route deliberately
// excludes private activation/eligibility evidence and reviewer identity.
router.get('/:id/grounded-profile', authMiddleware, requireMarketplaceRole, async (req, res, next) => {
  try {
    const workerId = assertUuid(req.params.id, 'workerId');
    const worker = await loadWorkerProfile(db, workerId);
    if (!worker) {
      return problemResponse(res, {
        type: 'worker_profile_not_found',
        title: 'Worker profile not found',
        status: 404,
        detail: 'No customer-facing Grounded Worker profile was found.',
        instance: req.originalUrl,
      });
    }

    const [offeringRows, acknowledgementRows, reviewRows, completedRows] = await Promise.all([
      listWorkerOfferings(db, workerId),
      listAcknowledgements(db, workerId),
      db.query(
        `SELECT r.id, r.score, r.comment, r.published_at,
                COALESCE(a.service_snapshot->>'label', b.skill_needed) AS service_label,
                ROUND(AVG(r.score) OVER()::numeric, 2) AS rating_average,
                COUNT(*) OVER()::int AS rating_count
           FROM ratings r
           JOIN bookings b ON b.id = r.booking_id
           LEFT JOIN grounded_booking_agreement_snapshots a ON a.booking_id = b.id
          WHERE r.reviewee_id = $1
            AND b.labourer_id = $1
            AND r.publication_status = 'published'
          ORDER BY r.published_at DESC, r.id DESC
          LIMIT 20`,
        [workerId]
      ),
      db.query(
        `SELECT COUNT(*)::int AS completed_jobs
           FROM bookings
          WHERE labourer_id = $1 AND status = 'completed'`,
        [workerId]
      ),
    ]);

    const activeEligibleRows = offeringRows
      .filter((offering) => offering.opt_in_status === 'active' && offeringEligibility(offering, worker).eligible);
    const profile = serializePublicProfile(worker, activeEligibleRows);
    const activeEligibleOfferings = activeEligibleRows
      .map((offering) => publicGroundedOffering(offering, worker));
    const activation = serializeActivation(worker, offeringRows, acknowledgementRows);
    const onlinePermission = activation.onlinePermission?.status === 'supported'
      ? activation.onlinePermission.value
      : null;
    const ratings = reviewRows.rows[0]
      ? {
          average: Number(reviewRows.rows[0].rating_average),
          count: Number(reviewRows.rows[0].rating_count),
        }
      : null;

    return res.json({
      schema: GROUNDED_PUBLIC_PROFILE_SCHEMA,
      profile: {
        workerId: profile.profileId,
        stateVersion: profile.stateVersion,
        displayName: profile.displayName,
        about: profile.about,
        profilePhoto: profile.profilePhoto,
        publicBadges: profile.publicBadges,
        serviceAreaLabel: profile.serviceAreaLabel,
        offerings: activeEligibleOfferings,
        reviews: reviewRows.rows.map((review) => ({
          reviewId: review.id,
          rating: Number(review.score),
          body: publicReviewComment(review.comment),
          publishedAt: new Date(review.published_at).toISOString(),
          serviceLabel: publicTextOrNull(review.service_label, { maxLength: 160 }),
        })),
        rating: ratings,
        completedJobs: Number(completedRows.rows[0]?.completed_jobs || 0),
        currentlyAvailable: worker.is_available === true && onlinePermission?.allowed === true,
      },
    });
  } catch (err) {
    return next(err);
  }
});

// GET /labourers/:id
router.get('/:id', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT u.id, u.name, u.avatar_url, u.created_at,
              lp.skills, lp.hourly_rate, lp.bio,
              lp.is_available, lp.current_lat, lp.current_lng, lp.location_updated_at,
              lp.rating_avg, lp.rating_count
       FROM users u
       JOIN labourer_profiles lp ON u.id = lp.user_id
       WHERE u.id = $1 AND u.role = 'labourer'`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Labourer not found' });
    }

    // Preserve the legacy response shape, but enforce the canonical public
    // ratings boundary: sealed ratings and reviewer surnames remain private.
    const ratingsResult = await db.query(
      `SELECT r.score, r.comment, r.created_at,
              split_part(trim(u.name), ' ', 1) AS reviewer_name
       FROM ratings r
       JOIN users u ON r.reviewer_id = u.id
       WHERE r.reviewee_id = $1 AND r.publication_status = 'published'
       ORDER BY r.created_at DESC
       LIMIT 10`,
      [req.params.id]
    );

    res.json({
      labourer: serializeLabourerPublic(result.rows[0]),
      reviews: ratingsResult.rows.map((review) => ({
        ...review,
        comment: publicReviewComment(review.comment),
        reviewer_name: publicTextOrNull(review.reviewer_name, { maxLength: 80 }) || 'Customer',
      })),
    });
  } catch (err) {
    next(err);
  }
});

// PUT /labourers/profile
router.put('/profile', authMiddleware, requireRole('labourer'), async (req, res, next) => {
  try {
    const { skills, hourly_rate, bio, emergency_contact } = req.body;
    const userId = req.user.id;

    if (containsPublicContactDetails(bio)) {
      return res.status(422).json({
        error: 'public_bio_contact_details',
        detail: 'Remove phone numbers and email addresses from the public bio before saving.',
      });
    }

    await db.query(
      `UPDATE labourer_profiles
       SET skills = COALESCE($1, skills),
           hourly_rate = COALESCE($2, hourly_rate),
           bio = COALESCE($3, bio)
       WHERE user_id = $4`,
      [skills, hourly_rate, bio, userId]
    );
    if (emergency_contact !== undefined) {
      await db.query(
        'UPDATE users SET emergency_contact = $1 WHERE id = $2',
        [emergency_contact || null, userId]
      );
    }
    const result = await db.query(
      `SELECT lp.*, u.name, u.email, u.phone, u.avatar_url, u.emergency_contact
       FROM labourer_profiles lp
       JOIN users u ON lp.user_id = u.id
       WHERE lp.user_id = $1`,
      [userId]
    );

    res.json({ profile: serializeLabourerOwnProfile(result.rows[0]) });
  } catch (err) {
    next(err);
  }
});

// PUT /labourers/avatar — update avatar_url
router.put('/avatar', authMiddleware, requireRole('labourer'), async (req, res, next) => {
  try {
    const { avatar_url } = req.body;
    if (!avatar_url) return res.status(400).json({ error: 'avatar_url required' });

    const result = await db.query(
      'UPDATE users SET avatar_url = $1 WHERE id = $2 RETURNING id, name, avatar_url',
      [avatar_url, req.user.id]
    );
    res.json({ user: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// Legacy clients still call this path. Turning availability on must use the
// same server-authoritative readiness gate as the Grounded Worker experience;
// otherwise the compatibility API could bypass identity, service, safety and
// location prerequisites. Turning it off is always allowed as a safe escape.
async function updateAvailability(req, res, next) {
  try {
    const { is_available } = req.body;
    if (typeof is_available !== 'boolean') {
      return res.status(400).json({ error: 'is_available must be boolean' });
    }

    if (is_available) {
      const worker = await loadWorkerProfile(db, req.user.id);
      if (!worker) return res.status(404).json({ error: 'Profile not found' });
      const [offerings, acknowledgements] = await Promise.all([
        listWorkerOfferings(db, req.user.id),
        listAcknowledgements(db, req.user.id),
      ]);
      const activation = serializeActivation(worker, offerings, acknowledgements);
      if (activation.onlinePermission?.status !== 'supported'
          || activation.onlinePermission.value?.allowed !== true) {
        return res.status(409).json({
          error: 'worker_activation_incomplete',
          reason_code: activation.onlinePermission?.value?.reasonCode || 'worker_online_permission_unavailable',
          detail: activation.onlinePermission?.value?.explanation
            || 'Online availability is unavailable until server-authoritative readiness is complete.',
          activation_path: '/api/worker/activation',
        });
      }
    }

    const result = await db.query(
      'UPDATE labourer_profiles SET is_available = $1 WHERE user_id = $2 RETURNING *',
      [is_available, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Profile not found' });
    res.json({ profile: serializeLabourerOwnProfile(result.rows[0]) });
  } catch (err) {
    next(err);
  }
}

router.patch('/availability', authMiddleware, requireRole('labourer'), updateAvailability);
router.put('/availability', authMiddleware, requireRole('labourer'), updateAvailability);

// PUT/PATCH /labourers/location
function validCoordinate(value, minimum, maximum) {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= minimum
    && value <= maximum;
}

async function updateLocation(req, res, next) {
  try {
    const { lat, lng } = req.body;
    if (!validCoordinate(lat, -90, 90) || !validCoordinate(lng, -180, 180)) {
      return res.status(400).json({
        error: 'invalid_location_coordinates',
        detail: 'lat and lng must be finite JSON numbers within [-90, 90] and [-180, 180].',
      });
    }

    const result = await db.query(
      `UPDATE labourer_profiles
       SET current_lat = $1, current_lng = $2, location_updated_at = NOW()
       WHERE user_id = $3
       RETURNING user_id`,
      [lat, lng, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Profile not found' });
    return res.json({ updated: true });
  } catch (err) {
    return next(err);
  }
}

router.patch('/location', authMiddleware, requireRole('labourer'), updateLocation);
router.put('/location', authMiddleware, requireRole('labourer'), updateLocation);

module.exports = router;
