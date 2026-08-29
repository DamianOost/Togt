import type {
  BriefQuestion,
  CustomerServiceShortcut,
  CustomerServiceSuggestion,
  PricingModeExplanation,
} from '../../features/customer/intake';
import type {
  CommercialTerms,
  FulfilmentMode,
  PricingMode,
  ServiceCatalogueSnapshot,
} from '../../features/customer/intake';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const SAFE_OPTION = /^[A-Za-z0-9][A-Za-z0-9 ._:/-]{0,119}$/;

type RecordValue = Record<string, unknown>;

export type CataloguePricingMode = 'fixed_instant' | 'hourly_estimated' | 'remote_quote' | 'diagnostic_visit';
export type CatalogueFulfilmentMode = 'fast_match' | 'compare_workers' | 'receive_quotes' | 'book_diagnostic_visit';

export type GroundedCatalogueService = Readonly<{
  id: string;
  version: number;
  schemaVersion: number;
  canonicalKey: string;
  categoryKey: string;
  label: string;
  description: string;
  pricingMode: CataloguePricingMode;
  fulfilmentMode: CatalogueFulfilmentMode;
  riskTier: 'low' | 'standard' | 'high';
  requiredQuestionIds: readonly string[];
  questions: readonly BriefQuestion[];
  pricingRules: Readonly<Record<string, unknown>>;
  materialsRules: Readonly<Record<string, unknown>>;
  minimumDurationMinutes: number | null;
  callOutFeeMinor: number | null;
  cancellationPolicyVersion: string;
  publishedAt: string;
  recurrenceEligible: boolean;
}>;

export type CatalogueAdaptResult =
  | Readonly<{ ok: true; value: GroundedCatalogueService }>
  | Readonly<{ ok: false; reasonCode: 'invalid_catalogue_service'; fields: readonly string[] }>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  return candidate.length > 0 && candidate.length <= max ? candidate : null;
}

function cleanKey(value: unknown): string | null {
  const candidate = cleanText(value, 80);
  return candidate && KEY.test(candidate) ? candidate : null;
}

