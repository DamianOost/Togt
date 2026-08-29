const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_KEY = /^[a-z][a-z0-9_.:-]{0,95}$/;
const CONTACT = /(?:\+?27|0)[\s-]?[6-8][\d\s-]{7,12}\d/i;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PRIVATE_BRIEF_KEYS = new Set([
  'address', 'exactaddress', 'latitude', 'longitude', 'location', 'phone', 'email',
  'contact', 'accessinstructions', 'gatecode',
]);

type JsonRecord = Record<string, unknown>;

export type WorkerQuoteRequestStatus =
  | 'open'
  | 'receiving'
  | 'selected'
  | 'expired'
  | 'cancelled'
  | 'no_quotes';

export type WorkerQuoteStatus =
  | 'draft'
  | 'submitted'
  | 'accepted'
  | 'declined'
  | 'expired'
  | 'withdrawn'
  | 'lost';

export type WorkerQuoteMoneyEvidence = Readonly<{
  state: string;
  amountMinor: number | null;
}>;

export type WorkerQuote = Readonly<{
  id: string;
  requestId: string;
  status: WorkerQuoteStatus;
  version: number;
  scope: string | null;
  deliverables: readonly string[];
  exclusions: readonly string[];
  assumptions: readonly string[];
  proposedStartAt: string | null;
  proposedEndAt: string | null;
  durationMinutes: number | null;
  labourAmountMinor: number | null;
  materialsAmountMinor: number | null;
  customerTotalMinor: number | null;
  platformFee: WorkerQuoteMoneyEvidence;
  workerNet: WorkerQuoteMoneyEvidence;
  validUntil: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type WorkerQuoteRequest = Readonly<{
  id: string;
  version: number;
  status: WorkerQuoteRequestStatus;
  service: Readonly<{
    id: string;
    version: number;
    label: string;
    identityVerificationRequired: boolean;
    credentialIds: readonly string[];
  }>;
  brief: Readonly<{
    summary: string | null;
    answers: readonly Readonly<{ questionId: string; label: string; value: string }>[];
    mediaCount: number;
  }>;
  broadAreaLabel: string;
  startsAt: string;
  endsAt: string | null;
  flexibility: string | null;
  questionsDeadlineAt: string | null;
  quotesCloseAt: string;
  createdAt: string;
  updatedAt: string;
}>;

export type WorkerQuoteRequestDetail = Readonly<{
  request: WorkerQuoteRequest;
  ownQuote: WorkerQuote | null;
}>;

export type WorkerQuoteAdaptResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; reasonCode: 'invalid_worker_quote_contract'; field: string }>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resourceId(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null;
}

function positiveInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : null;
}

function text(value: unknown, max = 1_000): string | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  return candidate.length > 0 && candidate.length <= max ? candidate : null;
}

function nullableText(value: unknown, max = 1_000): string | null | undefined {
  if (value === null) return null;
  return text(value, max) ?? undefined;
}

function iso(value: unknown): string | null {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : null;
}

function nullableIso(value: unknown): string | null | undefined {
  if (value === null) return null;
  return iso(value) ?? undefined;
}

function decimalToMinor(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const raw = String(value);
  if (!/^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(raw)) return undefined;
  const [whole = '', fraction = ''] = raw.split('.');
  const amount = (Number(whole) * 100) + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : undefined;
}

function stringList(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.length > 40) return null;
  const items = value.map((item) => text(item, 500));
  return items.every((item): item is string => item !== null) ? Object.freeze(items) : null;
}

function requestStatus(value: unknown): WorkerQuoteRequestStatus | null {
  return value === 'open' || value === 'receiving' || value === 'selected'
    || value === 'expired' || value === 'cancelled' || value === 'no_quotes'
    ? value
    : null;
}

function quoteStatus(value: unknown): WorkerQuoteStatus | null {
  return value === 'draft' || value === 'submitted' || value === 'accepted'
    || value === 'declined' || value === 'expired' || value === 'withdrawn' || value === 'lost'
    ? value
    : null;
}

function containsPrivateBriefEvidence(value: unknown): boolean {
  if (typeof value === 'string') return EMAIL.test(value) || CONTACT.test(value);
  if (Array.isArray(value)) return value.some(containsPrivateBriefEvidence);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, nested]) => (
    PRIVATE_BRIEF_KEYS.has(key.toLowerCase()) || containsPrivateBriefEvidence(nested)
  ));
}

