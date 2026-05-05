import api from './api';

export const matchService = {
  async create({ skill_needed, address, location_lat, location_lng, scheduled_at, hours_est, notes }) {
    const res = await api.post('/api/match', {
      skill_needed, address, location_lat, location_lng, scheduled_at, hours_est, notes,
    });
    return res.data.match;
  },
  async get(matchId) {
    const res = await api.get(`/api/match/${matchId}`);
    return res.data;
  },
  async accept(matchId) {
    const res = await api.post(`/api/match/${matchId}/accept`);
    return res.data;
  },
  async decline(matchId) {
    const res = await api.post(`/api/match/${matchId}/decline`);
    return res.data;
  },
  async cancel(matchId) {
    const res = await api.post(`/api/match/${matchId}/cancel`);
    return res.data;
  },
};
