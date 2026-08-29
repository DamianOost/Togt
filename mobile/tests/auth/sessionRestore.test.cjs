'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RESTORE_STATUS,
  createSingleFlight,
  performLogout,
  restoreSession,
  selectAuthorizedShell,
} = require('../../src/auth/sessionRestore');

const cachedSession = {
  user: { id: 'cached-user', name: 'Cached person', role: 'labourer' },
  accessToken: 'access-old',
  refreshToken: 'refresh-old',
};

function httpError(status) {
  const error = new Error(`HTTP ${status}`);
  error.response = { status };
  return error;
}

function networkError() {
  const error = new Error('Network unavailable');
  error.code = 'ERR_NETWORK';
  return error;
}

function dependencies(overrides = {}) {
  return {
    readSession: async () => cachedSession,
    saveSession: async () => {},
    clearSession: async () => {},
    getCurrentUser: async () => ({ id: 'server-user', name: 'Server person', role: 'customer' }),
    refreshSession: async () => ({
      user: { id: 'server-user', name: 'Server person', role: 'customer' },
      accessToken: 'access-new',
      refreshToken: 'refresh-new',
    }),
    ...overrides,
  };
}

test('clean launch reaches signed out without touching authenticated APIs', async () => {
  let meCalls = 0;
  const result = await restoreSession(dependencies({
    readSession: async () => null,
    getCurrentUser: async () => {
      meCalls += 1;
      throw new Error('should not be called');
    },
  }));

  assert.equal(result.status, RESTORE_STATUS.SIGNED_OUT);
  assert.equal(result.session, null);
  assert.equal(result.hasStoredSession, false);
  assert.equal(meCalls, 0);
});

test('valid restore replaces stale cached identity with authoritative /me state', async () => {
  const saved = [];
  const result = await restoreSession(dependencies({
    saveSession: async (session) => saved.push(session),
  }));

  assert.equal(result.status, RESTORE_STATUS.AUTHENTICATED);
  assert.equal(result.session.user.id, 'server-user');
  assert.equal(result.session.user.role, 'customer');
  assert.equal(result.session.accessToken, 'access-old');
  assert.equal(saved.at(-1).user.role, 'customer');
});

test('expired access token rotates once, preserves rotated credentials, and then resolves /me', async () => {
  let meCalls = 0;
  let refreshCalls = 0;
  const saved = [];
  const result = await restoreSession(dependencies({
    getCurrentUser: async (accessToken) => {
      meCalls += 1;
      if (accessToken === 'access-old') throw httpError(401);
      return { id: 'server-user', name: 'Server person', role: 'customer', kyc_status: 'pending' };
    },
    refreshSession: async (refreshToken) => {
      refreshCalls += 1;
      assert.equal(refreshToken, 'refresh-old');
      return {
        user: { id: 'server-user', name: 'Server person', role: 'customer' },
        accessToken: 'access-new',
        refreshToken: 'refresh-new',
      };
    },
    saveSession: async (session) => saved.push(session),
  }));

  assert.equal(result.status, RESTORE_STATUS.AUTHENTICATED);
  assert.equal(result.session.accessToken, 'access-new');
  assert.equal(result.session.user.kyc_status, 'pending');
  assert.equal(meCalls, 2);
  assert.equal(refreshCalls, 1);
  assert.equal(saved[0].refreshToken, 'refresh-new');
  assert.equal(saved.at(-1).user.kyc_status, 'pending');
});

test('revoked refresh token clears the stored session and returns to sign in', async () => {
  let clearCalls = 0;
  const result = await restoreSession(dependencies({
    getCurrentUser: async () => { throw httpError(401); },
    refreshSession: async () => { throw httpError(401); },
    clearSession: async () => { clearCalls += 1; },
  }));

  assert.equal(result.status, RESTORE_STATUS.SIGNED_OUT);
  assert.equal(result.issue.code, 'SESSION_EXPIRED');
  assert.equal(result.session, null);
  assert.equal(clearCalls, 1);
});

test('offline cold start preserves storage but never authorizes the cached role', async () => {
  let clearCalls = 0;
  const result = await restoreSession(dependencies({
    getCurrentUser: async () => { throw networkError(); },
    clearSession: async () => { clearCalls += 1; },
  }));

  assert.equal(result.status, RESTORE_STATUS.OFFLINE);
  assert.equal(result.hasStoredSession, true);
  assert.equal(result.session, null);
  assert.equal(clearCalls, 0);
  assert.equal(selectAuthorizedShell({
    restoreStatus: result.status,
    user: cachedSession.user,
    accessToken: cachedSession.accessToken,
  }), 'startup');
});

test('restore timeout becomes a bounded retry state', async () => {
  const result = await restoreSession(dependencies({
    readSession: () => new Promise(() => {}),
    storageTimeoutMs: 5,
  }));

  assert.equal(result.status, RESTORE_STATUS.ERROR);
  assert.equal(result.issue.code, 'STORAGE_TIMEOUT');
});

test('logout always attempts local cleanup even when server revocation fails', async () => {
  let clearCalls = 0;
  const result = await performLogout({
    revokeSession: async () => { throw networkError(); },
    clearSession: async () => { clearCalls += 1; },
  });

  assert.equal(clearCalls, 1);
  assert.equal(result.localCleared, true);
  assert.equal(result.serverRevoked, false);
});

test('single-flight shares one refresh request and permits a later new request', async () => {
  const singleFlight = createSingleFlight();
  let calls = 0;
  const operation = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return `tokens-${calls}`;
  };

  const [first, second] = await Promise.all([
    singleFlight.run(operation),
    singleFlight.run(operation),
  ]);
  const third = await singleFlight.run(operation);

  assert.equal(first, 'tokens-1');
  assert.equal(second, 'tokens-1');
  assert.equal(third, 'tokens-2');
  assert.equal(calls, 2);
});

test('authorized shell selection never falls through an unknown role to worker UI', () => {
  assert.equal(selectAuthorizedShell({ restoreStatus: RESTORE_STATUS.RESTORING }), 'startup');
  assert.equal(selectAuthorizedShell({ restoreStatus: RESTORE_STATUS.SIGNED_OUT }), 'auth');
  assert.equal(selectAuthorizedShell({
    restoreStatus: RESTORE_STATUS.AUTHENTICATED,
    user: { role: 'customer' },
    accessToken: 'token',
  }), 'customer');
  assert.equal(selectAuthorizedShell({
    restoreStatus: RESTORE_STATUS.AUTHENTICATED,
    user: { role: 'labourer' },
    accessToken: 'token',
  }), 'labourer');
  assert.equal(selectAuthorizedShell({
    restoreStatus: RESTORE_STATUS.AUTHENTICATED,
    user: { role: 'admin' },
    accessToken: 'token',
  }), 'unsupported');
});
