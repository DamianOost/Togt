/**
 * KYC: structural SA ID validation + (when configured) VerifyNow real DHA check.
 *
 * Strategy:
 *   1. Local structural Luhn / DOB / age check (free, instant). Catches ~99% of
 *      typos and obviously-fake IDs without burning a paid credit.
 *   2. If structural passes AND verifynow is configured, hit VerifyNow's
 *      said_verification endpoint (1 credit, R2.99). On success, mark
 *      provider=verifynow and store the HANIS-returned name/surname.
 *   3. Structural validity is never identity assurance. If VerifyNow is not
 *      configured or its call fails, retain a truthful pending state without
 *      exposing a production "verified" claim.
 *
 * Records carry the `provider` column so we can later batch-reverify any
 * `poc_structural` rows once we want a stricter posture.
 */

const express = require('express');
const saId = require('south-african-id-parser');
const db = require('../config/db');
const { piiBlindIndexKey } = require('../config/env');
const { authMiddleware } = require('../middleware/auth');
const { blindIndex, idLast4, normalizeSouthAfricanId, serializeKycStatus } = require('../lib/privacy');
const { recordPrivacyAudit } = require('../lib/privacyAudit');
const verifynow = require('../services/verifynow');
const { FEATURES } = require('../config/capabilities');

const router = express.Router();

const MIN_AGE = 18;

function requireIdentityCapability(req, res, next) {
  if (!FEATURES.identity_verification.available) {
    return res.status(503).json({
      verified: false,
      error: 'capability_unavailable',
      capability: 'identity_verification',
      reason_code: FEATURES.identity_verification.reason_code,
      detail: 'Identity verification is not enabled. No identity decision was made.',
    });
  }
  return next();
}

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

