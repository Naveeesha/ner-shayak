import { useEffect, useState } from 'react';
import api from '../services/api';

export default function DistrictDashboard({ notify }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = () => api.dashboardSummary().then(setData).catch((err) => setError(err.message));

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  if (error) return <p style={{ color: '#b54a3c', fontSize: 12, fontWeight: 700 }}>{error}</p>;
  if (!data) return <p style={{ fontSize: 12, color: '#7c8f87' }}>Loading regional briefing…</p>;

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <Stat label="Region access coverage" value={`${data.regionAccessCoveragePct}%`} />
        <Stat label="Active vehicles" value={`${data.activeVehicles} / ${data.totalVehicles}`} />
        <Stat label="Open field reports" value={data.openFieldReports} />
        <Stat label="Critical reports" value={data.criticalReports} tone={data.criticalReports > 0 ? 'danger' : 'ok'} />
      </div>

      <div>
        <h4 style={{ fontSize: 12, color: '#39735f', marginBottom: 8 }}>District-wise connectivity</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 8 }}>
          {data.districtConnectivity.map((d) => (
            <div key={d.nodeId} style={districtCard(d.status)}>
              <b style={{ fontSize: 11 }}>{d.name}</b>
              <span style={{ fontSize: 9, color: '#7c8f87' }}>{d.state}</span>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                <span style={{ fontSize: 16, fontWeight: 800 }}>{d.score}</span>
                <span style={statusPill(d.status)}>{d.status.replace('_', ' ')}</span>
              </div>
              {d.openReports > 0 && <span style={{ fontSize: 9, color: '#b5493a', marginTop: 4 }}>{d.openReports} open report(s)</span>}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 style={{ fontSize: 12, color: '#39735f', marginBottom: 8 }}>Logistics bottlenecks &amp; high-risk corridors</h4>
        {data.logisticsBottlenecks.length === 0 && <p style={{ fontSize: 12, color: '#7c8f87' }}>No significant bottlenecks detected right now.</p>}
        <div style={{ display: 'grid', gap: 6 }}>
          {data.logisticsBottlenecks.map((b, i) => (
            <div key={i} style={segmentStyle}>
              <span style={{ fontWeight: 700 }}>{b.from} → {b.to}</span>
              <span style={{ color: '#7c8f87' }}>{b.road} · {b.km} km</span>
              <span style={{ color: '#7c8f87' }}>{b.activeReports} report(s)</span>
              <span style={{ fontWeight: 800, color: b.riskScore > 50 ? '#b5493a' : '#bd7e22' }}>Risk {b.riskScore}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
        <Stat label="Shipments planned" value={data.shipments.planned} />
        <Stat label="In transit" value={data.shipments.inTransit} />
        <Stat label="Delayed" value={data.shipments.delayed} tone={data.shipments.delayed > 0 ? 'danger' : 'ok'} />
        <Stat label="Delivered" value={data.shipments.delivered} tone="ok" />
      </div>
      <p style={{ fontSize: 10, color: '#9bada3' }}>Generated {new Date(data.generatedAt).toLocaleString()}</p>
    </div>
  );
}

function Stat({ label, value, tone }) {
  return <div style={{ padding: '12px 14px', border: '1px solid #e1e9e3', borderRadius: 8, background: '#fbfdfb' }}>
    <div style={{ fontSize: 9, fontWeight: 800, color: '#8aa097', letterSpacing: 1 }}>{label.toUpperCase()}</div>
    <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4, color: tone === 'danger' ? '#b5493a' : tone === 'ok' ? '#1e745b' : '#25483d' }}>{value}</div>
  </div>;
}

const segmentStyle = { display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 12, padding: '10px 12px', border: '1px solid #edf1ee', borderRadius: 7, fontSize: 11, alignItems: 'center' };
const districtCard = (status) => ({
  padding: '10px 12px', borderRadius: 8, display: 'flex', flexDirection: 'column',
  border: `1px solid ${status === 'connected' ? '#d7e9dc' : status === 'partial' ? '#f2d9a6' : '#f3c9c2'}`,
  background: status === 'connected' ? '#f7fbf8' : status === 'partial' ? '#fffaf0' : '#fdf3f1',
});
const statusPill = (status) => ({
  padding: '3px 8px', borderRadius: 20, fontSize: 8, fontWeight: 800, textTransform: 'capitalize',
  color: status === 'connected' ? '#176d55' : status === 'partial' ? '#8a6b1f' : '#8a2c1f',
  background: status === 'connected' ? '#e6f4ea' : status === 'partial' ? '#fdf0d5' : '#fbe2dd',
});
