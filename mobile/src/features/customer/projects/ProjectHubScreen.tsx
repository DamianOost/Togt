import React from 'react';
import type { ReactNode } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useLayoutMetrics, useTogtTheme } from '../../../design';
import { useRouteEntryFocus } from '../../../navigation/useRouteEntryFocus';
import { AppScaffold, Button, Chip, SectionHeader, StatusPill, Surface, TopAppBar } from '../../../ui';
import { customerProjectMessage, formatProjectMoney, phaseDominantAction } from './copy';
import {
  DefinitionRow,
  PriceEvidenceSummary,
  ProjectScreenState,
  TimelineView,
  TravelPanel,
  VerificationList,
} from './components';
import {
  derivePaymentView,
  derivePrivacyView,
  deriveTravelView,
  isSafeRemoteImageUrl,
} from './model';
import type {
  Loadable,
  OperationalPhase,
  ProjectHubSnapshot,
  TrackingEvidence,
  WorkerChoice,
} from './model';
import type { AssistanceCapability } from '../../intelligence/model';
import { ContextualSafetyEducationCard } from '../../intelligence/ContextualSafetyEducationCard';

export type ProjectHubScreenProps = Readonly<{
  project: Loadable<ProjectHubSnapshot>;
  tracking: TrackingEvidence;
  serverNow: string;
  trackingStaleAfterSeconds: number;
  exactAddressRevealAuthorised: boolean;
  contactRevealAuthorised: boolean;
  relationshipsAvailable: boolean;
  liveStatusCapability: AssistanceCapability;
  liveStatusPackaged: boolean;
  safetyEducationVisible: boolean;
  detailsExpanded: boolean;
  travelMap: ReactNode | null;
  onBack: () => void;
  onRetry: () => void;
  onToggleDetails: () => void;
  onDominantAction: (phase: OperationalPhase, projectId: string) => void;
  onOpenWorker: (worker: WorkerChoice) => void;
  onOpenChat: (projectId: string) => void;
  onContact: (projectId: string) => void;
  onShareSafeStatus: (projectId: string) => void;
  onOpenSafetyHelp: (projectId: string) => void;
  onOpenPayment: (projectId: string) => void;
  onOpenRelationships: (projectId: string) => void;
  onOpenLiveStatus: (projectId: string) => void;
  onDismissSafetyEducation: () => void;
}>;

