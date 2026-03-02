/**
 * offlineService.js
 * Cache API responses in AsyncStorage; serve cached data when offline.
 * Queue mutations taken offline and sync when reconnected.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const QUEUE_KEY = 'offline_action_queue';

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
    return data;
  } catch {
    return null;
  }
}

/** Check whether the device currently has internet */
export async function isOnline() {
  const state = await NetInfo.fetch();
  return state.isConnected && state.isInternetReachable !== false;
}

/** Queue an action to replay when back online */
export async function queueAction(action) {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const queue = raw ? JSON.parse(raw) : [];
    queue.push({ ...action, queuedAt: Date.now() });
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {}
}

/** Drain and return all queued actions, clearing the queue */
export async function drainQueue() {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const queue = JSON.parse(raw);
    await AsyncStorage.removeItem(QUEUE_KEY);
    return queue;
  } catch {
    return [];
  }
}

// Cache key helpers
export const cacheKeys = {
  myBookings: () => 'cache:bookings:my',
  booking: (id) => `cache:booking:${id}`,
  upcomingBookings: () => 'cache:bookings:upcoming',
  labourerProfile: (id) => `cache:labourer:${id}`,
};
