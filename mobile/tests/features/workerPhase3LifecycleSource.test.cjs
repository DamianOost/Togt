'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const mobileRoot = path.resolve(__dirname, '..', '..');
const lifecycleRoot = path.join(mobileRoot, 'src', 'features', 'worker', 'lifecycle');

function read(name) {
  return fs.readFileSync(path.join(lifecycleRoot, name), 'utf8');
}

function sourceFiles() {
  return fs.readdirSync(lifecycleRoot)
    .filter((name) => /\.tsx?$/.test(name))
    .sort()
    .map((name) => ({ name, source: read(name) }));
}

const screens = [
  ['WorkerActivationScreen.tsx', 'worker-activation-screen'],
  ['WorkerServicesProfileScreen.tsx', 'worker-services-profile-screen'],
  ['WorkerJobDetailScreen.tsx', 'worker-job-detail-screen'],
  ['WorkerScopeStartScreen.tsx', 'worker-scope-start-screen'],
  ['WorkerActiveWorkScreen.tsx', 'worker-active-work-screen'],
  ['WorkerCompletionScreen.tsx', 'worker-completion-screen'],
  ['WorkerAccountReadinessScreen.tsx', 'worker-account-readiness-screen'],
];

test('W01, W05-W09 and W11 ship as exported screen-ready modules', () => {
  const index = read('index.ts');
  for (const [file] of screens) {
    assert.equal(fs.existsSync(path.join(lifecycleRoot, file)), true, `missing ${file}`);
    assert.match(index, new RegExp(`'\\./${path.basename(file, '.tsx')}'`));
  }
  for (const moduleName of ['model', 'controller', 'copy', 'components']) {
    assert.match(index, new RegExp(`'\\./${moduleName}'`));
  }
});

test('every lifecycle screen is prop-driven, scalable and exposes a stable test ID', () => {
  for (const [file, testId] of screens) {
    const source = read(file);
    assert.match(source, new RegExp(`testID="${testId}"`));
    assert.match(source, /export type \w+ScreenProps = Readonly</);
    assert.match(source, /on[A-Z][A-Za-z]+: \([^)]*\) => void/);
    assert.match(source, /allowFontScaling/);
    assert.match(source, /AppScaffold/);
  }
});

