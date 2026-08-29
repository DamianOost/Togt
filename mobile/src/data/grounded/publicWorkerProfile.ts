import type {
  MoneyAmount,
  PriceEvidence,
  VerificationEvidence,
  WorkerProfileSnapshot,
} from '../../features/customer/projects/model';

type JsonRecord = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROFILE_SCHEMA = 'togt.grounded-worker-public-profile.v1';
const SENSITIVE_PROFILE_KEY = /^(?:address|exactAddress|phone|email|contact|latitude|longitude|lat|lng|reviewer|reviewerName|reviewer_name)$/i;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function containsSensitiveProfileKey(value: unknown, depth = 0): boolean {
  if (depth > 8 || value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((item) => containsSensitiveProfileKey(item, depth + 1));
  return Object.entries(value as JsonRecord).some(([key, child]) => (
    SENSITIVE_PROFILE_KEY.test(key) || containsSensitiveProfileKey(child, depth + 1)
  ));
}

export function publicProfileUuid(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null;
}

export function publicProfileWhole(value: unknown, minimum = 0): number | null {
  return Number.isSafeInteger(value) && Number(value) >= minimum ? Number(value) : null;
}

function text(value: unknown, maximum: number, { empty = false } = {}): string | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  return candidate.length <= maximum && (empty || candidate.length > 0) ? candidate : null;
}

function money(value: unknown): MoneyAmount | null {
  if (!isRecord(value) || value.currency !== 'ZAR') return null;
  const amountMinor = publicProfileWhole(value.amountMinor);
  return amountMinor === null ? null : Object.freeze({ currency: 'ZAR', amountMinor });
}

function supportedMoney(value: unknown): MoneyAmount | null {
  if (!isRecord(value) || value.status !== 'supported' || !isRecord(value.value)) return null;
  return money(value.value);
}

function price(raw: JsonRecord): PriceEvidence {
  const fixed = supportedMoney(raw.fixedCustomerAmount);
  if (fixed) return Object.freeze({ kind: 'fixed', total: fixed, label: 'Published fixed customer amount' });
  const hourly = money(raw.hourlyRate);
  if (hourly) return Object.freeze({ kind: 'hourly', rate: hourly, estimatedTotal: null, approvalCap: null });
  const callOut = money(raw.callOutAmount);
  if (callOut) return Object.freeze({ kind: 'diagnostic', visitTotal: callOut, deliverable: 'Diagnostic visit only', laterWorkIncluded: false });
  return Object.freeze({
    kind: 'not_yet_available',
    reasonCode: raw.pricingMode === 'remote_quote' ? 'waiting_for_quote' : 'data_unavailable',
  });
}

function verification(value: unknown): readonly VerificationEvidence[] | null {
  if (!Array.isArray(value)) return null;
  const evidence: VerificationEvidence[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) return null;
    const id = text(raw.badgeId, 128);
    const label = text(raw.label, 120);
    const detail = text(raw.detail, 500, { empty: true });
    const status = raw.status;
    if (!id || !label || detail === null || (status !== 'verified' && status !== 'pending' && status !== 'not_verified')) return null;
    evidence.push(Object.freeze({ id, label, detail, status }));
  }
  return Object.freeze(evidence);
}

