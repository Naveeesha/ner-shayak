import { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, Tooltip, CircleMarker, Marker, LayersControl, LayerGroup } from 'react-leaflet';
import { divIcon } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../services/api';
import { NODES as LOCAL_NODES, EDGES as LOCAL_EDGES } from '../services/routeCalculator';
import { DRIVER_ROSTER } from '../services/driverService';

const CONDITION_COLOR = { clear: '#3ea274', caution: '#e2ab3d', disrupted: '#dc725d', blocked: '#8a1f1f' };

export default function LiveMap({ height = 440, focusRouteEdges = null }) {
  const [nodes, setNodes] = useState(LOCAL_NODES);
  const [edges, setEdges] = useState(LOCAL_EDGES);
  const [isOfflineMode, setIsOfflineMode] = useState(!navigator.onLine);
  const [modeFilter, setModeFilter] = useState('all'); // all | road | railway | waterway | air

  const load = async () => {
    try {
      const [nodeRes, edgeRes] = await Promise.all([api.nodes(), api.edges()]);
      if (nodeRes.nodes) setNodes(nodeRes.nodes);
      if (edgeRes.edges) setEdges(edgeRes.edges);
    } catch (_) {
      // Offline fallback: use local nodes and edges
      setNodes(LOCAL_NODES);
      setEdges(LOCAL_EDGES);
      setIsOfflineMode(true);
    }
  };

  useEffect(() => {
    load();
    const handleOnline = () => setIsOfflineMode(false);
    const handleOffline = () => setIsOfflineMode(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const displayEdges = useMemo(() => {
    const raw = focusRouteEdges ? focusRouteEdges : edges;
    let filtered = raw;
    if (modeFilter !== 'all') {
      filtered = raw.filter((e) => e.mode === modeFilter || (!e.mode && modeFilter === 'road'));
    }
    // Ensure `from` and `to` are objects, because LOCAL_EDGES uses string IDs
    return filtered.map(e => {
      const fromNode = typeof e.from === 'string' ? nodes.find(n => n.id === e.from) : e.from;
      const toNode = typeof e.to === 'string' ? nodes.find(n => n.id === e.to) : e.to;
      return { ...e, from: fromNode, to: toNode };
    }).filter(e => e.from && e.to);
  }, [focusRouteEdges, edges, modeFilter, nodes]);

  const center = [25.5, 92.8]; // centered on North East India

  return (
    <div style={{ position: 'relative', width: '100%', height, background: '#eaf4ee', borderRadius: 10, overflow: 'hidden', border: '1px solid #d4e5db' }}>
      {/* Top Controls Bar */}
      <div style={topControlsStyle}>
        <button
          onClick={() => setIsOfflineMode(!isOfflineMode)}
          style={{ ...filterTabStyle(isOfflineMode), background: isOfflineMode ? '#175b4a' : '#ffffff', color: isOfflineMode ? '#ffffff' : '#175b4a' }}
        >
          {isOfflineMode ? '🗺️ Offline Canvas Map' : '🌐 Tile Map (Online)'}
        </button>
      </div>

      {/* Map Content Rendering */}
      {!isOfflineMode ? (
        <MapContainer center={center} zoom={6} style={{ width: '100%', height: '100%' }} scrollWheelZoom>
          <LayersControl position="topright">
            <LayersControl.BaseLayer checked name="OpenStreetMap">
              <TileLayer
                attribution='&copy; OpenStreetMap contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                eventHandlers={{
                  tileerror: () => setIsOfflineMode(true),
                }}
              />
            </LayersControl.BaseLayer>
            
            {['road', 'railway', 'waterway', 'air'].map(mode => {
              const modeEdges = displayEdges.filter(e => (e.mode || 'road') === mode);
              if (modeEdges.length === 0) return null;
              
              const modeNames = {
                road: '🚚 Road Corridors',
                railway: '🚂 Railway (NFR)',
                waterway: '🚢 Waterways (NW-2/16)',
                air: '✈️ Air Cargo'
              };
              
              return (
                <LayersControl.Overlay key={mode} checked name={modeNames[mode]}>
                  <LayerGroup>
                    {modeEdges.map((e) => (
                      <Polyline
                        key={`${e.from.id}-${e.to.id}-${e.mode || 'road'}`}
                        positions={[[e.from.lat, e.from.lng], [e.to.lat, e.to.lng]]}
                        pathOptions={{
                          color: e.mode === 'waterway' ? '#0284c7' : e.mode === 'railway' ? '#475569' : e.mode === 'air' ? '#9333ea' : (CONDITION_COLOR[e.condition] || '#3ea274'),
                          weight: focusRouteEdges ? 6 : 4,
                          dashArray: e.mode === 'railway' ? '6, 6' : e.mode === 'waterway' ? '10, 4' : e.mode === 'air' ? '2, 8' : null,
                          opacity: 0.85,
                        }}
                      >
                        <Tooltip sticky>
                          [{ (e.mode || 'road').toUpperCase() }] {e.road} · {e.from.name} → {e.to.name} ({e.km} km)
                        </Tooltip>
                      </Polyline>
                    ))}
                  </LayerGroup>
                </LayersControl.Overlay>
              );
            })}

            <LayersControl.Overlay checked name="Nodes & Hubs">
              <LayerGroup>
                {nodes.filter(n => n.type !== 'airport').map((n) => (
                  <CircleMarker key={n.id} center={[n.lat, n.lng]} radius={n.type === 'hub' ? 7 : 5}
                    pathOptions={{ color: '#155b4b', fillColor: n.type === 'hub' ? '#ccf363' : '#ffffff', fillOpacity: 1, weight: 2 }}>
                    <Tooltip>{n.name}, {n.state} ({n.type === 'hub' ? 'Multimodal Hub' : 'District Node'})</Tooltip>
                  </CircleMarker>
                ))}
              </LayerGroup>
            </LayersControl.Overlay>

            <LayersControl.Overlay checked name="Airports">
              <LayerGroup>
                {nodes.filter(n => n.type === 'airport').map((n) => {
                  const IATA = n.name.match(/\(([A-Z]{3})\)/)?.[1] || 'N/A';
                  const cleanName = n.name.replace(/\s\([A-Z]{3}\)/, '');
                  return (
                    <Marker 
                      key={n.id} 
                      position={[n.lat, n.lng]}
                      icon={divIcon({
                        html: '<div style="font-size:16px; background:#fff; border-radius:50%; width:24px; height:24px; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 4px rgba(0,0,0,0.3); border: 2px solid #9333ea;">✈️</div>',
                        className: 'custom-airport-icon',
                        iconSize: [24, 24],
                        iconAnchor: [12, 12]
                      })}
                    >
                      <Tooltip>
                        <div style={{ fontWeight: 800, fontSize: '1.1em', marginBottom: 2, color: '#9333ea' }}>{cleanName}</div>
                        <div><strong>IATA:</strong> {IATA}</div>
                        <div><strong>State:</strong> {n.state}</div>
                        <div><strong>Status:</strong> {n.cargo ? 'Cargo Operations Active' : 'Passenger Only / Unverified'}</div>
                      </Tooltip>
                    </Marker>
                  );
                })}
              </LayerGroup>
            </LayersControl.Overlay>
          </LayersControl>
        </MapContainer>
      ) : (
        /* High-Fidelity SVG Offline Vector Canvas Map */
        <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #10261f, #18382e)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 50, right: 15, background: 'rgba(255,255,255,0.1)', color: '#d2f2e5', padding: '4px 10px', borderRadius: 14, fontSize: 9, fontWeight: 800 }}>
            OFFLINE VECTOR CANVAS · NORTH EAST REGION
          </div>

          <svg width="100%" height="100%" viewBox="88 22 10 7" preserveAspectRatio="none" style={{ transform: 'scale(1, -1)' }}>
            {/* Edge lines */}
            {displayEdges.map((e, idx) => {
              const strokeColor = e.mode === 'waterway' ? '#38bdf8' : e.mode === 'railway' ? '#94a3b8' : e.mode === 'air' ? '#c084fc' : (CONDITION_COLOR[e.condition] || '#4ade80');
              return (
                <g key={idx}>
                  <line
                    x1={e.from.lng}
                    y1={e.from.lat}
                    x2={e.to.lng}
                    y2={e.to.lat}
                    stroke={strokeColor}
                    strokeWidth={e.mode === 'railway' || e.mode === 'air' ? 0.04 : 0.05}
                    strokeDasharray={e.mode === 'railway' ? '0.08,0.06' : e.mode === 'waterway' ? '0.15,0.05' : e.mode === 'air' ? '0.03,0.09' : 'none'}
                    opacity={0.9}
                  />
                </g>
              );
            })}

            {/* Node Dots */}
            {nodes.map((n) => (
              <g key={n.id}>
                <circle
                  cx={n.lng}
                  cy={n.lat}
                  r={n.type === 'hub' ? 0.09 : n.type === 'airport' ? 0.07 : 0.06}
                  fill={n.type === 'hub' ? '#ccf363' : n.type === 'airport' ? '#d8b4fe' : '#ffffff'}
                  stroke={n.type === 'airport' ? '#6b21a8' : '#0e2b22'}
                  strokeWidth={0.02}
                />
              </g>
            ))}

            {/* 10 Active Driver Vehicle GPS Markers */}
            {DRIVER_ROSTER.slice(0, 8).map((d, idx) => {
              const lat = 25.0 + (idx * 0.35) % 3.0;
              const lng = 91.5 + (idx * 0.45) % 4.0;
              return (
                <circle key={d.id} cx={lng} cy={lat} r={0.08} fill="#ef4444" stroke="#ffffff" strokeWidth={0.02}>
                  <animate attributeName="r" values="0.07;0.12;0.07" dur="2s" repeatCount="indefinite" />
                </circle>
              );
            })}
          </svg>

          {/* SVG Overlay Labels */}
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {nodes.slice(0, 12).map((n) => {
              // Convert lat/lng to percentage bounds
              const left = `${((n.lng - 88) / 10) * 100}%`;
              const top = `${(1 - (n.lat - 22) / 7) * 100}%`;
              return (
                <div key={n.id} style={{ position: 'absolute', left, top, transform: 'translate(-50%, -50%)', pointerEvents: 'auto' }}>
                  <div style={{ background: 'rgba(14, 43, 34, 0.85)', color: '#ffffff', border: '1px solid rgba(204,243,99,0.4)', padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {n.name}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Legend footer */}
      <div style={legendStyle}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><i style={{ width: 8, height: 8, background: '#3ea274', borderRadius: '50%' }} />🚚 Road</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><i style={{ width: 8, height: 8, background: '#475569', borderRadius: '50%' }} />🚂 Rail (NFR)</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><i style={{ width: 8, height: 8, background: '#0284c7', borderRadius: '50%' }} />🚢 Waterway (NW-2/16)</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><i style={{ width: 8, height: 8, background: '#9333ea', borderRadius: '50%' }} />✈️ Air Cargo</span>
        <span style={{ marginLeft: 'auto', color: '#7c8f87' }}>10 Active Drivers Tracked</span>
      </div>
    </div>
  );
}

const topControlsStyle = { position: 'absolute', zIndex: 500, top: 10, left: 10, right: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 };
const filterTabStyle = (active) => ({
  padding: '6px 11px',
  border: '1px solid #c8dbd0',
  borderRadius: 6,
  fontSize: 10,
  fontWeight: 800,
  cursor: 'pointer',
  background: active ? '#175b4a' : 'rgba(255,255,255,0.92)',
  color: active ? '#ffffff' : '#1e3b32',
  boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
});
const legendStyle = { position: 'absolute', zIndex: 500, bottom: 10, left: 10, right: 10, display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.94)', padding: '6px 12px', borderRadius: 6, fontSize: 10, fontWeight: 800, color: '#315449' };
