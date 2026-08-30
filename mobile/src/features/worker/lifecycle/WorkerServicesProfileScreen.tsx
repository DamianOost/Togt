import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { WorkerProfileCapabilities } from '../../../data/grounded';
import { useTogtTheme } from '../../../design';
import {
  AppScaffold,
  Button,
  Chip,
  SectionHeader,
  StatusPill,
  Surface,
  TextField,
  TopAppBar,
} from '../../../ui';
import { workerLifecycleMessage, formatLifecycleMoney } from './copy';
import { EvidenceValue, LifecycleActionRow, LifecycleResource, LifecycleRow } from './components';
import { createWorkerLifecycleIntent } from './controller';
import type { WorkerLifecycleIntent } from './controller';
import {
  hasServerEvidence,
  isSafeLifecycleImageUri,
  normaliseServiceEditorForm,
  validateProfileDraft,
} from './model';
import type {
  ConnectionState,
  LifecycleResourceState,
  ProfileEditorDraft,
  ServiceEditorFormValues,
  ServicesProfileSnapshot,
  WorkerServiceOffering,
} from './model';

type ProfileCommand = 'save_service' | 'set_service_active' | 'save_public_profile';

const PROFILE_PHOTO_REPLACEMENT_REASON = 'Profile photo replacement is unavailable in this APK because no protected upload and moderation contract is approved.';
const PORTFOLIO_CAPABILITY_UNKNOWN_REASON = 'Portfolio media stays read-only until current capability evidence is available.';
const CREDENTIAL_CAPABILITY_UNKNOWN_REASON = 'Credential evidence stays read-only until current capability evidence is available.';

export type WorkerServicesProfileScreenProps = Readonly<{
  resource: LifecycleResourceState<ServicesProfileSnapshot>;
  capabilities: WorkerProfileCapabilities | null;
  connectionState: ConnectionState;
  actorId: string;
  selectedOfferingId: string | null;
  serviceForm: ServiceEditorFormValues | null;
  profileDraft: ProfileEditorDraft;
  commandKeys: Readonly<Record<ProfileCommand, string>>;
  onBack: () => void;
  onRetry: () => void;
  onAddService: () => void;
  onSelectService: (offeringId: string) => void;
  onServiceFormChange: (patch: Partial<ServiceEditorFormValues>) => void;
  onProfileDraftChange: (patch: Partial<ProfileEditorDraft>) => void;
  onCommand: (intent: WorkerLifecycleIntent) => void;
}>;

export function WorkerServicesProfileScreen({
  resource,
  capabilities,
  connectionState,
  actorId,
  selectedOfferingId,
  serviceForm,
  profileDraft,
  commandKeys,
  onBack,
  onRetry,
  onAddService,
  onSelectService,
  onServiceFormChange,
  onProfileDraftChange,
  onCommand,
}: WorkerServicesProfileScreenProps) {
  const theme = useTogtTheme();
  return (
    <AppScaffold
      contentContainerStyle={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.xxxl }}
      keyboardAware
      scrollable
      testID="worker-services-profile-screen"
      topBar={<TopAppBar onBack={onBack} title={workerLifecycleMessage('service.title')} />}
    >
      <LifecycleResource connectionState={connectionState} onRetry={onRetry} resource={resource}>
        {(snapshot) => {
          const selected = snapshot.services.find((service) => service.offeringId === selectedOfferingId) ?? null;
          return (
            <>
              <PublicProfileEditor
                actorId={actorId}
                commandKey={commandKeys.save_public_profile}
                connectionState={connectionState}
                draft={profileDraft}
                onCommand={onCommand}
                onDraftChange={onProfileDraftChange}
                profile={snapshot.publicProfile}
              />

              <View style={{ gap: theme.spacing.md }}>
                <SectionHeader actionLabel="Add service" onAction={onAddService} subtitle={workerLifecycleMessage('service.catalogueReadOnly')} title={workerLifecycleMessage('service.choose')} />
                <View style={[styles.wrap, { gap: theme.spacing.xs }]}>
                  {snapshot.services.map((service) => (
                    <Chip
                      key={service.offeringId}
                      label={service.customerFacingTitle || service.facts.catalogueLabel}
                      onPress={() => onSelectService(service.offeringId)}
                      selected={selected?.offeringId === service.offeringId}
                      testID={`service-selector-${service.offeringId}`}
                    />
                  ))}
                </View>
              </View>

              {selected && serviceForm ? (
                <ServiceEditor
                  actorId={actorId}
                  commandKeys={commandKeys}
                  capabilities={capabilities}
                  connectionState={connectionState}
                  form={serviceForm}
                  onCommand={onCommand}
                  onFormChange={onServiceFormChange}
                  service={selected}
                />
              ) : (
                <Surface variant="subtle">
                  <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.textSecondary }]}>{snapshot.services.length === 0 ? workerLifecycleMessage('service.emptyBody') : 'Choose a service to review its catalogue facts and permitted fields.'}</Text>
                </Surface>
              )}
              <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>{workerLifecycleMessage('common.lastUpdated', { time: snapshot.lastUpdatedAt })}</Text>
            </>
          );
        }}
      </LifecycleResource>
    </AppScaffold>
  );
}

