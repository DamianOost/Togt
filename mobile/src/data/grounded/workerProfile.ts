import type {
  ActivationChecklistItem,
  ActivationSnapshot,
  CatalogueServiceFacts,
  LifecycleEvidence,
  MutationFeedback,
  PortfolioEvidence,
  PublicProfileSnapshot,
  ServicesProfileSnapshot,
  WorkerAccountEntry,
  WorkerAccountReadinessSnapshot,
  WorkerServiceOffering,
} from '../../features/worker/lifecycle';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SCHEMA = 'togt.worker-profile.v1' as const;
const ACTIVATION_KINDS = [
  'account_contact', 'identity_assurance', 'profile_photo', 'about_experience',
  'eligible_service', 'pricing_acceptance', 'service_area', 'payout_method',
  'foreground_location', 'safety_emergency', 'first_job_readiness',
] as const;
const ACKNOWLEDGEMENT_KINDS = [
  'foreground_location', 'safety_policy', 'first_job_readiness',
] as const;

type JsonRecord = Record<string, unknown>;

export type WorkerProfileAdaptResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; reasonCode: 'invalid_worker_profile_contract'; field: string }>;

export type WorkerProfileUnavailableCapability = Readonly<{
  status: 'unavailable' | 'unknown';
  reasonCode: string;
  explanation: string;
}>;

export type WorkerProfileCapabilities = Readonly<{
  portfolioUpload: WorkerProfileUnavailableCapability;
  credentialSubmission: WorkerProfileUnavailableCapability;
  payoutAccount: WorkerProfileUnavailableCapability;
}>;

export type WorkerProfileBundle = Readonly<{
  snapshot: ServicesProfileSnapshot;
  capabilities: WorkerProfileCapabilities;
}>;

class ContractFailure extends Error {
  readonly field: string;
  constructor(field: string) {
    super(field);
    this.field = field;
  }
}

function invalid<T>(error: unknown): WorkerProfileAdaptResult<T> {
  return Object.freeze({
    ok: false,
    reasonCode: 'invalid_worker_profile_contract',
    field: error instanceof ContractFailure ? error.field : 'unknown',
  });
}

function record(value: unknown, field: string): JsonRecord {
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new ContractFailure(field);
  return value as JsonRecord;
}

function array(value: unknown, field: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new ContractFailure(field);
  return value;
}

function text(value: unknown, field: string, { min = 1, max = 2_000 } = {}): string {
  if (typeof value !== 'string') throw new ContractFailure(field);
  const candidate = value.trim();
  if (candidate.length < min || candidate.length > max || candidate.includes('\u0000')) {
    throw new ContractFailure(field);
  }
  return candidate;
}

function nullableText(value: unknown, field: string, max = 2_000): string | null {
  return value === null ? null : text(value, field, { max });
}

function uuid(value: unknown, field: string): string {
  const candidate = text(value, field, { max: 64 });
  if (!UUID.test(candidate)) throw new ContractFailure(field);
  return candidate.toLowerCase();
}

function stableId(value: unknown, field: string): string {
  const candidate = text(value, field, { max: 128 });
  if (!STABLE_ID.test(candidate)) throw new ContractFailure(field);
  return candidate;
}

function integer(value: unknown, field: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) throw new ContractFailure(field);
  return value as number;
}

function nullableInteger(value: unknown, field: string, minimum = 0): number | null {
  return value === null ? null : integer(value, field, minimum);
}

function boolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new ContractFailure(field);
  return value;
}

function iso(value: unknown, field: string): string {
  const candidate = text(value, field, { max: 64 });
  if (!Number.isFinite(new Date(candidate).getTime())) throw new ContractFailure(field);
  return candidate;
}

function oneOf<const T extends readonly string[]>(value: unknown, choices: T, field: string): T[number] {
  if (typeof value !== 'string' || !choices.includes(value)) throw new ContractFailure(field);
  return value as T[number];
}

function safeImageUri(value: unknown, field: string): string {
  const candidate = text(value, field, { max: 2_048 });
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new ContractFailure(field);
  } catch {
    throw new ContractFailure(field);
  }
  return candidate;
}

function unavailable(value: unknown, field: string): WorkerProfileUnavailableCapability {
  const source = record(value, field);
  return Object.freeze({
    status: oneOf(source.status, ['unavailable', 'unknown'] as const, `${field}.status`),
    reasonCode: stableId(source.reasonCode, `${field}.reasonCode`),
    explanation: text(source.explanation, `${field}.explanation`, { max: 1_000 }),
  });
}

