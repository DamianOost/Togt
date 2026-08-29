'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mobileRoot = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8');

function stackRegistrations(source) {
  return new Map([...source.matchAll(
    /<Stack\.Screen name=["']([^"']+)["'] component=\{([A-Za-z][A-Za-z0-9]*)\}/g,
  )].map((match) => [match[1], match[2]]));
}

function exportedFunctionBody(source, functionName) {
  const marker = `export function ${functionName}`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing exported Trust route ${functionName}`);
  const next = source.indexOf('\nexport function ', start + marker.length);
  return source.slice(start, next === -1 ? source.length : next);
}

function trustRouteNames(source) {
  const definition = source.match(
    /GROUNDED_TRUST_ROUTE_NAMES\s*=\s*Object\.freeze\(\{([\s\S]*?)\}\s+as const\)/,
  );
  assert.ok(definition, 'missing Grounded Trust route-name definition');
  return new Map([...definition[1].matchAll(
    /([A-Za-z][A-Za-z0-9]*):\s*["']([^"']+)["']/g,
  )].map((match) => [match[1], match[2]]));
}

test('Grounded Momentum navigation uses vector icons instead of emoji', () => {
  const icon = read('src/navigation/GroundedTabIcon.tsx');
  assert.match(icon, /MaterialCommunityIcons/);
  assert.match(icon, /importantForAccessibility="no-hide-descendants"/);
  assert.doesNotMatch(icon, /[\u{1F300}-\u{1FAFF}]/u);
});

test('root navigation consumes semantic theme colours', () => {
  const navigator = read('src/navigation/AppNavigator.js');
  assert.match(navigator, /useTogtTheme/);
  assert.match(navigator, /NavigationContainer theme=\{navigationTheme\}/);
  assert.doesNotMatch(navigator, /#[\da-f]{3,8}\b/i);
});

test('packaged rollback flags select the additive role shells', () => {
  const navigator = read('src/navigation/AppNavigator.js');
  assert.match(navigator, /packagedFeatureEnabled\('customerFlagship'\)/);
  assert.match(navigator, /\? GroundedCustomerStack[\s\S]*: CustomerStack/);
  assert.match(navigator, /packagedFeatureEnabled\('workerExperience'\)/);
  assert.match(navigator, /\? GroundedWorkerStack[\s\S]*: LabourerStack/);
});

test('Grounded role shells use the approved tab information architecture once', () => {
  const customer = read('src/navigation/GroundedCustomerStack.tsx');
  const worker = read('src/navigation/GroundedWorkerStack.tsx');
  for (const tab of ['Home', 'Projects', 'Account']) {
    assert.equal((customer.match(new RegExp(`<Tab\\.Screen name=["']${tab}["']`, 'g')) || []).length, 1);
  }
  for (const tab of ['Today', 'Jobs', 'Earnings', 'Account']) {
    assert.equal((worker.match(new RegExp(`<Tab\\.Screen name=["']${tab}["']`, 'g')) || []).length, 1);
  }
  assert.match(customer, /GroundedTabIcon/);
  assert.match(worker, /GroundedTabIcon/);
  assert.doesNotMatch(customer + worker, /[\u{1F300}-\u{1FAFF}]/u);
  assert.doesNotMatch(customer + worker, /#[\da-f]{3,8}\b/i);
  assert.match(customer, /name="LabourerProfile" component=\{GroundedWorkerProfileRoute\}/);
  assert.match(customer, /name="Chat" component=\{GroundedProjectChatRoute\}/);
  assert.match(customer, /name="QuoteRequests" component=\{CustomerOpenQuoteRequestsRoute\}/);
  assert.match(worker, /name="Chat" component=\{GroundedProjectChatRoute\}/);
  assert.doesNotMatch(customer, /import LabourerProfileScreen/);
  assert.doesNotMatch(customer + worker, /import ChatScreen/);
});

