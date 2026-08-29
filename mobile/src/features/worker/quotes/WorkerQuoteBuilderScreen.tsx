import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTogtTheme } from '../../../design';
import type { WorkerQuote, WorkerQuoteRequest } from '../../../data/grounded';
import {
  AppScaffold,
  Button,
  InlineError,
  OfflineBanner,
  SectionHeader,
  StatusPill,
  Surface,
  TextField,
  TopAppBar,
} from '../../../ui';
import type { WorkerQuoteActions, WorkerQuoteForm, WorkerQuoteFormErrors, WorkerQuoteFormField } from './model';

export type WorkerQuoteBuilderScreenProps = Readonly<{
  request: WorkerQuoteRequest;
  quote: WorkerQuote | null;
  form: WorkerQuoteForm;
  errors: WorkerQuoteFormErrors;
  actions: WorkerQuoteActions;
  connection: 'online' | 'offline';
  pendingAction: 'save' | 'submit' | 'withdraw' | null;
  commandError: string | null;
  onBack: () => void;
  onChange: (field: WorkerQuoteFormField, value: string) => void;
  onSaveDraft: () => void;
  onSubmit: () => void;
  onWithdraw: () => void;
  onRefresh: () => void;
}>;

function formatZarMinor(value: number): string {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(value / 100);
}

function enteredTotal(form: WorkerQuoteForm): number | null {
  if (!/^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(form.labourAmount.trim())
      || !/^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(form.materialsAmount.trim())) return null;
  return Math.round((Number(form.labourAmount) + Number(form.materialsAmount)) * 100);
}

function evidenceLabel(label: string, evidence: WorkerQuote['platformFee']): string {
  if (evidence.amountMinor !== null) return `${label}: ${formatZarMinor(evidence.amountMinor)}`;
  return `${label}: ${evidence.state.replace(/[_.:-]+/g, ' ')}`;
}

function errorProp(error: string | undefined): Readonly<{ error: string }> | Readonly<Record<never, never>> {
  return error ? Object.freeze({ error }) : Object.freeze({});
}

type QuoteDateField = 'proposedStartAt' | 'proposedEndAt' | 'validUntil';

function formatDateTime(value: string): string {
  if (!Number.isFinite(Date.parse(value))) return 'Date and time unavailable';
  return new Intl.DateTimeFormat('en-ZA', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'Africa/Johannesburg',
  }).format(new Date(value));
}

function DateTimeField({
  label,
  value,
  error,
  disabled,
  onPick,
}: Readonly<{
  label: string;
  value: string;
  error?: string;
  disabled: boolean;
  onPick: (mode: 'date' | 'time') => void;
}>) {
  const theme = useTogtTheme();
  return (
    <View style={{ rowGap: theme.spacing.xs }}>
      <Surface variant="subtle">
        <Text allowFontScaling style={[theme.typography.label, { color: theme.colors.textSecondary }]}>{label} (required)</Text>
        <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.text, marginTop: theme.spacing.xxs }]}>{formatDateTime(value)}</Text>
        <View style={[styles.dateActions, { columnGap: theme.spacing.xs, marginTop: theme.spacing.sm }]}>
          <Button disabled={disabled} label="Change date" onPress={() => onPick('date')} variant="tertiary" />
          <Button disabled={disabled} label="Change time" onPress={() => onPick('time')} variant="tertiary" />
        </View>
      </Surface>
      {error ? <InlineError message={error} /> : null}
    </View>
  );
}