function money(value: unknown, field: string): Readonly<{ currency: 'ZAR'; amountMinor: number }> {
  const source = record(value, field);
  if (source.currency !== 'ZAR') throw new ContractFailure(`${field}.currency`);
  return Object.freeze({ currency: 'ZAR', amountMinor: integer(source.amountMinor, `${field}.amountMinor`) });
}

function evidence<T>(
  value: unknown,
  field: string,
  adaptValue: (raw: unknown, valueField: string) => T,
): LifecycleEvidence<T> {
  const source = record(value, field);
  if (source.status === 'supported') {
    if (source.source !== 'server') throw new ContractFailure(`${field}.source`);
    return Object.freeze({
      status: 'supported',
      source: 'server' as const,
      observedAt: iso(source.observedAt, `${field}.observedAt`),
      value: adaptValue(source.value, `${field}.value`),
    });
  }
  return unavailable(source, field);
}

function mutation(value: unknown, field: string): MutationFeedback {
  const source = record(value, field);
  return Object.freeze({
    state: oneOf(source.state, ['idle', 'saving', 'confirmed', 'failed_rolled_back'] as const, `${field}.state`),
    message: nullableText(source.message, `${field}.message`, 1_000),
    confirmedAt: source.confirmedAt === null ? null : iso(source.confirmedAt, `${field}.confirmedAt`),
  });
}

function adaptActivationItem(value: unknown, index: number): ActivationChecklistItem {
  const field = `activation.items[${index}]`;
  const source = record(value, field);
  return Object.freeze({
    itemId: stableId(source.itemId, `${field}.itemId`),
    kind: oneOf(source.kind, ACTIVATION_KINDS, `${field}.kind`),
    title: text(source.title, `${field}.title`, { max: 160 }),
    status: oneOf(source.status, ['complete', 'incomplete', 'failed', 'pending_review', 'not_required'] as const, `${field}.status`),
    required: boolean(source.required, `${field}.required`),
    visibility: oneOf(source.visibility, ['public', 'private'] as const, `${field}.visibility`),
    evidenceLabel: nullableText(source.evidenceLabel, `${field}.evidenceLabel`, 500),
    remedy: nullableText(source.remedy, `${field}.remedy`, 1_000),
    destinationKey: stableId(source.destinationKey, `${field}.destinationKey`),
  });
}

function adaptActivationPolicy(value: unknown, index: number) {
  const field = `activation.acknowledgementPolicies[${index}]`;
  const source = record(value, field);
  const kind = oneOf(source.kind, ACKNOWLEDGEMENT_KINDS, `${field}.kind`);
  const status = oneOf(source.status, ['available', 'unavailable'] as const, `${field}.status`);
  if (status === 'available') {
    return Object.freeze({
      kind,
      status,
      expectedRevision: integer(source.expectedRevision, `${field}.expectedRevision`, 1),
      acknowledgedCurrent: boolean(source.acknowledgedCurrent, `${field}.acknowledgedCurrent`),
      policyVersion: stableId(source.policyVersion, `${field}.policyVersion`),
      title: text(source.title, `${field}.title`, { max: 160 }),
      body: text(source.body, `${field}.body`, { max: 2_000 }),
      acknowledgementLabel: text(source.acknowledgementLabel, `${field}.acknowledgementLabel`, { max: 200 }),
    });
  }
  if (source.acknowledgedCurrent !== false) {
    throw new ContractFailure(`${field}.acknowledgedCurrent`);
  }
  return Object.freeze({
    kind,
    status,
    expectedRevision: integer(source.expectedRevision, `${field}.expectedRevision`, 1),
    acknowledgedCurrent: false as const,
    reasonCode: stableId(source.reasonCode, `${field}.reasonCode`),
    explanation: text(source.explanation, `${field}.explanation`, { max: 1_000 }),
  });
}

