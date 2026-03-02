const express = require('express');
const db = require('../config/db');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/services — list all active services (filterable by ?skill=)
router.get('/', async (req, res, next) => {
  try {
    const { skill } = req.query;
    const params = [];
    let where = 'WHERE s.is_active = true';
    if (skill) {
      params.push(skill);
      where += ` AND LOWER(s.skill) = LOWER($${params.length})`;
    }

    const result = await db.query(
      `SELECT s.*,
              u.name AS labourer_name, u.avatar_url AS labourer_avatar,
              lp.rating_avg, lp.rating_count, lp.is_available
       FROM labourer_services s
       JOIN users u ON s.labourer_id = u.id
       JOIN labourer_profiles lp ON s.labourer_id = lp.user_id
       ${where}
       ORDER BY lp.rating_avg DESC, s.created_at DESC`,
      params
    );

    res.json({ services: result.rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/services/labourer/:labourerId — services by labourer
router.get('/labourer/:labourerId', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT s.*,
              u.name AS labourer_name, u.avatar_url AS labourer_avatar
       FROM labourer_services s
       JOIN users u ON s.labourer_id = u.id
       WHERE s.labourer_id = $1 AND s.is_active = true
       ORDER BY s.created_at DESC`,
      [req.params.labourerId]
    );
    res.json({ services: result.rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/services/my — get current labourer's own services (active + inactive)
router.get('/my', authMiddleware, requireRole('labourer'), async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT * FROM labourer_services WHERE labourer_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({ services: result.rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/services — create service listing (labourer only)
router.post('/', authMiddleware, requireRole('labourer'), async (req, res, next) => {
  try {
    const { title, description, skill, rate_per_hour, photos } = req.body;

    if (!title || !skill) {
      return res.status(400).json({ error: 'title and skill are required' });
    }

    const result = await db.query(
      `INSERT INTO labourer_services (labourer_id, title, description, skill, rate_per_hour, photos)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [req.user.id, title, description || null, skill, rate_per_hour || null, photos || []]
    );

    res.status(201).json({ service: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// PUT /api/services/:id — update listing
router.put('/:id', authMiddleware, requireRole('labourer'), async (req, res, next) => {
  try {
    const { title, description, skill, rate_per_hour, photos, is_active } = req.body;

    // Verify ownership
    const check = await db.query(
      'SELECT * FROM labourer_services WHERE id = $1',
      [req.params.id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }
    if (check.rows[0].labourer_id !== req.user.id) {
      return res.status(403).json({ error: 'Not your listing' });
    }

    const existing = check.rows[0];
    const result = await db.query(
      `UPDATE labourer_services
       SET title       = $1,
           description = $2,
           skill       = $3,
           rate_per_hour = $4,
           photos      = $5,
           is_active   = $6
       WHERE id = $7
       RETURNING *`,
      [
        title ?? existing.title,
        description ?? existing.description,
        skill ?? existing.skill,
        rate_per_hour ?? existing.rate_per_hour,
        photos ?? existing.photos,
        is_active !== undefined ? is_active : existing.is_active,
        req.params.id,
      ]
    );

    res.json({ service: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/services/:id — deactivate listing
router.delete('/:id', authMiddleware, requireRole('labourer'), async (req, res, next) => {
  try {
    const check = await db.query(
      'SELECT * FROM labourer_services WHERE id = $1',
      [req.params.id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }
    if (check.rows[0].labourer_id !== req.user.id) {
      return res.status(403).json({ error: 'Not your listing' });
    }

    await db.query(
      'UPDATE labourer_services SET is_active = false WHERE id = $1',
      [req.params.id]
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
