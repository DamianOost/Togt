/**
 * /health (liveness) and /health/deep (readiness) endpoint tests.
 *
 * /health is process-up: always 200 once Express is listening.
 * /health/deep also pings Postgres and checks the dispatcher is fresh
 * (last tick within 3× its interval). Used by HC.io / on-call alerts.
 */

const { request, app, db } = require('./helpers');
const dispatcher = require('../src/services/webhookDispatcher');

afterAll(async () => {
  if (db.end) await db.end();
});

describe('/health (liveness)', () => {
  test('returns 200 ok unconditionally', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('/health/deep (readiness)', () => {
  test('returns 200 with all checks ok when DB is reachable (test mode skips dispatcher check)', async () => {
    const res = await request(app).get('/health/deep');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.checks.process).toBe('ok');
    expect(res.body.checks.db).toBe('ok');
    // Tests drive tick() directly — readiness check skips the dispatcher
    // freshness check under NODE_ENV=test so we don't fail just because
    // the setInterval isn't running.
    expect(res.body.checks.dispatcher).toBe('skipped-in-test');
  });
});

describe('webhookDispatcher.isFresh', () => {
  test('returns false before start() runs', () => {
    // Snapshot the started_at to restore after test
    const original = { ...dispatcher.stats };
    dispatcher.stats.last_tick_at = null;
    expect(dispatcher.isFresh()).toBe(false);
    Object.assign(dispatcher.stats, original);
  });

  test('returns true when last_tick_at is recent', () => {
    const original = { ...dispatcher.stats };
    dispatcher.stats.last_tick_at = new Date().toISOString();
    dispatcher.stats.interval_ms = 5000;
    expect(dispatcher.isFresh()).toBe(true);
    Object.assign(dispatcher.stats, original);
  });

  test('returns false when last_tick_at is older than 3× interval_ms', () => {
    const original = { ...dispatcher.stats };
    dispatcher.stats.last_tick_at = new Date(Date.now() - 60_000).toISOString();
    dispatcher.stats.interval_ms = 5000;
    expect(dispatcher.isFresh()).toBe(false);
    Object.assign(dispatcher.stats, original);
  });
});
