import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { packagedFeatureEnabled } from '../../../app/runtimeFeatureFlags';
import { useTogtTheme } from '../../../design';
import {
  catalogueShortcuts,
  catalogueSuggestions,
  adaptQuoteMatchingSnapshotV1,
  pricingExplanation,
} from '../../../data/grounded';
import type { GroundedCatalogueService } from '../../../data/grounded';
import {
  createGroundedQuoteRequest,
  cancelGroundedQuoteRequest,
  isGroundedMarketplaceError,
  loadGroundedProject,
  loadGroundedProjects,
  loadGroundedQuoteRequest,
  loadGroundedQuotes,
  runGroundedQuoteCommand,
} from '../../../services';
import { loadGroundedFavourites } from '../../../services/groundedTrust';
import { loadIntelligenceCapability } from '../../../services/groundedIntelligence';
import {
  AppScaffold,
  Button,
  EmptyState,
  InlineError,
  OfflineBanner,
  ScreenError,
  SectionHeader,
  Surface,
  TopAppBar,
} from '../../../ui';
import {
  AddressPinConfirmationScreen,
  CustomerHomeScreen,
  GuidedJobBriefScreen,
  ReviewEstimateScreen,
  ScheduleFulfilmentScreen,
  createResolvedJobAddress,
  isAddressResolutionDispatchSafe,
} from '../intake';
import type {
  AddressDetails,
  BriefAnswerValue,
  BriefStep,
  CapabilityState,
  FulfilmentMode,
  JobAddress,
  ScheduleSelection,
  SubmissionCapabilityContext,
  SubmissionIntent,
} from '../intake';
import { useCustomerExperience } from './CustomerExperienceContext';
import {
  adaptCustomerHomeProjectList,
  adaptCustomerHomeSourceProject,
  buildRecentWorkerSummaries,
  selectCustomerHomeProject,
} from './customerHomeEvidence';
import {
  MatchingWorkerChoiceScreen,
} from '../projects';
import type {
  CustomerCommandIntent,
  Loadable,
  MatchingSnapshot,
} from '../projects';

const UNAVAILABLE_MEDIA: CapabilityState = Object.freeze({
  status: 'unavailable',
  reasonCode: 'job_media_upload_not_configured',
  explanation: 'Job photos stay unavailable until the protected job-media upload contract is configured.',
});
const UNAVAILABLE_AI: CapabilityState = Object.freeze({
  status: 'unavailable',
  reasonCode: 'assistance_disabled',
  explanation: 'Assisted interpretation is not enabled in this build.',
});
const UNVERIFIED_AI: CapabilityState = Object.freeze({
  status: 'unavailable',
  reasonCode: 'assistance_capability_unverified',
  explanation: 'Assisted interpretation stays off until this APK verifies a fresh server capability response.',
});
const AVAILABLE_AI: CapabilityState = Object.freeze({
  status: 'available',
  reasonCode: 'assistance_capability_verified',
  explanation: 'Assisted interpretation is packaged and the server capability is currently available.',
});
const UNAVAILABLE_RELATIONSHIPS: CapabilityState = Object.freeze({
  status: 'unavailable',
  reasonCode: 'relationships_disabled',
  explanation: 'Recent Worker relationships are not enabled in this build.',
});
const UNVERIFIED_RELATIONSHIPS: CapabilityState = Object.freeze({
  status: 'unavailable',
  reasonCode: 'relationship_evidence_unverified',
  explanation: 'Recent Worker relationships stay hidden until their current server evidence can be verified.',
});
const AVAILABLE_RELATIONSHIPS: CapabilityState = Object.freeze({
  status: 'available',
  reasonCode: 'relationship_evidence_verified',
  explanation: 'Recent Workers come from verified favourites and their completed source Projects.',
});
const UNAVAILABLE_PROVIDER: CapabilityState = Object.freeze({
  status: 'unavailable',
  reasonCode: 'provider_not_configured',
  explanation: 'This provider is not configured in this build.',
});
const UNAVAILABLE_CURRENT_LOCATION: CapabilityState = Object.freeze({
  status: 'unavailable',
  reasonCode: 'reverse_geocoding_not_configured',
  explanation: 'Current location stays off until device coordinates can be verified against a canonical displayed address.',
});

