'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const {
  SOUTH_AFRICA_OVERVIEW_REGION,
  addressDisplayLabel,
  closePinRegion,
  isCandidateRevisionCurrent,
} = require(path.resolve(
  __dirname,
  '..',
  '..',
  'src',
  'features',
  'customer',
  'intake',
  'pinPickerPresentation.ts',
));

test('pin label contains only the six location-bearing fields in customer order', () => {
  const label = addressDisplayLabel({
    line1: ' 23 Main Street ',
    unitOrComplex: ' Unit 4 ',
    suburb: ' Parkhurst ',
    city: ' Johannesburg ',
    province: ' Gauteng ',
    postalCode: ' 2193 ',
    landmark: 'Private landmark',
    accessInstructions: 'Private gate code',
  });

  assert.equal(label, '23 Main Street, Unit 4, Parkhurst, Johannesburg, Gauteng, 2193');
  assert.doesNotMatch(label, /Private landmark|Private gate code/);
});

test('a candidate revision captured before an async refresh cannot accept a later pin move', async () => {
  let releaseRefresh;
  const refresh = new Promise((resolve) => { releaseRefresh = resolve; });
  let currentRevision = 4;
  const capturedRevision = currentRevision;
  const commitAfterRefresh = refresh.then(() => (
    isCandidateRevisionCurrent(capturedRevision, currentRevision)
  ));

  currentRevision += 1;
  releaseRefresh();

  assert.equal(await commitAfterRefresh, false);
  assert.equal(isCandidateRevisionCurrent(5, 5), true);
  assert.equal(isCandidateRevisionCurrent(-1, -1), false);
});

test('neutral overview is not an accepted candidate and close regions are immutable', () => {
  assert.equal(Object.hasOwn(SOUTH_AFRICA_OVERVIEW_REGION, 'candidate'), false);
  const region = closePinRegion({ latitude: -26.145, longitude: 28.04 });
  assert.deepEqual(region, {
    latitude: -26.145,
    longitude: 28.04,
    latitudeDelta: 0.008,
    longitudeDelta: 0.008,
  });
  assert.equal(Object.isFrozen(region), true);
});
