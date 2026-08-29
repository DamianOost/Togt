import type {
  Evidence,
  EvidenceSource,
  PaymentState,
  ResourceState,
  ZarAmount,
} from '../shell/model';

export const WORKER_LIFECYCLE_SCHEMA_VERSION = 1 as const;

export type ConnectionState = 'online' | 'offline';
export type LifecycleEvidence<T, Source extends EvidenceSource = 'server'> = Evidence<T, Source>;
export type LifecycleResourceState<T> = ResourceState<T>;
export type LifecycleMoney = ZarAmount;

export function hasServerEvidence<T>(evidence: Evidence<T>): evidence is Extract<Evidence<T>, { status: 'supported' }> {
  return evidence.status === 'supported' && evidence.source === 'server';
}

export function hasLedgerEvidence<T>(evidence: Evidence<T, 'server_ledger'>): evidence is Extract<Evidence<T, 'server_ledger'>, { status: 'supported' }> {
  return evidence.status === 'supported' && evidence.source === 'server_ledger';
}

export function isValidLifecycleMoney(value: ZarAmount): boolean {
  return value.currency === 'ZAR'
    && Number.isSafeInteger(value.amountMinor)
    && value.amountMinor >= 0;
}

export function isStableLifecycleId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
}

export function isSafeLifecycleImageUri(value: string | null): value is string {
  if (value === null || value.length > 2_048) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' || parsed.protocol === 'file:';
  } catch {
    return false;
  }
}

export type ActivationItemStatus = 'complete' | 'incomplete' | 'failed' | 'pending_review' | 'not_required';
export type ProfileFieldVisibility = 'public' | 'private';

export interface ActivationChecklistItem {
  readonly itemId: string;
  readonly kind:
    | 'account_contact'
    | 'identity_assurance'
    | 'profile_photo'
    | 'about_experience'
    | 'eligible_service'
    | 'pricing_acceptance'
    | 'service_area'
    | 'payout_method'
    | 'foreground_location'
    | 'safety_emergency'
    | 'first_job_readiness';
  readonly title: string;
  readonly status: ActivationItemStatus;
  readonly required: boolean;
  readonly visibility: ProfileFieldVisibility;
  readonly evidenceLabel: string | null;
  readonly remedy: string | null;
  readonly destinationKey: string;
}

export type ActivationAcknowledgementKind =
  | 'foreground_location'
  | 'safety_policy'
  | 'first_job_readiness';

export type ActivationAcknowledgementPolicy =
  | Readonly<{
      kind: ActivationAcknowledgementKind;
      status: 'available';
      expectedRevision: number;
      acknowledgedCurrent: boolean;
      policyVersion: string;
      title: string;
      body: string;
      acknowledgementLabel: string;
    }>
  | Readonly<{
      kind: ActivationAcknowledgementKind;
      status: 'unavailable';
      expectedRevision: number;
      acknowledgedCurrent: false;
      reasonCode: string;
      explanation: string;
    }>;

const IMPLEMENTED_ACTIVATION_CONTENT_CONTRACTS: Readonly<Partial<Record<
  ActivationChecklistItem['kind'],
  ActivationChecklistItem['destinationKey']
>>> = Object.freeze({
  identity_assurance: 'KYC',
  about_experience: 'WorkerServicesProfile',
  eligible_service: 'WorkerServicesProfile',
  pricing_acceptance: 'WorkerServicesProfile',
  service_area: 'WorkerServicesProfile',
});

export function hasImplementedActivationContentContract(
  item: Pick<ActivationChecklistItem, 'kind' | 'destinationKey'>,
): boolean {
  return IMPLEMENTED_ACTIVATION_CONTENT_CONTRACTS[item.kind] === item.destinationKey;
}

export interface ActivationSnapshot {
  readonly schemaVersion: typeof WORKER_LIFECYCLE_SCHEMA_VERSION;
  readonly workerId: string;
  readonly stateVersion: number;
  readonly items: readonly ActivationChecklistItem[];
  readonly acknowledgementPolicies: readonly ActivationAcknowledgementPolicy[];
  readonly onlinePermission: LifecycleEvidence<Readonly<{
    allowed: boolean;
    reasonCode: string;
    explanation: string;
  }>>;
  readonly lastUpdatedAt: string;
}

export interface ActivationPresentation {
  readonly completeCount: number;
  readonly requiredCount: number;
  readonly remainingCount: number;
  readonly canRequestOnline: boolean;
  readonly invalidItemIds: readonly string[];
  readonly blockerExplanation: string;
}

