import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native';
import { useLayoutMetrics, useTogtTheme } from '../../../design';
import {
  AppScaffold,
  Button,
  EmptyState,
  OfflineBanner,
  ScreenError,
  SectionHeader,
  StatusPill,
  Surface,
  TopAppBar,
} from '../../../ui';
import { JobSummaryCard, WorkerAvatar } from './components';
import {
  deriveAvailabilityPresentation,
  isSupported,
} from './model';
import type {
  ConnectionState,
  ResourceState,
  WorkerAvailabilityState,
  WorkerTodaySnapshot,
} from './model';
import {
  formatTimeEnZa,
  formatZarEnZa,
  translateWorkerShell,
} from './copy';
import type { WorkerShellTranslator } from './copy';

export type WorkerTodayScreenProps = Readonly<{
  state: ResourceState<WorkerTodaySnapshot>;
  connection: ConnectionState;
  dayPeriod: 'morning' | 'afternoon' | 'evening';
  availabilityChangePending: boolean;
  onRequestAvailabilityChange: (nextState: WorkerAvailabilityState) => void;
  onOpenAvailabilityDetails: () => void;
  onOpenNextJob: (jobId: string) => void;
  onOpenOffers: () => void;
  onOpenEarnings: () => void;
  onOpenActivation: () => void;
  onRetry: () => void;
  translate?: WorkerShellTranslator;
}>;

export function WorkerTodayScreen({
  state,
  connection,
  dayPeriod,
  availabilityChangePending,
  onRequestAvailabilityChange,
  onOpenAvailabilityDetails,
  onOpenNextJob,
  onOpenOffers,
  onOpenEarnings,
  onOpenActivation,
  onRetry,
  translate = translateWorkerShell,
}: WorkerTodayScreenProps) {
  const theme = useTogtTheme();

  if (state.status === 'loading') {
    return (
      <AppScaffold
        contentContainerStyle={styles.center}
        testID="worker-today-screen"
        topBar={<TopAppBar title={translate('today.title')} />}
      >
        <ActivityIndicator color={theme.colors.actionPrimary} size="large" />
        <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.textSecondary, marginTop: theme.spacing.md }]}>
          {translate('common.loading')}
        </Text>
      </AppScaffold>
    );
  }

  if (state.status === 'error') {
    return (
      <AppScaffold
        contentContainerStyle={styles.center}
        testID="worker-today-screen"
        topBar={<TopAppBar title={translate('today.title')} />}
      >
        <ScreenError
          actionLabel={translate('common.retry')}
          body={state.message || translate('today.loadErrorBody')}
          onAction={onRetry}
          title={state.title || translate('today.loadErrorTitle')}
          {...(state.correlationId ? { correlationId: state.correlationId } : {})}
        />
      </AppScaffold>
    );
  }

  if (state.status === 'empty') {
    return (
      <AppScaffold
        contentContainerStyle={styles.center}
        testID="worker-today-screen"
        topBar={<TopAppBar title={translate('today.title')} />}
      >
        <EmptyState
          actionLabel={translate('common.retry')}
          body={state.message}
          onAction={onRetry}
          title={state.title}
        />
      </AppScaffold>
    );
  }

  return (
    <WorkerTodayReady
      availabilityChangePending={availabilityChangePending}
      connection={connection}
      dayPeriod={dayPeriod}
      onOpenActivation={onOpenActivation}
      onOpenAvailabilityDetails={onOpenAvailabilityDetails}
      onOpenEarnings={onOpenEarnings}
      onOpenNextJob={onOpenNextJob}
      onOpenOffers={onOpenOffers}
      onRequestAvailabilityChange={onRequestAvailabilityChange}
      onRetry={onRetry}
      snapshot={state.value}
      translate={translate}
    />
  );
}

type ReadyProps = Omit<WorkerTodayScreenProps, 'state'> & Readonly<{
  snapshot: WorkerTodaySnapshot;
  translate: WorkerShellTranslator;
}>;

