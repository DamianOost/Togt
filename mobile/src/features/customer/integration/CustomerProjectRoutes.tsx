import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Linking, Text } from 'react-native';
import { packagedFeatureEnabled } from '../../../app/runtimeFeatureFlags';
import {
  adaptProjectHubV1,
  adaptProjectListItemV1,
  adaptCustomerOpenQuoteRequestListV1,
  adaptGroundedFulfilmentV1,
  completionPaymentFromProjectV1,
  customerActiveWorkFromFulfilmentV1,
  customerScopeFromFulfilmentV1,
  trackingEvidenceFromProjectV1,
} from '../../../data/grounded';
import type { CustomerOpenQuoteRequestSummary, GroundedFulfilment } from '../../../data/grounded';
import {
  isGroundedMarketplaceError,
  loadGroundedFulfilment,
  loadGroundedProject,
  loadGroundedProjects,
  loadGroundedQuoteRequests,
  loadGroundedRating,
  runGroundedCompletionCommand,
  runGroundedFulfilmentCommand,
  submitGroundedRating,
} from '../../../services';
import {
  createGroundedFavourite,
  createGroundedRebookDraft,
  loadGroundedRelationshipEligibility,
} from '../../../services/groundedTrust';
import {
  capabilityEnabled,
  getEffectiveCapabilities,
} from '../../../services/capabilityService';
import { loadIntelligenceCapability } from '../../../services/groundedIntelligence';
import { claimContextualSafetyEducation } from '../../../services/safetyEducationStore';
import { useTogtTheme } from '../../../design';
import {
  AppScaffold,
  Button,
  InlineError,
  Surface,
  TextField,
  TopAppBar,
} from '../../../ui';
import {
  CompletionPaymentScreen,
  ActiveWorkScreen,
  ProjectHubScreen,
  OpenQuoteRequestsScreen,
  ProjectsListScreen,
  ScopeStartScreen,
} from '../projects';
import type {
  ActiveWorkSnapshot,
  CompletionPaymentViewSnapshot,
  CustomerCommandIntent,
  Loadable,
  OperationalPhase,
  ProjectHubSnapshot,
  ProjectListItem,
  ProjectSegment,
  ScopeConfirmationViewSnapshot,
  TrackingEvidence,
} from '../projects';
import { useCustomerExperience } from './CustomerExperienceContext';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function correlationId(error: unknown): string | null {
  return isGroundedMarketplaceError(error) ? error.problem.correlationId : null;
}

function responseProject(response: unknown): unknown {
  return isRecord(response) ? response.project : null;
}

function responseProjects(response: unknown): readonly unknown[] | null {
  return isRecord(response) && Array.isArray(response.projects) ? response.projects : null;
}

function responseFulfilment(response: unknown): unknown {
  return isRecord(response) ? response.fulfilment : null;
}

function revealedStartPin(response: unknown): string | null {
  if (!isRecord(response) || typeof response.startPin !== 'string') return null;
  return /^\d{6}$/.test(response.startPin) ? response.startPin : null;
}

function projectPhone(raw: unknown): string | null {
  if (!isRecord(raw) || !isRecord(raw.participants) || !isRecord(raw.participants.worker)) return null;
  const value = raw.participants.worker.phone;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/[\s()-]/g, '');
  return /^\+?\d{9,15}$/.test(normalized) ? normalized : null;
}

function exactAddressWasAuthorised(raw: unknown): boolean {
  return isRecord(raw) && isRecord(raw.area)
    && raw.area.precision === 'exact'
    && typeof raw.area.address === 'string'
    && raw.area.address.trim().length > 0;
}

