const express = require('express');
const axios = require('axios');
const db = require('../config/db');
const { withTx } = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const crypto = require('crypto');
const { peach } = require('../config/env');
const { emitEvent } = require('../services/events');
const { FEATURES } = require('../config/capabilities');

const router = express.Router();

// P0-Triage deliberately disables checkout creation. The previous endpoint
// produced a paymentWidgets.js script URL rather than a proven Hosted Checkout
// handoff and therefore cannot be safely enabled by configuration alone.
router.post('/initiate', authMiddleware, (req, res) => {
  res.status(503).json({
    error: 'capability_unavailable',
    capability: 'peach_checkout',
    reason_code: FEATURES.peach_checkout.reason_code,
    detail: 'Online payment is not enabled in this build. No checkout was created.',
  });
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

// Cash can be arranged out of app, but it cannot be recorded as settled until
// bilateral receipt confirmation and dispute handling exist.
router.post('/cash', authMiddleware, (req, res) => {
  res.status(503).json({
    error: 'capability_unavailable',
    capability: 'cash_settlement',
    reason_code: FEATURES.cash_settlement.reason_code,
    detail: 'Cash settlement is not recorded in this build. No paid state was created.',
  });
});

module.exports = router;
