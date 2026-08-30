import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useDispatch, useSelector } from 'react-redux';

import { adaptRegistrationPolicyV1 } from '../../data/grounded';
import { useTogtTheme } from '../../design';
import {
  AppScaffold,
  ConsentCheckbox,
  InlineError,
  PrimaryButton,
  Surface,
  TertiaryButton,
  TextField,
  TopAppBar,
} from '../../ui';
import { translateEnZa as t } from '../../i18n/en-ZA';
import { authService } from '../../services/authService';
import { clearError, registerThunk } from '../../store/authSlice';
import { AuthFormSurface, AuthIntro, FieldSpacer } from './AuthLayout';

const ROLES = [
  { value: 'customer', labelKey: 'auth.customer', icon: 'hammer-wrench' },
  { value: 'labourer', labelKey: 'auth.worker', icon: 'briefcase-outline' },
];

export default function RegisterScreen({ route, navigation }) {
  const preselectedRole = route?.params?.role === 'labourer' ? 'labourer' : 'customer';
  const dispatch = useDispatch();
  const theme = useTogtTheme();
  const { loading, error } = useSelector((state) => state.auth);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    role: preselectedRole,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [policyAttempt, setPolicyAttempt] = useState(0);
  const [policyState, setPolicyState] = useState({ status: 'loading' });
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  useEffect(() => {
    let active = true;
    setPolicyState({ status: 'loading' });
    setTermsAccepted(false);
    setPrivacyAccepted(false);
    authService.getRegistrationPolicy()
      .then((response) => {
        if (!active) return;
        const adapted = adaptRegistrationPolicyV1(response);
        if (!adapted.ok || !adapted.value.available) {
          setPolicyState({ status: 'error' });
          return;
        }
        setPolicyState({ status: 'ready', value: adapted.value });
      })
      .catch(() => {
        if (active) setPolicyState({ status: 'error' });
      });
    return () => { active = false; };
  }, [policyAttempt]);

  function setField(key) {
    return (value) => {
      setForm((current) => ({ ...current, [key]: value }));
      setValidationError('');
      if (error) dispatch(clearError());
    };
  }

  function chooseRole(role) {
    setForm((current) => ({ ...current, role }));
    if (error) dispatch(clearError());
  }

  function handleRegister() {
    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    const phone = form.phone.trim();
    if (!name || !email || !phone || !form.password) {
      setValidationError(t('auth.errorRequired'));
      return;
    }
    if (form.password.length < 8) {
      setValidationError(t('auth.errorPasswordLength'));
      return;
    }
    if (policyState.status !== 'ready') {
      setValidationError(t('auth.policyUnavailable'));
      return;
    }
    if (!termsAccepted || !privacyAccepted) {
      setValidationError(t('auth.policyRequired'));
      return;
    }

    setValidationError('');
    // The internal compatibility value remains `labourer`; the authorised
    // account shell maps it to the canonical customer-facing term Worker.
    dispatch(registerThunk({
      ...form,
      name,
      email,
      phone,
      policyConsent: {
        revision: policyState.value.revision,
        termsAccepted: true,
        privacyAccepted: true,
      },
    }));
  }

  const registerBody = form.role === 'customer'
    ? t('auth.registerBodyCustomer')
    : t('auth.registerBodyWorker');
  const submitLabel = form.role === 'customer'
    ? t('auth.createCustomer')
    : t('auth.createWorker');

  return (
    <AppScaffold
      contentContainerStyle={{ paddingBottom: theme.spacing.xxxl }}
      keyboardAware
      scrollable
      testID="auth-register-screen"
      topBar={(
        <TopAppBar
          backLabel={t('common.back')}
          onBack={() => navigation.goBack()}
        />
      )}
    >
      <AuthIntro body={registerBody} compact title={t('auth.registerTitle')} />

      <View
        accessibilityRole="radiogroup"
        style={[styles.roleRow, { columnGap: theme.spacing.sm, marginTop: theme.spacing.lg }]}
      >
        {ROLES.map((role) => {
          const selected = form.role === role.value;
          const label = t(role.labelKey);
          return (
            <Surface
              accessibilityLabel={label}
              key={role.value}
              onPress={() => chooseRole(role.value)}
              selected={selected}
              style={[styles.roleChoice, { minHeight: theme.sizing.controlHeightLarge }]}
              testID={`role-${role.value}`}
              variant={selected ? 'positive' : 'default'}
            >
              <MaterialCommunityIcons
                color={selected ? theme.colors.actionPrimaryPressed : theme.colors.textSecondary}
                name={role.icon}
                size={theme.sizing.iconLarge}
              />
              <Text
                allowFontScaling
                style={[
                  theme.typography.label,
                  {
                    color: selected ? theme.colors.actionPrimaryPressed : theme.colors.text,
                    marginLeft: theme.spacing.xs,
                  },
                ]}
              >
                {label}
              </Text>
            </Surface>
          );
        })}
      </View>

      <AuthFormSurface testID="register-form">
        {validationError || error ? (
          <InlineError message={validationError || t('auth.errorRegister')} testID="register-error" />
        ) : null}
        {validationError || error ? <FieldSpacer /> : null}

        <TextField
          autoCapitalize="words"
          autoComplete="name"
          label={t('auth.fullName')}
          onChangeText={setField('name')}
          placeholder={t('auth.fullNamePlaceholder')}
          required
          textContentType="name"
          value={form.name}
        />
        <FieldSpacer />
        <TextField
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          keyboardType="email-address"
          label={t('auth.email')}
          onChangeText={setField('email')}
          placeholder={t('auth.emailPlaceholder')}
          required
          textContentType="emailAddress"
          value={form.email}
        />
        <FieldSpacer />
        <TextField
          autoComplete="tel"
          helperText={t('auth.phoneHelper')}
          keyboardType="phone-pad"
          label={t('auth.phone')}
          onChangeText={setField('phone')}
          placeholder={t('auth.phonePlaceholder')}
          required
          textContentType="telephoneNumber"
          value={form.phone}
        />
        <FieldSpacer />
        <TextField
          autoComplete="new-password"
          label={t('auth.password')}
          onChangeText={setField('password')}
          onSubmitEditing={handleRegister}
          placeholder={t('auth.newPasswordPlaceholder')}
          required
          returnKeyType="done"
          secureTextEntry={!showPassword}
          textContentType="newPassword"
          value={form.password}
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
        <FieldSpacer />
        <Surface style={{ gap: theme.spacing.sm }} testID="registration-policy-consent" variant="subtle">
          <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>
            {t('auth.policyTitle')}
          </Text>
          <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>
            {t('auth.policyBody')}
          </Text>
          {policyState.status === 'loading' ? (
            <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>
              {t('auth.policyLoading')}
            </Text>
          ) : policyState.status === 'error' ? (
            <>
              <InlineError message={t('auth.policyUnavailable')} testID="registration-policy-error" />
              <TertiaryButton label={t('common.retry')} onPress={() => setPolicyAttempt((attempt) => attempt + 1)} />
            </>
          ) : (
            <>
              {policyState.value.releaseChannel === 'internal_testing' ? (
                <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>
                  {t('auth.policyInternal')}
                </Text>
              ) : null}
              {policyState.value.documents.map((document) => (
                <View key={document.kind} style={{ gap: theme.spacing.xs }}>
                  <ConsentCheckbox
                    checked={document.kind === 'terms' ? termsAccepted : privacyAccepted}
                    label={document.kind === 'terms' ? t('auth.acceptTerms') : t('auth.acceptPrivacy')}
                    onPress={() => {
                      setValidationError('');
                      if (document.kind === 'terms') setTermsAccepted((accepted) => !accepted);
                      else setPrivacyAccepted((accepted) => !accepted);
                    }}
                    testID={`consent-${document.kind}`}
                  />
                  <TertiaryButton
                    accessibilityHint={t('auth.policyLinkHint')}
                    label={`${t('auth.readPolicy')} ${document.title} · ${document.version}`}
                    onPress={() => {
                      void Linking.openURL(document.url).catch(() => setValidationError(t('auth.policyLinkError')));
                    }}
                  />
                </View>
              ))}
            </>
          )}
        </Surface>
        <FieldSpacer />
        <Surface style={{ gap: theme.spacing.xs }} variant="attention">
          <Text accessibilityRole="header" allowFontScaling style={[theme.typography.label, { color: theme.colors.text }]}>
            {t('auth.nextStepTitle')}
          </Text>
          <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>
            {form.role === 'customer' ? t('auth.nextStepCustomer') : t('auth.nextStepWorker')}
          </Text>
        </Surface>
        <FieldSpacer />
        <PrimaryButton
          disabled={policyState.status !== 'ready' || !termsAccepted || !privacyAccepted}
          fullWidth
          label={submitLabel}
          large
          loading={loading}
          onPress={handleRegister}
          testID="register-submit"
        />
      </AuthFormSurface>

      <View style={[styles.signInRow, { marginTop: theme.spacing.md }]}>
        <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>
          {t('auth.haveAccount')}
        </Text>
        <TertiaryButton label={t('auth.signIn')} onPress={() => navigation.navigate('Login')} />
      </View>
    </AppScaffold>
  );
}

const styles = StyleSheet.create({
  passwordAction: {
    alignItems: 'flex-end',
  },
  roleChoice: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  roleRow: {
    alignItems: 'stretch',
    flexDirection: 'row',
  },
  signInRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
});
