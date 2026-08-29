'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const mobileRoot = path.resolve(__dirname, '..', '..');
const shellRoot = path.join(mobileRoot, 'src', 'features', 'worker', 'shell');

function read(name) {
  return fs.readFileSync(path.join(shellRoot, name), 'utf8');
}

function sourceFiles() {
  return fs.readdirSync(shellRoot)
    .filter((name) => /\.tsx?$/.test(name))
    .map((name) => ({ name, source: read(name) }));
}

test('W02, W03, W04 and W10 ship as exported screen-ready TypeScript modules', () => {
  const required = [
    'WorkerTodayScreen.tsx',
    'JobsInboxScreen.tsx',
    'IncomingOfferScreen.tsx',
    'WorkerEarningsScreen.tsx',
    'components.tsx',
    'copy.ts',
    'model.ts',
  ];
  const index = read('index.ts');
  for (const file of required) {
    assert.equal(fs.existsSync(path.join(shellRoot, file)), true, `missing ${file}`);
    assert.match(index, new RegExp(`'\\./${path.basename(file, path.extname(file))}'`));
  }
});

test('worker flagship visuals consume Grounded Momentum semantics and vector icons', () => {
  const joined = sourceFiles().map(({ source }) => source).join('\n');
  assert.match(joined, /from ['"]\.\.\/\.\.\/\.\.\/ui['"]/);
  assert.match(joined, /from ['"]\.\.\/\.\.\/\.\.\/design['"]/);
  assert.match(joined, /@expo\/vector-icons/);
  assert.doesNotMatch(joined, /#[\da-f]{3,8}\b/i);
  assert.doesNotMatch(joined, /\.\.\/\.\.\/\.\.\/theme(?:['"]|\b)/);
  assert.doesNotMatch(joined, /[😀-🙏🌀-🫿]/u);
  assert.match(joined, /theme\.typography\.h1/);
  assert.match(joined, /theme\.colors\.actionPrimary/);
  assert.match(joined, /elevation="card"/);
  assert.match(joined, /allowFontScaling/g);
});

test('screens are prop-driven and own no network, store, navigation or authoritative mutation', () => {
  for (const { name, source } of sourceFiles()) {
    assert.doesNotMatch(source, /from ['"]axios['"]|\bfetch\s*\(|\.post\s*\(|\.put\s*\(|\.patch\s*\(/, `${name} performs network work`);
    assert.doesNotMatch(source, /useNavigation|navigation\.|useDispatch|store\.|bookingService|locationService|earningsService/, `${name} owns integration state`);
    assert.doesNotMatch(source, /Date\.now\s*\(|Math\.random\s*\(/, `${name} fabricates time or identity`);
  }
  for (const file of [
    'WorkerTodayScreen.tsx',
    'JobsInboxScreen.tsx',
    'IncomingOfferScreen.tsx',
    'WorkerEarningsScreen.tsx',
  ]) {
    const source = read(file);
    assert.match(source, /export type \w+ScreenProps/);
    assert.match(source, /on[A-Z][A-Za-z]+: \([^)]*\) => void/);
  }
});

test('all flagship surfaces expose integration IDs and loading, empty, error and offline states', () => {
  const expectations = {
    'WorkerTodayScreen.tsx': 'worker-today-screen',
    'JobsInboxScreen.tsx': 'worker-jobs-inbox-screen',
    'IncomingOfferScreen.tsx': 'worker-incoming-offer-screen',
    'WorkerEarningsScreen.tsx': 'worker-earnings-screen',
  };
  for (const [file, testId] of Object.entries(expectations)) {
    const source = read(file);
    assert.match(source, new RegExp(`testID="${testId}"`));
    assert.match(source, /loading|ActivityIndicator/);
    assert.match(source, /error|ScreenError/);
    assert.match(source, /empty|EmptyState/);
    assert.match(source, /offline|OfflineBanner/);
  }
});

test('Today preserves authoritative availability and only its switch requests a change', () => {
  const model = read('model.ts');
  const screen = read('WorkerTodayScreen.tsx');
  assert.match(model, /availability:\s*Evidence<WorkerAvailabilityState>/);
  assert.match(model, /fastMatchEligibility:\s*Evidence<FastMatchEligibilityState>/);
  assert.match(model, /showSwitch:\s*false/);
  assert.match(model, /context\.connection === 'online' && !context\.requestPending/);
  assert.match(model, /eligibility === 'heartbeat_stale'/);
  assert.match(screen, /<Switch/);
  assert.match(screen, /onValueChange=\{\(online\) => onRequestAvailabilityChange\(online \? 'online' : 'offline'\)\}/);
  assert.match(screen, /onPress=\{onOpenAvailabilityDetails\}/);
  assert.match(screen, /availabilityChangePending/);
  assert.doesNotMatch(screen, /useState\([^)]*(online|offline)/i);
});

test('instant and scheduled offers have distinct server-expiry contracts without client declines', () => {
  const model = read('model.ts');
  const incoming = read('IncomingOfferScreen.tsx');
  assert.match(model, /kind:\s*'instant'/);
  assert.match(model, /serverExpiresAt:\s*Evidence<string>/);
  assert.match(model, /kind:\s*'scheduled'/);
  assert.match(model, /serverRespondBy:\s*Evidence<string>/);
  assert.match(model, /expiryKind:\s*'instant_window' \| 'scheduled_deadline'/);
  assert.match(model, /clientSideDecline:\s*false/);
  assert.match(model, /statusCode:\s*'window_elapsed_refresh'/);
  assert.doesNotMatch(model, /setInterval|setTimeout/);
  assert.doesNotMatch(incoming, /setInterval|setTimeout/);
  assert.match(incoming, /onBack=\{onDismiss\}/);
  assert.match(incoming, /onOfferArrivalHaptic\('offer-arrival', readyOfferId\)/);
  assert.doesNotMatch(incoming, /useEffect\([\s\S]{0,300}onDecline/);
});

test('cached or unsupported offers cannot expose an enabled accept attempt', () => {
  const model = read('model.ts');
  const incoming = read('IncomingOfferScreen.tsx');
  assert.match(model, /if \(!isSupported\(deadlineEvidence\)/);
  assert.match(model, /!isSupported\(offer\.cacheFreshness\)/);
  assert.match(model, /offer\.cacheFreshness\.value !== 'fresh'/);
  assert.match(model, /if \(deadline <= serverNow\)/);
  assert.match(model, /canAttemptAccept:\s*false/);
  assert.match(model, /if \(!isSupported\(offer\.acceptancePermission\)/);
  assert.match(incoming, /disabled=\{!action\.canAttemptAccept/);
  assert.match(incoming, /onAccept\(offer\.offerId\)/);
});

test('customer trust, travel and commercial values render only from explicit evidence', () => {
  const model = read('model.ts');
  const components = read('components.tsx');
  const incoming = read('IncomingOfferScreen.tsx');
  for (const field of ['customerTrust', 'broadArea', 'travel', 'commercial']) {
    assert.match(model, new RegExp(`${field}:\\s*Evidence<`));
  }
  assert.match(components, /isSupported\(offer\.travel\)/);
  assert.match(components, /isSupported\(offer\.commercial\)/);
  assert.match(components, /hasValidOfferCommercialBreakdown/);
  assert.match(incoming, /isSupported\(offer\.customerDisplayName\)/);
  assert.match(incoming, /<TrustEvidenceList/);
});

test('Earnings hides balance and payout promises until audited server evidence permits both', () => {
  const model = read('model.ts');
  const screen = read('WorkerEarningsScreen.tsx');
  assert.match(model, /payoutCapability:\s*Evidence<PayoutCapability, 'server_payout'>/);
  assert.match(model, /availableBalance:\s*Evidence<ZarAmount, 'server_payout'>/);
  assert.match(model, /nextPayout:\s*Evidence<NextPayout, 'server_payout'>/);
  assert.match(model, /value\.state === 'operational'/);
  assert.match(model, /value\.beneficiaryVerification === 'verified'/);
  assert.match(model, /value\.reconciliation === 'operational'/);
  assert.match(model, /value\.state === 'scheduled' \|\| snapshot\.nextPayout\.value\.state === 'processing'/);
  assert.match(model, /value\.expectedAt !== null/);
  assert.match(screen, /payout\.operational && \(payout\.showAvailableBalance \|\| payout\.showNextPayout\)/);
  assert.match(screen, /payout\.showAvailableBalance && payout\.availableBalance/);
  assert.match(screen, /payout\.showNextPayout && payout\.nextPayout/);
  assert.match(screen, /worker-payout-capability-off/);
});

test('earnings values and offer timers preserve hierarchy with tabular numeric glyphs', () => {
  assert.match(read('WorkerTodayScreen.tsx'), /theme\.typography\.numeric, theme\.typography\.h2/);
  assert.match(read('WorkerEarningsScreen.tsx'), /theme\.typography\.numeric, theme\.typography\.h2/);
  assert.match(read('components.tsx'), /theme\.typography\.numeric, theme\.typography\.h3/);
});

test('completed unpaid, cash and payout failures remain separate ledger presentations', () => {
  const model = read('model.ts');
  const screen = read('WorkerEarningsScreen.tsx');
  assert.match(model, /paymentMethod === 'cash'/);
  assert.match(model, /paymentState === 'cash_confirmed'/);
  assert.match(model, /paymentState === 'paid_online'/);
  assert.match(model, /row\.payoutState === 'failed' \|\| row\.payoutState === 'reversed'/);
  assert.match(model, /category:\s*'pending'/);
  assert.match(screen, /onOpenPayoutSupport/);
  assert.match(screen, /hasPayoutIssue/);
});

test('copy stays isolated, South African and free of fabricated people or hard-coded demo prices', () => {
  const copy = read('copy.ts');
  const screens = [
    read('WorkerTodayScreen.tsx'),
    read('JobsInboxScreen.tsx'),
    read('IncomingOfferScreen.tsx'),
    read('WorkerEarningsScreen.tsx'),
  ].join('\n');
  assert.match(copy, /WORKER_SHELL_SOURCE_LOCALE = 'en-ZA'/);
  assert.match(copy, /WORKER_SHELL_TIMEZONE = 'Africa\/Johannesburg'/);
  assert.match(copy, /createWorkerShellTranslator/);
  assert.match(copy, /formatZarEnZa/);
  assert.doesNotMatch(screens, /\bR\s?\d+[\d,.]*/);
  assert.doesNotMatch(screens, /Thabo|Sipho|Lerato|Jane P\.|worker-[0-9]/i);
});
