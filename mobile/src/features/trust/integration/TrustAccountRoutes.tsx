import { useNetInfo } from '@react-native-community/netinfo';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { Alert, Linking } from 'react-native';
import {
  isGroundedTrustError,
  loadGroundedTrustFairness,
} from '../../../services/groundedTrust';
import { AppScaffold, TopAppBar } from '../../../ui';
import { TrustResource } from '../components';
import { NotificationControlsScreen } from '../NotificationControlsScreen';
import { TrustFairnessScreen } from '../TrustFairnessScreen';
import type {
  ConnectionState,
  NotificationControlSnapshot,
  TrustFairnessSnapshot,
  TrustResourceState,
} from '../model';

const NOTIFICATION_TRUTH: NotificationControlSnapshot = Object.freeze({
  registrationState: 'unavailable',
  preferences: Object.freeze([
    Object.freeze({ category: 'offers', enabled: false }),
    Object.freeze({ category: 'job_updates', enabled: false }),
    Object.freeze({ category: 'chat', enabled: false }),
    Object.freeze({ category: 'payment_payout', enabled: false }),
    Object.freeze({ category: 'safety', enabled: false }),
    Object.freeze({ category: 'marketing', enabled: false }),
  ]),
  quietHours: Object.freeze({
    enabled: false,
    startsAt: '22:00',
    endsAt: '06:00',
    timezone: 'Africa/Johannesburg',
    criticalSafetyBypass: true,
  }),
});

function useConnectionState(): ConnectionState {
  const network = useNetInfo();
  return network.isConnected === true && network.isInternetReachable !== false ? 'online' : 'offline';
}

function fairnessProblem(error: unknown): TrustResourceState<TrustFairnessSnapshot> {
  if (isGroundedTrustError(error)) {
    return Object.freeze({
      status: 'error',
      title: error.problem.title,
      message: error.problem.detail,
      ...(error.problem.correlationId ? { correlationId: error.problem.correlationId } : {}),
    });
  }
  return Object.freeze({
    status: 'error',
    title: 'Trust evidence could not be loaded',
    message: 'The server evidence could not be verified. Refresh before relying on this view.',
  });
}

export function TrustFairnessRoute({ navigation }: { navigation: any }) {
  const connectionState = useConnectionState();
  const [resource, setResource] = useState<TrustResourceState<TrustFairnessSnapshot>>({ status: 'loading' });

  const refresh = useCallback(async () => {
    if (connectionState === 'offline') {
      setResource((current) => current.status === 'ready'
        ? current
        : Object.freeze({
            status: 'error',
            title: 'Trust evidence is unavailable offline',
            message: 'Reconnect to verify the latest two-sided evidence. No cached decision is inferred.',
          }));
      return;
    }
    setResource((current) => current.status === 'ready' ? current : { status: 'loading' });
    try {
      const fairness = await loadGroundedTrustFairness();
      setResource({ status: 'ready', value: fairness, lastUpdatedAt: new Date().toISOString() });
    } catch (error) {
      setResource(fairnessProblem(error));
    }
  }, [connectionState]);

  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));

  if (resource.status !== 'ready') {
    return (
      <AppScaffold
        contentContainerStyle={{ flex: 1 }}
        testID="trust-fairness-resource-screen"
        topBar={<TopAppBar onBack={() => navigation.goBack()} subtitle="Explainable, evidence-led" title="Trust & fairness" />}
      >
        <TrustResource
          connectionState={connectionState}
          loadingLabel="Loading trust evidence"
          onRetry={() => { void refresh(); }}
          resource={resource}
        >
          {() => null}
        </TrustResource>
      </AppScaffold>
    );
  }

  return (
    <TrustFairnessScreen
      onBack={() => navigation.goBack()}
      onOpenEvidence={(evidence) => Alert.alert(
        evidence.label,
        `${evidence.valueLabel}\n\n${evidence.explanation}\n\nSource: ${evidence.sourceLabel}\nObserved: ${evidence.observedAt}`,
      )}
      onRequestHumanReview={() => navigation.navigate('IncidentReport', {
        kind: 'support',
        initialCategory: 'account_help',
        initialSummary: 'Please review the evidence shown in my Trust & fairness view. I understand this creates a private record and does not promise an acknowledgement time or outcome.',
      })}
      snapshot={resource.value}
    />
  );
}

export function NotificationControlsRoute({ navigation }: { navigation: any }) {
  const connectionState = useConnectionState();
  const unavailable = () => Alert.alert(
    'Remote notifications are unavailable',
    'This build has no registered remote push provider or canonical notification-preference endpoint. Nothing was changed.',
  );
  return (
    <NotificationControlsScreen
      connectionState={connectionState}
      onBack={() => navigation.goBack()}
      onCategoryChange={unavailable}
      onOpenDeviceSettings={() => { void Linking.openSettings().catch(() => undefined); }}
      onQuietHoursEnabledChange={unavailable}
      onQuietHoursEndChange={unavailable}
      onQuietHoursStartChange={unavailable}
      onRequestDevicePermission={unavailable}
      onSaveControls={unavailable}
      saving={false}
      snapshot={NOTIFICATION_TRUTH}
    />
  );
}
