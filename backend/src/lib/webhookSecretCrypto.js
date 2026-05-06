const crypto = require('crypto');
const { webhookSecretEncryptionKey } = require('../config/env');

if (!/^[a-f0-9]{64}$/.test(webhookSecretEncryptionKey)) {
  throw new Error(
    'WEBHOOK_SECRET_ENCRYPTION_KEY must be 64 lowercase hex chars (32 bytes). ' +
    'Generate one with: node -e "console.log(require(\\"crypto\\").randomBytes(32).toString(\\"hex\\"))"'
  );
}

const KEY = Buffer.from(webhookSecretEncryptionKey, 'hex');
const ALGO = 'aes-256-gcm';

function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

function decryptSecret(blob) {
  const buf = Buffer.from(blob, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

module.exports = { encryptSecret, decryptSecret };
