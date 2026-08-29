import React, { useMemo } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppScaffold, Button, OfflineBanner, SectionHeader, Surface, TopAppBar } from '../../../ui';
import { useTogtTheme } from '../../../design';
import { CapabilityNotice, IntakeIcon, MoneyRow, ScreenHeading, SummaryRow } from './components';
import { formatZarMinor, translateCustomerIntake } from './copy';
import type { CustomerIntakeTranslate } from './copy';
import { createSubmissionIntent } from './model';
import type {
  CommercialTerms,
  CustomerIntakeDraft,
  SubmissionCapabilityContext,
  SubmissionIntent,
} from './model';

export type ReviewDisplayLabels = Readonly<{
  addressLabel: string | null;
  scheduleLabel: string | null;
  fulfilmentLabel: string | null;
  workerCriteriaLabel: string | null;
  paymentAssuranceLabel: string | null;
}>;

export type ReviewEstimateScreenProps = Readonly<{
  draft: CustomerIntakeDraft;
  capabilities: SubmissionCapabilityContext;
  displayLabels: ReviewDisplayLabels;
  now: string;
  submitting: boolean;
  translate?: CustomerIntakeTranslate;
  onBack: () => void;
  onSaveDraft: () => void;
  onEditServiceBrief: () => void;
  onEditAddress: () => void;
  onEditSchedule: () => void;
  onEditCommercialTerms: () => void;
  onEditPayment: () => void;
  onConfirm: (intent: SubmissionIntent) => void;
}>;

function ReviewSection({
  title,
  onEdit,
  translate,
  children,
}: {
  title: string;
  onEdit: () => void;
  translate: CustomerIntakeTranslate;
  children: ReactNode;
}) {
  const theme = useTogtTheme();
  return (
    <View>
      <SectionHeader actionLabel={translate('common.edit')} onAction={onEdit} title={title} />
      <Surface elevation="card" style={{ marginTop: theme.spacing.xs }}>
        {children}
      </Surface>
    </View>
  );
}

