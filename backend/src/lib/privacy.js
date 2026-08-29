const crypto = require('crypto');
const { approvedPublicProfileImageUrl } = require('./publicMedia');
const { publicTextOrNull } = require('./publicText');

const CONTACT_REVEAL_STATUSES = new Set(['accepted', 'in_progress']);
const LOCATION_REVEAL_STATUSES = new Set(['accepted', 'in_progress']);
const CANONICAL_ROUTE_ACCESS_PHASES = new Set([
  'en_route',
  'arrived',
  'scope_confirmation',
  'work_active',
  'completion_review',
]);
const LIVE_LOCATION_TTL_MS = 15 * 60 * 1000;
const MATCH_SCOPE_SUMMARY_FALLBACK = 'Service requested through TOGT';
const MATCH_SCOPE_SUMMARY_MAX_CHARS = 120;

const SENSITIVE_KEYS = new Set([
  'phone',
  'email',
  'id_number',
  'idNumber',
  'address',
  'location_lat',
  'location_lng',
  'current_lat',
  'current_lng',
  'accessToken',
  'refreshToken',
  'token',
  'api_key',
  'key',
  'secret',
  'password',
  'password_hash',
  'selfieBase64',
  'notes',
]);

function stripUndefined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined));
}

function normalizeSouthAfricanId(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 13);
}

function idLast4(value) {
  const normalized = normalizeSouthAfricanId(value);
  return normalized.length >= 4 ? normalized.slice(-4) : null;
}

function blindIndex(value, keyHex) {
  const normalized = normalizeSouthAfricanId(value);
  if (!normalized) return null;
  if (typeof keyHex !== 'string' || !/^[a-f0-9]{64}$/.test(keyHex)) {
    throw new Error('blindIndex: keyHex must be 64 lowercase hex chars');
  }
  return crypto.createHmac('sha256', Buffer.from(keyHex, 'hex'))
    .update(normalized)
    .digest('hex');
}

function approxCoordinate(value) {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Number(n.toFixed(2));
}

function isLocationFresh(row, now = Date.now()) {
  if (!row || !row.location_updated_at) return false;
  const ts = new Date(row.location_updated_at).getTime();
  return Number.isFinite(ts) && now - ts <= LIVE_LOCATION_TTL_MS;
}

function approxLocation(lat, lng, row = {}) {
  if (lat == null || lng == null) return {};
  if (!isLocationFresh(row)) return {};
  return stripUndefined({
    approx_lat: approxCoordinate(lat),
    approx_lng: approxCoordinate(lng),
    location_precision: 'approximate',
  });
}

function isOperationallyActive(status) {
  return CONTACT_REVEAL_STATUSES.has(status);
}

function normalizedPrivateText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toLowerCase() : '';
}

function matchScopeSummary(row = {}) {
  if (typeof row.skill_needed !== 'string') return MATCH_SCOPE_SUMMARY_FALLBACK;
  const candidate = row.skill_needed.trim().replace(/\s+/g, ' ');
  const normalizedCandidate = normalizedPrivateText(candidate);
  const normalizedAddress = normalizedPrivateText(row.address || row.private_address);
  const containsPrivatePattern =
    /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/i.test(candidate)
    || /(?:\+?\d[\d\s().-]*){7,}/.test(candidate)
    || /-?\d{1,3}\.\d{3,}\s*[,;]\s*-?\d{1,3}\.\d{3,}/.test(candidate)
    || (normalizedAddress.length > 0 && normalizedCandidate.includes(normalizedAddress));
  return candidate.length > 0
    && candidate.length <= MATCH_SCOPE_SUMMARY_MAX_CHARS
    && !containsPrivatePattern
    ? candidate
    : MATCH_SCOPE_SUMMARY_FALLBACK;
}

function hasCanonicalFulfilment(row = {}) {
  return row.canonical_fulfilment_policy_present === true
    || row.policy_version != null
    || row.current_scope_version != null
    || row.accepted_quote_id != null
    || row.agreement_quote_id != null
    || row.canonical_agreement_snapshot_present === true
    || row.canonical_match_acceptance_present === true;
}

function hasActiveCanonicalRouteAccess(row = {}) {
  return row.route_access_granted_at != null
    && row.fulfilment_access_revoked_at == null
    && CANONICAL_ROUTE_ACCESS_PHASES.has(row.operational_phase)
    && !['completed', 'cancelled', 'terminated_after_start'].includes(row.status);
}

