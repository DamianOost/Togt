'use strict';

const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');
const { allowsAndroidCleartext } = require('../src/config/buildConfig.cjs');

function applyAndroidCleartextPolicy(androidManifest, configClass) {
  const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);
  mainApplication.$['android:usesCleartextTraffic'] =
    allowsAndroidCleartext(configClass) ? 'true' : 'false';
  return androidManifest;
}

function withAndroidCleartextPolicy(config, { configClass } = {}) {
  // Validate during config resolution so unknown future classes fail closed.
  allowsAndroidCleartext(configClass);

  return withAndroidManifest(config, (modConfig) => {
    modConfig.modResults = applyAndroidCleartextPolicy(
      modConfig.modResults,
      configClass
    );
    return modConfig;
  });
}

module.exports = withAndroidCleartextPolicy;
module.exports.applyAndroidCleartextPolicy = applyAndroidCleartextPolicy;
