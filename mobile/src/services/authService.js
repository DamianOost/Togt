import api from './api';

export const authService = {
  async register(data) {
    const res = await api.post('/auth/register', data);
    return res.data;
  },
  async login({ email, password }) {
    const res = await api.post('/auth/login', { email, password });
    return res.data;
  },
  async refresh(refreshToken) {
    const res = await api.post('/auth/refresh', { refreshToken });
    return res.data;
  },
  async forgotPassword(email) {
    const res = await api.post('/auth/forgot-password', { email });
    return res.data;
  },
  async resetPassword({ email, code, newPassword }) {
    const res = await api.post('/auth/reset-password', {
      email,
      code,
      new_password: newPassword,
    });
    return res.data;
  },
    async logout({ accessToken, refreshToken }) {
    // Best-effort — the user wants out now, so never throw.
    // On success the server revokes the refresh jti and clears push_token.
    try {
      await api.post(
        '/auth/logout',
        { refreshToken },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
    } catch {
      // Swallowed — local state will still be cleared.
    }
  },
};
