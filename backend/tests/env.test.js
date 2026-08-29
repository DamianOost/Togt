const { execFileSync } = require('child_process');
const crypto = require('crypto');
const os = require('os');
const path = require('path');

describe('env.js production fail-fast', () => {
  const script = path.join(__dirname, '..', 'src', 'config', 'env.js');

  function strongHex(label) {
    return crypto.createHash('sha256').update(`togt-env-test:${label}`).digest('hex');
  }

  const validProductionEnv = {
    NODE_ENV: 'production',
    PATH: process.env.PATH,
    DATABASE_URL: 'postgresql://production.invalid/togt',
    JWT_SECRET: strongHex('access'),
    JWT_REFRESH_SECRET: strongHex('refresh'),
    WEBHOOK_SECRET_ENCRYPTION_KEY: strongHex('webhook'),
    PII_BLIND_INDEX_KEY: strongHex('blind-index'),
  };

  function runProduction(overrides = {}) {
    const env = { ...validProductionEnv, ...overrides };
    for (const [name, value] of Object.entries(env)) {
      if (value === undefined) delete env[name];
    }
    return execFileSync(
      process.execPath,
      ['-e', `require(${JSON.stringify(script)}); process.stdout.write('ok')`],
      { env, cwd: os.tmpdir(), stdio: 'pipe' }
    );
  }

  function expectFatal(overrides, pattern) {
    try {
      runProduction(overrides);
      throw new Error('should have exited non-zero');
    } catch (err) {
      expect(err.status).toBe(1);
      expect(String(err.stderr)).toMatch(pattern);
    }
  }

  test('exits with FATAL when NODE_ENV=production and JWT_SECRET missing', () => {
    expectFatal({ JWT_SECRET: undefined }, /FATAL: JWT_SECRET is required in production/);
  });

  test.each([
    ['documented JWT placeholder', { JWT_SECRET: 'dev_jwt_secret_do_not_use_in_prod' }, /JWT_SECRET must not use .*placeholder/],
    ['short JWT secret', { JWT_SECRET: 'too-short' }, /JWT_SECRET must contain at least 32 bytes/],
    ['repeated JWT material', { JWT_SECRET: 'ab'.repeat(32) }, /JWT_SECRET must not use repeated-pattern/],
    ['repeated webhook key', { WEBHOOK_SECRET_ENCRYPTION_KEY: 'ab'.repeat(32) }, /WEBHOOK_SECRET_ENCRYPTION_KEY must not use repeated-pattern/],
    ['repeated blind-index key', { PII_BLIND_INDEX_KEY: 'cd'.repeat(32) }, /PII_BLIND_INDEX_KEY must not use repeated-pattern/],
  ])('rejects %s in production', (_label, overrides, pattern) => {
    expectFatal(overrides, pattern);
  });

  test('rejects access/refresh secret reuse in production', () => {
    expectFatal(
      { JWT_REFRESH_SECRET: validProductionEnv.JWT_SECRET },
      /JWT_REFRESH_SECRET must not reuse the same value as JWT_SECRET/
    );
  });

  test('rejects access/refresh secret reuse outside production too', () => {
    try {
      execFileSync(
        process.execPath,
        ['-e', `require(${JSON.stringify(script)})`],
        {
          env: {
            NODE_ENV: 'development',
            PATH: process.env.PATH,
            JWT_SECRET: validProductionEnv.JWT_SECRET,
            JWT_REFRESH_SECRET: validProductionEnv.JWT_SECRET,
          },
          cwd: os.tmpdir(),
          stdio: 'pipe',
        }
      );
      throw new Error('should have exited non-zero');
    } catch (err) {
      expect(err.status).toBe(1);
      expect(String(err.stderr)).toMatch(/JWT_REFRESH_SECRET must not reuse the same value as JWT_SECRET/);
    }
  });

  test('rejects encryption/blind-index secret reuse in production', () => {
    expectFatal(
      { PII_BLIND_INDEX_KEY: validProductionEnv.WEBHOOK_SECRET_ENCRYPTION_KEY },
      /PII_BLIND_INDEX_KEY must not reuse the same value as WEBHOOK_SECRET_ENCRYPTION_KEY/
    );
  });

  test('loads with independent production-grade secrets', () => {
    expect(String(runProduction())).toBe('ok');
  });

  test('dev mode tolerates missing secrets with a warning', () => {
    const out = execFileSync(
      process.execPath,
      ['-e', `const e = require(${JSON.stringify(script)}); console.log(e.jwtSecret.length > 0 ? 'ok' : 'empty')`],
      {
        env: { NODE_ENV: 'development', PATH: process.env.PATH },
        cwd: os.tmpdir(),
        stdio: 'pipe',
      }
    );
    expect(String(out).trim()).toBe('ok');
  });
});
