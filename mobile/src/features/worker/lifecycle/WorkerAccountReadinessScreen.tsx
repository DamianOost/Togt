import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTogtTheme } from '../../../design';
import { AppScaffold, Button, SectionHeader, StatusPill, Surface, TopAppBar } from '../../../ui';
import { workerLifecycleMessage } from './copy';
import { LifecycleResource } from './components';
import { deriveAccountReadiness, isSafeLifecycleImageUri } from './model';
import type {
  ConnectionState,
  LifecycleResourceState,
  ProfileFieldVisibility,
  WorkerAccountEntry,
  WorkerAccountReadinessSnapshot,
} from './model';

export type WorkerAccountReadinessScreenProps = Readonly<{
  resource: LifecycleResourceState<WorkerAccountReadinessSnapshot>;
  connectionState: ConnectionState;
  onRetry: () => void;
  onOpenEntry: (destinationKey: string, entryId: string) => void;
  onOpenSupport: () => void;
  onSignOut: () => void;
}>;

export function WorkerAccountReadinessScreen({
  resource,
  connectionState,
  onRetry,
  onOpenEntry,
  onOpenSupport,
  onSignOut,
}: WorkerAccountReadinessScreenProps) {
  const theme = useTogtTheme();
  return (
    <AppScaffold
      contentContainerStyle={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.xxxl }}
      scrollable
      testID="worker-account-readiness-screen"
      topBar={<TopAppBar title={workerLifecycleMessage('account.title')} />}
    >
      <LifecycleResource connectionState={connectionState} onRetry={onRetry} resource={resource}>
        {(snapshot) => {
          const readiness = deriveAccountReadiness(snapshot);
          return (
            <>
              <Surface elevation="card" style={{ gap: theme.spacing.md }} variant={readiness.actionRequiredCount > 0 ? 'attention' : 'positive'}>
                <View style={[styles.profileHeader, { gap: theme.spacing.lg }]}>
                  {isSafeLifecycleImageUri(snapshot.publicProfilePreviewUri) ? (
                    <Image accessibilityLabel="Current public Worker profile preview" source={{ uri: snapshot.publicProfilePreviewUri }} style={[styles.avatar, { borderRadius: theme.radius.hero }]} />
                  ) : (
                    <View accessibilityLabel="Public profile preview unavailable" style={[styles.avatarFallback, { backgroundColor: theme.colors.surfacePositive, borderRadius: theme.radius.hero }]}>
                      <MaterialCommunityIcons color={theme.colors.actionPrimary} name="account-hard-hat-outline" size={theme.sizing.iconLarge} />
                    </View>
                  )}
                  <View style={styles.flex}>
                    <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h1, { color: theme.colors.text }]}>{workerLifecycleMessage('account.heading')}</Text>
                    <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.textSecondary }]}>{workerLifecycleMessage('account.progress', { ready: readiness.readyCount, action: readiness.actionRequiredCount })}</Text>
                  </View>
                </View>
                {readiness.invalidEntryIds.length > 0 ? <Text accessibilityRole="alert" allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.error }]}>Account evidence is inconsistent for {readiness.invalidEntryIds.length} section(s). Refresh before making changes.</Text> : null}
              </Surface>

              <AccountSection
                entries={snapshot.entries.filter((entry) => entry.visibility === 'public')}
                onOpenEntry={onOpenEntry}
                title={workerLifecycleMessage('account.public')}
                visibility="public"
              />
              <AccountSection
                entries={snapshot.entries.filter((entry) => entry.visibility === 'private')}
                onOpenEntry={onOpenEntry}
                title={workerLifecycleMessage('account.private')}
                visibility="private"
              />

              <Surface style={{ gap: theme.spacing.md }}>
                <SectionHeader title={workerLifecycleMessage('account.support')} />
                <Button label={workerLifecycleMessage('account.support')} onPress={onOpenSupport} variant="secondary" />
                <Button label={workerLifecycleMessage('account.signOut')} onPress={onSignOut} variant="tertiary" />
              </Surface>
              <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>{workerLifecycleMessage('common.lastUpdated', { time: snapshot.lastUpdatedAt })}</Text>
            </>
          );
        }}
      </LifecycleResource>
    </AppScaffold>
  );
}

function AccountSection({ entries, title, visibility, onOpenEntry }: Readonly<{
  entries: readonly WorkerAccountEntry[];
  title: string;
  visibility: ProfileFieldVisibility;
  onOpenEntry: (destinationKey: string, entryId: string) => void;
}>) {
  const theme = useTogtTheme();
  return (
    <View style={{ gap: theme.spacing.md }}>
      <SectionHeader subtitle={visibility === 'public' ? 'These details can affect your public presence.' : 'These details stay in your private account.'} title={title} />
      {entries.map((entry) => {
        const statusTone = entry.status === 'ready'
          ? 'complete' as const
          : entry.status === 'action_required'
            ? 'error' as const
            : entry.status === 'pending'
              ? 'pending' as const
              : 'offline' as const;
        return (
          <Surface elevation="card" key={entry.entryId} style={{ gap: theme.spacing.sm }} testID={`worker-account-entry-${entry.entryId}`}>
            <View style={styles.split}>
              <View style={styles.flex}>
                <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>{entry.label}</Text>
                <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{entry.detail}</Text>
              </View>
              <StatusPill label={entry.status.replaceAll('_', ' ')} tone={statusTone} />
            </View>
            {entry.status === 'unavailable' ? (
              <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{workerLifecycleMessage('account.unavailable', { reason: entry.capabilityReason ?? workerLifecycleMessage('common.notAvailable') })}</Text>
            ) : null}
            {entry.destinationKey ? (
              <Button
                accessibilityHint={`Opens ${entry.label}.`}
                label={workerLifecycleMessage('account.open')}
                onPress={() => entry.destinationKey && onOpenEntry(entry.destinationKey, entry.entryId)}
                variant="secondary"
              />
            ) : null}
          </Surface>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  profileHeader: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap' },
  avatar: { height: 96, width: 96 },
  avatarFallback: { alignItems: 'center', height: 96, justifyContent: 'center', width: 96 },
  split: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap' },
});

export default WorkerAccountReadinessScreen;
