const crypto = require('crypto');
const { jwtSecret } = require('../config/env');
const { hasCanonicalFulfilment } = require('./privacy');

function startPinForBooking(bookingId) {
  if (!bookingId) throw new Error('bookingId is required');
  const digest = crypto
    .createHmac('sha256', jwtSecret)
    .update(`togt-start-pin:v1:${bookingId}`)
    .digest();
  return String(digest.readUInt32BE(0) % 1_000_000).padStart(6, '0');
}

function verifyStartPin(bookingId, candidate) {
  if (typeof candidate !== 'string' || !/^\d{6}$/.test(candidate)) return false;
  const expected = Buffer.from(startPinForBooking(bookingId));
  const supplied = Buffer.from(candidate);
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

function withStartContext(serialized, booking, viewer = {}) {
  if (hasCanonicalFulfilment(booking)) {
    return {
      ...serialized,
      start_pin_required: false,
      ready_to_start: false,
      canonical_start_required: true,
      start_path: `/api/projects/${booking.id}/start`,
    };
  }
  const bothConfirmed = booking.scope_confirmed_by_customer === true
    && booking.scope_confirmed_by_labourer === true;
  const canStart = booking.status === 'accepted' && bothConfirmed;
  const result = {
    ...serialized,
    start_pin_required: booking.status === 'accepted',
    ready_to_start: canStart,
  };
  if (canStart && viewer.role === 'customer' && booking.customer_id === viewer.id) {
    result.start_pin = startPinForBooking(booking.id);
  }
  return result;
}

module.exports = {
  startPinForBooking,
  verifyStartPin,
  withStartContext,
};
