'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const mobileRoot = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8');
}

test('Grounded quote creation requires map-pin provenance and fresh action-time evidence', () => {
  const service = read('src/services/groundedMarketplace.ts');
  const route = read('src/features/customer/integration/CustomerIntakeRoutes.tsx');
  const start = service.indexOf('export async function createGroundedQuoteRequest');
  const end = service.indexOf('export async function loadGroundedQuoteRequests', start);
  const create = service.slice(start, end);

  assert.match(service, /coordinateSource: 'map_pin'/);
  assert.match(create, /input\.privateLocation\.coordinateSource !== 'map_pin'/);
  assert.match(create, /isValidCoordinates/);
  assert.match(create, /getCapabilityStateAtAction\(\s*'address_provenance_recording'/);
  assert.match(create, /forceRefresh: true/);
  assert.match(create, /address_provenance_contract_unavailable/);
  assert.ok(
    create.indexOf("getCapabilityStateAtAction(") < create.indexOf("url: '/api/quote-requests'"),
    'fresh provenance evidence must be checked before the consequential POST',
  );
  assert.match(route, /snapshot\.address\.resolution\.source !== 'map_pin'/);
  assert.match(route, /coordinateSource: snapshot\.address\.resolution\.source/);
  assert.doesNotMatch(route, /coordinateSource: 'map_pin'/);
});

test('mobile packages distinct location capability gates and keeps provider APIs off in Wave 1', () => {
  const policy = read('src/config/capabilityPolicy.cjs');
  const build = read('src/config/buildConfig.cjs');
  const service = read('src/services/capabilityService.js');

  for (const name of [
    'maps_display',
    'address_search',
    'address_resolution',
    'address_provenance_recording',
  ]) {
    assert.match(policy, new RegExp(`'${name}'`));
  }
  assert.match(build, /addressSearch: false/);
  assert.match(build, /addressResolution: false/);
  assert.match(build, /addressProvenanceRecording: featureFlags\.customerFlagship/);
  assert.match(service, /capabilityStateAtAction/);
  assert.match(service, /getCapabilityStateAtAction/);
});