export function deriveActivationPresentation(
  snapshot: ActivationSnapshot,
  connectionState: ConnectionState,
): ActivationPresentation {
  const seen = new Set<string>();
  const invalidItemIds: string[] = [];
  let requiredCount = 0;
  let completeCount = 0;
  for (const item of snapshot.items) {
    if (!isStableLifecycleId(item.itemId) || seen.has(item.itemId)) invalidItemIds.push(item.itemId);
    seen.add(item.itemId);
    if (!item.required || item.status === 'not_required') continue;
    requiredCount += 1;
    if (item.status === 'complete') completeCount += 1;
    if ((item.status === 'incomplete' || item.status === 'failed') && !item.remedy?.trim()) invalidItemIds.push(item.itemId);
    if (!item.destinationKey.trim()) invalidItemIds.push(item.itemId);
  }
  const remainingCount = requiredCount - completeCount;
  const serverAllowed = hasServerEvidence(snapshot.onlinePermission)
    && snapshot.onlinePermission.value.allowed;
  const canRequestOnline = connectionState === 'online'
    && invalidItemIds.length === 0
    && remainingCount === 0
    && serverAllowed;
  const blockerExplanation = connectionState === 'offline'
    ? 'Reconnect before asking the server to change availability.'
    : hasServerEvidence(snapshot.onlinePermission)
      ? snapshot.onlinePermission.value.explanation
      : snapshot.onlinePermission.explanation;
  return Object.freeze({
    completeCount,
    requiredCount,
    remainingCount,
    canRequestOnline,
    invalidItemIds: Object.freeze([...new Set(invalidItemIds)]),
    blockerExplanation,
  });
}

export type ServicePricingMode = 'fixed' | 'hourly' | 'remote_quote' | 'diagnostic_visit';
export type ServiceRiskTier = 'standard' | 'credentialed' | 'high_risk';

export interface CatalogueServiceFacts {
  readonly serviceId: string;
  readonly serviceVersion: number;
  readonly canonicalCategory: string;
  readonly catalogueLabel: string;
  readonly pricingMode: ServicePricingMode;
  readonly riskTier: ServiceRiskTier;
  readonly requiredCredentials: readonly string[];
  readonly fixedCustomerAmount: LifecycleEvidence<ZarAmount>;
  readonly fixedWorkerNet: LifecycleEvidence<ZarAmount>;
  readonly hourlyRateBounds: LifecycleEvidence<Readonly<{ minimum: ZarAmount; maximum: ZarAmount }>>;
  readonly fixedPayoutRule: string | null;
}

export interface PortfolioEvidence {
  readonly mediaId: string;
  readonly imageUri: string;
  readonly caption: string;
  readonly status: 'published' | 'pending_review' | 'rejected';
  readonly rejectionReason: string | null;
}

export interface WorkerServiceOffering {
  readonly offeringId: string;
  readonly stateVersion: number;
  readonly facts: CatalogueServiceFacts;
  readonly customerFacingTitle: string;
  readonly description: string;
  readonly hourlyRate: ZarAmount | null;
  readonly minimumDurationMinutes: number | null;
  readonly callOutAmount: ZarAmount | null;
  readonly serviceAreaLabel: string;
  readonly portfolio: readonly PortfolioEvidence[];
  readonly active: boolean;
  readonly credentialEvidence: readonly Readonly<{ credentialId: string; label: string; status: 'verified' | 'pending' | 'missing' | 'failed' }>[];
  readonly mutation: MutationFeedback;
}

export interface ServiceEditorDraft {
  readonly offeringId: string;
  readonly title: string;
  readonly description: string;
  readonly hourlyRateMinor: number | null;
  readonly minimumDurationMinutes: number | null;
  readonly callOutAmountMinor: number | null;
  readonly serviceAreaLabel: string;
}

export interface ServiceEditorFormValues {
  readonly offeringId: string;
  readonly title: string;
  readonly description: string;
  readonly hourlyRateRand: string;
  readonly minimumDurationMinutes: string;
  readonly callOutAmountRand: string;
  readonly serviceAreaLabel: string;
}

export interface MutationFeedback {
  readonly state: 'idle' | 'saving' | 'confirmed' | 'failed_rolled_back';
  readonly message: string | null;
  readonly confirmedAt: string | null;
}

export interface PublicProfileSnapshot {
  readonly profileId: string;
  readonly stateVersion: number;
  readonly displayName: string;
  readonly about: string;
  readonly profilePhoto: LifecycleEvidence<Readonly<{ uri: string }>>;
  readonly photoReplacement: Readonly<{
    state: 'idle' | 'selecting' | 'uploading' | 'failed' | 'ready';
    previewUri: string | null;
    progressPercent: number | null;
    message: string | null;
  }>;
  readonly publicBadges: readonly Readonly<{ badgeId: string; label: string; detail: string; status: 'verified' | 'pending' | 'not_verified' }>[];
  readonly serviceAreaLabel: string;
  readonly privateDetailLabels: readonly Readonly<{ detailId: string; label: string; statusLabel: string }>[];
  readonly mutation: MutationFeedback;
}

export interface ProfileEditorDraft {
  readonly profileId: string;
  readonly displayName: string;
  readonly about: string;
}

export interface ServicesProfileSnapshot {
  readonly workerId: string;
  readonly stateVersion: number;
  readonly services: readonly WorkerServiceOffering[];
  readonly publicProfile: PublicProfileSnapshot;
  readonly lastUpdatedAt: string;
}

