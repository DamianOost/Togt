import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTogtTheme } from '../../../design';
import { AppScaffold, Button, SectionHeader, StatusPill, Surface, TextField, TopAppBar } from '../../../ui';
import { formatLifecycleMoney, workerLifecycleMessage } from './copy';
import { LifecycleActionRow, LifecycleResource, LifecycleRow } from './components';
import { createWorkerLifecycleIntent } from './controller';
import type { WorkerLifecycleIntent } from './controller';
import {
  hasLedgerEvidence,
  hasServerEvidence,
  normaliseChangeOrderForm,
  validateWorkerChangeOrder,
} from './model';
import type {
  ChangeOrderFormValues,
  ConnectionState,
  LifecycleResourceState,
  WorkerActiveWorkSnapshot,
  WorkerChangeOrder,
} from './model';

type ActiveCommand = 'request_change_order' | 'request_completion';

export type WorkerActiveWorkScreenProps = Readonly<{
  resource: LifecycleResourceState<WorkerActiveWorkSnapshot>;
  connectionState: ConnectionState;
  actorId: string;
  changeForm: ChangeOrderFormValues;
  changeEditorExpanded: boolean;
  commandKeys: Readonly<Record<ActiveCommand, string>>;
  onBack: () => void;
  onRetry: () => void;
  onChangeForm: (patch: Partial<ChangeOrderFormValues>) => void;
  onToggleChangeEditor: () => void;
  onCommand: (intent: WorkerLifecycleIntent) => void;
  onOpenChat: (projectId: string) => void;
  onOpenSafetyHelp: (projectId: string) => void;
}>;

export function WorkerActiveWorkScreen({
  resource,
  connectionState,
  actorId,
  changeForm,
  changeEditorExpanded,
  commandKeys,
  onBack,
  onRetry,
  onChangeForm,
  onToggleChangeEditor,
  onCommand,
  onOpenChat,
  onOpenSafetyHelp,
}: WorkerActiveWorkScreenProps) {
  const theme = useTogtTheme();
  return (
    <AppScaffold
      contentContainerStyle={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.xxxl }}
      keyboardAware
      scrollable
      testID="worker-active-work-screen"
      topBar={<TopAppBar onBack={onBack} title={workerLifecycleMessage('work.title')} />}
    >
      <LifecycleResource connectionState={connectionState} onRetry={onRetry} resource={resource}>
        {(snapshot) => {
          const normalized = normaliseChangeOrderForm(snapshot, changeForm);
          const emit = (
            command: ActiveCommand,
            payload: Readonly<Record<string, string | number | boolean>> = {},
          ) => {
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
          const submitChange = () => {
            if (!normalized.validation.valid || !hasLedgerEvidence(changeForm.preview)) return;
            emit('request_change_order', {
              description: normalized.draft.description.trim(),
              addedTimeMinutes: normalized.draft.addedTimeMinutes ?? 0,
              materialsDescription: normalized.draft.materialsDescription.trim(),
              additionalAmountMinor: normalized.draft.additionalAmountMinor ?? 0,
              previewVersion: changeForm.preview.value.previewVersion,
              scopeVersion: snapshot.scopeVersion,
            });
          };
          return (
            <>
              <Surface elevation="card" style={{ gap: theme.spacing.md }} variant="positive">
                <View style={styles.split}>
                  <View style={styles.flex}>
                    <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h1, { color: theme.colors.text }]}>{workerLifecycleMessage('work.title')}</Text>
                    <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.textSecondary }]}>{workerLifecycleMessage('work.scopeVersion', { version: snapshot.scopeVersion })}</Text>
                  </View>
                  <StatusPill label="Work active" tone="inProgress" />
                </View>
                <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.text }]}>{snapshot.scopeSummary}</Text>
                <LifecycleRow icon="timer-outline" label={workerLifecycleMessage('work.elapsed')} value={hasServerEvidence(snapshot.elapsedLabel) ? snapshot.elapsedLabel.value : snapshot.elapsedLabel.explanation} />
                <LifecycleRow icon="cash" label={workerLifecycleMessage('work.currentTotal')} value={hasServerEvidence(snapshot.currentApprovedTotal) ? formatLifecycleMoney(snapshot.currentApprovedTotal.value) : snapshot.currentApprovedTotal.explanation} />
                <LifecycleRow icon="cash-lock" label={workerLifecycleMessage('work.approvalCap')} value={hasServerEvidence(snapshot.customerApprovalCap) ? formatLifecycleMoney(snapshot.customerApprovalCap.value) : snapshot.customerApprovalCap.explanation} />
                <LifecycleRow icon="cash-check" label={workerLifecycleMessage('work.currentNet')} value={hasLedgerEvidence(snapshot.currentExpectedNet) ? formatLifecycleMoney(snapshot.currentExpectedNet.value) : snapshot.currentExpectedNet.explanation} />
                <LifecycleActionRow>
                  <Button label={workerLifecycleMessage('job.chat')} onPress={() => onOpenChat(snapshot.projectId)} variant="secondary" />
                  <Button label={workerLifecycleMessage('job.safety')} onPress={() => onOpenSafetyHelp(snapshot.projectId)} variant="secondary" />
                </LifecycleActionRow>
              </Surface>

              <View style={{ gap: theme.spacing.md }}>
                <SectionHeader subtitle={`${snapshot.changeOrders.length} recorded`} title={workerLifecycleMessage('work.changes')} />
                {snapshot.changeOrders.length > 0 ? snapshot.changeOrders.map((order) => <ChangeOrderCard key={`${order.changeOrderId}:v${order.version}`} order={order} />) : (
                  <Surface variant="subtle"><Text allowFontScaling style={[theme.typography.body, { color: theme.colors.textSecondary }]}>{workerLifecycleMessage('work.noChanges')}</Text></Surface>
                )}
              </View>

              <Surface elevation="card" style={{ gap: theme.spacing.md }} variant="attention">
                <SectionHeader actionLabel={changeEditorExpanded ? 'Hide form' : workerLifecycleMessage('work.requestExtra')} onAction={onToggleChangeEditor} title={workerLifecycleMessage('work.requestExtra')} />
                <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{workerLifecycleMessage('work.pendingWarning')}</Text>
                {changeEditorExpanded ? (
                  <>
                    <TextField label={workerLifecycleMessage('work.description')} multiline onChangeText={(description) => onChangeForm({ description })} value={changeForm.description} />
                    <TextField inputMode="numeric" label={workerLifecycleMessage('work.addedTime')} onChangeText={(addedTimeMinutes) => onChangeForm({ addedTimeMinutes })} value={changeForm.addedTimeMinutes} />
                    <TextField label={workerLifecycleMessage('work.materials')} multiline onChangeText={(materialsDescription) => onChangeForm({ materialsDescription })} value={changeForm.materialsDescription} />
                    <TextField inputMode="decimal" label={workerLifecycleMessage('work.additionalAmount')} onChangeText={(additionalAmountRand) => onChangeForm({ additionalAmountRand })} value={changeForm.additionalAmountRand} />
                    {hasLedgerEvidence(changeForm.preview) ? (
                      <Surface style={{ gap: theme.spacing.xs }} variant="positive">
                        <SectionHeader subtitle={`Preview version ${changeForm.preview.value.previewVersion}`} title={workerLifecycleMessage('work.preview')} />
                        <LifecycleRow icon="cash-plus" label="Additional customer amount" value={formatLifecycleMoney(changeForm.preview.value.additionalAmount)} />
                        <LifecycleRow icon="minus-circle-outline" label="Additional platform fee" value={formatLifecycleMoney(changeForm.preview.value.platformFee)} />
                        <LifecycleRow icon="cash-check" label={workerLifecycleMessage('work.additionalNet')} tone="positive" value={formatLifecycleMoney(changeForm.preview.value.additionalExpectedNet)} />
                        <LifecycleRow icon="cash-multiple" label={workerLifecycleMessage('work.revisedTotal')} value={formatLifecycleMoney(changeForm.preview.value.revisedTotal)} />
                      </Surface>
                    ) : (
                      <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{changeForm.preview.explanation}</Text>
                    )}
                    {normalized.validation.issues.map((issue) => <Text accessibilityRole="alert" allowFontScaling key={`${issue.field}-${issue.code}-${issue.message}`} style={[theme.typography.caption, { color: theme.colors.error }]}>{issue.message}</Text>)}
                    <Button disabled={connectionState === 'offline' || !snapshot.canRequestChange || !normalized.validation.valid} label={workerLifecycleMessage('work.submitChange')} onPress={submitChange} />
                  </>
                ) : null}
              </Surface>

              <Surface style={{ gap: theme.spacing.sm }}>
                <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{workerLifecycleMessage('completion.bilateral')}</Text>
                <Button
                  disabled={connectionState === 'offline' || !snapshot.canRequestCompletion}
                  label={workerLifecycleMessage('work.requestCompletion')}
                  onPress={() => emit('request_completion', { scopeVersion: snapshot.scopeVersion })}
                />
              </Surface>
            </>
          );
        }}
      </LifecycleResource>
    </AppScaffold>
  );
}

