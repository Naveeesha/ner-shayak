const { NODES, EDGES } = require('../data/nerNetwork');

function buildGraph() {
  const clean = {};
  NODES.forEach((n) => { clean[n.id] = []; });
  EDGES.forEach((e) => {
    const mode = e.mode || 'road';
    clean[e.from].push({ from: e.from, to: e.to, km: e.km, terrainFactor: e.terrainFactor, road: e.road, mode });
    clean[e.to].push({ from: e.to, to: e.from, km: e.km, terrainFactor: e.terrainFactor, road: e.road, mode });
  });
  return clean;
}

/**
 * Compute edge risk weight.
 * Safety is heavily prioritized over raw distance:
 * Hazards (landslides, floods, storms) apply exponential penalties so the router
 * willingly chooses longer, slower bypasses if they guarantee safe delivery.
 */
function edgeWeight(edge, { weatherSeverityByNode = {}, disruptions = [] } = {}) {
  const baseWeight = edge.km * edge.terrainFactor;

  // Weather severity (0 to 1) -> exponential risk penalty up to 8x
  const wA = weatherSeverityByNode[edge.from] ?? 0;
  const wB = weatherSeverityByNode[edge.to] ?? 0;
  const weatherSeverity = Math.max(wA, wB);
  const weatherMultiplier = 1 + Math.pow(weatherSeverity, 2) * 8.0;

  // Active field disruption reports (landslide, flood, bridge damage)
  const relevant = disruptions.filter(
    (d) => (d.fromNode === edge.from && d.toNode === edge.to) ||
           (d.fromNode === edge.to && d.toNode === edge.from) ||
           d.road === edge.road
  );
  let disruptionMultiplier = 1;
  let blocked = false;
  relevant.forEach((d) => {
    if (d.severity === 'blocked') blocked = true;
    else if (d.severity === 'severe') disruptionMultiplier = Math.max(disruptionMultiplier, 15.0); // 15x safety penalty
    else if (d.severity === 'moderate') disruptionMultiplier = Math.max(disruptionMultiplier, 5.0);  // 5x safety penalty
    else if (d.severity === 'minor') disruptionMultiplier = Math.max(disruptionMultiplier, 2.0);
  });

  return {
    weight: blocked ? Infinity : baseWeight * weatherMultiplier * disruptionMultiplier,
    weatherSeverity,
    disruptionMultiplier,
    blocked,
  };
}

/**
 * Safety-Prioritized Dijkstra Algorithm.
 * Returns route with safety index, total km, ETA, and segment conditions.
 */
