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
    assert.doesNotMatch(source, /Math\.random\s*\(/, `${name} creates nondeterministic identity`);
    assert.doesNotMatch(source, /(?:draftId|idempotencyKey)[\s\S]{0,80}Date\.now\s*\(/, `${name} creates time-based identity`);
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

test('manual address entry and one truthful map-off state remain visible without provider UI', () => {
  const address = read('AddressPinConfirmationScreen.tsx');
  const shared = read('components.tsx');
  assert.match(address, /address\.locationDetails/);
  assert.match(address, /address\.search/);
  assert.match(address, /onSelectAddressSuggestion/);
  assert.match(address, /address\.exactLocation/);
  assert.match(address, /exact-location-card/);
  assert.match(address, /mapCapability\.status === 'available'/);
  assert.match(address, /<CapabilityNotice capability=\{mapCapability\}/);
  assert.doesNotMatch(address, /address\.resolve|onResolveManualAddress/);
  assert.match(address, /updateJobAddressDetail\(address, field, value\)/);
  assert.match(shared, /capability\.status === 'available'/);
  assert.match(shared, /capability\.explanation/);
});

test('foreground GPS is explicit camera-seed input and only pin acceptance creates map provenance', () => {
  const route = fs.readFileSync(path.join(
    mobileRoot,
    'src',
    'features',
    'customer',
    'integration',
    'CustomerIntakeRoutes.tsx',
  ), 'utf8');
  const address = read('AddressPinConfirmationScreen.tsx');
  const picker = read('ExactPinPickerScreen.tsx');
  const model = read('model.ts');
  const context = fs.readFileSync(path.join(
    mobileRoot,
    'src',
    'features',
    'customer',
    'integration',
    'CustomerExperienceContext.tsx',
  ), 'utf8');

  assert.doesNotMatch(route, /from ['"]expo-location['"]/);
  assert.doesNotMatch(route, /requestForegroundPermissionsAsync|getCurrentPositionAsync/);
  assert.match(route, /locationService\.requestForegroundPosition\(\)/);
  assert.match(route, /captureAddressPickerCommitGuard\(draft\)/);
  assert.match(route, /const guard = pickerGuardFromRoute\(route\.params\?\.guard\);/);
  assert.doesNotMatch(route, /pickerGuardFromRoute\(route\.params\?\.guard\) \?\?/);
  assert.match(route, /testID="exact-pin-picker-invalid-state"/);
  assert.match(route, /commitAddressPin\(guard, coordinates\)/);
  assert.doesNotMatch(route, /commitMapPinForDraft\(draft, guard, coordinates\)/);
  assert.match(context, /commitMapPinForDraft\(draftRef\.current, guard, coordinates\)|const current = draftRef\.current;[\s\S]*commitMapPinForDraft\(current, guard, coordinates\)/);
  assert.match(context, /draftMutationEpoch\.current !== restoreStartedAtEpoch/);
  assert.match(context, /const reviseDraft[\s\S]*draftMutationEpoch\.current \+= 1;[\s\S]*updateDraft/);
  assert.match(context, /const commitAddressPin[\s\S]*if \(!committed\.ok\) return committed;[\s\S]*draftMutationEpoch\.current \+= 1;[\s\S]*updateDraft/);
  assert.match(route, /await getCapabilityStateAtAction\('maps_display'[\s\S]*!routeActive\.current[\s\S]*commitAddressPin\(guard, coordinates\)/);
  assert.match(route, /getCapabilityStateAtAction\('maps_display'/);
  assert.match(route, /isAddressResolutionDispatchSafe\(snapshot\.address\)/);
  assert.match(address, /isAddressResolutionDispatchSafe\(address\)/);
  assert.doesNotMatch(picker, /from ['"]expo-location['"]|locationService/);
  assert.match(picker, /label="Centre on my location"/);
  assert.match(picker, /onPress=\{\(\) => \{ void centreOnLocation\(\); \}\}/);
  assert.match(picker, /label="Use this pin"/);
  assert.match(picker, /Place pin at map centre/);
  assert.match(picker, /disabled=\{!candidate \|\| !mapAvailable \|\| !mapReady/);
  assert.match(picker, /const candidateAtStart = candidateRef\.current/);
  assert.match(picker, /candidateRevisionAtStart[\s\S]*await refreshCapability\(\)[\s\S]*isCandidateRevisionCurrent\(candidateRevisionAtStart, candidateRevision\.current\)/);
  assert.match(picker, /pointerEvents=\{committing \? 'none' : 'auto'\}/);
  assert.match(picker, /draggable=\{!committing\}/);
  assert.match(picker, /initialCoordinate \? closePinRegion\(initialCoordinate\) : SOUTH_AFRICA_OVERVIEW_REGION/);
  assert.match(picker, /initialRegion=\{visibleRegion\}/);
  assert.match(picker, /candidate \? closePinRegion\(candidate\) : visibleRegion/);
  assert.match(model, /source === 'map_pin'[\s\S]*source === 'saved_verified_place'[\s\S]*source === 'provider_geocode'/);
  assert.match(model, /source: 'map_pin'/);
  assert.match(model, /isAddressResolutionDispatchSafe\(draft\.address\)[\s\S]*coordinates_unverified/);
});

test('the exact-pin surface is dedicated, accessible and preserves explicit acceptance', () => {
  const picker = read('ExactPinPickerScreen.tsx');
  const preview = read('ExactLocationMapPreview.tsx');
  const route = fs.readFileSync(path.join(
    mobileRoot,
    'src',
    'features',
    'customer',
    'integration',
    'CustomerIntakeRoutes.tsx',
  ), 'utf8');
  const stack = fs.readFileSync(path.join(mobileRoot, 'src', 'navigation', 'GroundedCustomerStack.tsx'), 'utf8');

  assert.match(stack, /name="ExactPinPicker"[\s\S]*component=\{CustomerExactPinPickerRoute\}/);
  assert.match(stack, /presentation: 'modal'/);
  assert.match(route, /navigation\.navigate\('ExactPinPicker'/);
  assert.match(picker, /testID="exact-pin-picker-screen"/);
  assert.match(picker, /accessibilityLiveRegion="assertive"/);
  assert.match(picker, /AccessibilityInfo\.setAccessibilityFocus/);
  assert.match(picker, /accessibilityHint="Requests foreground location permission/);
  assert.match(picker, /draggable/);
  assert.match(picker, /onDragEnd/);
  assert.match(picker, /onRegionChangeComplete/);
  assert.match(picker, /Place pin at map centre/);
  assert.match(preview, /pointerEvents="none"/);
  assert.match(preview, /importantForAccessibility="no-hide-descendants"/);
  assert.match(preview, /region=\{closePinRegion\(coordinates\)\}/);
  assert.match(route, /const routeActive = useRef\(true\)/);
  assert.match(route, /if \(!routeActive\.current\) return;/);
  assert.match(picker, /active\.current = false;[\s\S]*onCancel\(\)/);
  assert.ok(
    picker.indexOf("announceForAccessibility('Exact job pin saved.')")
      < picker.indexOf('onCommitSuccess();'),
    'TalkBack success must be queued before the route is dismissed',
  );
  assert.match(route, /onCommitSuccess=\{\(\) => \{[\s\S]*navigation\.goBack\(\)/);
});

test('foreground location distinguishes approximate, denied and blocked results without background access', () => {
  const service = fs.readFileSync(path.join(mobileRoot, 'src', 'services', 'locationService.js'), 'utf8');
  const app = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'app.json'), 'utf8')).expo;

  assert.match(service, /async requestForegroundPosition\(\)/);
  assert.match(service, /requestForegroundPermissionsAsync\(\)/);
  assert.match(service, /permission\.android\?\.accuracy === 'coarse'/);
  assert.match(service, /granted_approximate/);
  assert.match(service, /location_permission_denied/);
  assert.match(service, /location_permission_blocked/);
  assert.doesNotMatch(service, /requestBackgroundPermissionsAsync/);
  assert.doesNotMatch(app.android.permissions.join(','), /ACCESS_BACKGROUND_LOCATION/);
  assert.ok(app.android.blockedPermissions.includes('android.permission.ACCESS_BACKGROUND_LOCATION'));
});

test('boolean catalogue questions use keyed Yes and No controls with literal boolean answers', () => {
  const screen = read('GuidedJobBriefScreen.tsx');
  const copy = read('copy.ts');
  assert.match(copy, /'common\.yes': 'Yes'/);
  assert.match(copy, /'common\.no': 'No'/);
  assert.match(screen, /label=\{translate\('common\.yes'\)\}[\s\S]*onPress=\{\(\) => onChange\(true\)\}/);
  assert.match(screen, /label=\{translate\('common\.no'\)\}[\s\S]*onPress=\{\(\) => onChange\(false\)\}/);
});

test('the confirmed materials responsibility crosses the quote request boundary', () => {
  const screen = read('GuidedJobBriefScreen.tsx');
  const route = fs.readFileSync(path.join(
    mobileRoot,
    'src',
    'features',
    'customer',
    'integration',
    'CustomerIntakeRoutes.tsx',
  ), 'utf8');
  assert.match(screen, /activeStep === 'responsibility'[\s\S]*draft\.brief\.materialsResponsibility !== null/);
  assert.match(route, /materialsResponsibility: snapshot\.brief\.materialsResponsibility/);
  assert.match(route, /quote_materials_responsibility_missing/);
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