export function adaptWorkerActivationV1(value: unknown): WorkerProfileAdaptResult<ActivationSnapshot> {
  try {
    const source = record(value, 'activation');
    if (source.schemaVersion !== 1) throw new ContractFailure('activation.schemaVersion');
    const items = array(source.items, 'activation.items').map(adaptActivationItem);
    if (new Set(items.map((item) => item.itemId)).size !== items.length) {
      throw new ContractFailure('activation.items.duplicate');
    }
    const receivedKinds = new Set(items.map((item) => item.kind));
    if (items.length !== ACTIVATION_KINDS.length || ACTIVATION_KINDS.some((kind) => !receivedKinds.has(kind))) {
      throw new ContractFailure('activation.items.incomplete');
    }
    const acknowledgementPolicies = array(
      source.acknowledgementPolicies,
      'activation.acknowledgementPolicies',
    ).map(adaptActivationPolicy);
    const receivedPolicyKinds = new Set(acknowledgementPolicies.map((policy) => policy.kind));
    if (
      acknowledgementPolicies.length !== ACKNOWLEDGEMENT_KINDS.length
      || ACKNOWLEDGEMENT_KINDS.some((kind) => !receivedPolicyKinds.has(kind))
    ) {
      throw new ContractFailure('activation.acknowledgementPolicies.incomplete');
    }
    const onlinePermission = evidence(source.onlinePermission, 'activation.onlinePermission', (raw, field) => {
      const permission = record(raw, field);
      return Object.freeze({
        allowed: boolean(permission.allowed, `${field}.allowed`),
        reasonCode: stableId(permission.reasonCode, `${field}.reasonCode`),
        explanation: text(permission.explanation, `${field}.explanation`, { max: 2_000 }),
      });
    });
    return Object.freeze({
      ok: true,
      value: Object.freeze({
        schemaVersion: 1,
        workerId: uuid(source.workerId, 'activation.workerId'),
        stateVersion: integer(source.stateVersion, 'activation.stateVersion', 1),
        items: Object.freeze(items),
        acknowledgementPolicies: Object.freeze(acknowledgementPolicies),
        onlinePermission,
        lastUpdatedAt: iso(source.lastUpdatedAt, 'activation.lastUpdatedAt'),
      }),
    });
  } catch (error) {
    return invalid(error);
  }
}

function adaptCatalogueFacts(value: unknown, field: string): CatalogueServiceFacts {
  const source = record(value, field);
  const requiredCredentials = array(source.requiredCredentials, `${field}.requiredCredentials`)
    .map((item, index) => stableId(item, `${field}.requiredCredentials[${index}]`));
  if (new Set(requiredCredentials).size !== requiredCredentials.length) {
    throw new ContractFailure(`${field}.requiredCredentials.duplicate`);
  }
  return Object.freeze({
    serviceId: uuid(source.serviceId, `${field}.serviceId`),
    serviceVersion: integer(source.serviceVersion, `${field}.serviceVersion`, 1),
    canonicalCategory: stableId(source.canonicalCategory, `${field}.canonicalCategory`),
    catalogueLabel: text(source.catalogueLabel, `${field}.catalogueLabel`, { max: 120 }),
    pricingMode: oneOf(source.pricingMode, ['fixed', 'hourly', 'remote_quote', 'diagnostic_visit'] as const, `${field}.pricingMode`),
    riskTier: oneOf(source.riskTier, ['standard', 'credentialed', 'high_risk'] as const, `${field}.riskTier`),
    requiredCredentials: Object.freeze(requiredCredentials),
    fixedCustomerAmount: evidence(source.fixedCustomerAmount, `${field}.fixedCustomerAmount`, money),
    fixedWorkerNet: evidence(source.fixedWorkerNet, `${field}.fixedWorkerNet`, money),
    hourlyRateBounds: evidence(source.hourlyRateBounds, `${field}.hourlyRateBounds`, (raw, valueField) => {
      const bounds = record(raw, valueField);
      const minimum = money(bounds.minimum, `${valueField}.minimum`);
      const maximum = money(bounds.maximum, `${valueField}.maximum`);
      if (minimum.amountMinor > maximum.amountMinor) throw new ContractFailure(valueField);
      return Object.freeze({ minimum, maximum });
    }),
    fixedPayoutRule: nullableText(source.fixedPayoutRule, `${field}.fixedPayoutRule`, 500),
  });
}

function adaptPortfolio(value: unknown, index: number, field: string): PortfolioEvidence {
  const itemField = `${field}[${index}]`;
  const source = record(value, itemField);
  return Object.freeze({
    mediaId: stableId(source.mediaId, `${itemField}.mediaId`),
    imageUri: safeImageUri(source.imageUri, `${itemField}.imageUri`),
    caption: text(source.caption, `${itemField}.caption`, { max: 300 }),
    status: oneOf(source.status, ['published', 'pending_review', 'rejected'] as const, `${itemField}.status`),
    rejectionReason: nullableText(source.rejectionReason, `${itemField}.rejectionReason`, 500),
  });
}