export interface DraftIssue {
  readonly field: string;
  readonly code: 'required' | 'invalid' | 'outside_catalogue_bounds' | 'catalogue_evidence_unavailable';
  readonly message: string;
}

export interface DraftValidation {
  readonly valid: boolean;
  readonly issues: readonly DraftIssue[];
}

export function validateServiceDraft(
  service: WorkerServiceOffering,
  draft: ServiceEditorDraft,
): DraftValidation {
  const issues: DraftIssue[] = [];
  if (draft.offeringId !== service.offeringId) {
    issues.push({ field: 'offeringId', code: 'invalid', message: 'The draft does not match this service.' });
  }
  const titleLength = draft.title.trim().length;
  const descriptionLength = draft.description.trim().length;
  const areaLength = draft.serviceAreaLabel.trim().length;
  if (titleLength < 2) issues.push({ field: 'title', code: 'required', message: 'Add a customer-facing title of at least 2 characters.' });
  else if (titleLength > 120) issues.push({ field: 'title', code: 'invalid', message: 'Customer-facing title must be 120 characters or fewer.' });
  if (descriptionLength < 20) issues.push({ field: 'description', code: 'required', message: 'Explain the service in at least 20 characters.' });
  else if (descriptionLength > 1_500) issues.push({ field: 'description', code: 'invalid', message: 'Service description must be 1,500 characters or fewer.' });
  if (areaLength < 2) issues.push({ field: 'serviceAreaLabel', code: 'required', message: 'Choose a service area.' });
  else if (areaLength > 160) issues.push({ field: 'serviceAreaLabel', code: 'invalid', message: 'Service area must be 160 characters or fewer.' });
  if (draft.minimumDurationMinutes !== null && (!Number.isSafeInteger(draft.minimumDurationMinutes) || draft.minimumDurationMinutes <= 0)) {
    issues.push({ field: 'minimumDurationMinutes', code: 'invalid', message: 'Minimum duration must be a positive whole number of minutes.' });
  }
  if (draft.callOutAmountMinor !== null && (!Number.isSafeInteger(draft.callOutAmountMinor) || draft.callOutAmountMinor < 0)) {
    issues.push({ field: 'callOutAmountMinor', code: 'invalid', message: 'Call-out amount cannot be negative.' });
  }
  if (service.facts.pricingMode === 'hourly') {
    if (draft.hourlyRateMinor === null || !Number.isSafeInteger(draft.hourlyRateMinor) || draft.hourlyRateMinor < 0) {
      issues.push({ field: 'hourlyRateMinor', code: 'invalid', message: 'Enter a valid non-negative hourly rate.' });
    } else if (!hasServerEvidence(service.facts.hourlyRateBounds)) {
      issues.push({ field: 'hourlyRateMinor', code: 'catalogue_evidence_unavailable', message: 'Rate bounds are unavailable. Refresh before saving.' });
    } else {
      const bounds = service.facts.hourlyRateBounds.value;
      if (!isValidLifecycleMoney(bounds.minimum) || !isValidLifecycleMoney(bounds.maximum)) {
        issues.push({ field: 'hourlyRateMinor', code: 'catalogue_evidence_unavailable', message: 'Rate bounds are invalid. Refresh before saving.' });
      } else if (draft.hourlyRateMinor < bounds.minimum.amountMinor || draft.hourlyRateMinor > bounds.maximum.amountMinor) {
        issues.push({ field: 'hourlyRateMinor', code: 'outside_catalogue_bounds', message: 'Use a rate within the catalogue limits shown.' });
      }
    }
  } else if (draft.hourlyRateMinor !== null) {
    issues.push({ field: 'hourlyRateMinor', code: 'invalid', message: 'Hourly rate is not editable for this pricing mode.' });
  }
  return Object.freeze({ valid: issues.length === 0, issues: Object.freeze(issues) });
}

function parseRandMinor(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d+(?:[.,]\d{0,2})?$/.test(normalized)) return null;
  const amount = Number(normalized.replace(',', '.'));
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : null;
}

function parseWholeMinutes(value: string): number | null {
  const normalized = value.trim();
  return /^\d+$/.test(normalized) ? Number(normalized) : null;
}

