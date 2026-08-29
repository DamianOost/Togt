const crypto = require('crypto');
const { ProblemError } = require('../../lib/problemJson');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONEY_RE = /^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/;
const MAX_QUOTE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function fail(type, title, status = 422, detail, extensions) {
  throw new ProblemError({ type, title, status, detail, extensions });
}

function assertUuid(value, label = 'id') {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    fail(`${label}_invalid`, `Invalid ${label}`, 400, `${label} must be a UUID.`);
  }
  return value.toLowerCase();
}

function plainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('quote_payload_invalid', `${label} must be an object`, 422);
  }
  return value;
}

function optionalObject(value, label) {
  if (value == null) return undefined;
  return plainObject(value, label);
}

function stringValue(value, label, { min = 1, max = 1000, optional = false } = {}) {
  if (value == null && optional) return undefined;
  if (typeof value !== 'string') fail('quote_payload_invalid', `${label} must be text`, 422);
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    fail('quote_payload_invalid', `${label} must be ${min}-${max} characters`, 422);
  }
  return trimmed;
}

function stringArray(value, label, { optional = false, maxItems = 40 } = {}) {
  if (value == null && optional) return undefined;
  if (!Array.isArray(value) || value.length > maxItems) {
    fail('quote_payload_invalid', `${label} must be an array with at most ${maxItems} items`, 422);
  }
  return value.map((item, index) => stringValue(item, `${label}[${index}]`, { min: 1, max: 500 }));
}

function dateValue(value, label, { optional = false } = {}) {
  if (value == null && optional) return undefined;
  if (typeof value !== 'string') fail('quote_payload_invalid', `${label} must be an ISO date-time`, 422);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    fail('quote_payload_invalid', `${label} must be an ISO date-time`, 422);
  }
  return date;
}

function moneyValue(value, label, { optional = false } = {}) {
  if (value == null && optional) return undefined;
  const raw = typeof value === 'number' ? String(value) : value;
  if (typeof raw !== 'string' || !MONEY_RE.test(raw)) {
    fail('quote_amount_invalid', `${label} must be a non-negative ZAR amount with at most two decimals`, 422);
  }
  const number = Number(raw);
  if (!Number.isFinite(number) || number > 9_999_999.99) {
    fail('quote_amount_invalid', `${label} is outside the supported range`, 422);
  }
  return number.toFixed(2);
}

function integerValue(value, label, { optional = false, min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value == null && optional) return undefined;
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    fail('quote_payload_invalid', `${label} must be an integer from ${min} to ${max}`, 422);
  }
  return value;
}

function rejectFields(body, unsupported) {
  const present = unsupported.filter((field) => Object.prototype.hasOwnProperty.call(body || {}, field));
  if (present.length) {
    fail(
      'client_authored_state_rejected',
      'Server-owned fields cannot be supplied',
      422,
      'Status, identity, fee, net and selected-booking fields are server authoritative.',
      { unsupportedFields: present.sort() }
    );
  }
}

function rejectUnknownFields(body, allowed, label = 'payload') {
  const unknownFields = Object.keys(body || {}).filter((field) => !allowed.includes(field)).sort();
  if (unknownFields.length) {
    fail(
      'quote_payload_invalid',
      `${label} contains unsupported fields`,
      422,
      'Remove fields that are not part of this versioned contract.',
      { unsupportedFields: unknownFields }
    );
  }
}

function assertEmptyCommandBody(body) {
  const input = plainObject(body || {}, 'command');
  rejectUnknownFields(input, [], 'command');
}

function normalizeLocation(value) {
  const location = plainObject(value, 'privateLocation');
  rejectUnknownFields(location, ['address', 'latitude', 'longitude', 'accessInstructions'], 'privateLocation');
  const address = stringValue(location.address, 'privateLocation.address', { min: 3, max: 500 });
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    fail('quote_location_invalid', 'Private location coordinates are invalid', 422);
  }
  return {
    address,
    latitude,
    longitude,
    accessInstructions: stringValue(location.accessInstructions, 'privateLocation.accessInstructions', {
      optional: true,
      max: 1000,
    }) || null,
  };
}

function normalizeSchedule(value, now = new Date()) {
  const schedule = plainObject(value, 'schedule');
  rejectUnknownFields(schedule, ['startsAt', 'endsAt', 'timezone', 'flexibility'], 'schedule');
  const startsAt = dateValue(schedule.startsAt, 'schedule.startsAt');
  const endsAt = dateValue(schedule.endsAt, 'schedule.endsAt', { optional: true });
  if (startsAt <= now) fail('quote_schedule_invalid', 'The requested schedule must be in the future', 422);
  if (endsAt && endsAt <= startsAt) fail('quote_schedule_invalid', 'schedule.endsAt must follow schedule.startsAt', 422);
  if (schedule.timezone !== 'Africa/Johannesburg') {
    fail('quote_schedule_invalid', 'schedule.timezone must be Africa/Johannesburg', 422);
  }
  return {
    startsAt: startsAt.toISOString(),
    endsAt: endsAt ? endsAt.toISOString() : null,
    timezone: 'Africa/Johannesburg',
    flexibility: stringValue(schedule.flexibility, 'schedule.flexibility', { optional: true, max: 160 }) || null,
  };
}

