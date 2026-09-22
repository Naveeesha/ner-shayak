/**
 * Weather & Environmental Data Service for NER-LINK
 * Integrates live meteorological data from Open-Meteo API for North East India.
 */

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const cache = new Map();

const NER_HUBS = [
  { id: 'guwahati', name: 'Guwahati', state: 'Assam', lat: 26.1445, lng: 91.7362 },
  { id: 'shillong', name: 'Shillong', state: 'Meghalaya', lat: 25.5788, lng: 91.8933 },
  { id: 'silchar', name: 'Silchar', state: 'Assam', lat: 24.8333, lng: 92.7789 },
  { id: 'imphal', name: 'Imphal', state: 'Manipur', lat: 24.8170, lng: 93.9368 },
  { id: 'kohima', name: 'Kohima', state: 'Nagaland', lat: 25.6751, lng: 94.1086 },
  { id: 'aizawl', name: 'Aizawl', state: 'Mizoram', lat: 23.7271, lng: 92.7176 },
  { id: 'agartala', name: 'Agartala', state: 'Tripura', lat: 23.8315, lng: 91.2868 },
  { id: 'itanagar', name: 'Itanagar', state: 'Arunachal Pradesh', lat: 27.0844, lng: 93.6053 },
  { id: 'gangtok', name: 'Gangtok', state: 'Sikkim', lat: 27.3389, lng: 88.6065 },
];

export async function fetchNodeWeather(lat, lng) {
  const cacheKey = `${lat.toFixed(2)}_${lng.toFixed(2)}`;
  const now = Date.now();
  if (cache.has(cacheKey) && now - cache.get(cacheKey).time < CACHE_TTL_MS) {
    return cache.get(cacheKey).data;
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true&hourly=precipitation,relativehumidity_2m&timezone=Asia/Kolkata`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Weather API returned ${res.status}`);
    const data = await res.json();

    const current = data.current_weather || {};
    const code = current.weathercode || 0;
    const precip = data.hourly?.precipitation?.[0] || 0;

    const weatherObj = {
      temperature: Math.round(current.temperature ?? 24),
      windSpeed: Math.round(current.windspeed ?? 8),
      precipitation: precip,
      condition: weatherCodeToText(code),
      code,
      fetchedAt: new Date().toISOString(),
      isSimulated: false,
    };

    cache.set(cacheKey, { time: now, data: weatherObj });
    return weatherObj;
  } catch (err) {
    console.warn(`[WeatherService] API unavailable for ${lat},${lng}. Using regional seasonal model:`, err.message);
    const fallback = {
      temperature: 24,
      windSpeed: 10,
      precipitation: 4.5,
      condition: 'Partly Cloudy / Monsoon Moisture',
      code: 3,
      fetchedAt: new Date().toISOString(),
      isSimulated: true,
    };
    return fallback;
  }
}

export async function fetchRegionalWeatherSummary() {
  const results = await Promise.allSettled(
    NER_HUBS.map(async (hub) => {
      const w = await fetchNodeWeather(hub.lat, hub.lng);
      return { ...hub, ...w };
    })
  );

  return results.map((r, i) => (r.status === 'fulfilled' ? r.value : { ...NER_HUBS[i], temperature: 23, precipitation: 0, condition: 'Clear' }));
}

function weatherCodeToText(code) {
  if (code === 0) return 'Clear Sky';
  if (code >= 1 && code <= 3) return 'Partly Cloudy';
  if (code >= 45 && code <= 48) return 'Fog / Mist';
  if (code >= 51 && code <= 55) return 'Light Drizzle';
  if (code >= 61 && code <= 65) return 'Moderate Rain';
  if (code >= 80 && code <= 82) return 'Heavy Rain / Downpour';
  if (code >= 95) return 'Thunderstorm';
  return 'Overcast';
}

const weatherService = { fetchNodeWeather, fetchRegionalWeatherSummary, NER_HUBS };
export default weatherService;
