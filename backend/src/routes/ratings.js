const express = require('express');
const db = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// POST /ratings — submit a rating after a completed booking
router.post('/', authMiddleware, async (req, res, next) => {
  try {
    const { booking_id, score, comment } = req.body;

    if (!booking_id || !score) {
      return res.status(400).json({ error: 'booking_id and score are required' });
    }
    if (score < 1 || score > 5) {
      return res.status(400).json({ error: 'Score must be between 1 and 5' });
    }

    // Fetch booking and validate
    const bookingResult = await db.query(
      'SELECT * FROM bookings WHERE id = $1',
      [booking_id]
    );
    if (bookingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const booking = bookingResult.rows[0];
    if (booking.status !== 'completed') {
      return res.status(400).json({ error: 'Can only rate completed bookings' });
    }
    if (booking.customer_id !== req.user.id && booking.labourer_id !== req.user.id) {
      return res.status(403).json({ error: 'Not part of this booking' });
    }

    // Determine who is being rated
    const reviewee_id =
      req.user.id === booking.customer_id ? booking.labourer_id : booking.customer_id;

    const result = await db.query(
      `INSERT INTO ratings (booking_id, reviewer_id, reviewee_id, score, comment)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [booking_id, req.user.id, reviewee_id, score, comment || null]
    );

    // Recalculate labourer rating average (only when labourer is reviewed)
    if (reviewee_id === booking.labourer_id) {
      await db.query(
        `UPDATE labourer_profiles
         SET rating_avg = (
           SELECT ROUND(AVG(score)::NUMERIC, 2) FROM ratings WHERE reviewee_id = $1
         ),
         rating_count = (
           SELECT COUNT(*) FROM ratings WHERE reviewee_id = $1
         )
         WHERE user_id = $1`,
        [reviewee_id]
      );
    }

    res.status(201).json({ rating: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'You have already rated this booking' });
    }
    next(err);
  }
});

// GET /ratings/labourer/:id — get ratings for a labourer
router.get('/labourer/:id', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT r.score, r.comment, r.created_at, u.name AS reviewer_name, u.avatar_url AS reviewer_avatar
       FROM ratings r
       JOIN users u ON r.reviewer_id = u.id
       WHERE r.reviewee_id = $1
       ORDER BY r.created_at DESC
       LIMIT 20`,
      [req.params.id]
    );
    res.json({ ratings: result.rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