function WorkerTodayReady({
  snapshot,
  connection,
  dayPeriod,
  availabilityChangePending,
  onRequestAvailabilityChange,
  onOpenAvailabilityDetails,
  onOpenNextJob,
  onOpenOffers,
  onOpenEarnings,
  onOpenActivation,
  onRetry,
  translate,
}: ReadyProps) {
  const theme = useTogtTheme();
  const layout = useLayoutMetrics();
  const availability = deriveAvailabilityPresentation(snapshot, {
    connection,
    requestPending: availabilityChangePending,
  });
  const statusCopy = ({
    online: ['today.online', 'today.onlineBody'],
    online_reconnect: ['today.onlineReconnect', 'today.onlineReconnectBody'],
    online_ineligible: ['today.onlineIneligible', 'today.onlineIneligibleBody'],
    offline: ['today.offline', 'today.offlineBody'],
    availability_unknown: ['today.availabilityUnknown', 'today.availabilityUnknownBody'],
  } as const)[availability.statusCode];
  const availabilityTone = availability.statusCode === 'online'
    ? 'available'
    : availability.statusCode === 'online_reconnect' || availability.statusCode === 'online_ineligible'
      ? 'pending'
      : 'offline';
  const identity = isSupported(snapshot.identity) ? snapshot.identity.value : 'unknown';
  const identityLabel = identity === 'verified'
    ? translate('today.identityVerified')
    : identity === 'verification_pending'
      ? translate('today.identityPending')
      : identity === 'unverified'
        ? translate('today.identityUnverified')
        : translate('today.identityUnknown');
  const nextJob = isSupported(snapshot.nextJob) ? snapshot.nextJob.value : null;
  const activation = isSupported(snapshot.activation) ? snapshot.activation.value : null;

  return (
    <AppScaffold
      contentContainerStyle={{ paddingBottom: theme.spacing.xxxxl }}
      scrollable
      testID="worker-today-screen"
      topBar={<TopAppBar title={translate('today.title')} />}
    >
      <View style={[styles.stack, { rowGap: theme.spacing.xl }]}>
        {connection === 'offline' ? (
          <OfflineBanner
            lastUpdatedLabel={formatTimeEnZa(snapshot.lastUpdatedAt)}
            message={translate('common.offline')}
            onRetry={onRetry}
          />
        ) : null}

        <View style={[styles.identityRow, { columnGap: theme.spacing.md }]}>
          <View style={styles.flex}>
            <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h1, { color: theme.colors.text }]}>
              {translate('today.greeting', { dayPeriod, name: snapshot.displayName })}
            </Text>
            <View style={{ marginTop: theme.spacing.sm }}>
              <StatusPill
                label={identityLabel}
                tone={identity === 'verified' ? 'available' : identity === 'verification_pending' ? 'pending' : 'offline'}
              />
            </View>
          </View>
          <WorkerAvatar displayName={snapshot.displayName} imageUri={snapshot.profileImageUri} translate={translate} />
        </View>

        <Surface
          elevation="card"
          style={{ padding: theme.spacing.lg }}
          testID="worker-availability-card"
          variant={availability.statusCode === 'online'
            ? 'positive'
            : availability.statusCode === 'online_reconnect' || availability.statusCode === 'online_ineligible'
              ? 'attention'
              : 'default'}
        >
          <View style={[styles.between, { columnGap: theme.spacing.md }]}>
            <View style={styles.flex}>
              <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>
                {translate('today.availabilityTitle')}
              </Text>
              <Text allowFontScaling style={[theme.typography.h2, { color: theme.colors.text, marginTop: theme.spacing.xxs }]}>
                {translate(statusCopy[0])}
              </Text>
            </View>
            {availability.showSwitch && availability.switchValue !== null ? (
              <View style={[styles.switchTarget, { minHeight: theme.sizing.touchTarget, minWidth: theme.sizing.touchTarget }]}>
                <Switch
                  accessibilityHint={translate(availability.switchValue ? 'today.switchOffline' : 'today.switchOnline')}
                  accessibilityLabel={translate('today.availabilityTitle')}
                  accessibilityRole="switch"
                  accessibilityState={{ busy: availabilityChangePending, checked: availability.switchValue, disabled: !availability.canRequestChange }}
                  disabled={!availability.canRequestChange}
                  onValueChange={(online) => onRequestAvailabilityChange(online ? 'online' : 'offline')}
                  thumbColor={theme.colors.surface}
                  trackColor={{ false: theme.colors.borderStrong, true: theme.colors.actionPrimary }}
                  value={availability.switchValue}
                />
              </View>
            ) : null}
          </View>
          <View style={{ marginTop: theme.spacing.sm }}>
            <StatusPill label={translate(statusCopy[0])} tone={availabilityTone} />
          </View>
          <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary, marginTop: theme.spacing.sm }]}>
            {translate(statusCopy[1])}
          </Text>
          <View style={[styles.explanationRow, { columnGap: theme.spacing.xs, marginTop: theme.spacing.md }]}>
            <MaterialCommunityIcons
              color={theme.colors.actionPrimaryPressed}
              importantForAccessibility="no-hide-descendants"
              name="crosshairs-gps"
              size={theme.sizing.iconSmall}
            />
            <Text allowFontScaling style={[theme.typography.caption, styles.flex, { color: theme.colors.textSecondary }]}>
              {translate('today.locationExplanation')}
            </Text>
          </View>
          <Button
            label={translate('common.viewDetails')}
            onPress={onOpenAvailabilityDetails}
            style={{ marginTop: theme.spacing.md }}
            variant="tertiary"
          />
        </Surface>

        <View>
          <SectionHeader title={translate('today.nextJob')} />
          <View style={{ marginTop: theme.spacing.sm }}>
            {nextJob ? (
              <JobSummaryCard job={nextJob} onPress={onOpenNextJob} translate={translate} />
            ) : (
              <Surface variant="subtle">
                <Text allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>
                  {translate('today.noNextJob')}
                </Text>
                <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary, marginTop: theme.spacing.xs }]}>
                  {isSupported(snapshot.nextJob) ? translate('today.noNextJobBody') : snapshot.nextJob.explanation}
                </Text>
              </Surface>
            )}
          </View>
        </View>

        <View style={[styles.metricGrid, { gap: theme.spacing.sm }]}>
          <Surface
            elevation="card"
            onPress={onOpenEarnings}
            style={[styles.metricCard, layout.supportsPairedCards && styles.pairedMetric]}
          >
            <MaterialCommunityIcons
              color={theme.colors.actionPrimary}
              importantForAccessibility="no-hide-descendants"
              name="chart-line"
              size={theme.sizing.iconLarge}
            />
            <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: theme.spacing.sm }]}>
              {translate('today.weeklyEarnings')}
            </Text>
            <Text allowFontScaling style={[theme.typography.numeric, theme.typography.h2, { color: theme.colors.text, marginTop: theme.spacing.xxs }]}>
              {isSupported(snapshot.weeklyNet) ? formatZarEnZa(snapshot.weeklyNet.value) : translate('common.notAvailable')}
            </Text>
            <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: theme.spacing.xs }]}>
              {translate('today.weeklyEarningsBody')}
            </Text>
          </Surface>

          <Surface
            elevation="card"
            style={[styles.metricCard, layout.supportsPairedCards && styles.pairedMetric]}
          >
            <MaterialCommunityIcons
              color={theme.colors.attention}
              importantForAccessibility="no-hide-descendants"
              name="briefcase-clock-outline"
              size={theme.sizing.iconLarge}
            />
            <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: theme.spacing.sm }]}>
              {translate('today.newOffers')}
            </Text>
            <Text allowFontScaling style={[theme.typography.h2, { color: theme.colors.text, marginTop: theme.spacing.xxs }]}>
              {isSupported(snapshot.newOfferCount)
                ? translate('today.offerCount', { count: snapshot.newOfferCount.value })
                : translate('common.notAvailable')}
            </Text>
            <Button
              label={translate('today.viewOffers')}
              onPress={onOpenOffers}
              style={{ marginTop: theme.spacing.md }}
              variant="tertiary"
            />
          </Surface>
        </View>

        {activation && activation.state !== 'ready' ? (
          <Surface elevation="card" variant={activation.state === 'action_required' ? 'attention' : 'subtle'}>
            <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>
              {activation.title || translate('today.activation')}
            </Text>
            <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary, marginTop: theme.spacing.xs }]}>
              {activation.explanation}
            </Text>
            <Button
              label={translate('today.openActivation')}
              onPress={onOpenActivation}
              style={{ marginTop: theme.spacing.md }}
              variant="secondary"
            />
          </Surface>
        ) : null}

        <Text allowFontScaling style={[theme.typography.caption, styles.timestamp, { color: theme.colors.textSecondary }]}>
          {translate('common.lastUpdated', { time: formatTimeEnZa(snapshot.lastUpdatedAt) })}
        </Text>
      </View>
    </AppScaffold>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  stack: {},
  identityRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap' },
  between: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  switchTarget: { alignItems: 'center', justifyContent: 'center' },
  explanationRow: { alignItems: 'flex-start', flexDirection: 'row' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  metricCard: { flexBasis: '100%', flexGrow: 1 },
  pairedMetric: { flexBasis: '46%' },
  timestamp: { textAlign: 'center' },
});

export default WorkerTodayScreen;
