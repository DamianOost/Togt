import type { ConnectionState } from './model';

function isStableIntentId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
}

export type WorkerLifecycleCommand =
  | 'save_service'
  | 'set_service_active'
  | 'save_public_profile'
  | 'start_route'
  | 'mark_arrived'
  | 'confirm_scope'
  | 'request_scope_revision'
  | 'verify_start_pin'
  | 'request_change_order'
  | 'request_completion'
  | 'acknowledge_policy'
  | 'save_account_preference';

export interface WorkerLifecycleIntent {
  readonly schemaVersion: 1;
  readonly command: WorkerLifecycleCommand;
  readonly actorId: string;
  readonly projectId: string | null;
  readonly resourceId: string | null;
  readonly stateVersion: number;
  readonly idempotencyKey: string;
  readonly payload: Readonly<Record<string, string | number | boolean>>;
}

export type WorkerIntentResult =
  | Readonly<{ ok: true; intent: WorkerLifecycleIntent }>
  | Readonly<{
      ok: false;
      reasonCode:
        | 'offline'
        | 'invalid_identity'
        | 'invalid_version'
        | 'project_required'
        | 'invalid_payload';
    }>;

const PROJECT_COMMANDS: ReadonlySet<WorkerLifecycleCommand> = new Set([
  'start_route',
  'mark_arrived',
  'confirm_scope',
  'request_scope_revision',
  'verify_start_pin',
  'request_change_order',
  'request_completion',
]);

function stableHash(source: string): string {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function payloadFingerprint(payload: Readonly<Record<string, string | number | boolean>>): string {
  return Object.keys(payload)
    .sort()
    .map((key) => `${key}:${String(payload[key])}`)
    .join('|');
}

export function createWorkerLifecycleIntent(input: Readonly<{
  command: WorkerLifecycleCommand;
  actorId: string;
  projectId?: string | null;
  resourceId?: string | null;
  stateVersion: number;
  requestKey: string;
  connectionState: ConnectionState;
  payload?: Readonly<Record<string, string | number | boolean>>;
}>): WorkerIntentResult {
  if (input.connectionState === 'offline') return Object.freeze({ ok: false, reasonCode: 'offline' });
  const projectId = input.projectId ?? null;
  const resourceId = input.resourceId ?? null;
  if (
    !isStableIntentId(input.actorId)
    || !isStableIntentId(input.requestKey)
    || (projectId !== null && !isStableIntentId(projectId))
    || (resourceId !== null && !isStableIntentId(resourceId))
  ) {
    return Object.freeze({ ok: false, reasonCode: 'invalid_identity' });
  }
  if (!Number.isSafeInteger(input.stateVersion) || input.stateVersion < 0) {
    return Object.freeze({ ok: false, reasonCode: 'invalid_version' });
  }
  if (PROJECT_COMMANDS.has(input.command) && projectId === null) {
    return Object.freeze({ ok: false, reasonCode: 'project_required' });
  }
  const payload = Object.freeze({ ...(input.payload ?? {}) });
  const invalidPayload = Object.entries(payload).some(([key, value]) => (
    !/^[a-z][a-zA-Z0-9]{0,63}$/.test(key)
    || (typeof value === 'number' && !Number.isFinite(value))
    || (typeof value === 'string' && (value.length > 2_000 || value.includes('\u0000')))
  ));
  if (invalidPayload) return Object.freeze({ ok: false, reasonCode: 'invalid_payload' });
  const fingerprint = stableHash([
    input.actorId,
    input.command,
    projectId ?? '',
    resourceId ?? '',
    String(input.stateVersion),
    input.requestKey,
    payloadFingerprint(payload),
  ].join('|'));
  return Object.freeze({
    ok: true,
    intent: Object.freeze({
      schemaVersion: 1,
      command: input.command,
      actorId: input.actorId,
      projectId,
      resourceId,
      stateVersion: input.stateVersion,
      idempotencyKey: `worker-lifecycle:${input.command}:${projectId ?? resourceId ?? input.actorId}:v${input.stateVersion}:${fingerprint}`,
      payload,
    }),
  });
}
