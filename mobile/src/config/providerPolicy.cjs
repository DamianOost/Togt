'use strict';

const MAPS_PROVIDER_GOOGLE = 'google';
const LOCATION_CAPABILITY_SCHEMA_VERSION = 1;

function resolveMapsPolicy(extra) {
  const provider = extra?.providers?.maps;
  if (provider === MAPS_PROVIDER_GOOGLE) {
    return Object.freeze({ available: true, provider });
  }
  return Object.freeze({
    available: false,
    provider: typeof provider === 'string' && provider ? provider : 'disabled',
  });
}

function resolveLocationCapabilityPolicy(extra) {
  const maps = resolveMapsPolicy(extra);
  const packaged = extra?.locationCapabilities;
  if (!packaged || packaged.schemaVersion !== LOCATION_CAPABILITY_SCHEMA_VERSION) {
    return Object.freeze({
      valid: false,
      reasonCode: 'location_capability_contract_unavailable',
      mapsDisplay: false,
      addressSearch: false,
      addressResolution: false,
      addressProvenanceRecording: false,
    });
  }
  const booleans = [
    'mapsDisplay',
    'addressSearch',
    'addressResolution',
    'addressProvenanceRecording',
  ];
  if (!booleans.every((name) => typeof packaged[name] === 'boolean')) {
    return Object.freeze({
      valid: false,
      reasonCode: 'location_capability_contract_invalid',
      mapsDisplay: false,
      addressSearch: false,
      addressResolution: false,
      addressProvenanceRecording: false,
    });
  }
  return Object.freeze({
    valid: true,
    reasonCode: 'location_capability_contract_valid',
    mapsDisplay: maps.available && packaged.mapsDisplay === true,
    addressSearch: packaged.addressSearch === true,
    addressResolution: packaged.addressResolution === true,
    addressProvenanceRecording: packaged.addressProvenanceRecording === true,
  });
}

module.exports = {
  LOCATION_CAPABILITY_SCHEMA_VERSION,
  MAPS_PROVIDER_GOOGLE,
  resolveLocationCapabilityPolicy,
  resolveMapsPolicy,
};
