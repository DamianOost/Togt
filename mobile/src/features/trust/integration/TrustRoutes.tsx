import { useNetInfo } from '@react-native-community/netinfo';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useRef, useState } from 'react';
import { Alert, Linking, Share, Text, View } from 'react-native';
import { useSelector } from 'react-redux';
import { useTogtTheme } from '../../../design';
import {
  createGroundedBlock,
  createGroundedFavourite,
  createGroundedIncident,
  createGroundedRebookDraft,
  createGroundedRecurringSeries,
  isGroundedTrustError,
  loadGroundedFavourites,
  loadGroundedIncident,
  loadGroundedIncidents,
  loadGroundedRebookDraft,
  loadGroundedRelationshipEligibility,
  loadGroundedRecurringSeriesDetail,
  loadGroundedSafeShare,
  removeGroundedFavourite,
  updateGroundedRebookDraft,
  updateGroundedRecurringSeries,
} from '../../../services/groundedTrust';
import type {
  BlockReasonCode,
  FavouriteDto,
  IncidentCategory,
  IncidentDto,
  IncidentKind,
  RecurringOccurrenceChangeDto,
  RecurringSeriesAction,
  RecurringSeriesDto,
  RelationshipEligibilityDto,
  RebookDraftDto,
  SubstitutionPolicy,
  TrustConnectionState,
  TrustRole,
} from '../../../services/groundedTrust';
import { loadGroundedProject } from '../../../services';
import {
  AppScaffold,
  Button,
  Chip,
  InlineError,
  ScreenError,
  SectionHeader,
  Surface,
  TextField,
  TopAppBar,
} from '../../../ui';
import {
  IncidentDetailScreen,
  IncidentFormScreen,
  RecurringOccurrenceScreen,
  RecurringSeriesScreen,
  RebookDraftScreen,
  RelationshipActionsScreen,
  SafeSharingScreen,
  SafetySupportCentreScreen,
} from '..';
import { createGroundedTrustIntent, mutationGuardMessage } from '../controller';
import { TrustResource, TruthNotice } from '../components';
import {
  adaptSafeSharePreview,
  safeShareMessage,
} from '../model';
import type {
  SafeSharePreview,
  SafeSharingSnapshot,
  SafetyCentreSnapshot,
  TrustResourceState,
} from '../model';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const GROUNDED_TRUST_ROUTE_NAMES = Object.freeze({
  safetyHelp: 'SafetyHelp',
  safetyCentre: 'SafetyCentre',
  incidentReport: 'IncidentReport',
  incidentDetail: 'IncidentDetail',
  safeSharing: 'SafeSharing',
  relationships: 'Relationships',
  rebookDraft: 'RebookDraft',
  recurringProposal: 'RecurringProposal',
  recurringSeries: 'RecurringSeries',
  recurringOccurrence: 'RecurringOccurrence',
} as const);

type JsonRecord = Record<string, unknown>;

type TrustSession = Readonly<{
  actorId: string;
  actorRole: TrustRole | null;
  connectionState: TrustConnectionState;
}>;

type RelationshipSnapshot = Readonly<{
  eligibility: RelationshipEligibilityDto;
  counterpart: Readonly<{ id: string; displayName: string; serviceLabel: string }>;
  favouriteActive: boolean;
}>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function uuid(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null;
}

function boundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  return candidate.length > 0 && candidate.length <= maxLength && !candidate.includes('\u0000') ? candidate : null;
}

function routeParam(route: any, key: string): string | null {
  return typeof route.params?.[key] === 'string' ? route.params[key] : null;
}

function useTrustSession(): TrustSession {
  const network = useNetInfo();
  const user = useSelector((state: any) => state.auth.user);
  const actorRole = user?.role === 'customer'
    ? 'customer'
    : user?.role === 'labourer' || user?.role === 'worker'
      ? 'worker'
      : null;
  return Object.freeze({
    actorId: typeof user?.id === 'string' ? user.id : '',
    actorRole,
    connectionState: network.isConnected === true && network.isInternetReachable !== false ? 'online' : 'offline',
  });
}

function problemDetail(error: unknown, fallback: string): Readonly<{
  message: string;
  correlationId?: string;
}> {
  if (isGroundedTrustError(error)) {
    return Object.freeze({
      message: error.problem.detail,
      ...(error.problem.correlationId ? { correlationId: error.problem.correlationId } : {}),
    });
  }
  if (isRecord(error) && isRecord(error.problem)) {
    const detail = boundedText(error.problem.detail, 2_000);
    const correlationId = boundedText(error.problem.correlationId, 200);
    return Object.freeze({
      message: detail ?? fallback,
      ...(correlationId ? { correlationId } : {}),
    });
  }
  return Object.freeze({ message: fallback });
}

function errorResource<T>(error: unknown, title: string, fallback: string): TrustResourceState<T> {
  const detail = problemDetail(error, fallback);
  return Object.freeze({
    status: 'error',
    title,
    message: detail.message,
    ...(detail.correlationId ? { correlationId: detail.correlationId } : {}),
  });
}

function invalidResource<T>(title: string, message: string): TrustResourceState<T> {
  return Object.freeze({ status: 'error', title, message });
}

function ResourceShell<T>({
  title,
  subtitle,
  loadingLabel,
  resource,
  connectionState,
  onBack,
  onRetry,
}: Readonly<{
  title: string;
  subtitle: string;
  loadingLabel: string;
  resource: TrustResourceState<T>;
  connectionState: TrustConnectionState;
  onBack: () => void;
  onRetry: () => void;
}>) {
  return (
    <AppScaffold
      contentContainerStyle={{ flex: 1 }}
      testID="trust-integration-resource-screen"
      topBar={<TopAppBar onBack={onBack} subtitle={subtitle} title={title} />}
    >
      <TrustResource
        connectionState={connectionState}
        loadingLabel={loadingLabel}
        onRetry={onRetry}
        resource={resource}
      >
        {() => null}
      </TrustResource>
    </AppScaffold>
  );
}

