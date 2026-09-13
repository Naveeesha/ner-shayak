import { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import LiveMap from './LiveMap';

export default function DriverOverview({ navigate, action, notify }) {
  const { user } = useAuth();
  const [insight, setInsight] = useState(null);
  const [myVehicle, setMyVehicle] = useState(null);
  const [tracking, setTracking] = useState(false);
  const [watchId, setWatchId] = useState(null);

  useEffect(() => {
    // Load local weather for driver's district
    api.nodes().then((res) => {
      const match = res.nodes.find((n) => n.name.toLowerCase() === (user.district || '').toLowerCase())
        || res.nodes.find((n) => n.state === user.state) || res.nodes.find((n) => n.id === 'guwahati');
      if (match) api.weatherFor(match.id).then((w) => setInsight({ node: match, weather: w })).catch(() => {});
    }).catch(() => {});

    // Load driver's registered vehicle
    api.vehicles().then((res) => {
      const found = res.vehicles.find((v) => v.ownerId === user.id) || res.vehicles[0];
      if (found) setMyVehicle(found);
    }).catch(() => {});
  }, [user.district, user.id, user.state]);

  const toggleGpsTracking = () => {
    if (!myVehicle) {
      notify && notify('No vehicle assigned to track.');
      return;
    }
    if (tracking && watchId) {
      navigator.geolocation?.clearWatch(watchId);
      setWatchId(null);
      setTracking(false);
      notify && notify('Driver GPS location tracking stopped.');
      return;
    }
    if (!navigator.geolocation) {
      notify && notify('GPS is not supported on this device.');
      return;
    }
    const id = navigator.geolocation.watchPosition(
      async (pos) => {
        try {
          const res = await api.pingVehicle(myVehicle.id, { lat: pos.coords.latitude, lng: pos.coords.longitude });
          setMyVehicle(res.vehicle);
        } catch (_) {}
      },
      () => notify && notify('Could not acquire GPS fix.'),
      { enableHighAccuracy: true }
    );
    setWatchId(id);
    setTracking(true);
    notify && notify('Live GPS tracking activated for vehicle ' + (myVehicle.vehicleNumber || ''));
  };

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {/* Driver Identity Card */}
      <section className="card" style={{ padding: '18px 20px', background: 'linear-gradient(135deg, #175b4a, #20745d)', color: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.5, color: '#c3ebda' }}>DRIVER TELEMETRY & WORKSPACE</div>
            <h2 style={{ color: '#fff', fontSize: 20, margin: '4px 0 2px' }}>{user.name}</h2>
            <div style={{ fontSize: 11, color: '#d2f2e5' }}>
              Vehicle: <b>{user.vehicleNumber || myVehicle?.vehicleNumber || 'AS 01 K 4309'}</b> · District: <b>{user.district || 'Kamrup Metropolitan'}</b>
            </div>
          </div>
          <button
            onClick={toggleGpsTracking}
            style={{
              padding: '10px 16px',
              border: 0,
              borderRadius: 7,
              background: tracking ? '#b5493a' : '#ccf363',
              color: tracking ? '#fff' : '#12483a',
              fontSize: 11,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            {tracking ? '🔴 Stop GPS Location Broadcast' : '📡 Start Live Driver GPS'}
          </button>
        </div>
      </section>

      {/* Grid Layout */}
      <div className="dashboard-grid">
        <section className="card routes">
          <header><div><small>LIVE ROAD MAP</small><h2>Corridor map around {user.district || 'you'}</h2></div><button onClick={() => navigate('Live map')}>Open map ➔</button></header>
          <div className="map-view" style={{ padding: 0 }}><LiveMap height={270} /></div>
        </section>

        <section className="card journey">
          <div className="journey-top">
            <div><small>ROUTE WEATHER WATCH</small><h2>{insight?.node?.name || 'Local District'} <span>→</span> Destination</h2><p>NH 27 Corridor · Live Weather & Risk</p></div>
          </div>
          <div className="journey-time">
            <span style={{ color: '#176d55' }}>⛅ {insight ? insight.weather.label : 'Checking conditions'}</span>
            <b>{insight ? `${insight.weather.tempC}°C` : '28°C'}</b>
            <p>Precipitation: {insight ? `${insight.weather.rainMm} mm` : '0 mm'} · Wind: {insight ? `${insight.weather.windKmh} km/h` : '12 km/h'}</p>
          </div>
          <div className="conditions">
            <div><span>District Risk Level</span><b><i></i>{insight ? insight.weather.label : 'Clear'}</b></div>
            <p><i style={{ left: `${Math.min(90, (insight?.weather?.severity || 0) * 100)}%` }}></i></p>
            <footer><span>Clear</span><span>Caution</span><span>Disrupted</span></footer>
          </div>
          <button className="route-details" onClick={action}>Plan route details ➔</button>
        </section>
      </div>

      {/* Quick Actions */}
      <div className="bottom-grid">
        <section className="card quick">
          <small>DRIVER QUICK ACTIONS</small><h2>On-road Tools</h2>
          <button onClick={() => navigate('Route planner')}>
            <span>🗺️</span><b>Plan Safest Route</b><small>Risk-weighted navigation</small>➔
          </button>
          <button onClick={() => navigate('Field reports')}>
            <span>⚠️</span><b>Report Road Hazard</b><small>Landslide / flood update</small>➔
          </button>
          <button onClick={() => notify('Emergency helpline: dial 112 (India National Emergency).')}>
            <span>📞</span><b>Emergency Support</b><small>Dial 112 Helpline</small>➔
          </button>
        </section>

        <section className="card" style={{ padding: '20px' }}>
          <small style={{ color: '#8aa097', fontSize: 9, fontWeight: 800 }}>ASSIGNED VEHICLE STATUS</small>
          <h3 style={{ margin: '8px 0 12px', fontSize: 16, color: '#25483d' }}>{myVehicle ? myVehicle.vehicleNumber : (user.vehicleNumber || 'AS 01 K 4309')}</h3>
          <div style={{ display: 'grid', gap: 8, fontSize: 11 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #edf1ee' }}>
              <span style={{ color: '#7c8f87' }}>Cargo Type:</span>
              <b>{myVehicle?.cargoType || 'Medical supplies / Essential goods'}</b>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #edf1ee' }}>
              <span style={{ color: '#7c8f87' }}>Route Assigned:</span>
              <b>{myVehicle ? `${myVehicle.originNode.toUpperCase()} → ${myVehicle.destinationNode.toUpperCase()}` : 'Guwahati → Jorhat'}</b>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #edf1ee' }}>
              <span style={{ color: '#7c8f87' }}>GPS Signal:</span>
              <b style={{ color: tracking ? '#176d55' : '#7c8f87' }}>{tracking ? '🟢 Broadcasting Live' : '⚪ Idle'}</b>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