test('surfaces stay inside Grounded UI, semantic tokens and the vector icon system', () => {
  const visual = sourceFiles().filter(({ name }) => name.endsWith('.tsx'));
  const joined = visual.map(({ source }) => source).join('\n');
  assert.match(joined, /from ['"]\.\.\/\.\.\/\.\.\/ui['"]/);
  assert.match(joined, /from ['"]\.\.\/\.\.\/\.\.\/design['"]/);
  assert.match(joined, /@expo\/vector-icons/);
  assert.doesNotMatch(joined, /#[\da-f]{3,8}\b/i);
  assert.doesNotMatch(joined, /[😀-🙏🌀-🫿]/u);
  assert.doesNotMatch(joined, /TouchableOpacity|TouchableHighlight|Pressable/);

  const glyphs = require('@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json');
  const staticNames = [...joined.matchAll(/<MaterialCommunityIcons\b[^>]*\bname="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(staticNames.length > 0);
  for (const name of staticNames) assert.ok(glyphs[name], `unknown MaterialCommunityIcons glyph: ${name}`);
});

test('the lifecycle slice owns no network, navigation, store, clock or random identity', () => {
  for (const { name, source } of sourceFiles()) {
    assert.doesNotMatch(source, /from ['"]axios['"]|\bfetch\s*\(|\.(?:post|put|patch|delete)\s*\(/, `${name} performs network work`);
    assert.doesNotMatch(source, /useNavigation|navigation\.|useDispatch|useSelector|useStore|store\.|bookingService|paymentService|locationService/, `${name} owns integration state`);
    assert.doesNotMatch(source, /Date\.now\s*\(|Math\.random\s*\(/, `${name} creates unstable identity`);
  }
});

test('all consequential Worker commands are versioned, idempotent and fail closed offline', () => {
  const controller = read('controller.ts');
  for (const command of [
    'save_service', 'set_service_active', 'save_public_profile', 'start_route', 'mark_arrived',
    'confirm_scope', 'request_scope_revision', 'verify_start_pin', 'request_change_order',
    'request_completion', 'acknowledge_policy', 'save_account_preference',
  ]) {
    assert.match(controller, new RegExp(`'${command}'`), `missing ${command}`);
  }
  assert.match(controller, /input\.connectionState === 'offline'/);
  assert.match(controller, /actorId: string/);
  assert.match(controller, /projectId: string \| null/);
  assert.match(controller, /stateVersion: number/);
  assert.match(controller, /requestKey: string/);
  assert.match(controller, /idempotencyKey: `worker-lifecycle:/);
  assert.match(controller, /stableHash/);
  assert.match(controller, /PROJECT_COMMANDS\.has\(input\.command\) && projectId === null/);
  for (const file of ['WorkerServicesProfileScreen.tsx', 'WorkerJobDetailScreen.tsx', 'WorkerScopeStartScreen.tsx', 'WorkerActiveWorkScreen.tsx', 'WorkerCompletionScreen.tsx']) {
    assert.match(read(file), /createWorkerLifecycleIntent/, `${file} bypasses the intent controller`);
  }
});

test('W01 exposes the complete evidence checklist, exact remedies and server Online permission', () => {
  const model = read('model.ts');
  const screen = read('WorkerActivationScreen.tsx');
  for (const kind of [
    'account_contact', 'identity_assurance', 'profile_photo', 'about_experience',
    'eligible_service', 'pricing_acceptance', 'service_area', 'payout_method',
    'foreground_location', 'safety_emergency', 'first_job_readiness',
  ]) {
    assert.match(model, new RegExp(`'${kind}'`), `missing activation prerequisite ${kind}`);
  }
  assert.match(model, /onlinePermission: LifecycleEvidence/);
  assert.match(model, /item\.status === 'incomplete' \|\| item\.status === 'failed'/);
  assert.match(model, /!item\.remedy\?\.trim\(\)/);
  assert.match(screen, /item\.visibility === 'public'/);
  assert.match(screen, /item\.visibility === 'private'/);
  assert.match(screen, /needsAction && hasImplementedActivationContentContract\(item\)/);
  assert.match(screen, /acknowledge-policy-\$\{policy\.kind\}/);
  assert.match(screen, /worker-emergency-contact-input/);
  assert.match(screen, /save-worker-emergency-contact/);
  assert.match(screen, /Device permission and other readiness checks remain separate/);
  assert.match(screen, /needsAction && !actionable/);
  assert.match(screen, /onOpenItem\(item\.destinationKey, item\.itemId\)/);
  assert.match(read('copy.ts'), /No version-matched completion action is enabled in this APK/);
  assert.match(screen, /disabled={!presentation\.canRequestOnline}/);
});

test('W05 keeps catalogue facts immutable while validating editable profile and offering evidence', () => {
  const model = read('model.ts');
  const screen = read('WorkerServicesProfileScreen.tsx');
  for (const fact of ['canonicalCategory', 'serviceVersion', 'pricingMode', 'riskTier', 'requiredCredentials', 'fixedPayoutRule']) {
    assert.match(model, new RegExp(`readonly ${fact}`));
  }
  assert.match(model, /hourlyRateBounds: LifecycleEvidence/);
  assert.match(model, /draft\.hourlyRateMinor < bounds\.minimum\.amountMinor/);
  assert.match(model, /draft\.hourlyRateMinor > bounds\.maximum\.amountMinor/);
  assert.match(screen, /service\.catalogueFacts/);
  assert.match(screen, /hasServerEvidence\(profile\.profilePhoto\)/);
  assert.match(screen, /profile\.photoReplacement\.previewUri/);
  assert.match(screen, /capabilities: WorkerProfileCapabilities \| null/);
  assert.match(screen, /capabilities\?\.credentialSubmission\.explanation/);
  assert.match(screen, /capabilities\?\.portfolioUpload\.explanation/);
  assert.match(screen, /PROFILE_PHOTO_REPLACEMENT_REASON/);
  assert.match(screen, /testID="profile-photo-replacement-unavailable"/);
  assert.match(screen, /testID={`credential-evidence-\$\{credential\.credentialId\}`}/);
  assert.doesNotMatch(screen, /onChooseProfilePhoto|onChoosePortfolioMedia|onOpenCredential/);
  assert.doesNotMatch(screen, /onPress=\{\(\) => onChoose|onPress=\{\(\) => onOpenCredential/);
  assert.match(screen, /publicBadges\.map/);
  assert.match(screen, /privateDetailLabels\.map/);
  assert.match(screen, /failed_rolled_back/);
  assert.match(screen, /connectionState === 'offline'/);
  assert.match(read('components.tsx'), /resource\.status === 'error'/);
  assert.match(read('components.tsx'), /resource\.status === 'empty'/);
});

test('W06 remains one authoritative state-driven Job surface with truthful travel and privacy states', () => {
  const model = read('model.ts');
  const screen = read('WorkerJobDetailScreen.tsx');
  for (const phase of ['accepted', 'scheduled', 'en_route', 'arrived', 'scope_confirmation', 'work_active', 'completion_review', 'payment_pending', 'closed', 'cancelled', 'unknown']) {
    assert.match(model, new RegExp(`'${phase}'`));
  }
  for (const tracking of ['hidden', 'not_started', 'sharing', 'stale', 'failed', 'stopped']) {
    assert.match(model, new RegExp(`'${tracking}'`));
  }
  assert.match(model, /exactRevealAuthorised && hasServerEvidence/);
  assert.match(model, /contactRevealAuthorised && hasServerEvidence/);
  assert.match(model, /phase === 'unknown'/);
  assert.match(screen, /const travelRelevant = phase === 'en_route' \|\| phase === 'arrived'/);
  assert.match(screen, /routeMap && \(snapshot\.tracking\.status === 'sharing' \|\| snapshot\.tracking\.status === 'stale'\)/);
  assert.match(screen, /<TrackingPanel snapshot={snapshot} \/>/);
  assert.match(screen, /onOpenNavigation\(snapshot\.projectId\)/);
  assert.match(screen, /onOpenSafetyHelp\(snapshot\.projectId\)/);
  assert.match(screen, /<ReadOnlyNotice/);
});

test('W07 enforces bilateral scope and actor-private, rate-limited, one-time PIN start', () => {
  const model = read('model.ts');
  const screen = read('WorkerScopeStartScreen.tsx');
  assert.match(model, /actor: 'worker'/);
  assert.match(model, /snapshot\.workerConfirmedAt !== null/);
  assert.match(model, /snapshot\.customerConfirmedAt !== null/);
  assert.match(model, /\^\\d\{4,8\}\$/);
  assert.match(model, /startOutcome\.actorAt !== null/);
  assert.match(model, /startOutcome\.deviceAt !== null/);
  assert.match(model, /startOutcome\.serverAt !== null/);
  assert.match(screen, /secureTextEntry/);
  assert.match(screen, /inputMode="numeric"/);
  assert.match(screen, /value\.replace\(\/\\D\/g, ''\)\.slice\(0, 8\)/);
  assert.match(screen, /command: ScopeCommand/);
  assert.match(screen, /'verify_start_pin'/);
  assert.doesNotMatch(screen, /Skip scope|skip_scope|onSkip/i);
  assert.match(read('copy.ts'), /There is no skip action/);
});

test('W08 requires a matching server ledger preview and preserves pending changes outside agreement', () => {
  const model = read('model.ts');
  const screen = read('WorkerActiveWorkScreen.tsx');
  assert.match(model, /hasLedgerEvidence\(draft\.preview\)/);
  assert.match(model, /preview\.additionalExpectedNet\.amountMinor !== preview\.additionalAmount\.amountMinor - preview\.platformFee\.amountMinor/);
  assert.match(model, /preview\.revisedTotal\.amountMinor !== preview\.baseTotal\.amountMinor \+ preview\.additionalAmount\.amountMinor/);
  assert.match(model, /order\.baseTotal\.amountMinor \+ order\.additionalAmount\.amountMinor === order\.revisedTotal\.amountMinor/);
  assert.match(screen, /request_change_order/);
  assert.match(screen, /request_completion/);
  assert.match(screen, /order\.status === 'approved'/);
  assert.match(screen, /order\.status === 'pending'/);
  assert.match(read('copy.ts'), /not part of the agreement until the customer approves them/);
});

test('W09 is bilateral and keeps fulfilment, customer payment, rating and payout eligibility separate', () => {
  const model = read('model.ts');
  const screen = read('WorkerCompletionScreen.tsx');
  assert.match(model, /'customer_confirmed'/);
  assert.match(model, /'disputed'/);
  assert.match(model, /'timed_out'/);
  assert.match(model, /snapshot\.status === 'disputed'/);
  assert.match(model, /snapshot\.status === 'customer_confirmed' \|\| snapshot\.status === 'resolved'/);
  assert.match(screen, /finalExpectedNet/);
  assert.match(screen, /paymentState/);
  assert.match(screen, /ratingEligibility/);
  assert.match(screen, /payoutEligibility/);
  assert.match(screen, /Eligibility does not promise payment, payout timing or transfer completion/);
  const combined = [model, screen, read('copy.ts')].join('\n');
  assert.doesNotMatch(combined, /\bescrow(?:ed)?\b/i);
  assert.doesNotMatch(combined, /payout (?:is|will be) (?:paid|sent|transferred)|paid to (?:the )?worker/i);
});

test('W11 represents every account/readiness destination with explicit public/private capability state', () => {
  const model = read('model.ts');
  const screen = read('WorkerAccountReadinessScreen.tsx');
  for (const kind of [
    'public_profile', 'verification_credentials', 'services_rates', 'service_area_availability',
    'payout_method', 'notifications_quiet_hours', 'language', 'emergency_safety',
    'privacy', 'account_deletion',
  ]) {
    assert.match(model, new RegExp(`'${kind}'`), `missing account destination ${kind}`);
  }
  assert.match(model, /status: 'ready' \| 'action_required' \| 'pending' \| 'unavailable'/);
  assert.match(screen, /entry\.visibility === 'public'/);
  assert.match(screen, /entry\.visibility === 'private'/);
  assert.match(screen, /entry\.status === 'unavailable'/);
  assert.match(screen, /entry\.destinationKey && onOpenEntry/);
  assert.match(screen, /onOpenSupport/);
  assert.match(screen, /onSignOut/);
});

test('screens contain no fabricated Worker, customer, price, rating, ETA or PIN evidence', () => {
  const joined = screens.map(([file]) => read(file)).join('\n');
  assert.doesNotMatch(joined, /\bR\s?\d+[\d,.]*/);
  assert.doesNotMatch(joined, /\b(?:Thabo|Sipho|Lerato|Anele|Damian)\b/i);
  assert.doesNotMatch(joined, /ETA\s+\d+|arrives? in \d+|\d+\s*minutes away/i);
  assert.doesNotMatch(joined, /\b[1-5]\.\d\s*\(\d+\)/);
  assert.doesNotMatch(joined, /(?:PIN|pin)[^\n]{0,24}["'`]\d{4,8}["'`]/);
});
