const express = require('express');
const db = require('../config/db');
const { withTx } = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const { notifyUser } = require('../services/notifications');
const { emitEvent } = require('../services/events');

const router = express.Router();

// PATCH /api/bookings/:id/confirm-scope
// Both customer and labourer must call this; job auto-starts once both confirm
router.patch('/:id/confirm-scope', authMiddleware, async (req, res, next) => {
  try {
    const result = await db.query('SELECT * FROM bookings WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Booking not found' });

    const booking = result.rows[0];
    const { role, id: userId } = req.user;

    if (booking.customer_id !== userId && booking.labourer_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!['accepted', 'pending'].includes(booking.status)) {
      return res.status(400).json({ error: 'Can only confirm scope for accepted bookings' });
    }

    let updateFields = '';
    let notifyTarget = null;
    let notifyTitle = '';
    let notifyBody = '';

    if (role === 'customer') {
      updateFields = 'scope_confirmed_by_customer = true';
      notifyTarget = booking.labourer_id;
      notifyTitle = '✅ Customer confirmed scope';
      notifyBody = 'Customer confirmed the job scope. Confirm yours to start!';
    } else if (role === 'labourer') {
      updateFields = 'scope_confirmed_by_labourer = true';
      notifyTarget = booking.customer_id;
      notifyTitle = '✅ Worker confirmed scope';
      notifyBody = 'The worker confirmed the job scope. Confirm yours to start!';
    } else {
      return res.status(403).json({ error: 'Invalid role' });
    }

    // Update this party's confirmation + (if both now confirmed) flip to
    // in_progress AND emit booking.in_progress, all in the same tx.
    const finalBooking = await withTx(async (client) => {
      await client.query(`UPDATE bookings SET ${updateFields} WHERE id = $1`, [booking.id]);
      const updated = await client.query('SELECT * FROM bookings WHERE id = $1', [booking.id]);
      const b = updated.rows[0];
      if (b.scope_confirmed_by_customer && b.scope_confirmed_by_labourer && b.status !== 'in_progress') {
        const started = await client.query(
          `UPDATE bookings
              SET status = 'in_progress', scope_confirmed_at = NOW()
            WHERE id = $1 RETURNING *`,
          [booking.id]
        );
        const started_row = started.rows[0];
        await emitEvent(client, {
          eventType: 'booking.in_progress',
          resourceType: 'booking',
          resourceId: started_row.id,
          actorUserIds: [started_row.customer_id, started_row.labourer_id],
          previousState: booking.status,
          state: 'in_progress',
          data: started_row,
        });
        return started_row;
      }
      return b;
    });

    if (finalBooking.status === 'in_progress' && finalBooking.scope_confirmed_at) {
      // Notify both parties (best-effort, post-commit)
      notifyUser(booking.customer_id, '🚀 Job Started!',
        'Both parties confirmed scope. The job is now in progress.',
        { bookingId: booking.id, screen: 'ActiveBooking' });
      notifyUser(booking.labourer_id, '🚀 Job Started!',
        'Both parties confirmed scope. Start the job now!',
        { bookingId: booking.id, screen: 'ActiveJob' });
    } else if (notifyTarget) {
      // Only one side confirmed — notify the other
      notifyUser(notifyTarget, notifyTitle, notifyBody, { bookingId: booking.id, screen: 'ScopeConfirm' });
    }

    res.json({ booking: finalBooking });
  } catch (err) {
    next(err);
  }
});

