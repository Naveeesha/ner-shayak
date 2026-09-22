/**
 * Geospatial Map & Routing Service for NER-LINK
 * Integrates Mapbox Directions, Geocoding API, and Turf.js spatial calculations.
 */

import * as turf from '@turf/turf';

const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN || '';

export async function geocodeAddress(query) {
  if (!MAPBOX_TOKEN) {
    return { name: query, lat: 26.1445, lng: 91.7362, isDemo: true };
  }
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&country=in&bbox=88.0,21.5,97.5,30.0`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Geocoding error ${res.status}`);
    const data = await res.json();
    if (data.features?.length) {
      const feat = data.features[0];
      return {
        name: feat.place_name,
        lng: feat.center[0],
        lat: feat.center[1],
        isDemo: false,
      };
    }
  } catch (err) {
    console.warn('[MapService] Geocoding exception:', err.message);
  }
  return { name: query, lat: 26.1445, lng: 91.7362, isDemo: true };
}

export async function fetchMapboxDirections(origin, destination) {
  if (!MAPBOX_TOKEN) return null;
  try {
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?alternatives=true&geometries=geojson&steps=true&access_token=${MAPBOX_TOKEN}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Mapbox directions returned ${res.status}`);
    const data = await res.json();
    return data.routes || [];
  } catch (err) {
    console.warn('[MapService] Mapbox directions error:', err.message);
    return null;
  }
}

export function calculateTurfDistance(coord1, coord2) {
  try {
    const from = turf.point([coord1.lng, coord1.lat]);
    const to = turf.point([coord2.lng, coord2.lat]);
    return Math.round(turf.distance(from, to, { units: 'kilometers' }));
  } catch (_) {
    return 100;
  }
}

export default { geocodeAddress, fetchMapboxDirections, calculateTurfDistance };