function adaptOffering(value: unknown, index: number): WorkerServiceOffering {
  const field = `servicesProfile.services[${index}]`;
  const source = record(value, field);
  const credentials = array(source.credentialEvidence, `${field}.credentialEvidence`).map((raw, credentialIndex) => {
    const credentialField = `${field}.credentialEvidence[${credentialIndex}]`;
    const credential = record(raw, credentialField);
    return Object.freeze({
      credentialId: stableId(credential.credentialId, `${credentialField}.credentialId`),
      label: text(credential.label, `${credentialField}.label`, { max: 160 }),
      status: oneOf(credential.status, ['verified', 'pending', 'missing', 'failed'] as const, `${credentialField}.status`),
    });
  });
  const hourly = source.hourlyRate === null ? null : money(source.hourlyRate, `${field}.hourlyRate`);
  const callOut = source.callOutAmount === null ? null : money(source.callOutAmount, `${field}.callOutAmount`);
  return Object.freeze({
    offeringId: uuid(source.offeringId, `${field}.offeringId`),
    stateVersion: integer(source.stateVersion, `${field}.stateVersion`, 1),
    facts: adaptCatalogueFacts(source.facts, `${field}.facts`),
    customerFacingTitle: text(source.customerFacingTitle, `${field}.customerFacingTitle`, { max: 120 }),
    description: text(source.description, `${field}.description`, { min: 0, max: 1_500 }),
    hourlyRate: hourly,
    minimumDurationMinutes: nullableInteger(source.minimumDurationMinutes, `${field}.minimumDurationMinutes`, 1),
    callOutAmount: callOut,
    serviceAreaLabel: text(source.serviceAreaLabel, `${field}.serviceAreaLabel`, { min: 0, max: 160 }),
    portfolio: Object.freeze(array(source.portfolio, `${field}.portfolio`).map((item, portfolioIndex) => adaptPortfolio(item, portfolioIndex, `${field}.portfolio`))),
    active: boolean(source.active, `${field}.active`),
    credentialEvidence: Object.freeze(credentials),
    mutation: mutation(source.mutation, `${field}.mutation`),
  });
}

function adaptPublicProfile(value: unknown): PublicProfileSnapshot {
  const field = 'servicesProfile.publicProfile';
  const source = record(value, field);
  const replacement = record(source.photoReplacement, `${field}.photoReplacement`);
  return Object.freeze({
    profileId: uuid(source.profileId, `${field}.profileId`),
    stateVersion: integer(source.stateVersion, `${field}.stateVersion`, 1),
    displayName: text(source.displayName, `${field}.displayName`, { max: 80 }),
    about: text(source.about, `${field}.about`, { min: 0, max: 1_000 }),
    profilePhoto: evidence(source.profilePhoto, `${field}.profilePhoto`, (raw, valueField) => {
      const photo = record(raw, valueField);
      return Object.freeze({ uri: safeImageUri(photo.uri, `${valueField}.uri`) });
    }),
    photoReplacement: Object.freeze({
      state: oneOf(replacement.state, ['idle', 'selecting', 'uploading', 'failed', 'ready'] as const, `${field}.photoReplacement.state`),
      previewUri: replacement.previewUri === null ? null : safeImageUri(replacement.previewUri, `${field}.photoReplacement.previewUri`),
      progressPercent: replacement.progressPercent === null ? null : integer(replacement.progressPercent, `${field}.photoReplacement.progressPercent`),
      message: nullableText(replacement.message, `${field}.photoReplacement.message`, 1_000),
    }),
    publicBadges: Object.freeze(array(source.publicBadges, `${field}.publicBadges`).map((raw, index) => {
      const badgeField = `${field}.publicBadges[${index}]`;
      const badge = record(raw, badgeField);
      return Object.freeze({
        badgeId: stableId(badge.badgeId, `${badgeField}.badgeId`),
        label: text(badge.label, `${badgeField}.label`, { max: 160 }),
        detail: text(badge.detail, `${badgeField}.detail`, { max: 500 }),
        status: oneOf(badge.status, ['verified', 'pending', 'not_verified'] as const, `${badgeField}.status`),
      });
    })),
    serviceAreaLabel: text(source.serviceAreaLabel, `${field}.serviceAreaLabel`, { min: 0, max: 1_000 }),
    privateDetailLabels: Object.freeze(array(source.privateDetailLabels, `${field}.privateDetailLabels`).map((raw, index) => {
      const detailField = `${field}.privateDetailLabels[${index}]`;
      const detail = record(raw, detailField);
      return Object.freeze({
        detailId: stableId(detail.detailId, `${detailField}.detailId`),
        label: text(detail.label, `${detailField}.label`, { max: 160 }),
        statusLabel: text(detail.statusLabel, `${detailField}.statusLabel`, { max: 300 }),
      });
    })),
    mutation: mutation(source.mutation, `${field}.mutation`),
  });
}