function normalizeRequestInput(body, service, now = new Date()) {
  const input = plainObject(body, 'request');
  rejectFields(input, [
    'id', 'customerId', 'status', 'selectedQuoteId', 'selectedAt', 'serviceSnapshot',
    'requestVersion', 'createdAt', 'updatedAt', 'workerId', 'availability',
  ]);
  rejectUnknownFields(input, [
    'serviceId', 'serviceVersion', 'brief', 'broadAreaLabel', 'privateLocation',
    'schedule', 'questionsDeadlineAt', 'quotesCloseAt',
  ], 'request');
  const brief = plainObject(input.brief, 'brief');
  rejectUnknownFields(brief, ['answers', 'media', 'summary'], 'brief');
  const answers = plainObject(brief.answers, 'brief.answers');
  const supportedQuestionIds = new Set(
    (service.brief_schema?.questions || [])
      .map((question) => question?.id)
      .filter((id) => typeof id === 'string')
  );
  const unsupportedQuestionIds = Object.keys(answers).filter((id) => !supportedQuestionIds.has(id)).sort();
  if (unsupportedQuestionIds.length) {
    fail(
      'quote_brief_schema_mismatch',
      'Brief answers do not match this service version',
      422,
      'Only question IDs declared by the selected catalogue version are accepted.',
      { unsupportedQuestionIds }
    );
  }
  const missingQuestionIds = (service.required_question_ids || []).filter((id) => {
    const answer = answers[id];
    return answer == null || (typeof answer === 'string' && answer.trim() === '');
  });
  if (missingQuestionIds.length) {
    fail(
      'quote_brief_incomplete',
      'Required service questions are unanswered',
      422,
      'Complete every question required by this service version.',
      { missingQuestionIds }
    );
  }
  const quotesCloseAt = dateValue(input.quotesCloseAt, 'quotesCloseAt');
  if (quotesCloseAt <= now || quotesCloseAt.getTime() - now.getTime() > MAX_QUOTE_WINDOW_MS) {
    fail('quote_deadline_invalid', 'quotesCloseAt must be within the next 30 days', 422);
  }
  const questionsDeadlineAt = dateValue(input.questionsDeadlineAt, 'questionsDeadlineAt', { optional: true });
  if (questionsDeadlineAt && (questionsDeadlineAt <= now || questionsDeadlineAt > quotesCloseAt)) {
    fail('quote_deadline_invalid', 'questionsDeadlineAt must be future and no later than quotesCloseAt', 422);
  }
  const schedule = normalizeSchedule(input.schedule, now);
  if (new Date(schedule.startsAt) <= quotesCloseAt) {
    fail('quote_schedule_invalid', 'The work window must begin after quotes close', 422);
  }
  const media = brief.media == null ? [] : brief.media;
  if (!Array.isArray(media) || media.length > 12) {
    fail('quote_payload_invalid', 'brief.media must contain at most 12 references', 422);
  }
  const normalizedMedia = media.map((item, index) => {
    const reference = plainObject(item, `brief.media[${index}]`);
    rejectUnknownFields(reference, ['id', 'kind'], `brief.media[${index}]`);
    const id = stringValue(reference.id, `brief.media[${index}].id`, { max: 255 });
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(id)) {
      fail('quote_payload_invalid', `brief.media[${index}].id must be an opaque reference`, 422);
    }
    if (reference.kind !== 'image') {
      fail('quote_payload_invalid', `brief.media[${index}].kind must be image`, 422);
    }
    return { id, kind: 'image' };
  });
  const serializedAnswers = JSON.stringify(answers);
  if (Buffer.byteLength(serializedAnswers, 'utf8') > 64 * 1024) {
    fail('quote_payload_too_large', 'Brief answers exceed 64 KiB', 413);
  }
  return {
    brief: {
      schemaVersion: 1,
      answers,
      media: normalizedMedia,
      summary: stringValue(brief.summary, 'brief.summary', { optional: true, max: 1000 }) || null,
    },
    broadAreaLabel: stringValue(input.broadAreaLabel, 'broadAreaLabel', { min: 2, max: 160 }),
    privateLocation: normalizeLocation(input.privateLocation),
    schedule,
    questionsDeadlineAt: questionsDeadlineAt ? questionsDeadlineAt.toISOString() : null,
    quotesCloseAt: quotesCloseAt.toISOString(),
  };
}

