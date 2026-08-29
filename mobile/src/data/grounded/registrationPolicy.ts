type JsonRecord = Record<string, unknown>;

export type RegistrationPolicyDocument = Readonly<{
  kind: 'terms' | 'privacy';
  title: string;
  version: string;
  url: string;
  required: true;
}>;

export type RegistrationPolicy = Readonly<{
  schema: 'togt.registration-policy.v1';
  available: boolean;
  releaseChannel: 'internal_testing' | 'production';
  productionApproved: boolean;
  reasonCode: string | null;
  revision: string | null;
  documents: readonly RegistrationPolicyDocument[];
}>;

export type RegistrationPolicyResult =
  | Readonly<{ ok: true; value: RegistrationPolicy }>
  | Readonly<{ ok: false; reasonCode: 'invalid_registration_policy_contract'; field: string }>;

const VERSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const REVISION = /^[a-f0-9]{64}$/;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  return candidate && candidate.length <= max ? candidate : null;
}

function httpsUrl(value: unknown): string | null {
  const candidate = safeText(value, 2_048);
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'https:' && parsed.hostname && !parsed.username && !parsed.password && !parsed.hash
      ? candidate
      : null;
  } catch {
    return null;
  }
}

function invalid(field: string): RegistrationPolicyResult {
  return Object.freeze({ ok: false, reasonCode: 'invalid_registration_policy_contract', field });
}

export function adaptRegistrationPolicyV1(raw: unknown): RegistrationPolicyResult {
  if (!isRecord(raw) || raw.schema !== 'togt.registration-policy.v1') return invalid('schema');
  if (typeof raw.available !== 'boolean') return invalid('available');
  if (raw.releaseChannel !== 'internal_testing' && raw.releaseChannel !== 'production') return invalid('releaseChannel');
  if (typeof raw.productionApproved !== 'boolean') return invalid('productionApproved');
  const reasonCode = raw.reasonCode === null ? null : safeText(raw.reasonCode, 120);
  if (raw.reasonCode !== null && !reasonCode) return invalid('reasonCode');

  if (!raw.available) {
    if (raw.revision !== null || !Array.isArray(raw.documents) || raw.documents.length !== 0 || !reasonCode) {
      return invalid('unavailable');
    }
    return Object.freeze({
      ok: true,
      value: Object.freeze({
        schema: 'togt.registration-policy.v1',
        available: false,
        releaseChannel: raw.releaseChannel,
        productionApproved: false,
        reasonCode,
        revision: null,
        documents: Object.freeze([]),
      }),
    });
  }

  if (typeof raw.revision !== 'string' || !REVISION.test(raw.revision)) return invalid('revision');
  if (!Array.isArray(raw.documents) || raw.documents.length !== 2) return invalid('documents');
  const documents: RegistrationPolicyDocument[] = [];
  const kinds = new Set<string>();
  for (const [index, entry] of raw.documents.entries()) {
    if (!isRecord(entry) || (entry.kind !== 'terms' && entry.kind !== 'privacy')) return invalid(`documents[${index}].kind`);
    if (kinds.has(entry.kind)) return invalid('documents.duplicateKind');
    kinds.add(entry.kind);
    const title = safeText(entry.title, 120);
    const version = typeof entry.version === 'string' && VERSION.test(entry.version) ? entry.version : null;
    const url = httpsUrl(entry.url);
    if (!title || !version || !url || entry.required !== true) return invalid(`documents[${index}]`);
    documents.push(Object.freeze({ kind: entry.kind, title, version, url, required: true }));
  }
  if (!kinds.has('terms') || !kinds.has('privacy')) return invalid('documents.kinds');
  if (raw.releaseChannel === 'production' && raw.productionApproved !== true) return invalid('productionApproved');
  if (reasonCode !== null) return invalid('reasonCode');

  return Object.freeze({
    ok: true,
    value: Object.freeze({
      schema: 'togt.registration-policy.v1',
      available: true,
      releaseChannel: raw.releaseChannel,
      productionApproved: raw.productionApproved,
      reasonCode: null,
      revision: raw.revision,
      documents: Object.freeze(documents),
    }),
  });
}
