import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api, { tokenStore } from '../services/api';

export const USER_ROLES = [
  { id: 'driver', label: 'Driver', icon: 'phone', name: 'Driver workspace', initials: 'DR' },
  { id: 'field', label: 'Field officer', icon: 'report', name: 'Field officer workspace', initials: 'FO' },
  { id: 'logistics', label: 'Logistics operator', icon: 'route', name: 'Logistics workspace', initials: 'LO' },
  { id: 'official', label: 'Government official', icon: 'grid', name: 'Official briefing room', initials: 'GO' },
].map((r) => ({
  ...r,
  permissions: {
    driver: ['View live road & weather conditions', 'Plan the safest route with live ETA', 'Receive multilingual alerts', 'Report hazards from the road'],
    field: ['Submit geo-tagged incident reports', 'Attach photos of road/bridge damage', 'Work offline and sync later', 'Raise alerts for their district'],
    logistics: ['Plan and track shipments', 'Optimize routes for cargo vehicles', 'Live GPS tracking of the fleet', 'View logistics bottlenecks'],
    official: ['Regional connectivity dashboard', 'District-wise accessibility scores', 'Emergency route readiness', 'Approve and broadcast alerts'],
  }[r.id],
}));

export const NER_REGION_STATES = [
  'Assam', 'Meghalaya', 'Nagaland', 'Manipur', 'Mizoram', 'Tripura', 'Arunachal Pradesh', 'Sikkim',
];

export const LANGUAGES = [
  { id: 'en', label: 'English' },
  { id: 'as', label: 'Assamese' },
  { id: 'bn', label: 'Bengali' },
  { id: 'hi', label: 'Hindi' },
  { id: 'mni', label: 'Manipuri (Meitei)' },
  { id: 'kha', label: 'Khasi' },
  { id: 'lus', label: 'Mizo' },
  { id: 'nag', label: 'Nagamese' },
];

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = tokenStore.get();
    if (!token) { setReady(true); return; }
    api.me()
      .then((res) => setUser(res.user))
      .catch(() => tokenStore.clear())
      .finally(() => setReady(true));
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await api.login(email, password); // throws on 401 with backend's message
    tokenStore.set(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const signup = useCallback(async (form) => {
    const res = await api.signup(form); // throws on validation error with backend's message
    tokenStore.set(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const updateProfile = useCallback(async (partial) => {
    const res = await api.updateProfile(partial);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  const initialsFrom = (name = '') => name.split(' ').filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase() || 'U';

  return (
    <AuthContext.Provider value={{ user, ready, login, signup, logout, updateProfile, initialsFrom }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
