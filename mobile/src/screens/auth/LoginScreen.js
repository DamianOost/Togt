import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  StatusBar, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import { loginThunk } from '../../store/authSlice';
import { colors, typography, spacing, borderRadius, shadows } from '../../theme';

export default function LoginScreen({ navigation }) {
  const dispatch = useDispatch();
  const { loading, error } = useSelector((s) => s.auth);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  function handleLogin() {
    if (!email.trim() || !password) return;
    dispatch(loginThunk({ email: email.trim().toLowerCase(), password }));
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            {/* Logo */}
            <View style={styles.logoSection}>
              <View style={styles.logoCircle}>
                <Text style={styles.logoText}>T</Text>
              </View>
              <Text style={styles.appName}>Togt</Text>
              <Text style={styles.tagline}>Find skilled workers, instantly.</Text>
            </View>

            {/* Form card */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Welcome back</Text>

              {error && (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorText}>⚠️ {error}</Text>
                </View>
              )}

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email Address</Text>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputIcon}>✉️</Text>
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="you@example.com"
                    placeholderTextColor={colors.textMuted}
                    returnKeyType="next"
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Password</Text>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputIcon}>🔒</Text>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    placeholder="Enter password"
                    placeholderTextColor={colors.textMuted}
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
                  />
                  <TouchableOpacity onPress={() => setShowPassword((v) => !v)}>
                    <Text style={styles.showPassBtn}>{showPassword ? '🙈' : '👁️'}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity style={styles.loginBtn} onPress={handleLogin} disabled={loading}>
                {loading ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={styles.loginBtnText}>Log In</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => navigation.navigate('ForgotPassword')}
                style={{ alignItems: 'center', marginTop: spacing.md }}
                disabled={loading}
              >
                <Text style={{ color: colors.accent, fontWeight: '700', fontSize: typography.sm }}>
                  Forgot password?
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => navigation.navigate('Onboarding')}
              style={styles.signupLink}
            >
              <Text style={styles.signupText}>
                Don't have an account?{' '}
                <Text style={styles.signupBold}>Sign up</Text>
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary },
  scroll: { flexGrow: 1, paddingHorizontal: spacing.lg },
  logoSection: {
    alignItems: 'center',
    paddingTop: spacing.xl + spacing.md,
    paddingBottom: spacing.xl,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: borderRadius.full,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    ...shadows.card,
  },
  logoText: { fontSize: 40, fontWeight: '900', color: colors.primary },
  appName: { fontSize: typography.xxl, fontWeight: '900', color: '#fff', letterSpacing: -1 },
  tagline: { fontSize: typography.sm, color: colors.textMuted, marginTop: 4 },
  card: {
    backgroundColor: '#fff',
    borderRadius: borderRadius.md + 4,
    padding: spacing.lg,
    ...shadows.heavy,
  },
  cardTitle: {
    fontSize: typography.xl,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  errorBanner: {
    backgroundColor: colors.dangerLight,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  errorText: { color: colors.danger, fontSize: typography.sm },
  inputGroup: { marginBottom: spacing.md },
  inputLabel: {
    fontSize: typography.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
  },
  inputIcon: { fontSize: 16, marginRight: spacing.xs },
  input: {
    flex: 1,
    fontSize: typography.md,
    color: colors.textPrimary,
    paddingVertical: spacing.sm + 4,
  },
  showPassBtn: { fontSize: 18, padding: 4 },
  loginBtn: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
    ...shadows.card,
  },
  loginBtnText: { color: colors.primary, fontSize: typography.lg, fontWeight: '800' },
  signupLink: { alignItems: 'center', marginTop: spacing.lg, paddingBottom: spacing.lg },
  signupText: { fontSize: typography.sm, color: colors.textMuted },
  signupBold: { color: colors.accent, fontWeight: '700' },
});
