import type { AxiosError, AxiosRequestConfig } from 'axios';
import api from './api';
import { adaptCatalogueServiceV1 } from '../data/grounded';
import type { GroundedCatalogueService } from '../data/grounded';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JsonRecord = Record<string, unknown>;

export type GroundedApiProblem = Readonly<{
  status: number | null;
  type: string;
  title: string;
  detail: string;
  correlationId: string | null;
  retryable: boolean;
}>;

export class GroundedMarketplaceError extends Error {
  readonly problem: GroundedApiProblem;

  constructor(problem: GroundedApiProblem) {
    super(problem.title);
    this.name = 'GroundedMarketplaceError';
    this.problem = problem;
  }
}

export type QuoteRequestCreateInput = Readonly<{
  serviceId: string;
  serviceVersion: number;
  brief: Readonly<{
    answers: Readonly<Record<string, unknown>>;
    materialsResponsibility: 'customer' | 'worker' | 'discuss';
    media: readonly Readonly<{ id: string; kind: 'image' }>[];
    summary?: string;
  }>;
  broadAreaLabel: string;
  privateLocation: Readonly<{
    address: string;
    latitude: number;
    longitude: number;
    accessInstructions?: string;
  }>;
  schedule: Readonly<{
    startsAt: string;
    endsAt?: string;
    timezone: 'Africa/Johannesburg';
    flexibility?: string;
  }>;
  questionsDeadlineAt?: string;
  quotesCloseAt: string;
}>;

export type QuoteMutationInput = Readonly<{
  scope: string;
  deliverables: readonly string[];
  exclusions: readonly string[];
  assumptions: readonly string[];
  proposedStartAt: string;
  proposedEndAt: string;
  durationMinutes: number;
  labourAmount: string;
  materialsAmount: string;
  validUntil: string;
}>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function controlledToken(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^[a-z][a-z0-9_.:-]{0,95}$/.test(value) ? value : fallback;
}

function displayText(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const candidate = value.trim();
  return candidate.length > 0 && candidate.length <= 500 ? candidate : fallback;
}

function requestId(headers: unknown): string | null {
  if (!isRecord(headers)) return null;
  const value = headers['x-request-id'] ?? headers['x-correlation-id'];
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value) ? value : null;
}

function normaliseError(error: unknown): GroundedMarketplaceError {
  const axiosError = error as AxiosError<unknown>;
  const status = typeof axiosError?.response?.status === 'number' ? axiosError.response.status : null;
  const body = isRecord(axiosError?.response?.data) ? axiosError.response.data : {};
  const type = controlledToken(body.type ?? body.error, status === null ? 'network_unavailable' : 'request_failed');
  const retryable = status === null || status === 408 || status === 425 || status === 429 || (status !== null && status >= 500);
  return new GroundedMarketplaceError(Object.freeze({
    status,
    type,
    title: displayText(body.title, status === null ? 'Connection unavailable' : 'Request could not be completed'),
    detail: displayText(body.detail, retryable
      ? 'Check your connection and try again.'
      : 'Refresh the latest Project state before trying again.'),
    correlationId: requestId(axiosError?.response?.headers),
    retryable,
  }));
}

function resourceId(value: string, label: string): string {
  if (!UUID.test(value)) throw new TypeError(`${label} must be a UUID`);
  return value.toLowerCase();
}

function idempotencyKey(value: string): string {
  const candidate = value.trim();
  if (candidate.length < 8 || candidate.length > 255 || !/^[A-Za-z0-9][A-Za-z0-9._:-]+$/.test(candidate)) {
    throw new TypeError('Idempotency key must be an opaque 8-255 character token');
  }
  return candidate;
}

async function request<T>(config: AxiosRequestConfig): Promise<T> {
  try {
    const response = await api.request<T>(config);
    return response.data;
  } catch (error) {
    throw normaliseError(error);
  }
}

function mutationConfig(key: string): AxiosRequestConfig {
  return { headers: { 'Idempotency-Key': idempotencyKey(key) } };
}

