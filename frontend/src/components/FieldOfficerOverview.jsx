import { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import FieldReportForm from './FieldReportForm';

export default function FieldOfficerOverview({ navigate, notify }) {
  const { user } = useAuth();
  const [myReports, setMyReports] = useState([]);
  const [allReports, setAllReports] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    Promise.all([api.myReports(), api.reports()])
      .then(([mineRes, allRes]) => {
        setMyReports(mineRes.reports || []);
        setAllReports(allRes.reports || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const openCount = myReports.filter((r) => r.status === 'open').length;
  const resolvedCount = myReports.filter((r) => r.status === 'resolved').length;

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {/* Field Unit Banner */}
      <section className="card" style={{ padding: '18px 20px', background: 'linear-gradient(135deg, #2b574a, #1a4439)', color: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.5, color: '#b9ead7' }}>FIELD OFFICER COMMAND & INCIDENT RESPONSE</div>
            <h2 style={{ color: '#fff', fontSize: 20, margin: '4px 0 2px' }}>{user.name}</h2>
            <div style={{ fontSize: 11, color: '#d2f2e5' }}>
              Unit: <b>{user.organisation || 'PWD Field Unit'}</b> · District: <b>{user.district || 'Nagaon'}</b>
            </div>
          </div>
          <button onClick={() => navigate('Field reports')} style={{ padding: '9px 15px', border: 0, borderRadius: 7, background: '#ccf363', color: '#12483a', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>
            + Submit New Incident Report
          </button>
        </div>
      </section>

      {/* Report Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
        <StatCard label="YOUR SUBMITTED REPORTS" value={myReports.length} color="#176d55" />
        <StatCard label="OPEN DISRUPTIONS" value={openCount} color="#b5493a" />
        <StatCard label="RESOLVED BY YOU" value={resolvedCount} color="#2b765e" />
        <StatCard label="DISTRICT TOTAL REPORTS" value={allReports.length} color="#3c5c50" />
      </div>

      <div className="dashboard-grid">
        {/* Submit Report Widget */}
        <section className="card" style={{ padding: '20px' }}>
          <header style={{ padding: 0, minHeight: 'auto', marginBottom: 14 }}>
            <div>
              <small>QUICK INCIDENT FILING</small>
              <h3 style={{ marginTop: 4, color: '#25483d', fontSize: 16 }}>File Field Report (Geo-tagged)</h3>
            </div>
          </header>
          <FieldReportForm notify={notify} />
        </section>

        {/* My Recent Reports */}
        <section className="card" style={{ padding: '20px' }}>
          <small style={{ color: '#8aa097', fontSize: 9, fontWeight: 800 }}>YOUR SUBMITTED FIELD REPORTS</small>
          <h3 style={{ margin: '6px 0 14px', fontSize: 16, color: '#25483d' }}>Recent Activity</h3>
          {loading && <p style={{ fontSize: 11, color: '#7c8f87' }}>Loading reports…</p>}
          {!loading && myReports.length === 0 && (
            <p style={{ fontSize: 11, color: '#7c8f87' }}>You have not submitted any field reports yet. Use the form to file incident reports from your district.</p>
          )}
          <div style={{ display: 'grid', gap: 10 }}>
            {myReports.slice(0, 5).map((r) => (
              <div key={r.id} style={{ padding: '10px 12px', border: '1px solid #edf1ee', borderRadius: 8, background: '#fbfdfb' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#61776d' }}>
                  <b>[{r.category.toUpperCase().replace('_', ' ')}] {r.title}</b>
                  <span style={statusPill(r.status)}>{r.status}</span>
                </div>
                <div style={{ fontSize: 10, color: '#86978f', marginTop: 4 }}>
                  {r.description || 'No additional details provided'} · {new Date(r.createdAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ padding: '14px 16px', border: '1px solid #e1e9e3', borderRadius: 8, background: '#fff' }}>
      <div style={{ fontSize: 9, fontWeight: 800, color: '#8aa097', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || '#25483d', marginTop: 4 }}>{value}</div>
    </div>
  );
}

function statusPill(s) {
  return {
    padding: '2px 6px', borderRadius: 4, fontSize: 8, fontWeight: 800, textTransform: 'uppercase',
    color: s === 'open' ? '#b5493a' : s === 'resolved' ? '#176d55' : '#bd7e22',
    background: s === 'open' ? '#fbe9e6' : s === 'resolved' ? '#e6f4ea' : '#fff5da',
  };
}
