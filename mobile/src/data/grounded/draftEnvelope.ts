import type { CustomerIntakeDraft } from '../../features/customer/intake';

export const CUSTOMER_DRAFT_ENVELOPE_VERSION = 1 as const;
export const CUSTOMER_DRAFT_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
export const CUSTOMER_DRAFT_MAX_BYTES = 24 * 1_024;

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export type CustomerDraftEnvelope = Readonly<{
  envelopeVersion: typeof CUSTOMER_DRAFT_ENVELOPE_VERSION;
  actorId: string;
  savedAt: string;
  expiresAt: string;
  draft: CustomerIntakeDraft;
}>;

export type DraftEnvelopeResult =
  | Readonly<{ ok: true; value: CustomerDraftEnvelope; serialized: string }>
  | Readonly<{ ok: false; reasonCode: 'invalid_actor' | 'invalid_draft' | 'draft_too_large' }>;

export type DraftDecodeResult =
  | Readonly<{ ok: true; value: CustomerIntakeDraft }>
  | Readonly<{ ok: false; reasonCode: 'missing' | 'invalid' | 'actor_mismatch' | 'expired' }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validIso(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function validDraft(value: unknown): value is CustomerIntakeDraft {
  if (!isRecord(value)) return false;
  return value.schemaVersion === 1
    && typeof value.draftId === 'string'
    && STABLE_ID.test(value.draftId)
    && Number.isSafeInteger(value.revision)
    && Number(value.revision) > 0
    && validIso(value.createdAt)
    && validIso(value.updatedAt)
    && (value.connectionState === 'online' || value.connectionState === 'offline')
    && typeof value.needText === 'string'
    && value.needText.length <= 4_000
    && isRecord(value.brief)
    && isRecord(value.address);
}

function utf8Bytes(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const point = character.codePointAt(0) ?? 0;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return bytes;
}

export function customerDraftStorageKey(actorId: string): string {
  if (!STABLE_ID.test(actorId)) throw new TypeError('actorId must be a stable identifier');
  return `togt:customer-intake:v${CUSTOMER_DRAFT_ENVELOPE_VERSION}:${actorId}`;
}

export function encodeCustomerDraftEnvelope(input: Readonly<{
  actorId: string;
  draft: CustomerIntakeDraft;
  savedAt: string;
}>): DraftEnvelopeResult {
  if (!STABLE_ID.test(input.actorId)) return Object.freeze({ ok: false, reasonCode: 'invalid_actor' });
  if (!validDraft(input.draft) || !validIso(input.savedAt)) {
    return Object.freeze({ ok: false, reasonCode: 'invalid_draft' });
  }
  const savedAt = new Date(input.savedAt).toISOString();
  if (Date.parse(savedAt) < Date.parse(input.draft.updatedAt)) {
    return Object.freeze({ ok: false, reasonCode: 'invalid_draft' });
  }
  const envelope: CustomerDraftEnvelope = Object.freeze({
    envelopeVersion: CUSTOMER_DRAFT_ENVELOPE_VERSION,
    actorId: input.actorId,
    savedAt,
    expiresAt: new Date(Date.parse(savedAt) + CUSTOMER_DRAFT_RETENTION_MS).toISOString(),
    draft: input.draft,
  });
  const serialized = JSON.stringify(envelope);
  if (utf8Bytes(serialized) > CUSTOMER_DRAFT_MAX_BYTES) {
    return Object.freeze({ ok: false, reasonCode: 'draft_too_large' });
  }
  return Object.freeze({ ok: true, value: envelope, serialized });
}

export function decodeCustomerDraftEnvelope(input: Readonly<{
  actorId: string;
  serialized: string | null;
  now: string;
}>): DraftDecodeResult {
  if (input.serialized === null) return Object.freeze({ ok: false, reasonCode: 'missing' });
  if (!STABLE_ID.test(input.actorId) || !validIso(input.now) || utf8Bytes(input.serialized) > CUSTOMER_DRAFT_MAX_BYTES) {
    return Object.freeze({ ok: false, reasonCode: 'invalid' });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.serialized);
  } catch {
    return Object.freeze({ ok: false, reasonCode: 'invalid' });
  }
  if (!isRecord(parsed)
      || parsed.envelopeVersion !== CUSTOMER_DRAFT_ENVELOPE_VERSION
      || typeof parsed.actorId !== 'string'
      || !validIso(parsed.savedAt)
      || !validIso(parsed.expiresAt)
      || !validDraft(parsed.draft)) {
    return Object.freeze({ ok: false, reasonCode: 'invalid' });
  }
  if (parsed.actorId !== input.actorId) return Object.freeze({ ok: false, reasonCode: 'actor_mismatch' });
  if (Date.parse(input.now) > Date.parse(parsed.expiresAt)) return Object.freeze({ ok: false, reasonCode: 'expired' });
  if (Date.parse(parsed.savedAt) < Date.parse(parsed.draft.updatedAt)) {
    return Object.freeze({ ok: false, reasonCode: 'invalid' });
  }
  return Object.freeze({ ok: true, value: parsed.draft });
}
