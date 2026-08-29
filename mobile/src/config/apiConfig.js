import Constants from 'expo-constants';

const { joinApiUrl, resolveApiBaseUrl } = require('./apiBaseUrl.cjs');

const extra = Constants.expoConfig?.extra || {};
const appEnvironment = extra.appEnvironment || 'development';

export const API_BASE_URL = resolveApiBaseUrl({
  configuredUrl: extra.apiUrl,
  appEnvironment,
});

export function apiUrl(path) {
  return joinApiUrl(API_BASE_URL, path);
}

export function socketUrl(namespace) {
  return joinApiUrl(API_BASE_URL, namespace);
}
