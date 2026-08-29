import { useNetInfo } from '@react-native-community/netinfo';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { accountReadinessFromWorkerProfileV1 } from '../../../data/grounded';
import type { GroundedCatalogueService, WorkerProfileBundle } from '../../../data/grounded';
import { useTogtTheme } from '../../../design';
import {
  acknowledgeGroundedWorkerActivation,
  createGroundedWorkerOffering,
  isGroundedWorkerError,
  loadGroundedCatalogue,
  loadGroundedWorkerActivation,
  loadGroundedWorkerProfile,
  saveGroundedWorkerPublicProfile,
  saveGroundedWorkerEmergencyContact,
  updateGroundedWorkerOffering,
} from '../../../services';
import { logoutThunk } from '../../../store/authSlice';
import { AppScaffold, Button, EmptyState, ScreenError, SectionHeader, Surface, TopAppBar } from '../../../ui';
import {
  WorkerAccountReadinessScreen,
  WorkerActivationScreen,
  WorkerServicesProfileScreen,
} from '../lifecycle';
import type {
  ActivationSnapshot,
  ConnectionState,
  LifecycleResourceState,
  ProfileEditorDraft,
  ServiceEditorFormValues,
  ServicesProfileSnapshot,
  WorkerAccountReadinessSnapshot,
  WorkerLifecycleIntent,
  WorkerServiceOffering,
} from '../lifecycle';

export const GROUNDED_WORKER_PROFILE_ROUTE_NAMES = Object.freeze({
  activation: 'WorkerActivation',
  servicesProfile: 'WorkerServicesProfile',
  accountReadiness: 'WorkerAccountReadiness',
  serviceCatalogue: 'WorkerServiceCatalogue',
} as const);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function useConnectionState(): ConnectionState {
  const network = useNetInfo();
  return network.isConnected === true && network.isInternetReachable !== false ? 'online' : 'offline';
}

function useWorkerId(): string {
  const value = useSelector((state: any) => state.auth.user?.id);
  return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : '';
}

function problem<T>(error: unknown, title: string): LifecycleResourceState<T> {
  return Object.freeze({
    status: 'error',
    title,
    message: isGroundedWorkerError(error)
      ? error.problem.detail
      : 'The server response could not be verified. Refresh before taking action.',
    correlationId: isGroundedWorkerError(error) ? error.problem.correlationId : null,
  });
}

function offlineProblem<T>(title: string): LifecycleResourceState<T> {
  return Object.freeze({
    status: 'error',
    title,
    message: 'Reconnect to load the current server-authoritative Worker record.',
    correlationId: null,
  });
}

function amountInput(amountMinor: number | null): string {
  return amountMinor === null ? '' : (amountMinor / 100).toFixed(2);
}

function formForOffering(service: WorkerServiceOffering): ServiceEditorFormValues {
  return Object.freeze({
    offeringId: service.offeringId,
    title: service.customerFacingTitle,
    description: service.description,
    hourlyRateRand: amountInput(service.hourlyRate?.amountMinor ?? null),
    minimumDurationMinutes: service.minimumDurationMinutes === null ? '' : String(service.minimumDurationMinutes),
    callOutAmountRand: amountInput(service.callOutAmount?.amountMinor ?? null),
    serviceAreaLabel: service.serviceAreaLabel,
  });
}

function profileDraft(bundle: WorkerProfileBundle): ProfileEditorDraft {
  const profile = bundle.snapshot.publicProfile;
  return Object.freeze({
    profileId: profile.profileId,
    displayName: profile.displayName,
    about: profile.about,
  });
}

function withOfferingMutation(
  snapshot: ServicesProfileSnapshot,
  offeringId: string,
  state: 'saving' | 'confirmed' | 'failed_rolled_back',
  message: string | null,
): ServicesProfileSnapshot {
  return Object.freeze({
    ...snapshot,
    services: Object.freeze(snapshot.services.map((service) => service.offeringId === offeringId
      ? Object.freeze({
          ...service,
          mutation: Object.freeze({
            state,
            message,
            confirmedAt: state === 'confirmed' ? new Date().toISOString() : null,
          }),
        })
      : service)),
  });
}