export async function loadGroundedCatalogue(filters: Readonly<{
  category?: string;
  pricingMode?: string;
}> = {}): Promise<readonly GroundedCatalogueService[]> {
  const response = await request<unknown>({
    method: 'GET',
    url: '/api/catalogue/services',
    params: filters,
  });
  if (!isRecord(response) || !Array.isArray(response.services)) {
    throw new GroundedMarketplaceError(Object.freeze({
      status: null,
      type: 'catalogue_contract_invalid',
      title: 'Services could not be verified',
      detail: 'The service catalogue response did not match this app version.',
      correlationId: null,
      retryable: true,
    }));
  }
  const services: GroundedCatalogueService[] = [];
  for (const raw of response.services) {
    const adapted = adaptCatalogueServiceV1(raw);
    if (!adapted.ok) {
      throw new GroundedMarketplaceError(Object.freeze({
        status: null,
        type: 'catalogue_contract_invalid',
        title: 'Services could not be verified',
        detail: 'A published service did not match the supported catalogue contract.',
        correlationId: null,
        retryable: true,
      }));
    }
    services.push(adapted.value);
  }
  return Object.freeze(services);
}

export async function loadGroundedProjects(segment?: 'active' | 'upcoming' | 'past'): Promise<unknown> {
  return request({ method: 'GET', url: '/api/projects', params: segment ? { segment } : undefined });
}

export async function loadGroundedProject(projectId: string): Promise<unknown> {
  return request({ method: 'GET', url: `/api/projects/${resourceId(projectId, 'projectId')}` });
}

export async function loadGroundedFulfilment(projectId: string): Promise<unknown> {
  return request({ method: 'GET', url: `/api/projects/${resourceId(projectId, 'projectId')}/fulfilment` });
}

export type GroundedFulfilmentCommand =
  | 'start_route'
  | 'mark_arrived'
  | 'propose_scope'
  | 'decide_scope'
  | 'reveal_start_pin'
  | 'start_work'
  | 'propose_reschedule'
  | 'accept_reschedule'
  | 'decline_reschedule'
  | 'propose_change_order'
  | 'approve_change_order'
  | 'decline_change_order'
  | 'report_no_show'
  | 'request_replacement';

export async function runGroundedFulfilmentCommand(input: Readonly<{
  projectId: string;
  revision: number;
  command: GroundedFulfilmentCommand;
  targetId?: string;
  data?: Readonly<Record<string, unknown>>;
  idempotencyKey: string;
}>): Promise<unknown> {
  if (!Number.isSafeInteger(input.revision) || input.revision < 0) {
    throw new TypeError('revision must be a non-negative integer');
  }
  const projectId = resourceId(input.projectId, 'projectId');
  const targetId = input.targetId === undefined ? null : resourceId(input.targetId, 'targetId');
  const paths: Record<Exclude<GroundedFulfilmentCommand,
    'accept_reschedule' | 'decline_reschedule' | 'approve_change_order' | 'decline_change_order'>, string> = {
    start_route: 'en-route',
    mark_arrived: 'arrivals',
    propose_scope: 'scope-proposals',
    decide_scope: 'scope-confirmations',
    reveal_start_pin: 'start-pin-reveals',
    start_work: 'start',
    propose_reschedule: 'reschedule-proposals',
    propose_change_order: 'change-orders',
    report_no_show: 'no-show-reports',
    request_replacement: 'replacement-requests',
  };
  let suffix: string;
  if (input.command === 'accept_reschedule' || input.command === 'decline_reschedule') {
    if (!targetId) throw new TypeError('targetId is required for a reschedule decision');
    suffix = `reschedule-proposals/${targetId}/${input.command === 'accept_reschedule' ? 'accept' : 'decline'}`;
  } else if (input.command === 'approve_change_order' || input.command === 'decline_change_order') {
    if (!targetId) throw new TypeError('targetId is required for a change-order decision');
    suffix = `change-orders/${targetId}/${input.command === 'approve_change_order' ? 'approve' : 'decline'}`;
  } else {
    suffix = paths[input.command];
  }
  return request({
    method: 'POST',
    url: `/api/projects/${projectId}/${suffix}`,
    data: input.data ?? {},
    headers: {
      'Idempotency-Key': idempotencyKey(input.idempotencyKey),
      'If-Match': `\"${input.revision}\"`,
    },
  });
}

