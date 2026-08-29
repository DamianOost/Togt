import { useNetInfo } from '@react-native-community/netinfo';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { Linking, Text } from 'react-native';
import { useSelector } from 'react-redux';
import { packagedFeatureEnabled } from '../../../app/runtimeFeatureFlags';
import {
  adaptGroundedFulfilmentV1,
  adaptWorkerCompletionV1,
  adaptWorkerJobDetailV1,
  workerActiveWorkFromFulfilmentV1,
  workerScopeFromFulfilmentV1,
} from '../../../data/grounded';
import type { GroundedFulfilment } from '../../../data/grounded';
import { useTogtTheme } from '../../../design';
import {
  isGroundedMarketplaceError,
  loadGroundedFulfilment,
  loadGroundedProject,
  runGroundedCompletionCommand,
  runGroundedFulfilmentCommand,
} from '../../../services';
import {
  capabilityEnabled,
  getEffectiveCapabilities,
} from '../../../services/capabilityService';
import { loadIntelligenceCapability } from '../../../services/groundedIntelligence';
import { claimContextualSafetyEducation } from '../../../services/safetyEducationStore';
import { AppScaffold, Button, InlineError, Surface, TextField, TopAppBar } from '../../../ui';
import {
  WorkerActiveWorkScreen,
  WorkerCompletionScreen,
  WorkerJobDetailScreen,
  WorkerScopeStartScreen,
} from '../lifecycle';
import type {
  ChangeOrderFormValues,
  ConnectionState,
  LifecycleResourceState,
  WorkerActiveWorkSnapshot,
  WorkerCompletionSnapshot,
  WorkerJobDetailSnapshot,
  WorkerJobRouteTarget,
  WorkerLifecycleIntent,
  WorkerScopeSnapshot,
} from '../lifecycle';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function responseProject(response: unknown): unknown {
  return isRecord(response) ? response.project : null;
}

function responseFulfilment(response: unknown): unknown {
  return isRecord(response) ? response.fulfilment : null;
}

function problem(error: unknown, title: string): LifecycleResourceState<never> {
  return Object.freeze({
    status: 'error',
    title,
    message: isGroundedMarketplaceError(error)
      ? error.problem.detail
      : 'The server response could not be verified. Refresh before taking action.',
    correlationId: isGroundedMarketplaceError(error) ? error.problem.correlationId : null,
  });
}

function useConnectionState(): ConnectionState {
  const network = useNetInfo();
  return network.isConnected === true && network.isInternetReachable !== false ? 'online' : 'offline';
}

function projectIdFrom(route: any): string {
  return typeof route.params?.projectId === 'string' ? route.params.projectId : '';
}

