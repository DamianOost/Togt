import React from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLayoutMetrics, useTogtTheme } from '../../../design';
import { useRouteEntryFocus } from '../../../navigation/useRouteEntryFocus';
import { AppScaffold, Button, SectionHeader, StatusPill, Surface, TopAppBar } from '../../../ui';
import { workerLifecycleMessage, workerPhaseLabel } from './copy';
import {
  CommercialEvidence,
  LifecycleActionRow,
  LifecycleResource,
  LifecycleRow,
  ReadOnlyNotice,
  Timeline,
} from './components';
import { createWorkerLifecycleIntent } from './controller';
import type { WorkerLifecycleIntent } from './controller';
import {
  deriveWorkerDominantAction,
  deriveWorkerPrivacyPresentation,
  hasServerEvidence,
} from './model';
import type {
  ConnectionState,
  LifecycleResourceState,
  WorkerJobDetailSnapshot,
  WorkerJobRouteTarget,
} from './model';
import type { AssistanceCapability } from '../../intelligence/model';
import { ContextualSafetyEducationCard } from '../../intelligence/ContextualSafetyEducationCard';

type JobCommand = 'start_route' | 'mark_arrived';

export type WorkerJobDetailScreenProps = Readonly<{
  resource: LifecycleResourceState<WorkerJobDetailSnapshot>;
  connectionState: ConnectionState;
  actorId: string;
  commandKeys: Readonly<Record<JobCommand, string>>;
  detailsExpanded: boolean;
  routeMap: ReactNode | null;
  onBack: () => void;
  onRetry: () => void;
  onToggleDetails: () => void;
  onCommand: (intent: WorkerLifecycleIntent) => void;
  onOpenRouteTarget: (target: WorkerJobRouteTarget, projectId: string) => void;
  onOpenNavigation: (projectId: string) => void;
  onOpenChat: (projectId: string) => void;
  onContactCustomer: (projectId: string) => void;
  onOpenSafetyHelp: (projectId: string) => void;
  onOpenReschedule: (projectId: string) => void;
  onShareSafeStatus: (projectId: string) => void;
  safeSharingAvailable: boolean;
  rescheduleAvailable: boolean;
  liveStatusCapability: AssistanceCapability;
  liveStatusPackaged: boolean;
  onOpenLiveStatus: (projectId: string) => void;
  safetyEducationVisible: boolean;
  onDismissSafetyEducation: () => void;
}>;