function addressLabel(address: JobAddress): string | null {
  const parts = [
    address.details.line1,
    address.details.unitOrComplex,
    address.details.suburb,
    address.details.city,
    address.details.province,
    address.details.postalCode,
  ].map((part) => part.trim()).filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

function broadAreaLabel(address: JobAddress): string | null {
  const parts = [address.details.suburb, address.details.city, address.details.province]
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length >= 2 ? parts.join(', ') : null;
}

function scheduleLabel(schedule: ScheduleSelection | null): string | null {
  if (!schedule) return null;
  if (schedule.kind === 'now') return 'Now';
  if (!schedule.startsAt) return null;
  return new Intl.DateTimeFormat('en-ZA', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Johannesburg',
  }).format(new Date(schedule.startsAt));
}

function fulfilmentLabel(mode: FulfilmentMode | undefined): string | null {
  if (!mode) return null;
  return {
    fast_match: 'Fast Match',
    compare_workers: 'Compare Workers',
    receive_quotes: 'Receive Quotes',
    diagnostic_visit: 'Diagnostic Visit',
  }[mode];
}

function unavailable(reasonCode: string, explanation: string): CapabilityState {
  return Object.freeze({ status: 'unavailable', reasonCode, explanation });
}

function quoteCapabilities(selectedMode: FulfilmentMode | undefined): SubmissionCapabilityContext {
  const modes: Record<FulfilmentMode, CapabilityState> = {
    fast_match: unavailable('matching_contract_not_enabled', 'Fast Match is disabled until the canonical offer contract is active.'),
    compare_workers: unavailable('reservation_contract_not_enabled', 'Worker comparison is disabled until server availability can be reserved.'),
    receive_quotes: unavailable('service_mode_not_selected', 'Select a published remote-quote service to receive quotes.'),
    diagnostic_visit: unavailable('diagnostic_contract_not_enabled', 'Diagnostic visits are disabled until the visit contract is active.'),
  };
  if (selectedMode === 'receive_quotes') {
    modes.receive_quotes = Object.freeze({
      status: 'available',
      reasonCode: 'quote_request_contract_available',
      explanation: 'The server can create a versioned quote request. Worker supply is not guaranteed.',
    });
  }
  return Object.freeze({
    payment: unavailable('checkout_disabled', 'Online checkout is not enabled in this build.'),
    fulfilment: Object.freeze(modes),
  });
}

