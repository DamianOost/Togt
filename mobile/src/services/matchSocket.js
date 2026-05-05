import { io } from 'socket.io-client';
import Constants from 'expo-constants';

const BASE_URL = Constants.expoConfig?.extra?.apiUrl || 'http://localhost:3000';

let socket = null;

export const matchSocket = {
  connect(token) {
    if (socket && socket.connected) return socket;
    if (socket) socket.disconnect();
    socket = io(`${BASE_URL}/match`, {
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
