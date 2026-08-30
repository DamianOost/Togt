import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { useTogtTheme } from '../../design';
import {
  AppScaffold,
  Button,
  StatusPill,
  Surface,
  TopAppBar,
} from '../../ui';
import { translateEnZa as t } from '../../i18n/en-ZA';
import api from '../../services/api';
import {
  capabilityEnabled,
  failClosedCapabilities,
  getEffectiveCapabilities,
} from '../../services/capabilityService';

function formatStatus(verification, identityAvailable) {
  const value = verification?.status;
  if (!value || value === 'unverified') {
    return { label: t('kyc.statusNotVerified'), tone: 'offline' };
  }
  if (value === 'pending') {
    return { label: t('kyc.statusPending'), tone: 'pending' };
  }
  if (value === 'failed') {
    return { label: t('kyc.statusFailed'), tone: 'error' };
  }
  if (value === 'verified') {
    const supportedProvider = verification?.provider === 'verifynow'
      && !!verification?.verified_at;
    return identityAvailable && supportedProvider
      ? { label: t('kyc.statusVerified'), tone: 'available' }
      : { label: t('kyc.statusLegacy'), tone: 'offline' };
  }
  return { label: t('kyc.statusUnavailable'), tone: 'offline' };
}

export default function KYCScreen({ navigation }) {
  const theme = useTogtTheme();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshSequence, setRefreshSequence] = useState(0);
  const [verification, setVerification] = useState(null);
  const [capabilities, setCapabilities] = useState(() => failClosedCapabilities('not_loaded'));

  const retry = useCallback(() => {
    setRefreshSequence((sequence) => sequence + 1);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);

    Promise.allSettled([
      getEffectiveCapabilities({ forceRefresh: true }),
      api.get('/api/kyc/status'),
    ]).then(([capabilityResult, statusResult]) => {
      if (!active) return;
      if (capabilityResult.status === 'fulfilled') {
        setCapabilities(capabilityResult.value);
      } else {
        setCapabilities(failClosedCapabilities('capability_data_unavailable'));
      }
      if (statusResult.status === 'fulfilled') {
        const body = statusResult.value.data;
        setVerification(body.verification || { status: body.kyc_status });
      } else {
        setLoadError(true);
      }
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [refreshSequence]);

  const identityAvailable = capabilityEnabled(capabilities, 'identity_verification');
  const status = formatStatus(verification, identityAvailable);

  return (
    <AppScaffold
      contentContainerStyle={{ paddingBottom: theme.spacing.xxxl }}
      scrollable
      testID="identity-verification-screen"
      topBar={(
        <TopAppBar
          backLabel={t('common.back')}
          onBack={() => navigation.goBack()}
          title={t('kyc.title')}
        />
      )}
    >
      <Text
        accessibilityRole="header"
        allowFontScaling
        style={[theme.typography.display, { color: theme.colors.text }]}
      >
        {t('kyc.heading')}
      </Text>
      <Text
        allowFontScaling
        style={[
          theme.typography.body,
          { color: theme.colors.textSecondary, marginTop: theme.spacing.sm },
        ]}
      >
        {t('kyc.subtitle')}
      </Text>

      <Surface
        elevation="card"
        style={{ marginTop: theme.spacing.xl, padding: theme.spacing.lg }}
      >
        <Text
          allowFontScaling
          style={[theme.typography.label, { color: theme.colors.textSecondary }]}
        >
          {t('kyc.currentStatus')}
        </Text>
        {loading ? (
          <View
            accessibilityLabel={t('kyc.loadingStatus')}
            accessibilityRole="progressbar"
            style={[styles.loadingRow, { columnGap: theme.spacing.sm, marginTop: theme.spacing.md }]}
          >
            <ActivityIndicator color={theme.colors.actionPrimary} size="small" />
            <Text
              allowFontScaling
              style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}
            >
              {t('kyc.loadingStatus')}
            </Text>
          </View>
        ) : loadError ? (
          <View style={{ marginTop: theme.spacing.md }}>
            <StatusPill label={t('kyc.statusUnavailable')} tone="offline" />
            <Text
              accessibilityRole="alert"
              allowFontScaling
              style={[
                theme.typography.bodySmall,
                { color: theme.colors.textSecondary, marginTop: theme.spacing.sm },
              ]}
            >
              {t('kyc.statusLoadError')}
            </Text>
            <Button
              label={t('common.retry')}
              onPress={retry}
              style={{ marginTop: theme.spacing.sm }}
              variant="secondary"
            />
          </View>
        ) : (
          <View style={{ marginTop: theme.spacing.md }}>
            <StatusPill label={status.label} tone={status.tone} />
            {verification?.id_last4 ? (
              <Text
                allowFontScaling
                style={[
                  theme.typography.bodySmall,
                  { color: theme.colors.textSecondary, marginTop: theme.spacing.sm },
                ]}
              >
                {t('kyc.submittedIdEnding', { lastFour: verification.id_last4 })}
              </Text>
            ) : null}
          </View>
        )}
      </Surface>

      <Surface
        style={[
          styles.notice,
          {
            columnGap: theme.spacing.sm,
            marginTop: theme.spacing.md,
            padding: theme.spacing.lg,
          },
        ]}
        variant={identityAvailable ? 'positive' : 'attention'}
      >
        <MaterialCommunityIcons
          accessibilityElementsHidden
          color={identityAvailable ? theme.colors.actionPrimaryPressed : theme.colors.textOnAttention}
          importantForAccessibility="no-hide-descendants"
          name={identityAvailable ? 'shield-check-outline' : 'shield-alert-outline'}
          size={theme.sizing.iconLarge}
        />
        <View style={styles.noticeCopy}>
          <Text allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>
            {identityAvailable ? t('kyc.providerAvailableTitle') : t('kyc.unavailableTitle')}
          </Text>
          <Text
            allowFontScaling
            style={[
              theme.typography.bodySmall,
              { color: theme.colors.textSecondary, marginTop: theme.spacing.xs },
            ]}
          >
            {identityAvailable ? t('kyc.providerAvailableBody') : t('kyc.unavailableBody')}
          </Text>
        </View>
      </Surface>

      <Text
        allowFontScaling
        style={[
          theme.typography.bodySmall,
          { color: theme.colors.textSecondary, marginTop: theme.spacing.xl },
        ]}
      >
        {t('kyc.separateSignals')}
      </Text>
    </AppScaffold>
  );
}

const styles = StyleSheet.create({
  loadingRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  notice: {
    alignItems: 'flex-start',
    flexDirection: 'row',
  },
  noticeCopy: {
    flex: 1,
  },
});
