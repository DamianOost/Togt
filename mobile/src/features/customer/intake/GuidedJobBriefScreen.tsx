import React from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppScaffold, Button, Chip, InlineError, OfflineBanner, SectionHeader, Surface, TextField, TopAppBar } from '../../../ui';
import { useTogtTheme } from '../../../design';
import { CapabilityNotice, IntakeIcon, ScreenHeading, StepProgress } from './components';
import { translateCustomerIntake } from './copy';
import type { CustomerIntakeTranslate } from './copy';
import type {
  BriefAnswerValue,
  BriefAttachment,
  BriefStep,
  CapabilityState,
  CustomerIntakeDraft,
  PricingMode,
} from './model';

export type BriefQuestionOption = Readonly<{
  value: string;
  label: string;
  explanation: string | null;
}>;

export type BriefQuestion = Readonly<{
  questionId: string;
  prompt: string;
  helperText: string | null;
  required: boolean;
  inputType: 'short_text' | 'long_text' | 'single_choice' | 'multiple_choice' | 'number' | 'boolean';
  options: readonly BriefQuestionOption[];
  maxLength: number | null;
}>;

export type PricingModeExplanation = Readonly<{
  mode: PricingMode;
  modeLabel: string;
  explanation: string;
}>;

export type GuidedJobBriefScreenProps = Readonly<{
  draft: CustomerIntakeDraft;
  activeStep: BriefStep;
  questionGroup: readonly BriefQuestion[];
  validationErrors: Readonly<Record<string, string>>;
  photoCapability: CapabilityState;
  pricingModeExplanation: PricingModeExplanation | null;
  translate?: CustomerIntakeTranslate;
  renderAttachmentPreview?: (attachment: BriefAttachment) => ReactNode;
  onBack: () => void;
  onSave: () => void;
  onContinue: () => void;
  onEditNeed: () => void;
  onAnswerChange: (questionId: string, value: BriefAnswerValue) => void;
  onAddPhoto: () => void;
  onRetryPhoto: (attachment: BriefAttachment) => void;
  onRemovePhoto: (attachment: BriefAttachment) => void;
  onMaterialsResponsibilityChange: (value: 'customer' | 'worker' | 'discuss') => void;
  onBudgetCapMinorChange: (value: number | null) => void;
  onDiagnosticNeedChange: (value: string) => void;
}>;

const STEPS: readonly BriefStep[] = ['need', 'details', 'photos', 'responsibility', 'estimate'];

function answerAsString(value: BriefAnswerValue | undefined): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function answerAsList(value: BriefAnswerValue | undefined): readonly string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function AttachmentCard({
  attachment,
  preview,
  translate,
  onRetry,
  onRemove,
}: {
  attachment: BriefAttachment;
  preview: ReactNode;
  translate: CustomerIntakeTranslate;
  onRetry: () => void;
  onRemove: () => void;
}) {
  const theme = useTogtTheme();
  const statusLabel = {
    local_only: translate('brief.uploadLocal'),
    cropping: translate('brief.cropping'),
    compressing: translate('brief.compressing', { progress: attachment.progressPercent }),
    uploading: translate('brief.uploading', { progress: attachment.progressPercent }),
    uploaded: translate('brief.uploaded'),
    failed: translate('brief.uploadFailed'),
  }[attachment.uploadStatus];

  return (
    <Surface style={{ padding: theme.spacing.sm }} variant={attachment.uploadStatus === 'failed' ? 'danger' : 'default'}>
      <View style={[styles.attachmentRow, { columnGap: theme.spacing.sm }]}>
        <View
          style={[
            styles.preview,
            { minHeight: theme.sizing.touchTarget, minWidth: theme.sizing.touchTarget },
          ]}
        >
          {preview || <IntakeIcon name="image-outline" tone="secondary" />}
        </View>
        <View style={styles.flex}>
          <Text allowFontScaling style={[theme.typography.label, { color: theme.colors.text }]}>
            {statusLabel}
          </Text>
          {attachment.errorMessage ? (
            <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.error }]}>
              {attachment.errorMessage}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={[styles.actionWrap, { columnGap: theme.spacing.xs, marginTop: theme.spacing.xs, rowGap: theme.spacing.xs }]}>
        {attachment.uploadStatus === 'failed' ? (
          <Button label={translate('brief.retryPhoto')} onPress={onRetry} variant="secondary" />
        ) : null}
        <Button label={translate('brief.removePhoto')} onPress={onRemove} variant="tertiary" />
      </View>
    </Surface>
  );
}