function canUseLiveLocation(row = {}) {
  if (!CONTACT_REVEAL_STATUSES.has(row.status)) return false;
  return !hasCanonicalFulfilment(row) || hasActiveCanonicalRouteAccess(row);
}

function canRevealLegacyBookingOperations(row = {}) {
  if (!CONTACT_REVEAL_STATUSES.has(row.status)) return false;
  return !hasCanonicalFulfilment(row) || hasActiveCanonicalRouteAccess(row);
}

function redactForAudit(value) {
  if (Array.isArray(value)) return value.map(redactForAudit);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, nested] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(key)) {
      out[key] = '[redacted]';
    } else {
      out[key] = redactForAudit(nested);
    }
  }
  return out;
}

function serializeUserPrivate(user = {}) {
  return stripUndefined({
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    avatar_url: user.avatar_url,
    kyc_status: user.kyc_status,
    created_at: user.created_at,
  });
}

function serializeLabourerPublic(row = {}) {
  const publicName = publicTextOrNull(row.name, { maxLength: 80 }) || 'Worker';
  return stripUndefined({
    id: row.id || row.user_id,
    user_id: row.user_id || row.id,
    name: publicName,
    avatar_url: approvedPublicProfileImageUrl(row.avatar_url) || undefined,
    skills: row.skills,
    hourly_rate: row.hourly_rate,
    bio: publicTextOrNull(row.bio, { maxLength: 1_000 }) || undefined,
    is_available: row.is_available,
    rating_avg: row.rating_avg,
    rating_count: row.rating_count,
    distance_km: row.distance_km == null ? undefined : Number(row.distance_km),
    acceptance_rate_pct: row.acceptance_rate_pct == null ? undefined : Number(row.acceptance_rate_pct),
    completion_rate_pct: row.completion_rate_pct == null ? undefined : Number(row.completion_rate_pct),
    pinged_30d: row.pinged_30d,
    accepted_30d: row.accepted_30d,
    bookings_30d: row.bookings_30d,
    completed_30d: row.completed_30d,
    days_since_last_booking: row.days_since_last_booking,
    ...approxLocation(row.current_lat, row.current_lng, row),
  });
}

function serializeLabourerOwnProfile(row = {}) {
  return stripUndefined({
    user_id: row.user_id,
    id: row.id || row.user_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    avatar_url: row.avatar_url,
    skills: row.skills,
    hourly_rate: row.hourly_rate,
    bio: row.bio,
    emergency_contact: row.emergency_contact,
    is_available: row.is_available,
    current_lat: row.current_lat,
    current_lng: row.current_lng,
    location_updated_at: row.location_updated_at,
    rating_avg: row.rating_avg,
    rating_count: row.rating_count,
  });
}

function serializeBookingForUser(row = {}, viewer = {}) {
  const viewerId = viewer.id || viewer.userId;
  const role = viewer.role;
  const isCustomer = row.customer_id === viewerId || role === 'customer';
  const isLabourer = row.labourer_id === viewerId || role === 'labourer';
  const revealContact = canRevealLegacyBookingOperations(row);
  const revealLocation = LOCATION_REVEAL_STATUSES.has(row.status)
    && canRevealLegacyBookingOperations(row);

  const out = {
    id: row.id,
    customer_id: row.customer_id,
    labourer_id: row.labourer_id,
    status: row.status,
    skill_needed: row.skill_needed,
    scheduled_at: row.scheduled_at,
    hours_est: row.hours_est,
    total_amount: row.total_amount,
    created_at: row.created_at,
    completed_at: row.completed_at,
    cancelled_by: row.cancelled_by,
    is_recurring: row.is_recurring,
    recurrence_pattern: row.recurrence_pattern,
    parent_booking_id: row.parent_booking_id,
    scope_confirmed_by_customer: row.scope_confirmed_by_customer,
    scope_confirmed_by_labourer: row.scope_confirmed_by_labourer,
    scope_confirmed_at: row.scope_confirmed_at,
    payment_status: row.payment_status,
    payment_id: row.payment_id,
    customer_name: row.customer_name,
    customer_avatar: row.customer_avatar,
    labourer_name: row.labourer_name,
    labourer_avatar: row.labourer_avatar,
    hourly_rate: row.hourly_rate,
    skills: row.skills,
  };

  if (isCustomer || (isLabourer && revealLocation)) {
    out.address = row.address;
    out.location_lat = row.location_lat;
    out.location_lng = row.location_lng;
    out.notes = row.notes;
  } else if (isLabourer) {
    Object.assign(out, approxLocation(row.location_lat, row.location_lng, { location_updated_at: new Date() }));
  }

  if (revealContact) {
    if (isCustomer) {
      out.labourer_phone = row.labourer_phone;
      if (revealLocation && isLocationFresh(row)) {
        out.labourer_current_lat = row.current_lat;
        out.labourer_current_lng = row.current_lng;
      }
    }
    if (isLabourer) {
      out.customer_phone = row.customer_phone;
    }
  }

  return stripUndefined(out);
}

