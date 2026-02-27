const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const { port } = require('./config/env');
const errorHandler = require('./middleware/errorHandler');
const authRoutes = require('./routes/auth');
const labourerRoutes = require('./routes/labourers');
const bookingRoutes = require('./routes/bookings');
const paymentRoutes = require('./routes/payments');
const ratingRoutes = require('./routes/ratings');
const initLocationSockets = require('./sockets/location');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Routes
app.use('/auth', authRoutes);
app.use('/labourers', labourerRoutes);
app.use('/bookings', bookingRoutes);
app.use('/payments', paymentRoutes);
app.use('/ratings', ratingRoutes);

// Socket.io
initLocationSockets(io);

// Error handler (must be last)
app.use(errorHandler);

server.listen(port, () => {
  console.log(`Togt API running on port ${port}`);
});

module.exports = { app, server };