function stableHash(source: string): string {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function WorkerJobDetailRoute({ navigation, route }: { navigation: any; route: any }) {
  const actorId = useSelector((state: any) => state.auth.user?.id || 'worker-session-unavailable');
  const connectionState = useConnectionState();
  const projectId = projectIdFrom(route);
  const [resource, setResource] = useState<LifecycleResourceState<WorkerJobDetailSnapshot>>({ status: 'loading' });
  const [fulfilment, setFulfilment] = useState<GroundedFulfilment | null>(null);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [safeSharingAvailable, setSafeSharingAvailable] = useState(false);
  const liveStatusPackaged = packagedFeatureEnabled('livePlatformStatus');
  const safetyEducationPackaged = packagedFeatureEnabled('contextualSafetyEducation');
  const [safetyEducationVisible, setSafetyEducationVisible] = useState(false);
  const [liveStatusCapability, setLiveStatusCapability] = useState({
    available: false,
    reasonCode: liveStatusPackaged ? 'live_status_capability_unverified' : 'disabled_in_this_build',
  });

  const refresh = useCallback(async () => {
    setSafeSharingAvailable(false);
    if (connectionState === 'offline') {
      setResource((current) => current.status === 'ready'
        ? current
        : { status: 'error', title: 'Job unavailable offline', message: 'Reconnect to verify the current Job state.', correlationId: null });
      return;
    }
    setResource((current) => current.status === 'ready' ? current : { status: 'loading' });
    try {
      const [projectResponse, fulfilmentResponse] = await Promise.all([
        loadGroundedProject(projectId),
        loadGroundedFulfilment(projectId),
      ]);
      const canonical = adaptGroundedFulfilmentV1(responseFulfilment(fulfilmentResponse));
      if (!canonical.ok) throw new Error(canonical.reasonCode);
      const detail = adaptWorkerJobDetailV1(responseProject(projectResponse), canonical.value);
      if (!detail.ok) throw new Error(detail.reasonCode);
      try {
        const capabilities = await getEffectiveCapabilities({ forceRefresh: true });
        setSafeSharingAvailable(capabilityEnabled(capabilities, 'booking_details_share'));
      } catch {
        // Sharing remains absent unless this APK and the current server both allow it.
      }
      setFulfilment(canonical.value);
      setResource({ status: 'ready', value: detail.value });
    } catch (error) {
      setFulfilment(null);
      setSafeSharingAvailable(false);
      setResource(problem(error, 'Job could not be loaded'));
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
    const phase = fulfilment?.operationalPhase;
    const startContextReady = phase === 'arrived' || phase === 'scope_confirmation';
    if (!safetyEducationPackaged || !startContextReady) {
      return () => { active = false; };
    }
    void loadIntelligenceCapability('contextual_safety_education', { forceRefresh: true })
      .then(async (capability) => {
        if (!active || !capability.available) return false;
        return claimContextualSafetyEducation({ actorId, trigger: 'first_start_pin' });
      })
      .then((visible) => {
        if (active) setSafetyEducationVisible(visible === true);
      });
    return () => { active = false; };
  }, [actorId, fulfilment?.operationalPhase, safetyEducationPackaged]));

  const runCommand = async (intent: WorkerLifecycleIntent) => {
    if (connectionState === 'offline') return;
    try {
      if (intent.command === 'start_route') {
        await runGroundedFulfilmentCommand({
          projectId,
          revision: intent.stateVersion,
          command: 'start_route',
          idempotencyKey: intent.idempotencyKey,
        });
      } else if (intent.command === 'mark_arrived') {
        await runGroundedFulfilmentCommand({
          projectId,
          revision: intent.stateVersion,
          command: 'mark_arrived',
          data: { attestation: true },
          idempotencyKey: intent.idempotencyKey,
        });
      }
      await refresh();
    } catch (error) {
      setResource(problem(error, 'Job action was not recorded'));
    }
  };

  const openTarget = (target: WorkerJobRouteTarget, id: string) => {
    if (target === 'scope') navigation.navigate('WorkerScopeStart', { projectId: id });
    else if (target === 'active_work') navigation.navigate('WorkerActiveWork', { projectId: id });
    else if (target === 'completion') navigation.navigate('WorkerCompletion', { projectId: id });
    else navigation.navigate('WorkerTabs', { screen: 'Earnings' });
  };

  return (
    <WorkerJobDetailScreen
      actorId={actorId}
      commandKeys={{
        start_route: `worker:${projectId}:start-route`,
        mark_arrived: `worker:${projectId}:arrival`,
      }}
      connectionState={connectionState}
      detailsExpanded={detailsExpanded}
      onBack={() => navigation.goBack()}
      onCommand={(intent) => { void runCommand(intent); }}
      onContactCustomer={() => {
        const value = fulfilment?.participants.customer.phone;
        if (value) void Linking.openURL(`tel:${value}`);
      }}
      onOpenChat={(id) => navigation.navigate('Chat', { bookingId: id })}
      onOpenNavigation={() => {
        if (fulfilment?.location.precision !== 'exact') return;
        const { latitude, longitude } = fulfilment.location;
        void Linking.openURL(`geo:${latitude},${longitude}?q=${latitude},${longitude}`);
      }}
      onOpenLiveStatus={(id) => navigation.navigate('ProjectLiveStatus', { projectId: id })}
      onDismissSafetyEducation={() => setSafetyEducationVisible(false)}
      onOpenRouteTarget={openTarget}
      onOpenReschedule={(id) => navigation.navigate('ProjectReschedule', { projectId: id })}
      onOpenSafetyHelp={(id) => navigation.navigate('SafetyHelp', { projectId: id })}
      onShareSafeStatus={(id) => navigation.navigate('SafeSharing', { projectId: id })}
      onRetry={() => { void refresh(); }}
      onToggleDetails={() => setDetailsExpanded((current) => !current)}
      resource={resource}
      rescheduleAvailable={Boolean(fulfilment?.allowedActions.proposeReschedule || fulfilment?.allowedActions.decideReschedule)}
      routeMap={null}
      safeSharingAvailable={safeSharingAvailable}
      liveStatusCapability={liveStatusCapability}
      liveStatusPackaged={liveStatusPackaged}
      safetyEducationVisible={safetyEducationVisible}
    />
  );
}

type ScopeProposalDraft = Readonly<{
  description: string;
  itemsText: string;
  materialsResponsibility: string;
  estimatedMinutes: string;
}>;

const EMPTY_SCOPE_PROPOSAL: ScopeProposalDraft = Object.freeze({
  description: '',
  itemsText: '',
  materialsResponsibility: '',
  estimatedMinutes: '',
});

export function WorkerScopeStartRoute({ navigation, route }: { navigation: any; route: any }) {
  const theme = useTogtTheme();
  const actorId = useSelector((state: any) => state.auth.user?.id || 'worker-session-unavailable');
  const connectionState = useConnectionState();
  const projectId = projectIdFrom(route);
  const [resource, setResource] = useState<LifecycleResourceState<WorkerScopeSnapshot>>({ status: 'loading' });
  const [fulfilment, setFulfilment] = useState<GroundedFulfilment | null>(null);
  const [enteredPin, setEnteredPin] = useState('');
  const [clarification, setClarification] = useState('');
  const [proposal, setProposal] = useState<ScopeProposalDraft>(EMPTY_SCOPE_PROPOSAL);
  const [submittingProposal, setSubmittingProposal] = useState(false);
  const [proposalError, setProposalError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (connectionState === 'offline') {
      setResource((current) => current.status === 'ready'
        ? current
        : { status: 'error', title: 'Scope unavailable offline', message: 'Reconnect to verify the on-site scope.', correlationId: null });
      return;
    }
    setResource((current) => current.status === 'ready' ? current : { status: 'loading' });
    try {
      const response = await loadGroundedFulfilment(projectId);
      const canonical = adaptGroundedFulfilmentV1(responseFulfilment(response));
      if (!canonical.ok) throw new Error(canonical.reasonCode);
      setFulfilment(canonical.value);
      const view = workerScopeFromFulfilmentV1(canonical.value);
      setResource(view.ok
        ? { status: 'ready', value: view.value }
        : { status: 'empty', title: 'Propose the on-site scope', message: 'Record the exact work before either party confirms it.' });
    } catch (error) {
      setFulfilment(null);
      setResource(problem(error, 'Scope could not be loaded'));
    }
  }, [connectionState, projectId]);

  useFocusEffect(useCallback(() => {
    void refresh();
    return () => setEnteredPin('');
  }, [refresh]));

  const runCommand = async (intent: WorkerLifecycleIntent) => {
    if (connectionState === 'offline' || !fulfilment) return;
    try {
      if (intent.command === 'confirm_scope') {
        await runGroundedFulfilmentCommand({
          projectId,
          revision: intent.stateVersion,
          command: 'decide_scope',
          data: { scopeVersion: intent.payload.scopeVersion, decision: 'confirm' },
          idempotencyKey: intent.idempotencyKey,
        });
      } else if (intent.command === 'verify_start_pin' && typeof intent.payload.pin === 'string') {
        await runGroundedFulfilmentCommand({
          projectId,
          revision: intent.stateVersion,
          command: 'start_work',
          data: { startPin: intent.payload.pin },
          idempotencyKey: intent.idempotencyKey,
        });
      }
      setEnteredPin('');
      await refresh();
    } catch (error) {
      setEnteredPin('');
      setResource(problem(error, 'Scope action was not recorded'));
    }
  };

  const items = proposal.itemsText.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  const minutes = /^\d+$/.test(proposal.estimatedMinutes.trim()) ? Number(proposal.estimatedMinutes) : null;
  const proposalValid = proposal.description.trim().length >= 3
    && proposal.description.trim().length <= 1_500
    && items.length > 0
    && items.length <= 50
    && proposal.materialsResponsibility.trim().length >= 2
    && minutes !== null && minutes > 0 && minutes <= 10_080;

  const submitProposal = async () => {
    if (!fulfilment || !proposalValid || !fulfilment.allowedActions.proposeScope || submittingProposal) return;
    setSubmittingProposal(true);
    setProposalError(null);
    try {
      const normalizedProposal = {
        baseVersion: null,
        description: proposal.description.trim(),
        items,
        materialsResponsibility: proposal.materialsResponsibility.trim(),
        estimatedMinutes: minutes,
      };
      await runGroundedFulfilmentCommand({
        projectId,
        revision: fulfilment.revision,
        command: 'propose_scope',
        data: normalizedProposal,
        idempotencyKey: `worker:${projectId}:scope-proposal:v${fulfilment.revision}:${stableHash(JSON.stringify(normalizedProposal))}`,
      });
      setProposal(EMPTY_SCOPE_PROPOSAL);
      await refresh();
    } catch (error) {
      setProposalError(isGroundedMarketplaceError(error)
        ? error.problem.detail
        : 'The scope proposal was not recorded. Refresh and try again.');
    } finally {
      setSubmittingProposal(false);
    }
  };

  if (resource.status === 'empty') {
    return (
      <AppScaffold
        contentContainerStyle={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.xxxl }}
        keyboardAware
        scrollable
        testID="worker-scope-proposal-screen"
        topBar={<TopAppBar onBack={() => navigation.goBack()} title="Propose on-site scope" />}
      >
        <Surface style={{ gap: theme.spacing.sm }} variant="attention">
          <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h2, { color: theme.colors.text }]}>Agree before work starts</Text>
          <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.textSecondary }]}>Record included work and materials. The customer must confirm the same version before a start PIN can be used.</Text>
        </Surface>
        <TextField label="Scope description" maxLength={1_500} multiline onChangeText={(description) => setProposal((current) => ({ ...current, description }))} required value={proposal.description} />
        <TextField helperText="One included item per line." label="Included work" maxLength={4_000} multiline onChangeText={(itemsText) => setProposal((current) => ({ ...current, itemsText }))} required value={proposal.itemsText} />
        <TextField label="Materials responsibility" maxLength={300} onChangeText={(materialsResponsibility) => setProposal((current) => ({ ...current, materialsResponsibility }))} required value={proposal.materialsResponsibility} />
        <TextField inputMode="numeric" label="Estimated minutes" maxLength={5} onChangeText={(estimatedMinutes) => setProposal((current) => ({ ...current, estimatedMinutes: estimatedMinutes.replace(/\D/g, '') }))} required value={proposal.estimatedMinutes} />
        {proposalError ? <InlineError message={proposalError} /> : null}
        <Button
          disabled={!proposalValid || submittingProposal || connectionState === 'offline' || fulfilment?.allowedActions.proposeScope !== true}
          label={submittingProposal ? 'Recording proposal…' : 'Record scope proposal'}
          onPress={() => { void submitProposal(); }}
        />
      </AppScaffold>
    );
  }

  const decisionAllowed = fulfilment !== null
    && !fulfilment.integrity.readOnly
    && fulfilment.allowedActions.decideScope;
  return (
    <WorkerScopeStartScreen
      actorId={actorId}
      allowedActions={{
        confirmScope: decisionAllowed,
        requestScopeRevision: false,
        verifyStartPin: fulfilment !== null
          && !fulfilment.integrity.readOnly
          && fulfilment.allowedActions.startWork,
      }}
      clarificationDraft={clarification}
      commandKeys={{
        confirm_scope: `worker:${projectId}:scope-confirm`,
        request_scope_revision: `worker:${projectId}:scope-revision-disabled`,
        verify_start_pin: `worker:${projectId}:start-pin`,
      }}
      connectionState={connectionState}
      enteredPin={enteredPin}
      onBack={() => {
        setEnteredPin('');
        navigation.goBack();
      }}
      onClarificationChange={setClarification}
      onCommand={(intent) => { void runCommand(intent); }}
      onOpenChat={(id) => navigation.navigate('Chat', { bookingId: id })}
      onOpenSafetyHelp={(id) => navigation.navigate('SafetyHelp', { projectId: id })}
      onPinChange={setEnteredPin}
      onRetry={() => { void refresh(); }}
      resource={resource}
    />
  );
}

