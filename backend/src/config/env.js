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

module.exports = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: required('DATABASE_URL', 'postgresql://localhost:5432/togt'),
  jwtSecret: required('JWT_SECRET', 'dev_jwt_secret_do_not_use_in_prod'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET', 'dev_jwt_refresh_secret_do_not_use_in_prod'),
  jwtExpiresIn: '15m',
  jwtRefreshExpiresIn: '7d',
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
  peach: {
    entityId: process.env.PEACH_ENTITY_ID,
    accessToken: process.env.PEACH_ACCESS_TOKEN,
    baseUrl: process.env.PEACH_BASE_URL || 'https://eu-test.oppwa.com',
    webhookSecret: process.env.PEACH_WEBHOOK_SECRET,
  },
};
