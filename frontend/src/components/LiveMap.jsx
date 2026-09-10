import { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, Tooltip, CircleMarker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../services/api';

const CONDITION_COLOR = { clear: '#3ea274', caution: '#e2ab3d', disrupted: '#dc725d', blocked: '#8a1f1f' };

export default function LiveMap({ height = 420, focusRouteEdges = null }) {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastFetched, setLastFetched] = useState(null);

  const load = async () => {
    try {
      setError('');
      const [nodeRes, edgeRes] = await Promise.all([api.nodes(), api.edges()]);
      setNodes(nodeRes.nodes);
      setEdges(edgeRes.edges);
      setLastFetched(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 5 * 60 * 1000); // refresh every 5 min
    return () => clearInterval(interval);
  }, []);

  const displayEdges = useMemo(() => (focusRouteEdges ? focusRouteEdges : edges), [focusRouteEdges, edges]);
  const center = [24.9, 92.9]; // roughly centered on NER

  return (
    <div style={{ position: 'relative', width: '100%', height }}>
      {loading && <div style={mapStatusStyle}>Loading live network…</div>}
      {error && <div style={{ ...mapStatusStyle, color: '#b54a3c' }}>Couldn't load live map data: {error}</div>}
      <MapContainer center={center} zoom={6} style={{ width: '100%', height: '100%', borderRadius: 8 }} scrollWheelZoom>
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {displayEdges.map((e, i) => (
          <Polyline
            key={i}
            positions={[[e.from.lat, e.from.lng], [e.to.lat, e.to.lng]]}
            pathOptions={{ color: CONDITION_COLOR[e.condition] || '#8fac9f', weight: focusRouteEdges ? 5 : 3, opacity: 0.85 }}
          >
            <Tooltip sticky>{e.road} · {e.from.name} → {e.to.name} · {e.km} km · {e.condition}</Tooltip>
          </Polyline>
        ))}
        {nodes.map((n) => (
          <CircleMarker key={n.id} center={[n.lat, n.lng]} radius={n.type === 'hub' ? 7 : 5}
            pathOptions={{ color: '#155b4b', fillColor: n.type === 'hub' ? '#e1f970' : '#ffffff', fillOpacity: 1, weight: 2 }}>
            <Tooltip>{n.name}, {n.state}</Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
      {lastFetched && (
        <div style={legendStyle}>
          {[['#3ea274', 'Clear'], ['#e2ab3d', 'Caution'], ['#dc725d', 'Disrupted'], ['#8a1f1f', 'Blocked']].map(([color, label]) => (
            <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <i style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }} />{label}
            </span>
          ))}
          <span style={{ marginLeft: 8, color: '#7c8f87' }}>Updated {lastFetched.toLocaleTimeString()}</span>
        </div>
      )}
    </div>
  );
}

const mapStatusStyle = { position: 'absolute', zIndex: 500, top: 10, left: 10, background: 'rgba(255,255,255,.92)', padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, color: '#39735f' };
const legendStyle = { position: 'absolute', zIndex: 500, bottom: 10, left: 10, display: 'flex', gap: 10, background: 'rgba(255,255,255,.92)', padding: '6px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700, color: '#61776d' };
