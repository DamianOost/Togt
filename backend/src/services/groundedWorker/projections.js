const { isLocationFresh } = require('../../lib/privacy');
const { approvedPublicProfileImageUrl } = require('../../lib/publicMedia');
const { publicTextOrNull } = require('../../lib/publicText');
const { configuredVersion, policySnapshot } = require('../../config/workerActivationPolicy');
const { SCHEMA } = require('./contracts');

function supported(value, observedAt) {
  return { status: 'supported', source: 'server', observedAt, value };
}

function unavailable(reasonCode, explanation) {
  return { status: 'unavailable', reasonCode, explanation };
}

function profilePhotoUrl(row) {
  return approvedPublicProfileImageUrl(row.avatar_url)
    || approvedPublicProfileImageUrl(row.profile_photo);
}

function identityEvidence(row) {
  const authoritative = row.kyc_status === 'verified'
    && row.verification_status === 'verified'
    && row.verification_provider === 'verifynow'
    && row.verification_verified_at != null;
  if (authoritative) return { status: 'verified', authoritative: true };
  if (row.kyc_status === 'pending' || row.verification_status === 'pending') {
    return { status: 'pending_review', authoritative: false };
  }
  if (row.kyc_status === 'failed' || row.verification_status === 'failed') {
    return { status: 'failed', authoritative: false };
  }
  return { status: 'unverified', authoritative: false };
}

function requiredCredentials(row) {
  const ids = row.worker_eligibility?.credentialIds;
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.filter((id) => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id)))];
}

function requiresIdentity(row) {
  return row.worker_eligibility?.requiresIdentityVerified === true;
}

