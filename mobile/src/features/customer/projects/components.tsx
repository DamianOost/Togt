import React from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTogtTheme } from '../../../design';
import {
  Button,
  Chip,
  EmptyState,
  OfflineBanner,
  ScreenError,
  StatusPill,
  Surface,
} from '../../../ui';
import {
  customerProjectMessage,
  formatProjectMoney,
  segmentLabel,
} from './copy';
import type {
  ConnectionState,
  Loadable,
  MoneyAmount,
  PriceEvidence,
  ProjectListItem,
  TimelineEvent,
  TravelView,
  VerificationEvidence,
  WorkerChoice,
} from './model';
import { isSafeRemoteImageUrl } from './model';

export type ProjectScreenStateProps<T> = Readonly<{
  value: Loadable<T>;
  loadingLabel: string;
  errorTitle: string;
  errorBody: string;
  emptyTitle: string;
  emptyBody: string;
  onRetry: () => void;
  children: (value: T, connectionState: ConnectionState) => ReactNode;
}>;

export function ProjectScreenState<T>({
  value,
  loadingLabel,
  errorTitle,
  errorBody,
  emptyTitle,
  emptyBody,
  onRetry,
  children,
}: ProjectScreenStateProps<T>) {
  const theme = useTogtTheme();
  if (value.state === 'loading') {
    return (
      <View accessibilityLabel={loadingLabel} accessibilityRole="progressbar" style={styles.centredState}>
        <ActivityIndicator color={theme.colors.actionPrimary} size="large" />
        <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.textSecondary, marginTop: theme.spacing.md }]}>
          {loadingLabel}
        </Text>
      </View>
    );
  }
  if (value.state === 'error') {
    return (
      <ScreenError
        actionLabel={customerProjectMessage('common.retry')}
        body={errorBody}
        {...(value.correlationId ? { correlationId: value.correlationId } : {})}
        onAction={onRetry}
        title={errorTitle}
      />
    );
  }
  if (value.state === 'empty') {
    return <EmptyState body={emptyBody} title={emptyTitle} />;
  }
  return (
    <>
      {value.connectionState === 'offline' ? (
        <OfflineBanner
          lastUpdatedLabel={value.lastUpdatedAt}
          message={customerProjectMessage('offline.body')}
          onRetry={onRetry}
        />
      ) : null}
      {children(value.value, value.connectionState)}
    </>
  );
}

export function DefinitionRow({
  icon,
  label,
  value,
  tone = 'default',
}: Readonly<{
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  value: string;
  tone?: 'default' | 'positive' | 'attention' | 'danger';
}>) {
  const theme = useTogtTheme();
  const iconColour = tone === 'danger'
    ? theme.colors.error
    : tone === 'attention'
      ? theme.colors.attention
      : theme.colors.actionPrimary;
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} style={[styles.definitionRow, { columnGap: theme.spacing.sm, paddingVertical: theme.spacing.xs }]}>
      <MaterialCommunityIcons color={iconColour} name={icon} size={theme.sizing.iconMedium} />
      <View style={styles.flex}>
        <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>{label}</Text>
        <Text allowFontScaling selectable style={[theme.typography.body, { color: theme.colors.text }]}>{value}</Text>
      </View>
    </View>
  );
}

export function PriceEvidenceSummary({ price }: Readonly<{ price: PriceEvidence }>) {
  const theme = useTogtTheme();
  const values = price.kind === 'fixed'
    ? [formatProjectMoney(price.total), price.label]
    : price.kind === 'recorded_total'
      ? [formatProjectMoney(price.total), price.label]
    : price.kind === 'hourly'
      ? [
          `${formatProjectMoney(price.rate)} per hour`,
          price.estimatedTotal
            ? `${formatProjectMoney(price.estimatedTotal.min)}–${formatProjectMoney(price.estimatedTotal.max)} estimated`
            : 'Estimate unavailable',
          price.approvalCap ? `${formatProjectMoney(price.approvalCap)} approval cap` : 'Approval cap unavailable',
        ]
      : price.kind === 'quote'
        ? [
            formatProjectMoney(price.total),
            `Quote version ${price.quoteVersion}`,
            ...(price.expiresAt ? [`Expires ${price.expiresAt}`] : []),
          ]
        : price.kind === 'diagnostic'
          ? [formatProjectMoney(price.visitTotal), price.deliverable, 'Later work is not included']
          : ['Final price is not available yet'];
  return (
    <View accessible accessibilityLabel={values.join('. ')}>
      {values.map((value, index) => (
        <Text
          allowFontScaling
          key={`${index}-${value}`}
          style={[index === 0 ? theme.typography.numeric : theme.typography.caption, { color: index === 0 ? theme.colors.text : theme.colors.textSecondary }]}
        >
          {value}
        </Text>
      ))}
    </View>
  );
}

