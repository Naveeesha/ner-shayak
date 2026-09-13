import { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import VehicleTracker from './VehicleTracker';

export default function LogisticsOverview({ navigate, notify }) {
  const { user } = useAuth();
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.shipments()
      .then((sRes) => {
        setShipments(sRes.shipments || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const planned = shipments.filter((s) => s.status === 'planned').length;
  const inTransit = shipments.filter((s) => s.status === 'in_transit').length;
  const delivered = shipments.filter((s) => s.status === 'delivered').length;

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {/* Logistics Operator Banner */}
      <section className="card" style={{ padding: '18px 20px', background: 'linear-gradient(135deg, #1b5344, #123d32)', color: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.5, color: '#b9ead7' }}>LOGISTICS OPERATOR CONTROL ROOM</div>
            <h2 style={{ color: '#fff', fontSize: 20, margin: '4px 0 2px' }}>{user.name}</h2>
            <div style={{ fontSize: 11, color: '#d2f2e5' }}>
              Company: <b>{user.organisation || 'NER Freight Movers'}</b> · Hub: <b>{user.hub || 'Khanapara Hub'}</b>
            </div>
          </div>
          <button onClick={() => navigate('Route planner')} style={{ padding: '9px 15px', border: 0, borderRadius: 7, background: '#ccf363', color: '#12483a', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>
            + Plan Cargo Shipment
          </button>
        </div>
      </section>

      {/* Shipment Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
        <StatCard label="TOTAL SHIPMENTS" value={shipments.length} color="#176d55" />
        <StatCard label="IN TRANSIT" value={inTransit} color="#2b765e" />
        <StatCard label="PLANNED" value={planned} color="#bd7e22" />
        <StatCard label="DELIVERED" value={delivered} color="#3c5c50" />
      </div>

      <div className="dashboard-grid">
        {/* Fleet Vehicle Tracker */}
        <section className="card" style={{ padding: '20px' }}>
          <header style={{ padding: 0, minHeight: 'auto', marginBottom: 14 }}>
            <div>
              <small>ACTIVE FLEET GPS</small>
              <h3 style={{ marginTop: 4, color: '#25483d', fontSize: 16 }}>Vehicles & Telemetry</h3>
            </div>
          </header>
          <VehicleTracker notify={notify} />
        </section>

        {/* Active Shipments List */}
        <section className="card" style={{ padding: '20px' }}>
          <small style={{ color: '#8aa097', fontSize: 9, fontWeight: 800 }}>CARGO DISPATCH QUEUE</small>
          <h3 style={{ margin: '6px 0 14px', fontSize: 16, color: '#25483d' }}>Active Shipments</h3>
          {loading && <p style={{ fontSize: 11, color: '#7c8f87' }}>Loading shipments…</p>}
          {!loading && shipments.length === 0 && (
            <p style={{ fontSize: 11, color: '#7c8f87' }}>No cargo shipments currently logged. Use the route planner to schedule new shipments.</p>
          )}
          <div style={{ display: 'grid', gap: 10 }}>
            {shipments.slice(0, 6).map((s) => (
              <div key={s.id} style={{ padding: '10px 12px', border: '1px solid #edf1ee', borderRadius: 8, background: '#fbfdfb' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#25483d' }}>
                  <b>{s.originNode.toUpperCase()} → {s.destinationNode.toUpperCase()}</b>
                  <span style={statusPill(s.status)}>{s.status.replace('_', ' ')}</span>
                </div>
                <div style={{ fontSize: 10, color: '#7c8f87', marginTop: 4 }}>
                  Cargo: {s.cargoType || 'General Cargo'} · Priority: {s.priority} · ETA: {s.etaMinutes ? `${Math.floor(s.etaMinutes/60)}h ${s.etaMinutes%60}m` : '—'}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ padding: '14px 16px', border: '1px solid #e1e9e3', borderRadius: 8, background: '#fff' }}>
      <div style={{ fontSize: 9, fontWeight: 800, color: '#8aa097', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || '#25483d', marginTop: 4 }}>{value}</div>
    </div>
  );
}

function statusPill(s) {
  return {
    padding: '2px 6px', borderRadius: 4, fontSize: 8, fontWeight: 800, textTransform: 'uppercase',
    color: s === 'in_transit' ? '#176d55' : s === 'delivered' ? '#2b765e' : '#bd7e22',
    background: s === 'in_transit' ? '#e6f4ea' : s === 'delivered' ? '#edf8f1' : '#fff5da',
  };
}
