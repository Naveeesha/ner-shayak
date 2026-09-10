const express = require('express');
const fetch = require('node-fetch');
const { requireAuth } = require('../middleware/auth');
const { NODES } = require('../data/nerNetwork');

const router = express.Router();

// Simple in-memory cache to avoid hammering the free weather API.
const cache = new Map();
const CACHE_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Convert Open-Meteo weathercode + precipitation + wind into a 0-1 severity
 * score used to weight the route optimizer, plus a human label.
 * https://open-meteo.com/en/docs (WMO weather codes)
 */
function scoreWeather(current) {
  const code = current.weathercode;
  const wind = current.windspeed || 0;
  const precip = current.precipitation ?? 0;

  let severity = 0;
  let label = 'Clear';

  if ([95, 96, 99].includes(code)) { severity = 0.95; label = 'Thunderstorm'; }
  else if ([65, 82, 67].includes(code)) { severity = 0.9; label = 'Heavy rain'; }
  else if ([63, 81].includes(code)) { severity = 0.65; label = 'Moderate rain'; }
  else if ([61, 51, 53, 55, 80].includes(code)) { severity = 0.35; label = 'Light rain'; }
  else if ([71, 73, 75, 77, 85, 86].includes(code)) { severity = 0.8; label = 'Snow'; }
  else if ([45, 48].includes(code)) { severity = 0.4; label = 'Fog'; }
  else if ([1, 2, 3].includes(code)) { severity = 0.1; label = 'Partly cloudy'; }
  else { severity = 0.05; label = 'Clear'; }

  if (wind > 40) severity = Math.min(1, severity + 0.2);
  if (precip > 10) severity = Math.min(1, severity + 0.15);

  return { severity: Number(severity.toFixed(2)), label, windspeed: wind, precipitation: precip, code };
}

async function fetchNodeWeather(node) {
  const key = node.id;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.time < CACHE_MS) return cached.data;

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${node.lat}&longitude=${node.lng}&current_weather=true&hourly=precipitation&timezone=auto`;
  const resp = await fetch(url, { timeout: 8000 });
  if (!resp.ok) throw new Error(`Weather API error for ${node.name}: ${resp.status}`);
  const json = await resp.json();
  const current = json.current_weather || {};
  // find current hour precipitation if available
  let precipNow = 0;
  try {
    const idx = json.hourly.time.indexOf(current.time);
    if (idx >= 0) precipNow = json.hourly.precipitation[idx] ?? 0;
  } catch (_) { /* ignore */ }

  const scored = scoreWeather({ ...current, precipitation: precipNow });
  const data = {
    nodeId: node.id,
    name: node.name,
    lat: node.lat,
    lng: node.lng,
    temperature: current.temperature,
    windspeed: current.windspeed,
    ...scored,
    observedAt: current.time,
  };
  cache.set(key, { time: Date.now(), data });
  return data;
}

// GET /api/weather/all — live weather + risk severity for every network node
router.get('/all', requireAuth, async (req, res) => {
  try {
    const results = await Promise.all(NODES.map((n) => fetchNodeWeather(n).catch((e) => ({
      nodeId: n.id, name: n.name, lat: n.lat, lng: n.lng, error: e.message, severity: 0, label: 'Unavailable',
    }))));
    res.json({ nodes: results, fetchedAt: new Date().toISOString() });
  } catch (err) {
    res.status(502).json({ error: 'Unable to reach live weather service', detail: err.message });
  }
});

// GET /api/weather/:nodeId — live weather for a single node
router.get('/:nodeId', requireAuth, async (req, res) => {
  const node = NODES.find((n) => n.id === req.params.nodeId);
  if (!node) return res.status(404).json({ error: 'Unknown location' });
  try {
    const data = await fetchNodeWeather(node);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Unable to reach live weather service', detail: err.message });
  }
});

module.exports = router;
module.exports.fetchNodeWeather = fetchNodeWeather;
