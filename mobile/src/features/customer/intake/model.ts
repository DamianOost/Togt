export const CUSTOMER_INTAKE_SCHEMA_VERSION = 1 as const;
export const CUSTOMER_CONFIRMATION_SNAPSHOT_VERSION = 1 as const;

export type PricingMode = 'fixed' | 'hourly' | 'remote_quote' | 'diagnostic_visit';
export type FulfilmentMode = 'fast_match' | 'compare_workers' | 'receive_quotes' | 'diagnostic_visit';
export type BriefStep = 'need' | 'details' | 'photos' | 'responsibility' | 'estimate';
export type ConnectionState = 'online' | 'offline';

export type CapabilityState = Readonly<{
  status: 'available' | 'unavailable' | 'unknown';
  reasonCode: string;
  explanation: string;
}>;

export type Coordinates = Readonly<{
  latitude: number;
  longitude: number;
}>;

export type AddressEntryMode =
  | 'manual'
  | 'saved_place'
  | 'current_location'
  | 'map_pin'
  | 'provider_search';

export type ResolvedCoordinateSource =
  | 'map_pin'
  | 'saved_verified_place'
  | 'provider_geocode'
  | 'device_gps'
  | 'entered_coordinates';

export type DispatchSafeCoordinateSource = Extract<
  ResolvedCoordinateSource,
  'map_pin' | 'saved_verified_place' | 'provider_geocode'
>;

export type CoordinateResolution =
  | Readonly<{
      status: 'unresolved';
      source: null;
      coordinates: null;
      reasonCode: string;
    }>
  | Readonly<{
      status: 'resolved';
      source: ResolvedCoordinateSource;
      coordinates: Coordinates;
      reasonCode: 'coordinates_resolved';
      detailsFingerprint: string;
    }>;

export type AddressDetails = Readonly<{
  line1: string;
  unitOrComplex: string;
  suburb: string;
  city: string;
  province: string;
  postalCode: string;
  landmark: string;
  accessInstructions: string;
}>;

export type JobAddress = Readonly<{
  entryMode: AddressEntryMode;
  details: AddressDetails;
  resolution: CoordinateResolution;
  confirmedAt: string | null;
}>;

export type ScheduleSelection = Readonly<{
  kind: 'now' | 'scheduled';
  startsAt: string | null;
  timezone: 'Africa/Johannesburg';
  estimatedDurationMinutes: Readonly<{ min: number; max: number }> | null;
  fulfilmentMode: FulfilmentMode;
}>;

export type FixedCommercialTerms = Readonly<{
  pricingMode: 'fixed';
  labourAmountMinor: number;
  platformFeeMinor: number;
  allInTotalMinor: number;
  materialsAssumption: string;
  cancellationSummary: string;
}>;

export type HourlyCommercialTerms = Readonly<{
  pricingMode: 'hourly';
  hourlyRateMinor: number;
  estimatedHours: Readonly<{ min: number; max: number }>;
  estimatedTotalMinor: Readonly<{ min: number; max: number }>;
  approvalCapMinor: number;
  platformFeeAssumption: string;
  materialsAssumption: string;
  cancellationSummary: string;
}>;

export type RemoteQuoteCommercialTerms = Readonly<{
  pricingMode: 'remote_quote';
  requestFeeMinor: number | null;
  finalPriceStatus: 'not_available_until_quote';
  materialsAssumption: string;
  cancellationSummary: string;
}>;

export type DiagnosticCommercialTerms = Readonly<{
  pricingMode: 'diagnostic_visit';
  diagnosticFeeMinor: number;
  platformFeeMinor: number;
  visitTotalMinor: number;
  deliverable: string;
  laterWorkIncluded: false;
  cancellationSummary: string;
}>;

export type CommercialTerms =
  | FixedCommercialTerms
  | HourlyCommercialTerms
  | RemoteQuoteCommercialTerms
  | DiagnosticCommercialTerms;

export type ServiceCatalogueSnapshot = Readonly<{
  serviceId: string;
  serviceVersion: number;
  label: string;
  requiredQuestionIds: readonly string[];
  allowedPricingModes: readonly PricingMode[];
  allowedFulfilmentModes: readonly FulfilmentMode[];
  permitsNow: boolean;
  photoRequirement: 'required' | 'optional' | 'not_allowed';
}>;

export type BriefAnswerValue = string | number | boolean | readonly string[];

export type BriefAttachment = Readonly<{
  localId: string;
  kind: 'photo';
  localUri: string;
  uploadStatus: 'local_only' | 'cropping' | 'compressing' | 'uploading' | 'uploaded' | 'failed';
  progressPercent: number;
  remoteAssetId: string | null;
  errorMessage: string | null;
}>;

