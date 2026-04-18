import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  StatusBar, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authService } from '../../services/authService';
import { colors, typography, spacing, borderRadius, shadows } from '../../theme';

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
    } catch {
      // Server always returns 200 here — catch is only for network failure.
    } finally {
      setLoading(false);
      navigation.navigate('ResetPassword', { email: trimmed });
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
              <Text style={styles.title}>Forgot password</Text>
              <Text style={styles.sub}>
                Enter the email you registered with. We'll send you a 6-digit code that's valid for 15 minutes.
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
                    returnKeyType="send"
                    onSubmitEditing={onSubmit}
                    editable={!loading}
                  />
                </View>
              </View>

              <TouchableOpacity style={styles.submitBtn} onPress={onSubmit} disabled={loading}>
                {loading ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={styles.submitBtnText}>Send code</Text>
                )}
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => navigation.goBack()}
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
