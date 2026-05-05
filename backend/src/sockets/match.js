/**
 * Auto-match socket namespace.
 *
 * Labourers connect to /match with a JWT and are auto-joined to a per-user
 * room (`user:<id>`). The matcher service emits `match:incoming`,
 * `match:lost` (if a competing labourer accepts before they do), etc. to
 * those rooms.
 */

const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/env');

function initMatchSockets(io) {
  const ns = io.of('/match');

  ns.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      socket.user = jwt.verify(token, jwtSecret);
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  ns.on('connection', (socket) => {
    const userId = socket.user.id;
    socket.join(`user:${userId}`);
  });
}

module.exports = initMatchSockets;
