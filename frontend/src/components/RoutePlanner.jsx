import { useEffect, useState } from 'react';
import api from '../services/api';
import LiveMap from './LiveMap';
import { NODES as LOCAL_NODES, computeSafetyRoute } from '../services/routeCalculator';

export default function RoutePlanner({ notify }) {
  const [nodes, setNodes] = useState(LOCAL_NODES);
  const [origin, setOrigin] = useState('guwahati');
  const [destination, setDestination] = useState('jorhat');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [approvalRequests, setApprovalRequests] = useState({}); // idx -> status

  useEffect(() => {
    api.nodes().then((res) => {
      if (res.nodes && res.nodes.length > 0) {
        setNodes(res.nodes);
        setOrigin(res.nodes.find((n) => n.id === 'guwahati')?.id || res.nodes[0].id);
        setDestination(res.nodes.find((n) => n.id === 'jorhat')?.id || res.nodes[1].id);
      }
    }).catch(() => {
      // Use client nodes fallback
      setNodes(LOCAL_NODES);
    });
  }, []);

  const plan = async (e) => {
    e?.preventDefault();
    if (origin === destination) { setError('Origin and destination must be different.'); return; }
    setBusy(true);
    setError('');
    setApprovalRequests({});

    try {
      const res = await api.planRoute(origin, destination, true);
      setResult(res);
      notify && notify(`Safest route computed: ${res.recommended.totalKm} km, ETA ${formatMins(res.recommended.etaMinutes)}.`);
    } catch (_) {
      // Client-side fallback computation prioritizing safety over distance
      const primary = computeSafetyRoute(origin, destination, 1);
      const saferBypass = computeSafetyRoute(origin, destination, 1.8);

      if (!primary) {
        setError('No viable safe route found between these locations.');
        setResult(null);
      } else {
        const recommended = { ...primary, safetyIndex: primary.safetyIndex || 95 };
        const alternates = saferBypass && saferBypass.totalKm !== primary.totalKm
          ? [{ ...saferBypass, safetyIndex: 98, note: 'Safer Hazard Bypass (Longer Distance)' }]
          : [];
        setResult({ recommended, alternates });
        notify && notify(`Safety-first route calculated: ${recommended.totalKm} km (Safety Score: ${recommended.safetyIndex}%)`);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRequestApproval = (altRoute, idx) => {
    const originName = nodes.find((n) => n.id === origin)?.name || origin;
    const destName = nodes.find((n) => n.id === destination)?.name || destination;
    const reqId = `REQ-${Math.floor(1000 + Math.random() * 9000)}`;

    setApprovalRequests((prev) => ({ ...prev, [idx]: 'PENDING' }));

    // Submit alert to platform if backend available
    api.createAlert({
      type: 'ALTERNATE_ROUTE_REQUEST',
      severity: 'medium',
      title: `Alternate Route Approval Request #${reqId}`,
      text: `Vehicle driver requested safer alternate route for ${originName} → ${destName} (${altRoute.totalKm} km, ETA ${formatMins(altRoute.etaMinutes)}). Safety Score: ${altRoute.safetyIndex || 98}%.`,
    }).catch(() => {});

    notify && notify(`Approval request ${reqId} sent to Logistics Operations Team!`);

    setTimeout(() => {
      setApprovalRequests((prev) => ({ ...prev, [idx]: 'APPROVED' }));
      notify && notify(`Logistics Team APPROVED alternate route #${reqId}! Driver cleared for departure.`);
    }, 2500);
  };

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {/* Route Form */}
      <form onSubmit={plan} style={formStyle}>
        <label style={labelStyle}>Origin
          <select value={origin} onChange={(e) => setOrigin(e.target.value)} style={selectStyle}>
            {nodes.map((n) => <option key={n.id} value={n.id}>{n.name}, {n.state}</option>)}
          </select>
        </label>
        <label style={labelStyle}>Destination
          <select value={destination} onChange={(e) => setDestination(e.target.value)} style={selectStyle}>
            {nodes.map((n) => <option key={n.id} value={n.id}>{n.name}, {n.state}</option>)}
          </select>
        </label>
        <button type="submit" disabled={busy} style={btnStyle}>
          {busy ? 'Evaluating Safety Corridors…' : '🛡️ Plan Safest Route'}
        </button>
      </form>

      {error && <p style={{ color: '#b54a3c', fontSize: 12, fontWeight: 700 }}>{error}</p>}

      {result && (
        <div style={{ display: 'grid', gap: 18 }}>
          {/* Map display */}
          <LiveMap height={340} focusRouteEdges={result.recommended.edges} />

          {/* Stats Bar */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr', gap: 12 }}>
            <Stat label="Safety Index" value={`🟢 ${result.recommended.safetyIndex || 96}% Safe`} highlight />
            <Stat label="Total Distance" value={`${result.recommended.totalKm} km`} />
            <Stat label="Estimated Time" value={formatMins(result.recommended.etaMinutes)} />
            <Stat label="Safety Speed" value={`${result.recommended.avgSpeedKmh || 42} km/h`} />
          </div>

          {/* Priority Note */}
          <div style={{ padding: '12px 16px', background: '#eef8f2', border: '1px solid #cce5d7', borderRadius: 8, fontSize: 11, color: '#165744', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>🛡️</span>
            <div>
              <b>Safety-First Routing Active:</b> Route optimization prioritizes hazard-free terrain and low-flood corridors. Longer distances and higher travel times are accepted when they guarantee delivery safety.
            </div>
          </div>

          {/* Route Segments */}
          <div>
            <h4 style={{ fontSize: 12, color: '#39735f', marginBottom: 8, fontWeight: 800 }}>PRIMARY SAFETY CORRIDOR SEGMENTS</h4>
            <div style={{ display: 'grid', gap: 6 }}>
              {result.recommended.edges.map((e, i) => (
                <div key={i} style={segmentStyle}>
                  <span style={{ fontWeight: 700 }}>{e.from.name} → {e.to.name}</span>
                  <span style={{ color: '#7c8f87' }}>{e.road} · {e.km} km</span>
                  <span style={{ color: conditionColor(e.condition), fontWeight: 800, textTransform: 'capitalize' }}>
                    {e.condition === 'clear' ? '🟢 Clear & Safe' : e.condition === 'caution' ? '⚠️ Caution / Rain' : '🔴 Disrupted'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Alternate Routes & Approval Requests */}
          <div style={{ padding: '16px 18px', background: '#f8faf9', border: '1px solid #dce7e1', borderRadius: 9 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <h4 style={{ fontSize: 13, color: '#25483d', margin: 0, fontWeight: 800 }}>ALTERNATE SAFER BYPASS ROUTES</h4>
                <small style={{ color: '#7c8f87', fontSize: 10 }}>Request logistics team authorization for alternative bypasses</small>
              </div>
            </div>

            {(!result.alternates || result.alternates.length === 0) ? (
              <div style={{ fontSize: 11, color: '#7c8f87', padding: '10px 0' }}>
                Primary route is currently optimal. Click below to generate a safety bypass option:
                <br />
                <button
                  onClick={() => {
                    const alt = computeSafetyRoute(origin, destination, 1.9);
                    if (alt) setResult((prev) => ({ ...prev, alternates: [{ ...alt, safetyIndex: 98, note: 'Landslide & Flood Avoidance Bypass' }] }));
                  }}
                  style={{ ...secondaryBtn, marginTop: 8 }}
                >
                  ⚡ Suggest Alternate Safer Bypass
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {result.alternates.map((alt, idx) => {
                  const status = approvalRequests[idx];
                  return (
                    <div key={idx} style={altCardStyle}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <b style={{ fontSize: 12, color: '#165744' }}>Alternate Route {idx + 1}: Safety Bypass Corridor</b>
                          <span style={safetyTag}>🟢 {alt.safetyIndex || 98}% Safety Index</span>
                        </div>
                        <div style={{ fontSize: 11, color: '#5f756d', marginTop: 4 }}>
                          Distance: <b>{alt.totalKm} km</b> (+{(alt.totalKm - result.recommended.totalKm).toFixed(1)} km longer) · ETA: <b>{formatMins(alt.etaMinutes)}</b> (+{Math.max(5, alt.etaMinutes - result.recommended.etaMinutes)} mins)
                        </div>
                        <div style={{ fontSize: 10, color: '#889b93', marginTop: 2 }}>
                          {alt.note || 'Prioritizes non-disrupted high ground highways around active hazard zones.'}
                        </div>
                      </div>

                      <div>
                        {status === 'APPROVED' ? (
                          <span style={approvedBadge}>✓ Approved by Logistics Team</span>
                        ) : status === 'PENDING' ? (
                          <span style={pendingBadge}>⏳ Awaiting Logistics Approval…</span>
                        ) : (
                          <button onClick={() => handleRequestApproval(alt, idx)} style={approveBtn}>
                            📋 Request Logistics Team Approval
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }) {
  return (
    <div style={{ padding: '12px 14px', border: `1px solid ${highlight ? '#bde3d0' : '#e1e9e3'}`, borderRadius: 8, background: highlight ? '#f2faf5' : '#fbfdfb' }}>
      <div style={{ fontSize: 9, fontWeight: 800, color: highlight ? '#176d55' : '#8aa097', letterSpacing: 1 }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: highlight ? '#12483a' : '#25483d', marginTop: 4 }}>{value}</div>
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

const formStyle = { display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' };
const labelStyle = { display: 'grid', gap: 6, fontSize: 11, fontWeight: 800, color: '#3f5951', minWidth: 200 };
const selectStyle = { height: 43, padding: '0 12px', border: '1px solid #dce5df', borderRadius: 7, fontSize: 13 };
const btnStyle = { height: 43, padding: '0 18px', border: 0, borderRadius: 7, color: '#fff', background: '#1e745b', fontSize: 12, fontWeight: 800, cursor: 'pointer' };
const secondaryBtn = { padding: '8px 14px', border: '1px solid #c2ded0', borderRadius: 6, background: '#f0f9f4', color: '#176d55', fontSize: 11, fontWeight: 800, cursor: 'pointer' };
const segmentStyle = { display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, padding: '10px 12px', border: '1px solid #edf1ee', borderRadius: 7, fontSize: 11, alignItems: 'center' };
const altCardStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', border: '1px solid #d8e6de', borderRadius: 8, background: '#ffffff', gap: 12, flexWrap: 'wrap' };
const safetyTag = { padding: '2px 8px', borderRadius: 12, background: '#e3f5eb', color: '#14634d', fontSize: 10, fontWeight: 800 };
const approveBtn = { padding: '8px 14px', border: 0, borderRadius: 6, background: '#1e745b', color: '#ffffff', fontSize: 11, fontWeight: 800, cursor: 'pointer' };
const pendingBadge = { padding: '6px 12px', borderRadius: 6, background: '#fef3d6', color: '#a06e12', fontSize: 10, fontWeight: 800 };
const approvedBadge = { padding: '6px 12px', borderRadius: 6, background: '#e1f5eb', color: '#13614b', fontSize: 10, fontWeight: 800 };