function cleanIso(value: unknown): string | null {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

export function decimalZarToMinor(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const raw = String(value);
  if (!/^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(raw)) return null;
  const [whole = '', fraction = ''] = raw.split('.');
  const amount = (Number(whole) * 100) + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}

function cleanOptions(value: unknown): BriefQuestion['options'] {
  if (!Array.isArray(value) || value.length > 20) return Object.freeze([]);
  const options = value.flatMap((option): BriefQuestion['options'][number][] => {
    if (!isRecord(option)) return [];
    const optionValue = cleanText(option.value ?? option.id, 120);
    const label = cleanText(option.label, 160);
    const explanation = option.explanation == null ? null : cleanText(option.explanation, 300);
    if (!optionValue || !SAFE_OPTION.test(optionValue) || !label) return [];
    return [Object.freeze({ value: optionValue, label, explanation })];
  });
  return Object.freeze(options);
}

function inputType(value: unknown): BriefQuestion['inputType'] | null {
  const mapping: Readonly<Record<string, BriefQuestion['inputType']>> = Object.freeze({
    short_text: 'short_text',
    text: 'short_text',
    long_text: 'long_text',
    textarea: 'long_text',
    number: 'number',
    single_choice: 'single_choice',
    single_select: 'single_choice',
    multiple_choice: 'multiple_choice',
    multi_select: 'multiple_choice',
  });
  return typeof value === 'string' ? mapping[value] ?? null : null;
}

function adaptQuestions(briefSchema: unknown, requiredIds: readonly string[]): readonly BriefQuestion[] | null {
  if (!isRecord(briefSchema) || !Array.isArray(briefSchema.questions)) return null;
  const required = new Set(requiredIds);
  const seen = new Set<string>();
  const questions: BriefQuestion[] = [];
  for (const raw of briefSchema.questions) {
    if (!isRecord(raw)) return null;
    const questionId = cleanKey(raw.id);
    const prompt = cleanText(raw.prompt ?? raw.label, 300);
    const type = inputType(raw.inputType ?? raw.type);
    if (!questionId || !prompt || !type || seen.has(questionId)) return null;
    seen.add(questionId);
    const maxLength = raw.maxLength == null
      ? null
      : Number.isSafeInteger(raw.maxLength) && Number(raw.maxLength) > 0 && Number(raw.maxLength) <= 4_000
        ? Number(raw.maxLength)
        : null;
    questions.push(Object.freeze({
      questionId,
      prompt,
      helperText: raw.helperText == null ? null : cleanText(raw.helperText, 500),
      required: required.has(questionId),
      inputType: type,
      options: cleanOptions(raw.options),
      maxLength,
    }));
  }
  return requiredIds.every((id) => seen.has(id)) ? Object.freeze(questions) : null;
}

export function adaptCatalogueServiceV1(input: unknown): CatalogueAdaptResult {
  if (!isRecord(input)) {
    return Object.freeze({ ok: false, reasonCode: 'invalid_catalogue_service', fields: Object.freeze(['service']) });
  }
  const id = typeof input.id === 'string' && UUID.test(input.id) ? input.id.toLowerCase() : null;
  const version = Number.isSafeInteger(input.version) && Number(input.version) > 0 ? Number(input.version) : null;
  const schemaVersion = Number.isSafeInteger(input.schemaVersion) && Number(input.schemaVersion) === 1
    ? Number(input.schemaVersion)
    : null;
  const canonicalKey = cleanKey(input.canonicalKey);
  const categoryKey = cleanKey(input.categoryKey);
  const label = cleanText(input.label, 120);
  const description = typeof input.description === 'string' && input.description.length <= 2_000
    ? input.description.trim()
    : null;
  const pricingModes = new Set<CataloguePricingMode>(['fixed_instant', 'hourly_estimated', 'remote_quote', 'diagnostic_visit']);
  const fulfilmentModes = new Set<CatalogueFulfilmentMode>(['fast_match', 'compare_workers', 'receive_quotes', 'book_diagnostic_visit']);
  const riskTiers = new Set(['low', 'standard', 'high']);
  const pricingMode = pricingModes.has(input.pricingMode as CataloguePricingMode)
    ? input.pricingMode as CataloguePricingMode
    : null;
  const fulfilmentMode = fulfilmentModes.has(input.fulfilmentMode as CatalogueFulfilmentMode)
    ? input.fulfilmentMode as CatalogueFulfilmentMode
    : null;
  const riskTier = riskTiers.has(String(input.riskTier)) ? input.riskTier as GroundedCatalogueService['riskTier'] : null;
  const requiredQuestionIds = Array.isArray(input.requiredQuestionIds)
    && input.requiredQuestionIds.every((value) => typeof value === 'string' && KEY.test(value))
    && new Set(input.requiredQuestionIds).size === input.requiredQuestionIds.length
    ? Object.freeze([...input.requiredQuestionIds] as string[])
    : null;
  const questions = requiredQuestionIds ? adaptQuestions(input.briefSchema, requiredQuestionIds) : null;
  const pricingRules = isRecord(input.pricingRules) ? Object.freeze({ ...input.pricingRules }) : null;
  const materialsRules = isRecord(input.materialsRules) ? Object.freeze({ ...input.materialsRules }) : null;
  const minimumDurationMinutes = input.minimumDurationMinutes == null
    ? null
    : Number.isSafeInteger(input.minimumDurationMinutes) && Number(input.minimumDurationMinutes) > 0
      ? Number(input.minimumDurationMinutes)
      : undefined;
  const callOutFeeMinor = input.callOutFee == null ? null : decimalZarToMinor(input.callOutFee);
  const cancellationPolicyVersion = cleanText(input.cancellationPolicyVersion, 80);
  const publishedAt = cleanIso(input.publishedAt);
  const fields = [
    !id && 'id', !version && 'version', !schemaVersion && 'schemaVersion', !canonicalKey && 'canonicalKey',
    !categoryKey && 'categoryKey', !label && 'label', description === null && 'description', !pricingMode && 'pricingMode',
    !fulfilmentMode && 'fulfilmentMode', !riskTier && 'riskTier', !requiredQuestionIds && 'requiredQuestionIds',
    !questions && 'briefSchema', !pricingRules && 'pricingRules', !materialsRules && 'materialsRules',
    minimumDurationMinutes === undefined && 'minimumDurationMinutes', input.callOutFee != null && callOutFeeMinor === null && 'callOutFee',
    !cancellationPolicyVersion && 'cancellationPolicyVersion', !publishedAt && 'publishedAt',
    typeof input.recurrenceEligible !== 'boolean' && 'recurrenceEligible', input.currency !== 'ZAR' && 'currency',
  ].filter((field): field is string => Boolean(field));
  if (fields.length > 0 || !id || !version || !schemaVersion || !canonicalKey || !categoryKey || !label
      || description === null || !pricingMode || !fulfilmentMode || !riskTier || !requiredQuestionIds || !questions
      || !pricingRules || !materialsRules || minimumDurationMinutes === undefined || !cancellationPolicyVersion || !publishedAt
      || typeof input.recurrenceEligible !== 'boolean') {
    return Object.freeze({ ok: false, reasonCode: 'invalid_catalogue_service', fields: Object.freeze(fields) });
  }
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      id,
      version,
      schemaVersion,
      canonicalKey,
      categoryKey,
      label,
      description,
      pricingMode,
      fulfilmentMode,
      riskTier,
      requiredQuestionIds,
      questions,
      pricingRules,
      materialsRules,
      minimumDurationMinutes,
      callOutFeeMinor,
      cancellationPolicyVersion,
      publishedAt,
      recurrenceEligible: input.recurrenceEligible,
    }),
  });
}

