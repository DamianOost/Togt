import axios from 'axios';
import Constants from 'expo-constants';

const BASE_URL = Constants.expoConfig?.extra?.apiUrl || 'http://localhost:3000';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach token from store on every request
let getToken = null;
export function setTokenGetter(fn) {
  getToken = fn;
}

api.interceptors.request.use((config) => {
  const token = getToken?.();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
