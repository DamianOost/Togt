import Constants from 'expo-constants';

const { joinApiUrl, resolveApiBaseUrl } = require('./apiBaseUrl.cjs');

const isDevelopment = typeof __DEV__ !== 'undefined' && __DEV__;
const isExpoGo = Constants.appOwnership === 'expo' ||
  Constants.executionEnvironment === 'storeClient';

export const API_BASE_URL = resolveApiBaseUrl({
  configuredUrl: process.env.EXPO_PUBLIC_API_BASE_URL ||
    Constants.expoConfig?.extra?.apiUrl,
  isDevelopment,
  isExpoGo,
});

export function apiUrl(path) {
  return joinApiUrl(API_BASE_URL, path);
}

export function socketUrl(namespace) {
  return joinApiUrl(API_BASE_URL, namespace);
}