function safeEmergencyDial(number: '112' | '10111'): void {
  void Linking.openURL(`tel:${number}`).catch(() => undefined);
}

function unavailableSafeSharing(reasonCode: string): SafeSharingSnapshot {
  return Object.freeze({
    bookingDetailsShare: Object.freeze({ available: false, reasonCode }),
    publicLiveShare: Object.freeze({
      available: false,
      reasonCode: 'expiring_public_tokens_not_implemented',
    }),
  });
}

export function SafeSharingRoute({ navigation, route }: { navigation: any; route: any }) {
  const { connectionState } = useTrustSession();
  const projectId = uuid(routeParam(route, 'projectId'));
  const [snapshot, setSnapshot] = useState<SafeSharingSnapshot>(() => unavailableSafeSharing('checking_server_eligibility'));
  const activeRequest = useRef(0);
  const shareInFlight = useRef(false);

  const refresh = useCallback(async () => {
    const requestId = activeRequest.current + 1;
    activeRequest.current = requestId;
    if (!projectId) {
      setSnapshot(unavailableSafeSharing('invalid_project_reference'));
      return;
    }
    if (connectionState === 'offline') {
      setSnapshot(unavailableSafeSharing('reconnect_to_verify_sharing'));
      return;
    }
    setSnapshot(unavailableSafeSharing('checking_server_eligibility'));
    try {
      const response = await loadGroundedSafeShare(projectId);
      if (activeRequest.current !== requestId) return;
      const adapted = adaptSafeSharePreview(response.preview);
      if (!adapted.ok) {
        setSnapshot(unavailableSafeSharing(adapted.reasonCode));
        return;
      }
      setSnapshot(Object.freeze({
        bookingDetailsShare: Object.freeze({
          available: true,
          mode: response.bookingDetailsShare.mode,
          preview: adapted.value,
        }),
        publicLiveShare: Object.freeze({
          available: false,
          reasonCode: 'expiring_public_tokens_not_implemented',
        }),
      }));
    } catch (error) {
      if (activeRequest.current !== requestId) return;
      const reason = isGroundedTrustError(error) && error.problem.type === 'capability_unavailable'
        ? 'disabled_by_server'
        : 'server_preview_unavailable';
      setSnapshot(unavailableSafeSharing(reason));
    }
  }, [connectionState, projectId]);

  useFocusEffect(useCallback(() => {
    void refresh();
    return () => {
      activeRequest.current += 1;
      shareInFlight.current = false;
    };
  }, [refresh]));

  const shareBookingDetails = async (preview: SafeSharePreview) => {
    if (
      shareInFlight.current
      || !snapshot.bookingDetailsShare.available
      || snapshot.bookingDetailsShare.preview !== preview
    ) return;
    shareInFlight.current = true;
    try {
      await Share.share({
        message: safeShareMessage(preview),
        title: 'TOGT Project summary',
      });
    } catch {
      Alert.alert(
        'Share sheet could not be opened',
        'No summary was shared. Try again from this screen.',
      );
    } finally {
      shareInFlight.current = false;
    }
  };

  return (
    <SafeSharingScreen
      onBack={() => navigation.goBack()}
      onShareBookingDetails={(preview) => { void shareBookingDetails(preview); }}
      snapshot={snapshot}
    />
  );
}

function incidentKind(route: any): IncidentKind | null {
  return route.params?.kind === 'safety' || route.params?.kind === 'support' ? route.params.kind : null;
}

function initialIncidentCategory(route: any, kind: IncidentKind | null): IncidentCategory | null {
  if (!kind || typeof route.params?.initialCategory !== 'string') return null;
  const safety = new Set<IncidentCategory>(['immediate_danger', 'injury', 'harassment', 'unsafe_work', 'property_damage', 'other']);
  const support = new Set<IncidentCategory>(['payment_or_work', 'account_help', 'property_damage', 'other']);
  const candidate = route.params.initialCategory as IncidentCategory;
  return (kind === 'safety' ? safety : support).has(candidate) ? candidate : null;
}

function commandKey(input: Parameters<typeof createGroundedTrustIntent>[0]): Readonly<{
  ok: true;
  value: string;
}> | Readonly<{ ok: false; message: string }> {
  const result = createGroundedTrustIntent(input);
  if (!result.ok) {
    return Object.freeze({ ok: false, message: mutationGuardMessage(result) ?? 'This action could not be prepared safely.' });
  }
  return Object.freeze({ ok: true, value: result.intent.idempotencyKey });
}

export function SafetyHelpRoute({ navigation, route }: { navigation: any; route: any }) {
  const { connectionState } = useTrustSession();
  const linkedProjectId = uuid(routeParam(route, 'projectId'));
  const [resource, setResource] = useState<TrustResourceState<SafetyCentreSnapshot>>({ status: 'loading' });

  const refresh = useCallback(async () => {
    if (connectionState === 'offline') {
      setResource((current) => current.status === 'ready'
        ? current
        : invalidResource('Records unavailable offline', 'Reconnect to load your private safety and support records.'));
      return;
    }
    setResource((current) => current.status === 'ready' ? current : { status: 'loading' });
    try {
      const [safetyIncidents, supportCases] = await Promise.all([
        loadGroundedIncidents('safety'),
        loadGroundedIncidents('support'),
      ]);
      setResource({
        status: 'ready',
        value: Object.freeze({ safetyIncidents, supportCases }),
        lastUpdatedAt: new Date().toISOString(),
      });
    } catch (error) {
      setResource(errorResource(error, 'Records could not be loaded', 'The safety and support records could not be verified.'));
    }
  }, [connectionState]);

  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));

  return (
    <SafetySupportCentreScreen
      connectionState={connectionState}
      onBack={() => navigation.goBack()}
      onCall10111={() => safeEmergencyDial('10111')}
      onCall112={() => safeEmergencyDial('112')}
      onCreateSafetyRecord={() => navigation.navigate(GROUNDED_TRUST_ROUTE_NAMES.incidentReport, {
        kind: 'safety',
        ...(linkedProjectId ? { projectId: linkedProjectId } : {}),
      })}
      onCreateSupportCase={() => navigation.navigate(GROUNDED_TRUST_ROUTE_NAMES.incidentReport, {
        kind: 'support',
        ...(linkedProjectId ? { projectId: linkedProjectId } : {}),
      })}
      onOpenIncident={(incident) => navigation.navigate(GROUNDED_TRUST_ROUTE_NAMES.incidentDetail, {
        kind: incident.kind,
        incidentId: incident.id,
      })}
      onRetry={() => { void refresh(); }}
      resource={resource}
    />
  );
}

