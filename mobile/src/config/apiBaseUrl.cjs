'use strict';

const APP_ENVIRONMENTS = new Set(['development', 'preview', 'production']);

function normalizeAppEnvironment(value) {
  const appEnvironment = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!APP_ENVIRONMENTS.has(appEnvironment)) {
    throw new Error(
      'EXPO_PUBLIC_APP_ENV must be one of development, preview, or production.'
    );
  }
  return appEnvironment;
}

function normalizeApiBaseUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;

  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error('EXPO_PUBLIC_API_BASE_URL must be an absolute HTTP(S) URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('EXPO_PUBLIC_API_BASE_URL must use HTTP or HTTPS.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL must not contain credentials.');
  }
  if ((parsed.pathname && parsed.pathname !== '/') || parsed.search || parsed.hash) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL must be an origin without a path, query, or fragment.');
  }

  return parsed.origin;
}

function isPrivateOrLocalHostname(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:')
  ) {
    return true;
  }

  const octets = normalized.split('.').map((part) => Number(part));
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  return (
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
}

function classifyApiBaseUrl(baseUrl, appEnvironment) {
  const environment = normalizeAppEnvironment(appEnvironment);
  if (environment !== 'development') return environment;

  const parsed = new URL(baseUrl);
  if (parsed.protocol === 'https:') return 'development-secure';
  if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '[::1]') {
    return 'development-local';
  }
  return 'development-lan';
}

function resolveApiBaseUrl({ configuredUrl, appEnvironment } = {}) {
  const environment = normalizeAppEnvironment(appEnvironment);
  const normalized = normalizeApiBaseUrl(configuredUrl);

  if (!normalized) {
    throw new Error(
      'EXPO_PUBLIC_API_BASE_URL is required. Development URLs must be supplied explicitly.'
    );
  }

  const parsed = new URL(normalized);
  const privateOrLocal = isPrivateOrLocalHostname(parsed.hostname);

  if (environment === 'development') {
    if (parsed.protocol === 'http:' && !privateOrLocal) {
      throw new Error(
        'Development HTTP is limited to localhost or a private-LAN EXPO_PUBLIC_API_BASE_URL.'
      );
    }
    return normalized;
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(`${environment} requires an HTTPS EXPO_PUBLIC_API_BASE_URL.`);
  }
  if (privateOrLocal) {
    throw new Error(
      `${environment} must not use a localhost or private-LAN EXPO_PUBLIC_API_BASE_URL.`
    );
  }

  return normalized;
}

function joinApiUrl(baseUrl, path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
    throw new Error('API and socket paths must start with one slash.');
  }
  return `${baseUrl}${path}`;
}

module.exports = {
  APP_ENVIRONMENTS,
  classifyApiBaseUrl,
  isPrivateOrLocalHostname,
  joinApiUrl,
  normalizeAppEnvironment,
  normalizeApiBaseUrl,
  resolveApiBaseUrl,
};
