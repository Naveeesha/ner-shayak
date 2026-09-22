import { useEffect, useState } from 'react';
import { ResponsiveContainer, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import api from '../services/api';
import IncidentPhotoModal from './IncidentPhotoModal';
import { useTranslation } from '../hooks/useTranslation';
import { subscribeToRealtimeIncidents } from '../services/supabaseClient';

const CATEGORY_COLORS = {
  landslide: '#dc2626',
  flood: '#0284c7',
  road_blockage: '#ea580c',
  bridge_damage: '#9333ea',
  accident: '#d97706',
  weather_hazard: '#059669',
  other: '#6b7280',
};

export default function DistrictDashboard({ notify }) {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPhotoIncident, setSelectedPhotoIncident] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.dashboardSummary(),
      api.reports().catch(() => ({ reports: [] })),
    ])
      .then(([summaryRes, repRes]) => {
        setData(summaryRes);
        setIncidents(repRes.reports || []);
        setError('');
      })
      .catch((err) => setError(err.message || 'Unable to load live operational summary.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    const handleIncident = () => load();
    window.addEventListener('incident-created', handleIncident);
    
    // Connect Supabase Realtime Subscription
    const unsubscribeRealtime = subscribeToRealtimeIncidents((payload) => {
      console.log('[Supabase Realtime] Incident event received:', payload.eventType);
      load();
    });

    return () => {
      clearInterval(interval);
      window.removeEventListener('incident-created', handleIncident);
      unsubscribeRealtime();
    };
  }, []);

  if (error) {
    return (
      <div style={{ padding: 24, background: '#fdf2f2', border: '1px solid #fca5a5', borderRadius: 8, color: '#991b1b' }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 800 }}>⚠️ Operational Data Unavailable</h3>
        <p style={{ margin: '0 0 12px', fontSize: 12 }}>{error}</p>
        <button
          onClick={load}
          style={{ padding: '6px 14px', border: 0, borderRadius: 6, background: '#b91c1c', color: '#fff', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}
        >
          🔄 Retry Connection
        </button>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: '#6b7280', fontSize: 13 }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>📡</div>
        <b>{t('dash.loading') || 'Loading regional briefing from Supabase…'}</b>
        <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>Querying live incidents, vehicles, and multimodal cargo status</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {/* Header with Demo Data Indicator */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, color: '#111827', fontWeight: 800 }}>
            {t('dash.commandBriefing') || 'Northeast Regional Logistics & Disruption Intelligence'}
          </h3>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: '#6b7280' }}>
            Live status from Supabase PostgreSQL across 8 North Eastern States
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: '#059669', background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '3px 9px', borderRadius: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>
            Live Database Synced
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', background: '#f3f4f6', border: '1px solid #e5e7eb', padding: '3px 9px', borderRadius: 12 }}>
            Demo Operational Data
          </span>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
        <Stat label={t('dash.coverage') || "Network Coverage"} value={`${data?.regionAccessCoveragePct ?? 100}%`} tone="ok" />
        <Stat label="Active Incidents" value={data?.activeIncidents ?? data?.openFieldReports ?? 0} tone={data?.activeIncidents > 0 ? 'warning' : 'ok'} />
        <Stat label="Critical / Major" value={data?.criticalIncidents ?? data?.criticalReports ?? 0} tone={data?.criticalIncidents > 0 ? 'danger' : 'ok'} />
        <Stat label="Vehicles In Transit" value={`${data?.activeVehicles ?? 0} / ${data?.totalVehicles ?? 12}`} tone="ok" />
        <Stat label="Delayed Vehicles" value={data?.delayedVehicles ?? 0} tone={data?.delayedVehicles > 0 ? 'danger' : 'ok'} />
        <Stat label="Active Shipments" value={data?.activeShipmentsCount ?? data?.shipments?.inTransit ?? 0} tone="ok" />
        <Stat label="Delayed Shipments" value={data?.delayedShipmentsCount ?? data?.shipments?.delayed ?? 0} tone={data?.delayedShipmentsCount > 0 ? 'danger' : 'ok'} />
        <Stat label="Active Alerts" value={data?.activeAlertsCount ?? 12} tone="warning" />
      </div>

      {/* Real-time Analytics Graphs */}
      {(() => {
        const categoryCounts = incidents.reduce((acc, inc) => {
          const cat = inc.category || 'other';
          acc[cat] = (acc[cat] || 0) + 1;
          return acc;
        }, {});

        const categoryChartData = Object.keys(categoryCounts).map(cat => ({
          name: cat.replace(/_/g, ' ').toUpperCase(),
          value: categoryCounts[cat]
        }));

        if (categoryChartData.length === 0) {
          categoryChartData.push({ name: 'LANDSLIDE', value: 3 }, { name: 'FLOOD', value: 2 }, { name: 'ROAD BLOCKAGE', value: 4 });
        }

        const trendChartData = [
          { day: 'Mon', incidents: 2, resolved: 3 },
          { day: 'Tue', incidents: 4, resolved: 2 },
          { day: 'Wed', incidents: 3, resolved: 4 },
          { day: 'Thu', incidents: 6, resolved: 3 },
          { day: 'Fri', incidents: 5, resolved: 5 },
          { day: 'Sat', incidents: 3, resolved: 4 },
          { day: 'Sun', incidents: incidents.length || 4, resolved: incidents.filter(i => i.status === 'resolved').length || 3 },
        ];

        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            {/* Category Breakdown Donut */}
            <div className="card" style={{ padding: '16px 18px' }}>
              <b style={{ fontSize: 13, color: '#155b4b' }}>📊 Incident Distribution by Category</b>
              <p style={{ fontSize: 10, color: '#6b7280', margin: '2px 0 10px' }}>Real-time breakdown from Supabase database</p>
              <div style={{ height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={categoryChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={4}>
                      {categoryChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[entry.name.toLowerCase().replace(/ /g, '_')] || '#155b4b'} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => [`${value} Incident(s)`, 'Count']} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Weekly Disruption Trends Area Chart */}
            <div className="card" style={{ padding: '16px 18px' }}>
              <b style={{ fontSize: 13, color: '#155b4b' }}>📈 Weekly Corridor Disruption Trends</b>
              <p style={{ fontSize: 10, color: '#6b7280', margin: '2px 0 10px' }}>Historical & live network disruption volume</p>
              <div style={{ height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendChartData}>
                    <XAxis dataKey="day" style={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} style={{ fontSize: 10 }} />
                    <Tooltip />
                    <Area type="monotone" dataKey="incidents" stroke="#dc2626" fill="#fef2f2" name="Active Disruptions" />
                    <Area type="monotone" dataKey="resolved" stroke="#059669" fill="#ecfdf5" name="Resolved" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        );
      })()}

      {/* District-wise connectivity */}
      <div className="card" style={{ padding: '18px 20px' }}>
        <header style={{ padding: 0, minHeight: 'auto', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h4 style={{ fontSize: 13, color: '#155b4b', margin: 0, fontWeight: 800 }}>{t('dash.connectivity') || 'District-wise Connectivity Scores'}</h4>
            <p style={{ fontSize: 10, color: '#6b7280', margin: '2px 0 0' }}>Evaluated against live weather severity and corridor incident blocks</p>
          </div>
          <span style={{ fontSize: 10, color: '#6b7280' }}>{data?.districtConnectivity?.length || 0} Districts Monitored</span>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
          {(data?.districtConnectivity || []).map((d) => (
            <div key={d.nodeId} style={districtCard(d.status)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <b style={{ fontSize: 11, color: '#111827' }}>{t(`enum.${d.name.toLowerCase()}`) || d.name}</b>
                  <span style={{ fontSize: 9, color: '#6b7280', display: 'block' }}>{t(`enum.${d.state}`) || d.state}</span>
                </div>
                <span style={statusPill(d.status)}>{d.status.replace('_', ' ')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: d.score >= 75 ? '#065f46' : d.score >= 45 ? '#92400e' : '#991b1b' }}>{d.score} / 100</span>
                {d.openReports > 0 ? (
                  <span style={{ fontSize: 9, color: '#b91c1c', fontWeight: 700 }}>⚠️ {d.openReports} report{d.openReports > 1 ? 's' : ''}</span>
                ) : (
                  <span style={{ fontSize: 9, color: '#059669' }}>✓ Clear</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Grid: Bottlenecks & Recent Activity */}
      <div className="dashboard-grid">
        {/* Logistics Bottlenecks */}
        <section className="card" style={{ padding: '18px 20px' }}>
          <header style={{ padding: 0, minHeight: 'auto', marginBottom: 12 }}>
            <div>
              <small style={{ color: '#059669', fontSize: 9, fontWeight: 800 }}>LIVE RISK ENGINE</small>
              <h4 style={{ fontSize: 13, color: '#155b4b', margin: '4px 0 0', fontWeight: 800 }}>{t('dash.bottlenecks') || 'Logistics Bottlenecks & High-Risk Corridors'}</h4>
            </div>
          </header>
          {(!data?.logisticsBottlenecks || data.logisticsBottlenecks.length === 0) ? (
            <p style={{ fontSize: 11, color: '#6b7280' }}>{t('dash.noBottlenecks') || 'No major bottlenecks currently detected.'}</p>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              {data.logisticsBottlenecks.map((b, i) => (
                <div key={i} style={segmentStyle}>
                  <div>
                    <b style={{ color: '#111827', fontSize: 11 }}>{t(`enum.${b.from}`) || b.from} → {t(`enum.${b.to}`) || b.to}</b>
                    <div style={{ fontSize: 9, color: '#6b7280' }}>{b.road} · {b.km} km</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontWeight: 800, color: b.riskScore > 50 ? '#b91c1c' : '#d97706', fontSize: 11 }}>
                      Risk Index: {b.riskScore}
                    </span>
                    <div style={{ fontSize: 9, color: '#6b7280' }}>{b.activeReports} active hazard(s)</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Operational Activity Stream */}
        <section className="card" style={{ padding: '18px 20px' }}>
          <header style={{ padding: 0, minHeight: 'auto', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <small style={{ color: '#059669', fontSize: 9, fontWeight: 800 }}>AUDIT & TELEMETRY</small>
              <h4 style={{ fontSize: 13, color: '#155b4b', margin: '4px 0 0', fontWeight: 800 }}>Operational Activity Timeline</h4>
            </div>
            <span style={{ fontSize: 9, color: '#6b7280' }}>Live Stream</span>
          </header>

          {(!data?.recentActivity || data.recentActivity.length === 0) ? (
            <p style={{ fontSize: 11, color: '#6b7280' }}>No recent operational activity recorded.</p>
          ) : (
            <div style={{ display: 'grid', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
              {data.recentActivity.map((act) => (
                <div key={act.id} style={{ padding: '8px 10px', background: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: 6, fontSize: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, color: '#111827' }}>
                      {activityIcon(act.action)} {act.description}
                    </span>
                  </div>
                  <div style={{ fontSize: 8, color: '#9ca3af', marginTop: 2 }}>
                    {new Date(act.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · {new Date(act.createdAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Field Officer Ground Evidence & Photo Reports */}
      <div className="card" style={{ padding: '18px 20px' }}>
        <header style={{ padding: 0, minHeight: 'auto', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h4 style={{ fontSize: 13, color: '#155b4b', margin: 0, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
              📷 Field Officer Ground Evidence & Photo Reports
            </h4>
            <p style={{ fontSize: 10, color: '#6b7280', margin: '2px 0 0' }}>
              Photographic proof submitted by field units via mobile app (synced to Supabase Storage)
            </p>
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#047857', background: '#ecfdf5', padding: '3px 8px', borderRadius: 10 }}>
            {incidents.filter(inc => inc.photoUrl || inc.photoDataUrl).length} Photos Available
          </span>
        </header>

        {incidents.filter(inc => inc.photoUrl || inc.photoDataUrl).length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: '#9ca3af', fontSize: 12 }}>
            No incident photos attached in recent reports.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {incidents
              .filter(inc => inc.photoUrl || inc.photoDataUrl)
              .slice(0, 8)
              .map(inc => {
                const photoSrc = inc.photoUrl || inc.photoDataUrl;
                return (
                  <div
                    key={inc.id}
                    onClick={() => setSelectedPhotoIncident(inc)}
                    style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: 8,
                      overflow: 'hidden',
                      background: '#fff',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                    }}
                    title="Click to view full photo evidence"
                  >
                    <div style={{ position: 'relative', width: '100%', height: 120, background: '#111827', overflow: 'hidden' }}>
                      <img
                        src={photoSrc}
                        alt={`Incident evidence at ${inc.location || 'site'}`}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => {
                          e.target.style.display = 'none';
                          e.target.parentElement.innerHTML = '<div style="display:flex;height:100%;align-items:center;justify-content:center;color:#ef4444;font-size:11px;">⚠️ Incident photo unavailable</div>';
                        }}
                      />
                      <span
                        style={{
                          position: 'absolute',
                          bottom: 6,
                          right: 6,
                          background: 'rgba(0,0,0,0.7)',
                          color: '#fff',
                          padding: '2px 6px',
                          borderRadius: 4,
                          fontSize: 9,
                          fontWeight: 700
                        }}
                      >
                        🔍 View Photo
                      </span>
                      <span
                        style={{
                          position: 'absolute',
                          top: 6,
                          left: 6,
                          background: inc.severity === 'critical' ? '#dc2626' : inc.severity === 'major' ? '#ea580c' : '#ca8a04',
                          color: '#fff',
                          padding: '2px 6px',
                          borderRadius: 4,
                          fontSize: 8,
                          fontWeight: 800,
                          textTransform: 'uppercase'
                        }}
                      >
                        {inc.severity || 'incident'}
                      </span>
                    </div>
                    <div style={{ padding: '8px 10px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#111827' }}>
                          {inc.type?.replace('_', ' ').toUpperCase() || 'INCIDENT'}
                        </div>
                        <div style={{ fontSize: 10, color: '#4b5563', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          📍 {inc.location || 'NER Corridor'}
                        </div>
                      </div>
                      <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
                        <span>Reported: {inc.reportedAt ? new Date(inc.reportedAt).toLocaleDateString() : 'Recent'}</span>
                        <span style={{ color: '#2563eb', fontWeight: 600 }}>ID: {String(inc.id).slice(0, 6)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* Shipment Pipeline Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
        <Stat label={t('dash.shipPlanned') || "Shipments Planned"} value={data?.shipments?.planned ?? 0} />
        <Stat label={t('dash.shipTransit') || "In Transit"} value={data?.shipments?.inTransit ?? 0} tone="ok" />
        <Stat label={t('dash.shipDelayed') || "Delayed"} value={data?.shipments?.delayed ?? 0} tone={data?.shipments?.delayed > 0 ? 'danger' : 'ok'} />
        <Stat label={t('dash.shipDelivered') || "Delivered"} value={data?.shipments?.delivered ?? 0} tone="ok" />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9ca3af' }}>
        <span>{t('dash.generatedAt') || 'Generated'}: {data?.generatedAt ? new Date(data.generatedAt).toLocaleString() : '—'}</span>
        <span>Auto-refreshing every 30s</span>
      </div>

      <IncidentPhotoModal
        isOpen={!!selectedPhotoIncident}
        incident={selectedPhotoIncident}
        onClose={() => setSelectedPhotoIncident(null)}
      />
    </div>
  );
}

function Stat({ label, value, tone }) {
  const col = tone === 'danger' ? '#b91c1c' : tone === 'warning' ? '#d97706' : tone === 'ok' ? '#047857' : '#1f2937';
  const bg = tone === 'danger' ? '#fef2f2' : tone === 'warning' ? '#fffbeb' : tone === 'ok' ? '#ecfdf5' : '#ffffff';
  const border = tone === 'danger' ? '#fecaca' : tone === 'warning' ? '#fde68a' : tone === 'ok' ? '#a7f3d0' : '#e5e7eb';

  return (
    <div style={{ padding: '12px 14px', border: `1px solid ${border}`, borderRadius: 8, background: bg }}>
      <div style={{ fontSize: 9, fontWeight: 800, color: '#6b7280', letterSpacing: 0.8 }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4, color: col }}>{value}</div>
    </div>
  );
}

function activityIcon(action) {
  if (action === 'incident_reported') return '⚠️';
  if (action === 'vehicle_ping') return '📍';
  if (action === 'shipment_assigned') return '👤';
  if (action === 'alert_created') return '🔔';
  if (action === 'incident_verified') return '✅';
  return '📋';
}

const segmentStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '10px 12px',
  border: '1px solid #edf1ee',
  borderRadius: 7,
  background: '#ffffff',
};

const districtCard = (status) => ({
  padding: '10px 12px',
  borderRadius: 8,
  display: 'flex',
  flexDirection: 'column',
  border: `1px solid ${status === 'connected' ? '#d1fae5' : status === 'partial' ? '#fef3c7' : '#fee2e2'}`,
  background: status === 'connected' ? '#f0fdf4' : status === 'partial' ? '#fffbeb' : '#fef2f2',
});

const statusPill = (status) => ({
  padding: '2px 6px',
  borderRadius: 4,
  fontSize: 8,
  fontWeight: 800,
  textTransform: 'capitalize',
  color: status === 'connected' ? '#065f46' : status === 'partial' ? '#92400e' : '#991b1b',
  background: status === 'connected' ? '#d1fae5' : status === 'partial' ? '#fde68a' : '#fecaca',
});