export function CustomerProjectsRoute({ navigation }: { navigation: any }) {
  const { actorId, connectionState } = useCustomerExperience();
  const [segment, setSegment] = useState<ProjectSegment>('active');
  const [projects, setProjects] = useState<Loadable<readonly ProjectListItem[]>>({ state: 'loading' });

  const refresh = useCallback(async () => {
    if (connectionState === 'offline') {
      setProjects((current) => current.state === 'ready'
        ? { ...current, connectionState: 'offline' }
        : { state: 'error', correlationId: null });
      return;
    }
    setProjects((current) => current.state === 'ready' ? current : { state: 'loading' });
    try {
      const response = await loadGroundedProjects(segment);
      const rawItems = responseProjects(response);
      if (!rawItems) throw new Error('project_list_contract_invalid');
      const items: ProjectListItem[] = [];
      for (const raw of rawItems) {
        const adapted = adaptProjectListItemV1(raw);
        if (!adapted.ok) throw new Error(adapted.reasonCode);
        items.push(adapted.value);
      }
      const actionableItems = segment === 'upcoming'
        ? await Promise.all(items.map(async (item) => {
            try {
              const response = await loadGroundedFulfilment(item.projectId);
              const adapted = adaptGroundedFulfilmentV1(responseFulfilment(response));
              return adapted.ok
                ? Object.freeze({
                    ...item,
                    canReschedule: adapted.value.allowedActions.proposeReschedule
                      || adapted.value.allowedActions.decideReschedule,
                  })
                : item;
            } catch {
              return item;
            }
          }))
        : items;
      setProjects(actionableItems.length === 0
        ? { state: 'empty' }
        : {
            state: 'ready',
            value: Object.freeze(actionableItems),
            connectionState,
            lastUpdatedAt: new Date().toISOString(),
          });
    } catch (error) {
      setProjects({ state: 'error', correlationId: correlationId(error) });
    }
  }, [connectionState, segment]);

  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));

  return (
    <ProjectsListScreen
      actorId={actorId}
      commandKeys={{ cancel_project: `projects:${segment}:cancel-disabled` }}
      onCommand={() => {}}
      onOpenProject={(projectId) => navigation.navigate('ProjectHub', { projectId })}
      onOpenQuoteRequests={() => navigation.navigate('QuoteRequests')}
      onOpenRating={(projectId) => navigation.navigate('CompletionPayment', { projectId })}
      onOpenReceipt={(projectId) => navigation.navigate('CompletionPayment', { projectId })}
      onOpenSupport={(projectId) => navigation.navigate('SafetyHelp', { projectId })}
      onRetry={() => { void refresh(); }}
      onSelectSegment={setSegment}
      onStartRebook={(projectId) => navigation.navigate('Relationships', { sourceBookingId: projectId })}
      onStartReschedule={(projectId) => navigation.navigate('ProjectReschedule', { projectId })}
      projects={projects}
      selectedSegment={segment}
    />
  );
}

export function CustomerOpenQuoteRequestsRoute({ navigation }: { navigation: any }) {
  const { connectionState } = useCustomerExperience();
  const [requests, setRequests] = useState<Loadable<readonly CustomerOpenQuoteRequestSummary[]>>({ state: 'loading' });

  const refresh = useCallback(async () => {
    if (connectionState === 'offline') {
      setRequests((current) => current.state === 'ready'
        ? { ...current, connectionState: 'offline' }
        : { state: 'error', correlationId: null });
      return;
    }
    setRequests((current) => current.state === 'ready' ? current : { state: 'loading' });
    try {
      const response = await loadGroundedQuoteRequests();
      const adapted = adaptCustomerOpenQuoteRequestListV1(response);
      if (!adapted.ok) throw new Error(adapted.reasonCode);
      setRequests(adapted.value.length === 0
        ? { state: 'empty' }
        : {
            state: 'ready',
            value: adapted.value,
            connectionState,
            lastUpdatedAt: new Date().toISOString(),
          });
    } catch (error) {
      setRequests({ state: 'error', correlationId: correlationId(error) });
    }
  }, [connectionState]);

  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));

  return (
    <OpenQuoteRequestsScreen
      onBack={() => navigation.goBack()}
      onOpenRequest={(requestId) => navigation.navigate('QuoteRequest', { requestId, returnTo: 'QuoteRequests' })}
      onRetry={() => { void refresh(); }}
      requests={requests}
    />
  );
}