async function upsertKyc({ userId, idNumber, status, fullName, provider, providerRequestId }) {
  const existing = await db.query(
    'SELECT id FROM kyc_verifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
    [userId]
  );
  const verifiedAt = status === 'verified' ? new Date() : null;
  const verifiedName = status === 'verified' ? fullName : null;
  const last4 = idLast4(idNumber);
  const index = blindIndex(idNumber, piiBlindIndexKey);

  if (existing.rows.length > 0) {
    await db.query(
      `UPDATE kyc_verifications
         SET id_number = NULL,
             status = $2,
             verified_name = $3,
             verified_at = $4,
             provider = $5,
             parsed_dob = NULL,
             parsed_sex = NULL,
             parsed_is_citizen = NULL,
             id_last4 = $6,
             id_blind_index = $7,
             provider_request_id = $8,
             raw_input_discarded_at = NOW()
         WHERE id = $1`,
      [existing.rows[0].id, status, verifiedName, verifiedAt, provider, last4, index, providerRequestId || null]
    );
  } else {
    await db.query(
      `INSERT INTO kyc_verifications
         (user_id, id_number, status, verified_name, verified_at,
          provider, parsed_dob, parsed_sex, parsed_is_citizen,
          id_last4, id_blind_index, provider_request_id, raw_input_discarded_at)
       VALUES ($1, NULL, $2, $3, $4, $5, NULL, NULL, NULL, $6, $7, $8, NOW())`,
      [userId, status, verifiedName, verifiedAt, provider, last4, index, providerRequestId || null]
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
  } else if (status === 'pending') {
    await db.query(
      `UPDATE users SET kyc_status = 'pending' WHERE id = $1 AND kyc_status != 'verified'`,
      [userId]
    );
  }
}

// ─── Routes ──────────────────────────────────────────────────────────────────

router.post('/verify-id', authMiddleware, requireIdentityCapability, async (req, res, next) => {
  try {
    const { idNumber, firstName, lastName } = req.body || {};
    if (!idNumber || !firstName || !lastName) {
      return res.status(400).json({ error: 'idNumber, firstName, and lastName are required' });
    }
    const normalizedId = normalizeSouthAfricanId(idNumber);

    // 1. Free structural pre-check
    const v = verifyStructural(normalizedId);
    const submittedFullName = `${firstName} ${lastName}`;

    if (!v.ok) {
      await upsertKyc({
        userId: req.user.id,
        idNumber: normalizedId,
        status: 'failed',
        fullName: submittedFullName,
        provider: 'poc_structural',
      });
      await setUserKycStatus(req.user.id, 'failed');
      recordPrivacyAudit(req, {
        action: 'privacy.kyc.verify_attempt',
        resource: { type: 'user', id: req.user.id },
        statusCode: 400,
        metadata: { status: 'failed', provider: 'poc_structural', reason: v.error, id_last4: idLast4(normalizedId) },
        errorCode: v.error,
      });
      return res.status(400).json({ error: v.error });
    }

    // 2. Real DHA check via VerifyNow if configured. Structural validity on
    //    its own remains pending and never receives a Verified badge.
    let provider = 'poc_structural';
    let verifiedName = submittedFullName;
    let vendorPayload = null;
    let providerUnavailable = !verifynow.isConfigured();

    if (verifynow.isConfigured()) {
      try {
        const vn = await verifynow.verifyId({ idNumber: normalizedId, firstName, lastName });
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
            idNumber: normalizedId,
            status: 'failed',
            fullName: submittedFullName,
            provider: 'verifynow',
            providerRequestId: vn.vendor_request_id,
          });
          await setUserKycStatus(req.user.id, 'failed');
          recordPrivacyAudit(req, {
            action: 'privacy.kyc.verify_attempt',
            resource: { type: 'user', id: req.user.id },
            statusCode: 400,
            metadata: { status: 'failed', provider: 'verifynow', id_last4: idLast4(normalizedId) },
            errorCode: 'id_not_in_npr',
          });
          return res.status(400).json({
            error: 'id_not_in_npr',
            details: 'ID not found in National Population Register',
          });
        }
      } catch (err) {
        console.warn('[kyc] VerifyNow call failed; identity remains pending:', err.message);
        provider = 'poc_structural';
        providerUnavailable = true;
      }
    }

    if (provider !== 'verifynow' || providerUnavailable) {
      await upsertKyc({
        userId: req.user.id,
        idNumber: normalizedId,
        status: 'pending',
        fullName: submittedFullName,
        provider: 'poc_structural',
      });
      await setUserKycStatus(req.user.id, 'pending');
      recordPrivacyAudit(req, {
        action: 'privacy.kyc.verify_attempt',
        resource: { type: 'user', id: req.user.id },
        statusCode: providerUnavailable && verifynow.isConfigured() ? 503 : 202,
        metadata: {
          status: 'pending',
          provider: 'poc_structural',
          reason: 'authoritative_provider_unavailable',
          id_last4: idLast4(normalizedId),
        },
        errorCode: 'identity_verification_unavailable',
      });
      const responseStatus = providerUnavailable && verifynow.isConfigured() ? 503 : 202;
      return res.status(responseStatus).json({
        verified: false,
        status: 'pending_review',
        assurance: 'structural_only',
        provider: 'poc_structural',
        id_last4: idLast4(normalizedId),
        retryable: responseStatus === 503,
        error: 'identity_verification_unavailable',
        detail: 'The ID format passed validation, but identity verification is not available.',
      });
    }

    await upsertKyc({
      userId: req.user.id,
      idNumber: normalizedId,
      status: 'verified',
      fullName: verifiedName,
      provider,
      providerRequestId: vendorPayload?.vendor_request_id,
    });
    await setUserKycStatus(req.user.id, 'verified');
    recordPrivacyAudit(req, {
      action: 'privacy.kyc.verify_attempt',
      resource: { type: 'user', id: req.user.id },
      statusCode: 200,
      metadata: { status: 'verified', provider, id_last4: idLast4(normalizedId) },
    });

    return res.json({
      verified: true,
      provider,
      poc_mode: provider === 'poc_structural',
      name: verifiedName,
      id_last4: idLast4(normalizedId),
      vendor: vendorPayload ? {
        request_id: vendorPayload.vendor_request_id,
      } : null,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/selfie-enroll', authMiddleware, async (req, res, next) => {
  return res.status(503).json({
    enrolled: false,
    error: 'capability_unavailable',
    capability: 'selfie_identity_verification',
    reason_code: FEATURES.selfie_identity_verification.reason_code,
    detail: 'Selfie identity matching is not available. No biometric verification was performed.',
  });
});

router.get('/status', authMiddleware, async (req, res, next) => {
  try {
    const userRes = await db.query(
      `SELECT kyc_status FROM users WHERE id = $1`,
      [req.user.id]
    );
    const kycRes = await db.query(
      `SELECT id_last4, status, provider, verified_name, verified_at, created_at
         FROM kyc_verifications
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
      [req.user.id]
    );
    recordPrivacyAudit(req, {
      action: 'privacy.kyc.status_read',
      resource: { type: 'user', id: req.user.id },
      statusCode: 200,
      metadata: { has_verification: kycRes.rows.length > 0 },
    });
    return res.json({
      kyc_status: userRes.rows[0]?.kyc_status || 'unverified',
      verification: serializeKycStatus(kycRes.rows[0]) || null,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
