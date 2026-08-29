'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const workerId = '11111111-1111-4111-8111-111111111111';
const fixedServiceId = '22222222-2222-4222-8222-222222222222';
const quoteServiceId = '33333333-3333-4333-8333-333333333333';

async function adapter() {
  return import('../../src/data/grounded/publicWorkerProfile.ts');
}

function response(overrides = {}) {
  return {
    schema: 'togt.grounded-worker-public-profile.v1',
    profile: {
      workerId,
      stateVersion: 3,
      displayName: 'Thabo Repairs',
      about: 'Careful household work with scope confirmed before work starts.',
      profilePhoto: { status: 'unavailable', reasonCode: 'profile_photo_unavailable', explanation: 'No photo.' },
      publicBadges: [{ badgeId: 'identity', label: 'Identity assurance', detail: 'Pending provider evidence.', status: 'pending' }],
      serviceAreaLabel: 'Cape Town metro',
      offerings: [
        {
          offeringId: '44444444-4444-4444-8444-444444444444',
          serviceId: fixedServiceId,
          serviceVersion: 1,
          catalogueLabel: 'Fixed repairs',
          title: 'Fixed household repair',
          description: 'A bounded fixed repair service.',
          pricingMode: 'fixed',
          fixedCustomerAmount: { status: 'supported', value: { currency: 'ZAR', amountMinor: 12500 } },
          hourlyRate: null,
          callOutAmount: null,
          serviceAreaLabel: 'Cape Town metro',
        },
        {
          offeringId: '55555555-5555-4555-8555-555555555555',
          serviceId: quoteServiceId,
          serviceVersion: 2,
          catalogueLabel: 'Quoted carpentry',
          title: 'Quoted carpentry work',
          description: 'A remote quote service with scope review.',
          pricingMode: 'remote_quote',
          fixedCustomerAmount: { status: 'unavailable', reasonCode: 'not_fixed' },
          hourlyRate: null,
          callOutAmount: null,
          serviceAreaLabel: 'Cape Town metro',
        },
      ],
      reviews: [{
        reviewId: '66666666-6666-4666-8666-666666666666',
        rating: 5,
        body: 'Careful and tidy.',
        publishedAt: '2026-08-29T12:00:00.000Z',
        serviceLabel: 'Fixed repairs',
      }],
      rating: { average: 5, count: 1 },
      completedJobs: 7,
      currentlyAvailable: true,
      ...overrides,
    },
  };
}

test('public Worker profile maps only explicit evidence and keeps direct reservation fail-closed', async () => {
  const { adaptGroundedWorkerPublicProfileV1 } = await adapter();
  const result = adaptGroundedWorkerPublicProfileV1(response(), workerId, quoteServiceId, 2);
  assert.ok(result);
  assert.equal(result.worker.serviceId, quoteServiceId);
  assert.equal(result.worker.price.kind, 'not_yet_available');
  assert.equal(result.serviceVariants[1].price.kind, 'fixed');
  assert.deepEqual(result.worker.rating, { average: 5, count: 1 });
  assert.equal(result.currentlyAvailable, true);
  assert.equal(result.directRequestAvailable, false);
  assert.match(result.directRequestUnavailableReason, /does not reserve/i);
  assert.equal(Object.isFrozen(result), true);
});

test('profile contract rejects identity drift, malformed reviews and sensitive reviewer/contact fields', async () => {
  const { adaptGroundedWorkerPublicProfileV1 } = await adapter();
  assert.equal(adaptGroundedWorkerPublicProfileV1(response(), quoteServiceId), null);
  assert.equal(adaptGroundedWorkerPublicProfileV1(response({
    reviews: [{
      reviewId: '66666666-6666-4666-8666-666666666666',
      rating: 6,
      body: 'Impossible score',
      publishedAt: '2026-08-29T12:00:00.000Z',
      serviceLabel: 'Fixed repairs',
    }],
  }), workerId), null);
  const leaked = response();
  leaked.profile.reviews[0].reviewer_name = 'Private Surname';
  assert.equal(adaptGroundedWorkerPublicProfileV1(leaked, workerId), null);
  assert.equal(adaptGroundedWorkerPublicProfileV1(response({ phone: '0821112222' }), workerId), null);
});

test('profile with no active eligible offerings stays valid but unavailable for recovery UI', async () => {
  const { adaptGroundedWorkerPublicProfileV1 } = await adapter();
  const result = adaptGroundedWorkerPublicProfileV1(response({ offerings: [], currentlyAvailable: true }), workerId);
  assert.ok(result);
  assert.deepEqual(result.serviceVariants, []);
  assert.equal(result.currentlyAvailable, false);
  assert.equal(result.worker.serviceId, '');
  assert.equal(result.worker.serviceLabel, 'No active service');
});