export function WorkerQuoteBuilderScreen({
  request,
  quote,
  form,
  errors,
  actions,
  connection,
  pendingAction,
  commandError,
  onBack,
  onChange,
  onSaveDraft,
  onSubmit,
  onWithdraw,
  onRefresh,
}: WorkerQuoteBuilderScreenProps) {
  const theme = useTogtTheme();
  const [picker, setPicker] = useState<Readonly<{ field: QuoteDateField; mode: 'date' | 'time' }> | null>(null);
  const total = enteredTotal(form);
  const disabled = actions.readOnly;
  return (
    <AppScaffold
      bottomAction={!actions.readOnly ? (
        <View style={[styles.actionRow, { columnGap: theme.spacing.sm, rowGap: theme.spacing.sm }]}>
          <Button
            disabled={!actions.canSaveDraft || pendingAction !== null}
            label={quote?.status === 'submitted' ? 'Save changes' : 'Save draft'}
            loading={pendingAction === 'save'}
            onPress={onSaveDraft}
            style={styles.action}
            variant="secondary"
          />
          <Button
            disabled={!actions.canSubmit || pendingAction !== null}
            label="Submit quote"
            loading={pendingAction === 'submit'}
            onPress={onSubmit}
            style={styles.action}
          />
        </View>
      ) : undefined}
      contentContainerStyle={{ paddingBottom: theme.spacing.xxxxl, paddingTop: theme.spacing.md }}
      keyboardAware
      scrollable
      testID="worker-quote-builder-screen"
      topBar={<TopAppBar onBack={onBack} title="Quote builder" />}
    >
      <View style={{ rowGap: theme.spacing.xl }}>
        <View style={{ rowGap: theme.spacing.xs }}>
          <View style={[styles.headingRow, { columnGap: theme.spacing.sm, rowGap: theme.spacing.xs }]}>
            <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h1, styles.flex, { color: theme.colors.text }]}>
              {request.service.label}
            </Text>
            <StatusPill label={quote ? `${quote.status} · v${quote.version}` : 'New draft'} tone={quote?.status === 'submitted' ? 'inProgress' : quote?.status === 'accepted' ? 'complete' : 'pending'} />
          </View>
          <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.textSecondary }]}>
            Build one complete, versioned offer. Customer location remains limited to {request.broadAreaLabel}.
          </Text>
        </View>

        {connection === 'offline' ? <OfflineBanner message="Reconnect before saving or submitting. No commercial change is queued offline." /> : null}
        {commandError ? (
          <View style={{ rowGap: theme.spacing.sm }}>
            <InlineError message={commandError} testID="worker-quote-command-error" />
            <Button label="Refresh latest state" onPress={onRefresh} variant="tertiary" />
          </View>
        ) : null}
        {actions.reason ? (
          <Surface variant="subtle"><Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{actions.reason}</Text></Surface>
        ) : null}

        <View>
          <SectionHeader subtitle="Be explicit about what is and is not included." title="Scope" />
          <View style={{ marginTop: theme.spacing.sm, rowGap: theme.spacing.md }}>
            <TextField
              disabled={disabled}
              {...errorProp(errors.scope)}
              label="Scope"
              maxLength={4_000}
              multiline
              onChangeText={(value) => onChange('scope', value)}
              placeholder="Describe the work you will perform"
              required
              value={form.scope}
            />
            <TextField
              disabled={disabled}
              {...errorProp(errors.deliverables)}
              helperText="One deliverable per line"
              label="Deliverables"
              multiline
              onChangeText={(value) => onChange('deliverables', value)}
              required
              value={form.deliverables}
            />
            <TextField disabled={disabled} {...errorProp(errors.exclusions)} helperText="One exclusion per line" label="Exclusions" multiline onChangeText={(value) => onChange('exclusions', value)} value={form.exclusions} />
            <TextField disabled={disabled} {...errorProp(errors.assumptions)} helperText="One assumption per line" label="Assumptions" multiline onChangeText={(value) => onChange('assumptions', value)} value={form.assumptions} />
          </View>
        </View>

        <View>
          <SectionHeader subtitle="Africa/Johannesburg. Times are validated against the requested window." title="Proposed schedule" />
          <View style={{ marginTop: theme.spacing.sm, rowGap: theme.spacing.md }}>
            <DateTimeField disabled={disabled} {...errorProp(errors.proposedStartAt)} label="Starts at" onPick={(mode) => setPicker({ field: 'proposedStartAt', mode })} value={form.proposedStartAt} />
            <DateTimeField disabled={disabled} {...errorProp(errors.proposedEndAt)} label="Ends at" onPick={(mode) => setPicker({ field: 'proposedEndAt', mode })} value={form.proposedEndAt} />
            <TextField disabled={disabled} {...errorProp(errors.durationMinutes)} keyboardType="number-pad" label="Duration in minutes" onChangeText={(value) => onChange('durationMinutes', value)} required value={form.durationMinutes} />
          </View>
        </View>

        <View>
          <SectionHeader subtitle="Use 0.00 for materials when none are needed." title="Commercials" />
          <View style={{ marginTop: theme.spacing.sm, rowGap: theme.spacing.md }}>
            <TextField disabled={disabled} {...errorProp(errors.labourAmount)} keyboardType="decimal-pad" label="Labour amount (ZAR)" onChangeText={(value) => onChange('labourAmount', value)} required value={form.labourAmount} />
            <TextField disabled={disabled} {...errorProp(errors.materialsAmount)} keyboardType="decimal-pad" label="Materials amount (ZAR)" onChangeText={(value) => onChange('materialsAmount', value)} required value={form.materialsAmount} />
            <DateTimeField disabled={disabled} {...errorProp(errors.validUntil)} label="Quote valid until" onPick={(mode) => setPicker({ field: 'validUntil', mode })} value={form.validUntil} />
          </View>
          <Surface style={{ marginTop: theme.spacing.md }} variant="positive">
            <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>Entered customer total</Text>
            <Text allowFontScaling style={[theme.typography.h2, { color: theme.colors.actionPrimaryPressed, marginTop: theme.spacing.xxs }]}>
              {total === null ? 'Complete both amounts' : formatZarMinor(total)}
            </Text>
            <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary, marginTop: theme.spacing.xs }]}>
              The server validates and records the authoritative total when this quote is saved.
            </Text>
            <View style={{ marginTop: theme.spacing.sm, rowGap: theme.spacing.xxs }}>
              <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>
                {quote ? evidenceLabel('Platform fee', quote.platformFee) : 'Platform fee: not yet returned by server'}
              </Text>
              <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>
                {quote ? evidenceLabel('Worker net', quote.workerNet) : 'Worker net: not yet returned by server'}
              </Text>
            </View>
          </Surface>
        </View>

        <Surface variant="attention">
          <Text allowFontScaling style={[theme.typography.label, { color: theme.colors.text }]}>Before submitting</Text>
          <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary, marginTop: theme.spacing.xxs }]}>
            Submission makes this version visible to the customer. They can accept only one quote. Clarification messaging is unavailable in this build.
          </Text>
        </Surface>

        {actions.canWithdraw ? (
          <View>
            <SectionHeader subtitle="Withdrawal closes this offer and cannot be undone in this build." title="Withdraw quote" />
            <Button disabled={pendingAction !== null} label="Withdraw quote" loading={pendingAction === 'withdraw'} onPress={onWithdraw} variant="danger" />
          </View>
        ) : null}
        {picker ? (
          <DateTimePicker
            display="default"
            mode={picker.mode}
            onChange={(_event, value) => {
              const selection = picker;
              setPicker(null);
              if (!value) return;
              const currentValue = form[selection.field];
              const next = Number.isFinite(Date.parse(currentValue)) ? new Date(currentValue) : new Date();
              if (selection.mode === 'date') {
                next.setFullYear(value.getFullYear(), value.getMonth(), value.getDate());
              } else {
                next.setHours(value.getHours(), value.getMinutes(), 0, 0);
              }
              onChange(selection.field, next.toISOString());
            }}
            value={Number.isFinite(Date.parse(form[picker.field])) ? new Date(form[picker.field]) : new Date()}
          />
        ) : null}
      </View>
    </AppScaffold>
  );
}

const styles = StyleSheet.create({
  action: { flex: 1 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap' },
  flex: { flex: 1 },
  headingRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap' },
  dateActions: { flexDirection: 'row', flexWrap: 'wrap' },
});

export default WorkerQuoteBuilderScreen;
