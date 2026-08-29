'use strict';

function legacyDirectBookingCreationEnabled(environment = process.env) {
  return environment.LEGACY_DIRECT_BOOKING_CREATION_ENABLED === 'true';
}

module.exports = { legacyDirectBookingCreationEnabled };
