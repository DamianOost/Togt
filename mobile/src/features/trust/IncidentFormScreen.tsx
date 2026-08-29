import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTogtTheme } from '../../design';
import {
  AppScaffold,
  Button,
  Chip,
  InlineError,
  SectionHeader,
  Surface,
  TextField,
  TopAppBar,
} from '../../ui';
import type { IncidentCategory, IncidentKind } from '../../services/groundedTrust';
import { TruthNotice } from './components';
import { incidentCategoryOptions } from './model';
import type { ConnectionState } from './model';

export type IncidentFormScreenProps = Readonly<{
  kind: IncidentKind;
  connectionState: ConnectionState;
  category: IncidentCategory | null;
  summary: string;
  bookingLabel?: string;
  submitting: boolean;
  errorMessage?: string;
  onBack: () => void;
  onCategoryChange: (category: IncidentCategory) => void;
  onSummaryChange: (summary: string) => void;
  onSubmit: () => void;
}>;

export function IncidentFormScreen({
  kind,
  connectionState,
  category,
  summary,
  bookingLabel,
  submitting,
  errorMessage,
  onBack,
  onCategoryChange,
  onSummaryChange,
  onSubmit,
}: IncidentFormScreenProps) {
  const theme = useTogtTheme();
  const safety = kind === 'safety';
  const offline = connectionState === 'offline';
  const summaryValid = summary.trim().length >= 10 && summary.trim().length <= 5_000;
  const canSubmit = !offline && !submitting && category !== null && summaryValid;
  return (
    <AppScaffold
      bottomAction={(
        <Button
          accessibilityHint="Creates a record-only in-app entry."
          disabled={!canSubmit}
          fullWidth
          label={submitting ? 'Saving record…' : 'Save record'}
          loading={submitting}
          onPress={onSubmit}
        />
      )}
      contentContainerStyle={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.xl, paddingTop: theme.spacing.md }}
      keyboardAware
      scrollable
      testID="incident-form-screen"
      topBar={<TopAppBar onBack={onBack} subtitle="Record-only intake" title={safety ? 'Safety concern' : 'Support case'} />}
    >
      <Surface elevation="card" style={{ gap: theme.spacing.sm }} variant={safety ? 'danger' : 'positive'}>
        <MaterialCommunityIcons
          color={safety ? theme.colors.error : theme.colors.actionPrimary}
          name={safety ? 'shield-alert-outline' : 'lifebuoy'}
          size={theme.sizing.iconLarge}
        />
        <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h2, { color: theme.colors.text }]}>
          {safety ? 'Create a private safety record' : 'Create a private support record'}
        </Text>
        <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.textSecondary }]}>
          This stores what you report. The accepted channel is in_app_record with record_only support.
        </Text>
      </Surface>

      <TruthNotice
        body="This form does not dispatch emergency services, alert an operated response desk, promise human acknowledgement, or start a response SLA. For immediate danger, go back and use the separate phone dialler."
        icon="information-outline"
        title="What saving means"
      />

      {bookingLabel ? (
        <Surface style={{ gap: theme.spacing.xxs }}>
          <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>Linked Project</Text>
          <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.text }]}>{bookingLabel}</Text>
        </Surface>
      ) : null}

      <View style={{ gap: theme.spacing.sm }}>
        <SectionHeader subtitle="Choose the closest fit. You can explain the detail below." title="What happened?" />
        <View style={[styles.wrap, { gap: theme.spacing.xs }]}>
          {incidentCategoryOptions(kind).map((option) => (
            <Chip
              accessibilityHint={option.description}
              key={option.value}
              label={option.label}
              onPress={() => onCategoryChange(option.value)}
              selected={category === option.value}
              tone={safety ? 'danger' : 'brand'}
            />
          ))}
        </View>
      </View>

      <TextField
        {...(summary.length > 0 && !summaryValid
          ? { error: 'Add at least 10 characters and keep the record under 5,000 characters.' }
          : {})}
        helperText="Include only information needed to understand this concern."
        label="What should the record say?"
        maxLength={5_000}
        multiline
        onChangeText={onSummaryChange}
        required
        value={summary}
      />

      {errorMessage ? <InlineError message={errorMessage} /> : null}
      {offline ? (
        <TruthNotice
          body="Reconnect before saving. This report is not queued locally and nothing has been sent."
          icon="cloud-off-outline"
          title="Not sent while offline"
        />
      ) : null}
    </AppScaffold>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
});

export default IncidentFormScreen;
