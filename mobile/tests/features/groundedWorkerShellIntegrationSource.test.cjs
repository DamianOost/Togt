'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const mobileRoot = path.resolve(__dirname, '..', '..');
const read = (relative) => fs.readFileSync(path.join(mobileRoot, relative), 'utf8');

test('Grounded Worker tabs use server-backed controllers without static online or no-op callbacks', () => {
  const stack = read('src/navigation/GroundedWorkerStack.tsx');
  const routes = read('src/features/worker/integration/WorkerShellRoutes.tsx');
  assert.match(stack, /component=\{WorkerTodayRoute\}/);
  assert.match(stack, /component=\{WorkerJobsRoute\}/);
  assert.match(stack, /component=\{WorkerEarningsRoute\}/);
  assert.match(stack, /name="WorkerIncomingOffer" component=\{WorkerIncomingOfferRoute\}/);
  assert.doesNotMatch(stack, /connection="online"|EMPTY_JOBS|EMPTY_EARNINGS|onOpenOffer=\{\(\) => \{\}\}/);
  assert.match(routes, /useNetInfo/);
  assert.match(routes, /useFocusEffect/);
  assert.match(routes, /loadGroundedWorkerShellAvailability/);
  assert.match(routes, /loadGroundedWorkerShellJobs/);
  assert.match(routes, /loadGroundedWorkerShellOffers/);
  assert.match(routes, /loadGroundedWorkerShellEarnings/);
  assert.match(routes, /setGroundedWorkerShellAvailability/);
  assert.match(routes, /current\.status === 'ready'\s*\? current/);
});

test('offer entry re-fetches persisted evidence and routes accepted work to canonical detail', () => {
  const routes = read('src/features/worker/integration/WorkerShellRoutes.tsx');
  const service = read('src/services/groundedWorkerShell.ts');
  const navigator = read('src/navigation/AppNavigator.js');
  assert.match(routes, /loadGroundedWorkerShellOffer\(offerId\)/);
  assert.match(routes, /acceptGroundedWorkerShellOffer/);
  assert.match(routes, /declineGroundedWorkerShellOffer/);
  assert.match(routes, /navigation\.replace\('WorkerJobDetail'/);
  assert.match(routes, /createNestedRootIntent\('labourer', 'WorkerIncomingOffer'/);
  assert.match(routes, /matchSocket\.on\('match:incoming'/);
  assert.match(routes, /matchSocket\.disconnect\(\)/);
  assert.match(service, /url: '\/api\/worker\/offers'/);
  assert.match(service, /url: `\/api\/match\/\$\{resourceId\(input\.offerId, 'offerId'\)\}\/accept`/);
  assert.match(navigator, /groundedWorker \? <GroundedIncomingOfferListener \/> : <IncomingMatchModal \/>/);
});

test('availability and offers fail closed offline, while the append-only ledger cannot become Worker net', () => {
  const routes = read('src/features/worker/integration/WorkerShellRoutes.tsx');
  const service = read('src/services/groundedWorkerShell.ts');
  const adapter = read('src/data/grounded/workerShell.ts');
  const screen = read('src/features/worker/shell/WorkerEarningsScreen.tsx');
  assert.match(service, /No Worker availability or offer mutation was attempted offline/);
  assert.match(routes, /No total was recalculated on this device/);
  assert.match(routes, /current\.lastUpdatedAt \? current : workerJobsSnapshotV1\(null, null\)/);
  assert.match(routes, /withConfirmedAvailability\(current\.value, confirmed\)/);
  assert.match(adapter, /legacy_totals !== 'paid_job_value'/);
  assert.match(adapter, /togt\.worker-payable-ledger\.v1/);
  assert.match(adapter, /completed_reconciled_paid_project_value_not_worker_net_v1/);
  assert.match(adapter, /entrySums\.get\(projectId\) !== paidValueMinor/);
  assert.match(adapter, /worker_net_policy_not_configured/);
  assert.match(adapter, /capabilities\[capability\] !== false/);
  assert.match(adapter, /available_balance_supported !== false/);
  assert.match(adapter, /payout_supported !== false/);
  assert.match(screen, /row\.reconciledPaidJobValue/);
  assert.match(screen, /isSupported\(row\.workerGross\)/);
  assert.match(screen, /isSupported\(row\.platformFee\)/);
  assert.match(screen, /isSupported\(row\.net\)/);
  assert.match(adapter, /fast_match_heartbeat_not_returned/);
});