export const SafetyCentreRoute = SafetyHelpRoute;

export function IncidentReportRoute({ navigation, route }: { navigation: any; route: any }) {
  const { actorId, connectionState } = useTrustSession();
  const kind = incidentKind(route);
  const projectId = uuid(routeParam(route, 'projectId'));
  const [category, setCategory] = useState<IncidentCategory | null>(() => initialIncidentCategory(route, kind));
  const [summary, setSummary] = useState(() => boundedText(route.params?.initialSummary, 5_000) ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  if (!kind) {
    return (
      <AppScaffold testID="incident-report-invalid-screen" topBar={<TopAppBar onBack={() => navigation.goBack()} title="Record unavailable" />}>
        <ScreenError body="Choose a supported safety or support record type before continuing." title="Record type unavailable" />
      </AppScaffold>
    );
  }

  const submit = async () => {
    if (!category || submitting || connectionState === 'offline') return;
    const prepared = commandKey({
      command: kind === 'safety' ? 'record_safety_incident' : 'record_support_case',
      actorId,
      resourceId: projectId ?? actorId,
      requestKey: 'incident-submit-v1',
      connectionState,
      payload: {
        category,
        summary: summary.trim(),
        ...(projectId ? { projectId } : {}),
      },
    });
    if (!prepared.ok) {
      setErrorMessage(prepared.message);
      return;
    }
    setSubmitting(true);
    setErrorMessage(undefined);
    try {
      const created = await createGroundedIncident({
        kind,
        ...(projectId ? { bookingId: projectId } : {}),
        category,
        summary: summary.trim(),
        connectionState,
        idempotencyKey: prepared.value,
      });
      navigation.replace(GROUNDED_TRUST_ROUTE_NAMES.incidentDetail, {
        kind: created.kind,
        incidentId: created.id,
      });
    } catch (error) {
      setErrorMessage(problemDetail(error, 'The record was not saved. Refresh before trying again.').message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <IncidentFormScreen
      {...(projectId ? { bookingLabel: `Project ${projectId}` } : {})}
      {...(errorMessage ? { errorMessage } : {})}
      category={category}
      connectionState={connectionState}
      kind={kind}
      onBack={() => navigation.goBack()}
      onCategoryChange={setCategory}
      onSubmit={() => { void submit(); }}
      onSummaryChange={setSummary}
      submitting={submitting}
      summary={summary}
    />
  );
}

export function IncidentDetailRoute({ navigation, route }: { navigation: any; route: any }) {
  const { connectionState } = useTrustSession();
  const kind = incidentKind(route);
  const incidentId = uuid(routeParam(route, 'incidentId'));
  const [resource, setResource] = useState<TrustResourceState<IncidentDto>>({ status: 'loading' });

  const refresh = useCallback(async () => {
    if (!kind || !incidentId) {
      setResource(invalidResource('Record unavailable', 'The record reference or record type is invalid.'));
      return;
    }
    if (connectionState === 'offline') {
      setResource((current) => current.status === 'ready'
        ? current
        : invalidResource('Record unavailable offline', 'Reconnect to verify this private record.'));
      return;
    }
    setResource((current) => current.status === 'ready' ? current : { status: 'loading' });
    try {
      const incident = await loadGroundedIncident(kind, incidentId);
      setResource({ status: 'ready', value: incident, lastUpdatedAt: incident.updatedAt });
    } catch (error) {
      setResource(errorResource(error, 'Record could not be loaded', 'The private record could not be verified.'));
    }
  }, [connectionState, incidentId, kind]);

  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));

  return (
    <IncidentDetailScreen
      connectionState={connectionState}
      onBack={() => navigation.goBack()}
      onCall10111={() => safeEmergencyDial('10111')}
      onCall112={() => safeEmergencyDial('112')}
      onRetry={() => { void refresh(); }}
      resource={resource}
    />
  );
}

function relationshipProject(response: unknown, actorRole: TrustRole, sourceBookingId: string): RelationshipSnapshot['counterpart'] | null {
  const project = isRecord(response) && isRecord(response.project) ? response.project : null;
  if (!project || uuid(project.id) !== sourceBookingId || !isRecord(project.participants) || !isRecord(project.service)) return null;
  const participant = actorRole === 'customer' ? project.participants.worker : project.participants.customer;
  if (!isRecord(participant)) return null;
  const id = uuid(participant.id);
  const displayName = boundedText(participant.displayName, 100);
  const serviceLabel = boundedText(project.service.label, 160);
  if (!id || !displayName || !serviceLabel) return null;
  return Object.freeze({ id, displayName, serviceLabel });
}

function activeFavouriteFor(favourites: readonly FavouriteDto[], workerId: string): boolean {
  return favourites.some((favourite) => favourite.worker.id === workerId && favourite.status === 'active');
}

export function RelationshipsRoute({ navigation, route }: { navigation: any; route: any }) {
  const { actorId, actorRole, connectionState } = useTrustSession();
  const sourceBookingId = uuid(routeParam(route, 'sourceBookingId') ?? routeParam(route, 'projectId'));
  const [resource, setResource] = useState<TrustResourceState<RelationshipSnapshot>>({ status: 'loading' });
  const [blockConfirmationOpen, setBlockConfirmationOpen] = useState(false);
  const [selectedBlockReason, setSelectedBlockReason] = useState<BlockReasonCode | null>(null);
  const [pendingAction, setPendingAction] = useState<'favourite' | 'rebook' | 'recurring' | 'block' | null>(null);

  const refresh = useCallback(async () => {
    if (!sourceBookingId) {
      setResource(invalidResource('Relationship unavailable', 'A valid source Project is required.'));
      return;
    }
    if (actorRole !== 'customer') {
      setResource(invalidResource(
        'Relationship controls unavailable',
        'The Worker projection does not disclose the customer identifier needed for this control. No private identifier has been inferred.',
      ));
      return;
    }
    if (connectionState === 'offline') {
      setResource((current) => current.status === 'ready'
        ? current
        : invalidResource('Relationship unavailable offline', 'Reconnect to verify the latest eligibility and block state.'));
      return;
    }
    setResource((current) => current.status === 'ready' ? current : { status: 'loading' });
    try {
      const [eligibility, projectResponse, favourites] = await Promise.all([
        loadGroundedRelationshipEligibility(sourceBookingId),
        loadGroundedProject(sourceBookingId),
        loadGroundedFavourites(),
      ]);
      const counterpart = relationshipProject(projectResponse, actorRole, sourceBookingId);
      if (!counterpart) throw new Error('relationship_project_projection_invalid');
      setResource({
        status: 'ready',
        value: Object.freeze({
          eligibility,
          counterpart,
          favouriteActive: activeFavouriteFor(favourites, counterpart.id),
        }),
        lastUpdatedAt: new Date().toISOString(),
      });
    } catch (error) {
      setResource(errorResource(error, 'Relationship could not be loaded', 'The latest relationship evidence could not be verified.'));
    }
  }, [actorRole, connectionState, sourceBookingId]);

  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));

  if (resource.status !== 'ready') {
    return (
      <ResourceShell
        connectionState={connectionState}
        loadingLabel="Loading relationship evidence"
        onBack={() => navigation.goBack()}
        onRetry={() => { void refresh(); }}
        resource={resource}
        subtitle="Server-authoritative eligibility"
        title="Work together again"
      />
    );
  }

  const runFavourite = async () => {
    if (!sourceBookingId || pendingAction || connectionState === 'offline') return;
    const snapshot = resource.value;
    const command = snapshot.favouriteActive ? 'remove_favourite' : 'create_favourite';
    const prepared = commandKey({
      command,
      actorId,
      resourceId: snapshot.counterpart.id,
      requestKey: 'relationship-favourite-v1',
      connectionState,
      payload: { sourceBookingId, active: !snapshot.favouriteActive },
    });
    if (!prepared.ok) {
      setResource(invalidResource('Favourite was not changed', prepared.message));
      return;
    }
    setPendingAction('favourite');
    try {
      if (snapshot.favouriteActive) {
        await removeGroundedFavourite({
          workerId: snapshot.counterpart.id,
          connectionState,
          idempotencyKey: prepared.value,
        });
      } else {
        await createGroundedFavourite({
          workerId: snapshot.counterpart.id,
          sourceBookingId,
          connectionState,
          idempotencyKey: prepared.value,
        });
      }
      await refresh();
    } catch (error) {
      setResource(errorResource(error, 'Favourite was not changed', 'The favourite state could not be verified.'));
    } finally {
      setPendingAction(null);
    }
  };

  const createDraft = async () => {
    if (!sourceBookingId || pendingAction || connectionState === 'offline') return;
    const prepared = commandKey({
      command: 'create_rebook_draft',
      actorId,
      resourceId: sourceBookingId,
      requestKey: 'relationship-rebook-v1',
      connectionState,
      payload: {},
    });
    if (!prepared.ok) {
      setResource(invalidResource('Draft was not created', prepared.message));
      return;
    }
    setPendingAction('rebook');
    try {
      const draft = await createGroundedRebookDraft({
        sourceBookingId,
        connectionState,
        idempotencyKey: prepared.value,
      });
      navigation.navigate(GROUNDED_TRUST_ROUTE_NAMES.rebookDraft, { draftId: draft.id });
    } catch (error) {
      setResource(errorResource(error, 'Draft was not created', 'No rebook draft was created.'));
    } finally {
      setPendingAction(null);
    }
  };

  const block = async (reasonCode: BlockReasonCode) => {
    if (!sourceBookingId || pendingAction || connectionState === 'offline') return;
    const prepared = commandKey({
      command: 'block_relationship',
      actorId,
      resourceId: resource.value.counterpart.id,
      requestKey: 'relationship-block-v1',
      connectionState,
      payload: { sourceBookingId, reasonCode },
    });
    if (!prepared.ok) {
      setResource(invalidResource('Block was not recorded', prepared.message));
      return;
    }
    setPendingAction('block');
    try {
      await createGroundedBlock({
        blockedUserId: resource.value.counterpart.id,
        sourceBookingId,
        reasonCode,
        connectionState,
        idempotencyKey: prepared.value,
      });
      setBlockConfirmationOpen(false);
      setSelectedBlockReason(null);
      await refresh();
    } catch (error) {
      setResource(errorResource(error, 'Block was not recorded', 'The relationship remains unchanged.'));
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <RelationshipActionsScreen
      blockConfirmationOpen={blockConfirmationOpen}
      connectionState={connectionState}
      eligibility={resource.value.eligibility}
      favouriteActive={resource.value.favouriteActive}
      onBack={() => navigation.goBack()}
      onBlockReasonChange={setSelectedBlockReason}
      onCloseBlockConfirmation={() => {
        setBlockConfirmationOpen(false);
        setSelectedBlockReason(null);
      }}
      onConfirmBlock={(reason) => { void block(reason); }}
      onCreateRebookDraft={() => { void createDraft(); }}
      onCreateRecurringSeries={() => sourceBookingId && navigation.navigate(
        GROUNDED_TRUST_ROUTE_NAMES.recurringProposal,
        { sourceBookingId },
      )}
      onOpenBlockConfirmation={() => setBlockConfirmationOpen(true)}
      onToggleFavourite={() => { void runFavourite(); }}
      pendingAction={pendingAction}
      selectedBlockReason={selectedBlockReason}
      worker={resource.value.counterpart}
    />
  );
}

