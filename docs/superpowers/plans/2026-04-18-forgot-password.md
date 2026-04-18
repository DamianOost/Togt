# Forgot Password (Email Code via Resend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, single session). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a password reset flow using a 6-digit numeric code delivered by email via Resend.

**Architecture:** Two endpoints (`/auth/forgot-password`, `/auth/reset-password`). Codes SHA-256 hashed, 15-min TTL, single-use. Rate-limited on IP. Successful reset revokes all refresh-tokens for the user (forced logout on all devices). Resend SDK wrapped behind `services/email.js` so tests mock the module, not the HTTP layer.

**Tech Stack:** Node/Express, PostgreSQL, Resend SDK, React Native/Expo, jest + supertest.

---

## State snapshot (pre-work)

- Branch `claude/review-vision-screenshot-CHDSn` on HEAD `6396553`, pushed.
- Backend service `com.togt.backend` on port 3002. 18/18 tests green. Migrations 001–007 applied.
- Mobile Expo dev server running on port 8081 via LAN (Damian testing now).
- No email infrastructure exists yet. `resend` not installed.

---

## Task 1: Backend — schema, env, email service (test-mocked)

**Files:**
- Create: `backend/src/db/migrations/008_password_resets.sql`
- Create: `backend/src/services/email.js`
- Create: `backend/tests/__mocks__/resend.js` (jest mock — no real HTTP in tests)
- Modify: `backend/src/config/env.js` — add `resend` block
- Modify: `backend/.env.example`
- Modify: `backend/package.json` — add `resend` dep
- Modify: `backend/jest.config.js` — add resend to moduleNameMapper

- [ ] **Step 1.1:** Install Resend SDK
  ```bash
  ssh george '/bin/zsh -lc "cd ~/.openclaw/workspace/Togt/backend && npm install resend"'
  ```

- [ ] **Step 1.2:** Create `backend/src/db/migrations/008_password_resets.sql`
  ```sql
  -- Password reset codes (6-digit numeric, SHA-256 hashed at rest, 15-min TTL, single-use).
  -- Short-lived codes => SHA-256 is enough; bcrypt overkill. Rotating table; rows
  -- are deleted on successful use or expire via cleanup.

  CREATE TABLE IF NOT EXISTS password_resets (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash  TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);
  CREATE INDEX IF NOT EXISTS idx_password_resets_expires ON password_resets(expires_at);
  ```

- [ ] **Step 1.3:** Apply migration to both DBs
  ```bash
  ssh george '/bin/zsh -lc "cd ~/.openclaw/workspace/Togt/backend && npm run migrate 2>&1 | tail -5"'
  ```

- [ ] **Step 1.4:** Extend `backend/src/config/env.js` — add `resend` block after `peach`
  ```js
    resend: {
      apiKey: process.env.RESEND_API_KEY,
      fromAddress: process.env.RESEND_FROM || 'Togt <onboarding@resend.dev>',
    },
  ```

- [ ] **Step 1.5:** Append to `backend/.env.example`
  ```
  # Resend (password reset emails)
  RESEND_API_KEY=
  RESEND_FROM=Togt <onboarding@resend.dev>
  ```

- [ ] **Step 1.6:** Create `backend/src/services/email.js`
  ```js
  const { Resend } = require('resend');
  const { resend: resendCfg } = require('../config/env');

  let client = null;
  function getClient() {
    if (!client) {
      if (!resendCfg.apiKey) {
        throw new Error('RESEND_API_KEY not configured');
      }
      client = new Resend(resendCfg.apiKey);
    }
    return client;
  }

  async function sendPasswordResetEmail({ to, code }) {
    const html = `
      <div style="font-family: -apple-system, Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1A6B3A;">Togt — password reset</h2>
        <p>Your password reset code is:</p>
        <p style="font-size: 32px; font-weight: 700; letter-spacing: 6px; background: #F9FAFB; padding: 16px; border-radius: 8px; text-align: center;">
          ${code}
        </p>
        <p>This code expires in 15 minutes. If you did not request this, ignore this email.</p>
      </div>
    `;
    const text = `Togt password reset code: ${code}\nExpires in 15 minutes. Ignore if you did not request this.`;
    return getClient().emails.send({
      from: resendCfg.fromAddress,
      to,
      subject: 'Togt password reset code',
      html,
      text,
    });
  }

  module.exports = { sendPasswordResetEmail };
  ```