export function CustomerProjectHubRoute({ navigation, route }: { navigation: any; route: any }) {
  const { actorId, connectionState } = useCustomerExperience();
  const projectId = typeof route.params?.projectId === 'string' ? route.params.projectId : '';
  const [project, setProject] = useState<Loadable<ProjectHubSnapshot>>({ state: 'loading' });
  const [tracking, setTracking] = useState<TrackingEvidence>({ visibility: 'unavailable', lastKnownAt: null });
  const [serverNow, setServerNow] = useState(new Date().toISOString());
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [phone, setPhone] = useState<string | null>(null);
  const [exactAddressAuthorised, setExactAddressAuthorised] = useState(false);
  const [relationshipsAvailable, setRelationshipsAvailable] = useState(false);
  const liveStatusPackaged = packagedFeatureEnabled('livePlatformStatus');
  const safetyEducationPackaged = packagedFeatureEnabled('contextualSafetyEducation');
  const [safetyEducationVisible, setSafetyEducationVisible] = useState(false);
  const [liveStatusCapability, setLiveStatusCapability] = useState({
    available: false,
    reasonCode: liveStatusPackaged ? 'live_status_capability_unverified' : 'disabled_in_this_build',
  });

  const refresh = useCallback(async () => {
    if (connectionState === 'offline') {
      setProject((current) => current.state === 'ready'
        ? { ...current, connectionState: 'offline' }
        : { state: 'error', correlationId: null });
      return;
    }
    setProject((current) => current.state === 'ready' ? current : { state: 'loading' });
    setRelationshipsAvailable(false);
    try {
      const response = await loadGroundedProject(projectId);
      const raw = responseProject(response);
      const adapted = adaptProjectHubV1(raw);
      if (!adapted.ok) throw new Error(adapted.reasonCode);
      let canShareSafeStatus = false;
      try {
        const capabilities = await getEffectiveCapabilities({ forceRefresh: true });
        canShareSafeStatus = capabilityEnabled(capabilities, 'booking_details_share');
      } catch {
        // A capability lookup never enables sharing by inference.
      }
      const fetchedAt = new Date().toISOString();
      setServerNow(fetchedAt);
      setTracking(trackingEvidenceFromProjectV1(raw));
      setPhone(projectPhone(raw));
      setExactAddressAuthorised(exactAddressWasAuthorised(raw));
      setProject({
        state: 'ready',
        value: Object.freeze({ ...adapted.value, canShareSafeStatus }),
        connectionState,
        lastUpdatedAt: fetchedAt,
      });
      if (packagedFeatureEnabled('relationships')) {
        try {
          const eligibility = await loadGroundedRelationshipEligibility(projectId);
          setRelationshipsAvailable(
            eligibility.projectReference === projectId.toLowerCase()
              && eligibility.actions.block === true
          );
        } catch {
          // The entry remains absent unless the current server eligibility
          // contract can be verified; no relationship action is inferred.
          setRelationshipsAvailable(false);
        }
      }
    } catch (error) {
      setPhone(null);
      setExactAddressAuthorised(false);
      setTracking({ visibility: 'unavailable', lastKnownAt: null });
      setRelationshipsAvailable(false);
      setProject({ state: 'error', correlationId: correlationId(error) });
    }
  }, [connectionState, projectId]);

  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));

  useFocusEffect(useCallback(() => {
    let active = true;
    if (!liveStatusPackaged) {
      setLiveStatusCapability({ available: false, reasonCode: 'disabled_in_this_build' });
      return () => { active = false; };
    }
    setLiveStatusCapability({ available: false, reasonCode: 'live_status_capability_unverified' });
    void loadIntelligenceCapability('android_live_updates', { forceRefresh: true }).then((capability) => {
      if (active) setLiveStatusCapability(capability);
    });
    return () => { active = false; };
  }, [liveStatusPackaged]));

  useFocusEffect(useCallback(() => {
    let active = true;
    setSafetyEducationVisible(false);
    if (!safetyEducationPackaged || project.state !== 'ready') {
      return () => { active = false; };
    }
    void loadIntelligenceCapability('contextual_safety_education', { forceRefresh: true })
      .then(async (capability) => {
        if (!active || !capability.available) return false;
        return claimContextualSafetyEducation({
          actorId,
          trigger: 'first_project_hub',
        });
      })
      .then((visible) => {
        if (active) setSafetyEducationVisible(visible === true);
      });
    return () => { active = false; };
  }, [actorId, project, safetyEducationPackaged]));

  const openDominantAction = (phase: OperationalPhase, id: string) => {
    if (phase === 'arrived' || phase === 'scope_confirmation') {
      navigation.navigate('ScopeStart', { projectId: id });
      return;
    }
    if (phase === 'work_active') {
      navigation.navigate('ActiveWork', { projectId: id });
      return;
    }
    if (phase === 'completion_review' || phase === 'payment_pending' || phase === 'closed') {
      navigation.navigate('CompletionPayment', { projectId: id });
      return;
    }
    if (phase === 'unknown') {
      navigation.navigate('SafetyHelp', { projectId: id });
      return;
    }
    setDetailsExpanded(true);
  };

  return (
    <ProjectHubScreen
      contactRevealAuthorised={phone !== null}
      detailsExpanded={detailsExpanded}
      exactAddressRevealAuthorised={exactAddressAuthorised}
      onBack={() => navigation.goBack()}
      onContact={() => {
        if (phone) void Linking.openURL(`tel:${phone}`);
      }}
      onDominantAction={openDominantAction}
      onOpenChat={(id) => navigation.navigate('Chat', { bookingId: id })}
      onOpenPayment={(id) => navigation.navigate('CompletionPayment', { projectId: id })}
      onOpenLiveStatus={(id) => navigation.navigate('ProjectLiveStatus', { projectId: id })}
      onDismissSafetyEducation={() => setSafetyEducationVisible(false)}
      onOpenRelationships={(id) => navigation.navigate('Relationships', { sourceBookingId: id })}
      onOpenSafetyHelp={(id) => navigation.navigate('SafetyHelp', { projectId: id })}
      onOpenWorker={(worker) => navigation.navigate('LabourerProfile', {
        workerId: worker.workerId,
        serviceId: worker.serviceId,
        serviceVersion: worker.serviceVersion,
      })}
      onRetry={() => { void refresh(); }}
      onShareSafeStatus={(id) => navigation.navigate('SafeSharing', { projectId: id })}
      onToggleDetails={() => setDetailsExpanded((current) => !current)}
      project={project}
      liveStatusCapability={liveStatusCapability}
      liveStatusPackaged={liveStatusPackaged}
      safetyEducationVisible={safetyEducationVisible}
      serverNow={serverNow}
      relationshipsAvailable={relationshipsAvailable}
      tracking={tracking}
      trackingStaleAfterSeconds={45}
      travelMap={null}
    />
  );
}