function emptyChangeForm(): ChangeOrderFormValues {
  return Object.freeze({
    description: '',
    addedTimeMinutes: '',
    materialsDescription: '',
    additionalAmountRand: '',
    preview: Object.freeze({
      status: 'unavailable',
      reasonCode: 'change_order_preview_not_available',
      explanation: 'A server-ledger preview endpoint is required before a Worker can request an amount change.',
    }),
  });
}

export function WorkerActiveWorkRoute({ navigation, route }: { navigation: any; route: any }) {
  const actorId = useSelector((state: any) => state.auth.user?.id || 'worker-session-unavailable');
  const connectionState = useConnectionState();
  const projectId = projectIdFrom(route);
  const [resource, setResource] = useState<LifecycleResourceState<WorkerActiveWorkSnapshot>>({ status: 'loading' });
  const [changeForm, setChangeForm] = useState<ChangeOrderFormValues>(emptyChangeForm);
  const [changeEditorExpanded, setChangeEditorExpanded] = useState(false);

  const refresh = useCallback(async () => {
    if (connectionState === 'offline') {
      setResource((current) => current.status === 'ready'
        ? current
        : { status: 'error', title: 'Active work unavailable offline', message: 'Reconnect to verify work and change orders.', correlationId: null });
      return;
    }
    setResource((current) => current.status === 'ready' ? current : { status: 'loading' });
    try {
      const response = await loadGroundedFulfilment(projectId);
      const canonical = adaptGroundedFulfilmentV1(responseFulfilment(response));
      if (!canonical.ok) throw new Error(canonical.reasonCode);
      const view = workerActiveWorkFromFulfilmentV1(canonical.value);
      if (!view.ok) throw new Error(view.reasonCode);
      setResource({ status: 'ready', value: view.value });
    } catch (error) {
      setResource(problem(error, 'Active work could not be loaded'));
    }
  }, [connectionState, projectId]);

  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));

  const runCommand = async (intent: WorkerLifecycleIntent) => {
    if (intent.command !== 'request_completion' || connectionState === 'offline') return;
    try {
      await runGroundedCompletionCommand({
        projectId,
        revision: intent.stateVersion,
        command: 'request',
        idempotencyKey: intent.idempotencyKey,
      });
      navigation.replace('WorkerCompletion', { projectId });
      await refresh();
    } catch (error) {
      setResource(problem(error, 'Completion request was not recorded'));
    }
  };

  return (
    <WorkerActiveWorkScreen
      actorId={actorId}
      changeEditorExpanded={changeEditorExpanded}
      changeForm={changeForm}
      commandKeys={{
        request_change_order: `worker:${projectId}:change-preview-required`,
        request_completion: `worker:${projectId}:completion-request`,
      }}
      connectionState={connectionState}
      onBack={() => navigation.goBack()}
      onChangeForm={(patch) => setChangeForm((current) => ({ ...current, ...patch }))}
      onCommand={(intent) => { void runCommand(intent); }}
      onOpenChat={(id) => navigation.navigate('Chat', { bookingId: id })}
      onOpenSafetyHelp={(id) => navigation.navigate('SafetyHelp', { projectId: id })}
      onRetry={() => { void refresh(); }}
      onToggleChangeEditor={() => setChangeEditorExpanded((current) => !current)}
      resource={resource}
    />
  );
}

