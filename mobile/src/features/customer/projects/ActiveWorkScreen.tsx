import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTogtTheme } from '../../../design';
import { AppScaffold, Button, SectionHeader, StatusPill, Surface, TopAppBar } from '../../../ui';
import { customerProjectMessage, formatProjectMoney } from './copy';
import { DefinitionRow, ProjectScreenState } from './components';
import { createCustomerCommandIntent, validateChangeOrder } from './model';
import type {
  ActiveWorkSnapshot,
  ChangeOrder,
  CustomerCommandIntent,
  Loadable,
} from './model';

type ChangeCommand = 'approve_change_order' | 'decline_change_order';

export type ActiveWorkScreenProps = Readonly<{
  work: Loadable<ActiveWorkSnapshot>;
  actorId: string;
  commandKeys: Readonly<Record<ChangeCommand, string>>;
  changeOrderDecisionAllowed: boolean;
  onBack: () => void;
  onRetry: () => void;
  onCommand: (intent: CustomerCommandIntent) => void;
  onOpenChat: (projectId: string) => void;
  onOpenSafetyHelp: (projectId: string) => void;
}>;

export function ActiveWorkScreen({ work, actorId, commandKeys, changeOrderDecisionAllowed, onBack, onRetry, onCommand, onOpenChat, onOpenSafetyHelp }: ActiveWorkScreenProps) {
  const theme = useTogtTheme();
  return (
    <AppScaffold
      contentContainerStyle={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.xxxl }}
      scrollable
      testID="active-work-screen"
      topBar={<TopAppBar onBack={onBack} title={customerProjectMessage('work.title')} />}
    >
      <ProjectScreenState
        emptyBody="No server-authored work state was supplied."
        emptyTitle="Work progress unavailable"
        errorBody="No scope or change order was changed."
        errorTitle="Work progress could not be loaded"
        loadingLabel="Loading work progress"
        onRetry={onRetry}
        value={work}
      >
        {(snapshot, connectionState) => {
          const emit = (order: ChangeOrder, command: ChangeCommand) => {
            const result = createCustomerCommandIntent({
              actorId,
              command,
              connectionState,
              projectId: snapshot.projectId,
              requestKey: commandKeys[command],
              stateVersion: snapshot.stateVersion,
              targetId: order.changeOrderId,
              payload: { changeOrderVersion: order.version },
            });
            if (result.ok) onCommand(result.intent);
          };
          return (
            <>
              <Surface elevation="card" style={{ gap: theme.spacing.md }} variant="positive">
                <View style={styles.splitRow}>
                  <View style={styles.flex}>
                    <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>Current state</Text>
                    <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h1, { color: theme.colors.text }]}>Work in progress</Text>
                  </View>
                  <StatusPill label="In progress" tone="inProgress" />
                </View>
                {snapshot.elapsedLabel ? <DefinitionRow icon="timer-outline" label="Elapsed" value={snapshot.elapsedLabel} /> : null}
                <DefinitionRow icon="cash" label={customerProjectMessage('work.estimate')} value={formatProjectMoney(snapshot.runningEstimate)} />
                <View style={[styles.actionRow, { gap: theme.spacing.sm }]}>
                  <Button label={customerProjectMessage('hub.chat')} onPress={() => onOpenChat(snapshot.projectId)} variant="secondary" />
                  <Button label={customerProjectMessage('hub.safety')} onPress={() => onOpenSafetyHelp(snapshot.projectId)} variant="secondary" />
                </View>
              </Surface>

              <Surface style={{ gap: theme.spacing.sm }}>
                <SectionHeader subtitle={`Version ${snapshot.currentScope.version}`} title={customerProjectMessage('hub.scope')} />
                {snapshot.currentScope.included.map((item) => (
                  <View key={item} style={[styles.iconRow, { gap: theme.spacing.sm }]}>
                    <MaterialCommunityIcons color={theme.colors.success} name="check-circle-outline" size={theme.sizing.iconSmall} />
                    <Text allowFontScaling style={[theme.typography.body, styles.flex, { color: theme.colors.text }]}>{item}</Text>
                  </View>
                ))}
                {snapshot.currentScope.checklist.map((item) => (
                  <View key={item.itemId} style={styles.splitRow}>
                    <Text allowFontScaling style={[theme.typography.bodySmall, styles.flex, { color: theme.colors.text }]}>{item.label}</Text>
                    <StatusPill label={item.status.replaceAll('_', ' ')} tone={item.status === 'customer_confirmed' ? 'complete' : 'inProgress'} />
                  </View>
                ))}
                <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>{snapshot.currentScope.materialsResponsibility}</Text>
              </Surface>

              <View style={{ gap: theme.spacing.md }}>
                <SectionHeader subtitle={`${snapshot.changeOrders.length} recorded`} title={customerProjectMessage('change.title')} />
                {snapshot.changeOrders.length === 0 ? (
                  <Surface variant="subtle">
                    <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.textSecondary }]}>No change orders have been recorded.</Text>
                  </Surface>
                ) : snapshot.changeOrders.map((order) => (
                  <ChangeOrderCard
                    connectionState={connectionState}
                    decisionAllowed={changeOrderDecisionAllowed}
                    key={`${order.changeOrderId}:v${order.version}`}
                    onApprove={() => emit(order, 'approve_change_order')}
                    onDecline={() => emit(order, 'decline_change_order')}
                    order={order}
                  />
                ))}
              </View>
            </>
          );
        }}
      </ProjectScreenState>
    </AppScaffold>
  );
}

