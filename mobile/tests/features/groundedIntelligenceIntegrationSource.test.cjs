'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const mobileRoot = path.resolve(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(mobileRoot, ...parts), 'utf8');

test('Phase 4 services capability-gate every provider or live endpoint before transport', () => {
  const source = read('src', 'services', 'groundedIntelligence.ts');
  const cases = [
    ["await requireCapability('ai_assisted_intake')", "url: '/api/intent/extract'"],
    ["await requireCapability('explainable_recommendations')", '/api/recommendations/quote-requests/'],
    ["await requireCapability('android_live_updates')", '/api/projects/${expectedProjectId}/live-status'],
  ];
  for (const [gate, endpoint] of cases) {
    const gateIndex = source.indexOf(gate);
    const endpointIndex = source.indexOf(endpoint, gateIndex);
    assert.ok(gateIndex >= 0, `missing gate ${gate}`);
    assert.ok(endpointIndex > gateIndex, `endpoint ${endpoint} must occur after ${gate}`);
  }
  assert.match(source, /Capability is checked before inspecting or serialising customer input/);
});

test('the packaged capability policy keeps all Phase 4 provider surfaces disabled by default', () => {
  const policy = read('src', 'config', 'capabilityPolicy.cjs');
  for (const name of ['ai_assisted_intake', 'explainable_recommendations', 'android_live_updates', 'contextual_safety_education']) {
    assert.match(policy, new RegExp(`${name}: false`));
  }
});

test('runtime capability evaluation derives its Phase 4 allow-list from packaged flags', () => {
  const service = read('src', 'services', 'capabilityService.js');
  assert.match(service, /buildAllowListForPackagedFlags/);
  assert.match(service, /aiAssistedIntake:\s*packagedFeatureEnabled\('aiAssistedIntake'\)/);
  assert.match(service, /explainableRecommendations:\s*packagedFeatureEnabled\('explainableRecommendations'\)/);
  assert.match(service, /livePlatformStatus:\s*packagedFeatureEnabled\('livePlatformStatus'\)/);
  assert.match(service, /contextualSafetyEducation:\s*packagedFeatureEnabled\('contextualSafetyEducation'\)/);
  assert.match(service, /allowList:\s*PACKAGED_CAPABILITY_ALLOW_LIST/);
});

