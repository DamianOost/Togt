'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.resolve(__dirname, '../../src/app/runtimeFeatureFlags.ts'),
  'utf8',
);

test('runtime feature snapshot reads only packaged Expo extra', () => {
  assert.match(source, /Constants\.expoConfig\?\.extra/);
  assert.match(source, /resolvePackagedFeatureFlagsFromExtra/);
  assert.doesNotMatch(source, /process\.env|fetch\s*\(|AsyncStorage/i);
});
