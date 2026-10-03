import { API_BASE_URL } from '../utils/constants.js';

class ApiService {
  constructor(baseUrl = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  getToken() {
    try {
      return localStorage.getItem('mediroute_token');
    } catch {
      return null;
    }
  }

  setToken(token) {
    try {
      if (token) {
        localStorage.setItem('mediroute_token', token);
      } else {
        localStorage.removeItem('mediroute_token');
      }
    } catch {
      // Ignore localstorage errors in restricted environments
    }
  }

  removeToken() {
    this.setToken(null);
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const token = this.getToken();
    if (token && !headers.Authorization) {
      headers.Authorization = `Bearer ${token}`;
    }

    const config = {
      ...options,
      headers,
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        // If unauthenticated or token expired, purge token and emit event
        if (response.status === 401) {
          this.removeToken();
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('mediroute:auth_expired', {
                detail: { message: data?.message || 'Session expired. Please log in again.' },
              })
            );
          }
        }

        const error = new Error(data?.message || `Request failed with status ${response.status}`);
        error.status = response.status;
        error.data = data;
        throw error;
      }

      return data;
    } catch (error) {
      console.error(`API Error on [${options.method || 'GET'}] ${endpoint}:`, error.message);
      throw error;
    }
  }

  get(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'GET' });
  }

  post(endpoint, body, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  put(endpoint, body, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  patch(endpoint, body, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  delete(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'DELETE' });
  }

  // --- HEALTH & STATUS ---
  getHealth() {
    return this.get('/api/health');
  }

  // --- AUTHENTICATION ---
  login(credentials) {
    return this.post('/api/auth/login', credentials);
  }

  register(userData) {
    return this.post('/api/auth/register', userData);
  }

  getCurrentUser() {
    return this.get('/api/auth/me');
  }

  // --- DISPATCHES ---
  getDispatches(params = {}) {
    const query = new URLSearchParams();
    if (params.status && params.status !== 'all') query.append('status', params.status);
    if (params.triageLevel && params.triageLevel !== 'all') query.append('triageLevel', params.triageLevel);
    if (params.driverId) query.append('driverId', params.driverId);
    if (params.facilityId) query.append('facilityId', params.facilityId);
    const queryString = query.toString() ? `?${query.toString()}` : '';
    return this.get(`/api/dispatches${queryString}`);
  }

  getDispatch(id) {
    return this.get(`/api/dispatches/${id}`);
  }

  createDispatch(payload) {
    return this.post('/api/dispatches', payload);
  }

  updateDispatchStatus(id, status) {
    return this.patch(`/api/dispatches/${id}/status`, { status });
  }

  assignDispatch(id, { driverId, facilityId }) {
    return this.patch(`/api/dispatches/${id}/assign`, { driverId, facilityId });
  }

  // --- FACILITIES ---
  getFacilities(params = {}) {
    const query = new URLSearchParams();
    if (params.status && params.status !== 'all') query.append('status', params.status);
    if (params.type && params.type !== 'all') query.append('type', params.type);
    const queryString = query.toString() ? `?${query.toString()}` : '';
    return this.get(`/api/facilities${queryString}`);
  }

  getFacility(id) {
    return this.get(`/api/facilities/${id}`);
  }

  createFacility(payload) {
    return this.post('/api/facilities', payload);
  }

  updateFacilityCapacity(id, capacity) {
    return this.put(`/api/facilities/${id}`, { emergencyCapacity: capacity });
  }

  deleteFacility(id) {
    return this.delete(`/api/facilities/${id}`);
  }

  // --- ROUTES ---
  getRoutesByDispatch(dispatchId) {
    return this.get(`/api/routes/dispatch/${dispatchId}`);
  }

  createRouteLog(payload) {
    return this.post('/api/routes', payload);
  }

  // --- OPERATIONAL MAP & LIVE TELEMETRY ---
  getOperationalMapData() {
    return this.get('/api/map/operational-data');
  }

  // --- AMBULANCES ---
  getAmbulances(params = {}) {
    const query = new URLSearchParams();
    if (params.status && params.status !== 'all') query.append('status', params.status);
    if (params.vehicleType && params.vehicleType !== 'all') query.append('vehicleType', params.vehicleType);
    const queryString = query.toString() ? `?${query.toString()}` : '';
    return this.get(`/api/ambulances${queryString}`);
  }

  getAmbulance(id) {
    return this.get(`/api/ambulances/${id}`);
  }

  updateAmbulanceStatus(id, payload) {
    return this.patch(`/api/ambulances/${id}/status`, payload);
  }

  updateAmbulanceLocation(id, coordinates) {
    return this.patch(`/api/ambulances/${id}/location`, coordinates);
  }

  // --- USER ADMINISTRATION & APPROVALS ---
  getPendingUsers() {
    return this.get('/api/users/pending');
  }

  getUsers(params = {}) {
    const query = new URLSearchParams();
    if (params.role && params.role !== 'all') query.append('role', params.role);
    if (params.approvalStatus && params.approvalStatus !== 'all') query.append('approvalStatus', params.approvalStatus);
    const queryString = query.toString() ? `?${query.toString()}` : '';
    return this.get(`/api/users${queryString}`);
  }

  getUser(id) {
    return this.get(`/api/users/${id}`);
  }

  approveUser(id, payload = {}) {
    return this.patch(`/api/users/${id}/approve`, payload);
  }

  rejectUser(id, payload = {}) {
    return this.patch(`/api/users/${id}/reject`, payload);
  }

  updateUserRole(id, role) {
    return this.patch(`/api/users/${id}/role`, { role });
  }

  // --- GEMINI AI ASSISTANT (Mediated via Express backend) ---
  getAiStatus() {
    return this.get('/api/ai/status');
  }

  assessTriage(payload) {
    return this.post('/api/ai/triage', payload);
  }

  summarizeIncident(payload) {
    return this.post('/api/ai/summarize-incident', payload);
  }

  getDispatchAssistance(payload) {
    return this.post('/api/ai/dispatch-assistance', payload);
  }

  optimizeRoute(payload) {
    return this.post('/api/ai/optimize-route', payload);
  }

  recommendFacility(payload) {
    return this.post('/api/ai/recommend-facility', payload);
  }
}

export const api = new ApiService();
export default api;