export function CustomerHomeRoute({ navigation }: { navigation: any }) {
  const {
    catalogue,
    connectionState,
    draft,
    refreshCatalogue,
    reviseDraft,
    selectService,
  } = useCustomerExperience();
  const relationshipsPackaged = packagedFeatureEnabled('relationships');
  const assistancePackaged = packagedFeatureEnabled('aiAssistedIntake');
  const refreshSequence = useRef(0);
  const [activeProject, setActiveProject] = useState<import('../intake').ActiveProjectSummary | null>(null);
  const [recentWorkers, setRecentWorkers] = useState<readonly import('../intake').RecentWorkerSummary[]>([]);
  const [relationshipsCapability, setRelationshipsCapability] = useState<CapabilityState>(
    relationshipsPackaged ? UNVERIFIED_RELATIONSHIPS : UNAVAILABLE_RELATIONSHIPS,
  );
  const [voiceAssistanceCapability, setVoiceAssistanceCapability] = useState<CapabilityState>(
    assistancePackaged ? UNVERIFIED_AI : UNAVAILABLE_AI,
  );
  const [homeEvidenceProblem, setHomeEvidenceProblem] = useState<'projects' | 'relationships' | 'both' | null>(null);
  const services = catalogue.state === 'ready' ? catalogue.services : [];
  const suggestions = useMemo(
    () => catalogueSuggestions(services, draft.needText),
    [services, draft.needText],
  );
  const shortcuts = useMemo(() => catalogueShortcuts(services), [services]);
  const refreshHomeEvidence = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    if (connectionState === 'offline') return;

    const projectRequest = (async () => {
      const [activeResponse, upcomingResponse] = await Promise.all([
        loadGroundedProjects('active'),
        loadGroundedProjects('upcoming'),
      ]);
      const active = adaptCustomerHomeProjectList(activeResponse, 'active');
      const upcoming = adaptCustomerHomeProjectList(upcomingResponse, 'upcoming');
      if (!active.ok || !upcoming.ok) throw new Error('home_project_contract_invalid');
      return selectCustomerHomeProject(active.value, upcoming.value);
    })();

    const relationshipRequest = relationshipsPackaged
      ? (async () => {
          const favourites = await loadGroundedFavourites();
          const sourceProjects = await Promise.all(favourites.map(async (favourite) => {
            const response = await loadGroundedProject(favourite.sourceProjectReference);
            const adapted = adaptCustomerHomeSourceProject(response, favourite.sourceProjectReference);
            if (!adapted.ok) throw new Error(adapted.reasonCode);
            return adapted.value;
          }));
          const adapted = buildRecentWorkerSummaries(favourites, sourceProjects);
          if (!adapted.ok) throw new Error(adapted.reasonCode);
          return adapted.value;
        })()
      : null;

    const [projectResult, relationshipResult] = await Promise.all([
      projectRequest.then(
        (value) => ({ ok: true as const, value }),
        () => ({ ok: false as const }),
      ),
      relationshipRequest
        ? relationshipRequest.then(
            (value) => ({ ok: true as const, value }),
            () => ({ ok: false as const }),
          )
        : Promise.resolve({ ok: true as const, value: Object.freeze([]) }),
    ]);
    if (sequence !== refreshSequence.current) return;

    setActiveProject(projectResult.ok ? projectResult.value : null);
    if (relationshipsPackaged && relationshipResult.ok) {
      setRecentWorkers(relationshipResult.value);
      setRelationshipsCapability(AVAILABLE_RELATIONSHIPS);
    } else {
      setRecentWorkers([]);
      setRelationshipsCapability(relationshipsPackaged ? UNVERIFIED_RELATIONSHIPS : UNAVAILABLE_RELATIONSHIPS);
    }
    const projectsFailed = !projectResult.ok;
    const relationshipsFailed = relationshipsPackaged && !relationshipResult.ok;
    setHomeEvidenceProblem(projectsFailed && relationshipsFailed
      ? 'both'
      : projectsFailed
        ? 'projects'
        : relationshipsFailed
          ? 'relationships'
          : null);
  }, [connectionState, relationshipsPackaged]);

  useFocusEffect(useCallback(() => {
    void refreshHomeEvidence();
    return () => { refreshSequence.current += 1; };
  }, [refreshHomeEvidence]));

  useFocusEffect(useCallback(() => {
    let active = true;
    if (!assistancePackaged) {
      setVoiceAssistanceCapability(UNAVAILABLE_AI);
      return () => { active = false; };
    }
    setVoiceAssistanceCapability(UNVERIFIED_AI);
    void loadIntelligenceCapability('ai_assisted_intake', { forceRefresh: true }).then((capability) => {
      if (!active) return;
      setVoiceAssistanceCapability(capability.available
        ? AVAILABLE_AI
        : Object.freeze({
            status: 'unavailable' as const,
            reasonCode: capability.reasonCode,
            explanation: `Assisted interpretation remains unavailable (${capability.reasonCode.replaceAll('_', ' ')}). Use the normal editable job brief.`,
          }));
    });
    return () => { active = false; };
  }, [assistancePackaged]));

  const catalogueNotice = catalogue.state === 'error'
    ? {
        id: 'catalogue-unavailable',
        tone: 'attention' as const,
        title: 'Services are temporarily unavailable',
        body: catalogue.message,
        actionLabel: 'Try again',
      }
    : catalogue.state === 'ready' && catalogue.services.length === 0
      ? {
          id: 'catalogue-empty',
          tone: 'attention' as const,
          title: 'No services are published yet',
          body: 'TOGT will show services only after Operations publishes approved versions and activates genuine supply.',
          actionLabel: 'Refresh',
        }
      : null;
  const evidenceNotice = homeEvidenceProblem === 'both'
    ? {
        id: 'home-evidence-unavailable',
        tone: 'attention' as const,
        title: 'Projects and saved Workers could not be verified',
        body: 'No unverified Project or Worker information is shown. Reconnect if needed, then try again.',
        actionLabel: 'Try again',
      }
    : homeEvidenceProblem === 'projects'
      ? {
          id: 'project-evidence-unavailable',
          tone: 'attention' as const,
          title: 'Projects could not be verified',
          body: 'The active Project card stays hidden until the current server response can be verified.',
          actionLabel: 'Try again',
        }
      : homeEvidenceProblem === 'relationships'
        ? {
            id: 'relationship-evidence-unavailable',
            tone: 'attention' as const,
            title: 'Saved Workers could not be verified',
            body: 'Recent Workers stay hidden until each favourite and its completed source Project can be verified.',
            actionLabel: 'Try again',
          }
        : null;
  const notice = catalogueNotice ?? evidenceNotice;

  const choose = (item: Readonly<{ serviceId: string; serviceVersion: number; label: string }>) => {
    if (!selectService(item.serviceId, item.serviceVersion)) return;
    reviseDraft({ needText: draft.needText || item.label });
    navigation.navigate('JobBrief');
  };

  return (
    <CustomerHomeScreen
      activeProject={activeProject}
      cameraCapability={UNAVAILABLE_MEDIA}
      connectionState={connectionState}
      consequentialNotice={notice}
      locationLabel={addressLabel(draft.address)}
      needText={draft.needText}
      onContinue={() => navigation.navigate(draft.selectedService ? 'JobBrief' : 'ServiceSelect')}
      onNeedTextChange={(needText) => reviseDraft({ needText })}
      onOpenAccount={() => navigation.navigate('Account')}
      onOpenActiveProject={(project) => navigation.navigate('ProjectHub', { projectId: project.projectId })}
      onOpenConsequentialNotice={(selectedNotice) => {
        if (selectedNotice.id.startsWith('catalogue-')) void refreshCatalogue();
        else void refreshHomeEvidence();
      }}
      onOpenLocation={() => navigation.navigate('Address')}
      onOpenPhotoBrief={() => navigation.navigate('JobBrief', { step: 'photos' })}
      onOpenRecentWorker={(worker) => navigation.navigate('LabourerProfile', {
        workerId: worker.workerId,
        serviceId: worker.serviceId,
        serviceVersion: worker.serviceVersion,
      })}
      onOpenVoiceAssistance={() => navigation.navigate('AssistedIntake')}
      onSelectShortcut={choose}
      onSelectSuggestion={choose}
      recentWorkers={recentWorkers}
      relationshipsCapability={relationshipsCapability}
      serviceShortcuts={shortcuts}
      suggestions={suggestions}
      voiceAssistanceCapability={voiceAssistanceCapability}
    />
  );
}

