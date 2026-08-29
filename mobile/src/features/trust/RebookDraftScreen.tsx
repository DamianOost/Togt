import React from 'react';
import { Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTogtTheme } from '../../design';
import {
  AppScaffold,
  Button,
  InlineError,
  SectionHeader,
  Surface,
  TextField,
  TopAppBar,
} from '../../ui';
import type { RebookDraftDto } from '../../services/groundedTrust';
import { TrustDefinitionRow, TrustHero, TruthList, TruthNotice } from './components';
import { REBOOK_CONFIRMATION_LABELS, rebookDraftIsEditable } from './model';
import type { ConnectionState } from './model';

export type RebookDraftScreenProps = Readonly<{
  draft: RebookDraftDto;
  connectionState: ConnectionState;
  scopeSummary: string;
  broadAreaLabel: string;
  requestedStartsAtLabel: string;
  saving: boolean;
  errorMessage?: string;
  onBack: () => void;
  onScopeSummaryChange: (value: string) => void;
  onBroadAreaLabelChange: (value: string) => void;
  onRequestedStartsAtChange: (value: string) => void;
  onSaveDraft: () => void;
}>;

export function RebookDraftScreen({
  draft,
  connectionState,
  scopeSummary,
  broadAreaLabel,
  requestedStartsAtLabel,
  saving,
  errorMessage,
  onBack,
  onScopeSummaryChange,
  onBroadAreaLabelChange,
  onRequestedStartsAtChange,
  onSaveDraft,
}: RebookDraftScreenProps) {
  const theme = useTogtTheme();
  const editable = rebookDraftIsEditable(draft) && connectionState === 'online';
  return (
    <AppScaffold
      bottomAction={(
        <Button
          accessibilityHint="Updates this draft only. It does not submit a booking."
          disabled={!editable || saving}
          fullWidth
          label={saving ? 'Saving draft…' : 'Save draft'}
          loading={saving}
          onPress={onSaveDraft}
        />
      )}
      contentContainerStyle={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.xl, paddingTop: theme.spacing.md }}
      keyboardAware
      scrollable
      testID="rebook-draft-screen"
      topBar={<TopAppBar onBack={onBack} subtitle={`Revision ${draft.revision}`} title="Rebook draft" />}
    >
      <TrustHero
        body="Bring forward what worked, then review the current scope, place, schedule, price and availability before any later booking step."
        eyebrow="Editable draft"
        icon="file-edit-outline"
        title={draft.service.label}
      />

      <Surface elevation="card" style={{ gap: theme.spacing.sm }}>
        <View style={{ alignItems: 'flex-start', flexDirection: 'row', gap: theme.spacing.sm }}>
          <MaterialCommunityIcons color={theme.colors.actionPrimary} name="account-heart-outline" size={theme.sizing.iconLarge} />
          <View style={{ flex: 1 }}>
            <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>{draft.preferredWorker.displayName}</Text>
            <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>Preferred Worker from Project {draft.sourceProjectReference}</Text>
          </View>
        </View>
        <TrustDefinitionRow icon="swap-horizontal" label="Substitution" value="None. Any alternative needs your explicit selection." />
      </Surface>

      <TruthNotice
        body="This endpoint keeps submission.submitted and submission.bookingCreated false. It cannot silently submit or create a booking."
        icon="file-lock-outline"
        title="Draft, not a booking"
        tone="positive"
      />

      <View style={{ gap: theme.spacing.sm }}>
        <SectionHeader subtitle="Edit only the information you want carried into a later review." title="Draft details" />
        <TextField
          disabled={!editable}
          helperText="A short human-readable summary. Integration maps this back to editableScope."
          label="Scope summary"
          maxLength={2_000}
          multiline
          onChangeText={onScopeSummaryChange}
          value={scopeSummary}
        />
        <TextField
          disabled={!editable}
          helperText="Broad area only. Exact location is confirmed later."
          label="Broad area"
          maxLength={240}
          onChangeText={onBroadAreaLabelChange}
          value={broadAreaLabel}
        />
        <TextField
          disabled={!editable}
          helperText="A requested time, subject to Worker availability and later confirmation."
          label="Requested date and time"
          maxLength={120}
          onChangeText={onRequestedStartsAtChange}
          value={requestedStartsAtLabel}
        />
      </View>

      <Surface style={{ gap: theme.spacing.sm }} variant="attention">
        <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>Still required before booking</Text>
        <TruthList statements={[
          REBOOK_CONFIRMATION_LABELS.currentPrice,
          REBOOK_CONFIRMATION_LABELS.location,
          REBOOK_CONFIRMATION_LABELS.schedule,
          REBOOK_CONFIRMATION_LABELS.workerAvailability,
        ]} />
        <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>No price is set or included on this draft screen.</Text>
      </Surface>

      {draft.status !== 'draft' ? (
        <TruthNotice body={`This draft is ${draft.status} and cannot be edited.`} icon="lock-outline" title="Read-only draft" />
      ) : null}
      {connectionState === 'offline' ? (
        <TruthNotice body="Reconnect before saving. No offline update is queued." icon="cloud-off-outline" title="Draft changes are offline" />
      ) : null}
      {errorMessage ? <InlineError message={errorMessage} /> : null}
    </AppScaffold>
  );
}

export default RebookDraftScreen;
