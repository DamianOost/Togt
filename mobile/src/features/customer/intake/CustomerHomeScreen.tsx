import React from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppScaffold, Button, Chip, OfflineBanner, SectionHeader, Surface, TextField, TopAppBar } from '../../../ui';
import { useTogtTheme } from '../../../design';
import { isSafeRemoteImageUrl } from '../projects/model';
import { CapabilityNotice, IntakeIcon, OptionCard, ScreenHeading } from './components';
import { translateCustomerIntake } from './copy';
import type { CustomerIntakeTranslate } from './copy';
import type { CapabilityState } from './model';
import type { IntakeIconName } from './components';

export type CustomerServiceSuggestion = Readonly<{
  serviceId: string;
  serviceVersion: number;
  label: string;
  explanation: string;
}>;

export type CustomerServiceShortcut = Readonly<{
  serviceId: string;
  serviceVersion: number;
  label: string;
  icon: IntakeIconName;
}>;

export type ActiveProjectSummary = Readonly<{
  projectId: string;
  title: string;
  statusLabel: string;
  areaLabel: string;
  workerName: string | null;
  workerPhotoUrl: string | null;
}>;

export type ConsequentialCustomerNotice = Readonly<{
  id: string;
  tone: 'attention' | 'danger';
  title: string;
  body: string;
  actionLabel: string;
}>;

export type RecentWorkerSummary = Readonly<{
  workerId: string;
  displayName: string;
  serviceId: string;
  serviceVersion: number;
  serviceLabel: string;
  photoUrl: string | null;
}>;

export type CustomerHomeScreenProps = Readonly<{
  locationLabel: string | null;
  needText: string;
  suggestions: readonly CustomerServiceSuggestion[];
  serviceShortcuts: readonly CustomerServiceShortcut[];
  activeProject: ActiveProjectSummary | null;
  consequentialNotice: ConsequentialCustomerNotice | null;
  recentWorkers: readonly RecentWorkerSummary[];
  connectionState: 'online' | 'offline';
  cameraCapability: CapabilityState;
  voiceAssistanceCapability: CapabilityState;
  relationshipsCapability: CapabilityState;
  translate?: CustomerIntakeTranslate;
  onOpenAccount: () => void;
  onOpenLocation: () => void;
  onNeedTextChange: (value: string) => void;
  onOpenPhotoBrief: () => void;
  onOpenVoiceAssistance: () => void;
  onSelectSuggestion: (suggestion: CustomerServiceSuggestion) => void;
  onSelectShortcut: (shortcut: CustomerServiceShortcut) => void;
  onOpenActiveProject: (project: ActiveProjectSummary) => void;
  onOpenConsequentialNotice: (notice: ConsequentialCustomerNotice) => void;
  onOpenRecentWorker: (worker: RecentWorkerSummary) => void;
  onContinue: () => void;
}>;

