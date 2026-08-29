import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  shouldShowSafetyEducation,
} from '../features/intelligence/model';
import type { SafetyEducationTrigger } from '../features/intelligence/model';

const STORAGE_SCHEMA_VERSION = 1 as const;
const STORAGE_KEY_PREFIX = 'grounded_contextual_safety:v1';
const MAX_LIFETIME_SHOWS = 3;
const COOLDOWN_DAYS = 14;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SafetyEducationRecord = Readonly<{
  schemaVersion: typeof STORAGE_SCHEMA_VERSION;
  trigger: SafetyEducationTrigger;
  shownAt: readonly string[];
}>;

const inFlight = new Map<string, Promise<boolean>>();

function canonicalInstant(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  const canonical = new Date(timestamp).toISOString();
  return canonical === value ? canonical : null;
}

function storageKey(actorId: string, trigger: SafetyEducationTrigger): string | null {
  if (!UUID.test(actorId)) return null;
  return `${STORAGE_KEY_PREFIX}:${actorId.toLowerCase()}:${trigger}`;
}

function parseRecord(raw: string | null, trigger: SafetyEducationTrigger): SafetyEducationRecord | null {
  if (raw === null) {
    return Object.freeze({ schemaVersion: STORAGE_SCHEMA_VERSION, trigger, shownAt: Object.freeze([]) });
  }
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (record.schemaVersion !== STORAGE_SCHEMA_VERSION || record.trigger !== trigger) return null;
    if (!Array.isArray(record.shownAt) || record.shownAt.length > MAX_LIFETIME_SHOWS) return null;
    const shownAt = record.shownAt.map(canonicalInstant);
    if (shownAt.some((item) => item === null)) return null;
    return Object.freeze({
      schemaVersion: STORAGE_SCHEMA_VERSION,
      trigger,
      shownAt: Object.freeze(shownAt as string[]),
    });
  } catch {
    return null;
  }
}

async function claimOnce(
  key: string,
  trigger: SafetyEducationTrigger,
  now: string,
): Promise<boolean> {
  try {
    const record = parseRecord(await AsyncStorage.getItem(key), trigger);
    if (!record || !shouldShowSafetyEducation({
      trigger,
      now,
      shownAt: record.shownAt,
      maxLifetimeShows: MAX_LIFETIME_SHOWS,
      cooldownDays: COOLDOWN_DAYS,
    })) return false;

    const next: SafetyEducationRecord = Object.freeze({
      schemaVersion: STORAGE_SCHEMA_VERSION,
      trigger,
      shownAt: Object.freeze([...record.shownAt, now]),
    });
    // Persist before rendering. A storage failure therefore cannot bypass the
    // frequency/cooldown contract by repeatedly showing the education card.
    await AsyncStorage.setItem(key, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

export async function claimContextualSafetyEducation(input: Readonly<{
  actorId: string;
  trigger: SafetyEducationTrigger;
  now?: string;
}>): Promise<boolean> {
  const key = storageKey(input.actorId, input.trigger);
  const now = canonicalInstant(input.now ?? new Date().toISOString());
  if (!key || !now) return false;

  const queued = (inFlight.get(key) ?? Promise.resolve(false))
    .catch(() => false)
    .then(() => claimOnce(key, input.trigger, now));
  inFlight.set(key, queued);
  try {
    return await queued;
  } finally {
    if (inFlight.get(key) === queued) inFlight.delete(key);
  }
}

export const SAFETY_EDUCATION_POLICY = Object.freeze({
  cooldownDays: COOLDOWN_DAYS,
  maxLifetimeShows: MAX_LIFETIME_SHOWS,
  schemaVersion: STORAGE_SCHEMA_VERSION,
});
