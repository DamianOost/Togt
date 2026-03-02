const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { jwtSecret } = require('../config/env');

function initChatSockets(io) {
  const chatNs = io.of('/chat');

  chatNs.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      socket.user = jwt.verify(token, jwtSecret);
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  chatNs.on('connection', (socket) => {
    const userId = socket.user.id;

    // Join room for a booking's chat
    socket.on('join:booking', async (bookingId) => {
      try {
        const result = await db.query(
          'SELECT * FROM bookings WHERE id = $1',
          [bookingId]
        );
        if (result.rows.length === 0) return;

        const booking = result.rows[0];
        if (booking.customer_id !== userId && booking.labourer_id !== userId) return;

        socket.join(`booking:${bookingId}`);
        socket.emit('joined', { bookingId });
      } catch (err) {
        console.error('chat join:booking error', err);
      }
    });

    socket.on('leave:booking', (bookingId) => {
      socket.leave(`booking:${bookingId}`);
    });

    socket.on('disconnect', () => {
      // rooms cleanup handled automatically
    });
  });
}

module.exports = initChatSockets;
