'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const mobileRoot = path.resolve(__dirname, '..', '..');
const projectRoot = path.join(mobileRoot, 'src', 'features', 'customer', 'projects');

function read(name) {
  return fs.readFileSync(path.join(projectRoot, name), 'utf8');
}

function sourceFiles() {
  return fs.readdirSync(projectRoot)
    .filter((name) => /\.tsx?$/.test(name))
    .sort()
    .map((name) => ({ name, source: read(name) }));
}

test('C06 through C13 ship as exported, screen-ready TypeScript modules', () => {
  const required = [
    'MatchingWorkerChoiceScreen.tsx',
    'WorkerProfileScreen.tsx',
    'ProjectsListScreen.tsx',
    'OpenQuoteRequestsScreen.tsx',
    'ProjectHubScreen.tsx',
    'ScopeStartScreen.tsx',
    'ActiveWorkScreen.tsx',
    'ProjectChatScreen.tsx',
    'CompletionPaymentScreen.tsx',
  ];
  const index = read('index.ts');
  for (const file of required) {
    assert.equal(fs.existsSync(path.join(projectRoot, file)), true, `missing ${file}`);
    assert.match(index, new RegExp(`'\\./${path.basename(file, '.tsx')}'`));
  }
  for (const moduleName of ['model', 'copy', 'components']) {
    assert.match(index, new RegExp(`'\\./${moduleName}'`));
  }
});

