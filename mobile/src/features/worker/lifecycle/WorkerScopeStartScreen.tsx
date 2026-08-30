import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTogtTheme } from '../../../design';
import { AppScaffold, Button, SectionHeader, StatusPill, Surface, TextField, TopAppBar } from '../../../ui';
import { formatLifecycleMoney, workerLifecycleMessage } from './copy';
import { LifecycleActionRow, LifecycleResource, LifecycleRow } from './components';
import { createWorkerLifecycleIntent } from './controller';
import type { WorkerLifecycleIntent } from './controller';
import { derivePinEntryPresentation, hasServerEvidence } from './model';
import type {
  ConnectionState,
  LifecycleResourceState,
  WorkerScopeSnapshot,
} from './model';

type ScopeCommand = 'confirm_scope' | 'request_scope_revision' | 'verify_start_pin';

export type WorkerScopeStartScreenProps = Readonly<{
  resource: LifecycleResourceState<WorkerScopeSnapshot>;
  connectionState: ConnectionState;
  actorId: string;
  enteredPin: string;
  clarificationDraft: string;
  commandKeys: Readonly<Record<ScopeCommand, string>>;
  allowedActions: Readonly<{
    confirmScope: boolean;
    requestScopeRevision: boolean;
    verifyStartPin: boolean;
  }>;
  onBack: () => void;
  onRetry: () => void;
  onPinChange: (pin: string) => void;
  onClarificationChange: (clarification: string) => void;
  onCommand: (intent: WorkerLifecycleIntent) => void;
  onOpenChat: (projectId: string) => void;
  onOpenSafetyHelp: (projectId: string) => void;
}>;

