'use strict';

const RESTORE_STATUS = Object.freeze({
  IDLE: 'idle',
  RESTORING: 'restoring',
  AUTHENTICATED: 'authenticated',
  SIGNED_OUT: 'signed_out',
  OFFLINE: 'offline',
  ERROR: 'error',
});

const SUPPORTED_ROLES = new Set(['customer', 'labourer']);
const DEFAULT_STORAGE_TIMEOUT_MS = 4000;
const DEFAULT_REQUEST_TIMEOUT_MS = 12000;

function timeoutError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function withTimeout(value, timeoutMs, code, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(timeoutError(code, message)), timeoutMs);
  });

  return Promise.race([Promise.resolve(value), timeout])
    .finally(() => clearTimeout(timeoutId));
}

function callWithTimeout(operation, timeoutMs, code, message) {
  return withTimeout(
    Promise.resolve().then(operation),
    timeoutMs,
    code,
    message
  );
}

function validateToken(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`Stored session requires a non-empty ${field}`);
  }
  return value;
}

function validateUser(user) {
  if (!user || typeof user !== 'object') {
    throw new TypeError('Server session requires a user');
  }
  if (typeof user.id !== 'string' || user.id.trim().length === 0) {
    throw new TypeError('Server session requires a stable user id');
  }
  if (!SUPPORTED_ROLES.has(user.role)) {
    throw new TypeError(`Unsupported marketplace role: ${String(user.role)}`);
  }
  return user;
}

function validateStoredSession(session) {
  if (!session || typeof session !== 'object') {
    throw new TypeError('Stored session is invalid');
  }
  return {
    user: session.user || null,
    accessToken: validateToken(session.accessToken, 'access token'),
    refreshToken: validateToken(session.refreshToken, 'refresh token'),
  };
}

function validateServerSession(session) {
  const validated = validateStoredSession(session);
  return {
    ...validated,
    user: validateUser(session.user),
  };
}

function httpStatus(error) {
  return Number(error?.response?.status) || null;
}

function isSessionRejected(error) {
  return [401, 403, 404].includes(httpStatus(error));
}

function isNetworkFailure(error) {
  if (error?.code === 'ERR_NETWORK') return true;
  if (['ENETUNREACH', 'ENOTFOUND', 'ECONNREFUSED'].includes(error?.code)) return true;
  return Boolean(error?.request && !error?.response);
}

function outcome(status, { session = null, hasStoredSession = false, issue = null } = {}) {
  return { status, session, hasStoredSession, issue };
}

function connectionOutcome(error, hasStoredSession) {
  if (isNetworkFailure(error)) {
    return outcome(RESTORE_STATUS.OFFLINE, {
      hasStoredSession,
      issue: {
        code: 'CONNECTION_UNAVAILABLE',
        title: 'Connection unavailable',
        detail: hasStoredSession
          ? 'Your saved session is still on this device, but TOGT must verify it before opening your account.'
          : 'TOGT could not connect. Check your connection and try again.',
      },
    });
  }

  const timedOut = error?.code === 'REQUEST_TIMEOUT';
  return outcome(RESTORE_STATUS.ERROR, {
    hasStoredSession,
    issue: {
      code: timedOut ? 'RESTORE_TIMEOUT' : 'SESSION_CHECK_FAILED',
      title: timedOut ? 'Session check took too long' : 'TOGT is temporarily unavailable',
      detail: hasStoredSession
        ? 'Your saved session has not been opened. Try again, or return to sign in.'
        : 'Try again in a moment, or return to sign in.',
    },
  });
}

async function safeClear(clearSession) {
  try {
    await clearSession();
    return true;
  } catch {
    return false;
  }
}

async function safeSave(saveSession, session) {
  try {
    await saveSession(session);
    return true;
  } catch {
    return false;
  }
}

