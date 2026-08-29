'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const mobileRoot = path.resolve(__dirname, '..', '..');
const routePath = path.join(mobileRoot, 'src', 'features', 'customer', 'integration', 'CustomerIntakeRoutes.tsx');
const evidencePath = path.join(mobileRoot, 'src', 'features', 'customer', 'integration', 'customerHomeEvidence.ts');

function source(file) {
  return fs.readFileSync(file, 'utf8');
}

test('C01 refreshes canonical active and upcoming Projects on focus while preserving offline evidence', () => {
  const routes = source(routePath);
  const copy = source(path.join(mobileRoot, 'src', 'features', 'customer', 'intake', 'copy.ts'));
  assert.match(routes, /useFocusEffect\(useCallback\(\(\) => \{/);
  assert.match(routes, /loadGroundedProjects\(['"]active['"]\)/);
  assert.match(routes, /loadGroundedProjects\(['"]upcoming['"]\)/);
  assert.match(routes, /adaptCustomerHomeProjectList\(activeResponse, ['"]active['"]\)/);
  assert.match(routes, /adaptCustomerHomeProjectList\(upcomingResponse, ['"]upcoming['"]\)/);
  assert.match(routes, /if \(connectionState === ['"]offline['"]\) return;/);
  assert.match(routes, /activeProject=\{activeProject\}/);
  assert.doesNotMatch(routes, /activeProject=\{null\}/);
  assert.match(copy, /['"]home\.activeProject['"]: ['"]Current project['"]/);
});

test('C01 reads favourites only behind the packaged relationship gate and verifies every source Project', () => {
  const routes = source(routePath);
  const evidence = source(evidencePath);
  assert.match(routes, /packagedFeatureEnabled\(['"]relationships['"]\)/);
  assert.match(routes, /const relationshipRequest = relationshipsPackaged\s*\?/);
  assert.match(routes, /loadGroundedFavourites\(\)/);
  assert.match(routes, /loadGroundedProject\(favourite\.sourceProjectReference\)/);
  assert.match(routes, /adaptCustomerHomeSourceProject\(response, favourite\.sourceProjectReference\)/);
  assert.match(routes, /buildRecentWorkerSummaries\(favourites, sourceProjects\)/);
  assert.match(routes, /recentWorkers=\{recentWorkers\}/);
  assert.match(routes, /relationshipsCapability=\{relationshipsCapability\}/);
  assert.match(evidence, /serviceLabel: sourceProject\.serviceLabel/);
  assert.doesNotMatch(evidence, /serviceLabel: ['"][^'"]+['"]/);
});

test('C01 fails closed with actionable notices and every visible row has a real navigation target', () => {
  const routes = source(routePath);
  assert.match(routes, /setActiveProject\(projectResult\.ok \? projectResult\.value : null\)/);
  assert.match(routes, /setRecentWorkers\(\[\]\)/);
  assert.match(routes, /Saved Workers could not be verified/);
  assert.match(routes, /No unverified Project or Worker information is shown/);
  assert.match(routes, /else void refreshHomeEvidence\(\)/);
  assert.match(routes, /navigation\.navigate\(['"]ProjectHub['"], \{ projectId: project\.projectId \}\)/);
  assert.match(routes, /navigation\.navigate\(['"]LabourerProfile['"], \{[\s\S]*workerId: worker\.workerId,[\s\S]*serviceId: worker\.serviceId,[\s\S]*serviceVersion: worker\.serviceVersion/);
  assert.match(routes, /navigation\.navigate\(['"]AssistedIntake['"]\)/);
});