export function CustomerServiceSelectRoute({ navigation }: { navigation: any }) {
  const theme = useTogtTheme();
  const { catalogue, connectionState, refreshCatalogue, selectService } = useCustomerExperience();
  const select = (service: GroundedCatalogueService) => {
    if (selectService(service.id, service.version)) navigation.replace('JobBrief');
  };
  return (
    <AppScaffold
      contentContainerStyle={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.xxxl }}
      scrollable
      testID="customer-service-select-screen"
      topBar={<TopAppBar onBack={() => navigation.goBack()} title="Choose a service" />}
    >
      {connectionState === 'offline' ? <OfflineBanner message="Reconnect to load the published service catalogue." /> : null}
      {catalogue.state === 'loading' ? (
        <View
          accessibilityLabel="Loading published services"
          style={[styles.loading, { gap: theme.spacing.md, minHeight: theme.sizing.stateGlyph * 3 }]}
        >
          <ActivityIndicator color={theme.colors.actionPrimary} size="large" />
          <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.textSecondary }]}>Loading published services…</Text>
        </View>
      ) : catalogue.state === 'error' ? (
        <ScreenError
          actionLabel="Try again"
          body={catalogue.message}
          {...(catalogue.correlationId ? { correlationId: catalogue.correlationId } : {})}
          onAction={() => { void refreshCatalogue(); }}
          title="Services could not be loaded"
        />
      ) : catalogue.services.length === 0 ? (
        <EmptyState
          actionLabel="Refresh"
          body="No approved service version is published. TOGT will not invent a service, price or Worker."
          onAction={() => { void refreshCatalogue(); }}
          title="No services available"
        />
      ) : (
        <>
          <SectionHeader subtitle="Pricing and fulfilment come from each published version." title="Published services" />
          <View style={{ gap: theme.spacing.md }}>
            {catalogue.services.map((service) => {
              const explanation = pricingExplanation(service);
              return (
                <Surface
                  accessibilityHint={`Uses ${explanation.modeLabel}. ${explanation.explanation}`}
                  accessibilityLabel={service.label}
                  elevation="card"
                  key={`${service.id}:v${service.version}`}
                  onPress={() => select(service)}
                  testID={`catalogue-service-${service.id}`}
                >
                  <View style={{ gap: theme.spacing.xs }}>
                    <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>{service.label}</Text>
                    <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.textSecondary }]}>{service.description}</Text>
                    <Text allowFontScaling style={[theme.typography.label, { color: theme.colors.actionPrimary }]}>{explanation.modeLabel}</Text>
                  </View>
                </Surface>
              );
            })}
          </View>
        </>
      )}
    </AppScaffold>
  );
}

const BRIEF_STEPS: readonly BriefStep[] = ['details', 'photos', 'responsibility', 'estimate'];