export function adaptWorkerServicesProfileV1(value: unknown): WorkerProfileAdaptResult<WorkerProfileBundle> {
  try {
    const source = record(value, 'servicesProfile');
    if (source.schema !== SCHEMA) throw new ContractFailure('servicesProfile.schema');
    const services = array(source.services, 'servicesProfile.services').map(adaptOffering);
    const workerId = uuid(source.workerId, 'servicesProfile.workerId');
    const publicProfile = adaptPublicProfile(source.publicProfile);
    if (publicProfile.profileId !== workerId || services.some((service) => !service.offeringId)) {
      throw new ContractFailure('servicesProfile.identity');
    }
    const capabilitiesSource = record(source.capabilities, 'servicesProfile.capabilities');
    return Object.freeze({
      ok: true,
      value: Object.freeze({
        snapshot: Object.freeze({
          workerId,
          stateVersion: integer(source.stateVersion, 'servicesProfile.stateVersion', 1),
          services: Object.freeze(services),
          publicProfile,
          lastUpdatedAt: iso(source.lastUpdatedAt, 'servicesProfile.lastUpdatedAt'),
        }),
        capabilities: Object.freeze({
          portfolioUpload: unavailable(capabilitiesSource.portfolioUpload, 'servicesProfile.capabilities.portfolioUpload'),
          credentialSubmission: unavailable(capabilitiesSource.credentialSubmission, 'servicesProfile.capabilities.credentialSubmission'),
          payoutAccount: unavailable(capabilitiesSource.payoutAccount, 'servicesProfile.capabilities.payoutAccount'),
        }),
      }),
    });
  } catch (error) {
    return invalid(error);
  }
}

function activationEntry(
  item: ActivationChecklistItem | undefined,
  fallback: Readonly<Pick<WorkerAccountEntry, 'entryId' | 'kind' | 'label' | 'visibility' | 'destinationKey'>>,
): WorkerAccountEntry {
  if (!item) {
    return Object.freeze({
      ...fallback,
      detail: 'Canonical readiness evidence is unavailable.',
      status: 'unavailable',
      capabilityReason: 'Refresh the worker activation record before making changes.',
    });
  }
  return Object.freeze({
    ...fallback,
    detail: item.evidenceLabel ?? item.remedy ?? 'No further detail is available.',
    status: item.status === 'complete' || item.status === 'not_required'
      ? 'ready'
      : item.status === 'pending_review' ? 'pending' : 'action_required',
    capabilityReason: null,
  });
}

function combinedActivationEntry(
  items: readonly (ActivationChecklistItem | undefined)[],
  fallback: Readonly<Pick<WorkerAccountEntry, 'entryId' | 'kind' | 'label' | 'visibility' | 'destinationKey'>>,
): WorkerAccountEntry {
  if (items.some((item) => item === undefined)) return activationEntry(undefined, fallback);
  const evidence = items as readonly ActivationChecklistItem[];
  const status = evidence.some((item) => item.status === 'failed' || item.status === 'incomplete')
    ? 'action_required'
    : evidence.some((item) => item.status === 'pending_review')
      ? 'pending'
      : 'ready';
  return Object.freeze({
    ...fallback,
    detail: evidence.map((item) => item.evidenceLabel ?? item.remedy ?? item.title).join(' '),
    status,
    capabilityReason: null,
  });
}

