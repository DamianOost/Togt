import type {
  MatchingSnapshot,
  QuoteChoice,
  WorkerChoice,
} from '../../features/customer/projects';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JsonRecord = Record<string, unknown>;

export type QuoteMatchingAdaptResult =
  | Readonly<{ ok: true; value: Extract<MatchingSnapshot, { mode: 'receive_quotes' }> }>
  | Readonly<{ ok: false; reasonCode: 'invalid_quote_contract'; field: string }>;

export type CustomerOpenQuoteRequestSummary = Readonly<{
  requestId: string;
  requestVersion: number;
  serviceLabel: string;
  status: 'open' | 'receiving';
  broadAreaLabel: string;
  scheduleLabel: string;
  quotesCloseLabel: string;
  updatedAt: string;
}>;

export type CustomerOpenQuoteRequestListAdaptResult =
  | Readonly<{ ok: true; value: readonly CustomerOpenQuoteRequestSummary[] }>
  | Readonly<{ ok: false; reasonCode: 'invalid_quote_request_list_contract'; field: string }>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function id(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null;
}

function text(value: unknown, max = 1_000): string | null {
  if (typeof value !== 'string') return null;
  const result = value.trim();
  return result.length > 0 && result.length <= max ? result : null;
}

function iso(value: unknown): string | null {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}

function decimalZarToMinor(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const raw = String(value);
  if (!/^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(raw)) return null;
  const [whole = '', fraction = ''] = raw.split('.');
  const amount = (Number(whole) * 100) + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}

function stringList(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.length > 40) return null;
  const output = value.map((item) => text(item, 500));
  return output.every((item): item is string => item !== null) ? Object.freeze(output) : null;
}

function formatSchedule(startsAt: string): string {
  return new Intl.DateTimeFormat('en-ZA', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Johannesburg',
  }).format(new Date(startsAt));
}

function formatQuoteDeadline(closesAt: string): string {
  return new Intl.DateTimeFormat('en-ZA', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Johannesburg',
  }).format(new Date(closesAt));
}

export function adaptCustomerOpenQuoteRequestListV1(input: unknown): CustomerOpenQuoteRequestListAdaptResult {
  if (!isRecord(input) || !Array.isArray(input.quoteRequests) || !isRecord(input.meta)
      || input.meta.role !== 'customer' || !Number.isSafeInteger(input.meta.count)
      || Number(input.meta.count) !== input.quoteRequests.length) {
    return Object.freeze({ ok: false, reasonCode: 'invalid_quote_request_list_contract', field: 'response' });
  }
  const supportedStates = new Set(['open', 'receiving', 'selected', 'expired', 'cancelled', 'no_quotes']);
  const active: CustomerOpenQuoteRequestSummary[] = [];
  const requestIds = new Set<string>();
  for (const raw of input.quoteRequests) {
    if (!isRecord(raw) || typeof raw.status !== 'string' || !supportedStates.has(raw.status)) {
      return Object.freeze({ ok: false, reasonCode: 'invalid_quote_request_list_contract', field: 'status' });
    }
    if (raw.status !== 'open' && raw.status !== 'receiving') continue;
    const requestId = id(raw.id);
    const requestVersion = Number.isSafeInteger(raw.version) && Number(raw.version) > 0 ? Number(raw.version) : null;
    const service = isRecord(raw.service) ? raw.service : null;
    const serviceId = service ? id(service.id) : null;
    const serviceVersion = service && Number.isSafeInteger(service.version) && Number(service.version) > 0
      ? Number(service.version)
      : null;
    const serviceLabel = service ? text(service.label, 120) : null;
    const area = isRecord(raw.area) && raw.area.precision === 'broad' ? raw.area : null;
    const broadAreaLabel = area ? text(area.label, 160) : null;
    const schedule = isRecord(raw.schedule) && raw.schedule.timezone === 'Africa/Johannesburg' ? raw.schedule : null;
    const startsAt = schedule ? iso(schedule.startsAt) : null;
    const quotesCloseAt = iso(raw.quotesCloseAt);
    const updatedAt = iso(raw.updatedAt);
    if (!requestId || requestIds.has(requestId) || !requestVersion || !serviceId || !serviceVersion
        || !serviceLabel || !broadAreaLabel || !startsAt || !quotesCloseAt || !updatedAt) {
      return Object.freeze({ ok: false, reasonCode: 'invalid_quote_request_list_contract', field: 'quoteRequest' });
    }
    requestIds.add(requestId);
    active.push(Object.freeze({
      requestId,
      requestVersion,
      serviceLabel,
      status: raw.status,
      broadAreaLabel,
      scheduleLabel: formatSchedule(startsAt),
      quotesCloseLabel: formatQuoteDeadline(quotesCloseAt),
      updatedAt,
    }));
  }
  active.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return Object.freeze({ ok: true, value: Object.freeze(active) });
}

