import api from './api';

export const bookingService = {
  async getMyBookings() {
    const res = await api.get('/bookings/my');
    return res.data;
  },
  async getBooking(id) {
    const res = await api.get(`/bookings/${id}`);
    return res.data;
  },
  async createBooking(data) {
    const res = await api.post('/bookings', data);
    return res.data;
  },
  async accept(id) {
    const res = await api.put(`/bookings/${id}/accept`);
    return res.data;
  },
  async decline(id) {
    const res = await api.put(`/bookings/${id}/decline`);
    return res.data;
  },
  async start(id) {
    const res = await api.put(`/bookings/${id}/start`);
    return res.data;
  },
  async complete(id) {
    const res = await api.put(`/bookings/${id}/complete`);
    return res.data;
  },
  async cancel(id) {
    const res = await api.put(`/bookings/${id}/cancel`);
    return res.data;
  },
};
