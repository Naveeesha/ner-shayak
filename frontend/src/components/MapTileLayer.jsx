import React from 'react';
import { TileLayer } from 'react-leaflet';

// Production CARTO Voyager Basemap configuration
// CARTO Voyager provides high performance, reliable global tiles compatible with mobile WebViews
const FALLBACK_CARTO_KEY = 'cb1_3r7c_1_8004ed9eb226da92ceceaa4f';
export const CARTO_KEY = process.env.REACT_APP_CARTO_MAP_KEY || FALLBACK_CARTO_KEY;

export const CARTO_VOYAGER_URL = CARTO_KEY
  ? `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=${CARTO_KEY}`
  : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png';

export const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer">CARTO</a>';

export const CARTO_SUBDOMAINS = ['a', 'b', 'c', 'd'];

/**
 * Reusable MapTileLayer component
 * Encapsulates the CARTO Voyager basemap provider with subdomains and error handling
 */
export default function MapTileLayer({ retryKey = 0, onTileError, onTileLoad }) {
  return (
    <TileLayer
      key={`carto-voyager-${retryKey}`}
      url={CARTO_VOYAGER_URL}
      attribution={CARTO_ATTRIBUTION}
      subdomains={CARTO_SUBDOMAINS}
      maxZoom={19}
      minZoom={4}
      eventHandlers={{
        tileerror: (e) => {
          if (onTileError) onTileError(e);
        },
        load: (e) => {
          if (onTileLoad) onTileLoad(e);
        }
      }}
    />
  );
}