- [ ] **Step 1.7:** Create `backend/tests/__mocks__/resend.js` (jest replaces the npm module)
  ```js
  // Captures sent emails so tests can assert on them.
  const sent = [];

  class Resend {
    constructor(_apiKey) {}
    get emails() {
      return {
        send: async (msg) => {
          sent.push(msg);
          return { data: { id: `mock_${Date.now()}` }, error: null };
        },
      };
    }
  }

  module.exports = { Resend, __sent: sent };
  ```

- [ ] **Step 1.8:** Wire the mock into `backend/jest.config.js`
  ```js
    moduleNameMapper: {
      'expo-server-sdk': '<rootDir>/tests/__mocks__/expo-server-sdk.js',
      '^resend$': '<rootDir>/tests/__mocks__/resend.js',
    },
  ```

- [ ] **Step 1.9:** Smoke that harness still loads
  ```bash
  ssh george '/bin/zsh -lc "cd ~/.openclaw/workspace/Togt/backend && npm test -- --testPathPatterns=harness 2>&1 | tail -10"'
  ```
  Expected: 1 passed.

- [ ] **Step 1.10:** Commit scaffold
  ```bash
  ssh george 'cd ~/.openclaw/workspace/Togt && git add backend/package.json backend/package-lock.json backend/.env.example backend/jest.config.js backend/src/db/migrations/008_password_resets.sql backend/src/config/env.js backend/src/services/email.js backend/tests/__mocks__/resend.js && git commit -m "feat(auth): scaffold password reset — schema + email service + test mock"'
  ```

---

## Task 2: Backend — endpoints + tests (TDD)

**Files:**
- Modify: `backend/src/middleware/rateLimit.js` — add `forgotPasswordLimiter` and `resetPasswordLimiter`
- Modify: `backend/src/routes/auth.js` — add 2 new routes + helpers
- Create: `backend/tests/forgotPassword.test.js`

### 2a. Tests first (red)

- [ ] **Step 2.1:** Create `backend/tests/forgotPassword.test.js`
  ```js
  const crypto = require('crypto');
  const { request, app, db, truncateAll, registerUser } = require('./helpers');
  const { __sent: sentEmails } = require('resend');

  beforeEach(async () => {
    await truncateAll();
    await db.query('DELETE FROM password_resets');
    sentEmails.length = 0;
  });

  afterAll(async () => {
    if (db.end) await db.end();
  });

  function hashCode(code) {
    return crypto.createHash('sha256').update(String(code)).digest('hex');
  }

  describe('POST /auth/forgot-password', () => {
    test('known email: inserts code row + sends one email + returns 200', async () => {
      const u = await registerUser({ role: 'customer' });
      const res = await request(app)
        .post('/auth/forgot-password')
        .send({ email: u.email });
      expect(res.status).toBe(200);

      const rows = await db.query('SELECT user_id, expires_at FROM password_resets WHERE user_id = $1', [u.user.id]);
      expect(rows.rows).toHaveLength(1);
      expect(new Date(rows.rows[0].expires_at).getTime()).toBeGreaterThan(Date.now());

      expect(sentEmails).toHaveLength(1);
      expect(sentEmails[0].to).toBe(u.email);
      expect(sentEmails[0].subject).toMatch(/password reset/i);
      // The 6-digit code should appear in body text
      expect(sentEmails[0].text).toMatch(/\d{6}/);
    });

    test('unknown email: returns 200 (no account leak) and does NOT send', async () => {
      const res = await request(app)
        .post('/auth/forgot-password')
        .send({ email: 'noone@example.com' });
      expect(res.status).toBe(200);
      expect(sentEmails).toHaveLength(0);
      const rows = await db.query('SELECT * FROM password_resets');
      expect(rows.rows).toHaveLength(0);
    });

    test('missing email field: 400', async () => {
      const res = await request(app).post('/auth/forgot-password').send({});
      expect(res.status).toBe(400);
    });
  });

  describe('POST /auth/reset-password', () => {
    async function requestReset(email) {
      await request(app).post('/auth/forgot-password').send({ email });
      const code = sentEmails[sentEmails.length - 1].text.match(/(\d{6})/)[1];
      return code;
    }

    test('valid code + new password: updates password, marks used, revokes refresh tokens, returns 200', async () => {
      const u = await registerUser({ role: 'customer' });
      const code = await requestReset(u.email);

      // Login with old password works before reset
      const preLogin = await request(app).post('/auth/login').send({ email: u.email, password: u.password });
      expect(preLogin.status).toBe(200);

      const res = await request(app).post('/auth/reset-password').send({
        email: u.email,
        code,
        new_password: 'newpassword456',
      });
      expect(res.status).toBe(200);

      // Old password no longer works
      const oldLogin = await request(app).post('/auth/login').send({ email: u.email, password: u.password });
      expect(oldLogin.status).toBe(401);

      // New password works
      const newLogin = await request(app).post('/auth/login').send({ email: u.email, password: 'newpassword456' });
      expect(newLogin.status).toBe(200);

      // The original refresh token from registerUser is now revoked
      const origRefresh = await request(app).post('/auth/refresh').send({ refreshToken: u.refreshToken });
      expect(origRefresh.status).toBe(401);

      // password_resets row marked used
      const rows = await db.query('SELECT used_at FROM password_resets WHERE user_id = $1', [u.user.id]);
      expect(rows.rows[0].used_at).not.toBeNull();
    });

    test('wrong code: 400, password unchanged', async () => {
      const u = await registerUser({ role: 'customer' });
      await requestReset(u.email);

      const res = await request(app).post('/auth/reset-password').send({
        email: u.email,
        code: '000000',
        new_password: 'whatever',
      });
      expect(res.status).toBe(400);

      const login = await request(app).post('/auth/login').send({ email: u.email, password: u.password });
      expect(login.status).toBe(200);
    });

    test('reusing a used code: 400', async () => {
      const u = await registerUser({ role: 'customer' });
      const code = await requestReset(u.email);

      const first = await request(app).post('/auth/reset-password').send({
        email: u.email, code, new_password: 'newpassword456',
      });
      expect(first.status).toBe(200);

      const second = await request(app).post('/auth/reset-password').send({
        email: u.email, code, new_password: 'anotherpass789',
      });
      expect(second.status).toBe(400);
    });

    test('expired code: 400', async () => {
      const u = await registerUser({ role: 'customer' });
      const code = await requestReset(u.email);
      // Manually expire it
      await db.query(
        'UPDATE password_resets SET expires_at = NOW() - INTERVAL \'1 minute\' WHERE user_id = $1',
        [u.user.id]
      );
      const res = await request(app).post('/auth/reset-password').send({
        email: u.email, code, new_password: 'newpassword456',
      });
      expect(res.status).toBe(400);
    });

    test('short password: 400 (min 8 chars)', async () => {
      const u = await registerUser({ role: 'customer' });
      const code = await requestReset(u.email);
      const res = await request(app).post('/auth/reset-password').send({
        email: u.email, code, new_password: 'short',
      });
      expect(res.status).toBe(400);
    });
  });
  ```

