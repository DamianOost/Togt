const fs = require('fs');
const path = require('path');

describe('PostgreSQL pool configuration', () => {
  test('applies statement timeout before checkout without a racing connect query', () => {
    const source = fs.readFileSync(path.join(__dirname, '../src/config/db.js'), 'utf8');
    expect(source).toMatch(/statement_timeout:\s*STATEMENT_TIMEOUT_MS/);
    expect(source).not.toMatch(/pool\.on\(['"]connect['"][\s\S]*client\.query/);
    expect(source).toMatch(/rejectUnauthorized:\s*true/);
    expect(source).not.toMatch(/rejectUnauthorized:\s*false/);
    expect(source).toMatch(/PG_SSL_CA/);
  });
});
