const crypto = require('crypto');
const { ProblemError } = require('../../lib/problemJson');
const { configuredVersion } = require('../../config/workerActivationPolicy');

const SCHEMA = 'togt.worker-profile.v1';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const POLICY_VERSION_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const ACKNOWLEDGEMENT_KINDS = new Set([
  'foreground_location',
  'safety_policy',
  'first_job_readiness',
]);

function fail(type, title, status, detail, extensions) {
  throw new ProblemError({ type, title, status, detail, extensions });
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function assertPlainObject(value) {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    fail('worker_body_invalid', 'Request body is invalid', 400, 'Send a JSON object.');
  }
  return value;
}

function rejectUnknownFields(body, allowed) {
  const unknown = Object.keys(body).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    fail(
      'worker_fields_invalid',
      'Request contains unsupported fields',
      422,
      'Remove unsupported fields and retry.',
      { unsupportedFields: unknown.sort() }
    );
  }
}

function assertUuid(value, field = 'identifier') {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    fail('worker_identifier_invalid', `${field} is invalid`, 400, `${field} must be a UUID.`);
  }
  return value;
}

function requireIdempotencyKey(req) {
  const value = req.header('idempotency-key');
  if (typeof value !== 'string' || value.length < 8 || value.length > 255) {
    fail(
      'idempotency_key_required',
      'A valid Idempotency-Key is required',
      400,
      'Send an 8-255 character Idempotency-Key for this mutation.'
    );
  }
  return value;
}

function requireExpectedRevision(req) {
  const header = req.header('if-match');
  if (!header) {
    fail(
      'worker_revision_required',
      'If-Match is required',
      428,
      'Send the latest positive integer resource revision in If-Match.'
    );
  }
  const raw = String(header).trim().replace(/^W\//, '').replace(/^"|"$/g, '');
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) < 1) {
    fail(
      'worker_revision_invalid',
      'If-Match revision is invalid',
      400,
      'If-Match must contain a positive integer revision.'
    );
  }
  return Number(raw);
}

function boundedText(value, field, { min, max, nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string') {
    fail('worker_text_invalid', `${field} is invalid`, 422, `${field} must be text.`);
  }
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    fail(
      'worker_text_invalid',
      `${field} is invalid`,
      422,
      `${field} must contain between ${min} and ${max} characters.`
    );
  }
  return normalized;
}

function optionalWholeNumber(value, field, { minimum = 0 } = {}) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || value < minimum) {
    fail('worker_number_invalid', `${field} is invalid`, 422, `${field} must be a whole number of at least ${minimum}.`);
  }
  return value;
}

function assertPolicyVersion(value) {
  if (typeof value !== 'string' || !POLICY_VERSION_RE.test(value)) {
    fail(
      'worker_policy_version_invalid',
      'Policy version is invalid',
      422,
      'policyVersion must be a stable 1-80 character version identifier.'
    );
  }
  return value;
}

function assertCurrentPolicyVersion(kind, value) {
  const requiredVersion = configuredVersion(kind);
  if (!requiredVersion) {
    fail(
      'worker_activation_content_unavailable',
      'Activation content is unavailable',
      503,
      'The approved server policy/content version is not configured. No acknowledgement was recorded.',
      { kind }
    );
  }
  if (value !== requiredVersion) {
    fail(
      'worker_activation_content_stale',
      'Activation content version is stale',
      409,
      'Fetch and acknowledge the current server-required content version.',
      { kind, requiredVersion }
    );
  }
  return value;
}

function assertAcknowledgementKind(value) {
  if (!ACKNOWLEDGEMENT_KINDS.has(value)) {
    fail(
      'worker_acknowledgement_kind_invalid',
      'Acknowledgement kind is invalid',
      422,
      `Choose one of: ${[...ACKNOWLEDGEMENT_KINDS].join(', ')}.`
    );
  }
  return value;
}

module.exports = {
  SCHEMA,
  UUID_RE,
  ACKNOWLEDGEMENT_KINDS,
  fail,
  sha256,
  assertPlainObject,
  rejectUnknownFields,
  assertUuid,
  requireIdempotencyKey,
  requireExpectedRevision,
  boundedText,
  optionalWholeNumber,
  assertPolicyVersion,
  assertCurrentPolicyVersion,
  assertAcknowledgementKind,
};
