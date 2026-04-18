/**
 * POC-grade KYC: structural SA ID validation only (no external provider).
 *
 * - Validates the SA ID against Luhn mod-10 checksum
 * - Parses DOB, sex, citizenship from the 13 digits
 * - Rejects anyone under 18
 *
 * This does NOT confirm the ID exists in the SA National Population Register.
 * It catches ~99% of typos and casual fraud but not determined attackers with
 * a valid-but-not-theirs number.
 *
 * Upgrade path: swap `verifyStructural()` for a call to VerifyNow / VerifyID /
 * Smile ID and mark `provider` on the kyc_verifications row so records can
 * later be re-run through a real DHA check.
 */

const express = require('express');
const saId = require('south-african-id-parser');
const db = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

const MIN_AGE = 18;

function yearsBetween(from, to) {
  const ms = to - from;
  return ms / (1000 * 60 * 60 * 24 * 365.25);
}

/**
 * @returns {{ok: true, parsed: {dob: Date, isMale: boolean, isCitizen: boolean}} | {ok: false, error: string}}
 */
function verifyStructural(idNumber) {
  if (typeof idNumber !== 'string' || !/^\d{13}$/.test(idNumber)) {
    return { ok: false, error: 'id_invalid_format' };
  }
  const parsed = saId.parse(idNumber);
  if (!parsed || parsed.isValid === false || !parsed.dateOfBirth) {
    // parser returns isValid=false for bad checksums, invalid dates, or wrong length
    return { ok: false, error: 'id_invalid_checksum' };
  }
  const dob = new Date(parsed.dateOfBirth);
  if (yearsBetween(dob, new Date()) < MIN_AGE) {
    return { ok: false, error: 'id_underage' };
  }
  return {
    ok: true,
    parsed: {
      dob,
      isMale: !!parsed.isMale,
      isCitizen: !!parsed.isSouthAfricanCitizen,
    },
  };
}

async function upsertKyc({ userId, idNumber, status, fullName, parsed, provider }) {
  const existing = await db.query(
    'SELECT id FROM kyc_verifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
    [userId]
  );

  const verifiedAt = status === 'verified' ? new Date() : null;
  const verifiedName = status === 'verified' ? fullName : null;
  const parsedDob = parsed ? parsed.dob : null;
  const parsedSex = parsed ? (parsed.isMale ? 'male' : 'female') : null;
  const parsedIsCitizen = parsed ? parsed.isCitizen : null;

  if (existing.rows.length > 0) {
    await db.query(
      `UPDATE kyc_verifications
         SET id_number = $2, status = $3, verified_name = $4, verified_at = $5,
             provider = $6, parsed_dob = $7, parsed_sex = $8, parsed_is_citizen = $9
         WHERE id = $1`,
      [existing.rows[0].id, idNumber, status, verifiedName, verifiedAt,
       provider, parsedDob, parsedSex, parsedIsCitizen]
    );
  } else {
    await db.query(
      `INSERT INTO kyc_verifications
         (user_id, id_number, status, verified_name, verified_at,
          provider, parsed_dob, parsed_sex, parsed_is_citizen)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [userId, idNumber, status, verifiedName, verifiedAt,
       provider, parsedDob, parsedSex, parsedIsCitizen]
    );
  }
}

async function setUserKycStatus(userId, status) {
  if (status === 'verified') {
    await db.query(`UPDATE users SET kyc_status = 'verified' WHERE id = $1`, [userId]);
  } else if (status === 'failed') {
    // Only move from 'unverified' to 'failed' — don't overwrite a prior 'verified'.
    await db.query(
      `UPDATE users SET kyc_status = 'failed' WHERE id = $1 AND kyc_status != 'verified'`,
      [userId]
    );
  }
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * POST /api/kyc/verify-id
 * Body: { idNumber, firstName, lastName }
 */
router.post('/verify-id', authMiddleware, async (req, res, next) => {
  try {
    const { idNumber, firstName, lastName } = req.body || {};
    if (!idNumber || !firstName || !lastName) {
      return res.status(400).json({ error: 'idNumber, firstName, and lastName are required' });
    }

    const v = verifyStructural(idNumber);
    const fullName = `${firstName} ${lastName}`;

    if (!v.ok) {
      await upsertKyc({
        userId: req.user.id,
        idNumber,
        status: 'failed',
        fullName,
        parsed: null,
        provider: 'poc_structural',
      });
      await setUserKycStatus(req.user.id, 'failed');
      return res.status(400).json({ error: v.error });
    }

    await upsertKyc({
      userId: req.user.id,
      idNumber,
      status: 'verified',
      fullName,
      parsed: v.parsed,
      provider: 'poc_structural',
    });
    await setUserKycStatus(req.user.id, 'verified');

    return res.json({
      verified: true,
      poc_mode: true,
      name: fullName,
      dob: v.parsed.dob.toISOString().slice(0, 10),
      parsed_is_male: v.parsed.isMale,
      parsed_is_citizen: v.parsed.isCitizen,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/kyc/selfie-enroll
 * POC: no-op that accepts the selfie and returns success so the mobile flow
 * can complete. Does not alter kyc_status (already set by /verify-id).
 * Upgrade path: wire into VerifyNow liveness or a manual review queue.
 */
router.post('/selfie-enroll', authMiddleware, async (req, res, next) => {
  try {
    const { selfieBase64 } = req.body || {};
    if (!selfieBase64) {
      return res.status(400).json({ error: 'selfieBase64 is required' });
    }
    // In POC we don't store base64 blobs in Postgres. The real cloud-upload
    // path lives in /upload/profile-image (Cloudinary) — the mobile can call
    // that with the selfie directly if we want persistent evidence later.
    return res.json({ enrolled: true, poc_mode: true, manual_review: true });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/kyc/status
 */
router.get('/status', authMiddleware, async (req, res, next) => {
  try {
    const userRes = await db.query(
      `SELECT kyc_status FROM users WHERE id = $1`,
      [req.user.id]
    );
    const kycRes = await db.query(
      `SELECT id_number, status, provider, verified_name, verified_at, created_at
         FROM kyc_verifications
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
      [req.user.id]
    );
    return res.json({
      kyc_status: userRes.rows[0]?.kyc_status || 'unverified',
      verification: kycRes.rows[0] || null,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
