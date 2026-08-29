'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  adaptCustomerHomeProjectList,
  adaptCustomerHomeSourceProject,
  buildRecentWorkerSummaries,
  selectCustomerHomeProject,
} = require('../../src/features/customer/integration/customerHomeEvidence.ts');

const ids = {
  active: '11111111-1111-4111-8111-111111111111',
  upcoming: '22222222-2222-4222-8222-222222222222',
  past: '33333333-3333-4333-8333-333333333333',
  worker: '44444444-4444-4444-8444-444444444444',
  service: '55555555-5555-4555-8555-555555555555',
  favourite: '66666666-6666-4666-8666-666666666666',
};

function project(segment, overrides = {}) {
  const projectId = segment === 'active' ? ids.active : segment === 'upcoming' ? ids.upcoming : ids.past;
  return {
    schema: 'togt.project.v1',
    id: projectId,
    revision: 3,
    segment,
    transactionalStatus: segment === 'past' ? 'completed' : 'accepted',
    operational: {
      phase: segment === 'past' ? 'closed' : segment === 'upcoming' ? 'scheduled' : 'work_active',
      label: segment === 'past' ? 'Job complete' : segment === 'upcoming' ? 'Worker confirmed' : 'Work in progress',
    },
    service: { id: ids.service, version: 2, label: 'Server-authored plumbing service' },
    schedule: { startsAt: '2026-09-02T10:00:00.000Z' },
    area: { precision: 'broad', label: 'Woodstock, Cape Town' },
    participants: {
      worker: { id: ids.worker, displayName: 'Current Worker Name', avatarUrl: 'https://images.example.test/current-worker.jpg' },
    },
    updatedAt: '2026-08-29T12:00:00.000Z',
    ...overrides,
  };
}

function list(segment, items = [project(segment)]) {
  return { schema: 'togt.project.v1', projects: items, meta: { segment, count: items.length } };
}

function favourite(overrides = {}) {
  return {
    schema: 'togt.trust.v1',
    id: ids.favourite,
    worker: { id: ids.worker, displayName: 'Favourite Worker Name' },
    sourceProjectReference: ids.past,
    status: 'active',
    revision: 1,
    createdAt: '2026-08-29T10:00:00.000Z',
    updatedAt: '2026-08-29T11:00:00.000Z',
    ...overrides,
  };
}

test('home Project lists require the canonical schema, DTO adapter and exact requested segment', () => {
  const active = adaptCustomerHomeProjectList(list('active'), 'active');
  assert.equal(active.ok, true, JSON.stringify(active));
  assert.equal(active.value[0].serviceLabel, 'Server-authored plumbing service');

  assert.equal(adaptCustomerHomeProjectList({ ...list('active'), schema: 'future.schema' }, 'active').ok, false);
  assert.equal(adaptCustomerHomeProjectList(list('active', [project('upcoming')]), 'active').ok, false);
  assert.equal(adaptCustomerHomeProjectList({ schema: 'togt.project.v1', projects: [{}] }, 'active').ok, false);
});

test('active evidence wins, with an upcoming Project as the honest fallback', () => {
  const active = adaptCustomerHomeProjectList(list('active'), 'active').value;
  const upcoming = adaptCustomerHomeProjectList(list('upcoming'), 'upcoming').value;
  assert.deepEqual(selectCustomerHomeProject(active, upcoming), {
    projectId: ids.active,
    title: 'Server-authored plumbing service',
    statusLabel: 'Work in progress',
    areaLabel: 'Woodstock, Cape Town',
    workerName: 'Current Worker Name',
    workerPhotoUrl: 'https://images.example.test/current-worker.jpg',
  });
  assert.equal(selectCustomerHomeProject([], upcoming).projectId, ids.upcoming);
  assert.equal(selectCustomerHomeProject([], []), null);
});

test('a favourite source Project must be the exact requested completed Project', () => {
  const detail = adaptCustomerHomeSourceProject({ project: project('past') }, ids.past);
  assert.equal(detail.ok, true, JSON.stringify(detail));
  assert.equal(detail.value.segment, 'past');
  assert.equal(adaptCustomerHomeSourceProject({ project: project('active') }, ids.active).ok, false);
  assert.equal(adaptCustomerHomeSourceProject({ project: project('past') }, ids.active).ok, false);
  assert.equal(adaptCustomerHomeSourceProject({ project: { ...project('past'), schema: 'future.schema' } }, ids.past).ok, false);
});

test('recent Worker rows use only correlated favourite identity and source-Project service evidence', () => {
  const source = adaptCustomerHomeSourceProject({ project: project('past') }, ids.past).value;
  const result = buildRecentWorkerSummaries([favourite()], [source]);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.value, [{
    workerId: ids.worker,
    displayName: 'Favourite Worker Name',
    serviceId: ids.service,
    serviceVersion: 2,
    serviceLabel: 'Server-authored plumbing service',
    photoUrl: 'https://images.example.test/current-worker.jpg',
  }]);

  assert.equal(buildRecentWorkerSummaries(
    [favourite({ worker: { id: ids.active, displayName: 'Wrong Worker' } })],
    [source],
  ).ok, false);
  assert.equal(buildRecentWorkerSummaries([favourite({ status: 'removed' })], [source]).ok, false);
  assert.equal(buildRecentWorkerSummaries([favourite()], []).ok, false);
  assert.equal(buildRecentWorkerSummaries(
    [favourite()],
    [{ ...source, serviceId: null, serviceVersion: null }],
  ).ok, false);
  assert.equal(buildRecentWorkerSummaries([favourite(), favourite({ id: ids.active })], [source, source]).ok, false);
});
