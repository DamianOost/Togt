'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const mobileRoot = path.resolve(__dirname, '..', '..');
const integrationRoot = path.join(mobileRoot, 'src', 'features', 'trust', 'integration');
const routesPath = path.join(integrationRoot, 'TrustRoutes.tsx');
const indexPath = path.join(integrationRoot, 'index.ts');
const servicePath = path.join(mobileRoot, 'src', 'services', 'groundedTrust.ts');

function source(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

test('shared trust integration exports the exact route contract needed by both Grounded stacks', () => {
  const routes = source(routesPath);
  const index = source(indexPath);
  assert.equal(fs.existsSync(routesPath), true, 'missing TrustRoutes.tsx');
  assert.match(index, /export \* from ['"]\.\/TrustRoutes['"]/);
  for (const name of [
    'SafetyHelpRoute',
    'SafetyCentreRoute',
    'IncidentReportRoute',
    'IncidentDetailRoute',
    'SafeSharingRoute',
    'RelationshipsRoute',
    'RebookDraftRoute',
    'RecurringProposalRoute',
    'RecurringSeriesRoute',
    'RecurringOccurrenceRoute',
  ]) {
    assert.match(routes, new RegExp(`export (?:const|function) ${name}\\b`), `missing ${name}`);
  }
  for (const routeName of [
    'SafetyHelp',
    'SafetyCentre',
    'IncidentReport',
    'IncidentDetail',
    'SafeSharing',
    'Relationships',
    'RebookDraft',
    'RecurringProposal',
    'RecurringSeries',
    'RecurringOccurrence',
  ]) {
    assert.match(routes, new RegExp(`['"]${routeName}['"]`), `missing route name ${routeName}`);
  }
});

test('safety routes load both private record families and keep emergency help dialler-only', () => {
  const routes = source(routesPath);
  assert.match(routes, /loadGroundedIncidents\(['"]safety['"]\)/);
  assert.match(routes, /loadGroundedIncidents\(['"]support['"]\)/);
  assert.match(routes, /loadGroundedIncident\(kind, incidentId\)/);
  assert.match(routes, /createGroundedIncident\(\{/);
  assert.match(routes, /requestedChannel|record_safety_incident|record_support_case/);
  assert.match(routes, /Linking\.openURL\(`tel:\$\{number\}`\)/);
  assert.match(routes, /safeEmergencyDial\(['"]112['"]\)/);
  assert.match(routes, /safeEmergencyDial\(['"]10111['"]\)/);
  assert.doesNotMatch(routes, /on(?:Acknowledge|Escalate|Resolve|Dispatch)(?:Incident|Case|Emergency)/);
  assert.doesNotMatch(routes, /help (?:is|will be) on the way|emergency services (?:were|are) dispatched/i);
});

test('relationship mutations use current canonical eligibility, Project identity and stable intent keys', () => {
  const routes = source(routesPath);
  for (const call of [
    'loadGroundedRelationshipEligibility',
    'loadGroundedProject',
    'loadGroundedFavourites',
    'createGroundedFavourite',
    'removeGroundedFavourite',
    'createGroundedBlock',
    'createGroundedRebookDraft',
  ]) {
    assert.match(routes, new RegExp(`${call}\\(`), `missing ${call}`);
  }
  assert.match(routes, /createGroundedTrustIntent\(input\)/);
  assert.match(routes, /connectionState === ['"]offline['"]/);
  assert.match(routes, /actorRole !== ['"]customer['"]/);
  assert.match(routes, /Worker projection does not disclose the customer identifier/);
  assert.match(routes, /No private identifier has been inferred/);
  assert.doesNotMatch(routes, /participants\.customer\.id\s*(?:\?\?|\|\|)\s*/);
});

test('rebook integration remains revisioned draft-only and recurring work remains bilateral', () => {
  const routes = source(routesPath);
  assert.match(routes, /loadGroundedRebookDraft\(draftId\)/);
  assert.match(routes, /updateGroundedRebookDraft\(\{/);
  assert.match(routes, /expectedRevision: resource\.value\.revision/);
  assert.match(routes, /editableScope: nextEditableScope/);
  assert.match(routes, /loadGroundedRecurringSeriesDetail/);
  assert.match(routes, /createGroundedRecurringSeries\(\{/);
  assert.match(routes, /updateGroundedRecurringSeries\(\{/);
  assert.match(routes, /lines\.length < 2 \|\| lines\.length > 104/);
  assert.match(routes, /366 \* 24 \* 60 \* 60 \* 1_000/);
  assert.match(routes, /timezone: ['"]Africa\/Johannesburg['"]/);
  assert.match(routes, /pendingRequests\.resumeRequestedByRole !== actorRole/);
  assert.match(routes, /pendingRequests\.cancellationRequestedByRole !== actorRole/);
  assert.match(routes, /onAcceptResume=\{\(\) => \{ void run\(['"]accept_resume['"]\); \}\}/);
  assert.match(routes, /onAcceptCancelSeries=\{\(\) => \{ void run\(['"]accept_cancel_series['"]\); \}\}/);
  assert.match(routes, /No occurrence automatically becomes a booking/);
  assert.doesNotMatch(routes, /booking (?:was|is) (?:created|confirmed)|automatically (?:book|create)/i);
});

test('safe sharing uses the participant endpoint and validated static preview without a false success claim', () => {
  const routes = source(routesPath);
  const service = source(servicePath);
  assert.match(routes, /SafeSharingScreen/);
  assert.match(routes, /loadGroundedSafeShare\(projectId\)/);
  assert.match(routes, /adaptSafeSharePreview\(response\.preview\)/);
  assert.match(routes, /safeShareMessage\(preview\)/);
  assert.match(routes, /await Share\.share\(/);
  assert.match(routes, /Share sheet could not be opened/);
  assert.match(routes, /expiring_public_tokens_not_implemented/);
  assert.doesNotMatch(routes, /Alert\.alert\(\s*['"](?:Shared|Summary shared|Success)/i);
  assert.doesNotMatch(routes, /Share\.sharedAction[\s\S]{0,240}Alert\.alert/i);
  assert.match(service, /method: ['"]POST['"], url: `\/api\/bookings\/\$\{id\}\/share-trip`/);
  assert.match(service, /literalFalse\(rootItem\(source, ['"]live_tracking['"]\)/);
  assert.match(service, /rootItem\(source, ['"]public_link['"]\) !== null/);
});

test('unsupported notification, fairness and public live-sharing integrations remain absent', () => {
  const routes = source(routesPath);
  assert.doesNotMatch(routes, /NotificationControlsScreen|TrustFairnessScreen/);
  assert.doesNotMatch(routes, /\/api\/notifications?|\/api\/(?:public-)?(?:live-)?shares?/i);
  assert.doesNotMatch(routes, /trustScore|fairnessScore|live tracking (?:is|was) enabled/i);
});
