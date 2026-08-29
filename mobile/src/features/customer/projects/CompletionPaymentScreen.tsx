import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTogtTheme } from '../../../design';
import { AppScaffold, Button, Chip, SectionHeader, StatusPill, Surface, TopAppBar } from '../../../ui';
import { customerProjectMessage, formatProjectMoney } from './copy';
import { DefinitionRow, ProjectScreenState } from './components';
import {
  canShowRetentionActions,
  createCustomerCommandIntent,
  derivePaymentView,
} from './model';
import type {
  CompletionPaymentViewSnapshot,
  CustomerCommandIntent,
  Loadable,
} from './model';

type CompletionPaymentCommand =
  | 'confirm_completion'
  | 'start_checkout'
  | 'retry_checkout'
  | 'declare_cash_payment'
  | 'submit_rating'
  | 'favourite_worker'
  | 'start_rebook';

export type CompletionPaymentScreenProps = Readonly<{
  project: Loadable<CompletionPaymentViewSnapshot>;
  actorId: string;
  commandKeys: Readonly<Record<CompletionPaymentCommand, string>>;
  onBack: () => void;
  onRetryLoad: () => void;
  onSelectRating: (rating: 1 | 2 | 3 | 4 | 5) => void;
  onOpenIssueForm: (projectId: string) => void;
  onCommand: (intent: CustomerCommandIntent) => void;
  onOpenSupport: (projectId: string) => void;
}>;

