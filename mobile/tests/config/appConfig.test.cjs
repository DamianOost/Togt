'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const createConfig = require('../../app.config.js');
const base = require('../../app.json');
const eas = require('../../eas.json');

function withEnvironment(values, callback) {
  const names = ['EAS_BUILD_PROFILE', 'EXPO_PUBLIC_API_BASE_URL'];
  const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) {
      if (Object.hasOwn(values, name)) process.env[name] = values[name];
      else delete process.env[name];
    }
    return callback();
  } finally {
    for (const name of names) {
      if (original[name] === undefined) delete process.env[name];
      else process.env[name] = original[name];
    }
  }
}

test('local config uses development mode without embedding a private-LAN address', () => {
  const config = withEnvironment({}, () => createConfig({ config: base.expo }));
  assert.equal(config.extra.apiUrl, 'http://localhost:3000');
  assert.equal(config.extra.buildProfile, 'development');
  assert.equal(config.android.versionCode, 1);
});

test('preview config fails closed without an HTTPS endpoint', () => {
  assert.throws(
    () => withEnvironment({ EAS_BUILD_PROFILE: 'preview' }, () => createConfig({ config: base.expo })),
    /required for standalone builds/
  );
  assert.throws(
    () => withEnvironment({
      EAS_BUILD_PROFILE: 'preview',
      EXPO_PUBLIC_API_BASE_URL: 'http://192.0.2.10:3000',
    }, () => createConfig({ config: base.expo })),
    /require an HTTPS/
  );
});

test('preview config accepts one HTTPS endpoint and produces an internal APK profile', () => {
  const config = withEnvironment({
    EAS_BUILD_PROFILE: 'preview',
    EXPO_PUBLIC_API_BASE_URL: 'https://preview.example.test/',
  }, () => createConfig({ config: base.expo }));

  assert.equal(config.extra.apiUrl, 'https://preview.example.test');
  assert.equal(config.extra.buildProfile, 'preview');
  assert.equal(eas.build.preview.distribution, 'internal');
  assert.equal(eas.build.preview.environment, 'preview');
  assert.equal(eas.build.preview.android.buildType, 'apk');
});

test('notification config does not reference a missing custom icon', () => {
  const config = withEnvironment({}, () => createConfig({ config: base.expo }));
  const plugin = config.plugins.find((entry) => Array.isArray(entry) && entry[0] === 'expo-notifications');
  assert.ok(plugin);
  assert.equal(plugin[1].icon, undefined);
});