function findRoute(startId, endId, context = {}) {
  const graph = buildGraph();
  if (!graph[startId] || !graph[endId]) {
    throw new Error('Unknown start or end location');
  }

  const dist = {};
  const prevEdge = {};
  const visited = new Set();
  Object.keys(graph).forEach((id) => { dist[id] = Infinity; });
  dist[startId] = 0;

  const queue = new Set(Object.keys(graph));

  while (queue.size) {
    let u = null;
    let best = Infinity;
    for (const id of queue) {
      if (dist[id] < best) { best = dist[id]; u = id; }
    }
    if (u === null) break;
    queue.delete(u);
    visited.add(u);
    if (u === endId) break;

    for (const edge of graph[u]) {
      let modePenalty = 1.0;
      if (context.mode && context.mode !== 'all') {
        if (edge.mode !== context.mode) {
          // If preferred mode is not road, allow road with a penalty (for first/last mile)
          if (edge.mode === 'road' && (context.mode === 'air' || context.mode === 'railway' || context.mode === 'waterway')) {
            modePenalty = 3.0; // strong penalty to keep road usage minimal
          } else {
            continue; // completely disallow other modes (e.g., no trains on a 'waterway' route)
          }
        }
      }

      const { weight, weatherSeverity, disruptionMultiplier, blocked } = edgeWeight(edge, context);
      if (blocked) continue;
      
      const finalWeight = weight * modePenalty;
      const alt = dist[u] + finalWeight;
      if (alt < dist[edge.to]) {
        dist[edge.to] = alt;
        prevEdge[edge.to] = { ...edge, weatherSeverity, disruptionMultiplier, modePenalty };
      }
    }
  }

  if (dist[endId] === Infinity) {
    return null; // no viable non-blocked route
  }

  // Reconstruct path
  const pathEdges = [];
  let cur = endId;
  while (cur !== startId) {
    const e = prevEdge[cur];
    if (!e) break;
    pathEdges.unshift(e);
    cur = e.from;
  }

  const totalKm = pathEdges.reduce((s, e) => s + e.km, 0);
  const totalWeight = dist[endId];
  
  let totalMinutes = 0;
  pathEdges.forEach(e => {
    let baseSpeed = 45;
    if (e.mode === 'air') baseSpeed = 500;
    else if (e.mode === 'railway') baseSpeed = 55;
    else if (e.mode === 'waterway') baseSpeed = 24;
    
    // Penalize speed by safety risk
    const edgeRatio = (e.disruptionMultiplier || 1) * Math.max(1, (e.weatherSeverity || 0) * 2);
    const speed = Math.max(12, baseSpeed / Math.sqrt(edgeRatio));
    totalMinutes += (e.km / speed) * 60;
  });
  
  const etaMinutes = Math.round(totalMinutes);
  const avgSpeedKmh = totalKm > 0 ? Number((totalKm / (etaMinutes / 60)).toFixed(1)) : 0;

  // Compute Safety Score (100% = clear, <60% = high hazard risk)
  const maxDisruption = pathEdges.reduce((m, e) => Math.max(m, e.disruptionMultiplier || 1), 1);
  const maxWeather = pathEdges.reduce((m, e) => Math.max(m, e.weatherSeverity || 0), 0);
  const safetyPenalty = (maxDisruption - 1) * 15 + maxWeather * 40;
  const safetyIndex = Math.max(15, Math.min(99, Math.round(100 - safetyPenalty)));

  const nodeMap = Object.fromEntries(NODES.map((n) => [n.id, n]));
  const path = [startId, ...pathEdges.map((e) => e.to)].map((id) => nodeMap[id]);

  return {
    path,
    edges: pathEdges.map((e) => ({
      from: nodeMap[e.from],
      to: nodeMap[e.to],
      km: e.km,
      road: e.road,
      mode: e.mode,
      weatherSeverity: Number((e.weatherSeverity || 0).toFixed(2)),
      disruptionMultiplier: e.disruptionMultiplier || 1,
      condition: e.weatherSeverity > 0.6 || e.disruptionMultiplier >= 4.0 ? 'disrupted'
        : (e.weatherSeverity > 0.3 || e.disruptionMultiplier >= 1.8) ? 'caution' : 'clear',
    })),
    totalKm: Number(totalKm.toFixed(1)),
    totalWeight: Number(totalWeight.toFixed(1)),
    avgSpeedKmh: Number(avgSpeedKmh.toFixed(1)),
    etaMinutes,
    safetyIndex,
  };
}

/** Find k alternate routes prioritizing safety over raw distance. */
function findAlternateRoutes(startId, endId, context = {}, k = 3) {
  const results = [];
  const penalized = new Set();
  for (let i = 0; i < k; i++) {
    const ctx = {
      ...context,
      disruptions: [
        ...(context.disruptions || []),
        ...[...penalized].map((key) => {
          const [a, b] = key.split('|');
          return { fromNode: a, toNode: b, severity: 'moderate' };
        }),
      ],
    };
    const route = findRoute(startId, endId, ctx);
    if (!route) break;
    const dup = results.some((r) => r.totalKm === route.totalKm && r.edges.length === route.edges.length);
    if (!dup) results.push(route);
    route.edges.forEach((e) => penalized.add(`${e.from.id}|${e.to.id}`));
  }
  return results;
}

module.exports = { findRoute, findAlternateRoutes, buildGraph };
