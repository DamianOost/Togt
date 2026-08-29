'use strict';

const crypto = require('crypto');

const VERSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const INTERNAL_TERMS_URL = 'https://github.com/DamianOost/Togt/blob/main/docs/legal/internal-beta-terms.md';
const INTERNAL_PRIVACY_URL = 'https://github.com/DamianOost/Togt/blob/main/docs/legal/internal-beta-privacy-notice.md';

function validVersion(value) {
  return typeof value === 'string' && VERSION.test(value);
}

function validHttpsUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:'
      && Boolean(parsed.hostname)
      && !parsed.username
      && !parsed.password
      && !parsed.hash;
  } catch {
    return false;
  }
}

function policyRevision(documents) {
  return crypto.createHash('sha256').update(documents.map((document) => [
    document.kind,
    document.version,
    document.url,
  ].join('\u0000')).join('\u0001')).digest('hex');
}

function createRegistrationPolicy(environment = process.env) {
  const production = environment.NODE_ENV === 'production';
  const documents = [
    Object.freeze({
      kind: 'terms',
      title: 'TOGT Terms of Use',
      version: environment.REGISTRATION_TERMS_VERSION
        || (production ? null : 'internal-beta-terms-2026.08.29'),
      url: environment.REGISTRATION_TERMS_URL || (production ? null : INTERNAL_TERMS_URL),
      required: true,
    }),
    Object.freeze({
      kind: 'privacy',
      title: 'TOGT Privacy Notice',
      version: environment.REGISTRATION_PRIVACY_VERSION
        || (production ? null : 'internal-beta-privacy-2026.08.29'),
      url: environment.REGISTRATION_PRIVACY_URL || (production ? null : INTERNAL_PRIVACY_URL),
      required: true,
    }),
  ];
  const documentsValid = documents.every((document) => (
    validVersion(document.version) && validHttpsUrl(document.url)
  ));
  const productionApproved = environment.REGISTRATION_POLICY_APPROVED === 'true';
  const available = documentsValid && (!production || productionApproved);
  const reasonCode = available
    ? null
    : production && !productionApproved
      ? 'registration_policy_not_approved'
      : 'registration_policy_configuration_invalid';

  return Object.freeze({
    schema: 'togt.registration-policy.v1',
    available,
    releaseChannel: production ? 'production' : 'internal_testing',
    productionApproved: production && productionApproved && documentsValid,
    reasonCode,
    revision: documentsValid ? policyRevision(documents) : null,
    documents: documentsValid ? Object.freeze(documents) : Object.freeze([]),
  });
}

function registrationConsentFor(policy = createRegistrationPolicy()) {
  if (!policy.available || !policy.revision) {
    throw new Error('registration policy is unavailable');
  }
  return Object.freeze({
    revision: policy.revision,
    termsAccepted: true,
    privacyAccepted: true,
  });
}

module.exports = {
  createRegistrationPolicy,
  registrationConsentFor,
  validHttpsUrl,
  validVersion,
};
