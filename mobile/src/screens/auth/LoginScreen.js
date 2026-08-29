import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useDispatch, useSelector } from 'react-redux';

import { useTogtTheme } from '../../design';
import {
  AppScaffold,
  InlineError,
  PrimaryButton,
  TertiaryButton,
  TextField,
} from '../../ui';
import { translateEnZa as t } from '../../i18n/en-ZA';
import { clearError, loginThunk } from '../../store/authSlice';
import { AuthFormSurface, AuthIntro, FieldSpacer } from './AuthLayout';

export default function LoginScreen({ navigation }) {
  const dispatch = useDispatch();
  const theme = useTogtTheme();
  const { loading, error } = useSelector((state) => state.auth);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [validationError, setValidationError] = useState('');

  function updateEmail(value) {
    setEmail(value);
    setValidationError('');
    if (error) dispatch(clearError());
  }

  function updatePassword(value) {
    setPassword(value);
    setValidationError('');
    if (error) dispatch(clearError());
  }

  function handleLogin() {
    const normalisedEmail = email.trim().toLowerCase();
    if (!normalisedEmail || !password) {
      setValidationError(t('auth.errorRequired'));
      return;
    }
    setValidationError('');
    dispatch(loginThunk({ email: normalisedEmail, password }));
  }

  return (
    <AppScaffold
      contentContainerStyle={{
        justifyContent: 'center',
        paddingBottom: theme.spacing.xxl,
        paddingTop: theme.spacing.xxl,
      }}
      keyboardAware
      scrollable
      testID="auth-sign-in-screen"
    >
      <AuthIntro
        body={t('auth.signInBody')}
        compact
        title={t('auth.signInTitle')}
      />

      <AuthFormSurface testID="sign-in-form">
        {validationError || error ? (
          <InlineError message={validationError || t('auth.errorSignIn')} testID="sign-in-error" />
        ) : null}

        {validationError || error ? <FieldSpacer size="md" /> : null}

        <TextField
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          keyboardType="email-address"
          label={t('auth.email')}
          leading={(
            <MaterialCommunityIcons
              color={theme.colors.textSecondary}
              name="email-outline"
              size={theme.sizing.iconMedium}
            />
          )}
          onChangeText={updateEmail}
          placeholder={t('auth.emailPlaceholder')}
          returnKeyType="next"
          textContentType="emailAddress"
          value={email}
        />

        <FieldSpacer />

        <TextField
          autoComplete="current-password"
          label={t('auth.password')}
          leading={(
            <MaterialCommunityIcons
              color={theme.colors.textSecondary}
              name="lock-outline"
              size={theme.sizing.iconMedium}
            />
          )}
          onChangeText={updatePassword}
          onSubmitEditing={handleLogin}
          placeholder={t('auth.passwordPlaceholder')}
          returnKeyType="done"
          secureTextEntry={!showPassword}
          textContentType="password"
          value={password}
        />

        <View style={styles.passwordAction}>
          <TertiaryButton
            accessibilityHint={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
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
          label={t('auth.signIn')}
          large
          loading={loading}
          onPress={handleLogin}
          testID="sign-in-submit"
        />

        <TertiaryButton
          disabled={loading}
          fullWidth
          label={t('auth.forgotPassword')}
          onPress={() => navigation.navigate('ForgotPassword')}
          style={{ marginTop: theme.spacing.xs }}
        />
      </AuthFormSurface>

      <View style={[styles.createRow, { marginTop: theme.spacing.md }]}>
        <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>
          {t('auth.noAccount')}
        </Text>
        <TertiaryButton
          label={t('auth.createAccount')}
          onPress={() => navigation.navigate('Onboarding')}
        />
      </View>
    </AppScaffold>
  );
}

const styles = StyleSheet.create({
  createRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  passwordAction: {
    alignItems: 'flex-end',
  },
});