function withProfileMutation(
  snapshot: ServicesProfileSnapshot,
  state: 'saving' | 'confirmed' | 'failed_rolled_back',
  message: string | null,
): ServicesProfileSnapshot {
  return Object.freeze({
    ...snapshot,
    publicProfile: Object.freeze({
      ...snapshot.publicProfile,
      mutation: Object.freeze({
        state,
        message,
        confirmedAt: state === 'confirmed' ? new Date().toISOString() : null,
      }),
    }),
  });
}

export function WorkerActivationRoute({ navigation }: { navigation: any }) {
  const connectionState = useConnectionState();
  const workerId = useWorkerId();
  const [resource, setResource] = useState<LifecycleResourceState<ActivationSnapshot>>({ status: 'loading' });
  const [mutationItemId, setMutationItemId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!workerId) {
      setResource(problem(new Error('worker_session_invalid'), 'Worker session is unavailable'));
      return;
    }
    if (connectionState === 'offline') {
      setResource((current) => current.status === 'ready' ? current : offlineProblem('Setup is unavailable offline'));
      return;
    }
    setResource((current) => current.status === 'ready' ? current : { status: 'loading' });
    try {
      setResource({ status: 'ready', value: await loadGroundedWorkerActivation() });
    } catch (error) {
      setResource(problem(error, 'Setup could not be loaded'));
    }
  }, [connectionState, workerId]);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const acknowledgePolicy = async (
    kind: 'foreground_location' | 'safety_policy' | 'first_job_readiness',
    policyVersion: string,
    expectedRevision: number,
    itemId: string,
  ) => {
    if (connectionState === 'offline' || mutationItemId !== null) return;
    setMutationItemId(itemId);
    try {
      const value = await acknowledgeGroundedWorkerActivation({
        kind,
        policyVersion,
        revision: expectedRevision,
        idempotencyKey: `worker-activation:${kind}:${policyVersion}:v${expectedRevision}`,
        connectionState,
      });
      setResource({ status: 'ready', value });
    } catch (error) {
      Alert.alert(
        'Acknowledgement was not saved',
        isGroundedWorkerError(error)
          ? error.problem.detail
          : 'Refresh the current setup record before trying again. Nothing was marked complete.',
      );
      await refresh();
    } finally {
      setMutationItemId(null);
    }
  };

  const saveEmergencyContact = async (phone: string, itemId: string) => {
    if (connectionState === 'offline' || mutationItemId !== null || resource.status !== 'ready') return;
    let fingerprint = 2166136261;
    for (let index = 0; index < phone.length; index += 1) {
      fingerprint ^= phone.charCodeAt(index);
      fingerprint = Math.imul(fingerprint, 16777619);
    }
    const privateFingerprint = (fingerprint >>> 0).toString(16).padStart(8, '0');
    setMutationItemId(itemId);
    try {
      const value = await saveGroundedWorkerEmergencyContact({
        phone,
        revision: resource.value.stateVersion,
        idempotencyKey: `worker-emergency-contact:${workerId}:v${resource.value.stateVersion}:${privateFingerprint}`,
        connectionState,
      });
      setResource({ status: 'ready', value });
    } catch (error) {
      Alert.alert(
        'Emergency contact was not saved',
        isGroundedWorkerError(error)
          ? error.problem.detail
          : 'Refresh the current setup record before trying again. The public profile was not changed.',
      );
      await refresh();
    } finally {
      setMutationItemId(null);
    }
  };

  const openItem = (destinationKey: string) => {
    if (destinationKey === 'WorkerServicesProfile') navigation.navigate(GROUNDED_WORKER_PROFILE_ROUTE_NAMES.servicesProfile);
    else if (destinationKey === 'KYC') navigation.navigate('KYC');
    else if (destinationKey === 'WorkerSafety' || destinationKey === 'SafetyCentre') navigation.navigate('SafetyCentre');
    else if (destinationKey === 'Account') navigation.navigate(GROUNDED_WORKER_PROFILE_ROUTE_NAMES.accountReadiness);
    else if (destinationKey === 'WorkerEarnings') navigation.navigate('WorkerTabs', { screen: 'Earnings' });
    else {
      Alert.alert(
        'Setup content unavailable',
        'This APK does not contain approved, version-matched acknowledgement content for that item. Nothing was marked complete.'
      );
    }
  };

  return (
    <WorkerActivationScreen
      activation={resource}
      connectionState={connectionState}
      onBack={() => navigation.goBack()}
      mutationItemId={mutationItemId}
      onAcknowledgePolicy={acknowledgePolicy}
      onOpenAvailability={() => navigation.navigate('WorkerTabs', { screen: 'Today' })}
      onOpenItem={openItem}
      onRetry={refresh}
      onSaveEmergencyContact={saveEmergencyContact}
    />
  );
}

