'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const mobileRoot = path.resolve(__dirname, '..', '..');
const service = fs.readFileSync(path.join(mobileRoot, 'src', 'services', 'groundedWorker.ts'), 'utf8');
const routes = fs.readFileSync(path.join(mobileRoot, 'src', 'features', 'worker', 'integration', 'WorkerProfileRoutes.tsx'), 'utf8');
const adapter = fs.readFileSync(path.join(mobileRoot, 'src', 'data', 'grounded', 'workerProfile.ts'), 'utf8');

test('transport uses only canonical Worker routes with optimistic revision and idempotency headers', () => {
  for (const endpoint of [
    '/api/worker/activation', '/api/worker/activation/emergency-contact',
    '/api/worker/profile', '/api/worker/offerings',
  ]) assert.match(service, new RegExp(endpoint.replaceAll('/', '\\/')));
  assert.match(service, /'Idempotency-Key'/);
  assert.match(service, /'If-Match'/);
  assert.match(service, /ensureOnline\(input\.connectionState\)/);
  assert.match(service, /No Worker profile or readiness mutation was attempted offline/);
  assert.doesNotMatch(service, /console\.|Math\.random|Date\.now/);
});

test('W01, W05 and W11 route controllers load real evidence and preserve unsupported capabilities', () => {
  for (const component of ['WorkerActivationRoute', 'WorkerServicesProfileRoute', 'WorkerAccountReadinessRoute']) {
    assert.match(routes, new RegExp(`export function ${component}`));
  }
  assert.match(routes, /loadGroundedWorkerActivation/);
  assert.match(routes, /loadGroundedWorkerProfile/);
  assert.match(routes, /saveGroundedWorkerPublicProfile/);
  assert.match(routes, /updateGroundedWorkerOffering/);
  assert.match(routes, /acknowledgeGroundedWorkerActivation/);
  assert.match(routes, /saveGroundedWorkerEmergencyContact/);
  assert.match(routes, /privateFingerprint/);
  assert.match(routes, /failed_rolled_back/);
  assert.match(routes, /capabilities=\{bundle\?\.capabilities \?\? null\}/);
  assert.doesNotMatch(routes, /onChoosePortfolioMedia=|onChooseProfilePhoto=|onOpenCredential=/);
  assert.match(routes, /approved, version-matched acknowledgement content/);
  assert.doesNotMatch(routes, /navigation\.navigate\('Payout|devicePermissionVerified:\s*true|credential.*status:\s*'verified'/);
});

test('adapter requires the exact eleven-item checklist and unavailable capability evidence', () => {
  assert.match(adapter, /togt\.worker-profile\.v1/);
  assert.match(adapter, /ACTIVATION_KINDS/);
  assert.match(adapter, /items\.length !== ACTIVATION_KINDS\.length/);
  assert.match(adapter, /acknowledgementPolicies\.length !== ACKNOWLEDGEMENT_KINDS\.length/);
  assert.match(adapter, /portfolioUpload: unavailable/);
  assert.match(adapter, /credentialSubmission: unavailable/);
  assert.match(adapter, /payoutAccount: unavailable/);
  assert.match(adapter, /workerId !== activation\.workerId/);
});
