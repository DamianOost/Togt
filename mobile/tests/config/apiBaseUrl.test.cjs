'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyApiBaseUrl,
  isPrivateOrLocalHostname,
  joinApiUrl,
  normalizeApiBaseUrl,
  resolveApiBaseUrl,
} = require('../../src/config/apiBaseUrl.cjs');

test('requires an explicit endpoint instead of embedding a localhost fallback', () => {
  assert.throws(
    () => resolveApiBaseUrl({ appEnvironment: 'development' }),
    /must be supplied explicitly/
  );
});

test('normalizes one configured origin for every transport', () => {
  const base = resolveApiBaseUrl({
    configuredUrl: ' https://preview.example.test/ ',
    appEnvironment: 'preview',
  });
  assert.equal(base, 'https://preview.example.test');
  assert.equal(joinApiUrl(base, '/auth/login'), 'https://preview.example.test/auth/login');
  assert.equal(joinApiUrl(base, '/location'), 'https://preview.example.test/location');
  assert.equal(joinApiUrl(base, '/match'), 'https://preview.example.test/match');
  assert.equal(joinApiUrl(base, '/chat'), 'https://preview.example.test/chat');
  assert.equal(joinApiUrl(base, '/uploads'), 'https://preview.example.test/uploads');
});

test('development permits only explicit local or private-LAN HTTP origins', () => {
  assert.equal(
    resolveApiBaseUrl({
      configuredUrl: 'http://192.168.10.20:3000/',
      appEnvironment: 'development',
    }),
    'http://192.168.10.20:3000'
  );
  assert.equal(
    resolveApiBaseUrl({
      configuredUrl: 'http://togt-dev.local:3002',
      appEnvironment: 'development',
    }),
    'http://togt-dev.local:3002'
  );
  assert.throws(
    () => resolveApiBaseUrl({
      configuredUrl: 'http://api.example.test',
      appEnvironment: 'development',
    }),
    /limited to localhost or a private-LAN/
  );
});

test('preview and production reject insecure and private-network origins', () => {
  assert.throws(
    () => resolveApiBaseUrl({
      configuredUrl: 'http://api.example.test',
      appEnvironment: 'preview',
    }),
    /preview requires an HTTPS/
  );
  assert.throws(
    () => resolveApiBaseUrl({
      configuredUrl: 'https://192.168.10.20:3000',
      appEnvironment: 'production',
    }),
    /must not use a localhost or private-LAN/
  );
});

test('configuration class makes development endpoint posture explicit', () => {
  assert.equal(
    classifyApiBaseUrl('http://localhost:3000', 'development'),
    'development-local'
  );
  assert.equal(
    classifyApiBaseUrl('http://10.0.0.5:3000', 'development'),
    'development-lan'
  );
  assert.equal(
    classifyApiBaseUrl('https://dev.example.test', 'development'),
    'development-secure'
  );
  assert.equal(classifyApiBaseUrl('https://preview.example.test', 'preview'), 'preview');
});

test('recognizes private IPv4, loopback, link-local, and local hostnames', () => {
  for (const hostname of [
    'localhost',
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.10',
    '169.254.10.20',
    'togt-dev.local',
    '[::1]',
  ]) {
    assert.equal(isPrivateOrLocalHostname(hostname), true, hostname);
  }
  assert.equal(isPrivateOrLocalHostname('172.32.0.1'), false);
  assert.equal(isPrivateOrLocalHostname('api.example.test'), false);
});

test('rejects credentials, non-origins, protocols, and malformed paths', () => {
  assert.throws(() => normalizeApiBaseUrl('https://user:pass@example.test'), /credentials/);
  assert.throws(() => normalizeApiBaseUrl('https://example.test/api'), /without a path/);
  assert.throws(() => normalizeApiBaseUrl('wss://example.test'), /HTTP or HTTPS/);
  assert.throws(
    () => resolveApiBaseUrl({ configuredUrl: 'https://example.test', appEnvironment: 'staging' }),
    /must be one of development, preview, or production/
  );
  assert.throws(() => joinApiUrl('https://example.test', 'auth/login'), /start with one slash/);
  assert.throws(() => joinApiUrl('https://example.test', '//other.test'), /start with one slash/);
});
