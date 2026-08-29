import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { CustomerOpenQuoteRequestSummary } from '../../../data/grounded';
import { useTogtTheme } from '../../../design';
import { AppScaffold, Surface, TopAppBar } from '../../../ui';
import { customerProjectMessage } from './copy';
import { ProjectScreenState } from './components';
import type { Loadable } from './model';

export type OpenQuoteRequestsScreenProps = Readonly<{
  requests: Loadable<readonly CustomerOpenQuoteRequestSummary[]>;
  onBack: () => void;
  onRetry: () => void;
  onOpenRequest: (requestId: string) => void;
}>;

function requestStatusLabel(status: CustomerOpenQuoteRequestSummary['status']): string {
  return customerProjectMessage(status === 'receiving' ? 'quoteRequests.receiving' : 'quoteRequests.open');
}

export function OpenQuoteRequestsScreen({
  requests,
  onBack,
  onRetry,
  onOpenRequest,
}: OpenQuoteRequestsScreenProps) {
  const theme = useTogtTheme();
  return (
    <AppScaffold
      contentContainerStyle={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.xxxl }}
      scrollable
      testID="open-quote-requests-screen"
      topBar={<TopAppBar onBack={onBack} title={customerProjectMessage('quoteRequests.title')} />}
    >
      <Surface elevation="card" testID="open-quote-requests-privacy" variant="positive">
        <View style={[styles.heroRow, { gap: theme.spacing.md }]}>
          <View
            importantForAccessibility="no-hide-descendants"
            style={[
              styles.heroIcon,
              {
                backgroundColor: theme.colors.actionPrimary,
                borderRadius: theme.radius.hero,
                height: theme.sizing.stateGlyph,
                width: theme.sizing.stateGlyph,
              },
            ]}
          >
            <MaterialCommunityIcons color={theme.colors.textInverse} name="clipboard-text-clock-outline" size={theme.sizing.iconLarge} />
          </View>
          <View style={styles.flex}>
            <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.actionPrimaryPressed }]}>
              {customerProjectMessage('quoteRequests.eyebrow')}
            </Text>
            <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h2, { color: theme.colors.text, marginTop: theme.spacing.xxs }]}>
              {customerProjectMessage('quoteRequests.heroTitle')}
            </Text>
            <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.textSecondary, marginTop: theme.spacing.xs }]}>
              {customerProjectMessage('quoteRequests.heroBody')}
            </Text>
          </View>
        </View>
        <View style={[styles.privacyRow, { gap: theme.spacing.xs, marginTop: theme.spacing.md }]}>
          <MaterialCommunityIcons color={theme.colors.actionPrimary} name="shield-lock-outline" size={theme.sizing.iconSmall} />
          <Text allowFontScaling style={[theme.typography.bodySmall, styles.flex, { color: theme.colors.textSecondary }]}>
            {customerProjectMessage('quoteRequests.privacy')}
          </Text>
        </View>
      </Surface>

      <ProjectScreenState
        emptyBody={customerProjectMessage('quoteRequests.emptyBody')}
        emptyTitle={customerProjectMessage('quoteRequests.emptyTitle')}
        errorBody={customerProjectMessage('error.quoteRequestsBody')}
        errorTitle={customerProjectMessage('error.quoteRequestsTitle')}
        loadingLabel={customerProjectMessage('loading.quoteRequests')}
        onRetry={onRetry}
        value={requests}
      >
        {(items) => (
          <View accessibilityRole="list" style={{ gap: theme.spacing.md }} testID="open-quote-requests-list">
            {items.map((request) => {
              const statusLabel = requestStatusLabel(request.status);
              return (
                <Surface
                  accessibilityHint={customerProjectMessage('quoteRequests.action')}
                  accessibilityLabel={`${request.serviceLabel}. ${statusLabel}. ${request.broadAreaLabel}. ${request.scheduleLabel}.`}
                  elevation="card"
                  key={request.requestId}
                  onPress={() => onOpenRequest(request.requestId)}
                  testID={`open-quote-request-${request.requestId}`}
                >
                  <View style={[styles.titleRow, { gap: theme.spacing.sm }]}>
                    <View style={styles.flex}>
                      <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>
                        {request.serviceLabel}
                      </Text>
                      <Text allowFontScaling style={[theme.typography.label, { color: theme.colors.actionPrimaryPressed, marginTop: theme.spacing.xxs }]}>
                        {statusLabel}
                      </Text>
                    </View>
                    <MaterialCommunityIcons color={theme.colors.actionPrimary} name="chevron-right" size={theme.sizing.iconMedium} />
                  </View>
                  <RequestFact icon="map-marker-radius-outline" label={customerProjectMessage('quoteRequests.area')} value={request.broadAreaLabel} />
                  <RequestFact icon="calendar-clock-outline" label={customerProjectMessage('quoteRequests.schedule')} value={request.scheduleLabel} />
                  <RequestFact icon="timer-sand" label={customerProjectMessage('quoteRequests.closes')} value={request.quotesCloseLabel} />
                  <Text allowFontScaling style={[theme.typography.label, { color: theme.colors.actionPrimary, marginTop: theme.spacing.sm }]}>
                    {customerProjectMessage('quoteRequests.action')}
                  </Text>
                </Surface>
              );
            })}
          </View>
        )}
      </ProjectScreenState>
    </AppScaffold>
  );
}

function RequestFact({
  icon,
  label,
  value,
}: Readonly<{
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  value: string;
}>) {
  const theme = useTogtTheme();
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} style={[styles.factRow, { gap: theme.spacing.sm, marginTop: theme.spacing.sm }]}>
      <MaterialCommunityIcons color={theme.colors.actionPrimary} name={icon} size={theme.sizing.iconSmall} />
      <Text allowFontScaling style={[theme.typography.bodySmall, styles.flex, { color: theme.colors.textSecondary }]}>
        <Text allowFontScaling style={[theme.typography.label, { color: theme.colors.text }]}>{label}: </Text>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  factRow: { alignItems: 'center', flexDirection: 'row' },
  flex: { flex: 1 },
  heroIcon: { alignItems: 'center', justifyContent: 'center' },
  heroRow: { alignItems: 'flex-start', flexDirection: 'row' },
  privacyRow: { alignItems: 'flex-start', flexDirection: 'row' },
  titleRow: { alignItems: 'center', flexDirection: 'row' },
});

export default OpenQuoteRequestsScreen;