async function restoreSession({
  readSession,
  saveSession,
  clearSession,
  getCurrentUser,
  refreshSession,
  storageTimeoutMs = DEFAULT_STORAGE_TIMEOUT_MS,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
}) {
  if (![readSession, saveSession, clearSession, getCurrentUser, refreshSession].every(
    (dependency) => typeof dependency === 'function'
  )) {
    throw new TypeError('restoreSession requires storage and auth dependencies');
  }

  let stored;
  try {
    stored = await callWithTimeout(
      readSession,
      storageTimeoutMs,
      'STORAGE_TIMEOUT',
      'Secure session storage took too long to respond'
    );
  } catch (error) {
    return outcome(RESTORE_STATUS.ERROR, {
      issue: {
        code: error?.code === 'STORAGE_TIMEOUT' ? 'STORAGE_TIMEOUT' : 'STORAGE_UNAVAILABLE',
        title: 'Saved session unavailable',
        detail: 'TOGT could not read secure session storage. Try again or return to sign in.',
      },
    });
  }

  if (!stored) {
    return outcome(RESTORE_STATUS.SIGNED_OUT);
  }

  try {
    stored = validateStoredSession(stored);
  } catch {
    await safeClear(clearSession);
    return outcome(RESTORE_STATUS.SIGNED_OUT, {
      issue: {
        code: 'INVALID_SESSION',
        title: 'Sign in again',
        detail: 'The saved session was incomplete and has been cleared.',
      },
    });
  }

  try {
    const user = validateUser(await callWithTimeout(
      () => getCurrentUser(stored.accessToken),
      requestTimeoutMs,
      'REQUEST_TIMEOUT',
      'Authoritative session check took too long'
    ));
    const session = { ...stored, user };
    await safeSave(saveSession, session);
    return outcome(RESTORE_STATUS.AUTHENTICATED, {
      session,
      hasStoredSession: true,
    });
  } catch (error) {
    if (!isSessionRejected(error)) {
      return connectionOutcome(error, true);
    }
  }

  let refreshed;
  try {
    refreshed = validateServerSession(await callWithTimeout(
      () => refreshSession(stored.refreshToken),
      requestTimeoutMs,
      'REQUEST_TIMEOUT',
      'Session refresh took too long'
    ));
    // Refresh tokens rotate server-side. Persist the new pair before the
    // follow-up /me call so a transient failure cannot orphan the session.
    await safeSave(saveSession, refreshed);
  } catch (error) {
    if (isSessionRejected(error)) {
      await safeClear(clearSession);
      return outcome(RESTORE_STATUS.SIGNED_OUT, {
        issue: {
          code: 'SESSION_EXPIRED',
          title: 'Session expired',
          detail: 'For your security, please sign in again.',
        },
      });
    }
    return connectionOutcome(error, true);
  }

  try {
    const user = validateUser(await callWithTimeout(
      () => getCurrentUser(refreshed.accessToken),
      requestTimeoutMs,
      'REQUEST_TIMEOUT',
      'Authoritative session check took too long'
    ));
    const session = { ...refreshed, user };
    await safeSave(saveSession, session);
    return outcome(RESTORE_STATUS.AUTHENTICATED, {
      session,
      hasStoredSession: true,
    });
  } catch (error) {
    if (isSessionRejected(error)) {
      await safeClear(clearSession);
      return outcome(RESTORE_STATUS.SIGNED_OUT, {
        issue: {
          code: 'SESSION_REJECTED',
          title: 'Account unavailable',
          detail: 'TOGT could not verify this account. Please sign in again.',
        },
      });
    }
    return connectionOutcome(error, true);
  }
}

function createSingleFlight() {
  let inFlight = null;
  return {
    run(operation) {
      if (!inFlight) {
        inFlight = Promise.resolve()
          .then(operation)
          .finally(() => {
            inFlight = null;
          });
      }
      return inFlight;
    },
  };
}

async function performLogout({ revokeSession, clearSession }) {
  let serverRevoked = null;
  let localCleared = false;

  if (typeof revokeSession === 'function') {
    try {
      await revokeSession();
      serverRevoked = true;
    } catch {
      serverRevoked = false;
    }
  }

  try {
    await clearSession();
    localCleared = true;
  } catch {
    localCleared = false;
  }

  return { serverRevoked, localCleared };
}

function selectAuthorizedShell({ restoreStatus, user, accessToken }) {
  if (restoreStatus === RESTORE_STATUS.SIGNED_OUT) return 'auth';
  if (restoreStatus !== RESTORE_STATUS.AUTHENTICATED) return 'startup';
  if (!user || !accessToken) return 'auth';
  if (user.role === 'customer') return 'customer';
  if (user.role === 'labourer') return 'labourer';
  return 'unsupported';
}

module.exports = {
  RESTORE_STATUS,
  createSingleFlight,
  performLogout,
  restoreSession,
  selectAuthorizedShell,
  validateServerSession,
  validateStoredSession,
  validateUser,
  withTimeout,
};