export function VerificationList({ evidence }: Readonly<{ evidence: readonly VerificationEvidence[] }>) {
  const theme = useTogtTheme();
  if (evidence.length === 0) {
    return (
      <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>
        No verification evidence is available for this card.
      </Text>
    );
  }
  return (
    <View style={{ rowGap: theme.spacing.xs }}>
      {evidence.map((item) => (
        <View key={item.id} style={[styles.inline, { columnGap: theme.spacing.xs }]}>
          <MaterialCommunityIcons
            color={item.status === 'verified' ? theme.colors.success : item.status === 'pending' ? theme.colors.attention : theme.colors.textSecondary}
            name={item.status === 'verified' ? 'check-decagram-outline' : item.status === 'pending' ? 'clock-outline' : 'information-outline'}
            size={theme.sizing.iconSmall}
          />
          <View style={styles.flex}>
            <Text allowFontScaling style={[theme.typography.label, { color: theme.colors.text }]}>{item.label}</Text>
            <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>{item.detail}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export type WorkerChoiceCardProps = Readonly<{
  worker: WorkerChoice;
  actionLabel: string;
  actionHint: string;
  disabled: boolean;
  selected: boolean;
  onPress: (worker: WorkerChoice) => void;
  onProfile: (worker: WorkerChoice) => void;
}>;

export function WorkerChoiceCard({ worker, actionLabel, actionHint, disabled, selected, onPress, onProfile }: WorkerChoiceCardProps) {
  const theme = useTogtTheme();
  const ratingLabel = worker.rating
    ? customerProjectMessage('worker.reviews', { rating: worker.rating.average.toFixed(1), count: worker.rating.count })
    : customerProjectMessage('worker.new');
  return (
    <Surface
      accessibilityLabel={`${worker.displayName}, ${worker.serviceLabel}`}
      elevation="card"
      selected={selected}
      style={{ rowGap: theme.spacing.md }}
      testID={`worker-choice-${worker.workerId}`}
    >
      <View style={[styles.workerHeader, { columnGap: theme.spacing.md }]}>
        {isSafeRemoteImageUrl(worker.photoUrl) ? (
          <Image accessibilityLabel={`${worker.displayName} profile photo`} source={{ uri: worker.photoUrl }} style={[styles.avatar, { borderRadius: theme.radius.pill }]} />
        ) : (
          <View accessibilityLabel={`${worker.displayName} branded profile placeholder`} style={[styles.avatarFallback, { backgroundColor: theme.colors.surfacePositive, borderRadius: theme.radius.pill }]}>
            <MaterialCommunityIcons color={theme.colors.actionPrimary} name="account-outline" size={theme.sizing.iconLarge} />
          </View>
        )}
        <View style={styles.flex}>
          <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>{worker.displayName}</Text>
        </View>
      </View>

      <VerificationList evidence={worker.verification} />
      <DefinitionRow icon="briefcase-outline" label="Service" value={worker.serviceLabel} />
      {worker.availabilityLabel ? <DefinitionRow icon="calendar-clock-outline" label={customerProjectMessage('worker.availability')} value={worker.availabilityLabel} /> : null}
      <View>
        <Text allowFontScaling style={[theme.typography.label, { color: theme.colors.text }]}>{customerProjectMessage('worker.price')}</Text>
        <PriceEvidenceSummary price={worker.price} />
      </View>
      <View style={[styles.wrap, { gap: theme.spacing.xs }]}>
        <Chip label={ratingLabel} tone={worker.rating ? 'attention' : 'neutral'} />
        {worker.completedJobs !== null ? <Chip label={customerProjectMessage('worker.completed', { count: worker.completedJobs })} /> : null}
        {worker.distanceLabel ? <Chip label={worker.distanceLabel} /> : null}
        {worker.reliabilityLabel ? <Chip label={worker.reliabilityLabel} /> : null}
        {worker.serviceAreaLabel ? <Chip label={worker.serviceAreaLabel} /> : null}
      </View>
      {worker.whyMatch ? (
        <View>
          <Text allowFontScaling style={[theme.typography.label, { color: theme.colors.text }]}>{customerProjectMessage('worker.whyMatch')}</Text>
          <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{worker.whyMatch}</Text>
        </View>
      ) : null}
      <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>
        {worker.selectionKind === 'reservable_slot'
          ? customerProjectMessage('matching.reservableTruth')
          : customerProjectMessage('matching.requestTruth')}
      </Text>
      <View style={[styles.actionRow, { gap: theme.spacing.sm }]}>
        <Button label={customerProjectMessage('common.viewDetails')} onPress={() => onProfile(worker)} variant="secondary" />
        <Button accessibilityHint={actionHint} disabled={disabled} label={actionLabel} onPress={() => onPress(worker)} style={styles.flex} />
      </View>
    </Surface>
  );
}

export function ProjectCard({
  project,
  onOpen,
  onReschedule,
  onCancel,
}: Readonly<{
  project: ProjectListItem;
  onOpen: (project: ProjectListItem) => void;
  onReschedule: (project: ProjectListItem) => void;
  onCancel: (project: ProjectListItem) => void;
}>) {
  const theme = useTogtTheme();
  return (
    <Surface
      accessibilityLabel={`${project.serviceLabel}, ${project.operationalLabel}`}
      elevation="card"
      style={{ rowGap: theme.spacing.sm }}
      testID={`project-card-${project.projectId}`}
    >
      <View style={styles.splitRow}>
        <View style={styles.flex}>
          <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>{project.serviceLabel}</Text>
          <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{project.workerName ?? customerProjectMessage('projects.workerPending')}</Text>
        </View>
        <StatusPill label={project.operationalLabel} tone={project.segment === 'past' ? 'complete' : project.segment === 'upcoming' ? 'pending' : 'inProgress'} />
      </View>
      <DefinitionRow icon="calendar-blank-outline" label={segmentLabel(project.segment)} value={project.scheduleLabel} />
      <DefinitionRow icon="map-marker-outline" label="Area" value={project.areaLabel} />
      <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>
        {customerProjectMessage('projects.payment', { status: project.paymentStatus.replaceAll('_', ' ') })}
      </Text>
      <Button
        accessibilityHint="Opens the authoritative Project Hub."
        label="View Project"
        onPress={() => onOpen(project)}
        variant="secondary"
      />
      {project.segment === 'upcoming' && (project.canReschedule || project.canCancel) ? (
        <View style={[styles.actionRow, { gap: theme.spacing.sm }]}>
          {project.canReschedule ? <Button label={customerProjectMessage('projects.reschedule')} onPress={() => onReschedule(project)} variant="secondary" /> : null}
          {project.canCancel ? <Button label={customerProjectMessage('projects.cancel')} onPress={() => onCancel(project)} variant="tertiary" /> : null}
        </View>
      ) : null}
    </Surface>
  );
}

export function TimelineView({ events }: Readonly<{ events: readonly TimelineEvent[] }>) {
  const theme = useTogtTheme();
  if (events.length === 0) {
    return <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>No timeline events are available.</Text>;
  }
  return (
    <View accessibilityRole="list" style={{ rowGap: theme.spacing.sm }}>
      {events.map((event) => (
        <View accessibilityLabel={`${event.label}, ${event.status}, ${event.occurredAt}`} accessibilityRole="summary" key={event.eventId} style={[styles.timelineRow, { columnGap: theme.spacing.sm }]}>
          <MaterialCommunityIcons
            color={event.status === 'issue' ? theme.colors.error : event.status === 'current' ? theme.colors.actionPrimary : theme.colors.textSecondary}
            name={event.status === 'complete' ? 'check-circle' : event.status === 'issue' ? 'alert-circle' : event.status === 'current' ? 'circle-slice-8' : 'circle-outline'}
            size={theme.sizing.iconSmall}
          />
          <View style={styles.flex}>
            <Text allowFontScaling style={[theme.typography.label, { color: theme.colors.text }]}>{event.label}</Text>
            {event.detail ? <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{event.detail}</Text> : null}
            <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>{event.occurredAt}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export function TravelPanel({ view }: Readonly<{ view: TravelView }>) {
  const theme = useTogtTheme();
  const tone = view.kind === 'live' ? 'positive' : view.kind === 'stale' ? 'attention' : 'subtle';
  return (
    <Surface accessibilityLabel={`${view.title}. ${view.body}`} style={{ rowGap: theme.spacing.sm }} variant={tone}>
      <View style={[styles.inline, { columnGap: theme.spacing.sm }]}>
        <MaterialCommunityIcons
          color={view.kind === 'live' ? theme.colors.success : theme.colors.textSecondary}
          name={view.kind === 'live' ? 'map-marker-radius-outline' : 'map-marker-off-outline'}
          size={theme.sizing.iconLarge}
        />
        <View style={styles.flex}>
          <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>{view.title}</Text>
          <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{view.body}</Text>
        </View>
      </View>
      {view.etaLabel ? <StatusPill label={view.etaLabel} tone="inProgress" /> : null}
      {view.timestampLabel ? (
        <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>
          {customerProjectMessage('travel.lastUpdated', { timestamp: view.timestampLabel })}
        </Text>
      ) : null}
    </Surface>
  );
}

export function MoneyDefinition({ label, value }: Readonly<{ label: string; value: MoneyAmount | null }>) {
  return <DefinitionRow icon="cash" label={label} value={formatProjectMoney(value)} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centredState: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  definitionRow: { alignItems: 'flex-start', flexDirection: 'row' },
  inline: { alignItems: 'flex-start', flexDirection: 'row' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  workerHeader: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap' },
  avatar: { height: 64, width: 64 },
  avatarFallback: { alignItems: 'center', height: 64, justifyContent: 'center', width: 64 },
  actionRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap' },
  splitRow: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap' },
  timelineRow: { alignItems: 'flex-start', flexDirection: 'row' },
});
