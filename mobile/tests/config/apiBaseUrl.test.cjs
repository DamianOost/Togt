'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  LOCAL_DEVELOPMENT_URL,
  joinApiUrl,
  normalizeApiBaseUrl,
  resolveApiBaseUrl,
} = require('../../src/config/apiBaseUrl.cjs');

test('local development has an explicit localhost fallback', () => {
  assert.equal(resolveApiBaseUrl({ isDevelopment: true }), LOCAL_DEVELOPMENT_URL);
});

test('normalizes one configured origin for every transport', () => {
  const base = resolveApiBaseUrl({ configuredUrl: ' https://preview.example.test/ ' });
  assert.equal(base, 'https://preview.example.test');
  assert.equal(joinApiUrl(base, '/auth/login'), 'https://preview.example.test/auth/login');
  assert.equal(joinApiUrl(base, '/location'), 'https://preview.example.test/location');
  assert.equal(joinApiUrl(base, '/match'), 'https://preview.example.test/match');
  assert.equal(joinApiUrl(base, '/chat'), 'https://preview.example.test/chat');
});

test('standalone builds require a configured HTTPS origin', () => {
  assert.throws(() => resolveApiBaseUrl(), /required for standalone builds/);
  assert.throws(
    () => resolveApiBaseUrl({ configuredUrl: 'http://192.0.2.10:3000' }),
    /require an HTTPS/
  );
});

test('development and Expo Go may use an explicit HTTP origin', () => {
  assert.equal(
    resolveApiBaseUrl({ configuredUrl: 'http://192.0.2.10:3000/', isDevelopment: true }),
    'http://192.0.2.10:3000'
  );
  assert.equal(
    resolveApiBaseUrl({ configuredUrl: 'http://localhost:3002', isExpoGo: true }),
    'http://localhost:3002'
  );
});

test('rejects credentials, non-origins, unsupported protocols, and malformed paths', () => {
  assert.throws(() => normalizeApiBaseUrl('https://user:pass@example.test'), /credentials/);
  assert.throws(() => normalizeApiBaseUrl('https://example.test/api'), /without a path/);
  assert.throws(() => normalizeApiBaseUrl('wss://example.test'), /HTTP or HTTPS/);
  assert.throws(() => joinApiUrl('https://example.test', 'auth/login'), /start with one slash/);
  assert.throws(() => joinApiUrl('https://example.test', '//other.test'), /start with one slash/);
});