function PublicProfileEditor({
  profile,
  draft,
  actorId,
  commandKey,
  connectionState,
  onDraftChange,
  onCommand,
}: Readonly<{
  profile: ServicesProfileSnapshot['publicProfile'];
  draft: ProfileEditorDraft;
  actorId: string;
  commandKey: string;
  connectionState: ConnectionState;
  onDraftChange: (patch: Partial<ProfileEditorDraft>) => void;
  onCommand: (intent: WorkerLifecycleIntent) => void;
}>) {
  const theme = useTogtTheme();
  const validation = validateProfileDraft(profile, draft);
  const photoUri = profile.photoReplacement.previewUri
    ?? (hasServerEvidence(profile.profilePhoto) ? profile.profilePhoto.value.uri : null);
  const submit = () => {
    const result = createWorkerLifecycleIntent({
      actorId,
      command: 'save_public_profile',
      connectionState,
      requestKey: commandKey,
      resourceId: profile.profileId,
      stateVersion: profile.stateVersion,
      payload: { displayName: draft.displayName.trim(), about: draft.about.trim() },
    });
    if (result.ok) onCommand(result.intent);
  };
  return (
    <View style={{ gap: theme.spacing.md }}>
      <SectionHeader subtitle={workerLifecycleMessage('profile.privateBody')} title={workerLifecycleMessage('profile.publicPreview')} />
      <Surface elevation="card" style={{ gap: theme.spacing.md }}>
        <View style={[styles.profileHeader, { gap: theme.spacing.lg }]}>
          {isSafeLifecycleImageUri(photoUri) ? (
            <Image accessibilityLabel={`${profile.displayName} public profile photo`} source={{ uri: photoUri }} style={[styles.profilePhoto, { borderRadius: theme.radius.hero }]} />
          ) : (
            <View accessibilityLabel="Public profile photo unavailable" style={[styles.photoFallback, { backgroundColor: theme.colors.surfacePositive, borderRadius: theme.radius.hero }]}>
              <MaterialCommunityIcons color={theme.colors.actionPrimary} name="account-outline" size={48} />
            </View>
          )}
          <View style={styles.flex}>
            <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h2, { color: theme.colors.text }]}>{profile.displayName}</Text>
            <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.textSecondary }]}>{profile.about}</Text>
            <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>{profile.serviceAreaLabel}</Text>
          </View>
        </View>
        {profile.photoReplacement.state === 'uploading' && profile.photoReplacement.progressPercent !== null ? (
          <Text accessibilityLiveRegion="polite" allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{workerLifecycleMessage('profile.uploading', { progress: profile.photoReplacement.progressPercent })}</Text>
        ) : null}
        {profile.photoReplacement.state === 'failed' ? (
          <Text accessibilityRole="alert" allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.error }]}>{profile.photoReplacement.message ?? 'Photo replacement failed. The existing image remains active.'}</Text>
        ) : null}
        <Button
          accessibilityHint={PROFILE_PHOTO_REPLACEMENT_REASON}
          disabled
          label={workerLifecycleMessage('profile.replacePhoto')}
          variant="secondary"
        />
        <Text
          allowFontScaling
          style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}
          testID="profile-photo-replacement-unavailable"
        >
          {PROFILE_PHOTO_REPLACEMENT_REASON}
        </Text>
        <SectionHeader title={workerLifecycleMessage('profile.badges')} />
        {profile.publicBadges.length > 0 ? profile.publicBadges.map((badge) => (
          <Surface key={badge.badgeId} style={{ gap: theme.spacing.xxs }} variant={badge.status === 'verified' ? 'positive' : 'subtle'}>
            <Text allowFontScaling style={[theme.typography.label, { color: theme.colors.text }]}>{badge.label}</Text>
            <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{badge.detail}</Text>
            <StatusPill label={badge.status.replaceAll('_', ' ')} tone={badge.status === 'verified' ? 'complete' : badge.status === 'pending' ? 'pending' : 'offline'} />
          </Surface>
        )) : <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{workerLifecycleMessage('profile.noBadgeEvidence')}</Text>}
      </Surface>

      <Surface style={{ gap: theme.spacing.md }}>
        <SectionHeader title={workerLifecycleMessage('profile.publicFields')} />
        <TextField label="Public name" onChangeText={(displayName) => onDraftChange({ displayName })} value={draft.displayName} />
        <TextField label={workerLifecycleMessage('profile.about')} multiline onChangeText={(about) => onDraftChange({ about })} value={draft.about} />
        {validation.issues.map((issue) => <Text accessibilityRole="alert" allowFontScaling key={`${issue.field}-${issue.code}`} style={[theme.typography.caption, { color: theme.colors.error }]}>{issue.message}</Text>)}
        <Button disabled={connectionState === 'offline' || !validation.valid || profile.mutation.state === 'saving'} label={workerLifecycleMessage('profile.save')} loading={profile.mutation.state === 'saving'} onPress={submit} />
        {profile.mutation.state === 'failed_rolled_back' ? <Text accessibilityRole="alert" allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.error }]}>{profile.mutation.message ?? workerLifecycleMessage('service.failedRollback')}</Text> : null}
      </Surface>

      <Surface style={{ gap: theme.spacing.sm }} variant="subtle">
        <SectionHeader title={workerLifecycleMessage('profile.privateFields')} />
        <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{workerLifecycleMessage('profile.privateBody')}</Text>
        {profile.privateDetailLabels.map((detail) => <LifecycleRow icon="lock-outline" key={detail.detailId} label={detail.label} value={detail.statusLabel} />)}
      </Surface>
    </View>
  );
}

