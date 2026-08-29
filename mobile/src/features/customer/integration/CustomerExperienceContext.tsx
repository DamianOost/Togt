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
  createCustomerIntakeDraft,
  reviseCustomerIntakeDraft,
  saveCustomerIntakeDraftLocally,
} from '../intake';
import type {
  CustomerIntakeDraft,
  CustomerIntakeDraftChanges,
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
  const [catalogue, setCatalogue] = useState<CatalogueResource>({ state: 'loading' });
  const [draftSaveState, setDraftSaveState] = useState<DraftSaveState>({ state: 'idle' });
  const mounted = useRef(true);

  useEffect(() => () => {
    mounted.current = false;
  }, []);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const next = state.isConnected === true && state.isInternetReachable !== false ? 'online' : 'offline';
      setConnectionState(next);
      setDraft((current) => current.connectionState === next
        ? current
        : reviseCustomerIntakeDraft(current, { connectionState: next }, new Date().toISOString()));
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    let active = true;
    setDraft(newDraft(safeActorId, connectionState));
    setDraftSaveState({ state: 'idle' });
    if (!persistenceAllowed) return () => { active = false; };
    void loadCustomerIntakeDraft(safeActorId).then((restored) => {
      if (!active || !restored) return;
      setDraft(reviseCustomerIntakeDraft(restored, { connectionState }, new Date().toISOString()));
    });
    return () => { active = false; };
  }, [safeActorId, persistenceAllowed]);

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
    setDraft((current) => reviseCustomerIntakeDraft(current, changes, new Date().toISOString()));
    setDraftSaveState({ state: 'idle' });
  }, []);

  const selectService = useCallback((serviceId: string, serviceVersion: number): boolean => {
    if (catalogue.state !== 'ready') return false;
    const selected = catalogue.services.find((service) => service.id === serviceId && service.version === serviceVersion);
    if (!selected) return false;
    setDraft((current) => reviseCustomerIntakeDraft(current, {
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
  }, [catalogue]);

  const saveDraft = useCallback(async (): Promise<boolean> => {
    if (!persistenceAllowed) {
      setDraftSaveState({ state: 'error', message: 'Sign in again before saving this draft.' });
      return false;
    }
    setDraftSaveState({ state: 'saving' });
    const savedAt = new Date().toISOString();
    const next = saveCustomerIntakeDraftLocally(draft, savedAt);
    const result = await saveCustomerIntakeDraft(safeActorId, next, savedAt);
    if (!mounted.current) return result.ok;
    if (result.ok) {
      setDraft(next);
      setDraftSaveState({ state: 'saved', savedAt });
      return true;
    }
    setDraftSaveState({
      state: 'error',
      message: result.reasonCode === 'draft_too_large'
        ? 'This draft is too large for protected on-device storage. Remove media and try again.'
        : 'This device could not protect the draft. It has not been marked as saved.',
    });
    return false;
  }, [draft, persistenceAllowed, safeActorId]);

  const resetDraft = useCallback(() => {
    setDraft(newDraft(safeActorId, connectionState));
    setDraftSaveState({ state: 'idle' });
  }, [connectionState, safeActorId]);

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
