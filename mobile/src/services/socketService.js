import { io } from 'socket.io-client';
import { socketUrl } from '../config/apiConfig';

let socket = null;

export const socketService = {
  connect(token) {
    if (socket) return;
    socket = io(socketUrl('/location'), {
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

  offLocationUpdate(callback) {
    socket?.off('location:update', callback);
  },

  on(event, callback) {
    socket?.on(event, callback);
  },

  off(event, callback) {
    socket?.off(event, callback);
  },
};
