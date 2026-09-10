// Central API client for the NER-Sahayak backend.
// Set REACT_APP_API_URL in your frontend .env to point at the deployed
// backend (defaults to local dev server on :4000).

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000/api';
const TOKEN_KEY = 'ner_sahayak_token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = tokenStore.get();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch (_) { /* empty body */ }
  if (!res.ok) {
    const message = (data && data.error) || `Request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  // Auth
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password }, auth: false }),
  signup: (payload) => request('/auth/signup', { method: 'POST', body: payload, auth: false }),
  me: () => request('/auth/me'),
  updateProfile: (payload) => request('/auth/me', { method: 'PATCH', body: payload }),

  // Network / GIS / routing
  nodes: () => request('/network/nodes'),
  edges: () => request('/network/edges'),
  planRoute: (originId, destinationId, alternates = true) =>
    request('/network/route', { method: 'POST', body: { originId, destinationId, alternates } }),

  // Weather
  weatherAll: () => request('/weather/all'),
  weatherFor: (nodeId) => request(`/weather/${nodeId}`),

  // Alerts
  alerts: () => request('/alerts'),
  createAlert: (payload) => request('/alerts', { method: 'POST', body: payload }),
  deleteAlert: (id) => request(`/alerts/${id}`, { method: 'DELETE' }),

  // Field reports
  reports: () => request('/reports'),
  myReports: () => request('/reports/mine'),
  createReport: (payload) => request('/reports', { method: 'POST', body: payload }),
  syncReports: (reports) => request('/reports/sync', { method: 'POST', body: { reports } }),
  updateReportStatus: (id, status) => request(`/reports/${id}/status`, { method: 'PATCH', body: { status } }),

  // Vehicles
  vehicles: () => request('/vehicles'),
  createVehicle: (payload) => request('/vehicles', { method: 'POST', body: payload }),
  pingVehicle: (id, payload) => request(`/vehicles/${id}/ping`, { method: 'POST', body: payload }),

  // Shipments
  shipments: () => request('/shipments'),
  createShipment: (payload) => request('/shipments', { method: 'POST', body: payload }),
  updateShipmentStatus: (id, status) => request(`/shipments/${id}/status`, { method: 'PATCH', body: { status } }),

  // Dashboard
  dashboardSummary: () => request('/dashboard/summary'),

  // Users directory (official role only)
  users: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    return request(`/users${qs ? `?${qs}` : ''}`);
  },
  userDetail: (id) => request(`/users/${id}`),

  // i18n
  languages: () => request('/i18n/languages'),
  strings: (lang) => request(`/i18n/strings/${lang}`),

  health: () => request('/health', { auth: false }),
};

export default api;
