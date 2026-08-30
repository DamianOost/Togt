import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTogtTheme } from '../../design';
import {
  AppScaffold,
  Button,
  Chip,
  SectionHeader,
  StatusPill,
  Surface,
  TopAppBar,
} from '../../ui';
import type {
  RecurringOccurrenceDto,
  RecurringSeriesDto,
  RecurringTermsDto,
  TrustRole,
} from '../../services/groundedTrust';
import { TrustDefinitionRow, TrustHero, TruthList, TruthNotice } from './components';
import { acceptedCurrentTerms, deriveRecurringSeriesActions } from './model';
import type { ConnectionState } from './model';

export type RecurringSeriesScreenProps = Readonly<{
  series: RecurringSeriesDto;
  actorRole: TrustRole;
  connectionState: ConnectionState;
  counterpartyRequestEvidence: Readonly<{
    resume: boolean;
    cancellation: boolean;
  }>;
  pendingAction: string | null;
  onBack: () => void;
  onAcceptTerms: () => void;
  onProposeTerms: () => void;
  onPauseSeries: () => void;
  onRequestResume: () => void;
  onAcceptResume: () => void;
  onRequestCancelSeries: () => void;
  onAcceptCancelSeries: () => void;
  onOpenOccurrence: (occurrence: RecurringOccurrenceDto) => void;
}>;

function TermsPanel({ title, terms, series, actorRole }: Readonly<{
  title: string;
  terms: RecurringTermsDto;
  series: RecurringSeriesDto;
  actorRole: TrustRole;
}>) {
  const theme = useTogtTheme();
  const actorAccepted = acceptedCurrentTerms(series, actorRole) && (series.proposedTerms ?? series.currentTerms)?.revision === terms.revision;
  const counterpartRole = actorRole === 'customer' ? 'worker' : 'customer';
  const counterpartAccepted = series.acceptances.some((acceptance) => (
    acceptance.participantRole === counterpartRole && acceptance.termsRevision === terms.revision
  ));
  return (
    <Surface elevation="card" style={{ gap: theme.spacing.sm }}>
      <View style={styles.splitRow}>
        <View style={styles.flex}>
          <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>{title}</Text>
          <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>Terms revision {terms.revision} · proposed by {terms.proposedByRole}</Text>
        </View>
        <Chip label={`Revision ${terms.revision}`} tone="brand" />
      </View>
      <TrustDefinitionRow icon="tools" label="Service" value={`${terms.service.label} · version ${terms.service.version}`} />
      <TrustDefinitionRow icon="calendar-range-outline" label="Series plan" value={`${terms.schedule.occurrences.length} occurrences · ${terms.schedule.timezone}`} />
      <TrustDefinitionRow
        icon="account-switch-outline"
        label="Substitution"
        value={terms.substitutionPolicy === 'no_substitution' ? 'No substitution' : 'Explicit approval each time'}
      />
      <TrustDefinitionRow
        icon="cash-sync"
        label="Commercial snapshot"
        value={terms.commercial.customerTotalAmount
          ? `${terms.commercial.currency} ${terms.commercial.customerTotalAmount} · current terms snapshot`
          : 'Amount unavailable · must be reconfirmed before booking'}
      />
      <View style={[styles.wrap, { gap: theme.spacing.xs }]}>
        <Chip label={actorAccepted ? 'You accepted' : 'Your acceptance needed'} tone={actorAccepted ? 'brand' : 'attention'} />
        <Chip label={counterpartAccepted ? 'Counterpart accepted' : 'Counterpart acceptance needed'} tone={counterpartAccepted ? 'brand' : 'attention'} />
      </View>
      <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>Rate changes require a new mutually accepted terms revision.</Text>
    </Surface>
  );
}

