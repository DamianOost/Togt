import axios from 'axios';
import Constants from 'expo-constants';

const BASE_URL = Constants.expoConfig?.extra?.apiUrl || 'http://localhost:3000';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Auth handlers wired by App.js at boot. Kept as injection so api.js doesn't
// import Redux directly (avoids circular deps with authSlice).
let handlers = {
  getAccessToken: () => null,
  // async () => ({ accessToken, refreshToken, user }) — must persist + update Redux as a side effect
  refreshAndStore: null,
  onLogout: () => {},
};

export function setAuthHandlers(h) {
  handlers = { ...handlers, ...h };
}

// Back-compat shim — older call sites use setTokenGetter
export function setTokenGetter(fn) {
  handlers.getAccessToken = fn;
}

// Attach access token on every outgoing request
api.interceptors.request.use((config) => {
  const token = handlers.getAccessToken?.();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On 401, try one silent refresh + retry. Multiple in-flight 401s share the
// same refresh promise so we never fire parallel /auth/refresh calls.
let refreshPromise = null;

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config;
    if (!original || error.response?.status !== 401 || original._retried) {
      return Promise.reject(error);
    }
    // Don't intercept the auth endpoints themselves — that would loop or
    // mask real credential failures.
    const url = original.url || '';
    if (url.includes('/auth/refresh') ||
        url.includes('/auth/login') ||
        url.includes('/auth/register') ||
        url.includes('/auth/forgot-password') ||
        url.includes('/auth/reset-password')) {
      return Promise.reject(error);
    }
    if (!handlers.refreshAndStore) {
      return Promise.reject(error);
    }

    original._retried = true;

    try {
      if (!refreshPromise) {
        refreshPromise = handlers.refreshAndStore()
          .finally(() => { refreshPromise = null; });
      }
      const tokens = await refreshPromise;
      original.headers.Authorization = `Bearer ${tokens.accessToken}`;
      return api(original);
    } catch (refreshErr) {
      // Refresh itself failed (revoked / expired refresh token) — log the
      // user out cleanly. Reject with the ORIGINAL 401 so callers see the
      // real reason rather than the refresh failure.
      handlers.onLogout?.();
      return Promise.reject(error);
    }
  }
);

export default api;
