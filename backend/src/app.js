const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const { port, corsOrigins, nodeEnv } = require('./config/env');
const errorHandler = require('./middleware/errorHandler');
const { problemHandler } = require('./lib/problemJson');
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
const matchRoutes = require('./routes/match');
const apiKeyRoutes = require('./routes/apiKeys');
const webhookSubscriptionRoutes = require('./routes/webhookSubscriptions');
const mcpHttpRoutes = require('../mcp-server/httpHandler');
const initLocationSockets = require('./sockets/location');
const initChatSockets = require('./sockets/chat');
const initMatchSockets = require('./sockets/match');

const app = express();
const server = http.createServer(app);

// CORS allowlist: if CORS_ORIGINS is set, allow only those. Empty in prod = deny all browser CORS.
// Empty in dev = allow any (current behaviour) to keep Expo web preview working.
const corsOptions = corsOrigins.length
  ? { origin: corsOrigins, credentials: true }
  : nodeEnv === 'production'
    ? { origin: false }
    : {};

const io = new Server(server, {
  cors: corsOrigins.length
    ? { origin: corsOrigins, methods: ['GET', 'POST'], credentials: true }
    : nodeEnv === 'production'
      ? { origin: false, methods: ['GET', 'POST'] }
      : { origin: '*', methods: ['GET', 'POST'] },
});

// Make io available to routes (for message broadcast) AND to the matcher
// dispatcher which fires from setImmediate (outside any req scope).
app.set('io', io);
global.__togt_io = io;

// Middleware
app.use(cors(corsOptions));
// Preserve raw body for webhook HMAC verification (Peach signature check).
// express.json consumes the stream, so we capture the Buffer via the verify hook
// before parsing. Only the payments webhook needs this.
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    if (req.originalUrl && req.originalUrl.includes('/payments/webhook')) {
      req.rawBody = buf;
    }
  },
}));

// Health endpoints.
// /health is a liveness probe — process is up. Always 200 once Express is
// ready. Use this for launchd/load-balancer keepalive.
// /health/deep is a readiness probe — also pings Postgres (1s budget) and
// checks the dispatcher is fresh (last tick within 3× its interval). Use
// this for HC.io / on-call alerts that should fire when the system is
// degraded but the process is technically running.
const dbModule = require('./config/db');
const dispatcherModule = require('./services/webhookDispatcher');
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/health/deep', async (req, res) => {
  const checks = { process: 'ok', db: 'unknown', dispatcher: 'unknown' };
  let ok = true;
  try {
    await dbModule.ping(1000);
    checks.db = 'ok';
  } catch (err) {
    checks.db = `failed: ${err.message}`;
    ok = false;
  }
  if (process.env.NODE_ENV === 'test') {
    // Tests drive tick() directly, no setInterval running. Don't fail
    // /health/deep just because the dispatcher's idle.
    checks.dispatcher = 'skipped-in-test';
  } else {
    checks.dispatcher = dispatcherModule.isFresh() ? 'fresh' : 'stale';
    if (checks.dispatcher === 'stale') ok = false;
  }
  res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded', checks });
});

// Self-description endpoints for agents (RFC 5785 well-known)
const openapiSpec = require('./openapi');
const agentsManifest = require('./agentsJson');
app.get('/.well-known/openapi.json', (req, res) => res.json(openapiSpec));
app.get('/openapi.json', (req, res) => res.json(openapiSpec));
app.get('/.well-known/agents.json', (req, res) => res.json(agentsManifest));

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
app.use('/api/match', matchRoutes);
app.use('/api/api-keys', apiKeyRoutes);
app.use('/api/webhook-subscriptions', webhookSubscriptionRoutes);
app.use('/mcp', mcpHttpRoutes);
app.use('/upload', uploadRoutes);

// Legacy routes (backward compat)
app.use('/labourers', labourerRoutes);
app.use('/bookings', bookingRoutes);
app.use('/payments', paymentRoutes);
app.use('/ratings', ratingRoutes);

// Socket.io
initLocationSockets(io);
initChatSockets(io);
initMatchSockets(io);

// Error handler (must be last)
app.use(problemHandler);

// Graceful shutdown — let in-flight HTTP requests finish, stop the
// dispatcher loop, drain the pg pool, then exit. launchd SIGTERMs the
// process when reloading; without this handler in-flight requests are
// dropped and dispatcher ticks die mid-axios. The 10s force-kill ensures
// we don't hang forever if something is genuinely stuck.
function installShutdownHandlers(srv, dispatcher) {
  let shuttingDown = false;
  const shutdown = (sig) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[shutdown] ${sig} received — draining`);
    if (dispatcher) dispatcher.stop();
    srv.close(async () => {
      try { await require('./config/db').end(); } catch (e) { /* ignore */ }
      console.log('[shutdown] clean exit');
      process.exit(0);
    });
    setTimeout(() => {
      console.error('[shutdown] forced exit after 10s');
      process.exit(1);
    }, 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (require.main === module) {
  // Boot-time recovery: kill any 'pending' match_requests stranded by the
  // previous process. See matcher.js sweepStalePending().
  require('./services/matcher').sweepStalePending()
    .then((n) => { if (n > 0) console.log(`[matcher] swept ${n} stale pending match(es) on boot`); })
    .catch((err) => console.error('[matcher] boot sweep failed:', err.message));

  // Webhook dispatcher: claims due deliveries every 5s and POSTs them to subscribers.
  // Skipped under NODE_ENV=test because the test suite drives tick() directly.
  let bootDispatcher = null;
  if (process.env.NODE_ENV !== 'test') {
    bootDispatcher = require('./services/webhookDispatcher');
    bootDispatcher.start();
  }

  installShutdownHandlers(server, bootDispatcher);

  server.listen(port, () => {
    console.log(`Togt API running on port ${port}`);
  });
}

module.exports = { app, server };
