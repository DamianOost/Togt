import NetInfo from '@react-native-community/netinfo';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  commercialTermsFromCatalogue,
  toIntakeCatalogueSnapshot,
} from '../../../data/grounded';
import type { GroundedCatalogueService } from '../../../data/grounded';
import {
  loadCustomerIntakeDraft,
  loadGroundedCatalogue,
  saveCustomerIntakeDraft,
} from '../../../services';
import {
  commitMapPinForDraft,
  createCustomerIntakeDraft,
  reviseCustomerIntakeDraft,
  saveCustomerIntakeDraftLocally,
} from '../intake';
import type {
  AddressPickerCommitGuard,
  Coordinates,
  CustomerIntakeDraft,
  CustomerIntakeDraftChanges,
  MapPinCommitResult,
} from '../intake';

export type CatalogueResource =
  | Readonly<{ state: 'loading' }>
  | Readonly<{ state: 'error'; message: string; correlationId: string | null }>
  | Readonly<{ state: 'ready'; services: readonly GroundedCatalogueService[] }>;

export type DraftSaveState =
  | Readonly<{ state: 'idle' }>
  | Readonly<{ state: 'saving' }>
  | Readonly<{ state: 'saved'; savedAt: string }>
  | Readonly<{ state: 'error'; message: string }>;

type CustomerExperienceValue = Readonly<{
  actorId: string;
  connectionState: 'online' | 'offline';
  catalogue: CatalogueResource;
  draft: CustomerIntakeDraft;
  selectedService: GroundedCatalogueService | null;
  draftSaveState: DraftSaveState;
  refreshCatalogue: () => Promise<void>;
  reviseDraft: (changes: CustomerIntakeDraftChanges) => void;
  commitAddressPin: (guard: AddressPickerCommitGuard, coordinates: Coordinates) => MapPinCommitResult;
  selectService: (serviceId: string, serviceVersion: number) => boolean;
  saveDraft: () => Promise<boolean>;
  resetDraft: () => void;
}>;

const CustomerExperienceContext = createContext<CustomerExperienceValue | null>(null);

