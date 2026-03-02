import api from './api';
import { cacheResponse, getCached, isOnline, queueAction, drainQueue, cacheKeys } from './offlineService';

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
    if (cached) return { ...cached, _offline: true };
    throw new Error('No internet connection and no cached data.');
  },

  async createBooking(data) {
    const res = await api.post('/bookings', data);
    return res.data;
  },

  async accept(id) {
    const online = await isOnline();
    if (!online) {
      await queueAction({ type: 'accept', id });
      return { _queued: true };
    }
    const res = await api.put(`/bookings/${id}/accept`);
    return res.data;
  },

  async decline(id) {
    const res = await api.put(`/bookings/${id}/decline`);
    return res.data;
  },

  async start(id) {
    const online = await isOnline();
    if (!online) {
      await queueAction({ type: 'start', id });
      return { _queued: true };
    }
    const res = await api.put(`/bookings/${id}/start`);
    return res.data;
  },

  async complete(id) {
    const online = await isOnline();
    if (!online) {
      await queueAction({ type: 'complete', id });
      return { _queued: true };
    }
    const res = await api.put(`/bookings/${id}/complete`);
    return res.data;
  },

  async cancel(id) {
    const res = await api.put(`/bookings/${id}/cancel`);
    return res.data;
  },

  /** Call on app foreground to replay queued actions */
  async syncQueue() {
    const online = await isOnline();
    if (!online) return [];
    const actions = await drainQueue();
    const results = [];
    for (const action of actions) {
      try {
        let res;
        if (action.type === 'accept')   res = await api.put(`/bookings/${action.id}/accept`);
        if (action.type === 'start')    res = await api.put(`/bookings/${action.id}/start`);
        if (action.type === 'complete') res = await api.put(`/bookings/${action.id}/complete`);
        results.push({ action, ok: true, data: res?.data });
      } catch (err) {
        results.push({ action, ok: false, error: err.message });
      }
    }
    return results;
  },
};