function adaptWorker(
  raw: JsonRecord,
  service: Readonly<{ id: string; version: number; label: string }>,
  quoteId: string,
  quoteVersion: number,
  totalMinor: number,
  validUntil: string,
): WorkerChoice | null {
  const workerId = id(raw.id);
  const displayName = text(raw.name, 100);
  if (!workerId || !displayName) return null;
  const avatarUrl = raw.avatarUrl === null
    ? null
    : typeof raw.avatarUrl === 'string' && /^https?:\/\//.test(raw.avatarUrl) && raw.avatarUrl.length <= 2_048
      ? raw.avatarUrl
      : null;
  const ratingRaw = isRecord(raw.rating) ? raw.rating : null;
  const rating = ratingRaw?.state === 'rated'
    && typeof ratingRaw.average === 'number'
    && ratingRaw.average >= 1
    && ratingRaw.average <= 5
    && Number.isSafeInteger(ratingRaw.count)
    && Number(ratingRaw.count) > 0
    ? Object.freeze({ average: ratingRaw.average, count: Number(ratingRaw.count) })
    : null;
  const verificationRaw = isRecord(raw.verification) ? raw.verification : null;
  const verification = verificationRaw?.identityVerified === true
    ? Object.freeze([Object.freeze({
        id: 'identity-verification',
        label: 'Identity verification',
        status: 'verified' as const,
        detail: 'The server reports an approved identity-verification state.',
      })])
    : Object.freeze([]);
  return Object.freeze({
    workerId,
    displayName,
    photoUrl: avatarUrl,
    serviceId: service.id,
    serviceVersion: service.version,
    serviceLabel: service.label,
    availabilityLabel: null,
    price: Object.freeze({
      kind: 'quote' as const,
      total: Object.freeze({ amountMinor: totalMinor, currency: 'ZAR' as const }),
      quoteId,
      quoteVersion,
      expiresAt: validUntil,
    }),
    rating,
    completedJobs: null,
    reliabilityLabel: null,
    distanceLabel: null,
    serviceAreaLabel: null,
    whyMatch: null,
    verification,
    selectionKind: 'scheduled_request' as const,
  });
}

function quoteStatus(value: unknown): QuoteChoice['status'] | null {
  const mapping: Readonly<Record<string, QuoteChoice['status']>> = Object.freeze({
    submitted: 'submitted',
    accepted: 'accepted',
    declined: 'declined',
    expired: 'expired',
    withdrawn: 'withdrawn',
    lost: 'lost',
  });
  return typeof value === 'string' ? mapping[value] ?? null : null;
}

