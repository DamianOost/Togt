'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const mobileRoot = path.resolve(__dirname, '..', '..');
const servicePath = path.join(mobileRoot, 'src', 'services', 'groundedMarketplace.ts');
const routesPath = path.join(mobileRoot, 'src', 'features', 'customer', 'integration', 'CustomerProjectRoutes.tsx');
const screenPath = path.join(mobileRoot, 'src', 'features', 'customer', 'projects', 'CompletionPaymentScreen.tsx');
const stackPath = path.join(mobileRoot, 'src', 'navigation', 'GroundedCustomerStack.tsx');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

test('C13 rating transport strictly adapts participant state and sends idempotent submissions', () => {
  const service = read(servicePath);
  assert.match(service, /adaptGroundedRating/);
  assert.match(service, /loadGroundedRating/);
  assert.match(service, /submitGroundedRating/);
  assert.match(service, /\/api\/ratings\/booking\/\$\{projectId\}\/mine/);
  assert.match(service, /url: ['"]\/api\/ratings['"]/);
  assert.match(service, /mutationConfig\(input\.idempotencyKey\)/);
  assert.match(service, /['"]sealed['"]/);
  assert.match(service, /['"]published['"]/);
});

test('completion rating and retention actions are live and the legacy ungrounded Rate route is absent', () => {
  const routes = read(routesPath);
  const screen = read(screenPath);
  const stack = read(stackPath);
  assert.match(routes, /loadGroundedRating\(projectId\)/);
  assert.match(routes, /submitGroundedRating\(\{/);
  assert.match(routes, /createGroundedFavourite\(\{/);
  assert.match(routes, /createGroundedRebookDraft\(\{/);
  assert.match(routes, /onSelectRating=\{\(rating\) => setProject/);
  assert.doesNotMatch(routes, /rating-disabled|onSelectRating=\{\(\) => \{\}\}/);
  assert.match(screen, /Rating submitted privately/);
  assert.match(screen, /snapshot\.rating\.publicationLabel/);
  assert.doesNotMatch(stack, /name=['"]Rate['"]|component=\{RateScreen\}/);
});
