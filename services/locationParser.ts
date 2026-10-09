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

import { cleanCityName, formatProperLocationName, STATIC_GEO_DATA, LOCAL_GEO_MAP } from './geocoding';
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

// In-memory 0ms cache for autocomplete
const SUGGESTION_CACHE = new Map<string, ParsedLocationItem[]>();
const MAX_CACHE_ENTRIES = 120;

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
 * Searches location suggestions using Open-Meteo & Photon (Komoot OpenStreetMap)
 * with 0ms in-memory cache, population ranking, and offline database fallback.
 * Zero API keys, zero AI required.
 */
export async function searchLocationSuggestions(query: string): Promise<ParsedLocationItem[]> {
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

  const cacheKey = trimmed.toLowerCase();
  if (SUGGESTION_CACHE.has(cacheKey)) {
    return SUGGESTION_CACHE.get(cacheKey)!;
  }

  const results: ParsedLocationItem[] = [];
  const seen = new Set<string>();

  // 1. Check offline static cities first for instant sub-millisecond snapping
  const queryLower = trimmed.toLowerCase();
  const queryCityPart = queryLower.split(',')[0].trim();

  for (const [key, details] of Object.entries(STATIC_GEO_DATA)) {
    if (key.length <= 3) continue;
    const keyLower = key.toLowerCase();
    const isCountry = (details.country || '').toLowerCase() === keyLower;
    if (isCountry && queryLower !== keyLower) continue;

    if (keyLower === queryLower || keyLower === queryCityPart || keyLower.startsWith(queryCityPart)) {
      const city = cleanCityName(details.city || key, details.countryCode);
      const country = details.country || '';
      const countryCode = details.countryCode || '';
      const sig = `${city.toLowerCase()}|${country.toLowerCase()}`;
      if (!seen.has(sig)) {
        seen.add(sig);
        const flag = countryCode ? getFlagEmoji(countryCode) : '📍';
        results.push({
          id: `static:${details.lat}:${details.lon || details.lng}:${city}`,
          name: city,
          country,
          countryCode,
          flag,
          displayName: country ? `${flag} ${city}, ${country}` : `${flag} ${city}`,
          lat: parseFloat(details.lat),
          lng: parseFloat(details.lon || details.lng),
          population: 1000000
        });
      }
    }
  }

  // 2. Query Open-Meteo (primary for global cities & population weighting) and Photon (for POIs/landmarks)
  const openMeteoPromise = (async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2800);
      const res = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(trimmed)}&count=8&language=en&format=json`,
        { signal: controller.signal }
      );
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        return data?.results || [];
      }
    } catch {}
    return [];
  })();

  const photonPromise = (async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2800);
      const res = await fetch(
        `https://photon.komoot.io/api/?q=${encodeURIComponent(trimmed)}&limit=8&lang=en`,
        { signal: controller.signal }
      );
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        return data?.features || [];
      }
    } catch {}
    return [];
  })();

  const [meteoResults, photonFeatures] = await Promise.all([openMeteoPromise, photonPromise]);

  // Process Open-Meteo entries (sorted by population)
  if (Array.isArray(meteoResults)) {
    for (const item of meteoResults) {
      const city = cleanCityName(item.name, item.country_code, item.admin1);
      const country = item.country || '';
      const countryCode = (item.country_code || '').toUpperCase();
      const sig = `${city.toLowerCase()}|${country.toLowerCase()}`;

      if (!seen.has(sig)) {
        seen.add(sig);
        const flag = countryCode ? getFlagEmoji(countryCode) : '📍';
        const displayName = country ? `${flag} ${city}, ${country}` : `${flag} ${city}`;

        results.push({
          id: `${item.latitude}:${item.longitude}:${city}`,
          name: city,
          country,
          countryCode,
          flag,
          displayName,
          lat: item.latitude,
          lng: item.longitude,
          population: item.population || 0
        });
      }
    }
  }

  // Supplement with Photon features (landmarks, POIs, venues)
  if (Array.isArray(photonFeatures)) {
    for (const feature of photonFeatures) {
      const props = feature.properties || {};
      const coords = feature.geometry?.coordinates || [0, 0];
      const rawCity = props.city || props.town || props.village || props.name || props.municipality || '';
      const country = props.country || '';
      const countryCode = (props.countrycode || '').toUpperCase();
      const state = props.state || '';

      if (!rawCity) continue;

      const city = cleanCityName(rawCity, countryCode, state);
      const sig = `${city.toLowerCase()}|${country.toLowerCase()}`;

      if (!seen.has(sig)) {
        seen.add(sig);
        const flag = countryCode ? getFlagEmoji(countryCode) : '📍';
        const displayName = country ? `${flag} ${city}, ${country}` : `${flag} ${city}`;

        results.push({
          id: `${coords[1]}:${coords[0]}:${city}`,
          name: city,
          country,
          countryCode,
          flag,
          displayName,
          lat: coords[1],
          lng: coords[0],
          population: 0
        });
      }
    }
  }

  // Rank results: items whose name directly matches query or high population rank first
  results.sort((a, b) => {
    const aLower = a.name.toLowerCase();
    const bLower = b.name.toLowerCase();
    const aExact = aLower === queryCityPart;
    const bExact = bLower === queryCityPart;
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;

    const aPop = a.population || 0;
    const bPop = b.population || 0;
    return bPop - aPop;
  });

  // Cache deduplicated suggestions
  if (SUGGESTION_CACHE.size >= MAX_CACHE_ENTRIES) {
    const firstKey = SUGGESTION_CACHE.keys().next().value;
    if (firstKey) SUGGESTION_CACHE.delete(firstKey);
  }
  SUGGESTION_CACHE.set(cacheKey, results);

  return results;
}