type WorkerCatalogueResource =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'error'; message: string; correlationId: string | null }>
  | Readonly<{ status: 'ready'; services: readonly GroundedCatalogueService[] }>;

export function WorkerServiceCatalogueRoute({ navigation }: { navigation: any }) {
  const theme = useTogtTheme();
  const connectionState = useConnectionState();
  const workerId = useWorkerId();
  const [resource, setResource] = useState<WorkerCatalogueResource>({ status: 'loading' });
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!workerId || connectionState === 'offline') {
      setResource({ status: 'error', message: 'Reconnect with a valid Worker session to load exact published services.', correlationId: null });
      return;
    }
    setResource({ status: 'loading' });
    try {
      const [catalogue, profile] = await Promise.all([
        loadGroundedCatalogue(),
        loadGroundedWorkerProfile(),
      ]);
      const selected = new Set(profile.snapshot.services.map((service) => `${service.facts.serviceId}:v${service.facts.serviceVersion}`));
      setResource({
        status: 'ready',
        services: Object.freeze(catalogue.filter((service) => !selected.has(`${service.id}:v${service.version}`))),
      });
    } catch (error) {
      setResource({
        status: 'error',
        message: isGroundedWorkerError(error) ? error.problem.detail : 'Published services could not be verified.',
        correlationId: isGroundedWorkerError(error) ? error.problem.correlationId : null,
      });
    }
  }, [connectionState, workerId]);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const addService = async (service: GroundedCatalogueService) => {
    if (connectionState === 'offline' || submittingId !== null) return;
    setSubmittingId(service.id);
    try {
      await createGroundedWorkerOffering({
        serviceId: service.id,
        serviceVersion: service.version,
        idempotencyKey: `worker-catalogue:${service.id}:v${service.version}`,
        connectionState,
      });
      navigation.replace(GROUNDED_WORKER_PROFILE_ROUTE_NAMES.servicesProfile);
    } catch (error) {
      setSubmittingId(null);
      setResource({
        status: 'error',
        message: isGroundedWorkerError(error) ? error.problem.detail : 'The service was not added. No opt-in was assumed.',
        correlationId: isGroundedWorkerError(error) ? error.problem.correlationId : null,
      });
    }
  };

  return (
    <AppScaffold
      contentContainerStyle={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.xxxl }}
      scrollable
      testID="worker-service-catalogue-route"
      topBar={<TopAppBar onBack={() => navigation.goBack()} title="Add a service" />}
    >
      {resource.status === 'loading' ? (
        <Surface variant="subtle"><Text allowFontScaling style={[theme.typography.body, { color: theme.colors.textSecondary }]}>Loading exact published service versions…</Text></Surface>
      ) : resource.status === 'error' ? (
        <ScreenError
          actionLabel="Try again"
          body={resource.message}
          {...(resource.correlationId ? { correlationId: resource.correlationId } : {})}
          onAction={() => { void refresh(); }}
          title="Services could not be loaded"
        />
      ) : resource.services.length === 0 ? (
        <EmptyState body="Every currently published service version is already in your profile, or none is published." title="No services to add" />
      ) : (
        <>
          <SectionHeader subtitle="Category, version, risk and pricing facts stay catalogue controlled." title="Published services" />
          <View style={{ gap: theme.spacing.md }}>
            {resource.services.map((service) => (
              <Surface elevation="card" key={`${service.id}:v${service.version}`} style={{ gap: theme.spacing.sm }}>
                <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>{service.label}</Text>
                <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.textSecondary }]}>{service.description}</Text>
                <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>Version {service.version} · {service.pricingMode.replaceAll('_', ' ')} · {service.riskTier} risk</Text>
                <Button
                  disabled={connectionState === 'offline' || submittingId !== null}
                  label="Add inactive service"
                  loading={submittingId === service.id}
                  onPress={() => { void addService(service); }}
                />
              </Surface>
            ))}
          </View>
        </>
      )}
    </AppScaffold>
  );
}