function CommercialSummary({
  terms,
  translate,
}: {
  terms: CommercialTerms;
  translate: CustomerIntakeTranslate;
}) {
  const theme = useTogtTheme();
  if (terms.pricingMode === 'fixed') {
    return (
      <View>
        <MoneyRow label={translate('review.labour')} value={formatZarMinor(terms.labourAmountMinor)} />
        <MoneyRow label={translate('review.platformFee')} value={formatZarMinor(terms.platformFeeMinor)} />
        <View style={[styles.rule, { backgroundColor: theme.colors.border, height: theme.border.thin, marginVertical: theme.spacing.xs }]} />
        <MoneyRow emphasised label={translate('review.total')} value={formatZarMinor(terms.allInTotalMinor)} />
        <SummaryRow icon="package-variant" label={translate('review.materials')} value={terms.materialsAssumption} />
        <SummaryRow icon="calendar-remove-outline" label={translate('review.cancellation')} value={terms.cancellationSummary} />
      </View>
    );
  }
  if (terms.pricingMode === 'hourly') {
    return (
      <View>
        <MoneyRow label={translate('review.hourlyRate')} value={formatZarMinor(terms.hourlyRateMinor)} />
        <MoneyRow
          label={translate('review.estimatedHours')}
          value={`${terms.estimatedHours.min}–${terms.estimatedHours.max}`}
        />
        <MoneyRow
          label={translate('review.estimatedRange')}
          value={`${formatZarMinor(terms.estimatedTotalMinor.min)} – ${formatZarMinor(terms.estimatedTotalMinor.max)}`}
        />
        <View style={[styles.rule, { backgroundColor: theme.colors.border, height: theme.border.thin, marginVertical: theme.spacing.xs }]} />
        <MoneyRow emphasised label={translate('review.approvalCap')} value={formatZarMinor(terms.approvalCapMinor)} />
        <SummaryRow icon="information-outline" label={translate('review.platformFee')} value={terms.platformFeeAssumption} />
        <SummaryRow icon="package-variant" label={translate('review.materials')} value={terms.materialsAssumption} />
        <SummaryRow icon="calendar-remove-outline" label={translate('review.cancellation')} value={terms.cancellationSummary} />
      </View>
    );
  }
  if (terms.pricingMode === 'remote_quote') {
    return (
      <View style={{ rowGap: theme.spacing.sm }}>
        <MoneyRow
          label={translate(terms.requestFeeMinor === null || terms.requestFeeMinor === 0 ? 'review.noRequestFee' : 'review.requestFee')}
          value={terms.requestFeeMinor === null || terms.requestFeeMinor === 0 ? '—' : formatZarMinor(terms.requestFeeMinor)}
        />
        <Surface style={{ padding: theme.spacing.sm }} variant="attention">
          <View style={[styles.row, { columnGap: theme.spacing.sm }]}>
            <IntakeIcon name="file-document-edit-outline" tone="attention" />
            <Text allowFontScaling style={[theme.typography.bodySmall, styles.flex, { color: theme.colors.text }]}>
              {translate('review.quotePending')}
            </Text>
          </View>
        </Surface>
        <SummaryRow icon="package-variant" label={translate('review.materials')} value={terms.materialsAssumption} />
        <SummaryRow icon="calendar-remove-outline" label={translate('review.cancellation')} value={terms.cancellationSummary} />
      </View>
    );
  }
  return (
    <View style={{ rowGap: theme.spacing.sm }}>
      <MoneyRow label={translate('review.diagnosticFee')} value={formatZarMinor(terms.diagnosticFeeMinor)} />
      <MoneyRow label={translate('review.platformFee')} value={formatZarMinor(terms.platformFeeMinor)} />
      <MoneyRow emphasised label={translate('review.total')} value={formatZarMinor(terms.visitTotalMinor)} />
      <SummaryRow icon="clipboard-check-outline" label={translate('review.diagnosticDeliverable')} value={terms.deliverable} />
      <Surface style={{ padding: theme.spacing.sm }} variant="attention">
        <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.text }]}>
          {translate('review.laterWorkSeparate')}
        </Text>
      </Surface>
      <SummaryRow icon="calendar-remove-outline" label={translate('review.cancellation')} value={terms.cancellationSummary} />
    </View>
  );
}

function confirmationLabel(terms: CommercialTerms | null, translate: CustomerIntakeTranslate): string {
  if (!terms) return translate('review.confirmFixed');
  return {
    fixed: translate('review.confirmFixed'),
    hourly: translate('review.confirmHourly'),
    remote_quote: translate('review.confirmQuote'),
    diagnostic_visit: translate('review.confirmDiagnostic'),
  }[terms.pricingMode];
}

