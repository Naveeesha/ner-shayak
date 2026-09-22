import { useEffect, useRef, useState, useMemo } from 'react';
import api from '../services/api';
import { NODES as LOCAL_NODES, EDGES as LOCAL_EDGES } from '../services/routeCalculator';
import { DRIVER_ROSTER } from '../services/driverService';

const GOOGLE_MAPS_KEY = process.env.REACT_APP_GOOGLE_MAPS_KEY || 'AIzaSyA6Fx4Jjsvu6ee-HPmntni9d9BSQjSx3ok';

const CONDITION_COLOR = { clear: '#3ea274', caution: '#e2ab3d', disrupted: '#dc725d', blocked: '#8a1f1f' };
const MODE_COLOR = { road: '#3ea274', railway: '#475569', waterway: '#0284c7', air: '#9333ea' };

function loadGoogleMapsScript(key) {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.maps) { resolve(window.google.maps); return; }
    const existing = document.getElementById('gmaps-script');
    if (existing) { existing.addEventListener('load', () => resolve(window.google.maps)); return; }
    const script = document.createElement('script');
    script.id = 'gmaps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=geometry`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google.maps);
    script.onerror = () => reject(new Error('Google Maps failed to load'));
    document.head.appendChild(script);
  });
}

export default function LiveMap({ height = 440, focusRouteEdges = null }) {
  const mapRef = useRef(null);
  const googleMapRef = useRef(null);
  const overlaysRef = useRef([]);

  const [nodes, setNodes] = useState(LOCAL_NODES);
  const [edges, setEdges] = useState(LOCAL_EDGES);
  const [isOfflineMode, setIsOfflineMode] = useState(!GOOGLE_MAPS_KEY || !navigator.onLine);
  const [modeFilter, setModeFilter] = useState('all');
  const [mapsReady, setMapsReady] = useState(false);
  const [mapsError, setMapsError] = useState('');

  // Load nodes/edges from API (or fall back to local)
  useEffect(() => {
    api.nodes().then(r => { if (r.nodes?.length) setNodes(r.nodes); }).catch(() => {});
    api.edges().then(r => { if (r.edges?.length) setEdges(r.edges); }).catch(() => {});
    const handleOnline = () => { if (GOOGLE_MAPS_KEY) setIsOfflineMode(false); };
    const handleOffline = () => setIsOfflineMode(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load Google Maps script
  useEffect(() => {
    if (!GOOGLE_MAPS_KEY || isOfflineMode) return;
    loadGoogleMapsScript(GOOGLE_MAPS_KEY)
      .then(() => setMapsReady(true))
      .catch((err) => {
        setMapsError(err.message);
        setIsOfflineMode(true);
      });
  }, [isOfflineMode]);

  // Build the displayEdges (resolve string IDs → node objects, apply mode filter, ensure valid lat/lng)
  const displayEdges = useMemo(() => {
    const raw = Array.isArray(focusRouteEdges) ? focusRouteEdges : edges;
    if (!Array.isArray(raw)) return [];
    let filtered = modeFilter === 'all' ? raw : raw.filter(e => e && (e.mode || 'road') === modeFilter);
    return filtered.map(e => {
      if (!e) return null;
      let fromNode = typeof e.from === 'string' ? nodes.find(n => n.id === e.from) : e.from;
      let toNode   = typeof e.to   === 'string' ? nodes.find(n => n.id === e.to)   : e.to;
      if (typeof fromNode === 'string') fromNode = nodes.find(n => n.id === fromNode);
      if (typeof toNode === 'string') toNode = nodes.find(n => n.id === toNode);
      if (!fromNode || !toNode || fromNode.lat == null || fromNode.lng == null || toNode.lat == null || toNode.lng == null) {
        return null;
      }
      return { ...e, from: fromNode, to: toNode };
    }).filter(Boolean);
  }, [focusRouteEdges, edges, modeFilter, nodes]);

  // Initialize Google Map
  useEffect(() => {
    if (!mapsReady || !mapRef.current || isOfflineMode) return;
    const maps = window.google.maps;
    if (!googleMapRef.current) {
      googleMapRef.current = new maps.Map(mapRef.current, {
        center: { lat: 25.5, lng: 92.8 },
        zoom: 6,
        mapTypeId: 'roadmap',
        styles: [
          { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#a8d5e2' }] },
          { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#e8f4e8' }] },
          { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#c5e0b4' }] },
          { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#c8dfc8' }] },
          { elementType: 'labels.text.fill', stylers: [{ color: '#2d4a3e' }] },
        ],
        mapTypeControl: true,
        streetViewControl: false,
        fullscreenControl: true,
        zoomControl: true,
      });
    }
  }, [mapsReady, isOfflineMode]);

  // Render overlays (polylines + markers) whenever data changes
  useEffect(() => {
    if (!mapsReady || !googleMapRef.current || isOfflineMode) return;
    const maps = window.google.maps;
    const map = googleMapRef.current;

    // Clear existing overlays
    overlaysRef.current.forEach(o => o.setMap(null));
    overlaysRef.current = [];

    // Draw route edges as Polylines
    displayEdges.forEach(e => {
      const color = e.mode === 'waterway' ? MODE_COLOR.waterway
        : e.mode === 'railway' ? MODE_COLOR.railway
        : e.mode === 'air' ? MODE_COLOR.air
        : (CONDITION_COLOR[e.condition] || MODE_COLOR.road);

      const icons = e.mode === 'railway'
        ? [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 }, offset: '0', repeat: '12px' }]
        : e.mode === 'waterway'
        ? [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 }, offset: '0', repeat: '20px' }]
        : e.mode === 'air'
        ? [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 2 }, offset: '0', repeat: '8px' }]
        : [];

      const polyline = new maps.Polyline({
        path: [
          { lat: e.from.lat, lng: e.from.lng },
          { lat: e.to.lat,   lng: e.to.lng   },
        ],
        geodesic: true,
        strokeColor: color,
        strokeOpacity: icons.length ? 0 : 0.85,
        strokeWeight: focusRouteEdges ? 6 : 4,
        icons,
        map,
      });

      // Info window on click
      const infoWindow = new maps.InfoWindow({
        content: `<div style="font-size:12px;font-family:sans-serif;min-width:180px">
          <b style="color:#175b4a">[${(e.mode || 'ROAD').toUpperCase()}] ${e.road || ''}</b><br/>
          ${e.from.name} → ${e.to.name}<br/>
          <span style="color:#7c8f87">${e.km} km · ${e.condition || 'clear'}</span>
        </div>`,
      });

      polyline.addListener('click', (ev) => {
        infoWindow.setPosition(ev.latLng);
        infoWindow.open(map);
      });

      overlaysRef.current.push(polyline);
    });

    // Draw hub/node markers
    nodes.filter(n => n.type !== 'airport').forEach(n => {
      const marker = new maps.Marker({
        position: { lat: n.lat, lng: n.lng },
        map,
        title: `${n.name}, ${n.state}`,
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale: n.type === 'hub' ? 8 : 5,
          fillColor: n.type === 'hub' ? '#ccf363' : '#ffffff',
          fillOpacity: 1,
          strokeColor: '#155b4b',
          strokeWeight: 2,
        },
      });
      const info = new maps.InfoWindow({
        content: `<div style="font-size:12px;font-family:sans-serif">
          <b style="color:#175b4a">${n.name}</b><br/>
          ${n.state} · ${n.type === 'hub' ? 'Multimodal Hub' : 'District Node'}
        </div>`,
      });
      marker.addListener('click', () => info.open(map, marker));
      overlaysRef.current.push(marker);
    });

    // Draw airport markers
    nodes.filter(n => n.type === 'airport').forEach(n => {
      const IATA = n.name.match(/\(([A-Z]{3})\)/)?.[1] || 'N/A';
      const cleanName = n.name.replace(/\s\([A-Z]{3}\)/, '');
      const marker = new maps.Marker({
        position: { lat: n.lat, lng: n.lng },
        map,
        title: cleanName,
        label: { text: '✈', color: '#9333ea', fontSize: '16px' },
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#f3e8ff',
          fillOpacity: 1,
          strokeColor: '#9333ea',
          strokeWeight: 2,
        },
      });
      const info = new maps.InfoWindow({
        content: `<div style="font-size:12px;font-family:sans-serif;min-width:160px">
          <b style="color:#9333ea;font-size:14px">${cleanName}</b><br/>
          IATA: <b>${IATA}</b> · ${n.state}<br/>
          ${n.cargo ? '✅ Cargo Operations Active' : '🚶 Passenger Only'}
        </div>`,
      });
      marker.addListener('click', () => info.open(map, marker));
      overlaysRef.current.push(marker);
    });

    // Draw animated driver dots
    DRIVER_ROSTER.slice(0, 8).forEach((d, idx) => {
      const lat = 25.0 + (idx * 0.35) % 3.0;
      const lng = 91.5 + (idx * 0.45) % 4.0;
      const marker = new maps.Marker({
        position: { lat, lng },
        map,
        title: `🚚 ${d.name} (${d.vehicleNumber})`,
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: '#ef4444',
          fillOpacity: 0.9,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
        zIndex: 999,
      });
      const info = new maps.InfoWindow({
        content: `<div style="font-size:11px;font-family:sans-serif">
          <b>🚚 ${d.name}</b><br/>
          ${d.vehicleNumber} · ${d.district}, ${d.state}<br/>
          <span style="color:#059669;font-weight:700">Active · GPS Live</span>
        </div>`,
      });
      marker.addListener('click', () => info.open(map, marker));
      overlaysRef.current.push(marker);
    });

    // Focus map on route if provided
    if (focusRouteEdges && focusRouteEdges.length > 0) {
      const bounds = new maps.LatLngBounds();
      focusRouteEdges.forEach(e => {
        if (e.from?.lat) bounds.extend({ lat: e.from.lat, lng: e.from.lng });
        if (e.to?.lat)   bounds.extend({ lat: e.to.lat,   lng: e.to.lng   });
      });
      map.fitBounds(bounds, { top: 50, right: 20, bottom: 50, left: 20 });
    }
  }, [mapsReady, displayEdges, nodes, isOfflineMode, focusRouteEdges]);

  return (
    <div style={{ position: 'relative', width: '100%', height, background: '#eaf4ee', borderRadius: 10, overflow: 'hidden', border: '1px solid #d4e5db' }}>

      {/* Top Controls */}
      <div style={topControlsStyle}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {['all', 'road', 'railway', 'waterway', 'air'].map(m => (
            <button
              key={m}
              onClick={() => setModeFilter(m)}
              style={{ ...filterTabStyle(modeFilter === m), padding: '4px 8px', fontSize: 9, textTransform: 'capitalize' }}
            >
              {m === 'all' ? '🗂 All' : m === 'road' ? '🚚 Road' : m === 'railway' ? '🚂 Rail' : m === 'waterway' ? '🚢 Water' : '✈️ Air'}
            </button>
          ))}
        </div>
        <button
          onClick={() => setIsOfflineMode(v => !v)}
          style={{ ...filterTabStyle(isOfflineMode), background: isOfflineMode ? '#175b4a' : '#ffffff', color: isOfflineMode ? '#ffffff' : '#175b4a' }}
        >
          {isOfflineMode ? '🗺️ Offline Canvas' : '🌐 Google Maps'}
        </button>
      </div>

      {/* Google Maps container */}
      {!isOfflineMode && (
        <div ref={mapRef} style={{ width: '100%', height: '100%' }}>
          {!mapsReady && !mapsError && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12, background: '#eaf4ee' }}>
              <div style={{ width: 32, height: 32, border: '3px solid #175b4a', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: 12, color: '#315449', fontWeight: 600 }}>Loading Google Maps…</span>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}
          {mapsError && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 8, background: '#eaf4ee' }}>
              <span style={{ fontSize: 13, color: '#b5493a', fontWeight: 700 }}>⚠️ {mapsError}</span>
              <span style={{ fontSize: 11, color: '#7c8f87' }}>Switching to offline canvas map…</span>
            </div>
          )}
        </div>
      )}

      {/* Offline SVG Canvas Map */}
      {isOfflineMode && (
        <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #10261f, #18382e)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 50, right: 15, background: 'rgba(255,255,255,0.1)', color: '#d2f2e5', padding: '4px 10px', borderRadius: 14, fontSize: 9, fontWeight: 800 }}>
            {GOOGLE_MAPS_KEY ? 'OFFLINE CANVAS · NORTH EAST REGION' : 'SVG CANVAS · ADD GOOGLE MAPS KEY TO ENABLE LIVE MAP'}
          </div>

          <svg width="100%" height="100%" viewBox="88 22 10 7" preserveAspectRatio="none" style={{ transform: 'scale(1, -1)' }}>
            {displayEdges.map((e, idx) => {
              const strokeColor = e.mode === 'waterway' ? '#38bdf8'
                : e.mode === 'railway' ? '#94a3b8'
                : e.mode === 'air' ? '#c084fc'
                : (CONDITION_COLOR[e.condition] || '#4ade80');
              return (
                <line
                  key={idx}
                  x1={e.from.lng} y1={e.from.lat}
                  x2={e.to.lng}   y2={e.to.lat}
                  stroke={strokeColor}
                  strokeWidth={e.mode === 'railway' || e.mode === 'air' ? 0.04 : 0.05}
                  strokeDasharray={e.mode === 'railway' ? '0.08,0.06' : e.mode === 'waterway' ? '0.15,0.05' : e.mode === 'air' ? '0.03,0.09' : 'none'}
                  opacity={0.9}
                />
              );
            })}
            {nodes.map(n => (
              <circle
                key={n.id}
                cx={n.lng} cy={n.lat}
                r={n.type === 'hub' ? 0.09 : n.type === 'airport' ? 0.07 : 0.06}
                fill={n.type === 'hub' ? '#ccf363' : n.type === 'airport' ? '#d8b4fe' : '#ffffff'}
                stroke={n.type === 'airport' ? '#6b21a8' : '#0e2b22'}
                strokeWidth={0.02}
              />
            ))}
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

          {/* Node labels overlay */}
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {nodes.slice(0, 14).map(n => (
              <div
                key={n.id}
                style={{
                  position: 'absolute',
                  left: `${((n.lng - 88) / 10) * 100}%`,
                  top:  `${(1 - (n.lat - 22) / 7) * 100}%`,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <div style={{ background: 'rgba(14,43,34,0.85)', color: '#fff', border: '1px solid rgba(204,243,99,0.4)', padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {n.name}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div style={legendStyle}>
        <span style={legendItem}><i style={{ background: '#3ea274' }} />🚚 Road</span>
        <span style={legendItem}><i style={{ background: '#475569' }} />🚂 Rail (NFR)</span>
        <span style={legendItem}><i style={{ background: '#0284c7' }} />🚢 Waterway</span>
        <span style={legendItem}><i style={{ background: '#9333ea' }} />✈️ Air</span>
        <span style={{ marginLeft: 'auto', color: '#7c8f87', fontSize: 9 }}>
          {isOfflineMode ? '📡 Offline Canvas' : '📍 Google Maps · 10 Drivers Live'}
        </span>
      </div>
    </div>
  );
}

const topControlsStyle = { position: 'absolute', zIndex: 500, top: 10, left: 10, right: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' };
const filterTabStyle = (active) => ({
  padding: '6px 11px', border: '1px solid #c8dbd0', borderRadius: 6, fontSize: 10, fontWeight: 800, cursor: 'pointer',
  background: active ? '#175b4a' : 'rgba(255,255,255,0.92)', color: active ? '#ffffff' : '#1e3b32',
  boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
});
const legendStyle = { position: 'absolute', zIndex: 500, bottom: 10, left: 10, right: 10, display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.94)', padding: '6px 12px', borderRadius: 6, fontSize: 10, fontWeight: 800, color: '#315449', flexWrap: 'wrap' };
const legendItem = { display: 'inline-flex', alignItems: 'center', gap: 4 };
