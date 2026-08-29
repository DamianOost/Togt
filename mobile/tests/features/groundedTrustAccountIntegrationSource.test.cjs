'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const mobileRoot = path.resolve(__dirname, '..', '..');
const routePath = path.join(mobileRoot, 'src', 'features', 'trust', 'integration', 'TrustAccountRoutes.tsx');
const servicePath = path.join(mobileRoot, 'src', 'services', 'groundedTrust.ts');

function source(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

test('T05 is reachable through a strict server evidence adapter and record-only review request', () => {
  const routes = source(routePath);
  const service = source(servicePath);
  assert.match(service, /loadGroundedTrustFairness/);
  assert.match(service, /url: ['"]\/api\/trust\/fairness['"]/);
  assert.match(service, /adaptTrustFairness/);
  assert.match(service, /sampleSize/);
  assert.match(routes, /export function TrustFairnessRoute/);
  assert.match(routes, /loadGroundedTrustFairness\(\)/);
  assert.match(routes, /initialCategory: ['"]account_help['"]/);
  assert.match(routes, /does not promise an acknowledgement time or outcome/i);
  assert.doesNotMatch(routes, /trustScore|fairnessScore/);
});

test('T06 is reachable but remains non-mutating while remote push and preferences are unavailable', () => {
  const routes = source(routePath);
  assert.match(routes, /export function NotificationControlsRoute/);
  assert.match(routes, /registrationState: ['"]unavailable['"]/);
  assert.match(routes, /onSaveControls=\{unavailable\}/);
  assert.match(routes, /Nothing was changed/);
  assert.doesNotMatch(routes, /api\.(?:post|put|patch|delete)|fetch\s*\(/);
  assert.doesNotMatch(routes, /registrationState: ['"]registered['"]/);
});
