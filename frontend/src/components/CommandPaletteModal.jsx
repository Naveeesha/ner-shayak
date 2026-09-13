import { useEffect, useRef, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function CommandPaletteModal({ isOpen, onClose, navigate }) {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [nodes, setNodes] = useState([]);
  const [users, setUsers] = useState([]);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      api.nodes().then((res) => setNodes(res.nodes || [])).catch(() => {});
      if (user?.role === 'official') {
        api.users().then((res) => setUsers(res.users || [])).catch(() => {});
      }
    }
  }, [isOpen, user?.role]);

  if (!isOpen) return null;

  const q = query.toLowerCase().trim();

  // Search results
  const matchedNodes = q ? nodes.filter((n) => n.name.toLowerCase().includes(q) || n.state.toLowerCase().includes(q)) : [];
  const matchedUsers = q && user?.role === 'official' ? users.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.district && u.district.toLowerCase().includes(q))) : [];

  const actions = [
    { title: 'Overview Dashboard', category: 'Navigation', icon: '⚡', action: () => { navigate('Overview'); onClose(); } },
    { title: 'Plan Safest Route', category: 'Navigation', icon: '🗺️', action: () => { navigate('Route planner'); onClose(); } },
    { title: 'Live Network Map', category: 'Navigation', icon: '📍', action: () => { navigate('Live map'); onClose(); } },
    { title: 'Regional Alerts', category: 'Navigation', icon: '🔔', action: () => { navigate('Alerts'); onClose(); } },
    { title: 'Field Hazard Reports', category: 'Navigation', icon: '⚠️', action: () => { navigate('Field reports'); onClose(); } },
    { title: 'User Profile & Settings', category: 'Account', icon: '👤', action: () => { navigate('Profile'); onClose(); } },
  ].filter((a) => !q || a.title.toLowerCase().includes(q) || a.category.toLowerCase().includes(q));

  return (
    <div className="cmd-modal-overlay" onClick={onClose}>
      <div className="cmd-modal-container" onClick={(e) => e.stopPropagation()}>
        <header className="cmd-modal-header">
          <span className="cmd-search-icon">🔍</span>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search towns (Guwahati, Shillong...), personnel, or jump to view... (Esc to close)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd className="cmd-kbd">ESC</kbd>
        </header>

        <div className="cmd-modal-body">
          {/* Quick Actions */}
          {actions.length > 0 && (
            <div className="cmd-section">
              <div className="cmd-section-title">PLATFORM ACTIONS</div>
              {actions.map((a, i) => (
                <div key={i} className="cmd-item" onClick={a.action}>
                  <span className="cmd-item-icon">{a.icon}</span>
                  <div className="cmd-item-info">
                    <b>{a.title}</b>
                    <small>{a.category}</small>
                  </div>
                  <span className="cmd-item-arrow">➔</span>
                </div>
              ))}
            </div>
          )}

          {/* Matched Towns */}
          {matchedNodes.length > 0 && (
            <div className="cmd-section">
              <div className="cmd-section-title">NETWORK TOWNS & NODES</div>
              {matchedNodes.slice(0, 5).map((n) => (
                <div key={n.id} className="cmd-item" onClick={() => { navigate('Live map'); onClose(); }}>
                  <span className="cmd-item-icon">🏞️</span>
                  <div className="cmd-item-info">
                    <b>{n.name}</b>
                    <small>{n.state} · Hub Node ({n.lat.toFixed(2)}, {n.lng.toFixed(2)})</small>
                  </div>
                  <span className="cmd-item-arrow">View on Map</span>
                </div>
              ))}
            </div>
          )}

          {/* Matched Users (Official only) */}
          {matchedUsers.length > 0 && (
            <div className="cmd-section">
              <div className="cmd-section-title">REGISTERED PERSONNEL (DIRECTORY)</div>
              {matchedUsers.slice(0, 5).map((u) => (
                <div key={u.id} className="cmd-item" onClick={() => { navigate('Team directory'); onClose(); }}>
                  <span className="cmd-item-icon">👤</span>
                  <div className="cmd-item-info">
                    <b>{u.name}</b>
                    <small>{u.role.toUpperCase()} · {u.email} · {u.district || u.state}</small>
                  </div>
                  <span className="cmd-item-arrow">View User</span>
                </div>
              ))}
            </div>
          )}

          {!q && actions.length === 0 && (
            <div className="cmd-empty">Type to search across the NER network...</div>
          )}
        </div>
      </div>
    </div>
  );
}
