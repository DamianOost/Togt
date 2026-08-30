import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTogtTheme } from '../../../design';
import { AppScaffold, Button, SectionHeader, StatusPill, Surface, TextField, TopAppBar } from '../../../ui';
import { workerLifecycleMessage } from './copy';
import { LifecycleResource } from './components';
import { deriveActivationPresentation, hasImplementedActivationContentContract } from './model';
import type {
  ActivationChecklistItem,
  ActivationAcknowledgementKind,
  ActivationAcknowledgementPolicy,
  ActivationSnapshot,
  ConnectionState,
  LifecycleResourceState,
} from './model';

export type WorkerActivationScreenProps = Readonly<{
  activation: LifecycleResourceState<ActivationSnapshot>;
  connectionState: ConnectionState;
  onBack: () => void;
  onRetry: () => void;
  onOpenItem: (destinationKey: string, itemId: string) => void;
  onAcknowledgePolicy: (
    kind: ActivationAcknowledgementKind,
    policyVersion: string,
    expectedRevision: number,
    itemId: string,
  ) => void;
  onSaveEmergencyContact: (phone: string, itemId: string) => void;
  mutationItemId: string | null;
  onOpenAvailability: () => void;
}>;

export function WorkerActivationScreen({
  activation,
  connectionState,
  onBack,
  onRetry,
  onOpenItem,
  onAcknowledgePolicy,
  onSaveEmergencyContact,
  mutationItemId,
  onOpenAvailability,
}: WorkerActivationScreenProps) {
  const theme = useTogtTheme();
  return (
    <AppScaffold
      contentContainerStyle={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.xxxl }}
      scrollable
      testID="worker-activation-screen"
      topBar={<TopAppBar onBack={onBack} title={workerLifecycleMessage('activation.title')} />}
    >
      <LifecycleResource connectionState={connectionState} onRetry={onRetry} resource={activation}>
        {(snapshot) => {
          const presentation = deriveActivationPresentation(snapshot, connectionState);
          const publicItems = snapshot.items.filter((item) => item.visibility === 'public');
          const privateItems = snapshot.items.filter((item) => item.visibility === 'private');
          return (
            <>
              <Surface elevation="card" style={{ gap: theme.spacing.md }} variant={presentation.canRequestOnline ? 'positive' : 'attention'}>
                <View style={[styles.heading, { gap: theme.spacing.md }]}>
                  <View style={[styles.glyph, { backgroundColor: theme.colors.surfacePositive, borderRadius: theme.radius.hero }]}>
                    <MaterialCommunityIcons color={theme.colors.actionPrimary} name="account-hard-hat-outline" size={theme.sizing.iconLarge} />
                  </View>
                  <View style={styles.flex}>
                    <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h1, { color: theme.colors.text }]}>{workerLifecycleMessage('activation.heading')}</Text>
                    <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.textSecondary }]}>{workerLifecycleMessage('activation.body')}</Text>
                  </View>
                </View>
                <Text accessibilityLabel={`${presentation.completeCount} of ${presentation.requiredCount} required setup items complete`} allowFontScaling style={[theme.typography.numeric, { color: theme.colors.text }]}>
                  {workerLifecycleMessage('activation.progress', { complete: presentation.completeCount, total: presentation.requiredCount })}
                </Text>
                <View accessibilityLabel="Setup progress" accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: Math.max(1, presentation.requiredCount), now: presentation.completeCount }} style={[styles.progressTrack, { backgroundColor: theme.colors.border, borderRadius: theme.radius.pill }]}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        backgroundColor: theme.colors.actionPrimary,
                        borderRadius: theme.radius.pill,
                        width: `${presentation.requiredCount === 0 ? 0 : Math.round((presentation.completeCount / presentation.requiredCount) * 100)}%`,
                      },
                    ]}
                  />
                </View>
                <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{presentation.blockerExplanation}</Text>
                <Button
                  disabled={!presentation.canRequestOnline}
                  label={presentation.canRequestOnline ? workerLifecycleMessage('activation.onlineReady') : workerLifecycleMessage('activation.openAvailability')}
                  onPress={onOpenAvailability}
                />
              </Surface>

              {presentation.invalidItemIds.length > 0 ? (
                <Surface variant="danger">
                  <Text accessibilityRole="alert" allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.error }]}>Setup evidence is inconsistent for {presentation.invalidItemIds.length} item(s). Refresh before going online.</Text>
                </Surface>
              ) : null}

              <ChecklistSection
                connectionState={connectionState}
                items={publicItems}
                mutationItemId={mutationItemId}
                onAcknowledgePolicy={onAcknowledgePolicy}
                onOpenItem={onOpenItem}
                onSaveEmergencyContact={onSaveEmergencyContact}
                policies={snapshot.acknowledgementPolicies}
                title={workerLifecycleMessage('activation.public')}
              />
              <ChecklistSection
                connectionState={connectionState}
                items={privateItems}
                mutationItemId={mutationItemId}
                onAcknowledgePolicy={onAcknowledgePolicy}
                onOpenItem={onOpenItem}
                onSaveEmergencyContact={onSaveEmergencyContact}
                policies={snapshot.acknowledgementPolicies}
                title={workerLifecycleMessage('activation.private')}
              />
              <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>{workerLifecycleMessage('common.lastUpdated', { time: snapshot.lastUpdatedAt })}</Text>
            </>
          );
        }}
      </LifecycleResource>
    </AppScaffold>
  );
}

