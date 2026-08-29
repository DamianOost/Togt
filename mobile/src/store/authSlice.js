import { createAction, createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import * as SecureStore from 'expo-secure-store';
import { authService } from '../services/authService';

const {
  RESTORE_STATUS,
  performLogout,
  restoreSession: restoreStoredSession,
  validateServerSession,
} = require('../auth/sessionRestore');

// SecureStore keys must match /^[A-Za-z0-9._-]+$/ — no @ prefix here.
const STORAGE_KEY = 'togt_auth';
const logoutStarted = createAction('auth/logoutStarted');

async function saveAuth(data) {
  await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(data));
}

async function readAuth() {
  const raw = await SecureStore.getItemAsync(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    error.code = 'AUTH_STORAGE_CORRUPT';
    throw error;
  }
}

async function clearAuth() {
  try {
    await SecureStore.deleteItemAsync(STORAGE_KEY);
  } catch (error) {
    // An empty tombstone prevents a stale session being restored when delete
    // is temporarily unavailable but SecureStore can still write.
    try {
      await SecureStore.setItemAsync(STORAGE_KEY, '');
    } catch {}
    throw error;
  }
}

function authError(error, fallback) {
  return error.response?.data?.error
    || error.response?.data?.title
    || error.response?.data?.detail
    || fallback;
}

export const loginThunk = createAsyncThunk('auth/login', async (credentials, { rejectWithValue }) => {
  try {
    const data = validateServerSession(await authService.login(credentials));
    await saveAuth(data);
    return data;
  } catch (error) {
    return rejectWithValue(authError(error, 'Login failed'));
  }
});

export const registerThunk = createAsyncThunk('auth/register', async (data, { rejectWithValue }) => {
  try {
    const result = validateServerSession(await authService.register(data));
    await saveAuth(result);
    return result;
  } catch (error) {
    return rejectWithValue(authError(error, 'Registration failed'));
  }
});

// Restore is deliberately authoritative: cached identity and role never enter
// Redux until /api/auth/me succeeds. A rejected access token gets one explicit
// rotation, followed by another /me check.
export const restoreSessionThunk = createAsyncThunk(
  'auth/restore',
  async () => restoreStoredSession({
    readSession: readAuth,
    saveSession: saveAuth,
    clearSession: clearAuth,
    getCurrentUser: authService.getCurrentUser,
    refreshSession: authService.refresh,
  }),
  {
    condition: (_, { getState }) => getState().auth.restoreStatus !== RESTORE_STATUS.RESTORING,
  }
);

// Silent token rotation called from api.js 401 interceptor.
export const refreshTokensThunk = createAsyncThunk(
  'auth/refreshTokens',
  async (_, { getState, rejectWithValue }) => {
    const { refreshToken } = getState().auth;
    if (!refreshToken) return rejectWithValue('No refresh token');
    try {
      const data = validateServerSession(await authService.refresh(refreshToken));
      await saveAuth(data);
      return data;
    } catch (error) {
      return rejectWithValue(authError(error, 'Refresh failed'));
    }
  }
);

// Server revocation is best effort, but the Redux session is cleared as soon
// as logout begins and secure local cleanup is always attempted.
export const logoutThunk = createAsyncThunk('auth/logout', async (_, { dispatch, getState }) => {
  const { accessToken, refreshToken } = getState().auth;
  // Capture credentials before clearing Redux so server revocation still has
  // the token pair it needs. The explicit action then removes role authority
  // immediately, before the best-effort network request begins.
  dispatch(logoutStarted());
  return performLogout({
    revokeSession: accessToken && refreshToken
      ? () => authService.logout({ accessToken, refreshToken })
      : null,
    clearSession: clearAuth,
  });
});