function QuestionField({
  question,
  value,
  error,
  translate,
  onChange,
}: {
  question: BriefQuestion;
  value: BriefAnswerValue | undefined;
  error: string | undefined;
  translate: CustomerIntakeTranslate;
  onChange: (value: BriefAnswerValue) => void;
}) {
  const theme = useTogtTheme();
  if (question.inputType === 'boolean') {
    const selected = typeof value === 'boolean' ? value : null;
    return (
      <View style={{ rowGap: theme.spacing.xs }}>
        <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>
          {question.prompt}
        </Text>
        {question.helperText ? (
          <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>
            {question.helperText}
          </Text>
        ) : null}
        <View style={[styles.actionWrap, { columnGap: theme.spacing.xs, rowGap: theme.spacing.xs }]}>
          <Chip label={translate('common.yes')} onPress={() => onChange(true)} selected={selected === true} tone="brand" />
          <Chip label={translate('common.no')} onPress={() => onChange(false)} selected={selected === false} tone="brand" />
        </View>
        {error ? <InlineError message={error} /> : null}
      </View>
    );
  }
  if (question.inputType === 'single_choice' || question.inputType === 'multiple_choice') {
    const selected = answerAsList(value);
    const selectedSingle = typeof value === 'string' ? value : '';
    return (
      <View style={{ rowGap: theme.spacing.xs }}>
        <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>
          {question.prompt}
        </Text>
        {question.helperText ? (
          <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>
            {question.helperText}
          </Text>
        ) : null}
        <View style={[styles.actionWrap, { columnGap: theme.spacing.xs, rowGap: theme.spacing.xs }]}>
          {question.options.map((option) => {
            const isSelected = question.inputType === 'single_choice'
              ? selectedSingle === option.value
              : selected.includes(option.value);
            return (
              <Chip
                {...(option.explanation ? { accessibilityHint: option.explanation } : {})}
                key={option.value}
                label={option.label}
                onPress={() => {
                  if (question.inputType === 'single_choice') {
                    onChange(option.value);
                  } else {
                    onChange(isSelected
                      ? selected.filter((entry) => entry !== option.value)
                      : [...selected, option.value]);
                  }
                }}
                selected={isSelected}
                tone="brand"
              />
            );
          })}
        </View>
        {error ? <InlineError message={error} /> : null}
      </View>
    );
  }

  return (
    <TextField
      {...(error ? { error } : {})}
      {...(question.helperText ? { helperText: question.helperText } : {})}
      keyboardType={question.inputType === 'number' ? 'numeric' : 'default'}
      label={question.prompt}
      {...(question.maxLength === null ? {} : { maxLength: question.maxLength })}
      multiline={question.inputType === 'long_text'}
      onChangeText={(next) => onChange(question.inputType === 'number' && next ? Number(next) : next)}
      required={question.required}
      textAlignVertical={question.inputType === 'long_text' ? 'top' : 'center'}
      value={answerAsString(value)}
    />
  );
}

