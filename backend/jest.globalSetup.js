const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env.test') });
const { Client } = require('pg');
const fs = require('fs');

async function ensureDatabase() {
  const admin = new Client({ database: 'postgres' });
  await admin.connect();
  const exists = await admin.query(`SELECT 1 FROM pg_database WHERE datname = 'togt_test'`);
  if (exists.rows.length === 0) {
    await admin.query(`CREATE DATABASE togt_test`);
  }
  await admin.end();
}

async function runMigrations() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const dir = path.join(__dirname, 'src/db/migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  for (const f of files) {
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    await client.query(sql);
  }
  await client.end();
}

module.exports = async () => {
  await ensureDatabase();
  await runMigrations();
};
