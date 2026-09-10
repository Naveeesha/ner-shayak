import { useEffect, useState } from 'react';
import api from '../services/api';
import LiveMap from './LiveMap';

export default function RoutePlanner({ notify }) {
  const [nodes, setNodes] = useState([]);
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.nodes().then((res) => {
      setNodes(res.nodes);
      if (res.nodes.length > 1) {
        setOrigin(res.nodes.find((n) => n.id === 'guwahati')?.id || res.nodes[0].id);
        setDestination(res.nodes.find((n) => n.id === 'jorhat')?.id || res.nodes[1].id);
      }
    }).catch((err) => setError(err.message));
  }, []);

  const plan = async (e) => {
    e.preventDefault();
    if (origin === destination) { setError('Origin and destination must be different.'); return; }
    setBusy(true);
    setError('');
    try {
      const res = await api.planRoute(origin, destination, true);
      setResult(res);
      notify && notify(`Route optimized: ${res.recommended.totalKm} km, ETA ${formatMins(res.recommended.etaMinutes)}.`);
    } catch (err) {
      setError(err.message);
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 20 }}>
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
        <button type="submit" disabled={busy} style={btnStyle}>{busy ? 'Calculating…' : 'Find safest route'}</button>
      </form>
      {error && <p style={{ color: '#b54a3c', fontSize: 12, fontWeight: 700 }}>{error}</p>}

      {result && (
        <div style={{ display: 'grid', gap: 16 }}>
          <LiveMap height={340} focusRouteEdges={result.recommended.edges} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Stat label="Distance" value={`${result.recommended.totalKm} km`} />
            <Stat label="Estimated time" value={formatMins(result.recommended.etaMinutes)} />
            <Stat label="Avg. speed" value={`${result.recommended.avgSpeedKmh} km/h`} />
          </div>
          <div>
            <h4 style={{ fontSize: 12, color: '#39735f', marginBottom: 8 }}>Route segments (live conditions)</h4>
            <div style={{ display: 'grid', gap: 6 }}>
              {result.recommended.edges.map((e, i) => (
                <div key={i} style={segmentStyle}>
                  <span style={{ fontWeight: 700 }}>{e.from.name} → {e.to.name}</span>
                  <span style={{ color: '#7c8f87' }}>{e.road} · {e.km} km</span>
                  <span style={{ color: conditionColor(e.condition), fontWeight: 800, textTransform: 'capitalize' }}>{e.condition}</span>
                </div>
              ))}
            </div>
          </div>
          {result.alternates && result.alternates.length > 0 && (
            <div>
              <h4 style={{ fontSize: 12, color: '#39735f', marginBottom: 8 }}>Alternate routes</h4>
              <div style={{ display: 'grid', gap: 6 }}>
                {result.alternates.map((alt, i) => (
                  <div key={i} style={segmentStyle}>
                    <span>Alternate {i + 1}</span>
                    <span style={{ color: '#7c8f87' }}>{alt.totalKm} km</span>
                    <span style={{ color: '#7c8f87' }}>ETA {formatMins(alt.etaMinutes)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return <div style={{ padding: '12px 14px', border: '1px solid #e1e9e3', borderRadius: 8, background: '#fbfdfb' }}>
    <div style={{ fontSize: 9, fontWeight: 800, color: '#8aa097', letterSpacing: 1 }}>{label.toUpperCase()}</div>
    <div style={{ fontSize: 18, fontWeight: 700, color: '#25483d', marginTop: 4 }}>{value}</div>
  </div>;
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
const segmentStyle = { display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, padding: '10px 12px', border: '1px solid #edf1ee', borderRadius: 7, fontSize: 11, alignItems: 'center' };