// POST /api/bookings/:id/make-recurring
// Creates next 4 future bookings based on pattern
router.post('/:id/make-recurring', authMiddleware, async (req, res, next) => {
  try {
    const { pattern } = req.body; // weekly | fortnightly | monthly
    if (!['weekly', 'fortnightly', 'monthly'].includes(pattern)) {
      return res.status(400).json({ error: 'pattern must be weekly, fortnightly, or monthly' });
    }

    const result = await db.query('SELECT * FROM bookings WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Booking not found' });

    const booking = result.rows[0];
    if (booking.customer_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the customer can make a booking recurring' });
    }

    // Wrap the parent flag flip + 4 child INSERTs + 4 booking.created emits
    // in one tx so subscribers can't see a half-recurring state.
    const intervalDays = pattern === 'weekly' ? 7 : pattern === 'fortnightly' ? 14 : 30;
    const baseDate = new Date(booking.scheduled_at);

    const createdBookings = await withTx(async (client) => {
      await client.query(
        `UPDATE bookings SET is_recurring = true, recurrence_pattern = $1 WHERE id = $2`,
        [pattern, booking.id]
      );
      const created = [];
      for (let i = 1; i <= 4; i++) {
        const nextDate = new Date(baseDate);
        nextDate.setDate(nextDate.getDate() + intervalDays * i);

        const newBooking = await client.query(
          `INSERT INTO bookings
             (customer_id, labourer_id, skill_needed, address, location_lat, location_lng,
              scheduled_at, hours_est, total_amount, notes, is_recurring, recurrence_pattern, parent_booking_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11,$12)
           RETURNING *`,
          [
            booking.customer_id, booking.labourer_id, booking.skill_needed,
            booking.address, booking.location_lat, booking.location_lng,
            nextDate.toISOString(), booking.hours_est, booking.total_amount,
            booking.notes, pattern, booking.id,
          ]
        );
        const row = newBooking.rows[0];
        await emitEvent(client, {
          eventType: 'booking.created',
          resourceType: 'booking',
          resourceId: row.id,
          actorUserIds: [row.customer_id, row.labourer_id],
          state: row.status,
          data: row,
        });
        created.push(row);
      }
      return created;
    });

    res.json({ bookings: createdBookings, pattern });
  } catch (err) {
    next(err);
  }
});

// POST /api/bookings/:id/share-trip
// Returns shareable text for WhatsApp/native share
router.post('/:id/share-trip', authMiddleware, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT b.*, cu.name AS customer_name, lu.name AS labourer_name
       FROM bookings b
       JOIN users cu ON b.customer_id = cu.id
       JOIN users lu ON b.labourer_id = lu.id
       WHERE b.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Booking not found' });
    const b = result.rows[0];
    if (b.customer_id !== req.user.id && b.labourer_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const shareText =
      `🔧 Togt Job in Progress\n` +
      `Worker: ${b.labourer_name}\n` +
      `Job: ${b.skill_needed}\n` +
      `Location: ${b.address}\n` +
      `Track: togt://booking/${b.id}`;

    res.json({ shareText, bookingId: b.id });
  } catch (err) {
    next(err);
  }
});

// POST /api/bookings/:id/change-order
router.post('/:id/change-order', authMiddleware, async (req, res, next) => {
  try {
    const { description, extra_hours, extra_amount } = req.body;
    if (!description) return res.status(400).json({ error: 'description is required' });

    const result = await db.query('SELECT * FROM bookings WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Booking not found' });

    const booking = result.rows[0];
    if (booking.labourer_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the labourer can request a change order' });
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
    const result = await db.query('SELECT * FROM bookings WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Booking not found' });
    const booking = result.rows[0];
    if (booking.customer_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the customer can accept change orders' });
    }

    const { accept } = req.body; // true = accept, false = decline
    const newStatus = accept ? 'accepted' : 'declined';

    const co = await db.query(
      `UPDATE change_orders SET status = $1, responded_at = NOW()
       WHERE id = $2 AND booking_id = $3 RETURNING *`,
      [newStatus, req.params.orderId, req.params.id]
    );
    if (co.rows.length === 0) return res.status(404).json({ error: 'Change order not found' });

    if (accept && co.rows[0].extra_amount) {
      // Update booking total
      await db.query(
        `UPDATE bookings SET total_amount = COALESCE(total_amount,0) + $1 WHERE id = $2`,
        [co.rows[0].extra_amount, req.params.id]
      );
    }

    const updatedBooking = await db.query('SELECT * FROM bookings WHERE id = $1', [req.params.id]);
    notifyUser(booking.labourer_id, accept ? '✅ Change Accepted' : '❌ Change Declined',
      accept ? 'Customer approved the additional work.' : 'Customer declined the change request.',
      { bookingId: booking.id, screen: 'ActiveJob' });

    res.json({ changeOrder: co.rows[0], booking: updatedBooking.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
