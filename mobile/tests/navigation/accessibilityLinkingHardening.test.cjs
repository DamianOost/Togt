'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { getStateFromPath } = require('@react-navigation/core');

const {
  TOGT_LINK_PREFIXES,
  createTogtLinkingConfiguration,
} = require('../../src/navigation/linkingConfig.cjs');

const mobileRoot = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8');
const ID = '123e4567-e89b-42d3-a456-426614174000';
const linkingFor = (options) => createTogtLinkingConfiguration({
  ...options,
  stateFromPath: getStateFromPath,
});

function routeNames(state) {
  const names = [];
  for (const route of state?.routes || []) {
    names.push(route.name);
    names.push(...routeNames(route.state));
  }
  return names;
}

function stateFor(linking, pathValue) {
  return linking.getStateFromPath(pathValue, linking.config);
}

function configuredPaths(screens, result = []) {
  for (const entry of Object.values(screens)) {
    if (typeof entry === 'string') result.push(entry);
    else if (entry?.path) result.push(entry.path);
    else if (entry?.screens) configuredPaths(entry.screens, result);
  }
  return result;
}

test('stable TOGT links expose signed-out auth only and reject role injection', () => {
  const auth = linkingFor({ shell: 'auth' });
  assert.deepEqual(TOGT_LINK_PREFIXES, ['togt://']);
  assert.deepEqual(routeNames(stateFor(auth, 'login')), ['Auth', 'Login']);
  assert.deepEqual(routeNames(stateFor(auth, 'reset-password')), ['Auth', 'ResetPassword']);
  assert.equal(stateFor(auth, `customer/projects/${ID}`), undefined);
  assert.equal(stateFor(auth, 'register?role=labourer'), undefined);
});

test('transaction links are UUID-bound to the authenticated role and registered once', () => {
  const customer = linkingFor({
    shell: 'customer',
    groundedCustomer: true,
    groundedWorker: true,
  });
  const worker = linkingFor({
    shell: 'labourer',
    groundedCustomer: true,
    groundedWorker: true,
  });

  assert.deepEqual(
    routeNames(stateFor(customer, `customer/projects/${ID}/completion`)),
    ['Customer', 'CompletionPayment'],
  );
  assert.deepEqual(
    routeNames(stateFor(worker, `worker/projects/${ID}/chat`)),
    ['Labourer', 'Chat'],
  );
  assert.equal(stateFor(customer, `worker/projects/${ID}`), undefined);
  assert.equal(stateFor(worker, `customer/projects/${ID}`), undefined);
  assert.equal(
    stateFor(customer, 'customer/workers/00000000-0000-4000-8000-000000000001/book'),
    undefined,
    'the valid-form legacy BookingForm link must remain rejected by the Grounded customer shell',
  );
  assert.equal(stateFor(customer, 'customer/projects/not-a-uuid'), undefined);
  assert.equal(stateFor(worker, `worker/projects/${ID}?role=customer`), undefined);

  for (const linking of [customer, worker]) {
    const paths = configuredPaths(linking.config.screens);
    assert.equal(new Set(paths).size, paths.length, 'deep-link paths must be unique');
  }
});

test('NavigationContainer derives links from the verified shell and packaged navigator', () => {
  const source = read('src/navigation/AppNavigator.js');
  assert.match(source, /createTogtLinkingConfiguration/);
  assert.match(source, /groundedCustomer,[\s\S]*groundedWorker,[\s\S]*shell/);
  assert.match(source, /<NavigationContainer theme=\{navigationTheme\} linking=\{linking\}>/);
});

test('Worker Jobs segments reflow without a horizontal essential-navigation rail', () => {
  const jobs = read('src/features/worker/shell/JobsInboxScreen.tsx');
  assert.doesNotMatch(jobs, /ScrollView|\bhorizontal\b|showsHorizontalScrollIndicator/);
  assert.match(jobs, /useLayoutMetrics\(\)/);
  assert.match(jobs, /layout\.size === 'compact' \? 'column' : 'row'/);
  assert.match(jobs, /segmentControl: \{ flexWrap: 'wrap', width: '100%' \}/);
  assert.match(jobs, /accessibilityRole="tablist"/);
  assert.match(jobs, /accessibilityRole="tab"/);
  assert.match(jobs, /testID=\{`worker-jobs-tab-\$\{segment\}`\}/);
});

test('route-entry focus is reusable, transition-aware, and mounted on key Grounded screens', () => {
  const hook = read('src/navigation/useRouteEntryFocus.ts');
  const appBar = read('src/ui/TopAppBar.tsx');
  assert.match(hook, /NavigationContext/);
  assert.match(hook, /InteractionManager\.runAfterInteractions/);
  assert.match(hook, /AccessibilityInfo\.isScreenReaderEnabled/);
  assert.match(hook, /AccessibilityInfo\.setAccessibilityFocus/);
  assert.match(hook, /navigation\?\.addListener\('focus', focus\)/);
  assert.match(appBar, /titleRef\?: Ref<Text>/);
  assert.match(appBar, /ref=\{titleRef\}/);
  for (const screen of [
    'src/features/customer/projects/ProjectHubScreen.tsx',
    'src/features/customer/projects/ProjectChatScreen.tsx',
    'src/features/worker/lifecycle/WorkerJobDetailScreen.tsx',
    'src/features/worker/shell/JobsInboxScreen.tsx',
  ]) {
    const source = read(screen);
    assert.match(source, /useRouteEntryFocus<Text>/);
    assert.match(source, /titleRef=\{routeTitleRef\}/);
  }
});
