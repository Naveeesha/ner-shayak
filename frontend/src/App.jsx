import { useEffect, useState } from 'react';
import './App.css';
import { AuthProvider, LANGUAGES, NER_REGION_STATES, USER_ROLES, useAuth } from './context/AuthContext';
import api from './services/api';
import LiveMap from './components/LiveMap';
import RoutePlanner from './components/RoutePlanner';
import FieldReportForm from './components/FieldReportForm';
import VehicleTracker from './components/VehicleTracker';
import DistrictDashboard from './components/DistrictDashboard';
import AlertsList from './components/AlertsList';
import SettingsPanel from './components/SettingsPanel';
import UsersDirectory from './components/UsersDirectory';

const Icon = ({ n, s = 20 }) => {
  const icons = {
    logo: <><path d="M5 17 11.5 4l2.3 7.1L19 13.3l-7 6.7-2.6-6.3L5 17Z"/><path d="m13.7 11.1-4.2 2.6"/></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    map: <><path d="m9 18-6 3V6l6-3 6 3 6-3v15l-6 3-6-3Z"/><path d="M9 3v15M15 6v15"/></>,
    route: <><circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18c7 0 1-10 8-10"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
    report: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.9 2.9-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.04 1.56V21h-3.84v-.08A1.7 1.7 0 0 0 9.04 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.9-2.9.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.04H3v-3.84h.08A1.7 1.7 0 0 0 4.6 9.04a1.7 1.7 0 0 0-.34-1.88L4.2 7.1l2.9-2.9.06.06A1.7 1.7 0 0 0 9.04 4.6a1.7 1.7 0 0 0 1.04-1.56V3h3.84v.08A1.7 1.7 0 0 0 14.96 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.9 2.9-.06.06A1.7 1.7 0 0 0 19.4 9.04a1.7 1.7 0 0 0 1.56 1.04H21v3.84h-.08A1.7 1.7 0 0 0 19.4 15Z"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>, plus: <path d="M12 5v14M5 12h14"/>, arrow: <><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>, eye: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></>,
    check: <path d="m5 12 4 4L19 6"/>, menu: <path d="M4 6h16M4 12h16M4 18h16"/>, close: <path d="m6 6 12 12M18 6 6 18"/>,
    spark: <><path d="m12 2 1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6L12 2Z"/><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z"/></>,
    phone: <><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M10 18h4"/></>, cloud: <path d="M17 18H7a4 4 0 1 1 .8-7.9A5.5 5.5 0 0 1 18.4 12 3 3 0 0 1 17 18Z"/>,
    user: <><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></>,
  };
  return <svg className="icon" width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{icons[n]}</svg>;
};

const roles = USER_ROLES;

const roleCopy = {
  driver: { title: 'Your journey, made safer.', sub: 'Stay ahead of road closures and weather changes on your route.', action: 'Plan a journey' },
  field: { title: 'The field is counting on you.', sub: 'See what needs attention and keep your team in sync.', action: 'Create field report' },
  logistics: { title: 'Move what matters, with confidence.', sub: 'Live routing intelligence for every critical shipment.', action: 'Plan a shipment' },
  official: { title: 'A clearer view of the region.', sub: 'Turn live intelligence into timely, confident decisions.', action: 'View regional briefing' },
};

const baseNav = [['Overview', 'grid'], ['Live map', 'map'], ['Route planner', 'route'], ['Alerts', 'bell'], ['Field reports', 'report'], ['Profile', 'user']];
const navForRole = (role) => role === 'official'
  ? [...baseNav.slice(0, 5), ['Team directory', 'grid'], baseNav[5]]
  : baseNav;

const emptySignup = {
  name: '', email: '', phone: '', password: '', confirm: '', role: 'driver',
  organisation: '', vehicleNumber: '', state: 'Assam', district: '', language: 'en', hub: '', department: '',
};

