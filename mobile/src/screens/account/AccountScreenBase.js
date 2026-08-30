import React, { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useDispatch, useSelector } from 'react-redux';

import { useTogtTheme } from '../../design';
import {
  AppScaffold,
  DangerButton,
  SectionHeader,
  SecondaryButton,
  StatusPill,
  Surface,
  TopAppBar,
} from '../../ui';
import { translateEnZa as t } from '../../i18n/en-ZA';
import { logoutThunk } from '../../store/authSlice';
import {
  capabilityEnabled,
  failClosedCapabilities,
  getEffectiveCapabilities,
} from '../../services/capabilityService';

function useAccountCapabilities() {
  const [capabilities, setCapabilities] = useState(null);

  useEffect(() => {
    let active = true;
    getEffectiveCapabilities()
      .then((result) => {
        if (active) setCapabilities(result);
      })
      .catch(() => {
        if (active) setCapabilities(failClosedCapabilities('account_capability_load_failed'));
      });
    return () => {
      active = false;
    };
  }, []);

  return capabilities;
}

function initialsFor(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase()).join('') || 'T';
}

function verificationState(user, capabilities) {
  if (!capabilities) {
    return { label: t('account.checking'), tone: 'pending', actionable: false };
  }

  const actionable = capabilityEnabled(capabilities, 'identity_verification');
  if (user?.kyc_status === 'verified') {
    return actionable
      ? { label: t('account.verified'), tone: 'available', actionable: true }
      : { label: t('kyc.statusLegacy'), tone: 'offline', actionable: false };
  }
  if (user?.kyc_status === 'pending') {
    return { label: t('account.pending'), tone: 'pending', actionable };
  }
  return { label: t('account.notVerified'), tone: 'offline', actionable };
}

function AccountIdentity({ role, user, verification }) {
  const theme = useTogtTheme();
  const roleLabel = role === 'worker' ? t('account.workerRole') : t('account.customerRole');

  return (
    <Surface elevation="card" style={{ padding: theme.spacing.lg }}>
      <View style={[styles.identityRow, { columnGap: theme.spacing.md }]}>
        <View
          accessible
          accessibilityLabel={user?.name || 'TOGT'}
          style={[
            styles.avatar,
            {
              backgroundColor: theme.colors.surfacePositive,
              borderColor: theme.colors.actionPrimary,
              borderRadius: theme.radius.hero,
              borderWidth: theme.border.thin,
              height: theme.sizing.controlHeightLarge,
              width: theme.sizing.controlHeightLarge,
            },
          ]}
        >
          <Text
            allowFontScaling
            maxFontSizeMultiplier={2}
            style={[theme.typography.h3, { color: theme.colors.actionPrimaryPressed }]}
          >
            {initialsFor(user?.name)}
          </Text>
        </View>
        <View style={styles.identityCopy}>
          <Text
            allowFontScaling
            style={[theme.typography.caption, { color: theme.colors.textSecondary }]}
          >
            {t('account.signedInAs')}
          </Text>
          <Text
            accessibilityRole="header"
            allowFontScaling
            style={[
              theme.typography.h2,
              { color: theme.colors.text, marginTop: theme.spacing.xxs },
            ]}
          >
            {user?.name || 'TOGT'}
          </Text>
          <Text
            allowFontScaling
            style={[
              theme.typography.bodySmall,
              { color: theme.colors.textSecondary, marginTop: theme.spacing.xxs },
            ]}
          >
            {roleLabel}
          </Text>
        </View>
      </View>

      <View style={[styles.identityMeta, { marginTop: theme.spacing.md, rowGap: theme.spacing.xs }]}>
        {user?.email ? (
          <View style={[styles.metaRow, { columnGap: theme.spacing.xs }]}>
            <MaterialCommunityIcons
              color={theme.colors.textSecondary}
              name="email-outline"
              size={theme.sizing.iconSmall}
            />
            <Text allowFontScaling style={[theme.typography.bodySmall, styles.metaText, { color: theme.colors.textSecondary }]}>
              {user.email}
            </Text>
          </View>
        ) : null}
        {user?.phone ? (
          <View style={[styles.metaRow, { columnGap: theme.spacing.xs }]}>
            <MaterialCommunityIcons
              color={theme.colors.textSecondary}
              name="phone-outline"
              size={theme.sizing.iconSmall}
            />
            <Text allowFontScaling style={[theme.typography.bodySmall, styles.metaText, { color: theme.colors.textSecondary }]}>
              {user.phone}
            </Text>
          </View>
        ) : null}
      </View>

      <StatusPill
        label={verification.label}
        style={{ marginTop: theme.spacing.md }}
        tone={verification.tone}
      />
    </Surface>
  );
}

