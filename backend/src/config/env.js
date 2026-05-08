require('dotenv').config();

const isProd = process.env.NODE_ENV === 'production';

function required(name, devDefault) {
  const val = process.env[name];
  if (val && val.length > 0) return val;
  if (isProd) {
    console.error(`FATAL: ${name} is required in production`);
    process.exit(1);
  }
  console.warn(`WARNING: ${name} not set — using insecure dev default. DO NOT ship to prod.`);
  return devDefault;
}

// Same fail-fast contract as required(), but allows the dev/test value
// to be `undefined` (i.e. a feature degrades gracefully if the env var
// is missing in dev). Production still hard-exits.
function requiredInProd(name) {
  const val = process.env[name];
  if (val && val.length > 0) return val;
  if (isProd) {
    console.error(`FATAL: ${name} is required in production`);
    process.exit(1);
  }
  return undefined;
}

module.exports = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: required('DATABASE_URL', 'postgresql://localhost:5432/togt'),
  jwtSecret: required('JWT_SECRET', 'dev_jwt_secret_do_not_use_in_prod'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET', 'dev_jwt_refresh_secret_do_not_use_in_prod'),
  jwtExpiresIn: '15m',
  jwtRefreshExpiresIn: '7d',
  webhookSecretEncryptionKey: required('WEBHOOK_SECRET_ENCRYPTION_KEY', 'a'.repeat(64)),
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
    entityId: process.env.PEACH_ENTITY_ID,
    accessToken: process.env.PEACH_ACCESS_TOKEN,
    baseUrl: process.env.PEACH_BASE_URL || 'https://eu-test.oppwa.com',
    // PEACH_WEBHOOK_SECRET HARD-FAILS in production. This is the HMAC
    // that gates /payments/webhook against forged payment-status flips.
    // Without it, an attacker who learns a checkoutId can push a fake
    // success and have the system mark the payment paid. Dev/test allow
    // unset (the route logs a warning and skips signature checking) so
    // local development doesn't need a real Peach setup.
    webhookSecret: requiredInProd('PEACH_WEBHOOK_SECRET'),
  },
};
