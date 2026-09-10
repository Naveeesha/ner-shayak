const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const alerts = db.prepare('SELECT * FROM alerts ORDER BY createdAt DESC LIMIT 100').all();
  res.json({ alerts });
});

// field, logistics, official, and system integrations can raise alerts; drivers receive them
router.post('/', requireAuth, requireRole('field', 'logistics', 'official'), (req, res) => {
  const { type, tone = 'amber', icon = 'bell', title, text, nodeId, road, severity = 'minor' } = req.body || {};
  if (!type || !title || !text) return res.status(400).json({ error: 'type, title and text are required' });
  const alert = { id: uuid(), type, tone, icon, title, text, nodeId: nodeId || null, road: road || null, severity, createdAt: new Date().toISOString(), createdBy: req.user.id };
  db.prepare(`INSERT INTO alerts (id,type,tone,icon,title,text,nodeId,road,severity,createdAt,createdBy)
    VALUES (@id,@type,@tone,@icon,@title,@text,@nodeId,@road,@severity,@createdAt,@createdBy)`).run(alert);
  res.status(201).json({ alert });
});

router.delete('/:id', requireAuth, requireRole('official', 'field', 'logistics'), (req, res) => {
  db.prepare('DELETE FROM alerts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
