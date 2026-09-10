import { useEffect, useState } from 'react';
import api from '../services/api';
import { offlineQueue, isOnline } from '../services/offlineQueue';

const CATEGORIES = [
  { id: 'road_block', label: 'Road blocked' },
  { id: 'landslide', label: 'Landslide' },
  { id: 'flood', label: 'Flooding' },
  { id: 'bridge_damage', label: 'Bridge damage' },
  { id: 'accident', label: 'Accident' },
  { id: 'traffic', label: 'Heavy traffic' },
  { id: 'other', label: 'Other' },
];
const SEVERITIES = ['low', 'medium', 'high', 'critical'];

export default function FieldReportForm({ notify }) {
  const [nodes, setNodes] = useState([]);
  const [form, setForm] = useState({ category: 'road_block', severity: 'medium', title: '', description: '', road: '', fromNode: '', toNode: '' });
  const [coords, setCoords] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [queued, setQueued] = useState(offlineQueue.count());
  const [myReports, setMyReports] = useState([]);

  useEffect(() => {
    api.nodes().then((res) => setNodes(res.nodes)).catch(() => {});
    api.myReports().then((res) => setMyReports(res.reports)).catch(() => {});
  }, []);

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const captureLocation = () => {
    if (!navigator.geolocation) { setError('Location services are not available on this device.'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setError('Could not access device location. You can still submit without it.'),
    );
  };

  const onPhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result);
    reader.readAsDataURL(file);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { setError('Please give the report a short title.'); return; }
    setError('');
    setBusy(true);
    const payload = { ...form, lat: coords?.lat, lng: coords?.lng, photoDataUrl: photo, createdAt: new Date().toISOString() };
    try {
      if (isOnline()) {
        const res = await api.createReport(payload);
        setMyReports((prev) => [res.report, ...prev]);
        notify && notify('Field report submitted and visible to the network.');
      } else {
        offlineQueue.add(payload);
        setQueued(offlineQueue.count());
        notify && notify('You are offline — report saved locally and will sync automatically.');
      }
      setForm({ category: 'road_block', severity: 'medium', title: '', description: '', road: '', fromNode: '', toNode: '' });
      setCoords(null);
      setPhoto(null);
    } catch (err) {
      // network failed even though isOnline() said true — fall back to the offline queue
      offlineQueue.add(payload);
      setQueued(offlineQueue.count());
      setError(`Couldn't reach the server (${err.message}) — saved locally instead.`);
    } finally {
      setBusy(false);
    }
  };

  const syncNow = async () => {
    setBusy(true);
    try {
      const res = await offlineQueue.flush(api);
      setQueued(offlineQueue.count());
      notify && notify(`Synced ${res.synced} offline report(s).`);
      const fresh = await api.myReports();
      setMyReports(fresh.reports);
    } catch (err) {
      setError(`Sync failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {queued > 0 && (
        <div style={queuedBanner}>
          <span>{queued} report{queued > 1 ? 's' : ''} saved offline, waiting to sync.</span>
          <button onClick={syncNow} disabled={busy} style={syncBtn}>Sync now</button>
        </div>
      )}
      <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        <div style={rowStyle}>
          <label style={labelStyle}>Category
            <select value={form.category} onChange={set('category')} style={selectStyle}>
              {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
          <label style={labelStyle}>Severity
            <select value={form.severity} onChange={set('severity')} style={selectStyle}>
              {SEVERITIES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
            </select>
          </label>
        </div>
        <label style={labelStyle}>Title<input value={form.title} onChange={set('title')} type="text" placeholder="e.g. Landslide blocking one lane near Jowai" style={inputStyle} required/></label>
        <label style={labelStyle}>Description<textarea value={form.description} onChange={set('description')} rows={3} style={{ ...inputStyle, height: 'auto', padding: 10 }} placeholder="What field teams and drivers should know"/></label>
        <div style={rowStyle}>
          <label style={labelStyle}>Road / highway<input value={form.road} onChange={set('road')} type="text" placeholder="NH27" style={inputStyle}/></label>
          <label style={labelStyle}>Between
            <div style={{ display: 'flex', gap: 6 }}>
              <select value={form.fromNode} onChange={set('fromNode')} style={selectStyle}>
                <option value="">From…</option>
                {nodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
              <select value={form.toNode} onChange={set('toNode')} style={selectStyle}>
                <option value="">To…</option>
                {nodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
            </div>
          </label>
        </div>
        <div style={rowStyle}>
          <button type="button" onClick={captureLocation} style={secondaryBtn}>{coords ? `📍 ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}` : 'Attach GPS location'}</button>
          <label style={secondaryBtn}>{photo ? '✓ Photo attached' : 'Attach photo'}<input type="file" accept="image/*" onChange={onPhoto} style={{ display: 'none' }}/></label>
        </div>
        {error && <p style={{ color: '#b54a3c', fontSize: 12, fontWeight: 700 }}>{error}</p>}
        <button disabled={busy} type="submit" style={btnStyle}>{busy ? 'Submitting…' : isOnline() ? 'Submit report' : 'Save offline (will sync later)'}</button>
      </form>

      {myReports.length > 0 && (
        <div>
          <h4 style={{ fontSize: 12, color: '#39735f', marginBottom: 8 }}>Your recent reports</h4>
          <div style={{ display: 'grid', gap: 6 }}>
            {myReports.slice(0, 6).map((r) => (
              <div key={r.id} style={segmentStyle}>
                <span style={{ fontWeight: 700 }}>{r.title}</span>
                <span style={{ color: '#7c8f87', textTransform: 'capitalize' }}>{r.category.replace('_', ' ')}</span>
                <span style={{ color: '#7c8f87' }}>{r.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const rowStyle = { display: 'flex', gap: 12, flexWrap: 'wrap' };
const labelStyle = { display: 'grid', gap: 6, fontSize: 11, fontWeight: 800, color: '#3f5951', flex: 1, minWidth: 180 };
const inputStyle = { height: 43, padding: '0 13px', border: '1px solid #dce5df', borderRadius: 7, fontSize: 13, width: '100%' };
const selectStyle = { height: 43, padding: '0 12px', border: '1px solid #dce5df', borderRadius: 7, fontSize: 13, width: '100%' };
const btnStyle = { height: 45, padding: '0 18px', border: 0, borderRadius: 7, color: '#fff', background: '#1e745b', fontSize: 12, fontWeight: 800, cursor: 'pointer' };
const secondaryBtn = { display: 'inline-flex', alignItems: 'center', height: 38, padding: '0 14px', border: '1px solid #dce5df', borderRadius: 7, background: '#fff', color: '#39735f', fontSize: 11, fontWeight: 800, cursor: 'pointer' };
const segmentStyle = { display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, padding: '10px 12px', border: '1px solid #edf1ee', borderRadius: 7, fontSize: 11, alignItems: 'center' };
const queuedBanner = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', border: '1px solid #f2d9a6', borderRadius: 8, background: '#fff8e8', fontSize: 11, fontWeight: 700, color: '#8a6b1f' };
const syncBtn = { border: 0, background: '#8a6b1f', color: '#fff', borderRadius: 6, padding: '6px 12px', fontSize: 10, fontWeight: 800, cursor: 'pointer' };
