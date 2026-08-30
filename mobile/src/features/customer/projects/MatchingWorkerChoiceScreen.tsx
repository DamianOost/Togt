import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTogtTheme } from '../../../design';
import { AppScaffold, Button, Chip, SectionHeader, StatusPill, Surface, TopAppBar } from '../../../ui';
import { customerProjectMessage, formatProjectDuration, formatProjectMoney } from './copy';
import { ProjectScreenState, VerificationList, WorkerChoiceCard } from './components';
import {
  createCustomerCommandIntent,
  deriveMatchingView,
  isSafeRemoteImageUrl,
} from './model';
import type {
  CustomerCommandIntent,
  Loadable,
  MatchingSnapshot,
  QuoteChoice,
  WorkerChoice,
} from './model';
import type { AssistanceCapability } from '../../intelligence/model';

type MatchingCommand =
  | 'cancel_match'
  | 'retry_match'
  | 'select_worker'
  | 'accept_quote'
  | 'request_diagnostic'
  | 'confirm_hourly_match';

export type MatchingWorkerChoiceScreenProps = Readonly<{
  matching: Loadable<MatchingSnapshot>;
  actorId: string;
  commandKeys: Readonly<Record<MatchingCommand, string>>;
  onBack: () => void;
  onRetryLoad: () => void;
  onCommand: (intent: CustomerCommandIntent) => void;
  onOpenWorker: (worker: WorkerChoice) => void;
  onOpenRecommendationExplanation: (worker: WorkerChoice) => void;
  onOpenProject: (projectId: string) => void;
  recommendationCapability: AssistanceCapability;
  recommendationPackaged: boolean;
}>;

