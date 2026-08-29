import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTogtTheme } from '../../design';
import type { RecommendationExplanationV1 } from '../../data/grounded/intelligence';
import type { IntelligenceCapabilityState } from '../../services/groundedIntelligence';
import {
  AppScaffold,
  Button,
  Chip,
  ScreenError,
  SectionHeader,
  Surface,
  TopAppBar,
} from '../../ui';

export type RecommendationResource =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'error'; message: string; correlationId: string | null }>
  | Readonly<{ status: 'ready'; value: RecommendationExplanationV1 }>;

export type RecommendationExplanationScreenProps = Readonly<{
  capability: IntelligenceCapabilityState | null;
  resource: RecommendationResource;
  onBack: () => void;
  onRetry: () => void;
  onCompareWorkers: () => void;
}>;

export function RecommendationExplanationScreen({
  capability,
  resource,
  onBack,
  onRetry,
  onCompareWorkers,
}: RecommendationExplanationScreenProps) {
  const theme = useTogtTheme();
  if (!capability) {
    return (
      <AppScaffold contentContainerStyle={styles.center} testID="recommendation-capability-loading" topBar={<TopAppBar onBack={onBack} title="Why this Worker" />}>
        <ActivityIndicator accessibilityLabel="Checking recommendation explanation availability" color={theme.colors.actionPrimary} />
      </AppScaffold>
    );
  }
  if (!capability.available) {
    return (
      <AppScaffold
        bottomAction={<Button fullWidth label="Compare Workers manually" large onPress={onCompareWorkers} />}
        scrollable
        testID="recommendation-unavailable"
        topBar={<TopAppBar onBack={onBack} subtitle="Manual comparison remains available" title="Why this Worker" />}
      >
        <View style={[styles.stack, { gap: theme.spacing.lg, paddingTop: theme.spacing.md }]}>
          <Surface elevation="card" style={{ gap: theme.spacing.sm }} variant="inverse">
            <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h1, { color: theme.colors.textInverse }]}>No opaque ranking claim</Text>
            <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.translucentSurface }]}>Explainable recommendations are not enabled in this APK. TOGT will not invent a reason or label someone as the best Worker.</Text>
          </Surface>
          <Surface variant="positive">
            <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.text }]}>You can still compare the current server-authored Worker profiles, scopes, schedules and quotes yourself.</Text>
          </Surface>
          <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>Capability status: {capability.reasonCode.replaceAll('_', ' ')}</Text>
        </View>
      </AppScaffold>
    );
  }
  if (resource.status === 'loading') {
    return (
      <AppScaffold contentContainerStyle={styles.center} testID="recommendation-loading" topBar={<TopAppBar onBack={onBack} title="Why this Worker" />}>
        <ActivityIndicator accessibilityLabel="Loading factual recommendation reasons" color={theme.colors.actionPrimary} />
      </AppScaffold>
    );
  }
  if (resource.status === 'error') {
    return (
      <AppScaffold testID="recommendation-error" topBar={<TopAppBar onBack={onBack} title="Why this Worker" />}>
        <ScreenError
          {...(resource.correlationId ? { correlationId: resource.correlationId } : {})}
          actionLabel="Try again"
          body={resource.message}
          onAction={onRetry}
          title="Explanation could not be verified"
        />
        <Button fullWidth label="Compare Workers manually" onPress={onCompareWorkers} variant="secondary" />
      </AppScaffold>
    );
  }
  const recommendation = resource.value;
  return (
    <AppScaffold
      bottomAction={<Button fullWidth label="Compare all available Workers" large onPress={onCompareWorkers} />}
      scrollable
      testID="recommendation-explanation"
      topBar={<TopAppBar onBack={onBack} subtitle={`Ranking rules ${recommendation.rankingVersion}`} title="Why this Worker" />}
    >
      <View style={[styles.stack, { gap: theme.spacing.lg, paddingBottom: theme.spacing.xl, paddingTop: theme.spacing.md }]}>
        <Surface elevation="card" style={{ gap: theme.spacing.sm }} variant="inverse">
          <View style={[styles.row, { gap: theme.spacing.sm }]}>
            <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h1, styles.flex, { color: theme.colors.textInverse }]}>Facts behind this placement</Text>
            {recommendation.placementLabel ? <Chip label={recommendation.placementLabel} tone="attention" /> : null}
          </View>
          <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.translucentSurface }]}>These are bounded facts from TOGT records—not a guarantee, automatic choice or hidden “best match” score.</Text>
        </Surface>
        <View style={{ gap: theme.spacing.sm }}>
          <SectionHeader subtitle="Evidence is time-stamped and does not replace your comparison." title="Recorded reasons" />
          {recommendation.reasons.map((reason) => (
            <Surface key={reason.code} style={{ gap: theme.spacing.xs }}>
              <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>{reason.fact}</Text>
              <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>Evidence recorded {new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Johannesburg' }).format(new Date(reason.evidenceAsOf))}</Text>
            </Surface>
          ))}
        </View>
        <Surface variant="attention">
          <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.text }]}>You choose the final Worker. TOGT does not claim a guaranteed outcome, and sponsored placement is always labelled.</Text>
        </Surface>
      </View>
    </AppScaffold>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  row: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  stack: {},
});

export default RecommendationExplanationScreen;
