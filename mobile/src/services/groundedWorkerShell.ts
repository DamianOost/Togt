import type { AxiosError, AxiosRequestConfig } from 'axios';
import api from './api';
import {
  adaptWorkerAvailabilityV1,
  adaptWorkerEarningsV1,
  adaptWorkerJobsV1,
  adaptWorkerOfferV1,
  adaptWorkerOffersV1,
} from '../data/grounded';
import type {
  EarningsSnapshot,
  WorkerAvailabilityState,
} from '../features/worker/shell';
import type {
  WorkerAvailabilityRecord,
  WorkerJobsBundle,
  WorkerOffersBundle,
} from '../data/grounded';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STABLE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/;

type JsonRecord = Record<string, unknown>;

export type GroundedWorkerShellProblem = Readonly<{
  status: number | null;
  type: string;
  title: string;
  detail: string;
  correlationId: string | null;
  retryable: boolean;
}>;

export class GroundedWorkerShellError extends Error {
  readonly problem: GroundedWorkerShellProblem;

  constructor(problem: GroundedWorkerShellProblem) {
    super(problem.title);
    this.name = 'GroundedWorkerShellError';
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

function normaliseError(error: unknown): GroundedWorkerShellError {
  if (error instanceof GroundedWorkerShellError) return error;
  const axiosError = error as AxiosError<unknown>;
  const status = typeof axiosError?.response?.status === 'number' ? axiosError.response.status : null;
  const body = isRecord(axiosError?.response?.data) ? axiosError.response.data : {};
  const headers = axiosError?.response?.headers as unknown;
  const correlation = headerValue(headers, 'x-request-id') ?? headerValue(headers, 'x-correlation-id');
  const retryable = status === null || status === 408 || status === 425 || status === 429 || (status !== null && status >= 500);
  return new GroundedWorkerShellError(Object.freeze({
    status,
    type: controlledToken(body.type ?? body.error, status === null ? 'network_unavailable' : 'worker_shell_request_failed'),
    title: displayText(body.title, status === null ? 'Connection unavailable' : 'Worker information could not be refreshed'),
    detail: displayText(body.detail ?? body.error, retryable
      ? 'Reconnect and refresh the latest server record before retrying.'
      : 'Refresh the latest server record before trying again.'),
    correlationId: typeof correlation === 'string' && STABLE.test(correlation) ? correlation : null,
    retryable,
  }));
}

function contractError(field: string): GroundedWorkerShellError {
  return new GroundedWorkerShellError(Object.freeze({
    status: null,
    type: 'worker_shell_contract_invalid',
    title: 'Worker information could not be verified',
    detail: `The server response did not match this app version (${field}).`,
    correlationId: null,
    retryable: true,
  }));
}

function ensureOnline(connectionState: 'online' | 'offline'): void {
  if (connectionState === 'offline') {
    throw new GroundedWorkerShellError(Object.freeze({
      status: null,
      type: 'offline',
      title: 'Reconnect to continue',
      detail: 'No Worker availability or offer mutation was attempted offline.',
      correlationId: null,
      retryable: true,
    }));
  }
}

function resourceId(value: string, field: string): string {
  if (!UUID.test(value)) throw new TypeError(`${field} must be a UUID`);
  return value.toLowerCase();
}

function headerValue(headers: unknown, name: string): string | null {
  if (!headers || typeof headers !== 'object') return null;
  const candidate = headers as JsonRecord & { get?: (key: string) => unknown };
  const fromGetter = typeof candidate.get === 'function' ? candidate.get(name) : null;
  const value = fromGetter ?? candidate[name] ?? candidate[name.toLowerCase()];
  return typeof value === 'string' ? value : null;
}

function observedAt(headers: unknown): string {
  const raw = headerValue(headers, 'date');
  if (!raw || !Number.isFinite(Date.parse(raw))) throw contractError('response.date');
  return new Date(raw).toISOString();
}

async function request(config: AxiosRequestConfig): Promise<Readonly<{ data: unknown; headers: unknown }>> {
  try {
    const response = await api.request<unknown>(config);
    return Object.freeze({ data: response.data, headers: response.headers });
  } catch (error) {
    throw normaliseError(error);
  }
}

export async function loadGroundedWorkerShellAvailability(): Promise<WorkerAvailabilityRecord> {
  const response = await request({ method: 'GET', url: '/api/labourers/profile' });
  const adapted = adaptWorkerAvailabilityV1(response.data, observedAt(response.headers));
  if (!adapted.ok) throw contractError(adapted.field);
  return adapted.value;
}

export async function setGroundedWorkerShellAvailability(input: Readonly<{
  availability: WorkerAvailabilityState;
  connectionState: 'online' | 'offline';
}>): Promise<WorkerAvailabilityRecord> {
  ensureOnline(input.connectionState);
  const response = await request({
    method: 'PATCH',
    url: '/api/labourers/availability',
    data: { is_available: input.availability === 'online' },
  });
  const adapted = adaptWorkerAvailabilityV1(response.data, observedAt(response.headers));
  if (!adapted.ok) throw contractError(adapted.field);
  return adapted.value;
}

function coordinate(value: number, field: 'lat' | 'lng'): number {
  const minimum = field === 'lat' ? -90 : -180;
  const maximum = field === 'lat' ? 90 : 180;
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new TypeError(`${field} must be a valid coordinate`);
  }
  return value;
}

export async function sendGroundedWorkerForegroundLocationHeartbeat(input: Readonly<{
  lat: number;
  lng: number;
  connectionState: 'online' | 'offline';
}>): Promise<void> {
  ensureOnline(input.connectionState);
  const response = await request({
    method: 'PATCH',
    url: '/api/labourers/location',
    data: {
      lat: coordinate(input.lat, 'lat'),
      lng: coordinate(input.lng, 'lng'),
    },
  });
  const root = isRecord(response.data) ? response.data : null;
  if (!root || root.updated !== true) throw contractError('location.updated');
}

export async function loadGroundedWorkerShellJobs(): Promise<WorkerJobsBundle> {
  const response = await request({ method: 'GET', url: '/api/projects' });
  const adapted = adaptWorkerJobsV1(response.data, observedAt(response.headers));
  if (!adapted.ok) throw contractError(adapted.field);
  return adapted.value;
}

export async function loadGroundedWorkerShellOffers(): Promise<WorkerOffersBundle> {
  const response = await request({ method: 'GET', url: '/api/worker/offers' });
  const adapted = adaptWorkerOffersV1(response.data);
  if (!adapted.ok) throw contractError(adapted.field);
  return adapted.value;
}

export async function loadGroundedWorkerShellOffer(offerId: string) {
  const response = await request({ method: 'GET', url: `/api/worker/offers/${resourceId(offerId, 'offerId')}` });
  const adapted = adaptWorkerOfferV1(response.data);
  if (!adapted.ok) throw contractError(adapted.field);
  return adapted.value;
}

export async function acceptGroundedWorkerShellOffer(input: Readonly<{
  offerId: string;
  connectionState: 'online' | 'offline';
}>): Promise<Readonly<{ projectId: string }>> {
  ensureOnline(input.connectionState);
  const response = await request({
    method: 'POST',
    url: `/api/match/${resourceId(input.offerId, 'offerId')}/accept`,
  });
  const root = isRecord(response.data) ? response.data : null;
  const booking = root && isRecord(root.booking) ? root.booking : null;
  if (!booking || typeof booking.id !== 'string' || !UUID.test(booking.id)) throw contractError('accept.booking.id');
  return Object.freeze({ projectId: booking.id.toLowerCase() });
}

export async function declineGroundedWorkerShellOffer(input: Readonly<{
  offerId: string;
  connectionState: 'online' | 'offline';
}>): Promise<void> {
  ensureOnline(input.connectionState);
  const response = await request({
    method: 'POST',
    url: `/api/match/${resourceId(input.offerId, 'offerId')}/decline`,
  });
  if (!isRecord(response.data) || response.data.ok !== true) throw contractError('decline.ok');
}

export async function loadGroundedWorkerShellEarnings(): Promise<EarningsSnapshot> {
  const response = await request({ method: 'GET', url: '/api/earnings' });
  const adapted = adaptWorkerEarningsV1(response.data, observedAt(response.headers));
  if (!adapted.ok) throw contractError(adapted.field);
  return adapted.value;
}

export function isGroundedWorkerShellError(error: unknown): error is GroundedWorkerShellError {
  return error instanceof GroundedWorkerShellError;
}