function serializeMatchForCustomer(row = {}) {
  return stripUndefined({
    id: row.id,
    customer_id: row.customer_id,
    skill_needed: row.skill_needed,
    address: row.address,
    location_lat: row.location_lat,
    location_lng: row.location_lng,
    scheduled_at: row.scheduled_at,
    hours_est: row.hours_est,
    notes: row.notes,
    status: row.status,
    expire_reason: row.expire_reason,
    matched_booking_id: row.matched_booking_id,
    matched_labourer_id: row.matched_labourer_id,
    matched_at: row.matched_at,
    created_at: row.created_at,
    expires_at: row.expires_at,
  });
}

function serializeMatchForLabourerCandidate(row = {}) {
  const scopeSummary = matchScopeSummary(row);
  return stripUndefined({
    id: row.id,
    matchId: row.matchId || row.id,
    attemptId: row.attemptId,
    skill_needed: scopeSummary,
    scopeSummary,
    scheduled_at: row.scheduled_at,
    hours_est: row.hours_est,
    hourly_rate: row.hourly_rate,
    status: row.status,
    timeout_ms: row.timeout_ms,
    expires_at: row.expires_at,
    ...approxLocation(row.location_lat, row.location_lng, { location_updated_at: new Date() }),
  });
}

function serializeKycStatus(row) {
  if (!row) return null;
  return stripUndefined({
    status: row.status,
    provider: row.provider,
    verified_name: row.verified_name,
    verified_at: row.verified_at,
    created_at: row.created_at,
    id_last4: row.id_last4 || idLast4(row.id_number),
  });
}

function sanitizeEventPayload(eventType, payload = {}, opts = {}) {
  const resourceType = opts.resourceType || (eventType || '').split('.')[0];
  if (resourceType === 'booking') {
    return stripUndefined({
      id: payload.id,
      status: payload.status,
      skill_needed: payload.skill_needed,
      scheduled_at: payload.scheduled_at,
      hours_est: payload.hours_est,
      total_amount: payload.total_amount,
      total_cents: payload.total_cents,
      currency: payload.currency,
      created_at: payload.created_at,
      completed_at: payload.completed_at,
      cancelled_by: payload.cancelled_by,
      is_recurring: payload.is_recurring,
      recurrence_pattern: payload.recurrence_pattern,
      parent_booking_id: payload.parent_booking_id,
      payment_status: payload.payment_status,
      payment_id: payload.payment_id,
    });
  }
  if (resourceType === 'match_request') {
    return stripUndefined({
      id: payload.id,
      status: payload.status,
      skill_needed: payload.skill_needed,
      scheduled_at: payload.scheduled_at,
      hours_est: payload.hours_est,
      expire_reason: payload.expire_reason,
      matched_booking_id: payload.matched_booking_id,
      matched_at: payload.matched_at,
      created_at: payload.created_at,
      expires_at: payload.expires_at,
    });
  }
  return redactForAudit(payload);
}

module.exports = {
  CONTACT_REVEAL_STATUSES,
  LOCATION_REVEAL_STATUSES,
  CANONICAL_ROUTE_ACCESS_PHASES,
  LIVE_LOCATION_TTL_MS,
  MATCH_SCOPE_SUMMARY_FALLBACK,
  MATCH_SCOPE_SUMMARY_MAX_CHARS,
  normalizeSouthAfricanId,
  idLast4,
  blindIndex,
  approxCoordinate,
  approxLocation,
  isLocationFresh,
  isOperationallyActive,
  matchScopeSummary,
  hasCanonicalFulfilment,
  hasActiveCanonicalRouteAccess,
  canUseLiveLocation,
  canRevealLegacyBookingOperations,
  stripUndefined,
  redactForAudit,
  serializeUserPrivate,
  serializeLabourerPublic,
  serializeLabourerOwnProfile,
  serializeBookingForUser,
  serializeMatchForCustomer,
  serializeMatchForLabourerCandidate,
  serializeKycStatus,
  sanitizeEventPayload,
};