test('transactional routes remain above tabs and grounded offers target WorkerJobDetail', () => {
  const customer = read('src/navigation/GroundedCustomerStack.tsx');
  const worker = read('src/navigation/GroundedWorkerStack.tsx');
  const workerShellRoutes = read('src/features/worker/integration/WorkerShellRoutes.tsx');
  for (const route of ['LabourerProfile', 'ActiveBooking', 'Payment', 'Chat', 'KYC', 'ScopeConfirm']) {
    assert.equal((customer.match(new RegExp(`<Stack\\.Screen name=["']${route}["']`, 'g')) || []).length, 1);
  }
  assert.doesNotMatch(customer, /<Stack\.Screen name=["']Rate["']/);
  for (const route of ['ActiveJob', 'Chat', 'KYC', 'ScopeConfirm']) {
    assert.equal((worker.match(new RegExp(`<Stack\\.Screen name=["']${route}["']`, 'g')) || []).length, 1);
  }
  for (const route of ['WorkerJobDetail', 'WorkerScopeStart', 'WorkerActiveWork', 'WorkerCompletion']) {
    assert.equal((worker.match(new RegExp(`<Stack\\.Screen name=["']${route}["']`, 'g')) || []).length, 1);
  }
  assert.match(workerShellRoutes, /onOpenNextJob=\{\(projectId\) => navigation\.navigate\('WorkerJobDetail', \{ projectId \}\)\}/);
  assert.match(workerShellRoutes, /onOpenJob=\{\(projectId\) => navigation\.navigate\('WorkerJobDetail', \{ projectId \}\)\}/);
  assert.equal((worker.match(/<Stack\.Screen name=["']WorkerIncomingOffer["']/g) || []).length, 1);
  for (const route of ['WorkerQuoteRequests', 'WorkerQuoteRequestDetail', 'WorkerQuoteBuilder']) {
    assert.equal((worker.match(new RegExp(`<Stack\\.Screen name=["']${route}["']`, 'g')) || []).length, 1);
  }
  assert.match(workerShellRoutes, /navigation\.navigate\('WorkerQuoteRequests'\)/);
  assert.match(workerShellRoutes, /navigation\.replace\('WorkerJobDetail', \{ projectId: result\.projectId \}\)/);
  for (const route of ['SafetyHelp', 'SafetyCentre', 'IncidentReport', 'IncidentDetail', 'RecurringProposal', 'RecurringSeries', 'RecurringOccurrence']) {
    assert.equal((worker.match(new RegExp(`<Stack\\.Screen name=["']${route}["']`, 'g')) || []).length, 1);
    assert.equal((customer.match(new RegExp(`<Stack\\.Screen name=["']${route}["']`, 'g')) || []).length, 1);
  }
  assert.equal((worker.match(/<Stack\.Screen name=["']SafeSharing["']/g) || []).length, 1);
  assert.equal((customer.match(/<Stack\.Screen name=["']SafeSharing["']/g) || []).length, 1);
  for (const route of ['Relationships', 'RebookDraft']) {
    assert.equal((customer.match(new RegExp(`<Stack\\.Screen name=["']${route}["']`, 'g')) || []).length, 1);
  }
  const projectRoutes = read('src/features/customer/integration/CustomerProjectRoutes.tsx');
  const projectHub = read('src/features/customer/projects/ProjectHubScreen.tsx');
  assert.match(projectRoutes, /packagedFeatureEnabled\('relationships'\)/);
  assert.match(projectRoutes, /loadGroundedRelationshipEligibility\(projectId\)/);
  assert.match(projectRoutes, /navigation\.navigate\('Relationships', \{ sourceBookingId: id \}\)/);
  assert.match(projectHub, /relationshipsAvailable/);
  assert.match(projectHub, /onOpenRelationships\(snapshot\.projectId\)/);
  assert.match(projectRoutes, /getEffectiveCapabilities\(\{ forceRefresh: true \}\)/);
  assert.match(projectRoutes, /capabilityEnabled\(capabilities, ['"]booking_details_share['"]\)/);
  assert.match(projectRoutes, /onShareSafeStatus=\{\(id\) => navigation\.navigate\(['"]SafeSharing['"], \{ projectId: id \}\)\}/);

  const workerLifecycleRoutes = read('src/features/worker/integration/WorkerLifecycleRoutes.tsx');
  const workerJobDetail = read('src/features/worker/lifecycle/WorkerJobDetailScreen.tsx');
  assert.match(workerLifecycleRoutes, /capabilityEnabled\(capabilities, ['"]booking_details_share['"]\)/);
  assert.match(workerLifecycleRoutes, /onShareSafeStatus=\{\(id\) => navigation\.navigate\(['"]SafeSharing['"], \{ projectId: id \}\)\}/);
  assert.match(workerJobDetail, /safeSharingAvailable/);
  assert.match(workerJobDetail, /onShareSafeStatus\(snapshot\.projectId\)/);
});

test('every Trust navigation target reachable from the Worker stack is registered', () => {
  const worker = read('src/navigation/GroundedWorkerStack.tsx');
  const trustRoutes = read('src/features/trust/integration/TrustRoutes.tsx');
  const registrations = stackRegistrations(worker);
  const registeredNames = new Set(registrations.keys());
  const routeNames = trustRouteNames(trustRoutes);
  const missing = [];
  const checkedTargets = new Set();

  for (const [sourceRouteName, componentName] of registrations) {
    if (!trustRoutes.includes(`export function ${componentName}`)) continue;
    const body = exportedFunctionBody(trustRoutes, componentName);
    const targetKeys = [...body.matchAll(
      /navigation\.(?:navigate|replace)\(\s*GROUNDED_TRUST_ROUTE_NAMES\.([A-Za-z][A-Za-z0-9]*)/g,
    )].map((match) => match[1]);
    for (const targetKey of targetKeys) {
      const targetRouteName = routeNames.get(targetKey);
      assert.ok(targetRouteName, `unknown Grounded Trust route key ${targetKey}`);
      checkedTargets.add(targetRouteName);
      if (!registeredNames.has(targetRouteName)) {
        missing.push(`${sourceRouteName} -> ${targetRouteName}`);
      }
    }
  }

  assert.ok(checkedTargets.has('RecurringProposal'), 'Worker recurrence proposal navigation was not audited');
  assert.deepEqual(missing, []);
});

test('customer recent-worker actions target the registered Worker profile route', () => {
  const customer = read('src/navigation/GroundedCustomerStack.tsx');
  const intakeRoutes = read('src/features/customer/integration/CustomerIntakeRoutes.tsx');
  const groundedProfileRoute = read('src/features/customer/integration/GroundedWorkerProfileRoute.tsx');
  const groundedProfile = read('src/features/customer/projects/WorkerProfileScreen.tsx');
  const activeBooking = read('src/screens/customer/ActiveBookingScreen.js');
  assert.match(customer, /<Stack\.Screen name=["']LabourerProfile["'] component=\{GroundedWorkerProfileRoute\}/);
  assert.match(intakeRoutes, /onOpenRecentWorker=\{\(worker\) => navigation\.navigate\('LabourerProfile', \{[\s\S]*workerId: worker\.workerId,[\s\S]*serviceId: worker\.serviceId,[\s\S]*serviceVersion: worker\.serviceVersion/);
  assert.doesNotMatch(intakeRoutes, /navigation\.navigate\('WorkerProfile'/);
  assert.match(groundedProfileRoute, /\/api\/labourers\/\$\{workerId\}\/grounded-profile/);
  assert.match(groundedProfileRoute, /adaptGroundedWorkerPublicProfileV1/);
  assert.match(groundedProfileRoute, /serviceId !== null/);
  assert.match(groundedProfile, /directRequestAvailable/);
  assert.match(groundedProfile, /serviceVariants\.length === 0/);
  assert.match(groundedProfile, /onSeeAlternatives\(null\)/);
  assert.doesNotMatch(groundedProfileRoute + groundedProfile, /\.\.\/\.\.\/theme|#[\da-f]{3,8}\b/i);
  assert.match(activeBooking, /stackRouteNames\.includes\('CompletionPayment'\)/);
  assert.match(activeBooking, /stackRouteNames\.includes\('ScopeStart'\)/);
  assert.match(activeBooking, /!stackRouteNames\.includes\('Rate'\)/);
  assert.match(activeBooking, /usesGroundedProjectFlow \? 'ScopeStart' : 'ScopeConfirm'/);
  assert.match(activeBooking, /usesGroundedProjectFlow \? 'CompletionPayment' : 'Payment'/);
  assert.match(activeBooking, /isCancellable && !usesGroundedProjectFlow/);
  assert.match(activeBooking, /navigation\.navigate\('CompletionPayment', \{ projectId: booking\.id \}\)/);
});

test('customer Projects recovers listed quote requests into the existing detail route', () => {
  const customer = read('src/navigation/GroundedCustomerStack.tsx');
  const routes = read('src/features/customer/integration/CustomerProjectRoutes.tsx');
  const intakeRoutes = read('src/features/customer/integration/CustomerIntakeRoutes.tsx');
  const projects = read('src/features/customer/projects/ProjectsListScreen.tsx');
  assert.match(customer, /name="QuoteRequests" component=\{CustomerOpenQuoteRequestsRoute\}/);
  assert.match(routes, /loadGroundedQuoteRequests\(\)/);
  assert.match(routes, /adaptCustomerOpenQuoteRequestListV1\(response\)/);
  assert.match(routes, /navigation\.navigate\('QuoteRequest', \{ requestId, returnTo: 'QuoteRequests' \}\)/);
  assert.match(intakeRoutes, /route\.params\?\.returnTo === 'QuoteRequests'[\s\S]*navigation\.goBack\(\)/);
  assert.match(projects, /onOpenQuoteRequests/);
});

test('customer and Worker chat mount one Grounded controller with participant-safe evidence', () => {
  const customer = read('src/navigation/GroundedCustomerStack.tsx');
  const worker = read('src/navigation/GroundedWorkerStack.tsx');
  const route = read('src/features/customer/integration/GroundedProjectChatRoute.tsx');
  const screen = read('src/features/customer/projects/ProjectChatScreen.tsx');
  assert.match(customer, /name="Chat" component=\{GroundedProjectChatRoute\}/);
  assert.match(worker, /name="Chat" component=\{GroundedProjectChatRoute\}/);
  assert.match(route, /api\.get\(`\/api\/messages\/\$\{projectId\}`\)/);
  assert.match(route, /api\.get\(`\/api\/projects\/\$\{projectId\}`\)/);
  assert.match(route, /transports: \['polling', 'websocket'\]/);
  assert.match(route, /boundedText\(route\.params\?\.prefillMessage, 2_048\)/);
  assert.match(route, /socket\.on\('new_message', \(\) => \{\s*void refresh\(\)/);
  assert.match(route, /setInterval\(\(\) => \{/);
  assert.match(route, /!socketRef\.current\?\.connected/);
  assert.match(route, /refreshSequence !== refreshSequenceRef\.current/);
  assert.match(route, /current\.trim\(\) === body \? '' : current/);
  assert.match(route, /relationship_block_active/);
  assert.match(screen, /sendBlockedReason !== null/);
  assert.match(route, /ownParticipantKind=\{actorRole === 'labourer' \? 'worker' : 'customer'\}/);
  assert.match(route, /failedMessages\.get\(intent\.targetId\)/);
  assert.match(route, /'Idempotency-Key': operationKey/);
  assert.match(route, /status >= 400 && status < 500/);
  assert.match(route, /await refresh\(\)/);
  assert.match(screen, /maxLength=\{2_048\}/);
  assert.match(screen, /MaterialCommunityIcons/);
  assert.doesNotMatch(route + screen, /\.\.\/\.\.\/theme|#[\da-f]{3,8}\b/i);
});
