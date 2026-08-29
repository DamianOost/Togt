import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTogtTheme } from '../../design';
import type { ProjectLiveStatusV1 } from '../../data/grounded/intelligence';
import type { IntelligenceCapabilityState } from '../../services/groundedIntelligence';
import {
  AppScaffold,
  Button,
  Chip,
  ScreenError,
  Surface,
  TopAppBar,
} from '../../ui';

export type LiveStatusResource =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'error'; message: string; correlationId: string | null }>
  | Readonly<{ status: 'ready'; value: ProjectLiveStatusV1 }>;

export type ProjectLiveStatusScreenProps = Readonly<{
  capability: IntelligenceCapabilityState | null;
  resource: LiveStatusResource;
  onBack: () => void;
  onRetry: () => void;
  onOpenProject: () => void;
}>;

export function ProjectLiveStatusScreen({
  capability,
  resource,
  onBack,
  onRetry,
  onOpenProject,
}: ProjectLiveStatusScreenProps) {
  const theme = useTogtTheme();
  if (!capability) {
    return (
      <AppScaffold contentContainerStyle={styles.center} testID="live-status-capability-loading" topBar={<TopAppBar onBack={onBack} title="Project live status" />}>
        <ActivityIndicator accessibilityLabel="Checking live status availability" color={theme.colors.actionPrimary} />
      </AppScaffold>
    );
  }
  if (!capability.available) {
    return (
      <AppScaffold
        bottomAction={<Button fullWidth label="Open current Project" large onPress={onOpenProject} />}
        scrollable
        testID="live-status-unavailable"
        topBar={<TopAppBar onBack={onBack} subtitle="Project remains authoritative" title="Project live status" />}
      >
        <View style={[styles.stack, { gap: theme.spacing.lg, paddingTop: theme.spacing.md }]}>
          <Surface elevation="card" style={{ gap: theme.spacing.sm }} variant="inverse">
            <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h1, { color: theme.colors.textInverse }]}>Live lock-screen status is off</Text>
            <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.translucentSurface }]}>This APK does not start an Android Live Update. Open the Project for its current server-authoritative state.</Text>
          </Surface>
          <Surface style={{ gap: theme.spacing.xs }} variant="positive">
            <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>Privacy stays bounded</Text>
            <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.textSecondary }]}>No background tracking is enabled, and no address, phone number, chat or private job note is projected onto a lock screen.</Text>
          </Surface>
          <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>Capability status: {capability.reasonCode.replaceAll('_', ' ')}</Text>
        </View>
      </AppScaffold>
    );
  }
  if (resource.status === 'loading') {
    return (
      <AppScaffold contentContainerStyle={styles.center} testID="live-status-loading" topBar={<TopAppBar onBack={onBack} title="Project live status" />}>
        <ActivityIndicator accessibilityLabel="Loading Project live status" color={theme.colors.actionPrimary} />
      </AppScaffold>
    );
  }
  if (resource.status === 'error') {
    return (
      <AppScaffold testID="live-status-error" topBar={<TopAppBar onBack={onBack} title="Project live status" />}>
        <ScreenError
          {...(resource.correlationId ? { correlationId: resource.correlationId } : {})}
          actionLabel="Try again"
          body={resource.message}
          onAction={onRetry}
          title="Live status could not be verified"
        />
        <Button fullWidth label="Open current Project" onPress={onOpenProject} variant="secondary" />
      </AppScaffold>
    );
  }
  const live = resource.value;
  const updatedLabel = new Intl.DateTimeFormat('en-ZA', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Johannesburg',
  }).format(new Date(live.updatedAt));
  if (live.state !== 'active') {
    return (
      <AppScaffold
        bottomAction={<Button fullWidth label="Open current Project" large onPress={onOpenProject} />}
        scrollable
        testID={`live-status-${live.state}`}
        topBar={<TopAppBar onBack={onBack} subtitle={`Revision ${live.revision}`} title="Project live status" />}
      >
        <Surface style={{ gap: theme.spacing.sm, marginTop: theme.spacing.md }} variant="positive">
          <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h2, { color: theme.colors.text }]}>{live.state === 'ended' ? 'Live status ended' : 'Live status is not needed yet'}</Text>
          <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.textSecondary }]}>{live.state === 'ended' ? 'The terminal server state ended this live surface.' : 'The current Project phase is not eligible for a live surface. No false progress is shown.'}</Text>
          <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>Updated {updatedLabel}</Text>
        </Surface>
      </AppScaffold>
    );
  }
  return (
    <AppScaffold
      bottomAction={<Button fullWidth label={live.actionLabel ?? 'Open current Project'} large onPress={onOpenProject} />}
      scrollable
      testID="live-status-active"
      topBar={<TopAppBar onBack={onBack} subtitle={`Revision ${live.revision}`} title="Project live status" />}
    >
      <View style={[styles.stack, { gap: theme.spacing.lg, paddingBottom: theme.spacing.xl, paddingTop: theme.spacing.md }]}>
        <Surface elevation="card" style={{ gap: theme.spacing.md }} variant="inverse">
          <Chip label="Server live" tone="brand" />
          <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h1, { color: theme.colors.textInverse }]}>{live.title}</Text>
          <Text allowFontScaling style={[theme.typography.h2, { color: theme.colors.translucentSurface }]}>{live.status}</Text>
        </Surface>
        <Surface style={{ gap: theme.spacing.xs }} variant="positive">
          <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>Privacy-safe projection</Text>
          <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.textSecondary }]}>Only a concise service title, phase and action are shown. Exact location, contact details, chat and private notes stay inside the authorised Project.</Text>
          <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>Updated {updatedLabel}</Text>
        </Surface>
      </View>
    </AppScaffold>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  stack: {},
});

export default ProjectLiveStatusScreen;