export function normaliseServiceEditorForm(
  service: WorkerServiceOffering,
  form: ServiceEditorFormValues,
): Readonly<{ draft: ServiceEditorDraft; validation: DraftValidation }> {
  const hourlyRateMinor = form.hourlyRateRand.trim() ? parseRandMinor(form.hourlyRateRand) : null;
  const minimumDurationMinutes = form.minimumDurationMinutes.trim() ? parseWholeMinutes(form.minimumDurationMinutes) : null;
  const callOutAmountMinor = form.callOutAmountRand.trim() ? parseRandMinor(form.callOutAmountRand) : null;
  const draft: ServiceEditorDraft = Object.freeze({
    offeringId: form.offeringId,
    title: form.title,
    description: form.description,
    hourlyRateMinor,
    minimumDurationMinutes,
    callOutAmountMinor,
    serviceAreaLabel: form.serviceAreaLabel,
  });
  const base = validateServiceDraft(service, draft);
  const issues = [...base.issues];
  if (form.hourlyRateRand.trim() && hourlyRateMinor === null) {
    issues.push({ field: 'hourlyRateMinor', code: 'invalid', message: 'Use a valid rand amount with no more than two decimal places.' });
  }
  if (form.minimumDurationMinutes.trim() && minimumDurationMinutes === null) {
    issues.push({ field: 'minimumDurationMinutes', code: 'invalid', message: 'Use a positive whole number of minutes.' });
  }
  if (form.callOutAmountRand.trim() && callOutAmountMinor === null) {
    issues.push({ field: 'callOutAmountMinor', code: 'invalid', message: 'Use a valid non-negative rand amount.' });
  }
  return Object.freeze({
    draft,
    validation: Object.freeze({ valid: issues.length === 0, issues: Object.freeze(issues) }),
  });
}

export function validateProfileDraft(profile: PublicProfileSnapshot, draft: ProfileEditorDraft): DraftValidation {
  const issues: DraftIssue[] = [];
  if (profile.profileId !== draft.profileId) issues.push({ field: 'profileId', code: 'invalid', message: 'The draft does not match this profile.' });
  const displayNameLength = draft.displayName.trim().length;
  const aboutLength = draft.about.trim().length;
  if (displayNameLength < 2) issues.push({ field: 'displayName', code: 'required', message: 'Public name must contain at least 2 characters.' });
  if (aboutLength < 20) issues.push({ field: 'about', code: 'required', message: 'Add at least 20 characters about your experience and approach.' });
  if (displayNameLength > 80) issues.push({ field: 'displayName', code: 'invalid', message: 'Public name must be 80 characters or fewer.' });
  if (aboutLength > 1_000) issues.push({ field: 'about', code: 'invalid', message: 'About text must be 1,000 characters or fewer.' });
  return Object.freeze({ valid: issues.length === 0, issues: Object.freeze(issues) });
}

export type WorkerOperationalPhase =
  | 'accepted'
  | 'scheduled'
  | 'en_route'
  | 'arrived'
  | 'scope_confirmation'
  | 'work_active'
  | 'completion_review'
  | 'payment_pending'
  | 'closed'
  | 'cancelled'
  | 'unknown';

export interface WorkerTimelineEvent {
  readonly eventId: string;
  readonly label: string;
  readonly detail: string | null;
  readonly occurredAt: string | null;
  readonly state: 'complete' | 'current' | 'future' | 'issue';
}

export interface WorkerTrackingState {
  readonly status: 'hidden' | 'not_started' | 'sharing' | 'stale' | 'failed' | 'stopped';
  readonly explanation: string;
  readonly capturedAt: string | null;
  readonly failureReason: string | null;
}

export interface WorkerPrivacySnapshot {
  readonly broadArea: LifecycleEvidence<string>;
  readonly exactAddress: LifecycleEvidence<string>;
  readonly exactRevealAuthorised: boolean;
  readonly contact: LifecycleEvidence<string>;
  readonly contactRevealAuthorised: boolean;
}

export interface WorkerPrivacyPresentation {
  readonly areaLabel: string | null;
  readonly exactAddressLabel: string | null;
  readonly contactLabel: string | null;
  readonly addressStatus: 'broad_only' | 'exact_revealed' | 'unavailable' | 'closed';
  readonly contactStatus: 'masked' | 'revealed' | 'unavailable' | 'closed';
}

export function deriveWorkerPrivacyPresentation(
  privacy: WorkerPrivacySnapshot,
  phase: WorkerOperationalPhase,
): WorkerPrivacyPresentation {
  if (phase === 'closed' || phase === 'cancelled') {
    return Object.freeze({ areaLabel: null, exactAddressLabel: null, contactLabel: null, addressStatus: 'closed', contactStatus: 'closed' });
  }
  const areaLabel = hasServerEvidence(privacy.broadArea) ? privacy.broadArea.value : null;
  if (phase === 'unknown') {
    return Object.freeze({
      areaLabel,
      exactAddressLabel: null,
      contactLabel: null,
      addressStatus: areaLabel ? 'broad_only' : 'unavailable',
      contactStatus: 'masked',
    });
  }
  const exactAddressLabel = privacy.exactRevealAuthorised && hasServerEvidence(privacy.exactAddress)
    ? privacy.exactAddress.value
    : null;
  const contactLabel = privacy.contactRevealAuthorised && hasServerEvidence(privacy.contact)
    ? privacy.contact.value
    : null;
  return Object.freeze({
    areaLabel,
    exactAddressLabel,
    contactLabel,
    addressStatus: exactAddressLabel ? 'exact_revealed' : areaLabel ? 'broad_only' : 'unavailable',
    contactStatus: contactLabel ? 'revealed' : privacy.contactRevealAuthorised ? 'unavailable' : 'masked',
  });
}

