'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const mobileRoot = path.resolve(__dirname, '..', '..');
const intakeRoot = path.join(mobileRoot, 'src', 'features', 'customer', 'intake');

function read(name) {
  return fs.readFileSync(path.join(intakeRoot, name), 'utf8');
}

function sourceFiles() {
  return fs.readdirSync(intakeRoot)
    .filter((name) => /\.tsx?$/.test(name))
    .map((name) => ({ name, source: read(name) }));
}

test('C01 through C05 ship as screen-ready exported TypeScript modules', () => {
  const required = [
    'CustomerHomeScreen.tsx',
    'GuidedJobBriefScreen.tsx',
    'AddressPinConfirmationScreen.tsx',
    'ScheduleFulfilmentScreen.tsx',
    'ReviewEstimateScreen.tsx',
  ];
  const index = read('index.ts');
  for (const file of required) {
    assert.equal(fs.existsSync(path.join(intakeRoot, file)), true, `missing ${file}`);
    assert.match(index, new RegExp(`'\\./${path.basename(file, '.tsx')}'`));
  }
  for (const name of ['model', 'copy', 'components']) {
    assert.match(index, new RegExp(`'\\./${name}'`));
  }
});

test('the vertical slice consumes Grounded Momentum UI, semantic design tokens and vector icons', () => {
  const joined = sourceFiles().map(({ source }) => source).join('\n');
  assert.match(joined, /from ['"]\.\.\/\.\.\/\.\.\/ui['"]/);
  assert.match(joined, /from ['"]\.\.\/\.\.\/\.\.\/design['"]/);
  assert.match(joined, /@expo\/vector-icons/);
  assert.doesNotMatch(joined, /#[\da-f]{3,8}\b/i);
  assert.doesNotMatch(joined, /\.\.\/\.\.\/\.\.\/theme(?:['"]|\b)/);
  assert.doesNotMatch(joined, /[😀-🙏🌀-🫿]/u);
  assert.match(joined, /allowFontScaling/g);
});

test('all five screens expose stable integration test identifiers and prop-driven callbacks', () => {
  const ids = {
    'CustomerHomeScreen.tsx': 'customer-home-screen',
    'GuidedJobBriefScreen.tsx': 'guided-job-brief-screen',
    'AddressPinConfirmationScreen.tsx': 'address-pin-confirmation-screen',
    'ScheduleFulfilmentScreen.tsx': 'schedule-fulfilment-screen',
    'ReviewEstimateScreen.tsx': 'review-estimate-screen',
  };
  for (const [file, id] of Object.entries(ids)) {
    const source = read(file);
    assert.match(source, new RegExp(`testID="${id}"`));
    assert.match(source, /export type \w+ScreenProps/);
    assert.match(source, /on[A-Z][A-Za-z]+: \([^)]*\) => void/);
  }
});

test('the slice has no direct network, store, navigation or legacy service mutation', () => {
  for (const { name, source } of sourceFiles()) {
    assert.doesNotMatch(source, /from ['"]axios['"]|\bfetch\s*\(|\.post\s*\(|\.put\s*\(|\.patch\s*\(/, `${name} performs network work`);
    assert.doesNotMatch(source, /useNavigation|navigation\.|useDispatch|store\.|bookingService|locationService/, `${name} owns integration state`);
    assert.doesNotMatch(source, /Date\.now\s*\(|Math\.random\s*\(/, `${name} creates nondeterministic identity`);
  }
});

test('model covers every price and fulfilment mode with explicit offline and idempotency contracts', () => {
  const model = read('model.ts');
  for (const mode of ['fixed', 'hourly', 'remote_quote', 'diagnostic_visit']) {
    assert.match(model, new RegExp(`'${mode}'`), `missing pricing mode ${mode}`);
  }
  for (const mode of ['fast_match', 'compare_workers', 'receive_quotes', 'diagnostic_visit']) {
    assert.match(model, new RegExp(`'${mode}'`), `missing fulfilment mode ${mode}`);
  }
  assert.match(model, /connectionState === 'offline'/);
  assert.match(model, /saved_locally/);
  assert.match(model, /version|Version/);
  assert.match(model, /idempotencyKey/);
  assert.match(model, /stableFingerprint/);
  assert.match(model, /Object\.freeze|deepFreeze/);
});

test('manual address fallback and capability-off states remain visible without a map', () => {
  const address = read('AddressPinConfirmationScreen.tsx');
  const shared = read('components.tsx');
  assert.match(address, /address\.manualTitle/);
  assert.match(address, /address\.search/);
  assert.match(address, /onSelectAddressSuggestion/);
  assert.match(address, /address\.resolve/);
  assert.match(address, /coordinatesReady/);
  assert.match(address, /address\.mapUnavailable/);
  assert.match(address, /onResolveManualAddress/);
  assert.match(address, /updateJobAddressDetail\(address, field, value\)/);
  assert.match(shared, /capability\.status === 'available'/);
  assert.match(shared, /capability\.explanation/);
});

test('current location fails closed until reverse-geocoding can verify displayed address text', () => {
  const route = fs.readFileSync(path.join(
    mobileRoot,
    'src',
    'features',
    'customer',
    'integration',
    'CustomerIntakeRoutes.tsx',
  ), 'utf8');
  const address = read('AddressPinConfirmationScreen.tsx');
  const model = read('model.ts');

  assert.doesNotMatch(route, /from ['"]expo-location['"]/);
  assert.doesNotMatch(route, /requestForegroundPermissionsAsync|getCurrentPositionAsync/);
  assert.match(route, /reverse_geocoding_not_configured/);
  assert.match(route, /currentLocationCapability=\{UNAVAILABLE_CURRENT_LOCATION\}/);
  assert.match(route, /isAddressResolutionDispatchSafe\(snapshot\.address\)/);
  assert.match(address, /isAddressResolutionDispatchSafe\(address\)/);
  assert.match(address, /address\.coordinatesUnverified/);
  assert.match(model, /source === 'map_pin'[\s\S]*source === 'saved_verified_place'[\s\S]*source === 'provider_geocode'/);
  assert.match(model, /isAddressResolutionDispatchSafe\(draft\.address\)[\s\S]*coordinates_unverified/);
});

test('copy is keyed, South African, and no screens hard-code prices or synthetic workers', () => {
  const copy = read('copy.ts');
  const screens = [
    read('CustomerHomeScreen.tsx'),
    read('GuidedJobBriefScreen.tsx'),
    read('AddressPinConfirmationScreen.tsx'),
    read('ScheduleFulfilmentScreen.tsx'),
    read('ReviewEstimateScreen.tsx'),
  ].join('\n');
  assert.match(copy, /SOURCE_LOCALE/);
  assert.match(copy, /formatZarEnZa/);
  assert.match(copy, /Africa\/Johannesburg/);
  assert.doesNotMatch(screens, /\bR\s?\d+[\d,.]*/);
  assert.doesNotMatch(screens, /Thabo|Sipho|Lerato|worker-[0-9]/i);
});
