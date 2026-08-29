const express = require('express');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { sendPasswordResetEmail } = require('../services/email');
const db = require('../config/db');
const { authLimiter, refreshLimiter, forgotPasswordLimiter, resetPasswordLimiter } = require('../middleware/rateLimit');
const { authMiddleware } = require('../middleware/auth');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} = require('../lib/jwtTokens');
const { FEATURES, featureAvailable } = require('../config/capabilities');
const {
  createRegistrationPolicy,
} = require('../config/registrationPolicy');

const router = express.Router();

// Refresh-token lifetime in ms (must match jwtRefreshExpiresIn = '7d').
const REFRESH_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
// A second request that was already in flight can reach the row immediately
// after another request commits the rotation. Treat that bounded overlap as a
// conflict, not token theft, so it cannot revoke the winner's new token. Older
// reuse still triggers family revocation below.
const REFRESH_ROTATION_GRACE_MS = 5 * 1000;

// Issue an access+refresh token pair AND persist the refresh jti so we can
// revoke it later (logout, rotation, replay detection).
async function issueTokens(user, queryable = db) {
  const jti = uuidv4();
  const payload = { id: user.id, email: user.email, role: user.role };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken({ ...payload, jti });
  const expiresAt = new Date(Date.now() + REFRESH_LIFETIME_MS);
  await queryable.query(
    'INSERT INTO refresh_tokens (jti, user_id, expires_at) VALUES ($1, $2, $3)',
    [jti, user.id, expiresAt]
  );
  return { accessToken, refreshToken, jti };
}

async function revokeJti(jti, replacedBy = null, queryable = db) {
  await queryable.query(
    'UPDATE refresh_tokens SET revoked_at = NOW(), replaced_by = $2 WHERE jti = $1 AND revoked_at IS NULL',
    [jti, replacedBy]
  );
}

async function revokeAllForUser(userId, queryable = db) {
  await queryable.query(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
    [userId]
  );
}

function registrationConsentError(consent, policy) {
  if (!policy.available || !policy.revision) {
    return {
      status: 503,
      body: {
        error: 'registration_policy_unavailable',
        detail: 'Account creation is paused until the required policy documents are configured.',
        reason_code: policy.reasonCode,
      },
    };
  }
  if (!consent || typeof consent !== 'object' || Array.isArray(consent)) {
    return {
      status: 428,
      body: {
        error: 'policy_consent_required',
        detail: 'Accept the current Terms of Use and Privacy Notice before creating an account.',
      },
    };
  }
  const allowedKeys = new Set(['revision', 'termsAccepted', 'privacyAccepted']);
  if (Object.keys(consent).some((key) => !allowedKeys.has(key))) {
    return {
      status: 400,
      body: {
        error: 'invalid_policy_consent',
        detail: 'Registration consent may contain only the required terms and privacy decision.',
      },
    };
  }
  if (consent.revision !== policy.revision) {
    return {
      status: 409,
      body: {
        error: 'policy_version_outdated',
        detail: 'The registration policies changed. Reload and review the current documents.',
        current_revision: policy.revision,
      },
    };
  }
  if (consent.termsAccepted !== true || consent.privacyAccepted !== true) {
    return {
      status: 428,
      body: {
        error: 'policy_consent_required',
        detail: 'Both required policies must be accepted explicitly.',
      },
    };
  }
  return null;
}

// GET /auth/registration-policy — current, server-authoritative consent gate.
router.get('/registration-policy', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(createRegistrationPolicy());
});

