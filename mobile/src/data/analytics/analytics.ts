/** Provider-neutral, PII-safe product measurement boundary. */

export const ANALYTICS_SCHEMA_VERSION = 1 as const;

const MAX_TOKEN_LENGTH = 96;
const MAX_DURATION_MS = 24 * 60 * 60 * 1000;
const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const SAFE_EVENT_NAME = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;

const STRING_PROPERTY_NAMES = new Set([
  'result_code',
  'failure_code',
  'resource_id',
  'booking_id',
  'match_id',
  'service_id',
  'worker_id',
  'area_id',
  'pricing_mode',
  'status',
  'screen_id',
  'step_id',
  'method',
  'media_type',
  'source',
  'network_class',
  'experiment_id',
  'variant',
  'action',
  'capability',
  'reason_code',
  'error_name',
]);

const INTEGER_PROPERTY_NAMES = new Set([
  'count',
  'item_count',
  'attempt',
  'step_index',
]);

const BOOLEAN_PROPERTY_NAMES = new Set([
  'available',
  'offline',
  'restored',
  'selected',
  'success',
]);

export type AnalyticsRole = 'anonymous' | 'customer' | 'worker' | 'labourer';
export type AnalyticsPlatform = 'android' | 'ios' | 'unknown';
export type SanitizedAnalyticsValue = string | number | boolean;
export type SanitizedAnalyticsProperties = Readonly<Record<string, SanitizedAnalyticsValue>>;

export interface AnalyticsContext {
  readonly pseudonymousActorId?: string;
  readonly role?: AnalyticsRole;
  readonly sessionId?: string;
  readonly appVersion?: string;
  readonly platform?: AnalyticsPlatform;
  readonly platformVersion?: string;
}

export interface AnalyticsEvent {
  readonly event_id: string;
  readonly event_name: string;
  readonly schema_version: typeof ANALYTICS_SCHEMA_VERSION;
  readonly occurred_at: string;
  readonly source: AnalyticsPlatform;
  readonly pseudonymous_actor_id: string;
  readonly role: AnalyticsRole;
  readonly session_id: string;
  readonly app_version: string;
  readonly platform_version: string;
  readonly kind: 'track' | 'exception' | 'measure';
  readonly result_code: string;
  readonly failure_code: string | null;
  readonly properties: SanitizedAnalyticsProperties;
}

export interface AnalyticsTransport {
  send(event: AnalyticsEvent): void | Promise<void>;
}

export interface ProductAnalytics {
  track(name: string, properties?: Readonly<Record<string, unknown>>): void;
  captureException(error: unknown, context?: Readonly<Record<string, unknown>>): void;
  measure(name: string, durationMs: number, properties?: Readonly<Record<string, unknown>>): void;
}

export interface AnalyticsOptions {
  readonly now?: () => Date;
  readonly eventId?: () => string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeToken(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const candidate = value.trim();
  if (
    candidate.length === 0
    || candidate.length > MAX_TOKEN_LENGTH
    || !SAFE_TOKEN.test(candidate)
  ) {
    return fallback;
  }
  return candidate;
}

function safeRole(value: unknown): AnalyticsRole {
  return value === 'customer' || value === 'worker' || value === 'labourer'
    ? value
    : 'anonymous';
}

function safePlatform(value: unknown): AnalyticsPlatform {
  return value === 'android' || value === 'ios' ? value : 'unknown';
}

/**
 * Keep only explicitly approved primitive properties. Raw names, contact
 * details, identity data, addresses, coordinates, free text, media, chat and
 * payment data have no accepted key and are therefore discarded.
 */
export function sanitizeAnalyticsProperties(input: unknown): SanitizedAnalyticsProperties {
  if (!isRecord(input)) return Object.freeze({});

  const output: Record<string, SanitizedAnalyticsValue> = {};
  for (const [key, value] of Object.entries(input)) {
    if (STRING_PROPERTY_NAMES.has(key)) {
      const token = safeToken(value, '');
      if (token !== '') output[key] = token;
      continue;
    }

    if (INTEGER_PROPERTY_NAMES.has(key)) {
      if (Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 1_000_000) {
        output[key] = Number(value);
      }
      continue;
    }

    if (BOOLEAN_PROPERTY_NAMES.has(key) && typeof value === 'boolean') {
      output[key] = value;
    }
  }

  return Object.freeze(output);
}

let eventSequence = 0;

function defaultEventId(): string {
  eventSequence += 1;
  return `ev_${Date.now().toString(36)}_${eventSequence.toString(36)}`;
}

function errorName(error: unknown): string {
  if (error instanceof Error) return safeToken(error.name, 'unknown_error');
  if (isRecord(error)) return safeToken(error.name, 'unknown_error');
  return 'unknown_error';
}

class SafeProductAnalytics implements ProductAnalytics {
  private readonly transport: AnalyticsTransport;
  private readonly context: Required<AnalyticsContext>;
  private readonly now: () => Date;
  private readonly nextEventId: () => string;

