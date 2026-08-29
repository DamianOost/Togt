/**
 * Additive v1 UI contracts for legacy marketplace payloads.
 *
 * Adapters copy only validated, known fields. They never infer verification,
 * availability, payment or settlement state from unrelated lifecycle data.
 */

export const DOMAIN_DTO_VERSION = 1 as const;

type LegacyRecord = Record<string, unknown>;

export interface AdapterIssue {
  readonly field: string;
  readonly code: 'missing' | 'invalid' | 'unsupported';
}

export type AdapterResult<T> =
  | { readonly ok: true; readonly value: T; readonly warnings: readonly AdapterIssue[] }
  | { readonly ok: false; readonly issues: readonly AdapterIssue[] };

export interface ServiceSummaryV1 {
  readonly schemaVersion: typeof DOMAIN_DTO_VERSION;
  readonly id: string;
  readonly workerId: string;
  readonly label: string;
  readonly categoryLabel: string;
  readonly description: string | null;
  readonly hourlyRateMinor: number | null;
  readonly active: boolean | null;
  readonly photoUrls: readonly string[];
}

export type VerificationStatus =
  | 'verified'
  | 'pending'
  | 'manual_review'
  | 'failed'
  | 'not_verified'
  | 'not_provided';

export interface WorkerRatingSummary {
  readonly average: number;
  readonly count: number;
}

export interface WorkerSummaryV1 {
  readonly schemaVersion: typeof DOMAIN_DTO_VERSION;
  readonly id: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly skills: readonly string[];
  readonly hourlyRateMinor: number | null;
  readonly available: boolean | null;
  readonly rating: WorkerRatingSummary | null;
  readonly verificationStatus: VerificationStatus;
  readonly distanceKm: number | null;
}

export type ProjectLifecycleStatus =
  | 'requested'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type PaymentEvidenceStatus =
  | 'pending'
  | 'paid'
  | 'failed'
  | 'refunded'
  | 'not_provided';

export interface ProjectSummaryV1 {
  readonly schemaVersion: typeof DOMAIN_DTO_VERSION;
  readonly id: string;
  readonly lifecycleStatus: ProjectLifecycleStatus;
  readonly serviceLabel: string;
  readonly scheduledAt: string | null;
  readonly customerId: string | null;
  readonly workerId: string | null;
  readonly customerDisplayName: string | null;
  readonly workerDisplayName: string | null;
  readonly totalAmountMinor: number | null;
  readonly currency: 'ZAR' | null;
  readonly paymentStatus: PaymentEvidenceStatus;
}

export interface CapabilityAvailabilityV1 {
  readonly schemaVersion: typeof DOMAIN_DTO_VERSION;
  readonly name: string;
  readonly available: boolean;
  readonly mode: string | null;
  readonly assurance: string | null;
  readonly reasonCode: string;
}

function isRecord(value: unknown): value is LegacyRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function firstValue(source: LegacyRecord, aliases: readonly string[]): unknown {
  for (const alias of aliases) {
    if (source[alias] !== undefined && source[alias] !== null) return source[alias];
  }
  return undefined;
}

function cleanString(value: unknown, maxLength = 200): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  if (cleaned.length === 0 || cleaned.length > maxLength) return null;
  return cleaned;
}

function cleanIdentifier(value: unknown): string | null {
  const cleaned = cleanString(value, 128);
  if (!cleaned || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(cleaned)) return null;
  return cleaned;
}

function cleanUrl(value: unknown): string | null {
  const cleaned = cleanString(value, 2_048);
  if (!cleaned) return null;
  try {
    const url = new URL(cleaned);
    return url.protocol === 'https:' || url.protocol === 'http:' ? cleaned : null;
  } catch {
    return null;
  }
}

function cleanStringList(value: unknown, maxItems = 20): readonly string[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  const result: string[] = [];
  for (const item of value.slice(0, maxItems)) {
    const cleaned = cleanString(item, 100);
    if (cleaned && !result.includes(cleaned)) result.push(cleaned);
  }
  return Object.freeze(result);
}

