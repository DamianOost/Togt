'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { partitionLegacyQueue } = require('../../src/config/offlineQueuePolicy.cjs');

test('consequential legacy commands are quarantined without their payloads', () => {
  const result = partitionLegacyQueue([
    { type: 'accept', bookingId: 'secret-booking', queuedAt: 10, body: { status: 'accepted' } },
    { type: 'start', bookingId: 'secret-booking', queuedAt: 20, start_pin: '123456' },
    { type: 'complete', bookingId: 'secret-booking', queuedAt: 30 },
    { type: 'draft:booking-note', value: 'kept locally', queuedAt: 40 },
  ]);

  assert.equal(result.safeDrafts.length, 1);
  assert.equal(result.safeDrafts[0].type, 'draft:booking-note');
  assert.deepEqual(result.quarantined.map((item) => item.type), ['accept', 'start', 'complete']);
  assert.ok(result.quarantined.every((item) => item.consequential));
  assert.equal(JSON.stringify(result.quarantined).includes('secret-booking'), false);
  assert.equal(JSON.stringify(result.quarantined).includes('123456'), false);
});
