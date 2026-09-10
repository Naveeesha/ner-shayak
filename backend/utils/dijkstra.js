const { NODES, EDGES } = require('../data/nerNetwork');

// Build adjacency list once (edges are bidirectional roads).
function buildGraph() {
  const graph = {};
  NODES.forEach((n) => { graph[n.id] = []; });
  EDGES.forEach((e) => {
    graph[e.from].push({ to: e.to, ...e });
    graph[e.to].push({ to: e.from, from: e.to, ...e, from: e.from, to2: e.from }); // placeholder, fixed below
  });
  // Rebuild cleanly to avoid the confusing overwrite above
  const clean = {};
  NODES.forEach((n) => { clean[n.id] = []; });
  EDGES.forEach((e) => {
    clean[e.from].push({ from: e.from, to: e.to, km: e.km, terrainFactor: e.terrainFactor, road: e.road });
    clean[e.to].push({ from: e.to, to: e.from, km: e.km, terrainFactor: e.terrainFactor, road: e.road });
  });
  return clean;
}

/**
 * Compute a live "risk multiplier" for an edge given weather severity (0-1)
 * and any active disruption reports affecting that corridor.
 * riskMultiplier >= 1. Higher = slower / more dangerous / to be avoided.
 */
function edgeWeight(edge, { weatherSeverityByNode = {}, disruptions = [] } = {}) {
  const baseWeight = edge.km * edge.terrainFactor;

  // Weather at both endpoints of the edge — take the worse of the two.
  const wA = weatherSeverityByNode[edge.from] ?? 0;
  const wB = weatherSeverityByNode[edge.to] ?? 0;
  const weatherSeverity = Math.max(wA, wB); // 0 (clear) -> 1 (severe)
  const weatherMultiplier = 1 + weatherSeverity * 1.8; // up to 2.8x

  // Active disruption reports tagged to this road/corridor
  const relevant = disruptions.filter(
    (d) => (d.fromNode === edge.from && d.toNode === edge.to) ||
           (d.fromNode === edge.to && d.toNode === edge.from) ||
           d.road === edge.road
  );
  let disruptionMultiplier = 1;
  let blocked = false;
  relevant.forEach((d) => {
    if (d.severity === 'blocked') blocked = true;
    else if (d.severity === 'severe') disruptionMultiplier = Math.max(disruptionMultiplier, 3);
    else if (d.severity === 'moderate') disruptionMultiplier = Math.max(disruptionMultiplier, 1.8);
    else if (d.severity === 'minor') disruptionMultiplier = Math.max(disruptionMultiplier, 1.2);
  });

  return {
    weight: blocked ? Infinity : baseWeight * weatherMultiplier * disruptionMultiplier,
    weatherSeverity,
    disruptionMultiplier,
    blocked,
  };
}

/**
 * Dijkstra shortest (risk-weighted) path between two node ids.
 * Returns { path: [nodeId...], edges: [...], totalKm, totalWeight, avgSpeedKmh, etaMinutes }
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
    // Extract min-dist unvisited node (fine for this small graph size)
    let u = null;
    let best = Infinity;
    for (const id of queue) {
      if (dist[id] < best) { best = dist[id]; u = id; }
    }
    if (u === null) break; // remaining nodes unreachable
    queue.delete(u);
    visited.add(u);
    if (u === endId) break;

    for (const edge of graph[u]) {
      const { weight, weatherSeverity, disruptionMultiplier, blocked } = edgeWeight(edge, context);
      if (blocked) continue;
      const alt = dist[u] + weight;
      if (alt < dist[edge.to]) {
        dist[edge.to] = alt;
        prevEdge[edge.to] = { ...edge, weatherSeverity, disruptionMultiplier };
      }
    }
  }

  if (dist[endId] === Infinity) {
    return null; // no viable route (fully blocked network)
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
  // Effective average speed drops as weighted "difficulty" rises relative to raw distance
  const difficultyRatio = totalKm > 0 ? totalWeight / totalKm : 1;
  const baseSpeed = 45; // km/h baseline on NER highways
  const avgSpeedKmh = Math.max(12, baseSpeed / difficultyRatio);
  const etaMinutes = Math.round((totalKm / avgSpeedKmh) * 60);

  const nodeMap = Object.fromEntries(NODES.map((n) => [n.id, n]));
  const path = [startId, ...pathEdges.map((e) => e.to)].map((id) => nodeMap[id]);

  return {
    path,
    edges: pathEdges.map((e) => ({
      from: nodeMap[e.from],
      to: nodeMap[e.to],
      km: e.km,
      road: e.road,
      weatherSeverity: Number((e.weatherSeverity || 0).toFixed(2)),
      disruptionMultiplier: e.disruptionMultiplier || 1,
      condition: e.weatherSeverity > 0.6 || e.disruptionMultiplier >= 2.5 ? 'disrupted'
        : (e.weatherSeverity > 0.3 || e.disruptionMultiplier >= 1.3) ? 'caution' : 'clear',
    })),
    totalKm: Number(totalKm.toFixed(1)),
    totalWeight: Number(totalWeight.toFixed(1)),
    avgSpeedKmh: Number(avgSpeedKmh.toFixed(1)),
    etaMinutes,
  };
}

/** Find k alternate routes by penalizing edges used in the previous best route. */
function findAlternateRoutes(startId, endId, context = {}, k = 2) {
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
    if (results.length && results[results.length - 1].edges.length === 0) break;
  }
  return results;
}

module.exports = { findRoute, findAlternateRoutes, buildGraph };