export function CustomerJobBriefRoute({ navigation, route }: { navigation: any; route: any }) {
  const { draft, selectedService, reviseDraft, saveDraft } = useCustomerExperience();
  const requestedStep = BRIEF_STEPS.includes(route.params?.step) ? route.params.step as BriefStep : 'details';
  const [activeStep, setActiveStep] = useState<BriefStep>(requestedStep);
  const errors = useMemo(() => {
    if (!selectedService) return {};
    return Object.fromEntries(selectedService.requiredQuestionIds
      .filter((id) => {
        const value = draft.brief.answers[id];
        return value == null || (typeof value === 'string' && value.trim() === '');
      })
      .map((id) => [id, 'This answer is required.']));
  }, [draft.brief.answers, selectedService]);

  if (!selectedService || !draft.selectedService) {
    return (
      <AppScaffold testID="job-brief-service-required" topBar={<TopAppBar onBack={() => navigation.goBack()} title="Job brief" />}>
        <EmptyState
          actionLabel="Choose a service"
          body="Select a current published service version before adding job details."
          onAction={() => navigation.replace('ServiceSelect')}
          title="Service required"
        />
      </AppScaffold>
    );
  }

  const reviseBrief = (changes: Partial<typeof draft.brief>) => reviseDraft({
    brief: { ...draft.brief, ...changes },
  });
  const next = () => {
    const index = BRIEF_STEPS.indexOf(activeStep);
    if (activeStep === 'details' && Object.keys(errors).length > 0) return;
    if (index >= 0 && index < BRIEF_STEPS.length - 1) {
      setActiveStep(BRIEF_STEPS[index + 1] ?? 'estimate');
      return;
    }
    navigation.navigate('Address');
  };

  return (
    <GuidedJobBriefScreen
      activeStep={activeStep}
      draft={draft}
      onAddPhoto={() => {}}
      onAnswerChange={(questionId: string, value: BriefAnswerValue) => reviseBrief({
        answers: { ...draft.brief.answers, [questionId]: value },
      })}
      onBack={() => {
        const index = BRIEF_STEPS.indexOf(activeStep);
        if (index > 0) setActiveStep(BRIEF_STEPS[index - 1] ?? 'details');
        else navigation.goBack();
      }}
      onBudgetCapMinorChange={(budgetCapMinor) => reviseBrief({ budgetCapMinor })}
      onContinue={next}
      onDiagnosticNeedChange={(diagnosticNeed) => reviseBrief({ diagnosticNeed })}
      onEditNeed={() => navigation.navigate('CustomerTabs', { screen: 'Home' })}
      onMaterialsResponsibilityChange={(materialsResponsibility) => reviseBrief({ materialsResponsibility })}
      onRemovePhoto={(attachment) => reviseBrief({
        attachments: draft.brief.attachments.filter((item) => item.localId !== attachment.localId),
      })}
      onRetryPhoto={() => {}}
      onSave={() => { void saveDraft(); }}
      photoCapability={UNAVAILABLE_MEDIA}
      pricingModeExplanation={pricingExplanation(selectedService)}
      questionGroup={selectedService.questions}
      validationErrors={errors}
    />
  );
}

export function CustomerAddressRoute({ navigation }: { navigation: any }) {
  const { connectionState, draft, reviseDraft, saveDraft } = useCustomerExperience();

  return (
    <AddressPinConfirmationScreen
        address={draft.address}
        addressResolutionCapability={UNAVAILABLE_PROVIDER}
        addressSearchCapability={UNAVAILABLE_PROVIDER}
        addressSearchQuery=""
        addressSuggestions={[]}
        connectionState={connectionState}
        currentLocationCapability={UNAVAILABLE_CURRENT_LOCATION}
        mapCapability={UNAVAILABLE_PROVIDER}
        mapPreview={null}
        onAddressSearchChange={() => {}}
        onBack={() => navigation.goBack()}
        onConfirmAddress={() => {
          if (!isAddressResolutionDispatchSafe(draft.address)) return;
          reviseDraft({
            address: createResolvedJobAddress({
              entryMode: draft.address.entryMode,
              details: draft.address.details,
              source: draft.address.resolution.source,
              coordinates: draft.address.resolution.coordinates,
              confirmedAt: new Date().toISOString(),
            }),
          });
          navigation.navigate('Schedule');
        }}
        onCorrectPin={() => reviseDraft({
          address: {
            ...draft.address,
            confirmedAt: null,
            resolution: {
              status: 'unresolved',
              source: null,
              coordinates: null,
              reasonCode: 'pin_correction_requested',
            },
          },
        })}
        onManualAddressChange={(address) => reviseDraft({ address })}
        onResolveManualAddress={() => {}}
        onSaveDraft={() => { void saveDraft(); }}
        onSelectAddressSuggestion={(suggestion) => reviseDraft({ address: suggestion.address })}
        onSelectSavedPlace={(place) => reviseDraft({ address: place.address })}
        onUseCurrentLocation={() => {}}
        resolvingAddress={false}
        savedPlaces={[]}
        searchingAddresses={false}
      />
  );
}

