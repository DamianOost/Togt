import type { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
import api from './api';
import {
  capabilityEnabled,
  getEffectiveCapabilities,
} from './capabilityService';
import {
  adaptAssistedIntakeResponseV1,
  adaptProjectLiveStatusV1,
  adaptRecommendationExplanationV1,
} from '../data/grounded/intelligence';
import type {
  AssistedIntakeResponseV1,
  ProjectLiveStatusV1,
  RecommendationExplanationV1,
} from '../data/grounded/intelligence';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const CONTROLLED_TOKEN = /^[a-z][a-z0-9_.:-]{0,95}$/;
const UNSAFE_ASSISTED_TEXT = /ignore\s+(?:all\s+)?(?:previous|prior|system|developer)\s+(?:instructions?|messages?)|(?:system|developer)\s*(?:prompt|message)\s*:|(?:\+27|0)\s*[1-8][\d\s()-]{8,13}\b|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b\d{13}\b|-?\d{1,2}\.\d{4,}\s*[,/]\s*-?\d{1,3}\.\d{4,}|\b(?:gas\s+leak|active\s+fire|sparking\s+wires?|electric\s+shock|structural\s+collapse|weapon|explosive|bomb)\b/i;

type JsonRecord = Record<string, unknown>;

export const ASSISTED_PROCESSING_CONSENT_POLICY_VERSION = 'ai-processing-v1' as const;

export type IntelligenceCapabilityName =
  | 'ai_assisted_intake'
  | 'explainable_recommendations'
  | 'android_live_updates'
  | 'contextual_safety_education';

export type IntelligenceCapabilityState = Readonly<{
  available: boolean;
  reasonCode: string;
}>;

export type GroundedIntelligenceProblem = Readonly<{
  status: number | null;
  type: string;
  title: string;
  detail: string;
  correlationId: string | null;
  retryable: boolean;
  deterministicFallbackAvailable: boolean;
}>;

export class GroundedIntelligenceError extends Error {
  readonly problem: GroundedIntelligenceProblem;

  constructor(problem: GroundedIntelligenceProblem) {
    super(problem.title);
    this.name = 'GroundedIntelligenceError';
    this.problem = problem;
  }
}

export type GroundedAssistedCaptureRequest = Readonly<{
  typedText: string;
  voiceAssetId: string | null;
  photoAssetIds: readonly string[];
  processingConsent: boolean;
  consentPolicyVersion?: string;
}>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function controlledToken(value: unknown, fallback: string): string {
  return typeof value === 'string' && CONTROLLED_TOKEN.test(value) ? value : fallback;
}

function displayText(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const candidate = value.trim();
  return candidate.length > 0 && candidate.length <= 1_000 && !candidate.includes('\u0000') ? candidate : fallback;
}

function requestId(headers: unknown): string | null {
  if (!isRecord(headers)) return null;
  const value = headers['x-request-id'] ?? headers['x-correlation-id'];
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value) ? value : null;
}

function normaliseError(error: unknown): GroundedIntelligenceError {
  if (error instanceof GroundedIntelligenceError) return error;
  const axiosError = error as AxiosError<unknown>;
  const status = typeof axiosError?.response?.status === 'number' ? axiosError.response.status : null;
  const body = isRecord(axiosError?.response?.data) ? axiosError.response.data : {};
  const extensions = isRecord(body.extensions) ? body.extensions : {};
  const type = controlledToken(body.type ?? body.error, status === null ? 'network_unavailable' : 'request_failed');
  const retryable = status === null || status === 408 || status === 425 || status === 429 || (status !== null && status >= 500);
  return new GroundedIntelligenceError(Object.freeze({
    status,
    type,
    title: displayText(body.title, status === null ? 'Connection unavailable' : 'Assisted feature unavailable'),
    detail: displayText(body.detail, retryable
      ? 'Use the normal Project flow or try again after reconnecting.'
      : 'Use the normal Project flow while this capability is unavailable.'),
    correlationId: requestId(axiosError?.response?.headers),
    retryable,
    deterministicFallbackAvailable: extensions.deterministicFallbackAvailable === true
      || extensions.manualComparisonAvailable === true
      || extensions.projectScreenFallbackAvailable === true,
  }));
}

function unavailableProblem(name: IntelligenceCapabilityName, reasonCode: string): GroundedIntelligenceError {
  const detail = name === 'ai_assisted_intake'
    ? 'Use the normal job brief. No description or media was sent for assisted processing.'
    : name === 'explainable_recommendations'
      ? 'Compare Workers using the server-authored profiles and quotes.'
      : name === 'android_live_updates'
        ? 'Open the Project for current status. Lock-screen live status and background tracking are not active.'
        : 'Continue with the normal Project or Job guidance while contextual education is unavailable.';
  return new GroundedIntelligenceError(Object.freeze({
    status: null,
    type: 'capability_unavailable',
    title: 'Capability unavailable',
    detail,
    correlationId: null,
    retryable: false,
    deterministicFallbackAvailable: true,
  }));
}

export function evaluateIntelligenceCapability(
  capabilities: unknown,
  name: IntelligenceCapabilityName,
): IntelligenceCapabilityState {
  if (!isRecord(capabilities) || capabilities.valid !== true || !isRecord(capabilities.features)) {
    return Object.freeze({ available: false, reasonCode: 'capability_data_unavailable' });
  }
  const feature = isRecord(capabilities.features[name]) ? capabilities.features[name] : null;
  if (capabilityEnabled(capabilities, name) && feature?.available === true) {
    return Object.freeze({ available: true, reasonCode: 'available' });
  }
  return Object.freeze({
    available: false,
    reasonCode: controlledToken(feature?.reason_code, 'capability_unavailable'),
  });
}