export function CustomerScopeStartRoute({ navigation, route }: { navigation: any; route: any }) {
  const { actorId, connectionState } = useCustomerExperience();
  const projectId = typeof route.params?.projectId === 'string' ? route.params.projectId : '';
  const [scope, setScope] = useState<Loadable<ScopeConfirmationViewSnapshot>>({ state: 'loading' });
  const [fulfilment, setFulfilment] = useState<GroundedFulfilment | null>(null);
  const [revealedPin, setRevealedPin] = useState<string | null>(null);

  const applyResponse = useCallback((response: unknown, pin: string | null): boolean => {
    const adapted = adaptGroundedFulfilmentV1(responseFulfilment(response));
    if (!adapted.ok) return false;
    const view = customerScopeFromFulfilmentV1(adapted.value, pin);
    setFulfilment(adapted.value);
    if (!view.ok) {
      setScope(view.field === 'scope_unavailable'
        ? { state: 'empty' }
        : { state: 'error', correlationId: null });
      return view.field === 'scope_unavailable';
    }
    setRevealedPin(pin);
    setScope({
      state: 'ready',
      value: view.value,
      connectionState,
      lastUpdatedAt: adapted.value.updatedAt,
    });
    return true;
  }, [connectionState]);

  const refresh = useCallback(async () => {
    setRevealedPin(null);
    if (connectionState === 'offline') {
      setScope((current) => current.state === 'ready'
        ? { ...current, connectionState: 'offline' }
        : { state: 'error', correlationId: null });
      return;
    }
    setScope((current) => current.state === 'ready' ? current : { state: 'loading' });
    try {
      const response = await loadGroundedFulfilment(projectId);
      if (!applyResponse(response, null)) throw new Error('fulfilment_contract_invalid');
    } catch (error) {
      setFulfilment(null);
      setScope({ state: 'error', correlationId: correlationId(error) });
    }
  }, [applyResponse, connectionState, projectId]);

  useFocusEffect(useCallback(() => {
    void refresh();
    return () => setRevealedPin(null);
  }, [refresh]));

  const runCommand = async (intent: CustomerCommandIntent) => {
    if (!fulfilment || connectionState === 'offline') return;
    const currentScope = fulfilment.scope.proposal ?? fulfilment.scope.current;
    if (!currentScope) return;
    try {
      const response = intent.command === 'reveal_start_pin'
        ? await runGroundedFulfilmentCommand({
            projectId,
            revision: intent.stateVersion,
            command: 'reveal_start_pin',
            idempotencyKey: intent.idempotencyKey,
          })
        : intent.command === 'confirm_scope' || intent.command === 'decline_scope_revision'
          ? await runGroundedFulfilmentCommand({
              projectId,
              revision: intent.stateVersion,
              command: 'decide_scope',
              data: {
                scopeVersion: currentScope.version,
                decision: intent.command === 'confirm_scope' ? 'confirm' : 'decline',
              },
              idempotencyKey: intent.idempotencyKey,
            })
          : null;
      if (!response) return;
      const pin = intent.command === 'reveal_start_pin' ? revealedStartPin(response) : null;
      if (intent.command === 'reveal_start_pin' && !pin) throw new Error('start_pin_contract_invalid');
      if (!applyResponse(response, pin)) throw new Error('fulfilment_contract_invalid');
    } catch {
      setRevealedPin(null);
      await refresh();
    }
  };

  const mutationAllowed = fulfilment !== null && !fulfilment.integrity.readOnly;
  return (
    <ScopeStartScreen
      actorId={actorId}
      allowedActions={{
        confirmScope: mutationAllowed && fulfilment?.allowedActions.decideScope === true,
        declineScopeRevision: mutationAllowed && fulfilment?.allowedActions.decideScope === true,
        revealStartPin: mutationAllowed && fulfilment?.allowedActions.revealStartPin === true,
      }}
      commandKeys={{
        confirm_scope: `project:${projectId}:scope-confirm`,
        decline_scope_revision: `project:${projectId}:scope-decline`,
        reveal_start_pin: `project:${projectId}:pin-reveal`,
      }}
      onBack={() => {
        setRevealedPin(null);
        navigation.goBack();
      }}
      onCommand={(intent) => { void runCommand(intent); }}
      onOpenSafetyHelp={(id) => navigation.navigate('SafetyHelp', { projectId: id })}
      onRetry={() => { void refresh(); }}
      scope={scope}
    />
  );
}