export function MatchingWorkerChoiceScreen({
  matching,
  actorId,
  commandKeys,
  onBack,
  onRetryLoad,
  onCommand,
  onOpenWorker,
  onOpenRecommendationExplanation,
  onOpenProject,
  recommendationCapability,
  recommendationPackaged,
}: MatchingWorkerChoiceScreenProps) {
  const theme = useTogtTheme();

  const emit = (
    snapshot: MatchingSnapshot,
    connectionState: 'online' | 'offline',
    command: MatchingCommand,
    targetId: string | null = null,
  ) => {
    const result = createCustomerCommandIntent({
      actorId,
      command,
      connectionState,
      projectId: snapshot.projectId,
      requestKey: commandKeys[command],
      stateVersion: snapshot.stateVersion,
      targetId,
    });
    if (result.ok) onCommand(result.intent);
  };

  const selectWorker = (
    snapshot: MatchingSnapshot,
    connectionState: 'online' | 'offline',
    worker: WorkerChoice,
  ) => {
    const command: MatchingCommand = snapshot.mode === 'diagnostic_visit' ? 'request_diagnostic' : 'select_worker';
    emit(snapshot, connectionState, command, worker.workerId);
  };

  return (
    <AppScaffold
      contentContainerStyle={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.xxxl }}
      scrollable
      testID="matching-worker-choice-screen"
      topBar={<TopAppBar onBack={onBack} title="Find a Worker" />}
    >
      <ProjectScreenState
        emptyBody="No authoritative matching request was provided."
        emptyTitle="Matching request unavailable"
        errorBody="No matching or Worker state was changed."
        errorTitle="Matching progress could not be loaded"
        loadingLabel={customerProjectMessage('loading.matching')}
        onRetry={onRetryLoad}
        value={matching}
      >
        {(snapshot, connectionState) => {
          const view = deriveMatchingView(snapshot);
          const offline = connectionState === 'offline';
          return (
            <>
              <Surface elevation="card" style={{ gap: theme.spacing.sm }} variant={view.terminal ? 'subtle' : 'positive'}>
                <View style={styles.headingRow}>
                  <View style={styles.flex}>
                    <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h1, { color: theme.colors.text }]}>{view.title}</Text>
                    <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.textSecondary }]}>{view.body}</Text>
                  </View>
                  <StatusPill label={view.statusLabel} tone={view.terminal ? 'complete' : 'inProgress'} />
                </View>
                {snapshot.mode === 'fast_match' ? (
                  <>
                    <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{snapshot.summary} · {snapshot.areaLabel}</Text>
                    {snapshot.elapsedSeconds !== null ? (
                      <Text allowFontScaling style={[theme.typography.numeric, { color: theme.colors.text }]}>
                        {customerProjectMessage('matching.elapsed', { duration: formatProjectDuration(snapshot.elapsedSeconds) })}
                      </Text>
                    ) : null}
                  </>
                ) : null}
                {view.showCancel ? (
                  <Button
                    accessibilityHint={customerProjectMessage('matching.cancelHint')}
                    disabled={offline}
                    label={customerProjectMessage('common.cancel')}
                    onPress={() => emit(snapshot, connectionState, 'cancel_match')}
                    variant="tertiary"
                  />
                ) : null}
                {view.recovery.action ? (
                  <Button
                    disabled={offline}
                    label={view.recovery.label ?? customerProjectMessage('common.retry')}
                    onPress={() => emit(snapshot, connectionState, 'retry_match')}
                    variant="secondary"
                  />
                ) : null}
              </Surface>

              {snapshot.mode === 'fast_match' && snapshot.status === 'awaiting_customer_rate_confirmation' && snapshot.matchedWorker && snapshot.matchedHourlyTerms ? (
                <WorkerChoiceCard
                  actionHint="Confirms this specific Worker, rate and estimate."
                  actionLabel={customerProjectMessage('matching.confirmRate')}
                  disabled={offline}
                  onPress={(worker) => emit(snapshot, connectionState, 'confirm_hourly_match', worker.workerId)}
                  onProfile={onOpenWorker}
                  selected
                  worker={snapshot.matchedWorker}
                />
              ) : null}

              {snapshot.mode === 'diagnostic_visit' ? (
                <Surface style={{ gap: theme.spacing.sm }} variant="attention">
                  <SectionHeader title="Diagnostic visit terms" />
                  <Text allowFontScaling style={[theme.typography.numeric, { color: theme.colors.text }]}>{formatProjectMoney(snapshot.diagnosticTerms.visitTotal)}</Text>
                  <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.text }]}>{snapshot.diagnosticTerms.deliverable}</Text>
                  <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{customerProjectMessage('matching.diagnosticTruth')}</Text>
                  <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>{snapshot.scheduleLabel}</Text>
                </Surface>
              ) : null}

              {view.confirmedWorker ? (
                <Surface elevation="card" style={{ gap: theme.spacing.md }} variant="positive">
                  <SectionHeader title="Confirmed Worker" />
                  <WorkerSummary worker={view.confirmedWorker} />
                  <Button label="Open Project Hub" onPress={() => onOpenProject(snapshot.projectId)} />
                </Surface>
              ) : null}

              {snapshot.mode === 'compare_workers' || snapshot.mode === 'diagnostic_visit' ? (
                <View style={{ gap: theme.spacing.md }}>
                  {snapshot.workers.map((worker) => (
                    <WorkerChoiceCard
                      actionHint={snapshot.mode === 'diagnostic_visit'
                        ? 'Sends a request for this separately priced diagnostic visit.'
                        : 'Sends a scheduled request unless the card explicitly states that the slot is reservable.'}
                      actionLabel={snapshot.mode === 'diagnostic_visit'
                        ? customerProjectMessage('matching.bookDiagnostic')
                        : customerProjectMessage('matching.sendRequest')}
                      disabled={offline || snapshot.status !== 'ready'}
                      key={worker.workerId}
                      onPress={(selected) => selectWorker(snapshot, connectionState, selected)}
                      onProfile={onOpenWorker}
                      selected={snapshot.selectedWorkerId === worker.workerId}
                      worker={worker}
                    />
                  ))}
                </View>
              ) : null}

              {snapshot.mode === 'receive_quotes' ? (
                <View style={{ gap: theme.spacing.md }}>
                  {recommendationPackaged && !recommendationCapability.available ? (
                    <Surface testID="recommendation-capability-notice" variant="attention">
                      <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>Recommendation explanations are unavailable ({recommendationCapability.reasonCode.replaceAll('_', ' ')}). Compare every quote directly; no ranking claim is shown.</Text>
                    </Surface>
                  ) : null}
                  {snapshot.quotes.map((quote) => (
                    <QuoteCard
                      disabled={offline || (snapshot.status !== 'ready' && snapshot.status !== 'partial') || quote.status === 'withdrawn' || quote.status === 'expired'}
                      key={`${quote.quoteId}:v${quote.quoteVersion}`}
                      onAccept={() => emit(snapshot, connectionState, 'accept_quote', quote.quoteId)}
                      onExplain={recommendationCapability.available
                        ? () => onOpenRecommendationExplanation(quote.worker)
                        : null}
                      onOpenWorker={() => onOpenWorker(quote.worker)}
                      quote={quote}
                    />
                  ))}
                </View>
              ) : null}
            </>
          );
        }}
      </ProjectScreenState>
    </AppScaffold>
  );
}

function WorkerSummary({ worker }: Readonly<{ worker: WorkerChoice }>) {
  const theme = useTogtTheme();
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <WorkerIdentityHeader worker={worker} />
      <VerificationList evidence={worker.verification} />
    </View>
  );
}

