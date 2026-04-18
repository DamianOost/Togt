import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  StatusBar, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authService } from '../../services/authService';
import { colors, typography, spacing, borderRadius, shadows } from '../../theme';

export default function ResetPasswordScreen({ navigation, route }) {
  const initialEmail = route?.params?.email || '';
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <View style={styles.header}>
              <Text style={styles.title}>Reset password</Text>
              <Text style={styles.sub}>
                Enter the 6-digit code we emailed you and choose a new password (at least 8 characters).
              </Text>
            </View>

            <View style={styles.card}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email</Text>
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
                    editable={!loading}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>6-digit code</Text>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputIcon}>🔢</Text>
                  <TextInput
                    style={styles.input}
                    value={code}
                    onChangeText={setCode}
                    keyboardType="number-pad"
                    maxLength={6}
                    placeholder="123456"
                    placeholderTextColor={colors.textMuted}
                    editable={!loading}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>New password</Text>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputIcon}>🔒</Text>
                  <TextInput
                    style={styles.input}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    placeholder="At least 8 characters"
                    placeholderTextColor={colors.textMuted}
                    returnKeyType="done"
                    onSubmitEditing={onSubmit}
                    editable={!loading}
                  />
                  <TouchableOpacity onPress={() => setShowPassword((v) => !v)}>
                    <Text style={styles.showPassBtn}>{showPassword ? '🙈' : '👁️'}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity style={styles.submitBtn} onPress={onSubmit} disabled={loading}>
                {loading ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={styles.submitBtnText}>Update password</Text>
                )}
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => navigation.navigate('Login')}
              style={styles.backLink}
              disabled={loading}
            >
              <Text style={styles.backText}>← Back to login</Text>
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
  header: { paddingTop: spacing.xl, paddingBottom: spacing.lg, alignItems: 'center' },
  title: { fontSize: typography.xl, fontWeight: '800', color: colors.textInverse, marginBottom: spacing.sm },
  sub: {
    fontSize: typography.sm, color: colors.textMuted, textAlign: 'center',
    lineHeight: 20, paddingHorizontal: spacing.md,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    ...shadows.card,
  },
  inputGroup: { marginBottom: spacing.md },
  inputLabel: {
    fontSize: typography.sm, fontWeight: '700', color: colors.textSecondary,
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
  submitBtn: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
    ...shadows.card,
  },
  submitBtnText: { color: colors.primary, fontSize: typography.lg, fontWeight: '800' },
  backLink: { alignItems: 'center', marginTop: spacing.lg, paddingBottom: spacing.lg },
  backText: { color: colors.accent, fontWeight: '700', fontSize: typography.sm },
});
