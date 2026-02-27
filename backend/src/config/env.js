require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET || 'dev_jwt_secret',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'dev_jwt_refresh_secret',
  jwtExpiresIn: '15m',
  jwtRefreshExpiresIn: '7d',
  peach: {
    entityId: process.env.PEACH_ENTITY_ID,
    accessToken: process.env.PEACH_ACCESS_TOKEN,
    baseUrl: process.env.PEACH_BASE_URL || 'https://eu-test.oppwa.com',
  },
};