export function WorkerCompletionRoute({ navigation, route }: { navigation: any; route: any }) {
  const actorId = useSelector((state: any) => state.auth.user?.id || 'worker-session-unavailable');
  const connectionState = useConnectionState();
  const projectId = projectIdFrom(route);
  const [resource, setResource] = useState<LifecycleResourceState<WorkerCompletionSnapshot>>({ status: 'loading' });
  const [requestAllowed, setRequestAllowed] = useState(false);

  const refresh = useCallback(async () => {
    if (connectionState === 'offline') {
      setRequestAllowed(false);
      setResource((current) => current.status === 'ready'
        ? current
        : { status: 'error', title: 'Completion unavailable offline', message: 'Reconnect to verify completion state.', correlationId: null });
      return;
    }
    setResource((current) => current.status === 'ready' ? current : { status: 'loading' });
    try {
      const [projectResponse, fulfilmentResponse] = await Promise.all([
        loadGroundedProject(projectId),
        loadGroundedFulfilment(projectId),
      ]);
      const canonical = adaptGroundedFulfilmentV1(responseFulfilment(fulfilmentResponse));
      const completion = adaptWorkerCompletionV1(responseProject(projectResponse));
      if (!canonical.ok || !completion.ok) throw new Error('completion_contract_invalid');
      setRequestAllowed(
        !canonical.value.integrity.readOnly
        && canonical.value.operationalPhase === 'work_active'
        && !canonical.value.changeOrders.some((change) => change.status === 'pending'),
      );
      setResource({ status: 'ready', value: completion.value });
    } catch (error) {
      setRequestAllowed(false);
      setResource(problem(error, 'Completion could not be loaded'));
    }
  }, [connectionState, projectId]);

  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));

  const runCommand = async (intent: WorkerLifecycleIntent) => {
    if (intent.command !== 'request_completion' || !requestAllowed || connectionState === 'offline') return;
    try {
      await runGroundedCompletionCommand({
        projectId,
        revision: intent.stateVersion,
        command: 'request',
        idempotencyKey: intent.idempotencyKey,
      });
      await refresh();
    } catch (error) {
      setResource(problem(error, 'Completion request was not recorded'));
    }
  };

  return (
    <WorkerCompletionScreen
      actorId={actorId}
      connectionState={connectionState}
      onBack={() => navigation.goBack()}
      onCommand={(intent) => { void runCommand(intent); }}
      onOpenEarnings={() => navigation.navigate('WorkerTabs', { screen: 'Earnings' })}
      onOpenIssue={(issueId, id) => navigation.navigate('SafetyHelp', { issueId, projectId: id })}
      onOpenPaymentStatus={() => navigation.navigate('WorkerTabs', { screen: 'Earnings' })}
      onOpenSafetyHelp={(id) => navigation.navigate('SafetyHelp', { projectId: id })}
      onRetry={() => { void refresh(); }}
      requestCompletionAllowed={requestAllowed}
      requestCompletionKey={`worker:${projectId}:completion-request`}
      resource={resource}
    />
  );
}
