import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTogtTheme } from '../../design';
import type { AssistedIntakeResponseV1 } from '../../data/grounded/intelligence';
import type { IntelligenceCapabilityState } from '../../services/groundedIntelligence';
import {
  AppScaffold,
  Button,
  Chip,
  ConsentCheckbox,
  InlineError,
  OfflineBanner,
  SectionHeader,
  Surface,
  TextField,
  TopAppBar,
} from '../../ui';
import type { AssistFieldId, AssistSource } from './model';

const FIELD_LABELS: Readonly<Record<AssistFieldId, string>> = Object.freeze({
  likely_service: 'Likely service',
  problem_description: 'Problem description',
  urgency: 'Urgency',
  materials_clues: 'Materials or tools clues',
  complexity: 'Complexity',
  pricing_mode_recommendation: 'Suggested pricing path',
});

const SOURCE_LABELS: Readonly<Record<AssistSource, string>> = Object.freeze({
  typed_text: 'Your description',
  voice_transcript: 'Protected voice transcript',
  work_photo: 'Protected work photo',
  service_catalogue: 'Published service catalogue',
});

export type AssistedIntakeScreenProps = Readonly<{
  capability: IntelligenceCapabilityState | null;
  connectionState: 'online' | 'offline';
  consentPolicyVersion: string;
  typedText: string;
  voiceAssetAttached: boolean;
  photoAssetCount: number;
  processingConsent: boolean;
  result: AssistedIntakeResponseV1 | null;
  fieldDrafts: Readonly<Partial<Record<AssistFieldId, string>>>;
  submitting: boolean;
  errorMessage: string | null;
  onBack: () => void;
  onTypedTextChange: (value: string) => void;
  onProcessingConsentChange: (value: boolean) => void;
  onExtract: () => void;
  onFieldDraftChange: (fieldId: AssistFieldId, value: string) => void;
  onConfirmField: (fieldId: AssistFieldId) => void;
  onUseReviewedDetails: () => void;
  onUseManualBrief: () => void;
}>;

function LoadingCapability({ onBack }: Readonly<{ onBack: () => void }>) {
  const theme = useTogtTheme();
  return (
    <AppScaffold
      contentContainerStyle={[styles.center, { gap: theme.spacing.sm }]}
      testID="assisted-intake-capability-loading"
      topBar={<TopAppBar onBack={onBack} title="Assisted job brief" />}
    >
      <ActivityIndicator accessibilityLabel="Checking assisted intake availability" color={theme.colors.actionPrimary} />
      <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.textSecondary }]}>Checking the approved provider and release gate…</Text>
    </AppScaffold>
  );
}

function CapabilityUnavailable({
  capability,
  onBack,
  onUseManualBrief,
}: Readonly<{
  capability: IntelligenceCapabilityState;
  onBack: () => void;
  onUseManualBrief: () => void;
}>) {
  const theme = useTogtTheme();
  return (
    <AppScaffold
      bottomAction={<Button fullWidth label="Use normal job brief" large onPress={onUseManualBrief} />}
      scrollable
      testID="assisted-intake-unavailable"
      topBar={<TopAppBar onBack={onBack} subtitle="Manual flow remains complete" title="Assisted job brief" />}
    >
      <View style={[styles.stack, { gap: theme.spacing.lg, paddingBottom: theme.spacing.xl, paddingTop: theme.spacing.md }]}>
        <Surface elevation="card" style={{ gap: theme.spacing.sm }} variant="inverse">
          <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h1, { color: theme.colors.textInverse }]}>Your brief stays in your hands</Text>
          <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.translucentSurface }]}>Assisted processing is not enabled in this APK. Nothing you type, record or photograph here is sent to an AI provider.</Text>
        </Surface>
        <Surface style={{ gap: theme.spacing.xs }} variant="positive">
          <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>No functionality is lost</Text>
          <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.textSecondary }]}>The published service catalogue and normal editable job brief remain the authoritative path for scope, schedule and price.</Text>
        </Surface>
        <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>Capability status: {capability.reasonCode.replaceAll('_', ' ')}</Text>
      </View>
    </AppScaffold>
  );
}