function clearReduxSession(state) {
  state.user = null;
  state.accessToken = null;
  state.refreshToken = null;
  state.loading = false;
  state.restored = true;
  state.restoreStatus = RESTORE_STATUS.SIGNED_OUT;
  state.hasStoredSession = false;
}

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: null,
    accessToken: null,
    refreshToken: null,
    loading: false,
    error: null,
    restored: false,
    restoreStatus: RESTORE_STATUS.IDLE,
    restoreIssue: null,
    hasStoredSession: false,
  },
  reducers: {
    setTokens(state, action) {
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
    },
    clearError(state) {
      state.error = null;
    },
    updateUser(state, action) {
      state.user = { ...state.user, ...action.payload };
      const stored = {
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      };
      saveAuth(stored).catch(() => {});
    },
  },
  extraReducers: (builder) => {
    const handleCredentialPending = (state) => {
      state.loading = true;
      state.error = null;
    };
    const handleCredentialFulfilled = (state, action) => {
      state.loading = false;
      state.user = action.payload.user;
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
      state.error = null;
      state.restored = true;
      state.restoreStatus = RESTORE_STATUS.AUTHENTICATED;
      state.restoreIssue = null;
      state.hasStoredSession = true;
    };
    const handleCredentialRejected = (state, action) => {
      state.loading = false;
      state.error = action.payload || 'Authentication failed';
    };

    builder
      .addCase(loginThunk.pending, handleCredentialPending)
      .addCase(loginThunk.fulfilled, handleCredentialFulfilled)
      .addCase(loginThunk.rejected, handleCredentialRejected)
      .addCase(registerThunk.pending, handleCredentialPending)
      .addCase(registerThunk.fulfilled, handleCredentialFulfilled)
      .addCase(registerThunk.rejected, handleCredentialRejected)
      .addCase(restoreSessionThunk.pending, (state) => {
        state.user = null;
        state.accessToken = null;
        state.refreshToken = null;
        state.restored = false;
        state.restoreStatus = RESTORE_STATUS.RESTORING;
        state.restoreIssue = null;
        state.error = null;
      })
      .addCase(restoreSessionThunk.fulfilled, (state, action) => {
        const result = action.payload;
        state.restored = true;
        state.restoreStatus = result.status;
        state.restoreIssue = result.issue;
        state.hasStoredSession = result.hasStoredSession;

        if (result.status === RESTORE_STATUS.AUTHENTICATED) {
          state.user = result.session.user;
          state.accessToken = result.session.accessToken;
          state.refreshToken = result.session.refreshToken;
          state.error = null;
        } else {
          state.user = null;
          state.accessToken = null;
          state.refreshToken = null;
          state.error = result.status === RESTORE_STATUS.SIGNED_OUT
            ? result.issue?.detail || null
            : null;
        }
      })
      .addCase(restoreSessionThunk.rejected, (state, action) => {
        if (action.meta.condition) return;
        state.restored = true;
        state.restoreStatus = RESTORE_STATUS.ERROR;
        state.restoreIssue = {
          code: 'RESTORE_FAILED',
          title: 'Session unavailable',
          detail: 'TOGT could not restore your session. Try again or return to sign in.',
        };
      })
      .addCase(logoutStarted, (state) => {
        clearReduxSession(state);
        state.error = null;
        state.restoreIssue = null;
      })
      .addCase(logoutThunk.fulfilled, (state, action) => {
        clearReduxSession(state);
        state.error = action.payload.localCleared
          ? null
          : 'Secure session storage could not be cleared. Restart TOGT before signing in again.';
      })
      .addCase(logoutThunk.rejected, (state) => {
        clearReduxSession(state);
        state.error = 'Secure session cleanup could not be confirmed.';
      })
      .addCase(refreshTokensThunk.fulfilled, (state, action) => {
        state.user = action.payload.user;
        state.accessToken = action.payload.accessToken;
        state.refreshToken = action.payload.refreshToken;
        state.error = null;
        state.restored = true;
        state.restoreStatus = RESTORE_STATUS.AUTHENTICATED;
        state.restoreIssue = null;
        state.hasStoredSession = true;
      });
  },
});

export const { setTokens, clearError, updateUser } = authSlice.actions;
export { RESTORE_STATUS };
export default authSlice.reducer;
