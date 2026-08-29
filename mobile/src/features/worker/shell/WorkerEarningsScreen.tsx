import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
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
import { MoneyRow } from './components';
import {
  deriveLedgerRowPresentation,
  derivePayoutVisibility,
  hasValidEarningsTotals,
  isSupported,
  isValidZarAmount,
} from './model';
import type {
  CompletedJobLedgerRow,
  ConnectionState,
  EarningsSnapshot,
  ResourceState,
} from './model';
import {
  formatDateTimeEnZa,
  formatTimeEnZa,
  formatZarEnZa,
  translateWorkerShell,
} from './copy';
import type { WorkerShellCopyKey, WorkerShellTranslator } from './copy';

export type WorkerEarningsScreenProps = Readonly<{
  state: ResourceState<EarningsSnapshot>;
  connection: ConnectionState;
  onOpenLedgerRow: (jobId: string) => void;
  onOpenPayoutSupport: () => void;
  onRetry: () => void;
  translate?: WorkerShellTranslator;
}>;

export function WorkerEarningsScreen({
  state,
  connection,
  onOpenLedgerRow,
  onOpenPayoutSupport,
  onRetry,
  translate = translateWorkerShell,
}: WorkerEarningsScreenProps) {
  const theme = useTogtTheme();

  if (state.status === 'loading') {
    return (
      <AppScaffold
        contentContainerStyle={styles.center}
        testID="worker-earnings-screen"
        topBar={<TopAppBar title={translate('earnings.title')} />}
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
        testID="worker-earnings-screen"
        topBar={<TopAppBar title={translate('earnings.title')} />}
      >
        <ScreenError
          actionLabel={translate('common.retry')}
          body={state.message || translate('earnings.loadErrorBody')}
          onAction={onRetry}
          title={state.title || translate('earnings.loadErrorTitle')}
          {...(state.correlationId ? { correlationId: state.correlationId } : {})}
        />
      </AppScaffold>
    );
  }

  if (state.status === 'empty') {
    return (
      <AppScaffold
        contentContainerStyle={styles.center}
        testID="worker-earnings-screen"
        topBar={<TopAppBar title={translate('earnings.title')} />}
      >
        <EmptyState
          body={state.message || translate('earnings.emptyBody')}
          title={state.title || translate('earnings.empty')}
        />
      </AppScaffold>
    );
  }

  return (
    <EarningsReady
      connection={connection}
      onOpenLedgerRow={onOpenLedgerRow}
      onOpenPayoutSupport={onOpenPayoutSupport}
      onRetry={onRetry}
      snapshot={state.value}
      translate={translate}
    />
  );
}

type EarningsReadyProps = Readonly<{
  snapshot: EarningsSnapshot;
  connection: ConnectionState;
  onOpenLedgerRow: (jobId: string) => void;
  onOpenPayoutSupport: () => void;
  onRetry: () => void;
  translate: WorkerShellTranslator;
}>;