function WorkerIdentityHeader({ worker }: Readonly<{ worker: WorkerChoice }>) {
  const theme = useTogtTheme();
  const ratingLabel = worker.rating
    ? `${worker.rating.average.toFixed(1)} from ${worker.rating.count} review${worker.rating.count === 1 ? '' : 's'}`
    : 'New on TOGT';
  return (
    <View
      accessibilityLabel={`${worker.displayName}. ${worker.serviceLabel}. ${ratingLabel}.`}
      style={[styles.workerIdentity, { gap: theme.spacing.md }]}
      testID={`worker-evidence-${worker.workerId}`}
    >
      {isSafeRemoteImageUrl(worker.photoUrl) ? (
        <Image
          accessibilityLabel={`${worker.displayName} profile photo`}
          source={{ uri: worker.photoUrl }}
          style={[styles.avatar, { borderColor: theme.colors.border, borderRadius: theme.radius.pill }]}
        />
      ) : (
        <View
          accessibilityLabel={`${worker.displayName} branded profile placeholder`}
          style={[styles.avatarFallback, { backgroundColor: theme.colors.surfacePositive, borderRadius: theme.radius.pill }]}
        >
          <MaterialCommunityIcons color={theme.colors.actionPrimary} name="account-hard-hat-outline" size={theme.sizing.iconLarge} />
        </View>
      )}
      <View style={styles.flex}>
        <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>{worker.displayName}</Text>
        <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{worker.serviceLabel}</Text>
        <View style={[styles.actionRow, { gap: theme.spacing.xs, marginTop: theme.spacing.xs }]}>
          <Chip label={ratingLabel} tone={worker.rating ? 'attention' : 'neutral'} />
          {worker.completedJobs !== null ? <Chip label={`${worker.completedJobs} completed`} tone="brand" /> : null}
        </View>
      </View>
    </View>
  );
}

function QuoteCard({ quote, disabled, onAccept, onExplain, onOpenWorker }: Readonly<{
  quote: QuoteChoice;
  disabled: boolean;
  onAccept: () => void;
  onExplain: (() => void) | null;
  onOpenWorker: () => void;
}>) {
  const theme = useTogtTheme();
  return (
    <Surface elevation="card" style={{ gap: theme.spacing.md }} testID={`quote-choice-${quote.quoteId}`}>
      <View style={styles.headingRow}>
        <View style={styles.flex}>
          <WorkerIdentityHeader worker={quote.worker} />
        </View>
        <Text allowFontScaling style={[theme.typography.numeric, { color: theme.colors.text }]}>{formatProjectMoney(quote.total)}</Text>
      </View>
      <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.textSecondary }]}>{quote.scope}</Text>
      <VerificationList evidence={quote.worker.verification} />
      <Text allowFontScaling style={[theme.typography.label, { color: theme.colors.text }]}>Schedule</Text>
      <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{quote.scheduleLabel}{quote.durationLabel ? ` · ${quote.durationLabel}` : ''}</Text>
      <Text allowFontScaling style={[theme.typography.label, { color: theme.colors.text }]}>Exclusions</Text>
      {quote.exclusions.length > 0 ? quote.exclusions.map((item) => (
        <Text allowFontScaling key={item} style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>• {item}</Text>
      )) : <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>No exclusions were provided.</Text>}
      <Text allowFontScaling style={[theme.typography.label, { color: theme.colors.text }]}>Assumptions</Text>
      {quote.assumptions.length > 0 ? quote.assumptions.map((item) => (
        <Text allowFontScaling key={item} style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>• {item}</Text>
      )) : <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>No assumptions were provided.</Text>}
      <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>Version {quote.quoteVersion} · Expires {quote.expiresAt}</Text>
      <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>{customerProjectMessage('matching.quoteTruth')}</Text>
      <View style={[styles.actionRow, { gap: theme.spacing.sm }]}>
        <Button label={customerProjectMessage('common.viewDetails')} onPress={onOpenWorker} variant="secondary" />
        {onExplain ? <Button label="Why this recommendation?" onPress={onExplain} variant="tertiary" /> : null}
        <Button disabled={disabled} label={customerProjectMessage('matching.acceptQuote')} onPress={onAccept} style={styles.flex} />
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  avatar: { borderWidth: 1, height: 64, width: 64 },
  avatarFallback: { alignItems: 'center', height: 64, justifyContent: 'center', width: 64 },
  flex: { flex: 1 },
  headingRow: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap' },
  actionRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap' },
  workerIdentity: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', minWidth: 220 },
});

export default MatchingWorkerChoiceScreen;
