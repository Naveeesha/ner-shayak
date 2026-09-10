const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const CATEGORIES = ['road_block', 'landslide', 'flood', 'bridge_damage', 'accident', 'traffic', 'other'];
const SEVERITIES = ['low', 'medium', 'high', 'critical'];

function insertReport(userId, body) {
  const { nodeId, road, fromNode, toNode, category, severity = 'medium', title, description, lat, lng, photoDataUrl, createdAt, synced = 1 } = body;
  if (!category || !CATEGORIES.includes(category)) throw new Error('Invalid or missing category');
  if (!title) throw new Error('Title is required');
  if (severity && !SEVERITIES.includes(severity)) throw new Error('Invalid severity');
  const report = {
    id: uuid(),
    userId,
    nodeId: nodeId || null,
    road: road || null,
    fromNode: fromNode || null,
    toNode: toNode || null,
    category,
    severity,
    title,
    description: description || '',
    lat: lat ?? null,
    lng: lng ?? null,
    photoDataUrl: photoDataUrl || null,
    status: 'open',
    synced,
    createdAt: createdAt || new Date().toISOString(),
  };
  db.prepare(`INSERT INTO field_reports (id,userId,nodeId,road,fromNode,toNode,category,severity,title,description,lat,lng,photoDataUrl,status,synced,createdAt)
    VALUES (@id,@userId,@nodeId,@road,@fromNode,@toNode,@category,@severity,@title,@description,@lat,@lng,@photoDataUrl,@status,@synced,@createdAt)`).run(report);
  return report;
}

router.get('/', requireAuth, (req, res) => {
  const reports = db.prepare('SELECT * FROM field_reports ORDER BY createdAt DESC LIMIT 200').all();
  res.json({ reports, categories: CATEGORIES, severities: SEVERITIES });
});

router.get('/mine', requireAuth, (req, res) => {
  const reports = db.prepare('SELECT * FROM field_reports WHERE userId = ? ORDER BY createdAt DESC').all(req.user.id);
  res.json({ reports });
});

// Standard create (online)
router.post('/', requireAuth, (req, res) => {
  try {
    const report = insertReport(req.user.id, req.body || {});
    res.status(201).json({ report });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Offline sync: client queues reports locally while offline (low-network
// districts) and POSTs the whole batch here once connectivity returns.
router.post('/sync', requireAuth, (req, res) => {
  const { reports } = req.body || {};
  if (!Array.isArray(reports) || reports.length === 0) {
    return res.status(400).json({ error: 'reports array is required' });
  }
  const saved = [];
  const failed = [];
  reports.forEach((r) => {
    try {
      saved.push(insertReport(req.user.id, { ...r, synced: 1 }));
    } catch (err) {
      failed.push({ clientId: r.clientId, error: err.message });
    }
  });
  res.status(saved.length ? 201 : 400).json({ synced: saved.length, failed, reports: saved });
});

router.patch('/:id/status', requireAuth, (req, res) => {
  const { status } = req.body || {};
  if (!['open', 'in_progress', 'resolved'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  db.prepare('UPDATE field_reports SET status = ? WHERE id = ?').run(status, req.params.id);
  const report = db.prepare('SELECT * FROM field_reports WHERE id = ?').get(req.params.id);
  res.json({ report });
});

module.exports = router;