function ChecklistSection({
  items,
  title,
  onOpenItem,
  policies,
  connectionState,
  mutationItemId,
  onAcknowledgePolicy,
  onSaveEmergencyContact,
}: Readonly<{
  items: readonly ActivationChecklistItem[];
  title: string;
  onOpenItem: (destinationKey: string, itemId: string) => void;
  policies: readonly ActivationAcknowledgementPolicy[];
  connectionState: ConnectionState;
  mutationItemId: string | null;
  onAcknowledgePolicy: (
    kind: ActivationAcknowledgementKind,
    policyVersion: string,
    expectedRevision: number,
    itemId: string,
  ) => void;
  onSaveEmergencyContact: (phone: string, itemId: string) => void;
}>) {
  const theme = useTogtTheme();
  return (
    <View style={{ gap: theme.spacing.md }}>
      <SectionHeader subtitle={title === workerLifecycleMessage('activation.public') ? 'Visible to customers where stated.' : 'Visible only in your account.'} title={title} />
      {items.map((item) => {
        const label = {
          complete: workerLifecycleMessage('activation.complete'),
          incomplete: workerLifecycleMessage('activation.incomplete'),
          failed: workerLifecycleMessage('activation.failed'),
          pending_review: workerLifecycleMessage('activation.pending'),
          not_required: workerLifecycleMessage('activation.notRequired'),
        }[item.status];
        const tone = item.status === 'complete' || item.status === 'not_required'
          ? 'complete' as const
          : item.status === 'failed'
            ? 'error' as const
            : 'pending' as const;
        const needsAction = item.status === 'incomplete' || item.status === 'failed';
        const actionable = needsAction && hasImplementedActivationContentContract(item);
        const policyKind = item.kind === 'foreground_location'
          ? 'foreground_location'
          : item.kind === 'safety_emergency'
            ? 'safety_policy'
            : item.kind === 'first_job_readiness'
              ? 'first_job_readiness'
              : null;
        const policy = policyKind === null ? null : policies.find((entry) => entry.kind === policyKind) ?? null;
        const hasInlineAction = needsAction && (policy !== null || item.kind === 'safety_emergency');
        return (
          <Surface elevation="card" key={item.itemId} style={{ gap: theme.spacing.sm }} testID={`activation-item-${item.itemId}`}>
            <View style={styles.split}>
              <View style={styles.flex}>
                <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>{item.title}</Text>
                {item.evidenceLabel ? <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{item.evidenceLabel}</Text> : null}
              </View>
              <StatusPill label={label} tone={tone} />
            </View>
            {item.remedy ? <Text allowFontScaling style={[theme.typography.body, { color: item.status === 'failed' ? theme.colors.error : theme.colors.textSecondary }]}>{item.remedy}</Text> : null}
            {hasInlineAction ? (
              <ActivationInlineRemediation
                busy={mutationItemId === item.itemId}
                connectionState={connectionState}
                item={item}
                onAcknowledgePolicy={onAcknowledgePolicy}
                onSaveEmergencyContact={onSaveEmergencyContact}
                policy={policy}
              />
            ) : null}
            {actionable ? (
              <Button
                accessibilityHint={`Opens the setup destination for ${item.title}.`}
                label={workerLifecycleMessage('activation.openItem')}
                onPress={() => onOpenItem(item.destinationKey, item.itemId)}
                variant="secondary"
              />
            ) : null}
            {needsAction && !actionable && !hasInlineAction ? (
              <Text
                accessibilityRole="alert"
                allowFontScaling
                style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}
              >
                {workerLifecycleMessage('activation.actionUnavailable')}
              </Text>
            ) : null}
          </Surface>
        );
      })}
    </View>
  );
}

