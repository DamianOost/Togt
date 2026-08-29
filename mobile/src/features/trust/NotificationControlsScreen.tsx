import React from 'react';
import { Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTogtTheme } from '../../design';
import {
  AppScaffold,
  Button,
  SectionHeader,
  Surface,
  TextField,
  TopAppBar,
} from '../../ui';
import { SettingToggleRow, TrustHero, TruthNotice } from './components';
import {
  NOTIFICATION_CATEGORY_COPY,
  canMutateNotificationControls,
  notificationPermissionCopy,
} from './model';
import type {
  ConnectionState,
  NotificationCategory,
  NotificationControlSnapshot,
} from './model';

export type NotificationControlsScreenProps = Readonly<{
  snapshot: NotificationControlSnapshot;
  connectionState: ConnectionState;
  saving: boolean;
  onBack: () => void;
  onCategoryChange: (category: NotificationCategory, enabled: boolean) => void;
  onQuietHoursEnabledChange: (enabled: boolean) => void;
  onQuietHoursStartChange: (value: string) => void;
  onQuietHoursEndChange: (value: string) => void;
  onRequestDevicePermission: () => void;
  onOpenDeviceSettings: () => void;
  onSaveControls: () => void;
}>;

export function NotificationControlsScreen({
  snapshot,
  connectionState,
  saving,
  onBack,
  onCategoryChange,
  onQuietHoursEnabledChange,
  onQuietHoursStartChange,
  onQuietHoursEndChange,
  onRequestDevicePermission,
  onOpenDeviceSettings,
  onSaveControls,
}: NotificationControlsScreenProps) {
  const theme = useTogtTheme();
  const permission = notificationPermissionCopy(snapshot.registrationState);
  const editable = canMutateNotificationControls(snapshot, connectionState);
  return (
    <AppScaffold
      bottomAction={(
        <Button
          disabled={!editable || saving}
          fullWidth
          label={saving ? 'Saving controls…' : 'Save notification controls'}
          loading={saving}
          onPress={onSaveControls}
        />
      )}
      contentContainerStyle={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.xl, paddingTop: theme.spacing.md }}
      keyboardAware
      scrollable
      testID="notification-controls-screen"
      topBar={<TopAppBar onBack={onBack} subtitle="Delivery and quiet hours" title="Notifications" />}
    >
      <TrustHero
        body="Choose what deserves your attention, and see the device delivery truth separately from your preferences."
        eyebrow="Notification control"
        icon="bell-cog-outline"
        title="Signal without noise"
      />

      <Surface elevation="card" style={{ gap: theme.spacing.md }} variant={permission.active ? 'positive' : 'attention'}>
        <View style={{ alignItems: 'flex-start', flexDirection: 'row', gap: theme.spacing.sm }}>
          <MaterialCommunityIcons
            color={permission.active ? theme.colors.success : theme.colors.attention}
            name={permission.active ? 'cellphone-check' : 'cellphone-off'}
            size={theme.sizing.iconLarge}
          />
          <View style={{ flex: 1 }}>
            <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>{permission.title}</Text>
            <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{permission.body}</Text>
            <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>Permission state: {snapshot.registrationState}</Text>
          </View>
        </View>
        {snapshot.registrationState === 'not_requested' ? (
          <Button label="Request device permission" onPress={onRequestDevicePermission} variant="secondary" />
        ) : null}
        {snapshot.registrationState === 'denied' ? (
          <Button label="Open device settings" onPress={onOpenDeviceSettings} variant="secondary" />
        ) : null}
      </Surface>

      <View style={{ gap: theme.spacing.sm }}>
        <SectionHeader subtitle="Category choices do not imply delivery unless this device is registered." title="Categories" />
        <Surface elevation="card">
          {snapshot.preferences.map((preference) => {
            const copy = NOTIFICATION_CATEGORY_COPY[preference.category];
            return (
              <SettingToggleRow
                description={copy.description}
                disabled={!editable}
                key={preference.category}
                label={copy.label}
                onChange={(value) => onCategoryChange(preference.category, value)}
                testID={`notification-${preference.category}`}
                value={preference.enabled}
              />
            );
          })}
        </Surface>
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <SectionHeader subtitle="Quiet hours suppress ordinary notifications during the chosen window." title="Quiet hours" />
        <Surface elevation="card" style={{ gap: theme.spacing.md }}>
          <SettingToggleRow
            description={`Uses ${snapshot.quietHours.timezone}.`}
            disabled={!editable}
            label="Use quiet hours"
            onChange={onQuietHoursEnabledChange}
            testID="notification-quiet-hours"
            value={snapshot.quietHours.enabled}
          />
          {snapshot.quietHours.enabled ? (
            <View style={{ gap: theme.spacing.sm }}>
              <TextField disabled={!editable} label="Starts" onChangeText={onQuietHoursStartChange} value={snapshot.quietHours.startsAt} />
              <TextField disabled={!editable} label="Ends" onChangeText={onQuietHoursEndChange} value={snapshot.quietHours.endsAt} />
            </View>
          ) : null}
        </Surface>
      </View>

      <TruthNotice
        body="Critical safety notices can bypass quiet hours. This bypass does not turn a record-only incident into emergency dispatch or an operated response."
        icon="shield-alert-outline"
        title="Critical safety bypass"
        tone="danger"
      />

      {snapshot.registrationState === 'unavailable' ? (
        <TruthNotice body="This build has no active remote notification registration, so controls are read-only and no save is sent." icon="bell-off-outline" title="Capability unavailable" />
      ) : null}
      {connectionState === 'offline' ? (
        <TruthNotice body="Reconnect before saving controls. No offline mutation is queued." icon="cloud-off-outline" title="Read-only while offline" />
      ) : null}
    </AppScaffold>
  );
}

export default NotificationControlsScreen;