function rebookScopeSummary(draft: RebookDraftDto): string {
  return boundedText(draft.editableScope.summary, 2_000) ?? '';
}

function requestedStartsAt(value: string): Readonly<{ ok: true; value: string | null }> | Readonly<{ ok: false; message: string }> {
  if (!value.trim()) return Object.freeze({ ok: true, value: null });
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
    return Object.freeze({ ok: false, message: 'Use a future date and time that can be interpreted as ISO-8601.' });
  }
  return Object.freeze({ ok: true, value: new Date(timestamp).toISOString() });
}

function nextEditableScope(draft: RebookDraftDto, summary: string): Readonly<Record<string, unknown>> {
  const next: Record<string, unknown> = { ...draft.editableScope };
  if (summary.trim()) next.summary = summary.trim();
  else delete next.summary;
  return Object.freeze(next);
}

export function RebookDraftRoute({ navigation, route }: { navigation: any; route: any }) {
  const { actorId, actorRole, connectionState } = useTrustSession();
  const draftId = uuid(routeParam(route, 'draftId'));
  const [resource, setResource] = useState<TrustResourceState<RebookDraftDto>>({ status: 'loading' });
  const [scopeSummary, setScopeSummary] = useState('');
  const [broadAreaLabel, setBroadAreaLabel] = useState('');
  const [requestedStartsAtLabel, setRequestedStartsAtLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const applyDraft = useCallback((draft: RebookDraftDto) => {
    setResource({ status: 'ready', value: draft, lastUpdatedAt: draft.updatedAt });
    setScopeSummary(rebookScopeSummary(draft));
    setBroadAreaLabel(draft.broadAreaLabel ?? '');
    setRequestedStartsAtLabel(draft.requestedStartsAt ?? '');
  }, []);

  const refresh = useCallback(async () => {
    if (!draftId || actorRole !== 'customer') {
      setResource(invalidResource('Rebook draft unavailable', 'A valid customer draft reference is required.'));
      return;
    }
    if (connectionState === 'offline') {
      setResource((current) => current.status === 'ready'
        ? current
        : invalidResource('Draft unavailable offline', 'Reconnect to load the current draft revision.'));
      return;
    }
    setResource((current) => current.status === 'ready' ? current : { status: 'loading' });
    try {
      applyDraft(await loadGroundedRebookDraft(draftId));
    } catch (error) {
      setResource(errorResource(error, 'Draft could not be loaded', 'The current draft revision could not be verified.'));
    }
  }, [actorRole, applyDraft, connectionState, draftId]);

  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));

  if (resource.status !== 'ready') {
    return (
      <ResourceShell
        connectionState={connectionState}
        loadingLabel="Loading rebook draft"
        onBack={() => navigation.goBack()}
        onRetry={() => { void refresh(); }}
        resource={resource}
        subtitle="Draft, not a booking"
        title="Rebook draft"
      />
    );
  }

  const save = async () => {
    if (!draftId || saving || connectionState === 'offline') return;
    const startsAt = requestedStartsAt(requestedStartsAtLabel);
    if (!startsAt.ok) {
      setErrorMessage(startsAt.message);
      return;
    }
    const area = broadAreaLabel.trim();
    if (area.length === 1 || area.length > 160) {
      setErrorMessage('Broad area must be blank or contain between 2 and 160 characters.');
      return;
    }
    const prepared = commandKey({
      command: 'update_rebook_draft',
      actorId,
      resourceId: draftId,
      expectedRevision: resource.value.revision,
      requestKey: 'rebook-draft-save-v1',
      connectionState,
      payload: {
        scopeSummary: scopeSummary.trim(),
        broadAreaLabel: area || null,
        requestedStartsAt: startsAt.value,
      },
    });
    if (!prepared.ok) {
      setErrorMessage(prepared.message);
      return;
    }
    setSaving(true);
    setErrorMessage(undefined);
    try {
      const updated = await updateGroundedRebookDraft({
        draftId,
        revision: resource.value.revision,
        patch: {
          editableScope: nextEditableScope(resource.value, scopeSummary),
          broadAreaLabel: area || null,
          requestedStartsAt: startsAt.value,
        },
        connectionState,
        idempotencyKey: prepared.value,
      });
      applyDraft(updated);
    } catch (error) {
      setErrorMessage(problemDetail(error, 'The draft was not changed. Refresh before retrying.').message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <RebookDraftScreen
      {...(errorMessage ? { errorMessage } : {})}
      broadAreaLabel={broadAreaLabel}
      connectionState={connectionState}
      draft={resource.value}
      onBack={() => navigation.goBack()}
      onBroadAreaLabelChange={setBroadAreaLabel}
      onRequestedStartsAtChange={setRequestedStartsAtLabel}
      onSaveDraft={() => { void save(); }}
      onScopeSummaryChange={setScopeSummary}
      requestedStartsAtLabel={requestedStartsAtLabel}
      saving={saving}
      scopeSummary={scopeSummary}
    />
  );
}

type ProposalContext = Readonly<{
  sourceBookingId: string;
  series: RecurringSeriesDto | null;
}>;

type OccurrenceInput = Readonly<{
  ok: true;
  occurrences: readonly string[];
}> | Readonly<{
  ok: false;
  message: string;
}>;

function parseOccurrenceInput(value: string): OccurrenceInput {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2 || lines.length > 104) {
    return Object.freeze({ ok: false, message: 'Provide between 2 and 104 future occurrence timestamps, one per line.' });
  }
  const timestamps = lines.map((line) => Date.parse(line));
  if (timestamps.some((timestamp) => !Number.isFinite(timestamp) || timestamp <= Date.now())) {
    return Object.freeze({ ok: false, message: 'Every occurrence must be a valid future ISO-8601 date and time.' });
  }
  for (let index = 1; index < timestamps.length; index += 1) {
    if ((timestamps[index] ?? 0) <= (timestamps[index - 1] ?? 0)) {
      return Object.freeze({ ok: false, message: 'Occurrence timestamps must be unique and strictly increasing.' });
    }
  }
  const first = timestamps[0] ?? 0;
  const last = timestamps[timestamps.length - 1] ?? 0;
  if (last - first > 366 * 24 * 60 * 60 * 1_000) {
    return Object.freeze({ ok: false, message: 'One proposal may cover at most 366 days.' });
  }
  return Object.freeze({
    ok: true,
    occurrences: Object.freeze(timestamps.map((timestamp) => new Date(timestamp).toISOString())),
  });
}

