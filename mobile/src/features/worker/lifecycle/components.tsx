import React from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTogtTheme } from '../../../design';
import {
  Button,
  EmptyState,
  OfflineBanner,
  ScreenError,
  StatusPill,
  Surface,
} from '../../../ui';
import { formatLifecycleMoney, workerLifecycleMessage } from './copy';
import { hasLedgerEvidence, hasServerEvidence } from './model';
import type {
  ConnectionState,
  LifecycleEvidence,
  LifecycleResourceState,
  WorkerJobCommercial,
  WorkerTimelineEvent,
} from './model';

export type LifecycleResourceProps<T> = Readonly<{
  resource: LifecycleResourceState<T>;
  connectionState: ConnectionState;
  onRetry: () => void;
  children: (value: T) => ReactNode;
}>;

export function LifecycleResource<T>({ resource, connectionState, onRetry, children }: LifecycleResourceProps<T>) {
  const theme = useTogtTheme();
  if (resource.status === 'loading') {
    return (
      <View accessibilityLabel={workerLifecycleMessage('state.loading')} accessibilityRole="progressbar" style={styles.centred}>
        <ActivityIndicator color={theme.colors.actionPrimary} size="large" />
        <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.textSecondary, marginTop: theme.spacing.md }]}>{workerLifecycleMessage('state.loading')}</Text>
      </View>
    );
  }
  if (resource.status === 'error') {
    return (
      <ScreenError
        actionLabel={workerLifecycleMessage('common.retry')}
        body={resource.message || workerLifecycleMessage('state.errorBody')}
        {...(resource.correlationId ? { correlationId: resource.correlationId } : {})}
        onAction={onRetry}
        title={resource.title || workerLifecycleMessage('state.errorTitle')}
      />
    );
  }
  if (resource.status === 'empty') {
    return <EmptyState body={resource.message || workerLifecycleMessage('state.empty')} title={resource.title} />;
  }
  return (
    <>
      {connectionState === 'offline' ? <OfflineBanner message={workerLifecycleMessage('common.offline')} onRetry={onRetry} /> : null}
      {children(resource.value)}
    </>
  );
}

export function LifecycleRow({
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
  const colour = tone === 'danger'
    ? theme.colors.error
    : tone === 'attention'
      ? theme.colors.attention
      : tone === 'positive'
        ? theme.colors.success
        : theme.colors.actionPrimary;
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} style={[styles.row, { gap: theme.spacing.sm, paddingVertical: theme.spacing.xs }]}>
      <MaterialCommunityIcons color={colour} name={icon} size={theme.sizing.iconMedium} />
      <View style={styles.flex}>
        <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>{label}</Text>
        <Text allowFontScaling selectable style={[theme.typography.body, { color: theme.colors.text }]}>{value}</Text>
      </View>
    </View>
  );
}

export function EvidenceValue<T>({
  evidence,
  label,
  render,
}: Readonly<{
  evidence: LifecycleEvidence<T>;
  label: string;
  render: (value: T) => string;
}>) {
  const theme = useTogtTheme();
  const value = hasServerEvidence(evidence) ? render(evidence.value) : evidence.explanation;
  return (
    <Surface style={{ gap: theme.spacing.xxs }} variant={hasServerEvidence(evidence) ? 'default' : 'subtle'}>
      <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>{label}</Text>
      <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.text }]}>{value}</Text>
    </Surface>
  );
}

export function Timeline({ events }: Readonly<{ events: readonly WorkerTimelineEvent[] }>) {
  const theme = useTogtTheme();
  if (events.length === 0) {
    return <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>No timeline events are available.</Text>;
  }
  return (
    <View accessibilityRole="list" style={{ gap: theme.spacing.sm }}>
      {events.map((event) => (
        <View accessibilityLabel={`${event.label}, ${event.state}`} accessibilityRole="summary" key={event.eventId} style={[styles.row, { gap: theme.spacing.sm }]}>
          <MaterialCommunityIcons
            color={event.state === 'issue' ? theme.colors.error : event.state === 'current' ? theme.colors.actionPrimary : theme.colors.textSecondary}
            name={event.state === 'complete' ? 'check-circle' : event.state === 'issue' ? 'alert-circle' : event.state === 'current' ? 'circle-slice-8' : 'circle-outline'}
            size={theme.sizing.iconSmall}
          />
          <View style={styles.flex}>
            <Text allowFontScaling style={[theme.typography.label, { color: theme.colors.text }]}>{event.label}</Text>
            {event.detail ? <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{event.detail}</Text> : null}
            {event.occurredAt ? <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>{event.occurredAt}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

export function CommercialEvidence({ evidence }: Readonly<{
  evidence: LifecycleEvidence<WorkerJobCommercial, 'server_ledger'>;
}>) {
  const theme = useTogtTheme();
  if (!hasLedgerEvidence(evidence)) {
    return (
      <Surface variant="subtle">
        <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{evidence.explanation}</Text>
      </Surface>
    );
  }
  const commercial = evidence.value;
  const consistent = commercial.gross.amountMinor - commercial.platformFee.amountMinor === commercial.expectedNet.amountMinor;
  if (!consistent) {
    return (
      <Surface variant="danger">
        <Text accessibilityRole="alert" allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.error }]}>Commercial evidence is inconsistent. Refresh before relying on these amounts.</Text>
      </Surface>
    );
  }
  return (
    <View style={{ gap: theme.spacing.xs }}>
      <LifecycleRow icon="cash" label={workerLifecycleMessage('job.gross')} value={formatLifecycleMoney(commercial.gross)} />
      <LifecycleRow icon="minus-circle-outline" label={workerLifecycleMessage('job.fee')} value={formatLifecycleMoney(commercial.platformFee)} />
      <LifecycleRow icon="cash-check" label={workerLifecycleMessage('job.net')} tone="positive" value={formatLifecycleMoney(commercial.expectedNet)} />
      <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>{commercial.ledgerDefinition} · {commercial.paymentState.replaceAll('_', ' ')}</Text>
    </View>
  );
}

export function LifecycleActionRow({ children }: Readonly<{ children: ReactNode }>) {
  const theme = useTogtTheme();
  return <View style={[styles.actions, { gap: theme.spacing.sm }]}>{children}</View>;
}

export function ReadOnlyNotice({ title, body }: Readonly<{ title: string; body: string }>) {
  const theme = useTogtTheme();
  return (
    <Surface style={{ gap: theme.spacing.xs }} variant="attention">
      <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>{title}</Text>
      <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{body}</Text>
    </Surface>
  );
}

export function RetryButton({ onPress }: Readonly<{ onPress: () => void }>) {
  return <Button label={workerLifecycleMessage('common.retry')} onPress={onPress} variant="secondary" />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centred: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  row: { alignItems: 'flex-start', flexDirection: 'row' },
  actions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap' },
});