function Brand({ light = false }) {
  return <div className={`brand ${light ? 'light' : ''}`}><div className="brand-mark"><Icon n="logo" s={20}/></div><div><strong>ner-sahayak</strong><span>intelligence network</span></div></div>;
}

function AuthShell({ children, intro }) {
  return (
    <main className="login-page">
      <section className="login-aside">
        <Brand light/>
        <div className="login-hero">
          <div className="live-label"><i/>NORTHEAST INDIA • LIVE INTELLIGENCE</div>
          <h1>Every route.<br/><em>A safer way forward.</em></h1>
          <p>One calm, connected view of the information that keeps people, essential services, and communities moving.</p>
        </div>
        <div className="route-art">
          <span className="road a"/><span className="road b"/><span className="road c"/>
          <i className="dot da"/><i className="dot db"/><i className="dot dc"/>
          <div className="art-tag ta"><b/>Road access<br/><strong>Monitored live</strong></div>
          <div className="art-tag tb"><b/>Risk intelligence<br/><strong>Always learning</strong></div>
        </div>
        <div className="aside-foot"><i/>System status: All services operational <span>•</span> v1.0.0</div>
      </section>
      <section className="login-panel">
        <div className="login-box">
          <div className="mobile-brand"><Brand/></div>
          {intro}
          {children}
        </div>
        <footer>© 2026 Ner-Sahayak AI <span>•</span> Made for resilient movement</footer>
      </section>
    </main>
  );
}

