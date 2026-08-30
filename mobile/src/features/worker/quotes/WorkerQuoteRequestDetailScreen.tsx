import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTogtTheme } from '../../../design';
import type { WorkerQuoteRequestDetail } from '../../../data/grounded';
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
import { deriveWorkerQuoteActions } from './model';

export type WorkerQuoteDetailState =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'error'; title: string; message: string; correlationId: string | null }>
  | Readonly<{ status: 'ready'; value: WorkerQuoteRequestDetail }>;

export type WorkerQuoteRequestDetailScreenProps = Readonly<{
  state: WorkerQuoteDetailState;
  connection: 'online' | 'offline';
  onBack: () => void;
  onOpenBuilder: (requestId: string) => void;
  onRetry: () => void;
}>;

function formatDate(value: string | null): string {
  if (!value) return 'Not supplied';
  return new Intl.DateTimeFormat('en-ZA', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Johannesburg',
  }).format(new Date(value));
}

function FactRow({ icon, label, value }: Readonly<{ icon: 'map-marker-radius-outline' | 'calendar-clock-outline' | 'timer-sand' | 'shield-check-outline'; label: string; value: string }>) {
  const theme = useTogtTheme();
  return (
    <View style={[styles.factRow, { columnGap: theme.spacing.sm, paddingVertical: theme.spacing.xs }]}>
      <MaterialCommunityIcons color={theme.colors.actionPrimary} importantForAccessibility="no-hide-descendants" name={icon} size={theme.sizing.iconMedium} />
      <View style={styles.flex}>
        <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>{label}</Text>
        <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.text }]}>{value}</Text>
      </View>
    </View>
  );
}

function quoteTone(status: NonNullable<WorkerQuoteRequestDetail['ownQuote']>['status']): 'pending' | 'inProgress' | 'complete' | 'offline' {
  if (status === 'draft') return 'pending';
  if (status === 'submitted') return 'inProgress';
  if (status === 'accepted') return 'complete';
  return 'offline';
}

