'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const mobileRoot = path.resolve(__dirname, '..', '..');
const trustRoot = path.join(mobileRoot, 'src', 'features', 'trust');

const screens = [
  'SafetySupportCentreScreen.tsx',
  'IncidentFormScreen.tsx',
  'IncidentDetailScreen.tsx',
  'SafeSharingScreen.tsx',
  'RelationshipActionsScreen.tsx',
  'RebookDraftScreen.tsx',
  'RecurringSeriesScreen.tsx',
  'RecurringOccurrenceScreen.tsx',
  'TrustFairnessScreen.tsx',
  'NotificationControlsScreen.tsx',
];

function read(name) {
  const file = path.join(trustRoot, name);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function trustFiles() {
  if (!fs.existsSync(trustRoot)) return [];
  return fs.readdirSync(trustRoot)
    .filter((name) => /\.tsx?$/.test(name))
    .sort()
    .map((name) => ({ name, source: read(name) }));
}

test('T01 through T06 ship as exported screen-ready trust modules', () => {
  const index = read('index.ts');
  for (const file of screens) {
    assert.equal(fs.existsSync(path.join(trustRoot, file)), true, `missing ${file}`);
    assert.match(index, new RegExp(`['"]\\./${path.basename(file, '.tsx')}['"]`));
  }
  for (const moduleName of ['model', 'controller', 'components']) {
    assert.equal(fs.existsSync(path.join(trustRoot, `${moduleName}.ts${moduleName === 'components' ? 'x' : ''}`)), true, `missing ${moduleName}`);
    assert.match(index, new RegExp(`['"]\\./${moduleName}['"]`));
  }
});

test('trust surfaces use Grounded primitives, semantic tokens and supported vector icons', () => {
  const joined = trustFiles().filter(({ name }) => name.endsWith('.tsx')).map(({ source }) => source).join('\n');
  assert.match(joined, /from ['"]\.\.\/\.\.\/ui['"]/);
  assert.match(joined, /from ['"]\.\.\/\.\.\/design['"]/);
  assert.match(joined, /@expo\/vector-icons/);
  assert.match(joined, /AppScaffold/);
  assert.match(joined, /allowFontScaling/);
  assert.doesNotMatch(joined, /#[\da-f]{3,8}\b/i);
  assert.doesNotMatch(joined, /[😀-🙏🌀-🫿]/u);
  assert.doesNotMatch(joined, /TouchableOpacity|TouchableHighlight/);
});

test('trust screens stay prop-driven and own no network, navigation or unstable mutation identity', () => {
  for (const { name, source } of trustFiles()) {
    assert.doesNotMatch(source, /from ['"]axios['"]|\bfetch\s*\(|\.(?:post|put|patch|delete)\s*\(/, `${name} performs network work`);
    assert.doesNotMatch(source, /useNavigation|navigation\.|useDispatch|useSelector|useStore|store\./, `${name} owns integration state`);
    assert.doesNotMatch(source, /Date\.now\s*\(|Math\.random\s*\(/, `${name} creates unstable command identity`);
  }
  for (const file of screens) {
    const source = read(file);
    assert.match(source, /export type \w+ScreenProps = Readonly/);
    assert.match(source, /testID="[^"]+-screen"/);
  }
});

test('T01 is record-only support with two separate dialer fallbacks and no operated emergency claim', () => {
  const joined = [
    read('model.ts'),
    read('controller.ts'),
    read('SafetySupportCentreScreen.tsx'),
    read('IncidentFormScreen.tsx'),
    read('IncidentDetailScreen.tsx'),
  ].join('\n');
  assert.match(joined, /['"]112['"]/);
  assert.match(joined, /['"]10111['"]/);
  assert.match(joined, /device_dialer|device dialler|phone dialler/i);
  assert.match(joined, /record_only|record.only/i);
  assert.match(joined, /humanAcknowledgementExpected|human acknowledgement/i);
  assert.match(joined, /emergencyServicesDispatched|emergency services[^\n]{0,40}not dispatch/i);
  assert.match(joined, /on(?:Call|Dial|Emergency)[A-Za-z0-9]+/);
  assert.doesNotMatch(joined, /(?:TOGT|we) (?:has |have )?(?:alerted|dispatched) (?:operations|emergency|help|responders)/i);
  assert.doesNotMatch(joined, /help (?:is|will be) on the way/i);
  assert.doesNotMatch(joined, /(?:respond|acknowledge)[^\n]{0,32}(?:within|in) \d+\s*(?:minutes?|hours?)/i);
  assert.doesNotMatch(joined, /on(?:Acknowledge|Escalate|Resolve|Dispatch)(?:Incident|Case|Emergency)/);
});

test('T02 exposes a sanitised non-live preview while public live sharing stays capability-off', () => {
  const source = read('SafeSharingScreen.tsx');
  const model = read('model.ts');
  const joined = `${model}\n${source}`;
  assert.match(joined, /bookingDetailsShare|booking_details_share/);
  assert.match(joined, /publicLiveShare|public_live_share/);
  assert.match(joined, /expiring_public_tokens_not_implemented|public live shar[^\n]{0,50}unavailable/i);
  for (const safeField of ['serviceLabel', 'broadAreaLabel', 'scheduleLabel', 'statusLabel']) {
    assert.match(joined, new RegExp(safeField), `safe share preview omits ${safeField}`);
  }
  assert.doesNotMatch(source, /preview\.(?:exactAddress|address|phone|contact|latitude|longitude|coordinates)/);
  assert.doesNotMatch(source, /on(?:Create|Enable|Start)PublicLiveShare/);
  assert.match(model, /containsPrivatePattern/);
  assert.match(model, /[^\\s@]+@[^\\s@]+/);
  assert.match(model, /street\|st\|road\|rd\|avenue\|ave/);
  assert.equal(model.includes('[0-9a-f]{8}-[0-9a-f]{4}'), true);
});

test('T03 consumes exact server eligibility and explains the full block boundary', () => {
  const joined = [read('model.ts'), read('controller.ts'), read('RelationshipActionsScreen.tsx')].join('\n');
  assert.match(joined, /relationshipEligible/);
  assert.match(joined, /actions\.favourite|actions\[['"]favourite['"]\]/);
  assert.match(joined, /actions\.rebookDraft|actions\[['"]rebookDraft['"]\]/);
  assert.match(joined, /actions\.createRecurringSeries|actions\[['"]createRecurringSeries['"]\]/);
  assert.match(joined, /futureMatchingAllowed/);
  assert.match(joined, /newContactAllowed/);
  assert.match(joined, /recurringRelationshipAllowed/);
  assert.match(joined, /favouriteActive \|\| eligibility\.actions\.favourite/, 'removal must stay possible after creation eligibility changes');
  assert.match(joined, /future match/i);
  assert.match(joined, /new contact|contact[^\n]{0,30}block/i);
  assert.match(joined, /recurr/i);
  assert.doesNotMatch(joined, /existing booking[^\n]{0,24}(?:is|will be|has been) cancel/i);
});

test('rebook remains an editable draft with every commercial confirmation still outstanding', () => {
  const source = read('RebookDraftScreen.tsx');
  const model = read('model.ts');
  const joined = `${model}\n${source}`;
  assert.match(joined, /confirmationsRequired|REBOOK_CONFIRMATION_LABELS/);
  for (const requirement of ['currentPrice', 'location', 'schedule', 'workerAvailability']) {
    assert.match(joined, new RegExp(requirement));
  }
  assert.match(source, /onSaveDraft/);
  assert.match(source, /draft/i);
  assert.match(source, /No price[^\n]{0,44}(?:set|included)|price[^\n]{0,44}(?:confirm|not set|not included|still required)/i);
  assert.doesNotMatch(source, /on(?:Book|ConfirmBooking|SubmitBooking)/);
  assert.doesNotMatch(source, /\bR\s?\d+[\d,.]*/);
  assert.doesNotMatch(source, /(?:booking confirmed|successfully booked|booking created)/i);
});

test('T04 keeps bilateral versioned series terms separate from occurrence decisions', () => {
  const joined = [
    read('model.ts'),
    read('controller.ts'),
    read('RecurringSeriesScreen.tsx'),
    read('RecurringOccurrenceScreen.tsx'),
  ].join('\n');
  assert.match(joined, /mutualAcceptanceRequired|Mutual acceptance is required/);
  assert.match(joined, /revision/);
  assert.match(joined, /termsRevision/);
  assert.match(joined, /occurrenceAndWholeSeriesAreDistinct|Occurrence and whole-series decisions are distinct/);
  assert.match(joined, /bookingCreationIsAutomatic|Booking creation is not automatic/);
  assert.match(joined, /eachOccurrenceRequiresBookingConfirmation|Each occurrence requires booking confirmation/);
  assert.match(joined, /onAcceptTerms/);
  assert.match(joined, /onRequestOccurrenceChange/);
  assert.match(joined, /onAcceptOccurrenceChange/);
  assert.match(joined, /onRequestCancelSeries/);
  assert.doesNotMatch(joined, /(?:automatically|successfully) (?:creates?|created|books?|booked) (?:a )?booking/i);
});

test('T05 presents explainable evidence, recovery and human review without an opaque score', () => {
  const joined = `${read('model.ts')}\n${read('TrustFairnessScreen.tsx')}`;
  assert.match(joined, /evidence/i);
  assert.match(joined, /sampleSize|sample size/i);
  assert.match(joined, /reasonCode|reason/i);
  assert.match(joined, /recovery|how to improve|next step/i);
  assert.match(joined, /humanReview|human review/i);
  assert.doesNotMatch(joined, /trustScore|fairnessScore|\bscore\s*(?:of|out of|:)\s*\d+/i);
  assert.doesNotMatch(joined, /incident\.summary|incidentDetails|privateIncident/i);
});

test('T06 separates notification categories, quiet hours and device permission truth', () => {
  const joined = `${read('model.ts')}\n${read('NotificationControlsScreen.tsx')}`;
  for (const category of ['offers', 'job_updates', 'chat', 'payment_payout', 'safety', 'marketing']) {
    assert.match(joined, new RegExp(`['"]${category}['"]`), `missing notification category ${category}`);
  }
  for (const state of ['unavailable', 'not_requested', 'denied', 'registered']) {
    assert.match(joined, new RegExp(`['"]${state}['"]`), `missing permission state ${state}`);
  }
  assert.match(joined, /quietHours/);
  assert.match(joined, /criticalSafety|critical safety|safety[^\n]{0,36}bypass/i);
  assert.doesNotMatch(joined, /permission[^\n]{0,36}(?:granted|enabled)[^\n]{0,36}(?:by default|automatically)/i);
});