export type JobBrief = Readonly<{
  answers: Readonly<Record<string, BriefAnswerValue>>;
  attachments: readonly BriefAttachment[];
  materialsResponsibility: 'customer' | 'worker' | 'discuss' | null;
  budgetCapMinor: number | null;
  diagnosticNeed: string;
}>;

export type DraftPersistence = Readonly<{
  state: 'not_saved' | 'saved_locally' | 'sync_needed';
  savedAt: string | null;
}>;

export type CustomerIntakeDraft = Readonly<{
  schemaVersion: typeof CUSTOMER_INTAKE_SCHEMA_VERSION;
  draftId: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  connectionState: ConnectionState;
  persistence: DraftPersistence;
  needText: string;
  selectedService: ServiceCatalogueSnapshot | null;
  brief: JobBrief;
  address: JobAddress;
  schedule: ScheduleSelection | null;
  commercialTerms: CommercialTerms | null;
}>;

export type CustomerIntakeDraftChanges = Partial<Pick<
  CustomerIntakeDraft,
  'connectionState' | 'needText' | 'selectedService' | 'brief' | 'address' | 'schedule' | 'commercialTerms'
>>;

export type SubmissionCapabilityContext = Readonly<{
  payment: CapabilityState;
  fulfilment: Readonly<Record<FulfilmentMode, CapabilityState>>;
}>;

export type SubmissionBlockerCode =
  | 'offline'
  | 'need_missing'
  | 'service_missing'
  | 'required_answers_missing'
  | 'required_photos_missing'
  | 'photos_not_allowed'
  | 'materials_responsibility_missing'
  | 'address_incomplete'
  | 'coordinates_unresolved'
  | 'coordinates_unverified'
  | 'address_not_confirmed'
  | 'schedule_missing'
  | 'schedule_invalid'
  | 'pricing_missing'
  | 'pricing_not_allowed'
  | 'fulfilment_not_allowed'
  | 'fulfilment_unavailable'
  | 'payment_unavailable';

export type SubmissionReadiness = Readonly<{
  ready: boolean;
  blockers: readonly Readonly<{
    code: SubmissionBlockerCode;
    explanation: string;
  }>[];
}>;

export type CustomerConfirmationSnapshot = Readonly<{
  schemaVersion: typeof CUSTOMER_CONFIRMATION_SNAPSHOT_VERSION;
  sourceDraftSchemaVersion: typeof CUSTOMER_INTAKE_SCHEMA_VERSION;
  sourceDraftId: string;
  sourceDraftRevision: number;
  needText: string;
  selectedService: ServiceCatalogueSnapshot;
  brief: JobBrief;
  address: JobAddress;
  schedule: ScheduleSelection;
  commercialTerms: CommercialTerms;
  fingerprint: string;
}>;

export type SubmissionIntent = Readonly<{
  schemaVersion: 1;
  idempotencyKey: string;
  requestedAt: string;
  snapshot: CustomerConfirmationSnapshot;
}>;

export type SubmissionIntentResult =
  | Readonly<{ ok: true; intent: SubmissionIntent; readiness: SubmissionReadiness }>
  | Readonly<{ ok: false; readiness: SubmissionReadiness }>;

const EMPTY_ADDRESS_DETAILS: AddressDetails = Object.freeze({
  line1: '',
  unitOrComplex: '',
  suburb: '',
  city: '',
  province: '',
  postalCode: '',
  landmark: '',
  accessInstructions: '',
});

const EMPTY_ADDRESS: JobAddress = Object.freeze({
  entryMode: 'manual',
  details: EMPTY_ADDRESS_DETAILS,
  resolution: Object.freeze({
    status: 'unresolved',
    source: null,
    coordinates: null,
    reasonCode: 'coordinates_not_resolved',
  }),
  confirmedAt: null,
});

const EMPTY_BRIEF: JobBrief = Object.freeze({
  answers: Object.freeze({}),
  attachments: Object.freeze([]),
  materialsResponsibility: null,
  budgetCapMinor: null,
  diagnosticNeed: '',
});

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

function requireIdentifier(value: string, field: string): string {
  const candidate = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(candidate)) {
    throw new TypeError(`${field} must be a stable identifier`);
  }
  return candidate;
}

function requireIsoInstant(value: string, field: string): string {
  if (!value || !Number.isFinite(Date.parse(value))) {
    throw new TypeError(`${field} must be an ISO date-time`);
  }
  return new Date(value).toISOString();
}

