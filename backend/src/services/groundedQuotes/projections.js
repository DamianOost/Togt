const CONTACT_PATTERN = /(?:\+?27|0)[\s-]?[6-8][\d\s-]{7,12}\d/g;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const SENSITIVE_KEYS = new Set([
  'address', 'exactAddress', 'latitude', 'longitude', 'location',
  'phone', 'email', 'contact', 'accessInstructions', 'gateCode',
]);

function iso(value) {
  return value == null ? null : new Date(value).toISOString();
}

function sanitizeWorkerBrief(value) {
  if (typeof value === 'string') {
    return value.replace(CONTACT_PATTERN, '[contact removed]').replace(EMAIL_PATTERN, '[contact removed]');
  }
  if (Array.isArray(value)) return value.map(sanitizeWorkerBrief);
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const [key, nested] of Object.entries(value)) {
    if (!SENSITIVE_KEYS.has(key)) result[key] = sanitizeWorkerBrief(nested);
  }
  return result;
}

function catalogueService(row) {
  return {
    id: row.service_id,
    version: Number(row.service_version),
    schemaVersion: Number(row.schema_version),
    canonicalKey: row.canonical_key,
    categoryKey: row.category_key,
    label: row.label_en_za,
    description: row.description_en_za,
    pricingMode: row.pricing_mode,
    fulfilmentMode: row.fulfilment_mode,
    riskTier: row.risk_tier,
    requiredQuestionIds: row.required_question_ids || [],
    briefSchema: row.brief_schema,
    pricingRules: row.pricing_rules,
    materialsRules: row.materials_rules,
    changeOrderRules: row.change_order_rules,
    minimumDurationMinutes: row.minimum_duration_minutes == null
      ? null
      : Number(row.minimum_duration_minutes),
    callOutFee: row.call_out_fee == null ? null : String(row.call_out_fee),
    currency: row.currency,
    cancellationPolicyVersion: row.cancellation_policy_version,
    recurrenceEligible: row.recurrence_eligible,
    workerEligibility: row.worker_eligibility,
    publishedAt: iso(row.published_at),
  };
}

function requestProjection(row, viewerRole) {
  const isCustomer = viewerRole === 'customer';
  const base = {
    id: row.id,
    version: Number(row.request_version),
    status: row.status,
    service: row.service_snapshot,
    brief: isCustomer ? row.brief_snapshot : sanitizeWorkerBrief(row.brief_snapshot),
    area: {
      label: row.broad_area_label,
      precision: 'broad',
    },
    schedule: row.schedule_snapshot,
    questionsDeadlineAt: iso(row.questions_deadline_at),
    quotesCloseAt: iso(row.quotes_close_at),
    selectedAt: iso(row.selected_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
  if (isCustomer) {
    base.customerId = row.customer_id;
    base.privateLocation = row.private_location_snapshot;
    base.selectedQuoteId = row.selected_quote_id || null;
    base.bookingId = row.booking_id || null;
  }
  return base;
}

function workerEvidence(row) {
  const ratingCount = Number(row.rating_count || 0);
  return {
    id: row.worker_id,
    name: row.worker_name,
    avatarUrl: row.worker_avatar || null,
    verification: {
      identityVerified: row.worker_is_verified === true,
    },
    rating: ratingCount > 0
      ? { state: 'rated', average: Number(row.rating_avg), count: ratingCount }
      : { state: 'new_on_togt', average: null, count: 0 },
    serviceOptIn: row.worker_opt_in_status === 'active' ? 'active' : 'inactive',
  };
}

function quoteProjection(row, { includeWorkerEvidence = false } = {}) {
  const quote = {
    id: row.id,
    requestId: row.quote_request_id,
    status: row.status,
    version: Number(row.current_version),
    scope: row.scope,
    deliverables: row.deliverables || [],
    exclusions: row.exclusions || [],
    assumptions: row.assumptions || [],
    schedule: {
      startsAt: iso(row.proposed_start_at),
      endsAt: iso(row.proposed_end_at),
      durationMinutes: row.duration_minutes == null ? null : Number(row.duration_minutes),
      timezone: 'Africa/Johannesburg',
    },
    commercial: {
      labourAmount: row.labour_amount == null ? null : String(row.labour_amount),
      materialsAmount: row.materials_amount == null ? null : String(row.materials_amount),
      customerTotalAmount: row.customer_total_amount == null ? null : String(row.customer_total_amount),
      currency: row.currency || 'ZAR',
      platformFee: row.platform_fee_snapshot,
      workerNet: row.worker_net_snapshot,
    },
    validUntil: iso(row.valid_until),
    submittedAt: iso(row.submitted_at),
    acceptedAt: iso(row.accepted_at),
    declinedAt: iso(row.declined_at),
    expiredAt: iso(row.expired_at),
    withdrawnAt: iso(row.withdrawn_at),
    lostAt: iso(row.lost_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
  if (includeWorkerEvidence) quote.worker = workerEvidence(row);
  return quote;
}

module.exports = {
  catalogueService,
  requestProjection,
  quoteProjection,
  sanitizeWorkerBrief,
};
