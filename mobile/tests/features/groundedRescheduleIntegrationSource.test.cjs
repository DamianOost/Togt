'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const route = fs.readFileSync(path.join(root, 'src', 'features', 'fulfilment', 'integration', 'RescheduleRoute.tsx'), 'utf8');
const customer = fs.readFileSync(path.join(root, 'src', 'features', 'customer', 'integration', 'CustomerProjectRoutes.tsx'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'src', 'features', 'worker', 'integration', 'WorkerLifecycleRoutes.tsx'), 'utf8');

test('customer and Worker reach one server-authoritative bilateral reschedule route', () => {
  assert.match(customer, /navigation\.navigate\(['"]ProjectReschedule['"]/);
  assert.match(worker, /navigation\.navigate\(['"]ProjectReschedule['"]/);
  assert.match(route, /loadGroundedFulfilment\(projectId\)/);
  assert.match(route, /propose_reschedule/);
  assert.match(route, /accept_reschedule/);
  assert.match(route, /decline_reschedule/);
  assert.match(route, /pending\.proposedByRole !== role/);
  assert.match(route, /You cannot accept your own proposal/);
  assert.match(route, /Nothing is queued offline/);
});

test('reschedule scheduling uses the native date-time control and never changes the schedule on proposal alone', () => {
  assert.match(route, /DateTimePicker/);
  assert.match(route, /proposedStartsAt: proposedAt\.toISOString\(\)/);
  assert.match(route, /other participant must accept before the Project schedule changes/i);
  assert.doesNotMatch(route, /schedule (?:was|has been) changed[^\n]*propos/i);
});