export function adaptGroundedWorkerPublicProfileV1(
  input: unknown,
  expectedWorkerId: string,
  preferredServiceId: string | null = null,
  preferredServiceVersion: number | null = null,
): WorkerProfileSnapshot | null {
  if (!isRecord(input) || containsSensitiveProfileKey(input) || input.schema !== PROFILE_SCHEMA || !isRecord(input.profile)) return null;
  const source = input.profile;
  const workerId = publicProfileUuid(source.workerId);
  const displayName = text(source.displayName, 80);
  const stateVersion = publicProfileWhole(source.stateVersion, 1);
  const profilePhoto = isRecord(source.profilePhoto) && source.profilePhoto.status === 'supported' && isRecord(source.profilePhoto.value)
    ? text(source.profilePhoto.value.uri, 2_048)
    : null;
  const publicBadges = verification(source.publicBadges);
  const ratingSource = isRecord(source.rating) ? source.rating : null;
  const average = ratingSource && typeof ratingSource.average === 'number' && ratingSource.average >= 1 && ratingSource.average <= 5
    ? ratingSource.average
    : null;
  const count = ratingSource ? publicProfileWhole(ratingSource.count, 1) : null;
  if (!workerId || workerId !== expectedWorkerId || !displayName || stateVersion === null || !publicBadges || !Array.isArray(source.offerings) || !Array.isArray(source.reviews)) return null;

  const offerings: Array<WorkerProfileSnapshot['serviceVariants'][number] & { price: PriceEvidence }> = [];
  for (const raw of source.offerings) {
    if (!isRecord(raw)) return null;
    const serviceId = publicProfileUuid(raw.serviceId);
    const serviceVersion = publicProfileWhole(raw.serviceVersion, 1);
    const label = text(raw.title ?? raw.catalogueLabel, 120);
    const description = text(raw.description, 1_500, { empty: true });
    if (!serviceId || serviceVersion === null || !label || description === null) return null;
    offerings.push(Object.freeze({
      serviceId,
      serviceVersion,
      label,
      description,
      availabilityLabel: source.currentlyAvailable === true ? 'Accepting requests' : 'Requests paused',
      price: price(raw),
    }));
  }

  const reviews: WorkerProfileSnapshot['reviews'][number][] = [];
  for (const raw of source.reviews) {
    if (!isRecord(raw)) return null;
    const reviewId = publicProfileUuid(raw.reviewId);
    const rating = publicProfileWhole(raw.rating, 1);
    const body = raw.body === null ? null : text(raw.body, 1_000, { empty: true });
    const publishedAt = text(raw.publishedAt, 40);
    const serviceLabel = text(raw.serviceLabel, 120);
    if (!reviewId || rating === null || rating > 5 || body === null && raw.body !== null || !publishedAt || Number.isNaN(Date.parse(publishedAt)) || !serviceLabel) return null;
    reviews.push(Object.freeze({ reviewId, rating: rating as 1 | 2 | 3 | 4 | 5, body, publishedAt: new Date(publishedAt).toISOString(), serviceLabel }));
  }

  const orderedOfferings = preferredServiceId
    ? Object.freeze([
        ...offerings.filter((offering) => offering.serviceId === preferredServiceId
          && (preferredServiceVersion === null || offering.serviceVersion === preferredServiceVersion)),
        ...offerings.filter((offering) => offering.serviceId !== preferredServiceId
          || (preferredServiceVersion !== null && offering.serviceVersion !== preferredServiceVersion)),
      ])
    : Object.freeze(offerings);
  const primary = orderedOfferings[0] ?? null;
  const completedJobs = source.completedJobs === null ? null : publicProfileWhole(source.completedJobs);
  if (source.completedJobs !== null && completedJobs === null) return null;
  const currentlyAvailable = source.currentlyAvailable === true && primary !== null;
  return Object.freeze({
    worker: Object.freeze({
      workerId,
      displayName,
      photoUrl: profilePhoto,
      serviceId: primary?.serviceId ?? '',
      serviceVersion: primary?.serviceVersion ?? 1,
      serviceLabel: primary?.label ?? 'No active service',
      availabilityLabel: currentlyAvailable ? 'Accepting requests' : 'Requests paused',
      price: primary?.price ?? Object.freeze({ kind: 'not_yet_available', reasonCode: 'data_unavailable' }),
      rating: average !== null && count !== null ? Object.freeze({ average, count }) : null,
      completedJobs,
      reliabilityLabel: null,
      distanceLabel: null,
      serviceAreaLabel: text(source.serviceAreaLabel, 160, { empty: true }),
      whyMatch: null,
      verification: publicBadges,
      selectionKind: 'scheduled_request',
    }),
    about: text(source.about, 1_000, { empty: true }),
    serviceVariants: orderedOfferings,
    portfolio: Object.freeze([]),
    reviews: Object.freeze(reviews),
    currentlyAvailable,
    nextAvailabilityLabel: currentlyAvailable ? null : 'This Worker is not accepting new requests right now.',
    directRequestAvailable: false,
    directRequestUnavailableReason: 'A profile view does not reserve this Worker. Start a service request to see current matching or quote options.',
  });
}
