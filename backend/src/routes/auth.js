const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { jwtSecret, jwtRefreshSecret, jwtExpiresIn, jwtRefreshExpiresIn } = require('../config/env');

const router = express.Router();

function generateTokens(user) {
  const payload = { id: user.id, email: user.email, role: user.role };
  const accessToken = jwt.sign(payload, jwtSecret, { expiresIn: jwtExpiresIn });
  const refreshToken = jwt.sign(payload, jwtRefreshSecret, { expiresIn: jwtRefreshExpiresIn });
  return { accessToken, refreshToken };
}

// POST /auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, phone, password, role } = req.body;

    if (!name || !email || !phone || !password || !role) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    if (!['customer', 'labourer'].includes(role)) {
      return res.status(400).json({ error: 'Role must be customer or labourer' });
    }

    const exists = await db.query(
      'SELECT id FROM users WHERE email = $1 OR phone = $2',
      [email.toLowerCase(), phone]
    );
    if (exists.rows.length > 0) {
      return res.status(409).json({ error: 'Email or phone already registered' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const result = await db.query(
      `INSERT INTO users (name, email, phone, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, phone, role, avatar_url, created_at`,
      [name, email.toLowerCase(), phone, password_hash, role]
    );

    const user = result.rows[0];

    // Create labourer profile record if role is labourer
    if (role === 'labourer') {
      await db.query(
        'INSERT INTO labourer_profiles (user_id, skills, hourly_rate) VALUES ($1, $2, $3)',
        [user.id, '{}', 0]
      );
    }

    const tokens = generateTokens(user);
    res.status(201).json({ user, ...tokens });
  } catch (err) {
    next(err);
  }
});

// POST /auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await db.query(
      'SELECT id, name, email, phone, role, password_hash, avatar_url, created_at FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    delete user.password_hash;
    const tokens = generateTokens(user);
    res.json({ user, ...tokens });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me — return full user profile including kyc_status
router.get('/me', require('../middleware/auth').authMiddleware, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT id, name, email, phone, role, avatar_url, kyc_status, created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// POST /auth/push-token — save Expo push token for notifications
router.post('/push-token', require('../middleware/auth').authMiddleware, async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token required' });
    await db.query('UPDATE users SET push_token = $1 WHERE id = $2', [token, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /auth/refresh
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    const decoded = jwt.verify(refreshToken, jwtRefreshSecret);
    const result = await db.query(
      'SELECT id, name, email, phone, role, avatar_url FROM users WHERE id = $1',
      [decoded.id]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    const tokens = generateTokens(user);
    res.json({ user, ...tokens });
  } catch {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

module.exports = router;
