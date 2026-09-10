import { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const TONE_ICON = { amber: 'cloud', blue: 'route', green: 'report' };
const CAN_CREATE = ['field', 'logistics', 'official'];

export default function AlertsList({ notify }) {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: 'Route update', tone: 'blue', icon: 'route', title: '', text: '', road: '', severity: 'minor' });

  const load = () => api.alerts().then((res) => setAlerts(res.alerts)).catch((err) => setError(err.message));

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title || !form.text) return;
    try {
      await api.createAlert(form);
      setForm({ type: 'Route update', tone: 'blue', icon: 'route', title: '', text: '', road: '', severity: 'minor' });
      setShowForm(false);
      load();
      notify && notify('Alert published to the network.');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {CAN_CREATE.includes(user.role) && (
        <div>
          <button onClick={() => setShowForm((v) => !v)} style={toggleBtn}>{showForm ? 'Cancel' : '+ Raise an alert'}</button>
          {showForm && (
            <form onSubmit={submit} style={{ display: 'grid', gap: 10, marginTop: 12, padding: 14, border: '1px solid #e1e9e3', borderRadius: 8, background: '#fbfdfb' }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <select value={form.type} onChange={set('type')} style={inputStyle}>
                  <option>Weather watch</option><option>Route update</option><option>Field report</option>
                </select>
                <select value={form.tone} onChange={(e) => { const tone = e.target.value; setForm((p) => ({ ...p, tone, icon: TONE_ICON[tone] })); }} style={inputStyle}>
                  <option value="amber">Weather (amber)</option>
                  <option value="blue">Route (blue)</option>
                  <option value="green">Field (green)</option>
                </select>
                <select value={form.severity} onChange={set('severity')} style={inputStyle}>
                  <option value="minor">Minor</option><option value="moderate">Moderate</option><option value="severe">Severe</option>
                </select>
              </div>
              <input value={form.title} onChange={set('title')} placeholder="Alert title" style={inputStyle} required/>
              <textarea value={form.text} onChange={set('text')} placeholder="Details for the network" rows={2} style={{ ...inputStyle, height: 'auto', padding: 10 }} required/>
              <input value={form.road} onChange={set('road')} placeholder="Related road (optional, e.g. NH27)" style={inputStyle}/>
              <button type="submit" style={btnStyle}>Publish alert</button>
            </form>
          )}
        </div>
      )}
      {error && <p style={{ color: '#b54a3c', fontSize: 12, fontWeight: 700 }}>{error}</p>}
      <div style={{ display: 'grid', gap: 8 }}>
        {alerts.length === 0 && <p style={{ fontSize: 12, color: '#7c8f87' }}>No active alerts.</p>}
        {alerts.map((a) => (
          <div key={a.id} style={alertCard(a.tone)}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <b style={{ fontSize: 10, color: '#637c71' }}>{a.type}</b>
                <time style={{ fontSize: 9, color: '#a0aea7' }}>{new Date(a.createdAt).toLocaleString()}</time>
              </div>
              <h4 style={{ fontSize: 12, margin: '4px 0 2px', color: '#3c5c50' }}>{a.title}</h4>
              <p style={{ fontSize: 11, color: '#86978f', margin: 0 }}>{a.text}</p>
              {a.road && <span style={{ fontSize: 9, color: '#9bada3' }}>Road: {a.road}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const toggleBtn = { border: 0, background: '#1e745b', color: '#fff', borderRadius: 7, padding: '9px 16px', fontSize: 11, fontWeight: 800, cursor: 'pointer' };
const inputStyle = { height: 38, padding: '0 10px', border: '1px solid #dce5df', borderRadius: 7, fontSize: 12, flex: 1 };
const btnStyle = { height: 40, border: 0, borderRadius: 7, color: '#fff', background: '#1e745b', fontSize: 11, fontWeight: 800, cursor: 'pointer' };
const alertCard = (tone) => ({
  padding: '12px 14px', borderRadius: 8, border: '1px solid #e1e9e3',
  borderLeft: `4px solid ${tone === 'amber' ? '#e2ab3d' : tone === 'blue' ? '#3c779a' : '#337b60'}`,
  background: '#fff',
});
