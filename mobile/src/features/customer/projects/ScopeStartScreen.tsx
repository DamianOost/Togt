import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTogtTheme } from '../../../design';
import { AppScaffold, Button, SectionHeader, StatusPill, Surface, TopAppBar } from '../../../ui';
import { customerProjectMessage, formatProjectMoney } from './copy';
import { DefinitionRow, ProjectScreenState } from './components';
import { createCustomerCommandIntent, deriveScopeReadiness } from './model';
import type {
  CustomerCommandIntent,
  Loadable,
  ScopeConfirmationViewSnapshot,
} from './model';

type ScopeCommand = 'confirm_scope' | 'decline_scope_revision' | 'reveal_start_pin';

export type ScopeStartScreenProps = Readonly<{
  scope: Loadable<ScopeConfirmationViewSnapshot>;
  actorId: string;
  commandKeys: Readonly<Record<ScopeCommand, string>>;
  allowedActions: Readonly<{
    confirmScope: boolean;
    declineScopeRevision: boolean;
    revealStartPin: boolean;
  }>;
  onBack: () => void;
  onRetry: () => void;
  onCommand: (intent: CustomerCommandIntent) => void;
  onOpenSafetyHelp: (projectId: string) => void;
}>;

export function ScopeStartScreen({ scope, actorId, commandKeys, allowedActions, onBack, onRetry, onCommand, onOpenSafetyHelp }: ScopeStartScreenProps) {
  const theme = useTogtTheme();
  return (
    <AppScaffold
      contentContainerStyle={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.xxxl }}
      scrollable
      testID="scope-start-screen"
      topBar={<TopAppBar onBack={onBack} title={customerProjectMessage('scope.title')} />}
    >
      <ProjectScreenState
        emptyBody="No server-authored scope version was supplied."
        emptyTitle="Scope unavailable"
        errorBody="No scope or PIN state was changed."
        errorTitle="Scope could not be loaded"
        loadingLabel="Loading on-site scope"
        onRetry={onRetry}
        value={scope}
      >
        {(snapshot, connectionState) => {
          const readiness = deriveScopeReadiness(snapshot.scope, connectionState);
          const emit = (command: ScopeCommand) => {
            const result = createCustomerCommandIntent({
              actorId,
              command,
              connectionState,
              projectId: snapshot.projectId,
              requestKey: commandKeys[command],
              stateVersion: snapshot.stateVersion,
              targetId: snapshot.scope.scopeId,
              payload: { scopeVersion: snapshot.scope.version },
            });
            if (result.ok) onCommand(result.intent);
          };
          return (
            <>
              <Surface elevation="card" style={{ gap: theme.spacing.md }}>
                <View style={styles.splitRow}>
                  <View style={styles.flex}>
                    <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>Scope version {snapshot.scope.version}</Text>
                    <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h2, { color: theme.colors.text }]}>{snapshot.scope.status.replaceAll('_', ' ')}</Text>
                  </View>
                  <StatusPill
                    label={snapshot.scope.status.replaceAll('_', ' ')}
                    tone={snapshot.scope.status === 'confirmed' ? 'complete' : snapshot.scope.status === 'cancelled' || snapshot.scope.status === 'revision_declined' ? 'error' : 'pending'}
                  />
                </View>
                <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{readiness.reason}</Text>
              </Surface>

              <Surface style={{ gap: theme.spacing.md }}>
                <SectionHeader title={customerProjectMessage('scope.included')} />
                <ScopeList emptyLabel="No included work was provided." icon="check-circle-outline" items={snapshot.scope.included} />
                <SectionHeader title={customerProjectMessage('scope.excluded')} />
                <ScopeList emptyLabel="No exclusions were provided." icon="minus-circle-outline" items={snapshot.scope.excluded} />
                <SectionHeader subtitle="Items begin unconfirmed on site." title="On-site checklist" />
                {snapshot.scope.checklist.length > 0 ? snapshot.scope.checklist.map((item) => (
                  <View key={item.itemId} style={styles.splitRow}>
                    <Text allowFontScaling style={[theme.typography.body, styles.flex, { color: theme.colors.text }]}>{item.label}</Text>
                    <StatusPill
                      label={item.status.replaceAll('_', ' ')}
                      tone={item.status === 'customer_confirmed' ? 'complete' : item.status === 'worker_confirmed' ? 'inProgress' : 'pending'}
                    />
                  </View>
                )) : <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>No checklist items were supplied.</Text>}
              </Surface>

              <Surface style={{ gap: theme.spacing.sm }}>
                <DefinitionRow icon="package-variant-closed" label={customerProjectMessage('scope.materials')} value={snapshot.scope.materialsResponsibility} />
                <DefinitionRow icon="clock-outline" label={customerProjectMessage('scope.timeRate')} value={snapshot.scope.timeAndRateLabel} />
                <DefinitionRow icon="cash" label={customerProjectMessage('scope.totalCap')} value={formatProjectMoney(snapshot.scope.totalOrCap)} />
                <DefinitionRow
                  icon="account-hard-hat-outline"
                  label={customerProjectMessage('scope.workerConfirmed')}
                  value={snapshot.scope.workerConfirmedAt ? `${customerProjectMessage('scope.confirmed')} · ${snapshot.scope.workerConfirmedAt}` : customerProjectMessage('scope.waiting')}
                />
                <DefinitionRow
                  icon="account-outline"
                  label={customerProjectMessage('scope.customerConfirmed')}
                  value={snapshot.scope.customerConfirmedAt ? `${customerProjectMessage('scope.confirmed')} · ${snapshot.scope.customerConfirmedAt}` : customerProjectMessage('scope.waiting')}
                />
              </Surface>

              {readiness.canConfirm ? (
                <Surface style={{ gap: theme.spacing.md }} variant="attention">
                  <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.text }]}>Confirm only if the included work, exclusions, materials and amount match what you agreed on site.</Text>
                  <Button disabled={connectionState === 'offline' || !allowedActions.confirmScope} label={customerProjectMessage('scope.confirm')} onPress={() => emit('confirm_scope')} />
                  {snapshot.scope.status === 'revision_requested' || snapshot.scope.status === 'pending_customer' ? (
                    <Button disabled={connectionState === 'offline' || !allowedActions.declineScopeRevision} label={customerProjectMessage('scope.declineRevision')} onPress={() => emit('decline_scope_revision')} variant="secondary" />
                  ) : null}
                </Surface>
              ) : null}

              <Surface style={{ gap: theme.spacing.md }} variant={snapshot.scope.startPin.status === 'available' ? 'positive' : 'subtle'}>
                <View style={[styles.iconHeading, { gap: theme.spacing.sm }]}>
                  <MaterialCommunityIcons color={theme.colors.actionPrimary} name="lock-outline" size={theme.sizing.iconLarge} />
                  <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h2, { color: theme.colors.text }]}>{customerProjectMessage('scope.pinTitle')}</Text>
                </View>
                {readiness.canStart && snapshot.scope.startPin.value ? (
                  <>
                    <Text accessibilityLabel={`Start PIN ${snapshot.scope.startPin.value.split('').join(' ')}`} allowFontScaling selectable style={[theme.typography.display, styles.pin, { color: theme.colors.text }]}>{snapshot.scope.startPin.value}</Text>
                    <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{customerProjectMessage('scope.pinPrivate')}</Text>
                  </>
                ) : (
                  <>
                    <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.textSecondary }]}>{customerProjectMessage('scope.pinHidden')}</Text>
                    {readiness.canRevealPin && snapshot.scope.startPin.status === 'hidden' ? (
                      <Button
                        disabled={connectionState === 'offline' || !allowedActions.revealStartPin}
                        label="Reveal start PIN"
                        onPress={() => emit('reveal_start_pin')}
                        variant="secondary"
                      />
                    ) : null}
                  </>
                )}
              </Surface>

              <Button
                label={customerProjectMessage('hub.safety')}
                leading={<MaterialCommunityIcons color={theme.colors.emergency} name="shield-alert-outline" size={theme.sizing.iconMedium} />}
                onPress={() => onOpenSafetyHelp(snapshot.projectId)}
                variant="secondary"
              />
            </>
          );
        }}
      </ProjectScreenState>
    </AppScaffold>
  );
}

function ScopeList({ items, icon, emptyLabel }: Readonly<{
  items: readonly string[];
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  emptyLabel: string;
}>) {
  const theme = useTogtTheme();
  if (items.length === 0) return <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{emptyLabel}</Text>;
  return (
    <View style={{ gap: theme.spacing.xs }}>
      {items.map((item) => (
        <View key={item} style={[styles.iconHeading, { gap: theme.spacing.sm }]}>
          <MaterialCommunityIcons color={theme.colors.actionPrimary} name={icon} size={theme.sizing.iconSmall} />
          <Text allowFontScaling style={[theme.typography.body, styles.flex, { color: theme.colors.text }]}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  splitRow: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap' },
  iconHeading: { alignItems: 'center', flexDirection: 'row' },
  pin: { letterSpacing: 8, textAlign: 'center' },
});

export default ScopeStartScreen;
