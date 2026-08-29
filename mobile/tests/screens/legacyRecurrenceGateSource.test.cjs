'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mobileRoot = path.resolve(__dirname, '../..');

test('legacy booking form cannot create unilateral recurring bookings', () => {
  const source = fs.readFileSync(
    path.join(mobileRoot, 'src/screens/customer/BookingFormScreen.js'),
    'utf8'
  );

  assert.doesNotMatch(source, /make-recurring|RECURRENCE_OPTIONS|recurPattern/);
  assert.match(source, /Recurring bookings unavailable here/);
  assert.match(source, /both parties accepting the terms after a completed Project/);
});