function ActivationInlineRemediation({
  busy,
  connectionState,
  item,
  policy,
  onAcknowledgePolicy,
  onSaveEmergencyContact,
}: Readonly<{
  busy: boolean;
  connectionState: ConnectionState;
  item: ActivationChecklistItem;
  policy: ActivationAcknowledgementPolicy | null;
  onAcknowledgePolicy: (
    kind: ActivationAcknowledgementKind,
    policyVersion: string,
    expectedRevision: number,
    itemId: string,
  ) => void;
  onSaveEmergencyContact: (phone: string, itemId: string) => void;
}>) {
  const theme = useTogtTheme();
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const phoneValid = /^\+?[0-9][0-9 ()-]{5,28}[0-9]$/.test(emergencyPhone.trim());
  return (
    <View style={{ gap: theme.spacing.sm }}>
      {policy?.status === 'available' ? (
        <Surface elevation="flat" style={{ gap: theme.spacing.sm }} variant="subtle" testID={`activation-policy-${policy.kind}`}>
          <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>{policy.title}</Text>
          <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.textSecondary }]}>{policy.body}</Text>
          {policy.acknowledgedCurrent ? (
            <StatusPill label="Current version acknowledged" tone="complete" />
          ) : (
            <Button
              accessibilityHint="Records only this versioned acknowledgement. Device permission and other readiness checks remain separate."
              disabled={connectionState === 'offline'}
              label={policy.acknowledgementLabel}
              loading={busy}
              onPress={() => onAcknowledgePolicy(
                policy.kind,
                policy.policyVersion,
                policy.expectedRevision,
                item.itemId,
              )}
              testID={`acknowledge-policy-${policy.kind}`}
              variant="secondary"
            />
          )}
        </Surface>
      ) : policy?.status === 'unavailable' ? (
        <Text accessibilityRole="alert" allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>
          {policy.explanation}
        </Text>
      ) : null}
      {item.kind === 'safety_emergency' ? (
        <Surface elevation="flat" style={{ gap: theme.spacing.sm }} variant="subtle">
          <TextField
            autoComplete="tel"
            disabled={busy || connectionState === 'offline'}
            helperText="Stored privately for readiness. It is never published on your Worker profile."
            keyboardType="phone-pad"
            label="Private emergency contact number"
            onChangeText={setEmergencyPhone}
            placeholder="e.g. 082 123 4567"
            required
            testID="worker-emergency-contact-input"
            textContentType="telephoneNumber"
            value={emergencyPhone}
          />
          <Button
            disabled={!phoneValid || connectionState === 'offline'}
            label="Save private emergency contact"
            loading={busy}
            onPress={() => onSaveEmergencyContact(emergencyPhone.trim(), item.itemId)}
            testID="save-worker-emergency-contact"
          />
        </Surface>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  heading: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap' },
  glyph: { alignItems: 'center', height: 56, justifyContent: 'center', width: 56 },
  progressTrack: { height: 8, overflow: 'hidden', width: '100%' },
  progressFill: { height: '100%' },
  split: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap' },
});

export default WorkerActivationScreen;
