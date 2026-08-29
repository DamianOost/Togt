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

test('native map views are gated by the packaged maps provider', () => {
  const providerConfig = read('src/config/providerConfig.js');
  const packagedMap = read('src/components/PackagedMapView.js');
  const unavailableState = read('src/components/MapUnavailableState.js');
  const mapScreens = [
    'src/screens/customer/HomeMapScreen.js',
    'src/screens/customer/ActiveBookingScreen.js',
    'src/screens/labourer/ActiveJobScreen.js',
  ];

  assert.match(providerConfig, /Constants\.expoConfig\?\.extra/);
  assert.match(providerConfig, /export const MAPS_AVAILABLE = MAPS_POLICY\.available/);
  assert.match(packagedMap, /if \(!MAPS_AVAILABLE\)/);
  assert.match(packagedMap, /return <MapUnavailableState/);
  assert.ok(
    packagedMap.indexOf('if (!MAPS_AVAILABLE)') < packagedMap.indexOf('<NativeMapView'),
    'the packaged provider guard must run before native map mounting'
  );
  assert.match(unavailableState, /Map unavailable in this internal build/);
  for (const file of mapScreens) {
    const source = read(file);
    assert.match(source, /import PackagedMapView, \{ Marker \} from ['"]\.\.\/\.\.\/components\/PackagedMapView['"]/);
    assert.match(source, /<PackagedMapView/);
    assert.match(source, /unavailableDetail=/);
    assert.doesNotMatch(source, /from ['"]react-native-maps['"]/);
  }

  const directNativeImports = [
    'src/components/PackagedMapView.js',
    ...mapScreens,
  ].filter((file) => /from ['"]react-native-maps['"]/.test(read(file)));
  assert.deepEqual(directNativeImports, ['src/components/PackagedMapView.js']);
});

test('legacy discovery and identity copy does not overstate internal capabilities', () => {
  const requestMatch = read('src/screens/customer/RequestMatchScreen.js');
  const dashboard = read('src/screens/labourer/DashboardScreen.js');
  const homeMap = read('src/screens/customer/HomeMapScreen.js');
  const login = read('src/screens/auth/LoginScreen.js');

  assert.doesNotMatch(requestMatch, /verified labourer/i);
  assert.match(requestMatch, /eligible nearby workers/i);
  assert.doesNotMatch(dashboard, /✅ Verified|Tap to verify/i);
  assert.match(dashboard, /internal build/i);
  assert.doesNotMatch(homeMap, /unlock bookings/i);
  assert.match(homeMap, /internal build/i);
  assert.doesNotMatch(login, /instantly/i);
});

test('identity status requires a live capability and supported provider evidence', () => {
  const kyc = read('src/screens/shared/KYCScreen.js');
  const homeMap = read('src/screens/customer/HomeMapScreen.js');

  assert.match(kyc, /const status\s*=\s*formatStatus\(verification,\s*identityAvailable\)/);
  assert.match(
    kyc,
    /const supportedProvider\s*=\s*verification\?\.provider\s*===\s*['"]verifynow['"]\s*&&\s*!!verification\?\.verified_at;/
  );
  assert.match(kyc, /return identityAvailable\s*&&\s*supportedProvider/);
  assert.doesNotMatch(
    kyc,
    /if\s*\(value\s*===\s*['"]verified['"]\)\s*return\s*['"]Verified['"]/
  );
  assert.doesNotMatch(homeMap, /user\?\.kyc_status !== ['"]verified['"]\s*\?\s*\(/);
  assert.match(homeMap, /Legacy\/test identity status recorded/);
});

test('customer payment and worker earnings language requires server-confirmed payment', () => {
  const customerActive = read('src/screens/customer/ActiveBookingScreen.js');
  const earnings = read('src/screens/labourer/EarningsScreen.js');

  assert.doesNotMatch(customerActive, /Proceed to Payment/i);
  assert.match(customerActive, /View payment status/i);
  assert.match(
    earnings,
    /const paidBookings\s*=\s*bookings\.filter\([\s\S]{0,180}b\.status\s*===\s*['"]completed['"]\s*&&\s*b\.payment_status\s*===\s*['"]paid['"]/
  );
  assert.match(earnings, /const totalPaid\s*=\s*paidBookings\.reduce/);
  assert.match(earnings, /data=\{paidBookings\}/);
  assert.match(earnings, /Server-confirmed paid total/);
  assert.doesNotMatch(earnings, /Total Earned|No completed jobs yet/i);
});

test('scope and lifecycle visuals never imply agreement or unsupported milestones', () => {
  const scope = read('src/screens/shared/ScopeConfirmScreen.js');
  const workerActive = read('src/screens/labourer/ActiveJobScreen.js');

  assert.doesNotMatch(
    scope,
    /scopeItems\.forEach\([\s\S]{0,100}init\[[^\]]+\]\s*=\s*true/
  );
  assert.match(scope, /init\[[^\]]+\]\s*=\s*false/);
  assert.match(scope, /These are prompts, not an agreed scope/);
  assert.doesNotMatch(
    workerActive,
    /key:\s*['"](?:en_route|arrived)['"]|label:\s*['"](?:En Route|Arrived)['"]/
  );
  assert.doesNotMatch(workerActive, /BACKEND_STATUS_MAP/);
  assert.match(
    workerActive,
    /STATUS_STEPS\.findIndex\(\(step\)\s*=>\s*step\.key\s*===\s*currentStatus\)/
  );
});

test('tracking and sharing copy qualifies the evidence actually available', () => {
  const customerActive = read('src/screens/customer/ActiveBookingScreen.js');
  const workerActive = read('src/screens/labourer/ActiveJobScreen.js');

  assert.doesNotMatch(customerActive, /Worker has arrived!|Worker is ~\{workerEta\} min away/i);
  assert.match(customerActive, /within about 100 m/i);
  assert.match(customerActive, /Rough walking estimate:[\s\S]{0,80}straight-line/i);
  assert.match(customerActive, /Updates only while the worker has TOGT open/i);
  assert.match(customerActive, /locationUpdatedAt[\s\S]{0,180}toLocaleTimeString/);

  for (const source of [customerActive, workerActive]) {
    assert.doesNotMatch(source, /Could not generate share link/i);
    assert.match(source, /Could not prepare the booking summary/i);
  }
});

test('availability and matching copy describes request state without speed guarantees', () => {
  const requestMatch = read('src/screens/customer/RequestMatchScreen.js');
  const dashboard = read('src/screens/labourer/DashboardScreen.js');
  const profile = read('src/screens/customer/LabourerProfileScreen.js');
  const discover = read('src/screens/customer/DiscoverScreen.js');
  const jobRequests = read('src/screens/labourer/JobRequestsScreen.js');

  assert.doesNotMatch(requestMatch, /under 2 minutes/i);
  assert.match(requestMatch, /request is pending/i);
  assert.doesNotMatch(dashboard, /🟢 Online|⭕ Offline|go online|start earning/i);
  assert.match(dashboard, /Accepting requests/);
  assert.match(dashboard, /Requests paused/);
  assert.doesNotMatch(
    profile,
    /Available now|Experienced[\s\S]{0,100}professional available for jobs/i
  );
  assert.match(profile, /Accepting requests/);
  assert.match(profile, /Skills are self-described/i);
  assert.doesNotMatch(discover, /labourers? (?:are )?available/i);
  assert.match(discover, /active service listing/i);
  assert.doesNotMatch(jobRequests, /Open until someone chooses/i);
  assert.match(jobRequests, /Open until you respond or the customer cancels/i);
  assert.match(jobRequests, /formatZAR\(item\.total_amount\)\} est\./);
});
