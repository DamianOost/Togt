import api from './api';
import { cacheResponse, getCached, isOnline, quarantineLegacyQueue, cacheKeys } from './offlineService';

function offlineMutationError() {
  const error = new Error('You are offline. Reconnect and refresh the job before trying again. Nothing was changed.');
  error.code = 'offline_action_not_queued';
  return error;
}

async function requireOnline() {
  if (!(await isOnline())) throw offlineMutationError();
}

export const bookingService = {
  async getMyBookings() {
    const online = await isOnline();
    if (online) {
      try {
        const res = await api.get('/bookings/my');
        await cacheResponse(cacheKeys.myBookings(), res.data);
        return res.data;
      } catch (err) {
        // Network failed despite being "online" — fall through to cache
      }
    }
    const cached = await getCached(cacheKeys.myBookings());
    if (cached) return { ...cached, _offline: true };
    throw new Error('No internet connection and no cached data available.');
  },

  async getBooking(id) {
    const online = await isOnline();
    if (online) {
      try {
        const res = await api.get(`/bookings/${id}`);
        await cacheResponse(cacheKeys.booking(id), res.data);
        return res.data;
      } catch {}
    }
    const cached = await getCached(cacheKeys.booking(id));
    if (cached) {
      return {
        ...cached,
        booking: cached.booking
          ? {
            ...cached.booking,
            _offline: true,
            _lastUpdatedAt: cached._cache?.cachedAt || null,
          }
          : cached.booking,
        _offline: true,
      };
    }
    throw new Error('No internet connection and no cached data.');
  },

  async createBooking(data) {
    await requireOnline();
    const res = await api.post('/bookings', data);
    return res.data;
  },

  async accept(id) {
    await requireOnline();
    const res = await api.put(`/bookings/${id}/accept`);
    return res.data;
  },

  async decline(id) {
    await requireOnline();
    const res = await api.put(`/bookings/${id}/decline`);
    return res.data;
  },

  async start(id, startPin) {
    await requireOnline();
    const res = await api.put(`/bookings/${id}/start`, { start_pin: startPin });
    return res.data;
  },

  async complete(id) {
    await requireOnline();
    const res = await api.put(`/bookings/${id}/complete`);
    return res.data;
  },

  async cancel(id) {
    await requireOnline();
    const res = await api.put(`/bookings/${id}/cancel`);
    return res.data;
  },

  /** Legacy compatibility hook. It quarantines old commands and replays none. */
  async syncQueue() {
    await quarantineLegacyQueue();
    return [];
  },
};
