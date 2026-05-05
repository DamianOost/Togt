/**
 * VerifyNow integration — South African DHA-linked ID verification.
 *
 * https://www.verifynow.co.za — provider with direct DHA HANIS access.
 * We hit the SA ID standard tier (1 credit / R2.99 / DHA real-time check).
 *
 * In sandbox mode, the API returns mock NPR records (always succeeds for any
 * structurally-valid SA ID) and consumes no credits. Flip VERIFYNOW_MODE to
 * "production" once the dashboard is topped up.
 */

const axios = require('axios');
const { verifynow: cfg } = require('../config/env');

const ENDPOINT = `${cfg.baseUrl}/verify`;
const REPORT_TYPE = 'said_verification';

function isConfigured() {
  return !!cfg.apiKey;
}

/**
 * Verify an SA ID number against DHA via VerifyNow.
 * @param {object} input — { idNumber, firstName, lastName }
 * @returns {Promise<{verified, name, surname, dob, marital_status, smart_card,
 *                    on_hanis, on_npr, dead_indicator, vendor_request_id, raw}>}
 * @throws on network errors or non-2xx HTTP responses (caller decides to retry vs reject)
 */
async function verifyId({ idNumber, firstName, lastName }) {
  if (!isConfigured()) {
    throw new Error('VERIFYNOW_API_KEY not configured');
  }
  const { data } = await axios.post(
    ENDPOINT,
    {
      mode: cfg.mode,
      reportType: REPORT_TYPE,
      idNumber,
      firstName,
      lastName,
    },
    {
      headers: {
        'x-api-key': cfg.apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 20000,
    }
  );

  // Shape: { success, requestId, results: { said_verification: { Status, realTimeResults: { result: [[record]] } } } }
  const said = data?.results?.said_verification;
  const record = said?.realTimeResults?.result?.[0]?.[0];

  if (!data?.success || !record) {
    return {
      verified: false,
      vendor_request_id: data?.requestId || null,
      raw: data,
    };
  }

  // Treat as verified iff HANIS / NPR confirm the ID and the record is not flagged dead/blocked.
  const onNpr = (record.OnNPR || '').toLowerCase() === 'yes';
  const onHanis = (record.OnHANIS || '').toLowerCase() === 'yes';
  const dead = (record.DeadIndicator || '').toLowerCase() === 'yes';
  const blocked = (record.IDNBlocked || '').toLowerCase() === 'yes';
  const verified = onNpr && !dead && !blocked;

  return {
    verified,
    name: record.Name || null,
    surname: record.Surname || null,
    dob: record.DOB || null,
    marital_status: record.MaritalStatus || null,
    smart_card: !!record.SmartCardIssued,
    on_hanis: onHanis,
    on_npr: onNpr,
    dead_indicator: dead,
    blocked,
    vendor_request_id: data.requestId,
    mode: data.mode,
    raw: record,
  };
}

module.exports = { isConfigured, verifyId };