function adaptQuote(raw: unknown, service: Readonly<{ id: string; version: number; label: string }>): QuoteChoice | null {
  if (!isRecord(raw)) return null;
  const quoteId = id(raw.id);
  const version = Number.isSafeInteger(raw.version) && Number(raw.version) > 0 ? Number(raw.version) : null;
  const status = quoteStatus(raw.status);
  const scope = text(raw.scope, 4_000);
  const exclusions = stringList(raw.exclusions);
  const assumptions = stringList(raw.assumptions);
  const schedule = isRecord(raw.schedule) ? raw.schedule : null;
  const startsAt = schedule ? iso(schedule.startsAt) : null;
  const durationMinutes = schedule && Number.isSafeInteger(schedule.durationMinutes) && Number(schedule.durationMinutes) > 0
    ? Number(schedule.durationMinutes)
    : null;
  const commercial = isRecord(raw.commercial) ? raw.commercial : null;
  const totalMinor = commercial?.currency === 'ZAR' ? decimalZarToMinor(commercial.customerTotalAmount) : null;
  const validUntil = iso(raw.validUntil);
  const workerRaw = isRecord(raw.worker) ? raw.worker : null;
  if (!quoteId || !version || !status || !scope || !exclusions || !assumptions || !startsAt
      || durationMinutes === null || totalMinor === null || !validUntil || !workerRaw) return null;
  const worker = adaptWorker(workerRaw, service, quoteId, version, totalMinor, validUntil);
  if (!worker) return null;
  return Object.freeze({
    quoteId,
    quoteVersion: version,
    worker,
    scope,
    exclusions,
    assumptions,
    scheduleLabel: formatSchedule(startsAt),
    durationLabel: `${durationMinutes} minutes`,
    total: Object.freeze({ amountMinor: totalMinor, currency: 'ZAR' }),
    expiresAt: validUntil,
    status,
  });
}

function requestStatus(value: unknown, quotes: readonly QuoteChoice[]): Extract<MatchingSnapshot, { mode: 'receive_quotes' }>['status'] | null {
  if (value === 'open' || value === 'receiving') return quotes.some((quote) => quote.status === 'submitted') ? 'ready' : 'waiting';
  if (value === 'selected') return 'selected';
  if (value === 'cancelled') return 'cancelled';
  if (value === 'no_quotes') return 'no_quotes';
  if (value === 'expired') return quotes.length > 0 ? 'expired' : 'no_quotes';
  return null;
}

export function adaptQuoteMatchingSnapshotV1(requestInput: unknown, quotesInput: unknown): QuoteMatchingAdaptResult {
  if (!isRecord(requestInput) || !Array.isArray(quotesInput)) {
    return Object.freeze({ ok: false, reasonCode: 'invalid_quote_contract', field: 'response' });
  }
  const requestId = id(requestInput.id);
  const version = Number.isSafeInteger(requestInput.version) && Number(requestInput.version) > 0 ? Number(requestInput.version) : null;
  const serviceRaw = isRecord(requestInput.service) ? requestInput.service : null;
  const serviceId = serviceRaw ? id(serviceRaw.id) : null;
  const serviceVersion = serviceRaw && Number.isSafeInteger(serviceRaw.version) && Number(serviceRaw.version) > 0
    ? Number(serviceRaw.version)
    : null;
  const serviceLabel = serviceRaw ? text(serviceRaw.label, 120) : null;
  const bookingId = requestInput.bookingId === null ? null : id(requestInput.bookingId);
  const selectedQuoteId = requestInput.selectedQuoteId === null ? null : id(requestInput.selectedQuoteId);
  if (!requestId || !version || !serviceId || !serviceVersion || !serviceLabel) {
    return Object.freeze({ ok: false, reasonCode: 'invalid_quote_contract', field: 'quoteRequest' });
  }
  const service = Object.freeze({ id: serviceId, version: serviceVersion, label: serviceLabel });
  const quotes = quotesInput.map((quote) => adaptQuote(quote, service));
  if (!quotes.every((quote): quote is QuoteChoice => quote !== null)) {
    return Object.freeze({ ok: false, reasonCode: 'invalid_quote_contract', field: 'quotes' });
  }
  const status = requestStatus(requestInput.status, quotes);
  if (!status || (status === 'selected' && (!bookingId || !selectedQuoteId))) {
    return Object.freeze({ ok: false, reasonCode: 'invalid_quote_contract', field: 'status' });
  }
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      mode: 'receive_quotes',
      requestId,
      // Before quote acceptance, the request is the authoritative aggregate.
      // After acceptance, the returned booking becomes the Project aggregate.
      projectId: bookingId ?? requestId,
      stateVersion: version,
      status,
      quotes: Object.freeze(quotes),
      selectedQuoteId,
      responseSummary: quotes.length === 0
        ? 'No complete Worker quote has been received yet.'
        : `${quotes.length} complete ${quotes.length === 1 ? 'quote' : 'quotes'} received.`,
    }),
  });
}
