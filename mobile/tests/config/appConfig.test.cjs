'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const createConfig = require('../../app.config.js');
const base = require('../../app.json');
const eas = require('../../eas.json');

const CONFIG_ENVIRONMENT_NAMES = [
  'ANDROID_BUILD_PROVIDER',
  'ANDROID_PACKAGE_NAME',
  'EAS_BUILD_PROFILE',
  'EAS_PROJECT_ID',
  'EXPO_PUBLIC_API_BASE_URL',
  'EXPO_PUBLIC_APP_ENV',
  'EXPO_PUBLIC_ENABLE_PEACH',
  'EXPO_PUBLIC_MAPS_PROVIDER',
  'EXPO_PUBLIC_PUSH_PROVIDER',
  'GOOGLE_MAPS_ANDROID_API_KEY',
  'GOOGLE_SERVICES_JSON',
  'TOGT_STANDALONE_BUILD',
];

function withEnvironment(values, callback) {
  const original = Object.fromEntries(
    CONFIG_ENVIRONMENT_NAMES.map((name) => [name, process.env[name]])
  );
  try {
    for (const name of CONFIG_ENVIRONMENT_NAMES) {
      if (Object.hasOwn(values, name)) process.env[name] = values[name];
      else delete process.env[name];
    }
    return callback();
  } finally {
    for (const name of CONFIG_ENVIRONMENT_NAMES) {
      if (original[name] === undefined) delete process.env[name];
      else process.env[name] = original[name];
    }
  }
}

function configFor(values) {
  return withEnvironment(values, () => createConfig({ config: base.expo }));
}

test('local Gradle development config is labelled and locks release identity', () => {
  const config = configFor({
    ANDROID_BUILD_PROVIDER: 'local_gradle',
    EXPO_PUBLIC_API_BASE_URL: 'http://192.168.10.20:3000',
    EXPO_PUBLIC_APP_ENV: 'development',
  });

  assert.equal(config.name, 'Togt Development');
  assert.equal(config.extra.apiUrl, 'http://192.168.10.20:3000');
  assert.equal(config.extra.appEnvironment, 'development');
  assert.equal(config.extra.buildProvider, 'local_gradle');
  assert.equal(config.extra.configClass, 'development-lan');
  assert.deepEqual(config.extra.providers, {
    maps: 'disabled',
    peach: false,
    push: 'disabled',
  });
  assert.equal(config.android.package, 'za.togt.app');
  assert.equal(config.android.versionCode, 2);
  assert.equal(config.version, '1.0.1');
  assert.equal(config.extra.eas, undefined);
});

test('preview config fails closed without a public HTTPS endpoint', () => {
  assert.throws(
    () => configFor({
      ANDROID_BUILD_PROVIDER: 'local_gradle',
      EXPO_PUBLIC_APP_ENV: 'preview',
    }),
    /must be supplied explicitly/
  );
  assert.throws(
    () => configFor({
      ANDROID_BUILD_PROVIDER: 'local_gradle',
      EXPO_PUBLIC_API_BASE_URL: 'http://api.example.test',
      EXPO_PUBLIC_APP_ENV: 'preview',
    }),
    /preview requires an HTTPS/
  );
  assert.throws(
    () => configFor({
      ANDROID_BUILD_PROVIDER: 'local_gradle',
      EXPO_PUBLIC_API_BASE_URL: 'https://10.0.0.5:3000',
      EXPO_PUBLIC_APP_ENV: 'preview',
    }),
    /must not use a localhost or private-LAN/
  );
});

test('local preview config does not require an Expo project', () => {
  const config = configFor({
    ANDROID_BUILD_PROVIDER: 'local_gradle',
    EXPO_PUBLIC_API_BASE_URL: 'https://preview.example.test',
    EXPO_PUBLIC_APP_ENV: 'preview',
  });

  assert.equal(config.name, 'Togt');
  assert.equal(config.extra.configClass, 'preview');
  assert.equal(config.extra.buildProvider, 'local_gradle');
  assert.equal(config.extra.eas, undefined);
});

