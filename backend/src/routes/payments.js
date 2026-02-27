const express = require('express');
const axios = require('axios');
const db = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const { peach } = require('../config/env');

const router = express.Router();

// POST /payments/initiate — create a Peach Payments checkout for a completed booking
router.post('/initiate', authMiddleware, async (req, res, next) => {
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
router.post('/webhook', express.raw({ type: '*/*' }), async (req, res, next) => {
  try {
    const { checkoutId, resultCode } = req.body;

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

    await db.query(
      `UPDATE payments SET status = $1, peach_result_code = $2 WHERE peach_checkout_id = $3`,
      [newStatus, code, checkoutId]
    );

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

module.exports = router;