export function ReviewEstimateScreen({
  draft,
  capabilities,
  displayLabels,
  now,
  submitting,
  translate = translateCustomerIntake,
  onBack,
  onSaveDraft,
  onEditServiceBrief,
  onEditAddress,
  onEditSchedule,
  onEditCommercialTerms,
  onEditPayment,
  onConfirm,
}: ReviewEstimateScreenProps) {
  const theme = useTogtTheme();
  const intentResult = useMemo(
    () => createSubmissionIntent(draft, capabilities, now),
    [capabilities, draft, now],
  );
  const fallback = translate('review.notProvided');
  const selectedServiceLabel = draft.selectedService?.label ?? fallback;
  const fulfilmentLabel = displayLabels.fulfilmentLabel ?? fallback;
  const addressLabel = displayLabels.addressLabel ?? fallback;
  const scheduleLabel = displayLabels.scheduleLabel ?? fallback;

  return (
    <AppScaffold
      bottomAction={(
        <View style={{ rowGap: theme.spacing.sm }}>
          <Button
            disabled={!intentResult.ok}
            fullWidth
            label={submitting ? translate('review.submitting') : confirmationLabel(draft.commercialTerms, translate)}
            large
            loading={submitting}
            onPress={() => {
              if (intentResult.ok) onConfirm(intentResult.intent);
            }}
          />
          <Text allowFontScaling style={[theme.typography.caption, styles.center, { color: theme.colors.textSecondary }]}>
            {translate('review.immutable')}
          </Text>
          <Button fullWidth label={translate('review.offlineSave')} onPress={onSaveDraft} variant="tertiary" />
        </View>
      )}
      scrollable
      testID="review-estimate-screen"
      topBar={<TopAppBar onBack={onBack} title={translate('review.title')} />}
    >
      <View style={{ paddingBottom: theme.spacing.xxl, paddingTop: theme.spacing.md, rowGap: theme.spacing.xl }}>
        <ScreenHeading title={translate('review.title')} />
        {draft.connectionState === 'offline' ? <OfflineBanner message={translate('brief.offline')} /> : null}

        {!intentResult.readiness.ready ? (
          <Surface accessibilityLabel={translate('review.blocked')} variant="attention">
            <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>
              {translate('review.blocked')}
            </Text>
            <View style={{ marginTop: theme.spacing.xs, rowGap: theme.spacing.xs }}>
              {intentResult.readiness.blockers.map((item) => (
                <View key={item.code} style={[styles.row, { columnGap: theme.spacing.xs }]}>
                  <IntakeIcon name="alert-circle-outline" tone="attention" size={theme.sizing.iconSmall} />
                  <Text allowFontScaling style={[theme.typography.bodySmall, styles.flex, { color: theme.colors.text }]}>
                    {item.explanation}
                  </Text>
                </View>
              ))}
            </View>
          </Surface>
        ) : null}

        <ReviewSection onEdit={onEditServiceBrief} title={translate('review.service')} translate={translate}>
          <SummaryRow icon="toolbox-outline" label={selectedServiceLabel} value={draft.needText || fallback} />
          <SummaryRow
            icon="camera-outline"
            label={translate('review.briefDescription')}
            value={translate('review.attachments', { count: draft.brief.attachments.length })}
          />
        </ReviewSection>

        <ReviewSection onEdit={onEditAddress} title={translate('review.address')} translate={translate}>
          <SummaryRow icon="map-marker-outline" label={translate('review.address')} value={addressLabel} />
          <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>
            {translate('address.privacy')}
          </Text>
        </ReviewSection>

        <ReviewSection onEdit={onEditSchedule} title={translate('review.schedule')} translate={translate}>
          <SummaryRow icon="calendar-clock-outline" label={translate('review.schedule')} value={scheduleLabel} />
          <SummaryRow icon="account-switch-outline" label={translate('review.fulfilment')} value={fulfilmentLabel} />
          {displayLabels.workerCriteriaLabel ? (
            <SummaryRow icon="filter-check-outline" label={translate('review.fulfilment')} value={displayLabels.workerCriteriaLabel} />
          ) : null}
        </ReviewSection>

        <ReviewSection onEdit={onEditCommercialTerms} title={translate('review.estimate')} translate={translate}>
          {draft.commercialTerms ? (
            <CommercialSummary terms={draft.commercialTerms} translate={translate} />
          ) : (
            <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.textSecondary }]}>{fallback}</Text>
          )}
        </ReviewSection>

        <ReviewSection onEdit={onEditPayment} title={translate('review.payment')} translate={translate}>
          {draft.commercialTerms?.pricingMode === 'remote_quote'
            && (draft.commercialTerms.requestFeeMinor === null || draft.commercialTerms.requestFeeMinor === 0) ? (
              <SummaryRow
                icon="credit-card-off-outline"
                label={translate('review.payment')}
                value={translate('review.paymentNotRequired')}
              />
            ) : capabilities.payment.status === 'available' && displayLabels.paymentAssuranceLabel ? (
            <SummaryRow
              icon="credit-card-check-outline"
              label={translate('review.payment')}
              value={displayLabels.paymentAssuranceLabel}
            />
          ) : (
            <CapabilityNotice capability={capabilities.payment} title={translate('review.payment')} />
          )}
        </ReviewSection>
      </View>
    </AppScaffold>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { alignItems: 'flex-start', flexDirection: 'row' },
  rule: { width: '100%' },
  center: { textAlign: 'center' },
});

export default ReviewEstimateScreen;