export function CustomerActiveWorkRoute({ navigation, route }: { navigation: any; route: any }) {
  const { actorId, connectionState } = useCustomerExperience();
  const projectId = typeof route.params?.projectId === 'string' ? route.params.projectId : '';
  const [work, setWork] = useState<Loadable<ActiveWorkSnapshot>>({ state: 'loading' });
  const [fulfilment, setFulfilment] = useState<GroundedFulfilment | null>(null);

  const refresh = useCallback(async () => {
    if (connectionState === 'offline') {
      setWork((current) => current.state === 'ready'
        ? { ...current, connectionState: 'offline' }
        : { state: 'error', correlationId: null });
      return;
    }
    setWork((current) => current.state === 'ready' ? current : { state: 'loading' });
    try {
      const response = await loadGroundedFulfilment(projectId);
      const adapted = adaptGroundedFulfilmentV1(responseFulfilment(response));
      if (!adapted.ok) throw new Error(adapted.reasonCode);
      const view = customerActiveWorkFromFulfilmentV1(adapted.value);
      if (!view.ok) throw new Error(view.reasonCode);
      setFulfilment(adapted.value);
      setWork({
        state: 'ready',
        value: view.value,
        connectionState,
        lastUpdatedAt: adapted.value.updatedAt,
      });
    } catch (error) {
      setFulfilment(null);
      setWork({ state: 'error', correlationId: correlationId(error) });
    }
  }, [connectionState, projectId]);

  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));

  const runCommand = async (intent: CustomerCommandIntent) => {
    if (!intent.targetId || connectionState === 'offline'
        || (intent.command !== 'approve_change_order' && intent.command !== 'decline_change_order')) return;
    try {
      await runGroundedFulfilmentCommand({
        projectId,
        revision: intent.stateVersion,
        command: intent.command,
        targetId: intent.targetId,
        idempotencyKey: intent.idempotencyKey,
      });
    } finally {
      await refresh();
    }
  };

  return (
    <ActiveWorkScreen
      actorId={actorId}
      changeOrderDecisionAllowed={fulfilment !== null
        && !fulfilment.integrity.readOnly
        && fulfilment.allowedActions.decideChangeOrder}
      commandKeys={{
        approve_change_order: `project:${projectId}:change-approve`,
        decline_change_order: `project:${projectId}:change-decline`,
      }}
      onBack={() => navigation.goBack()}
      onCommand={(intent) => { void runCommand(intent); }}
      onOpenChat={(id) => navigation.navigate('Chat', { bookingId: id })}
      onOpenSafetyHelp={(id) => navigation.navigate('SafetyHelp', { projectId: id })}
      onRetry={() => { void refresh(); }}
      work={work}
    />
  );
}

