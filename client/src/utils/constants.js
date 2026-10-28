// Base API configuration (configured via Vite environment variables)
const rawApiUrl = import.meta.env.VITE_API_URL || '';
export const API_BASE_URL = rawApiUrl.replace(/\/+$/, '');

// Socket.io Base URL (extract host/origin without /api/v1 path)
export const SOCKET_BASE_URL = rawApiUrl
  ? rawApiUrl.replace(/\/api(\/v\d+)?\/?$/i, '')
  : (typeof window !== 'undefined' && window.location.port === '5173'
      ? 'http://localhost:5000'
      : (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5000'));

export const APP_CONFIG = {
  APP_NAME: 'MediRoute',
  VERSION: '1.0.0',
  DEFAULT_TIMEOUT: 15000,
};

export const REALTIME_EVENTS = {
  AMBULANCE_LOCATION: 'ambulance:location_updated',
  AMBULANCE_STATUS: 'ambulance:status_changed',
  DISPATCH_CREATED: 'dispatch:created',
  DISPATCH_ASSIGNED: 'dispatch:assigned',
  DISPATCH_STATUS: 'dispatch:status_changed',
  HOSPITAL_PRE_ALERT: 'hospital:pre_alert',
  FACILITY_CAPACITY: 'facility:capacity_updated',
  NETWORK_ROAD_CLOSED: 'network:road_closed',
  NETWORK_ROAD_REOPENED: 'network:road_reopened',
  NETWORK_CONGESTION: 'network:congestion_updated',
};