export interface WorkerCustomerEvidence {
  readonly evidenceId: string;
  readonly label: string;
  readonly detail: string;
  readonly status: 'verified' | 'context' | 'unavailable';
}

export interface WorkerJobCommercial {
  readonly gross: ZarAmount;
  readonly platformFee: ZarAmount;
  readonly expectedNet: ZarAmount;
  readonly ledgerDefinition: string;
  readonly paymentState: PaymentState;
}

export interface WorkerJobDetailSnapshot {
  readonly schemaVersion: typeof WORKER_LIFECYCLE_SCHEMA_VERSION;
  readonly projectId: string;
  readonly stateVersion: number;
  readonly serviceLabel: LifecycleEvidence<string>;
  readonly phase: LifecycleEvidence<WorkerOperationalPhase>;
  readonly phaseLabel: string;
  readonly phaseUpdatedAt: string;
  readonly scheduleLabel: LifecycleEvidence<string>;
  readonly customerDisplayName: LifecycleEvidence<string>;
  readonly customerEvidence: readonly WorkerCustomerEvidence[];
  readonly privacy: WorkerPrivacySnapshot;
  readonly tracking: WorkerTrackingState;
  readonly timeline: readonly WorkerTimelineEvent[];
  readonly scopeSummary: LifecycleEvidence<string>;
  readonly commercial: LifecycleEvidence<WorkerJobCommercial, 'server_ledger'>;
  readonly commandPermissions: readonly Readonly<{
    command: 'start_route' | 'mark_arrived';
    allowed: boolean;
    reason: string;
  }>[];
  readonly canChat: boolean;
  readonly canOpenSafetyHelp: true;
  readonly openIssue: Readonly<{ issueId: string; label: string }> | null;
  readonly lastUpdatedAt: string;
}

export type WorkerJobRouteTarget = 'scope' | 'active_work' | 'completion' | 'earnings' | 'receipt';

export type WorkerDominantAction =
  | Readonly<{ kind: 'command'; command: 'start_route' | 'mark_arrived'; label: string; enabled: boolean; reason: string }>
  | Readonly<{ kind: 'route'; target: WorkerJobRouteTarget; label: string; enabled: true; reason: string }>
  | Readonly<{ kind: 'none'; label: string; enabled: false; reason: string }>;

function permissionFor(snapshot: WorkerJobDetailSnapshot, command: 'start_route' | 'mark_arrived'): Readonly<{ allowed: boolean; reason: string }> | null {
  const matches = snapshot.commandPermissions.filter((permission) => permission.command === command);
  return matches.length === 1 ? matches[0] ?? null : null;
}

export function deriveWorkerDominantAction(
  snapshot: WorkerJobDetailSnapshot,
  connectionState: ConnectionState,
): WorkerDominantAction {
  if (!hasServerEvidence(snapshot.phase) || snapshot.phase.value === 'unknown') {
    return Object.freeze({ kind: 'none', label: 'State unavailable', enabled: false, reason: 'Refresh before taking a lifecycle action.' });
  }
  const phase = snapshot.phase.value;
  if (phase === 'accepted' || phase === 'scheduled') {
    const permission = permissionFor(snapshot, 'start_route');
    return Object.freeze({
      kind: 'command',
      command: 'start_route',
      label: 'Start route',
      enabled: connectionState === 'online' && permission?.allowed === true,
      reason: connectionState === 'offline' ? 'Reconnect before starting the route.' : permission?.reason ?? 'Route permission unavailable.',
    });
  }
  if (phase === 'en_route') {
    const permission = permissionFor(snapshot, 'mark_arrived');
    return Object.freeze({
      kind: 'command',
      command: 'mark_arrived',
      label: 'I’ve arrived',
      enabled: connectionState === 'online' && permission?.allowed === true,
      reason: connectionState === 'offline' ? 'Reconnect before recording arrival.' : permission?.reason ?? 'Arrival permission unavailable.',
    });
  }
  const routes: Partial<Record<WorkerOperationalPhase, Readonly<{ target: WorkerJobRouteTarget; label: string }>>> = {
    arrived: { target: 'scope', label: 'Review scope' },
    scope_confirmation: { target: 'scope', label: 'Confirm scope and enter PIN' },
    work_active: { target: 'active_work', label: 'View active work' },
    completion_review: { target: 'completion', label: 'View completion review' },
    payment_pending: { target: 'earnings', label: 'View payment status' },
    closed: { target: 'receipt', label: 'View receipt and earnings' },
  };
  const route = routes[phase];
  if (route) return Object.freeze({ kind: 'route', target: route.target, label: route.label, enabled: true, reason: 'Opens the authoritative detail.' });
  return Object.freeze({ kind: 'none', label: phase === 'cancelled' ? 'Job cancelled' : 'No action available', enabled: false, reason: 'No lifecycle action is available.' });
}

