import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTogtTheme } from '../../../design';
import { AppScaffold, Button, SectionHeader, StatusPill, Surface, TopAppBar } from '../../../ui';
import { formatLifecycleMoney, workerLifecycleMessage } from './copy';
import { LifecycleActionRow, LifecycleResource, LifecycleRow, ReadOnlyNotice } from './components';
import { createWorkerLifecycleIntent } from './controller';
import type { WorkerLifecycleIntent } from './controller';
import {
  deriveCompletionPresentation,
  hasLedgerEvidence,
  hasServerEvidence,
} from './model';
import type {
  ConnectionState,
  LifecycleResourceState,
  WorkerCompletionSnapshot,
} from './model';

export type WorkerCompletionScreenProps = Readonly<{
  resource: LifecycleResourceState<WorkerCompletionSnapshot>;
  connectionState: ConnectionState;
  actorId: string;
  requestCompletionKey: string;
  requestCompletionAllowed: boolean;
  onBack: () => void;
  onRetry: () => void;
  onCommand: (intent: WorkerLifecycleIntent) => void;
  onOpenIssue: (issueId: string, projectId: string) => void;
  onOpenPaymentStatus: (projectId: string) => void;
  onOpenEarnings: (projectId: string) => void;
  onOpenSafetyHelp: (projectId: string) => void;
}>;

