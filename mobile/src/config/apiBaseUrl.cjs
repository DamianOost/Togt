'use strict';

const LOCAL_DEVELOPMENT_URL = 'http://localhost:3000';

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

function resolveApiBaseUrl({ configuredUrl, isDevelopment = false, isExpoGo = false } = {}) {
  const allowDevelopmentHttp = isDevelopment || isExpoGo;
  const normalized = normalizeApiBaseUrl(configuredUrl);

  if (!normalized) {
    if (allowDevelopmentHttp) return LOCAL_DEVELOPMENT_URL;
    throw new Error('EXPO_PUBLIC_API_BASE_URL is required for standalone builds.');
  }

  if (normalized.startsWith('http://') && !allowDevelopmentHttp) {
    throw new Error('Standalone builds require an HTTPS EXPO_PUBLIC_API_BASE_URL.');
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
  LOCAL_DEVELOPMENT_URL,
  joinApiUrl,
  normalizeApiBaseUrl,
  resolveApiBaseUrl,
};
