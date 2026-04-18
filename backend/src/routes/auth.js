const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { sendPasswordResetEmail } = require('../services/email');
const db = require('../config/db');
const { authLimiter, refreshLimiter, forgotPasswordLimiter, resetPasswordLimiter } = require('../middleware/rateLimit');
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

const RESET_CODE_TTL_MS = 15 * 60 * 1000;

function hashResetCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function generateSixDigitCode() {
  return String(crypto.randomInt(100000, 1000000));
}

// POST /auth/forgot-password — always 200 (don't leak whether email is registered).
router.post('/forgot-password', forgotPasswordLimiter, async (req, res, next) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const u = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (u.rows.length === 0) {
      return res.json({ ok: true });
    }

    await db.query(
      'UPDATE password_resets SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL',
      [u.rows[0].id]
    );

    const code = generateSixDigitCode();
    const expiresAt = new Date(Date.now() + RESET_CODE_TTL_MS);
    await db.query(
      'INSERT INTO password_resets (user_id, code_hash, expires_at) VALUES ($1, $2, $3)',
      [u.rows[0].id, hashResetCode(code), expiresAt]
    );

    try {
      await sendPasswordResetEmail({ to: email, code });
    } catch (err) {
      console.error('[forgot-password] email send failed:', err.message);
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /auth/reset-password — verify code + update password + revoke all sessions.
router.post('/reset-password', resetPasswordLimiter, async (req, res, next) => {
  try {
    const { email, code, new_password } = req.body || {};
    if (!email || !code || !new_password) {
      return res.status(400).json({ error: 'email, code, and new_password are required' });
    }
    if (String(new_password).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const u = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (u.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired code' });
    }
    const userId = u.rows[0].id;

    const resetRow = await db.query(
      `SELECT id, expires_at, used_at FROM password_resets
       WHERE user_id = $1 AND code_hash = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId, hashResetCode(code)]
    );
    if (resetRow.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired code' });
    }
    const row = resetRow.rows[0];
    if (row.used_at) {
      return res.status(400).json({ error: 'Invalid or expired code' });
    }
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      return res.status(400).json({ error: 'Invalid or expired code' });
    }

    const password_hash = await bcrypt.hash(new_password, 10);
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [password_hash, userId]);
    await db.query('UPDATE password_resets SET used_at = NOW() WHERE id = $1', [row.id]);

    await revokeAllForUser(userId);
    await db.query('UPDATE users SET push_token = NULL WHERE id = $1', [userId]);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