export function CompletionPaymentScreen({
  project,
  actorId,
  commandKeys,
  onBack,
  onRetryLoad,
  onSelectRating,
  onOpenIssueForm,
  onCommand,
  onOpenSupport,
}: CompletionPaymentScreenProps) {
  const theme = useTogtTheme();
  return (
    <AppScaffold
      contentContainerStyle={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.xxxl }}
      scrollable
      testID="completion-payment-screen"
      topBar={<TopAppBar onBack={onBack} title={customerProjectMessage('payment.title')} />}
    >
      <ProjectScreenState
        emptyBody="No completion or payment state was supplied."
        emptyTitle="Completion unavailable"
        errorBody="No completion, payment or rating state was changed."
        errorTitle="Completion details could not be loaded"
        loadingLabel="Loading completion and payment"
        onRetry={onRetryLoad}
        value={project}
      >
        {(snapshot, connectionState) => {
          const offline = connectionState === 'offline';
          const paymentView = derivePaymentView(snapshot.payment);
          const retention = canShowRetentionActions({
            capabilities: snapshot.retention,
            completion: snapshot.completion,
            payment: snapshot.payment,
          });
          const emit = (
            command: CompletionPaymentCommand,
            targetId: string | null = null,
            payload: Readonly<Record<string, string | number | boolean>> = {},
          ) => {
            const result = createCustomerCommandIntent({
              actorId,
              command,
              connectionState,
              projectId: snapshot.projectId,
              requestKey: commandKeys[command],
              stateVersion: snapshot.stateVersion,
              targetId,
              payload,
            });
            if (result.ok) onCommand(result.intent);
          };
          return (
            <>
              <Surface elevation="card" style={{ gap: theme.spacing.md }} variant={snapshot.completion.status === 'disputed' ? 'danger' : snapshot.completion.status === 'requested' ? 'attention' : 'subtle'}>
                <View style={styles.splitRow}>
                  <View style={styles.flex}>
                    <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h1, { color: theme.colors.text }]}>{customerProjectMessage('completion.title')}</Text>
                    <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.textSecondary }]}>
                      {snapshot.completion.status === 'requested'
                        ? customerProjectMessage('completion.requested')
                        : snapshot.completion.status === 'disputed'
                          ? customerProjectMessage('completion.disputed')
                          : snapshot.completion.status === 'not_requested'
                            ? customerProjectMessage('completion.awaiting')
                            : snapshot.completion.status.replaceAll('_', ' ')}
                    </Text>
                  </View>
                  <StatusPill
                    label={snapshot.completion.status.replaceAll('_', ' ')}
                    tone={snapshot.completion.status === 'confirmed' ? 'complete' : snapshot.completion.status === 'disputed' ? 'error' : 'pending'}
                  />
                </View>
                <DefinitionRow icon="clipboard-check-outline" label={customerProjectMessage('completion.scope')} value={snapshot.completion.scopeSummary} />
                <DefinitionRow icon="cash" label={customerProjectMessage('completion.amount')} value={formatProjectMoney(snapshot.completion.finalAmount)} />
                {snapshot.completion.evidenceLabels.length > 0 ? (
                  <View style={{ gap: theme.spacing.xs }}>
                    <Text allowFontScaling style={[theme.typography.label, { color: theme.colors.text }]}>{customerProjectMessage('completion.evidence')}</Text>
                    {snapshot.completion.evidenceLabels.map((evidence) => (
                      <View key={evidence} style={[styles.iconRow, { gap: theme.spacing.sm }]}>
                        <MaterialCommunityIcons color={theme.colors.actionPrimary} name="image-check-outline" size={theme.sizing.iconSmall} />
                        <Text allowFontScaling style={[theme.typography.bodySmall, styles.flex, { color: theme.colors.textSecondary }]}>{evidence}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                {snapshot.completion.status === 'requested' ? (
                  <View style={[styles.actionRow, { gap: theme.spacing.sm }]}>
                    <Button disabled={offline} label={customerProjectMessage('completion.issue')} onPress={() => onOpenIssueForm(snapshot.projectId)} variant="secondary" />
                    <Button disabled={offline} label={customerProjectMessage('completion.confirm')} onPress={() => emit('confirm_completion')} style={styles.flex} />
                  </View>
                ) : null}
              </Surface>

              <Surface elevation="card" style={{ gap: theme.spacing.md }} variant={paymentView.isServerVerifiedPaid ? 'positive' : snapshot.payment.paymentDisputeStatus !== 'none' ? 'danger' : 'default'}>
                <View style={styles.splitRow}>
                  <View style={styles.flex}>
                    <SectionHeader title={paymentView.statusLabel} />
                    <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.textSecondary }]}>{paymentView.body}</Text>
                  </View>
                  <StatusPill label={snapshot.payment.obligationStatus.replaceAll('_', ' ')} tone={paymentView.isServerVerifiedPaid ? 'complete' : snapshot.payment.obligationStatus === 'due' ? 'pending' : 'offline'} />
                </View>
                <DefinitionRow icon="cash" label={customerProjectMessage('payment.finalAmount')} value={formatProjectMoney(snapshot.payment.amountDue ?? snapshot.payment.amountPaid)} />
                <DefinitionRow icon="credit-card-outline" label={customerProjectMessage('payment.method')} value={snapshot.payment.methodLabel ?? 'Method not recorded'} />
                <DefinitionRow icon="refresh" label="Provider return" value={snapshot.payment.providerReturnState.replaceAll('_', ' ')} />
                {snapshot.payment.lastReconciledAt ? (
                  <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>{customerProjectMessage('payment.reconciled', { timestamp: snapshot.payment.lastReconciledAt })}</Text>
                ) : null}
                {snapshot.payment.fundingAssurance.status === 'secured' && snapshot.payment.fundingAssurance.kindLabel && snapshot.payment.fundingAssurance.assuredAmount ? (
                  <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.text }]}>
                    {customerProjectMessage('payment.assuranceSecured', {
                      amount: formatProjectMoney(snapshot.payment.fundingAssurance.assuredAmount),
                      kind: snapshot.payment.fundingAssurance.kindLabel,
                    })}
                  </Text>
                ) : (
                  <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{customerProjectMessage('payment.assuranceNone')}</Text>
                )}
                <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>{customerProjectMessage('payment.noPayoutClaim')}</Text>
                {snapshot.payment.refundStatus !== 'none' ? <DefinitionRow icon="cash-refund" label="Refund" value={snapshot.payment.refundStatus} /> : null}
                {snapshot.payment.paymentDisputeStatus !== 'none' ? <DefinitionRow icon="alert-outline" label="Payment dispute" value={snapshot.payment.paymentDisputeStatus.replaceAll('_', ' ')} tone="danger" /> : null}
                {paymentView.canStartCheckout ? <Button disabled={offline} label={customerProjectMessage('payment.checkout')} onPress={() => emit('start_checkout')} /> : null}
                {paymentView.canRetryCheckout ? <Button disabled={offline} label={customerProjectMessage('payment.retry')} onPress={() => emit('retry_checkout')} /> : null}
                {snapshot.payment.cashStatus === 'not_declared' ? <Button disabled={offline} label="Declare cash paid" onPress={() => emit('declare_cash_payment')} variant="secondary" /> : null}
                {snapshot.payment.cashStatus === 'disagreed' ? (
                  <Button label="Get help with cash disagreement" onPress={() => onOpenSupport(snapshot.projectId)} variant="danger" />
                ) : null}
              </Surface>

              {snapshot.receipt ? (
                <Surface style={{ gap: theme.spacing.sm }}>
                  <SectionHeader subtitle={customerProjectMessage('receipt.reference', { reference: snapshot.receipt.receiptId })} title={customerProjectMessage('receipt.title')} />
                  <DefinitionRow icon="briefcase-outline" label="Job" value={snapshot.receipt.serviceLabel} />
                  <DefinitionRow icon="cash-check" label="Amount" value={formatProjectMoney(snapshot.receipt.amount)} />
                  <DefinitionRow icon="receipt-text-outline" label="Fee and tax treatment" value={snapshot.receipt.feeAndTaxLabel} />
                  <DefinitionRow icon="credit-card-outline" label="Method" value={snapshot.receipt.methodLabel} />
                  <DefinitionRow icon="check-decagram-outline" label="Status" value={snapshot.receipt.statusLabel} />
                  <Text allowFontScaling selectable style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>{customerProjectMessage('receipt.support', { reference: snapshot.receipt.supportReference })}</Text>
                </Surface>
              ) : null}

              {snapshot.rating.state !== 'not_open' ? (
                <Surface style={{ gap: theme.spacing.md }}>
                  <SectionHeader title={customerProjectMessage('rating.title')} />
                  <View accessibilityLabel="Rating from 1 to 5" accessibilityRole="radiogroup" style={[styles.ratingRow, { gap: theme.spacing.xs }]}>
                    {([1, 2, 3, 4, 5] as const).map((value) => {
                      const selected = snapshot.rating.selectedValue !== null && value <= snapshot.rating.selectedValue;
                      return (
                        <Pressable
                          accessibilityLabel={`${value} out of 5`}
                          accessibilityRole="radio"
                          accessibilityState={{ checked: snapshot.rating.selectedValue === value, disabled: snapshot.rating.state !== 'open' }}
                          disabled={snapshot.rating.state !== 'open'}
                          key={value}
                          onPress={() => onSelectRating(value)}
                          style={({ pressed }) => [
                            styles.ratingButton,
                            {
                              backgroundColor: selected ? theme.colors.surfacePositive : theme.colors.surface,
                              borderColor: selected ? theme.colors.actionPrimary : theme.colors.border,
                              borderRadius: theme.radius.input,
                              minHeight: theme.sizing.touchTarget,
                              minWidth: theme.sizing.touchTarget,
                              opacity: pressed ? theme.opacity.pressed : theme.opacity.solid,
                            },
                          ]}
                        >
                          <MaterialCommunityIcons color={selected ? theme.colors.actionPrimary : theme.colors.textSecondary} name={selected ? 'star' : 'star-outline'} size={theme.sizing.iconLarge} />
                        </Pressable>
                      );
                    })}
                  </View>
                  {snapshot.rating.selectedValue ? (
                    <Text accessibilityLiveRegion="polite" allowFontScaling style={[theme.typography.body, { color: theme.colors.text }]}>
                      {customerProjectMessage('rating.selection', { value: snapshot.rating.selectedValue })}
                    </Text>
                  ) : null}
                  <View style={[styles.actionRow, { gap: theme.spacing.xs }]}>
                    {snapshot.rating.reasonLabels.map((reason) => <Chip key={reason} label={reason} selected />)}
                  </View>
                  <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{snapshot.rating.publicationLabel || customerProjectMessage('rating.private')}</Text>
                  {snapshot.rating.state === 'open' ? (
                    <Button
                      disabled={offline || snapshot.rating.selectedValue === null}
                      label={customerProjectMessage('rating.submit')}
                      onPress={() => emit('submit_rating', null, { rating: snapshot.rating.selectedValue ?? 0 })}
                    />
                  ) : (
                    <StatusPill
                      label={snapshot.rating.state === 'submitted'
                        ? 'Rating submitted privately'
                        : snapshot.rating.state === 'published'
                          ? 'Rating published'
                          : 'Rating window closed'}
                      tone={snapshot.rating.state === 'window_closed' ? 'offline' : 'complete'}
                    />
                  )}
                </Surface>
              ) : null}

              {retention.favourite || retention.rebook ? (
                <Surface style={{ gap: theme.spacing.sm }} variant="positive">
                  <SectionHeader title="Keep a good Worker" />
                  <View style={[styles.actionRow, { gap: theme.spacing.sm }]}>
                    {retention.favourite && snapshot.workerId ? <Button disabled={offline} label={customerProjectMessage('retention.favourite')} onPress={() => emit('favourite_worker', snapshot.workerId)} variant="secondary" /> : null}
                    {retention.rebook ? <Button disabled={offline} label={customerProjectMessage('retention.rebook')} onPress={() => emit('start_rebook')} /> : null}
                  </View>
                </Surface>
              ) : null}
              <Button label="Payment, issue or receipt support" onPress={() => onOpenSupport(snapshot.projectId)} variant="tertiary" />
            </>
          );
        }}
      </ProjectScreenState>
    </AppScaffold>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  splitRow: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap' },
  iconRow: { alignItems: 'flex-start', flexDirection: 'row' },
  actionRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap' },
  ratingRow: { flexDirection: 'row', flexWrap: 'wrap' },
  ratingButton: { alignItems: 'center', borderWidth: 1, justifyContent: 'center' },
});

export default CompletionPaymentScreen;
