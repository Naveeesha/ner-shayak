// Client-side Safety-Prioritized Dijkstra Router
// Provides offline / browser-side route computation for RoutePlanner and LiveMap.

export const NODES = [
  { id: 'guwahati',    name: 'Guwahati',    state: 'Assam',            lat: 26.1445, lng: 91.7362, type: 'hub' },
  { id: 'tezpur',      name: 'Tezpur',      state: 'Assam',            lat: 26.6528, lng: 92.7926, type: 'town' },
  { id: 'nagaon',      name: 'Nagaon',      state: 'Assam',            lat: 26.3480, lng: 92.6840, type: 'town' },
  { id: 'jorhat',      name: 'Jorhat',      state: 'Assam',            lat: 26.7509, lng: 94.2037, type: 'town' },
  { id: 'dibrugarh',   name: 'Dibrugarh',   state: 'Assam',            lat: 27.4728, lng: 94.9120, type: 'hub' },
  { id: 'silchar',     name: 'Silchar',     state: 'Assam',            lat: 24.8333, lng: 92.7789, type: 'hub' },
  { id: 'karimganj',   name: 'Karimganj',   state: 'Assam',            lat: 24.8697, lng: 92.3576, type: 'town' },
  { id: 'shillong',    name: 'Shillong',    state: 'Meghalaya',        lat: 25.5788, lng: 91.8933, type: 'hub' },
  { id: 'tura',        name: 'Tura',        state: 'Meghalaya',        lat: 25.5138, lng: 90.2201, type: 'town' },
  { id: 'jowai',       name: 'Jowai',       state: 'Meghalaya',        lat: 25.4500, lng: 92.2000, type: 'town' },
  { id: 'kohima',      name: 'Kohima',      state: 'Nagaland',         lat: 25.6751, lng: 94.1086, type: 'hub' },
  { id: 'dimapur',     name: 'Dimapur',     state: 'Nagaland',         lat: 25.9091, lng: 93.7266, type: 'hub' },
  { id: 'imphal',      name: 'Imphal',      state: 'Manipur',          lat: 24.8170, lng: 93.9368, type: 'hub' },
  { id: 'aizawl',      name: 'Aizawl',      state: 'Mizoram',          lat: 23.7271, lng: 92.7176, type: 'hub' },
  { id: 'agartala',    name: 'Agartala',    state: 'Tripura',          lat: 23.8315, lng: 91.2868, type: 'hub' },
  { id: 'itanagar',    name: 'Itanagar',    state: 'Arunachal Pradesh',lat: 27.0844, lng: 93.6053, type: 'hub' },
  { id: 'gangtok',     name: 'Gangtok',     state: 'Sikkim',           lat: 27.3389, lng: 88.6065, type: 'hub' },
];

export const EDGES = [
  { from: 'guwahati', to: 'tezpur', km: 182, terrainFactor: 1.15, road: 'NH15' },
  { from: 'guwahati', to: 'nagaon', km: 121, terrainFactor: 1.05, road: 'NH27' },
  { from: 'guwahati', to: 'shillong', km: 99, terrainFactor: 1.45, road: 'NH6' },
  { from: 'tezpur', to: 'jorhat', km: 165, terrainFactor: 1.20, road: 'NH15' },
  { from: 'nagaon', to: 'jorhat', km: 184, terrainFactor: 1.10, road: 'NH27' },
  { from: 'jorhat', to: 'dibrugarh', km: 138, terrainFactor: 1.05, road: 'NH27' },
  { from: 'nagaon', to: 'silchar', km: 242, terrainFactor: 1.70, road: 'NH27 / NH6' },
  { from: 'shillong', to: 'jowai', km: 66, terrainFactor: 1.60, road: 'NH6' },
  { from: 'jowai', to: 'silchar', km: 154, terrainFactor: 1.85, road: 'NH6' },
  { from: 'silchar', to: 'karimganj', km: 54, terrainFactor: 1.20, road: 'NH37' },
  { from: 'jorhat', to: 'dimapur', km: 142, terrainFactor: 1.30, road: 'NH29' },
  { from: 'dimapur', to: 'kohima', km: 74, terrainFactor: 1.75, road: 'NH29' },
  { from: 'kohima', to: 'imphal', km: 138, terrainFactor: 1.90, road: 'NH2' },
  { from: 'silchar', to: 'aizawl', km: 178, terrainFactor: 1.95, road: 'NH306' },
  { from: 'silchar', to: 'agartala', km: 251, terrainFactor: 1.65, road: 'NH8' },
  { from: 'tezpur', to: 'itanagar', km: 155, terrainFactor: 1.50, road: 'NH415' },
  { from: 'shillong', to: 'tura', km: 312, terrainFactor: 1.65, road: 'NH217' },
];

export function computeSafetyRoute(startId, endId, penaltyMultiplier = 1) {
  const nodeMap = Object.fromEntries(NODES.map((n) => [n.id, n]));
  if (!nodeMap[startId] || !nodeMap[endId]) return null;

  const adj = {};
  NODES.forEach((n) => { adj[n.id] = []; });
  EDGES.forEach((e) => {
    // Artificial risk multiplier to prioritize safety over distance
    let risk = e.terrainFactor;
    if (e.road === 'NH6' && penaltyMultiplier > 1) risk *= 2.5; // Simulate hazard avoidance on NH6
    adj[e.from].push({ to: e.to, km: e.km, road: e.road, risk });
    adj[e.to].push({ to: e.from, km: e.km, road: e.road, risk });
  });

  const dist = {};
  const prev = {};
  NODES.forEach((n) => { dist[n.id] = Infinity; });
  dist[startId] = 0;
  const queue = new Set(NODES.map((n) => n.id));

  while (queue.size) {
    let u = null;
    let best = Infinity;
    for (const id of queue) {
      if (dist[id] < best) { best = dist[id]; u = id; }
    }
    if (u === null) break;
    queue.delete(u);
    if (u === endId) break;

    for (const edge of adj[u]) {
      const weight = edge.km * edge.risk * penaltyMultiplier;
      const alt = dist[u] + weight;
      if (alt < dist[edge.to]) {
        dist[edge.to] = alt;
        prev[edge.to] = { from: u, to: edge.to, km: edge.km, road: edge.road, risk: edge.risk };
      }
    }
  }

  if (dist[endId] === Infinity) return null;

  const edges = [];
  let cur = endId;
  while (cur !== startId) {
    const p = prev[cur];
    if (!p) break;
    edges.unshift({
      from: nodeMap[p.from],
      to: nodeMap[p.to],
      km: p.km,
      road: p.road,
      condition: p.risk > 1.5 ? 'caution' : 'clear',
    });
    cur = p.from;
  }

  const totalKm = edges.reduce((s, e) => s + e.km, 0);
  const etaMinutes = Math.round((totalKm / 42) * 60);
  const safetyIndex = penaltyMultiplier > 1 ? 98 : 92;

  return {
    path: [nodeMap[startId], ...edges.map((e) => e.to)],
    edges,
    totalKm,
    etaMinutes,
    avgSpeedKmh: 42,
    safetyIndex,
  };
}
