import React from 'react';
import { Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTogtTheme } from '../../design';
import {
  AppScaffold,
  Button,
  SectionHeader,
  Surface,
  TopAppBar,
} from '../../ui';
import { TrustDefinitionRow, TrustHero, TruthList, TruthNotice } from './components';
import type { SafeSharePreview, SafeSharingSnapshot } from './model';

export type SafeSharingScreenProps = Readonly<{
  snapshot: SafeSharingSnapshot;
  onBack: () => void;
  onShareBookingDetails: (preview: SafeSharePreview) => void;
}>;

export function SafeSharingScreen({ snapshot, onBack, onShareBookingDetails }: SafeSharingScreenProps) {
  const theme = useTogtTheme();
  const bookingDetailsShare = snapshot.bookingDetailsShare;
  const publicLiveShare = snapshot.publicLiveShare;
  return (
    <AppScaffold
      contentContainerStyle={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.xxxl, paddingTop: theme.spacing.md }}
      scrollable
      testID="safe-sharing-screen"
      topBar={<TopAppBar onBack={onBack} subtitle="Privacy-first sharing" title="Safe sharing" />}
    >
      <TrustHero
        body="Share only the minimum Project context. Exact address, live location and personal contact details stay out."
        eyebrow="Privacy boundary"
        icon="share-variant-outline"
        title="Useful context, less exposure"
      />

      <View style={{ gap: theme.spacing.sm }}>
        <SectionHeader subtitle="A static, non-live summary with no address." title="Booking details share" />
        {bookingDetailsShare.available ? (
          <Surface elevation="card" style={{ gap: theme.spacing.sm }}>
            <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}>
              <MaterialCommunityIcons color={theme.colors.success} name="shield-check-outline" size={theme.sizing.iconLarge} />
              <View style={{ flex: 1 }}>
                <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>Safe preview</Text>
                <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>non_live_no_address</Text>
              </View>
            </View>
            <TrustDefinitionRow icon="tools" label="Service" value={bookingDetailsShare.preview.serviceLabel} />
            <TrustDefinitionRow icon="map-marker-outline" label="Broad area" value={bookingDetailsShare.preview.broadAreaLabel} />
            <TrustDefinitionRow icon="calendar-blank-outline" label="Schedule" value={bookingDetailsShare.preview.scheduleLabel} />
            <TrustDefinitionRow icon="progress-check" label="Status" value={bookingDetailsShare.preview.statusLabel} />
            <TruthList statements={[
              'No exact address or coordinates',
              'No phone number or personal contact details',
              'No live or historical movement trail',
            ]} />
            <Button
              accessibilityHint="Opens the platform share sheet with only the safe preview fields shown above."
              fullWidth
              label="Share safe summary"
              onPress={() => onShareBookingDetails(bookingDetailsShare.preview)}
            />
          </Surface>
        ) : (
          <TruthNotice
            body={`Safe booking detail sharing is unavailable: ${bookingDetailsShare.reasonCode.replaceAll('_', ' ')}.`}
            icon="share-off-outline"
            title="Booking sharing unavailable"
          />
        )}
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <SectionHeader subtitle="A public link would need hashed, expiring and revocable tokens." title="Public live share" />
        <Surface disabled style={{ gap: theme.spacing.sm }} variant="subtle">
          <View style={{ alignItems: 'flex-start', flexDirection: 'row', gap: theme.spacing.sm }}>
            <MaterialCommunityIcons color={theme.colors.textSecondary} name="map-marker-off-outline" size={theme.sizing.iconLarge} />
            <View style={{ flex: 1 }}>
              <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>Public live sharing is unavailable</Text>
              <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>
                Capability off: public_live_share · {publicLiveShare.reasonCode}
              </Text>
            </View>
          </View>
          <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>
            No link is created, no location is published and no contact details are exposed.
          </Text>
        </Surface>
      </View>
    </AppScaffold>
  );
}

export default SafeSharingScreen;
