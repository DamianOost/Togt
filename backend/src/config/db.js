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

function productionSslConfig() {
  if (process.env.NODE_ENV !== 'production') return false;
  const configuredCa = process.env.PG_SSL_CA;
  return {
    // Never silently accept a certificate for the wrong database host. Node's
    // trusted CA store is used by default; managed providers may supply their
    // reviewed chain through the secret-bearing PG_SSL_CA environment value.
    rejectUnauthorized: true,
    ...(configuredCa && configuredCa.trim()
      ? { ca: configuredCa.replace(/\\n/g, '\n') }
      : {}),
  };
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: productionSslConfig(),
  max: POOL_MAX,
  idleTimeoutMillis: POOL_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: POOL_CONNECTION_TIMEOUT_MS,
  // pg sends this as a startup parameter before the connection is released
  // to callers. Running an asynchronous setup query from the pool connection
  // event races the first application query and is deprecated by pg.
  statement_timeout: STATEMENT_TIMEOUT_MS,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL client error', err);
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
  productionSslConfig,
  pool,
};
