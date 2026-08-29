'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ANALYTICS_SCHEMA_VERSION,
  createProductAnalytics,
  sanitizeAnalyticsProperties,
} = require('../../src/data/analytics/analytics.ts');

test('sanitizer retains only controlled, PII-safe primitives', () => {
  const safe = sanitizeAnalyticsProperties({
    booking_id: 'booking_123',
    result_code: 'loaded',
    count: 2,
    offline: false,
    name: 'Nomsa Example',
    phone: '+27 82 123 4567',
    id_number: '9001015009087',
    address: '12 Long Street',
    latitude: -33.9,
    longitude: 18.4,
    notes: 'Gate code 1234',
    chat: 'private message',
    transcript: 'private transcript',
    photo_url: 'https://private.example/photo.jpg',
    card_number: '4111111111111111',
    service_id: 'bad value with spaces',
    attempt: -1,
  });

  assert.deepEqual(safe, {
    booking_id: 'booking_123',
    result_code: 'loaded',
    count: 2,
    offline: false,
  });
});

test('track emits a complete neutral envelope without accepting PII context', () => {
  const events = [];
  const analytics = createProductAnalytics(
    { send: (event) => events.push(event) },
    {
      pseudonymousActorId: 'actor_f7c2',
      role: 'customer',
      sessionId: 'session_9',
      appVersion: '1.0.1',
      platform: 'android',
      platformVersion: '35',
    },
    {
      now: () => new Date('2026-08-29T12:00:00.000Z'),
      eventId: () => 'event_1',
    },
  );

  analytics.track('home.intent_started', {
    service_id: 'plumbing_v1',
    result_code: 'started',
    raw_intent: 'My geyser at 12 Main Road is broken',
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].schema_version, ANALYTICS_SCHEMA_VERSION);
  assert.equal(events[0].occurred_at, '2026-08-29T12:00:00.000Z');
  assert.equal(events[0].pseudonymous_actor_id, 'actor_f7c2');
  assert.equal(events[0].result_code, 'started');
  assert.deepEqual(events[0].properties, {
    service_id: 'plumbing_v1',
    result_code: 'started',
  });
});

test('captureException never emits error message, stack or unsafe context', () => {
  const events = [];
  const analytics = createProductAnalytics(
    { send: (event) => events.push(event) },
    { pseudonymousActorId: 'user@example.com', role: 'customer' },
    { eventId: () => 'event_2' },
  );

  analytics.captureException(
    new TypeError('Card for Nomsa failed at 12 Long Street'),
    {
      failure_code: 'booking_fetch_failed',
      address: '12 Long Street',
      email: 'user@example.com',
    },
  );

  assert.equal(events.length, 1);
  assert.equal(events[0].pseudonymous_actor_id, 'anonymous');
  assert.equal(events[0].event_name, 'app.exception_captured');
  assert.deepEqual(events[0].properties, {
    failure_code: 'booking_fetch_failed',
    error_name: 'TypeError',
    result_code: 'failed',
  });
  const serialized = JSON.stringify(events[0]);
  assert.doesNotMatch(serialized, /Nomsa|Long Street|user@example\.com|Card for/);
});

test('measure rejects unsafe durations and measurement transport failures stay isolated', () => {
  const events = [];
  const analytics = createProductAnalytics({
    send: (event) => {
      events.push(event);
      throw new Error('provider unavailable');
    },
  });

  assert.doesNotThrow(() => analytics.measure('service_catalog.loaded', 42.4, { count: 3 }));
  analytics.measure('service_catalog.loaded', Number.POSITIVE_INFINITY, { count: 4 });
  analytics.track('Invalid Event Name', { count: 5 });

  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'measure');
  assert.equal(events[0].properties.duration_ms, 42);
});
