const { FEATURES } = require('../../config/capabilities');
const {
  fail,
  validateCaptureRequest,
  validateAssistanceEnvelope,
} = require('./contracts');

const PROVIDER_ADAPTER_VERSION = 1;

function validateProviderAdapter(provider) {
  if (!provider || provider.approved !== true || provider.configured !== true) {
    return null;
  }
  if (provider.adapterVersion !== PROVIDER_ADAPTER_VERSION
      || typeof provider.extract !== 'function'
      || typeof provider.id !== 'string') {
    fail('assistance_provider_contract_invalid', 'Approved assistance provider adapter is invalid', 503);
  }
  return provider;
}

function defaultProvider() {
  // Intentionally empty. A provider is added only by a separately reviewed
  // adapter/release change; environment strings cannot silently enable one.
  return null;
}

function capabilityUnavailable(capability, provider) {
  if (capability?.available !== true) {
    return capability?.reason_code || 'assisted_intake_not_approved';
  }
  if (!provider) return 'approved_provider_unavailable';
  return null;
}

function createAssistedIntakeService({
  capability = FEATURES.ai_assisted_intake,
  provider = defaultProvider(),
  approvedConsentPolicyVersions = [],
} = {}) {
  return Object.freeze({
    async extract(rawInput, context = {}) {
      const featureUnavailableReason = capabilityUnavailable(capability, provider);
      if (capability?.available !== true) {
        fail('capability_unavailable', 'AI-assisted intake is unavailable', 503, {
          capability: 'ai_assisted_intake',
          reasonCode: featureUnavailableReason,
          deterministicFallbackAvailable: true,
        });
      }
      const adapter = validateProviderAdapter(provider);
      const unavailableReason = capabilityUnavailable(capability, adapter);
      if (unavailableReason) {
        fail('capability_unavailable', 'AI-assisted intake is unavailable', 503, {
          capability: 'ai_assisted_intake',
          reasonCode: unavailableReason,
          deterministicFallbackAvailable: true,
        });
      }

      const input = validateCaptureRequest(rawInput);
      if (!approvedConsentPolicyVersions.includes(input.consentPolicyVersion)) {
        fail('consent_policy_not_approved', 'Assisted-processing consent policy is not approved', 503, {
          capability: 'ai_assisted_intake',
          deterministicFallbackAvailable: true,
        });
      }
      const rawOutput = await adapter.extract(input, {
        actorId: context.actorId,
        schemaVersion: input.schemaVersion,
      });
      const assistance = validateAssistanceEnvelope(rawOutput);
      return Object.freeze({
        assistance,
        confirmation: Object.freeze({
          everyDerivedFieldRequired: true,
          finalWorkerSelectedByAI: false,
          finalPriceSetByAI: false,
          paymentActionTakenByAI: false,
          identityOrSafetyDecisionTakenByAI: false,
        }),
        processing: Object.freeze({
          providerId: adapter.id,
          providerAdapterVersion: PROVIDER_ADAPTER_VERSION,
          retainedByTogt: false,
          eligibleForGeneralAnalytics: false,
          consentPolicyVersion: input.consentPolicyVersion,
        }),
      });
    },
  });
}

module.exports = {
  PROVIDER_ADAPTER_VERSION,
  defaultProvider,
  validateProviderAdapter,
  createAssistedIntakeService,
};
