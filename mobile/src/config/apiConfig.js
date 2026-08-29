import Constants from 'expo-constants';

const { joinApiUrl, resolveApiBaseUrl } = require('./apiBaseUrl.cjs');

const extra = Constants.expoConfig?.extra || {};
const appEnvironment = process.env.EXPO_PUBLIC_APP_ENV || extra.appEnvironment || 'development';

export const API_BASE_URL = resolveApiBaseUrl({
  configuredUrl: process.env.EXPO_PUBLIC_API_BASE_URL || extra.apiUrl,
  appEnvironment,
});

export function apiUrl(path) {
  return joinApiUrl(API_BASE_URL, path);
}

export function socketUrl(namespace) {
  return joinApiUrl(API_BASE_URL, namespace);
}