function ServiceEditor({
  service,
  form,
  actorId,
  commandKeys,
  capabilities,
  connectionState,
  onFormChange,
  onCommand,
}: Readonly<{
  service: WorkerServiceOffering;
  form: ServiceEditorFormValues;
  actorId: string;
  commandKeys: Readonly<Record<ProfileCommand, string>>;
  capabilities: WorkerProfileCapabilities | null;
  connectionState: ConnectionState;
  onFormChange: (patch: Partial<ServiceEditorFormValues>) => void;
  onCommand: (intent: WorkerLifecycleIntent) => void;
}>) {
  const theme = useTogtTheme();
  const credentialCapabilityReason = capabilities?.credentialSubmission.explanation
    ?? CREDENTIAL_CAPABILITY_UNKNOWN_REASON;
  const portfolioCapabilityReason = capabilities?.portfolioUpload.explanation
    ?? PORTFOLIO_CAPABILITY_UNKNOWN_REASON;
  const normalized = normaliseServiceEditorForm(service, form);
  const save = () => {
    if (!normalized.validation.valid) return;
    const draft = normalized.draft;
    const result = createWorkerLifecycleIntent({
      actorId,
      command: 'save_service',
      connectionState,
      requestKey: commandKeys.save_service,
      resourceId: service.offeringId,
      stateVersion: service.stateVersion,
      payload: {
        title: draft.title.trim(),
        description: draft.description.trim(),
        serviceAreaLabel: draft.serviceAreaLabel.trim(),
        ...(draft.hourlyRateMinor !== null ? { hourlyRateMinor: draft.hourlyRateMinor } : {}),
        ...(draft.minimumDurationMinutes !== null ? { minimumDurationMinutes: draft.minimumDurationMinutes } : {}),
        ...(draft.callOutAmountMinor !== null ? { callOutAmountMinor: draft.callOutAmountMinor } : {}),
      },
    });
    if (result.ok) onCommand(result.intent);
  };
  const toggle = () => {
    const result = createWorkerLifecycleIntent({
      actorId,
      command: 'set_service_active',
      connectionState,
      requestKey: commandKeys.set_service_active,
      resourceId: service.offeringId,
      stateVersion: service.stateVersion,
      payload: { active: !service.active },
    });
    if (result.ok) onCommand(result.intent);
  };
  return (
    <View style={{ gap: theme.spacing.md }}>
      <Surface style={{ gap: theme.spacing.sm }} variant="subtle">
        <SectionHeader subtitle={workerLifecycleMessage('service.catalogueReadOnly')} title={workerLifecycleMessage('service.catalogueFacts')} />
        <LifecycleRow icon="shape-outline" label="Canonical category" value={service.facts.canonicalCategory} />
        <LifecycleRow icon="source-branch" label="Service version" value={String(service.facts.serviceVersion)} />
        <LifecycleRow icon="cash-multiple" label="Pricing mode" value={service.facts.pricingMode.replaceAll('_', ' ')} />
        <LifecycleRow icon="shield-check-outline" label="Risk tier" value={service.facts.riskTier.replaceAll('_', ' ')} />
        {service.facts.fixedPayoutRule ? <LifecycleRow icon="lock-outline" label="Fixed payout rule" value={service.facts.fixedPayoutRule} /> : null}
        {service.facts.pricingMode === 'fixed' ? (
          <>
            <EvidenceValue evidence={service.facts.fixedCustomerAmount} label="Fixed customer amount" render={formatLifecycleMoney} />
            <EvidenceValue evidence={service.facts.fixedWorkerNet} label="Fixed Worker net" render={formatLifecycleMoney} />
          </>
        ) : null}
      </Surface>

      <Surface elevation="card" style={{ gap: theme.spacing.md }}>
        <View style={styles.split}>
          <View style={styles.flex}>
            <SectionHeader title={service.customerFacingTitle || service.facts.catalogueLabel} />
            <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{workerLifecycleMessage('service.activeBody')}</Text>
          </View>
          <StatusPill label={service.active ? 'Active' : 'Inactive'} tone={service.active ? 'available' : 'offline'} />
        </View>
        <TextField label={workerLifecycleMessage('service.customerTitle')} onChangeText={(title) => onFormChange({ title })} value={form.title} />
        <TextField label={workerLifecycleMessage('service.description')} multiline onChangeText={(description) => onFormChange({ description })} value={form.description} />
        {service.facts.pricingMode === 'hourly' ? <TextField inputMode="decimal" label={workerLifecycleMessage('service.hourlyRate')} onChangeText={(hourlyRateRand) => onFormChange({ hourlyRateRand })} value={form.hourlyRateRand} /> : null}
        <TextField inputMode="numeric" label={workerLifecycleMessage('service.minimumDuration')} onChangeText={(minimumDurationMinutes) => onFormChange({ minimumDurationMinutes })} value={form.minimumDurationMinutes} />
        <TextField inputMode="decimal" label={workerLifecycleMessage('service.callOut')} onChangeText={(callOutAmountRand) => onFormChange({ callOutAmountRand })} value={form.callOutAmountRand} />
        <TextField label={workerLifecycleMessage('service.area')} onChangeText={(serviceAreaLabel) => onFormChange({ serviceAreaLabel })} value={form.serviceAreaLabel} />
        {normalized.validation.issues.map((issue) => <Text accessibilityRole="alert" allowFontScaling key={`${issue.field}-${issue.code}-${issue.message}`} style={[theme.typography.caption, { color: theme.colors.error }]}>{issue.message}</Text>)}
        <LifecycleActionRow>
          <Button disabled={connectionState === 'offline' || !normalized.validation.valid || service.mutation.state === 'saving'} label={workerLifecycleMessage('service.save')} loading={service.mutation.state === 'saving'} onPress={save} style={styles.flex} />
          <Button disabled={connectionState === 'offline' || service.mutation.state === 'saving'} label={service.active ? workerLifecycleMessage('service.toggleOff') : workerLifecycleMessage('service.toggleOn')} onPress={toggle} variant="secondary" />
        </LifecycleActionRow>
        {service.mutation.state === 'failed_rolled_back' ? <Text accessibilityRole="alert" allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.error }]}>{service.mutation.message ?? workerLifecycleMessage('service.failedRollback')}</Text> : null}
      </Surface>

      <Surface style={{ gap: theme.spacing.md }}>
        <SectionHeader subtitle={credentialCapabilityReason} title={workerLifecycleMessage('service.credentials')} />
        {service.credentialEvidence.map((credential) => (
          <Surface
            accessibilityLabel={`${credential.label}. ${credential.status.replaceAll('_', ' ')}. Read-only credential evidence. ${credentialCapabilityReason}`}
            key={credential.credentialId}
            style={styles.split}
            testID={`credential-evidence-${credential.credentialId}`}
          >
            <Text allowFontScaling style={[theme.typography.body, styles.flex, { color: theme.colors.text }]}>{credential.label}</Text>
            <StatusPill label={credential.status.replaceAll('_', ' ')} tone={credential.status === 'verified' ? 'complete' : credential.status === 'failed' || credential.status === 'missing' ? 'error' : 'pending'} />
          </Surface>
        ))}
      </Surface>

      <Surface style={{ gap: theme.spacing.md }}>
        <SectionHeader
          subtitle={portfolioCapabilityReason}
          title={workerLifecycleMessage('service.portfolio')}
        />
        <Button
          accessibilityHint={portfolioCapabilityReason}
          disabled
          label="Add portfolio media"
          variant="secondary"
        />
        <View style={[styles.portfolio, { gap: theme.spacing.sm }]}>
          {service.portfolio.filter((item) => isSafeLifecycleImageUri(item.imageUri)).map((item) => (
            <Surface key={item.mediaId} style={styles.portfolioCard} variant={item.status === 'rejected' ? 'danger' : 'default'}>
              <Image accessibilityLabel={item.caption} source={{ uri: item.imageUri }} style={[styles.portfolioImage, { borderRadius: theme.radius.input }]} />
              <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: theme.spacing.xs }]}>{item.caption}</Text>
              <StatusPill label={item.status.replaceAll('_', ' ')} tone={item.status === 'published' ? 'complete' : item.status === 'rejected' ? 'error' : 'pending'} />
              {item.rejectionReason ? <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.error }]}>{item.rejectionReason}</Text> : null}
            </Surface>
          ))}
        </View>
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  split: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap' },
  profileHeader: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap' },
  profilePhoto: { height: 120, width: 120 },
  photoFallback: { alignItems: 'center', height: 120, justifyContent: 'center', width: 120 },
  portfolio: { flexDirection: 'row', flexWrap: 'wrap' },
  portfolioCard: { width: 220 },
  portfolioImage: { height: 132, width: '100%' },
});

export default WorkerServicesProfileScreen;
