import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTogtTheme } from '../../../design';
import type { WorkerQuoteRequest } from '../../../data/grounded';
import {
  AppScaffold,
  EmptyState,
  OfflineBanner,
  ScreenError,
  StatusPill,
  Surface,
  TopAppBar,
} from '../../../ui';

export type WorkerQuoteRequestListState =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'error'; title: string; message: string; correlationId: string | null }>
  | Readonly<{ status: 'ready'; value: readonly WorkerQuoteRequest[] }>;

export type WorkerQuoteRequestsScreenProps = Readonly<{
  state: WorkerQuoteRequestListState;
  connection: 'online' | 'offline';
  onBack: () => void;
  onOpenRequest: (requestId: string) => void;
  onRetry: () => void;
}>;

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-ZA', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Johannesburg',
  }).format(new Date(value));
}

function statusTone(status: WorkerQuoteRequest['status']): 'available' | 'inProgress' | 'complete' | 'offline' {
  if (status === 'open') return 'available';
  if (status === 'receiving') return 'inProgress';
  if (status === 'selected') return 'complete';
  return 'offline';
}

function statusLabel(status: WorkerQuoteRequest['status']): string {
  return status === 'no_quotes' ? 'No quotes' : status.replace('_', ' ').replace(/^\w/, (letter) => letter.toUpperCase());
}

export function WorkerQuoteRequestsScreen({
  state,
  connection,
  onBack,
  onOpenRequest,
  onRetry,
}: WorkerQuoteRequestsScreenProps) {
  const theme = useTogtTheme();
  return (
    <AppScaffold
      contentContainerStyle={{ paddingBottom: theme.spacing.xxxxl, paddingTop: theme.spacing.md }}
      scrollable
      testID="worker-quote-requests-screen"
      topBar={<TopAppBar onBack={onBack} title="Quote requests" />}
    >
      <View style={{ rowGap: theme.spacing.lg }}>
        <View style={{ rowGap: theme.spacing.xs }}>
          <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h1, { color: theme.colors.text }]}>
            Work that needs a quote
          </Text>
          <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.textSecondary }]}>
            Only eligible requests are shown. Customer identity, contact details and exact address stay private.
          </Text>
        </View>
        {connection === 'offline' ? (
          <OfflineBanner message="Reconnect to load current eligible requests. Quote changes are never queued offline." onRetry={onRetry} />
        ) : null}
        {state.status === 'loading' ? (
          <View accessibilityRole="progressbar" style={styles.feedback}>
            <ActivityIndicator color={theme.colors.actionPrimary} size="large" />
            <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.textSecondary, marginTop: theme.spacing.sm }]}>
              Loading eligible requests…
            </Text>
          </View>
        ) : state.status === 'error' ? (
          <ScreenError
            actionLabel="Retry"
            body={state.message}
            {...(state.correlationId ? { correlationId: state.correlationId } : {})}
            onAction={onRetry}
            title={state.title}
          />
        ) : state.value.length === 0 ? (
          <EmptyState
            body="There are no server-confirmed quote requests for your active services right now."
            title="No eligible requests"
          />
        ) : (
          <View style={{ rowGap: theme.spacing.sm }}>
            {state.value.map((request) => (
              <Surface
                accessibilityHint="Open the privacy-safe request detail"
                accessibilityLabel={`${request.service.label}, ${request.broadAreaLabel}`}
                elevation="card"
                key={request.id}
                onPress={() => onOpenRequest(request.id)}
                testID={`worker-quote-request-${request.id}`}
              >
                <View style={[styles.row, { columnGap: theme.spacing.sm }]}>
                  <View style={[styles.iconWell, {
                    backgroundColor: theme.colors.surfacePositive,
                    borderRadius: theme.radius.input,
                    height: theme.sizing.touchTarget,
                    width: theme.sizing.touchTarget,
                  }]}
                  >
                    <MaterialCommunityIcons
                      color={theme.colors.actionPrimary}
                      importantForAccessibility="no-hide-descendants"
                      name="file-document-edit-outline"
                      size={theme.sizing.iconMedium}
                    />
                  </View>
                  <View style={styles.flex}>
                    <View style={[styles.row, styles.wrap, { columnGap: theme.spacing.xs, rowGap: theme.spacing.xs }]}>
                      <Text allowFontScaling style={[theme.typography.h3, styles.flex, { color: theme.colors.text }]}>
                        {request.service.label}
                      </Text>
                      <StatusPill label={statusLabel(request.status)} tone={statusTone(request.status)} />
                    </View>
                    <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary, marginTop: theme.spacing.xs }]}>
                      {request.broadAreaLabel} · Requested {formatDate(request.startsAt)}
                    </Text>
                    <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: theme.spacing.xxs }]}>
                      Quotes close {formatDate(request.quotesCloseAt)}
                    </Text>
                  </View>
                  <MaterialCommunityIcons
                    color={theme.colors.textSecondary}
                    importantForAccessibility="no-hide-descendants"
                    name="chevron-right"
                    size={theme.sizing.iconMedium}
                  />
                </View>
              </Surface>
            ))}
          </View>
        )}
      </View>
    </AppScaffold>
  );
}

const styles = StyleSheet.create({
  feedback: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  flex: { flex: 1 },
  iconWell: { alignItems: 'center', justifyContent: 'center' },
  row: { alignItems: 'center', flexDirection: 'row' },
  wrap: { flexWrap: 'wrap' },
});

export default WorkerQuoteRequestsScreen;
