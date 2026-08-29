const VERSION_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;

const ENV_BY_KIND = Object.freeze({
  foreground_location: 'WORKER_FOREGROUND_LOCATION_EXPLANATION_VERSION',
  safety_policy: 'WORKER_SAFETY_POLICY_VERSION',
  first_job_readiness: 'WORKER_FIRST_JOB_READINESS_VERSION',
});

const CONTENT_BY_KIND = Object.freeze({
  foreground_location: Object.freeze({
    title: 'Foreground location and privacy',
    body: 'TOGT uses a fresh location while you are actively using the app to check service-area readiness and support job travel. This build does not request background location and does not claim continuous tracking.',
    acknowledgementLabel: 'I understand how foreground location is used',
  }),
  safety_policy: Object.freeze({
    title: 'Safety and emergency readiness',
    body: 'For immediate danger, call emergency services directly. TOGT can keep a support record, but this build does not dispatch emergency services or promise a staffed response. Keep a private emergency contact current.',
    acknowledgementLabel: 'I understand the safety and emergency boundary',
  }),
  first_job_readiness: Object.freeze({
    title: 'First-job readiness',
    body: 'Confirm the agreed scope before starting, use the customer-provided start PIN only on site, and obtain an approved change order before doing extra work. Keep payment, completion and payout evidence separate.',
    acknowledgementLabel: 'I have reviewed the first-job readiness guide',
  }),
});

function configuredVersion(kind) {
  const envName = ENV_BY_KIND[kind];
  const value = envName ? process.env[envName] : null;
  return typeof value === 'string' && VERSION_RE.test(value) ? value : null;
}

function policySnapshot() {
  return Object.fromEntries(Object.keys(ENV_BY_KIND).map((kind) => {
    const requiredVersion = configuredVersion(kind);
    return [kind, Object.freeze({
      available: requiredVersion !== null,
      requiredVersion,
      reasonCode: requiredVersion === null ? 'approved_content_version_not_configured' : null,
      ...(requiredVersion === null ? {} : CONTENT_BY_KIND[kind]),
    })];
  }));
}

module.exports = { ENV_BY_KIND, CONTENT_BY_KIND, configuredVersion, policySnapshot };
