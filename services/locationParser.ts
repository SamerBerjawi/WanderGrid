/**
 * Location Parser & Geocoding Service (Zero-API / Zero-AI)
 * Modeled after Crystal (locationDetector.ts, useLocationSearch.ts)
 * 
 * Supports:
 * - Parsing Google Maps URLs & coordinates without network calls
 * - Fast offline popular cities index
 * - Free public Photon (Komoot) OpenStreetMap autocomplete with 0ms in-memory cache
 * - Normalization & city cleaning via cleanCityName
 */

import { cleanCityName, formatProperLocationName } from './geocoding';
import { searchPlaces, Place } from './placeSearch';
import { getFlagEmoji } from './geoData';

export interface ParsedLocationItem {
  id: string;
  name: string;
  country: string;
  countryCode?: string;
  flag?: string;
  displayName: string;
  lat?: number;
  lng?: number;
  population?: number;
}

/**
 * Parses Google Maps URL or coordinate strings into structured location data
 */
export function parseGoogleMapsUrl(input: string): {
  isGoogleMaps: boolean;
  placeName?: string;
  lat?: number;
  lng?: number;
} {
  if (!input) return { isGoogleMaps: false };
  const trimmed = input.trim();

  // Check if string is or contains a Google Maps link or raw coordinates
  const isGMapLink = 
    trimmed.includes('google.com/maps') || 
    trimmed.includes('maps.google.') || 
    trimmed.includes('maps.app.goo.gl') || 
    trimmed.includes('goo.gl/maps');

  // Check for raw coordinates pattern: "41.9028, 12.4964" or "@41.9028,12.4964"
  const coordMatch = trimmed.match(/@?(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
  const lat = coordMatch ? parseFloat(coordMatch[1]) : undefined;
  const lng = coordMatch ? parseFloat(coordMatch[2]) : undefined;

  if (!isGMapLink && !coordMatch) {
    return { isGoogleMaps: false };
  }

  let placeName: string | undefined;

  // Extract /place/Place+Name from standard Google Maps URLs
  const placeMatch = trimmed.match(/\/place\/([^/@?#]+)/);
  if (placeMatch && placeMatch[1]) {
    try {
      const decoded = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
      placeName = formatProperLocationName(decoded.trim());
    } catch {
      placeName = formatProperLocationName(placeMatch[1].replace(/\+/g, ' ').trim());
    }
  }

  // Extract from query parameter e.g. ?q=Paris or query=Rome
  if (!placeName) {
    const queryMatch = trimmed.match(/[?&](?:q|query)=([^&#]+)/);
    if (queryMatch && queryMatch[1]) {
      try {
        const decoded = decodeURIComponent(queryMatch[1].replace(/\+/g, ' '));
        placeName = formatProperLocationName(decoded.trim());
      } catch {
        placeName = formatProperLocationName(queryMatch[1].replace(/\+/g, ' ').trim());
      }
    }
  }

  return {
    isGoogleMaps: true,
    placeName,
    lat,
    lng
  };
}

/**
 * Destination autocomplete for trip creation. Backed by the unified place search (instant local tier +
 * parallel Open-Meteo / Photon, ranked by relevance, population and country hint), so "Malmo" and "Malmö, Sweden"
 * both resolve to Malmö in Skåne with exact coordinates. Zero API keys, zero AI.
 * `onUpdate` receives progressively better lists (local results are emitted synchronously).
 */
export async function searchLocationSuggestions(
  query: string,
  onUpdate?: (items: ParsedLocationItem[]) => void
): Promise<ParsedLocationItem[]> {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 2) return [];

  // Check if user pasted a Google Maps link or coordinates
  const gmap = parseGoogleMapsUrl(trimmed);
  if (gmap.isGoogleMaps) {
    if (gmap.placeName) {
      const cleaned = cleanCityName(gmap.placeName);
      return [{
        id: `gmap:${gmap.lat || 0}:${gmap.lng || 0}:${cleaned}`,
        name: cleaned,
        country: '',
        flag: '📍',
        displayName: `📍 ${cleaned} (Google Maps)`,
        lat: gmap.lat,
        lng: gmap.lng
      }];
    }
    if (gmap.lat !== undefined && gmap.lng !== undefined) {
      return [{
        id: `coords:${gmap.lat}:${gmap.lng}`,
        name: `${gmap.lat.toFixed(4)}, ${gmap.lng.toFixed(4)}`,
        country: '',
        flag: '📍',
        displayName: `📍 Pin Coordinates: ${gmap.lat.toFixed(4)}, ${gmap.lng.toFixed(4)}`,
        lat: gmap.lat,
        lng: gmap.lng
      }];
    }
  }

  const toItems = (places: Place[]): ParsedLocationItem[] =>
    places.map(p => {
      const code = (p.countryCode || '').split('-')[0];
      const flag = code ? getFlagEmoji(code) : '📍';
      return {
        id: p.id,
        name: p.kind === 'city' ? p.name : p.label.replace(/^[A-Z]{3}\s*-\s*/, '').split(',')[0],
        country: p.country,
        countryCode: p.countryCode,
        flag,
        displayName: p.country && p.kind === 'city' ? `${flag} ${p.name}, ${p.country}` : `${flag} ${p.label}`,
        lat: p.lat,
        lng: p.lng,
        population: p.population
      };
    });

  const places = await searchPlaces(trimmed, {
    limit: 8,
    onUpdate: onUpdate ? (list) => onUpdate(toItems(list)) : undefined
  });
  return toItems(places);
}
