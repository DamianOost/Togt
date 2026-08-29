'use strict';

const ROUTE_SCHEMAS = Object.freeze({
  LabourerProfile: { requiredIds: ['workerId'], optionalIds: ['serviceId'] },
  BookingForm: { requiredIds: ['workerId'], optionalIds: ['serviceId'] },
  ActiveBooking: { requiredIds: ['bookingId'] },
  ActiveJob: { requiredIds: ['bookingId'] },
  ScopeConfirm: { requiredIds: ['bookingId'] },
  Payment: { requiredIds: ['bookingId'] },
  Rate: { requiredIds: ['bookingId'] },
  Chat: {
    requiredIds: ['bookingId'],
    optionalStrings: ['prefillMessage', 'otherPartyName', 'bookingStatus'],
  },
  KYC: { optionalStrings: ['returnTo'] },
});

const ROLE_ROUTES = Object.freeze({
  customer: new Set([
    'RequestMatch', 'LabourerProfile', 'BookingForm', 'ActiveBooking',
    'Payment', 'Rate', 'Chat', 'KYC', 'ScopeConfirm',
  ]),
  labourer: new Set(['ActiveJob', 'Chat', 'KYC', 'ScopeConfirm']),
});

function stableId(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${field} must be a non-empty stable ID string`);
  }
  return value;
}

function optionalString(value, field) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new TypeError(`${field} must be a string when provided`);
  }
  return value;
}

function createRouteParams(routeName, params = {}) {
  const schema = ROUTE_SCHEMAS[routeName];
  if (!schema) {
    throw new TypeError(`No runtime route contract is registered for ${String(routeName)}`);
  }
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    throw new TypeError(`${routeName} params must be an object`);
  }

  const result = {};
  for (const field of schema.requiredIds || []) {
    result[field] = stableId(params[field], field);
  }
  for (const field of schema.optionalIds || []) {
    if (params[field] !== undefined) result[field] = stableId(params[field], field);
  }
  for (const field of schema.optionalStrings || []) {
    const value = optionalString(params[field], field);
    if (value !== undefined) result[field] = value;
  }
  return result;
}

function createNestedRootIntent(role, routeName, params) {
  const roleRoutes = ROLE_ROUTES[role];
  if (!roleRoutes || !roleRoutes.has(routeName)) {
    throw new TypeError(`${String(routeName)} is not registered for ${String(role)}`);
  }

  return {
    name: role === 'labourer' ? 'Labourer' : 'Customer',
    params: {
      screen: routeName,
      params: ROUTE_SCHEMAS[routeName] ? createRouteParams(routeName, params) : params,
    },
  };
}

function createCustomerHomeIntent() {
  return {
    name: 'CustomerTabs',
    params: {
      screen: 'Search',
      params: { screen: 'HomeMap' },
    },
  };
}

module.exports = {
  ROLE_ROUTES,
  ROUTE_SCHEMAS,
  createCustomerHomeIntent,
  createNestedRootIntent,
  createRouteParams,
};
