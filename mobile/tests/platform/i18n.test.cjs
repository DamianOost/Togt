'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  EN_ZA_MESSAGES,
  SOURCE_LOCALE,
  formatZarEnZa,
  translateEnZa,
} = require('../../src/i18n/en-ZA.ts');

test('South African English is the authored source locale', () => {
  assert.equal(SOURCE_LOCALE, 'en-ZA');
  assert.equal(translateEnZa('shell.customer.projects'), 'Projects');
  assert.equal(translateEnZa('booking.confirmAddress'), 'Confirm address');
});

test('parameterised copy formats a complete grammatical message', () => {
  assert.equal(
    translateEnZa('booking.workerAccepted', { workerName: 'Thandi' }),
    'Thandi accepted your job.',
  );
  assert.equal(
    translateEnZa('booking.payAction', { amountLabel: 'R 450.00' }),
    'Pay R 450.00',
  );
  assert.throws(
    () => translateEnZa('booking.workerAccepted'),
    /Missing en-ZA interpolation value: workerName/,
  );
});

test('catalogue exposes no prefix, suffix or fragment keys', () => {
  for (const key of Object.keys(EN_ZA_MESSAGES)) {
    assert.doesNotMatch(key, /(?:prefix|suffix|fragment)$/i);
  }
});

test('ZAR values use the South African locale and retain two decimal places', () => {
  const formatted = formatZarEnZa(450);
  assert.match(formatted, /R/);
  assert.match(formatted, /450/);
  assert.match(formatted, /00/);
  assert.throws(() => formatZarEnZa(Number.NaN), /finite ZAR amount/);
});