export function WorkerJobDetailScreen({
  resource,
  connectionState,
  actorId,
  commandKeys,
  detailsExpanded,
  routeMap,
  onBack,
  onRetry,
  onToggleDetails,
  onCommand,
  onOpenRouteTarget,
  onOpenNavigation,
  onOpenChat,
  onContactCustomer,
  onOpenSafetyHelp,
  onOpenReschedule,
  onShareSafeStatus,
  safeSharingAvailable,
  rescheduleAvailable,
  liveStatusCapability,
  liveStatusPackaged,
  onOpenLiveStatus,
  safetyEducationVisible,
  onDismissSafetyEducation,
}: WorkerJobDetailScreenProps) {
  const theme = useTogtTheme();
  const layout = useLayoutMetrics();
  const routeTitle = workerLifecycleMessage('job.title');
  const routeTitleRef = useRouteEntryFocus<Text>({ fallbackAnnouncement: routeTitle });
  return (
    <AppScaffold
      contentContainerStyle={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.xxxl }}
      scrollable
      testID="worker-job-detail-screen"
      topBar={<TopAppBar onBack={onBack} title={routeTitle} titleRef={routeTitleRef} />}
    >
      <LifecycleResource connectionState={connectionState} onRetry={onRetry} resource={resource}>
        {(snapshot) => {
          const phase = hasServerEvidence(snapshot.phase) ? snapshot.phase.value : 'unknown';
          const unknown = phase === 'unknown';
          const action = deriveWorkerDominantAction(snapshot, connectionState);
          const privacy = deriveWorkerPrivacyPresentation(snapshot.privacy, phase);
          const showDetails = layout.size !== 'compact' || detailsExpanded;
          const travelRelevant = phase === 'en_route' || phase === 'arrived';
          const emitCommand = (command: JobCommand) => {
            const result = createWorkerLifecycleIntent({
              actorId,
              command,
              connectionState,
              projectId: snapshot.projectId,
              requestKey: commandKeys[command],
              resourceId: snapshot.projectId,
              stateVersion: snapshot.stateVersion,
            });
            if (result.ok) onCommand(result.intent);
          };
          const invokeDominantAction = () => {
            if (action.kind === 'command') emitCommand(action.command);
            if (action.kind === 'route') onOpenRouteTarget(action.target, snapshot.projectId);
          };
          return (
            <>
              <Surface elevation="card" style={{ gap: theme.spacing.md }} variant={unknown ? 'attention' : 'positive'}>
                <View style={styles.split}>
                  <View style={styles.flex}>
                    <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>{workerLifecycleMessage('job.currentState')}</Text>
                    <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h1, { color: theme.colors.text }]}>{unknown ? workerLifecycleMessage('job.unknownTitle') : snapshot.phaseLabel || workerPhaseLabel(phase)}</Text>
                    <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{unknown ? workerLifecycleMessage('job.unknownBody') : `Updated ${snapshot.phaseUpdatedAt}`}</Text>
                  </View>
                  <StatusPill label={workerPhaseLabel(phase)} tone={unknown ? 'pending' : phase === 'closed' ? 'complete' : phase === 'cancelled' ? 'error' : 'inProgress'} />
                </View>
                {snapshot.openIssue ? (
                  <Surface variant="danger">
                    <Text accessibilityRole="alert" allowFontScaling style={[theme.typography.body, { color: theme.colors.error }]}>{snapshot.openIssue.label}</Text>
                  </Surface>
                ) : null}
                <Button disabled={!action.enabled} label={action.label} onPress={invokeDominantAction} />
                {!action.enabled ? <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>{action.reason}</Text> : null}
                {rescheduleAvailable ? (
                  <Button
                    disabled={connectionState === 'offline'}
                    label="Review schedule change"
                    onPress={() => onOpenReschedule(snapshot.projectId)}
                    variant="secondary"
                  />
                ) : null}
                <Button
                  label={workerLifecycleMessage('job.safety')}
                  leading={<MaterialCommunityIcons color={theme.colors.emergency} name="shield-alert-outline" size={theme.sizing.iconMedium} />}
                  onPress={() => onOpenSafetyHelp(snapshot.projectId)}
                  variant="secondary"
                />
                {safeSharingAvailable ? (
                  <Button
                    accessibilityHint="Opens a privacy-screened, static Project preview before the platform share sheet."
                    disabled={connectionState === 'offline'}
                    label="Share safe summary"
                    onPress={() => onShareSafeStatus(snapshot.projectId)}
                    variant="secondary"
                  />
                ) : null}
              </Surface>

              {safetyEducationVisible ? (
                <ContextualSafetyEducationCard
                  audience="worker_start"
                  onDismiss={onDismissSafetyEducation}
                />
              ) : null}

              {liveStatusPackaged ? (
                <Surface style={{ gap: theme.spacing.sm }} testID="worker-live-status-capability-card" variant={liveStatusCapability.available ? 'positive' : 'attention'}>
                  <SectionHeader title="Live platform status" />
                  <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{liveStatusCapability.available
                    ? 'Open the privacy-screened, server-authoritative Android status view. No background tracking is enabled.'
                    : `Live status remains unavailable (${liveStatusCapability.reasonCode.replaceAll('_', ' ')}). This Job detail remains authoritative.`}</Text>
                  <Button
                    disabled={!liveStatusCapability.available || connectionState === 'offline'}
                    label={liveStatusCapability.available ? 'Open live status' : 'Live status unavailable'}
                    onPress={() => onOpenLiveStatus(snapshot.projectId)}
                    variant="secondary"
                  />
                </Surface>
              ) : null}

              {travelRelevant && routeMap && (snapshot.tracking.status === 'sharing' || snapshot.tracking.status === 'stale') ? (
                <Surface style={styles.mapSlot}>{routeMap}</Surface>
              ) : null}

              <TrackingPanel snapshot={snapshot} />

              {travelRelevant ? (
                <View style={{ gap: theme.spacing.sm }}>
                  <LifecycleActionRow>
                    <Button label={workerLifecycleMessage('job.navigation')} onPress={() => onOpenNavigation(snapshot.projectId)} variant="secondary" />
                    {snapshot.canChat ? <Button label={workerLifecycleMessage('job.chat')} onPress={() => onOpenChat(snapshot.projectId)} variant="secondary" /> : null}
                    {privacy.contactStatus === 'revealed' ? <Button label={workerLifecycleMessage('job.contact')} onPress={() => onContactCustomer(snapshot.projectId)} variant="secondary" /> : null}
                  </LifecycleActionRow>
                </View>
              ) : null}

              {layout.size === 'compact' ? (
                <Button label={detailsExpanded ? workerLifecycleMessage('job.detailsHide') : workerLifecycleMessage('job.detailsShow')} onPress={onToggleDetails} variant="tertiary" />
              ) : null}

              {showDetails ? (
                <>
                  <Surface style={{ gap: theme.spacing.sm }}>
                    <SectionHeader title={workerLifecycleMessage('job.customer')} />
                    <LifecycleRow icon="account-outline" label="Customer identity" value={hasServerEvidence(snapshot.customerDisplayName) ? snapshot.customerDisplayName.value : snapshot.customerDisplayName.explanation} />
                    {snapshot.customerEvidence.map((evidence) => (
                      <LifecycleRow icon={evidence.status === 'verified' ? 'check-decagram-outline' : 'information-outline'} key={evidence.evidenceId} label={evidence.label} value={evidence.detail} tone={evidence.status === 'verified' ? 'positive' : 'default'} />
                    ))}
                  </Surface>

                  <Surface style={{ gap: theme.spacing.sm }}>
                    <LifecycleRow icon="calendar-blank-outline" label={workerLifecycleMessage('job.schedule')} value={hasServerEvidence(snapshot.scheduleLabel) ? snapshot.scheduleLabel.value : snapshot.scheduleLabel.explanation} />
                    <LifecycleRow icon="map-marker-outline" label="Broad area" value={privacy.areaLabel ?? workerLifecycleMessage('common.notAvailable')} />
                    <LifecycleRow
                      icon={privacy.addressStatus === 'exact_revealed' ? 'map-marker-check-outline' : 'map-marker-off-outline'}
                      label={workerLifecycleMessage('job.location')}
                      value={privacy.exactAddressLabel ?? (privacy.addressStatus === 'broad_only' ? workerLifecycleMessage('privacy.broadOnly') : workerLifecycleMessage('common.notAvailable'))}
                    />
                    <LifecycleRow icon="phone-outline" label={workerLifecycleMessage('job.contact')} value={privacy.contactLabel ?? workerLifecycleMessage('privacy.masked')} />
                  </Surface>

                  <Surface style={{ gap: theme.spacing.sm }}>
                    <SectionHeader title={workerLifecycleMessage('job.scope')} />
                    <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.text }]}>{hasServerEvidence(snapshot.scopeSummary) ? snapshot.scopeSummary.value : snapshot.scopeSummary.explanation}</Text>
                  </Surface>

                  <Surface style={{ gap: theme.spacing.md }}>
                    <SectionHeader title={workerLifecycleMessage('job.earnings')} />
                    <CommercialEvidence evidence={snapshot.commercial} />
                    <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>Expected net is not a payout or transfer promise.</Text>
                  </Surface>

                  <Surface style={{ gap: theme.spacing.md }}>
                    <SectionHeader title={workerLifecycleMessage('job.timeline')} />
                    <Timeline events={snapshot.timeline} />
                  </Surface>

                  {!unknown ? (
                    <LifecycleActionRow>
                      {snapshot.canChat ? <Button label={workerLifecycleMessage('job.chat')} onPress={() => onOpenChat(snapshot.projectId)} variant="secondary" /> : null}
                      {privacy.contactStatus === 'revealed' ? <Button label={workerLifecycleMessage('job.contact')} onPress={() => onContactCustomer(snapshot.projectId)} variant="secondary" /> : null}
                    </LifecycleActionRow>
                  ) : <ReadOnlyNotice body={workerLifecycleMessage('job.unknownBody')} title={workerLifecycleMessage('job.unknownTitle')} />}
                </>
              ) : null}
            </>
          );
        }}
      </LifecycleResource>
    </AppScaffold>
  );
}

