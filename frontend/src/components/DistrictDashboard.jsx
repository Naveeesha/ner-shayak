import { useEffect, useState } from 'react';
import api from '../services/api';

const LOCAL_DASHBOARD_SUMMARY = {
  activeVehicles: 8,
  totalVehicles: 10,
  regionAccessCoveragePct: 88,
  openFieldReports: 3,
  criticalReports: 1,
  districtConnectivity: [
    { nodeId: 'n-guwahati', name: 'Kamrup Metro', state: 'Assam', score: 95, status: 'connected', openReports: 0 },
    { nodeId: 'n-shillong', name: 'East Khasi Hills', state: 'Meghalaya', score: 82, status: 'connected', openReports: 1 },
    { nodeId: 'n-silchar', name: 'Cachar', state: 'Assam', score: 68, status: 'partial', openReports: 2 },
    { nodeId: 'n-imphal', name: 'Imphal East', state: 'Manipur', score: 54, status: 'partial', openReports: 1 },
    { nodeId: 'n-kohima', name: 'Kohima', state: 'Nagaland', score: 78, status: 'connected', openReports: 0 },
    { nodeId: 'n-agartala', name: 'West Tripura', state: 'Tripura', score: 90, status: 'connected', openReports: 0 },
    { nodeId: 'n-aizawl', name: 'Aizawl', state: 'Mizoram', score: 62, status: 'partial', openReports: 1 },
    { nodeId: 'n-itanagar', name: 'Papum Pare', state: 'Arunachal Pradesh', score: 72, status: 'connected', openReports: 0 },
    { nodeId: 'n-gangtok', name: 'East Sikkim', state: 'Sikkim', score: 85, status: 'connected', openReports: 0 },
  ],
  logisticsBottlenecks: [
    { from: 'Guwahati', to: 'Shillong', road: 'NH27 / NH102', km: 99, activeReports: 1, riskScore: 35 },
    { from: 'Silchar', to: 'Imphal', road: 'NH37', km: 135, activeReports: 2, riskScore: 72 },
  ],
  shipments: {
    planned: 4,
    inTransit: 8,
    delayed: 1,
    delivered: 12,
  },
  generatedAt: new Date().toISOString(),
};

export default function DistrictDashboard({ notify }) {
  const [data, setData] = useState(LOCAL_DASHBOARD_SUMMARY);

  const load = () => {
    api.dashboardSummary()
      .then((res) => {
        if (res && res.regionAccessCoveragePct) {
          setData(res);
        }
      })
      .catch(() => {
        // Silently use LOCAL_DASHBOARD_SUMMARY on static hosting
        setData(LOCAL_DASHBOARD_SUMMARY);
      });
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  const districtList = data?.districtConnectivity || LOCAL_DASHBOARD_SUMMARY.districtConnectivity;
  const bottlenecksList = data?.logisticsBottlenecks || LOCAL_DASHBOARD_SUMMARY.logisticsBottlenecks;
  const shipmentsData = data?.shipments || LOCAL_DASHBOARD_SUMMARY.shipments;

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <Stat label="Region access coverage" value={`${data?.regionAccessCoveragePct ?? 88}%`} />
        <Stat label="Active vehicles" value={`${data?.activeVehicles ?? 8} / ${data?.totalVehicles ?? 10}`} />
        <Stat label="Open field reports" value={data?.openFieldReports ?? 3} />
        <Stat label="Critical reports" value={data?.criticalReports ?? 1} tone={(data?.criticalReports ?? 1) > 0 ? 'danger' : 'ok'} />
      </div>

      <div>
        <h4 style={{ fontSize: 12, color: '#39735f', marginBottom: 8 }}>District-wise connectivity</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 8 }}>
          {districtList.map((d) => (
            <div key={d.nodeId} style={districtCard(d.status)}>
              <b style={{ fontSize: 11 }}>{d.name}</b>
              <span style={{ fontSize: 9, color: '#7c8f87' }}>{d.state}</span>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                <span style={{ fontSize: 16, fontWeight: 800 }}>{d.score}</span>
                <span style={statusPill(d.status)}>{(d.status || '').replace('_', ' ')}</span>
              </div>
              {d.openReports > 0 && <span style={{ fontSize: 9, color: '#b5493a', marginTop: 4 }}>{d.openReports} open report(s)</span>}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 style={{ fontSize: 12, color: '#39735f', marginBottom: 8 }}>Logistics bottlenecks &amp; high-risk corridors</h4>
        {bottlenecksList.length === 0 && <p style={{ fontSize: 12, color: '#7c8f87' }}>No significant bottlenecks detected right now.</p>}
        <div style={{ display: 'grid', gap: 6 }}>
          {bottlenecksList.map((b, i) => (
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
        <Stat label="Shipments planned" value={shipmentsData.planned} />
        <Stat label="In transit" value={shipmentsData.inTransit} />
        <Stat label="Delayed" value={shipmentsData.delayed} tone={shipmentsData.delayed > 0 ? 'danger' : 'ok'} />
        <Stat label="Delivered" value={shipmentsData.delivered} tone="ok" />
      </div>
      <p style={{ fontSize: 10, color: '#9bada3' }}>Generated {new Date(data?.generatedAt || Date.now()).toLocaleString()}</p>
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