function proposalLines(series: RecurringSeriesDto): string {
  return (series.proposedTerms ?? series.currentTerms)?.schedule.occurrences.join('\n') ?? '';
}

function proposalSubstitution(series: RecurringSeriesDto): SubstitutionPolicy {
  return (series.proposedTerms ?? series.currentTerms)?.substitutionPolicy ?? 'no_substitution';
}

export function RecurringProposalRoute({ navigation, route }: { navigation: any; route: any }) {
  const theme = useTogtTheme();
  const { actorId, actorRole, connectionState } = useTrustSession();
  const sourceBookingId = uuid(routeParam(route, 'sourceBookingId'));
  const seriesId = uuid(routeParam(route, 'seriesId'));
  const [resource, setResource] = useState<TrustResourceState<ProposalContext>>({ status: 'loading' });
  const [occurrenceLines, setOccurrenceLines] = useState('');
  const [substitutionPolicy, setSubstitutionPolicy] = useState<SubstitutionPolicy>('no_substitution');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const refresh = useCallback(async () => {
    if (!actorRole) {
      setResource(invalidResource('Recurring proposal unavailable', 'A recognised customer or Worker session is required.'));
      return;
    }
    if (!seriesId && (!sourceBookingId || actorRole !== 'customer')) {
      setResource(invalidResource('Recurring proposal unavailable', 'A valid eligible source Project is required to create recurring terms.'));
      return;
    }
    if (connectionState === 'offline') {
      setResource((current) => current.status === 'ready'
        ? current
        : invalidResource('Proposal unavailable offline', 'Reconnect to verify the current relationship and terms revision.'));
      return;
    }
    setResource((current) => current.status === 'ready' ? current : { status: 'loading' });
    try {
      if (seriesId) {
        const series = await loadGroundedRecurringSeriesDetail(seriesId);
        setOccurrenceLines(proposalLines(series));
        setSubstitutionPolicy(proposalSubstitution(series));
        setResource({
          status: 'ready',
          value: Object.freeze({ sourceBookingId: series.sourceProjectReference, series }),
          lastUpdatedAt: series.updatedAt,
        });
        return;
      }
      if (!sourceBookingId) throw new Error('source_project_required');
      const eligibility = await loadGroundedRelationshipEligibility(sourceBookingId);
      if (!eligibility.relationshipEligible || !eligibility.actions.createRecurringSeries || !eligibility.recurrence.configuredForService) {
        setResource(invalidResource(
          'Recurring work unavailable',
          'The server has not confirmed this completed, paid relationship and service as recurring-eligible.',
        ));
        return;
      }
      setResource({
        status: 'ready',
        value: Object.freeze({ sourceBookingId, series: null }),
        lastUpdatedAt: new Date().toISOString(),
      });
    } catch (error) {
      setResource(errorResource(error, 'Recurring proposal could not be loaded', 'The current recurring-work eligibility could not be verified.'));
    }
  }, [actorRole, connectionState, seriesId, sourceBookingId]);

  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));

  if (resource.status !== 'ready') {
    return (
      <ResourceShell
        connectionState={connectionState}
        loadingLabel="Loading recurring-work evidence"
        onBack={() => navigation.goBack()}
        onRetry={() => { void refresh(); }}
        resource={resource}
        subtitle="Bilateral, versioned terms"
        title="Recurring proposal"
      />
    );
  }

  const submit = async () => {
    if (submitting || connectionState === 'offline') return;
    const parsed = parseOccurrenceInput(occurrenceLines);
    if (!parsed.ok) {
      setErrorMessage(parsed.message);
      return;
    }
    const schedule = Object.freeze({
      timezone: 'Africa/Johannesburg' as const,
      occurrences: parsed.occurrences,
    });
    const command = resource.value.series ? 'propose_terms' : 'create_recurring_series';
    const targetId = resource.value.series?.id ?? resource.value.sourceBookingId;
    const prepared = commandKey({
      command,
      actorId,
      resourceId: targetId,
      ...(resource.value.series ? { expectedRevision: resource.value.series.revision } : {}),
      requestKey: 'recurring-proposal-v1',
      connectionState,
      payload: { schedule, substitutionPolicy },
    });
    if (!prepared.ok) {
      setErrorMessage(prepared.message);
      return;
    }
    setSubmitting(true);
    setErrorMessage(undefined);
    try {
      const series = resource.value.series
        ? await updateGroundedRecurringSeries({
            seriesId: resource.value.series.id,
            revision: resource.value.series.revision,
            action: { action: 'propose_terms', schedule, substitutionPolicy },
            connectionState,
            idempotencyKey: prepared.value,
          })
        : await createGroundedRecurringSeries({
            sourceBookingId: resource.value.sourceBookingId,
            schedule,
            substitutionPolicy,
            connectionState,
            idempotencyKey: prepared.value,
          });
      navigation.replace(GROUNDED_TRUST_ROUTE_NAMES.recurringSeries, { seriesId: series.id });
    } catch (error) {
      setErrorMessage(problemDetail(error, 'The recurring proposal was not saved.').message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppScaffold
      bottomAction={(
        <Button
          disabled={connectionState === 'offline' || submitting}
          fullWidth
          label={submitting ? 'Saving proposal…' : resource.value.series ? 'Propose revised terms' : 'Create recurring proposal'}
          loading={submitting}
          onPress={() => { void submit(); }}
        />
      )}
      contentContainerStyle={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.xl, paddingTop: theme.spacing.md }}
      keyboardAware
      scrollable
      testID="recurring-proposal-screen"
      topBar={<TopAppBar onBack={() => navigation.goBack()} subtitle="Bilateral, versioned terms" title="Recurring proposal" />}
    >
      <Surface elevation="card" style={{ gap: theme.spacing.sm }} variant="inverse">
        <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h1, { color: theme.colors.textInverse }]}>Plan the occurrences</Text>
        <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.translucentSurface }]}>Both participants must accept the same terms revision. No occurrence automatically becomes a booking.</Text>
      </Surface>
      <TruthNotice
        body="Provide 2–104 future timestamps in increasing order. The plan may cover at most 366 days and uses Africa/Johannesburg."
        icon="calendar-range-outline"
        title="Schedule contract"
        tone="positive"
      />
      <TextField
        helperText="One ISO-8601 date and time per line, for example 2026-10-05T08:00:00+02:00."
        label="Occurrence timestamps"
        multiline
        onChangeText={setOccurrenceLines}
        required
        value={occurrenceLines}
      />
      <View style={{ gap: theme.spacing.sm }}>
        <SectionHeader subtitle="Substitution never happens silently." title="Substitution policy" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
          <Chip label="No substitution" onPress={() => setSubstitutionPolicy('no_substitution')} selected={substitutionPolicy === 'no_substitution'} tone="brand" />
          <Chip label="Explicit approval each time" onPress={() => setSubstitutionPolicy('explicit_approval_each_time')} selected={substitutionPolicy === 'explicit_approval_each_time'} tone="brand" />
        </View>
      </View>
      <TruthNotice
        body="Booking creation is not automatic. Every occurrence still requires current price, location, schedule and Worker availability confirmation."
        icon="briefcase-clock-outline"
        title="Proposal, not confirmed work"
      />
      {connectionState === 'offline' ? <TruthNotice body="Reconnect before saving. Nothing is queued." icon="cloud-off-outline" title="Read-only while offline" /> : null}
      {errorMessage ? <InlineError message={errorMessage} /> : null}
    </AppScaffold>
  );
}

