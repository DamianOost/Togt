'use strict';

const MAPS_PROVIDER_GOOGLE = 'google';

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

module.exports = {
  MAPS_PROVIDER_GOOGLE,
  resolveMapsPolicy,
};