function normalizeQuoteInput(body, { requireComplete = false } = {}) {
  const input = plainObject(body, 'quote');
  rejectFields(input, [
    'id', 'quoteRequestId', 'workerId', 'status', 'version', 'currentVersion',
    'customerTotalAmount', 'platformFee', 'workerNet', 'acceptedAt', 'bookingId',
  ]);
  rejectUnknownFields(input, [
    'scope', 'deliverables', 'exclusions', 'assumptions', 'proposedStartAt',
    'proposedEndAt', 'durationMinutes', 'labourAmount', 'materialsAmount', 'validUntil',
  ], 'quote');
  const normalized = {
    scope: stringValue(input.scope, 'scope', { optional: !requireComplete, min: 3, max: 4000 }),
    deliverables: stringArray(input.deliverables, 'deliverables', { optional: !requireComplete }),
    exclusions: stringArray(input.exclusions, 'exclusions', { optional: true }),
    assumptions: stringArray(input.assumptions, 'assumptions', { optional: true }),
    proposedStartAt: dateValue(input.proposedStartAt, 'proposedStartAt', { optional: !requireComplete }),
    proposedEndAt: dateValue(input.proposedEndAt, 'proposedEndAt', { optional: !requireComplete }),
    durationMinutes: integerValue(input.durationMinutes, 'durationMinutes', {
      optional: !requireComplete,
      min: 15,
      max: 10080,
    }),
    labourAmount: moneyValue(input.labourAmount, 'labourAmount', { optional: !requireComplete }),
    materialsAmount: moneyValue(input.materialsAmount, 'materialsAmount', { optional: !requireComplete }),
    validUntil: dateValue(input.validUntil, 'validUntil', { optional: !requireComplete }),
  };
  if (normalized.deliverables && requireComplete && normalized.deliverables.length === 0) {
    fail('quote_incomplete', 'At least one deliverable is required before submission', 422);
  }
  return normalized;
}

function mergeQuoteInput(existing, patch) {
  return {
    scope: patch.scope === undefined ? existing.scope : patch.scope,
    deliverables: patch.deliverables === undefined ? existing.deliverables : patch.deliverables,
    exclusions: patch.exclusions === undefined ? existing.exclusions : patch.exclusions,
    assumptions: patch.assumptions === undefined ? existing.assumptions : patch.assumptions,
    proposedStartAt: patch.proposedStartAt === undefined ? existing.proposedStartAt : patch.proposedStartAt,
    proposedEndAt: patch.proposedEndAt === undefined ? existing.proposedEndAt : patch.proposedEndAt,
    durationMinutes: patch.durationMinutes === undefined ? existing.durationMinutes : patch.durationMinutes,
    labourAmount: patch.labourAmount === undefined ? existing.labourAmount : patch.labourAmount,
    materialsAmount: patch.materialsAmount === undefined ? existing.materialsAmount : patch.materialsAmount,
    validUntil: patch.validUntil === undefined ? existing.validUntil : patch.validUntil,
  };
}

function assertCompleteQuote(quote, request, now = new Date()) {
  const missing = [];
  for (const field of ['scope', 'proposedStartAt', 'proposedEndAt', 'durationMinutes', 'labourAmount', 'materialsAmount', 'validUntil']) {
    if (quote[field] == null) missing.push(field);
  }
  if (!Array.isArray(quote.deliverables) || quote.deliverables.length === 0) missing.push('deliverables');
  if (missing.length) {
    fail('quote_incomplete', 'Quote is incomplete', 422, 'Complete all required commercial and schedule fields.', { missingFields: missing });
  }
  const start = new Date(quote.proposedStartAt);
  const end = new Date(quote.proposedEndAt);
  const validUntil = new Date(quote.validUntil);
  if (start <= now || end <= start) fail('quote_schedule_invalid', 'Proposed work times must be future and ordered', 422);
  const actualMinutes = (end.getTime() - start.getTime()) / 60000;
  // JSON date-times often come from two independent clock reads a few
  // milliseconds apart. Treat sub-second skew as transport precision, not a
  // contradictory commercial duration.
  if (Math.abs(actualMinutes - quote.durationMinutes) > (1 / 60)) {
    fail('quote_schedule_invalid', 'durationMinutes must equal the proposed time window', 422);
  }
  const requestScheduleStart = new Date(request.schedule_snapshot.startsAt);
  if (start < requestScheduleStart) {
    fail('quote_schedule_invalid', 'The proposal cannot start before the customer request window', 422);
  }
  if (validUntil <= now || validUntil > new Date(request.quotes_close_at) || validUntil >= start) {
    fail('quote_expiry_invalid', 'Quote expiry must be future, no later than request close, and before work starts', 422);
  }
  if (Number(quote.labourAmount) + Number(quote.materialsAmount) <= 0) {
    fail('quote_amount_invalid', 'The complete quote total must be greater than zero', 422);
  }
}

function canonicalize(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])
  );
}

function hashPayload(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function requireIdempotencyKey(req) {
  const key = req.header('Idempotency-Key');
  if (typeof key !== 'string' || key.length < 8 || key.length > 255) {
    fail(
      'idempotency_key_required',
      'A valid Idempotency-Key is required',
      400,
      'Send an 8-255 character Idempotency-Key for every quote command.'
    );
  }
  return key;
}

module.exports = {
  UUID_RE,
  assertUuid,
  normalizeRequestInput,
  normalizeQuoteInput,
  mergeQuoteInput,
  assertCompleteQuote,
  hashPayload,
  requireIdempotencyKey,
  rejectUnknownFields,
  assertEmptyCommandBody,
  fail,
};
