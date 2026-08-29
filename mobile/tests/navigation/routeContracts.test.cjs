'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  createCustomerHomeIntent,
  createNestedRootIntent,
  createRouteParams,
} = require('../../src/navigation/routeContracts');

const mobileRoot = path.resolve(__dirname, '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8');
}

function registrationCount(source, routeName) {
  return (source.match(new RegExp(`<Stack\\.Screen\\s+name=["']${routeName}["']`, 'g')) || []).length;
}

test('worker profile accepts stable IDs and rejects legacy object/parameter shapes', () => {
  assert.deepEqual(
    createRouteParams('LabourerProfile', { workerId: 'worker-1', serviceId: 'service-2' }),
    { workerId: 'worker-1', serviceId: 'service-2' }
  );
  assert.throws(
    () => createRouteParams('LabourerProfile', { labourerId: 'worker-1' }),
    /workerId/
  );
  assert.throws(
    () => createRouteParams('LabourerProfile', { labourer: { id: 'worker-1' } }),
    /workerId/
  );
});

test('critical detail routes require a stable booking or worker ID', () => {
  for (const routeName of ['ActiveBooking', 'ActiveJob', 'ScopeConfirm', 'Payment', 'Rate']) {
    assert.deepEqual(createRouteParams(routeName, { bookingId: 'booking-1' }), { bookingId: 'booking-1' });
    assert.throws(() => createRouteParams(routeName, {}), /bookingId/);
    assert.throws(() => createRouteParams(routeName, { booking: { id: 'booking-1' } }), /bookingId/);
  }
  assert.deepEqual(
    createRouteParams('BookingForm', { workerId: 'worker-1' }),
    { workerId: 'worker-1' }
  );
});

test('incoming worker offers dispatch an explicit nested root intent', () => {
  assert.deepEqual(
    createNestedRootIntent('labourer', 'ActiveJob', { bookingId: 'booking-1' }),
    {
      name: 'Labourer',
      params: { screen: 'ActiveJob', params: { bookingId: 'booking-1' } },
    }
  );
  assert.throws(
    () => createNestedRootIntent('customer', 'ActiveJob', { bookingId: 'booking-1' }),
    /not registered for customer/
  );
});

test('customer completion return targets the nested home tab explicitly', () => {
  assert.deepEqual(createCustomerHomeIntent(), {
    name: 'CustomerTabs',
    params: {
      screen: 'Search',
      params: { screen: 'HomeMap' },
    },
  });
});

test('customer transactional routes are registered once above tabs', () => {
  const source = read('src/navigation/CustomerStack.js');
  for (const routeName of [
    'RequestMatch', 'LabourerProfile', 'BookingForm', 'ActiveBooking',
    'Payment', 'Rate', 'Chat', 'KYC', 'ScopeConfirm',
  ]) {
    assert.equal(registrationCount(source, routeName), 1, `${routeName} should be registered once`);
  }
  assert.equal(registrationCount(source, 'CustomerTabs'), 1);
});

test('worker transactional routes are registered once above tabs', () => {
  const source = read('src/navigation/LabourerStack.js');
  for (const routeName of ['ActiveJob', 'Chat', 'KYC', 'ScopeConfirm']) {
    assert.equal(registrationCount(source, routeName), 1, `${routeName} should be registered once`);
  }
  assert.equal(registrationCount(source, 'LabourerTabs'), 1);
});

test('Discover, Map, Profile, and Booking use ID-only worker route entries', () => {
  const discover = read('src/screens/customer/DiscoverScreen.js');
  const map = read('src/screens/customer/HomeMapScreen.js');
  const profile = read('src/screens/customer/LabourerProfileScreen.js');
  const booking = read('src/screens/customer/BookingFormScreen.js');

  assert.match(discover, /workerId:\s*service\.labourer_id/);
  assert.doesNotMatch(discover, /LabourerProfile["'],\s*\{\s*labourerId/);
  assert.doesNotMatch(map, /LabourerProfile["'],\s*\{\s*labourer:/);
  assert.match(map, /LabourerProfile["'],\s*\{\s*workerId:/);
  assert.match(profile, /createRouteParams\(['"]LabourerProfile['"]/);
  assert.match(profile, /api\.get\(`\/api\/labourers\/\$\{encodeURIComponent\(workerId\)\}`\)/);
  assert.match(profile, /BookingForm["'],\s*createRouteParams\(['"]BookingForm['"]/);
  assert.match(booking, /createRouteParams\(['"]BookingForm['"]/);
  assert.match(booking, /Profile unavailable/);
});

test('registration, offer acceptance, and rating returns avoid stale navigator actions', () => {
  const register = read('src/screens/auth/RegisterScreen.js');
  const incoming = read('src/components/IncomingMatchModal.js');
  const rate = read('src/screens/customer/RateScreen.js');

  assert.doesNotMatch(register, /navigation\.navigate\(['"]KYC['"]\)/);
  assert.match(incoming, /createNestedRootIntent\(['"]labourer['"],\s*['"]ActiveJob['"]/);
  assert.doesNotMatch(incoming, /navigation\.navigate\(['"]ActiveJob['"]/);
  assert.match(rate, /createCustomerHomeIntent\(\)/);
  assert.doesNotMatch(rate, /navigation\.navigate\(['"]HomeMap['"]\)/);
});
