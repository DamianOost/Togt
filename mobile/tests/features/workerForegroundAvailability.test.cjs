'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  WORKER_FOREGROUND_LOCATION_MAX_AGE_MS,
  requestGroundedWorkerOnlineAvailability,
} = require('../../src/features/worker/integration/workerForegroundAvailability.ts');

function dependencies(overrides = {}) {
  const calls = [];
  const now = 1_800_000_000_000;
  return {
    calls,
    now,
    value: {
      requestForegroundPermission: async () => {
        calls.push('permission');
        return true;
      },
      getCurrentForegroundPosition: async () => {
        calls.push('position');
        return { lat: -33.9249, lng: 18.4241, capturedAt: now - 1_000 };
      },
      sendLocationHeartbeat: async (position) => {
        calls.push(['heartbeat', position]);
      },
      requestOnline: async () => {
        calls.push('online');
        return 'server-confirmed-online';
      },
      now: () => now,
      ...overrides,
    },
  };
}

test('online request sends one fresh foreground heartbeat before availability mutation', async () => {
  const fixture = dependencies();
  const result = await requestGroundedWorkerOnlineAvailability(fixture.value);

  assert.equal(result, 'server-confirmed-online');
  assert.deepEqual(fixture.calls.map((call) => Array.isArray(call) ? call[0] : call), [
    'permission',
    'position',
    'heartbeat',
    'online',
  ]);
  assert.deepEqual(fixture.calls[2][1], {
    lat: -33.9249,
    lng: 18.4241,
    capturedAt: fixture.now - 1_000,
  });
});

test('denied foreground permission fails closed before location or server mutations', async () => {
  const fixture = dependencies({
    requestForegroundPermission: async () => {
      fixture.calls.push('permission');
      return false;
    },
  });

  await assert.rejects(
    requestGroundedWorkerOnlineAvailability(fixture.value),
    (error) => error.problem?.type === 'worker_foreground_location_permission_denied',
  );
  assert.deepEqual(fixture.calls, ['permission']);
});

test('stale position fails closed before heartbeat and availability mutations', async () => {
  const fixture = dependencies({
    getCurrentForegroundPosition: async () => {
      fixture.calls.push('position');
      return {
        lat: -33.9249,
        lng: 18.4241,
        capturedAt: fixture.now - WORKER_FOREGROUND_LOCATION_MAX_AGE_MS - 1,
      };
    },
  });

  await assert.rejects(
    requestGroundedWorkerOnlineAvailability(fixture.value),
    (error) => error.problem?.type === 'worker_foreground_location_stale',
  );
  assert.deepEqual(fixture.calls, ['permission', 'position']);
});

test('unavailable position and failed heartbeat never request online availability', async (t) => {
  await t.test('position unavailable', async () => {
    const fixture = dependencies({
      getCurrentForegroundPosition: async () => {
        fixture.calls.push('position');
        throw new Error('gps unavailable');
      },
    });
    await assert.rejects(
      requestGroundedWorkerOnlineAvailability(fixture.value),
      (error) => error.problem?.type === 'worker_foreground_location_unavailable',
    );
    assert.deepEqual(fixture.calls, ['permission', 'position']);
  });

  await t.test('heartbeat rejected', async () => {
    const fixture = dependencies({
      sendLocationHeartbeat: async () => {
        fixture.calls.push('heartbeat');
        throw new Error('server rejected heartbeat');
      },
    });
    await assert.rejects(
      requestGroundedWorkerOnlineAvailability(fixture.value),
      /server rejected heartbeat/,
    );
    assert.deepEqual(fixture.calls, ['permission', 'position', 'heartbeat']);
  });
});

test('Worker Today wires foreground-only capture to the canonical heartbeat before going online', () => {
  const mobileRoot = path.resolve(__dirname, '..', '..');
  const routes = fs.readFileSync(path.join(mobileRoot, 'src/features/worker/integration/WorkerShellRoutes.tsx'), 'utf8');
  const service = fs.readFileSync(path.join(mobileRoot, 'src/services/groundedWorkerShell.ts'), 'utf8');
  const location = fs.readFileSync(path.join(mobileRoot, 'src/services/locationService.js'), 'utf8');

  assert.match(routes, /requestGroundedWorkerOnlineAvailability/);
  assert.match(routes, /requestForegroundPermission:\s*\(\) => locationService\.requestPermission\(\)/);
  assert.match(routes, /getCurrentForegroundPosition:\s*\(\) => locationService\.getCurrentPosition\(\)/);
  assert.match(routes, /sendGroundedWorkerForegroundLocationHeartbeat/);
  assert.match(service, /url: '\/api\/labourers\/location'/);
  assert.match(service, /root\.updated !== true/);
  assert.match(location, /getCurrentPositionAsync/);
  assert.match(location, /capturedAt:\s*location\.timestamp/);
  assert.doesNotMatch(routes, /watchPosition|startLocationUpdates|requestBackgroundPermissions/);
});
