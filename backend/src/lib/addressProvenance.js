const { ProblemError } = require('./problemJson');

const COORDINATE_SOURCES = Object.freeze([
  'map_pin',
  'saved_verified_place',
  'provider_geocode',
  'device_gps',
  'entered_coordinates',
]);

const COORDINATE_SOURCE_SET = new Set(COORDINATE_SOURCES);
const SERVER_RESERVED_SOURCES = new Set(['saved_verified_place', 'provider_geocode']);
const LEGACY_AUDIT_SOURCES = new Set(['device_gps', 'entered_coordinates']);

function fail(type, title, detail, status = 422) {
  throw new ProblemError({ type, title, status, detail });
}

function normalizeCoordinatePair(latitude, longitude, { label = 'location', status = 422 } = {}) {
  const coordinateNumber = (value) => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim() !== '') return Number(value);
    return Number.NaN;
  };
  if (latitude == null || longitude == null || latitude === '' || longitude === '') {
    fail(
      'address_coordinates_invalid',
      'Address coordinates are invalid',
      `${label} requires both latitude and longitude.`,
      status
    );
  }
  const normalizedLatitude = coordinateNumber(latitude);
  const normalizedLongitude = coordinateNumber(longitude);
  if (!Number.isFinite(normalizedLatitude) || normalizedLatitude < -90 || normalizedLatitude > 90
      || !Number.isFinite(normalizedLongitude) || normalizedLongitude < -180 || normalizedLongitude > 180) {
    fail(
      'address_coordinates_invalid',
      'Address coordinates are invalid',
      `${label} latitude must be from -90 to 90 and longitude from -180 to 180.`,
      status
    );
  }
  return { latitude: normalizedLatitude, longitude: normalizedLongitude };
}

function normalizeCoordinateSource(value, {
  surface = 'legacy_audit',
  optional = true,
  status = 422,
} = {}) {
  if (value == null) {
    if (optional) return null;
    fail(
      'coordinate_source_required',
      'Coordinate provenance is required',
      'Supply the coordinate source accepted by this contract.',
      status
    );
  }
  if (typeof value !== 'string' || !COORDINATE_SOURCE_SET.has(value)) {
    fail(
      'coordinate_source_invalid',
      'Coordinate provenance is invalid',
      'Use a coordinate source from the versioned TOGT address contract.',
      status
    );
  }
  if (SERVER_RESERVED_SOURCES.has(value)) {
    fail(
      'coordinate_source_server_reserved',
      'Coordinate provenance is server reserved',
      'Saved-place and provider-geocode provenance require server-issued evidence.',
      status
    );
  }
  if (surface === 'canonical_quote') {
    return value;
  }
  if (!LEGACY_AUDIT_SOURCES.has(value)) {
    fail(
      'coordinate_source_not_permitted',
      'Coordinate provenance is not permitted on this route',
      'Legacy REST, agent and MCP surfaces cannot manufacture map-pin provenance.',
      status
    );
  }
  return value;
}

function normalizeAddressEvidence({ latitude, longitude, coordinateSource }, options = {}) {
  const coordinates = normalizeCoordinatePair(latitude, longitude, options);
  return {
    ...coordinates,
    coordinateSource: normalizeCoordinateSource(coordinateSource, options),
  };
}

module.exports = {
  COORDINATE_SOURCES,
  SERVER_RESERVED_SOURCES,
  LEGACY_AUDIT_SOURCES,
  normalizeCoordinatePair,
  normalizeCoordinateSource,
  normalizeAddressEvidence,
};
