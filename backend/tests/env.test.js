const { execFileSync } = require('child_process');
const path = require('path');

describe('env.js production fail-fast', () => {
  const script = path.join(__dirname, '..', 'src', 'config', 'env.js');

  test('exits with FATAL when NODE_ENV=production and JWT_SECRET missing', () => {
    try {
      execFileSync(
        process.execPath,
        ['-e', `require(${JSON.stringify(script)})`],
        {
          env: { NODE_ENV: 'production', PATH: process.env.PATH },
          cwd: '/tmp',
          stdio: 'pipe',
        }
      );
      throw new Error('should have exited non-zero');
    } catch (err) {
      expect(err.status).toBe(1);
      expect(String(err.stderr)).toMatch(/FATAL: .* is required in production/);
    }
  });

  test('dev mode tolerates missing secrets with a warning', () => {
    const out = execFileSync(
      process.execPath,
      ['-e', `const e = require(${JSON.stringify(script)}); console.log(e.jwtSecret.length > 0 ? 'ok' : 'empty')`],
      {
        env: { NODE_ENV: 'development', PATH: process.env.PATH },
        cwd: '/tmp',
        stdio: 'pipe',
      }
    );
    expect(String(out).trim()).toBe('ok');
  });
});
