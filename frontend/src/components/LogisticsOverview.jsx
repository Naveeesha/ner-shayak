import { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import VehicleTracker from './VehicleTracker';
import DriverAssignModal from './DriverAssignModal';
import { DRIVER_ROSTER } from '../services/driverService';

export default function LogisticsOverview({ navigate, notify }) {
  const { user } = useAuth();
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [assignedDrivers, setAssignedDrivers] = useState({});

  const load = () => {
    setLoading(true);
    api.shipments()
      .then((sRes) => {
        setShipments(sRes.shipments || []);
      })
      .catch(() => {
        // Mock fallback shipments if offline
        setShipments([
          { id: 'shp-101', originNode: 'guwahati', destinationNode: 'shillong', cargoType: 'Medical Vaccines', priority: 'high', status: 'in_transit', etaMinutes: 165 },
          { id: 'shp-102', originNode: 'guwahati', destinationNode: 'jorhat', cargoType: 'Grain & Food Rations', priority: 'normal', status: 'planned', etaMinutes: 280 },
          { id: 'shp-103', originNode: 'silchar', destinationNode: 'agartala', cargoType: 'Heavy Infrastructure Parts', priority: 'high', status: 'in_transit', etaMinutes: 310 },
          { id: 'shp-104', originNode: 'tezpur', destinationNode: 'itanagar', cargoType: 'Relief Cargo', priority: 'critical', status: 'planned', etaMinutes: 190 },
        ]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const openAssignModal = (shp) => {
    setSelectedShipment({
      id: shp.id,
      title: `Shipment #${shp.id.slice(0, 7)}`,
      origin: shp.originNode.toUpperCase(),
      dest: shp.destinationNode.toUpperCase(),
    });
    setAssignModalOpen(true);
  };

  const handleDriverAssigned = (driver, shp) => {
    setAssignedDrivers((prev) => ({ ...prev, [shp.id]: driver }));
  };

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
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setAssignModalOpen(true)} style={{ padding: '9px 15px', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 7, background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>
              👤 Assign Driver (10 Roster)
            </button>
            <button onClick={() => navigate('Route planner')} style={{ padding: '9px 15px', border: 0, borderRadius: 7, background: '#ccf363', color: '#12483a', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>
              + Plan Cargo Shipment
            </button>
          </div>
        </div>
      </section>

      {/* Shipment Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
        <StatCard label="TOTAL SHIPMENTS" value={shipments.length} color="#176d55" />
        <StatCard label="IN TRANSIT" value={inTransit} color="#2b765e" />
        <StatCard label="PLANNED" value={planned} color="#bd7e22" />
        <StatCard label="REGISTERED DRIVERS" value="10 Active" color="#3c5c50" />
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

        {/* Active Shipments List with Driver Assignment */}
        <section className="card" style={{ padding: '20px' }}>
          <small style={{ color: '#8aa097', fontSize: 9, fontWeight: 800 }}>CARGO DISPATCH QUEUE</small>
          <h3 style={{ margin: '6px 0 14px', fontSize: 16, color: '#25483d' }}>Active Shipments & Drivers</h3>
          {loading && <p style={{ fontSize: 11, color: '#7c8f87' }}>Loading shipments…</p>}
          {!loading && shipments.length === 0 && (
            <p style={{ fontSize: 11, color: '#7c8f87' }}>No cargo shipments currently logged. Use the route planner to schedule new shipments.</p>
          )}
          <div style={{ display: 'grid', gap: 10 }}>
            {shipments.slice(0, 6).map((s, idx) => {
              const assignedDriver = assignedDrivers[s.id] || DRIVER_ROSTER[idx % 10];
              return (
                <div key={s.id} style={{ padding: '12px 14px', border: '1px solid #edf1ee', borderRadius: 8, background: '#fbfdfb' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#25483d' }}>
                    <b>{s.originNode.toUpperCase()} → {s.destinationNode.toUpperCase()}</b>
                    <span style={statusPill(s.status)}>{s.status.replace('_', ' ')}</span>
                  </div>
                  <div style={{ fontSize: 10, color: '#7c8f87', marginTop: 4 }}>
                    Cargo: {s.cargoType || 'General Cargo'} · Priority: {s.priority} · ETA: {s.etaMinutes ? `${Math.floor(s.etaMinutes/60)}h ${s.etaMinutes%60}m` : '—'}
                  </div>

                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed #e2ede6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 10, color: '#165744', fontWeight: 700 }}>
                      👤 Driver: <b>{assignedDriver.name}</b> ({assignedDriver.vehicleNumber})
                    </div>
                    <button
                      onClick={() => openAssignModal(s)}
                      style={{ padding: '4px 9px', border: '1px solid #c0d8cb', borderRadius: 5, background: '#f0f9f4', color: '#176d55', fontSize: 9, fontWeight: 800, cursor: 'pointer' }}
                    >
                      Reassign Driver ➔
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Driver Assignment Modal */}
      <DriverAssignModal
        isOpen={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        targetItem={selectedShipment || { title: 'Cargo Shipment' }}
        onDriverAssigned={handleDriverAssigned}
        notify={notify}
      />
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
