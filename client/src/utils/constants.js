// Base API configuration (configured via Vite environment variables)
const rawApiUrl = import.meta.env.VITE_API_URL || '';
export const API_BASE_URL = rawApiUrl.replace(/\/+$/, '');

export const APP_CONFIG = {
  APP_NAME: 'MediRoute',
  VERSION: '1.0.0',
  DEFAULT_TIMEOUT: 15000,
};