function defaultScheduledStart(): string {
  const value = new Date(Date.now() + (3 * 24 * 60 * 60 * 1_000));
  value.setHours(9, 0, 0, 0);
  return value.toISOString();
}

export function CustomerScheduleRoute({ navigation }: { navigation: any }) {
  const { connectionState, draft, reviseDraft, saveDraft, selectedService } = useCustomerExperience();
  const [pickerVisible, setPickerVisible] = useState(false);
  if (!selectedService || !draft.selectedService) {
    return (
      <AppScaffold testID="schedule-service-required" topBar={<TopAppBar onBack={() => navigation.goBack()} title="Schedule" />}>
        <EmptyState body="Choose a current service version before scheduling." title="Service required" />
      </AppScaffold>
    );
  }
  const allowed = draft.selectedService.allowedFulfilmentModes;
  const selectedMode = draft.schedule?.fulfilmentMode ?? allowed[0] ?? 'receive_quotes';
  const capabilities = quoteCapabilities(selectedMode).fulfilment;
  const changeSchedule = (changes: Partial<ScheduleSelection>) => {
    const current: ScheduleSelection = draft.schedule ?? {
      kind: 'scheduled',
      startsAt: defaultScheduledStart(),
      timezone: 'Africa/Johannesburg',
      estimatedDurationMinutes: selectedService.minimumDurationMinutes
        ? { min: selectedService.minimumDurationMinutes, max: selectedService.minimumDurationMinutes }
        : null,
      fulfilmentMode: selectedMode,
    };
    reviseDraft({ schedule: { ...current, ...changes } as ScheduleSelection });
  };
  return (
    <>
      <ScheduleFulfilmentScreen
        allowedFulfilmentModes={allowed}
        connectionState={connectionState}
        durationLabel={selectedService.minimumDurationMinutes ? `${selectedService.minimumDurationMinutes} minutes minimum` : null}
        fulfilmentCapabilities={capabilities}
        now={new Date().toISOString()}
        onBack={() => navigation.goBack()}
        onContinue={() => navigation.navigate('ReviewEstimate')}
        onFulfilmentModeChange={(fulfilmentMode) => changeSchedule({ fulfilmentMode })}
        onOpenDateTimePicker={() => setPickerVisible(true)}
        onSaveDraft={() => { void saveDraft(); }}
        onScheduleKindChange={(kind) => changeSchedule({
          kind,
          startsAt: kind === 'now' ? null : draft.schedule?.startsAt ?? defaultScheduledStart(),
        })}
        permitsNow={draft.selectedService.permitsNow}
        schedule={draft.schedule}
        scheduledTimeLabel={scheduleLabel(draft.schedule)}
      />
      {pickerVisible ? (
        <DateTimePicker
          minimumDate={new Date(Date.now() + 60 * 60 * 1_000)}
          mode="date"
          onChange={(_event, value) => {
            setPickerVisible(false);
            if (!value) return;
            const next = new Date(value);
            next.setHours(9, 0, 0, 0);
            changeSchedule({ kind: 'scheduled', startsAt: next.toISOString() });
          }}
          value={draft.schedule?.startsAt ? new Date(draft.schedule.startsAt) : new Date(defaultScheduledStart())}
        />
      ) : null}
    </>
  );
}