function answerLabel(questionId: string, questionLabels: ReadonlyMap<string, string>): string {
  return questionLabels.get(questionId)
    ?? questionId.replace(/[_.:-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function answerValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string') return value.trim().slice(0, 500) || 'Not supplied';
  if (Array.isArray(value) && value.length <= 20) {
    const simple = value.map((item) => (
      typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'
        ? String(item).trim()
        : ''
    ));
    if (simple.every((item) => item.length > 0 && item.length <= 120)) return simple.join(', ');
  }
  return 'Structured response supplied';
}

function adaptBrief(raw: unknown, service: JsonRecord): WorkerQuoteRequest['brief'] | null {
  if (!isRecord(raw) || !isRecord(raw.answers) || containsPrivateBriefEvidence(raw)) return null;
  const media = Array.isArray(raw.media) && raw.media.length <= 12 ? raw.media : null;
  if (!media || !media.every((item) => isRecord(item) && item.kind === 'image' && text(item.id, 255))) return null;
  const summary = nullableText(raw.summary, 1_000);
  if (summary === undefined) return null;
  const questionLabels = new Map<string, string>();
  if (isRecord(service.briefSchema) && Array.isArray(service.briefSchema.questions)) {
    for (const question of service.briefSchema.questions) {
      if (!isRecord(question)) return null;
      const questionId = text(question.id, 96);
      const label = text(question.label ?? question.prompt, 300);
      if (!questionId || !SAFE_KEY.test(questionId) || !label || questionLabels.has(questionId)) return null;
      questionLabels.set(questionId, label);
    }
  }
  const answers: Array<Readonly<{ questionId: string; label: string; value: string }>> = [];
  for (const [questionId, value] of Object.entries(raw.answers)) {
    if (!SAFE_KEY.test(questionId) || (questionLabels.size > 0 && !questionLabels.has(questionId))) return null;
    answers.push(Object.freeze({ questionId, label: answerLabel(questionId, questionLabels), value: answerValue(value) }));
  }
  return Object.freeze({ summary, answers: Object.freeze(answers), mediaCount: media.length });
}

function adaptEligibility(raw: unknown): Readonly<{
  identityVerificationRequired: boolean;
  credentialIds: readonly string[];
}> | null {
  if (!isRecord(raw)) return null;
  const credentialIds = raw.credentialIds == null ? [] : raw.credentialIds;
  if (!Array.isArray(credentialIds) || credentialIds.length > 40) return null;
  const parsed = credentialIds.map((value) => text(value, 96));
  if (!parsed.every((value): value is string => value !== null && SAFE_KEY.test(value))) return null;
  if (raw.requiresIdentityVerified != null && typeof raw.requiresIdentityVerified !== 'boolean') return null;
  return Object.freeze({
    identityVerificationRequired: raw.requiresIdentityVerified === true,
    credentialIds: Object.freeze([...new Set(parsed)]),
  });
}

function adaptRequest(raw: unknown): WorkerQuoteRequest | null {
  if (!isRecord(raw)) return null;
  if (
    Object.prototype.hasOwnProperty.call(raw, 'privateLocation')
    || Object.prototype.hasOwnProperty.call(raw, 'customerId')
    || Object.prototype.hasOwnProperty.call(raw, 'selectedQuoteId')
    || Object.prototype.hasOwnProperty.call(raw, 'bookingId')
  ) return null;
  const requestId = resourceId(raw.id);
  const version = positiveInteger(raw.version);
  const status = requestStatus(raw.status);
  const service = isRecord(raw.service) ? raw.service : null;
  const serviceId = service ? resourceId(service.id) : null;
  const serviceVersion = service ? positiveInteger(service.version) : null;
  const serviceLabel = service ? text(service.label, 160) : null;
  const eligibility = service ? adaptEligibility(service.workerEligibility) : null;
  const brief = service ? adaptBrief(raw.brief, service) : null;
  const area = isRecord(raw.area) ? raw.area : null;
  const areaLabel = area && area.precision === 'broad' ? text(area.label, 160) : null;
  const schedule = isRecord(raw.schedule) ? raw.schedule : null;
  const startsAt = schedule ? iso(schedule.startsAt) : null;
  const endsAt = schedule ? nullableIso(schedule.endsAt) : undefined;
  const flexibility = schedule ? nullableText(schedule.flexibility, 160) : undefined;
  const questionsDeadlineAt = nullableIso(raw.questionsDeadlineAt);
  const quotesCloseAt = iso(raw.quotesCloseAt);
  const createdAt = iso(raw.createdAt);
  const updatedAt = iso(raw.updatedAt);
  if (!requestId || !version || !status || !serviceId || !serviceVersion || !serviceLabel
      || !eligibility || !brief || !areaLabel || !schedule || startsAt === null
      || endsAt === undefined || flexibility === undefined || schedule.timezone !== 'Africa/Johannesburg'
      || questionsDeadlineAt === undefined || !quotesCloseAt || !createdAt || !updatedAt) return null;
  return Object.freeze({
    id: requestId,
    version,
    status,
    service: Object.freeze({ id: serviceId, version: serviceVersion, label: serviceLabel, ...eligibility }),
    brief,
    broadAreaLabel: areaLabel,
    startsAt,
    endsAt,
    flexibility,
    questionsDeadlineAt,
    quotesCloseAt,
    createdAt,
    updatedAt,
  });
}

function moneyEvidence(raw: unknown): WorkerQuoteMoneyEvidence | null {
  if (!isRecord(raw) || typeof raw.state !== 'string' || !SAFE_KEY.test(raw.state)) return null;
  const amountMinor = decimalToMinor(raw.amount);
  if (amountMinor === undefined) return null;
  return Object.freeze({ state: raw.state, amountMinor });
}

function adaptQuote(raw: unknown): WorkerQuote | null {
  if (!isRecord(raw)) return null;
  const quoteId = resourceId(raw.id);
  const requestId = resourceId(raw.requestId);
  const status = quoteStatus(raw.status);
  const version = positiveInteger(raw.version);
  const scope = nullableText(raw.scope, 4_000);
  const deliverables = stringList(raw.deliverables);
  const exclusions = stringList(raw.exclusions);
  const assumptions = stringList(raw.assumptions);
  const schedule = isRecord(raw.schedule) ? raw.schedule : null;
  const startsAt = schedule ? nullableIso(schedule.startsAt) : undefined;
  const endsAt = schedule ? nullableIso(schedule.endsAt) : undefined;
  const durationMinutes = schedule?.durationMinutes === null
    ? null
    : Number.isSafeInteger(schedule?.durationMinutes) && Number(schedule?.durationMinutes) >= 15
      ? Number(schedule?.durationMinutes)
      : undefined;
  const commercial = isRecord(raw.commercial) ? raw.commercial : null;
  const labourAmountMinor = commercial ? decimalToMinor(commercial.labourAmount) : undefined;
  const materialsAmountMinor = commercial ? decimalToMinor(commercial.materialsAmount) : undefined;
  const customerTotalMinor = commercial ? decimalToMinor(commercial.customerTotalAmount) : undefined;
  const platformFee = commercial ? moneyEvidence(commercial.platformFee) : null;
  const workerNet = commercial ? moneyEvidence(commercial.workerNet) : null;
  const validUntil = nullableIso(raw.validUntil);
  const createdAt = iso(raw.createdAt);
  const updatedAt = iso(raw.updatedAt);
  if (!quoteId || !requestId || !status || !version || scope === undefined || !deliverables
      || !exclusions || !assumptions || !schedule || startsAt === undefined || endsAt === undefined
      || durationMinutes === undefined || !commercial || commercial.currency !== 'ZAR'
      || labourAmountMinor === undefined || materialsAmountMinor === undefined || customerTotalMinor === undefined
      || !platformFee || !workerNet || validUntil === undefined || !createdAt || !updatedAt) return null;
  const allAmounts = labourAmountMinor !== null && materialsAmountMinor !== null;
  if ((allAmounts && customerTotalMinor !== labourAmountMinor + materialsAmountMinor)
      || (!allAmounts && customerTotalMinor !== null)) return null;
  if (startsAt && endsAt && durationMinutes !== null) {
    const actualMinutes = (Date.parse(endsAt) - Date.parse(startsAt)) / 60_000;
    if (actualMinutes <= 0 || Math.abs(actualMinutes - durationMinutes) > (1 / 60)) return null;
  }
  if (status !== 'draft' && status !== 'withdrawn') {
    if (!scope || deliverables.length === 0 || !startsAt || !endsAt || durationMinutes === null
        || labourAmountMinor === null || materialsAmountMinor === null || !validUntil) return null;
  }
  return Object.freeze({
    id: quoteId,
    requestId,
    status,
    version,
    scope,
    deliverables,
    exclusions,
    assumptions,
    proposedStartAt: startsAt,
    proposedEndAt: endsAt,
    durationMinutes,
    labourAmountMinor,
    materialsAmountMinor,
    customerTotalMinor,
    platformFee,
    workerNet,
    validUntil,
    createdAt,
    updatedAt,
  });
}

function invalid<T>(field: string): WorkerQuoteAdaptResult<T> {
  return Object.freeze({ ok: false, reasonCode: 'invalid_worker_quote_contract', field });
}

export function adaptWorkerQuoteRequestListV1(raw: unknown): WorkerQuoteAdaptResult<readonly WorkerQuoteRequest[]> {
  if (!isRecord(raw) || !Array.isArray(raw.quoteRequests) || !isRecord(raw.meta)
      || raw.meta.role !== 'worker' || !Number.isSafeInteger(raw.meta.count)
      || Number(raw.meta.count) !== raw.quoteRequests.length) return invalid('response');
  const requests = raw.quoteRequests.map(adaptRequest);
  if (!requests.every((request): request is WorkerQuoteRequest => request !== null)) return invalid('quoteRequests');
  return Object.freeze({ ok: true, value: Object.freeze(requests) });
}

export function adaptWorkerQuoteRequestDetailV1(raw: unknown): WorkerQuoteAdaptResult<WorkerQuoteRequestDetail> {
  if (!isRecord(raw)) return invalid('response');
  const request = adaptRequest(raw.quoteRequest);
  const ownQuote = raw.ownQuote === null ? null : adaptQuote(raw.ownQuote);
  if (!request || ownQuote === null && raw.ownQuote !== null) return invalid('quoteRequest');
  if (ownQuote && ownQuote.requestId !== request.id) return invalid('ownQuote.requestId');
  return Object.freeze({ ok: true, value: Object.freeze({ request, ownQuote }) });
}

export function adaptWorkerQuoteCommandV1(raw: unknown): WorkerQuoteAdaptResult<WorkerQuote> {
  if (!isRecord(raw)) return invalid('response');
  const quote = adaptQuote(raw.quote);
  return quote ? Object.freeze({ ok: true, value: quote }) : invalid('quote');
}