function TrackingPanel({ snapshot }: Readonly<{ snapshot: WorkerJobDetailSnapshot }>) {
  const theme = useTogtTheme();
  const copy = {
    hidden: workerLifecycleMessage('tracking.hidden'),
    not_started: workerLifecycleMessage('tracking.notStarted'),
    sharing: workerLifecycleMessage('tracking.sharing'),
    stale: workerLifecycleMessage('tracking.stale'),
    failed: snapshot.tracking.failureReason ?? workerLifecycleMessage('tracking.failed'),
    stopped: workerLifecycleMessage('tracking.stopped'),
  }[snapshot.tracking.status];
  return (
    <Surface accessibilityLabel={`${workerLifecycleMessage('tracking.title')}: ${copy}`} style={{ gap: theme.spacing.sm }} variant={snapshot.tracking.status === 'failed' ? 'danger' : snapshot.tracking.status === 'stale' ? 'attention' : snapshot.tracking.status === 'sharing' ? 'positive' : 'subtle'}>
      <View style={[styles.row, { gap: theme.spacing.sm }]}>
        <MaterialCommunityIcons color={snapshot.tracking.status === 'sharing' ? theme.colors.success : snapshot.tracking.status === 'failed' ? theme.colors.error : theme.colors.textSecondary} name={snapshot.tracking.status === 'sharing' ? 'crosshairs-gps' : 'crosshairs-off'} size={theme.sizing.iconLarge} />
        <View style={styles.flex}>
          <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>{workerLifecycleMessage('tracking.title')}</Text>
          <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{copy}</Text>
          {snapshot.tracking.capturedAt ? <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>Last location evidence {snapshot.tracking.capturedAt}</Text> : null}
        </View>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  split: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap' },
  row: { alignItems: 'flex-start', flexDirection: 'row' },
  mapSlot: { minHeight: 180, padding: 0 },
});

export default WorkerJobDetailScreen;
