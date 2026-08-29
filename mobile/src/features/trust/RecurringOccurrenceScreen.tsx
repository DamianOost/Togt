import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTogtTheme } from '../../design';
import {
  AppScaffold,
  Button,
  Chip,
  SectionHeader,
  Surface,
  TextField,
  TopAppBar,
} from '../../ui';
import type {
  RecurringOccurrenceChangeDto,
  RecurringOccurrenceDto,
  RecurringSeriesDto,
  TrustRole,
} from '../../services/groundedTrust';
import { TrustDefinitionRow, TrustHero, TruthNotice } from './components';
import { deriveOccurrenceDecision } from './model';
import type { ConnectionState } from './model';

export type RecurringOccurrenceScreenProps = Readonly<{
  series: RecurringSeriesDto;
  occurrence: RecurringOccurrenceDto;
  actorRole: TrustRole;
  connectionState: ConnectionState;
  changeKind: 'reschedule' | 'cancel' | null;
  proposedScheduledAt: string;
  pendingAction: string | null;
  onBack: () => void;
  onChangeKind: (kind: 'reschedule' | 'cancel') => void;
  onProposedScheduledAtChange: (value: string) => void;
  onRequestOccurrenceChange: (input: Readonly<{ changeKind: 'reschedule' | 'cancel'; proposedScheduledAt?: string }>) => void;
  onAcceptOccurrenceChange: (change: RecurringOccurrenceChangeDto) => void;
  onDeclineOccurrenceChange: (change: RecurringOccurrenceChangeDto) => void;
}>;

export function RecurringOccurrenceScreen({
  series,
  occurrence,
  actorRole,
  connectionState,
  changeKind,
  proposedScheduledAt,
  pendingAction,
  onBack,
  onChangeKind,
  onProposedScheduledAtChange,
  onRequestOccurrenceChange,
  onAcceptOccurrenceChange,
  onDeclineOccurrenceChange,
}: RecurringOccurrenceScreenProps) {
  const theme = useTogtTheme();
  const decision = deriveOccurrenceDecision(series, occurrence, actorRole, connectionState);
  const canSend = decision.canRequestChange
    && changeKind !== null
    && (changeKind === 'cancel' || proposedScheduledAt.trim().length > 0);
  return (
    <AppScaffold
      contentContainerStyle={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.xxxl, paddingTop: theme.spacing.md }}
      keyboardAware
      scrollable
      testID="recurring-occurrence-screen"
      topBar={<TopAppBar onBack={onBack} subtitle={`Terms revision ${occurrence.termsRevision}`} title={`Occurrence ${occurrence.sequence}`} />}
    >
      <TrustHero
        body="A decision here changes this occurrence only. Whole-series status remains a separate bilateral decision."
        eyebrow="Single occurrence"
        icon="calendar-edit"
        title={occurrence.scheduledAt}
      />

      <Surface elevation="card" style={{ gap: theme.spacing.sm }}>
        <TrustDefinitionRow icon="progress-clock" label="Occurrence state" value={occurrence.status.replaceAll('_', ' ')} />
        <TrustDefinitionRow icon="file-sync-outline" label="Series revision" value={String(series.revision)} />
        <TrustDefinitionRow icon="file-document-outline" label="Terms revision" value={String(occurrence.termsRevision)} />
        <TruthNotice body={decision.bookingTruth} icon="briefcase-clock-outline" title="Booking truth" tone="positive" />
      </Surface>

      {decision.pendingChange ? (
        <Surface style={{ gap: theme.spacing.md }} variant="attention">
          <View style={[styles.row, { gap: theme.spacing.sm }]}>
            <MaterialCommunityIcons color={theme.colors.attention} name="calendar-question" size={theme.sizing.iconLarge} />
            <View style={styles.flex}>
              <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>Pending {decision.pendingChange.kind} request</Text>
              <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>Requested by {decision.pendingChange.requestedByRole}{decision.pendingChange.proposedScheduledAt ? ` · ${decision.pendingChange.proposedScheduledAt}` : ''}</Text>
            </View>
          </View>
          {decision.canAcceptChange ? (
            <Button
              label="Accept occurrence change"
              loading={pendingAction === 'accept_occurrence_change'}
              onPress={() => decision.pendingChange && onAcceptOccurrenceChange(decision.pendingChange)}
            />
          ) : null}
          {decision.canDeclineChange ? (
            <Button
              label="Decline occurrence change"
              loading={pendingAction === 'decline_occurrence_change'}
              onPress={() => decision.pendingChange && onDeclineOccurrenceChange(decision.pendingChange)}
              variant="secondary"
            />
          ) : null}
          {!decision.canAcceptChange ? (
            <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>Waiting for the counterpart’s decision. The requester cannot accept their own change.</Text>
          ) : null}
        </Surface>
      ) : (
        <View style={{ gap: theme.spacing.sm }}>
          <SectionHeader subtitle="The counterpart must explicitly accept. No whole-series state changes." title="Request an occurrence change" />
          <View style={[styles.wrap, { gap: theme.spacing.xs }]}>
            <Chip disabled={!decision.canRequestChange} label="Reschedule this occurrence" onPress={() => onChangeKind('reschedule')} selected={changeKind === 'reschedule'} tone="brand" />
            <Chip disabled={!decision.canRequestChange} label="Cancel this occurrence" onPress={() => onChangeKind('cancel')} selected={changeKind === 'cancel'} tone="danger" />
          </View>
          {changeKind === 'reschedule' ? (
            <TextField
              disabled={!decision.canRequestChange}
              helperText="Propose a new time. It does not apply until the counterpart accepts."
              label="Proposed date and time"
              onChangeText={onProposedScheduledAtChange}
              value={proposedScheduledAt}
            />
          ) : null}
          <Button
            disabled={!canSend}
            label="Send occurrence change request"
            loading={pendingAction === 'request_occurrence_change'}
            onPress={() => changeKind && onRequestOccurrenceChange({
              changeKind,
              ...(changeKind === 'reschedule' ? { proposedScheduledAt } : {}),
            })}
          />
        </View>
      )}

      <TruthNotice
        body="occurrenceAndWholeSeriesAreDistinct is true. This screen never pauses, resumes or cancels the whole series."
        icon="call-split"
        title="Narrow change boundary"
      />
      {connectionState === 'offline' ? <TruthNotice body="Reconnect before requesting or deciding a change. Nothing is queued." icon="cloud-off-outline" title="Read-only while offline" /> : null}
    </AppScaffold>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { alignItems: 'flex-start', flexDirection: 'row' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
});

export default RecurringOccurrenceScreen;