function EarningsReady({
  snapshot,
  connection,
  onOpenLedgerRow,
  onOpenPayoutSupport,
  onRetry,
  translate,
}: EarningsReadyProps) {
  const theme = useTogtTheme();
  const layout = useLayoutMetrics();
  const totals = isSupported(snapshot.totals) && hasValidEarningsTotals(snapshot.totals.value)
    ? snapshot.totals.value
    : null;
  const paymentEvidence = isSupported(snapshot.paymentEvidence)
    ? snapshot.paymentEvidence.value
    : null;
  const payout = derivePayoutVisibility(snapshot);
  const payoutCapabilityExplanation = payout.operational
    ? translate('earnings.payoutAwaitingEvidence')
    : snapshot.payoutCapability.status === 'supported'
      ? translate('earnings.payoutUnavailable')
      : snapshot.payoutCapability.explanation;
  const hasPayoutIssue = snapshot.completedJobs.some((row) => (
    row.payoutState === 'failed' || row.payoutState === 'reversed'
  ));
  const amount = (amountMinor: number) => formatZarEnZa({ currency: 'ZAR', amountMinor });

  return (
    <AppScaffold
      contentContainerStyle={{ paddingBottom: theme.spacing.xxxxl }}
      scrollable
      testID="worker-earnings-screen"
      topBar={<TopAppBar title={translate('earnings.title')} />}
    >
      <View style={[styles.stack, { rowGap: theme.spacing.xl }]}>
        {connection === 'offline' ? (
          <OfflineBanner
            lastUpdatedLabel={formatTimeEnZa(snapshot.lastUpdatedAt)}
            message={translate('common.offline')}
            onRetry={onRetry}
          />
        ) : null}

        <View>
          <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h1, { color: theme.colors.text }]}>
            {translate('earnings.jobEarnings')}
          </Text>
          <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary, marginTop: theme.spacing.xs }]}>
            {translate('today.weeklyEarningsBody')}
          </Text>
        </View>

        <View style={[styles.metricGrid, { gap: theme.spacing.sm }]}>
          <EarningsMetricCard
            icon="clock-outline"
            label={translate('earnings.pending')}
            paired={layout.supportsPairedCards}
            tone="attention"
            value={totals ? amount(totals.pendingMinor) : translate('common.notAvailable')}
          />
          <EarningsMetricCard
            icon="chart-line"
            label={translate('earnings.thisWeek')}
            paired={layout.supportsPairedCards}
            tone="positive"
            value={totals ? amount(totals.thisWeekNetMinor) : translate('common.notAvailable')}
          />
        </View>

        {totals ? (
          <Surface elevation="card" style={{ padding: theme.spacing.lg }}>
            <View style={[styles.stack, { rowGap: theme.spacing.sm }]}>
              <MoneyRow label={translate('earnings.gross')} value={amount(totals.grossMinor)} />
              <MoneyRow label={translate('earnings.fees')} value={`−${amount(totals.platformFeeMinor)}`} />
              <View style={{ backgroundColor: theme.colors.border, height: theme.border.thin }} />
              <MoneyRow emphasized label={translate('earnings.net')} value={amount(totals.netMinor)} />
              <View style={{ backgroundColor: theme.colors.border, height: theme.border.thin }} />
              <MoneyRow label={translate('earnings.platformPaid')} value={amount(totals.platformPaidMinor)} />
              <MoneyRow label={translate('earnings.cash')} value={amount(totals.cashConfirmedMinor)} />
            </View>
          </Surface>
        ) : (
          <Surface variant="subtle">
            <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>
              {snapshot.totals.status === 'supported'
                ? translate('common.notAvailable')
                : snapshot.totals.explanation}
            </Text>
          </Surface>
        )}

        {paymentEvidence ? (
          <Surface elevation="card" style={{ padding: theme.spacing.lg }} testID="worker-payment-evidence">
            <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>
              {translate('earnings.paymentEvidence')}
            </Text>
            <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary, marginTop: theme.spacing.xs }]}>
              {translate('earnings.paymentEvidenceBody')}
            </Text>
            <View style={[styles.stack, { marginTop: theme.spacing.md, rowGap: theme.spacing.sm }]}>
              <MoneyRow label={translate('earnings.confirmedPaidJobValue')} value={amount(paymentEvidence.confirmedPaidMinor)} />
              <MoneyRow label={translate('earnings.awaitingPaidEvidence')} value={amount(paymentEvidence.pendingPaidEvidenceMinor)} />
            </View>
          </Surface>
        ) : null}

        {payout.operational && (payout.showAvailableBalance || payout.showNextPayout) ? (
          <View style={[styles.metricGrid, { gap: theme.spacing.sm }]} testID="worker-payout-evidence">
            {payout.showAvailableBalance && payout.availableBalance ? (
              <EarningsMetricCard
                icon="wallet-outline"
                label={translate('earnings.availableBalance')}
                paired={layout.supportsPairedCards}
                tone="positive"
                value={formatZarEnZa(payout.availableBalance)}
              />
            ) : null}
            {payout.showNextPayout && payout.nextPayout ? (
              <EarningsMetricCard
                icon="bank-transfer-out"
                label={translate('earnings.nextPayout')}
                paired={layout.supportsPairedCards}
                tone="default"
                value={payout.nextPayout.state === 'processing'
                  ? translate('earnings.payoutProcessing')
                  : translate('earnings.payoutScheduled', {
                      time: formatDateTimeEnZa(payout.nextPayout.expectedAt ?? ''),
                    })}
              />
            ) : null}
          </View>
        ) : (
          <Surface testID="worker-payout-capability-off" variant="subtle">
            <View style={[styles.noticeRow, { columnGap: theme.spacing.sm }]}>
              <MaterialCommunityIcons
                color={theme.colors.textSecondary}
                importantForAccessibility="no-hide-descendants"
                name="bank-off-outline"
                size={theme.sizing.iconMedium}
              />
              <Text allowFontScaling style={[theme.typography.bodySmall, styles.flex, { color: theme.colors.textSecondary }]}>
                {payoutCapabilityExplanation}
              </Text>
            </View>
          </Surface>
        )}

        <View>
          <SectionHeader title={translate('earnings.ledger')} />
          {snapshot.completedJobs.length === 0 ? (
            <EmptyState
              body={snapshot.ledgerNotice ?? translate('earnings.emptyBody')}
              title={snapshot.ledgerNotice ? translate('common.notAvailable') : translate('earnings.empty')}
            />
          ) : (
            <View style={[styles.stack, { marginTop: theme.spacing.sm, rowGap: theme.spacing.sm }]}>
              {snapshot.completedJobs.map((row) => (
                <LedgerRow
                  key={row.ledgerEntryId}
                  onPress={onOpenLedgerRow}
                  row={row}
                  translate={translate}
                />
              ))}
            </View>
          )}
        </View>

        {hasPayoutIssue ? (
          <Button
            label={translate('earnings.support')}
            onPress={onOpenPayoutSupport}
            variant="secondary"
          />
        ) : null}

        <Text allowFontScaling style={[theme.typography.caption, styles.timestamp, { color: theme.colors.textSecondary }]}>
          {translate('common.lastUpdated', { time: formatTimeEnZa(snapshot.lastUpdatedAt) })}
        </Text>
      </View>
    </AppScaffold>
  );
}

