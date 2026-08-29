import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppScaffold, Button, OfflineBanner, SectionHeader, Surface, TopAppBar } from '../../../ui';
import { useTogtTheme } from '../../../design';
import { IntakeIcon, OptionCard, ScreenHeading, SummaryRow } from './components';
import { translateCustomerIntake } from './copy';
import type { CustomerIntakeTranslate, CustomerIntakeMessageKey } from './copy';
import { validateScheduleSelection } from './model';
import type { CapabilityState, FulfilmentMode, ScheduleSelection } from './model';

export type ScheduleFulfilmentScreenProps = Readonly<{
  schedule: ScheduleSelection | null;
  permitsNow: boolean;
  allowedFulfilmentModes: readonly FulfilmentMode[];
  fulfilmentCapabilities: Readonly<Record<FulfilmentMode, CapabilityState>>;
  scheduledTimeLabel: string | null;
  durationLabel: string | null;
  connectionState: 'online' | 'offline';
  now: string;
  translate?: CustomerIntakeTranslate;
  onBack: () => void;
  onSaveDraft: () => void;
  onScheduleKindChange: (kind: 'now' | 'scheduled') => void;
  onOpenDateTimePicker: () => void;
  onFulfilmentModeChange: (mode: FulfilmentMode) => void;
  onContinue: () => void;
}>;

const FULFILMENT_COPY: Readonly<Record<FulfilmentMode, Readonly<{
  title: CustomerIntakeMessageKey;
  body: CustomerIntakeMessageKey;
  icon: 'lightning-bolt-outline' | 'account-search-outline' | 'file-document-edit-outline' | 'stethoscope';
}>>> = Object.freeze({
  fast_match: Object.freeze({ title: 'schedule.fastMatch', body: 'schedule.fastMatchBody', icon: 'lightning-bolt-outline' }),
  compare_workers: Object.freeze({ title: 'schedule.compareWorkers', body: 'schedule.compareWorkersBody', icon: 'account-search-outline' }),
  receive_quotes: Object.freeze({ title: 'schedule.receiveQuotes', body: 'schedule.receiveQuotesBody', icon: 'file-document-edit-outline' }),
  diagnostic_visit: Object.freeze({ title: 'schedule.diagnosticVisit', body: 'schedule.diagnosticVisitBody', icon: 'stethoscope' }),
});

const FULFILMENT_ORDER: readonly FulfilmentMode[] = [
  'fast_match',
  'compare_workers',
  'receive_quotes',
  'diagnostic_visit',
];