export interface WorkerScopeChecklistItem {
  readonly itemId: string;
  readonly label: string;
  readonly status: 'unconfirmed' | 'worker_confirmed' | 'customer_confirmed';
}

export interface WorkerScopeSnapshot {
  readonly projectId: string;
  readonly stateVersion: number;
  readonly scopeId: string;
  readonly scopeVersion: number;
  readonly acceptedBriefVersion: number;
  readonly status: 'pending_worker' | 'worker_confirmed' | 'revision_requested' | 'pending_customer' | 'confirmed' | 'revision_declined' | 'cancelled' | 'unknown';
  readonly included: readonly string[];
  readonly excluded: readonly string[];
  readonly checklist: readonly WorkerScopeChecklistItem[];
  readonly materialsResponsibility: string;
  readonly timeAndRateLabel: string;
  readonly totalOrCap: LifecycleEvidence<ZarAmount>;
  readonly workerConfirmedAt: string | null;
  readonly customerConfirmedAt: string | null;
  readonly clarification: string | null;
  readonly pinPolicy: LifecycleEvidence<Readonly<{
    actor: 'worker';
    status: 'entry_allowed' | 'waiting_for_customer' | 'rate_limited' | 'verified' | 'locked';
    attemptsRemaining: number | null;
    retryAfter: string | null;
  }>>;
  readonly startOutcome: Readonly<{
    status: 'not_attempted' | 'pending' | 'started' | 'failed';
    actorAt: string | null;
    deviceAt: string | null;
    serverAt: string | null;
    message: string | null;
  }>;
}

export interface PinEntryPresentation {
  readonly canEnter: boolean;
  readonly canSubmit: boolean;
  readonly statusLabel: string;
  readonly attemptsRemaining: number | null;
  readonly retryAfter: string | null;
  readonly serverConfirmedStarted: boolean;
}

export function derivePinEntryPresentation(
  snapshot: WorkerScopeSnapshot,
  enteredPin: string,
  connectionState: ConnectionState,
): PinEntryPresentation {
  const bilateral = snapshot.status === 'confirmed'
    && snapshot.workerConfirmedAt !== null
    && snapshot.customerConfirmedAt !== null;
  const policy = hasServerEvidence(snapshot.pinPolicy) ? snapshot.pinPolicy.value : null;
  const canEnter = connectionState === 'online'
    && bilateral
    && policy?.actor === 'worker'
    && policy.status === 'entry_allowed';
  const validPin = /^\d{4,8}$/.test(enteredPin);
  const serverConfirmedStarted = snapshot.startOutcome.status === 'started'
    && snapshot.startOutcome.actorAt !== null
    && snapshot.startOutcome.deviceAt !== null
    && snapshot.startOutcome.serverAt !== null;
  return Object.freeze({
    canEnter,
    canSubmit: canEnter && validPin && !serverConfirmedStarted,
    statusLabel: serverConfirmedStarted
      ? 'Job start confirmed by the server'
      : policy?.status === 'rate_limited'
        ? 'PIN entry is temporarily rate-limited'
        : policy?.status === 'waiting_for_customer'
          ? 'Waiting for the customer to share the PIN'
          : policy?.status === 'locked'
            ? 'PIN entry is locked'
            : canEnter
              ? 'Enter the customer’s start PIN'
              : bilateral
                ? 'PIN permission unavailable'
                : 'Both parties must confirm the same scope first',
    attemptsRemaining: policy?.attemptsRemaining ?? null,
    retryAfter: policy?.retryAfter ?? null,
    serverConfirmedStarted,
  });
}

export type ChangeOrderStatus = 'draft' | 'pending' | 'approved' | 'declined' | 'expired';

export interface WorkerChangeOrder {
  readonly changeOrderId: string;
  readonly version: number;
  readonly status: ChangeOrderStatus;
  readonly description: string;
  readonly addedTimeMinutes: number | null;
  readonly materialsDescription: string | null;
  readonly baseTotal: ZarAmount;
  readonly additionalAmount: ZarAmount;
  readonly revisedTotal: ZarAmount;
  readonly additionalExpectedNet: LifecycleEvidence<ZarAmount, 'server_ledger'>;
  readonly expiresAt: string | null;
}

export interface ChangeOrderDraft {
  readonly description: string;
  readonly addedTimeMinutes: number | null;
  readonly materialsDescription: string;
  readonly additionalAmountMinor: number | null;
  readonly preview: LifecycleEvidence<Readonly<{
    previewVersion: number;
    baseTotal: ZarAmount;
    additionalAmount: ZarAmount;
    platformFee: ZarAmount;
    additionalExpectedNet: ZarAmount;
    revisedTotal: ZarAmount;
  }>, 'server_ledger'>;
}

export interface ChangeOrderFormValues {
  readonly description: string;
  readonly addedTimeMinutes: string;
  readonly materialsDescription: string;
  readonly additionalAmountRand: string;
  readonly preview: ChangeOrderDraft['preview'];
}

