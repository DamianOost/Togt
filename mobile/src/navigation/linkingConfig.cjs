'use strict';

const TOGT_LINK_PREFIXES = Object.freeze(['togt://']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INVALID_ID = '__invalid_togt_link_id__';

function leaf(path, requiredIds = []) {
  return Object.freeze({ path, requiredIds: Object.freeze([...requiredIds]) });
}

function nested(screens) {
  return Object.freeze({ screens: Object.freeze(screens) });
}

const AUTH_DEFINITION = Object.freeze({
  Auth: nested({
    Onboarding: leaf(''),
    Login: leaf('login'),
    Register: leaf('register'),
    ForgotPassword: leaf('forgot-password'),
    ResetPassword: leaf('reset-password'),
  }),
});

const CUSTOMER_GROUNDED_DEFINITION = Object.freeze({
  Customer: nested({
    CustomerTabs: nested({
      Home: leaf('customer/home'),
      Projects: leaf('customer/projects'),
      Account: leaf('customer/account'),
    }),
    ProjectHub: leaf('customer/projects/:projectId', ['projectId']),
    SafeSharing: leaf('customer/projects/:projectId/share', ['projectId']),
    ScopeStart: leaf('customer/projects/:projectId/scope', ['projectId']),
    ActiveWork: leaf('customer/projects/:projectId/work', ['projectId']),
    CompletionPayment: leaf('customer/projects/:projectId/completion', ['projectId']),
    ProjectReschedule: leaf('customer/projects/:projectId/reschedule', ['projectId']),
    SafetyHelp: leaf('customer/projects/:projectId/safety', ['projectId']),
    Relationships: leaf('customer/projects/:sourceBookingId/relationship', ['sourceBookingId']),
    RecurringSeries: leaf('customer/series/:seriesId', ['seriesId']),
    RecurringOccurrence: leaf(
      'customer/series/:seriesId/occurrences/:occurrenceId',
      ['seriesId', 'occurrenceId'],
    ),
    ProjectLiveStatus: leaf('customer/projects/:projectId/status', ['projectId']),
    LabourerProfile: leaf('customer/workers/:workerId', ['workerId']),
    Chat: leaf('customer/projects/:bookingId/chat', ['bookingId']),
  }),
});

const WORKER_GROUNDED_DEFINITION = Object.freeze({
  Labourer: nested({
    WorkerTabs: nested({
      Today: leaf('worker/today'),
      Jobs: leaf('worker/jobs'),
      Earnings: leaf('worker/earnings'),
      Account: leaf('worker/account'),
    }),
    WorkerJobDetail: leaf('worker/projects/:projectId', ['projectId']),
    SafeSharing: leaf('worker/projects/:projectId/share', ['projectId']),
    WorkerIncomingOffer: leaf('worker/offers/:offerId', ['offerId']),
    WorkerQuoteRequests: leaf('worker/quote-requests'),
    WorkerQuoteRequestDetail: leaf('worker/quote-requests/:requestId', ['requestId']),
    WorkerQuoteBuilder: leaf('worker/quote-requests/:requestId/build', ['requestId']),
    WorkerScopeStart: leaf('worker/projects/:projectId/scope', ['projectId']),
    WorkerActiveWork: leaf('worker/projects/:projectId/work', ['projectId']),
    WorkerCompletion: leaf('worker/projects/:projectId/completion', ['projectId']),
    ProjectReschedule: leaf('worker/projects/:projectId/reschedule', ['projectId']),
    SafetyHelp: leaf('worker/projects/:projectId/safety', ['projectId']),
    RecurringSeries: leaf('worker/series/:seriesId', ['seriesId']),
    RecurringOccurrence: leaf(
      'worker/series/:seriesId/occurrences/:occurrenceId',
      ['seriesId', 'occurrenceId'],
    ),
    ProjectLiveStatus: leaf('worker/projects/:projectId/status', ['projectId']),
    Chat: leaf('worker/projects/:bookingId/chat', ['bookingId']),
  }),
});

const CUSTOMER_LEGACY_DEFINITION = Object.freeze({
  Customer: nested({
    LabourerProfile: leaf('customer/workers/:workerId', ['workerId']),
    BookingForm: leaf('customer/workers/:workerId/book', ['workerId']),
    ActiveBooking: leaf('customer/bookings/:bookingId', ['bookingId']),
    Payment: leaf('customer/bookings/:bookingId/payment', ['bookingId']),
    ScopeConfirm: leaf('customer/bookings/:bookingId/scope', ['bookingId']),
    Chat: leaf('customer/bookings/:bookingId/chat', ['bookingId']),
  }),
});

const WORKER_LEGACY_DEFINITION = Object.freeze({
  Labourer: nested({
    ActiveJob: leaf('worker/bookings/:bookingId', ['bookingId']),
    ScopeConfirm: leaf('worker/bookings/:bookingId/scope', ['bookingId']),
    Chat: leaf('worker/bookings/:bookingId/chat', ['bookingId']),
  }),
});

function parseStableId(value) {
  return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : INVALID_ID;
}

function materialize(definition) {
  const policy = new Map();
  const paths = new Set();

  function visit(screens) {
    const result = {};
    for (const [name, entry] of Object.entries(screens)) {
      if (policy.has(name)) throw new Error(`Duplicate deep-link route name: ${name}.`);
      if (entry.screens) {
        policy.set(name, Object.freeze({ requiredIds: Object.freeze([]) }));
        result[name] = { screens: visit(entry.screens) };
        continue;
      }
      if (entry.path && paths.has(entry.path)) {
        throw new Error(`Duplicate deep-link path: ${entry.path}.`);
      }
      if (entry.path) paths.add(entry.path);
      policy.set(name, Object.freeze({ requiredIds: entry.requiredIds }));
      result[name] = entry.requiredIds.length === 0
        ? entry.path
        : {
            path: entry.path,
            parse: Object.fromEntries(entry.requiredIds.map((id) => [id, parseStableId])),
          };
    }
    return result;
  }

  return Object.freeze({ config: Object.freeze({ screens: visit(definition) }), policy });
}

function validRoute(route, policy) {
  const contract = policy.get(route?.name);
  if (!contract) return false;
  const params = route.params ?? {};
  if (!params || typeof params !== 'object' || Array.isArray(params)) return false;
  const allowed = new Set(contract.requiredIds);
  if (Object.keys(params).some((key) => !allowed.has(key))) return false;
  if (contract.requiredIds.some((key) => !UUID.test(params[key] ?? ''))) return false;
  if (!route.state) return true;
  return validState(route.state, policy);
}

function validState(state, policy) {
  return Boolean(
    state &&
    Array.isArray(state.routes) &&
    state.routes.length > 0 &&
    state.routes.every((route) => validRoute(route, policy))
  );
}

function selectedDefinition({ shell, groundedCustomer, groundedWorker }) {
  if (shell === 'auth') return AUTH_DEFINITION;
  if (shell === 'customer') {
    return groundedCustomer ? CUSTOMER_GROUNDED_DEFINITION : CUSTOMER_LEGACY_DEFINITION;
  }
  if (shell === 'labourer') {
    return groundedWorker ? WORKER_GROUNDED_DEFINITION : WORKER_LEGACY_DEFINITION;
  }
  return null;
}

function createTogtLinkingConfiguration({
  shell,
  groundedCustomer = false,
  groundedWorker = false,
  stateFromPath,
}) {
  if (typeof stateFromPath !== 'function') {
    throw new TypeError('createTogtLinkingConfiguration requires the navigation state parser.');
  }
  const definition = selectedDefinition({ shell, groundedCustomer, groundedWorker });
  if (!definition) return undefined;
  const { config, policy } = materialize(definition);
  const authorisedRoot = shell === 'auth' ? 'Auth' : shell === 'customer' ? 'Customer' : 'Labourer';

  return Object.freeze({
    prefixes: TOGT_LINK_PREFIXES,
    config,
    getStateFromPath(path, options) {
      try {
        const state = stateFromPath(path, options || config);
        if (!state || state.routes?.[0]?.name !== authorisedRoot) return undefined;
        return validState(state, policy) ? state : undefined;
      } catch {
        return undefined;
      }
    },
  });
}

module.exports = {
  TOGT_LINK_PREFIXES,
  createTogtLinkingConfiguration,
  parseStableId,
};
