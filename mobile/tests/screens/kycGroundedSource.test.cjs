'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.resolve(__dirname, '../../src/screens/shared/KYCScreen.js'),
  'utf8',
);

test('verification screen is Grounded, provider-gated and evidence-specific', () => {
  assert.match(source, /<AppScaffold/);
  assert.match(source, /capabilityEnabled\(capabilities, 'identity_verification'\)/);
  assert.match(source, /verification\?\.provider === 'verifynow'/);
  assert.match(source, /verification\?\.verified_at/);
  assert.match(source, /translateEnZa as t/);
  assert.doesNotMatch(source, /#[\da-f]{3,8}\b/i);
  assert.doesNotMatch(source, /TouchableOpacity|SafeAreaView|ScrollView/);
  assert.doesNotMatch(source, /simulate|mock verified|mark verified/i);
});