function AccountRow({ icon, title, detail, status = 'unavailable', actionLabel, onAction }) {
  const theme = useTogtTheme();
  const actionable = Boolean(actionLabel && onAction);
  const iconPositive = status === 'available' || status === 'info';
  const iconBackground = iconPositive
    ? theme.colors.surfacePositive
    : status === 'checking'
      ? theme.colors.surfaceAttention
      : theme.colors.surfaceSubtle;
  const iconColor = iconPositive
    ? theme.colors.actionPrimaryPressed
    : status === 'checking'
      ? theme.colors.textOnAttention
      : theme.colors.textSecondary;
  const statusLabel = status === 'checking'
    ? t('account.checking')
    : status === 'unavailable'
      ? t('account.unavailable')
      : null;

  return (
    <Surface style={{ padding: theme.spacing.md }}>
      <View style={[styles.row, { columnGap: theme.spacing.sm }]}>
        <View
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.rowIcon,
            {
              backgroundColor: iconBackground,
              borderRadius: theme.radius.input,
              height: theme.sizing.touchTarget,
              width: theme.sizing.touchTarget,
            },
          ]}
        >
          <MaterialCommunityIcons color={iconColor} name={icon} size={theme.sizing.iconMedium} />
        </View>
        <View style={styles.rowCopy}>
          <Text allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>
            {title}
          </Text>
          <Text
            allowFontScaling
            style={[
              theme.typography.bodySmall,
              { color: theme.colors.textSecondary, marginTop: theme.spacing.xxs },
            ]}
          >
            {detail}
          </Text>
          {statusLabel ? (
            <StatusPill
              label={statusLabel}
              style={{ marginTop: theme.spacing.sm }}
              tone={status === 'checking' ? 'pending' : 'offline'}
            />
          ) : null}
          {actionable ? (
            <SecondaryButton
              label={actionLabel}
              onPress={onAction}
              style={{ marginTop: theme.spacing.sm }}
            />
          ) : null}
        </View>
      </View>
    </Surface>
  );
}

function customerSettings(capabilities, navigation) {
  const checking = !capabilities;
  return [
    {
      icon: 'account-outline',
      title: t('account.customerProfile'),
      detail: t('account.profileManaged'),
    },
    {
      icon: 'map-marker-outline',
      title: t('account.savedPlaces'),
      detail: t('account.savedPlacesUnavailable'),
    },
    {
      icon: 'credit-card-outline',
      title: t('account.paymentMethods'),
      detail: t('account.paymentsUnavailable'),
      status: checking ? 'checking' : 'unavailable',
    },
    {
      icon: 'bell-outline',
      title: t('account.notifications'),
      detail: 'Remote delivery is unavailable; inspect the read-only delivery and quiet-hours truth.',
      status: checking ? 'checking' : 'unavailable',
      actionLabel: 'View controls',
      onAction: () => navigation.navigate('NotificationControls'),
    },
    {
      icon: 'scale-balance',
      title: 'Trust & fairness',
      detail: 'See ratings and reliability evidence separately, with sources and sample sizes.',
      status: 'info',
      actionLabel: 'View evidence',
      onAction: () => navigation.navigate('TrustFairness'),
    },
    {
      icon: 'translate',
      title: t('account.language'),
      detail: t('account.languageValue'),
      status: 'info',
    },
  ];
}

function workerSettings(capabilities, navigation) {
  const checking = !capabilities;
  return [
    {
      icon: 'account-hard-hat-outline',
      title: t('account.workerProfile'),
      detail: t('account.profileManaged'),
    },
    {
      icon: 'certificate-outline',
      title: t('account.workerCredentials'),
      detail: t('account.credentialsUnavailable'),
    },
    {
      icon: 'tools',
      title: t('account.servicesRates'),
      detail: t('account.servicesUnavailable'),
    },
    {
      icon: 'map-clock-outline',
      title: t('account.serviceArea'),
      detail: t('account.areaUnavailable'),
    },
    {
      icon: 'bank-outline',
      title: t('account.payoutSetup'),
      detail: t('account.payoutUnavailable'),
    },
    {
      icon: 'bell-outline',
      title: t('account.notifications'),
      detail: 'Remote delivery is unavailable; inspect the read-only delivery and quiet-hours truth.',
      status: checking ? 'checking' : 'unavailable',
      actionLabel: 'View controls',
      onAction: () => navigation.navigate('NotificationControls'),
    },
    {
      icon: 'scale-balance',
      title: 'Trust & fairness',
      detail: 'See ratings and reliability evidence separately, with sources and sample sizes.',
      status: 'info',
      actionLabel: 'View evidence',
      onAction: () => navigation.navigate('TrustFairness'),
    },
    {
      icon: 'translate',
      title: t('account.language'),
      detail: t('account.languageValue'),
      status: 'info',
    },
    {
      icon: 'account-alert-outline',
      title: t('account.emergencyContact'),
      detail: t('account.emergencyUnavailable'),
    },
  ];
}