function requireMinorAmount(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${field} must be a non-negative integer in cents`);
  }
  return value;
}

export function isValidCoordinates(coordinates: Coordinates | null | undefined): coordinates is Coordinates {
  return coordinates !== null
    && coordinates !== undefined
    && Number.isFinite(coordinates.latitude)
    && Number.isFinite(coordinates.longitude)
    && coordinates.latitude >= -90
    && coordinates.latitude <= 90
    && coordinates.longitude >= -180
    && coordinates.longitude <= 180;
}

function normaliseCatalogueSnapshot(snapshot: ServiceCatalogueSnapshot): ServiceCatalogueSnapshot {
  const serviceVersion = snapshot.serviceVersion;
  if (!Number.isSafeInteger(serviceVersion) || serviceVersion < 1) {
    throw new TypeError('serviceVersion must be a positive integer');
  }
  if (!snapshot.label.trim()) throw new TypeError('service label is required');
  if (!['required', 'optional', 'not_allowed'].includes(snapshot.photoRequirement)) {
    throw new TypeError('photoRequirement is invalid');
  }

  return deepFreeze({
    serviceId: requireIdentifier(snapshot.serviceId, 'serviceId'),
    serviceVersion,
    label: snapshot.label.trim(),
    requiredQuestionIds: [...new Set(snapshot.requiredQuestionIds.map((id) => requireIdentifier(id, 'questionId')))].sort(),
    allowedPricingModes: [...new Set(snapshot.allowedPricingModes)].sort(),
    allowedFulfilmentModes: [...new Set(snapshot.allowedFulfilmentModes)].sort(),
    permitsNow: snapshot.permitsNow === true,
    photoRequirement: snapshot.photoRequirement,
  });
}

function normaliseBrief(brief: JobBrief): JobBrief {
  const answers: Record<string, BriefAnswerValue> = {};
  for (const [rawId, rawValue] of Object.entries(brief.answers)) {
    const id = requireIdentifier(rawId, 'answer questionId');
    answers[id] = Array.isArray(rawValue) ? Object.freeze([...rawValue]) : rawValue;
  }
  const attachments = brief.attachments.map((attachment) => {
    const progress = Math.max(0, Math.min(100, Math.round(attachment.progressPercent)));
    return deepFreeze({
      ...attachment,
      localId: requireIdentifier(attachment.localId, 'attachment localId'),
      progressPercent: progress,
    });
  });

  if (brief.budgetCapMinor !== null) requireMinorAmount(brief.budgetCapMinor, 'budgetCapMinor');
  return deepFreeze({
    answers,
    attachments,
    materialsResponsibility: brief.materialsResponsibility,
    budgetCapMinor: brief.budgetCapMinor,
    diagnosticNeed: brief.diagnosticNeed.trim(),
  });
}

export function normaliseAddressDetails(details: AddressDetails): AddressDetails {
  return deepFreeze({
    line1: details.line1.trim(),
    unitOrComplex: details.unitOrComplex.trim(),
    suburb: details.suburb.trim(),
    city: details.city.trim(),
    province: details.province.trim(),
    postalCode: details.postalCode.trim(),
    landmark: details.landmark.trim(),
    accessInstructions: details.accessInstructions.trim(),
  });
}

function rawAddressDetails(details: AddressDetails): AddressDetails {
  return deepFreeze({
    line1: details.line1,
    unitOrComplex: details.unitOrComplex,
    suburb: details.suburb,
    city: details.city,
    province: details.province,
    postalCode: details.postalCode,
    landmark: details.landmark,
    accessInstructions: details.accessInstructions,
  });
}

export function addressLocationFingerprint(details: AddressDetails): string {
  const normalised = normaliseAddressDetails(details);
  return stableFingerprint({
    line1: normalised.line1,
    unitOrComplex: normalised.unitOrComplex,
    suburb: normalised.suburb,
    city: normalised.city,
    province: normalised.province,
    postalCode: normalised.postalCode,
  });
}

export type DispatchSafeJobAddress = JobAddress & Readonly<{
  resolution: Extract<CoordinateResolution, { status: 'resolved' }> & Readonly<{
    source: DispatchSafeCoordinateSource;
  }>;
}>;

export function isDispatchSafeCoordinateSource(
  source: ResolvedCoordinateSource,
): source is DispatchSafeJobAddress['resolution']['source'] {
  return source === 'map_pin'
    || source === 'saved_verified_place'
    || source === 'provider_geocode';
}

export function isAddressEntryModeSourcePairValid(
  entryMode: AddressEntryMode,
  source: ResolvedCoordinateSource,
): boolean {
  if (entryMode === 'map_pin') return source === 'map_pin';
  if (entryMode === 'saved_place') return source === 'saved_verified_place';
  if (entryMode === 'current_location') return source === 'device_gps';
  if (entryMode === 'provider_search') return source === 'provider_geocode';
  return source === 'provider_geocode' || source === 'entered_coordinates';
}

/**
 * Dispatch requires an address provider (or integrated map/saved-place flow) to
 * attest that the displayed address and the coordinates describe one place.
 * Raw GPS or manually entered coordinates remain useful draft evidence, but
 * cannot be paired with arbitrary address text and sent to a worker.
 */
export function isAddressResolutionDispatchSafe(address: JobAddress): address is DispatchSafeJobAddress {
  return address.resolution.status === 'resolved'
    && isAddressEntryModeSourcePairValid(address.entryMode, address.resolution.source)
    && isDispatchSafeCoordinateSource(address.resolution.source)
    && isValidCoordinates(address.resolution.coordinates)
    && (
      address.resolution.detailsFingerprint === addressLocationFingerprint(address.details)
      // Retain the same safe migration path as normaliseAddress for v1 drafts
      // whose fingerprint included landmark/access notes.
      || address.resolution.detailsFingerprint === stableFingerprint(address.details)
    );
}

function prepareAddress(address: JobAddress, commit: boolean): JobAddress {
  const details = commit ? normaliseAddressDetails(address.details) : rawAddressDetails(address.details);
  if (address.resolution.status === 'resolved' && !isValidCoordinates(address.resolution.coordinates)) {
    throw new TypeError('resolved coordinates are invalid');
  }
  if (
    address.resolution.status === 'resolved'
    && !isAddressEntryModeSourcePairValid(address.entryMode, address.resolution.source)
  ) {
    throw new TypeError('entryMode and coordinate source are incompatible');
  }
  const normalisedDetails = normaliseAddressDetails(details);
  if (
    address.resolution.status === 'resolved'
    && address.resolution.detailsFingerprint !== addressLocationFingerprint(details)
    // Accept and migrate persisted v1 drafts whose fingerprint also covered
    // landmark and access notes. Those notes never identify the map position.
    && address.resolution.detailsFingerprint !== stableFingerprint(normalisedDetails)
  ) {
    throw new TypeError('address text and resolved coordinates must come from the same address version');
  }
  const resolution = address.resolution.status === 'resolved'
    ? deepFreeze({ ...address.resolution, detailsFingerprint: addressLocationFingerprint(details) })
    : address.resolution;
  const confirmationEligible = resolution.status === 'resolved'
    && isDispatchSafeCoordinateSource(resolution.source);
  return deepFreeze({
    entryMode: resolution.status === 'unresolved' ? 'manual' : address.entryMode,
    details,
    resolution,
    // GPS/entered-coordinate drafts cannot retain dispatch confirmation. A
    // verified provider/map result must be obtained first.
    confirmedAt: !confirmationEligible || address.confirmedAt === null
      ? null
      : requireIsoInstant(address.confirmedAt, 'confirmedAt'),
  });
}

/**
 * Commit boundary for Save Draft, pin acceptance and consequential submission.
 * Ordinary field updates deliberately use the raw-buffer path instead.
 */
export function normaliseJobAddressForCommit(address: JobAddress): JobAddress {
  return prepareAddress(address, true);
}

/**
 * Fail-closed restoration for legacy or locally corrupted address state. Valid
 * legacy unsafe pairs remain auditable but can never retain confirmation.
 */
export function restoreJobAddress(input: unknown): JobAddress | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  const details = value.details;
  if (!details || typeof details !== 'object' || Array.isArray(details)) return null;
  const detailRecord = details as Record<string, unknown>;
  const fields: Array<keyof AddressDetails> = [
    'line1',
    'unitOrComplex',
    'suburb',
    'city',
    'province',
    'postalCode',
    'landmark',
    'accessInstructions',
  ];
  if (!fields.every((field) => typeof detailRecord[field] === 'string')) return null;
  const addressDetails = Object.fromEntries(
    fields.map((field) => [field, detailRecord[field]]),
  ) as AddressDetails;
  const entryModes: readonly AddressEntryMode[] = [
    'manual',
    'saved_place',
    'current_location',
    'map_pin',
    'provider_search',
  ];
  const entryModeValid = entryModes.includes(value.entryMode as AddressEntryMode);
  const entryMode = entryModeValid
    ? value.entryMode as AddressEntryMode
    : 'manual';
  const resolution = value.resolution;
  if (!resolution || typeof resolution !== 'object' || Array.isArray(resolution)) return null;
  const resolutionRecord = resolution as Record<string, unknown>;
  if (resolutionRecord.status === 'unresolved') {
    return prepareAddress({
      entryMode: 'manual',
      details: addressDetails,
      resolution: {
        status: 'unresolved',
        source: null,
        coordinates: null,
        reasonCode: typeof resolutionRecord.reasonCode === 'string'
          ? resolutionRecord.reasonCode
          : 'coordinates_not_resolved',
      },
      confirmedAt: null,
    }, true);
  }
  const sources: readonly ResolvedCoordinateSource[] = [
    'map_pin',
    'saved_verified_place',
    'provider_geocode',
    'device_gps',
    'entered_coordinates',
  ];
  const source = resolutionRecord.source as ResolvedCoordinateSource;
  const coordinates = resolutionRecord.coordinates as Coordinates | null;
  const fingerprint = resolutionRecord.detailsFingerprint;
  const confirmedAt = value.confirmedAt;
  if (
    resolutionRecord.status !== 'resolved'
    || !sources.includes(source)
    || !isValidCoordinates(coordinates)
    || typeof fingerprint !== 'string'
    || (confirmedAt !== null && typeof confirmedAt !== 'string')
  ) {
    return null;
  }
  if (!entryModeValid) {
    return prepareAddress({
      entryMode: 'manual',
      details: addressDetails,
      resolution: {
        status: 'unresolved',
        source: null,
        coordinates: null,
        reasonCode: 'restored_address_pair_invalid',
      },
      confirmedAt: null,
    }, true);
  }
  try {
    return prepareAddress({
      entryMode,
      details: addressDetails,
      resolution: {
        status: 'resolved',
        source,
        coordinates,
        reasonCode: 'coordinates_resolved',
        detailsFingerprint: fingerprint,
      },
      confirmedAt,
    }, true);
  } catch {
    return prepareAddress({
      entryMode: 'manual',
      details: addressDetails,
      resolution: {
        status: 'unresolved',
        source: null,
        coordinates: null,
        reasonCode: 'restored_address_pair_invalid',
      },
      confirmedAt: null,
    }, true);
  }
}

export function createResolvedJobAddress(input: Readonly<{
  entryMode: JobAddress['entryMode'];
  details: AddressDetails;
  source: Extract<CoordinateResolution, { status: 'resolved' }>['source'];
  coordinates: Coordinates;
  confirmedAt: string | null;
}>): JobAddress {
  if (!isAddressEntryModeSourcePairValid(input.entryMode, input.source)) {
    throw new TypeError('entryMode and coordinate source are incompatible');
  }
  const details = normaliseAddressDetails(input.details);
  return prepareAddress({
    entryMode: input.entryMode,
    details,
    resolution: {
      status: 'resolved',
      source: input.source,
      coordinates: input.coordinates,
      reasonCode: 'coordinates_resolved',
      detailsFingerprint: addressLocationFingerprint(details),
    },
    confirmedAt: input.confirmedAt,
  }, true);
}

export type AddressPickerCommitGuard = Readonly<{
  draftId: string;
  draftRevision: number;
  detailsFingerprint: string;
}>;

export type MapPinCommitResult =
  | Readonly<{ ok: true; address: JobAddress }>
  | Readonly<{
      ok: false;
      reasonCode: 'address_changed_pin_recheck_required' | 'invalid_coordinates' | 'address_incomplete';
    }>;

export function captureAddressPickerCommitGuard(
  draft: CustomerIntakeDraft,
): AddressPickerCommitGuard {
  return deepFreeze({
    draftId: draft.draftId,
    draftRevision: draft.revision,
    detailsFingerprint: addressLocationFingerprint(draft.address.details),
  });
}

export function commitMapPinForDraft(
  draft: CustomerIntakeDraft,
  guard: AddressPickerCommitGuard,
  coordinates: Coordinates,
): MapPinCommitResult {
  if (
    draft.draftId !== guard.draftId
    || draft.revision !== guard.draftRevision
    || addressLocationFingerprint(draft.address.details) !== guard.detailsFingerprint
  ) {
    return Object.freeze({ ok: false, reasonCode: 'address_changed_pin_recheck_required' });
  }
  if (!isValidCoordinates(coordinates)) {
    return Object.freeze({ ok: false, reasonCode: 'invalid_coordinates' });
  }
  const details = normaliseAddressDetails(draft.address.details);
  if (!details.line1 || !details.city || !details.province) {
    return Object.freeze({ ok: false, reasonCode: 'address_incomplete' });
  }
  return Object.freeze({
    ok: true,
    address: createResolvedJobAddress({
      entryMode: 'map_pin',
      details,
      source: 'map_pin',
      coordinates,
      confirmedAt: null,
    }),
  });
}

const LOCATION_ADDRESS_FIELDS = new Set<keyof AddressDetails>([
  'line1',
  'unitOrComplex',
  'suburb',
  'city',
  'province',
  'postalCode',
]);

export function updateJobAddressDetail(
  address: JobAddress,
  field: keyof AddressDetails,
  value: string,
): JobAddress {
  const details = { ...address.details, [field]: value };
  if (!LOCATION_ADDRESS_FIELDS.has(field)) {
    return prepareAddress({
      ...address,
      details,
      // Notes must be confirmed again, but they do not move the verified pin.
      confirmedAt: null,
    }, false);
  }
  return prepareAddress({
    entryMode: 'manual',
    details,
    resolution: {
      status: 'unresolved',
      source: null,
      coordinates: null,
      reasonCode: 'address_text_changed',
    },
    confirmedAt: null,
  }, false);
}

function normaliseSchedule(schedule: ScheduleSelection | null): ScheduleSelection | null {
  if (schedule === null) return null;
  if (schedule.kind === 'now' && schedule.startsAt !== null) {
    throw new TypeError('Now schedules cannot contain startsAt');
  }
  if (schedule.kind === 'scheduled' && schedule.startsAt === null) {
    throw new TypeError('Scheduled work requires startsAt');
  }
  const startsAt = schedule.startsAt === null ? null : requireIsoInstant(schedule.startsAt, 'startsAt');
  const duration = schedule.estimatedDurationMinutes;
  if (duration && (!Number.isSafeInteger(duration.min) || !Number.isSafeInteger(duration.max)
    || duration.min <= 0 || duration.max < duration.min)) {
    throw new TypeError('Estimated duration is invalid');
  }
  return deepFreeze({ ...schedule, startsAt, estimatedDurationMinutes: duration });
}

function normaliseCommercialTerms(terms: CommercialTerms | null): CommercialTerms | null {
  if (terms === null) return null;
  if (terms.pricingMode === 'fixed') {
    requireMinorAmount(terms.labourAmountMinor, 'labourAmountMinor');
    requireMinorAmount(terms.platformFeeMinor, 'platformFeeMinor');
    requireMinorAmount(terms.allInTotalMinor, 'allInTotalMinor');
    if (terms.allInTotalMinor < terms.labourAmountMinor + terms.platformFeeMinor) {
      throw new TypeError('Fixed total cannot be less than labour plus platform fee');
    }
  } else if (terms.pricingMode === 'hourly') {
    requireMinorAmount(terms.hourlyRateMinor, 'hourlyRateMinor');
    requireMinorAmount(terms.estimatedTotalMinor.min, 'estimatedTotalMinor.min');
    requireMinorAmount(terms.estimatedTotalMinor.max, 'estimatedTotalMinor.max');
    requireMinorAmount(terms.approvalCapMinor, 'approvalCapMinor');
    if (terms.estimatedHours.min <= 0 || terms.estimatedHours.max < terms.estimatedHours.min
      || terms.estimatedTotalMinor.max < terms.estimatedTotalMinor.min
      || terms.approvalCapMinor < terms.estimatedTotalMinor.max) {
      throw new TypeError('Hourly estimate or approval cap is invalid');
    }
  } else if (terms.pricingMode === 'remote_quote') {
    if (terms.requestFeeMinor !== null) requireMinorAmount(terms.requestFeeMinor, 'requestFeeMinor');
  } else {
    requireMinorAmount(terms.diagnosticFeeMinor, 'diagnosticFeeMinor');
    requireMinorAmount(terms.platformFeeMinor, 'platformFeeMinor');
    requireMinorAmount(terms.visitTotalMinor, 'visitTotalMinor');
    if (!terms.deliverable.trim() || terms.laterWorkIncluded !== false) {
      throw new TypeError('Diagnostic terms require a deliverable and must exclude later work');
    }
    if (terms.visitTotalMinor < terms.diagnosticFeeMinor + terms.platformFeeMinor) {
      throw new TypeError('Diagnostic total cannot be less than the diagnostic and platform fees');
    }
  }
  return deepFreeze({ ...terms });
}

export function createCustomerIntakeDraft(input: Readonly<{
  draftId: string;
  createdAt: string;
  connectionState: ConnectionState;
}>): CustomerIntakeDraft {
  const createdAt = requireIsoInstant(input.createdAt, 'createdAt');
  return deepFreeze({
    schemaVersion: CUSTOMER_INTAKE_SCHEMA_VERSION,
    draftId: requireIdentifier(input.draftId, 'draftId'),
    revision: 1,
    createdAt,
    updatedAt: createdAt,
    connectionState: input.connectionState,
    persistence: { state: 'not_saved', savedAt: null },
    needText: '',
    selectedService: null,
    brief: EMPTY_BRIEF,
    address: EMPTY_ADDRESS,
    schedule: null,
    commercialTerms: null,
  });
}

export function reviseCustomerIntakeDraft(
  draft: CustomerIntakeDraft,
  changes: CustomerIntakeDraftChanges,
  updatedAt: string,
): CustomerIntakeDraft {
  const nextUpdatedAt = requireIsoInstant(updatedAt, 'updatedAt');
  if (Date.parse(nextUpdatedAt) < Date.parse(draft.updatedAt)) {
    throw new TypeError('updatedAt cannot move backwards');
  }
  const selectedService = changes.selectedService === undefined
    ? draft.selectedService
    : changes.selectedService === null
      ? null
      : normaliseCatalogueSnapshot(changes.selectedService);
  const brief = changes.brief === undefined ? draft.brief : normaliseBrief(changes.brief);
  const address = changes.address === undefined ? draft.address : prepareAddress(changes.address, false);
  const schedule = changes.schedule === undefined ? draft.schedule : normaliseSchedule(changes.schedule);
  const commercialTerms = changes.commercialTerms === undefined
    ? draft.commercialTerms
    : normaliseCommercialTerms(changes.commercialTerms);
  const contentChanged = Object.keys(changes).some((key) => key !== 'connectionState');
  const persistence = contentChanged && draft.persistence.state === 'saved_locally'
    ? { state: 'sync_needed' as const, savedAt: draft.persistence.savedAt }
    : draft.persistence;

  return deepFreeze({
    ...draft,
    revision: draft.revision + 1,
    updatedAt: nextUpdatedAt,
    connectionState: changes.connectionState ?? draft.connectionState,
    persistence,
    needText: changes.needText === undefined ? draft.needText : changes.needText.trim(),
    selectedService,
    brief,
    address,
    schedule,
    commercialTerms,
  });
}

export function saveCustomerIntakeDraftLocally(
  draft: CustomerIntakeDraft,
  savedAt: string,
): CustomerIntakeDraft {
  const timestamp = requireIsoInstant(savedAt, 'savedAt');
  if (Date.parse(timestamp) < Date.parse(draft.updatedAt)) {
    throw new TypeError('savedAt cannot be earlier than the draft update');
  }
  return deepFreeze({
    ...draft,
    revision: draft.revision + 1,
    updatedAt: timestamp,
    persistence: { state: 'saved_locally', savedAt: timestamp },
    address: normaliseJobAddressForCommit(draft.address),
  });
}

function hasAnswer(value: BriefAnswerValue | undefined): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
}

function addressHasOperationalText(address: JobAddress): boolean {
  return Boolean(
    address.details.line1.trim()
    && address.details.city.trim()
    && address.details.province.trim(),
  );
}

export function validateScheduleSelection(
  schedule: ScheduleSelection,
  context: Readonly<{ now: string; permitsNow: boolean }>,
): Readonly<{ valid: boolean; reasonCode: 'valid' | 'now_not_permitted' | 'scheduled_time_missing' | 'scheduled_time_not_future' }> {
  const now = requireIsoInstant(context.now, 'now');
  if (schedule.kind === 'now') {
    return Object.freeze(context.permitsNow
      ? { valid: true, reasonCode: 'valid' as const }
      : { valid: false, reasonCode: 'now_not_permitted' as const });
  }
  if (!schedule.startsAt) {
    return Object.freeze({ valid: false, reasonCode: 'scheduled_time_missing' as const });
  }
  return Object.freeze(Date.parse(schedule.startsAt) > Date.parse(now)
    ? { valid: true, reasonCode: 'valid' as const }
    : { valid: false, reasonCode: 'scheduled_time_not_future' as const });
}

function blocker(code: SubmissionBlockerCode, explanation: string) {
  return Object.freeze({ code, explanation });
}

function requiresPayment(terms: CommercialTerms): boolean {
  return terms.pricingMode !== 'remote_quote'
    || (terms.requestFeeMinor !== null && terms.requestFeeMinor > 0);
}

export function deriveSubmissionReadiness(
  draft: CustomerIntakeDraft,
  capabilities: SubmissionCapabilityContext,
  now: string,
): SubmissionReadiness {
  const blockers: Array<ReturnType<typeof blocker>> = [];
  if (draft.connectionState === 'offline') {
    blockers.push(blocker('offline', 'Reconnect before sending this job. Your draft remains on this device.'));
  }
  if (!draft.needText) blockers.push(blocker('need_missing', 'Describe what needs doing.'));
  if (!draft.selectedService) blockers.push(blocker('service_missing', 'Choose a service before continuing.'));

  if (draft.selectedService) {
    const missingAnswers = draft.selectedService.requiredQuestionIds.filter(
      (questionId) => !hasAnswer(draft.brief.answers[questionId]),
    );
    if (missingAnswers.length > 0) {
      blockers.push(blocker('required_answers_missing', 'Complete the required job details.'));
    }
    if (draft.selectedService.photoRequirement === 'required' && draft.brief.attachments.length === 0) {
      blockers.push(blocker('required_photos_missing', 'Add the required job photo before sending.'));
    }
    if (draft.selectedService.photoRequirement === 'not_allowed' && draft.brief.attachments.length > 0) {
      blockers.push(blocker('photos_not_allowed', 'Remove photos because this service version does not accept them.'));
    }
  }
  if (!draft.brief.materialsResponsibility) {
    blockers.push(blocker('materials_responsibility_missing', 'Choose who should provide materials or parts.'));
  }

  if (!addressHasOperationalText(draft.address)) {
    blockers.push(blocker('address_incomplete', 'Add the street, city and province for the job.'));
  }
  if (draft.address.resolution.status !== 'resolved') {
    blockers.push(blocker('coordinates_unresolved', 'Resolve coordinates before dispatch so the worker can reach the job.'));
  } else if (!isAddressResolutionDispatchSafe(draft.address)) {
    blockers.push(blocker(
      'coordinates_unverified',
      'The coordinates are not verified against the displayed address. Retry with provider address resolution, a verified saved place or an integrated map pin before dispatch.',
    ));
  }
  if (!draft.address.confirmedAt) {
    blockers.push(blocker('address_not_confirmed', 'Confirm the job address and access instructions.'));
  }

  if (!draft.schedule) {
    blockers.push(blocker('schedule_missing', 'Choose when the work should happen.'));
  } else if (draft.selectedService) {
    const validation = validateScheduleSelection(draft.schedule, {
      now,
      permitsNow: draft.selectedService.permitsNow,
    });
    if (!validation.valid) blockers.push(blocker('schedule_invalid', 'Choose a valid future time or an allowed Now option.'));
    if (!draft.selectedService.allowedFulfilmentModes.includes(draft.schedule.fulfilmentMode)) {
      blockers.push(blocker('fulfilment_not_allowed', 'This fulfilment option is not available for the selected service version.'));
    } else if (capabilities.fulfilment[draft.schedule.fulfilmentMode].status !== 'available') {
      blockers.push(blocker('fulfilment_unavailable', capabilities.fulfilment[draft.schedule.fulfilmentMode].explanation));
    }
  }

  if (!draft.commercialTerms) {
    blockers.push(blocker('pricing_missing', 'Pricing terms are not available for review yet.'));
  } else {
    if (draft.selectedService && !draft.selectedService.allowedPricingModes.includes(draft.commercialTerms.pricingMode)) {
      blockers.push(blocker('pricing_not_allowed', 'These pricing terms do not match the selected service version.'));
    }
    if (requiresPayment(draft.commercialTerms) && capabilities.payment.status !== 'available') {
      blockers.push(blocker('payment_unavailable', capabilities.payment.explanation));
    }
  }

  return deepFreeze({ ready: blockers.length === 0, blockers });
}

function canonicalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalise(child)]),
    );
  }
  return value;
}

function stableFingerprint(value: unknown): string {
  const source = JSON.stringify(canonicalise(value));
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function buildSnapshot(draft: CustomerIntakeDraft): CustomerConfirmationSnapshot {
  if (!draft.selectedService || !draft.schedule || !draft.commercialTerms) {
    throw new Error('Cannot snapshot an incomplete draft');
  }
  const content = {
    schemaVersion: CUSTOMER_CONFIRMATION_SNAPSHOT_VERSION,
    sourceDraftSchemaVersion: draft.schemaVersion,
    sourceDraftId: draft.draftId,
    sourceDraftRevision: draft.revision,
    needText: draft.needText,
    selectedService: draft.selectedService,
    brief: draft.brief,
    address: draft.address,
    schedule: draft.schedule,
    commercialTerms: draft.commercialTerms,
  } as const;
  return deepFreeze({ ...content, fingerprint: stableFingerprint(content) });
}

export function createSubmissionIntent(
  draft: CustomerIntakeDraft,
  capabilities: SubmissionCapabilityContext,
  requestedAt: string,
): SubmissionIntentResult {
  const timestamp = requireIsoInstant(requestedAt, 'requestedAt');
  const committedDraft = deepFreeze({
    ...draft,
    address: normaliseJobAddressForCommit(draft.address),
  }) as CustomerIntakeDraft;
  const readiness = deriveSubmissionReadiness(committedDraft, capabilities, timestamp);
  if (!readiness.ready) return Object.freeze({ ok: false, readiness });

  const snapshot = buildSnapshot(committedDraft);
  const idempotencyKey = `customer-intake:${committedDraft.draftId}:r${committedDraft.revision}:${snapshot.fingerprint}`;
  return deepFreeze({
    ok: true,
    readiness,
    intent: {
      schemaVersion: 1,
      idempotencyKey,
      requestedAt: timestamp,
      snapshot,
    },
  });
}
