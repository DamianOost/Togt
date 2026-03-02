const express = require('express');
const db = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// POST /api/safety/sos
// Logs SOS event; returns emergency contact info
router.post('/sos', authMiddleware, async (req, res, next) => {
  try {
    const { lat, lng, booking_id } = req.body;

    await db.query(
      `INSERT INTO sos_events (user_id, booking_id, lat, lng)
       VALUES ($1, $2, $3, $4)`,
      [req.user.id, booking_id || null, lat || null, lng || null]
    );

    // Fetch the user's emergency contact
    const userResult = await db.query(
      'SELECT name, emergency_contact FROM users WHERE id = $1',
      [req.user.id]
    );
    const user = userResult.rows[0];

    res.json({
      message: 'SOS logged',
      emergencyContact: user?.emergency_contact || null,
      saNumber: '10111',
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/safety/emergency-contact
// Update emergency contact on the user's profile
router.patch('/emergency-contact', authMiddleware, async (req, res, next) => {
  try {
    const { emergency_contact } = req.body;
    if (!emergency_contact) return res.status(400).json({ error: 'emergency_contact is required' });

    await db.query('UPDATE users SET emergency_contact = $1 WHERE id = $2', [emergency_contact, req.user.id]);
    res.json({ message: 'Emergency contact updated' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
