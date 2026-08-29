const express = require('express');
const db = require('../config/db');
const { withTx } = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const { idempotencyMiddleware } = require('../middleware/idempotency');
const { notifyUser } = require('../services/notifications');
const { emitEvent } = require('../services/events');
const { serializeBookingForUser, hasCanonicalFulfilment } = require('../lib/privacy');
const { recordPrivacyAudit } = require('../lib/privacyAudit');
const { verifyStartPin, withStartContext } = require('../lib/startPin');
const { problemResponse } = require('../lib/problemJson');
const { legacyDirectBookingCreationEnabled } = require('../config/legacyCompatibility');

const STATUS_TO_EVENT = {
  accepted: 'booking.accepted',
  in_progress: 'booking.in_progress',
  completed: 'booking.completed',
  cancelled: 'booking.cancelled',
};

const router = express.Router();

const CANONICAL_FULFILMENT_PROJECTION = `(
  b.accepted_quote_id IS NOT NULL
  OR EXISTS (
    SELECT 1 FROM grounded_booking_agreement_snapshots grounded_agreement
    WHERE grounded_agreement.booking_id = b.id
  )
  OR EXISTS (
    SELECT 1 FROM grounded_fulfilment_policy_snapshots grounded_policy
    WHERE grounded_policy.booking_id = b.id
  )
  OR EXISTS (
    SELECT 1 FROM match_requests grounded_match
    WHERE grounded_match.matched_booking_id = b.id
  )
) AS canonical_fulfilment_policy_present`;

function requireLegacyDirectBookingCompatibility(req, res, next) {
  if (legacyDirectBookingCreationEnabled()) return next();
  return problemResponse(res, {
    type: 'legacy_direct_booking_creation_unavailable',
    title: 'Direct legacy booking creation is unavailable',
    status: 503,
    detail: 'No booking was created. Use the canonical quote-request or Fast Match flow.',
    instance: req.originalUrl,
    extensions: {
      canonicalPaths: ['/api/quote-requests', '/api/match'],
    },
  });
}