export function WorkerServicesProfileRoute({ navigation }: { navigation: any }) {
  const connectionState = useConnectionState();
  const workerId = useWorkerId();
  const [bundle, setBundle] = useState<WorkerProfileBundle | null>(null);
  const [resource, setResource] = useState<LifecycleResourceState<ServicesProfileSnapshot>>({ status: 'loading' });
  const [selectedOfferingId, setSelectedOfferingId] = useState<string | null>(null);
  const [serviceForm, setServiceForm] = useState<ServiceEditorFormValues | null>(null);
  const [draft, setDraft] = useState<ProfileEditorDraft>({ profileId: workerId, displayName: '', about: '' });

  const applyBundle = useCallback((next: WorkerProfileBundle) => {
    const currentSelection = selectedOfferingId;
    const selected = next.snapshot.services.find((service) => service.offeringId === currentSelection)
      ?? next.snapshot.services[0]
      ?? null;
    setBundle(next);
    setResource({ status: 'ready', value: next.snapshot });
    setSelectedOfferingId(selected?.offeringId ?? null);
    setServiceForm(selected ? formForOffering(selected) : null);
    setDraft(profileDraft(next));
  }, [selectedOfferingId]);

  const refresh = useCallback(async () => {
    if (!workerId) {
      setResource(problem(new Error('worker_session_invalid'), 'Worker profile is unavailable'));
      return;
    }
    if (connectionState === 'offline') {
      setResource((current) => current.status === 'ready' ? current : offlineProblem('Worker profile is unavailable offline'));
      return;
    }
    setResource((current) => current.status === 'ready' ? current : { status: 'loading' });
    try {
      applyBundle(await loadGroundedWorkerProfile());
    } catch (error) {
      setResource(problem(error, 'Worker profile could not be loaded'));
    }
  }, [applyBundle, connectionState, workerId]);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const selectService = (offeringId: string) => {
    const selected = bundle?.snapshot.services.find((service) => service.offeringId === offeringId) ?? null;
    setSelectedOfferingId(selected?.offeringId ?? null);
    setServiceForm(selected ? formForOffering(selected) : null);
  };

  const runCommand = async (intent: WorkerLifecycleIntent) => {
    if (!bundle || connectionState === 'offline') return;
    const prior = bundle.snapshot;
    try {
      if (intent.command === 'save_public_profile') {
        setResource({ status: 'ready', value: withProfileMutation(prior, 'saving', null) });
        const next = await saveGroundedWorkerPublicProfile({
          displayName: String(intent.payload.displayName ?? ''),
          about: String(intent.payload.about ?? ''),
          revision: intent.stateVersion,
          idempotencyKey: intent.idempotencyKey,
          connectionState,
        });
        setBundle(next);
        setDraft(profileDraft(next));
        setResource({ status: 'ready', value: withProfileMutation(next.snapshot, 'confirmed', 'Public profile saved from the latest server record.') });
        return;
      }
      if (intent.command !== 'save_service' && intent.command !== 'set_service_active') return;
      const offeringId = intent.resourceId ?? '';
      setResource({ status: 'ready', value: withOfferingMutation(prior, offeringId, 'saving', null) });
      const patch = intent.command === 'set_service_active'
        ? { active: intent.payload.active === true }
        : {
            title: String(intent.payload.title ?? ''),
            description: String(intent.payload.description ?? ''),
            serviceAreaLabel: String(intent.payload.serviceAreaLabel ?? ''),
            ...(typeof intent.payload.hourlyRateMinor === 'number' ? { hourlyRateMinor: intent.payload.hourlyRateMinor } : {}),
            ...(typeof intent.payload.minimumDurationMinutes === 'number' ? { minimumDurationMinutes: intent.payload.minimumDurationMinutes } : {}),
            ...(typeof intent.payload.callOutAmountMinor === 'number' ? { callOutAmountMinor: intent.payload.callOutAmountMinor } : {}),
          };
      const next = await updateGroundedWorkerOffering({
        offeringId,
        patch,
        revision: intent.stateVersion,
        idempotencyKey: intent.idempotencyKey,
        connectionState,
      });
      setBundle(next);
      const selected = next.snapshot.services.find((service) => service.offeringId === offeringId) ?? null;
      setServiceForm(selected ? formForOffering(selected) : null);
      setResource({ status: 'ready', value: withOfferingMutation(next.snapshot, offeringId, 'confirmed', 'Service saved from the latest server record.') });
    } catch (error) {
      const message = isGroundedWorkerError(error)
        ? error.problem.detail
        : 'The server did not confirm this change. Your previous values remain shown.';
      const failed = intent.command === 'save_public_profile'
        ? withProfileMutation(prior, 'failed_rolled_back', message)
        : withOfferingMutation(prior, intent.resourceId ?? '', 'failed_rolled_back', message);
      setResource({ status: 'ready', value: failed });
    }
  };

  return (
    <WorkerServicesProfileScreen
      actorId={workerId || 'worker-session-unavailable'}
      capabilities={bundle?.capabilities ?? null}
      commandKeys={{
        save_public_profile: 'worker-profile-save',
        save_service: 'worker-service-save',
        set_service_active: 'worker-service-active',
      }}
      connectionState={connectionState}
      onAddService={() => navigation.navigate(GROUNDED_WORKER_PROFILE_ROUTE_NAMES.serviceCatalogue)}
      onBack={() => navigation.goBack()}
      onCommand={(intent) => { void runCommand(intent); }}
      onProfileDraftChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
      onRetry={refresh}
      onSelectService={selectService}
      onServiceFormChange={(patch) => setServiceForm((current) => current ? { ...current, ...patch } : current)}
      profileDraft={draft}
      resource={resource}
      selectedOfferingId={selectedOfferingId}
      serviceForm={serviceForm}
    />
  );
}