function decimalToMinor(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const source = typeof value === 'number' ? String(value) : value;
  if (typeof source !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(source.trim())) return null;
  const numeric = Number(source);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100_000_000) return null;
  return Math.round(numeric * 100);
}

function cleanNonNegativeNumber(value: unknown): number | null {
  if (
    typeof value !== 'number'
    && (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value.trim()))
  ) {
    return null;
  }
  const numeric = typeof value === 'number' ? value : Number(value.trim());
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function cleanIsoDate(value: unknown): string | null {
  if (typeof value !== 'string' && !(value instanceof Date)) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function fail(fields: readonly string[]): AdapterResult<never> {
  return {
    ok: false,
    issues: Object.freeze(fields.map((field) => Object.freeze({ field, code: 'missing' as const }))),
  };
}

function warning(field: string, code: AdapterIssue['code'] = 'invalid'): AdapterIssue {
  return Object.freeze({ field, code });
}

export function adaptServiceSummaryV1(input: unknown): AdapterResult<ServiceSummaryV1> {
  if (!isRecord(input)) return fail(['service']);

  const id = cleanIdentifier(firstValue(input, ['id', 'service_id', 'serviceId']));
  const workerId = cleanIdentifier(firstValue(input, ['worker_id', 'workerId', 'labourer_id', 'labourerId']));
  const label = cleanString(firstValue(input, ['label', 'title', 'service_name', 'serviceName']), 100);
  const categoryLabel = cleanString(firstValue(input, ['category_label', 'categoryLabel', 'skill']), 100);
  const missing = [
    ...(!id ? ['id'] : []),
    ...(!workerId ? ['workerId'] : []),
    ...(!label ? ['label'] : []),
    ...(!categoryLabel ? ['categoryLabel'] : []),
  ];
  if (missing.length > 0 || !id || !workerId || !label || !categoryLabel) return fail(missing);

  const warnings: AdapterIssue[] = [];
  const rateSource = firstValue(input, ['hourly_rate', 'hourlyRate', 'rate_per_hour', 'ratePerHour']);
  const hourlyRateMinor = decimalToMinor(rateSource);
  if (rateSource !== undefined && hourlyRateMinor === null) warnings.push(warning('hourlyRateMinor'));

  const activeSource = firstValue(input, ['active', 'is_active', 'isActive']);
  const active = typeof activeSource === 'boolean' ? activeSource : null;
  if (activeSource !== undefined && active === null) warnings.push(warning('active'));

  const photosSource = firstValue(input, ['photo_urls', 'photoUrls', 'photos']);
  const photoUrls = Object.freeze(cleanStringList(photosSource).flatMap((item) => {
    const url = cleanUrl(item);
    return url ? [url] : [];
  }));
  if (Array.isArray(photosSource) && photoUrls.length !== photosSource.length) {
    warnings.push(warning('photoUrls'));
  }

  return {
    ok: true,
    value: Object.freeze({
      schemaVersion: DOMAIN_DTO_VERSION,
      id,
      workerId,
      label,
      categoryLabel,
      description: cleanString(firstValue(input, ['description']), 2_000),
      hourlyRateMinor,
      active,
      photoUrls,
    }),
    warnings: Object.freeze(warnings),
  };
}

function verificationStatus(source: LegacyRecord): VerificationStatus {
  const explicit = cleanString(firstValue(source, [
    'verification_status',
    'verificationStatus',
    'kyc_status',
    'kycStatus',
  ]), 40)?.toLowerCase();
  if (explicit === 'verified') return 'verified';
  if (explicit === 'pending') return 'pending';
  if (explicit === 'manual_review' || explicit === 'manual-review') return 'manual_review';
  if (explicit === 'failed' || explicit === 'rejected') return 'failed';
  if (explicit === 'not_verified' || explicit === 'unverified') return 'not_verified';

  const legacyVerified = firstValue(source, ['is_verified', 'isVerified']);
  if (legacyVerified === true) return 'verified';
  if (legacyVerified === false) return 'not_verified';
  return 'not_provided';
}

export function adaptWorkerSummaryV1(input: unknown): AdapterResult<WorkerSummaryV1> {
  if (!isRecord(input)) return fail(['worker']);

  const id = cleanIdentifier(firstValue(input, ['id', 'worker_id', 'workerId', 'user_id', 'userId', 'labourer_id']));
  const displayName = cleanString(firstValue(input, ['display_name', 'displayName', 'name', 'labourer_name']), 100);
  const missing = [...(!id ? ['id'] : []), ...(!displayName ? ['displayName'] : [])];
  if (missing.length > 0 || !id || !displayName) return fail(missing);

  const warnings: AdapterIssue[] = [];
  const rateSource = firstValue(input, ['hourly_rate', 'hourlyRate', 'rate_per_hour', 'ratePerHour']);
  const hourlyRateMinor = decimalToMinor(rateSource);
  if (rateSource !== undefined && hourlyRateMinor === null) warnings.push(warning('hourlyRateMinor'));

  const availabilitySource = firstValue(input, ['available', 'is_available', 'isAvailable']);
  const available = typeof availabilitySource === 'boolean' ? availabilitySource : null;
  if (availabilitySource !== undefined && available === null) warnings.push(warning('available'));

  const ratingAverage = cleanNonNegativeNumber(firstValue(input, ['rating_average', 'ratingAverage', 'rating_avg']));
  const ratingCount = cleanNonNegativeNumber(firstValue(input, ['rating_count', 'ratingCount']));
  let rating: WorkerRatingSummary | null = null;
  if (ratingCount === 0) {
    rating = null;
  } else if (
    ratingAverage !== null
    && ratingAverage >= 1
    && ratingAverage <= 5
    && ratingCount !== null
    && Number.isSafeInteger(ratingCount)
    && ratingCount > 0
  ) {
    rating = Object.freeze({ average: ratingAverage, count: ratingCount });
  } else if (ratingAverage !== null || ratingCount !== null) {
    warnings.push(warning('rating'));
  }

  const distanceSource = firstValue(input, ['distance_km', 'distanceKm']);
  const distanceKm = cleanNonNegativeNumber(distanceSource);
  if (distanceSource !== undefined && distanceKm === null) warnings.push(warning('distanceKm'));

  const avatarSource = firstValue(input, ['avatar_url', 'avatarUrl', 'profile_photo']);
  const avatarUrl = cleanUrl(avatarSource);
  if (avatarSource !== undefined && avatarUrl === null) warnings.push(warning('avatarUrl'));

  return {
    ok: true,
    value: Object.freeze({
      schemaVersion: DOMAIN_DTO_VERSION,
      id,
      displayName,
      avatarUrl,
      skills: cleanStringList(firstValue(input, ['skills'])),
      hourlyRateMinor,
      available,
      rating,
      verificationStatus: verificationStatus(input),
      distanceKm,
    }),
    warnings: Object.freeze(warnings),
  };
}

function lifecycleStatus(value: unknown): ProjectLifecycleStatus | null {
  const status = cleanString(value, 40)?.toLowerCase();
  if (status === 'pending' || status === 'requested') return 'requested';
  if (status === 'accepted') return 'accepted';
  if (status === 'in_progress' || status === 'in-progress') return 'in_progress';
  if (status === 'completed') return 'completed';
  if (status === 'cancelled' || status === 'canceled') return 'cancelled';
  return null;
}

function paymentStatus(value: unknown): PaymentEvidenceStatus {
  const status = cleanString(value, 40)?.toLowerCase();
  if (status === 'pending' || status === 'paid' || status === 'failed' || status === 'refunded') {
    return status;
  }
  return 'not_provided';
}

export function adaptProjectSummaryV1(input: unknown): AdapterResult<ProjectSummaryV1> {
  if (!isRecord(input)) return fail(['project']);

  const id = cleanIdentifier(firstValue(input, ['id', 'project_id', 'projectId', 'booking_id', 'bookingId']));
  const status = lifecycleStatus(firstValue(input, ['lifecycle_status', 'lifecycleStatus', 'status']));
  const serviceLabel = cleanString(firstValue(input, ['service_label', 'serviceLabel', 'skill_needed', 'skillNeeded']), 100);
  const missing = [
    ...(!id ? ['id'] : []),
    ...(!status ? ['lifecycleStatus'] : []),
    ...(!serviceLabel ? ['serviceLabel'] : []),
  ];
  if (missing.length > 0 || !id || !status || !serviceLabel) return fail(missing);

  const warnings: AdapterIssue[] = [];
  const totalSource = firstValue(input, ['total_amount', 'totalAmount']);
  const totalAmountMinor = decimalToMinor(totalSource);
  if (totalSource !== undefined && totalAmountMinor === null) warnings.push(warning('totalAmountMinor'));

  const currencySource = cleanString(firstValue(input, ['currency']), 8)?.toUpperCase();
  const currency = currencySource === 'ZAR' ? 'ZAR' as const : null;
  if (currencySource !== undefined && currency === null) warnings.push(warning('currency', 'unsupported'));

  const paymentSource = firstValue(input, ['payment_status', 'paymentStatus']);
  const explicitPaymentStatus = paymentStatus(paymentSource);
  if (paymentSource !== undefined && explicitPaymentStatus === 'not_provided') {
    warnings.push(warning('paymentStatus', 'unsupported'));
  }

  const scheduledSource = firstValue(input, ['scheduled_at', 'scheduledAt']);
  const scheduledAt = cleanIsoDate(scheduledSource);
  if (scheduledSource !== undefined && scheduledAt === null) warnings.push(warning('scheduledAt'));

  return {
    ok: true,
    value: Object.freeze({
      schemaVersion: DOMAIN_DTO_VERSION,
      id,
      lifecycleStatus: status,
      serviceLabel,
      scheduledAt,
      customerId: cleanIdentifier(firstValue(input, ['customer_id', 'customerId'])),
      workerId: cleanIdentifier(firstValue(input, ['worker_id', 'workerId', 'labourer_id', 'labourerId'])),
      customerDisplayName: cleanString(firstValue(input, ['customer_name', 'customerName']), 100),
      workerDisplayName: cleanString(firstValue(input, ['worker_name', 'workerName', 'labourer_name', 'labourerName']), 100),
      totalAmountMinor,
      currency,
      paymentStatus: explicitPaymentStatus,
    }),
    warnings: Object.freeze(warnings),
  };
}

function cleanControlledToken(value: unknown): string | null {
  const token = cleanString(value, 80);
  return token && /^[a-z][a-z0-9_]*$/.test(token) ? token : null;
}

/**
 * Adapt one feature entry from the current v1 `/api/capabilities` snapshot.
 * Missing, malformed or unsupported data is always unavailable.
 */
export function adaptCapabilityAvailabilityV1(
  name: string,
  snapshot: unknown,
): CapabilityAvailabilityV1 {
  const capabilityName = cleanControlledToken(name) ?? 'unknown_capability';
  if (!isRecord(snapshot) || snapshot.schema_version !== DOMAIN_DTO_VERSION || !isRecord(snapshot.features)) {
    return Object.freeze({
      schemaVersion: DOMAIN_DTO_VERSION,
      name: capabilityName,
      available: false,
      mode: null,
      assurance: null,
      reasonCode: 'capability_data_unavailable',
    });
  }

  const feature = snapshot.features[capabilityName];
  if (!isRecord(feature)) {
    return Object.freeze({
      schemaVersion: DOMAIN_DTO_VERSION,
      name: capabilityName,
      available: false,
      mode: null,
      assurance: null,
      reasonCode: 'capability_not_provided',
    });
  }

  const available = feature.available === true;
  return Object.freeze({
    schemaVersion: DOMAIN_DTO_VERSION,
    name: capabilityName,
    available,
    mode: cleanControlledToken(feature.mode),
    assurance: cleanControlledToken(feature.assurance),
    reasonCode: available
      ? 'available'
      : cleanControlledToken(feature.reason_code) ?? 'disabled_by_default',
  });
}
