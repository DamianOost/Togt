import { io } from 'socket.io-client';
import Constants from 'expo-constants';

const BASE_URL = Constants.expoConfig?.extra?.apiUrl || 'http://localhost:3000';

let socket = null;

export const socketService = {
  connect(token) {
    if (socket) return;
    socket = io(`${BASE_URL}/location`, {
      auth: { token },
      transports: ['websocket'],
    });

    socket.on('connect', () => console.log('Socket connected'));
    socket.on('disconnect', () => console.log('Socket disconnected'));
    socket.on('connect_error', (err) => console.error('Socket error:', err.message));
  },

  disconnect() {
    socket?.disconnect();
    socket = null;
  },

  joinBooking(bookingId) {
    socket?.emit('join:booking', bookingId);
  },

  sendLocation(bookingId, lat, lng) {
    socket?.emit('location:update', { bookingId, lat, lng });
  },

  onLocationUpdate(callback) {
    socket?.on('location:update', callback);
  },

  offLocationUpdate() {
    socket?.off('location:update');
  },
};