// POST /auth/register
router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const { name, email, phone, password, role, policyConsent } = req.body || {};

    if (![name, email, phone, password, role].every((value) => typeof value === 'string' && value.trim())) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    if (!['customer', 'labourer'].includes(role)) {
      return res.status(400).json({ error: 'Role must be customer or labourer' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const policy = createRegistrationPolicy();
    const policyError = registrationConsentError(policyConsent, policy);
    if (policyError) return res.status(policyError.status).json(policyError.body);

    const password_hash = await bcrypt.hash(password, 10);
    const registration = await db.withTx(async (client) => {
      const exists = await client.query(
        'SELECT id FROM users WHERE email = $1 OR phone = $2',
        [email.toLowerCase(), phone]
      );
      if (exists.rows.length > 0) {
        const duplicate = new Error('Email or phone already registered');
        duplicate.code = 'TOGT_DUPLICATE_ACCOUNT';
        throw duplicate;
      }

      const result = await client.query(
        `INSERT INTO users (name, email, phone, password_hash, role)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, email, phone, role, avatar_url, created_at`,
        [name.trim(), email.toLowerCase(), phone.trim(), password_hash, role]
      );
      const user = result.rows[0];

      if (role === 'labourer') {
        await client.query(
          'INSERT INTO labourer_profiles (user_id, skills, hourly_rate) VALUES ($1, $2, $3)',
          [user.id, '{}', 0]
        );
      }
      for (const document of policy.documents) {
        await client.query(
          `INSERT INTO registration_policy_acceptances (
             user_id, policy_kind, policy_version, policy_revision, document_url
           ) VALUES ($1, $2, $3, $4, $5)`,
          [user.id, document.kind, document.version, policy.revision, document.url]
        );
      }
      const tokens = await issueTokens(user, client);
      return { user, tokens };
    });
    const { user, tokens } = registration;
    res.status(201).json({
      user,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  } catch (err) {
    if (err.code === 'TOGT_DUPLICATE_ACCOUNT' || err.code === '23505') {
      return res.status(409).json({ error: 'Email or phone already registered' });
    }
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
    if (!featureAvailable('remote_push')) {
      return res.status(503).json({
        error: 'capability_unavailable',
        capability: 'remote_push',
        reason_code: FEATURES.remote_push.reason_code,
        detail: 'Remote notifications are not enabled in this build. No push token was stored.',
      });
    }

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
      decoded = verifyRefreshToken(refreshToken);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
    if (!decoded.jti) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const rotation = await db.withTx(async (client) => {
      // The parent row is the rotation claim. The lock serialises concurrent
      // requests; child insert and parent replacement commit atomically.
      const tokenRow = await client.query(
        `SELECT jti, user_id, revoked_at, replaced_by,
                revoked_at IS NOT NULL
                  AND replaced_by IS NOT NULL
                  AND revoked_at >= clock_timestamp() - ($2::integer * INTERVAL '1 millisecond')
                  AS within_rotation_grace
           FROM refresh_tokens
          WHERE jti = $1
          FOR UPDATE`,
        [decoded.jti, REFRESH_ROTATION_GRACE_MS]
      );
      if (tokenRow.rows.length === 0) return { status: 'unknown' };

      const parent = tokenRow.rows[0];
      if (parent.revoked_at) {
        if (parent.within_rotation_grace) {
          return { status: 'already_rotated' };
        }

        // A replay outside the narrow concurrent-rotation window is treated
        // as compromise and revokes every still-live token for this user.
        await revokeAllForUser(parent.user_id, client);
        return { status: 'reuse' };
      }

      if (decoded.id !== parent.user_id) {
        await revokeAllForUser(parent.user_id, client);
        return { status: 'invalid_subject' };
      }

      const result = await client.query(
        'SELECT id, name, email, phone, role, avatar_url FROM users WHERE id = $1',
        [parent.user_id]
      );
      if (result.rows.length === 0) return { status: 'user_missing' };

      const user = result.rows[0];
      const tokens = await issueTokens(user, client);
      const claimed = await client.query(
        `UPDATE refresh_tokens
            SET revoked_at = NOW(), replaced_by = $2
          WHERE jti = $1 AND revoked_at IS NULL`,
        [decoded.jti, tokens.jti]
      );
      if (claimed.rowCount !== 1) {
        throw new Error('Refresh-token rotation claim was lost while holding its row lock');
      }
      return { status: 'rotated', user, tokens };
    });

    if (rotation.status === 'unknown') {
      return res.status(401).json({ error: 'Unknown refresh token' });
    }
    if (rotation.status === 'already_rotated') {
      return res.status(409).json({
        error: 'refresh_rotation_already_completed',
        detail: 'This refresh token was already rotated by another request. Use the newer saved session or sign in again.',
        retryable: false,
      });
    }
    if (rotation.status === 'reuse') {
      return res.status(401).json({ error: 'Refresh token reuse detected' });
    }
    if (rotation.status === 'invalid_subject') {
      return res.status(401).json({ error: 'Invalid refresh token subject' });
    }
    if (rotation.status === 'user_missing') {
      return res.status(401).json({ error: 'User not found' });
    }

    res.json({
      user: rotation.user,
      accessToken: rotation.tokens.accessToken,
      refreshToken: rotation.tokens.refreshToken,
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
        const decoded = verifyRefreshToken(refreshToken);
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
