const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { authLimiter, refreshLimiter } = require('../middleware/rateLimit');
const { jwtSecret, jwtRefreshSecret, jwtExpiresIn, jwtRefreshExpiresIn } = require('../config/env');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Refresh-token lifetime in ms (must match jwtRefreshExpiresIn = '7d').
const REFRESH_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

// Issue an access+refresh token pair AND persist the refresh jti so we can
// revoke it later (logout, rotation, replay detection).
async function issueTokens(user) {
  const jti = uuidv4();
  const payload = { id: user.id, email: user.email, role: user.role };
  const accessToken = jwt.sign(payload, jwtSecret, { expiresIn: jwtExpiresIn });
  const refreshToken = jwt.sign({ ...payload, jti }, jwtRefreshSecret, {
    expiresIn: jwtRefreshExpiresIn,
  });
  const expiresAt = new Date(Date.now() + REFRESH_LIFETIME_MS);
  await db.query(
    'INSERT INTO refresh_tokens (jti, user_id, expires_at) VALUES ($1, $2, $3)',
    [jti, user.id, expiresAt]
  );
  return { accessToken, refreshToken, jti };
}

async function revokeJti(jti, replacedBy = null) {
  await db.query(
    'UPDATE refresh_tokens SET revoked_at = NOW(), replaced_by = $2 WHERE jti = $1 AND revoked_at IS NULL',
    [jti, replacedBy]
  );
}

async function revokeAllForUser(userId) {
  await db.query(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
    [userId]
  );
}

// POST /auth/register
router.post('/register', authLimiter, async (req, res, next) => {
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

    if (role === 'labourer') {
      await db.query(
        'INSERT INTO labourer_profiles (user_id, skills, hourly_rate) VALUES ($1, $2, $3)',
        [user.id, '{}', 0]
      );
    }

    const tokens = await issueTokens(user);
    res.status(201).json({
      user,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  } catch (err) {
    next(err);
  }
});

// POST /auth/login
router.post('/login', authLimiter, async (req, res, next) => {
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
    const tokens = await issueTokens(user);
    res.json({
      user,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me — return full user profile including kyc_status
router.get('/me', authMiddleware, async (req, res, next) => {
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
router.post('/push-token', authMiddleware, async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token required' });
    await db.query('UPDATE users SET push_token = $1 WHERE id = $2', [token, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /auth/refresh — rotate: revoke old jti, issue new one
router.post('/refresh', refreshLimiter, async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, jwtRefreshSecret);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
    if (!decoded.jti) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const tokenRow = await db.query(
      'SELECT jti, user_id, revoked_at FROM refresh_tokens WHERE jti = $1',
      [decoded.jti]
    );
    if (tokenRow.rows.length === 0) {
      return res.status(401).json({ error: 'Unknown refresh token' });
    }
    if (tokenRow.rows[0].revoked_at) {
      // Replay detection: the attacker has an old token — revoke everything
      // active for this user so the legitimate "live" token is also killed.
      // The legitimate user logs in again; the attacker is locked out.
      await revokeAllForUser(tokenRow.rows[0].user_id);
      return res.status(401).json({ error: 'Refresh token reuse detected' });
    }

    const result = await db.query(
      'SELECT id, name, email, phone, role, avatar_url FROM users WHERE id = $1',
      [decoded.id]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    const tokens = await issueTokens(user);
    await revokeJti(decoded.jti, tokens.jti);
    res.json({
      user,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  } catch (err) {
    next(err);
  }
});

// POST /auth/logout — revoke provided refresh token + clear push_token
router.post('/logout', authMiddleware, async (req, res, next) => {
  try {
    const { refreshToken } = req.body || {};
    if (refreshToken) {
      try {
        const decoded = jwt.verify(refreshToken, jwtRefreshSecret);
        if (decoded.jti) await revokeJti(decoded.jti);
      } catch {
        // token bad or expired — fall through, still clear push_token
      }
    }
    await db.query('UPDATE users SET push_token = NULL WHERE id = $1', [req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
