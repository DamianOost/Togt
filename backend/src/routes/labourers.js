const express = require('express');
const db = require('../config/db');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

// Haversine formula to calculate distance in km
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// GET /labourers?lat=&lng=&skill=&radius=
router.get('/', async (req, res, next) => {
  try {
    const { lat, lng, skill, radius = 25 } = req.query;

    let query = `
      SELECT u.id, u.name, u.phone, u.avatar_url,
             lp.skills, lp.hourly_rate, lp.bio,
             lp.is_available, lp.current_lat, lp.current_lng,
             lp.rating_avg, lp.rating_count
      FROM users u
      JOIN labourer_profiles lp ON u.id = lp.user_id
      WHERE u.role = 'labourer' AND lp.is_available = true
    `;
    const params = [];

    if (skill) {
      params.push(`%${skill.toLowerCase()}%`);
      query += ` AND EXISTS (
        SELECT 1 FROM unnest(lp.skills) s WHERE lower(s) LIKE $${params.length}
      )`;
    }

    const result = await db.query(query, params);
    let labourers = result.rows;

    // Filter by radius if coordinates provided
    if (lat && lng) {
      const userLat = parseFloat(lat);
      const userLng = parseFloat(lng);
      const maxRadius = parseFloat(radius);

      labourers = labourers
        .filter((l) => l.current_lat && l.current_lng)
        .map((l) => ({
          ...l,
          distance_km: haversineKm(userLat, userLng, l.current_lat, l.current_lng),
        }))
        .filter((l) => l.distance_km <= maxRadius)
        .sort((a, b) => a.distance_km - b.distance_km);
    }

    res.json({ labourers });
  } catch (err) {
    next(err);
  }
});

// GET /labourers/profile — get own profile (labourer)
router.get('/profile', authMiddleware, requireRole('labourer'), async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT lp.*, u.name, u.email, u.phone, u.avatar_url
       FROM labourer_profiles lp
       JOIN users u ON lp.user_id = u.id
       WHERE lp.user_id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    res.json({ profile: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// GET /labourers/:id
router.get('/:id', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT u.id, u.name, u.phone, u.avatar_url, u.created_at,
              lp.skills, lp.hourly_rate, lp.bio,
              lp.is_available, lp.current_lat, lp.current_lng,
              lp.rating_avg, lp.rating_count
       FROM users u
       JOIN labourer_profiles lp ON u.id = lp.user_id
       WHERE u.id = $1 AND u.role = 'labourer'`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Labourer not found' });
    }

    // Fetch recent ratings
    const ratingsResult = await db.query(
      `SELECT r.score, r.comment, r.created_at, u.name AS reviewer_name
       FROM ratings r
       JOIN users u ON r.reviewer_id = u.id
       WHERE r.reviewee_id = $1
       ORDER BY r.created_at DESC
       LIMIT 10`,
      [req.params.id]
    );

    res.json({ labourer: result.rows[0], reviews: ratingsResult.rows });
  } catch (err) {
    next(err);
  }
});

// PUT /labourers/profile
router.put('/profile', authMiddleware, requireRole('labourer'), async (req, res, next) => {
  try {
    const { skills, hourly_rate, bio, id_number } = req.body;
    const userId = req.user.id;

    const result = await db.query(
      `UPDATE labourer_profiles
       SET skills = COALESCE($1, skills),
           hourly_rate = COALESCE($2, hourly_rate),
           bio = COALESCE($3, bio),
           id_number = COALESCE($4, id_number)
       WHERE user_id = $5
       RETURNING *`,
      [skills, hourly_rate, bio, id_number, userId]
    );

    res.json({ profile: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// PUT /labourers/avatar — update avatar_url
router.put('/avatar', authMiddleware, requireRole('labourer'), async (req, res, next) => {
  try {
    const { avatar_url } = req.body;
    if (!avatar_url) return res.status(400).json({ error: 'avatar_url required' });

    const result = await db.query(
      'UPDATE users SET avatar_url = $1 WHERE id = $2 RETURNING id, name, avatar_url',
      [avatar_url, req.user.id]
    );
    res.json({ user: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// PUT /labourers/availability
router.put('/availability', authMiddleware, requireRole('labourer'), async (req, res, next) => {
  try {
    const { is_available } = req.body;
    if (typeof is_available !== 'boolean') {
      return res.status(400).json({ error: 'is_available must be boolean' });
    }

    const result = await db.query(
      'UPDATE labourer_profiles SET is_available = $1 WHERE user_id = $2 RETURNING *',
      [is_available, req.user.id]
    );
    res.json({ profile: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// PUT /labourers/location
router.put('/location', authMiddleware, requireRole('labourer'), async (req, res, next) => {
  try {
    const { lat, lng } = req.body;
    if (lat == null || lng == null) {
      return res.status(400).json({ error: 'lat and lng are required' });
    }

    await db.query(
      'UPDATE labourer_profiles SET current_lat = $1, current_lng = $2 WHERE user_id = $3',
      [lat, lng, req.user.id]
    );
    res.json({ updated: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
