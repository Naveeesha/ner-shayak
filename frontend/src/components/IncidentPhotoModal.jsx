import { useState } from 'react';

/**
 * Reusable Incident Photo Preview Modal
 * Supports full-screen/modal image viewing, loading spinners,
 * responsive mobile WebView bounds (no horizontal scroll),
 * and graceful fallback ("Incident photo unavailable") on load errors.
 */
export default function IncidentPhotoModal({ isOpen, onClose, incident }) {
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  if (!isOpen || !incident) return null;

  const photoSrc = incident.photoUrl || incident.photoDataUrl || incident.photo_url;
  const severity = (incident.severity || 'moderate').toLowerCase();
  const isCritical = severity === 'critical' || severity === 'major' || severity === 'high';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(10, 25, 20, 0.85)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        boxSizing: 'border-box',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: 12,
          maxWidth: 680,
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
          border: '1px solid #d1fae5',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#f9fafb',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: isCritical ? '#fee2e2' : '#fef3c7',
                  color: isCritical ? '#991b1b' : '#92400e',
                }}
              >
                {severity.toUpperCase()}
              </span>
              <span style={{ fontSize: 9, color: '#6b7280', fontWeight: 700 }}>
                {incident.category ? incident.category.replace('_', ' ').toUpperCase() : 'HAZARD'}
              </span>
              <span style={{ fontSize: 9, color: '#9ca3af' }}>•</span>
              <span style={{ fontSize: 9, color: '#4b5563' }}>
                {incident.createdAt ? new Date(incident.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'Recent'}
              </span>
            </div>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#111827' }}>
              {incident.title}
            </h3>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 20,
              color: '#6b7280',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: 6,
              lineHeight: 1,
            }}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Body / Photo Container */}
        <div
          style={{
            padding: 16,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            background: '#0d1f19',
          }}
        >
          {!photoSrc || imgError ? (
            <div
              style={{
                width: '100%',
                padding: '48px 16px',
                textAlign: 'center',
                background: '#152e25',
                borderRadius: 8,
                border: '1px dashed rgba(204,243,99,0.3)',
                color: '#d2f2e5',
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 8 }}>📷</div>
              <b style={{ fontSize: 14, color: '#fff' }}>Incident photo unavailable</b>
              <p style={{ fontSize: 11, color: '#88a89b', marginTop: 4, maxWidth: 360, margin: '4px auto 0' }}>
                The photographic evidence is currently being synced or the storage reference could not be resolved.
              </p>
            </div>
          ) : (
            <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
              {!imgLoaded && (
                <div
                  style={{
                    padding: 40,
                    color: '#ccf363',
                    fontSize: 12,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span style={{ animation: 'spin 1s linear infinite' }}>🔄</span> Loading high-res photo from Supabase Storage…
                </div>
              )}
              <img
                src={photoSrc}
                alt={incident.title || 'Incident evidence'}
                onLoad={() => setImgLoaded(true)}
                onError={() => {
                  setImgError(true);
                  setImgLoaded(true);
                }}
                style={{
                  maxWidth: '100%',
                  maxHeight: '60vh',
                  objectFit: 'contain',
                  borderRadius: 8,
                  display: imgLoaded && !imgError ? 'block' : 'none',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                }}
              />
            </div>
          )}
        </div>

        {/* Footer / Context Details */}
        <div
          style={{
            padding: '12px 18px',
            borderTop: '1px solid #e5e7eb',
            background: '#ffffff',
            fontSize: 11,
            color: '#4b5563',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: incident.description ? 8 : 0 }}>
            <span>📍 <b>Corridor:</b> {incident.road || incident.nodeId || 'Northeast Highway'}</span>
            {incident.lat && (
              <span>🌐 <b>GPS:</b> {Number(incident.lat).toFixed(4)}, {Number(incident.lng).toFixed(4)}</span>
            )}
            <span>👤 <b>Filed by:</b> {incident.reporterRole === 'driver' ? 'Registered Driver' : 'PWD Field Officer'}</span>
          </div>

          {incident.description && (
            <div
              style={{
                background: '#f9fafb',
                padding: '6px 10px',
                borderRadius: 6,
                color: '#374151',
                lineHeight: 1.4,
              }}
            >
              <b>Description:</b> {incident.description}
            </div>
          )}

          {photoSrc && !imgError && (
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
              <a
                href={photoSrc}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: '#155b4b',
                  fontWeight: 700,
                  fontSize: 11,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                ↗ Open Full Resolution
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
