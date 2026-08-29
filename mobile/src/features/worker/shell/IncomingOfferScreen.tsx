import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTogtTheme } from '../../../design';
import {
  AppScaffold,
  Button,
  EmptyState,
  OfflineBanner,
  ScreenError,
  SectionHeader,
  Surface,
  TopAppBar,
} from '../../../ui';
import {
  CommercialBreakdown,
  InfoRow,
  OfferRemainingSummary,
  TrustEvidenceList,
  scheduleLabel,
} from './components';
import { deriveOfferActionPresentation, isSupported } from './model';
import type { ConnectionState, InstantOffer, ResourceState } from './model';
import {
  formatDurationEstimate,
  formatTravelEstimate,
  translateWorkerShell,
} from './copy';
import type { WorkerShellTranslator } from './copy';

export type IncomingOfferScreenProps = Readonly<{
  state: ResourceState<InstantOffer>;
  connection: ConnectionState;
  serverNow: string;
  acceptPending: boolean;
  declinePending: boolean;
  onAccept: (offerId: string) => void;
  onDecline: (offerId: string) => void;
  onRefresh: () => void;
  onDismiss: () => void;
  onOfferArrivalHaptic: (intent: 'offer-arrival', offerId: string) => void;
  translate?: WorkerShellTranslator;
}>;