test('all customer Project surfaces use Grounded primitives, semantic tokens and vector icons', () => {
  const screens = sourceFiles().filter(({ name }) => name.endsWith('.tsx'));
  const joined = screens.map(({ source }) => source).join('\n');
  assert.match(joined, /from ['"]\.\.\/\.\.\/\.\.\/ui['"]/);
  assert.match(joined, /from ['"]\.\.\/\.\.\/\.\.\/design['"]/);
  assert.match(joined, /@expo\/vector-icons/);
  assert.doesNotMatch(joined, /#[\da-f]{3,8}\b/i);
  assert.doesNotMatch(joined, /[😀-🙏🌀-🫿]/u);
  assert.doesNotMatch(joined, /height:\s*(?:4[0-7]|[1-3]\d|\d)\b/, 'interactive controls must not introduce sub-48 fixed heights');
});

test('every screen exposes a stable test ID, scaled copy and prop-driven callbacks', () => {
  const ids = {
    'MatchingWorkerChoiceScreen.tsx': 'matching-worker-choice-screen',
    'WorkerProfileScreen.tsx': 'worker-profile-screen',
    'ProjectsListScreen.tsx': 'projects-list-screen',
    'OpenQuoteRequestsScreen.tsx': 'open-quote-requests-screen',
    'ProjectHubScreen.tsx': 'project-hub-screen',
    'ScopeStartScreen.tsx': 'scope-start-screen',
    'ActiveWorkScreen.tsx': 'active-work-screen',
    'ProjectChatScreen.tsx': 'project-chat-screen',
    'CompletionPaymentScreen.tsx': 'completion-payment-screen',
  };
  for (const [file, id] of Object.entries(ids)) {
    const source = read(file);
    assert.match(source, new RegExp(`testID="${id}"`));
    assert.match(source, /export type \w+ScreenProps/);
    assert.match(source, /on[A-Z][A-Za-z]+: \([^)]*\) => void/);
    assert.match(source, /allowFontScaling/);
  }
});

test('the vertical slice performs no direct network, navigation, store or legacy service mutation', () => {
  for (const { name, source } of sourceFiles()) {
    assert.doesNotMatch(source, /from ['"]axios['"]|\bfetch\s*\(|\.(?:post|put|patch|delete)\s*\(/, `${name} performs network work`);
    assert.doesNotMatch(source, /useNavigation|navigation\.|useDispatch|useSelector|store\.|bookingService|paymentService|locationService/, `${name} owns integration state`);
    assert.doesNotMatch(source, /Date\.now\s*\(|Math\.random\s*\(/, `${name} creates unstable identity`);
  }
});

test('matching modes remain distinct with truthful terminal and recovery states', () => {
  const model = read('model.ts');
  for (const mode of ['fast_match', 'compare_workers', 'receive_quotes', 'diagnostic_visit']) {
    assert.match(model, new RegExp(`'${mode}'`), `missing ${mode}`);
  }
  for (const state of [
    'no_candidates', 'all_declined', 'connection_lost', 'awaiting_customer_rate_confirmation',
    'request_sent', 'worker_confirmed', 'slot_expired', 'lost_race',
    'partial', 'withdrawn', 'no_quotes', 'unavailable',
  ]) {
    assert.match(model, new RegExp(`'${state}'`), `missing truthful matching state ${state}`);
  }
  assert.match(model, /The Worker still needs to confirm\. This is not an instant booking\./);
  assert.match(model, /Later work is not included/);
  assert.match(read('components.tsx'), /selectionKind/);
});

test('authoritative lifecycle, privacy, scope, completion and money stay parallel', () => {
  const model = read('model.ts');
  for (const phase of ['matching', 'assigned', 'scheduled', 'en_route', 'arrived', 'scope_confirmation', 'work_active', 'completion_review', 'payment_pending', 'closed', 'unknown']) {
    assert.match(model, new RegExp(`'${phase}'`));
  }
  for (const domain of ['PaymentSnapshot', 'ScopeSnapshot', 'CompletionSnapshot', 'TrackingEvidence', 'ChangeOrder']) {
    assert.match(model, new RegExp(`interface ${domain}|type ${domain}`));
  }
  assert.match(model, /exactRevealAuthorised/);
  assert.match(model, /broad_area_only/);
  assert.match(model, /workerConfirmedAt !== null && scope\.customerConfirmedAt !== null/);
  assert.match(model, /baseTotal\.amountMinor \+ order\.additionalAmount\.amountMinor !== order\.revisedTotal\.amountMinor/);
});

test('travel location exposes stale and hidden semantics while keeping non-map actions', () => {
  const model = read('model.ts');
  const screen = read('ProjectHubScreen.tsx');
  assert.match(model, /kind: 'hidden' \| 'not_shared' \| 'live' \| 'stale' \| 'unavailable'/);
  assert.match(model, /preserveNonMapActions: true/);
  assert.match(model, /This position is older than the live-location freshness window/);
  assert.match(screen, /onOpenChat/);
  assert.match(screen, /onOpenSafetyHelp/);
  assert.match(screen, /travelMap && \(travel\.kind === 'live' \|\| travel\.kind === 'stale'\)/);
});

test('all consequential actions emit stable idempotent intents and fail closed offline', () => {
  const model = read('model.ts');
  assert.match(model, /connectionState === 'offline'/);
  assert.match(model, /idempotencyKey: `customer-project:/);
  assert.match(model, /stableHash/);
  assert.match(model, /actorId/);
  assert.match(model, /requestKey/);
  assert.match(model, /stateVersion/);
  for (const file of [
    'MatchingWorkerChoiceScreen.tsx', 'ProjectsListScreen.tsx', 'ScopeStartScreen.tsx',
    'ActiveWorkScreen.tsx', 'ProjectChatScreen.tsx', 'CompletionPaymentScreen.tsx',
  ]) {
    assert.match(read(file), /createCustomerCommandIntent/, `${file} bypasses command intent construction`);
  }
});

test('payment stays provider/server verified and makes no escrow or Worker-payout promise', () => {
  const combined = [read('model.ts'), read('copy.ts'), read('CompletionPaymentScreen.tsx')].join('\n');
  assert.match(combined, /checkoutCapability: 'available' \| 'unavailable'/);
  assert.match(combined, /awaiting_reconciliation/);
  assert.match(combined, /corrected_late_success/);
  assert.match(combined, /refundStatus/);
  assert.match(combined, /paymentDisputeStatus/);
  assert.match(combined, /Customer payment status does not claim that Worker payout is complete/);
  assert.doesNotMatch(combined, /\bescrow(?:ed)?\b/i);
  assert.doesNotMatch(combined, /paid to (?:the )?worker|worker has been paid/i);
});

test('ratings announce exact values and retention CTAs are capability gated', () => {
  const screen = read('CompletionPaymentScreen.tsx');
  const model = read('model.ts');
  assert.match(screen, /accessibilityLabel={`\$\{value\} out of 5`}/);
  assert.match(screen, /accessibilityRole="radio"/);
  assert.match(screen, /snapshot\.rating\.selectedValue/);
  assert.match(model, /relationshipsAvailable/);
  assert.match(model, /completeAndPaid && input\.capabilities\.relationshipsAvailable/);
});

test('screens do not hard-code customer prices, ETAs, ratings or synthetic Worker identities', () => {
  const screens = sourceFiles().filter(({ name }) => name.endsWith('.tsx')).map(({ source }) => source).join('\n');
  assert.doesNotMatch(screens, /\bR\s?\d+[\d,.]*/);
  assert.doesNotMatch(screens, /\b(?:Thabo|Sipho|Lerato|Anele)\b/i);
  assert.doesNotMatch(screens, /ETA\s+\d+|arrives in \d+/i);
  assert.doesNotMatch(screens, /\b[1-5]\.\d\s*\(\d+\)/);
});

test('open quote-request recovery has a stable entry, cards and privacy-safe display contract', () => {
  const projects = read('ProjectsListScreen.tsx');
  const recovery = read('OpenQuoteRequestsScreen.tsx');
  assert.match(projects, /testID="open-quote-requests-entry"/);
  assert.match(recovery, /testID="open-quote-requests-list"/);
  assert.match(recovery, /testID={`open-quote-request-\$\{request\.requestId\}`}/);
  assert.match(recovery, /quoteRequests\.privacy/);
  assert.doesNotMatch(recovery, /privateLocation|exactAddress|accessInstructions|latitude|longitude|customerId/);
});
