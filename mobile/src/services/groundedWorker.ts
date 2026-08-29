import type { AxiosError, AxiosRequestConfig } from 'axios';
import api from './api';
import {
  adaptWorkerActivationV1,
  adaptWorkerServicesProfileV1,
} from '../data/grounded';
import type {
  ActivationSnapshot,
  ServicesProfileSnapshot,
} from '../features/worker/lifecycle';
import type { WorkerProfileBundle } from '../data/grounded';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STABLE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/;
const SCHEMA = 'togt.worker-profile.v1';

type JsonRecord = Record<string, unknown>;
export type GroundedWorkerConnectionState = 'online' | 'offline';

export type GroundedWorkerProblem = Readonly<{
  status: number | null;
  type: string;
  title: string;
  detail: string;
  correlationId: string | null;
  retryable: boolean;
}>;

export class GroundedWorkerError extends Error {
  readonly problem: GroundedWorkerProblem;

  constructor(problem: GroundedWorkerProblem) {
    super(problem.title);
    this.name = 'GroundedWorkerError';
    this.problem = problem;
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function controlledToken(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^[a-z][a-z0-9_.:-]{0,127}$/.test(value) ? value : fallback;
}

function displayText(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const candidate = value.trim();
  return candidate.length > 0 && candidate.length <= 2_000 ? candidate : fallback;
}

function normaliseError(error: unknown): GroundedWorkerError {
  if (error instanceof GroundedWorkerError) return error;
  const axiosError = error as AxiosError<unknown>;
  const status = typeof axiosError?.response?.status === 'number' ? axiosError.response.status : null;
  const body = isRecord(axiosError?.response?.data) ? axiosError.response.data : {};
  const headers = isRecord(axiosError?.response?.headers) ? axiosError.response.headers : {};
  const correlation = headers['x-request-id'] ?? headers['x-correlation-id'];
  const retryable = status === null || status === 408 || status === 425 || status === 429 || (status !== null && status >= 500);
  return new GroundedWorkerError(Object.freeze({
    status,
    type: controlledToken(body.type ?? body.error, status === null ? 'network_unavailable' : 'worker_request_failed'),
    title: displayText(body.title, status === null ? 'Connection unavailable' : 'Worker information could not be updated'),
    detail: displayText(body.detail, retryable
      ? 'Reconnect and refresh the latest Worker record before retrying.'
      : 'Refresh the latest Worker record before trying again.'),
    correlationId: typeof correlation === 'string' && STABLE.test(correlation) ? correlation : null,
    retryable,
  }));
}

function contractError(field: string): GroundedWorkerError {
  return new GroundedWorkerError(Object.freeze({
    status: null,
    type: 'worker_profile_contract_invalid',
    title: 'Worker information could not be verified',
    detail: `The server response did not match this app version (${field}).`,
    correlationId: null,
    retryable: true,
  }));
}

function ensureOnline(connectionState: GroundedWorkerConnectionState): void {
  if (connectionState === 'offline') {
    throw new GroundedWorkerError(Object.freeze({
      status: null,
      type: 'offline',
      title: 'Reconnect to continue',
      detail: 'No Worker profile or readiness mutation was attempted offline.',
      correlationId: null,
      retryable: true,
    }));
  }
}

function uuid(value: string, field: string): string {
  if (!UUID.test(value)) throw new TypeError(`${field} must be a UUID`);
  return value.toLowerCase();
}

function revision(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError('revision must be a positive integer');
  return value;
}

function idempotencyKey(value: string): string {
  const candidate = value.trim();
  if (candidate.length < 8 || candidate.length > 255 || !STABLE.test(candidate)) {
    throw new TypeError('Idempotency key must be an opaque 8-255 character token');
  }
  return candidate;
}

function boundedText(value: string, field: string, minimum: number, maximum: number): string {
  const candidate = value.trim();
  if (candidate.length < minimum || candidate.length > maximum || candidate.includes('\u0000')) {
    throw new TypeError(`${field} is invalid`);
  }
  return candidate;
}

function mutationHeaders(key: string, expectedRevision: number): Record<string, string> {
  return {
    'Idempotency-Key': idempotencyKey(key),
    'If-Match': `"${revision(expectedRevision)}"`,
  };
}

async function request(config: AxiosRequestConfig): Promise<unknown> {
  try {
    const response = await api.request<unknown>(config);
    return response.data;
  } catch (error) {
    throw normaliseError(error);
  }
}

function root(response: unknown, key: string): unknown {
  if (!isRecord(response) || !(key in response)) throw contractError(key);
  return response[key];
}

function requireSchema(response: unknown): JsonRecord {
  if (!isRecord(response) || response.schema !== SCHEMA) throw contractError('schema');
  return response;
}

export async function loadGroundedWorkerActivation(): Promise<ActivationSnapshot> {
  const response = requireSchema(await request({ method: 'GET', url: '/api/worker/activation' }));
  const adapted = adaptWorkerActivationV1(response.activation);
  if (!adapted.ok) throw contractError(adapted.field);
  return adapted.value;
}

export async function loadGroundedWorkerProfile(): Promise<WorkerProfileBundle> {
  const response = await request({ method: 'GET', url: '/api/worker/profile' });
  const adapted = adaptWorkerServicesProfileV1(root(response, 'servicesProfile'));
  if (!adapted.ok) throw contractError(adapted.field);
  return adapted.value;
}

export async function saveGroundedWorkerPublicProfile(input: Readonly<{
  displayName: string;
  about: string;
  revision: number;
  idempotencyKey: string;
  connectionState: GroundedWorkerConnectionState;
}>): Promise<WorkerProfileBundle> {
  ensureOnline(input.connectionState);
  await request({
    method: 'PATCH',
    url: '/api/worker/profile',
    data: {
      displayName: boundedText(input.displayName, 'displayName', 2, 80),
      about: boundedText(input.about, 'about', 20, 1_000),
    },
    headers: mutationHeaders(input.idempotencyKey, input.revision),
  });
  return loadGroundedWorkerProfile();
}

export type GroundedWorkerOfferingPatch = Readonly<{
  title?: string;
  description?: string;
  hourlyRateMinor?: number;
  minimumDurationMinutes?: number;
  callOutAmountMinor?: number;
  serviceAreaLabel?: string;
  active?: boolean;
}>;

function wholeMinor(value: number, field: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || value < minimum) throw new TypeError(`${field} must be a supported whole number`);
  return value;
}

function offeringPatch(value: GroundedWorkerOfferingPatch): JsonRecord {
  const data: JsonRecord = {};
  if (value.title !== undefined) data.title = boundedText(value.title, 'title', 2, 120);
  if (value.description !== undefined) data.description = boundedText(value.description, 'description', 20, 1_500);
  if (value.serviceAreaLabel !== undefined) data.serviceAreaLabel = boundedText(value.serviceAreaLabel, 'serviceAreaLabel', 2, 160);
  if (value.hourlyRateMinor !== undefined) data.hourlyRateMinor = wholeMinor(value.hourlyRateMinor, 'hourlyRateMinor');
  if (value.minimumDurationMinutes !== undefined) data.minimumDurationMinutes = wholeMinor(value.minimumDurationMinutes, 'minimumDurationMinutes', 1);
  if (value.callOutAmountMinor !== undefined) data.callOutAmountMinor = wholeMinor(value.callOutAmountMinor, 'callOutAmountMinor');
  if (value.active !== undefined) data.active = value.active;
  if (Object.keys(data).length === 0) throw new TypeError('offering patch cannot be empty');
  return data;
}

export async function updateGroundedWorkerOffering(input: Readonly<{
  offeringId: string;
  patch: GroundedWorkerOfferingPatch;
  revision: number;
  idempotencyKey: string;
  connectionState: GroundedWorkerConnectionState;
}>): Promise<WorkerProfileBundle> {
  ensureOnline(input.connectionState);
  await request({
    method: 'PATCH',
    url: `/api/worker/offerings/${uuid(input.offeringId, 'offeringId')}`,
    data: offeringPatch(input.patch),
    headers: mutationHeaders(input.idempotencyKey, input.revision),
  });
  return loadGroundedWorkerProfile();
}

export async function createGroundedWorkerOffering(input: Readonly<{
  serviceId: string;
  serviceVersion: number;
  idempotencyKey: string;
  connectionState: GroundedWorkerConnectionState;
}>): Promise<WorkerProfileBundle> {
  ensureOnline(input.connectionState);
  const serviceVersion = revision(input.serviceVersion);
  await request({
    method: 'POST',
    url: '/api/worker/offerings',
    data: { serviceId: uuid(input.serviceId, 'serviceId'), serviceVersion },
    headers: mutationHeaders(input.idempotencyKey, serviceVersion),
  });
  return loadGroundedWorkerProfile();
}

export async function acknowledgeGroundedWorkerActivation(input: Readonly<{
  kind: 'foreground_location' | 'safety_policy' | 'first_job_readiness';
  policyVersion: string;
  revision: number;
  idempotencyKey: string;
  connectionState: GroundedWorkerConnectionState;
}>): Promise<ActivationSnapshot> {
  ensureOnline(input.connectionState);
  const response = requireSchema(await request({
    method: 'PUT',
    url: `/api/worker/activation/acknowledgements/${input.kind}`,
    data: { policyVersion: boundedText(input.policyVersion, 'policyVersion', 1, 80) },
    headers: mutationHeaders(input.idempotencyKey, input.revision),
  }));
  const adapted = adaptWorkerActivationV1(response.activation);
  if (!adapted.ok) throw contractError(adapted.field);
  return adapted.value;
}

export async function saveGroundedWorkerEmergencyContact(input: Readonly<{
  phone: string;
  revision: number;
  idempotencyKey: string;
  connectionState: GroundedWorkerConnectionState;
}>): Promise<ActivationSnapshot> {
  ensureOnline(input.connectionState);
  const response = requireSchema(await request({
    method: 'PUT',
    url: '/api/worker/activation/emergency-contact',
    data: { phone: boundedText(input.phone, 'phone', 7, 30) },
    headers: mutationHeaders(input.idempotencyKey, input.revision),
  }));
  const adapted = adaptWorkerActivationV1(response.activation);
  if (!adapted.ok) throw contractError(adapted.field);
  return adapted.value;
}

export function isGroundedWorkerError(error: unknown): error is GroundedWorkerError {
  return error instanceof GroundedWorkerError;
}

export type { ServicesProfileSnapshot };
