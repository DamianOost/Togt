'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mobileRoot = path.resolve(__dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(mobileRoot, relative), 'utf8');
const AUTH_SCREENS = [
  'src/screens/auth/OnboardingScreen.js',
  'src/screens/auth/LoginScreen.js',
  'src/screens/auth/RegisterScreen.js',
  'src/screens/auth/ForgotPasswordScreen.js',
  'src/screens/auth/ResetPasswordScreen.js',
];
const ACCOUNT_SCREENS = [
  'src/screens/account/AccountScreenBase.js',
  'src/screens/account/CustomerAccountScreen.js',
  'src/screens/account/WorkerAccountScreen.js',
];

test('auth and account screens use the Grounded Momentum system without legacy styling', () => {
  for (const file of [...AUTH_SCREENS, ...ACCOUNT_SCREENS]) {
    const source = read(file);
    assert.doesNotMatch(source, /from ['"]\.\.\/\.\.\/theme['"]/);
    assert.doesNotMatch(source, /#[0-9a-f]{3,8}/i);
    assert.doesNotMatch(source, /[\u{1F300}-\u{1FAFF}]/u);
    assert.match(source, /\.\.\/\.\.\/(?:design|ui)|\.\/AccountScreenBase/);
  }

  for (const file of AUTH_SCREENS) {
    const source = read(file);
    assert.match(source, /<AppScaffold/);
    assert.match(source, /translateEnZa as t/);
    assert.match(source, /MaterialCommunityIcons/);
    assert.doesNotMatch(source, /TouchableOpacity|TextInput|StatusBar|SafeAreaView/);
  }
});

test('every auth and account localisation key exists in the en-ZA catalogue', () => {
  const catalogue = read('src/i18n/en-ZA.ts');
  const source = [
    read('src/screens/auth/AuthLayout.js'),
    ...AUTH_SCREENS.map(read),
    ...ACCOUNT_SCREENS.map(read),
  ].join('\n');
  const keys = [...source.matchAll(/\bt\('([^']+)'\)/g)].map((match) => match[1]);

  assert.ok(keys.length > 0);
  for (const key of new Set(keys)) {
    assert.match(catalogue, new RegExp(`['"]${key.replaceAll('.', '\\.')}['"]\\s*:`));
  }
});

test('every selected Material Community icon exists in the packaged glyph map', () => {
  const glyphs = JSON.parse(read(
    'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json',
  ));
  const icons = [
    'text-box-outline',
    'account-search-outline',
    'check-circle-outline',
    'hammer-wrench',
    'briefcase-outline',
    'email-outline',
    'lock-outline',
    'eye-off-outline',
    'eye-outline',
    'email-lock-outline',
    'numeric',
    'account-outline',
    'map-marker-outline',
    'credit-card-outline',
    'bell-outline',
    'translate',
    'account-hard-hat-outline',
    'certificate-outline',
    'tools',
    'map-clock-outline',
    'bank-outline',
    'account-alert-outline',
    'shield-lock-outline',
    'lifebuoy',
    'phone-outline',
    'shield-account-outline',
  ];

  for (const icon of icons) assert.ok(glyphs[icon], `Missing Material Community icon: ${icon}`);
});

test('visible auth role copy is canonical while API compatibility keeps labourer internally', () => {
  const onboarding = read('src/screens/auth/OnboardingScreen.js');
  const register = read('src/screens/auth/RegisterScreen.js');

  assert.match(onboarding, /t\('auth\.offerServices'\)/);
  assert.match(onboarding, /role: 'labourer'/);
  assert.match(register, /value: 'labourer', labelKey: 'auth\.worker'/);
  assert.match(register, /policyConsent:\s*\{[\s\S]*revision: policyState\.value\.revision[\s\S]*termsAccepted: true[\s\S]*privacyAccepted: true/);
  assert.match(register, /<ConsentCheckbox/);
  assert.match(register, /disabled=\{policyState\.status !== 'ready' \|\| !termsAccepted \|\| !privacyAccepted\}/);
  assert.doesNotMatch(register, /marketingAccepted|marketingConsent/);
  assert.doesNotMatch(onboarding, /['"]Labourer['"]/);
  assert.doesNotMatch(register, /['"]Labourer['"]/);
});

test('auth behaviour keeps authoritative thunks and private recovery contracts', () => {
  const login = read('src/screens/auth/LoginScreen.js');
  const forgot = read('src/screens/auth/ForgotPasswordScreen.js');
  const reset = read('src/screens/auth/ResetPasswordScreen.js');

  assert.match(login, /loginThunk\(\{ email: normalisedEmail, password \}\)/);
  assert.match(login, /clearError\(\)/);
  assert.match(forgot, /await authService\.forgotPassword\(normalisedEmail\)/);
  assert.match(forgot, /navigation\.navigate\('ResetPassword', \{ email: normalisedEmail \}\)/);
  assert.match(reset, /await authService\.resetPassword\(\{/);
  assert.match(reset, /newPassword: password/);
  assert.match(reset, /await authService\.forgotPassword\(normalisedEmail\)/);
  assert.doesNotMatch(forgot, /account exists|email registered/i);
});

test('auth fields expose autofill, password visibility and accessible error treatment', () => {
  const login = read('src/screens/auth/LoginScreen.js');
  const register = read('src/screens/auth/RegisterScreen.js');
  const reset = read('src/screens/auth/ResetPasswordScreen.js');

  assert.match(login, /textContentType="emailAddress"/);
  assert.match(login, /autoComplete="current-password"/);
  assert.match(register, /textContentType="telephoneNumber"/);
  assert.match(register, /autoComplete="new-password"/);
  assert.match(reset, /textContentType="oneTimeCode"/);
  assert.match(reset, /name=\{showPassword \? 'eye-off-outline' : 'eye-outline'\}/);
  assert.match(login, /<InlineError/);
  assert.match(register, /<InlineError/);
  assert.match(reset, /<InlineError/);
});

test('account surfaces fail closed and expose no unsupported action buttons', () => {
  const account = read('src/screens/account/AccountScreenBase.js');

  assert.match(account, /getEffectiveCapabilities\(\)/);
  assert.match(account, /failClosedCapabilities\('account_capability_load_failed'\)/);
  assert.match(account, /capabilityEnabled\(capabilities, 'identity_verification'\)/);
  assert.match(account, /user\?\.kyc_status === 'verified'[\s\S]*?return actionable[\s\S]*?t\('account\.verified'\)[\s\S]*?t\('kyc\.statusLegacy'\)[\s\S]*?actionable: false/);
  assert.match(account, /verification\.actionable \? \(\) => navigation\.navigate\('KYC'\) : undefined/);
  assert.match(account, /dispatch\(logoutThunk\(\)\)/);
  assert.match(account, /t\('account\.paymentsUnavailable'\)/);
  assert.match(account, /t\('account\.payoutUnavailable'\)/);
  assert.match(account, /navigation\.navigate\('NotificationControls'\)/);
  assert.match(account, /Remote delivery is unavailable/);
  assert.doesNotMatch(account, /available balance|next payout|escrow|background tracking/i);
  assert.doesNotMatch(account, /api\.(?:get|post|put|patch|delete)/);
  assert.doesNotMatch(account, /maxFontSizeMultiplier=\{(?:1(?:\.\d+)?|0\.\d+)\}/);
  assert.match(account, /maxFontSizeMultiplier=\{2\}/);
});

test('customer and Worker account entry points bind one authorised role each', () => {
  const customer = read('src/screens/account/CustomerAccountScreen.js');
  const worker = read('src/screens/account/WorkerAccountScreen.js');

  assert.match(customer, /role="customer"/);
  assert.match(worker, /role="worker"/);
  assert.doesNotMatch(customer, /role switch|switch role/i);
  assert.doesNotMatch(worker, /role switch|switch role/i);
});