function quoteRequestPayload(intent: SubmissionIntent, service: GroundedCatalogueService) {
  const { snapshot } = intent;
  if (
    snapshot.schedule.kind !== 'scheduled'
    || !snapshot.schedule.startsAt
    || !isAddressResolutionDispatchSafe(snapshot.address)
  ) {
    throw new Error('quote_request_requires_scheduled_verified_address');
  }
  const startMs = Date.parse(snapshot.schedule.startsAt);
  const nowMs = Date.now();
  const quotesCloseMs = Math.min(startMs - (60 * 60 * 1_000), nowMs + (48 * 60 * 60 * 1_000));
  if (quotesCloseMs <= nowMs + (5 * 60 * 1_000)) throw new Error('quote_window_too_short');
  const questionsDeadlineMs = Math.min(quotesCloseMs - (60 * 60 * 1_000), nowMs + (24 * 60 * 60 * 1_000));
  const duration = snapshot.schedule.estimatedDurationMinutes?.max ?? service.minimumDurationMinutes ?? 60;
  const area = broadAreaLabel(snapshot.address);
  const exactAddress = addressLabel(snapshot.address);
  if (!area || !exactAddress) throw new Error('quote_location_incomplete');
  if (!snapshot.brief.materialsResponsibility) throw new Error('quote_materials_responsibility_missing');
  return {
    serviceId: snapshot.selectedService.serviceId,
    serviceVersion: snapshot.selectedService.serviceVersion,
    brief: {
      answers: snapshot.brief.answers,
      materialsResponsibility: snapshot.brief.materialsResponsibility,
      media: snapshot.brief.attachments.flatMap((attachment) => attachment.uploadStatus === 'uploaded' && attachment.remoteAssetId
        ? [{ id: attachment.remoteAssetId, kind: 'image' as const }]
        : []),
      summary: snapshot.needText,
    },
    broadAreaLabel: area,
    privateLocation: {
      address: exactAddress,
      latitude: snapshot.address.resolution.coordinates.latitude,
      longitude: snapshot.address.resolution.coordinates.longitude,
      ...(snapshot.address.details.accessInstructions
        ? { accessInstructions: snapshot.address.details.accessInstructions }
        : {}),
    },
    schedule: {
      startsAt: snapshot.schedule.startsAt,
      endsAt: new Date(startMs + (duration * 60 * 1_000)).toISOString(),
      timezone: 'Africa/Johannesburg' as const,
    },
    questionsDeadlineAt: new Date(questionsDeadlineMs).toISOString(),
    quotesCloseAt: new Date(quotesCloseMs).toISOString(),
  };
}

export function CustomerReviewRoute({ navigation }: { navigation: any }) {
  const { connectionState, draft, saveDraft, selectedService } = useCustomerExperience();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!selectedService) {
    return (
      <AppScaffold testID="review-service-required" topBar={<TopAppBar onBack={() => navigation.goBack()} title="Review" />}>
        <EmptyState body="Choose a current service version before confirming." title="Service required" />
      </AppScaffold>
    );
  }
  const selectedMode = draft.schedule?.fulfilmentMode;
  const capabilities = quoteCapabilities(selectedMode);
  const confirm = async (intent: SubmissionIntent) => {
    if (connectionState === 'offline' || selectedMode !== 'receive_quotes') return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await createGroundedQuoteRequest(
        quoteRequestPayload(intent, selectedService),
        intent.idempotencyKey,
      );
      const requestId = response && typeof response === 'object' && 'quoteRequest' in response
        && response.quoteRequest && typeof response.quoteRequest === 'object' && 'id' in response.quoteRequest
        ? String(response.quoteRequest.id)
        : null;
      if (!requestId) throw new Error('quote_request_contract_invalid');
      navigation.replace('QuoteRequest', { requestId });
    } catch (caught) {
      setError(isGroundedMarketplaceError(caught)
        ? caught.problem.detail
        : 'The quote request was not created. Review the schedule and try again.');
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <>
      {error ? <InlineError message={error} /> : null}
      <ReviewEstimateScreen
        capabilities={capabilities}
        displayLabels={{
          addressLabel: addressLabel(draft.address),
          scheduleLabel: scheduleLabel(draft.schedule),
          fulfilmentLabel: fulfilmentLabel(selectedMode),
          workerCriteriaLabel: 'Only eligible Workers opted into this exact service version can respond.',
          paymentAssuranceLabel: 'No payment is taken when this no-fee quote request is sent.',
        }}
        draft={draft}
        now={new Date().toISOString()}
        onBack={() => navigation.goBack()}
        onConfirm={(intent) => { void confirm(intent); }}
        onEditAddress={() => navigation.navigate('Address')}
        onEditCommercialTerms={() => navigation.navigate('JobBrief', { step: 'estimate' })}
        onEditPayment={() => navigation.navigate('CustomerTabs', { screen: 'Account' })}
        onEditSchedule={() => navigation.navigate('Schedule')}
        onEditServiceBrief={() => navigation.navigate('JobBrief')}
        onSaveDraft={() => { void saveDraft(); }}
        submitting={submitting}
      />
    </>
  );
}

