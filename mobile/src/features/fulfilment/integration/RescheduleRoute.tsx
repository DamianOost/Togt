import DateTimePicker from '@react-native-community/datetimepicker';
import { useNetInfo } from '@react-native-community/netinfo';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Text, View } from 'react-native';
import { useSelector } from 'react-redux';
import { adaptGroundedFulfilmentV1 } from '../../../data/grounded';
import type { GroundedFulfilment, GroundedReschedule } from '../../../data/grounded';
import {
  isGroundedMarketplaceError,
  loadGroundedFulfilment,
  runGroundedFulfilmentCommand,
} from '../../../services';
import { useTogtTheme } from '../../../design';
import {
  AppScaffold,
  Button,
  InlineError,
  SectionHeader,
  Surface,
  TextField,
  TopAppBar,
} from '../../../ui';

type PickerMode = 'date' | 'time' | null;

function formatSchedule(value: Date): string {
  return new Intl.DateTimeFormat('en-ZA', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'Africa/Johannesburg',
  }).format(value);
}

function projectIdFrom(route: any): string {
  return typeof route.params?.projectId === 'string' ? route.params.projectId : '';
}

function pendingReschedule(fulfilment: GroundedFulfilment): GroundedReschedule | null {
  return fulfilment.reschedules.find((item) => item.status === 'pending') ?? null;
}

