/**
 * Smoke-test env setup — runs via jest.smoke.config.js `setupFiles`,
 * which executes BEFORE any test file is required. We set NODE_ENV here
 * so the app middleware sees `NODE_ENV=smoke` (NOT 'test'), which means:
 *
 *   1. The audit middleware DOES record audit_log rows (it skips under 'test').
 *   2. The dispatcher does NOT auto-start its setInterval loop (the
 *      `require.main === module` check in app.js prevents that when the
 *      app is imported as a module — the workers only start when the file
 *      is run directly via `node src/app.js`).
 *
 * The harness exposes a `tick()` helper that drives dispatcher.tick()
 * manually in tests, so we get deterministic delivery semantics.
 */
process.env.NODE_ENV = 'smoke';

// Reuse the .env.test values (DATABASE_URL, JWT secrets, webhook AES key,
// VerifyNow sandbox mode). dotenv does NOT override values already in
// process.env, so the NODE_ENV='smoke' flip above is preserved while
// everything else (real DB URL, real encryption key) is pulled in.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.test') });

// Defensive fallback for DATABASE_URL only — if .env.test was somehow
// missing or empty, fail loud rather than write to whatever pg picks.
if (!process.env.DATABASE_URL) {
  throw new Error('Smoke setup: DATABASE_URL missing. Check backend/.env.test.');
}
