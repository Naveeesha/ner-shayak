import { useEffect, useState } from 'react';
import api from '../services/api';
import LiveMap from './LiveMap';
import { NODES as LOCAL_NODES, computeSafetyRoute } from '../services/routeCalculator';
import { calculateCorridorRisk } from '../services/riskService';

export default function RoutePlanner({ notify }) {
  const [nodes, setNodes] = useState(LOCAL_NODES);
  const [origin, setOrigin] = useState('guwahati');
  const [destination, setDestination] = useState('jorhat');
  
  const [cargoType, setCargoType] = useState('General Cargo');
  const [cargoWeight, setCargoWeight] = useState('');
  const [priority, setPriority] = useState('Normal');
  const [emergencyMode, setEmergencyMode] = useState(false);
  
  const [compareResult, setCompareResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Remove duplicate airports from dropdowns (we'll just list city nodes to keep it simple, or list all)
  const cityNodes = nodes.filter(n => n.type !== 'airport');

  useEffect(() => {
    api.nodes().then((res) => {
      if (res.nodes && res.nodes.length > 0) {
        setNodes(res.nodes);
        const cities = res.nodes.filter(n => n.type !== 'airport');
        setOrigin(cities.find((n) => n.id === 'guwahati')?.id || cities[0].id);
        setDestination(cities.find((n) => n.id === 'jorhat')?.id || cities[1].id);
      }
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
      notify && notify(`Multimodal comparison completed. Recommended: ${res.recommendation.mode.toUpperCase()}`);
    } catch (_) {
      // Client-side fallback computation
      const road = computeSafetyRoute(origin, destination, 1, 'road');
      if (!road) {
        setError('No viable safe route found between these locations.');
        setCompareResult(null);
      } else {
        setCompareResult({
          routes: { road, railway: null, waterway: null, air: null },
          recommendation: {
            mode: 'road',
            reason: 'Offline mode active. Displaying default road route.',
            route: road
          }
        });
        notify && notify(`Offline road route calculated: ${road.totalKm} km`);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {/* Route Form */}
      <form onSubmit={plan} style={formStyle}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, width: '100%' }}>
          <label style={labelStyle}>Origin
            <select value={origin} onChange={(e) => setOrigin(e.target.value)} style={selectStyle}>
              {cityNodes.map((n) => <option key={n.id} value={n.id}>{n.name}, {n.state}</option>)}
            </select>
          </label>
          <label style={labelStyle}>Destination
            <select value={destination} onChange={(e) => setDestination(e.target.value)} style={selectStyle}>
              {cityNodes.map((n) => <option key={n.id} value={n.id}>{n.name}, {n.state}</option>)}
            </select>
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, width: '100%' }}>
          <label style={labelStyle}>Cargo Type
            <select value={cargoType} onChange={(e) => setCargoType(e.target.value)} style={selectStyle}>
              <option>General Cargo</option>
              <option>Perishable</option>
              <option>Pharmaceutical / Medicine</option>
              <option>Emergency Supplies</option>
              <option>High Value</option>
              <option>Heavy Cargo</option>
            </select>
          </label>
          <label style={labelStyle}>Weight (kg)
            <input type="number" placeholder="e.g. 500" value={cargoWeight} onChange={(e) => setCargoWeight(e.target.value)} style={selectStyle} />
          </label>
          <label style={labelStyle}>Priority
            <select value={priority} onChange={(e) => setPriority(e.target.value)} style={selectStyle}>
              <option>Normal</option>
              <option>High</option>
              <option>Emergency</option>
            </select>
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginTop: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: emergencyMode ? '#dc2626' : '#4b5563', cursor: 'pointer' }}>
            <input type="checkbox" checked={emergencyMode} onChange={(e) => setEmergencyMode(e.target.checked)} style={{ width: 18, height: 18, accentColor: '#dc2626' }} />
            🚨 Emergency Logistics Mode
          </label>
          
          <button type="submit" disabled={busy} style={btnStyle}>
            {busy ? 'Evaluating Multimodal Corridors…' : '⚖️ Compare Routes'}
          </button>
        </div>
      </form>

      {error && <p style={{ color: '#b54a3c', fontSize: 12, fontWeight: 700 }}>{error}</p>}

      {compareResult && compareResult.recommendation && (
        <div style={{ display: 'grid', gap: 18 }}>
          
          {/* Recommendation Banner */}
          <div style={recommendationBanner(emergencyMode)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 22 }}>{emergencyMode ? '🚨' : '🧠'}</span>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Risk-Aware Multimodal Recommendation</h3>
            </div>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, opacity: 0.95 }}>
              {compareResult.recommendation.reason}
            </p>
          </div>

          {/* Transparent Risk Factor Attribution Card */}
          {(() => {
            const recRoute = compareResult.recommendation.route;
            const roadName = recRoute?.edges?.[0]?.road || 'NH-27';
            const riskData = calculateCorridorRisk(roadName, { precipitation: 12, condition: 'Moderate Rain' }, recRoute?.edges || []);
            return (
              <div style={{ padding: '14px 18px', background: riskData.badgeBg, border: `1px solid ${riskData.badgeColor}40`, borderRadius: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                  <b style={{ fontSize: 13, color: riskData.badgeColor }}>📊 Transparent Risk Score: {riskData.riskScore} / 100 ({riskData.riskLevel} Risk)</b>
                  <span style={{ fontSize: 11, fontWeight: 800, color: riskData.badgeColor }}>Safety Index: {riskData.safetyIndex}%</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                  {riskData.factors.map((f, idx) => (
                    <div key={idx} style={{ background: '#ffffffcc', padding: '8px 10px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 11 }}>
                      <div style={{ fontWeight: 800, color: '#1f2937', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{f.label}</span>
                        <span style={{ color: riskData.badgeColor }}>{f.value}</span>
                      </div>
                      <div style={{ fontSize: 10, color: '#6b7280', marginTop: 3 }}>{f.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Map display */}
          <LiveMap height={340} focusRouteEdges={compareResult.recommendation.route.edges} />

          {/* Multimodal Comparison Cards */}
          <h4 style={{ fontSize: 13, color: '#374151', margin: '10px 0 0 0', fontWeight: 800 }}>Available Multimodal Options</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <ModeCard mode="road" title="ROAD" icon="🚚" route={compareResult.routes.road} isRecommended={compareResult.recommendation.mode === 'road'} />
            <ModeCard mode="railway" title="RAIL + ROAD" icon="🚂" route={compareResult.routes.railway} isRecommended={compareResult.recommendation.mode === 'railway'} />
            <ModeCard mode="waterway" title="WATERWAY + ROAD" icon="🚢" route={compareResult.routes.waterway} isRecommended={compareResult.recommendation.mode === 'waterway'} />
            <ModeCard mode="air" title="AIR + ROAD" icon="✈️" route={compareResult.routes.air} isRecommended={compareResult.recommendation.mode === 'air'} />
          </div>

          {/* Route Segments for Recommended */}
          <div style={{ marginTop: 10 }}>
            <h4 style={{ fontSize: 12, color: '#39735f', marginBottom: 8, fontWeight: 800 }}>RECOMMENDED ROUTE SEGMENTS</h4>
            <div style={{ display: 'grid', gap: 6 }}>
              {compareResult.recommendation.route.edges.map((e, i) => (
                <div key={i} style={segmentStyle}>
                  <span style={{ fontWeight: 700 }}>{e.from?.name || e.from} → {e.to?.name || e.to}</span>
                  <span style={{ color: '#7c8f87' }}>[{(e.mode || 'road').toUpperCase()}] {e.road} · {e.km} km</span>
                  <span style={{ color: conditionColor(e.condition), fontWeight: 800, textTransform: 'capitalize' }}>
                    {e.condition === 'clear' ? '🟢 Clear & Safe' : e.condition === 'caution' ? '⚠️ Caution' : '🔴 Disrupted'}
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

function ModeCard({ title, icon, route, isRecommended }) {
  if (!route) {
    return (
      <div style={{ ...modeCardBase, opacity: 0.5, background: '#f3f4f6' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <span>{icon}</span>
          <b style={{ fontSize: 12, color: '#6b7280' }}>{title}</b>
        </div>
        <div style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>Route unavailable</div>
      </div>
    );
  }

  const borderCol = isRecommended ? '#10b981' : '#e5e7eb';
  const bgCol = isRecommended ? '#ecfdf5' : '#ffffff';

  return (
    <div style={{ ...modeCardBase, border: `2px solid ${borderCol}`, background: bgCol, position: 'relative' }}>
      {isRecommended && (
        <div style={{ position: 'absolute', top: -10, right: 10, background: '#10b981', color: 'white', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 12 }}>
          RECOMMENDED
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <b style={{ fontSize: 13, color: '#1f2937' }}>{title}</b>
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={cardRow}><span style={cardLabel}>Time:</span> <span style={{ fontWeight: 800, color: '#111827' }}>{formatMins(route.etaMinutes)}</span></div>
        <div style={cardRow}><span style={cardLabel}>Distance:</span> <span style={{ fontWeight: 700, color: '#4b5563' }}>{route.totalKm} km</span></div>
        <div style={cardRow}><span style={cardLabel}>Safety:</span> <span style={{ fontWeight: 800, color: route.safetyIndex > 80 ? '#059669' : '#d97706' }}>{route.safetyIndex}%</span></div>
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
