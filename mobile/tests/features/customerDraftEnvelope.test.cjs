'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  CUSTOMER_DRAFT_RETENTION_MS,
  customerDraftStorageKey,
  decodeCustomerDraftEnvelope,
  encodeCustomerDraftEnvelope,
} = require('../../src/data/grounded/draftEnvelope.ts');
const { createCustomerIntakeDraft } = require('../../src/features/customer/intake/model.ts');

function draft() {
  return createCustomerIntakeDraft({
    draftId: 'draft-secure-1',
    createdAt: '2026-08-29T08:00:00.000Z',
    connectionState: 'offline',
  });
}

test('draft storage keys are versioned, actor-scoped and reject unstable identity', () => {
  assert.equal(customerDraftStorageKey('customer-one'), 'togt:customer-intake:v1:customer-one');
  assert.throws(() => customerDraftStorageKey('customer one'), /stable identifier/);
});

test('encrypted-storage envelope round trips only for the same actor before retention expiry', () => {
  const savedAt = '2026-08-29T08:05:00.000Z';
  const encoded = encodeCustomerDraftEnvelope({ actorId: 'customer-one', draft: draft(), savedAt });
  assert.equal(encoded.ok, true);
  assert.equal(encoded.value.expiresAt, new Date(Date.parse(savedAt) + CUSTOMER_DRAFT_RETENTION_MS).toISOString());

  const loaded = decodeCustomerDraftEnvelope({
    actorId: 'customer-one',
    serialized: encoded.serialized,
    now: '2026-08-30T08:05:00.000Z',
  });
  assert.equal(loaded.ok, true);
  assert.equal(loaded.value.draftId, 'draft-secure-1');

  assert.deepEqual(decodeCustomerDraftEnvelope({
    actorId: 'customer-two',
    serialized: encoded.serialized,
    now: '2026-08-30T08:05:00.000Z',
  }), { ok: false, reasonCode: 'actor_mismatch' });
  assert.deepEqual(decodeCustomerDraftEnvelope({
    actorId: 'customer-one',
    serialized: encoded.serialized,
    now: new Date(Date.parse(savedAt) + CUSTOMER_DRAFT_RETENTION_MS + 1).toISOString(),
  }), { ok: false, reasonCode: 'expired' });
});

test('tampered, future-saved and oversized drafts fail closed', () => {
  assert.deepEqual(decodeCustomerDraftEnvelope({
    actorId: 'customer-one',
    serialized: '{bad json',
    now: '2026-08-29T08:05:00.000Z',
  }), { ok: false, reasonCode: 'invalid' });
  assert.deepEqual(encodeCustomerDraftEnvelope({
    actorId: 'customer-one',
    draft: draft(),
    savedAt: '2026-08-29T07:59:00.000Z',
  }), { ok: false, reasonCode: 'invalid_draft' });

  const oversized = {
    ...draft(),
    brief: {
      ...draft().brief,
      attachments: [{
        localId: 'large-photo',
        kind: 'photo',
        localUri: `file://${'x'.repeat(30_000)}`,
        uploadStatus: 'local_only',
        progressPercent: 0,
        remoteAssetId: null,
        errorMessage: null,
      }],
    },
  };
  assert.deepEqual(encodeCustomerDraftEnvelope({
    actorId: 'customer-one',
    draft: oversized,
    savedAt: '2026-08-29T08:05:00.000Z',
  }), { ok: false, reasonCode: 'draft_too_large' });
});