export function WorkerAccountReadinessRoute({ navigation }: { navigation: any }) {
  const dispatch = useDispatch();
  const connectionState = useConnectionState();
  const workerId = useWorkerId();
  const [resource, setResource] = useState<LifecycleResourceState<WorkerAccountReadinessSnapshot>>({ status: 'loading' });

  const refresh = useCallback(async () => {
    if (!workerId) {
      setResource(problem(new Error('worker_session_invalid'), 'Worker account is unavailable'));
      return;
    }
    if (connectionState === 'offline') {
      setResource((current) => current.status === 'ready' ? current : offlineProblem('Worker account is unavailable offline'));
      return;
    }
    setResource((current) => current.status === 'ready' ? current : { status: 'loading' });
    try {
      const [profile, activation] = await Promise.all([
        loadGroundedWorkerProfile(),
        loadGroundedWorkerActivation(),
      ]);
      const adapted = accountReadinessFromWorkerProfileV1(profile, activation);
      if (!adapted.ok) throw new Error(adapted.field);
      setResource({ status: 'ready', value: adapted.value });
    } catch (error) {
      setResource(problem(error, 'Worker account could not be loaded'));
    }
  }, [connectionState, workerId]);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const openEntry = (destinationKey: string) => {
    if (destinationKey === 'WorkerServicesProfile') navigation.navigate(GROUNDED_WORKER_PROFILE_ROUTE_NAMES.servicesProfile);
    else if (destinationKey === 'KYC') navigation.navigate('KYC');
    else if (destinationKey === 'SafetyCentre') navigation.navigate('SafetyCentre');
    else if (destinationKey === 'TrustFairness') navigation.navigate('TrustFairness');
    else if (destinationKey === 'NotificationControls') navigation.navigate('NotificationControls');
  };

  const signOut = () => Alert.alert('Sign out?', 'You will need to sign in again to continue.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign out', style: 'destructive', onPress: () => { void dispatch(logoutThunk() as never); } },
  ]);

  return (
    <WorkerAccountReadinessScreen
      connectionState={connectionState}
      onOpenEntry={openEntry}
      onOpenSupport={() => navigation.navigate('SafetyCentre')}
      onRetry={refresh}
      onSignOut={signOut}
      resource={resource}
    />
  );
}