  constructor(
    transport: AnalyticsTransport,
    context: AnalyticsContext,
    options: AnalyticsOptions,
  ) {
    this.transport = transport;
    this.context = {
      pseudonymousActorId: safeToken(context.pseudonymousActorId, 'anonymous'),
      role: safeRole(context.role),
      sessionId: safeToken(context.sessionId, 'unknown'),
      appVersion: safeToken(context.appVersion, 'unknown'),
      platform: safePlatform(context.platform),
      platformVersion: safeToken(context.platformVersion, 'unknown'),
    };
    this.now = options.now ?? (() => new Date());
    this.nextEventId = options.eventId ?? defaultEventId;
  }

  track(name: string, properties: Readonly<Record<string, unknown>> = {}): void {
    this.emit('track', name, sanitizeAnalyticsProperties(properties));
  }

  captureException(
    error: unknown,
    context: Readonly<Record<string, unknown>> = {},
  ): void {
    const safeContext = sanitizeAnalyticsProperties(context);
    this.emit('exception', 'app.exception_captured', Object.freeze({
      ...safeContext,
      error_name: errorName(error),
      result_code: 'failed',
      failure_code: typeof safeContext.failure_code === 'string'
        ? safeContext.failure_code
        : 'unclassified_exception',
    }));
  }

  measure(
    name: string,
    durationMs: number,
    properties: Readonly<Record<string, unknown>> = {},
  ): void {
    if (!Number.isFinite(durationMs) || durationMs < 0 || durationMs > MAX_DURATION_MS) return;
    const safeProperties = sanitizeAnalyticsProperties(properties);
    this.emit('measure', name, Object.freeze({
      ...safeProperties,
      duration_ms: Math.round(durationMs),
    }));
  }

  private emit(
    kind: AnalyticsEvent['kind'],
    name: string,
    properties: SanitizedAnalyticsProperties,
  ): void {
    if (!SAFE_EVENT_NAME.test(name) || name.length > MAX_TOKEN_LENGTH) return;

    const resultCode = typeof properties.result_code === 'string'
      ? properties.result_code
      : 'not_applicable';
    const failureCode = typeof properties.failure_code === 'string'
      ? properties.failure_code
      : null;
    const requestedEventId = this.nextEventId();
    const safeEventId = safeToken(requestedEventId, '');
    const event: AnalyticsEvent = Object.freeze({
      event_id: safeEventId || defaultEventId(),
      event_name: name,
      schema_version: ANALYTICS_SCHEMA_VERSION,
      occurred_at: this.now().toISOString(),
      source: this.context.platform,
      pseudonymous_actor_id: this.context.pseudonymousActorId,
      role: this.context.role,
      session_id: this.context.sessionId,
      app_version: this.context.appVersion,
      platform_version: this.context.platformVersion,
      kind,
      result_code: resultCode,
      failure_code: failureCode,
      properties,
    });

    try {
      const pending = this.transport.send(event);
      if (pending instanceof Promise) {
        void pending.catch(() => undefined);
      }
    } catch {
      // Measurement must never change the product path or leak through logs.
    }
  }
}

export function createProductAnalytics(
  transport: AnalyticsTransport,
  context: AnalyticsContext = {},
  options: AnalyticsOptions = {},
): ProductAnalytics {
  return new SafeProductAnalytics(transport, context, options);
}

export const NOOP_ANALYTICS: ProductAnalytics = Object.freeze({
  track: () => undefined,
  captureException: () => undefined,
  measure: () => undefined,
});
