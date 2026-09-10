import { useEffect, useRef, useState } from 'react';
import api from '../services/api';

export default function VehicleTracker({ notify }) {
  const [vehicles, setVehicles] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [form, setForm] = useState({ vehicleNumber: '', cargoType: '', originNode: '', destinationNode: '' });
  const [tracking, setTracking] = useState({}); // vehicleId -> bool
  const watchers = useRef({});

  const load = () => api.vehicles().then((res) => setVehicles(res.vehicles)).catch(() => {});

  useEffect(() => {
    api.nodes().then((res) => setNodes(res.nodes));
    load();
    const interval = setInterval(load, 15000);
    const watcherMap = watchers.current;
    return () => {
      clearInterval(interval);
      Object.values(watcherMap).forEach((id) => navigator.geolocation?.clearWatch(id));
    };
  }, []);

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const registerVehicle = async (e) => {
    e.preventDefault();
    if (!form.vehicleNumber || !form.originNode || !form.destinationNode) return;
    try {
      const res = await api.createVehicle(form);
      setVehicles((prev) => [res.vehicle, ...prev]);
      setForm({ vehicleNumber: '', cargoType: '', originNode: '', destinationNode: '' });
      notify && notify(`${res.vehicle.vehicleNumber} registered for live tracking.`);
    } catch (err) {
      notify && notify(`Could not register vehicle: ${err.message}`);
    }
  };

  const toggleTracking = (vehicle) => {
    const isTracking = !!watchers.current[vehicle.id];
    if (isTracking) {
      navigator.geolocation.clearWatch(watchers.current[vehicle.id]);
      delete watchers.current[vehicle.id];
      setTracking((prev) => ({ ...prev, [vehicle.id]: false }));
      return;
    }
    if (!navigator.geolocation) { notify && notify('GPS is not available on this device.'); return; }
    const id = navigator.geolocation.watchPosition(
      async (pos) => {
        try {
          const res = await api.pingVehicle(vehicle.id, { lat: pos.coords.latitude, lng: pos.coords.longitude });
          setVehicles((prev) => prev.map((v) => (v.id === vehicle.id ? res.vehicle : v)));
        } catch (_) { /* transient network error, will retry on next fix */ }
      },
      () => notify && notify('Could not read GPS position.'),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    );
    watchers.current[vehicle.id] = id;
    setTracking((prev) => ({ ...prev, [vehicle.id]: true }));
  };

  const nodeName = (id) => nodes.find((n) => n.id === id)?.name || id;

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <form onSubmit={registerVehicle} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
        <label style={labelStyle}>Vehicle number<input value={form.vehicleNumber} onChange={set('vehicleNumber')} style={inputStyle} placeholder="AS 01 K 4309" required/></label>
        <label style={labelStyle}>Cargo<input value={form.cargoType} onChange={set('cargoType')} style={inputStyle} placeholder="Medical supplies"/></label>
        <label style={labelStyle}>Origin
          <select value={form.originNode} onChange={set('originNode')} style={inputStyle} required>
            <option value="">Select…</option>
            {nodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        </label>
        <label style={labelStyle}>Destination
          <select value={form.destinationNode} onChange={set('destinationNode')} style={inputStyle} required>
            <option value="">Select…</option>
            {nodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        </label>
        <button type="submit" style={btnStyle}>Register</button>
      </form>

      <div style={{ display: 'grid', gap: 8 }}>
        {vehicles.length === 0 && <p style={{ fontSize: 12, color: '#7c8f87' }}>No vehicles registered yet.</p>}
        {vehicles.map((v) => (
          <div key={v.id} style={cardStyle}>
            <div>
              <b style={{ fontSize: 12, color: '#25483d' }}>{v.vehicleNumber}</b>
              <div style={{ fontSize: 10, color: '#7c8f87', marginTop: 2 }}>{v.cargoType || 'General cargo'} · {nodeName(v.originNode)} → {nodeName(v.destinationNode)}</div>
              <div style={{ fontSize: 9, color: '#9bada3', marginTop: 2 }}>
                {v.lat ? `Last position: ${Number(v.lat).toFixed(4)}, ${Number(v.lng).toFixed(4)}` : 'No GPS fix yet'} · {new Date(v.lastUpdated).toLocaleTimeString()}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={statusPill(v.status)}>{v.status.replace('_', ' ')}</span>
              <button onClick={() => toggleTracking(v)} style={tracking[v.id] ? stopBtn : startBtn}>
                {tracking[v.id] ? 'Stop GPS' : 'Start GPS'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const labelStyle = { display: 'grid', gap: 6, fontSize: 11, fontWeight: 800, color: '#3f5951' };
const inputStyle = { height: 40, padding: '0 10px', border: '1px solid #dce5df', borderRadius: 7, fontSize: 12 };
const btnStyle = { height: 40, padding: '0 16px', border: 0, borderRadius: 7, color: '#fff', background: '#1e745b', fontSize: 11, fontWeight: 800, cursor: 'pointer' };
const cardStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', border: '1px solid #e1e9e3', borderRadius: 8, background: '#fff' };
const startBtn = { border: 0, background: '#1e745b', color: '#fff', borderRadius: 6, padding: '7px 12px', fontSize: 10, fontWeight: 800, cursor: 'pointer' };
const stopBtn = { border: 0, background: '#b5493a', color: '#fff', borderRadius: 6, padding: '7px 12px', fontSize: 10, fontWeight: 800, cursor: 'pointer' };
const statusPill = (status) => ({
  padding: '4px 10px', borderRadius: 20, fontSize: 9, fontWeight: 800, textTransform: 'capitalize',
  color: status === 'in_transit' ? '#176d55' : status === 'delayed' ? '#b5493a' : '#61776d',
  background: status === 'in_transit' ? '#e6f4ea' : status === 'delayed' ? '#fbe9e6' : '#f1f5f2',
});
