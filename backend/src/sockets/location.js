const db = require('../config/db');
const { verifyAccessToken } = require('../lib/jwtTokens');
const { canUseLiveLocation } = require('../lib/privacy');

const LOCATION_BOOKING_SELECT = `
  SELECT b.*,
         (
           b.accepted_quote_id IS NOT NULL
           OR EXISTS (
             SELECT 1 FROM grounded_booking_agreement_snapshots grounded_agreement
              WHERE grounded_agreement.booking_id = b.id
           )
           OR EXISTS (
             SELECT 1 FROM grounded_fulfilment_policy_snapshots grounded_policy
              WHERE grounded_policy.booking_id = b.id
           )
           OR EXISTS (
             SELECT 1 FROM match_requests grounded_match
              WHERE grounded_match.matched_booking_id = b.id
           )
         ) AS canonical_fulfilment_policy_present
    FROM bookings b
   WHERE b.id = $1
     AND b.status IN ('accepted', 'in_progress')`;

async function loadLocationBooking(bookingId) {
  const result = await db.query(LOCATION_BOOKING_SELECT, [bookingId]);
  return result.rows[0] || null;
}

function leaveBookingRoom(socket, bookingId) {
  if (typeof socket.leave === 'function') socket.leave(`booking:${bookingId}`);
}

function initLocationSockets(io) {
  const locationNs = io.of('/location');

  locationNs.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      socket.user = verifyAccessToken(token);
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
        const booking = await loadLocationBooking(bookingId);
        if (!booking
            || (booking.customer_id !== userId && booking.labourer_id !== userId)
            || !canUseLiveLocation(booking)) {
          leaveBookingRoom(socket, bookingId);
          return;
        }

        socket.join(`booking:${bookingId}`);
      } catch (err) {
        console.error('join:booking error', err);
      }
    });

    // Labourer emits location update — also when booking status = accepted (en route)
    socket.on('location:update', async ({ bookingId, lat, lng }) => {
      if (role !== 'labourer') return;

      try {
        // Fetch booking to get destination and verify this labourer owns it.
        const booking = await loadLocationBooking(bookingId);
        if (!booking || booking.labourer_id !== userId || !canUseLiveLocation(booking)) {
          leaveBookingRoom(socket, bookingId);
          return;
        }

        await db.query(
          'UPDATE labourer_profiles SET current_lat = $1, current_lng = $2, location_updated_at = NOW() WHERE user_id = $3',
          [lat, lng, userId]
        );

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