export async function createGroundedQuoteRequest(
  input: QuoteRequestCreateInput,
  key: string,
): Promise<unknown> {
  resourceId(input.serviceId, 'serviceId');
  return request({
    method: 'POST',
    url: '/api/quote-requests',
    data: input,
    ...mutationConfig(key),
  });
}

export async function loadGroundedQuoteRequests(status?: string): Promise<unknown> {
  return request({ method: 'GET', url: '/api/quote-requests', params: status ? { status } : undefined });
}

export async function loadGroundedQuoteRequest(requestIdValue: string): Promise<unknown> {
  const requestIdValueSafe = resourceId(requestIdValue, 'quoteRequestId');
  return request({ method: 'GET', url: `/api/quote-requests/${requestIdValueSafe}` });
}

export async function loadGroundedQuotes(requestIdValue: string): Promise<unknown> {
  const requestIdValueSafe = resourceId(requestIdValue, 'quoteRequestId');
  return request({ method: 'GET', url: `/api/quote-requests/${requestIdValueSafe}/quotes` });
}

export async function loadGroundedQuote(quoteIdValue: string): Promise<unknown> {
  const quoteIdValueSafe = resourceId(quoteIdValue, 'quoteId');
  return request({ method: 'GET', url: `/api/quotes/${quoteIdValueSafe}` });
}

export async function createGroundedQuote(
  requestIdValue: string,
  quote: Partial<QuoteMutationInput>,
  submit: boolean,
  key: string,
): Promise<unknown> {
  const requestIdValueSafe = resourceId(requestIdValue, 'quoteRequestId');
  return request({
    method: 'POST',
    url: `/api/quote-requests/${requestIdValueSafe}/quotes`,
    data: { quote, submit },
    ...mutationConfig(key),
  });
}

export async function cancelGroundedQuoteRequest(requestIdValue: string, key: string): Promise<unknown> {
  const requestIdValueSafe = resourceId(requestIdValue, 'quoteRequestId');
  return request({
    method: 'POST',
    url: `/api/quote-requests/${requestIdValueSafe}/cancel`,
    data: {},
    ...mutationConfig(key),
  });
}

export async function saveGroundedQuote(
  quoteIdValue: string,
  quote: Partial<QuoteMutationInput>,
  submit: boolean,
  key: string,
): Promise<unknown> {
  const quoteIdValueSafe = resourceId(quoteIdValue, 'quoteId');
  return request({
    method: 'PUT',
    url: `/api/quotes/${quoteIdValueSafe}`,
    data: { quote, submit },
    ...mutationConfig(key),
  });
}

export async function runGroundedQuoteCommand(
  quoteIdValue: string,
  command: 'submit' | 'withdraw' | 'decline' | 'accept',
  key: string,
): Promise<unknown> {
  const quoteIdValueSafe = resourceId(quoteIdValue, 'quoteId');
  return request({
    method: 'POST',
    url: `/api/quotes/${quoteIdValueSafe}/${command}`,
    data: {},
    ...mutationConfig(key),
  });
}

export async function runGroundedCompletionCommand(input: Readonly<{
  projectId: string;
  revision: number;
  command: 'request' | 'confirm' | 'dispute';
  reason?: string;
  idempotencyKey: string;
}>): Promise<unknown> {
  if (!Number.isSafeInteger(input.revision) || input.revision < 0) throw new TypeError('revision must be a non-negative integer');
  const suffix = input.command === 'request'
    ? 'completion-requests'
    : input.command === 'confirm'
      ? 'completion-confirmations'
      : 'disputes';
  return request({
    method: 'POST',
    url: `/api/projects/${resourceId(input.projectId, 'projectId')}/${suffix}`,
    data: input.command === 'dispute' ? { reason: input.reason } : {},
    headers: {
      'Idempotency-Key': idempotencyKey(input.idempotencyKey),
      'If-Match': `\"${input.revision}\"`,
    },
  });
}

export type GroundedRatingSnapshot = Readonly<{
  projectReference: string;
  state: 'not_open' | 'open' | 'sealed' | 'published' | 'window_closed';
  selectedValue: 1 | 2 | 3 | 4 | 5 | null;
  reasonLabels: readonly string[];
  publicationLabel: string;
  publishAfter: string | null;
  submittedAt: string | null;
}>;