export interface WorkerActiveWorkSnapshot {
  readonly projectId: string;
  readonly stateVersion: number;
  readonly scopeId: string;
  readonly scopeVersion: number;
  readonly scopeSummary: string;
  readonly elapsedLabel: LifecycleEvidence<string>;
  readonly currentApprovedTotal: LifecycleEvidence<ZarAmount>;
  readonly customerApprovalCap: LifecycleEvidence<ZarAmount>;
  readonly currentExpectedNet: LifecycleEvidence<ZarAmount, 'server_ledger'>;
  readonly changeOrders: readonly WorkerChangeOrder[];
  readonly canRequestChange: boolean;
  readonly canRequestCompletion: boolean;
}

export function validateChangeOrderDraft(
  snapshot: WorkerActiveWorkSnapshot,
  draft: ChangeOrderDraft,
): DraftValidation {
  const issues: DraftIssue[] = [];
  if (!draft.description.trim()) issues.push({ field: 'description', code: 'required', message: 'Describe the additional work.' });
  if (draft.addedTimeMinutes !== null && (!Number.isSafeInteger(draft.addedTimeMinutes) || draft.addedTimeMinutes < 0)) {
    issues.push({ field: 'addedTimeMinutes', code: 'invalid', message: 'Added time cannot be negative.' });
  }
  if (draft.additionalAmountMinor === null || !Number.isSafeInteger(draft.additionalAmountMinor) || draft.additionalAmountMinor < 0) {
    issues.push({ field: 'additionalAmountMinor', code: 'invalid', message: 'Enter a valid non-negative additional amount.' });
  }
  if (!hasLedgerEvidence(draft.preview)) {
    issues.push({ field: 'preview', code: 'catalogue_evidence_unavailable', message: 'A server preview is required before requesting approval.' });
  } else if (!hasServerEvidence(snapshot.currentApprovedTotal)) {
    issues.push({ field: 'preview', code: 'catalogue_evidence_unavailable', message: 'The current approved total is unavailable.' });
  } else {
    const preview = draft.preview.value;
    const money = [preview.baseTotal, preview.additionalAmount, preview.platformFee, preview.additionalExpectedNet, preview.revisedTotal];
    if (!money.every(isValidLifecycleMoney)
      || preview.additionalExpectedNet.amountMinor !== preview.additionalAmount.amountMinor - preview.platformFee.amountMinor
      || preview.revisedTotal.amountMinor !== preview.baseTotal.amountMinor + preview.additionalAmount.amountMinor
      || preview.baseTotal.amountMinor !== snapshot.currentApprovedTotal.value.amountMinor
      || preview.additionalAmount.amountMinor !== draft.additionalAmountMinor) {
      issues.push({ field: 'preview', code: 'invalid', message: 'The server preview does not match this draft.' });
    }
  }
  return Object.freeze({ valid: issues.length === 0, issues: Object.freeze(issues) });
}

export function normaliseChangeOrderForm(
  snapshot: WorkerActiveWorkSnapshot,
  form: ChangeOrderFormValues,
): Readonly<{ draft: ChangeOrderDraft; validation: DraftValidation }> {
  const addedTimeMinutes = form.addedTimeMinutes.trim() ? parseWholeMinutes(form.addedTimeMinutes) : null;
  const additionalAmountMinor = form.additionalAmountRand.trim() ? parseRandMinor(form.additionalAmountRand) : null;
  const draft: ChangeOrderDraft = Object.freeze({
    description: form.description,
    addedTimeMinutes,
    materialsDescription: form.materialsDescription,
    additionalAmountMinor,
    preview: form.preview,
  });
  const base = validateChangeOrderDraft(snapshot, draft);
  const issues = [...base.issues];
  if (form.addedTimeMinutes.trim() && addedTimeMinutes === null) {
    issues.push({ field: 'addedTimeMinutes', code: 'invalid', message: 'Use a non-negative whole number of minutes.' });
  }
  if (form.additionalAmountRand.trim() && additionalAmountMinor === null) {
    issues.push({ field: 'additionalAmountMinor', code: 'invalid', message: 'Use a valid non-negative rand amount.' });
  }
  return Object.freeze({ draft, validation: Object.freeze({ valid: issues.length === 0, issues: Object.freeze(issues) }) });
}

export function validateWorkerChangeOrder(order: WorkerChangeOrder): boolean {
  return isStableLifecycleId(order.changeOrderId)
    && Number.isSafeInteger(order.version)
    && order.version > 0
    && isValidLifecycleMoney(order.baseTotal)
    && isValidLifecycleMoney(order.additionalAmount)
    && isValidLifecycleMoney(order.revisedTotal)
    && order.baseTotal.amountMinor + order.additionalAmount.amountMinor === order.revisedTotal.amountMinor;
}

export type WorkerCompletionStatus =
  | 'not_requested'
  | 'requested'
  | 'customer_confirmed'
  | 'disputed'
  | 'timed_out'
  | 'resolved'
  | 'unknown';

