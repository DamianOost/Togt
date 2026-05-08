const express = require('express');
const axios = require('axios');
const db = require('../config/db');
const { withTx } = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const { idempotencyMiddleware } = require('../middleware/idempotency');
const crypto = require('crypto');
const { peach } = require('../config/env');
const { emitEvent } = require('../services/events');

const router = express.Router();

// POST /payments/initiate — create a Peach Payments checkout for a completed booking
router.post('/initiate', authMiddleware, idempotencyMiddleware(), async (req, res, next) => {
  try {
    const { booking_id } = req.body;
    if (!booking_id) return res.status(400).json({ error: 'booking_id required' });

    const bookingResult = await db.query(
      'SELECT * FROM bookings WHERE id = $1 AND customer_id = $2',
      [booking_id, req.user.id]
    );
    if (bookingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const booking = bookingResult.rows[0];
    if (booking.status !== 'completed') {
      return res.status(400).json({ error: 'Payment only available after job is completed' });
    }
    if (!booking.total_amount) {
      return res.status(400).json({ error: 'No amount set for this booking' });
    }

    // Check if payment already exists
    const existingPayment = await db.query(
      'SELECT * FROM payments WHERE booking_id = $1 AND status = $2',
      [booking_id, 'paid']
    );
    if (existingPayment.rows.length > 0) {
      return res.status(400).json({ error: 'Booking already paid' });
    }

    // Create Peach Payments checkout
    const params = new URLSearchParams({
      entityId: peach.entityId,
      amount: parseFloat(booking.total_amount).toFixed(2),
      currency: 'ZAR',
      paymentType: 'DB',
    });

    const peachResponse = await axios.post(
      `${peach.baseUrl}/v1/checkouts`,
      params.toString(),
      {
        headers: {
          Authorization: `Bearer ${peach.accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const checkoutId = peachResponse.data.id;

    // Store pending payment
    const paymentResult = await db.query(
      `INSERT INTO payments (booking_id, amount, currency, status, peach_checkout_id)
       VALUES ($1, $2, 'ZAR', 'pending', $3)
       ON CONFLICT (booking_id) DO UPDATE
         SET peach_checkout_id = $3, status = 'pending'
       RETURNING *`,
      [booking_id, booking.total_amount, checkoutId]
    );

    res.json({
      payment: paymentResult.rows[0],
      checkoutId,
      checkoutUrl: `${peach.baseUrl}/v1/paymentWidgets.js?checkoutId=${checkoutId}`,
    });
  } catch (err) {
    next(err);
  }
});

// POST /payments/webhook — Peach Payments result notification
router.post('/webhook', async (req, res, next) => {
  try {
    // Signature verification — defence in depth.
    // When PEACH_WEBHOOK_SECRET is set, compute HMAC-SHA256 over the raw body
    // and compare (timing-safe) against the X-Signature header.
    // NOTE: Peach's signature scheme varies by product (COPYandPAY vs S2S).
    // Confirm the exact header name and encoding with the Peach integration
    // contact before going to production.
    if (peach.webhookSecret) {
      const sig = req.header('X-Signature') || req.header('x-signature');
      if (!sig) {
        return res.status(401).json({ error: 'Missing signature' });
      }
      // HMAC-SHA256 computed over the raw body (captured pre-parse in app.js).
      if (!req.rawBody) {
        return res.status(400).json({ error: 'Raw body unavailable for signature check' });
      }
      const expected = crypto
        .createHmac('sha256', peach.webhookSecret)
        .update(req.rawBody)
        .digest('base64');
      try {
        const provided = Buffer.from(sig, 'base64');
        const expectedBuf = Buffer.from(expected, 'base64');
        if (provided.length !== expectedBuf.length || !crypto.timingSafeEqual(provided, expectedBuf)) {
          return res.status(401).json({ error: 'Invalid signature' });
        }
      } catch {
        return res.status(401).json({ error: 'Invalid signature' });
      }
    } else if (process.env.NODE_ENV === 'production') {
      console.warn('[peach webhook] PEACH_WEBHOOK_SECRET not set in production — accepting unsigned webhook');
    }

    // Body was parsed by express.json (or is empty object for non-JSON requests).
    const { checkoutId, resultCode } = req.body || {};

    if (!checkoutId) {
      return res.status(400).json({ error: 'checkoutId required' });
    }

    // Verify payment status with Peach
    const verifyResponse = await axios.get(
      `${peach.baseUrl}/v1/checkouts/${checkoutId}/payment`,
      {
        params: { entityId: peach.entityId },
        headers: { Authorization: `Bearer ${peach.accessToken}` },
      }
    );

    const peachResult = verifyResponse.data;
    const code = peachResult.result?.code || resultCode || '';

    // Success codes from Peach Payments documentation
    const isSuccess = /^(000\.000\.|000\.100\.1|000\.[36])/.test(code);
    const newStatus = isSuccess ? 'paid' : 'failed';

    await withTx(async (client) => {
      const upd = await client.query(
        `UPDATE payments SET status = $1, peach_result_code = $2
          WHERE peach_checkout_id = $3
          RETURNING *`,
        [newStatus, code, checkoutId]
      );
      const row = upd.rows[0];
      if (row) {
        // Look up the booking's customer + labourer so the per-tenant
        // event filter routes the payment event to both their subscriptions.
        const bookingRes = await client.query(
          `SELECT customer_id, labourer_id FROM bookings WHERE id = $1`,
          [row.booking_id]
        );
        const b = bookingRes.rows[0];
        const actorUserIds = b ? [b.customer_id, b.labourer_id].filter(Boolean) : [];
        if (actorUserIds.length) {
          await emitEvent(client, {
            eventType: isSuccess ? 'payment.succeeded' : 'payment.failed',
            resourceType: 'payment',
            resourceId: row.id,
            actorUserIds,
            previousState: 'pending',
            state: row.status,
            data: row,
          });
        }
      }
    });

    res.json({ received: true });
  } catch (err) {
    next(err);
  }
});

// GET /payments/status/:bookingId
router.get('/status/:bookingId', authMiddleware, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT p.* FROM payments p
       JOIN bookings b ON p.booking_id = b.id
       WHERE p.booking_id = $1
         AND (b.customer_id = $2 OR b.labourer_id = $2)`,
      [req.params.bookingId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    res.json({ payment: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// POST /payments/cash — mark booking as paid via cash (fallback)
router.post('/cash', authMiddleware, idempotencyMiddleware(), async (req, res, next) => {
  try {
    const { booking_id } = req.body;
    if (!booking_id) return res.status(400).json({ error: 'booking_id required' });

    const bookingResult = await db.query(
      'SELECT * FROM bookings WHERE id = $1 AND customer_id = $2',
      [booking_id, req.user.id]
    );
    if (bookingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    const booking = bookingResult.rows[0];
    if (booking.status !== 'completed') {
      return res.status(400).json({ error: 'Can only pay for completed bookings' });
    }

    // Upsert payment record
    const result = await db.query(
      `INSERT INTO payments (booking_id, amount, currency, status, peach_result_code)
       VALUES ($1, $2, 'ZAR', 'paid', 'CASH')
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [booking_id, booking.total_amount || 0]
    );

    res.json({ success: true, payment: result.rows[0] || null });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
