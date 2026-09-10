import { useEffect, useState } from 'react';
import api from '../services/api';
import { NER_REGION_STATES } from '../context/AuthContext';

const ROLE_LABEL = { driver: 'Driver', field: 'Field officer', logistics: 'Logistics operator', official: 'Official' };

export default function UsersDirectory() {
  const [users, setUsers] = useState([]);
  const [byRole, setByRole] = useState({});
  const [role, setRole] = useState('');
  const [state, setState] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.users({ role, state, search })
      .then((res) => { setUsers(res.users); setByRole(res.byRole); setError(''); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [role, state]);
  useEffect(() => {
    const t = setTimeout(load, 300); // debounce search typing
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {Object.entries(ROLE_LABEL).map(([id, label]) => (
          <span key={id} style={countPill}>{label}: <b>{byRole[id] || 0}</b></span>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, organisation, district…" style={{ ...inputStyle, flex: 2, minWidth: 220 }}/>
        <select value={role} onChange={(e) => setRole(e.target.value)} style={inputStyle}>
          <option value="">All roles</option>
          {Object.entries(ROLE_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <select value={state} onChange={(e) => setState(e.target.value)} style={inputStyle}>
          <option value="">All states</option>
          {NER_REGION_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {error && <p style={{ color: '#b54a3c', fontSize: 12, fontWeight: 700 }}>{error}</p>}
      {loading && <p style={{ fontSize: 12, color: '#7c8f87' }}>Loading directory…</p>}

      {!loading && (
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                {['Name', 'Role', 'Email', 'Phone', 'Organisation', 'District / State', 'Language', 'Joined'].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} onClick={() => setSelected(u)} style={{ cursor: 'pointer' }}>
                  <td style={tdStyle}><b>{u.name}</b></td>
                  <td style={tdStyle}>{ROLE_LABEL[u.role]}</td>
                  <td style={tdStyle}>{u.email}</td>
                  <td style={tdStyle}>{u.phone || '—'}</td>
                  <td style={tdStyle}>{u.organisation || '—'}</td>
                  <td style={tdStyle}>{[u.district, u.state].filter(Boolean).join(', ') || '—'}</td>
                  <td style={tdStyle}>{u.language}</td>
                  <td style={tdStyle}>{new Date(u.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && <p style={{ fontSize: 12, color: '#7c8f87', padding: '14px 0' }}>No accounts match this filter.</p>}
        </div>
      )}

      {selected && (
        <>
          <div style={overlayStyle} onClick={() => setSelected(null)} />
          <div style={detailPanel}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <small style={{ color: '#8aa097', fontSize: 9, fontWeight: 800, letterSpacing: 1 }}>ACCOUNT DETAIL</small>
                <h3 style={{ margin: '6px 0 2px', fontSize: 18, color: '#25483d' }}>{selected.name}</h3>
                <span style={{ fontSize: 11, color: '#7c8f87' }}>{ROLE_LABEL[selected.role]}</span>
              </div>
              <button onClick={() => setSelected(null)} style={closeBtn}>✕</button>
            </div>
            <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
              <Detail label="Email" value={selected.email} />
              <Detail label="Phone" value={selected.phone || '—'} />
              <Detail label="Organisation / unit" value={selected.organisation || '—'} />
              <Detail label="State" value={selected.state || '—'} />
              <Detail label="District / posting" value={selected.district || '—'} />
              {selected.vehicleNumber && <Detail label="Vehicle number" value={selected.vehicleNumber} />}
              {selected.hub && <Detail label="Logistics hub" value={selected.hub} />}
              {selected.department && <Detail label="Department" value={selected.department} />}
              <Detail label="Alert language" value={selected.language} />
              <Detail label="Account created" value={new Date(selected.createdAt).toLocaleString()} />
              <Detail label="User ID" value={selected.id} mono />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Detail({ label, value, mono }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '6px 0', borderBottom: '1px solid #edf1ee' }}>
      <span style={{ color: '#8aa097', fontWeight: 700 }}>{label}</span>
      <span style={{ color: '#3c5c50', fontFamily: mono ? 'monospace' : 'inherit', textAlign: 'right' }}>{value}</span>
    </div>
  );
}

const inputStyle = { height: 38, padding: '0 12px', border: '1px solid #dce5df', borderRadius: 7, fontSize: 12 };
const countPill = { fontSize: 11, padding: '6px 12px', border: '1px solid #e1e9e3', borderRadius: 20, color: '#61776d', background: '#fbfdfb' };
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 11 };
const thStyle = { textAlign: 'left', padding: '8px 10px', color: '#8aa097', fontSize: 9, fontWeight: 800, letterSpacing: 0.6, borderBottom: '1px solid #e1e9e3', whiteSpace: 'nowrap' };
const tdStyle = { padding: '9px 10px', borderBottom: '1px solid #edf1ee', color: '#3c5c50', whiteSpace: 'nowrap' };
const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(16,51,41,.27)', zIndex: 900 };
const detailPanel = { position: 'fixed', top: 0, right: 0, bottom: 0, width: 340, background: '#fff', boxShadow: '-10px 0 25px rgba(17,58,45,.12)', padding: '24px 20px', zIndex: 901, overflowY: 'auto' };
const closeBtn = { border: 0, background: 'transparent', color: '#7c8f87', fontSize: 16, cursor: 'pointer' };
