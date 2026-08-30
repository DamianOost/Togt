import React from 'react';
import { Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTogtTheme } from '../../design';
import {
  AppScaffold,
  Button,
  SectionHeader,
  StatusPill,
  Surface,
  TopAppBar,
} from '../../ui';
import type { IncidentDto } from '../../services/groundedTrust';
import { IncidentTimeline, TrustDefinitionRow, TrustResource, TruthNotice } from './components';
import { EMERGENCY_DIAL_OPTIONS, incidentCategoryLabel, incidentStateLabel } from './model';
import type { ConnectionState, TrustResourceState } from './model';

export type IncidentDetailScreenProps = Readonly<{
  resource: TrustResourceState<IncidentDto>;
  connectionState: ConnectionState;
  onBack: () => void;
  onRetry: () => void;
  onCall112: () => void;
  onCall10111: () => void;
}>;

export function IncidentDetailScreen({
  resource,
  connectionState,
  onBack,
  onRetry,
  onCall112,
  onCall10111,
}: IncidentDetailScreenProps) {
  const theme = useTogtTheme();
  return (
    <AppScaffold
      contentContainerStyle={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.xxxl, paddingTop: theme.spacing.md }}
      scrollable
      testID="incident-detail-screen"
      topBar={<TopAppBar onBack={onBack} subtitle="Private record detail" title="Record status" />}
    >
      <TrustResource
        connectionState={connectionState}
        loadingLabel="Loading record detail"
        onRetry={onRetry}
        resource={resource}
      >
        {(incident) => (
          <>
            <Surface elevation="card" style={{ gap: theme.spacing.md }}>
              <View style={{ alignItems: 'flex-start', flexDirection: 'row', gap: theme.spacing.sm }}>
                <MaterialCommunityIcons color={theme.colors.actionPrimary} name="shield-outline" size={theme.sizing.iconLarge} />
                <View style={{ flex: 1 }}>
                  <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h2, { color: theme.colors.text }]}>
                    {incidentCategoryLabel(incident.category)}
                  </Text>
                  <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>Reference {incident.id}</Text>
                </View>
                <StatusPill
                  label={incidentStateLabel(incident.state)}
                  tone={incident.state === 'failed' ? 'error' : incident.state === 'resolved' ? 'complete' : 'pending'}
                />
              </View>
              <TrustDefinitionRow icon="database-outline" label="Support level" value="Record only" />
              <TrustDefinitionRow icon="counter" label="Revision" value={String(incident.revision)} />
              {incident.bookingReference ? (
                <TrustDefinitionRow icon="briefcase-outline" label="Linked Project reference" value={incident.bookingReference} />
              ) : null}
            </Surface>

            {incident.summary ? (
              <Surface style={{ gap: theme.spacing.xs }}>
                <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>Your private record</Text>
                <Text allowFontScaling selectable style={[theme.typography.body, { color: theme.colors.textSecondary }]}>{incident.summary}</Text>
              </Surface>
            ) : null}

            <View style={{ gap: theme.spacing.sm }}>
              <SectionHeader subtitle="Only server-recorded transitions are shown as current or complete." title="Record timeline" />
              <IncidentTimeline incident={incident} />
            </View>

            <TruthNotice
              body={incident.channel.humanAcknowledgementExpected
                ? 'This response would require explicit operated evidence.'
                : 'No human acknowledgement is expected. Operations were not alerted and emergency services were not dispatched.'}
              icon="account-clock-outline"
              title="Record-only state"
            />

            <Surface style={{ gap: theme.spacing.sm }} variant="danger">
              <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>Need emergency help now?</Text>
              <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>Use the device dialler. These calls are separate from this TOGT record.</Text>
              <Button label={EMERGENCY_DIAL_OPTIONS[0].label} onPress={onCall112} variant="danger" />
              <Button label={EMERGENCY_DIAL_OPTIONS[1].label} onPress={onCall10111} variant="secondary" />
            </Surface>
          </>
        )}
      </TrustResource>
    </AppScaffold>
  );
}

export default IncidentDetailScreen;