// POST /bookings — customer creates a booking request
router.post('/', authMiddleware, requireLegacyDirectBookingCompatibility, idempotencyMiddleware(), async (req, res, next) => {
  try {
    if (req.user.role !== 'customer') {
      return res.status(403).json({ error: 'Only customers can create bookings' });
    }

    const { labourer_id, skill_needed, address, location_lat, location_lng, scheduled_at, hours_est, notes } = req.body;

    if (!labourer_id || !skill_needed || !address || !location_lat || !location_lng || !scheduled_at) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const scheduledDate = new Date(scheduled_at);
    if (Number.isNaN(scheduledDate.getTime())) {
      return res.status(400).json({ error: 'Invalid scheduled_at' });
    }
    if (scheduledDate.getTime() <= Date.now()) {
      return res.status(400).json({ error: 'scheduled_at must be in the future' });
    }

    // Check labourer exists and is available
    const labourerCheck = await db.query(
      `SELECT u.id, u.name, lp.hourly_rate, lp.is_available
       FROM users u JOIN labourer_profiles lp ON u.id = lp.user_id
       WHERE u.id = $1 AND u.role = 'labourer'`,
      [labourer_id]
    );
    if (labourerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Labourer not found' });
    }
    const labourer = labourerCheck.rows[0];

    const total_amount = hours_est ? (labourer.hourly_rate * parseFloat(hours_est)).toFixed(2) : null;

    const booking = await withTx(async (client) => {
      const result = await client.query(
        `INSERT INTO bookings
           (customer_id, labourer_id, skill_needed, address, location_lat, location_lng,
            scheduled_at, hours_est, total_amount, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [req.user.id, labourer_id, skill_needed, address, location_lat, location_lng,
         scheduled_at, hours_est || null, total_amount, notes || null]
      );
      const row = result.rows[0];
      await emitEvent(client, {
        eventType: 'booking.created',
        resourceType: 'booking',
        resourceId: row.id,
        actorUserIds: [row.customer_id, row.labourer_id],
        state: row.status,
        data: row,
      });
      return row;
    });

    // Notify labourer of new booking request
    const customerResult = await db.query('SELECT name FROM users WHERE id = $1', [req.user.id]);
    const customerName = customerResult.rows[0]?.name || 'A customer';
    notifyUser(
      labourer_id,
      '🔔 New Booking Request',
      `${customerName} needs ${skill_needed} — tap to review`,
      { bookingId: booking.id, screen: 'JobRequests' }
    );

    res.status(201).json({ booking: withStartContext(serializeBookingForUser(booking, req.user), booking, req.user) });
  } catch (err) {
    next(err);
  }
});

// GET /bookings — alias for /bookings/my (frontend convenience)
router.get('/', authMiddleware, async (req, res, next) => {
  const col = req.user.role === 'customer' ? 'b.customer_id' : 'b.labourer_id';
  try {
    const result = await db.query(
      `SELECT b.*,
              ${CANONICAL_FULFILMENT_PROJECTION},
              cu.name AS customer_name, cu.phone AS customer_phone, cu.avatar_url AS customer_avatar,
              lu.name AS labourer_name, lu.phone AS labourer_phone, lu.avatar_url AS labourer_avatar,
              lp.hourly_rate, lp.skills
       FROM bookings b
       JOIN users cu ON b.customer_id = cu.id
       JOIN users lu ON b.labourer_id = lu.id
       JOIN labourer_profiles lp ON b.labourer_id = lp.user_id
       WHERE ${col} = $1
       ORDER BY b.created_at DESC`,
      [req.user.id]
    );
    const bookings = result.rows.map((row) => withStartContext(serializeBookingForUser(row, req.user), row, req.user));
    for (const b of bookings) {
      if (b.customer_phone || b.labourer_phone) {
        recordPrivacyAudit(req, {
          action: 'privacy.contact.phone_revealed',
          resource: { type: 'booking', id: b.id },
          statusCode: 200,
          metadata: { viewer_role: req.user.role, booking_status: b.status },
        });
      }
    }
    res.json({ bookings });
  } catch (err) {
    next(err);
  }
});

// GET /bookings/my — get own bookings
router.get('/my', authMiddleware, async (req, res, next) => {
  try {
    const col = req.user.role === 'customer' ? 'b.customer_id' : 'b.labourer_id';

    const result = await db.query(
      `SELECT b.*,
              ${CANONICAL_FULFILMENT_PROJECTION},
              cu.name AS customer_name, cu.phone AS customer_phone, cu.avatar_url AS customer_avatar,
              lu.name AS labourer_name, lu.phone AS labourer_phone, lu.avatar_url AS labourer_avatar,
              lp.hourly_rate, lp.skills
       FROM bookings b
       JOIN users cu ON b.customer_id = cu.id
       JOIN users lu ON b.labourer_id = lu.id
       JOIN labourer_profiles lp ON b.labourer_id = lp.user_id
       WHERE ${col} = $1
       ORDER BY b.created_at DESC`,
      [req.user.id]
    );

    const bookings = result.rows.map((row) => withStartContext(serializeBookingForUser(row, req.user), row, req.user));
    for (const b of bookings) {
      if (b.customer_phone || b.labourer_phone) {
        recordPrivacyAudit(req, {
          action: 'privacy.contact.phone_revealed',
          resource: { type: 'booking', id: b.id },
          statusCode: 200,
          metadata: { viewer_role: req.user.role, booking_status: b.status },
        });
      }
    }
    res.json({ bookings });
  } catch (err) {
    next(err);
  }
});

// GET /bookings/:id
router.get('/:id', authMiddleware, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT b.*,
              ${CANONICAL_FULFILMENT_PROJECTION},
              cu.name AS customer_name, cu.phone AS customer_phone, cu.avatar_url AS customer_avatar,
              lu.name AS labourer_name, lu.phone AS labourer_phone, lu.avatar_url AS labourer_avatar,
              lp.hourly_rate, lp.skills, lp.current_lat, lp.current_lng, lp.location_updated_at,
              p.status AS payment_status, p.id AS payment_id
       FROM bookings b
       JOIN users cu ON b.customer_id = cu.id
       JOIN users lu ON b.labourer_id = lu.id
       JOIN labourer_profiles lp ON b.labourer_id = lp.user_id
       LEFT JOIN payments p ON p.booking_id = b.id
       WHERE b.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const booking = result.rows[0];
    if (booking.customer_id !== req.user.id && booking.labourer_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const safeBooking = withStartContext(serializeBookingForUser(booking, req.user), booking, req.user);
    if (safeBooking.customer_phone || safeBooking.labourer_phone) {
      recordPrivacyAudit(req, {
        action: 'privacy.contact.phone_revealed',
        resource: { type: 'booking', id: safeBooking.id },
        statusCode: 200,
        metadata: { viewer_role: req.user.role, booking_status: safeBooking.status },
      });
    }
    if (req.user.role === 'labourer' && safeBooking.address) {
      recordPrivacyAudit(req, {
        action: 'privacy.booking.exact_address_revealed',
        resource: { type: 'booking', id: safeBooking.id },
        statusCode: 200,
        metadata: { viewer_role: req.user.role, booking_status: safeBooking.status },
      });
    }
    if (req.user.role === 'customer' && (safeBooking.labourer_current_lat || safeBooking.labourer_current_lng)) {
      recordPrivacyAudit(req, {
        action: 'privacy.location.exact_location_revealed',
        resource: { type: 'booking', id: safeBooking.id },
        statusCode: 200,
        metadata: { viewer_role: req.user.role, booking_status: safeBooking.status },
      });
    }
    res.json({ booking: safeBooking });
  } catch (err) {
    next(err);
  }
});

// Status transition helper — with push notifications
async function transition(req, res, next, allowedRoles, fromStatuses, toStatus) {
  try {
    const result = await db.query(
      `SELECT b.*, ${CANONICAL_FULFILMENT_PROJECTION}
         FROM bookings b WHERE b.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Booking not found' });

    const booking = result.rows[0];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Not allowed' });
    }
    if (req.user.role === 'customer' && booking.customer_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (req.user.role === 'labourer' && booking.labourer_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!fromStatuses.includes(booking.status)) {
      return res.status(400).json({ error: `Cannot transition from '${booking.status}' to '${toStatus}'` });
    }

    if (hasCanonicalFulfilment(booking) && toStatus !== 'in_progress') {
      return problemResponse(res, {
        type: 'canonical_fulfilment_required',
        title: 'Legacy Project transition is unavailable',
        status: 409,
        detail: 'This Project uses canonical fulfilment. No legacy booking status was changed.',
        instance: req.originalUrl,
        extensions: {
          projectId: booking.id,
          canonicalPath: `/api/projects/${booking.id}/fulfilment`,
        },
      });
    }

    if (toStatus === 'in_progress') {
      if (hasCanonicalFulfilment(booking)) {
        return res.status(409).json({
          error: 'canonical_fulfilment_required',
          detail: 'This booking uses the canonical fulfilment flow. Start it through the Project endpoint.',
          start_path: `/api/projects/${booking.id}/start`,
        });
      }
      if (!booking.scope_confirmed_by_customer || !booking.scope_confirmed_by_labourer) {
        return res.status(409).json({
          error: 'scope_confirmation_required',
          detail: 'Both customer and worker must confirm the agreed scope before the job can start.',
        });
      }
      const suppliedPin = req.body?.start_pin;
      if (typeof suppliedPin !== 'string' || !/^\d{6}$/.test(suppliedPin)) {
        return res.status(400).json({
          error: 'start_pin_required',
          detail: 'Enter the 6-digit start PIN shown to the customer.',
        });
      }
      if (!verifyStartPin(booking.id, suppliedPin)) {
        return res.status(403).json({
          error: 'start_pin_invalid',
          detail: 'That start PIN is not correct. Ask the customer to check the code.',
        });
      }
    }

    // Set completed_at when marking completed, cancelled_by when cancelling
    let updateQuery = 'UPDATE bookings SET status = $1';
    const updateParams = [toStatus, req.params.id];
    if (toStatus === 'completed') {
      updateQuery += ', completed_at = NOW()';
    } else if (toStatus === 'cancelled') {
      updateQuery += ', cancelled_by = $3';
      updateParams.push(req.user.id);
    }
    updateQuery += ' WHERE id = $2 RETURNING *';

    const updated = await withTx(async (client) => {
      const r = await client.query(updateQuery, updateParams);
      const row = r.rows[0];
      const eventType = STATUS_TO_EVENT[toStatus];
      if (row && eventType) {
        await emitEvent(client, {
          eventType,
          resourceType: 'booking',
          resourceId: row.id,
          actorUserIds: [row.customer_id, row.labourer_id],
          previousState: booking.status,
          state: row.status,
          data: row,
        });
      }
      return r;
    });

    // Push notifications based on transition
    const actorName = await db.query('SELECT name FROM users WHERE id = $1', [req.user.id]);
    const name = actorName.rows[0]?.name || 'Someone';

    if (toStatus === 'accepted') {
      notifyUser(booking.customer_id, '✅ Booking Accepted',
        `${name} accepted your booking request!`,
        { bookingId: booking.id, screen: 'ActiveBooking' });
    } else if (toStatus === 'cancelled' && req.user.role === 'labourer') {
      notifyUser(booking.customer_id, '❌ Booking Declined',
        `${name} couldn't take this job. Try another labourer.`,
        { bookingId: booking.id, screen: 'MyBookings' });
    } else if (toStatus === 'cancelled' && req.user.role === 'customer') {
      notifyUser(booking.labourer_id, '❌ Booking Cancelled',
        `${name} cancelled the booking.`,
        { bookingId: booking.id, screen: 'Dashboard' });
    } else if (toStatus === 'in_progress') {
      notifyUser(booking.customer_id, '🚀 Job Started',
        `${name} has started the job. Follow progress in TOGT.`,
        { bookingId: booking.id, screen: 'ActiveBooking' });
    } else if (toStatus === 'completed') {
      notifyUser(booking.customer_id, '🎉 Job Complete!',
        `${name} marked the job as done. Please leave a rating.`,
        { bookingId: booking.id, screen: 'Rate' });
    }

    const responseBooking = {
      ...updated.rows[0],
      canonical_fulfilment_policy_present: booking.canonical_fulfilment_policy_present,
    };
    res.json({
      booking: withStartContext(
        serializeBookingForUser(responseBooking, req.user),
        responseBooking,
        req.user
      ),
    });
  } catch (err) {
    next(err);
  }
}

router.put('/:id/accept', authMiddleware, (req, res, next) =>
  transition(req, res, next, ['labourer'], ['pending'], 'accepted'));

router.put('/:id/decline', authMiddleware, (req, res, next) =>
  transition(req, res, next, ['labourer'], ['pending'], 'cancelled'));

router.put('/:id/start', authMiddleware, (req, res, next) =>
  transition(req, res, next, ['labourer'], ['accepted'], 'in_progress'));

// Bilateral completion is authoritative. A worker may request completion via
// POST /api/projects/:id/completion-requests, but cannot move a booking to
// completed without the owning customer's explicit confirmation.
router.put('/:id/complete', authMiddleware, (req, res) => res.status(409).json({
  error: 'completion_confirmation_required',
  detail: 'Request completion from the Project flow. The customer must confirm before the job can be completed.',
  completion_request_path: `/api/projects/${req.params.id}/completion-requests`,
}));

router.put('/:id/cancel', authMiddleware, (req, res, next) =>
  transition(req, res, next, ['customer'], ['pending', 'accepted'], 'cancelled'));

// PATCH /:id/status — generic status update (maps to specific action routes)
// Body: { status: "accepted" | "in_progress" | "completed" | "cancelled" }
router.patch('/:id/status', authMiddleware, async (req, res, next) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'status is required' });

  const statusMap = {
    accepted:    { roles: ['labourer'], from: ['pending'] },
    in_progress: { roles: ['labourer'], from: ['accepted'] },
    cancelled:   { roles: ['customer', 'labourer'], from: ['pending', 'accepted'] },
  };

  const config = statusMap[status];
  if (!config) {
    return res.status(400).json({ error: `Invalid status: ${status}` });
  }
  return transition(req, res, next, config.roles, config.from, status);
});

module.exports = router;