export function WorkerScopeStartScreen({
  resource,
  connectionState,
  actorId,
  enteredPin,
  clarificationDraft,
  commandKeys,
  allowedActions,
  onBack,
  onRetry,
  onPinChange,
  onClarificationChange,
  onCommand,
  onOpenChat,
  onOpenSafetyHelp,
}: WorkerScopeStartScreenProps) {
  const theme = useTogtTheme();
  return (
    <AppScaffold
      contentContainerStyle={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.xxxl }}
      keyboardAware
      scrollable
      testID="worker-scope-start-screen"
      topBar={<TopAppBar onBack={onBack} title={workerLifecycleMessage('scope.title')} />}
    >
      <LifecycleResource connectionState={connectionState} onRetry={onRetry} resource={resource}>
        {(snapshot) => {
          const pin = derivePinEntryPresentation(snapshot, enteredPin, connectionState);
          const canConfirm = connectionState === 'online' && snapshot.status === 'pending_worker' && allowedActions.confirmScope;
          const canRequestRevision = connectionState === 'online'
            && (snapshot.status === 'pending_worker' || snapshot.status === 'worker_confirmed')
            && clarificationDraft.trim().length > 0
            && allowedActions.requestScopeRevision;
          const emit = (command: ScopeCommand, payload: Readonly<Record<string, string | number | boolean>> = {}) => {
            const result = createWorkerLifecycleIntent({
              actorId,
              command,
              connectionState,
              projectId: snapshot.projectId,
              requestKey: commandKeys[command],
              resourceId: snapshot.scopeId,
              stateVersion: snapshot.stateVersion,
              payload,
            });
            if (result.ok) onCommand(result.intent);
          };
          return (
            <>
              <Surface elevation="card" style={{ gap: theme.spacing.md }} variant={snapshot.status === 'unknown' ? 'attention' : snapshot.status === 'confirmed' ? 'positive' : 'default'}>
                <View style={styles.split}>
                  <View style={styles.flex}>
                    <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>{workerLifecycleMessage('scope.acceptedBrief', { version: snapshot.acceptedBriefVersion })}</Text>
                    <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h1, { color: theme.colors.text }]}>{workerLifecycleMessage('scope.version', { version: snapshot.scopeVersion })}</Text>
                  </View>
                  <StatusPill label={snapshot.status.replaceAll('_', ' ')} tone={snapshot.status === 'confirmed' ? 'complete' : snapshot.status === 'cancelled' || snapshot.status === 'revision_declined' ? 'error' : 'pending'} />
                </View>
                <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{workerLifecycleMessage('scope.noSkip')}</Text>
              </Surface>

              <Surface style={{ gap: theme.spacing.md }}>
                <SectionHeader title={workerLifecycleMessage('scope.included')} />
                <ScopeItems emptyLabel="No included work was supplied." icon="check-circle-outline" items={snapshot.included} />
                <SectionHeader title={workerLifecycleMessage('scope.excluded')} />
                <ScopeItems emptyLabel="No exclusions were supplied." icon="minus-circle-outline" items={snapshot.excluded} />
                <SectionHeader subtitle="Checklist entries begin unconfirmed on site." title={workerLifecycleMessage('scope.checklist')} />
                {snapshot.checklist.map((item) => (
                  <View key={item.itemId} style={styles.split}>
                    <Text allowFontScaling style={[theme.typography.body, styles.flex, { color: theme.colors.text }]}>{item.label}</Text>
                    <StatusPill label={item.status.replaceAll('_', ' ')} tone={item.status === 'customer_confirmed' ? 'complete' : item.status === 'worker_confirmed' ? 'inProgress' : 'pending'} />
                  </View>
                ))}
              </Surface>

              <Surface style={{ gap: theme.spacing.sm }}>
                <LifecycleRow icon="package-variant-closed" label={workerLifecycleMessage('scope.materials')} value={snapshot.materialsResponsibility} />
                <LifecycleRow icon="clock-outline" label={workerLifecycleMessage('scope.timeRate')} value={snapshot.timeAndRateLabel} />
                <LifecycleRow icon="cash" label={workerLifecycleMessage('scope.totalCap')} value={hasServerEvidence(snapshot.totalOrCap) ? formatLifecycleMoney(snapshot.totalOrCap.value) : snapshot.totalOrCap.explanation} />
                <LifecycleRow icon="account-hard-hat-outline" label={workerLifecycleMessage('scope.workerConfirmation')} value={snapshot.workerConfirmedAt ?? 'Waiting'} />
                <LifecycleRow icon="account-outline" label={workerLifecycleMessage('scope.customerConfirmation')} value={snapshot.customerConfirmedAt ?? 'Waiting'} />
              </Surface>

              {(snapshot.status === 'pending_worker' || snapshot.status === 'worker_confirmed') ? (
                <Surface style={{ gap: theme.spacing.md }} variant="attention">
                  <TextField
                    helperText="Explain what differs from the accepted brief."
                    label={workerLifecycleMessage('scope.clarification')}
                    multiline
                    onChangeText={onClarificationChange}
                    value={clarificationDraft}
                  />
                  <LifecycleActionRow>
                    {canConfirm ? (
                      <Button
                        label={workerLifecycleMessage('scope.confirm')}
                        onPress={() => emit('confirm_scope', { scopeVersion: snapshot.scopeVersion, acceptedBriefVersion: snapshot.acceptedBriefVersion })}
                        style={styles.flex}
                      />
                    ) : null}
                    <Button
                      disabled={!canRequestRevision}
                      label={workerLifecycleMessage('scope.requestRevision')}
                      onPress={() => emit('request_scope_revision', { scopeVersion: snapshot.scopeVersion, clarification: clarificationDraft.trim() })}
                      variant="secondary"
                    />
                  </LifecycleActionRow>
                </Surface>
              ) : null}

              <Surface elevation="card" style={{ gap: theme.spacing.md }} variant={pin.serverConfirmedStarted ? 'positive' : pin.canEnter ? 'attention' : 'subtle'}>
                <View style={[styles.row, { gap: theme.spacing.sm }]}>
                  <MaterialCommunityIcons color={theme.colors.actionPrimary} name="numeric" size={theme.sizing.iconLarge} />
                  <View style={styles.flex}>
                    <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h2, { color: theme.colors.text }]}>{workerLifecycleMessage('scope.pin')}</Text>
                    <Text accessibilityLiveRegion="polite" allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{pin.statusLabel}</Text>
                  </View>
                </View>
                {pin.canEnter ? (
                  <>
                    <TextField
                      accessibilityHint={workerLifecycleMessage('scope.pinPrivate')}
                      autoComplete="one-time-code"
                      inputMode="numeric"
                      label={workerLifecycleMessage('scope.pinEntry')}
                      maxLength={8}
                      onChangeText={(value) => onPinChange(value.replace(/\D/g, '').slice(0, 8))}
                      secureTextEntry
                      value={enteredPin}
                    />
                    <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>{workerLifecycleMessage('scope.pinPrivate')}</Text>
                    {pin.attemptsRemaining !== null ? <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>{workerLifecycleMessage('scope.attempts', { count: pin.attemptsRemaining })}</Text> : null}
                    <Button
                      disabled={!pin.canSubmit || !allowedActions.verifyStartPin}
                      label={workerLifecycleMessage('scope.verifyPin')}
                      onPress={() => emit('verify_start_pin', { scopeVersion: snapshot.scopeVersion, pin: enteredPin })}
                    />
                  </>
                ) : null}
                {pin.retryAfter ? <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>Try again after {pin.retryAfter}</Text> : null}
                {pin.serverConfirmedStarted ? (
                  <View style={{ gap: theme.spacing.xs }}>
                    <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>{workerLifecycleMessage('scope.started')}</Text>
                    <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{workerLifecycleMessage('scope.startedBody')}</Text>
                    <LifecycleRow icon="server" label="Server timestamp" value={snapshot.startOutcome.serverAt ?? 'Unavailable'} />
                  </View>
                ) : null}
              </Surface>

              <LifecycleActionRow>
                <Button label={workerLifecycleMessage('job.chat')} onPress={() => onOpenChat(snapshot.projectId)} variant="secondary" />
                <Button label={workerLifecycleMessage('job.safety')} onPress={() => onOpenSafetyHelp(snapshot.projectId)} variant="secondary" />
              </LifecycleActionRow>
            </>
          );
        }}
      </LifecycleResource>
    </AppScaffold>
  );
}

function ScopeItems({ items, icon, emptyLabel }: Readonly<{
  items: readonly string[];
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  emptyLabel: string;
}>) {
  const theme = useTogtTheme();
  if (items.length === 0) return <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{emptyLabel}</Text>;
  return (
    <View style={{ gap: theme.spacing.xs }}>
      {items.map((item) => (
        <View key={item} style={[styles.row, { gap: theme.spacing.sm }]}>
          <MaterialCommunityIcons color={theme.colors.actionPrimary} name={icon} size={theme.sizing.iconSmall} />
          <Text allowFontScaling style={[theme.typography.body, styles.flex, { color: theme.colors.text }]}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  split: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap' },
  row: { alignItems: 'flex-start', flexDirection: 'row' },
});

export default WorkerScopeStartScreen;