function ratingContractError(detail: string): never {
  throw new GroundedMarketplaceError(Object.freeze({
    status: null,
    type: 'rating_contract_invalid',
    title: 'Rating state could not be verified',
    detail,
    correlationId: null,
    retryable: true,
  }));
}

function ratingTimestamp(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length > 64 || !Number.isFinite(Date.parse(value))) {
    return ratingContractError(`${label} was invalid.`);
  }
  return new Date(value).toISOString();
}

function adaptGroundedRating(response: unknown, expectedProjectId: string): GroundedRatingSnapshot {
  if (!isRecord(response) || response.schema !== 'togt.rating.v1' || !isRecord(response.rating)) {
    return ratingContractError('The rating response did not match this app version.');
  }
  const raw = response.rating;
  if (raw.schema !== 'togt.rating.v1' || raw.projectReference !== expectedProjectId) {
    return ratingContractError('The rating Project identity did not match the request.');
  }
  const states = ['not_open', 'open', 'sealed', 'published', 'window_closed'] as const;
  const state = typeof raw.state === 'string' && states.includes(raw.state as typeof states[number])
    ? raw.state as typeof states[number]
    : ratingContractError('The rating state was outside the supported lifecycle.');
  const selectedValue = raw.selectedValue === null
    ? null
    : Number.isSafeInteger(raw.selectedValue) && Number(raw.selectedValue) >= 1 && Number(raw.selectedValue) <= 5
      ? Number(raw.selectedValue) as 1 | 2 | 3 | 4 | 5
      : ratingContractError('The selected rating was invalid.');
  if (!Array.isArray(raw.reasonLabels) || raw.reasonLabels.some((label) => (
    typeof label !== 'string' || label.trim().length < 1 || label.trim().length > 120
  ))) {
    return ratingContractError('Rating reason labels were invalid.');
  }
  const publishAfter = ratingTimestamp(raw.publishAfter, 'Rating publication deadline');
  const submittedAt = ratingTimestamp(raw.submittedAt, 'Rating submission time');
  const submitted = state === 'sealed' || state === 'published';
  if (submitted !== (selectedValue !== null && submittedAt !== null && publishAfter !== null)) {
    return ratingContractError('The rating selection and publication state were inconsistent.');
  }
  if (!submitted && selectedValue !== null) {
    return ratingContractError('An unsubmitted rating contained a selection.');
  }
  const publicationLabel = displayText(raw.publicationLabel, '');
  if (!publicationLabel) return ratingContractError('The rating publication explanation was unavailable.');
  return Object.freeze({
    projectReference: expectedProjectId,
    state,
    selectedValue,
    reasonLabels: Object.freeze(raw.reasonLabels.map((label) => label.trim())),
    publicationLabel,
    publishAfter,
    submittedAt,
  });
}

export async function loadGroundedRating(projectIdValue: string): Promise<GroundedRatingSnapshot> {
  const projectId = resourceId(projectIdValue, 'projectId');
  const response = await request<unknown>({
    method: 'GET',
    url: `/api/ratings/booking/${projectId}/mine`,
  });
  return adaptGroundedRating(response, projectId);
}

export async function submitGroundedRating(input: Readonly<{
  projectId: string;
  score: 1 | 2 | 3 | 4 | 5;
  comment?: string;
  idempotencyKey: string;
}>): Promise<GroundedRatingSnapshot> {
  const projectId = resourceId(input.projectId, 'projectId');
  if (!Number.isSafeInteger(input.score) || input.score < 1 || input.score > 5) {
    throw new TypeError('score must be an integer from 1 to 5');
  }
  const response = await request<unknown>({
    method: 'POST',
    url: '/api/ratings',
    data: {
      booking_id: projectId,
      score: input.score,
      ...(input.comment?.trim() ? { comment: input.comment.trim() } : {}),
    },
    ...mutationConfig(input.idempotencyKey),
  });
  return adaptGroundedRating(response, projectId);
}

export function isGroundedMarketplaceError(error: unknown): error is GroundedMarketplaceError {
  return error instanceof GroundedMarketplaceError;
}