function Login({ onSignup }) {
  const { login } = useAuth();
  const [role, setRole] = useState('driver');
  const [email, setEmail] = useState('arjun@ner-sahayak.in');
  const [password, setPassword] = useState('sahayak123');
  const [seen, setSeen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const fillDemo = (id) => {
    const emails = {
      driver: 'arjun@ner-sahayak.in', field: 'priya@ner-sahayak.in',
      logistics: 'rohan@ner-sahayak.in', official: 'ananya@ner-sahayak.in',
    };
    setRole(id); setEmail(emails[id]); setPassword('sahayak123'); setError('');
  };

  const submit = async (event) => {
    event.preventDefault();
    setError(''); setBusy(true);
    try {
      const account = await login(email, password);
      if (account.role !== role) setRole(account.role);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <AuthShell intro={<div className="login-intro"><div className="eyebrow">WELCOME BACK</div><h2>Sign in to your workspace</h2><p>Choose your role, then continue with your official NER-Sahayak account.</p></div>}>
      <div className="role-picker">
        {roles.map((item) => (
          <button type="button" key={item.id} onClick={() => fillDemo(item.id)} className={item.id === role ? 'active' : ''}>
            <span><Icon n={item.icon} s={17}/></span>{item.label}{item.id === role && <i><Icon n="check" s={12}/></i>}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="login-form">
        <label>Work email<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="username" required/></label>
        <label>Password
          <div className="password">
            <input value={password} onChange={(e) => setPassword(e.target.value)} type={seen ? 'text' : 'password'} autoComplete="current-password" required/>
            <button type="button" onClick={() => setSeen(!seen)} aria-label="Toggle password visibility"><Icon n="eye" s={18}/></button>
          </div>
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-tools">
          <label className="remember"><input defaultChecked type="checkbox"/><span/>Keep me signed in</label>
          <button type="button" className="link">Forgot password?</button>
        </div>
        <button disabled={busy} className="sign-in">{busy ? 'Opening your workspace…' : <>Continue to workspace <Icon n="arrow" s={18}/></>}</button>
      </form>
      <p className="demo-hint">Demo password for seeded accounts: <b>sahayak123</b></p>
      <p className="login-help">New to the network? <button className="link" onClick={onSignup}>Create a profile</button></p>
    </AuthShell>
  );
}

function Signup({ onLogin }) {
  const { signup } = useAuth();
  const [form, setForm] = useState(emptySignup);
  const [seen, setSeen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (form.password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (form.password !== form.confirm) { setError('Passwords do not match.'); return; }
    setBusy(true);
    try {
      await signup(form);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <AuthShell intro={<div className="login-intro"><div className="eyebrow">JOIN THE NETWORK</div><h2>Create your NER-Sahayak profile</h2><p>Register as a driver, field officer, logistics operator, or government official.</p></div>}>
      <div className="role-picker">
        {roles.map((item) => (
          <button type="button" key={item.id} onClick={() => setForm((prev) => ({ ...prev, role: item.id }))} className={item.id === form.role ? 'active' : ''}>
            <span><Icon n={item.icon} s={17}/></span>{item.label}{item.id === form.role && <i><Icon n="check" s={12}/></i>}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="login-form signup-form">
        <div className="field-row">
          <label>Full name<input value={form.name} onChange={set('name')} type="text" placeholder="Your name" required/></label>
          <label>Phone<input value={form.phone} onChange={set('phone')} type="tel" placeholder="+91"/></label>
        </div>
        <label>Work email<input value={form.email} onChange={set('email')} type="email" autoComplete="email" required/></label>
        <label>Organisation / unit<input value={form.organisation} onChange={set('organisation')} type="text" placeholder="Depot, PWD unit, control room, or department" required/></label>
        <div className="field-row">
          <label>State
            <select value={form.state} onChange={set('state')}>
              {NER_REGION_STATES.map((state) => <option key={state} value={state}>{state}</option>)}
            </select>
          </label>
          <label>District / posting<input value={form.district} onChange={set('district')} type="text" placeholder="District" required/></label>
        </div>
        {form.role === 'driver' && <label>Vehicle number<input value={form.vehicleNumber} onChange={set('vehicleNumber')} type="text" placeholder="AS 01 K 4309" required/></label>}
        {form.role === 'logistics' && <label>Logistics hub<input value={form.hub} onChange={set('hub')} type="text" placeholder="Khanapara hub" required/></label>}
        {form.role === 'official' && <label>Department<input value={form.department} onChange={set('department')} type="text" placeholder="Disaster management / DoNER" required/></label>}
        <label>Alert language
          <select value={form.language} onChange={set('language')}>
            {LANGUAGES.map((lang) => <option key={lang.id} value={lang.id}>{lang.label}</option>)}
          </select>
        </label>
        <div className="field-row">
          <label>Password
            <div className="password">
              <input value={form.password} onChange={set('password')} type={seen ? 'text' : 'password'} autoComplete="new-password" required/>
              <button type="button" onClick={() => setSeen(!seen)} aria-label="Toggle password visibility"><Icon n="eye" s={18}/></button>
            </div>
          </label>
          <label>Confirm password<input value={form.confirm} onChange={set('confirm')} type={seen ? 'text' : 'password'} autoComplete="new-password" required/></label>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button disabled={busy} className="sign-in">{busy ? 'Creating your profile…' : <>Create profile and enter <Icon n="arrow" s={18}/></>}</button>
      </form>
      <p className="login-help">Already registered? <button className="link" onClick={onLogin}>Sign in</button></p>
    </AuthShell>
  );
}

function ProfileView({ roleMeta, initials, notify }) {
  const { user, updateProfile } = useAuth();
  const [form, setForm] = useState({
    name: user.name, phone: user.phone || '', organisation: user.organisation || '',
    vehicleNumber: user.vehicleNumber || '', state: user.state || 'Assam', district: user.district || '',
    language: user.language || 'en', hub: user.hub || '', department: user.department || '',
  });
  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));
  const languageLabel = LANGUAGES.find((item) => item.id === (user.language || 'en'))?.label;

  const save = async (event) => {
    event.preventDefault();
    try {
      await updateProfile(form);
      notify('Profile saved. Alerts will use your preferred language.');
    } catch (err) {
      notify(`Could not save profile: ${err.message}`);
    }
  };

  return (
    <section className="profile-page">
      <div className="profile-hero card">
        <span className="profile-avatar">{initials}</span>
        <div><small>SIGNED IN</small><h2>{user.name}</h2><p>{user.email}</p></div>
        <div className="profile-role-badge"><Icon n={roleMeta.icon} s={16}/>{roleMeta.label}</div>
      </div>
      <div className="profile-grid">
        <form className="card profile-form login-form" onSubmit={save}>
          <header><div><small>ACCOUNT</small><h2>Edit your profile</h2></div></header>
          <label>Full name<input value={form.name} onChange={set('name')} type="text" required/></label>
          <label>Work email<input value={user.email} type="email" disabled/></label>
          <div className="field-row">
            <label>Phone<input value={form.phone} onChange={set('phone')} type="tel"/></label>
            <label>State
              <select value={form.state} onChange={set('state')}>
                {NER_REGION_STATES.map((state) => <option key={state} value={state}>{state}</option>)}
              </select>
            </label>
          </div>
          <label>District / posting<input value={form.district} onChange={set('district')} type="text"/></label>
          <label>Organisation / unit<input value={form.organisation} onChange={set('organisation')} type="text"/></label>
          {user.role === 'driver' && <label>Vehicle number<input value={form.vehicleNumber} onChange={set('vehicleNumber')} type="text"/></label>}
          {user.role === 'logistics' && <label>Logistics hub<input value={form.hub} onChange={set('hub')} type="text"/></label>}
          {user.role === 'official' && <label>Department<input value={form.department} onChange={set('department')} type="text"/></label>}
          <label>Alert language
            <select value={form.language} onChange={set('language')}>
              {LANGUAGES.map((lang) => <option key={lang.id} value={lang.id}>{lang.label}</option>)}
            </select>
          </label>
          <button className="primary" type="submit">Save profile</button>
        </form>
        <aside className="card profile-access">
          <small>ROLE ACCESS</small>
          <h2>What this workspace can do</h2>
          <ul>{roleMeta.permissions.map((item) => <li key={item}><Icon n="check" s={14}/>{item}</li>)}</ul>
          <p className="profile-note">Multilingual alerts are set to <b>{languageLabel}</b>. Field reports can sync later when the network returns.</p>
        </aside>
      </div>
    </section>
  );
}

function WorkspaceSwitcher({ role, onChange, close, exit, openProfile }) {
  return <div className="workspace-switcher" role="dialog" aria-label="Switch workspace"><header><div><span>WORKSPACE</span><h3>Choose a profile</h3></div><button onClick={close} aria-label="Close workspace switcher"><Icon n="close" s={16}/></button></header><div className="switcher-list">{roles.map(item => <button key={item.id} className={item.id === role ? 'active' : ''} onClick={() => onChange(item.id)}><span className="switcher-avatar">{item.initials}</span><span><b>{item.name}</b><small>{item.label}</small></span>{item.id === role && <Icon n="check" s={15}/>}</button>)}</div><footer><button type="button" className="profile-link" onClick={openProfile}>View my profile</button><button onClick={exit}>Sign out</button></footer></div>;
}

// Full-page views for each nav item — all backed by the real API.
function PageView({ page, role, notify }) {
  const details = {
    'Live map': ['Live network map', 'Explore road conditions, weather warnings and moving resources in one map.', 'map'],
    'Route planner': ['Plan the safest route', 'AI-optimized routing using live weather and disruption data.', 'route'],
    Alerts: ['Your alerts', 'Stay up to date with the signals that matter to you.', 'bell'],
    'Field reports': ['Field reports', 'Share a geo-tagged update that helps the wider network respond.', 'report'],
    Settings: ['Workspace settings', 'Manage notification preferences, language, and offline synchronisation.', 'settings'],
    'Team directory': ['Team directory', 'Every registered driver, field officer, logistics operator, and official across the network.', 'grid'],
  };
  const [title, description, icon] = details[page];
  return (
    <section className="card" style={{ padding: '22px 24px' }}>
      <header style={{ padding: 0, minHeight: 'auto', marginBottom: 16 }}>
        <div>
          <small><Icon n={icon} s={12}/> {page.toUpperCase()}</small>
          <h2 style={{ marginTop: 8 }}>{title}</h2>
          <p style={{ color: '#789087', fontSize: 12, marginTop: 4 }}>{description}</p>
        </div>
      </header>
      {page === 'Live map' && <LiveMap height={520} />}
      {page === 'Route planner' && <RoutePlanner notify={notify} />}
      {page === 'Alerts' && <AlertsList notify={notify} />}
      {page === 'Field reports' && (role === 'logistics' ? <VehicleTracker notify={notify} /> : <FieldReportForm notify={notify} />)}
      {page === 'Settings' && <SettingsPanel notify={notify} />}
      {page === 'Team directory' && <UsersDirectory />}
    </section>
  );
}

function OverviewAlerts({ navigate, notify }) {
  const [alerts, setAlerts] = useState([]);
  useEffect(() => { api.alerts().then((res) => setAlerts(res.alerts.slice(0, 3))).catch(() => {}); }, []);
  const toneClass = { amber: 'amber', blue: 'blue', green: 'green' };
  return (
    <section className="card attention">
      <header><div><small>STAY INFORMED</small><h2>What needs your attention</h2></div><button onClick={() => navigate('Alerts')}>View all <Icon n="arrow" s={15}/></button></header>
      {alerts.length === 0 && <p style={{ fontSize: 11, color: '#7c8f87', padding: '10px 0' }}>No active alerts right now.</p>}
      {alerts.map((a) => (
        <article className="alert" key={a.id}>
          <div className={toneClass[a.tone] || 'blue'}><Icon n={a.icon} s={18}/></div>
          <section>
            <header><b>{a.type}</b><time>{new Date(a.createdAt).toLocaleTimeString()}</time></header>
            <h3>{a.title}</h3><p>{a.text}</p>
          </section>
          <button onClick={() => { navigate('Alerts'); notify(`Opened ${a.title}`); }} aria-label={`Open ${a.title}`}><Icon n="chevron" s={16}/></button>
        </article>
      ))}
    </section>
  );
}

function Overview({ role, navigate, action, notify }) {
  const [insight, setInsight] = useState(null);
  const { user } = useAuth();

  useEffect(() => {
    api.nodes().then((res) => {
      const match = res.nodes.find((n) => n.name.toLowerCase() === (user.district || '').toLowerCase())
        || res.nodes.find((n) => n.state === user.state) || res.nodes.find((n) => n.id === 'guwahati');
      if (match) api.weatherFor(match.id).then((w) => setInsight({ node: match, weather: w })).catch(() => {});
    }).catch(() => {});
  }, [user.district, user.state]);

  if (role === 'official') {
    return <DistrictDashboard notify={notify} />;
  }

  return (
    <>
      <div className="dashboard-grid">
        <section className="card routes">
          <header><div><small>LIVE NETWORK</small><h2>Routes around you</h2></div><button onClick={() => navigate('Live map')}>Open map <Icon n="arrow" s={15}/></button></header>
          <div className="map-view" style={{ padding: 0 }}><LiveMap height={265} /></div>
        </section>
        {role === 'logistics' ? (
          <section className="card journey" style={{ padding: '22px 20px' }}>
            <div className="journey-top"><div><small>FLEET</small><h2>Your vehicles</h2></div></div>
            <VehicleTracker notify={notify} />
          </section>
        ) : (
          <section className="card journey">
            <div className="journey-top">
              <div><small>NEXT JOURNEY</small><h2>Guwahati <span>→</span> Jorhat</h2><p>NH 27 · plan below for a live ETA</p></div>
            </div>
            <div className="journey-time">
              <span><Icon n="clock" s={16}/>{insight ? insight.weather.label : 'Checking conditions'}</span>
              <b>06<sup>h</sup> 40<sup>m</sup></b>
              <p>Baseline estimate — plan a route for a live figure</p>
            </div>
            <div className="conditions">
              <div><span>Route conditions near {insight?.node?.name || 'you'}</span><b><i/>{insight ? insight.weather.label : '—'}</b></div>
              <p><i style={{ left: `${Math.min(90, (insight?.weather?.severity || 0) * 100)}%` }}/></p>
              <footer><span>Clear</span><span>Caution</span><span>Disrupted</span></footer>
            </div>
            <button className="route-details" onClick={action}>View route details <Icon n="arrow" s={16}/></button>
          </section>
        )}
      </div>
      <div className="bottom-grid">
        <OverviewAlerts navigate={navigate} notify={notify} />
        <section className="card quick">
          <small>QUICK ACTIONS</small><h2>Get moving</h2>
          {[['route', 'Plan a route', 'Smart guidance'], ['report', 'Share an update', 'Help your network'], ['phone', 'Emergency help', 'Get support fast']].map(([icon, title, detail]) => (
            <button key={title} onClick={() => title === 'Plan a route' ? navigate('Route planner') : title === 'Share an update' ? navigate('Field reports') : notify('Emergency support: dial 112 (India national emergency number).')}>
              <span><Icon n={icon} s={19}/></span><b>{title}</b><small>{detail}</small><Icon n="chevron" s={16}/>
            </button>
          ))}
        </section>
      </div>
      <section className="insight">
        <div><Icon n="spark" s={19}/></div>
        <article>
          <small>SAHAYAK INSIGHT</small>
          <h3>{insight ? `"Conditions near ${insight.node.name}: ${insight.weather.label.toLowerCase()}."` : 'Gathering live conditions…'}</h3>
          <p>{insight ? (insight.weather.severity > 0.5 ? 'Consider delaying non-essential travel or choosing an alternate route.' : 'Conditions look favourable for travel today.') : 'Checking live weather across the network.'}</p>
        </article>
        <button onClick={() => navigate('Route planner')}>Plan with this insight <Icon n="arrow" s={16}/></button>
      </section>
    </>
  );
}

function Dashboard({ role, exit, switchRole }) {
  const { user, initialsFrom } = useAuth();
  const [page, setPage] = useState('Overview');
  const [menu, setMenu] = useState(false);
  const [read, setRead] = useState(false);
  const [toast, setToast] = useState('');
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const userCopy = roleCopy[role];
  const profile = roles.find(item => item.id === role);
  const initials = initialsFrom(user.name);
  const detail = [profile.label, user.district || user.organisation || user.vehicleNumber].filter(Boolean).join(' • ');
  const notify = message => { setToast(message); setTimeout(() => setToast(''), 2600); };
  const navigate = next => { setPage(next); setMenu(false); setSwitcherOpen(false); };
  const changeWorkspace = nextRole => { switchRole(nextRole); setPage('Overview'); setMenu(false); setSwitcherOpen(false); notify(`Switched to ${roles.find(item => item.id === nextRole).label} workspace.`); };
  const action = () => { if (role === 'field') navigate('Field reports'); else navigate('Route planner'); };

  return <div className="workspace">
    <aside className={`side ${menu ? 'open' : ''}`}><div className="side-brand"><Brand/><button onClick={() => setMenu(false)} aria-label="Close navigation"><Icon n="close"/></button></div><button className="role-chip" onClick={() => setSwitcherOpen(!switcherOpen)} aria-expanded={switcherOpen}><span><Icon n={profile.icon} s={16}/></span><div><b>{profile.label}</b><small>Switch workspace</small></div><Icon n="chevron" s={15}/></button><nav>{navForRole(role).map(([name, icon]) => <button className={page === name ? 'active' : ''} onClick={() => navigate(name)} key={name}><Icon n={icon} s={19}/>{name}{name === 'Alerts' && !read && <i>•</i>}</button>)}</nav><div className="side-bottom"><button onClick={() => navigate('Settings')}><Icon n="settings" s={18}/>Settings</button><button className="profile" onClick={() => navigate('Profile')} aria-label="Open profile"><span>{initials}</span><div><b>{user.name}</b><small>{detail}</small></div><i>•••</i></button></div></aside>
    {switcherOpen && <WorkspaceSwitcher role={role} onChange={changeWorkspace} close={() => setSwitcherOpen(false)} exit={exit} openProfile={() => navigate('Profile')}/>}
    <main className="dashboard">
      <header className="top">
        <button className="hamburger" onClick={() => setMenu(true)} aria-label="Open navigation"><Icon n="menu"/></button>
        <div className="crumb"><span>Workspace</span><Icon n="chevron" s={13}/><b>{page}</b></div>
        <div className="top-actions">
          <button className="ask" onClick={() => notify('Sahayak is ready to help with route, risk, and delivery questions.')}><Icon n="spark" s={16}/>Ask Sahayak</button>
          <button className="notifications" onClick={() => { setRead(true); notify('All alerts marked as seen.'); }} aria-label="Mark alerts as seen"><Icon n="bell" s={18}/>{!read && <i/>}</button>
          <button className="top-avatar" onClick={() => navigate('Profile')} aria-label="Open profile">{initials}</button>
        </div>
      </header>
      <div className="content">
        {page !== 'Profile' && <>
          <section className="welcome">
            <div><small>{new Date().toLocaleDateString(undefined, { weekday: 'long', day: '2-digit', month: 'long' }).toUpperCase()} <i>•</i> {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
              <h1>Good day, {user.name.split(' ')[0]} <b>✦</b></h1>
              <p>{userCopy.title}<span>{userCopy.sub}</span></p>
            </div>
            <button className="primary" onClick={action}><Icon n="plus" s={17}/>{userCopy.action}</button>
          </section>
          <RegionStrip navigate={navigate} />
        </>}
        {page === 'Overview' ? <Overview role={role} navigate={navigate} action={action} notify={notify}/>
          : page === 'Profile' ? <ProfileView roleMeta={profile} initials={initials} notify={notify}/>
          : <PageView page={page} role={role} notify={notify}/>}
      </div>
    </main>
    {menu && <button className="overlay" onClick={() => setMenu(false)} aria-label="Close navigation"/>}
    {switcherOpen && <button className="switcher-overlay" onClick={() => setSwitcherOpen(false)} aria-label="Close workspace switcher"/>}
    {toast && <div className="toast"><Icon n="check" s={17}/>{toast}</div>}
    <button className="sign-out" onClick={exit}>Sign out</button>
  </div>;
}

function RegionStrip({ navigate }) {
  const [summary, setSummary] = useState(null);
  useEffect(() => { api.dashboardSummary().then(setSummary).catch(() => {}); }, []);
  return (
    <section className="region">
      <div><i/>Regional status <b>{summary ? (summary.regionAccessCoveragePct >= 85 ? 'Stable' : summary.regionAccessCoveragePct >= 60 ? 'Watchful' : 'Disrupted') : 'Loading'}</b></div>
      <p>
        <span><b>{summary?.totalVehicles ?? '—'}</b> active routes</span>
        <span><b>{summary ? `${summary.regionAccessCoveragePct}%` : '—'}</b> access coverage</span>
        <span><b>{summary?.openFieldReports ?? '—'}</b> need attention</span>
      </p>
      <button onClick={() => navigate('Live map')}>View live map <Icon n="arrow" s={15}/></button>
    </section>
  );
}

function AppShell() {
  const { user, logout, ready } = useAuth();
  const [authView, setAuthView] = useState('login');
  const [workspaceRole, setWorkspaceRole] = useState(null);
  if (!ready) return null;
  if (!user) {
    return authView === 'signup'
      ? <Signup onLogin={() => setAuthView('login')}/>
      : <Login onSignup={() => setAuthView('signup')}/>;
  }
  const role = workspaceRole || user.role;
  return <Dashboard role={role} exit={() => { setWorkspaceRole(null); logout(); }} switchRole={setWorkspaceRole}/>;
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