function EarningsMetricCard({
  icon,
  label,
  value,
  tone,
  paired,
}: Readonly<{
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  value: string;
  tone: 'default' | 'positive' | 'attention';
  paired: boolean;
}>) {
  const theme = useTogtTheme();
  const iconColor = tone === 'positive'
    ? theme.colors.actionPrimary
    : tone === 'attention'
      ? theme.colors.attention
      : theme.colors.text;
  return (
    <Surface
      elevation="card"
      style={[styles.metricCard, paired && styles.pairedMetric]}
      variant={tone === 'positive' ? 'positive' : tone === 'attention' ? 'attention' : 'default'}
    >
      <MaterialCommunityIcons
        color={iconColor}
        importantForAccessibility="no-hide-descendants"
        name={icon}
        size={theme.sizing.iconLarge}
      />
      <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: theme.spacing.sm }]}>
        {label}
      </Text>
      <Text allowFontScaling style={[theme.typography.numeric, theme.typography.h2, { color: theme.colors.text, marginTop: theme.spacing.xxs }]}>
        {value}
      </Text>
    </Surface>
  );
}

function LedgerRow({
  row,
  onPress,
  translate,
}: Readonly<{
  row: CompletedJobLedgerRow;
  onPress: (jobId: string) => void;
  translate: WorkerShellTranslator;
}>) {
  const theme = useTogtTheme();
  const presentation = deriveLedgerRowPresentation(row);
  const paidJobValueLabel = isValidZarAmount(row.reconciledPaidJobValue)
    ? formatZarEnZa(row.reconciledPaidJobValue)
    : translate('common.notAvailable');
  const workerGrossLabel = isSupported(row.workerGross) && isValidZarAmount(row.workerGross.value)
    ? formatZarEnZa(row.workerGross.value)
    : translate('common.notAvailable');
  const feeLabel = isSupported(row.platformFee) && isValidZarAmount(row.platformFee.value)
    ? `−${formatZarEnZa(row.platformFee.value)}`
    : translate('common.notAvailable');
  const netLabel = isSupported(row.net) && isValidZarAmount(row.net.value)
    ? formatZarEnZa(row.net.value)
    : translate('common.notAvailable');
  const statusKey: WorkerShellCopyKey = ({
    pending: 'earnings.pendingStatus',
    platform_paid: 'earnings.platformPaidStatus',
    cash: 'earnings.cashStatus',
    issue: 'earnings.issueStatus',
  } as const)[presentation.category];
  const statusTone = presentation.category === 'issue'
    ? 'error'
    : presentation.category === 'pending'
      ? 'pending'
      : 'complete';
  return (
    <Surface
      accessibilityHint={translate('earnings.viewReceipt')}
      accessibilityLabel={`${row.serviceLabel}. ${paidJobValueLabel}. ${translate(statusKey)}`}
      elevation="card"
      onPress={() => onPress(row.jobId)}
      style={{ padding: theme.spacing.lg }}
      testID={`worker-ledger-row-${row.ledgerEntryId}`}
    >
      <View style={[styles.between, { columnGap: theme.spacing.sm }]}>
        <View style={styles.flex}>
          <Text allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>
            {row.serviceLabel}
          </Text>
          <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: theme.spacing.xxs }]}>
            {formatDateTimeEnZa(row.completedAt)}
          </Text>
        </View>
        <StatusPill label={translate(statusKey)} tone={statusTone} />
      </View>
      <View style={[styles.stack, { marginTop: theme.spacing.md, rowGap: theme.spacing.xs }]}>
        <MoneyRow label={translate('earnings.confirmedPaidJobValue')} value={paidJobValueLabel} />
        <MoneyRow label={translate('earnings.gross')} value={workerGrossLabel} />
        <MoneyRow label={translate('earnings.fees')} value={feeLabel} />
        <MoneyRow emphasized label={translate('earnings.net')} value={netLabel} />
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  stack: {},
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  metricCard: { flexBasis: '100%', flexGrow: 1 },
  pairedMetric: { flexBasis: '46%' },
  noticeRow: { alignItems: 'flex-start', flexDirection: 'row' },
  between: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  timestamp: { textAlign: 'center' },
});

export default WorkerEarningsScreen;
