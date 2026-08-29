'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const mobileRoot = path.resolve(__dirname, '..', '..');

function source(relativePath) {
  return fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8');
}

test('feature flags are packaged-only and do not read process environment', () => {
  const text = source('src/app/featureFlags.ts');
  assert.match(text, /groundedMomentumShell:\s*false/);
  assert.doesNotMatch(text, /process\.env|expo-constants|fetch\s*\(/i);
});

test('analytics boundary is provider-neutral', () => {
  const text = source('src/data/analytics/analytics.ts');
  assert.match(text, /track\(name:/);
  assert.match(text, /captureException\(/);
  assert.match(text, /measure\(/);
  assert.doesNotMatch(text, /sentry|segment|firebase|amplitude|mixpanel|posthog/i);
});

test('source locale does not expose grammatical fragment keys', () => {
  const text = source('src/i18n/en-ZA.ts');
  assert.match(text, /SOURCE_LOCALE\s*=\s*'en-ZA'/);
  assert.doesNotMatch(text, /['"][^'"]*(?:prefix|suffix|fragment)['"]\s*:/i);
});

test('domain adapters are versioned and do not spread legacy payloads into UI contracts', () => {
  const text = source('src/domain/contracts/dtoAdapters.ts');
  assert.match(text, /DOMAIN_DTO_VERSION\s*=\s*1/);
  assert.doesNotMatch(text, /\.\.\.input|\.\.\.source/);
});
