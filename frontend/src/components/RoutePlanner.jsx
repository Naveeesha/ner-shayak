import { useEffect, useState } from 'react';
import api from '../services/api';
import LiveMap from './LiveMap';
import { NODES as LOCAL_NODES, computeSafetyRoute } from '../services/routeCalculator';
import { useTranslation } from '../hooks/useTranslation';

export default function RoutePlanner({ notify }) {
  const { t } = useTranslation();
  const [nodes, setNodes] = useState(LOCAL_NODES);
  const [origin, setOrigin] = useState('guwahati');
  const [destination, setDestination] = useState('jorhat');
  
  const [cargoType, setCargoType] = useState('General Cargo');
  const [cargoWeight, setCargoWeight] = useState('');
  const [priority, setPriority] = useState('Normal');
  const [emergencyMode, setEmergencyMode] = useState(false);
  
  const [compareResult, setCompareResult] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Remove duplicate airports from dropdowns (we'll just list city nodes to keep it simple, or list all)
  const cityNodes = nodes.filter(n => n.type !== 'airport');

  useEffect(() => {
    Promise.all([
      api.nodes(),
      api.reports().catch(() => ({ reports: [] }))
    ]).then(([nodeRes, repRes]) => {
      if (nodeRes.nodes && nodeRes.nodes.length > 0) {
        setNodes(nodeRes.nodes);
        const cities = nodeRes.nodes.filter(n => n.type !== 'airport');
        setOrigin(cities.find((n) => n.id === 'guwahati')?.id || cities[0].id);
        setDestination(cities.find((n) => n.id === 'jorhat')?.id || cities[1].id);
      }
      if (repRes.reports) setIncidents(repRes.reports);
    }).catch(() => {
      setNodes(LOCAL_NODES);
    });
  }, []);

  const plan = async (e) => {
    e?.preventDefault();
    if (origin === destination) { setError('Origin and destination must be different.'); return; }
    setBusy(true);
    setError('');

    try {
      const res = await api.compareRoutes({ 
        originId: origin, 
        destinationId: destination,
        cargoType,
        weight: cargoWeight || 100,
        priority,
        emergencyMode
      });
      setCompareResult(res);
      notify && notify(`Risk-weighted routing complete: Recommended ${res.recommendation.mode.toUpperCase()}`);
    } catch (_) {
      // Client-side fallback computation
      const road = computeSafetyRoute(origin, destination, 1, 'road');
      const railway = computeSafetyRoute(origin, destination, 1, 'railway');
      const waterway = computeSafetyRoute(origin, destination, 1, 'waterway');
      const air = computeSafetyRoute(origin, destination, 1, 'air');
      const fallbackRoutes = { road, railway, waterway, air };
      const available = Object.keys(fallbackRoutes).filter((k) => fallbackRoutes[k] !== null);

      if (available.length === 0) {
        setError('No viable safe route found between these locations.');
        setCompareResult(null);
      } else {
        let recMode = 'road';
        if (emergencyMode && air) recMode = 'air';
        else if (cargoType === 'Heavy Cargo' && (waterway || railway)) recMode = waterway ? 'waterway' : 'railway';
        else if (priority === 'High' && air) recMode = 'air';
        else if (railway && railway.safetyIndex > 85) recMode = 'railway';
        else recMode = road ? 'road' : available[0];

        setCompareResult({
          routes: fallbackRoutes,
          recommendation: {
            mode: recMode,
            reason: 'Risk-weighted route computed using offline multimodal graph heuristic.',
            route: fallbackRoutes[recMode]
          }
        });
        notify && notify(`Offline multimodal route calculated: Recommended ${recMode.toUpperCase()}`);
      }
    } finally {
      setBusy(false);
    }
  };

  // Find incidents along origin / destination / route corridors
  const routeIncidents = (compareResult?.recommendation?.route?.edges || []).flatMap(edge => {
    return incidents.filter(inc => {
      if (inc.status === 'resolved') return false;
      const matchNode = inc.nodeId === edge.from.id || inc.nodeId === edge.to.id;
      const matchRoad = inc.road && edge.road && inc.road.toLowerCase().includes(edge.road.toLowerCase());
      return matchNode || matchRoad;
    });
  });

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {/* Route Form */}
      <form onSubmit={plan} style={formStyle}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, width: '100%' }}>
          <label style={labelStyle}>{t('route.origin') || 'Origin'}
            <select value={origin} onChange={(e) => setOrigin(e.target.value)} style={selectStyle}>
              {cityNodes.map((n) => <option key={n.id} value={n.id}>{t(`enum.${n.id}`) || n.name}, {t(`enum.${n.state}`) || n.state}</option>)}
            </select>
          </label>
          <label style={labelStyle}>{t('route.dest') || 'Destination'}
            <select value={destination} onChange={(e) => setDestination(e.target.value)} style={selectStyle}>
              {cityNodes.map((n) => <option key={n.id} value={n.id}>{t(`enum.${n.id}`) || n.name}, {t(`enum.${n.state}`) || n.state}</option>)}
            </select>
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, width: '100%' }}>
          <label style={labelStyle}>{t('route.cargo') || 'Cargo Type'}
            <select value={cargoType} onChange={(e) => setCargoType(e.target.value)} style={selectStyle}>
              <option value="General Cargo">{t('cargo.general') || 'General Cargo'}</option>
              <option value="Perishable">{t('cargo.perishable') || 'Perishable'}</option>
              <option value="Pharmaceutical / Medicine">{t('cargo.pharma') || 'Pharmaceutical / Medicine'}</option>
              <option value="Emergency Supplies">{t('cargo.emergency') || 'Emergency Supplies'}</option>
              <option value="High Value">{t('cargo.highValue') || 'High Value'}</option>
              <option value="Heavy Cargo">{t('cargo.heavy') || 'Heavy Cargo'}</option>
            </select>
          </label>
          <label style={labelStyle}>{t('route.weight') || 'Weight (kg)'}
            <input type="number" placeholder="e.g. 500" value={cargoWeight} onChange={(e) => setCargoWeight(e.target.value)} style={selectStyle} />
          </label>
          <label style={labelStyle}>{t('route.priority') || 'Priority'}
            <select value={priority} onChange={(e) => setPriority(e.target.value)} style={selectStyle}>
              <option value="Normal">{t('enum.normal') || 'Normal'}</option>
              <option value="High">{t('enum.high') || 'High'}</option>
              <option value="Emergency">{t('enum.emergency') || 'Emergency'}</option>
            </select>
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginTop: 8, flexWrap: 'wrap', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: emergencyMode ? '#dc2626' : '#4b5563', cursor: 'pointer' }}>
            <input type="checkbox" checked={emergencyMode} onChange={(e) => setEmergencyMode(e.target.checked)} style={{ width: 18, height: 18, accentColor: '#dc2626' }} />
            🚨 {t('route.emergencyMode') || 'Emergency Logistics Priority'}
          </label>
          
          <button type="submit" disabled={busy} style={btnStyle}>
            {busy ? t('route.btn_planning') || 'Evaluating Multimodal Corridors…' : `⚖️ Calculate Risk-Weighted Route`}
          </button>
        </div>
      </form>

      {error && <p style={{ color: '#b54a3c', fontSize: 12, fontWeight: 700 }}>{error}</p>}

      {compareResult && compareResult.recommendation && (
        <div style={{ display: 'grid', gap: 18 }}>
          
          {/* Recommendation Banner with Incident-Aware Routing terminology */}
          <div style={recommendationBanner(emergencyMode)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>{emergencyMode ? '🚨' : '🧠'}</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>
                    Incident-Aware Routing & Multimodal Recommendation
                  </h3>
                  <span style={{ fontSize: 10, opacity: 0.85, fontWeight: 700 }}>
                    Risk-weighted route engine with dynamic disruption penalties
                  </span>
                </div>
              </div>
              <span style={{ fontSize: 10, fontWeight: 800, background: 'rgba(0,0,0,0.06)', padding: '3px 8px', borderRadius: 6 }}>
                Dijkstra Graph Safety Index: {compareResult.recommendation.route.safetyIndex}%
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, opacity: 0.95 }}>
              {compareResult.recommendation.reason}
            </p>
          </div>

          {/* Active Hazards Intersecting Corridor */}
          {routeIncidents.length > 0 && (
            <div style={{ padding: '12px 14px', background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 16 }}>⚠️</span>
                <b style={{ fontSize: 12, color: '#92400e' }}>Active Corridor Hazards Influencing Safety Index</b>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                {routeIncidents.slice(0, 3).map((inc) => (
                  <div key={inc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#78350f', background: '#ffffff', padding: '6px 10px', borderRadius: 6, border: '1px solid #fde68a' }}>
                    <span><b>{inc.title}</b> ({inc.road || 'Corridor'})</span>
                    <span style={{ fontWeight: 800, color: '#b91c1c' }}>Dynamic disruption penalty applied</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Map display */}
          <LiveMap height={360} focusRouteEdges={compareResult.recommendation.route.edges} />

          {/* Multimodal Comparison Cards */}
          <h4 style={{ fontSize: 13, color: '#374151', margin: '6px 0 0 0', fontWeight: 800 }}>
            {t('route.availableOptions') || 'Available Multimodal Options (Risk-Weighted)'}
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <ModeCard mode="road" title={t('map.road') || "ROAD"} icon="🚚" route={compareResult.routes.road} isRecommended={compareResult.recommendation.mode === 'road'} t={t} />
            <ModeCard mode="railway" title={t('map.rail') || "RAIL + ROAD"} icon="🚂" route={compareResult.routes.railway} isRecommended={compareResult.recommendation.mode === 'railway'} t={t} />
            <ModeCard mode="waterway" title={t('map.water') || "WATERWAY + ROAD"} icon="🚢" route={compareResult.routes.waterway} isRecommended={compareResult.recommendation.mode === 'waterway'} t={t} />
            <ModeCard mode="air" title={t('map.air') || "AIR + ROAD"} icon="✈️" route={compareResult.routes.air} isRecommended={compareResult.recommendation.mode === 'air'} t={t} />
          </div>

          {/* Route Segments for Recommended */}
          <div style={{ marginTop: 10 }}>
            <h4 style={{ fontSize: 12, color: '#39735f', marginBottom: 8, fontWeight: 800 }}>
              {t('route.recommendedSegments') || 'RECOMMENDED ROUTE SEGMENTS & HAZARD STATUS'}
            </h4>
            <div style={{ display: 'grid', gap: 6 }}>
              {compareResult.recommendation.route.edges.map((e, i) => (
                <div key={i} style={segmentStyle}>
                  <span style={{ fontWeight: 700 }}>{t(`enum.${e.from.id}`) || e.from.name} → {t(`enum.${e.to.id}`) || e.to.name}</span>
                  <span style={{ color: '#7c8f87' }}>[{e.mode.toUpperCase()}] {e.road} · {e.km} km</span>
                  <span style={{ color: conditionColor(e.condition), fontWeight: 800, textTransform: 'capitalize' }}>
                    {e.condition === 'clear' ? `🟢 Clear & Safe` : e.condition === 'caution' ? `⚠️ Caution` : `🔴 Disrupted`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ModeCard({ title, icon, route, isRecommended, t }) {
  if (!route) {
    return (
      <div style={{ ...modeCardBase, opacity: 0.5, background: '#f3f4f6' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <span>{icon}</span>
          <b style={{ fontSize: 12, color: '#6b7280' }}>{title}</b>
        </div>
        <div style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>{t('route.unavailable') || 'Route unavailable'}</div>
      </div>
    );
  }

  const borderCol = isRecommended ? '#10b981' : '#e5e7eb';
  const bgCol = isRecommended ? '#ecfdf5' : '#ffffff';

  return (
    <div style={{ ...modeCardBase, border: `2px solid ${borderCol}`, background: bgCol, position: 'relative' }}>
      {isRecommended && (
        <div style={{ position: 'absolute', top: -10, right: 10, background: '#10b981', color: 'white', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 12 }}>
          {t('route.recommended') || 'RECOMMENDED'}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <b style={{ fontSize: 13, color: '#1f2937' }}>{title}</b>
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={cardRow}><span style={cardLabel}>{t('route.time') || 'Time'}:</span> <span style={{ fontWeight: 800, color: '#111827' }}>{formatMins(route.etaMinutes)}</span></div>
        <div style={cardRow}><span style={cardLabel}>{t('route.distance') || 'Distance'}:</span> <span style={{ fontWeight: 700, color: '#4b5563' }}>{route.totalKm} km</span></div>
        <div style={cardRow}><span style={cardLabel}>{t('route.safety') || 'Safety'}:</span> <span style={{ fontWeight: 800, color: route.safetyIndex > 80 ? '#059669' : '#d97706' }}>{route.safetyIndex}%</span></div>
      </div>
    </div>
  );
}

function formatMins(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function conditionColor(c) {
  return { clear: '#3ea274', caution: '#bd7e22', disrupted: '#b5493a', blocked: '#8a1f1f' }[c] || '#7c8f87';
}

const formStyle = { display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', background: '#f9fafb', padding: 16, borderRadius: 10, border: '1px solid #e5e7eb' };
const labelStyle = { display: 'grid', gap: 6, fontSize: 11, fontWeight: 800, color: '#4b5563' };
const selectStyle = { height: 40, padding: '0 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, width: '100%' };
const btnStyle = { height: 44, padding: '0 24px', border: 0, borderRadius: 7, color: '#fff', background: '#0f766e', fontSize: 13, fontWeight: 800, cursor: 'pointer', transition: 'background 0.2s' };
const segmentStyle = { display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, padding: '10px 12px', border: '1px solid #edf1ee', borderRadius: 7, fontSize: 11, alignItems: 'center' };

const recommendationBanner = (isEmergency) => ({
  padding: '16px 20px',
  background: isEmergency ? 'linear-gradient(135deg, #fef2f2, #fee2e2)' : 'linear-gradient(135deg, #f0fdf4, #dcfce7)',
  border: `1px solid ${isEmergency ? '#fca5a5' : '#86efac'}`,
  borderRadius: 10,
  color: isEmergency ? '#991b1b' : '#166534',
  boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
});

const modeCardBase = {
  padding: 14,
  borderRadius: 10,
  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  transition: 'all 0.2s'
};

const cardRow = { display: 'flex', justifyContent: 'space-between', fontSize: 12 };
const cardLabel = { color: '#6b7280', fontWeight: 600 };
