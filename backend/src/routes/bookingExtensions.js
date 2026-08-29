const express = require('express');
const db = require('../config/db');
const { withTx } = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const { problemResponse } = require('../lib/problemJson');
const { notifyUser } = require('../services/notifications');
const { serializeBookingForUser } = require('../lib/privacy');
const { recordPrivacyAudit } = require('../lib/privacyAudit');
const { withStartContext } = require('../lib/startPin');
const { FEATURES, featureAvailable } = require('../config/capabilities');

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

const SHARE_STATUS_LABELS = Object.freeze({
  pending: 'Awaiting a Worker',
  accepted: 'Worker confirmed',
  in_progress: 'Work in progress',
  completed: 'Work complete',
  cancelled: 'Project closed',
  terminated_after_start: 'Project closed',
});

function normalizedPrivateText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toLowerCase() : '';
}

function safeServiceLabel(value, privateAddress) {
  if (typeof value !== 'string') return 'Service booked through TOGT';
  const candidate = value.trim().replace(/\s+/g, ' ');
  const normalizedCandidate = normalizedPrivateText(candidate);
  const normalizedAddress = normalizedPrivateText(privateAddress);
  const containsPrivatePattern =
    /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/i.test(candidate)
    || /(?:\+?\d[\d\s().-]*){7,}/.test(candidate)
    || /-?\d{1,3}\.\d{3,}\s*[,;]\s*-?\d{1,3}\.\d{3,}/.test(candidate)
    || (normalizedAddress.length > 0 && normalizedCandidate.includes(normalizedAddress));
  return candidate.length > 0 && candidate.length <= 120 && !containsPrivatePattern
    ? candidate
    : 'Service booked through TOGT';
}

function shareScheduleLabel(value) {
  const scheduledAt = new Date(value);
  if (!Number.isFinite(scheduledAt.getTime())) return 'Schedule unavailable';
  return new Intl.DateTimeFormat('en-ZA', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Johannesburg',
  }).format(scheduledAt);
}

function canonicalFulfilmentRequired(req, res, bookingId) {
  return problemResponse(res, {
    type: 'canonical_fulfilment_required',
    title: 'Use the canonical Project fulfilment flow',
    status: 409,
    detail: 'This Project has a canonical fulfilment policy. No legacy scope or change-order state was changed.',
    instance: req.originalUrl,
    extensions: {
      projectId: bookingId,
      canonicalPath: `/api/projects/${bookingId}/fulfilment`,
    },
  });
}

// PATCH /api/bookings/:id/confirm-scope
// Both customer and labourer must call this. Confirmation never starts work;
// the assigned worker must separately submit the customer-held start PIN.
router.patch('/:id/confirm-scope', authMiddleware, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT b.*, ${CANONICAL_FULFILMENT_PROJECTION}
         FROM bookings b WHERE b.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Booking not found' });

    const booking = result.rows[0];
    const { role, id: userId } = req.user;

    if (booking.customer_id !== userId && booking.labourer_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (booking.canonical_fulfilment_policy_present) {
      return canonicalFulfilmentRequired(req, res, booking.id);
    }
    if (booking.status !== 'accepted') {
      return res.status(400).json({ error: 'Can only confirm scope for accepted bookings' });
    }

    let updateFields = '';
    let notifyTarget = null;
    let notifyTitle = '';
    let notifyBody = '';

    if (role === 'customer') {
      if (booking.scope_confirmed_by_customer) {
        return res.json({
          booking: withStartContext(serializeBookingForUser(booking, req.user), booking, req.user),
        });
      }
      updateFields = 'scope_confirmed_by_customer = true';
      notifyTarget = booking.labourer_id;
      notifyTitle = '✅ Customer confirmed scope';
      notifyBody = 'Customer confirmed the job scope. Confirm yours to start!';
    } else if (role === 'labourer') {
      if (booking.scope_confirmed_by_labourer) {
        return res.json({
          booking: withStartContext(serializeBookingForUser(booking, req.user), booking, req.user),
        });
      }
      updateFields = 'scope_confirmed_by_labourer = true';
      notifyTarget = booking.customer_id;
      notifyTitle = '✅ Worker confirmed scope';
      notifyBody = 'The worker confirmed the job scope. Confirm yours to start!';
    } else {
      return res.status(403).json({ error: 'Invalid role' });
    }

    // Update this party's confirmation. Bilateral confirmation only unlocks
    // the separate start-PIN transition; it never starts work by itself.
    const finalBooking = await withTx(async (client) => {
      await client.query(`UPDATE bookings SET ${updateFields} WHERE id = $1`, [booking.id]);
      const updated = await client.query(
        `SELECT b.*, ${CANONICAL_FULFILMENT_PROJECTION}
           FROM bookings b WHERE b.id = $1`,
        [booking.id]
      );
      const b = updated.rows[0];
      if (b.scope_confirmed_by_customer && b.scope_confirmed_by_labourer && !b.scope_confirmed_at) {
        const confirmed = await client.query(
          `UPDATE bookings
              SET scope_confirmed_at = NOW()
            WHERE id = $1 RETURNING *`,
          [booking.id]
        );
        return {
          ...confirmed.rows[0],
          canonical_fulfilment_policy_present: booking.canonical_fulfilment_policy_present,
        };
      }
      return b;
    });

    if (finalBooking.scope_confirmed_by_customer && finalBooking.scope_confirmed_by_labourer) {
      notifyUser(booking.customer_id, 'Scope confirmed',
        'Both parties confirmed the scope. Share the start PIN only when work is ready to begin.',
        { bookingId: booking.id, screen: 'ActiveBooking' });
      notifyUser(booking.labourer_id, 'Scope confirmed',
        'Both parties confirmed the scope. Ask the customer for the 6-digit start PIN.',
        { bookingId: booking.id, screen: 'ActiveJob' });
    } else if (notifyTarget) {
      // Only one side confirmed — notify the other
      notifyUser(notifyTarget, notifyTitle, notifyBody, { bookingId: booking.id, screen: 'ScopeConfirm' });
    }

    res.json({
      booking: withStartContext(
        serializeBookingForUser(finalBooking, req.user),
        finalBooking,
        req.user
      ),
    });
  } catch (err) {
    next(err);
  }
});

