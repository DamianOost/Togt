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
const messageRoutes = require('./routes/messages');
const serviceRoutes = require('./routes/services');
const earningsRoutes = require('./routes/earnings');
const kycRoutes = require('./routes/kyc');
const bookingExtRoutes = require('./routes/bookingExtensions');
const safetyRoutes = require('./routes/safety');
const uploadRoutes = require('./routes/upload');
const initLocationSockets = require('./sockets/location');
const initChatSockets = require('./sockets/chat');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Make io available to routes (for message broadcast)
app.set('io', io);

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Routes
app.use('/auth', authRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/labourers', labourerRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/ratings', ratingRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/earnings', earningsRoutes);
app.use('/api/kyc', kycRoutes);
app.use('/api/bookings', bookingExtRoutes);
app.use('/api/safety', safetyRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/upload', uploadRoutes);

// Legacy routes (backward compat)
app.use('/labourers', labourerRoutes);
app.use('/bookings', bookingRoutes);
app.use('/payments', paymentRoutes);
app.use('/ratings', ratingRoutes);

// Socket.io
initLocationSockets(io);
initChatSockets(io);

// Error handler (must be last)
app.use(errorHandler);

server.listen(port, () => {
  console.log(`Togt API running on port ${port}`);
});

module.exports = { app, server };
