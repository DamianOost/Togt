const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { jwtSecret } = require('../config/env');

function initLocationSockets(io) {
  const locationNs = io.of('/location');

  locationNs.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      socket.user = jwt.verify(token, jwtSecret);
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  locationNs.on('connection', (socket) => {
    const userId = socket.user.id;
    const role = socket.user.role;

    // Labourer joins the room for each of their active bookings
    socket.on('join:booking', async (bookingId) => {
      try {
        const result = await db.query(
          'SELECT * FROM bookings WHERE id = $1 AND status IN ($2, $3)',
          [bookingId, 'accepted', 'in_progress']
        );
        if (result.rows.length === 0) return;

        const booking = result.rows[0];
        if (booking.customer_id !== userId && booking.labourer_id !== userId) return;

        socket.join(`booking:${bookingId}`);
      } catch (err) {
        console.error('join:booking error', err);
      }
    });

    // Labourer emits location update while job is in_progress
    socket.on('location:update', async ({ bookingId, lat, lng }) => {
      if (role !== 'labourer') return;

      try {
        // Update DB
        await db.query(
          'UPDATE labourer_profiles SET current_lat = $1, current_lng = $2 WHERE user_id = $3',
          [lat, lng, userId]
        );

        // Broadcast to the booking room (customer sees it)
        locationNs.to(`booking:${bookingId}`).emit('location:update', {
          bookingId,
          lat,
          lng,
          labourerId: userId,
          timestamp: Date.now(),
        });
      } catch (err) {
        console.error('location:update error', err);
      }
    });

    socket.on('disconnect', () => {
      // Cleanup if needed
    });
  });
}

module.exports = initLocationSockets;