test('mounted customer and Worker surfaces expose truthful Phase 4 CTAs and fallbacks', () => {
  const intakeRoutes = read('src', 'features', 'customer', 'integration', 'CustomerIntakeRoutes.tsx');
  const projectRoutes = read('src', 'features', 'customer', 'integration', 'CustomerProjectRoutes.tsx');
  const workerRoutes = read('src', 'features', 'worker', 'integration', 'WorkerLifecycleRoutes.tsx');
  const home = read('src', 'features', 'customer', 'intake', 'CustomerHomeScreen.tsx');
  const matching = read('src', 'features', 'customer', 'projects', 'MatchingWorkerChoiceScreen.tsx');
  const project = read('src', 'features', 'customer', 'projects', 'ProjectHubScreen.tsx');
  const worker = read('src', 'features', 'worker', 'lifecycle', 'WorkerJobDetailScreen.tsx');

  assert.match(intakeRoutes, /packagedFeatureEnabled\('aiAssistedIntake'\)/);
  assert.match(intakeRoutes, /loadIntelligenceCapability\('ai_assisted_intake'/);
  assert.match(home, /CapabilityNotice capability=\{voiceAssistanceCapability\}/);
  assert.match(home, /voiceAssistanceCapability\.status === 'available'/);

  assert.match(intakeRoutes, /packagedFeatureEnabled\('explainableRecommendations'\)/);
  assert.match(intakeRoutes, /loadIntelligenceCapability\('explainable_recommendations'/);
  assert.match(matching, /Why this recommendation\?/);
  assert.match(matching, /Compare every quote directly; no ranking claim is shown/);

  assert.match(projectRoutes, /packagedFeatureEnabled\('livePlatformStatus'\)/);
  assert.match(projectRoutes, /loadIntelligenceCapability\('android_live_updates'/);
  assert.match(workerRoutes, /packagedFeatureEnabled\('livePlatformStatus'\)/);
  assert.match(workerRoutes, /loadIntelligenceCapability\('android_live_updates'/);
  assert.match(project, /This Project Hub remains authoritative/);
  assert.match(worker, /This Job detail remains authoritative/);
});

test('contextual safety education is package-and-server gated, persisted before display and dismissible', () => {
  const customerRoutes = read('src', 'features', 'customer', 'integration', 'CustomerProjectRoutes.tsx');
  const workerRoutes = read('src', 'features', 'worker', 'integration', 'WorkerLifecycleRoutes.tsx');
  const store = read('src', 'services', 'safetyEducationStore.ts');
  const card = read('src', 'features', 'intelligence', 'ContextualSafetyEducationCard.tsx');

  for (const routes of [customerRoutes, workerRoutes]) {
    assert.match(routes, /packagedFeatureEnabled\('contextualSafetyEducation'\)/);
    assert.match(routes, /loadIntelligenceCapability\('contextual_safety_education'/);
    assert.match(routes, /claimContextualSafetyEducation/);
  }
  assert.match(workerRoutes, /phase === 'arrived' \|\| phase === 'scope_confirmation'/);
  assert.match(store, /MAX_LIFETIME_SHOWS = 3/);
  assert.match(store, /COOLDOWN_DAYS = 14/);
  assert.match(store, /shouldShowSafetyEducation/);
  assert.ok(
    store.indexOf('await AsyncStorage.setItem') < store.indexOf('return true'),
    'the frequency record must persist before rendering is authorised'
  );
  assert.match(card, /Dismiss reminder/);
  assert.match(card, /general guidance, not an alert/i);
  assert.doesNotMatch(card, /emergency|danger|warning/i);
});

test('camera, Fast Match, Compare and Diagnostic remain fail-closed in the mounted intake', () => {
  const source = read('src', 'features', 'customer', 'integration', 'CustomerIntakeRoutes.tsx');
  assert.match(source, /cameraCapability=\{UNAVAILABLE_MEDIA\}/);
  assert.match(source, /photoCapability=\{UNAVAILABLE_MEDIA\}/);
  assert.match(source, /fast_match:\s*unavailable\('matching_contract_not_enabled'/);
  assert.match(source, /compare_workers:\s*unavailable\('reservation_contract_not_enabled'/);
  assert.match(source, /diagnostic_visit:\s*unavailable\('diagnostic_contract_not_enabled'/);
  assert.match(source, /if \(selectedMode === 'receive_quotes'\)/);
  assert.doesNotMatch(source, /modes\.(?:fast_match|compare_workers|diagnostic_visit)\s*=\s*Object\.freeze\(\{\s*status:\s*'available'/s);
});

test('isolated route contract exposes stable names and preserves deterministic human control', () => {
  const source = read('src', 'features', 'intelligence', 'integration', 'IntelligenceRoutes.tsx');
  assert.match(source, /assistedIntake: 'AssistedIntake'/);
  assert.match(source, /recommendationExplanation: 'RecommendationExplanation'/);
  assert.match(source, /projectLiveStatus: 'ProjectLiveStatus'/);
  assert.match(source, /processingConsent/);
  assert.match(source, /reviewAssistedField/);
  assert.match(source, /confirmedAssistanceToNeedText/);
  assert.match(source, /navigation\.navigate\('ServiceSelect'\)/);
  assert.doesNotMatch(source, /selectedWorkerId|finalPriceMinor|paymentDecision|safetyResponse/);
});

test('screens disclose the manual fallback, sponsorship and absence of background tracking', () => {
  const assisted = read('src', 'features', 'intelligence', 'AssistedIntakeScreen.tsx');
  const recommendation = read('src', 'features', 'intelligence', 'RecommendationExplanationScreen.tsx');
  const live = read('src', 'features', 'intelligence', 'ProjectLiveStatusScreen.tsx');
  assert.match(assisted, /explicitly consent/i);
  assert.match(assisted, /cannot choose a Worker, set or approve a final price, charge you/i);
  assert.match(assisted, /Use normal job brief/);
  assert.match(recommendation, /sponsored/i);
  assert.match(recommendation, /Compare all available Workers/);
  assert.match(live, /No background tracking is enabled/);
  assert.match(live, /no address, phone number, chat or private job note/i);
});

test('Phase 4 screen spacing uses the Grounded Momentum token scale', () => {
  const assisted = read('src', 'features', 'intelligence', 'AssistedIntakeScreen.tsx');
  const recommendation = read('src', 'features', 'intelligence', 'RecommendationExplanationScreen.tsx');
  assert.doesNotMatch(assisted, /\bgap:\s*\d/);
  assert.doesNotMatch(recommendation, /\bgap:\s*\d/);
  assert.match(assisted, /styles\.center, \{ gap: theme\.spacing\.sm \}/);
  assert.match(assisted, /styles\.row, \{ gap: theme\.spacing\.xs \}/);
  assert.match(recommendation, /styles\.row, \{ gap: theme\.spacing\.sm \}/);
});
