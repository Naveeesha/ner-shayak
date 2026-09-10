import { useState } from 'react';
import { useAuth, LANGUAGES } from '../context/AuthContext';
import api from '../services/api';
import { offlineQueue, isOnline } from '../services/offlineQueue';

export default function SettingsPanel({ notify }) {
  const { user, updateProfile } = useAuth();
  const [language, setLanguage] = useState(user.language || 'en');
  const [busy, setBusy] = useState(false);
  const [queued] = useState(offlineQueue.count());

  const save = async () => {
    setBusy(true);
    try {
      await updateProfile({ language });
      notify && notify('Alert language updated.');
    } catch (err) {
      notify && notify(`Could not save: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const syncNow = async () => {
    setBusy(true);
    try {
      const res = await offlineQueue.flush(api);
      notify && notify(`Synced ${res.synced} offline item(s).`);
    } catch (err) {
      notify && notify(`Sync failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 20, maxWidth: 480 }}>
      <div>
        <h4 style={{ fontSize: 12, color: '#39735f', marginBottom: 8 }}>Alert language</h4>
        <div style={{ display: 'flex', gap: 10 }}>
          <select value={language} onChange={(e) => setLanguage(e.target.value)} style={inputStyle}>
            {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
          <button onClick={save} disabled={busy} style={btnStyle}>Save</button>
        </div>
      </div>

      <div>
        <h4 style={{ fontSize: 12, color: '#39735f', marginBottom: 8 }}>Network status</h4>
        <p style={{ fontSize: 12, color: '#7c8f87' }}>
          You are currently <b style={{ color: isOnline() ? '#1e745b' : '#b5493a' }}>{isOnline() ? 'online' : 'offline'}</b>.
          {queued > 0 && ` ${queued} field report(s) are queued locally.`}
        </p>
        {queued > 0 && <button onClick={syncNow} disabled={busy} style={btnStyle}>Sync now</button>}
      </div>

      <div>
        <h4 style={{ fontSize: 12, color: '#39735f', marginBottom: 8 }}>Account</h4>
        <p style={{ fontSize: 12, color: '#7c8f87' }}>Signed in as <b>{user.email}</b> · role: <b style={{ textTransform: 'capitalize' }}>{user.role}</b></p>
      </div>
    </div>
  );
}

const inputStyle = { height: 42, padding: '0 12px', border: '1px solid #dce5df', borderRadius: 7, fontSize: 13, flex: 1 };
const btnStyle = { height: 42, padding: '0 16px', border: 0, borderRadius: 7, color: '#fff', background: '#1e745b', fontSize: 12, fontWeight: 800, cursor: 'pointer' };