export async function loadIntelligenceCapability(
  name: IntelligenceCapabilityName,
  options: Readonly<{ forceRefresh?: boolean }> = {},
): Promise<IntelligenceCapabilityState> {
  try {
    const capabilities = await getEffectiveCapabilities({ forceRefresh: options.forceRefresh === true });
    return evaluateIntelligenceCapability(capabilities, name);
  } catch {
    return Object.freeze({ available: false, reasonCode: 'capability_data_unavailable' });
  }
}

async function requireCapability(name: IntelligenceCapabilityName): Promise<void> {
  const capability = await loadIntelligenceCapability(name);
  if (!capability.available) throw unavailableProblem(name, capability.reasonCode);
}

function uuid(value: string, label: string): string {
  if (!UUID.test(value)) throw new TypeError(`${label} must be a UUID`);
  return value.toLowerCase();
}

function stableId(value: string, label: string): string {
  const candidate = value.trim();
  if (!candidate || candidate.length > 160 || !STABLE_ID.test(candidate)) {
    throw new TypeError(`${label} must be a protected stable reference`);
  }
  return candidate;
}

async function request(config: AxiosRequestConfig): Promise<AxiosResponse<unknown>> {
  try {
    return await api.request<unknown>(config);
  } catch (error) {
    throw normaliseError(error);
  }
}

function contractError(type: string, detail: string): GroundedIntelligenceError {
  return new GroundedIntelligenceError(Object.freeze({
    status: null,
    type,
    title: 'Response could not be verified',
    detail,
    correlationId: null,
    retryable: true,
    deterministicFallbackAvailable: true,
  }));
}

export async function extractGroundedIntent(
  input: GroundedAssistedCaptureRequest,
): Promise<AssistedIntakeResponseV1> {
  // Capability is checked before inspecting or serialising customer input. A
  // disabled build therefore sends no text or protected media references.
  await requireCapability('ai_assisted_intake');
  if (input.processingConsent !== true) {
    throw contractError('processing_consent_required', 'Explicit assisted-processing consent is required.');
  }
  const typedText = input.typedText.trim();
  if (typedText.length > 4_000) throw new TypeError('typedText cannot exceed 4,000 characters');
  if (typedText && UNSAFE_ASSISTED_TEXT.test(typedText)) {
    throw contractError(
      'assisted_input_requires_manual_path',
      'Remove contact, identity, exact-location or instruction-like content, or use the normal safety-aware job brief.',
    );
  }
  const voiceAssetId = input.voiceAssetId === null ? null : stableId(input.voiceAssetId, 'voiceAssetId');
  if (!Array.isArray(input.photoAssetIds) || input.photoAssetIds.length > 4) {
    throw new TypeError('photoAssetIds must contain at most four protected references');
  }
  const photoAssetIds = input.photoAssetIds.map((assetId) => stableId(assetId, 'photoAssetId'));
  if (new Set(photoAssetIds).size !== photoAssetIds.length) throw new TypeError('photoAssetIds cannot contain duplicates');
  if (!typedText && !voiceAssetId && photoAssetIds.length === 0) throw new TypeError('At least one assisted input is required');
  const consentPolicyVersion = stableId(
    input.consentPolicyVersion ?? ASSISTED_PROCESSING_CONSENT_POLICY_VERSION,
    'consentPolicyVersion',
  );
  const response = await request({
    method: 'POST',
    url: '/api/intent/extract',
    data: {
      schemaVersion: 1,
      typedText: typedText || null,
      voiceAssetId,
      photoAssetIds,
      processingConsent: true,
      consentPolicyVersion,
    },
  });
  const adapted = adaptAssistedIntakeResponseV1(response.data);
  if (!adapted.ok || adapted.value.processing.consentPolicyVersion !== consentPolicyVersion) {
    throw contractError('assisted_intake_contract_invalid', 'Use the normal job brief while this response is unavailable.');
  }
  return adapted.value;
}

export async function loadRecommendationExplanation(
  quoteRequestId: string,
  workerId: string,
): Promise<RecommendationExplanationV1> {
  await requireCapability('explainable_recommendations');
  const requestId = uuid(quoteRequestId, 'quoteRequestId');
  const expectedWorkerId = uuid(workerId, 'workerId');
  const response = await request({
    method: 'GET',
    url: `/api/recommendations/quote-requests/${requestId}/workers/${expectedWorkerId}/explanation`,
  });
  const adapted = adaptRecommendationExplanationV1(response.data, expectedWorkerId);
  if (!adapted.ok) {
    throw contractError('recommendation_contract_invalid', 'Compare Workers manually while this explanation is unavailable.');
  }
  return adapted.value;
}

function responseHeader(response: AxiosResponse<unknown>, name: string): string | null {
  const value = response.headers?.[name] ?? response.headers?.[name.toLowerCase()];
  return typeof value === 'string' ? value : null;
}

export async function loadProjectLiveStatus(projectId: string): Promise<ProjectLiveStatusV1> {
  await requireCapability('android_live_updates');
  const expectedProjectId = uuid(projectId, 'projectId');
  const response = await request({
    method: 'GET',
    url: `/api/projects/${expectedProjectId}/live-status`,
  });
  const adapted = adaptProjectLiveStatusV1(response.data, expectedProjectId);
  if (!adapted.ok) {
    throw contractError('live_status_contract_invalid', 'Open the Project for its current authoritative state.');
  }
  const etag = responseHeader(response, 'etag');
  if (etag !== `\"${adapted.value.revision}\"`) {
    throw contractError('live_status_revision_unverified', 'Open the Project because its live-status revision could not be verified.');
  }
  return adapted.value;
}

export function isGroundedIntelligenceError(error: unknown): error is GroundedIntelligenceError {
  return error instanceof GroundedIntelligenceError;
}