export function AccountScreenBase({ role, navigation }) {
  const dispatch = useDispatch();
  const theme = useTogtTheme();
  const user = useSelector((state) => state.auth.user);
  const capabilities = useAccountCapabilities();
  const [signingOut, setSigningOut] = useState(false);
  const verification = verificationState(user, capabilities);
  const settings = useMemo(
    () => (role === 'worker' ? workerSettings(capabilities, navigation) : customerSettings(capabilities, navigation)),
    [capabilities, navigation, role],
  );

  function confirmSignOut() {
    Alert.alert(t('account.signOutTitle'), t('account.signOutBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('account.signOutConfirm'),
        style: 'destructive',
        onPress: () => {
          setSigningOut(true);
          dispatch(logoutThunk());
        },
      },
    ]);
  }

  const verificationDetail = verification.actionable
    ? verification.label
    : capabilities
      ? t('kyc.unavailableBody')
      : t('account.checking');

  return (
    <AppScaffold
      contentContainerStyle={{ paddingBottom: theme.spacing.xxxl }}
      scrollable
      testID={`${role}-account-screen`}
      topBar={<TopAppBar title={t('account.title')} />}
    >
      <AccountIdentity role={role} user={user} verification={verification} />

      <View style={{ marginTop: theme.spacing.xl }}>
        <SectionHeader title={t('account.identitySection')} />
        <AccountRow
          actionLabel={verification.actionable ? t('account.verifyAction') : undefined}
          detail={verificationDetail}
          icon="shield-account-outline"
          onAction={verification.actionable ? () => navigation.navigate('KYC') : undefined}
          status={verification.actionable ? 'available' : capabilities ? 'unavailable' : 'checking'}
          title={t('account.verification')}
        />
      </View>

      <View style={{ marginTop: theme.spacing.xl, rowGap: theme.spacing.sm }}>
        <SectionHeader title={t('account.settingsSection')} />
        {settings.map((setting) => <AccountRow key={setting.title} {...setting} />)}
      </View>

      <View style={{ marginTop: theme.spacing.xl, rowGap: theme.spacing.sm }}>
        <SectionHeader title={t('account.privacySection')} />
        <AccountRow
          actionLabel="Request privacy help"
          detail="Data access and deletion requests are recorded privately for support review; this build does not promise an automated outcome."
          icon="shield-lock-outline"
          onAction={() => navigation.navigate('IncidentReport', {
            kind: 'support',
            initialCategory: 'account_help',
            initialSummary: 'I would like help with a privacy, data access, or account deletion request. I understand this creates a private support record and does not promise an automated outcome.',
          })}
          status="info"
          title={t('account.privacyControls')}
        />
        <AccountRow
          actionLabel="Open support"
          detail={t('account.supportValue')}
          icon="lifebuoy"
          onAction={() => navigation.navigate('SafetyCentre')}
          status="info"
          title={t('account.support')}
        />
      </View>

      <DangerButton
        accessibilityHint={t('account.signOutBody')}
        fullWidth
        label={t('common.signOut')}
        loading={signingOut}
        onPress={confirmSignOut}
        style={{ marginTop: theme.spacing.xl }}
        testID="account-sign-out"
      />
    </AppScaffold>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    flexShrink: 0,
    justifyContent: 'center',
  },
  identityCopy: {
    flex: 1,
  },
  identityMeta: {
    alignItems: 'stretch',
  },
  identityRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  metaText: {
    flex: 1,
  },
  row: {
    alignItems: 'flex-start',
    flexDirection: 'row',
  },
  rowCopy: {
    flex: 1,
  },
  rowIcon: {
    alignItems: 'center',
    flexShrink: 0,
    justifyContent: 'center',
  },
});

export default AccountScreenBase;
