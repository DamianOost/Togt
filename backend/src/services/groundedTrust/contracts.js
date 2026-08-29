const crypto = require('crypto');
const { ProblemError } = require('../../lib/problemJson');

const SCHEMA = 'togt.trust.v1';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_JSON_BYTES = 16 * 1024;

const EMERGENCY_FALLBACK = Object.freeze({
  available: true,
  mode: 'device_dialer',
  instruction: 'If anyone is in immediate danger, call emergency services now.',
  togtDispatch: false,
  togtAcknowledgement: false,
  options: Object.freeze([
    Object.freeze({
      kind: 'national_mobile_emergency',
      number: '112',
      label: 'Emergency services from a mobile phone',
      authorityUrl: 'https://www.saps.gov.za/alert/safety_tips_tourist.php',
    }),
    Object.freeze({
      kind: 'police_emergency',
      number: '10111',
      label: 'South African Police Service emergency',
      authorityUrl: 'https://www.saps.gov.za/services/cc_10111.php',
    }),
  ]),
});

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

function assertPlainObject(value, type = 'trust_body_invalid') {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    fail(type, 'Request body is invalid', 400, 'Send a JSON object.');
  }
  return value;
}

function rejectUnknownFields(body, allowed, type = 'trust_fields_invalid') {
  const unknown = Object.keys(body).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    fail(
      type,
      'Request contains unsupported fields',
      422,
      'Remove unsupported fields and retry.',
      { unsupportedFields: unknown.sort() }
    );
  }
}

function assertUuid(value, field) {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    fail('trust_identifier_invalid', `${field} is invalid`, 400, `${field} must be a UUID.`);
  }
  return value;
}

function requireIdempotencyKey(req) {
  const key = req.header('idempotency-key');
  if (!key || typeof key !== 'string' || key.length < 8 || key.length > 255) {
    fail(
      'idempotency_key_required',
      'A valid Idempotency-Key is required',
      400,
      'Send an 8-255 character Idempotency-Key for this consequential command.'
    );
  }
  return key;
}

function requireExpectedRevision(req) {
  const header = req.header('if-match');
  if (!header) {
    fail(
      'trust_revision_required',
      'If-Match is required',
      428,
      'Send the latest resource revision in If-Match.'
    );
  }
  const raw = String(header).trim().replace(/^W\//, '').replace(/^"|"$/g, '');
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) < 1) {
    fail(
      'trust_revision_invalid',
      'If-Match revision is invalid',
      400,
      'If-Match must contain a positive integer revision.'
    );
  }
  return Number(raw);
}

function boundedText(value, field, { min = 1, max = 1000 } = {}) {
  if (typeof value !== 'string') {
    fail('trust_text_invalid', `${field} is invalid`, 422, `${field} must be text.`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    fail(
      'trust_text_invalid',
      `${field} is invalid`,
      422,
      `${field} must contain between ${min} and ${max} characters.`
    );
  }
  return trimmed;
}

function boundedJsonObject(value, field) {
  assertPlainObject(value, 'trust_json_invalid');
  const bytes = Buffer.byteLength(JSON.stringify(value), 'utf8');
  if (bytes > MAX_JSON_BYTES) {
    fail(
      'trust_json_too_large',
      `${field} is too large`,
      413,
      `${field} must be no larger than ${MAX_JSON_BYTES} bytes.`
    );
  }
  return value;
}

function futureIso(value, field, now = Date.now()) {
  if (typeof value !== 'string') {
    fail('trust_schedule_invalid', `${field} is invalid`, 422, `${field} must be an ISO-8601 timestamp.`);
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.getTime() <= now) {
    fail('trust_schedule_invalid', `${field} is invalid`, 422, `${field} must be a future ISO-8601 timestamp.`);
  }
  return date;
}

function validateOccurrenceSchedule(schedule, now = Date.now()) {
  assertPlainObject(schedule, 'recurring_schedule_invalid');
  rejectUnknownFields(schedule, ['timezone', 'occurrences'], 'recurring_schedule_fields_invalid');
  if (schedule.timezone !== 'Africa/Johannesburg') {
    fail(
      'recurring_timezone_unsupported',
      'Schedule timezone is unsupported',
      422,
      'The current South African launch contract requires Africa/Johannesburg.'
    );
  }
  if (!Array.isArray(schedule.occurrences) || schedule.occurrences.length < 2 || schedule.occurrences.length > 104) {
    fail(
      'recurring_occurrences_invalid',
      'Recurring occurrences are invalid',
      422,
      'Provide between 2 and 104 future occurrence timestamps.'
    );
  }
  const dates = schedule.occurrences.map((value, index) => futureIso(value, `occurrences[${index}]`, now));
  for (let index = 1; index < dates.length; index += 1) {
    if (dates[index].getTime() <= dates[index - 1].getTime()) {
      fail(
        'recurring_occurrences_order_invalid',
        'Recurring occurrences are not ordered',
        422,
        'Occurrence timestamps must be unique and strictly increasing.'
      );
    }
  }
  const maximumSpan = 366 * 24 * 60 * 60 * 1000;
  if (dates[dates.length - 1].getTime() - dates[0].getTime() > maximumSpan) {
    fail(
      'recurring_schedule_span_invalid',
      'Recurring schedule is too long',
      422,
      'One proposal may cover at most 366 days.'
    );
  }
  return {
    timezone: schedule.timezone,
    occurrences: dates.map((date) => date.toISOString()),
  };
}

module.exports = {
  SCHEMA,
  UUID_RE,
  EMERGENCY_FALLBACK,
  fail,
  canonicalJson,
  sha256,
  assertPlainObject,
  rejectUnknownFields,
  assertUuid,
  requireIdempotencyKey,
  requireExpectedRevision,
  boundedText,
  boundedJsonObject,
  futureIso,
  validateOccurrenceSchedule,
};
