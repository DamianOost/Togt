const POLICY_ENV = Object.freeze({
  approved: 'GROUNDED_FULFILMENT_POLICY_APPROVED',
  version: 'GROUNDED_FULFILMENT_POLICY_VERSION',
  routeRevealLeadMinutes: 'GROUNDED_FULFILMENT_ROUTE_REVEAL_LEAD_MINUTES',
  arrivalEvidenceMode: 'GROUNDED_FULFILMENT_ARRIVAL_EVIDENCE_MODE',
  noShowGraceMinutes: 'GROUNDED_FULFILMENT_NO_SHOW_GRACE_MINUTES',
  startPinTtlMinutes: 'GROUNDED_FULFILMENT_START_PIN_TTL_MINUTES',
  startPinMaxAttempts: 'GROUNDED_FULFILMENT_START_PIN_MAX_ATTEMPTS',
  rescheduleExpiryMinutes: 'GROUNDED_FULFILMENT_RESCHEDULE_EXPIRY_MINUTES',
  changeOrderExpiryMinutes: 'GROUNDED_FULFILMENT_CHANGE_ORDER_EXPIRY_MINUTES',
});

function integerSetting(env, name, min, max, invalidFields) {
  const raw = env[name];
  if (typeof raw !== 'string' || !/^(0|[1-9]\d*)$/.test(raw)) {
    invalidFields.push(name);
    return null;
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    invalidFields.push(name);
    return null;
  }
  return value;
}

function resolveApprovedFulfilmentPolicy(env = process.env) {
  if (env[POLICY_ENV.approved] !== 'true') {
    return {
      available: false,
      reasonCode: 'fulfilment_policy_not_approved',
      invalidFields: [],
    };
  }

  const invalidFields = [];
  const policyVersion = env[POLICY_ENV.version];
  if (typeof policyVersion !== 'string'
      || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(policyVersion)) {
    invalidFields.push(POLICY_ENV.version);
  }
  const routeRevealLeadMinutes = integerSetting(
    env, POLICY_ENV.routeRevealLeadMinutes, 0, 1440, invalidFields
  );
  const arrivalEvidenceMode = env[POLICY_ENV.arrivalEvidenceMode];
  if (arrivalEvidenceMode !== 'worker_attestation') {
    invalidFields.push(POLICY_ENV.arrivalEvidenceMode);
  }
  const noShowGraceMinutes = integerSetting(
    env, POLICY_ENV.noShowGraceMinutes, 0, 1440, invalidFields
  );
  const startPinTtlMinutes = integerSetting(
    env, POLICY_ENV.startPinTtlMinutes, 15, 1440, invalidFields
  );
  const startPinMaxAttempts = integerSetting(
    env, POLICY_ENV.startPinMaxAttempts, 3, 10, invalidFields
  );
  const rescheduleExpiryMinutes = integerSetting(
    env, POLICY_ENV.rescheduleExpiryMinutes, 15, 10080, invalidFields
  );
  const changeOrderExpiryMinutes = integerSetting(
    env, POLICY_ENV.changeOrderExpiryMinutes, 15, 10080, invalidFields
  );

  if (invalidFields.length > 0) {
    return {
      available: false,
      reasonCode: 'fulfilment_policy_configuration_incomplete',
      invalidFields: [...new Set(invalidFields)].sort(),
    };
  }

  return {
    available: true,
    reasonCode: null,
    invalidFields: [],
    snapshot: Object.freeze({
      policyVersion,
      source: 'operations_override',
      routeRevealLeadMinutes,
      arrivalEvidenceMode,
      noShowGraceMinutes,
      startPinTtlMinutes,
      startPinMaxAttempts,
      rescheduleExpiryMinutes,
      changeOrderExpiryMinutes,
    }),
  };
}

module.exports = { POLICY_ENV, resolveApprovedFulfilmentPolicy };