function newDraft(actorId: string, connectionState: 'online' | 'offline'): CustomerIntakeDraft {
  return createCustomerIntakeDraft({
    draftId: `draft:${actorId.slice(0, 36)}:${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
    connectionState,
  });
}

export function CustomerExperienceProvider({
  actorId,
  children,
}: Readonly<{ actorId: string; children: React.ReactNode }>) {
  const safeActorId = actorId || 'customer-session-unavailable';
  const persistenceAllowed = actorId.length > 0;
  const [connectionState, setConnectionState] = useState<'online' | 'offline'>('offline');
  const [draft, setDraft] = useState<CustomerIntakeDraft>(() => newDraft(safeActorId, 'offline'));
  const draftRef = useRef(draft);
  const draftMutationEpoch = useRef(0);
  const [catalogue, setCatalogue] = useState<CatalogueResource>({ state: 'loading' });
  const [draftSaveState, setDraftSaveState] = useState<DraftSaveState>({ state: 'idle' });
  const mounted = useRef(true);

  const updateDraft = useCallback((
    update: CustomerIntakeDraft | ((current: CustomerIntakeDraft) => CustomerIntakeDraft),
  ): CustomerIntakeDraft => {
    const next = typeof update === 'function' ? update(draftRef.current) : update;
    draftRef.current = next;
    setDraft(next);
    return next;
  }, []);

  useEffect(() => () => {
    mounted.current = false;
  }, []);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const next = state.isConnected === true && state.isInternetReachable !== false ? 'online' : 'offline';
      setConnectionState(next);
      updateDraft((current) => current.connectionState === next
        ? current
        : reviseCustomerIntakeDraft(current, { connectionState: next }, new Date().toISOString()));
    });
    return unsubscribe;
  }, [updateDraft]);

  useEffect(() => {
    let active = true;
    const restoreStartedAtEpoch = 0;
    draftMutationEpoch.current = restoreStartedAtEpoch;
    updateDraft(newDraft(safeActorId, connectionState));
    setDraftSaveState({ state: 'idle' });
    if (!persistenceAllowed) return () => { active = false; };
    void loadCustomerIntakeDraft(safeActorId).then((restored) => {
      if (
        !active
        || !restored
        || draftMutationEpoch.current !== restoreStartedAtEpoch
      ) return;
      updateDraft(reviseCustomerIntakeDraft(
        restored,
        { connectionState: draftRef.current.connectionState },
        new Date().toISOString(),
      ));
    });
    return () => { active = false; };
  }, [safeActorId, persistenceAllowed, updateDraft]);

  const refreshCatalogue = useCallback(async () => {
    setCatalogue({ state: 'loading' });
    try {
      const services = await loadGroundedCatalogue();
      if (mounted.current) setCatalogue({ state: 'ready', services });
    } catch (error) {
      const problem = error && typeof error === 'object' && 'problem' in error
        ? (error as { problem?: { detail?: string; correlationId?: string | null } }).problem
        : null;
      if (mounted.current) {
        setCatalogue({
          state: 'error',
          message: problem?.detail ?? 'The published service catalogue could not be loaded.',
          correlationId: problem?.correlationId ?? null,
        });
      }
    }
  }, []);

  useEffect(() => {
    void refreshCatalogue();
  }, [refreshCatalogue]);

  const reviseDraft = useCallback((changes: CustomerIntakeDraftChanges) => {
    draftMutationEpoch.current += 1;
    updateDraft((current) => reviseCustomerIntakeDraft(current, changes, new Date().toISOString()));
    setDraftSaveState({ state: 'idle' });
  }, [updateDraft]);

  const commitAddressPin = useCallback((
    guard: AddressPickerCommitGuard,
    coordinates: Coordinates,
  ): MapPinCommitResult => {
    const current = draftRef.current;
    const committed = commitMapPinForDraft(current, guard, coordinates);
    if (!committed.ok) return committed;
    draftMutationEpoch.current += 1;
    updateDraft(reviseCustomerIntakeDraft(
      current,
      { address: committed.address },
      new Date().toISOString(),
    ));
    setDraftSaveState({ state: 'idle' });
    return committed;
  }, [updateDraft]);

  const selectService = useCallback((serviceId: string, serviceVersion: number): boolean => {
    if (catalogue.state !== 'ready') return false;
    const selected = catalogue.services.find((service) => service.id === serviceId && service.version === serviceVersion);
    if (!selected) return false;
    draftMutationEpoch.current += 1;
    updateDraft((current) => reviseCustomerIntakeDraft(current, {
      selectedService: toIntakeCatalogueSnapshot(selected),
      commercialTerms: commercialTermsFromCatalogue(selected),
      brief: current.selectedService?.serviceId === selected.id
        && current.selectedService.serviceVersion === selected.version
        ? current.brief
        : {
            answers: {},
            attachments: [],
            materialsResponsibility: null,
            budgetCapMinor: null,
            diagnosticNeed: '',
          },
    }, new Date().toISOString()));
    setDraftSaveState({ state: 'idle' });
    return true;
  }, [catalogue, updateDraft]);

  const saveDraft = useCallback(async (): Promise<boolean> => {
    if (!persistenceAllowed) {
      setDraftSaveState({ state: 'error', message: 'Sign in again before saving this draft.' });
      return false;
    }
    draftMutationEpoch.current += 1;
    setDraftSaveState({ state: 'saving' });
    const savedAt = new Date().toISOString();
    const next = saveCustomerIntakeDraftLocally(draft, savedAt);
    const result = await saveCustomerIntakeDraft(safeActorId, next, savedAt);
    if (!mounted.current) return result.ok;
    if (result.ok) {
      const stillCurrent = draftRef.current.draftId === draft.draftId
        && draftRef.current.revision === draft.revision;
      if (stillCurrent) updateDraft(next);
      setDraftSaveState(stillCurrent ? { state: 'saved', savedAt } : { state: 'idle' });
      return true;
    }
    setDraftSaveState({
      state: 'error',
      message: result.reasonCode === 'draft_too_large'
        ? 'This draft is too large for protected on-device storage. Remove media and try again.'
        : 'This device could not protect the draft. It has not been marked as saved.',
    });
    return false;
  }, [draft, persistenceAllowed, safeActorId, updateDraft]);

  const resetDraft = useCallback(() => {
    draftMutationEpoch.current += 1;
    updateDraft(newDraft(safeActorId, connectionState));
    setDraftSaveState({ state: 'idle' });
  }, [connectionState, safeActorId, updateDraft]);

  const selectedService = useMemo(() => {
    if (catalogue.state !== 'ready' || !draft.selectedService) return null;
    return catalogue.services.find((service) => (
      service.id === draft.selectedService?.serviceId
      && service.version === draft.selectedService?.serviceVersion
    )) ?? null;
  }, [catalogue, draft.selectedService]);

  const value = useMemo<CustomerExperienceValue>(() => Object.freeze({
    actorId: safeActorId,
    connectionState,
    catalogue,
    draft,
    selectedService,
    draftSaveState,
    refreshCatalogue,
    reviseDraft,
    commitAddressPin,
    selectService,
    saveDraft,
    resetDraft,
  }), [
    safeActorId,
    connectionState,
    catalogue,
    draft,
    selectedService,
    draftSaveState,
    refreshCatalogue,
    reviseDraft,
    commitAddressPin,
    selectService,
    saveDraft,
    resetDraft,
  ]);

  return <CustomerExperienceContext.Provider value={value}>{children}</CustomerExperienceContext.Provider>;
}

export function useCustomerExperience(): CustomerExperienceValue {
  const value = useContext(CustomerExperienceContext);
  if (!value) throw new Error('useCustomerExperience must be used inside CustomerExperienceProvider');
  return value;
}
