const express = require('express');
const crypto = require('crypto');
const db = require('../config/db');
const { SMILE_CONFIG } = require('../config/smileid');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

const isDemo = () =>
  SMILE_CONFIG.partner_id === 'DEMO' || SMILE_CONFIG.api_key === 'DEMO';

function smileSignature(timestamp) {
  return crypto
    .createHmac('sha256', SMILE_CONFIG.api_key)
    .update(`${SMILE_CONFIG.partner_id}:${timestamp}`)
    .digest('base64');
}

async function getAxios() {
  // lazy-require so missing package doesn't break boot
  try {
    return (await import('axios')).default;
  } catch {
    const axios = require('axios');
    return axios.default || axios;
  }
}

// ─── Mock responses for sandbox / demo mode ──────────────────────────────────

function mockIDVerification(firstName, lastName, idNumber) {
  return {
    verified: true,
    name: `${firstName} ${lastName}`.toUpperCase(),
    dob: '1990-01-01', // mock
    photo: null,
    smile_job_id: `mock-${Date.now()}`,
  };
}

function mockSelfieEnroll() {
  return {
    enrolled: true,
    confidence: 0.97,
    smile_job_id: `mock-selfie-${Date.now()}`,
  };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * POST /api/kyc/verify-id
 * Body: { idNumber, firstName, lastName, country?, idType? }
 * Requires auth.
 */
router.post('/verify-id', authMiddleware, async (req, res, next) => {
  try {
    const {
      idNumber,
      firstName,
      lastName,
      country = 'ZA',
      idType = 'NATIONAL_ID',
    } = req.body;

    if (!idNumber || !firstName || !lastName) {
      return res
        .status(400)
        .json({ error: 'idNumber, firstName, and lastName are required' });
    }

    let result;

    if (isDemo()) {
      // ── Sandbox / demo — return a successful mock response ──
      result = mockIDVerification(firstName, lastName, idNumber);
    } else {
      // ── Real Smile ID call ──
      const axios = await getAxios();
      const timestamp = new Date().toISOString();

      const payload = {
        partner_id: SMILE_CONFIG.partner_id,
        timestamp,
        signature: smileSignature(timestamp),
        country,
        id_type: idType,
        id_number: idNumber,
        first_name: firstName,
        last_name: lastName,
      };

      const { data } = await axios.post(
        `${SMILE_CONFIG.base_url}/id_verification`,
        payload,
        { timeout: 15000 }
      );

      const actions = data.Actions || {};
      const verified =
        data.ResultCode === '1012' ||
        (actions.Verify_ID_Number === 'Verified' &&
          actions.Names_Match === 'Verified');

      result = {
        verified,
        name: data.FullName || `${firstName} ${lastName}`,
        dob: data.DOB || null,
        photo: data.Photo || null,
        smile_job_id: data.SmileJobID || null,
      };
    }

    // Upsert KYC record
    const status = result.verified ? 'verified' : 'failed';

    await db.query(
      `INSERT INTO kyc_verifications
         (user_id, id_number, status, smile_job_id, verified_name, verified_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING`,
      [
        req.user.id,
        idNumber,
        status,
        result.smile_job_id || null,
        result.verified ? result.name : null,
        result.verified ? new Date() : null,
      ]
    );

    // Update user kyc_status
    if (result.verified) {
      await db.query(
        `UPDATE users SET kyc_status = 'verified' WHERE id = $1`,
        [req.user.id]
      );
    } else {
      await db.query(
        `UPDATE users SET kyc_status = 'failed' WHERE id = $1 AND kyc_status = 'unverified'`,
        [req.user.id]
      );
    }

    return res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/kyc/selfie-enroll
 * Body: { selfieBase64, idNumber }
 * Requires auth.
 */
router.post('/selfie-enroll', authMiddleware, async (req, res, next) => {
  try {
    const { selfieBase64, idNumber } = req.body;

    if (!selfieBase64) {
      return res.status(400).json({ error: 'selfieBase64 is required' });
    }

    let result;

    if (isDemo()) {
      result = mockSelfieEnroll();
    } else {
      const axios = await getAxios();
      const timestamp = new Date().toISOString();

      const payload = {
        partner_id: SMILE_CONFIG.partner_id,
        timestamp,
        signature: smileSignature(timestamp),
        country: 'ZA',
        id_type: 'NATIONAL_ID',
        id_number: idNumber || '',
        selfie_image: selfieBase64,
        job_type: 4, // SmartSelfie Enrollment
      };

      const { data } = await axios.post(
        `${SMILE_CONFIG.base_url}/upload`,
        payload,
        { timeout: 30000 }
      );

      const actions = data.Actions || {};
      const enrolled =
        data.ResultCode === '0810' ||
        actions.Selfie_Check === 'Passed' ||
        actions.Return_Personal_Info === 'Returned';

      result = {
        enrolled,
        confidence: data.ConfidenceValue
          ? parseFloat(data.ConfidenceValue) / 100
          : 0,
        smile_job_id: data.SmileJobID || null,
      };
    }

    // Update KYC record with selfie enrollment status
    await db.query(
      `UPDATE kyc_verifications
       SET status = CASE WHEN $2 THEN 'verified' ELSE status END,
           verified_at = CASE WHEN $2 THEN NOW() ELSE verified_at END
       WHERE user_id = $1 AND status = 'verified'`,
      [req.user.id, result.enrolled]
    );

    return res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/kyc/status
 * Returns the current user's KYC status.
 * Requires auth.
 */
router.get('/status', authMiddleware, async (req, res, next) => {
  try {
    const userRes = await db.query(
      `SELECT kyc_status FROM users WHERE id = $1`,
      [req.user.id]
    );

    const kycRes = await db.query(
      `SELECT id_number, status, verified_name, verified_at, created_at
       FROM kyc_verifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [req.user.id]
    );

    const user = userRes.rows[0];
    const kyc = kycRes.rows[0] || null;

    return res.json({
      kyc_status: user?.kyc_status || 'unverified',
      verification: kyc,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
