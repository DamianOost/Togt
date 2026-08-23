import { io } from 'socket.io-client';
import { socketUrl } from '../config/apiConfig';

let socket = null;

export const matchSocket = {
  connect(token) {
    if (socket && socket.connected) return socket;
    if (socket) socket.disconnect();
    socket = io(socketUrl('/match'), {
      auth: { token },
      transports: ['websocket'],
    });
    socket.on('connect_error', (err) => console.warn('[match-socket] error:', err.message));
    return socket;
  },
  disconnect() {
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
      socket = null;
    }
  },
  on(event, fn) {
    socket?.on(event, fn);
  },
  off(event, fn) {
    socket?.off(event, fn);
  },
  isConnected() {
    return !!socket?.connected;
  },
};