type SeriesCommand =
  | 'accept_terms'
  | 'pause_series'
  | 'request_resume'
  | 'accept_resume'
  | 'request_cancel_series'
  | 'accept_cancel_series';

function seriesAction(command: SeriesCommand): Exclude<
  RecurringSeriesAction['action'],
  'propose_terms' | 'request_occurrence_change' | 'accept_occurrence_change' | 'decline_occurrence_change'
> {
  return command === 'pause_series' ? 'pause' : command;
}

export function RecurringSeriesRoute({ navigation, route }: { navigation: any; route: any }) {
  const { actorId, actorRole, connectionState } = useTrustSession();
  const seriesId = uuid(routeParam(route, 'seriesId'));
  const [resource, setResource] = useState<TrustResourceState<RecurringSeriesDto>>({ status: 'loading' });
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!seriesId || !actorRole) {
      setResource(invalidResource('Recurring series unavailable', 'A valid series reference and participant role are required.'));
      return;
    }
    if (connectionState === 'offline') {
      setResource((current) => current.status === 'ready'
        ? current
        : invalidResource('Series unavailable offline', 'Reconnect to load the current series revision.'));
      return;
    }
    setResource((current) => current.status === 'ready' ? current : { status: 'loading' });
    try {
      const series = await loadGroundedRecurringSeriesDetail(seriesId);
      setResource({ status: 'ready', value: series, lastUpdatedAt: series.updatedAt });
    } catch (error) {
      setResource(errorResource(error, 'Recurring series could not be loaded', 'The current series revision could not be verified.'));
    }
  }, [actorRole, connectionState, seriesId]);

  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));

  if (resource.status !== 'ready' || !actorRole) {
    return (
      <ResourceShell
        connectionState={connectionState}
        loadingLabel="Loading recurring series"
        onBack={() => navigation.goBack()}
        onRetry={() => { void refresh(); }}
        resource={resource}
        subtitle="Bilateral terms and occurrences"
        title="Recurring work"
      />
    );
  }

  const run = async (action: SeriesCommand) => {
    if (!seriesId || pendingAction || connectionState === 'offline') return;
    const prepared = commandKey({
      command: action,
      actorId,
      resourceId: seriesId,
      expectedRevision: resource.value.revision,
      requestKey: 'recurring-series-decision-v1',
      connectionState,
      payload: { action },
    });
    if (!prepared.ok) {
      setResource(invalidResource('Series was not changed', prepared.message));
      return;
    }
    const transportAction = seriesAction(action);
    setPendingAction(transportAction);
    try {
      const updated = await updateGroundedRecurringSeries({
        seriesId,
        revision: resource.value.revision,
        action: { action: transportAction },
        connectionState,
        idempotencyKey: prepared.value,
      });
      setResource({ status: 'ready', value: updated, lastUpdatedAt: updated.updatedAt });
    } catch (error) {
      setResource(errorResource(error, 'Series was not changed', 'The series decision was not recorded. Refresh before retrying.'));
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <RecurringSeriesScreen
      actorRole={actorRole}
      connectionState={connectionState}
      counterpartyRequestEvidence={{
        resume: resource.value.status === 'resume_requested'
          && resource.value.pendingRequests.resumeRequestedByRole !== null
          && resource.value.pendingRequests.resumeRequestedByRole !== actorRole,
        cancellation: resource.value.status === 'cancellation_requested'
          && resource.value.pendingRequests.cancellationRequestedByRole !== null
          && resource.value.pendingRequests.cancellationRequestedByRole !== actorRole,
      }}
      onAcceptCancelSeries={() => { void run('accept_cancel_series'); }}
      onAcceptResume={() => { void run('accept_resume'); }}
      onAcceptTerms={() => { void run('accept_terms'); }}
      onBack={() => navigation.goBack()}
      onOpenOccurrence={(occurrence) => navigation.navigate(GROUNDED_TRUST_ROUTE_NAMES.recurringOccurrence, {
        seriesId: resource.value.id,
        occurrenceId: occurrence.id,
      })}
      onPauseSeries={() => { void run('pause_series'); }}
      onProposeTerms={() => navigation.navigate(GROUNDED_TRUST_ROUTE_NAMES.recurringProposal, { seriesId: resource.value.id })}
      onRequestCancelSeries={() => { void run('request_cancel_series'); }}
      onRequestResume={() => { void run('request_resume'); }}
      pendingAction={pendingAction}
      series={resource.value}
    />
  );
}

