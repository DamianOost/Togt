'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mobileRoot = path.resolve(__dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(mobileRoot, relative), 'utf8');

test('payment screen is read-only and has no checkout or cash mutation', () => {
  const source = read('src/screens/customer/PaymentScreen.js');
  assert.doesNotMatch(source, /payments\/initiate/);
  assert.doesNotMatch(source, /payments\/cash/);
  assert.doesNotMatch(source, /api\.post|api\.put|api\.patch/);
  assert.match(source, /payments\/status/);
});

test('scheduled requests do not auto-decline on a local timer', () => {
  const source = read('src/screens/labourer/JobRequestsScreen.js');
  assert.doesNotMatch(source, /CountdownTimer|handleExpire|onExpire/);
  assert.doesNotMatch(source, /setTimeout\([^)]*decline/s);
  assert.match(source, /Scheduled request/);
});

test('scope and job screens define their change-order state and require the PIN path', () => {
  const scope = read('src/screens/shared/ScopeConfirmScreen.js');
  const active = read('src/screens/labourer/ActiveJobScreen.js');
  assert.match(scope, /const \[changeModal, setChangeModal\] = useState\(false\)/);
  assert.match(scope, /const \[changeText, setChangeText\] = useState\(''\)/);
  assert.match(active, /const \[changeOrderModal, setChangeOrderModal\] = useState\(false\)/);
  assert.match(active, /const \[startPin, setStartPin\] = useState\(''\)/);
  assert.match(active, /bookingService\.start\(bookingId, startPin\)/);
  assert.doesNotMatch(active, /skip scope/i);
});

test('unsupported production claims and demo KYC success paths are absent', () => {
  const onboarding = read('src/screens/auth/OnboardingScreen.js');
  const kyc = read('src/screens/shared/KYCScreen.js');
  const customerActive = read('src/screens/customer/ActiveBookingScreen.js');
  const workerActive = read('src/screens/labourer/ActiveJobScreen.js');
  const notifications = read('src/services/notificationService.js');
  assert.doesNotMatch(onboarding, /hundreds of verified|background-checked|satisfaction is guaranteed|Book in 60 seconds/i);
  assert.doesNotMatch(kyc, /Simulate Selfie|demoBase64|Identity Verified!/i);
  assert.doesNotMatch(customerActive, /SOS Triggered|location is being shared|api\.post\('\/api\/safety\/sos'/i);
  assert.match(customerActive, /does not dispatch emergencies/i);
  assert.doesNotMatch(customerActive, /Tracking worker/i);
  assert.match(workerActive, /capabilityEnabled\(capabilities, 'emergency_call'\)/);
  assert.ok(
    notifications.indexOf("capabilityEnabled(capabilities, 'remote_push')")
      < notifications.indexOf('Notifications.getPermissionsAsync()')
  );
});