test('EAS and Expo Push require a project ID only when selected', () => {
  const common = {
    EXPO_PUBLIC_API_BASE_URL: 'https://preview.example.test',
    EXPO_PUBLIC_APP_ENV: 'preview',
  };
  assert.throws(
    () => configFor({ ...common, ANDROID_BUILD_PROVIDER: 'eas' }),
    /EAS_PROJECT_ID is required/
  );
  assert.throws(
    () => configFor({
      ...common,
      ANDROID_BUILD_PROVIDER: 'local_gradle',
      EXPO_PUBLIC_PUSH_PROVIDER: 'expo',
    }),
    /EAS_PROJECT_ID is required/
  );

  const config = configFor({
    ...common,
    ANDROID_BUILD_PROVIDER: 'eas',
    EAS_BUILD_PROFILE: 'preview',
    EAS_PROJECT_ID: 'synthetic-project-id',
  });
  assert.equal(config.extra.eas.projectId, 'synthetic-project-id');
  assert.equal(config.extra.buildProvider, 'eas');
});

test('enabled Google providers require their provider-specific inputs', () => {
  const common = {
    ANDROID_BUILD_PROVIDER: 'local_gradle',
    EXPO_PUBLIC_API_BASE_URL: 'https://preview.example.test',
    EXPO_PUBLIC_APP_ENV: 'preview',
  };
  assert.throws(
    () => configFor({ ...common, EXPO_PUBLIC_MAPS_PROVIDER: 'google' }),
    /GOOGLE_MAPS_ANDROID_API_KEY is required/
  );
  assert.throws(
    () => configFor({
      ...common,
      EXPO_PUBLIC_MAPS_PROVIDER: 'google',
      GOOGLE_MAPS_ANDROID_API_KEY: '<replace-me>',
    }),
    /must not be a placeholder/
  );
  assert.throws(
    () => configFor({
      ...common,
      EXPO_PUBLIC_PUSH_PROVIDER: 'fcm',
      GOOGLE_SERVICES_JSON: 'missing-google-services.json',
    }),
    /must point to a readable file/
  );
});

test('package override and invalid provider values fail closed', () => {
  const common = {
    ANDROID_BUILD_PROVIDER: 'local_gradle',
    EXPO_PUBLIC_API_BASE_URL: 'http://localhost:3000',
    EXPO_PUBLIC_APP_ENV: 'development',
  };
  assert.throws(
    () => configFor({ ...common, ANDROID_PACKAGE_NAME: 'example.wrong.app' }),
    /locked to za\.togt\.app/
  );
  assert.throws(
    () => configFor({ ...common, EXPO_PUBLIC_PUSH_PROVIDER: 'auto' }),
    /must be one of disabled, expo, fcm/
  );
  assert.throws(
    () => configFor({ ...common, EXPO_PUBLIC_ENABLE_PEACH: 'yes' }),
    /must be true or false/
  );
});

test('optional EAS profile remains an internal APK profile', () => {
  assert.equal(eas.build.preview.distribution, 'internal');
  assert.equal(eas.build.preview.environment, 'preview');
  assert.equal(eas.build.preview.env.ANDROID_BUILD_PROVIDER, 'eas');
  assert.equal(eas.build.preview.android.buildType, 'apk');
});

test('notification config does not reference a missing custom icon', () => {
  const config = configFor({
    ANDROID_BUILD_PROVIDER: 'local_gradle',
    EXPO_PUBLIC_API_BASE_URL: 'http://localhost:3000',
    EXPO_PUBLIC_APP_ENV: 'development',
  });
  const plugin = config.plugins.find(
    (entry) => Array.isArray(entry) && entry[0] === 'expo-notifications'
  );
  assert.ok(plugin);
  assert.equal(plugin[1].icon, undefined);
});