// The retired endpoint used to copy a booking into four unaccepted future jobs.
// Recurrence now requires catalogue eligibility and explicit bilateral terms.
router.post('/:id/make-recurring', authMiddleware, (req, res) => {
  return problemResponse(res, {
    type: 'legacy_recurring_booking_retired',
    title: 'Legacy recurring booking is unavailable',
    status: 410,
    detail: 'No booking was created. Use the bilateral recurring-series flow after eligible completed work.',
    instance: req.originalUrl,
    extensions: {
      canonicalPath: '/api/recurring-series',
      createdBookings: 0,
    },
  });
});

// POST /api/bookings/:id/share-trip
// Legacy-compatible route returning non-live, privacy-minimized booking text.
router.post('/:id/share-trip', authMiddleware, async (req, res, next) => {
  try {
    if (!featureAvailable('booking_details_share')) {
      return res.status(503).json({
        error: 'capability_unavailable',
        capability: 'booking_details_share',
        reason_code: FEATURES.booking_details_share.reason_code || 'disabled_by_server',
      });
    }
    const result = await db.query(
      'SELECT b.* FROM bookings b WHERE b.id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Booking not found' });
    const b = result.rows[0];
    if (b.customer_id !== req.user.id && b.labourer_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const preview = Object.freeze({
      projectReference: 'TOGT Project',
      serviceLabel: safeServiceLabel(b.skill_needed, b.address),
      broadAreaLabel: 'Area not shared',
      scheduleLabel: shareScheduleLabel(b.scheduled_at),
      statusLabel: SHARE_STATUS_LABELS[b.status] || 'Status unavailable',
    });
    const shareText = [
      'TOGT Project summary',
      `Service: ${preview.serviceLabel}`,
      `Area: ${preview.broadAreaLabel}`,
      `Schedule: ${preview.scheduleLabel}`,
      `Status: ${preview.statusLabel}`,
      'This is a static booking summary, not a live tracking link.',
    ].join('\n');

    res.json({
      bookingDetailsShare: {
        available: true,
        mode: 'non_live_no_address',
      },
      preview,
      shareText,
      live_tracking: false,
      public_link: null,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/bookings/:id/change-order
router.post('/:id/change-order', authMiddleware, async (req, res, next) => {
  try {
    const { description, extra_hours, extra_amount } = req.body;
    if (!description) return res.status(400).json({ error: 'description is required' });

    const result = await db.query(
      `SELECT b.*, ${CANONICAL_FULFILMENT_PROJECTION}
         FROM bookings b WHERE b.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Booking not found' });

    const booking = result.rows[0];
    if (booking.labourer_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the labourer can request a change order' });
    }
    if (booking.canonical_fulfilment_policy_present) {
      return canonicalFulfilmentRequired(req, res, booking.id);
    }
    if (booking.status !== 'in_progress') {
      return res.status(400).json({ error: 'Change orders only allowed during active jobs' });
    }

    const co = await db.query(
      `INSERT INTO change_orders (booking_id, requested_by, description, extra_hours, extra_amount)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [booking.id, req.user.id, description, extra_hours || null, extra_amount || null]
    );

    // Notify customer
    notifyUser(booking.customer_id, '📝 Change Request',
      `Worker requested a scope change: ${description}`,
      { bookingId: booking.id, screen: 'ActiveBooking' });

    res.status(201).json({ changeOrder: co.rows[0] });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/bookings/:id/change-order/:orderId/accept
router.patch('/:id/change-order/:orderId/accept', authMiddleware, async (req, res, next) => {
  try {
    const { accept } = req.body; // true = accept, false = decline
    if (typeof accept !== 'boolean') {
      return res.status(400).json({
        error: 'accept must be a boolean',
        code: 'invalid_change_order_response',
      });
    }
    const newStatus = accept ? 'accepted' : 'declined';

    const outcome = await withTx(async (client) => {
      // Serialise responses for the booking, then make the state transition
      // conditional on pending. A retry or concurrent request cannot apply
      // extra_amount more than once.
      const bookingResult = await client.query(
        `SELECT b.*, ${CANONICAL_FULFILMENT_PROJECTION}
           FROM bookings b WHERE b.id = $1 FOR UPDATE OF b`,
        [req.params.id]
      );
      if (bookingResult.rows.length === 0) return { kind: 'booking_not_found' };

      const booking = bookingResult.rows[0];
      if (booking.customer_id !== req.user.id) return { kind: 'forbidden' };
      if (booking.canonical_fulfilment_policy_present) {
        return { kind: 'canonical_fulfilment_required', bookingId: booking.id };
      }

      const changed = await client.query(
        `UPDATE change_orders
            SET status = $1, responded_at = NOW()
          WHERE id = $2
            AND booking_id = $3
            AND status = 'pending'
          RETURNING *`,
        [newStatus, req.params.orderId, req.params.id]
      );

      if (changed.rows.length === 0) {
        const existing = await client.query(
          'SELECT * FROM change_orders WHERE id = $1 AND booking_id = $2',
          [req.params.orderId, req.params.id]
        );
        if (existing.rows.length === 0) {
          return { kind: 'change_order_not_found' };
        }
        if (existing.rows[0].status !== newStatus) {
          return {
            kind: 'already_responded',
            status: existing.rows[0].status,
          };
        }

        const currentBooking = await client.query(
          'SELECT * FROM bookings WHERE id = $1',
          [req.params.id]
        );
        return {
          kind: 'ok',
          booking: currentBooking.rows[0],
          changeOrder: existing.rows[0],
          changed: false,
        };
      }

      const changeOrder = changed.rows[0];
      if (accept && changeOrder.extra_amount) {
        await client.query(
          `UPDATE bookings
              SET total_amount = COALESCE(total_amount, 0) + $1
            WHERE id = $2`,
          [changeOrder.extra_amount, req.params.id]
        );
      }

      const updatedBooking = await client.query(
        'SELECT * FROM bookings WHERE id = $1',
        [req.params.id]
      );
      return {
        kind: 'ok',
        booking: updatedBooking.rows[0],
        changeOrder,
        changed: true,
      };
    });

    if (outcome.kind === 'booking_not_found') {
      return res.status(404).json({ error: 'Booking not found' });
    }
    if (outcome.kind === 'forbidden') {
      return res.status(403).json({ error: 'Only the customer can accept change orders' });
    }
    if (outcome.kind === 'canonical_fulfilment_required') {
      return canonicalFulfilmentRequired(req, res, outcome.bookingId);
    }
    if (outcome.kind === 'change_order_not_found') {
      return res.status(404).json({ error: 'Change order not found' });
    }
    if (outcome.kind === 'already_responded') {
      return res.status(409).json({
        error: 'Change order already responded',
        status: outcome.status,
      });
    }

    if (outcome.changed) {
      notifyUser(outcome.booking.labourer_id, accept ? '✅ Change Accepted' : '❌ Change Declined',
        accept ? 'Customer approved the additional work.' : 'Customer declined the change request.',
        { bookingId: outcome.booking.id, screen: 'ActiveJob' });
    }

    res.json({
      changeOrder: outcome.changeOrder,
      booking: serializeBookingForUser(outcome.booking, req.user),
      idempotent_replay: !outcome.changed,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