export function AssistedIntakeScreen({
  capability,
  connectionState,
  consentPolicyVersion,
  typedText,
  voiceAssetAttached,
  photoAssetCount,
  processingConsent,
  result,
  fieldDrafts,
  submitting,
  errorMessage,
  onBack,
  onTypedTextChange,
  onProcessingConsentChange,
  onExtract,
  onFieldDraftChange,
  onConfirmField,
  onUseReviewedDetails,
  onUseManualBrief,
}: AssistedIntakeScreenProps) {
  const theme = useTogtTheme();
  if (!capability) return <LoadingCapability onBack={onBack} />;
  if (!capability.available) {
    return <CapabilityUnavailable capability={capability} onBack={onBack} onUseManualBrief={onUseManualBrief} />;
  }

  const hasInput = typedText.trim().length > 0 || voiceAssetAttached || photoAssetCount > 0;
  if (!result) {
    return (
      <AppScaffold
        bottomAction={(
          <View style={{ gap: theme.spacing.sm }}>
            <Button
              disabled={!hasInput || !processingConsent || connectionState === 'offline'}
              fullWidth
              label="Create editable summary"
              large
              loading={submitting}
              onPress={onExtract}
            />
            <Button fullWidth label="Use normal job brief" onPress={onUseManualBrief} variant="tertiary" />
          </View>
        )}
        keyboardAware
        scrollable
        testID="assisted-intake-capture"
        topBar={<TopAppBar onBack={onBack} subtitle="Assistance only—never an automatic decision" title="Assisted job brief" />}
      >
        <View style={[styles.stack, { gap: theme.spacing.lg, paddingBottom: theme.spacing.xl, paddingTop: theme.spacing.md }]}>
          <Surface elevation="card" style={{ gap: theme.spacing.sm }} variant="inverse">
            <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h1, { color: theme.colors.textInverse }]}>Describe it naturally. Review it carefully.</Text>
            <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.translucentSurface }]}>TOGT can structure your description, but you still confirm every field and continue through the normal service, scope, price and Worker flow.</Text>
          </Surface>
          {connectionState === 'offline' ? <OfflineBanner message="Reconnect before assisted processing. Nothing is queued or sent." /> : null}
          <TextField
            helperText="Do not include a phone number, email, identity number, exact coordinates, password or emergency details. Use Safety & Help for hazards."
            label="What needs doing?"
            maxLength={4_000}
            multiline
            onChangeText={onTypedTextChange}
            required={!voiceAssetAttached && photoAssetCount === 0}
            value={typedText}
          />
          <View style={{ gap: theme.spacing.sm }}>
            <SectionHeader subtitle="Only protected references from an approved upload flow may be processed." title="Voice and photos" />
            <View style={[styles.row, { gap: theme.spacing.xs }]}>
              <Chip label={voiceAssetAttached ? '1 protected voice reference' : 'No voice reference'} tone={voiceAssetAttached ? 'brand' : 'neutral'} />
              <Chip label={`${photoAssetCount} protected photo${photoAssetCount === 1 ? '' : 's'}`} tone={photoAssetCount > 0 ? 'brand' : 'neutral'} />
            </View>
          </View>
          <ConsentCheckbox
            checked={processingConsent}
            label={`I explicitly consent to assisted processing of this description and any selected protected media under policy ${consentPolicyVersion}. I understand that I must review every derived field before it enters my normal job brief.`}
            onPress={() => onProcessingConsentChange(!processingConsent)}
            testID="assisted-processing-consent"
          />
          <Surface style={{ gap: theme.spacing.xs }} variant="attention">
            <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>What assistance cannot do</Text>
            <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>It cannot choose a Worker, set or approve a final price, charge you, verify an identity, or make a safety decision.</Text>
          </Surface>
          {errorMessage ? <InlineError message={errorMessage} /> : null}
        </View>
      </AppScaffold>
    );
  }

  return (
    <AppScaffold
      bottomAction={(
        <View style={{ gap: theme.spacing.sm }}>
          <Button
            disabled={!result.assistance.readyForDeterministicBrief}
            fullWidth
            label="Use reviewed details"
            large
            onPress={onUseReviewedDetails}
          />
          <Button fullWidth label="Discard and use normal brief" onPress={onUseManualBrief} variant="tertiary" />
        </View>
      )}
      keyboardAware
      scrollable
      testID="assisted-intake-review"
      topBar={<TopAppBar onBack={onBack} subtitle="Every field needs your confirmation" title="Review assisted summary" />}
    >
      <View style={[styles.stack, { gap: theme.spacing.lg, paddingBottom: theme.spacing.xl, paddingTop: theme.spacing.md }]}>
        <Surface style={{ gap: theme.spacing.xs }} variant="positive">
          <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>Draft only</Text>
          <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.textSecondary }]}>Edit anything that is wrong. Confirmation moves only your reviewed wording into the normal deterministic brief.</Text>
        </Surface>
        {result.assistance.fields.map((field) => (
          <Surface elevation="card" key={field.fieldId} style={{ gap: theme.spacing.sm }}>
            <View style={styles.between}>
              <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, styles.flex, { color: theme.colors.text }]}>{FIELD_LABELS[field.fieldId]}</Text>
              <Chip label={field.status === 'confirmed' ? 'Confirmed by you' : 'Needs review'} tone={field.status === 'confirmed' ? 'brand' : 'attention'} />
            </View>
            <TextField
              helperText={`${field.explanation} Confidence ${Math.round(field.confidence * 100)}%—this is not proof.`}
              label={FIELD_LABELS[field.fieldId]}
              multiline
              onChangeText={(value) => onFieldDraftChange(field.fieldId, value)}
              value={fieldDrafts[field.fieldId] ?? field.value}
            />
            <View style={[styles.row, { gap: theme.spacing.xs }]}>
              {field.sources.map((source) => <Chip key={source} label={SOURCE_LABELS[source]} />)}
            </View>
            <Button
              disabled={(fieldDrafts[field.fieldId] ?? field.value).trim().length === 0}
              label={field.status === 'confirmed' ? 'Confirm updated wording' : 'Confirm this field'}
              onPress={() => onConfirmField(field.fieldId)}
              variant="secondary"
            />
          </Surface>
        ))}
        {result.assistance.suggestedQuestions.length > 0 ? (
          <View style={{ gap: theme.spacing.sm }}>
            <SectionHeader subtitle="These prompts explain uncertainty; they do not silently fill your brief." title="Questions to consider" />
            {result.assistance.suggestedQuestions.map((question) => (
              <Surface key={question.id} style={{ gap: theme.spacing.xxs }} variant="attention">
                <Text accessibilityRole="header" allowFontScaling style={[theme.typography.label, { color: theme.colors.text }]}>{question.question}</Text>
                <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{question.reason}</Text>
              </Surface>
            ))}
          </View>
        ) : null}
        <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>Provider adapter {result.processing.providerId} · model {result.assistance.modelVersion} · prompt {result.assistance.promptVersion}. Raw inputs are not eligible for general analytics.</Text>
        {errorMessage ? <InlineError message={errorMessage} /> : null}
      </View>
    </AppScaffold>
  );
}

const styles = StyleSheet.create({
  between: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  center: { alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  stack: {},
});

export default AssistedIntakeScreen;
