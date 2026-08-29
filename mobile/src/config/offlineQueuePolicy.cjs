'use strict';

const CONSEQUENTIAL_TYPES = new Set([
  'accept',
  'decline',
  'cancel',
  'confirm_scope',
  'start',
  'complete',
  'pay',
  'kyc',
  'sos',
]);

function isSafeDraft(action) {
  return typeof action?.type === 'string' && action.type.startsWith('draft:');
}

function partitionLegacyQueue(queue) {
  const actions = Array.isArray(queue) ? queue : [];
  const safeDrafts = [];
  const quarantined = [];

  for (const action of actions) {
    if (isSafeDraft(action)) {
      safeDrafts.push(action);
    } else {
      quarantined.push({
        type: typeof action?.type === 'string' ? action.type : 'unknown',
        consequential: CONSEQUENTIAL_TYPES.has(action?.type),
        queuedAt: Number.isFinite(action?.queuedAt) ? action.queuedAt : null,
      });
    }
  }

  return { safeDrafts, quarantined };
}

module.exports = {
  CONSEQUENTIAL_TYPES,
  isSafeDraft,
  partitionLegacyQueue,
};
