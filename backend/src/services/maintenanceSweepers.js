/**
 * Maintenance sweepers — periodic background cleanup tasks.
 *
 * Two unbounded-growth tables get a regular sweep:
 *   - idempotency_keys: 24h TTL by design. The middleware does a best-
 *     effort sweep on each authed POST, but if traffic is bursty (or all
 *     callers stop sending Idempotency-Key for a while) the sweep may
 *     never run. A periodic sweep guarantees the table doesn't grow
 *     unbounded between agent-traffic spikes.
 *   - refresh_tokens: rows are inserted on every login + refresh and only
 *     soft-revoked. Without cleanup the table grows linearly forever.
 *     Keep recently-revoked rows (within ~7 days) for replay-detection
 *     auditing; expire-and-revoked older than that go.
 *
 * Both deletes are bounded with LIMIT to avoid table-locking the world
 * if a long backlog accumulated. Each tick runs a small batch and the
 * next tick continues if there's more work.
 *
 * Cadence: hourly (3600000ms) by default. Override via env. Skipped under
 * NODE_ENV=test so tests don't get surprise DELETEs.
 *
 * Observability:
 *   - stats.last_tick_at updates at the START of every tick (semantic:
 *     "we attempted a tick"). Useful for diagnosing whether setInterval
 *     is firing at all.
 *   - stats.last_success_at updates only AFTER both sweeps succeed
 *     (semantic: "the work actually ran cleanly"). isFresh() reads
 *     last_success_at so a sweeper whose DELETE throws every tick will
 *     correctly look stale to /health/deep even though last_tick_at
 *     keeps advancing. This is the fix for the bug flagged in the
 *     2026-05-09 audit.
 */

const db = require('../config/db');

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const SWEEP_BATCH_LIMIT = 1000;
const IDEMPOTENCY_TTL_HOURS = 24;
const REFRESH_TOKEN_GRACE_DAYS = 7;

let timer = null;
let stopped = false;

const stats = {
  ticks_total: 0,
  idempotency_deleted_total: 0,
  refresh_tokens_deleted_total: 0,
  last_tick_at: null,
  last_success_at: null,
  started_at: null,
  interval_ms: null,
};

async function sweepIdempotencyKeys() {
  // idempotency_keys has a composite PK (user_id, key); use ctid for the
  // bounded delete so we don't have to round-trip the keys.
  const r = await db.query(
    `DELETE FROM idempotency_keys
      WHERE ctid IN (
        SELECT ctid FROM idempotency_keys
         WHERE created_at < NOW() - INTERVAL '${IDEMPOTENCY_TTL_HOURS} hours'
         LIMIT ${SWEEP_BATCH_LIMIT}
      )`
  );
  return r.rowCount;
}

async function sweepRefreshTokens() {
  // expires_at is the 7d natural expiry. We additionally allow
  // REFRESH_TOKEN_GRACE_DAYS past expiry for replay-detection auditing
  // before we drop the row.
  const r = await db.query(
    `DELETE FROM refresh_tokens
      WHERE jti IN (
        SELECT jti FROM refresh_tokens
         WHERE expires_at < NOW() - INTERVAL '${REFRESH_TOKEN_GRACE_DAYS} days'
         LIMIT ${SWEEP_BATCH_LIMIT}
      )`
  );
  return r.rowCount;
}

async function tick() {
  if (stopped) return;
  stats.ticks_total += 1;
  stats.last_tick_at = new Date().toISOString();
  try {
    const idem = await sweepIdempotencyKeys();
    stats.idempotency_deleted_total += idem;
    const rt = await sweepRefreshTokens();
    stats.refresh_tokens_deleted_total += rt;
    // Only mark success AFTER both sweeps completed without throwing.
    // last_success_at is the freshness signal for /health/deep so a tick
    // that fails partway does NOT mask the failure.
    stats.last_success_at = new Date().toISOString();
    if (idem > 0 || rt > 0) {
      console.log(
        `[maintenanceSweepers] tick: idempotency_keys_deleted=${idem} refresh_tokens_deleted=${rt}`
      );
    }
  } catch (err) {
    console.error('[maintenanceSweepers] tick error:', err.message);
  }
}

function start({ intervalMs = DEFAULT_INTERVAL_MS } = {}) {
  stopped = false;
  stats.started_at = new Date().toISOString();
  stats.interval_ms = intervalMs;
  if (timer) clearInterval(timer);
  console.log(`[maintenanceSweepers] started: tick=${intervalMs}ms idempotency_ttl=${IDEMPOTENCY_TTL_HOURS}h refresh_token_grace=${REFRESH_TOKEN_GRACE_DAYS}d`);
  timer = setInterval(() => {
    tick().catch(e => console.error('[maintenanceSweepers] tick error:', e));
  }, intervalMs);
  if (timer.unref) timer.unref();
}

function stop() {
  stopped = true;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function isFresh(intervalMs = stats.interval_ms || DEFAULT_INTERVAL_MS, freshnessFactor = 3) {
  // Used by /health/deep: was the last SUCCESSFUL tick recent enough to
  // consider the sweeper healthy? Returns false if start() has never
  // run, if the sweeper has never had a successful tick, or if the last
  // success is older than freshnessFactor × the configured interval.
  //
  // Critically: we read last_success_at, NOT last_tick_at. A sweeper
  // whose DELETE throws every tick keeps incrementing last_tick_at but
  // never updates last_success_at — that's exactly the case this
  // function exists to catch.
  if (!stats.last_success_at) return false;
  const age = Date.now() - new Date(stats.last_success_at).getTime();
  return age < intervalMs * freshnessFactor;
}

module.exports = {
  start,
  stop,
  tick,
  sweepIdempotencyKeys,
  sweepRefreshTokens,
  isFresh,
  stats,
  DEFAULT_INTERVAL_MS,
};
