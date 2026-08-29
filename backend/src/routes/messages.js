const express = require('express');
const db = require('../config/db');
const { withTx } = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const { messageSendLimiter } = require('../middleware/rateLimit');
const { hashRequest } = require('../middleware/idempotency');
const { hasCanonicalFulfilment } = require('../lib/privacy');
const { problemResponse } = require('../lib/problemJson');

const router = express.Router();

// Cap individual chat message length so a compromised account can't pump
// huge payloads into the counterparty's chat (and Socket.io broadcast).
// 2KB is generous for a chat line; long-form should go through email.
const MESSAGE_MAX_CHARS = 2048;
const TERMINAL_CHAT_STATUSES = new Set(['completed', 'cancelled', 'terminated_after_start']);
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

function canonicalChatReadOnly(booking) {
  return hasCanonicalFulfilment(booking)
    && (TERMINAL_CHAT_STATUSES.has(booking.status) || booking.operational_phase === 'closed');
}

// GET /api/messages/:bookingId — fetch messages for a booking
router.get('/:bookingId', authMiddleware, async (req, res, next) => {
  try {
    const { bookingId } = req.params;
    res.set('Cache-Control', 'private, no-store, max-age=0');
    res.set('Pragma', 'no-cache');
    res.vary('Authorization');

    // Verify user is part of this booking
    const bookingResult = await db.query(
      'SELECT * FROM bookings WHERE id = $1',
      [bookingId]
    );
    if (bookingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    const booking = bookingResult.rows[0];
    if (booking.customer_id !== req.user.id && booking.labourer_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await db.query(
      `SELECT m.id, m.booking_id, m.sender_id, m.body, m.read_at, m.created_at,
              u.name AS sender_name, u.avatar_url AS sender_avatar
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.booking_id = $1
       ORDER BY m.created_at ASC`,
      [bookingId]
    );

    // Mark unread messages as read (messages sent to me)
    await db.query(
      `UPDATE messages SET read_at = NOW()
       WHERE booking_id = $1 AND sender_id != $2 AND read_at IS NULL`,
      [bookingId, req.user.id]
    );

    res.json({ messages: result.rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/messages/:bookingId — send a message
router.post('/:bookingId', messageSendLimiter, authMiddleware, async (req, res, next) => {
  try {
    const { bookingId } = req.params;
    const { body } = req.body;
    const idempotencyKey = req.header('idempotency-key');

    if (typeof body !== 'string' || !body.trim()) {
      return res.status(400).json({ error: 'Message body is required' });
    }
    if (body.length > MESSAGE_MAX_CHARS) {
      return res.status(400).json({
        error: `Message body too long (max ${MESSAGE_MAX_CHARS} chars)`,
      });
    }
    if (idempotencyKey != null
        && (typeof idempotencyKey !== 'string'
          || idempotencyKey.length < 8
          || idempotencyKey.length > 255)) {
      return problemResponse(res, {
        type: 'idempotency_key_invalid',
        title: 'Idempotency-Key is invalid',
        status: 400,
        detail: 'Idempotency-Key must be 8-255 characters (UUID v4 recommended).',
        instance: req.originalUrl,
      });
    }
    const normalizedBody = body.trim();
    const requestHash = hashRequest({ body: normalizedBody });

    const outcome = await withTx(async (client) => {
      // Lock the Project so terminal closure and a message write cannot cross.
      const bookingResult = await client.query(
        `SELECT b.*, ${CANONICAL_FULFILMENT_PROJECTION}
           FROM bookings b
          WHERE b.id = $1
          FOR UPDATE OF b`,
        [bookingId]
      );
      if (bookingResult.rows.length === 0) return { kind: 'not_found' };
      const booking = bookingResult.rows[0];
      if (booking.customer_id !== req.user.id && booking.labourer_id !== req.user.id) {
        return { kind: 'forbidden' };
      }
      if (idempotencyKey) {
        const receiptResult = await client.query(
          `SELECT request_hash, response_status, response_body
             FROM grounded_message_command_receipts
            WHERE actor_user_id = $1 AND booking_id = $2 AND idempotency_key = $3`,
          [req.user.id, bookingId, idempotencyKey]
        );
        const receipt = receiptResult.rows[0];
        if (receipt) {
          return receipt.request_hash === requestHash
            ? { kind: 'replay', status: receipt.response_status, body: receipt.response_body }
            : { kind: 'conflict' };
        }
      }
      if (canonicalChatReadOnly(booking)) return { kind: 'read_only' };
      if (hasCanonicalFulfilment(booking) && !idempotencyKey) {
        return { kind: 'idempotency_required' };
      }

      const result = await client.query(
        `INSERT INTO messages (booking_id, sender_id, body)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [bookingId, req.user.id, normalizedBody]
      );
      const senderResult = await client.query(
        'SELECT name, avatar_url FROM users WHERE id = $1',
        [req.user.id]
      );
      const sender = senderResult.rows[0];
      const message = {
        ...result.rows[0],
        sender_name: sender?.name,
        sender_avatar: sender?.avatar_url,
      };
      const responseBody = { message };
      if (idempotencyKey) {
        await client.query(
          `INSERT INTO grounded_message_command_receipts (
             actor_user_id, booking_id, idempotency_key, request_hash,
             message_id, response_status, response_body
           ) VALUES ($1, $2, $3, $4, $5, 201, $6::jsonb)`,
          [
            req.user.id,
            bookingId,
            idempotencyKey,
            requestHash,
            message.id,
            JSON.stringify(responseBody),
          ]
        );
      }
      return { kind: 'sent', status: 201, body: responseBody };
    });

    if (outcome.kind === 'not_found') {
      return res.status(404).json({ error: 'Booking not found' });
    }
    if (outcome.kind === 'forbidden') {
      return res.status(403).json({ error: 'Not part of this booking' });
    }
    if (outcome.kind === 'read_only') {
      return problemResponse(res, {
        type: 'canonical_chat_read_only',
        title: 'Project chat is read-only',
        status: 409,
        detail: 'This canonical Project is closed under its retention policy. No message was stored or broadcast.',
        instance: req.originalUrl,
        extensions: { projectId: bookingId },
      });
    }
    if (outcome.kind === 'idempotency_required') {
      return problemResponse(res, {
        type: 'idempotency_key_required',
        title: 'Idempotency-Key is required',
        status: 400,
        detail: 'Canonical Project messages require a stable 8-255 character Idempotency-Key.',
        instance: req.originalUrl,
        extensions: { projectId: bookingId },
      });
    }
    if (outcome.kind === 'conflict') {
      return problemResponse(res, {
        type: 'idempotency_key_reused',
        title: 'Idempotency-Key reused with a different message',
        status: 422,
        detail: 'Use the original message body with this key or send a fresh key.',
        instance: req.originalUrl,
        extensions: { projectId: bookingId },
      });
    }
    if (outcome.kind === 'replay') {
      return res
        .status(outcome.status)
        .set('Idempotent-Replay', 'true')
        .json(outcome.body);
    }
    const fullMessage = outcome.body.message;

    // Emit via Socket.io if io is attached to app
    const io = req.app.get('io');
    if (io) {
      io.of('/chat').to(`booking:${bookingId}`).emit('new_message', fullMessage);
    }

    res.status(outcome.status).json(outcome.body);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
