import type { QuoteMutationInput } from '../../../services/groundedMarketplace';
import type { WorkerQuote, WorkerQuoteRequest } from '../../../data/grounded';

export type WorkerQuoteForm = Readonly<{
  scope: string;
  deliverables: string;
  exclusions: string;
  assumptions: string;
  proposedStartAt: string;
  proposedEndAt: string;
  durationMinutes: string;
  labourAmount: string;
  materialsAmount: string;
  validUntil: string;
}>;

export type WorkerQuoteFormField = keyof WorkerQuoteForm;
export type WorkerQuoteFormErrors = Readonly<Partial<Record<WorkerQuoteFormField, string>>>;

export type WorkerQuoteActions = Readonly<{
  canOpenBuilder: boolean;
  canSaveDraft: boolean;
  canSubmit: boolean;
  canWithdraw: boolean;
  readOnly: boolean;
  reason: string | null;
}>;

function decimalFromMinor(value: number | null): string {
  return value === null ? '' : (value / 100).toFixed(2);
}

function lineList(value: readonly string[]): string {
  return value.join('\n');
}

function scheduledDuration(start: string, end: string | null): string {
  if (!end) return '';
  const minutes = Math.round((Date.parse(end) - Date.parse(start)) / 60_000);
  return Number.isSafeInteger(minutes) && minutes >= 15 ? String(minutes) : '';
}

export function workerQuoteFormFromEvidence(
  request: WorkerQuoteRequest,
  quote: WorkerQuote | null,
): WorkerQuoteForm {
  return Object.freeze({
    scope: quote?.scope ?? '',
    deliverables: lineList(quote?.deliverables ?? []),
    exclusions: lineList(quote?.exclusions ?? []),
    assumptions: lineList(quote?.assumptions ?? []),
    proposedStartAt: quote?.proposedStartAt ?? request.startsAt,
    proposedEndAt: quote?.proposedEndAt ?? request.endsAt ?? '',
    durationMinutes: quote?.durationMinutes == null
      ? scheduledDuration(request.startsAt, request.endsAt)
      : String(quote.durationMinutes),
    labourAmount: decimalFromMinor(quote?.labourAmountMinor ?? null),
    materialsAmount: decimalFromMinor(quote?.materialsAmountMinor ?? null),
    validUntil: quote?.validUntil ?? request.quotesCloseAt,
  });
}