export function ScheduleFulfilmentScreen({
  schedule,
  permitsNow,
  allowedFulfilmentModes,
  fulfilmentCapabilities,
  scheduledTimeLabel,
  durationLabel,
  connectionState,
  now,
  translate = translateCustomerIntake,
  onBack,
  onSaveDraft,
  onScheduleKindChange,
  onOpenDateTimePicker,
  onFulfilmentModeChange,
  onContinue,
}: ScheduleFulfilmentScreenProps) {
  const theme = useTogtTheme();
  const scheduleValidation = schedule
    ? validateScheduleSelection(schedule, { now, permitsNow })
    : null;
  const selectedCapability = schedule ? fulfilmentCapabilities[schedule.fulfilmentMode] : null;
  const fulfilmentValid = Boolean(
    schedule
      && allowedFulfilmentModes.includes(schedule.fulfilmentMode)
      && selectedCapability?.status === 'available',
  );
  const canContinue = Boolean(scheduleValidation?.valid && fulfilmentValid);

  return (
    <AppScaffold
      bottomAction={(
        <View style={{ rowGap: theme.spacing.sm }}>
          <Button disabled={!canContinue} fullWidth label={translate('schedule.continue')} large onPress={onContinue} />
          <Button fullWidth label={translate('common.saveDraft')} onPress={onSaveDraft} variant="tertiary" />
        </View>
      )}
      scrollable
      testID="schedule-fulfilment-screen"
      topBar={<TopAppBar onBack={onBack} title={translate('schedule.title')} />}
    >
      <View style={{ paddingBottom: theme.spacing.xxl, paddingTop: theme.spacing.md, rowGap: theme.spacing.xl }}>
        <ScreenHeading body={translate('schedule.timezone')} title={translate('schedule.title')} />
        {connectionState === 'offline' ? <OfflineBanner message={translate('brief.offline')} /> : null}

        <View style={[styles.paired, { columnGap: theme.spacing.sm, rowGap: theme.spacing.sm }]}>
          <View style={styles.pairedItem}>
            <OptionCard
              {...(permitsNow ? {} : { badge: translate('schedule.unavailable') })}
              body={translate('schedule.nowBody')}
              disabled={!permitsNow}
              icon="clock-fast"
              onPress={() => onScheduleKindChange('now')}
              selected={schedule?.kind === 'now'}
              title={translate('schedule.now')}
            />
          </View>
          <View style={styles.pairedItem}>
            <OptionCard
              body={translate('schedule.scheduledBody')}
              icon="calendar-clock-outline"
              onPress={() => onScheduleKindChange('scheduled')}
              selected={schedule?.kind === 'scheduled'}
              title={translate('schedule.scheduled')}
            />
          </View>
        </View>

        {schedule?.kind === 'scheduled' ? (
          <Surface>
            <SummaryRow
              action={(
                <Button
                  label={translate('common.edit')}
                  onPress={onOpenDateTimePicker}
                  variant="tertiary"
                />
              )}
              icon="calendar-clock-outline"
              label={translate('schedule.selectedTime')}
              value={scheduledTimeLabel ?? translate('schedule.changeTime')}
            />
            {scheduleValidation && !scheduleValidation.valid && scheduleValidation.reasonCode === 'scheduled_time_not_future' ? (
              <Text accessibilityRole="alert" allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.error }]}>
                {translate('schedule.invalidPast')}
              </Text>
            ) : null}
          </Surface>
        ) : null}

        {durationLabel ? (
          <Surface variant="subtle">
            <SummaryRow icon="timer-outline" label={translate('schedule.duration')} value={durationLabel} />
          </Surface>
        ) : null}

        <View>
          <SectionHeader title={translate('schedule.fulfilment')} />
          <View style={{ marginTop: theme.spacing.sm, rowGap: theme.spacing.sm }}>
            {FULFILMENT_ORDER.map((mode) => {
              const copy = FULFILMENT_COPY[mode];
              const capability = fulfilmentCapabilities[mode];
              const catalogueAllows = allowedFulfilmentModes.includes(mode);
              const disabled = !catalogueAllows || capability.status !== 'available';
              const unavailableReason = catalogueAllows
                ? capability.explanation
                : translate('schedule.unavailable');
              return (
                <View key={mode}>
                  <OptionCard
                    {...(disabled ? { badge: translate('schedule.unavailable') } : {})}
                    body={translate(copy.body)}
                    disabled={disabled}
                    icon={copy.icon}
                    onPress={() => onFulfilmentModeChange(mode)}
                    selected={schedule?.fulfilmentMode === mode}
                    title={translate(copy.title)}
                  />
                  {disabled ? (
                    <View style={[styles.reasonRow, { columnGap: theme.spacing.xs, marginTop: theme.spacing.xs, paddingHorizontal: theme.spacing.sm }]}>
                      <IntakeIcon name="information-outline" tone="secondary" size={theme.sizing.iconSmall} />
                      <Text allowFontScaling style={[theme.typography.caption, styles.flex, { color: theme.colors.textSecondary }]}>
                        {unavailableReason}
                      </Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>
      </View>
    </AppScaffold>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  paired: { flexDirection: 'row', flexWrap: 'wrap' },
  pairedItem: { flexBasis: 240, flexGrow: 1 },
  reasonRow: { alignItems: 'flex-start', flexDirection: 'row' },
});

export default ScheduleFulfilmentScreen;