export function CustomerQuoteRequestRoute({ navigation, route }: { navigation: any; route: any }) {
  const { actorId, connectionState } = useCustomerExperience();
  const requestId = typeof route.params?.requestId === 'string' ? route.params.requestId : '';
  const [matching, setMatching] = useState<Loadable<MatchingSnapshot>>({ state: 'loading' });
  const recommendationPackaged = packagedFeatureEnabled('explainableRecommendations');
  const [recommendationCapability, setRecommendationCapability] = useState({
    available: false,
    reasonCode: recommendationPackaged ? 'recommendation_capability_unverified' : 'disabled_in_this_build',
  });

  useFocusEffect(useCallback(() => {
    let active = true;
    if (!recommendationPackaged) {
      setRecommendationCapability({ available: false, reasonCode: 'disabled_in_this_build' });
      return () => { active = false; };
    }
    setRecommendationCapability({ available: false, reasonCode: 'recommendation_capability_unverified' });
    void loadIntelligenceCapability('explainable_recommendations', { forceRefresh: true }).then((capability) => {
      if (active) setRecommendationCapability(capability);
    });
    return () => { active = false; };
  }, [recommendationPackaged]));

  const refresh = useCallback(async () => {
    setMatching((current) => current.state === 'ready' ? current : { state: 'loading' });
    try {
      const [requestResponse, quotesResponse] = await Promise.all([
        loadGroundedQuoteRequest(requestId),
        loadGroundedQuotes(requestId),
      ]);
      const quoteRequest = requestResponse && typeof requestResponse === 'object' && 'quoteRequest' in requestResponse
        ? requestResponse.quoteRequest
        : null;
      const quotes = quotesResponse && typeof quotesResponse === 'object' && 'quotes' in quotesResponse
        ? quotesResponse.quotes
        : null;
      const adapted = adaptQuoteMatchingSnapshotV1(quoteRequest, quotes);
      if (!adapted.ok) throw new Error(adapted.reasonCode);
      setMatching({
        state: 'ready',
        value: adapted.value,
        connectionState,
        lastUpdatedAt: new Date().toISOString(),
      });
    } catch (error) {
      setMatching({
        state: 'error',
        correlationId: isGroundedMarketplaceError(error) ? error.problem.correlationId : null,
      });
    }
  }, [connectionState, requestId]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 15_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const runCommand = async (intent: CustomerCommandIntent) => {
    if (connectionState === 'offline') return;
    try {
      if (intent.command === 'retry_match') {
        await refresh();
        return;
      }
      if (intent.command === 'cancel_match') {
        await cancelGroundedQuoteRequest(requestId, intent.idempotencyKey);
        await refresh();
        return;
      }
      if (intent.command === 'accept_quote' && intent.targetId) {
        const response = await runGroundedQuoteCommand(intent.targetId, 'accept', intent.idempotencyKey);
        const projectId = response && typeof response === 'object' && 'project' in response
          && response.project && typeof response.project === 'object' && 'id' in response.project
          ? String(response.project.id)
          : null;
        if (projectId) {
          navigation.replace('ProjectHub', { projectId });
          return;
        }
        await refresh();
      }
    } catch {
      await refresh();
    }
  };

  return (
    <MatchingWorkerChoiceScreen
      actorId={actorId}
      commandKeys={{
        cancel_match: `quote:${requestId}:cancel`,
        retry_match: `quote:${requestId}:refresh`,
        select_worker: `quote:${requestId}:select-worker`,
        accept_quote: `quote:${requestId}:accept`,
        request_diagnostic: `quote:${requestId}:diagnostic`,
        confirm_hourly_match: `quote:${requestId}:hourly`,
      }}
      matching={matching}
      onBack={() => route.params?.returnTo === 'QuoteRequests'
        ? navigation.goBack()
        : navigation.navigate('CustomerTabs', { screen: 'Home' })}
      onCommand={(intent) => { void runCommand(intent); }}
      onOpenProject={(projectId) => navigation.replace('ProjectHub', { projectId })}
      onOpenRecommendationExplanation={(worker) => navigation.navigate('RecommendationExplanation', {
        quoteRequestId: requestId,
        workerId: worker.workerId,
      })}
      onOpenWorker={(worker) => navigation.navigate('LabourerProfile', {
        workerId: worker.workerId,
        serviceId: worker.serviceId,
        serviceVersion: worker.serviceVersion,
      })}
      onRetryLoad={() => { void refresh(); }}
      recommendationCapability={recommendationCapability}
      recommendationPackaged={recommendationPackaged}
    />
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