export function WorkerQuoteRequestDetailScreen({
  state,
  connection,
  onBack,
  onOpenBuilder,
  onRetry,
}: WorkerQuoteRequestDetailScreenProps) {
  const theme = useTogtTheme();
  if (state.status === 'loading') {
    return (
      <AppScaffold testID="worker-quote-request-detail-loading" topBar={<TopAppBar onBack={onBack} title="Request detail" />}>
        <View accessibilityRole="progressbar" style={styles.feedback}>
          <ActivityIndicator color={theme.colors.actionPrimary} size="large" />
        </View>
      </AppScaffold>
    );
  }
  if (state.status === 'error') {
    return (
      <AppScaffold testID="worker-quote-request-detail-error" topBar={<TopAppBar onBack={onBack} title="Request detail" />}>
        <ScreenError actionLabel="Retry" body={state.message} {...(state.correlationId ? { correlationId: state.correlationId } : {})} onAction={onRetry} title={state.title} />
      </AppScaffold>
    );
  }
  const detail = state.value;
  const request = detail.request;
  const actions = deriveWorkerQuoteActions({ request, quote: detail.ownQuote, connection });
  const credentials = [
    ...(request.service.identityVerificationRequired ? ['Identity verification'] : []),
    ...request.service.credentialIds.map((id) => id.replace(/[_.:-]+/g, ' ')),
  ];
  const actionLabel = detail.ownQuote === null
    ? 'Build quote'
    : actions.readOnly
      ? 'View quote'
      : 'Edit quote';
  return (
    <AppScaffold
      bottomAction={actions.canOpenBuilder ? (
        <Button fullWidth label={actionLabel} large onPress={() => onOpenBuilder(request.id)} />
      ) : undefined}
      contentContainerStyle={{ paddingBottom: theme.spacing.xxxxl, paddingTop: theme.spacing.md }}
      scrollable
      testID="worker-quote-request-detail-screen"
      topBar={<TopAppBar onBack={onBack} title="Request detail" />}
    >
      <View style={{ rowGap: theme.spacing.xl }}>
        {connection === 'offline' ? <OfflineBanner message="Showing verified request evidence already loaded on this screen. Reconnect before changing a quote." /> : null}
        <Surface elevation="card" variant="inverse">
          <View style={{ rowGap: theme.spacing.sm }}>
            <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h1, { color: theme.colors.textInverse }]}>
              {request.service.label}
            </Text>
            <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.textInverse, opacity: theme.opacity.muted }]}>
              A structured request in {request.broadAreaLabel}. Exact address and customer contact remain hidden.
            </Text>
            {detail.ownQuote ? (
              <StatusPill label={`Your quote · ${detail.ownQuote.status} · v${detail.ownQuote.version}`} tone={quoteTone(detail.ownQuote.status)} />
            ) : <StatusPill label="No quote started" tone="pending" />}
          </View>
        </Surface>

        <Surface>
          <FactRow icon="map-marker-radius-outline" label="Broad area" value={request.broadAreaLabel} />
          <FactRow icon="calendar-clock-outline" label="Requested window" value={`${formatDate(request.startsAt)}${request.endsAt ? ` – ${formatDate(request.endsAt)}` : ''}`} />
          <FactRow icon="timer-sand" label="Questions deadline" value={formatDate(request.questionsDeadlineAt)} />
          <FactRow icon="timer-sand" label="Quote expiry" value={formatDate(request.quotesCloseAt)} />
          <FactRow icon="shield-check-outline" label="Required evidence" value={credentials.length > 0 ? credentials.join(', ') : 'No additional credential requirement returned'} />
        </Surface>

        <View>
          <SectionHeader subtitle="Customer-provided content is sanitised before Workers can read it." title="Structured brief" />
          <Surface style={{ marginTop: theme.spacing.sm }}>
            {request.brief.summary ? (
              <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.text }]}>{request.brief.summary}</Text>
            ) : null}
            {request.brief.answers.map((answer) => (
              <View key={answer.questionId} style={{ marginTop: theme.spacing.md }}>
                <Text allowFontScaling style={[theme.typography.label, { color: theme.colors.textSecondary }]}>{answer.label}</Text>
                <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.text, marginTop: theme.spacing.xxs }]}>{answer.value}</Text>
              </View>
            ))}
            {request.brief.mediaCount > 0 ? (
              <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: theme.spacing.md }]}>
                {request.brief.mediaCount} image {request.brief.mediaCount === 1 ? 'reference' : 'references'} supplied. Media identifiers are not displayed.
              </Text>
            ) : null}
            {!request.brief.summary && request.brief.answers.length === 0 && request.brief.mediaCount === 0 ? (
              <EmptyState body="The customer did not supply additional brief content." title="No additional detail" />
            ) : null}
          </Surface>
        </View>

        {request.flexibility ? (
          <Surface variant="subtle">
            <Text allowFontScaling style={[theme.typography.label, { color: theme.colors.text }]}>Schedule flexibility</Text>
            <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary, marginTop: theme.spacing.xxs }]}>{request.flexibility}</Text>
          </Surface>
        ) : null}

        <Surface variant="attention">
          <Text allowFontScaling style={[theme.typography.label, { color: theme.colors.text }]}>Clarification thread unavailable</Text>
          <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary, marginTop: theme.spacing.xxs }]}>
            This build does not offer customer messaging before a quote is selected. No unsupported question action is shown.
          </Text>
        </Surface>
        {actions.reason ? (
          <Surface variant="subtle">
            <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{actions.reason}</Text>
          </Surface>
        ) : null}
      </View>
    </AppScaffold>
  );
}

const styles = StyleSheet.create({
  factRow: { alignItems: 'flex-start', flexDirection: 'row' },
  feedback: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  flex: { flex: 1 },
});

export default WorkerQuoteRequestDetailScreen;