const PRICING_MODE: Readonly<Record<CataloguePricingMode, PricingMode>> = Object.freeze({
  fixed_instant: 'fixed',
  hourly_estimated: 'hourly',
  remote_quote: 'remote_quote',
  diagnostic_visit: 'diagnostic_visit',
});

const FULFILMENT_MODE: Readonly<Record<CatalogueFulfilmentMode, FulfilmentMode>> = Object.freeze({
  fast_match: 'fast_match',
  compare_workers: 'compare_workers',
  receive_quotes: 'receive_quotes',
  book_diagnostic_visit: 'diagnostic_visit',
});

export function toIntakeCatalogueSnapshot(service: GroundedCatalogueService): ServiceCatalogueSnapshot {
  const photoRequirement = isRecord(service.pricingRules)
    && (service.pricingRules.photoRequirement === 'required'
      || service.pricingRules.photoRequirement === 'optional'
      || service.pricingRules.photoRequirement === 'not_allowed')
    ? service.pricingRules.photoRequirement
    : 'optional';
  return Object.freeze({
    serviceId: service.id,
    serviceVersion: service.version,
    label: service.label,
    requiredQuestionIds: service.requiredQuestionIds,
    allowedPricingModes: Object.freeze([PRICING_MODE[service.pricingMode]]),
    allowedFulfilmentModes: Object.freeze([FULFILMENT_MODE[service.fulfilmentMode]]),
    permitsNow: service.pricingRules.permitsNow === true,
    photoRequirement,
  });
}

function ruleMinor(rules: Readonly<Record<string, unknown>>, name: string): number | null {
  return decimalZarToMinor(rules[name]);
}

function ruleText(rules: Readonly<Record<string, unknown>>, name: string): string | null {
  return cleanText(rules[name], 500);
}