export function WorkerCompletionScreen({
  resource,
  connectionState,
  actorId,
  requestCompletionKey,
  requestCompletionAllowed,
  onBack,
  onRetry,
  onCommand,
  onOpenIssue,
  onOpenPaymentStatus,
  onOpenEarnings,
  onOpenSafetyHelp,
}: WorkerCompletionScreenProps) {
  const theme = useTogtTheme();
  return (
    <AppScaffold
      contentContainerStyle={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.xxxl }}
      scrollable
      testID="worker-completion-screen"
      topBar={<TopAppBar onBack={onBack} title={workerLifecycleMessage('completion.title')} />}
    >
      <LifecycleResource connectionState={connectionState} onRetry={onRetry} resource={resource}>
        {(snapshot) => {
          const presentation = deriveCompletionPresentation(snapshot, connectionState);
          const requestCompletion = () => {
            const result = createWorkerLifecycleIntent({
              actorId,
              command: 'request_completion',
              connectionState,
              projectId: snapshot.projectId,
              requestKey: requestCompletionKey,
              resourceId: snapshot.finalCommercialSnapshotId ?? snapshot.projectId,
              stateVersion: snapshot.stateVersion,
              payload: snapshot.finalCommercialSnapshotId
                ? { commercialSnapshotId: snapshot.finalCommercialSnapshotId }
                : {},
            });
            if (result.ok) onCommand(result.intent);
          };
          return (
            <>
              <Surface elevation="card" style={{ gap: theme.spacing.md }} variant={presentation.issueOpen ? 'danger' : presentation.fulfilmentConfirmed ? 'positive' : snapshot.status === 'unknown' ? 'attention' : 'default'}>
                <View style={styles.split}>
                  <View style={styles.flex}>
                    <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h1, { color: theme.colors.text }]}>{presentation.title}</Text>
                    <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.textSecondary }]}>{presentation.explanation}</Text>
                  </View>
                  <StatusPill label={snapshot.status.replaceAll('_', ' ')} tone={presentation.issueOpen ? 'error' : presentation.fulfilmentConfirmed ? 'complete' : 'pending'} />
                </View>
                <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{workerLifecycleMessage('completion.bilateral')}</Text>
                {presentation.canRequestCompletion ? <Button disabled={!requestCompletionAllowed} label={workerLifecycleMessage('completion.request')} onPress={requestCompletion} /> : null}
                {snapshot.status === 'unknown' ? <ReadOnlyNotice body={workerLifecycleMessage('job.unknownBody')} title={workerLifecycleMessage('job.unknownTitle')} /> : null}
              </Surface>

              <Surface style={{ gap: theme.spacing.md }}>
                <SectionHeader title={workerLifecycleMessage('completion.scope')} />
                <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.text }]}>{snapshot.scopeSummary}</Text>
                {snapshot.finalCommercialSnapshotId ? (
                  <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>Commercial snapshot {snapshot.finalCommercialSnapshotId}</Text>
                ) : null}
                <SectionHeader title={workerLifecycleMessage('completion.evidence')} />
                {snapshot.evidenceLabels.length > 0 ? snapshot.evidenceLabels.map((evidence) => (
                  <View key={evidence} style={[styles.row, { gap: theme.spacing.sm }]}>
                    <MaterialCommunityIcons color={theme.colors.actionPrimary} name="file-check-outline" size={theme.sizing.iconSmall} />
                    <Text allowFontScaling style={[theme.typography.bodySmall, styles.flex, { color: theme.colors.textSecondary }]}>{evidence}</Text>
                  </View>
                )) : <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>No completion evidence labels were supplied.</Text>}
              </Surface>

              {snapshot.issue ? (
                <Surface style={{ gap: theme.spacing.md }} variant="danger">
                  <SectionHeader title={workerLifecycleMessage('completion.issue')} />
                  <LifecycleRow icon="alert-circle-outline" label={snapshot.issue.label} value={snapshot.issue.status.replaceAll('_', ' ')} tone="danger" />
                  <Button label={workerLifecycleMessage('completion.support')} onPress={() => snapshot.issue && onOpenIssue(snapshot.issue.issueId, snapshot.projectId)} variant="secondary" />
                </Surface>
              ) : null}

              <Surface style={{ gap: theme.spacing.md }}>
                <SectionHeader subtitle={workerLifecycleMessage('completion.separateMoney')} title="Commercial state" />
                <LifecycleRow
                  icon="cash"
                  label={workerLifecycleMessage('completion.net')}
                  value={hasLedgerEvidence(snapshot.finalExpectedNet) ? formatLifecycleMoney(snapshot.finalExpectedNet.value) : snapshot.finalExpectedNet.explanation}
                />
                <LifecycleRow
                  icon="credit-card-outline"
                  label={workerLifecycleMessage('completion.payment')}
                  value={hasServerEvidence(snapshot.paymentState) ? snapshot.paymentState.value.replaceAll('_', ' ') : snapshot.paymentState.explanation}
                />
                <EligibilityRow evidence={snapshot.ratingEligibility} label="Rating eligibility" />
                <EligibilityRow evidence={snapshot.payoutEligibility} label="Payout eligibility" />
                <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>Eligibility does not promise payment, payout timing or transfer completion.</Text>
                <LifecycleActionRow>
                  <Button label="View payment status" onPress={() => onOpenPaymentStatus(snapshot.projectId)} variant="secondary" />
                  <Button label="View Job earnings" onPress={() => onOpenEarnings(snapshot.projectId)} variant="secondary" />
                </LifecycleActionRow>
              </Surface>

              <Button
                label={workerLifecycleMessage('job.safety')}
                leading={<MaterialCommunityIcons color={theme.colors.emergency} name="shield-alert-outline" size={theme.sizing.iconMedium} />}
                onPress={() => onOpenSafetyHelp(snapshot.projectId)}
                variant="secondary"
              />
            </>
          );
        }}
      </LifecycleResource>
    </AppScaffold>
  );
}

function EligibilityRow({ evidence, label }: Readonly<{
  evidence: WorkerCompletionSnapshot['ratingEligibility'];
  label: string;
}>) {
  const value = hasServerEvidence(evidence)
    ? `${evidence.value.eligible ? 'Eligible' : 'Not eligible'} · ${evidence.value.reason}`
    : evidence.explanation;
  return <LifecycleRow icon="shield-check-outline" label={label} value={value} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  split: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap' },
  row: { alignItems: 'flex-start', flexDirection: 'row' },
});

export default WorkerCompletionScreen;