export function RecurringOccurrenceRoute({ navigation, route }: { navigation: any; route: any }) {
  const { actorId, actorRole, connectionState } = useTrustSession();
  const seriesId = uuid(routeParam(route, 'seriesId'));
  const occurrenceId = uuid(routeParam(route, 'occurrenceId'));
  const [resource, setResource] = useState<TrustResourceState<RecurringSeriesDto>>({ status: 'loading' });
  const [changeKind, setChangeKind] = useState<'reschedule' | 'cancel' | null>(null);
  const [proposedScheduledAt, setProposedScheduledAt] = useState('');
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!seriesId || !occurrenceId || !actorRole) {
      setResource(invalidResource('Occurrence unavailable', 'A valid series, occurrence and participant role are required.'));
      return;
    }
    if (connectionState === 'offline') {
      setResource((current) => current.status === 'ready'
        ? current
        : invalidResource('Occurrence unavailable offline', 'Reconnect to load the current occurrence decision.'));
      return;
    }
    setResource((current) => current.status === 'ready' ? current : { status: 'loading' });
    try {
      const series = await loadGroundedRecurringSeriesDetail(seriesId);
      if (!series.occurrences.some((occurrence) => occurrence.id === occurrenceId)) {
        setResource(invalidResource('Occurrence unavailable', 'The occurrence is not present in the latest series revision.'));
        return;
      }
      setResource({ status: 'ready', value: series, lastUpdatedAt: series.updatedAt });
    } catch (error) {
      setResource(errorResource(error, 'Occurrence could not be loaded', 'The current occurrence decision could not be verified.'));
    }
  }, [actorRole, connectionState, occurrenceId, seriesId]);

  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));

  if (resource.status !== 'ready' || !actorRole) {
    return (
      <ResourceShell
        connectionState={connectionState}
        loadingLabel="Loading recurring occurrence"
        onBack={() => navigation.goBack()}
        onRetry={() => { void refresh(); }}
        resource={resource}
        subtitle="Single-occurrence decision"
        title="Recurring occurrence"
      />
    );
  }

  const occurrence = resource.value.occurrences.find((candidate) => candidate.id === occurrenceId);
  if (!occurrence) {
    return (
      <ResourceShell
        connectionState={connectionState}
        loadingLabel="Loading recurring occurrence"
        onBack={() => navigation.goBack()}
        onRetry={() => { void refresh(); }}
        resource={invalidResource('Occurrence unavailable', 'The occurrence is not present in the latest series revision.')}
        subtitle="Single-occurrence decision"
        title="Recurring occurrence"
      />
    );
  }

  const run = async (
    command: 'request_occurrence_change' | 'accept_occurrence_change' | 'decline_occurrence_change',
    action: RecurringSeriesAction,
    payload: Readonly<Record<string, string>>,
  ) => {
    if (!seriesId || pendingAction || connectionState === 'offline') return;
    const prepared = commandKey({
      command,
      actorId,
      resourceId: seriesId,
      expectedRevision: resource.value.revision,
      requestKey: 'recurring-occurrence-decision-v1',
      connectionState,
      payload,
    });
    if (!prepared.ok) {
      setResource(invalidResource('Occurrence was not changed', prepared.message));
      return;
    }
    setPendingAction(command);
    try {
      const updated = await updateGroundedRecurringSeries({
        seriesId,
        revision: resource.value.revision,
        action,
        connectionState,
        idempotencyKey: prepared.value,
      });
      setResource({ status: 'ready', value: updated, lastUpdatedAt: updated.updatedAt });
      setChangeKind(null);
      setProposedScheduledAt('');
    } catch (error) {
      setResource(errorResource(error, 'Occurrence was not changed', 'The occurrence decision was not recorded. Refresh before retrying.'));
    } finally {
      setPendingAction(null);
    }
  };

  const requestChange = (input: Readonly<{ changeKind: 'reschedule' | 'cancel'; proposedScheduledAt?: string }>) => {
    if (input.changeKind === 'reschedule') {
      const parsed = requestedStartsAt(input.proposedScheduledAt ?? '');
      if (!parsed.ok || !parsed.value) {
        setResource(invalidResource('Occurrence was not changed', parsed.ok ? 'A future proposed time is required.' : parsed.message));
        return;
      }
      void run(
        'request_occurrence_change',
        {
          action: 'request_occurrence_change',
          occurrenceId: occurrence.id,
          changeKind: 'reschedule',
          proposedScheduledAt: parsed.value,
        },
        { occurrenceId: occurrence.id, changeKind: 'reschedule', proposedScheduledAt: parsed.value },
      );
      return;
    }
    void run(
      'request_occurrence_change',
      { action: 'request_occurrence_change', occurrenceId: occurrence.id, changeKind: 'cancel' },
      { occurrenceId: occurrence.id, changeKind: 'cancel' },
    );
  };

  const decide = (command: 'accept_occurrence_change' | 'decline_occurrence_change', change: RecurringOccurrenceChangeDto) => {
    void run(
      command,
      { action: command, changeRequestId: change.id },
      { changeRequestId: change.id },
    );
  };

  return (
    <RecurringOccurrenceScreen
      actorRole={actorRole}
      changeKind={changeKind}
      connectionState={connectionState}
      occurrence={occurrence}
      onAcceptOccurrenceChange={(change) => decide('accept_occurrence_change', change)}
      onBack={() => navigation.goBack()}
      onChangeKind={setChangeKind}
      onDeclineOccurrenceChange={(change) => decide('decline_occurrence_change', change)}
      onProposedScheduledAtChange={setProposedScheduledAt}
      onRequestOccurrenceChange={requestChange}
      pendingAction={pendingAction}
      proposedScheduledAt={proposedScheduledAt}
      series={resource.value}
    />
  );
}
