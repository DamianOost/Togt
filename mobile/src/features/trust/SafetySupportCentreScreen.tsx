import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTogtTheme } from '../../design';
import {
  AppScaffold,
  Button,
  SectionHeader,
  Surface,
  TopAppBar,
} from '../../ui';
import type { IncidentDto } from '../../services/groundedTrust';
import { IncidentRecordCard, TrustHero, TrustResource, TruthNotice } from './components';
import { EMERGENCY_DIAL_OPTIONS } from './model';
import type { ConnectionState, SafetyCentreSnapshot, TrustResourceState } from './model';

export type SafetySupportCentreScreenProps = Readonly<{
  resource: TrustResourceState<SafetyCentreSnapshot>;
  connectionState: ConnectionState;
  onBack: () => void;
  onRetry: () => void;
  onCall112: () => void;
  onCall10111: () => void;
  onCreateSafetyRecord: () => void;
  onCreateSupportCase: () => void;
  onOpenIncident: (incident: IncidentDto) => void;
}>;

export function SafetySupportCentreScreen({
  resource,
  connectionState,
  onBack,
  onRetry,
  onCall112,
  onCall10111,
  onCreateSafetyRecord,
  onCreateSupportCase,
  onOpenIncident,
}: SafetySupportCentreScreenProps) {
  const theme = useTogtTheme();
  const offline = connectionState === 'offline';
  return (
    <AppScaffold
      contentContainerStyle={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.xxxl, paddingTop: theme.spacing.md }}
      scrollable
      testID="safety-support-centre-screen"
      topBar={<TopAppBar onBack={onBack} subtitle="Truthful help and records" title="Safety & Support" />}
    >
      <TrustHero
        body="Immediate help stays separate from TOGT records, so you always know what each action does."
        eyebrow="Support centre"
        icon="shield-check-outline"
        title="Clear help, no false promises"
      />

      <Surface elevation="card" style={{ gap: theme.spacing.md }} variant="danger">
        <View style={[styles.row, { gap: theme.spacing.sm }]}>
          <MaterialCommunityIcons color={theme.colors.emergency} name="phone-alert-outline" size={theme.sizing.iconLarge} />
          <View style={styles.flex}>
            <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h2, { color: theme.colors.text }]}>Immediate danger?</Text>
            <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.textSecondary }]}>
              Call emergency services now. These buttons open your phone dialler.
            </Text>
          </View>
        </View>
        <Button
          accessibilityHint={EMERGENCY_DIAL_OPTIONS[0].detail}
          fullWidth
          label={EMERGENCY_DIAL_OPTIONS[0].label}
          leading={<MaterialCommunityIcons color={theme.colors.textInverse} name="phone" size={theme.sizing.iconSmall} />}
          onPress={onCall112}
          variant="danger"
        />
        <Button
          accessibilityHint={EMERGENCY_DIAL_OPTIONS[1].detail}
          fullWidth
          label={EMERGENCY_DIAL_OPTIONS[1].label}
          leading={<MaterialCommunityIcons color={theme.colors.emergency} name="police-badge-outline" size={theme.sizing.iconSmall} />}
          onPress={onCall10111}
          variant="secondary"
        />
        <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>
          TOGT does not dispatch emergency services, receive this call, or provide a human acknowledgement through the dialler.
        </Text>
      </Surface>

      <View style={{ gap: theme.spacing.sm }}>
        <SectionHeader
          subtitle="Saved to your account as record-only intake. No staffed response or SLA is implied."
          title="Record a concern"
        />
        <View style={[styles.actionGrid, { gap: theme.spacing.sm }]}>
          <Button
            disabled={offline}
            label="Record a safety concern"
            onPress={onCreateSafetyRecord}
            style={styles.flex}
          />
          <Button
            disabled={offline}
            label="Record a support case"
            onPress={onCreateSupportCase}
            style={styles.flex}
            variant="secondary"
          />
        </View>
        {offline ? (
          <TruthNotice
            body="Reconnect before recording. Nothing will be queued or silently submitted while offline. Emergency dialler actions remain available above."
            icon="cloud-off-outline"
            title="Recording is offline"
          />
        ) : null}
      </View>

      <TrustResource
        connectionState={connectionState}
        loadingLabel="Loading your private records"
        onRetry={onRetry}
        resource={resource}
      >
        {(snapshot) => {
          const records = [...snapshot.safetyIncidents, ...snapshot.supportCases]
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
          return (
            <View style={{ gap: theme.spacing.sm }}>
              <SectionHeader
                subtitle="List cards omit your written summary. Open a record to view its private detail."
                title="Your records"
              />
              {records.length > 0 ? records.map((incident) => (
                <IncidentRecordCard incident={incident} key={incident.id} onOpen={onOpenIncident} />
              )) : (
                <TruthNotice
                  body="No safety or support records are available on this account."
                  icon="file-document-outline"
                  title="No records yet"
                  tone="subtle"
                />
              )}
            </View>
          );
        }}
      </TrustResource>
    </AppScaffold>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { alignItems: 'flex-start', flexDirection: 'row' },
  actionGrid: { alignItems: 'stretch', flexDirection: 'row', flexWrap: 'wrap' },
});

export default SafetySupportCentreScreen;
