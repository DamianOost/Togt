import type { ConnectionState } from './model';

export type GroundedTrustCommand =
  | 'record_safety_incident'
  | 'record_support_case'
  | 'create_favourite'
  | 'remove_favourite'
  | 'block_relationship'
  | 'create_rebook_draft'
  | 'update_rebook_draft'
  | 'create_recurring_series'
  | 'accept_terms'
  | 'propose_terms'
  | 'pause_series'
  | 'request_resume'
  | 'accept_resume'
  | 'request_cancel_series'
  | 'accept_cancel_series'
  | 'request_occurrence_change'
  | 'accept_occurrence_change'
  | 'decline_occurrence_change'
  | 'save_notification_controls';

export type GroundedTrustPayloadValue =
  | string
  | number
  | boolean
  | null
  | readonly GroundedTrustPayloadValue[]
  | Readonly<{ [key: string]: GroundedTrustPayloadValue }>;

export type GroundedTrustIntent = Readonly<{
  schemaVersion: 1;
  command: GroundedTrustCommand;
  actorId: string;
  resourceId: string;
  expectedRevision: number | null;
  idempotencyKey: string;
  payload: Readonly<Record<string, GroundedTrustPayloadValue>>;
}>;

export type GroundedTrustIntentResult =
  | Readonly<{ ok: true; intent: GroundedTrustIntent }>
  | Readonly<{
      ok: false;
      reasonCode: 'offline' | 'invalid_identity' | 'revision_required' | 'invalid_revision' | 'invalid_payload';
    }>;

const REVISION_COMMANDS: ReadonlySet<GroundedTrustCommand> = new Set([
  'update_rebook_draft',
  'accept_terms',
  'propose_terms',
  'pause_series',
  'request_resume',
  'accept_resume',
  'request_cancel_series',
  'accept_cancel_series',
  'request_occurrence_change',
  'accept_occurrence_change',
  'decline_occurrence_change',
]);

function stableIdentity(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
}

function stableHash(source: string): string {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function validPayloadValue(value: GroundedTrustPayloadValue, depth = 0): boolean {
  if (depth > 8) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.length <= 5_000 && !value.includes('\u0000');
  if (Array.isArray(value)) return value.length <= 104 && value.every((entry) => validPayloadValue(entry, depth + 1));
  const entries = Object.entries(value);
  return entries.length <= 64 && entries.every(([key, entry]) => (
    /^[a-z][a-zA-Z0-9]{0,63}$/.test(key) && validPayloadValue(entry, depth + 1)
  ));
}

function canonical(value: GroundedTrustPayloadValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const objectValue = value as Readonly<Record<string, GroundedTrustPayloadValue>>;
  return `{${Object.keys(objectValue).sort().map((key) => `${JSON.stringify(key)}:${canonical(objectValue[key] ?? null)}`).join(',')}}`;
}

export function createGroundedTrustIntent(input: Readonly<{
  command: GroundedTrustCommand;
  actorId: string;
  resourceId: string;
  expectedRevision?: number | null;
  requestKey: string;
  connectionState: ConnectionState;
  payload?: Readonly<Record<string, GroundedTrustPayloadValue>>;
}>): GroundedTrustIntentResult {
  if (input.connectionState === 'offline') return Object.freeze({ ok: false, reasonCode: 'offline' });
  if (!stableIdentity(input.actorId) || !stableIdentity(input.resourceId) || !stableIdentity(input.requestKey)) {
    return Object.freeze({ ok: false, reasonCode: 'invalid_identity' });
  }
  const expectedRevision = input.expectedRevision ?? null;
  if (expectedRevision !== null && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)) {
    return Object.freeze({ ok: false, reasonCode: 'invalid_revision' });
  }
  if (REVISION_COMMANDS.has(input.command) && expectedRevision === null) {
    return Object.freeze({ ok: false, reasonCode: 'revision_required' });
  }
  const payload = Object.freeze({ ...(input.payload ?? {}) });
  if (!validPayloadValue(payload)) return Object.freeze({ ok: false, reasonCode: 'invalid_payload' });
  const fingerprint = stableHash([
    input.actorId,
    input.command,
    input.resourceId,
    String(expectedRevision ?? 0),
    input.requestKey,
    canonical(payload),
  ].join('|'));
  return Object.freeze({
    ok: true,
    intent: Object.freeze({
      schemaVersion: 1,
      command: input.command,
      actorId: input.actorId,
      resourceId: input.resourceId,
      expectedRevision,
      idempotencyKey: `grounded-trust:${input.command}:${fingerprint}`,
      payload,
    }),
  });
}

export function mutationGuardMessage(result: GroundedTrustIntentResult): string | null {
  if (result.ok) return null;
  if (result.reasonCode === 'offline') return 'Reconnect before continuing. Nothing was sent.';
  if (result.reasonCode === 'revision_required' || result.reasonCode === 'invalid_revision') {
    return 'Refresh the latest revision before continuing.';
  }
  return 'This action could not be prepared safely.';
}
