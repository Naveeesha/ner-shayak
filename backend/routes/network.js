const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { NODES, EDGES } = require('../data/nerNetwork');
const { findRoute, findAlternateRoutes } = require('../utils/dijkstra');
const { fetchNodeWeather } = require('./weather');

const router = express.Router();

// GET /api/network/nodes — all locations (for map + dropdowns)
router.get('/nodes', requireAuth, (req, res) => {
  res.json({ nodes: NODES });
});

// GET /api/network/edges — full road graph (for map rendering) with live condition
router.get('/edges', requireAuth, async (req, res) => {
  try {
    const weatherByNode = {};
    await Promise.all(NODES.map(async (n) => {
      try {
        const w = await fetchNodeWeather(n);
        weatherByNode[n.id] = w.severity;
      } catch (_) { weatherByNode[n.id] = 0; }
    }));
    const disruptions = getActiveDisruptions();
    const nodeMap = Object.fromEntries(NODES.map((n) => [n.id, n]));

    const edges = EDGES.map((e) => {
      const relevant = disruptions.filter((d) =>
        (d.fromNode === e.from && d.toNode === e.to) || (d.fromNode === e.to && d.toNode === e.from) || d.road === e.road);
      const blocked = relevant.some((d) => d.severity === 'blocked');
      const worstSeverity = relevant.reduce((max, d) => {
        const rank = { minor: 1, moderate: 2, severe: 3, blocked: 4 };
        return Math.max(max, rank[d.severity] || 0);
      }, 0);
      const weatherSeverity = Math.max(weatherByNode[e.from] || 0, weatherByNode[e.to] || 0);
      let condition = 'clear';
      if (blocked) condition = 'blocked';
      else if (worstSeverity >= 2 || weatherSeverity > 0.6) condition = 'disrupted';
      else if (worstSeverity >= 1 || weatherSeverity > 0.3) condition = 'caution';

      return {
        from: nodeMap[e.from],
        to: nodeMap[e.to],
        km: e.km,
        road: e.road,
        condition,
        weatherSeverity: Number(weatherSeverity.toFixed(2)),
      };
    });
    res.json({ edges, fetchedAt: new Date().toISOString() });
  } catch (err) {
    res.status(502).json({ error: 'Unable to compute live network status', detail: err.message });
  }
});

function getActiveDisruptions() {
  // Derive routing disruptions from open field reports (road_block, landslide, flood, etc.)
  const reports = db.prepare(`SELECT * FROM field_reports WHERE status = 'open' AND category IN ('road_block','landslide','flood','bridge_damage','accident')`).all();
  return reports.map((r) => ({
    fromNode: r.fromNode,
    toNode: r.toNode,
    road: r.road,
    severity: r.category === 'bridge_damage' || r.severity === 'critical' ? 'blocked'
      : r.severity === 'high' ? 'severe'
      : r.severity === 'medium' ? 'moderate' : 'minor',
  }));
}

// POST /api/network/route  { originId, destinationId, alternates? }
// Core AI/ML-assisted route optimization endpoint: pulls live weather +
// live field-reported disruptions and runs risk-weighted Dijkstra.
router.post('/route', requireAuth, async (req, res) => {
  const { originId, destinationId, alternates = true } = req.body || {};
  if (!originId || !destinationId) return res.status(400).json({ error: 'originId and destinationId are required' });
  if (!NODES.find((n) => n.id === originId) || !NODES.find((n) => n.id === destinationId)) {
    return res.status(404).json({ error: 'Unknown origin or destination' });
  }

  try {
    const weatherSeverityByNode = {};
    await Promise.all(NODES.map(async (n) => {
      try {
        const w = await fetchNodeWeather(n);
        weatherSeverityByNode[n.id] = w.severity;
      } catch (_) { weatherSeverityByNode[n.id] = 0; }
    }));
    const disruptions = getActiveDisruptions();
    const context = { weatherSeverityByNode, disruptions };

    const best = findRoute(originId, destinationId, context);
    if (!best) return res.status(422).json({ error: 'No viable route found — network is fully disrupted between these points' });

    let alternateRoutes = [];
    if (alternates) {
      alternateRoutes = findAlternateRoutes(originId, destinationId, context, 3).filter((r) => r.totalKm !== best.totalKm);
    }

    res.json({ recommended: best, alternates: alternateRoutes.slice(0, 2), computedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: 'Route computation failed', detail: err.message });
  }
});

module.exports = router;