export function ProjectRescheduleRoute({ navigation, route }: { navigation: any; route: any }) {
  const theme = useTogtTheme();
  const network = useNetInfo();
  const role = useSelector((state: any) => state.auth.user?.role) === 'customer' ? 'customer' : 'worker';
  const projectId = projectIdFrom(route);
  const online = network.isConnected === true && network.isInternetReachable !== false;
  const [fulfilment, setFulfilment] = useState<GroundedFulfilment | null>(null);
  const [proposedAt, setProposedAt] = useState<Date | null>(null);
  const [dateTouched, setDateTouched] = useState(false);
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId || !online) {
      setLoading(false);
      if (!online) setError('Reconnect to verify the latest bilateral schedule state.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await loadGroundedFulfilment(projectId);
      const raw = typeof response === 'object' && response !== null && 'fulfilment' in response
        ? (response as { fulfilment: unknown }).fulfilment
        : null;
      const adapted = adaptGroundedFulfilmentV1(raw);
      if (!adapted.ok) throw new Error(adapted.field);
      setFulfilment(adapted.value);
      setProposedAt((current) => current ?? new Date(new Date(adapted.value.schedule.startsAt).getTime() + 24 * 60 * 60 * 1_000));
    } catch (caught) {
      setError(isGroundedMarketplaceError(caught)
        ? caught.problem.detail
        : 'The current schedule and permissions could not be verified.');
    } finally {
      setLoading(false);
    }
  }, [online, projectId]);

  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));

  const run = async (command: 'propose_reschedule' | 'accept_reschedule' | 'decline_reschedule') => {
    if (!fulfilment || !online || saving) return;
    const pending = pendingReschedule(fulfilment);
    if (command === 'propose_reschedule' && (!proposedAt || !dateTouched || proposedAt.getTime() <= Date.now())) return;
    if (command !== 'propose_reschedule' && !pending) return;
    setSaving(true);
    setError(null);
    try {
      await runGroundedFulfilmentCommand({
        projectId,
        revision: fulfilment.revision,
        command,
        ...(pending ? { targetId: pending.id } : {}),
        ...(command === 'propose_reschedule' && proposedAt ? {
          data: {
            proposedStartsAt: proposedAt.toISOString(),
            ...(reason.trim() ? { reason: reason.trim() } : {}),
          },
        } : {}),
        idempotencyKey: `reschedule:${projectId}:v${fulfilment.revision}:${command}:${pending?.id ?? proposedAt?.toISOString() ?? 'none'}`,
      });
      Alert.alert(
        command === 'propose_reschedule' ? 'Schedule proposal recorded' : command === 'accept_reschedule' ? 'New schedule accepted' : 'Schedule proposal declined',
        command === 'propose_reschedule'
          ? 'The other participant must accept before the Project schedule changes.'
          : 'The server-authoritative Project schedule has been refreshed.',
        [{ text: 'Done', onPress: () => navigation.goBack() }],
      );
      await refresh();
    } catch (caught) {
      setError(isGroundedMarketplaceError(caught)
        ? caught.problem.detail
        : 'The schedule action was not recorded. Refresh before retrying.');
    } finally {
      setSaving(false);
    }
  };

  const onPickerChange = (event: { type?: string }, value?: Date) => {
    if (event.type === 'dismissed' || !value) {
      setPickerMode(null);
      return;
    }
    setProposedAt(value);
    setDateTouched(true);
    if (Platform.OS === 'android' && pickerMode === 'date') setPickerMode('time');
    else if (Platform.OS === 'android') setPickerMode(null);
  };

  const pending = fulfilment ? pendingReschedule(fulfilment) : null;
  const canDecide = Boolean(
    fulfilment?.allowedActions.decideReschedule
    && pending
    && pending.proposedByRole !== role,
  );
  const reasonValid = reason.trim().length === 0 || reason.trim().length >= 3;
  const canPropose = Boolean(
    fulfilment?.allowedActions.proposeReschedule
    && proposedAt
    && dateTouched
    && proposedAt.getTime() > Date.now()
    && reasonValid,
  );

  return (
    <AppScaffold
      contentContainerStyle={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.xxxl }}
      scrollable
      testID="project-reschedule-screen"
      topBar={<TopAppBar onBack={() => navigation.goBack()} subtitle="Bilateral schedule control" title="Reschedule Project" />}
    >
      {loading ? <ActivityIndicator accessibilityLabel="Loading schedule" color={theme.colors.actionPrimary} /> : null}
      {fulfilment ? (
        <Surface elevation="card" style={{ gap: theme.spacing.sm }}>
          <SectionHeader subtitle={`Revision ${fulfilment.schedule.revision}`} title="Current schedule" />
          <Text allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>{formatSchedule(new Date(fulfilment.schedule.startsAt))}</Text>
          <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>A proposal does not change this time until the other participant accepts.</Text>
        </Surface>
      ) : null}

      {pending ? (
        <Surface elevation="card" style={{ gap: theme.spacing.md }} variant="attention">
          <SectionHeader subtitle={`Proposed by the ${pending.proposedByRole}`} title="Schedule proposal awaiting a decision" />
          <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.text }]}>{formatSchedule(new Date(pending.proposedStartsAt))}</Text>
          {pending.reason ? <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{pending.reason}</Text> : null}
          <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>Expires {formatSchedule(new Date(pending.expiresAt))}</Text>
          {canDecide ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
              <Button disabled={!online || saving} label="Decline proposal" onPress={() => { void run('decline_reschedule'); }} variant="secondary" />
              <Button disabled={!online || saving} label="Accept new schedule" loading={saving} onPress={() => { void run('accept_reschedule'); }} />
            </View>
          ) : (
            <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>Waiting for the other participant. You cannot accept your own proposal.</Text>
          )}
        </Surface>
      ) : fulfilment?.allowedActions.proposeReschedule ? (
        <Surface elevation="card" style={{ gap: theme.spacing.md }}>
          <SectionHeader subtitle="Choose both a date and a time." title="Propose a new time" />
          <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.text }]}>{proposedAt ? formatSchedule(proposedAt) : 'No new time selected'}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            <Button label="Choose date" onPress={() => setPickerMode('date')} variant="secondary" />
            <Button label="Choose time" onPress={() => setPickerMode('time')} variant="secondary" />
          </View>
          {pickerMode && proposedAt ? (
            <DateTimePicker
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              minimumDate={new Date()}
              mode={pickerMode}
              onChange={onPickerChange}
              value={proposedAt}
            />
          ) : null}
          <TextField
            {...(!reasonValid ? { error: 'Add at least 3 characters or leave the reason empty.' } : {})}
            helperText="Optional; exact contact details are rejected by the server."
            label="Reason (optional)"
            maxLength={500}
            multiline
            onChangeText={setReason}
            value={reason}
          />
          <Button disabled={!canPropose || !online || saving} label="Send schedule proposal" loading={saving} onPress={() => { void run('propose_reschedule'); }} />
        </Surface>
      ) : fulfilment ? (
        <Surface variant="subtle">
          <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.textSecondary }]}>Rescheduling is unavailable in the current lifecycle phase or policy state. No cancellation or schedule change is inferred.</Text>
        </Surface>
      ) : null}

      {error ? (
        <View style={{ gap: theme.spacing.sm }}>
          <InlineError message={error} />
          <Button label="Refresh schedule" onPress={() => { void refresh(); }} variant="secondary" />
        </View>
      ) : null}
      {!online ? <Text accessibilityRole="alert" allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>Reconnect before proposing or deciding a schedule change. Nothing is queued offline.</Text> : null}
    </AppScaffold>
  );
}

export default ProjectRescheduleRoute;
