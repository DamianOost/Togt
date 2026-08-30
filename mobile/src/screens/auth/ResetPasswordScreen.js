import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { useTogtTheme } from '../../design';
import {
  AppScaffold,
  InlineError,
  PrimaryButton,
  TertiaryButton,
  TextField,
  TopAppBar,
} from '../../ui';
import { translateEnZa as t } from '../../i18n/en-ZA';
import { authService } from '../../services/authService';
import { AuthFormSurface, AuthIntro, FieldSpacer } from './AuthLayout';

export default function ResetPasswordScreen({ navigation, route }) {
  const theme = useTogtTheme();
  const initialEmail = route?.params?.email || '';
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [formError, setFormError] = useState('');

  function clearFormError() {
    if (formError) setFormError('');
  }

  async function onSubmit() {
    const normalisedEmail = email.trim().toLowerCase();
    const normalisedCode = code.trim();
    if (!normalisedEmail || !normalisedCode || !password) {
      setFormError(t('auth.errorRequired'));
      return;
    }
    if (password.length < 8) {
      setFormError(t('auth.errorPasswordLength'));
      return;
    }

    setFormError('');
    setLoading(true);
    try {
      await authService.resetPassword({
        email: normalisedEmail,
        code: normalisedCode,
        newPassword: password,
      });
      Alert.alert(t('auth.passwordUpdatedTitle'), t('auth.passwordUpdatedBody'), [
        { text: t('auth.signIn'), onPress: () => navigation.navigate('Login') },
      ]);
    } catch {
      setFormError(t('auth.errorReset'));
    } finally {
      setLoading(false);
    }
  }

  async function resendCode() {
    const normalisedEmail = email.trim().toLowerCase();
    if (!normalisedEmail) {
      setFormError(t('auth.errorRequired'));
      return;
    }

    setFormError('');
    setResending(true);
    try {
      await authService.forgotPassword(normalisedEmail);
      Alert.alert(t('auth.codeSentTitle'), t('auth.codeSentBody'));
    } catch {
      setFormError(t('auth.errorReset'));
    } finally {
      setResending(false);
    }
  }

  return (
    <AppScaffold
      contentContainerStyle={{ paddingBottom: theme.spacing.xxxl }}
      keyboardAware
      scrollable
      testID="auth-reset-password-screen"
      topBar={(
        <TopAppBar
          backLabel={t('common.back')}
          onBack={() => navigation.navigate('Login')}
        />
      )}
    >
      <AuthIntro body={t('auth.resetBody')} compact title={t('auth.resetTitle')} />

      <AuthFormSurface testID="reset-password-form">
        {formError ? <InlineError message={formError} testID="reset-password-error" /> : null}
        {formError ? <FieldSpacer /> : null}
        <TextField
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          keyboardType="email-address"
          label={t('auth.email')}
          onChangeText={(value) => {
            setEmail(value);
            clearFormError();
          }}
          placeholder={t('auth.emailPlaceholder')}
          textContentType="emailAddress"
          value={email}
        />
        <FieldSpacer />
        <TextField
          autoComplete="one-time-code"
          keyboardType="number-pad"
          label={t('auth.code')}
          leading={(
            <MaterialCommunityIcons
              color={theme.colors.textSecondary}
              name="numeric"
              size={theme.sizing.iconMedium}
            />
          )}
          maxLength={6}
          onChangeText={(value) => {
            setCode(value.replace(/\D/g, ''));
            clearFormError();
          }}
          placeholder={t('auth.codePlaceholder')}
          textContentType="oneTimeCode"
          value={code}
        />
        <FieldSpacer />
        <TextField
          autoComplete="new-password"
          label={t('auth.newPassword')}
          onChangeText={(value) => {
            setPassword(value);
            clearFormError();
          }}
          onSubmitEditing={onSubmit}
          placeholder={t('auth.newPasswordPlaceholder')}
          returnKeyType="done"
          secureTextEntry={!showPassword}
          textContentType="newPassword"
          value={password}
        />
        <View style={styles.passwordAction}>
          <TertiaryButton
            label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
            leading={(
              <MaterialCommunityIcons
                color={theme.colors.actionPrimaryPressed}
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={theme.sizing.iconSmall}
              />
            )}
            onPress={() => setShowPassword((visible) => !visible)}
          />
        </View>
        <PrimaryButton
          fullWidth
          label={t('auth.updatePassword')}
          large
          loading={loading}
          onPress={onSubmit}
          testID="update-password"
        />
        <TertiaryButton
          disabled={loading}
          fullWidth
          label={t('auth.sendAnotherCode')}
          loading={resending}
          onPress={resendCode}
          style={{ marginTop: theme.spacing.xs }}
        />
      </AuthFormSurface>
    </AppScaffold>
  );
}

const styles = StyleSheet.create({
  passwordAction: {
    alignItems: 'flex-end',
  },
});
