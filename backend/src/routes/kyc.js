/**
 * KYC: structural SA ID validation + (when configured) VerifyNow real DHA check.
 *
 * Strategy:
 *   1. Local structural Luhn / DOB / age check (free, instant). Catches ~99% of
 *      typos and obviously-fake IDs without burning a paid credit.
 *   2. If structural passes AND verifynow is configured, hit VerifyNow's
 *      said_verification endpoint (1 credit, R2.99). On success, mark
 *      provider=verifynow and store the HANIS-returned name/surname.
 *   3. If verifynow is configured but the call FAILS (network / 5xx / quota),
 *      fall back to structural-only verification with provider=poc_structural
 *      and log the failure. The user is not penalised for a vendor outage.
 *
 * Records carry the `provider` column so we can later batch-reverify any
 * `poc_structural` rows once we want a stricter posture.
 */

const express = require('express');
const saId = require('south-african-id-parser');
const db = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const verifynow = require('../services/verifynow');

const router = express.Router();

const MIN_AGE = 18;

function yearsBetween(from, to) {
  return (to - from) / (1000 * 60 * 60 * 24 * 365.25);
}

function verifyStructural(idNumber) {
  if (typeof idNumber !== 'string' || !/^\d{13}$/.test(idNumber)) {
    return { ok: false, error: 'id_invalid_format' };
  }
  const parsed = saId.parse(idNumber);
  if (!parsed || parsed.isValid === false || !parsed.dateOfBirth) {
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
    await db.query(
      `UPDATE users SET kyc_status = 'failed' WHERE id = $1 AND kyc_status != 'verified'`,
      [userId]
    );
  }
}

// ─── Routes ──────────────────────────────────────────────────────────────────

router.post('/verify-id', authMiddleware, async (req, res, next) => {
  try {
    const { idNumber, firstName, lastName } = req.body || {};
    if (!idNumber || !firstName || !lastName) {
      return res.status(400).json({ error: 'idNumber, firstName, and lastName are required' });
    }

    // 1. Free structural pre-check
    const v = verifyStructural(idNumber);
    const submittedFullName = `${firstName} ${lastName}`;

    if (!v.ok) {
      await upsertKyc({
        userId: req.user.id,
        idNumber,
        status: 'failed',
        fullName: submittedFullName,
        parsed: null,
        provider: 'poc_structural',
      });
      await setUserKycStatus(req.user.id, 'failed');
      return res.status(400).json({ error: v.error });
    }

    // 2. Real DHA check via VerifyNow if configured. Failures fall back to
    //    structural-only so a vendor outage doesn't block onboarding.
    let provider = 'poc_structural';
    let verifiedName = submittedFullName;
    let vendorPayload = null;

    if (verifynow.isConfigured()) {
      try {
        const vn = await verifynow.verifyId({ idNumber, firstName, lastName });
        vendorPayload = vn;
        if (vn.verified) {
          provider = 'verifynow';
          // Use HANIS-returned name where available — closer to the source of truth.
          if (vn.name && vn.surname) {
            verifiedName = `${vn.name} ${vn.surname}`;
          }
        } else {
          // VerifyNow says: ID does not exist in NPR, or is flagged dead/blocked.
          await upsertKyc({
            userId: req.user.id,
            idNumber,
            status: 'failed',
            fullName: submittedFullName,
            parsed: v.parsed,
            provider: 'verifynow',
          });
          await setUserKycStatus(req.user.id, 'failed');
          return res.status(400).json({
            error: 'id_not_in_npr',
            details: 'ID not found in National Population Register',
          });
        }
      } catch (err) {
        console.warn('[kyc] VerifyNow call failed, falling back to structural-only:', err.message);
        provider = 'poc_structural';
      }
    }

    await upsertKyc({
      userId: req.user.id,
      idNumber,
      status: 'verified',
      fullName: verifiedName,
      parsed: v.parsed,
      provider,
    });
    await setUserKycStatus(req.user.id, 'verified');

    return res.json({
      verified: true,
      provider,
      poc_mode: provider === 'poc_structural',
      name: verifiedName,
      dob: v.parsed.dob.toISOString().slice(0, 10),
      parsed_is_male: v.parsed.isMale,
      parsed_is_citizen: v.parsed.isCitizen,
      vendor: vendorPayload ? {
        request_id: vendorPayload.vendor_request_id,
        smart_card: vendorPayload.smart_card,
        on_hanis: vendorPayload.on_hanis,
        on_npr: vendorPayload.on_npr,
        marital_status: vendorPayload.marital_status,
      } : null,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/selfie-enroll', authMiddleware, async (req, res, next) => {
  try {
    const { selfieBase64 } = req.body || {};
    if (!selfieBase64) {
      return res.status(400).json({ error: 'selfieBase64 is required' });
    }
    return res.json({ enrolled: true, poc_mode: true, manual_review: true });
  } catch (err) {
    next(err);
  }
});

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