function ChangeOrderCard({ order, connectionState, decisionAllowed, onApprove, onDecline }: Readonly<{
  order: ChangeOrder;
  connectionState: 'online' | 'offline';
  decisionAllowed: boolean;
  onApprove: () => void;
  onDecline: () => void;
}>) {
  const theme = useTogtTheme();
  const validation = validateChangeOrder(order);
  const pending = order.status === 'pending';
  const disabled = connectionState === 'offline' || !validation.valid || !decisionAllowed;
  return (
    <Surface
      accessibilityLabel={`Change order ${order.status}. ${order.extraDescription}`}
      elevation="card"
      style={{ gap: theme.spacing.md }}
      testID={`change-order-${order.changeOrderId}`}
      variant={!validation.valid ? 'danger' : pending ? 'attention' : order.status === 'approved' ? 'positive' : 'subtle'}
    >
      <View style={styles.splitRow}>
        <View style={styles.flex}>
          <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>Change order · Version {order.version}</Text>
          <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.text }]}>{order.extraDescription}</Text>
        </View>
        <StatusPill label={order.status} tone={order.status === 'approved' ? 'complete' : order.status === 'pending' ? 'pending' : order.status === 'declined' || order.status === 'expired' ? 'error' : 'offline'} />
      </View>
      {!validation.valid ? (
        <Text accessibilityRole="alert" allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.error }]}>This change total failed a consistency check ({validation.reasonCode}). Approval is disabled.</Text>
      ) : null}
      <DefinitionRow icon="file-document-outline" label={customerProjectMessage('change.existing')} value={order.existingAgreementSummary} />
      {order.addedTimeLabel ? <DefinitionRow icon="clock-plus-outline" label={customerProjectMessage('change.addedTime')} value={order.addedTimeLabel} /> : null}
      {order.materialsLabel ? <DefinitionRow icon="package-variant" label={customerProjectMessage('change.materials')} value={order.materialsLabel} /> : null}
      <View style={{ gap: theme.spacing.xs }}>
        <DefinitionRow icon="cash" label={customerProjectMessage('change.currentTotal')} value={formatProjectMoney(order.baseTotal)} />
        <DefinitionRow icon="plus-circle-outline" label={customerProjectMessage('change.additional')} value={formatProjectMoney(order.additionalAmount)} />
        <DefinitionRow icon="cash-check" label={customerProjectMessage('change.revised')} value={formatProjectMoney(order.revisedTotal)} tone="positive" />
      </View>
      {order.expiresAt ? <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>Expires {order.expiresAt}</Text> : null}
      {pending ? (
        <>
          <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{customerProjectMessage('change.pending')}</Text>
          <View style={[styles.actionRow, { gap: theme.spacing.sm }]}>
            <Button disabled={disabled} label={customerProjectMessage('change.decline')} onPress={onDecline} variant="secondary" />
            <Button disabled={disabled} label={customerProjectMessage('change.approve')} onPress={onApprove} style={styles.flex} />
          </View>
        </>
      ) : null}
    </Surface>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  splitRow: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap' },
  actionRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap' },
  iconRow: { alignItems: 'flex-start', flexDirection: 'row' },
});

export default ActiveWorkScreen;