export function RecurringSeriesScreen({
  series,
  actorRole,
  connectionState,
  counterpartyRequestEvidence,
  pendingAction,
  onBack,
  onAcceptTerms,
  onProposeTerms,
  onPauseSeries,
  onRequestResume,
  onAcceptResume,
  onRequestCancelSeries,
  onAcceptCancelSeries,
  onOpenOccurrence,
}: RecurringSeriesScreenProps) {
  const theme = useTogtTheme();
  const actions = deriveRecurringSeriesActions(series, actorRole, connectionState);
  const terms = series.proposedTerms ?? series.currentTerms;
  const readOnly = series.status === 'blocked' || series.status === 'cancelled';
  const statusTone = series.status === 'active'
    ? 'available'
    : series.status === 'blocked' || series.status === 'cancelled'
      ? 'error'
      : 'pending';
  return (
    <AppScaffold
      contentContainerStyle={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.xxxl, paddingTop: theme.spacing.md }}
      scrollable
      testID="recurring-series-screen"
      topBar={<TopAppBar onBack={onBack} subtitle={`Series revision ${series.revision}`} title="Recurring work" />}
    >
      <TrustHero
        body="One mutually accepted series. Every occurrence stays distinct and still needs its own booking confirmation."
        eyebrow="Bilateral terms"
        icon="calendar-sync-outline"
        title={series.participants.worker.displayName}
      />

      <Surface style={{ gap: theme.spacing.sm }}>
        <View style={styles.splitRow}>
          <View style={styles.flex}>
            <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>Series state</Text>
            <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>Source Project {series.sourceProjectReference}</Text>
          </View>
          <StatusPill label={series.status.replaceAll('_', ' ')} tone={statusTone} />
        </View>
        <TruthList statements={[
          'Mutual acceptance is required for the same terms revision',
          'Occurrence and whole-series decisions are distinct',
          'Booking creation is not automatic',
          'Each occurrence requires booking confirmation',
          'Substitution is never automatic',
        ]} />
      </Surface>

      {terms ? <TermsPanel actorRole={actorRole} series={series} terms={terms} title={series.proposedTerms ? 'Proposed terms' : 'Current terms'} /> : (
        <TruthNotice body="No supported terms revision is available. Refresh before acting." icon="file-alert-outline" title="Terms unavailable" />
      )}

      <View style={{ gap: theme.spacing.sm }}>
        <SectionHeader subtitle={actions.explain} title="Series decisions" />
        <Surface elevation="card" style={{ gap: theme.spacing.sm }}>
          {actions.acceptTerms ? (
            <Button label="Accept these terms" loading={pendingAction === 'accept_terms'} onPress={onAcceptTerms} />
          ) : null}
          {!readOnly && terms ? <Button label="Propose revised terms" onPress={onProposeTerms} variant="secondary" /> : null}
          {actions.pause ? <Button label="Pause whole series" loading={pendingAction === 'pause'} onPress={onPauseSeries} variant="secondary" /> : null}
          {actions.requestResume ? <Button label="Request series resume" loading={pendingAction === 'request_resume'} onPress={onRequestResume} /> : null}
          {actions.acceptResume && counterpartyRequestEvidence.resume ? (
            <Button label="Accept counterpart resume request" loading={pendingAction === 'accept_resume'} onPress={onAcceptResume} />
          ) : null}
          {actions.requestCancelSeries ? (
            <Button label="Request whole-series cancellation" loading={pendingAction === 'request_cancel_series'} onPress={onRequestCancelSeries} variant="danger" />
          ) : null}
          {actions.acceptCancelSeries && counterpartyRequestEvidence.cancellation ? (
            <Button label="Accept counterpart cancellation request" loading={pendingAction === 'accept_cancel_series'} onPress={onAcceptCancelSeries} variant="danger" />
          ) : null}
          {readOnly ? <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>This series is read-only.</Text> : null}
        </Surface>
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <SectionHeader subtitle="Changing one occurrence does not pause, resume or cancel the whole series." title="Occurrences" />
        {series.occurrences.map((occurrence) => (
          <Surface
            accessibilityHint="Opens this occurrence without changing the whole series."
            elevation="card"
            key={occurrence.id}
            onPress={() => onOpenOccurrence(occurrence)}
            style={{ gap: theme.spacing.xs }}
          >
            <View style={styles.splitRow}>
              <View style={styles.flex}>
                <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>Occurrence {occurrence.sequence}</Text>
                <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{occurrence.scheduledAt}</Text>
              </View>
              <Chip label={occurrence.status.replaceAll('_', ' ')} tone={occurrence.status === 'completed' ? 'brand' : 'neutral'} />
            </View>
            <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>Terms revision {occurrence.termsRevision} · {occurrence.bookingReference ? 'Project reference available' : 'Booking confirmation still required'}</Text>
          </Surface>
        ))}
      </View>

      {connectionState === 'offline' ? <TruthNotice body="Reconnect before making any series or occurrence decision. Nothing is queued." icon="cloud-off-outline" title="Read-only while offline" /> : null}
    </AppScaffold>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  splitRow: { alignItems: 'flex-start', flexDirection: 'row' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
});

export default RecurringSeriesScreen;