export function GuidedJobBriefScreen({
  draft,
  activeStep,
  questionGroup,
  validationErrors,
  photoCapability,
  pricingModeExplanation,
  translate = translateCustomerIntake,
  renderAttachmentPreview,
  onBack,
  onSave,
  onContinue,
  onEditNeed,
  onAnswerChange,
  onAddPhoto,
  onRetryPhoto,
  onRemovePhoto,
  onMaterialsResponsibilityChange,
  onBudgetCapMinorChange,
  onDiagnosticNeedChange,
}: GuidedJobBriefScreenProps) {
  const theme = useTogtTheme();
  const activeIndex = STEPS.indexOf(activeStep);
  const labels = STEPS.map((step) => translate(`brief.${step}` as const));
  const serviceLabel = draft.selectedService?.label ?? '';
  const photoRequirement = draft.selectedService?.photoRequirement ?? 'optional';
  const canContinue = activeStep === 'details'
    ? Object.keys(validationErrors).length === 0
    : activeStep === 'photos'
      ? photoRequirement !== 'required' || draft.brief.attachments.length > 0
      : activeStep === 'responsibility'
        ? draft.brief.materialsResponsibility !== null
        : true;
  const progressLabel = translate('brief.progress', {
    current: activeIndex + 1,
    total: STEPS.length,
    step: labels[activeIndex] ?? '',
  });

  return (
    <AppScaffold
      bottomAction={(
        <View style={{ rowGap: theme.spacing.sm }}>
          <View style={[styles.bottomSecondary, { columnGap: theme.spacing.sm, rowGap: theme.spacing.sm }]}>
            <Button label={translate('common.back')} onPress={onBack} variant="secondary" />
            <Button label={translate('common.saveDraft')} onPress={onSave} variant="tertiary" />
          </View>
          <Button disabled={!canContinue} fullWidth label={translate('common.continue')} large onPress={onContinue} />
        </View>
      )}
      keyboardAware
      scrollable
      testID="guided-job-brief-screen"
      topBar={<TopAppBar onBack={onBack} title={translate('brief.title')} />}
    >
      <View style={{ paddingBottom: theme.spacing.xxl, paddingTop: theme.spacing.md, rowGap: theme.spacing.xl }}>
        <StepProgress accessibleLabel={progressLabel} activeIndex={activeIndex} labels={labels} />
        {draft.connectionState === 'offline' ? <OfflineBanner message={translate('brief.offline')} /> : null}

        {activeStep !== 'need' ? (
          <Surface style={{ padding: theme.spacing.sm }} variant="subtle">
            <View style={[styles.attachmentRow, { columnGap: theme.spacing.sm }]}>
              <IntakeIcon name="clipboard-text-outline" tone="secondary" />
              <View style={styles.flex}>
                <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>
                  {translate('brief.summary')}
                </Text>
                <Text allowFontScaling style={[theme.typography.label, { color: theme.colors.text }]}>
                  {serviceLabel}
                </Text>
                <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>
                  {draft.needText}
                </Text>
              </View>
              <Button label={translate('common.edit')} onPress={onEditNeed} variant="tertiary" />
            </View>
          </Surface>
        ) : null}

        {activeStep === 'need' ? (
          <View style={{ rowGap: theme.spacing.md }}>
            <ScreenHeading body={serviceLabel} title={draft.needText} />
            <Button label={translate('common.edit')} onPress={onEditNeed} variant="secondary" />
          </View>
        ) : null}

        {activeStep === 'details' ? (
          <View style={{ rowGap: theme.spacing.xl }}>
            {questionGroup.map((question) => (
              <QuestionField
                error={validationErrors[question.questionId]}
                key={question.questionId}
                onChange={(value) => onAnswerChange(question.questionId, value)}
                question={question}
                translate={translate}
                value={draft.brief.answers[question.questionId]}
              />
            ))}
          </View>
        ) : null}

        {activeStep === 'photos' ? (
          <View style={{ rowGap: theme.spacing.md }}>
            <SectionHeader title={translate('brief.photos')} />
            <Chip
              label={translate(photoRequirement === 'required'
                ? 'brief.required'
                : photoRequirement === 'optional'
                  ? 'brief.optional'
                  : 'brief.notNeeded')}
              tone={photoRequirement === 'required' ? 'attention' : 'neutral'}
            />
            {photoRequirement === 'not_allowed' ? (
              <Surface variant="subtle">
                <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>
                  {translate('brief.photosNotUsed')}
                </Text>
              </Surface>
            ) : <CapabilityNotice capability={photoCapability} title={translate('home.camera')} />}
            {photoRequirement !== 'not_allowed' && photoCapability.status === 'available' ? (
              <Button
                label={translate('brief.addPhoto')}
                leading={<IntakeIcon name="camera-plus-outline" tone="primary" />}
                onPress={onAddPhoto}
                variant="secondary"
              />
            ) : null}
            {draft.brief.attachments.map((attachment) => (
              <AttachmentCard
                attachment={attachment}
                key={attachment.localId}
                onRemove={() => onRemovePhoto(attachment)}
                onRetry={() => onRetryPhoto(attachment)}
                preview={renderAttachmentPreview?.(attachment) ?? null}
                translate={translate}
              />
            ))}
          </View>
        ) : null}

        {activeStep === 'responsibility' ? (
          <View style={{ rowGap: theme.spacing.md }}>
            <ScreenHeading title={translate('brief.materialsTitle')} />
            {([
              ['customer', 'brief.materialsCustomer', 'package-variant-closed'],
              ['worker', 'brief.materialsWorker', 'toolbox-outline'],
              ['discuss', 'brief.materialsDiscuss', 'message-text-outline'],
            ] as const).map(([value, labelKey, icon]) => (
              <Surface
                accessibilityLabel={translate(labelKey)}
                key={value}
                onPress={() => onMaterialsResponsibilityChange(value)}
                selected={draft.brief.materialsResponsibility === value}
              >
                <View style={[styles.attachmentRow, { columnGap: theme.spacing.sm }]}>
                  <IntakeIcon name={icon} />
                  <Text allowFontScaling style={[theme.typography.body, styles.flex, { color: theme.colors.text }]}>
                    {translate(labelKey)}
                  </Text>
                  {draft.brief.materialsResponsibility === value ? <IntakeIcon name="check-circle" /> : null}
                </View>
              </Surface>
            ))}
          </View>
        ) : null}

        {activeStep === 'estimate' ? (
          <View style={{ rowGap: theme.spacing.lg }}>
            <TextField
              keyboardType="numeric"
              label={translate('brief.budget')}
              onChangeText={(value) => {
                const amount = Number(value);
                onBudgetCapMinorChange(value && Number.isFinite(amount) ? Math.round(amount * 100) : null);
              }}
              value={draft.brief.budgetCapMinor === null ? '' : String(draft.brief.budgetCapMinor / 100)}
            />
            <TextField
              label={translate('brief.diagnosticNeed')}
              multiline
              onChangeText={onDiagnosticNeedChange}
              textAlignVertical="top"
              value={draft.brief.diagnosticNeed}
            />
            {pricingModeExplanation ? (
              <Surface variant="positive">
                <Text allowFontScaling style={[theme.typography.label, { color: theme.colors.actionPrimaryPressed }]}>
                  {translate('brief.modeExplanation', { mode: pricingModeExplanation.modeLabel })}
                </Text>
                <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>
                  {pricingModeExplanation.explanation}
                </Text>
              </Surface>
            ) : null}
          </View>
        ) : null}
      </View>
    </AppScaffold>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  attachmentRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap' },
  preview: { alignItems: 'center', justifyContent: 'center' },
  actionWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  bottomSecondary: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
});

export default GuidedJobBriefScreen;