export function accountReadinessFromWorkerProfileV1(
  bundle: WorkerProfileBundle,
  activation: ActivationSnapshot,
): WorkerProfileAdaptResult<WorkerAccountReadinessSnapshot> {
  try {
    if (bundle.snapshot.workerId !== activation.workerId) throw new ContractFailure('account.workerId');
    const byKind = new Map(activation.items.map((item) => [item.kind, item]));
    const publicProfile = bundle.snapshot.publicProfile;
    const profilePhoto = publicProfile.profilePhoto.status === 'supported' ? publicProfile.profilePhoto.value.uri : null;
    const entry = (kind: ActivationChecklistItem['kind']) => byKind.get(kind);
    const entries: WorkerAccountEntry[] = [
      combinedActivationEntry([entry('profile_photo'), entry('about_experience')], {
        entryId: 'public-profile', kind: 'public_profile', label: 'Public profile', visibility: 'public', destinationKey: 'WorkerServicesProfile',
      }),
      (() => {
        const identityEntry = activationEntry(entry('identity_assurance'), {
          entryId: 'verification-credentials', kind: 'verification_credentials', label: 'Verification and credentials', visibility: 'public', destinationKey: 'KYC',
        });
        const missingCredentialCount = bundle.snapshot.services.reduce((count, service) => (
          count + service.credentialEvidence.filter((credential) => credential.status !== 'verified').length
        ), 0);
        return missingCredentialCount === 0 ? identityEntry : Object.freeze({
          ...identityEntry,
          detail: `${identityEntry.detail} ${missingCredentialCount} required credential evidence item(s) are not verified.`,
          status: 'action_required' as const,
          destinationKey: 'WorkerServicesProfile',
          capabilityReason: null,
        });
      })(),
      combinedActivationEntry([entry('eligible_service'), entry('pricing_acceptance')], {
        entryId: 'services-rates', kind: 'services_rates', label: 'Services and rates', visibility: 'public', destinationKey: 'WorkerServicesProfile',
      }),
      Object.freeze({
        entryId: 'service-area-availability', kind: 'service_area_availability', label: 'Service area and availability',
        detail: `${entry('service_area')?.evidenceLabel ?? entry('service_area')?.remedy ?? 'Service-area evidence is unavailable.'} A canonical availability-schedule editor is not available.`,
        status: 'unavailable', visibility: 'public', destinationKey: null,
        capabilityReason: 'worker_availability_schedule_unavailable',
      }),
      Object.freeze({
        entryId: 'payout-method', kind: 'payout_method', label: 'Payout method',
        detail: bundle.capabilities.payoutAccount.explanation, status: 'unavailable', visibility: 'private',
        destinationKey: null, capabilityReason: bundle.capabilities.payoutAccount.reasonCode,
      }),
      Object.freeze({
        entryId: 'notifications-quiet-hours', kind: 'notifications_quiet_hours', label: 'Notifications and quiet hours',
        detail: 'No canonical notification preference endpoint is available. The read-only screen shows the delivery truth.', status: 'unavailable', visibility: 'private',
        destinationKey: 'NotificationControls', capabilityReason: 'notification_preferences_unavailable',
      }),
      Object.freeze({
        entryId: 'trust-fairness', kind: 'trust_fairness', label: 'Trust and fairness',
        detail: 'Inspect ratings and reliability evidence separately, including source and sample size.', status: 'ready', visibility: 'private',
        destinationKey: 'TrustFairness', capabilityReason: null,
      }),
      Object.freeze({
        entryId: 'language', kind: 'language', label: 'Language',
        detail: 'This build displays en-ZA; a saved language preference is not available.', status: 'unavailable', visibility: 'private',
        destinationKey: null, capabilityReason: 'language_preference_unavailable',
      }),
      activationEntry(entry('safety_emergency'), {
        entryId: 'emergency-safety', kind: 'emergency_safety', label: 'Emergency and safety', visibility: 'private', destinationKey: 'SafetyCentre',
      }),
      Object.freeze({
        entryId: 'privacy', kind: 'privacy', label: 'Privacy controls',
        detail: 'No canonical worker privacy preference snapshot is available. Support can record data access or deletion requests.', status: 'unavailable', visibility: 'private',
        destinationKey: 'SafetyCentre', capabilityReason: 'privacy_preferences_unavailable',
      }),
      Object.freeze({
        entryId: 'account-deletion', kind: 'account_deletion', label: 'Account deletion',
        detail: 'Account deletion requires support until an audited self-service flow is available.', status: 'unavailable', visibility: 'private',
        destinationKey: 'SafetyCentre', capabilityReason: 'account_deletion_self_service_unavailable',
      }),
    ];
    return Object.freeze({
      ok: true,
      value: Object.freeze({
        workerId: activation.workerId,
        stateVersion: Math.max(activation.stateVersion, bundle.snapshot.stateVersion),
        publicProfilePreviewUri: profilePhoto,
        entries: Object.freeze(entries),
        lastUpdatedAt: activation.lastUpdatedAt,
      }),
    });
  } catch (error) {
    return invalid(error);
  }
}