export function CustomerCompletionPaymentRoute({ navigation, route }: { navigation: any; route: any }) {
  const { actorId, connectionState } = useCustomerExperience();
  const projectId = typeof route.params?.projectId === 'string' ? route.params.projectId : '';
  const [project, setProject] = useState<Loadable<CompletionPaymentViewSnapshot>>({ state: 'loading' });

  const refresh = useCallback(async () => {
    if (connectionState === 'offline') {
      setProject((current) => current.state === 'ready'
        ? { ...current, connectionState: 'offline' }
        : { state: 'error', correlationId: null });
      return;
    }
    setProject((current) => current.state === 'ready' ? current : { state: 'loading' });
    try {
      const [response, rating, eligibility] = await Promise.all([
        loadGroundedProject(projectId),
        loadGroundedRating(projectId),
        packagedFeatureEnabled('relationships')
          ? loadGroundedRelationshipEligibility(projectId).catch(() => null)
          : Promise.resolve(null),
      ]);
      const adapted = completionPaymentFromProjectV1(responseProject(response));
      if (!adapted.ok) throw new Error(adapted.reasonCode);
      const ratingState = rating.state === 'sealed' ? 'submitted' : rating.state;
      setProject({
        state: 'ready',
        value: Object.freeze({
          ...adapted.value,
          rating: Object.freeze({
            state: ratingState,
            selectedValue: rating.selectedValue,
            reasonLabels: rating.reasonLabels,
            publicationLabel: rating.publicationLabel,
          }),
          retention: Object.freeze({
            relationshipsAvailable: Boolean(eligibility?.relationshipEligible),
            favouriteAllowed: Boolean(eligibility?.actions.favourite),
            rebookAllowed: Boolean(eligibility?.actions.rebookDraft),
          }),
        }),
        connectionState,
        lastUpdatedAt: new Date().toISOString(),
      });
    } catch (error) {
      setProject({ state: 'error', correlationId: correlationId(error) });
    }
  }, [connectionState, projectId]);

  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));

  const runCommand = async (intent: CustomerCommandIntent) => {
    if (connectionState === 'offline') return;
    try {
      if (intent.command === 'confirm_completion') {
        await runGroundedCompletionCommand({
          projectId: intent.projectId,
          revision: intent.stateVersion,
          command: 'confirm',
          idempotencyKey: intent.idempotencyKey,
        });
      } else if (intent.command === 'submit_rating') {
        const score = Number(intent.payload.rating);
        if (!Number.isSafeInteger(score) || score < 1 || score > 5) return;
        await submitGroundedRating({
          projectId: intent.projectId,
          score: score as 1 | 2 | 3 | 4 | 5,
          idempotencyKey: intent.idempotencyKey,
        });
      } else if (intent.command === 'favourite_worker' && intent.targetId) {
        await createGroundedFavourite({
          workerId: intent.targetId,
          sourceBookingId: intent.projectId,
          connectionState,
          idempotencyKey: intent.idempotencyKey,
        });
      } else if (intent.command === 'start_rebook') {
        const draft = await createGroundedRebookDraft({
          sourceBookingId: intent.projectId,
          connectionState,
          idempotencyKey: intent.idempotencyKey,
        });
        navigation.navigate('RebookDraft', { draftId: draft.id });
        return;
      } else {
        return;
      }
    } catch (error) {
      Alert.alert(
        'Action not completed',
        isGroundedMarketplaceError(error)
          ? error.problem.detail
          : 'The latest server state could not be verified. Refresh before trying again.',
      );
    } finally {
      await refresh();
    }
  };

  const commandKeys = useMemo(() => ({
    confirm_completion: `project:${projectId}:completion-confirm`,
    start_checkout: `project:${projectId}:checkout-disabled`,
    retry_checkout: `project:${projectId}:checkout-retry-disabled`,
    declare_cash_payment: `project:${projectId}:cash-disabled`,
    submit_rating: `project:${projectId}:rating-submit-v1`,
    favourite_worker: `project:${projectId}:favourite-v1`,
    start_rebook: `project:${projectId}:rebook-v1`,
  }), [projectId]);

  return (
    <CompletionPaymentScreen
      actorId={actorId}
      commandKeys={commandKeys}
      onBack={() => navigation.goBack()}
      onCommand={(intent) => { void runCommand(intent); }}
      onOpenIssueForm={(id) => {
        const revision = project.state === 'ready' ? project.value.stateVersion : null;
        navigation.navigate('CompletionIssue', { projectId: id, revision });
      }}
      onOpenSupport={(id) => navigation.navigate('SafetyHelp', { projectId: id })}
      onRetryLoad={() => { void refresh(); }}
      onSelectRating={(rating) => setProject((current) => current.state === 'ready' && current.value.rating.state === 'open'
        ? {
            ...current,
            value: Object.freeze({
              ...current.value,
              rating: Object.freeze({ ...current.value.rating, selectedValue: rating }),
            }),
          }
        : current)}
      project={project}
    />
  );
}

