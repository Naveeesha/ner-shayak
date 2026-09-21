const express = require('express');
const { requireAuth } = require('../middleware/auth');
const supabaseService = require('../services/supabaseService');
const { uploadIncidentPhotoFromDataUrl } = require('../services/storageService');
const {
  notifyDriverIncident,
  notifyFieldOfficerIncident,
  notifyAffectedDrivers,
  notifyIncidentResolved,
} = require('../services/notificationService');

const router = express.Router();

// Upload incident photo directly to Supabase Storage incident-photos bucket
router.post('/upload-photo', requireAuth, async (req, res) => {
  const { incidentId, photoDataUrl } = req.body || {};
  if (!incidentId || !photoDataUrl) {
    return res.status(400).json({ error: 'incidentId and photoDataUrl are required' });
  }

  try {
    const result = await uploadIncidentPhotoFromDataUrl(incidentId, photoDataUrl);
    if (!result.success) {
      return res.status(400).json({ error: result.error || 'Photo upload failed. Please try again.' });
    }
    res.json(result);
  } catch (err) {
    console.error('[Reports Route] Photo upload exception:', err.message);
    res.status(500).json({ error: 'Photo upload failed. Please try again.', detail: err.message });
  }
});

const CATEGORIES = ['road_block', 'road_blockage', 'landslide', 'flood', 'bridge_damage', 'accident', 'traffic', 'vehicle_breakdown', 'poor_road_condition', 'weather_hazard', 'visibility_problem', 'infrastructure_damage', 'other'];
const SEVERITIES = ['minor', 'moderate', 'major', 'critical', 'low', 'medium', 'high'];

router.get('/', requireAuth, async (req, res) => {
  try {
    const reports = await supabaseService.getIncidents(200);
    res.json({ reports, categories: CATEGORIES, severities: SEVERITIES });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch reports', detail: err.message });
  }
});

router.get('/mine', requireAuth, async (req, res) => {
  try {
    const reports = await supabaseService.getIncidentsByUserId(req.user.id);
    res.json({ reports });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user reports', detail: err.message });
  }
});

// Standard create (online)
router.post('/', requireAuth, async (req, res) => {
  try {
    const report = await supabaseService.createIncident(req.user.id, req.body || {}, req.user.role || 'field');

    // Non-blocking SMS notification triggers
    const role = (req.user.role || '').toLowerCase();
    const isDriver = role === 'driver';
    const dispatchFn = isDriver ? notifyDriverIncident : notifyFieldOfficerIncident;

    Promise.allSettled([
      dispatchFn(report),
      notifyAffectedDrivers(report),
    ]).catch((err) => {
      console.warn('[Reports] Incident notification failed (non-blocking):', err.message);
    });

    res.status(201).json({ report });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Offline sync: client queues reports locally while offline (low-network districts)
// and POSTs the whole batch here once connectivity returns.
router.post('/sync', requireAuth, async (req, res) => {
  const { reports } = req.body || {};
  if (!Array.isArray(reports) || reports.length === 0) {
    return res.status(400).json({ error: 'reports array is required' });
  }
  const saved = [];
  const failed = [];

  for (const r of reports) {
    try {
      const savedReport = await supabaseService.createIncident(
        req.user.id,
        { ...r, synced: 1 },
        req.user.role || 'field',
        { preserveClientTimestamp: true }
      );
      saved.push(savedReport);

      // Trigger notifications for newly synced reports
      const role = (req.user.role || '').toLowerCase();
      const isDriver = role === 'driver';
      const dispatchFn = isDriver ? notifyDriverIncident : notifyFieldOfficerIncident;

      Promise.allSettled([
        dispatchFn(savedReport),
        notifyAffectedDrivers(savedReport),
      ]).catch((err) => {
        console.warn('[Reports Sync] Notification failed (non-blocking):', err.message);
      });
    } catch (err) {
      failed.push({ clientId: r.clientId, error: err.message });
    }
  }

  res.status(saved.length ? 201 : 400).json({ synced: saved.length, failed, reports: saved });
});

router.patch('/:id/status', requireAuth, async (req, res) => {
  const { status, comment } = req.body || {};
  if (!['open', 'in_progress', 'resolved', 'active', 'verified', 'under_review'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    const result = await supabaseService.updateIncidentStatus(
      req.params.id,
      status,
      req.user.id,
      req.user.role,
      comment
    );
    if (result.notFound) return res.status(404).json({ error: 'Report not found' });
    if (result.forbidden) return res.status(403).json({ error: 'You do not have permission to update this report' });

    // If resolved, notify operators and affected drivers
    if (status === 'resolved' && result.report) {
      notifyIncidentResolved(result.report).catch((err) => {
        console.warn('[Reports] Resolve notification failed (non-blocking):', err.message);
      });
    }

    res.json({ report: result.report });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update report status', detail: err.message });
  }
});

module.exports = router;
