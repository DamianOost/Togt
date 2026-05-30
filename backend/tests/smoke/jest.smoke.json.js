/**
 * Jest config for the smoke test suite.
 *
 * Lives under tests/smoke/ so Jest does NOT auto-discover it when running
 * the unit suite (`npm test`). The `npm run smoke` script points here
 * explicitly via --config. rootDir is set so paths still resolve from
 * the backend folder.
 *
 * Differences from the default unit invocation:
 *   1. `setupFiles` runs setupEnv.js BEFORE any test file imports, so the
 *      `NODE_ENV=smoke` flip lands before the app/middleware closures
 *      capture `process.env.NODE_ENV`.
 *   2. testMatch is narrowed to *.smoke.test.js so the unit suite doesn't
 *      get pulled in (or pull these in inversely).
 *   3. testTimeout is bumped: smokes touch real HTTP+DB+workers and can
 *      legitimately take a few seconds per assertion.
 *   4. runInBand stays — the smoke DB is shared; serial execution avoids
 *      flake across smoke files.
 */
module.exports = {
  rootDir: '../..',
  testMatch: ['<rootDir>/tests/smoke/**/*.smoke.test.js'],
  setupFiles: ['<rootDir>/tests/smoke/setupEnv.js'],
  testTimeout: 30000,
  testEnvironment: 'node',
  forceExit: true,
};