export function CustomerCompletionIssueRoute({ navigation, route }: { navigation: any; route: any }) {
  const theme = useTogtTheme();
  const projectId = typeof route.params?.projectId === 'string' ? route.params.projectId : '';
  const revision = Number.isSafeInteger(route.params?.revision) ? Number(route.params.revision) : null;
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commandKey] = useState(() => `completion-dispute:${projectId}:${revision ?? 'unknown'}:${Date.now().toString(36)}`);
  const valid = reason.trim().length >= 10 && reason.trim().length <= 1_000 && revision !== null;

  const submit = async () => {
    if (!valid || revision === null || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await runGroundedCompletionCommand({
        projectId,
        revision,
        command: 'dispute',
        reason: reason.trim(),
        idempotencyKey: commandKey,
      });
      navigation.replace('CompletionPayment', { projectId });
    } catch (caught) {
      setError(isGroundedMarketplaceError(caught)
        ? caught.problem.detail
        : 'The issue was not recorded. Refresh the Project before trying again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppScaffold
      contentContainerStyle={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.xxxl }}
      scrollable
      testID="customer-completion-issue-screen"
      topBar={<TopAppBar onBack={() => navigation.goBack()} title="Report a completion issue" />}
    >
      <Surface style={{ gap: theme.spacing.sm }} variant="attention">
        <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h2, { color: theme.colors.text }]}>Keep the Project open</Text>
        <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.textSecondary }]}>Describe what is incomplete or incorrect. This records a Project issue; it does not claim emergency dispatch or a refund.</Text>
      </Surface>
      <TextField
        {...(reason.length > 0 && reason.trim().length < 10 ? { error: 'Add at least 10 characters.' } : {})}
        helperText={`${reason.trim().length}/1000 characters`}
        label="What needs attention?"
        maxLength={1_000}
        multiline
        onChangeText={setReason}
        required
        value={reason}
      />
      {revision === null ? <InlineError message="The current Project revision is unavailable. Go back and refresh before reporting an issue." /> : null}
      {error ? <InlineError message={error} /> : null}
      <Button disabled={!valid || submitting} label={submitting ? 'Recording issue…' : 'Record issue'} onPress={() => { void submit(); }} />
    </AppScaffold>
  );
}
