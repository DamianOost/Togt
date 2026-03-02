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

    // Labourer emits location update — also when booking status = accepted (en route)
    socket.on('location:update', async ({ bookingId, lat, lng }) => {
      if (role !== 'labourer') return;

      try {
        // Update DB
        await db.query(
          'UPDATE labourer_profiles SET current_lat = $1, current_lng = $2 WHERE user_id = $3',
          [lat, lng, userId]
        );

        // Fetch booking to get destination
        const bookingRes = await db.query(
          'SELECT * FROM bookings WHERE id = $1 AND status IN ($2, $3)',
          [bookingId, 'accepted', 'in_progress']
        );
        if (bookingRes.rows.length === 0) return;
        const booking = bookingRes.rows[0];

        // Straight-line distance (Haversine)
        const R = 6371000; // metres
        const φ1 = (lat * Math.PI) / 180;
        const φ2 = (parseFloat(booking.location_lat) * Math.PI) / 180;
        const Δφ = ((parseFloat(booking.location_lat) - lat) * Math.PI) / 180;
        const Δλ = ((parseFloat(booking.location_lng) - lng) * Math.PI) / 180;
        const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
        const distanceMetres = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        // ~1.4 m/s walking speed for ETA estimate
        const etaMinutes = Math.ceil(distanceMetres / 84); // 84 m/min ≈ 5 km/h

        // Broadcast to the booking room (customer sees it)
        locationNs.to(`booking:${bookingId}`).emit('worker_location', {
          bookingId,
          lat,
          lng,
          labourerId: userId,
          distanceMetres: Math.round(distanceMetres),
          etaMinutes,
          timestamp: Date.now(),
        });

        // Also emit legacy event name for backward compat
        locationNs.to(`booking:${bookingId}`).emit('location:update', {
          bookingId, lat, lng, labourerId: userId, timestamp: Date.now(),
        });

        // Emit arrived event when within 100m
        if (distanceMetres <= 100) {
          locationNs.to(`booking:${bookingId}`).emit('worker_arrived', {
            bookingId,
            labourerId: userId,
            distanceMetres: Math.round(distanceMetres),
            timestamp: Date.now(),
          });
        }
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