function ChangeOrderCard({ order }: Readonly<{ order: WorkerChangeOrder }>) {
  const theme = useTogtTheme();
  const valid = validateWorkerChangeOrder(order);
  return (
    <Surface elevation="card" style={{ gap: theme.spacing.sm }} testID={`worker-change-order-${order.changeOrderId}`} variant={!valid ? 'danger' : order.status === 'approved' ? 'positive' : order.status === 'pending' ? 'attention' : 'subtle'}>
      <View style={styles.split}>
        <View style={styles.flex}>
          <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>Change order · Version {order.version}</Text>
          <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.text }]}>{order.description}</Text>
        </View>
        <StatusPill label={order.status} tone={order.status === 'approved' ? 'complete' : order.status === 'pending' ? 'pending' : order.status === 'declined' || order.status === 'expired' ? 'error' : 'offline'} />
      </View>
      {!valid ? <Text accessibilityRole="alert" allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.error }]}>This change order failed a commercial consistency check.</Text> : null}
      {order.addedTimeMinutes !== null ? <LifecycleRow icon="clock-plus-outline" label="Added time" value={`${order.addedTimeMinutes} minutes`} /> : null}
      {order.materialsDescription ? <LifecycleRow icon="package-variant" label="Materials" value={order.materialsDescription} /> : null}
      <LifecycleRow icon="cash" label="Base approved total" value={formatLifecycleMoney(order.baseTotal)} />
      <LifecycleRow icon="plus-circle-outline" label="Additional amount" value={formatLifecycleMoney(order.additionalAmount)} />
      <LifecycleRow icon="cash-multiple" label="Revised total" value={formatLifecycleMoney(order.revisedTotal)} />
      <LifecycleRow icon="cash-check" label="Expected additional net" value={hasLedgerEvidence(order.additionalExpectedNet) ? formatLifecycleMoney(order.additionalExpectedNet.value) : order.additionalExpectedNet.explanation} />
      {order.status === 'pending' ? <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>{workerLifecycleMessage('work.pendingWarning')}</Text> : null}
      {order.expiresAt ? <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>Expires {order.expiresAt}</Text> : null}
    </Surface>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  split: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap' },
});

export default WorkerActiveWorkScreen;
