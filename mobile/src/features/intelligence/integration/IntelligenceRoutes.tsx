import { useNetInfo } from '@react-native-community/netinfo';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import type { AssistedIntakeResponseV1 } from '../../../data/grounded/intelligence';
import {
  ASSISTED_PROCESSING_CONSENT_POLICY_VERSION,
  extractGroundedIntent,
  isGroundedIntelligenceError,
  loadIntelligenceCapability,
  loadProjectLiveStatus,
  loadRecommendationExplanation,
} from '../../../services/groundedIntelligence';
import type {
  IntelligenceCapabilityName,
  IntelligenceCapabilityState,
} from '../../../services/groundedIntelligence';
import { useCustomerExperience } from '../../customer/integration/CustomerExperienceContext';
import {
  AssistedIntakeScreen,
  confirmedAssistanceToNeedText,
  ProjectLiveStatusScreen,
  RecommendationExplanationScreen,
  reviewAssistedField,
} from '..';
import type {
  AssistFieldId,
  LiveStatusResource,
  RecommendationResource,
} from '..';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROTECTED_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;

export const GROUNDED_INTELLIGENCE_ROUTE_NAMES = Object.freeze({
  assistedIntake: 'AssistedIntake',
  recommendationExplanation: 'RecommendationExplanation',
  projectLiveStatus: 'ProjectLiveStatus',
} as const);

function routeText(route: any, name: string, max: number): string | null {
  const value = route.params?.[name];
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  return candidate.length > 0 && candidate.length <= max && !candidate.includes('\u0000') ? candidate : null;
}

function routeUuid(route: any, name: string): string | null {
  const value = routeText(route, name, 160);
  return value && UUID.test(value) ? value.toLowerCase() : null;
}

function routeProtectedRef(route: any, name: string): string | null {
  const value = routeText(route, name, 160);
  return value && PROTECTED_REF.test(value) ? value : null;
}

function routeProtectedRefs(route: any, name: string, max: number): readonly string[] {
  const raw = route.params?.[name];
  if (!Array.isArray(raw) || raw.length > max) return Object.freeze([]);
  const refs = raw.flatMap((value) => typeof value === 'string' && PROTECTED_REF.test(value) ? [value] : []);
  return refs.length === raw.length && new Set(refs).size === refs.length ? Object.freeze(refs) : Object.freeze([]);
}

function online(network: ReturnType<typeof useNetInfo>): boolean {
  return network.isConnected === true && network.isInternetReachable !== false;
}

function useIntelligenceCapability(name: IntelligenceCapabilityName): IntelligenceCapabilityState | null {
  const [capability, setCapability] = useState<IntelligenceCapabilityState | null>(null);
  useFocusEffect(useCallback(() => {
    let active = true;
    setCapability(null);
    void loadIntelligenceCapability(name, { forceRefresh: true }).then((next) => {
      if (active) setCapability(next);
    });
    return () => { active = false; };
  }, [name]));
  return capability;
}

function problem(error: unknown, fallback: string): Readonly<{ message: string; correlationId: string | null }> {
  if (isGroundedIntelligenceError(error)) {
    return Object.freeze({
      message: error.problem.detail,
      correlationId: error.problem.correlationId,
    });
  }
  return Object.freeze({ message: fallback, correlationId: null });
}