function safeMinor(value) {
  const number = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function pricingEvidence(row) {
  const rules = row.pricing_rules && typeof row.pricing_rules === 'object' ? row.pricing_rules : {};
  const fixedCustomerAmountMinor = safeMinor(rules.fixedCustomerAmountMinor);
  const fixedWorkerNetMinor = safeMinor(rules.fixedWorkerNetMinor);
  const hourlyMinimum = safeMinor(rules.hourlyRateBounds?.minimumMinor);
  const hourlyMaximum = safeMinor(rules.hourlyRateBounds?.maximumMinor);
  const hourlyRate = safeMinor(row.hourly_rate_minor);
  const callOutMinor = row.catalogue_call_out_fee == null
    ? null
    : safeMinor(Math.round(Number(row.catalogue_call_out_fee) * 100));

  if (row.pricing_mode === 'remote_quote') {
    return { ready: true, reason: 'Exact remote-quote pricing mode accepted by catalogue opt-in.' };
  }
  if (row.pricing_mode === 'fixed_instant') {
    return {
      ready: fixedCustomerAmountMinor !== null && fixedWorkerNetMinor !== null,
      reason: 'Fixed customer and worker amounts must both be present in the catalogue pricing evidence.',
    };
  }
  if (row.pricing_mode === 'hourly_estimated') {
    return {
      ready: hourlyRate !== null && hourlyMinimum !== null && hourlyMaximum !== null
        && hourlyMinimum <= hourlyMaximum
        && hourlyRate >= hourlyMinimum && hourlyRate <= hourlyMaximum,
      reason: 'An hourly rate within server-published catalogue bounds is required.',
    };
  }
  if (row.pricing_mode === 'diagnostic_visit') {
    return {
      ready: callOutMinor !== null || fixedCustomerAmountMinor !== null,
      reason: 'A catalogue-backed diagnostic call-out amount is required.',
    };
  }
  return { ready: false, reason: 'Pricing mode is not recognised by this API version.' };
}

function offeringEligibility(row, workerRow) {
  const credentials = requiredCredentials(row);
  const identity = identityEvidence(workerRow);
  const pricing = pricingEvidence(row);
  const current = row.is_published === true && row.retired_at == null;
  const publicTitle = publicTextOrNull(row.customer_facing_title, { maxLength: 120 });
  const publicDescription = publicTextOrNull(row.description, { maxLength: 1_500 });
  const publicServiceArea = publicTextOrNull(row.service_area_label, { maxLength: 160 });
  const configured = publicTitle?.length >= 2
    && publicDescription?.length >= 20
    && publicServiceArea?.length >= 2;
  const accountReady = workerRow.legacy_account_verified === true;
  const identityReady = !requiresIdentity(row) || identity.authoritative;
  const credentialReady = credentials.length === 0;
  return {
    eligible: current && configured && pricing.ready && accountReady && identityReady && credentialReady,
    current,
    configured,
    pricing,
    credentials,
    accountReady,
    identityReady,
    credentialReady,
  };
}

function pricingMode(value) {
  return ({
    fixed_instant: 'fixed',
    hourly_estimated: 'hourly',
    remote_quote: 'remote_quote',
    diagnostic_visit: 'diagnostic_visit',
  })[value] || 'remote_quote';
}

function riskTier(row) {
  if (row.risk_tier === 'high') return 'high_risk';
  return requiredCredentials(row).length > 0 ? 'credentialed' : 'standard';
}

function moneyEvidence(value, reasonCode, explanation, observedAt) {
  const amountMinor = safeMinor(value);
  return amountMinor === null
    ? unavailable(reasonCode, explanation)
    : supported({ currency: 'ZAR', amountMinor }, observedAt);
}

function hourlyBoundsEvidence(row, observedAt) {
  const minimum = safeMinor(row.pricing_rules?.hourlyRateBounds?.minimumMinor);
  const maximum = safeMinor(row.pricing_rules?.hourlyRateBounds?.maximumMinor);
  if (minimum === null || maximum === null || minimum > maximum) {
    return unavailable(
      'catalogue_hourly_bounds_unavailable',
      'The catalogue does not contain valid hourly rate bounds. Hourly rate editing is disabled.'
    );
  }
  return supported({
    minimum: { currency: 'ZAR', amountMinor: minimum },
    maximum: { currency: 'ZAR', amountMinor: maximum },
  }, observedAt);
}

function serializeOffering(row, workerRow) {
  const observedAt = new Date(row.updated_at).toISOString();
  const credentials = requiredCredentials(row);
  const fixedCustomer = row.pricing_rules?.fixedCustomerAmountMinor;
  const fixedNet = row.pricing_rules?.fixedWorkerNetMinor;
  return {
    offeringId: row.id,
    stateVersion: Number(row.revision),
    facts: {
      serviceId: row.service_id,
      serviceVersion: Number(row.service_version),
      canonicalCategory: row.category_key,
      catalogueLabel: row.label_en_za,
      pricingMode: pricingMode(row.pricing_mode),
      riskTier: riskTier(row),
      requiredCredentials: credentials,
      fixedCustomerAmount: moneyEvidence(
        fixedCustomer,
        'catalogue_fixed_customer_amount_unavailable',
        'No exact fixed customer amount is published for this catalogue version.',
        observedAt
      ),
      fixedWorkerNet: moneyEvidence(
        fixedNet,
        'catalogue_fixed_worker_net_unavailable',
        'No exact fixed worker amount is published for this catalogue version.',
        observedAt
      ),
      hourlyRateBounds: hourlyBoundsEvidence(row, observedAt),
      fixedPayoutRule: typeof row.pricing_rules?.fixedPayoutRule === 'string'
        ? row.pricing_rules.fixedPayoutRule
        : null,
    },
    customerFacingTitle: row.customer_facing_title,
    description: row.description,
    hourlyRate: safeMinor(row.hourly_rate_minor) === null
      ? null
      : { currency: 'ZAR', amountMinor: safeMinor(row.hourly_rate_minor) },
    minimumDurationMinutes: row.minimum_duration_minutes == null
      ? null
      : Number(row.minimum_duration_minutes),
    callOutAmount: safeMinor(row.call_out_amount_minor) === null
      ? null
      : { currency: 'ZAR', amountMinor: safeMinor(row.call_out_amount_minor) },
    serviceAreaLabel: row.service_area_label || '',
    portfolio: [],
    active: row.opt_in_status === 'active',
    credentialEvidence: credentials.map((credentialId) => ({
      credentialId,
      label: credentialId,
      status: 'missing',
    })),
    mutation: { state: 'idle', message: null, confirmedAt: null },
    eligibility: offeringEligibility(row, workerRow),
  };
}

function serializePublicProfile(row, offeringRows) {
  const photo = profilePhotoUrl(row);
  const identity = identityEvidence(row);
  const updatedAt = new Date(row.activation_updated_at).toISOString();
  const areas = [...new Set(offeringRows
    .map((offering) => publicTextOrNull(offering.service_area_label, { maxLength: 160 }))
    .filter(Boolean))];
  return {
    profileId: row.worker_id,
    stateVersion: Number(row.profile_revision || 1),
    displayName: publicTextOrNull(row.public_display_name, { maxLength: 80 })
      || publicTextOrNull(row.account_name, { maxLength: 80 })
      || 'Worker',
    about: publicTextOrNull(row.about_experience, { maxLength: 1_000 })
      || publicTextOrNull(row.legacy_bio, { maxLength: 1_000 })
      || '',
    profilePhoto: photo
      ? supported({ uri: photo }, updatedAt)
      : unavailable('profile_photo_unavailable', 'No public profile photo is stored.'),
    photoReplacement: {
      state: 'idle', previewUri: null, progressPercent: null, message: null,
    },
    publicBadges: [
      {
        badgeId: 'account_evidence',
        label: 'Account evidence',
        detail: row.legacy_account_verified === true
          ? 'Server account verification evidence is recorded.'
          : 'Verified account/contact evidence is not recorded.',
        status: row.legacy_account_verified === true ? 'verified' : 'not_verified',
      },
      {
        badgeId: 'identity_assurance',
        label: 'Identity assurance',
        detail: identity.authoritative
          ? 'Identity was verified by the configured authoritative provider.'
          : identity.status === 'pending_review'
            ? 'Identity evidence is pending authoritative review.'
            : 'Authoritative identity evidence is not available.',
        status: identity.authoritative
          ? 'verified'
          : identity.status === 'pending_review' ? 'pending' : 'not_verified',
      },
    ],
    serviceAreaLabel: areas.join(' • '),
    privateDetailLabels: [
      {
        detailId: 'contact',
        label: 'Contact details',
        statusLabel: row.contact_present ? 'Stored privately; verification not independently claimed' : 'Not on file',
      },
      {
        detailId: 'emergency_contact',
        label: 'Emergency contact',
        statusLabel: row.emergency_contact ? 'Stored privately' : 'Not on file',
      },
      {
        detailId: 'payout_method',
        label: 'Payout method',
        statusLabel: 'Unavailable; payout readiness is not claimed',
      },
    ],
    mutation: { state: 'idle', message: null, confirmedAt: null },
  };
}

function activationItem({ itemId, kind, title, status, required = true, visibility, evidenceLabel, remedy, destinationKey }) {
  return { itemId, kind, title, status, required, visibility, evidenceLabel, remedy, destinationKey };
}

function serializeActivation(row, offeringRows, acknowledgementRows, now = new Date()) {
  const acknowledgements = new Map(acknowledgementRows.map((item) => [item.acknowledgement_kind, item]));
  const identity = identityEvidence(row);
  const photo = profilePhotoUrl(row);
  const about = publicTextOrNull(row.about_experience, { maxLength: 1_000 })
    || publicTextOrNull(row.legacy_bio, { maxLength: 1_000 })
    || '';
  const activeOfferings = offeringRows.filter((offering) => offering.opt_in_status === 'active');
  const eligibleOfferings = activeOfferings.filter((offering) => offeringEligibility(offering, row).eligible);
  const pricedOfferings = activeOfferings.filter((offering) => pricingEvidence(offering).ready);
  const areaOfferings = activeOfferings.filter((offering) => (
    publicTextOrNull(offering.service_area_label, { maxLength: 160 })?.length >= 2
  ));
  const currentAcknowledgement = (kind) => {
    const requiredVersion = configuredVersion(kind);
    const stored = acknowledgements.get(kind);
    return requiredVersion && stored?.policy_version === requiredVersion ? stored : null;
  };
  const policies = policySnapshot();
  const foregroundAck = currentAcknowledgement('foreground_location');
  const safetyAck = currentAcknowledgement('safety_policy');
  const firstJobAck = currentAcknowledgement('first_job_readiness');
  const acknowledgementPolicies = Object.entries(policies).map(([kind, policy]) => {
    const stored = acknowledgements.get(kind);
    return policy.available
      ? {
          kind,
          status: 'available',
          expectedRevision: Number(stored?.revision || 1),
          acknowledgedCurrent: stored?.policy_version === policy.requiredVersion,
          policyVersion: policy.requiredVersion,
          title: policy.title,
          body: policy.body,
          acknowledgementLabel: policy.acknowledgementLabel,
        }
      : {
          kind,
          status: 'unavailable',
          expectedRevision: Number(stored?.revision || 1),
          acknowledgedCurrent: false,
          reasonCode: policy.reasonCode,
          explanation: 'Approved, version-matched content is not configured. Nothing can be acknowledged yet.',
        };
  });
  const freshLocation = isLocationFresh(row, now.getTime());
  const items = [
    activationItem({
      itemId: 'account-contact', kind: 'account_contact', title: 'Account and contact evidence',
      status: row.legacy_account_verified === true ? 'complete' : 'incomplete', visibility: 'private',
      evidenceLabel: row.legacy_account_verified === true ? 'Server account verification evidence recorded' : null,
      remedy: row.legacy_account_verified === true ? null : 'Complete the supported account/contact verification flow.',
      destinationKey: 'Account',
    }),
    activationItem({
      itemId: 'identity-assurance', kind: 'identity_assurance', title: 'Identity assurance',
      status: identity.authoritative ? 'complete' : identity.status === 'pending_review' ? 'pending_review' : identity.status === 'failed' ? 'failed' : 'incomplete',
      visibility: 'public', evidenceLabel: identity.authoritative ? 'Authoritative provider verification recorded' : null,
      remedy: identity.authoritative ? null : 'Complete authoritative identity verification when the capability is available.',
      destinationKey: 'KYC',
    }),
    activationItem({
      itemId: 'profile-photo', kind: 'profile_photo', title: 'Public profile photograph',
      status: photo ? 'complete' : 'incomplete', visibility: 'public', evidenceLabel: photo ? 'Public image reference stored' : null,
      remedy: photo ? null : 'Upload a real public profile photograph through the approved media flow.',
      destinationKey: 'WorkerServicesProfile',
    }),
    activationItem({
      itemId: 'about-experience', kind: 'about_experience', title: 'About and experience',
      status: about.length >= 20 ? 'complete' : 'incomplete', visibility: 'public',
      evidenceLabel: about.length >= 20 ? 'Public about text stored' : null,
      remedy: about.length >= 20 ? null : 'Add at least 20 characters about your experience.',
      destinationKey: 'WorkerServicesProfile',
    }),
    activationItem({
      itemId: 'eligible-service', kind: 'eligible_service', title: 'Eligible service',
      status: eligibleOfferings.length > 0 ? 'complete' : 'incomplete', visibility: 'public',
      evidenceLabel: eligibleOfferings.length > 0 ? `${eligibleOfferings.length} eligible active service(s)` : null,
      remedy: eligibleOfferings.length > 0 ? null : 'Configure and activate a current catalogue service with every required evidence item.',
      destinationKey: 'WorkerServicesProfile',
    }),
    activationItem({
      itemId: 'pricing-acceptance', kind: 'pricing_acceptance', title: 'Pricing acceptance',
      status: pricedOfferings.length > 0 ? 'complete' : 'incomplete', visibility: 'public',
      evidenceLabel: pricedOfferings.length > 0 ? 'Catalogue-backed pricing is configured' : null,
      remedy: pricedOfferings.length > 0 ? null : 'Configure an exact catalogue-backed rate or pricing mode.',
      destinationKey: 'WorkerServicesProfile',
    }),
    activationItem({
      itemId: 'service-area', kind: 'service_area', title: 'Service area',
      status: areaOfferings.length > 0 ? 'complete' : 'incomplete', visibility: 'public',
      evidenceLabel: areaOfferings.length > 0 ? 'At least one active service area is stored' : null,
      remedy: areaOfferings.length > 0 ? null : 'Add a service area to an active offering.',
      destinationKey: 'WorkerServicesProfile',
    }),
    activationItem({
      itemId: 'payout-method', kind: 'payout_method', title: 'Payout method', status: 'not_required',
      required: false, visibility: 'private', evidenceLabel: 'Payout capability is unavailable; no payout readiness is claimed',
      remedy: null, destinationKey: 'WorkerEarnings',
    }),
    activationItem({
      itemId: 'foreground-location', kind: 'foreground_location', title: 'Foreground location explanation',
      status: foregroundAck ? 'complete' : 'incomplete', visibility: 'private',
      evidenceLabel: foregroundAck ? `Acknowledged policy ${foregroundAck.policy_version}; device permission is checked separately` : null,
      remedy: foregroundAck
        ? null
        : policies.foreground_location.available
          ? 'Read and acknowledge why foreground location is needed. Device permission is checked when going online.'
          : 'Approved foreground-location content is not configured. Try again after support enables it.',
      destinationKey: 'WorkerActivation',
    }),
    activationItem({
      itemId: 'safety-emergency', kind: 'safety_emergency', title: 'Safety and emergency readiness',
      status: safetyAck && row.emergency_contact ? 'complete' : 'incomplete', visibility: 'private',
      evidenceLabel: safetyAck && row.emergency_contact ? `Emergency contact stored and policy ${safetyAck.policy_version} acknowledged` : null,
      remedy: safetyAck && row.emergency_contact
        ? null
        : policies.safety_policy.available
          ? 'Store an emergency contact and acknowledge the current safety policy.'
          : 'Store an emergency contact. Approved safety policy content is not configured yet.',
      destinationKey: 'WorkerSafety',
    }),
    activationItem({
      itemId: 'first-job-readiness', kind: 'first_job_readiness', title: 'First-job readiness education',
      status: firstJobAck ? 'complete' : 'incomplete', visibility: 'private',
      evidenceLabel: firstJobAck ? `Readiness version ${firstJobAck.policy_version} acknowledged` : null,
      remedy: firstJobAck
        ? null
        : policies.first_job_readiness.available
          ? 'Complete and acknowledge the first-job readiness guide.'
          : 'Approved first-job readiness content is not configured. Try again after support enables it.',
      destinationKey: 'WorkerActivation',
    }),
  ];
  const blockers = items.filter((item) => item.required && item.status !== 'complete');
  if (!freshLocation) {
    blockers.push({ itemId: 'fresh-location-heartbeat', title: 'Fresh foreground location heartbeat' });
  }
  const allowed = blockers.length === 0;
  return {
    schemaVersion: 1,
    workerId: row.worker_id,
    stateVersion: Number(row.activation_revision || 1),
    items,
    acknowledgementPolicies,
    onlinePermission: supported({
      allowed,
      reasonCode: allowed ? 'worker_online_prerequisites_passed' : 'worker_online_prerequisites_incomplete',
      explanation: allowed
        ? 'Server prerequisites and a fresh foreground location heartbeat are present.'
        : `Online remains blocked by: ${blockers.map((item) => item.title).join('; ')}.`,
    }, now.toISOString()),
    lastUpdatedAt: new Date(row.activation_updated_at).toISOString(),
  };
}

function serializeServicesProfile(row, offeringRows) {
  return {
    schema: SCHEMA,
    workerId: row.worker_id,
    stateVersion: Number(row.activation_revision || 1),
    services: offeringRows.map((offering) => serializeOffering(offering, row)),
    publicProfile: serializePublicProfile(row, offeringRows),
    lastUpdatedAt: new Date(row.activation_updated_at).toISOString(),
    capabilities: {
      portfolioUpload: unavailable('portfolio_upload_not_implemented', 'Portfolio media cannot be added until the protected upload and moderation path exists.'),
      credentialSubmission: unavailable('credential_registry_not_implemented', 'Credential evidence cannot be claimed until the verified credential registry exists.'),
      payoutAccount: unavailable('payout_capability_not_approved', 'No payout account or payout readiness is exposed.'),
    },
  };
}

module.exports = {
  supported,
  unavailable,
  identityEvidence,
  requiredCredentials,
  pricingEvidence,
  offeringEligibility,
  serializeOffering,
  serializePublicProfile,
  serializeActivation,
  serializeServicesProfile,
};
