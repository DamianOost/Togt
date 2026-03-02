// Smile ID configuration
// Sign up at https://portal.usesmileid.com to get credentials
// Free tier: 300 verifications/month

const SMILE_CONFIG = {
  partner_id: process.env.SMILE_PARTNER_ID || 'DEMO',
  api_key: process.env.SMILE_API_KEY || 'DEMO',
  sandbox: process.env.NODE_ENV !== 'production',
  base_url:
    process.env.NODE_ENV === 'production'
      ? 'https://3eydmgh10d.execute-api.us-west-2.amazonaws.com/prod'
      : 'https://testapi.smileidentity.com/v1',
};

module.exports = { SMILE_CONFIG };
