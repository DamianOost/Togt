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
import { TrustDefinitionRow, TrustHero, TruthList, TruthNotice } from './components';
import type { TrustEvidenceFact, TrustFairnessSnapshot } from './model';

export type TrustFairnessScreenProps = Readonly<{
  snapshot: TrustFairnessSnapshot;
  onBack: () => void;
  onOpenEvidence: (evidence: TrustEvidenceFact) => void;
  onRequestHumanReview: () => void;
}>;

export function TrustFairnessScreen({
  snapshot,
  onBack,
  onOpenEvidence,
  onRequestHumanReview,
}: TrustFairnessScreenProps) {
  const theme = useTogtTheme();
  const restriction = snapshot.restriction;
  const statusTone = restriction.status === 'active'
    ? 'danger'
    : restriction.status === 'under_review'
      ? 'attention'
      : 'brand';
  return (
    <AppScaffold
      contentContainerStyle={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.xxxl, paddingTop: theme.spacing.md }}
      scrollable
      testID="trust-fairness-screen"
      topBar={<TopAppBar onBack={onBack} subtitle="Explainable, evidence-led" title="Trust & fairness" />}
    >
      <TrustHero
        body={snapshot.summary}
        eyebrow="Your evidence"
        icon="scale-balance"
        title={snapshot.title}
      />

      <TruthNotice
        body="TOGT shows the underlying facts, their source, observation window and sample size. No opaque single rating decides this view."
        icon="eye-check-outline"
        title="How this view works"
        tone="positive"
      />

      <View style={{ gap: theme.spacing.sm }}>
        <SectionHeader subtitle="Each fact stands on its own and can be inspected." title="Evidence" />
        {snapshot.evidence.length > 0 ? snapshot.evidence.map((fact) => (
          <Surface
            accessibilityHint="Opens the evidence detail and provenance."
            elevation="card"
            key={fact.id}
            onPress={() => onOpenEvidence(fact)}
            style={{ gap: theme.spacing.sm }}
          >
            <View style={styles.splitRow}>
              <View style={styles.flex}>
                <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>{fact.label}</Text>
                <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.text }]}>{fact.valueLabel}</Text>
              </View>
              <Chip label={fact.sampleSize === null ? 'Sample unavailable' : `Sample ${fact.sampleSize}`} tone="neutral" />
            </View>
            <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{fact.explanation}</Text>
            <TrustDefinitionRow icon="database-eye-outline" label="Evidence source" value={fact.sourceLabel} />
            <TrustDefinitionRow icon="calendar-check-outline" label="Observed" value={fact.observedAt} />
          </Surface>
        )) : (
          <TruthNotice body="No verified evidence is available for this view." icon="database-off-outline" title="Evidence unavailable" tone="subtle" />
        )}
      </View>

      <Surface elevation="card" style={{ gap: theme.spacing.md }} variant={restriction.status === 'active' ? 'danger' : restriction.status === 'under_review' ? 'attention' : 'subtle'}>
        <View style={styles.splitRow}>
          <View style={styles.flex}>
            <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>Account decision</Text>
            <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{restriction.reasonLabel}</Text>
          </View>
          <Chip label={restriction.status.replaceAll('_', ' ')} tone={statusTone} />
        </View>
        {restriction.reasonCode ? <TrustDefinitionRow icon="identifier" label="Reason code" value={restriction.reasonCode} /> : null}
        {restriction.evidence.length > 0 ? (
          <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>{restriction.evidence.length} evidence item{restriction.evidence.length === 1 ? '' : 's'} linked without exposing private incident narratives.</Text>
        ) : null}
      </Surface>

      <View style={{ gap: theme.spacing.sm }}>
        <SectionHeader subtitle="Concrete next steps, not vague behavioural advice." title="Recovery and next steps" />
        {restriction.recoverySteps.length > 0 ? (
          <Surface style={{ gap: theme.spacing.sm }}><TruthList statements={restriction.recoverySteps} /></Surface>
        ) : (
          <TruthNotice body="No recovery step is required for the current state." icon="check-decagram-outline" title="No action required" tone="positive" />
        )}
      </View>

      {restriction.humanReview.available ? (
        <Surface style={{ gap: theme.spacing.sm }} variant="attention">
          <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>Human review</Text>
          <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>Creates an in-app record for review. Submission alone does not promise an acknowledgement time or outcome.</Text>
          <Button label={restriction.humanReview.actionLabel} onPress={onRequestHumanReview} variant="secondary" />
        </Surface>
      ) : (
        <TruthNotice body={`Human review is unavailable: ${restriction.humanReview.reasonCode.replaceAll('_', ' ')}.`} icon="account-off-outline" title="Review unavailable" />
      )}
    </AppScaffold>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  splitRow: { alignItems: 'flex-start', flexDirection: 'row' },
});

export default TrustFairnessScreen;
