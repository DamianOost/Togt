const express = require('express');
const db = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const { problemResponse } = require('../lib/problemJson');

const router = express.Router();

const SOS_FIELDS = new Set(['booking_id', 'lat', 'lng']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sosValidationProblem(res, detail) {
  return problemResponse(res, {
    type: 'sos_payload_invalid',
    title: 'Invalid safety event payload',
    status: 422,
    detail,
  });
}

function validateSosBody(body) {
  if (
    body === null
    || typeof body !== 'object'
    || Array.isArray(body)
    || (Object.getPrototypeOf(body) !== Object.prototype && Object.getPrototypeOf(body) !== null)
  ) {
    return { error: 'The request body must be a JSON object.' };
  }

  const unknownFields = Object.keys(body).filter((key) => !SOS_FIELDS.has(key));
  if (unknownFields.length > 0) {
    return { error: `Unknown field${unknownFields.length === 1 ? '' : 's'}: ${unknownFields.join(', ')}.` };
  }

  let bookingId = null;
  if (Object.prototype.hasOwnProperty.call(body, 'booking_id')) {
    if (typeof body.booking_id !== 'string' || !UUID_RE.test(body.booking_id)) {
      return { error: 'booking_id must be a UUID when provided.' };
    }
    bookingId = body.booking_id;
  }

  const hasLat = Object.prototype.hasOwnProperty.call(body, 'lat');
  const hasLng = Object.prototype.hasOwnProperty.call(body, 'lng');
  if (hasLat !== hasLng) {
    return { error: 'lat and lng must be provided together.' };
  }

  let lat = null;
  let lng = null;
  if (hasLat) {
    if (typeof body.lat !== 'number' || !Number.isFinite(body.lat) || body.lat < -90 || body.lat > 90) {
      return { error: 'lat must be a finite number between -90 and 90.' };
    }
    if (typeof body.lng !== 'number' || !Number.isFinite(body.lng) || body.lng < -180 || body.lng > 180) {
      return { error: 'lng must be a finite number between -180 and 180.' };
    }
    lat = body.lat;
    lng = body.lng;
  }

  return { value: { bookingId, lat, lng } };
}

// POST /api/safety/sos
// Records a safety event. This is not an operated emergency-dispatch service.
// A booking is deliberately optional: direct emergency help must remain
// reachable when no TOGT job exists. If a booking is supplied, the event is
// accepted only from that booking's customer or assigned worker.
router.post('/sos', authMiddleware, async (req, res, next) => {
  try {
    const parsed = validateSosBody(req.body);
    if (parsed.error) return sosValidationProblem(res, parsed.error);

    const result = await db.withTx(async (client) => {
      if (parsed.value.bookingId) {
        const bookingResult = await client.query(
          `SELECT id
             FROM bookings
            WHERE id = $1
              AND (customer_id = $2 OR labourer_id = $2)
            FOR SHARE`,
          [parsed.value.bookingId, req.user.id]
        );
        if (bookingResult.rows.length === 0) return { bookingVisible: false };
      }

      await client.query(
        `INSERT INTO sos_events (user_id, booking_id, lat, lng)
         VALUES ($1, $2, $3, $4)`,
        [req.user.id, parsed.value.bookingId, parsed.value.lat, parsed.value.lng]
      );

      const userResult = await client.query(
        'SELECT emergency_contact FROM users WHERE id = $1',
        [req.user.id]
      );
      return { bookingVisible: true, emergencyContact: userResult.rows[0]?.emergency_contact || null };
    });

    if (!result.bookingVisible) {
      return problemResponse(res, {
        type: 'sos_booking_not_found',
        title: 'Booking not found',
        status: 404,
        detail: 'No participant-visible booking exists for this identifier.',
        instance: req.originalUrl,
      });
    }

    return res.json({
      message: 'Safety event recorded. TOGT did not dispatch emergency services.',
      received: true,
      operations_alerted: false,
      emergency_services_dispatched: false,
      emergencyContact: result.emergencyContact,
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