export function IncomingOfferScreen({
  state,
  connection,
  serverNow,
  acceptPending,
  declinePending,
  onAccept,
  onDecline,
  onRefresh,
  onDismiss,
  onOfferArrivalHaptic,
  translate = translateWorkerShell,
}: IncomingOfferScreenProps) {
  const theme = useTogtTheme();
  const hapticOfferId = useRef<string | null>(null);
  const readyOfferId = state.status === 'ready' ? state.value.offerId : null;

  useEffect(() => {
    if (readyOfferId !== null && hapticOfferId.current !== readyOfferId) {
      hapticOfferId.current = readyOfferId;
      onOfferArrivalHaptic('offer-arrival', readyOfferId);
    }
  }, [onOfferArrivalHaptic, readyOfferId]);

  if (state.status === 'loading') {
    return (
      <AppScaffold
        contentContainerStyle={styles.center}
        testID="worker-incoming-offer-screen"
        topBar={<TopAppBar backLabel={translate('offer.dismiss')} onBack={onDismiss} title={translate('offer.title')} />}
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
        testID="worker-incoming-offer-screen"
        topBar={<TopAppBar backLabel={translate('offer.dismiss')} onBack={onDismiss} title={translate('offer.title')} />}
      >
        <ScreenError
          actionLabel={translate('common.retry')}
          body={state.message}
          onAction={onRefresh}
          title={state.title}
          {...(state.correlationId ? { correlationId: state.correlationId } : {})}
        />
      </AppScaffold>
    );
  }

  if (state.status === 'empty') {
    return (
      <AppScaffold
        contentContainerStyle={styles.center}
        testID="worker-incoming-offer-screen"
        topBar={<TopAppBar backLabel={translate('offer.dismiss')} onBack={onDismiss} title={translate('offer.title')} />}
      >
        <EmptyState body={state.message} title={state.title} />
      </AppScaffold>
    );
  }

  const offer = state.value;
  const action = deriveOfferActionPresentation(offer, { connection, serverNow });
  const service = isSupported(offer.serviceLabel) ? offer.serviceLabel.value : translate('common.notAvailable');
  const area = isSupported(offer.broadArea) ? offer.broadArea.value : translate('common.notAvailable');
  const customer = isSupported(offer.customerDisplayName)
    ? offer.customerDisplayName.value
    : translate('common.notAvailable');

  const bottomAction = (
    <View style={[styles.actionRow, { gap: theme.spacing.sm }]}>
      {action.requiresRefresh ? (
        <Button
          fullWidth
          label={translate('common.refresh')}
          onPress={onRefresh}
          variant="primary"
        />
      ) : action.statusCode === 'open' || action.statusCode === 'acceptance_blocked' ? (
        <>
          <Button
            disabled={!action.canDeclineManually || acceptPending || declinePending}
            label={translate('offer.decline')}
            loading={declinePending}
            onPress={() => onDecline(offer.offerId)}
            style={styles.actionButton}
            variant="secondary"
          />
          <Button
            accessibilityHint={translate('offer.acceptHint')}
            disabled={!action.canAttemptAccept || acceptPending || declinePending}
            label={translate('offer.accept')}
            loading={acceptPending}
            onPress={() => onAccept(offer.offerId)}
            style={styles.actionButton}
            variant="primary"
          />
        </>
      ) : (
        <Button fullWidth label={translate('offer.dismiss')} onPress={onDismiss} variant="secondary" />
      )}
    </View>
  );

  return (
    <AppScaffold
      bottomAction={bottomAction}
      contentContainerStyle={{ paddingBottom: theme.spacing.xl }}
      scrollable
      testID="worker-incoming-offer-screen"
      topBar={(
        <TopAppBar
          backLabel={translate('offer.dismiss')}
          onBack={onDismiss}
          title={translate('offer.title')}
        />
      )}
    >
      <View style={[styles.stack, { rowGap: theme.spacing.lg }]}>
        {connection === 'offline' ? (
          <OfflineBanner message={translate('jobs.offlineAction')} onRetry={onRefresh} />
        ) : null}

        <OfferRemainingSummary presentation={action} translate={translate} />

        <View>
          <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.actionPrimaryPressed }]}>
            {translate('jobs.instantOffer')}
          </Text>
          <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h1, { color: theme.colors.text, marginTop: theme.spacing.xxs }]}>
            {service}
          </Text>
          <View style={[styles.areaRow, { columnGap: theme.spacing.xs, marginTop: theme.spacing.sm }]}>
            <MaterialCommunityIcons
              color={theme.colors.textSecondary}
              importantForAccessibility="no-hide-descendants"
              name="map-marker-radius-outline"
              size={theme.sizing.iconSmall}
            />
            <Text allowFontScaling style={[theme.typography.body, styles.flex, { color: theme.colors.textSecondary }]}>
              {area}
            </Text>
          </View>
        </View>

        <Surface elevation="card" style={{ padding: theme.spacing.lg }}>
          <View style={[styles.stack, { rowGap: theme.spacing.md }]}>
            <InfoRow icon="calendar-clock-outline" label={translate('jobs.schedule')} value={scheduleLabel(offer, translate)} />
            <InfoRow
              icon="timer-sand"
              label={translate('jobs.duration')}
              value={isSupported(offer.expectedDuration)
                ? formatDurationEstimate(offer.expectedDuration.value)
                : offer.expectedDuration.explanation}
            />
            <InfoRow
              icon="navigation-variant-outline"
              label={translate('jobs.travel')}
              value={isSupported(offer.travel) ? formatTravelEstimate(offer.travel.value) : offer.travel.explanation}
            />
          </View>
        </Surface>

        <Surface elevation="card" style={{ padding: theme.spacing.lg }}>
          <SectionHeader title={translate('jobs.scope')} />
          <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.text, marginTop: theme.spacing.sm }]}>
            {isSupported(offer.scopeSummary) ? offer.scopeSummary.value : offer.scopeSummary.explanation}
          </Text>
          <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: theme.spacing.sm }]}>
            {isSupported(offer.attachmentCount)
              ? offer.attachmentCount.value === 0
                ? translate('jobs.noAttachments')
                : translate('jobs.attachments', { count: offer.attachmentCount.value })
              : offer.attachmentCount.explanation}
          </Text>
        </Surface>

        <Surface elevation="card" style={{ padding: theme.spacing.lg }}>
          <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>
            {translate('jobs.customer')}: {customer}
          </Text>
          <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: theme.spacing.xs }]}>
            {translate('jobs.customerEvidence')}
          </Text>
          <View style={{ marginTop: theme.spacing.sm }}>
            <TrustEvidenceList translate={translate} trust={offer.customerTrust} />
          </View>
        </Surface>

        <CommercialBreakdown commercial={offer.commercial} translate={translate} />

        {action.statusCode !== 'open' ? (
          <Surface variant={action.requiresRefresh ? 'attention' : 'subtle'}>
            <Text accessibilityRole="alert" allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.text }]}>
              {action.requiresRefresh ? translate('offer.refreshHint') : translate('common.viewDetails')}
            </Text>
          </Surface>
        ) : null}
      </View>
    </AppScaffold>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  stack: {},
  actionRow: { flexDirection: 'row', flexWrap: 'wrap' },
  actionButton: { flexBasis: 150, flexGrow: 1 },
  areaRow: { alignItems: 'center', flexDirection: 'row' },
});

export default IncomingOfferScreen;