export function commercialTermsFromCatalogue(service: GroundedCatalogueService): CommercialTerms | null {
  const cancellationSummary = `Cancellation policy ${service.cancellationPolicyVersion}`;
  const materialsAssumption = ruleText(service.materialsRules, 'summary')
    ?? (service.pricingMode === 'remote_quote' ? 'Materials must be stated in the accepted quote.' : null);
  if (service.pricingMode === 'remote_quote') {
    return Object.freeze({
      pricingMode: 'remote_quote',
      requestFeeMinor: ruleMinor(service.pricingRules, 'requestFee'),
      finalPriceStatus: 'not_available_until_quote',
      materialsAssumption: materialsAssumption ?? 'Materials are confirmed in the accepted quote.',
      cancellationSummary,
    });
  }
  if (service.pricingMode === 'diagnostic_visit') {
    const diagnosticFeeMinor = service.callOutFeeMinor;
    const platformFeeMinor = ruleMinor(service.pricingRules, 'platformFee');
    const visitTotalMinor = ruleMinor(service.pricingRules, 'visitTotal');
    const deliverable = ruleText(service.pricingRules, 'deliverable');
    if (diagnosticFeeMinor === null || platformFeeMinor === null || visitTotalMinor === null || !deliverable) return null;
    return Object.freeze({
      pricingMode: 'diagnostic_visit',
      diagnosticFeeMinor,
      platformFeeMinor,
      visitTotalMinor,
      deliverable,
      laterWorkIncluded: false,
      cancellationSummary,
    });
  }
  if (service.pricingMode === 'fixed_instant') {
    const labourAmountMinor = ruleMinor(service.pricingRules, 'labourAmount');
    const platformFeeMinor = ruleMinor(service.pricingRules, 'platformFee');
    const allInTotalMinor = ruleMinor(service.pricingRules, 'allInTotal');
    if (labourAmountMinor === null || platformFeeMinor === null || allInTotalMinor === null || !materialsAssumption) return null;
    return Object.freeze({
      pricingMode: 'fixed',
      labourAmountMinor,
      platformFeeMinor,
      allInTotalMinor,
      materialsAssumption,
      cancellationSummary,
    });
  }
  const hourlyRateMinor = ruleMinor(service.pricingRules, 'hourlyRate');
  const estimatedMinMinor = ruleMinor(service.pricingRules, 'estimatedTotalMin');
  const estimatedMaxMinor = ruleMinor(service.pricingRules, 'estimatedTotalMax');
  const approvalCapMinor = ruleMinor(service.pricingRules, 'approvalCap');
  const minHours = Number(service.pricingRules.estimatedHoursMin);
  const maxHours = Number(service.pricingRules.estimatedHoursMax);
  const platformFeeAssumption = ruleText(service.pricingRules, 'platformFeeSummary');
  if (hourlyRateMinor === null || estimatedMinMinor === null || estimatedMaxMinor === null || approvalCapMinor === null
      || !Number.isFinite(minHours) || minHours <= 0 || !Number.isFinite(maxHours) || maxHours < minHours
      || !platformFeeAssumption || !materialsAssumption) return null;
  return Object.freeze({
    pricingMode: 'hourly',
    hourlyRateMinor,
    estimatedHours: Object.freeze({ min: minHours, max: maxHours }),
    estimatedTotalMinor: Object.freeze({ min: estimatedMinMinor, max: estimatedMaxMinor }),
    approvalCapMinor,
    platformFeeAssumption,
    materialsAssumption,
    cancellationSummary,
  });
}

export function pricingExplanation(service: GroundedCatalogueService): PricingModeExplanation {
  const mode = PRICING_MODE[service.pricingMode];
  const content: Readonly<Record<PricingMode, Readonly<{ label: string; explanation: string }>>> = Object.freeze({
    fixed: Object.freeze({ label: 'Fixed total', explanation: 'The published service version supplies one reviewable total.' }),
    hourly: Object.freeze({ label: 'Hourly estimate', explanation: 'Review the rate, estimated range and approval cap before sending.' }),
    remote_quote: Object.freeze({ label: 'Remote quote', explanation: 'There is no final price until you accept one complete Worker quote.' }),
    diagnostic_visit: Object.freeze({ label: 'Diagnostic visit', explanation: 'The visit fee covers only the stated diagnosis and deliverable; later work is separate.' }),
  });
  return Object.freeze({ mode, modeLabel: content[mode].label, explanation: content[mode].explanation });
}

export function catalogueSuggestions(
  services: readonly GroundedCatalogueService[],
  query: string,
  limit = 6,
): readonly CustomerServiceSuggestion[] {
  const terms = query.toLocaleLowerCase('en-ZA').trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return Object.freeze([]);
  return Object.freeze(services
    .filter((service) => {
      const haystack = `${service.label} ${service.description} ${service.canonicalKey.replaceAll('_', ' ')}`.toLocaleLowerCase('en-ZA');
      return terms.every((term) => haystack.includes(term));
    })
    .slice(0, Math.max(0, limit))
    .map((service) => Object.freeze({
      serviceId: service.id,
      serviceVersion: service.version,
      label: service.label,
      explanation: service.description,
    })));
}

const SHORTCUT_ICONS = Object.freeze([
  'wrench-outline',
  'hammer-wrench',
  'home-outline',
  'broom',
] as const);

export function catalogueShortcuts(
  services: readonly GroundedCatalogueService[],
  limit = 4,
): readonly CustomerServiceShortcut[] {
  return Object.freeze(services.slice(0, Math.max(0, limit)).map((service, index) => Object.freeze({
    serviceId: service.id,
    serviceVersion: service.version,
    label: service.label,
    icon: SHORTCUT_ICONS[index % SHORTCUT_ICONS.length] ?? 'wrench-outline',
  })));
}
