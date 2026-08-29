import React, { useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTogtTheme } from '../../design';
import {
  AppScaffold,
  InlineError,
  PrimaryButton,
  TextField,
  TopAppBar,
} from '../../ui';
import { translateEnZa as t } from '../../i18n/en-ZA';
import { authService } from '../../services/authService';
import { AuthFormSurface, AuthIntro, FieldSpacer } from './AuthLayout';

export default function ForgotPasswordScreen({ navigation }) {
  const theme = useTogtTheme();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState('');

  async function onSubmit() {
    const normalisedEmail = email.trim().toLowerCase();
    if (!normalisedEmail) {
      setValidationError(t('auth.errorRequired'));
      return;
    }

    setValidationError('');
    setLoading(true);
    try {
      await authService.forgotPassword(normalisedEmail);
    } catch {
      // Account-existence privacy is preserved. The next screen keeps the
      // same generic recovery copy and allows a later retry.
    } finally {
      setLoading(false);
      navigation.navigate('ResetPassword', { email: normalisedEmail });
    }
  }

  return (
    <AppScaffold
      contentContainerStyle={{ paddingBottom: theme.spacing.xxxl }}
      keyboardAware
      scrollable
      testID="auth-forgot-password-screen"
      topBar={(
        <TopAppBar
          backLabel={t('common.back')}
          onBack={() => navigation.goBack()}
        />
      )}
    >
      <AuthIntro body={t('auth.forgotBody')} compact title={t('auth.forgotTitle')} />

      <AuthFormSurface testID="forgot-password-form">
        {validationError ? <InlineError message={validationError} /> : null}
        {validationError ? <FieldSpacer /> : null}
        <TextField
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          keyboardType="email-address"
          label={t('auth.email')}
          leading={(
            <MaterialCommunityIcons
              color={theme.colors.textSecondary}
              name="email-lock-outline"
              size={theme.sizing.iconMedium}
            />
          )}
          onChangeText={(value) => {
            setEmail(value);
            setValidationError('');
          }}
          onSubmitEditing={onSubmit}
          placeholder={t('auth.emailPlaceholder')}
          returnKeyType="send"
          textContentType="emailAddress"
          value={email}
        />
        <FieldSpacer />
        <PrimaryButton
          fullWidth
          label={t('auth.sendCode')}
          large
          loading={loading}
          onPress={onSubmit}
          testID="send-reset-code"
        />
      </AuthFormSurface>
    </AppScaffold>
  );
}
