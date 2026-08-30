import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTogtTheme } from '../../design';
import {
  AppScaffold,
  Button,
  Chip,
  SectionHeader,
  Surface,
  TopAppBar,
} from '../../ui';
import type { BlockReasonCode, RelationshipEligibilityDto } from '../../services/groundedTrust';
import { TrustDefinitionRow, TrustHero, TruthList, TruthNotice } from './components';
import {
  BLOCK_CONSEQUENCES,
  BLOCK_REASON_OPTIONS,
  deriveRelationshipActions,
} from './model';
import type { ConnectionState } from './model';

export type RelationshipActionsScreenProps = Readonly<{
  eligibility: RelationshipEligibilityDto;
  connectionState: ConnectionState;
  worker: Readonly<{ id: string; displayName: string; serviceLabel: string }>;
  favouriteActive: boolean;
  blockConfirmationOpen: boolean;
  selectedBlockReason: BlockReasonCode | null;
  pendingAction: 'favourite' | 'rebook' | 'recurring' | 'block' | null;
  onBack: () => void;
  onToggleFavourite: () => void;
  onCreateRebookDraft: () => void;
  onCreateRecurringSeries: () => void;
  onOpenBlockConfirmation: () => void;
  onCloseBlockConfirmation: () => void;
  onBlockReasonChange: (reason: BlockReasonCode) => void;
  onConfirmBlock: (reason: BlockReasonCode) => void;
}>;

export function RelationshipActionsScreen({
  eligibility,
  connectionState,
  worker,
  favouriteActive,
  blockConfirmationOpen,
  selectedBlockReason,
  pendingAction,
  onBack,
  onToggleFavourite,
  onCreateRebookDraft,
  onCreateRecurringSeries,
  onOpenBlockConfirmation,
  onCloseBlockConfirmation,
  onBlockReasonChange,
  onConfirmBlock,
}: RelationshipActionsScreenProps) {
  const theme = useTogtTheme();
  const actions = deriveRelationshipActions(eligibility, connectionState);
  const canToggleFavourite = connectionState === 'online'
    && (favouriteActive || eligibility.actions.favourite);
  return (
    <AppScaffold
      contentContainerStyle={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.xxxl, paddingTop: theme.spacing.md }}
      scrollable
      testID="relationship-actions-screen"
      topBar={<TopAppBar onBack={onBack} subtitle="Retention with hard boundaries" title="Work together again" />}
    >
      <TrustHero
        body="Keep a trusted connection, prepare another Project, or set a firm boundary. Eligibility comes from the latest server evidence."
        eyebrow="Relationship tools"
        icon="account-heart-outline"
        title={worker.displayName}
      />

      <Surface elevation="card" style={{ gap: theme.spacing.sm }}>
        <View style={[styles.row, { gap: theme.spacing.sm }]}>
          <MaterialCommunityIcons color={theme.colors.actionPrimary} name="briefcase-check-outline" size={theme.sizing.iconLarge} />
          <View style={styles.flex}>
            <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>{worker.serviceLabel}</Text>
            <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>Project {eligibility.projectReference}</Text>
          </View>
          <Chip
            label={eligibility.relationshipEligible ? 'Eligible' : 'Not eligible'}
            tone={eligibility.relationshipEligible ? 'brand' : 'attention'}
          />
        </View>
        <TruthList statements={[
          'Confirmed completion is required',
          'Reconciled paid payment is required',
          'No open issue or bilateral block is required',
        ]} />
      </Surface>

      {!eligibility.relationshipEligible ? (
        <TruthNotice body={actions.favourite.reason} icon="lock-outline" title="Retention actions are locked" />
      ) : null}

      <View style={{ gap: theme.spacing.sm }}>
        <SectionHeader subtitle="Each action remains explicit and reversible where supported." title="Relationship actions" />
        <Surface elevation="card" style={{ gap: theme.spacing.md }}>
          <TrustDefinitionRow
            icon={favouriteActive ? 'heart' : 'heart-outline'}
            label="Favourite"
            value={favouriteActive ? 'Saved as a favourite' : actions.favourite.reason}
          />
          <Button
            disabled={!canToggleFavourite}
            label={favouriteActive ? 'Remove favourite' : 'Add to favourites'}
            loading={pendingAction === 'favourite'}
            onPress={onToggleFavourite}
            variant="secondary"
          />
        </Surface>
        <Surface elevation="card" style={{ gap: theme.spacing.md }}>
          <TrustDefinitionRow icon="file-edit-outline" label="Rebook" value="Creates an editable draft only — no price or booking is created." />
          <Button
            disabled={!actions.rebookDraft.available}
            label="Create rebook draft"
            loading={pendingAction === 'rebook'}
            onPress={onCreateRebookDraft}
          />
        </Surface>
        <Surface elevation="card" style={{ gap: theme.spacing.md }}>
          <TrustDefinitionRow
            icon="calendar-sync-outline"
            label="Recurring series"
            value={eligibility.recurrence.configuredForService
              ? 'Terms need mutual acceptance. Each occurrence still needs booking confirmation.'
              : 'This service is not configured for recurring work.'}
          />
          <Button
            disabled={!actions.createRecurringSeries.available || !eligibility.recurrence.configuredForService}
            label="Propose recurring terms"
            loading={pendingAction === 'recurring'}
            onPress={onCreateRecurringSeries}
            variant="secondary"
          />
        </Surface>
      </View>

      <Surface style={{ gap: theme.spacing.md }} variant="danger">
        <View style={[styles.row, { gap: theme.spacing.sm }]}>
          <MaterialCommunityIcons color={theme.colors.error} name="account-cancel-outline" size={theme.sizing.iconLarge} />
          <View style={styles.flex}>
            <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>Block this person</Text>
            <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>Stops future matching, new contact and new recurring work between you.</Text>
          </View>
        </View>
        {!blockConfirmationOpen ? (
          <Button disabled={!actions.block.available} label="Review block consequences" onPress={onOpenBlockConfirmation} variant="danger" />
        ) : (
          <View style={{ gap: theme.spacing.md }}>
            <TruthList icon="block-helper" statements={BLOCK_CONSEQUENCES.statements} />
            <Text allowFontScaling style={[theme.typography.label, { color: theme.colors.text }]}>Why are you blocking?</Text>
            <View style={[styles.wrap, { gap: theme.spacing.xs }]}>
              {BLOCK_REASON_OPTIONS.map((option) => (
                <Chip
                  key={option.value}
                  label={option.label}
                  onPress={() => onBlockReasonChange(option.value)}
                  selected={selectedBlockReason === option.value}
                  tone="danger"
                />
              ))}
            </View>
            <Button
              disabled={!selectedBlockReason}
              label="Confirm block"
              loading={pendingAction === 'block'}
              onPress={() => selectedBlockReason && onConfirmBlock(selectedBlockReason)}
              variant="danger"
            />
            <Button label="Keep relationship unchanged" onPress={onCloseBlockConfirmation} variant="tertiary" />
          </View>
        )}
      </Surface>
    </AppScaffold>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { alignItems: 'flex-start', flexDirection: 'row' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
});

export default RelationshipActionsScreen;