export interface WorkerCompletionSnapshot {
  readonly projectId: string;
  readonly stateVersion: number;
  readonly status: WorkerCompletionStatus;
  readonly requestedAt: string | null;
  readonly customerOutcomeAt: string | null;
  readonly timeoutPolicyLabel: string | null;
  readonly scopeSummary: string;
  readonly evidenceLabels: readonly string[];
  readonly finalCommercialSnapshotId: string | null;
  readonly finalExpectedNet: LifecycleEvidence<ZarAmount, 'server_ledger'>;
  readonly paymentState: LifecycleEvidence<PaymentState>;
  readonly issue: Readonly<{
    issueId: string;
    status: 'open' | 'acknowledged' | 'under_review' | 'resolved';
    label: string;
  }> | null;
  readonly ratingEligibility: LifecycleEvidence<Readonly<{ eligible: boolean; reason: string }>>;
  readonly payoutEligibility: LifecycleEvidence<Readonly<{ eligible: boolean; reason: string }>>;
}

export interface CompletionPresentation {
  readonly readOnly: boolean;
  readonly canRequestCompletion: boolean;
  readonly fulfilmentConfirmed: boolean;
  readonly issueOpen: boolean;
  readonly title: string;
  readonly explanation: string;
}

export function deriveCompletionPresentation(
  snapshot: WorkerCompletionSnapshot,
  connectionState: ConnectionState,
): CompletionPresentation {
  if (snapshot.status === 'unknown') {
    return Object.freeze({ readOnly: true, canRequestCompletion: false, fulfilmentConfirmed: false, issueOpen: snapshot.issue !== null, title: 'Completion state unavailable', explanation: 'Refresh before taking a completion action.' });
  }
  if (snapshot.status === 'disputed' || (snapshot.issue && snapshot.issue.status !== 'resolved')) {
    return Object.freeze({ readOnly: true, canRequestCompletion: false, fulfilmentConfirmed: false, issueOpen: true, title: 'Issue under review', explanation: 'The job remains in its preserved fulfilment state while the issue is resolved.' });
  }
  if (snapshot.status === 'not_requested') {
    return Object.freeze({ readOnly: connectionState === 'offline', canRequestCompletion: connectionState === 'online', fulfilmentConfirmed: false, issueOpen: false, title: 'Ready for completion review', explanation: 'Request completion only when the agreed work is ready for customer review.' });
  }
  if (snapshot.status === 'requested') {
    return Object.freeze({ readOnly: true, canRequestCompletion: false, fulfilmentConfirmed: false, issueOpen: false, title: 'Waiting for customer review', explanation: snapshot.timeoutPolicyLabel ?? 'The customer can confirm or report an issue.' });
  }
  const confirmed = snapshot.status === 'customer_confirmed' || snapshot.status === 'resolved';
  return Object.freeze({
    readOnly: true,
    canRequestCompletion: false,
    fulfilmentConfirmed: confirmed,
    issueOpen: false,
    title: confirmed ? 'Completion confirmed' : 'Completion timeout recorded',
    explanation: confirmed
      ? 'The server recorded the completion outcome. Payment and payout remain separate states.'
      : 'The disclosed timeout outcome is recorded. Payment and support states remain separate.',
  });
}

export interface WorkerAccountEntry {
  readonly entryId: string;
  readonly kind:
    | 'public_profile'
    | 'verification_credentials'
    | 'services_rates'
    | 'service_area_availability'
    | 'payout_method'
    | 'notifications_quiet_hours'
    | 'trust_fairness'
    | 'language'
    | 'emergency_safety'
    | 'privacy'
    | 'account_deletion';
  readonly label: string;
  readonly detail: string;
  readonly status: 'ready' | 'action_required' | 'pending' | 'unavailable';
  readonly visibility: ProfileFieldVisibility;
  readonly destinationKey: string | null;
  readonly capabilityReason: string | null;
}

export interface WorkerAccountReadinessSnapshot {
  readonly workerId: string;
  readonly stateVersion: number;
  readonly publicProfilePreviewUri: string | null;
  readonly entries: readonly WorkerAccountEntry[];
  readonly lastUpdatedAt: string;
}

export function deriveAccountReadiness(snapshot: WorkerAccountReadinessSnapshot): Readonly<{
  readyCount: number;
  actionRequiredCount: number;
  invalidEntryIds: readonly string[];
}> {
  const seen = new Set<string>();
  const invalid: string[] = [];
  let readyCount = 0;
  let actionRequiredCount = 0;
  for (const entry of snapshot.entries) {
    if (!isStableLifecycleId(entry.entryId) || seen.has(entry.entryId)) invalid.push(entry.entryId);
    seen.add(entry.entryId);
    if (entry.status === 'ready') readyCount += 1;
    if (entry.status === 'action_required') actionRequiredCount += 1;
    if (entry.status === 'unavailable' && !entry.capabilityReason?.trim()) invalid.push(entry.entryId);
  }
  return Object.freeze({ readyCount, actionRequiredCount, invalidEntryIds: Object.freeze([...new Set(invalid)]) });
}
