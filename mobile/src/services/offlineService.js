/**
 * offlineService.js
 * Cache API responses in AsyncStorage; serve cached data when offline.
 * Consequential mutations fail closed. Legacy queued commands are removed
 * without replay; only explicitly labelled drafts may be preserved.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const QUEUE_KEY = 'offline_action_queue';
const SAFE_DRAFTS_KEY = 'offline_safe_drafts:v1';
const QUARANTINE_KEY = 'offline_queue_quarantine:v1';
const { partitionLegacyQueue } = require('../config/offlineQueuePolicy.cjs');

let migrationPromise = null;

/** Cache a successful API response */
export async function cacheResponse(key, data) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch {}
}

/** Retrieve cached data; returns null if missing or expired */
export async function getCached(key, ttlMs = CACHE_TTL_MS) {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > ttlMs) return null;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return { ...data, _cache: { cachedAt: ts, ageMs: Date.now() - ts } };
    }
    return data;
  } catch {
    return null;
  }
}

/** Check whether the device currently has internet */
export async function isOnline() {
  await quarantineLegacyQueue();
  const state = await NetInfo.fetch();
  return state.isConnected && state.isInternetReachable !== false;
}

/** Consequential commands must never be queued for silent replay. */
export async function queueAction() {
  const error = new Error('This action needs a live connection and was not queued.');
  error.code = 'offline_action_not_queued';
  throw error;
}

/**
 * One-way upgrade migration for the v1 queue. Command payloads are deleted;
 * the retained quarantine record contains type/timestamp summaries only.
 */
export async function quarantineLegacyQueue() {
  if (migrationPromise) return migrationPromise;
  migrationPromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      if (!raw) return { migrated: false, safeDraftCount: 0, quarantinedCount: 0 };

      let parsed = [];
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = [];
      }
      const { safeDrafts, quarantined } = partitionLegacyQueue(parsed);
      if (safeDrafts.length > 0) {
        await AsyncStorage.setItem(SAFE_DRAFTS_KEY, JSON.stringify(safeDrafts));
      }
      await AsyncStorage.setItem(QUARANTINE_KEY, JSON.stringify({
        migratedAt: Date.now(),
        count: quarantined.length,
        commands: quarantined,
      }));
      await AsyncStorage.removeItem(QUEUE_KEY);
      return {
        migrated: true,
        safeDraftCount: safeDrafts.length,
        quarantinedCount: quarantined.length,
      };
    } catch {
      // Leave the legacy queue in place on storage failure. Callers still fail
      // closed and never drain/replay it.
      return { migrated: false, safeDraftCount: 0, quarantinedCount: 0 };
    }
  })().finally(() => {
    migrationPromise = null;
  });
  return migrationPromise;
}

// Cache key helpers
export const cacheKeys = {
  myBookings: () => 'cache:bookings:my',
  booking: (id) => `cache:booking:${id}`,
  upcomingBookings: () => 'cache:bookings:upcoming',
  labourerProfile: (id) => `cache:labourer:${id}`,
};
