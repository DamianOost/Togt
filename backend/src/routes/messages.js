const express = require('express');
const db = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const { messageSendLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// Cap individual chat message length so a compromised account can't pump
// huge payloads into the counterparty's chat (and Socket.io broadcast).
// 2KB is generous for a chat line; long-form should go through email.
const MESSAGE_MAX_CHARS = 2048;

// GET /api/messages/:bookingId — fetch messages for a booking
router.get('/:bookingId', authMiddleware, async (req, res, next) => {
  try {
    const { bookingId } = req.params;

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

    if (!body || !body.trim()) {
      return res.status(400).json({ error: 'Message body is required' });
    }
    if (typeof body !== 'string' || body.length > MESSAGE_MAX_CHARS) {
      return res.status(400).json({
        error: `Message body too long (max ${MESSAGE_MAX_CHARS} chars)`,
      });
    }

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
      return res.status(403).json({ error: 'Not part of this booking' });
    }

    const result = await db.query(
      `INSERT INTO messages (booking_id, sender_id, body)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [bookingId, req.user.id, body.trim()]
    );

    const message = result.rows[0];

    // Attach sender info
    const senderResult = await db.query(
      'SELECT name, avatar_url FROM users WHERE id = $1',
      [req.user.id]
    );
    const sender = senderResult.rows[0];
    const fullMessage = {
      ...message,
      sender_name: sender?.name,
      sender_avatar: sender?.avatar_url,
    };

    // Emit via Socket.io if io is attached to app
    const io = req.app.get('io');
    if (io) {
      io.of('/chat').to(`booking:${bookingId}`).emit('new_message', fullMessage);
    }

    res.status(201).json({ message: fullMessage });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
