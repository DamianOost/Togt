const crypto = require('crypto');
const { jwtSecret } = require('../../config/env');

function derivePin({ bookingId, scopeVersion, generation, salt }) {
  const digest = crypto.createHmac('sha256', jwtSecret)
    .update(`togt-grounded-start-pin:v1:${bookingId}:${scopeVersion}:${generation}:${salt}`)
    .digest();
  return String(digest.readUInt32BE(0) % 1_000_000).padStart(6, '0');
}

function pinHash(pin, salt) {
  return crypto.createHmac('sha256', jwtSecret)
    .update(`togt-grounded-start-pin-hash:v1:${salt}:${pin}`)
    .digest('hex');
}

function createPinMaterial({ bookingId, scopeVersion, generation }) {
  const salt = crypto.randomBytes(16).toString('hex');
  const pin = derivePin({ bookingId, scopeVersion, generation, salt });
  return { salt, pin, hash: pinHash(pin, salt) };
}

function verifyPin(candidate, challenge) {
  if (typeof candidate !== 'string' || !/^\d{6}$/.test(candidate)) return false;
  const actual = Buffer.from(pinHash(candidate, challenge.pin_salt), 'hex');
  const expected = Buffer.from(challenge.pin_hash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function revealPin(challenge) {
  return derivePin({
    bookingId: challenge.booking_id,
    scopeVersion: Number(challenge.scope_version),
    generation: Number(challenge.generation),
    salt: challenge.pin_salt,
  });
}

function deviceIdHash(deviceId) {
  if (!deviceId) return null;
  return crypto.createHash('sha256').update(`togt-device:v1:${deviceId}`).digest('hex');
}

module.exports = { createPinMaterial, verifyPin, revealPin, deviceIdHash };
