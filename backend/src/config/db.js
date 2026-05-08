const { Pool } = require('pg');
const { databaseUrl } = require('./env');

// Pool tuning: defaults are fine for single-process dev but explicit caps
// prevent runaway connection use (a leaked connection or a thundering herd
// of dispatcher ticks can saturate without limits) and bound how long we
// wait when pg is overloaded vs hard-down.
const POOL_MAX = parseInt(process.env.PG_POOL_MAX || '10', 10);
const POOL_IDLE_TIMEOUT_MS = parseInt(process.env.PG_IDLE_TIMEOUT_MS || '30000', 10);
const POOL_CONNECTION_TIMEOUT_MS = parseInt(process.env.PG_CONNECTION_TIMEOUT_MS || '5000', 10);
// Per-statement timeout. Long-running queries are pathological in this
// codebase — the auto-match selectCandidates query is the heaviest and runs
// in <50ms at sane scale. 15s is generous and still bounds the worst case.
const STATEMENT_TIMEOUT_MS = parseInt(process.env.PG_STATEMENT_TIMEOUT_MS || '15000', 10);

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: POOL_MAX,
  idleTimeoutMillis: POOL_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: POOL_CONNECTION_TIMEOUT_MS,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL client error', err);
});

// Apply statement_timeout to every newly checked-out connection. Done as
// `connect`-event hook rather than the connection-string `options` param
// because the latter is brittle across pg URL parsers.
pool.on('connect', (client) => {
  client.query(`SET statement_timeout = ${STATEMENT_TIMEOUT_MS}`).catch((e) => {
    console.error('failed to apply statement_timeout to new pg connection', e.message);
  });
});

async function withTx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* swallow rollback errors so the original error surfaces */ }
    throw err;
  } finally {
    client.release();
  }
}

// Lightweight liveness check used by /health/deep. Resolves true if a
// SELECT 1 returns within 1s, false (or throws) otherwise. Caller decides
// what to do with the result.
async function ping(timeoutMs = 1000) {
  return Promise.race([
    pool.query('SELECT 1').then(() => true),
    new Promise((_, reject) => setTimeout(() => reject(new Error('pg ping timed out')), timeoutMs)),
  ]);
}

module.exports = {
  query: (text, params) => pool.query(text, params),
  connect: () => pool.connect(),
  end: () => pool.end(),
  withTx,
  ping,
  pool,
};