function parseLines(value: string): readonly string[] {
  return Object.freeze(value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
}

function validMoney(value: string): boolean {
  return /^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(value.trim());
}

function canonicalMoney(value: string): string {
  return Number(value.trim()).toFixed(2);
}

function validIso(value: string): boolean {
  return value.trim().length > 0 && Number.isFinite(Date.parse(value.trim()));
}

function canonicalIso(value: string): string {
  return new Date(value.trim()).toISOString();
}

function validateTextList(value: string, required: boolean): string | null {
  const lines = parseLines(value);
  if (required && lines.length === 0) return 'Add at least one item.';
  if (lines.length > 40) return 'Use no more than 40 items.';
  return lines.some((line) => line.length > 500) ? 'Keep each item under 500 characters.' : null;
}

export function validateWorkerQuoteDraft(form: WorkerQuoteForm): WorkerQuoteFormErrors {
  const errors: Partial<Record<WorkerQuoteFormField, string>> = {};
  const scope = form.scope.trim();
  if (scope.length > 0 && (scope.length < 3 || scope.length > 4_000)) {
    errors.scope = 'Scope must be 3–4,000 characters when supplied.';
  }
  for (const field of ['deliverables', 'exclusions', 'assumptions'] as const) {
    const error = validateTextList(form[field], false);
    if (error) errors[field] = error;
  }
  for (const field of ['proposedStartAt', 'proposedEndAt', 'validUntil'] as const) {
    if (form[field].trim() && !validIso(form[field])) errors[field] = 'Use a valid date and time.';
  }
  if (form.durationMinutes.trim()) {
    const duration = Number(form.durationMinutes);
    if (!Number.isSafeInteger(duration) || duration < 15 || duration > 10_080) {
      errors.durationMinutes = 'Duration must be 15–10,080 whole minutes.';
    }
  }
  for (const field of ['labourAmount', 'materialsAmount'] as const) {
    if (form[field].trim() && !validMoney(form[field])) errors[field] = 'Enter a ZAR amount with up to two decimals.';
  }
  if (!errors.proposedStartAt && !errors.proposedEndAt
      && form.proposedStartAt.trim() && form.proposedEndAt.trim()
      && Date.parse(form.proposedEndAt) <= Date.parse(form.proposedStartAt)) {
    errors.proposedEndAt = 'End time must follow the start time.';
  }
  return Object.freeze(errors);
}

export function validateWorkerQuoteForSubmission(
  form: WorkerQuoteForm,
  request: WorkerQuoteRequest,
  now: string,
): WorkerQuoteFormErrors {
  const errors: Partial<Record<WorkerQuoteFormField, string>> = { ...validateWorkerQuoteDraft(form) };
  if (form.scope.trim().length < 3) errors.scope = 'Describe the scope before submitting.';
  const deliverablesError = validateTextList(form.deliverables, true);
  if (deliverablesError) errors.deliverables = deliverablesError;
  for (const field of ['proposedStartAt', 'proposedEndAt', 'validUntil'] as const) {
    if (!form[field].trim()) errors[field] = 'This date and time is required.';
  }
  if (!form.durationMinutes.trim()) errors.durationMinutes = 'Duration is required.';
  if (!form.labourAmount.trim()) errors.labourAmount = 'Labour amount is required.';
  if (!form.materialsAmount.trim()) errors.materialsAmount = 'Materials amount is required (use 0 when none).';
  if (Object.keys(errors).length > 0) return Object.freeze(errors);

  const start = Date.parse(form.proposedStartAt);
  const end = Date.parse(form.proposedEndAt);
  const validUntil = Date.parse(form.validUntil);
  const current = Date.parse(now);
  const requestStart = Date.parse(request.startsAt);
  const requestClose = Date.parse(request.quotesCloseAt);
  const duration = Number(form.durationMinutes);
  if (start <= current) errors.proposedStartAt = 'Proposed work must start in the future.';
  if (start < requestStart) errors.proposedStartAt = 'The proposal cannot start before the requested window.';
  if (end <= start) errors.proposedEndAt = 'End time must follow the start time.';
  if (Math.abs(((end - start) / 60_000) - duration) > (1 / 60)) {
    errors.durationMinutes = 'Duration must equal the proposed start-to-end window.';
  }
  if (validUntil <= current || validUntil > requestClose || validUntil >= start) {
    errors.validUntil = 'Expiry must be future, no later than quote close, and before work starts.';
  }
  if (Number(form.labourAmount) + Number(form.materialsAmount) <= 0) {
    errors.labourAmount = 'The combined quote total must be greater than zero.';
  }
  return Object.freeze(errors);
}

export function workerQuoteMutationFromForm(form: WorkerQuoteForm): Partial<QuoteMutationInput> {
  type MutableQuoteMutation = { -readonly [Key in keyof QuoteMutationInput]?: QuoteMutationInput[Key] };
  const patch: MutableQuoteMutation = {
    deliverables: parseLines(form.deliverables),
    exclusions: parseLines(form.exclusions),
    assumptions: parseLines(form.assumptions),
  };
  if (form.scope.trim()) patch.scope = form.scope.trim();
  if (validIso(form.proposedStartAt)) patch.proposedStartAt = canonicalIso(form.proposedStartAt);
  if (validIso(form.proposedEndAt)) patch.proposedEndAt = canonicalIso(form.proposedEndAt);
  if (Number.isSafeInteger(Number(form.durationMinutes)) && Number(form.durationMinutes) >= 15) {
    patch.durationMinutes = Number(form.durationMinutes);
  }
  if (validMoney(form.labourAmount)) patch.labourAmount = canonicalMoney(form.labourAmount);
  if (validMoney(form.materialsAmount)) patch.materialsAmount = canonicalMoney(form.materialsAmount);
  if (validIso(form.validUntil)) patch.validUntil = canonicalIso(form.validUntil);
  return Object.freeze(patch);
}

export function deriveWorkerQuoteActions(input: Readonly<{
  request: WorkerQuoteRequest;
  quote: WorkerQuote | null;
  connection: 'online' | 'offline';
}>): WorkerQuoteActions {
  const requestOpen = input.request.status === 'open' || input.request.status === 'receiving';
  const quoteEditable = input.quote === null || input.quote.status === 'draft' || input.quote.status === 'submitted';
  const online = input.connection === 'online';
  let reason: string | null = null;
  if (!online) reason = 'Reconnect before saving or submitting. No quote change is queued offline.';
  else if (!requestOpen) reason = 'This request is no longer accepting quote changes.';
  else if (!quoteEditable) reason = `This quote is ${input.quote?.status ?? 'locked'} and is read-only.`;
  return Object.freeze({
    canOpenBuilder: input.quote !== null || requestOpen,
    canSaveDraft: online && requestOpen && quoteEditable,
    canSubmit: online && requestOpen && quoteEditable,
    canWithdraw: online && Boolean(input.quote && (input.quote.status === 'draft' || input.quote.status === 'submitted')),
    readOnly: !requestOpen || !quoteEditable,
    reason,
  });
}

function stableHash(source: string): string {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => [key, canonical((value as Record<string, unknown>)[key])]));
}

export function workerQuoteIdempotencyKey(input: Readonly<{
  command: 'create_draft' | 'create_submit' | 'save_draft' | 'edit_submit' | 'withdraw';
  requestId: string;
  quoteId?: string | null;
  version: number;
  quote?: Partial<QuoteMutationInput>;
}>): string {
  const resource = input.quoteId ?? input.requestId;
  const fingerprint = stableHash(JSON.stringify(canonical({
    command: input.command,
    requestId: input.requestId,
    quoteId: input.quoteId ?? null,
    version: input.version,
    quote: input.quote ?? {},
  })));
  return `worker-quote:${input.command}:${resource}:v${input.version}:${fingerprint}`;
}

export function hasWorkerQuoteFormErrors(errors: WorkerQuoteFormErrors): boolean {
  return Object.keys(errors).length > 0;
}