export function CustomerHomeScreen({
  locationLabel,
  needText,
  suggestions,
  serviceShortcuts,
  activeProject,
  consequentialNotice,
  recentWorkers,
  connectionState,
  cameraCapability,
  voiceAssistanceCapability,
  relationshipsCapability,
  translate = translateCustomerIntake,
  onOpenAccount,
  onOpenLocation,
  onNeedTextChange,
  onOpenPhotoBrief,
  onOpenVoiceAssistance,
  onSelectSuggestion,
  onSelectShortcut,
  onOpenActiveProject,
  onOpenConsequentialNotice,
  onOpenRecentWorker,
  onContinue,
}: CustomerHomeScreenProps) {
  const theme = useTogtTheme();
  const hasIntent = needText.trim().length > 0;
  const showVoice = voiceAssistanceCapability.status === 'available';
  const showRelationships = relationshipsCapability.status === 'available' && recentWorkers.length > 0;

  return (
    <AppScaffold
      bottomAction={(
        <Button
          disabled={!hasIntent}
          fullWidth
          label={translate('home.continue')}
          large
          onPress={onContinue}
          trailing={<IntakeIcon name="arrow-right" tone="inverse" />}
        />
      )}
      scrollable
      testID="customer-home-screen"
      topBar={(
        <TopAppBar
          actions={[{
            accessibilityLabel: translate('home.account'),
            content: <IntakeIcon name="account-outline" tone="secondary" />,
            onPress: onOpenAccount,
          }]}
        />
      )}
    >
      <View style={[styles.content, { paddingBottom: theme.spacing.xxl, paddingTop: theme.spacing.md, rowGap: theme.spacing.xl }]}>
        <Surface
          accessibilityHint={translate('home.location')}
          accessibilityLabel={locationLabel ?? translate('home.locationFallback')}
          onPress={onOpenLocation}
          style={{ padding: theme.spacing.sm }}
        >
          <View style={[styles.row, { columnGap: theme.spacing.sm }]}>
            <IntakeIcon name="map-marker-outline" />
            <View style={styles.flex}>
              <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>
                {translate('home.location')}
              </Text>
              <Text allowFontScaling style={[theme.typography.label, { color: theme.colors.text }]}>
                {locationLabel ?? translate('home.locationFallback')}
              </Text>
            </View>
            <IntakeIcon name="chevron-right" tone="secondary" />
          </View>
        </Surface>

        {connectionState === 'offline' ? <OfflineBanner message={translate('home.offline')} /> : null}

        {consequentialNotice ? (
          <Surface
            accessibilityHint={consequentialNotice.body}
            accessibilityLabel={consequentialNotice.title}
            onPress={() => onOpenConsequentialNotice(consequentialNotice)}
            variant={consequentialNotice.tone}
          >
            <View style={[styles.row, { columnGap: theme.spacing.sm }]}>
              <IntakeIcon
                name={consequentialNotice.tone === 'danger' ? 'alert-circle-outline' : 'alert-outline'}
                tone={consequentialNotice.tone === 'danger' ? 'danger' : 'attention'}
              />
              <View style={styles.flex}>
                <Text allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>
                  {consequentialNotice.title}
                </Text>
                <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>
                  {consequentialNotice.body}
                </Text>
                <Text allowFontScaling style={[theme.typography.label, { color: theme.colors.actionPrimaryPressed, marginTop: theme.spacing.xs }]}>
                  {consequentialNotice.actionLabel}
                </Text>
              </View>
              <IntakeIcon name="chevron-right" tone="secondary" />
            </View>
          </Surface>
        ) : null}

        <ScreenHeading title={translate('home.title')} />

        <Surface elevation="card" style={{ borderRadius: theme.radius.hero, padding: theme.spacing.md }}>
          <TextField
            accessibilityHint={translate('home.intentHelper')}
            helperText={translate('home.intentHelper')}
            inputStyle={theme.typography.body}
            label={translate('home.intentLabel')}
            maxLength={500}
            multiline
            onChangeText={onNeedTextChange}
            placeholder={translate('home.intentHint')}
            textAlignVertical="top"
            value={needText}
          />
          <View style={[styles.actionRow, { columnGap: theme.spacing.sm, marginTop: theme.spacing.md, rowGap: theme.spacing.sm }]}>
            <Button
              disabled={cameraCapability.status !== 'available'}
              label={translate('home.camera')}
              leading={<IntakeIcon name="camera-outline" tone="primary" />}
              onPress={onOpenPhotoBrief}
              variant="secondary"
            />
            {showVoice ? (
              <Button
                accessibilityHint={translate('home.voiceHint')}
                label={translate('home.voice')}
                leading={<IntakeIcon name="microphone-outline" tone="primary" />}
                onPress={onOpenVoiceAssistance}
                variant="secondary"
              />
            ) : null}
          </View>
          <CapabilityNotice capability={cameraCapability} title={translate('home.camera')} />
          <CapabilityNotice capability={voiceAssistanceCapability} title={translate('home.voice')} />
        </Surface>

        {hasIntent ? (
          <View>
            <SectionHeader subtitle={translate('home.suggestionsBody')} title={translate('home.suggestions')} />
            <View style={[styles.stack, { marginTop: theme.spacing.sm, rowGap: theme.spacing.sm }]}>
              {suggestions.length > 0 ? suggestions.map((suggestion) => (
                <OptionCard
                  body={suggestion.explanation}
                  icon="clipboard-text-search-outline"
                  key={`${suggestion.serviceId}:${suggestion.serviceVersion}`}
                  onPress={() => onSelectSuggestion(suggestion)}
                  title={suggestion.label}
                />
              )) : (
                <Surface variant="subtle">
                  <Text allowFontScaling style={[theme.typography.label, { color: theme.colors.text }]}>
                    {translate('home.noServices')}
                  </Text>
                  <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>
                    {translate('home.noServicesBody')}
                  </Text>
                </Surface>
              )}
            </View>
          </View>
        ) : null}

        {serviceShortcuts.length > 0 ? (
          <View>
            <SectionHeader subtitle={translate('home.servicesBody')} title={translate('home.services')} />
            <ScrollView
              contentContainerStyle={{ columnGap: theme.spacing.sm, paddingVertical: theme.spacing.sm }}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              {serviceShortcuts.map((shortcut) => (
                <Chip
                  key={`${shortcut.serviceId}:${shortcut.serviceVersion}`}
                  label={shortcut.label}
                  onPress={() => onSelectShortcut(shortcut)}
                  tone="brand"
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {activeProject ? (
          <View>
            <SectionHeader title={translate('home.activeProject')} />
            <HomeEvidenceCard
              body={`${activeProject.statusLabel} · ${activeProject.areaLabel}`}
              icon="briefcase-clock-outline"
              onPress={() => onOpenActiveProject(activeProject)}
              photoUrl={activeProject.workerPhotoUrl}
              testID={`home-project-${activeProject.projectId}`}
              title={activeProject.title}
              workerLabel={activeProject.workerName}
            />
          </View>
        ) : null}

        {showRelationships ? (
          <View>
            <SectionHeader title={translate('home.recentWorkers')} />
            <View style={[styles.stack, { marginTop: theme.spacing.sm, rowGap: theme.spacing.sm }]}>
              {recentWorkers.map((worker) => (
                <HomeEvidenceCard
                  body={worker.serviceLabel}
                  icon="account-hard-hat-outline"
                  key={worker.workerId}
                  onPress={() => onOpenRecentWorker(worker)}
                  photoUrl={worker.photoUrl}
                  testID={`home-recent-worker-${worker.workerId}`}
                  title={worker.displayName}
                />
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </AppScaffold>
  );
}

function HomeEvidenceCard({
  title,
  body,
  workerLabel = null,
  photoUrl,
  icon,
  testID,
  onPress,
}: Readonly<{
  title: string;
  body: string;
  workerLabel?: string | null;
  photoUrl: string | null;
  icon: IntakeIconName;
  testID: string;
  onPress: () => void;
}>) {
  const theme = useTogtTheme();
  return (
    <Surface
      accessibilityHint="Opens the server-authoritative details."
      accessibilityLabel={`${title}. ${workerLabel ? `${workerLabel}. ` : ''}${body}`}
      elevation="card"
      onPress={onPress}
      style={{ marginTop: theme.spacing.sm }}
      testID={testID}
    >
      <View style={[styles.row, { gap: theme.spacing.md }]}>
        {isSafeRemoteImageUrl(photoUrl) ? (
          <Image accessibilityLabel={`${workerLabel ?? title} profile photo`} source={{ uri: photoUrl }} style={[styles.avatar, { borderColor: theme.colors.border, borderRadius: theme.radius.pill }]} />
        ) : (
          <View style={[styles.avatarFallback, { backgroundColor: theme.colors.surfacePositive, borderRadius: theme.radius.pill }]}>
            <IntakeIcon name={icon} />
          </View>
        )}
        <View style={styles.flex}>
          <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>{title}</Text>
          {workerLabel ? <Text allowFontScaling style={[theme.typography.label, { color: theme.colors.actionPrimaryPressed }]}>{workerLabel}</Text> : null}
          <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{body}</Text>
        </View>
        <IntakeIcon name="chevron-right" tone="secondary" />
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  avatar: { borderWidth: 1, height: 64, width: 64 },
  avatarFallback: { alignItems: 'center', height: 64, justifyContent: 'center', width: 64 },
  content: {},
  flex: { flex: 1 },
  row: { alignItems: 'center', flexDirection: 'row' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap' },
  stack: {},
});

export default CustomerHomeScreen;