export function CustomerAssistedIntakeRoute({ navigation, route }: { navigation: any; route: any }) {
  const capability = useIntelligenceCapability('ai_assisted_intake');
  const network = useNetInfo();
  const { draft, reviseDraft } = useCustomerExperience();
  const initialText = routeText(route, 'initialText', 4_000) ?? draft.needText;
  const voiceAssetId = routeProtectedRef(route, 'voiceAssetId');
  const photoAssetIds = useMemo(() => routeProtectedRefs(route, 'photoAssetIds', 4), [route.params?.photoAssetIds]);
  const [typedText, setTypedText] = useState(initialText);
  const [processingConsent, setProcessingConsent] = useState(false);
  const [result, setResult] = useState<AssistedIntakeResponseV1 | null>(null);
  const [fieldDrafts, setFieldDrafts] = useState<Partial<Record<AssistFieldId, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const connectionState = online(network) ? 'online' as const : 'offline' as const;

  const useManualBrief = () => {
    const manualText = typedText.trim();
    if (manualText) reviseDraft({ needText: manualText.slice(0, 4_000) });
    navigation.navigate('ServiceSelect');
  };

  const extract = async () => {
    if (!capability?.available || connectionState === 'offline' || submitting) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const extracted = await extractGroundedIntent({
        typedText,
        voiceAssetId,
        photoAssetIds,
        processingConsent,
        consentPolicyVersion: ASSISTED_PROCESSING_CONSENT_POLICY_VERSION,
      });
      setResult(extracted);
      setFieldDrafts(Object.fromEntries(extracted.assistance.fields.map((field) => [field.fieldId, field.value])));
      // Consent is purpose-specific and is not retained as a reusable toggle.
      setProcessingConsent(false);
    } catch (error) {
      setErrorMessage(problem(error, 'Assisted processing failed. Use the normal job brief or try again.').message);
    } finally {
      setSubmitting(false);
    }
  };

  const confirmField = (fieldId: AssistFieldId) => {
    if (!result) return;
    const value = fieldDrafts[fieldId] ?? result.assistance.fields.find((field) => field.fieldId === fieldId)?.value ?? '';
    try {
      const assistance = reviewAssistedField(result.assistance, fieldId, value);
      setResult(Object.freeze({ ...result, assistance }));
      setErrorMessage(null);
    } catch {
      setErrorMessage('Enter a clear value before confirming this field.');
    }
  };

  const useReviewedDetails = () => {
    if (!result) return;
    const needText = confirmedAssistanceToNeedText(result.assistance);
    if (!needText) {
      setErrorMessage('Review and confirm every assisted field before continuing.');
      return;
    }
    reviseDraft({ needText });
    navigation.navigate('ServiceSelect');
  };

  return (
    <AssistedIntakeScreen
      capability={capability}
      connectionState={connectionState}
      consentPolicyVersion={ASSISTED_PROCESSING_CONSENT_POLICY_VERSION}
      errorMessage={errorMessage}
      fieldDrafts={fieldDrafts}
      onBack={() => navigation.goBack()}
      onConfirmField={confirmField}
      onExtract={() => { void extract(); }}
      onFieldDraftChange={(fieldId, value) => {
        setFieldDrafts((current) => ({ ...current, [fieldId]: value }));
        if (result?.assistance.fields.find((field) => field.fieldId === fieldId)?.status === 'confirmed') {
          // An edit after confirmation must be explicitly re-confirmed.
          const fields = result.assistance.fields.map((field) => field.fieldId === fieldId
            ? Object.freeze({ ...field, status: 'needs_review' as const })
            : field);
          setResult(Object.freeze({
            ...result,
            assistance: Object.freeze({
              ...result.assistance,
              fields: Object.freeze(fields),
              readyForDeterministicBrief: false,
            }),
          }));
        }
      }}
      onProcessingConsentChange={setProcessingConsent}
      onTypedTextChange={setTypedText}
      onUseManualBrief={useManualBrief}
      onUseReviewedDetails={useReviewedDetails}
      photoAssetCount={photoAssetIds.length}
      processingConsent={processingConsent}
      result={result}
      submitting={submitting}
      typedText={typedText}
      voiceAssetAttached={voiceAssetId !== null}
    />
  );
}

export function CustomerRecommendationExplanationRoute({ navigation, route }: { navigation: any; route: any }) {
  const capability = useIntelligenceCapability('explainable_recommendations');
  const network = useNetInfo();
  const quoteRequestId = routeUuid(route, 'quoteRequestId');
  const workerId = routeUuid(route, 'workerId');
  const [resource, setResource] = useState<RecommendationResource>({ status: 'loading' });

  const refresh = useCallback(async () => {
    if (!capability?.available) return;
    if (!quoteRequestId || !workerId) {
      setResource({ status: 'error', message: 'The quote request or Worker reference is invalid.', correlationId: null });
      return;
    }
    if (!online(network)) {
      setResource({ status: 'error', message: 'Reconnect to verify the latest factual recommendation reasons.', correlationId: null });
      return;
    }
    setResource({ status: 'loading' });
    try {
      const value = await loadRecommendationExplanation(quoteRequestId, workerId);
      setResource({ status: 'ready', value });
    } catch (error) {
      const detail = problem(error, 'The recommendation explanation could not be verified.');
      setResource({ status: 'error', message: detail.message, correlationId: detail.correlationId });
    }
  }, [capability?.available, network.isConnected, network.isInternetReachable, quoteRequestId, workerId]);

  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));

  return (
    <RecommendationExplanationScreen
      capability={capability}
      onBack={() => navigation.goBack()}
      onCompareWorkers={() => navigation.goBack()}
      onRetry={() => { void refresh(); }}
      resource={resource}
    />
  );
}

export function ProjectLiveStatusRoute({ navigation, route }: { navigation: any; route: any }) {
  const capability = useIntelligenceCapability('android_live_updates');
  const network = useNetInfo();
  const role = useSelector((state: any) => state.auth.user?.role);
  const projectId = routeUuid(route, 'projectId');
  const [resource, setResource] = useState<LiveStatusResource>({ status: 'loading' });

  const refresh = useCallback(async () => {
    if (!capability?.available) return;
    if (!projectId) {
      setResource({ status: 'error', message: 'The Project reference is invalid.', correlationId: null });
      return;
    }
    if (!online(network)) {
      setResource({ status: 'error', message: 'Reconnect to verify current Project live status.', correlationId: null });
      return;
    }
    setResource({ status: 'loading' });
    try {
      const value = await loadProjectLiveStatus(projectId);
      setResource({ status: 'ready', value });
    } catch (error) {
      const detail = problem(error, 'Live status could not be verified. Open the Project instead.');
      setResource({ status: 'error', message: detail.message, correlationId: detail.correlationId });
    }
  }, [capability?.available, network.isConnected, network.isInternetReachable, projectId]);

  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));

  const openProject = () => {
    if (!projectId) {
      navigation.goBack();
      return;
    }
    navigation.navigate(role === 'labourer' || role === 'worker' ? 'WorkerJobDetail' : 'ProjectHub', { projectId });
  };

  return (
    <ProjectLiveStatusScreen
      capability={capability}
      onBack={() => navigation.goBack()}
      onOpenProject={openProject}
      onRetry={() => { void refresh(); }}
      resource={resource}
    />
  );
}
