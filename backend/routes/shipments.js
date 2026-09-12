const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { findRoute } = require('../utils/dijkstra');
const { fetchNodeWeather } = require('./weather');
const { NODES } = require('../data/nerNetwork');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const rows = req.user.role === 'logistics'
    ? db.prepare('SELECT * FROM shipments WHERE createdBy = ? ORDER BY createdAt DESC').all(req.user.id)
    : db.prepare('SELECT * FROM shipments ORDER BY createdAt DESC LIMIT 100').all();
  res.json({ shipments: rows.map((r) => ({ ...r, route: r.routeJson ? JSON.parse(r.routeJson) : null })) });
});

router.post('/', requireAuth, async (req, res) => {
  const { originNode, destinationNode, cargoType, priority = 'normal', vehicleId } = req.body || {};
  if (!originNode || !destinationNode) return res.status(400).json({ error: 'originNode and destinationNode are required' });

  try {
    const weatherSeverityByNode = {};
    await Promise.all(NODES.map(async (n) => {
      try { weatherSeverityByNode[n.id] = (await fetchNodeWeather(n)).severity; } catch (_) { weatherSeverityByNode[n.id] = 0; }
    }));
    const route = findRoute(originNode, destinationNode, { weatherSeverityByNode });
    if (!route) return res.status(422).json({ error: 'No viable route for this shipment right now' });

    const shipment = {
      id: uuid(),
      vehicleId: vehicleId || null,
      createdBy: req.user.id,
      originNode,
      destinationNode,
      cargoType: cargoType || 'General cargo',
      priority,
      status: 'planned',
      routeJson: JSON.stringify(route),
      etaMinutes: route.etaMinutes,
      createdAt: new Date().toISOString(),
    };
    db.prepare(`INSERT INTO shipments (id,vehicleId,createdBy,originNode,destinationNode,cargoType,priority,status,routeJson,etaMinutes,createdAt)
      VALUES (@id,@vehicleId,@createdBy,@originNode,@destinationNode,@cargoType,@priority,@status,@routeJson,@etaMinutes,@createdAt)`).run(shipment);

    res.status(201).json({ shipment: { ...shipment, route } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to plan shipment', detail: err.message });
  }
});

router.patch('/:id/status', requireAuth, (req, res) => {
  const { status } = req.body || {};
  if (!['planned', 'in_transit', 'delivered', 'delayed', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const existing = db.prepare('SELECT * FROM shipments WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Shipment not found' });
  if (req.user.role !== 'official' && existing.createdBy !== req.user.id) {
    return res.status(403).json({ error: 'You do not have permission to update this shipment' });
  }
  db.prepare('UPDATE shipments SET status = ? WHERE id = ?').run(status, req.params.id);
  const row = db.prepare('SELECT * FROM shipments WHERE id = ?').get(req.params.id);
  res.json({ shipment: { ...row, route: row.routeJson ? JSON.parse(row.routeJson) : null } });
});

module.exports = router;
