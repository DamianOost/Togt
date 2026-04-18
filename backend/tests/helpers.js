const request = require('supertest');
const { app } = require('../src/app');
const db = require('../src/config/db');

async function truncateAll() {
  // Order matters: child tables reference parents. CASCADE handles the rest.
  await db.query(
    'TRUNCATE TABLE ratings, payments, bookings, labourer_profiles, kyc_verifications, users RESTART IDENTITY CASCADE'
  );
}

async function registerUser(overrides = {}) {
  const unique = Date.now() + Math.floor(Math.random() * 1e6);
  const body = {
    name: 'Test User',
    email: `user_${unique}@test.com`,
    phone: `07${String(unique).slice(-9)}`,
    password: 'password123',
    role: 'customer',
    ...overrides,
  };
  const res = await request(app).post('/auth/register').send(body);
  if (res.status !== 201) {
    throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { ...body, ...res.body };
}

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

module.exports = { app, db, request, truncateAll, registerUser, authHeader };
