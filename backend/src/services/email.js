const { Resend } = require('resend');
const { resend: resendCfg } = require('../config/env');

let client = null;
function getClient() {
  if (!client) {
    if (!resendCfg.apiKey) {
      throw new Error('RESEND_API_KEY not configured');
    }
    client = new Resend(resendCfg.apiKey);
  }
  return client;
}

async function sendPasswordResetEmail({ to, code }) {
  const html = `
    <div style="font-family: -apple-system, Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #1A6B3A;">Togt — password reset</h2>
      <p>Your password reset code is:</p>
      <p style="font-size: 32px; font-weight: 700; letter-spacing: 6px; background: #F9FAFB; padding: 16px; border-radius: 8px; text-align: center;">
        ${code}
      </p>
      <p>This code expires in 15 minutes. If you did not request this, ignore this email.</p>
    </div>
  `;
  const text = `Togt password reset code: ${code}\nExpires in 15 minutes. Ignore if you did not request this.`;
  return getClient().emails.send({
    from: resendCfg.fromAddress,
    to,
    subject: 'Togt password reset code',
    html,
    text,
  });
}

module.exports = { sendPasswordResetEmail };
