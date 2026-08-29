require('dotenv').config();

const isProd = process.env.NODE_ENV === 'production';

function fatal(message) {
  console.error(`FATAL: ${message}`);
  process.exit(1);
}

function required(name, devDefault) {
  const val = process.env[name];
  if (val && val.length > 0) return val;
  if (isProd) {
    fatal(`${name} is required in production`);
  }
  console.warn(`WARNING: ${name} not set — using insecure dev default. DO NOT ship to prod.`);
  return devDefault;
}

function isRepeatedPattern(value) {
  if (value.length < 2) return false;
  return `${value}${value}`.slice(1, -1).includes(value);
}

const DOCUMENTED_SECRET_PLACEHOLDERS = new Set([
  'your_jwt_secret_here',
  'your_jwt_refresh_secret_here',
  'dev_jwt_secret_do_not_use_in_prod',
  'dev_jwt_refresh_secret_do_not_use_in_prod',
  'test_jwt_secret_do_not_ship',
  'test_jwt_refresh_secret_do_not_ship',
]);

function requireProductionGradeSecret(name, value) {
  if (!isProd) return value;
  if (value !== value.trim()) {
    fatal(`${name} must not contain leading or trailing whitespace`);
  }
  if (DOCUMENTED_SECRET_PLACEHOLDERS.has(value.toLowerCase())) {
    fatal(`${name} must not use a documented development or test placeholder`);
  }
  if (Buffer.byteLength(value, 'utf8') < 32) {
    fatal(`${name} must contain at least 32 bytes of secret material`);
  }
  if (isRepeatedPattern(value)) {
    fatal(`${name} must not use repeated-pattern secret material`);
  }
  return value;
}

function requiredSecret(name, devDefault) {
  return requireProductionGradeSecret(name, required(name, devDefault));
}

function requiredHex(name, devDefault) {
  const val = requiredSecret(name, devDefault);
  if (!/^[a-f0-9]{64}$/.test(val)) {
    if (isProd) {
      fatal(`${name} must be 64 lowercase hex chars`);
    }
    console.warn(`WARNING: ${name} is not 64 lowercase hex chars. DO NOT ship to prod.`);
  }
  return val;
}

function requirePurposeBoundSecrets(namedSecrets) {
  if (!isProd) return;
  const seen = new Map();
  for (const [name, value] of namedSecrets) {
    const previousName = seen.get(value);
    if (previousName) {
      fatal(`${name} must not reuse the same value as ${previousName}`);
    }
    seen.set(value, name);
  }
}

const jwtSecret = requiredSecret('JWT_SECRET', 'dev_jwt_secret_do_not_use_in_prod');
const jwtRefreshSecret = requiredSecret('JWT_REFRESH_SECRET', 'dev_jwt_refresh_secret_do_not_use_in_prod');
const webhookSecretEncryptionKey = requiredHex('WEBHOOK_SECRET_ENCRYPTION_KEY', 'a'.repeat(64));
const piiBlindIndexKey = requiredHex('PII_BLIND_INDEX_KEY', 'b'.repeat(64));

if (jwtSecret === jwtRefreshSecret) {
  fatal('JWT_REFRESH_SECRET must not reuse the same value as JWT_SECRET');
}

requirePurposeBoundSecrets([
  ['JWT_SECRET', jwtSecret],
  ['JWT_REFRESH_SECRET', jwtRefreshSecret],
  ['WEBHOOK_SECRET_ENCRYPTION_KEY', webhookSecretEncryptionKey],
  ['PII_BLIND_INDEX_KEY', piiBlindIndexKey],
]);

const peachWebhooksEnabled = process.env.PEACH_WEBHOOKS_ENABLED === 'true';
const peachEntityId = process.env.PEACH_ENTITY_ID;
const peachAccessToken = process.env.PEACH_ACCESS_TOKEN;
const configuredPeachBaseUrl = process.env.PEACH_BASE_URL;
const peachBaseUrl = configuredPeachBaseUrl || 'https://eu-test.oppwa.com';
const peachWebhookSecret = process.env.PEACH_WEBHOOK_SECRET;

function validPeachBaseUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:'
      && Boolean(parsed.hostname)
      && !parsed.username
      && !parsed.password
      && !parsed.search
      && !parsed.hash;
  } catch {
    return false;
  }
}

const peachWebhooksConfigured = peachWebhooksEnabled
  && Boolean(peachEntityId)
  && Boolean(peachAccessToken)
  && Boolean(peachWebhookSecret)
  && Boolean(configuredPeachBaseUrl)
  && validPeachBaseUrl(peachBaseUrl);

module.exports = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: required('DATABASE_URL', 'postgresql://localhost:5432/togt'),
  jwtSecret,
  jwtRefreshSecret,
  jwtExpiresIn: '15m',
  jwtRefreshExpiresIn: '7d',
  webhookSecretEncryptionKey,
  piiBlindIndexKey,
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
  verifynow: {
    apiKey: process.env.VERIFYNOW_API_KEY,
    mode: process.env.VERIFYNOW_MODE || 'sandbox',
    baseUrl: process.env.VERIFYNOW_BASE_URL || 'https://www.verifynow.co.za/api/external',
  },
  resend: {
    apiKey: process.env.RESEND_API_KEY,
    fromAddress: process.env.RESEND_FROM || 'Togt <onboarding@resend.dev>',
  },
  peach: {
    entityId: peachEntityId,
    accessToken: peachAccessToken,
    baseUrl: peachBaseUrl,
    webhooksEnabled: peachWebhooksEnabled,
    webhooksConfigured: peachWebhooksConfigured,
    // Product approval and a complete, HTTPS provider configuration are
    // separate gates. Credentials alone never make the endpoint operational.
    webhookSecret: peachWebhookSecret,
  },
};
