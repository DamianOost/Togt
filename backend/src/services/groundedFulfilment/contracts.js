const crypto = require('crypto');
const { jwtSecret } = require('../../config/env');
const { ProblemError } = require('../../lib/problemJson');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONEY_RE = /^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/;
const CONTACT_RE = /(?:\+?27|0)[\s-]?[6-8][\d\s-]{7,12}\d|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

function fail(type, title, status = 422, detail, extensions) {
  throw new ProblemError({ type, title, status, detail, extensions });
}

function plainObject(value, label = 'body') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('fulfilment_body_invalid', `${label} must be a JSON object`, 400);
  }
  return value;
}

function rejectUnknown(value, allowed, label = 'body') {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key)).sort();
  if (unknown.length) {
    fail(
      'fulfilment_fields_invalid',
      `${label} contains unsupported fields`,
      422,
      'Remove server-owned or unsupported fields.',
      { unsupportedFields: unknown }
    );
  }
}

function emptyBody(value) {
  const body = value === undefined ? {} : plainObject(value);
  rejectUnknown(body, []);
  return {};
}

function uuid(value, label) {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    fail(`${label}_invalid`, `${label} must be a UUID`, 400);
  }
  return value.toLowerCase();
}

function positiveInteger(value, label, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    fail('fulfilment_value_invalid', `${label} must be a positive integer`, 422);
  }
  return value;
}

function cleanText(value, label, { min = 3, max = 1000, optional = false, rejectContact = false } = {}) {
  if (value == null && optional) return null;
  if (typeof value !== 'string') fail('fulfilment_value_invalid', `${label} must be text`, 422);
  const text = value.trim();
  if (text.length < min || text.length > max) {
    fail('fulfilment_value_invalid', `${label} must contain ${min}-${max} characters`, 422);
  }
  if (rejectContact && CONTACT_RE.test(text)) {
    fail('fulfilment_contact_in_scope', `${label} cannot contain contact details`, 422);
  }
  return text;
}

function cleanItems(value, label = 'items') {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50) {
    fail('scope_items_invalid', `${label} must contain 1-50 items`, 422);
  }
  return value.map((item, index) => cleanText(item, `${label}[${index}]`, {
    min: 1,
    max: 300,
    rejectContact: true,
  }));
}

function money(value, label) {
  const raw = typeof value === 'number' ? String(value) : value;
  if (typeof raw !== 'string' || !MONEY_RE.test(raw)) {
    fail('change_order_amount_invalid', `${label} must be a non-negative ZAR amount with at most two decimals`, 422);
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed > 9_999_999.99) {
    fail('change_order_amount_invalid', `${label} is outside the supported range`, 422);
  }
  return parsed.toFixed(2);
}

function dateTime(value, label) {
  if (typeof value !== 'string') fail('fulfilment_value_invalid', `${label} must be an ISO date-time`, 422);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    fail('fulfilment_value_invalid', `${label} must be an ISO date-time`, 422);
  }
  return parsed;
}

function normalizeArrival(body) {
  const value = plainObject(body);
  rejectUnknown(value, ['attestation']);
  if (value.attestation !== true) {
    fail('arrival_attestation_required', 'Arrival requires explicit worker attestation', 422);
  }
  return { attestation: true };
}

function normalizeScopeProposal(body) {
  const value = plainObject(body);
  rejectUnknown(value, ['baseVersion', 'description', 'items', 'materialsResponsibility', 'estimatedMinutes']);
  return {
    baseVersion: value.baseVersion == null ? null : positiveInteger(value.baseVersion, 'baseVersion'),
    description: cleanText(value.description, 'description', { max: 1500, rejectContact: true }),
    items: cleanItems(value.items),
    materialsResponsibility: cleanText(value.materialsResponsibility, 'materialsResponsibility', {
      min: 2,
      max: 300,
      rejectContact: true,
    }),
    estimatedMinutes: value.estimatedMinutes == null
      ? null
      : positiveInteger(value.estimatedMinutes, 'estimatedMinutes', 10080),
  };
}

function normalizeScopeDecision(body) {
  const value = plainObject(body);
  rejectUnknown(value, ['scopeVersion', 'decision']);
  if (!['confirm', 'decline'].includes(value.decision)) {
    fail('scope_decision_invalid', 'decision must be confirm or decline', 422);
  }
  return {
    scopeVersion: positiveInteger(value.scopeVersion, 'scopeVersion'),
    decision: value.decision,
  };
}

function normalizeStart(body) {
  const value = plainObject(body);
  rejectUnknown(value, ['startPin', 'deviceId']);
  if (typeof value.startPin !== 'string' || !/^\d{6}$/.test(value.startPin)) {
    fail('start_pin_required', 'Enter the six-digit customer start PIN', 422);
  }
  let deviceId = null;
  if (value.deviceId != null) {
    if (typeof value.deviceId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/.test(value.deviceId)) {
      fail('start_device_invalid', 'deviceId must be an opaque 8-128 character identifier', 422);
    }
    deviceId = value.deviceId;
  }
  return { startPin: value.startPin, deviceId };
}

function normalizeReschedule(body) {
  const value = plainObject(body);
  rejectUnknown(value, ['proposedStartsAt', 'reason']);
  const proposedStartsAt = dateTime(value.proposedStartsAt, 'proposedStartsAt');
  if (proposedStartsAt <= new Date()) {
    fail('reschedule_time_invalid', 'The proposed schedule must be in the future', 422);
  }
  return {
    proposedStartsAt,
    reason: cleanText(value.reason, 'reason', { optional: true, max: 500, rejectContact: true }),
  };
}

function normalizeChangeOrder(body) {
  const value = plainObject(body);
  rejectUnknown(value, [
    'baseScopeVersion', 'description', 'addedScopeItems', 'extraMinutes',
    'labourAmount', 'materialsAmount',
  ]);
  const normalized = {
    baseScopeVersion: positiveInteger(value.baseScopeVersion, 'baseScopeVersion'),
    description: cleanText(value.description, 'description', { max: 1000, rejectContact: true }),
    addedScopeItems: cleanItems(value.addedScopeItems, 'addedScopeItems'),
    extraMinutes: value.extraMinutes == null
      ? null
      : positiveInteger(value.extraMinutes, 'extraMinutes', 10080),
    labourAmount: money(value.labourAmount, 'labourAmount'),
    materialsAmount: money(value.materialsAmount, 'materialsAmount'),
  };
  if (Number(normalized.labourAmount) + Number(normalized.materialsAmount) <= 0) {
    fail('change_order_amount_invalid', 'The proposed additional amount must be greater than zero', 422);
  }
  return normalized;
}

function normalizeNoShow(body) {
  const value = plainObject(body);
  rejectUnknown(value, ['attestation']);
  return {
    attestation: cleanText(value.attestation, 'attestation', { max: 1000, rejectContact: true }),
  };
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function requestHash(body, expectedRevision) {
  // A keyed fingerprint keeps low-entropy secrets such as a six-digit start
  // PIN from being brute-forced offline if command receipts are exposed.
  return crypto.createHmac('sha256', jwtSecret)
    .update('togt-grounded-command:v1:')
    .update(canonicalJson({ body: body || {}, expectedRevision }))
    .digest('hex');
}

module.exports = {
  UUID_RE,
  fail,
  plainObject,
  rejectUnknown,
  emptyBody,
  uuid,
  positiveInteger,
  normalizeArrival,
  normalizeScopeProposal,
  normalizeScopeDecision,
  normalizeStart,
  normalizeReschedule,
  normalizeChangeOrder,
  normalizeNoShow,
  requestHash,
};