- [ ] **Step 2.2:** Run — expect all fail (routes not defined)
  ```bash
  ssh george '/bin/zsh -lc "cd ~/.openclaw/workspace/Togt/backend && npm test -- --testPathPatterns=forgotPassword 2>&1 | tail -15"'
  ```
  Expected: 9 failed.

### 2b. Implementation

- [ ] **Step 2.3:** Add rate limiters to `backend/src/middleware/rateLimit.js`
  Append before module.exports:
  ```js
  // Strict limit on password reset to prevent enumeration + abuse:
  // 5 requests / hour / IP. Legitimate use is rare.
  const forgotPasswordLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: { error: 'Too many reset requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Looser on the actual verify step (user may typo code once or twice):
  // 10 requests / hour / IP.
  const resetPasswordLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: { error: 'Too many reset attempts, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
  });
  ```
  Update the exports line:
  ```js
  module.exports = { authLimiter, refreshLimiter, forgotPasswordLimiter, resetPasswordLimiter };
  ```

- [ ] **Step 2.4:** Add crypto import + endpoints to `backend/src/routes/auth.js`
  Near the top, alongside the other requires:
  ```js
  const crypto = require('crypto');
  const { sendPasswordResetEmail } = require('../services/email');
  ```
  Update the rateLimit import to pull in the new limiters:
  ```js
  const { authLimiter, refreshLimiter, forgotPasswordLimiter, resetPasswordLimiter } = require('../middleware/rateLimit');
  ```
  Before `module.exports`, add:
  ```js
  const RESET_CODE_TTL_MS = 15 * 60 * 1000;

  function hashCode(code) {
    return crypto.createHash('sha256').update(String(code)).digest('hex');
  }

  function generateSixDigitCode() {
    // 100000–999999 inclusive
    return String(crypto.randomInt(100000, 1000000));
  }

  // POST /auth/forgot-password — always 200 (don't leak account existence).
  router.post('/forgot-password', forgotPasswordLimiter, async (req, res, next) => {
    try {
      const { email } = req.body || {};
      if (!email) return res.status(400).json({ error: 'Email is required' });

      const u = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
      if (u.rows.length === 0) {
        // Silent: still return 200 so attacker cannot enumerate valid emails.
        return res.json({ ok: true });
      }

      // Invalidate any prior unused codes for this user so only the newest works.
      await db.query(
        'UPDATE password_resets SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL',
        [u.rows[0].id]
      );

      const code = generateSixDigitCode();
      const expiresAt = new Date(Date.now() + RESET_CODE_TTL_MS);
      await db.query(
        'INSERT INTO password_resets (user_id, code_hash, expires_at) VALUES ($1, $2, $3)',
        [u.rows[0].id, hashCode(code), expiresAt]
      );

      try {
        await sendPasswordResetEmail({ to: email, code });
      } catch (err) {
        console.error('[forgot-password] email send failed:', err.message);
        // Still return 200 — we already persisted the code. Retrying by asking
        // again will invalidate this one and send a new.
      }
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // POST /auth/reset-password — verify code + update password + revoke sessions.
  router.post('/reset-password', resetPasswordLimiter, async (req, res, next) => {
    try {
      const { email, code, new_password } = req.body || {};
      if (!email || !code || !new_password) {
        return res.status(400).json({ error: 'email, code, and new_password are required' });
      }
      if (String(new_password).length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }

      const u = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
      if (u.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid or expired code' });
      }
      const userId = u.rows[0].id;

      const resetRow = await db.query(
        `SELECT id, expires_at, used_at FROM password_resets
         WHERE user_id = $1 AND code_hash = $2
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId, hashCode(code)]
      );
      if (resetRow.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid or expired code' });
      }
      const row = resetRow.rows[0];
      if (row.used_at) {
        return res.status(400).json({ error: 'Invalid or expired code' });
      }
      if (new Date(row.expires_at).getTime() <= Date.now()) {
        return res.status(400).json({ error: 'Invalid or expired code' });
      }

      const password_hash = await bcrypt.hash(new_password, 10);
      await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [password_hash, userId]);
      await db.query('UPDATE password_resets SET used_at = NOW() WHERE id = $1', [row.id]);

      // Force logout on all devices: revoke all active refresh tokens + clear push.
      await revokeAllForUser(userId);
      await db.query('UPDATE users SET push_token = NULL WHERE id = $1', [userId]);

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });
  ```

- [ ] **Step 2.5:** Run — expect 9 passed
  ```bash
  ssh george '/bin/zsh -lc "cd ~/.openclaw/workspace/Togt/backend && npm test -- --testPathPatterns=forgotPassword --verbose 2>&1 | grep -E \"✓|✗|Tests:\""'
  ```
  Expected: 9 passed.

- [ ] **Step 2.6:** Full suite check (no regressions)
  ```bash
  ssh george '/bin/zsh -lc "cd ~/.openclaw/workspace/Togt/backend && npm test 2>&1 | tail -6"'
  ```
  Expected: 27/27 passed.

- [ ] **Step 2.7:** Commit
  ```bash
  ssh george 'cd ~/.openclaw/workspace/Togt && git add backend/src/middleware/rateLimit.js backend/src/routes/auth.js backend/tests/forgotPassword.test.js && git commit -m "feat(auth): POST /auth/forgot-password + /auth/reset-password with 15-min 6-digit codes"'
  ```

---

## Task 3: Mobile — service + screens + navigation

**Files:**
- Modify: `mobile/src/services/authService.js` — add forgotPassword + resetPassword
- Modify: `mobile/src/navigation/AuthStack.js` — register ForgotPassword + ResetPassword routes
- Modify: `mobile/src/screens/auth/LoginScreen.js` — add "Forgot password?" link
- Create: `mobile/src/screens/auth/ForgotPasswordScreen.js`
- Create: `mobile/src/screens/auth/ResetPasswordScreen.js`

- [ ] **Step 3.1:** Extend `mobile/src/services/authService.js` inside the `authService = { ... }` literal (after `logout`):
  ```js
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
  ```

- [ ] **Step 3.2:** Create `mobile/src/screens/auth/ForgotPasswordScreen.js`
  ```jsx
  import React, { useState } from 'react';
  import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    SafeAreaView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  } from 'react-native';
  import { authService } from '../../services/authService';

  export default function ForgotPasswordScreen({ navigation }) {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);

    async function onSubmit() {
      const trimmed = email.trim().toLowerCase();
      if (!trimmed) {
        Alert.alert('Email required', 'Please enter the email you registered with.');
        return;
      }
      setLoading(true);
      try {
        await authService.forgotPassword(trimmed);
        navigation.navigate('ResetPassword', { email: trimmed });
      } catch {
        // Server always returns 200 for this endpoint, so a catch here means
        // network failure. Proceed anyway — user can still try entering a code.
        navigation.navigate('ResetPassword', { email: trimmed });
      } finally {
        setLoading(false);
      }
    }

    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.inner}
        >
          <Text style={styles.title}>Forgot password</Text>
          <Text style={styles.sub}>
            Enter the email you registered with. We'll send you a 6-digit code that's valid for 15 minutes.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            editable={!loading}
          />
          <TouchableOpacity style={styles.btn} onPress={onSubmit} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Send code</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.goBack()} disabled={loading}>
            <Text style={styles.link}>Back to login</Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB' },
    inner: { flex: 1, padding: 24, justifyContent: 'center' },
    title: { fontSize: 28, fontWeight: '700', color: '#111827', marginBottom: 8 },
    sub: { fontSize: 14, color: '#6B7280', marginBottom: 24, lineHeight: 20 },
    input: {
      backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB',
      borderRadius: 10, padding: 14, fontSize: 16, marginBottom: 16,
    },
    btn: {
      backgroundColor: '#1A6B3A', borderRadius: 10, padding: 16,
      alignItems: 'center', marginBottom: 16,
    },
    btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
    link: { textAlign: 'center', color: '#1A6B3A', fontWeight: '600' },
  });
  ```

- [ ] **Step 3.3:** Create `mobile/src/screens/auth/ResetPasswordScreen.js`
  ```jsx
  import React, { useState } from 'react';
  import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    SafeAreaView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  } from 'react-native';
  import { authService } from '../../services/authService';

  export default function ResetPasswordScreen({ navigation, route }) {
    const initialEmail = route?.params?.email || '';
    const [email, setEmail] = useState(initialEmail);
    const [code, setCode] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    async function onSubmit() {
      if (!email.trim() || !code.trim() || !password) {
        Alert.alert('Missing field', 'Email, code, and new password are all required.');
        return;
      }
      if (password.length < 8) {
        Alert.alert('Password too short', 'Please use at least 8 characters.');
        return;
      }
      setLoading(true);
      try {
        await authService.resetPassword({
          email: email.trim().toLowerCase(),
          code: code.trim(),
          newPassword: password,
        });
        Alert.alert('Password updated', 'You can now log in with your new password.', [
          { text: 'OK', onPress: () => navigation.navigate('Login') },
        ]);
      } catch (err) {
        const msg = err.response?.data?.error || 'Could not reset password. Please try again.';
        Alert.alert('Reset failed', msg);
      } finally {
        setLoading(false);
      }
    }

    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.inner}
        >
          <Text style={styles.title}>Reset password</Text>
          <Text style={styles.sub}>
            Enter the 6-digit code we emailed you and choose a new password (at least 8 characters).
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            editable={!loading}
          />
          <TextInput
            style={styles.input}
            placeholder="6-digit code"
            placeholderTextColor="#9CA3AF"
            keyboardType="number-pad"
            maxLength={6}
            value={code}
            onChangeText={setCode}
            editable={!loading}
          />
          <TextInput
            style={styles.input}
            placeholder="New password"
            placeholderTextColor="#9CA3AF"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            editable={!loading}
          />
          <TouchableOpacity style={styles.btn} onPress={onSubmit} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Update password</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Login')} disabled={loading}>
            <Text style={styles.link}>Back to login</Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB' },
    inner: { flex: 1, padding: 24, justifyContent: 'center' },
    title: { fontSize: 28, fontWeight: '700', color: '#111827', marginBottom: 8 },
    sub: { fontSize: 14, color: '#6B7280', marginBottom: 24, lineHeight: 20 },
    input: {
      backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB',
      borderRadius: 10, padding: 14, fontSize: 16, marginBottom: 16,
    },
    btn: {
      backgroundColor: '#1A6B3A', borderRadius: 10, padding: 16,
      alignItems: 'center', marginBottom: 16,
    },
    btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
    link: { textAlign: 'center', color: '#1A6B3A', fontWeight: '600' },
  });
  ```

- [ ] **Step 3.4:** Register both screens in `mobile/src/navigation/AuthStack.js`
  Read existing content, then:
  - Add imports at top:
    ```js
    import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
    import ResetPasswordScreen from '../screens/auth/ResetPasswordScreen';
    ```
  - Add two `<Stack.Screen ... />` lines inside the navigator, anywhere after `Login`:
    ```jsx
    <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
    ```

- [ ] **Step 3.5:** Add "Forgot password?" link to `mobile/src/screens/auth/LoginScreen.js`
  Find the login button JSX block. Immediately after the login button (and before the "New here? Register" link), insert:
  ```jsx
  <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')}>
    <Text style={{ textAlign: 'center', color: '#1A6B3A', fontWeight: '600', marginTop: 12 }}>
      Forgot password?
    </Text>
  </TouchableOpacity>
  ```

- [ ] **Step 3.6:** Syntax check mobile changes
  ```bash
  ssh george '/bin/zsh -lc "cd ~/.openclaw/workspace/Togt/mobile && for f in src/services/authService.js src/navigation/AuthStack.js src/screens/auth/LoginScreen.js src/screens/auth/ForgotPasswordScreen.js src/screens/auth/ResetPasswordScreen.js; do node --check \"$f\" || echo FAIL \"$f\"; done && echo ALL_OK"'
  ```
  Note: `node --check` won't understand JSX. Instead verify by triggering a Metro rebundle via a curl hit:
  ```bash
  ssh george 'curl -s --max-time 30 "http://localhost:8081/index.bundle?platform=ios&dev=true&hot=false&lazy=true" -o /tmp/bundle.js -w "HTTP:%{http_code} size:%{size_download}\n"'
  ```
  Expected: HTTP:200, non-zero size. A syntax error would appear as a JSON error payload.

- [ ] **Step 3.7:** Commit mobile work
  ```bash
  ssh george 'cd ~/.openclaw/workspace/Togt && git add mobile/src/services/authService.js mobile/src/navigation/AuthStack.js mobile/src/screens/auth/LoginScreen.js mobile/src/screens/auth/ForgotPasswordScreen.js mobile/src/screens/auth/ResetPasswordScreen.js && git commit -m "feat(auth/mobile): ForgotPassword + ResetPassword screens + service methods + Login link"'
  ```

---

## Task 4: Live — plug in Resend key + end-to-end smoke

**Files:**
- Modify: `backend/.env` — add real Resend creds (not committed)

- [ ] **Step 4.1:** Ask Damian for the Resend API key.

- [ ] **Step 4.2:** Append to `.env` on Mac
  ```bash
  ssh george 'cat >> ~/.openclaw/workspace/Togt/backend/.env << EOF

  RESEND_API_KEY=re_XXXX_the_real_key
  RESEND_FROM=Togt <onboarding@resend.dev>
  EOF'
  ```

- [ ] **Step 4.3:** Restart backend + smoke via curl
  ```bash
  ssh george 'launchctl kickstart -k gui/$(id -u)/com.togt.backend && sleep 2 && curl -s http://localhost:3002/health && echo && curl -s -X POST http://localhost:3002/auth/forgot-password -H "Content-Type: application/json" -d "{\"email\":\"damianoost@gmail.com\"}" -w "\nHTTP:%{http_code}\n"'
  ```
  Expected: `{"status":"ok"}` then `{"ok":true}` / HTTP:200. Damian should see the email arrive within ~30s.

- [ ] **Step 4.4:** Walk Damian through the in-app flow: Login → Forgot password → enter email → check email → enter code + new password → log in with new password.

---

## Task 5: Push to GitHub

- [ ] **Step 5.1:** Full suite + push
  ```bash
  ssh george '/bin/zsh -lc "cd ~/.openclaw/workspace/Togt/backend && npm test 2>&1 | tail -4" && ssh george 'cd ~/.openclaw/workspace/Togt && git push origin claude/review-vision-screenshot-CHDSn && git checkout main && git merge --ff-only claude/review-vision-screenshot-CHDSn && git push origin main && git checkout claude/review-vision-screenshot-CHDSn'
  ```

---

## Success criteria

- 9 new tests in forgotPassword.test.js all green; full suite at 27/27.
- Emails delivered to real inbox via Resend (Damian confirms).
- Mobile flow: Forgot password link on Login → enter email → code email → enter code + new password → login with new password works.
- Old refresh tokens are revoked post-reset; logging in from a previously-logged-in device forces re-auth.