export function ProjectHubScreen({
  project,
  tracking,
  serverNow,
  trackingStaleAfterSeconds,
  exactAddressRevealAuthorised,
  contactRevealAuthorised,
  relationshipsAvailable,
  liveStatusCapability,
  liveStatusPackaged,
  safetyEducationVisible,
  detailsExpanded,
  travelMap,
  onBack,
  onRetry,
  onToggleDetails,
  onDominantAction,
  onOpenWorker,
  onOpenChat,
  onContact,
  onShareSafeStatus,
  onOpenSafetyHelp,
  onOpenPayment,
  onOpenRelationships,
  onOpenLiveStatus,
  onDismissSafetyEducation,
}: ProjectHubScreenProps) {
  const theme = useTogtTheme();
  const layout = useLayoutMetrics();
  const routeTitle = customerProjectMessage('hub.title');
  const routeTitleRef = useRouteEntryFocus<Text>({ fallbackAnnouncement: routeTitle });
  return (
    <AppScaffold
      contentContainerStyle={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.xxxl }}
      scrollable
      testID="project-hub-screen"
      topBar={<TopAppBar onBack={onBack} title={routeTitle} titleRef={routeTitleRef} />}
    >
      <ProjectScreenState
        emptyBody="No authoritative Project snapshot was supplied."
        emptyTitle="Project unavailable"
        errorBody={customerProjectMessage('error.projectBody')}
        errorTitle={customerProjectMessage('error.projectTitle')}
        loadingLabel={customerProjectMessage('loading.project')}
        onRetry={onRetry}
        value={project}
      >
        {(snapshot, connectionState) => {
          const unknown = snapshot.phase === 'unknown';
          const offline = connectionState === 'offline';
          const travelRelevant = snapshot.phase === 'en_route' || snapshot.phase === 'arrived';
          const travel = deriveTravelView(tracking, serverNow, trackingStaleAfterSeconds);
          const privacy = derivePrivacyView({
            contactRevealAuthorised,
            exactRevealAuthorised: exactAddressRevealAuthorised,
            phase: snapshot.phase,
          });
          const payment = derivePaymentView(snapshot.payment);
          const showDetails = layout.size !== 'compact' || detailsExpanded;
          const worker = snapshot.worker;
          return (
            <>
              <Surface elevation="card" style={{ gap: theme.spacing.md }} variant={unknown ? 'attention' : 'positive'}>
                <View style={styles.splitRow}>
                  <View style={styles.flex}>
                    <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>{customerProjectMessage('hub.currentState')}</Text>
                    <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h1, { color: theme.colors.text }]}>{unknown ? customerProjectMessage('hub.unknownTitle') : snapshot.phaseLabel}</Text>
                    <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{unknown ? customerProjectMessage('hub.unknownBody') : `Updated ${snapshot.phaseUpdatedAt}`}</Text>
                  </View>
                  <StatusPill label={snapshot.phaseLabel} tone={unknown ? 'pending' : snapshot.phase === 'closed' ? 'complete' : 'inProgress'} />
                </View>
                {snapshot.openIssue ? (
                  <Surface variant="danger">
                    <Text accessibilityRole="alert" allowFontScaling style={[theme.typography.body, { color: theme.colors.error }]}>{snapshot.openIssue.label}</Text>
                  </Surface>
                ) : null}
                <Button
                  disabled={unknown || offline}
                  label={phaseDominantAction(snapshot.phase)}
                  onPress={() => onDominantAction(snapshot.phase, snapshot.projectId)}
                />
                <Button
                  accessibilityHint="Opens emergency call, available escalation and support options."
                  label={customerProjectMessage('hub.safety')}
                  leading={<MaterialCommunityIcons color={theme.colors.emergency} name="shield-alert-outline" size={theme.sizing.iconMedium} />}
                  onPress={() => onOpenSafetyHelp(snapshot.projectId)}
                  variant="secondary"
                />
              </Surface>

              {safetyEducationVisible ? (
                <ContextualSafetyEducationCard
                  audience="customer_project"
                  onDismiss={onDismissSafetyEducation}
                />
              ) : null}

              {liveStatusPackaged ? (
                <Surface style={{ gap: theme.spacing.sm }} testID="live-status-capability-card" variant={liveStatusCapability.available ? 'positive' : 'attention'}>
                  <SectionHeader title="Live platform status" />
                  <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{liveStatusCapability.available
                    ? 'Open a privacy-screened, server-authoritative Android status view. No background tracking is enabled.'
                    : `Live status remains unavailable (${liveStatusCapability.reasonCode.replaceAll('_', ' ')}). This Project Hub remains authoritative.`}</Text>
                  <Button
                    disabled={!liveStatusCapability.available || offline}
                    label={liveStatusCapability.available ? 'Open live status' : 'Live status unavailable'}
                    onPress={() => onOpenLiveStatus(snapshot.projectId)}
                    variant="secondary"
                  />
                </Surface>
              ) : null}

              {travelRelevant ? (
                <View style={{ gap: theme.spacing.sm }}>
                  {travelMap && (travel.kind === 'live' || travel.kind === 'stale') ? <Surface style={styles.mapSlot}>{travelMap}</Surface> : null}
                  <TravelPanel view={travel} />
                  <View style={[styles.actionRow, { gap: theme.spacing.sm }]}>
                    {snapshot.canChat ? <Button label={customerProjectMessage('hub.chat')} onPress={() => onOpenChat(snapshot.projectId)} variant="secondary" /> : null}
                    {snapshot.canShareSafeStatus ? <Button disabled={offline} label={customerProjectMessage('hub.share')} onPress={() => onShareSafeStatus(snapshot.projectId)} variant="secondary" /> : null}
                  </View>
                </View>
              ) : null}

              {layout.size === 'compact' ? (
                <Button
                  label={detailsExpanded ? 'Hide Project details' : 'Show Project details'}
                  onPress={onToggleDetails}
                  variant="tertiary"
                />
              ) : null}

              {showDetails ? (
                <>
                  {worker ? (
                    <Surface onPress={() => onOpenWorker(worker)} style={{ gap: theme.spacing.sm }}>
                      <SectionHeader title={customerProjectMessage('hub.worker')} />
                      <View style={[styles.workerIdentity, { gap: theme.spacing.md }]} testID={`project-worker-evidence-${worker.workerId}`}>
                        {isSafeRemoteImageUrl(worker.photoUrl) ? (
                          <Image
                            accessibilityLabel={`${worker.displayName} profile photo`}
                            source={{ uri: worker.photoUrl }}
                            style={[styles.workerAvatar, { borderColor: theme.colors.border, borderRadius: theme.radius.pill }]}
                          />
                        ) : (
                          <View
                            accessibilityLabel={`${worker.displayName} branded profile placeholder`}
                            style={[styles.workerAvatarFallback, { backgroundColor: theme.colors.surfacePositive, borderRadius: theme.radius.pill }]}
                          >
                            <MaterialCommunityIcons color={theme.colors.actionPrimary} name="account-hard-hat-outline" size={theme.sizing.iconLarge} />
                          </View>
                        )}
                        <View style={styles.flex}>
                          <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>{worker.displayName}</Text>
                          <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{worker.serviceLabel}</Text>
                          <View style={[styles.actionRow, { gap: theme.spacing.xs, marginTop: theme.spacing.xs }]}>
                            <Chip
                              label={worker.rating ? `${worker.rating.average.toFixed(1)} · ${worker.rating.count} reviews` : 'New on TOGT'}
                              tone={worker.rating ? 'attention' : 'neutral'}
                            />
                            {worker.completedJobs !== null ? <Chip label={`${worker.completedJobs} completed`} tone="brand" /> : null}
                          </View>
                        </View>
                      </View>
                      <VerificationList evidence={worker.verification} />
                    </Surface>
                  ) : null}

                  <Surface style={{ gap: theme.spacing.sm }}>
                    <DefinitionRow icon="calendar-blank-outline" label={customerProjectMessage('hub.schedule')} value={snapshot.scheduleLabel} />
                    <DefinitionRow icon="map-marker-outline" label={customerProjectMessage('hub.address')} value={snapshot.exactAddressLabel} />
                    <DefinitionRow icon="map-marker-account-outline" label={customerProjectMessage('privacy.title')} value={privacy.explanation} />
                  </Surface>

                  <Surface style={{ gap: theme.spacing.md }}>
                    <SectionHeader title={customerProjectMessage('hub.scope')} />
                    <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.text }]}>{snapshot.commercial.scopeSummary}</Text>
                    <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{snapshot.commercial.materialsSummary}</Text>
                    <PriceEvidenceSummary price={snapshot.commercial.price} />
                    {snapshot.commercial.snapshotId && snapshot.commercial.version !== null ? (
                      <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>Snapshot {snapshot.commercial.snapshotId} · Version {snapshot.commercial.version}</Text>
                    ) : null}
                  </Surface>

                  <Surface style={{ gap: theme.spacing.md }}>
                    <SectionHeader title={customerProjectMessage('hub.money')} />
                    <Text allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>{payment.statusLabel}</Text>
                    <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{payment.body}</Text>
                    {snapshot.payment.amountDue ? <Text allowFontScaling style={[theme.typography.numeric, { color: theme.colors.text }]}>{formatProjectMoney(snapshot.payment.amountDue)}</Text> : null}
                    <Button disabled={unknown} label="Review payment details" onPress={() => onOpenPayment(snapshot.projectId)} variant="secondary" />
                  </Surface>

                  <Surface style={{ gap: theme.spacing.md }}>
                    <SectionHeader title={customerProjectMessage('hub.timeline')} />
                    <TimelineView events={snapshot.timeline} />
                  </Surface>

                  <Surface style={{ gap: theme.spacing.sm }}>
                    <SectionHeader title="Project actions" />
                    <View style={[styles.actionRow, { gap: theme.spacing.sm }]}>
                      {!unknown && snapshot.canChat ? <Button label={customerProjectMessage('hub.chat')} onPress={() => onOpenChat(snapshot.projectId)} variant="secondary" /> : null}
                      {!unknown && snapshot.canContact ? <Button label={customerProjectMessage('hub.contact')} onPress={() => onContact(snapshot.projectId)} variant="secondary" /> : null}
                      {!unknown && snapshot.canShareSafeStatus ? <Button disabled={offline} label={customerProjectMessage('hub.share')} onPress={() => onShareSafeStatus(snapshot.projectId)} variant="secondary" /> : null}
                      {!unknown && relationshipsAvailable ? <Button disabled={offline} label={customerProjectMessage('retention.manage')} onPress={() => onOpenRelationships(snapshot.projectId)} variant="secondary" /> : null}
                    </View>
                  </Surface>
                </>
              ) : null}
            </>
          );
        }}
      </ProjectScreenState>
    </AppScaffold>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  splitRow: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap' },
  actionRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap' },
  mapSlot: { minHeight: 180, padding: 0 },
  workerAvatar: { borderWidth: 1, height: 64, width: 64 },
  workerAvatarFallback: { alignItems: 'center', height: 64, justifyContent: 'center', width: 64 },
  workerIdentity: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap' },
});

export default ProjectHubScreen;
