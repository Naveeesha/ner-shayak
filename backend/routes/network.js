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
        mode: e.mode,
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

// POST /api/network/route  { originId, destinationId, alternates?, mode? }
router.post('/route', requireAuth, async (req, res) => {
  const { originId, destinationId, alternates = true, mode = 'all' } = req.body || {};
  if (!originId || !destinationId) return res.status(400).json({ error: 'originId and destinationId are required' });
  
  try {
    const weatherSeverityByNode = {};
    await Promise.all(NODES.map(async (n) => {
      try {
        const w = await fetchNodeWeather(n);
        weatherSeverityByNode[n.id] = w.severity;
      } catch (_) { weatherSeverityByNode[n.id] = 0; }
    }));
    const disruptions = getActiveDisruptions();
    const context = { weatherSeverityByNode, disruptions, mode };

    const best = findRoute(originId, destinationId, context);
    if (!best) return res.status(422).json({ error: 'No viable route found' });

    let alternateRoutes = [];
    if (alternates) {
      alternateRoutes = findAlternateRoutes(originId, destinationId, context, 3).filter((r) => r.totalKm !== best.totalKm);
    }
    res.json({ recommended: best, alternates: alternateRoutes.slice(0, 2), computedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: 'Route computation failed', detail: err.message });
  }
});

// POST /api/network/compare
// Computes multimodal options and applies cargo intelligence
router.post('/compare', requireAuth, async (req, res) => {
  const { originId, destinationId, cargoType = 'General Cargo', weight = 100, priority = 'Normal', emergencyMode = false } = req.body || {};
  if (!originId || !destinationId) return res.status(400).json({ error: 'originId and destinationId are required' });

  try {
    const weatherSeverityByNode = {};
    await Promise.all(NODES.map(async (n) => {
      try {
        const w = await fetchNodeWeather(n);
        weatherSeverityByNode[n.id] = w.severity;
      } catch (_) { weatherSeverityByNode[n.id] = 0; }
    }));
    const disruptions = getActiveDisruptions();
    
    const computeForMode = (modeName) => {
      const route = findRoute(originId, destinationId, { weatherSeverityByNode, disruptions, mode: modeName });
      if (!route) return null;
      // If we requested a specific mode, but the route has none of those edges, it's just a fallback (e.g. road)
      if (modeName !== 'road' && modeName !== 'all') {
        const hasMode = route.edges.some(e => e.mode === modeName);
        if (!hasMode) return null; // That mode doesn't actually connect these points
      }
      return route;
    };

    const routes = {
      road: computeForMode('road'),
      railway: computeForMode('railway'),
      waterway: computeForMode('waterway'),
      air: computeForMode('air')
    };

    // --- CARGO INTELLIGENCE RECOMMENDATION ---
    let recommendedMode = 'road';
    let recommendationReason = 'Road provides a balanced route for this delivery.';

    const isEmergency = emergencyMode || priority === 'Emergency';
    const isHeavy = cargoType === 'Heavy Cargo' || Number(weight) > 5000;

    // Filter to available routes
    const available = Object.keys(routes).filter(k => routes[k] !== null);
    
    if (available.length === 0) {
      return res.status(422).json({ error: 'No viable route found for any mode.' });
    }

    if (available.length > 0) {
      if (isEmergency) {
        // Prefer fastest available
        let fastest = available[0];
        available.forEach(m => {
          if (routes[m].etaMinutes < routes[fastest].etaMinutes) fastest = m;
        });
        
        // If Air is available and cargo isn't too heavy, use Air
        if (routes.air && !isHeavy) {
          recommendedMode = 'air';
          recommendationReason = 'Emergency mode prioritized this route because time is critical, and air transport provides the fastest delivery for medical/emergency supplies.';
        } else {
          recommendedMode = fastest;
          recommendationReason = `Emergency mode prioritized this route because it is the fastest available option (${routes[fastest].etaMinutes} mins) given the cargo profile and network availability.`;
        }
      } else if (isHeavy) {
        // Prefer Waterway or Rail for Heavy cargo
        if (routes.waterway) {
          recommendedMode = 'waterway';
          recommendationReason = 'Waterway transport is highly recommended for heavy cargo as it is the most cost-effective and capable mode for massive freight.';
        } else if (routes.railway) {
          recommendedMode = 'railway';
          recommendationReason = 'Railway freight is prioritized for heavy cargo as it offers better capacity and lower risk than road transport over long distances.';
        } else {
          recommendedMode = 'road';
          recommendationReason = 'Road transport is recommended as rail/waterway links are unavailable for this route.';
        }
      } else if (priority === 'High' && routes.air && Number(weight) < 1000) {
          recommendedMode = 'air';
          recommendationReason = 'High priority and low weight makes air transport the optimal choice for rapid delivery.';
      } else {
        // Normal priority: balance safety and availability
        // Default to rail if safe, otherwise road
        if (routes.railway && routes.railway.safetyIndex > 80) {
          recommendedMode = 'railway';
          recommendationReason = 'Railway provides a secure, efficient bulk transport corridor for general cargo.';
        } else if (routes.road) {
          recommendedMode = 'road';
          recommendationReason = 'Road highways provide the most direct and reliable routing for general cargo on this path.';
        } else {
          recommendedMode = available[0];
          recommendationReason = `Network disruptions forced a fallback to the only available mode (${available[0]}).`;
        }
      }
    }

    res.json({
      routes,
      recommendation: {
        mode: recommendedMode,
        reason: recommendationReason,
        route: routes[recommendedMode]
      },
      computedAt: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: 'Route comparison failed', detail: err.message });
  }
});

module.exports = router;
