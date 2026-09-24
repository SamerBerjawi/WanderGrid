import { Transport } from '../types';
import { STATIC_GEO_DATA } from '../services/geocoding';
import {
  TOP_100_AIRPORTS,
  TOP_50_AIRLINES,
  TOP_AIRPORTS_BY_IATA,
  TOP_AIRLINES_BY_IATA,
  AIRPORT_CODES as TOP_AIRPORT_CODES,
  AIRLINE_CODES as TOP_AIRLINE_CODES,
  DEFAULT_AIRPORT_TIMEZONES as TOP_DEFAULT_TIMEZONES,
  TOP_AIRLINE_DOMAINS,
  searchTopAirports,
  searchTopAirlines,
  TopAirport,
  TopAirline
} from './topAviationData';

// Re-export top aviation datasets and lookup helpers
export {
  TOP_100_AIRPORTS,
  TOP_50_AIRLINES,
  TOP_AIRPORTS_BY_IATA,
  TOP_AIRLINES_BY_IATA,
  TOP_AIRLINE_DOMAINS,
  searchTopAirports,
  searchTopAirlines
};
export type { TopAirport, TopAirline };

/**
 * Normalizes full legal corporate registrations (e.g. from GitHub datasets or external APIs)
 * into clean, user-facing commercial airline brand names specifically for non-hardcoded entities.
 *
 * Examples:
 *   "Middle East Airlines AirLiban Dba MEA" -> "Middle East Airlines"
 *   "BA Euroflyer Limited dba British Airways" -> "British Airways"
 *   "Star Up S.A. dba Star Peru" -> "Star Peru"
 *   "Eastern Airlines, LLC" -> "Eastern Airlines"
 *   "Delta Air Lines Inc" -> "Delta Air Lines"
 */
export function formatCommercialAirlineName(rawName: string, iataCode?: string): string {
  if (!rawName) return '';
  let name = rawName.trim();

  // 1. Handle DBA / Doing Business As / Trading As patterns
  const dbaMatch = name.match(/^(.*?)\s+(?:dba|d\/b\/a|d\.b\.a\.|doing business as|t\/a)\s+(.*?)$/i);
  if (dbaMatch) {
    const before = dbaMatch[1].trim();
    const after = dbaMatch[2].trim();
    const iata = (iataCode || '').toUpperCase();

    // If 'after' is simply an acronym or IATA/ICAO code (<= 4 uppercase chars like 'MEA'),
    // the genuine commercial brand is in 'before'.
    const isAcronymOnly = /^[A-Z0-9]{2,4}$/.test(after) || (iata && after.toUpperCase() === iata);
    if (isAcronymOnly) {
      name = before;
    } else {
      // If 'after' is an actual trade/brand name (e.g. 'British Airways', 'Star Peru', 'Air Astra')
      name = after;
    }
  }

  // 2. Remove secondary legal mergers/regional additions (e.g., 'AirLiban', 'Air Liban', 'S.A.L.')
  name = name.replace(/\s*[-/]?\s*(?:AirLiban|Air Liban)\b/i, '');

  // 3. Remove parenthesized corporate descriptors like '(Pty) Ltd', '(Malta) Ltd', '(UK) Limited'
  name = name.replace(/\s*\((?:pty|uk|usa|corp|ltd|plc|group|malta|cyprus|poland|europe|international)\)\s*/gi, ' ');

  // 4. Iteratively strip corporate legal entity suffixes at end of string or before comma
  const legalRegex = /(?:,\s*|\s+)(?:inc\.?|incorporated|corp\.?|corporation|llc\.?|l\.l\.c\.?|ltd\.?|limited|plc\.?|p\.l\.c\.?|s\.a\.?|s\.a\.s\.?|s\.p\.a\.?|gmbh|ag|s\.l\.?|co\.?,?\s*ltd\.?|co\.?,?\s*limited|company limited|pte\.?,?\s*ltd\.?|pvt\.?,?\s*ltd\.?|dac|oy|ab|b\.v\.?|n\.v\.?|k\.k\.?|jsc|s\.a\.l\.?)\.?$/i;
  let prev = '';
  while (prev !== name) {
    prev = name;
    name = name.replace(legalRegex, '').trim();
  }

  // 5. Clean trailing commas, hyphens, and whitespace
  name = name.replace(/[\s,.-]+$/, '').trim();

  // 6. Title case if the source was fully UPPERCASE (e.g., 'AVIANCA' -> 'Avianca')
  if (name.length > 3 && name === name.toUpperCase()) {
    name = name.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  return name || rawName;
}

// Dynamic, backwards-compatible dictionaries seeded with Top 100/50 and enriched dynamically
export const AIRPORT_CODES: Record<string, string> = { ...TOP_AIRPORT_CODES };
export const AIRLINE_CODES: Record<string, string> = { ...TOP_AIRLINE_CODES };
export const DEFAULT_AIRPORT_TIMEZONES: Record<string, string> = { ...TOP_DEFAULT_TIMEZONES };

// Full online datasets loaded from GitHub to guarantee global worldwide coverage
export const onlineAirports = new Map<string, { city: string; name: string; country?: string }>();
export const onlineCarriers = new Map<string, { name: string; country?: string; domain?: string }>();
export const onlineCarrierIcaoToIata = new Map<string, string>();

// -------------------------------------------------------------
// STEP 1: PREPOPULATE IN-MEMORY DATASETS FROM TOP 100/50 (0ms)
// -------------------------------------------------------------
TOP_100_AIRPORTS.forEach(a => {
  const upper = a.iata.toUpperCase();
  onlineAirports.set(upper, {
    city: a.city,
    name: a.name,
    country: a.country
  });
  AIRPORT_CODES[upper] = a.city;
});

TOP_50_AIRLINES.forEach(c => {
  const upper = c.iata.toUpperCase();
  onlineCarriers.set(upper, {
    name: c.name,
    country: c.country,
    domain: c.domain
  });
  AIRLINE_CODES[upper] = c.name;
});

// Seed from STATIC_GEO_DATA if available
try {
  if (typeof STATIC_GEO_DATA === 'object' && STATIC_GEO_DATA !== null) {
    Object.entries(STATIC_GEO_DATA).forEach(([code, data]) => {
      const upper = (code || '').toUpperCase();
      if (upper && upper.length === 3 && !onlineAirports.has(upper)) {
        onlineAirports.set(upper, {
          city: (data as any).city || '',
          name: (data as any).name || '',
          country: (data as any).country || ''
        });
        if (!AIRPORT_CODES[upper]) {
          AIRPORT_CODES[upper] = (data as any).city || (data as any).name || '';
        }
      }
    });
  }
} catch (e) {
  console.warn("Failed to seed onlineAirports from STATIC_GEO_DATA", e);
}

// Seed from localStorage persistent client cache if in browser
try {
  if (typeof window !== 'undefined' && window.localStorage) {
    const cachedAirports = localStorage.getItem('wandergrid_airports_cache_v1');
    if (cachedAirports) {
      const parsed = JSON.parse(cachedAirports);
      if (Array.isArray(parsed)) {
        parsed.forEach((item: any) => {
          const upper = (item.iata || '').toUpperCase();
          if (upper && !onlineAirports.has(upper)) {
            onlineAirports.set(upper, {
              city: item.city || '',
              name: item.name || '',
              country: item.country || ''
            });
            if (!AIRPORT_CODES[upper]) {
              AIRPORT_CODES[upper] = item.city || item.name || '';
            }
          }
        });
      }
    }

    const cachedAirlines = localStorage.getItem('wandergrid_airlines_cache_v1');
    if (cachedAirlines) {
      const parsed = JSON.parse(cachedAirlines);
      if (Array.isArray(parsed)) {
        parsed.forEach((item: any) => {
          const code = (item.code || item.iata || item.id || '').toUpperCase();
          if (code && !onlineCarriers.has(code)) {
            onlineCarriers.set(code, {
              name: item.name || '',
              country: item.country || ''
            });
            if (!AIRLINE_CODES[code]) {
              AIRLINE_CODES[code] = item.name || '';
            }
          }
        });
      }
    }
  }
} catch (e) {}

export const airportTimezones = new Map<string, string>(Object.entries(DEFAULT_AIRPORT_TIMEZONES));

export function getAirportTimezone(iataCode: string): string | undefined {
  const code = (iataCode || "").trim().toUpperCase();
  if (!code) return undefined;
  return airportTimezones.get(code);
}

export function parseLocalDateInTimezone(dateStr: string, timeStr: string, timeZoneId?: string): Date {
  const timeHex = timeStr ? timeStr.substring(0, 5) : '00:00';
  const iso = `${dateStr}T${timeHex}:00`;
  
  if (!timeZoneId) {
    return new Date(iso);
  }
  
  try {
    const parsedUtc = new Date(iso + 'Z');
    if (isNaN(parsedUtc.getTime())) {
      return new Date(iso);
    }
    
    // Format UTC candidate in the target timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZoneId,
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
      hour12: false
    });
    
    const parts = formatter.formatToParts(parsedUtc);
    const getPart = (type: string) => parts.find(p => p.type === type)?.value || '';
    
    const yr = getPart('year');
    const mo = getPart('month').padStart(2, '0');
    const dy = getPart('day').padStart(2, '0');
    let hr = getPart('hour');
    if (hr === '24') hr = '00';
    const min = getPart('minute').padStart(2, '0');
    const sec = getPart('second').padStart(2, '0');
    
    const formattedIsoLocal = `${yr}-${mo}-${dy}T${hr.padStart(2, '0')}:${min}:${sec}Z`;
    const formattedUtc = new Date(formattedIsoLocal);
    
    const offsetMs = formattedUtc.getTime() - parsedUtc.getTime();
    return new Date(parsedUtc.getTime() - offsetMs);
  } catch (err) {
    return new Date(iso);
  }
}

export function getFlightDepartureUtcDate(flight: Transport): Date {
  const tz = getAirportTimezone(flight.origin);
  const depDate = flight.departureDate || '2026-05-24';
  const depTime = flight.departureTime || '00:00';
  return parseLocalDateInTimezone(depDate, depTime, tz);
}

export function getFlightArrivalUtcDate(flight: Transport): Date {
  const tz = getAirportTimezone(flight.destination);
  const arrDate = flight.arrivalDate || flight.departureDate || '2026-05-24';
  const arrTime = flight.arrivalTime || '00:00';
  return parseLocalDateInTimezone(arrDate, arrTime, tz);
}

let isOnlineLoadingStarted = false;
let isOnlineDataLoaded = false;

export async function preloadStaticDatasets() {
  if (isOnlineLoadingStarted) return;
  isOnlineLoadingStarted = true;
  console.log("Preloading full airline, airport, and timezone data from GitHub...");
  
  try {
    // 1. Fetch carriers
    const carriersPromise = fetch('https://raw.githubusercontent.com/dlubom/iata_code_fetcher/main/carrier_data_full_processed.jsonl')
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const text = await res.text();
        const lines = text.split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const item = JSON.parse(line);
            const iata = (item.iata || '').trim().toUpperCase();
            if (iata) {
              const rawName = item.company_name || item.name || '';
              // Format commercial airline brand name for non-hardcoded entities
              const cleanName = formatCommercialAirlineName(rawName, iata);
              onlineCarriers.set(iata, {
                name: cleanName,
                country: item.country_or_territory || ''
              });
              if (!AIRLINE_CODES[iata] && cleanName) {
                AIRLINE_CODES[iata] = cleanName;
              }
            }
          } catch (e) {}
        }
        console.log(`Preloaded ${onlineCarriers.size} carriers from GitHub.`);
      })
      .catch((err) => console.warn("Failed preloading carriers from GitHub:", err));

    // 2. Fetch OpenFlights airlines for robust ICAO -> IATA mapping & commercial brand names
    const openflightsPromise = fetch('https://raw.githubusercontent.com/jpatokal/openflights/master/data/airlines.dat')
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const text = await res.text();
        const lines = text.split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
          if (parts.length >= 5) {
            const iata = parts[3].replace(/\"/g, '').trim().toUpperCase();
            const icao = parts[4].replace(/\"/g, '').trim().toUpperCase();
            const companyName = parts[1].replace(/\"/g, '').trim();
            if (iata && iata !== '\\N' && iata !== '-' && iata.length === 2 && icao && icao !== '\\N' && icao !== '-' && icao.length === 3) {
              const cleanName = formatCommercialAirlineName(companyName, iata);
              onlineCarrierIcaoToIata.set(icao, iata);
              // Prefer OpenFlights clean commercial name or shorter brand name
              if (!onlineCarriers.has(iata) || (onlineCarriers.get(iata)?.name?.length || 999) > cleanName.length) {
                onlineCarriers.set(iata, { name: cleanName });
                AIRLINE_CODES[iata] = cleanName;
              }
            }
          }
        }
        console.log(`Preloaded ${onlineCarrierIcaoToIata.size} ICAO -> IATA carrier mappings.`);
      })
      .catch((err) => console.warn("Failed preloading OpenFlights carriers mapping:", err));

    // 3. Fetch airports
    const airportsPromise = fetch('https://raw.githubusercontent.com/dlubom/iata_code_fetcher/main/airport_data_full_processed.jsonl')
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const text = await res.text();
        const lines = text.split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const item = JSON.parse(line);
            const iata = (item.iata || '').trim().toUpperCase();
            if (iata) {
              const cityName = item.city_name || '';
              const airportName = item.airport_name || '';
              onlineAirports.set(iata, {
                city: cityName,
                name: airportName,
                country: item.country_name || ''
              });
              if (!AIRPORT_CODES[iata]) {
                AIRPORT_CODES[iata] = cityName || airportName;
              }
            }
          } catch (e) {}
        }
        console.log(`Preloaded ${onlineAirports.size} airports from GitHub.`);
      })
      .catch((err) => console.warn("Failed preloading airports from GitHub:", err));

    // 4. Fetch OpenFlights airports database to enrich airportTimezones
    const openflightsAirportsPromise = fetch('https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat')
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const text = await res.text();
        const lines = text.split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
          if (parts.length >= 12) {
            const iata = parts[4].replace(/\"/g, '').trim().toUpperCase();
            const tzName = parts[11].replace(/\"/g, '').trim();
            if (iata && iata.length === 3 && tzName && tzName !== '\\N' && tzName !== '-') {
              airportTimezones.set(iata, tzName);
            }
          }
        }
        console.log(`Preloaded ${airportTimezones.size} airport timezones from OpenFlights.`);
      })
      .catch((err) => console.warn("Failed preloading OpenFlights timezone data:", err));

    await Promise.allSettled([carriersPromise, openflightsPromise, airportsPromise, openflightsAirportsPromise]);
    isOnlineDataLoaded = true;
    
    // Dispatch master reload event to cause views to refresh
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('wandergrid_metadata_resolved', {
        detail: { type: 'batch_refresh' }
      }));
    }
  } catch (e) {
    console.error("Failed to preload full online datasets:", e);
  }
}

// Automatically initiate background preload in browser environment without blocking page interaction
if (typeof window !== 'undefined') {
  setTimeout(() => {
    preloadStaticDatasets();
  }, 1000);
}

// Background fetch handlers and tracking sets to avoid redundant API queries
const pendingAirportFetches = new Set<string>();
const failedAirportFetches = new Set<string>();

const pendingCarrierFetches = new Set<string>();
const failedCarrierFetches = new Set<string>();

interface CachedAirport {
  iata: string;
  city?: string;
  name?: string;
  country?: string;
}

interface CachedCarrier {
  iata: string;
  name: string;
}

function getAviationStackApiKey(): string {
  try {
    const s = localStorage.getItem('wandergrid_settings');
    if (s) {
      const parsed = JSON.parse(s);
      return parsed.aviationStackApiKey || '';
    }
  } catch (e) {}
  return '';
}

function getAirportFromCache(code: string): CachedAirport | null {
  try {
    const cached = localStorage.getItem('wandergrid_airports_cache_v1');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) {
        const found = parsed.find((item: any) => (item.iata || "").toUpperCase() === code);
        if (found) return found;
      }
    }
  } catch (e) {}
  return null;
}

function saveAirportToCache(item: CachedAirport) {
  try {
    const cached = localStorage.getItem('wandergrid_airports_cache_v1');
    let parsed: CachedAirport[] = [];
    if (cached) {
      try {
        const p = JSON.parse(cached);
        if (Array.isArray(p)) parsed = p;
      } catch (e) {}
    }
    
    parsed = parsed.filter((x: any) => (x.iata || "").toUpperCase() !== item.iata.toUpperCase());
    parsed.push(item);
    
    localStorage.setItem('wandergrid_airports_cache_v1', JSON.stringify(parsed));
    
    // Notify application views to re-render
    window.dispatchEvent(new CustomEvent('wandergrid_metadata_resolved', {
      detail: { type: 'airport', code: item.iata, data: item }
    }));
  } catch (e) {}
}

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('wandergrid_session_token') : null;
  const headers = {
    ...(options.headers || {}),
  } as Record<string, string>;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return fetch(url, { ...options, headers });
}

async function triggerBackgroundAirportFetch(code: string) {
  if (pendingAirportFetches.has(code) || failedAirportFetches.has(code)) return;
  pendingAirportFetches.add(code);
  
  try {
    // 1. Try local backend proxy
    try {
      const res = await fetchWithAuth(`/api/airports/lookup/${code}`);
      if (res.ok) {
        const data = await res.json();
        const item: CachedAirport = {
          iata: code,
          city: data.city_name || data.airport_name,
          name: data.airport_name,
          country: data.country_or_territory
        };
        saveAirportToCache(item);
        onlineAirports.set(code, { city: item.city || '', name: item.name || '', country: item.country });
        AIRPORT_CODES[code] = item.city || item.name || code;
        return;
      }
    } catch (e) {
      // Backend lookup failed, proceed to fallback
    }

    // 2. Ensure GitHub dataset preload is started in background
    if (!isOnlineLoadingStarted) {
      preloadStaticDatasets();
    }

    // 3. Fallback to AviationStack if apiKey exists
    const apiKey = getAviationStackApiKey();
    if (apiKey) {
      try {
        let extRes: Response;
        const isMockMode = localStorage.getItem('wandergrid_api_status') === 'unavailable';
        if (isMockMode) {
          extRes = await fetch(`https://api.aviationstack.com/v1/airports?access_key=${apiKey}&iata_code=${code}`);
        } else {
          extRes = await fetchWithAuth(`/api/proxy/airports?access_key=${apiKey}&iata_code=${code}`);
        }
        if (extRes.ok) {
          const json = await extRes.json();
          if (json && json.data && Array.isArray(json.data) && json.data.length > 0) {
            const first = json.data[0];
            const airportName = first.airport_name || first.name;
            const cityName = first.city_name || first.municipality || first.timezone?.split('/').pop()?.replace(/_/g, ' ');
            const countryName = first.country_name;
            
            const item: CachedAirport = {
              iata: code,
              city: cityName || airportName,
              name: airportName,
              country: countryName
            };
            saveAirportToCache(item);
            onlineAirports.set(code, { city: item.city || '', name: item.name || '', country: item.country });
            AIRPORT_CODES[code] = item.city || item.name || code;
            return;
          }
        }
      } catch (e) {}
    }

    failedAirportFetches.add(code);
  } catch (e) {
    console.warn(`Failed background airport lookup for ${code}`, e);
    failedAirportFetches.add(code);
  } finally {
    pendingAirportFetches.delete(code);
  }
}

function getCarrierFromCache(code: string): CachedCarrier | null {
  try {
    const cached = localStorage.getItem('wandergrid_airlines_cache_v1');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) {
        const found = parsed.find((item: any) => 
          (item.id || "").toUpperCase() === code || 
          (item.code || "").toUpperCase() === code || 
          (item.iata || "").toUpperCase() === code
        );
        if (found) return { iata: code, name: found.name };
      }
    }
  } catch (e) {}
  return null;
}

function saveCarrierToCache(item: CachedCarrier) {
  try {
    const cached = localStorage.getItem('wandergrid_airlines_cache_v1');
    let parsed: any[] = [];
    if (cached) {
      try {
        const p = JSON.parse(cached);
        if (Array.isArray(p)) parsed = p;
      } catch (e) {}
    }
    
    const cleanName = formatCommercialAirlineName(item.name, item.iata);
    parsed = parsed.filter((x: any) => 
      (x.code || "").toUpperCase() !== item.iata.toUpperCase() && 
      (x.iata || "").toUpperCase() !== item.iata.toUpperCase()
    );
    parsed.push({
      iata: item.iata,
      code: item.iata,
      name: cleanName
    });
    
    localStorage.setItem('wandergrid_airlines_cache_v1', JSON.stringify(parsed));
    
    // Notify application views to re-render
    window.dispatchEvent(new CustomEvent('wandergrid_metadata_resolved', {
      detail: { type: 'carrier', code: item.iata, data: { ...item, name: cleanName } }
    }));
  } catch (e) {}
}

async function triggerBackgroundCarrierFetch(code: string) {
  if (pendingCarrierFetches.has(code) || failedCarrierFetches.has(code)) return;
  pendingCarrierFetches.add(code);
  
  try {
    // 1. Try local backend proxy
    try {
      const res = await fetchWithAuth(`/api/carriers/lookup/${code}`);
      if (res.ok) {
        const data = await res.json();
        const rawName = data.company_name || data.name || '';
        const cleanName = formatCommercialAirlineName(rawName, code);
        const item: CachedCarrier = {
          iata: code,
          name: cleanName
        };
        saveCarrierToCache(item);
        onlineCarriers.set(code, { name: cleanName });
        AIRLINE_CODES[code] = cleanName;
        return;
      }
    } catch (e) {
      // Backend unavailable, fallback
    }

    // 2. Ensure GitHub dataset preload is started in background
    if (!isOnlineLoadingStarted) {
      preloadStaticDatasets();
    }

    // 3. Fallback to AviationStack if apiKey exists
    const apiKey = getAviationStackApiKey();
    if (apiKey) {
      try {
        let extRes: Response;
        const isMockMode = localStorage.getItem('wandergrid_api_status') === 'unavailable';
        if (isMockMode) {
          extRes = await fetch(`https://api.aviationstack.com/v1/airlines?access_key=${apiKey}&iata_code=${code}`);
        } else {
          extRes = await fetchWithAuth(`/api/proxy/airlines?access_key=${apiKey}&iata_code=${code}`);
        }
        if (extRes.ok) {
          const json = await extRes.json();
          if (json && json.data && Array.isArray(json.data) && json.data.length > 0) {
            const first = json.data[0];
            const airlineName = first.airline_name || first.name;
            if (airlineName) {
              const cleanName = formatCommercialAirlineName(airlineName, code);
              const item: CachedCarrier = {
                iata: code,
                name: cleanName
              };
              saveCarrierToCache(item);
              onlineCarriers.set(code, { name: cleanName });
              AIRLINE_CODES[code] = cleanName;
              return;
            }
          }
        }
      } catch (e) {}
    }

    failedCarrierFetches.add(code);
  } catch (e) {
    console.warn(`Failed background carrier lookup for ${code}`, e);
    failedCarrierFetches.add(code);
  } finally {
    pendingCarrierFetches.delete(code);
  }
}

// -------------------------------------------------------------
// TWO-TIER RETRIEVAL: Top Datasets (Tier 1) -> GitHub / Cache (Tier 2)
// -------------------------------------------------------------

export function getCityName(iataCode: string): string {
  const code = (iataCode || "").trim().toUpperCase();
  if (!code || code.length < 2) return code;

  // 1. Tier 1: Check instant curated Top 100 Airports (0ms latency)
  const topAirport = TOP_AIRPORTS_BY_IATA.get(code);
  if (topAirport) {
    return topAirport.city || topAirport.name || code;
  }

  // 2. Tier 2: Check full in-memory online dataset (preloaded from GitHub)
  const onlineItem = onlineAirports.get(code);
  if (onlineItem) {
    return onlineItem.city || onlineItem.name || code;
  }

  // 3. Check persistent localStorage cache
  const cached = getAirportFromCache(code);
  if (cached) {
    return cached.city || cached.name || code;
  }

  // 4. Check dynamic dictionary
  if (AIRPORT_CODES[code]) {
    return AIRPORT_CODES[code];
  }
  
  // 5. Trigger non-blocking fallback fetch (Local DB -> GitHub fallback)
  triggerBackgroundAirportFetch(code);

  return code;
}

export function getAirportName(iataCode: string): string {
  const code = (iataCode || "").trim().toUpperCase();
  if (!code || code.length < 2) return code;

  // 1. Tier 1: Check instant curated Top 100 Airports (0ms latency)
  const topAirport = TOP_AIRPORTS_BY_IATA.get(code);
  if (topAirport) {
    return topAirport.name;
  }

  // 2. Tier 2: Check in-memory online dataset
  const onlineItem = onlineAirports.get(code);
  if (onlineItem && onlineItem.name) {
    return onlineItem.name;
  }

  // 3. Check cached data
  const cached = getAirportFromCache(code);
  if (cached && cached.name) {
    return cached.name;
  }

  // 4. Trigger non-blocking fallback fetch
  triggerBackgroundAirportFetch(code);

  return getCityName(code);
}

export function getCarrierName(carrierCode: string): string {
  const code = (carrierCode || "").trim().toUpperCase();
  if (!code || code.length < 2) return code;

  // 1. Tier 1: Check instant curated Top 50 Airlines (0ms latency, already verified commercial name)
  const topAirline = TOP_AIRLINES_BY_IATA.get(code);
  if (topAirline) {
    return topAirline.name;
  }

  // 2. Tier 2: Check in-memory online dataset (preloaded from GitHub, formatted for non-hardcoded)
  const onlineItem = onlineCarriers.get(code);
  if (onlineItem && onlineItem.name) {
    return formatCommercialAirlineName(onlineItem.name, code);
  }

  // 3. Check persistent localStorage cache
  const cached = getCarrierFromCache(code);
  if (cached && cached.name) {
    return formatCommercialAirlineName(cached.name, code);
  }

  // 4. Check dynamic dictionary
  if (AIRLINE_CODES[code]) {
    return formatCommercialAirlineName(AIRLINE_CODES[code], code);
  }
  
  // 5. Trigger non-blocking fallback fetch (Local DB -> GitHub fallback)
  triggerBackgroundCarrierFetch(code);

  return carrierCode;
}

export function getAirportsByQueryLocally(query: string, limit: number = 15): Array<{
  iata: string;
  city_name: string;
  airport_name: string;
  country?: string;
  code?: string;
  name?: string;
  city?: string;
}> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  // Step 1: Instant search in Top 100 airports (Tier 1)
  const topMatches = searchTopAirports(q, limit);
  const seenIatas = new Set<string>();
  const results: Array<{
    iata: string;
    city_name: string;
    airport_name: string;
    country?: string;
    code?: string;
    name?: string;
    city?: string;
  }> = [];

  for (const a of topMatches) {
    seenIatas.add(a.iata.toUpperCase());
    results.push({
      iata: a.iata,
      code: a.iata,
      city_name: a.city,
      city: a.city,
      airport_name: a.name,
      name: a.name,
      country: a.country
    });
  }

  // Step 2: Fallback / search additional airports from full GitHub online dataset
  if (results.length < limit) {
    const additionalMatches: Array<{
      iata: string;
      city_name: string;
      airport_name: string;
      country?: string;
      code?: string;
      name?: string;
      city?: string;
      score: number;
    }> = [];

    for (const [iata, value] of onlineAirports.entries()) {
      if (seenIatas.has(iata)) continue;

      const isIataExact = iata.toLowerCase() === q;
      const isIataPrefix = iata.toLowerCase().startsWith(q);
      const isIataPartial = iata.toLowerCase().includes(q);
      const isCityExact = (value.city || '').toLowerCase() === q;
      const isCityPartial = (value.city || '').toLowerCase().includes(q);
      const isAirportMatch = (value.name || '').toLowerCase().includes(q);
      const isCountryMatch = (value.country || '').toLowerCase().includes(q);

      if (isIataExact || isIataPrefix || isIataPartial || isCityExact || isCityPartial || isAirportMatch || isCountryMatch) {
        additionalMatches.push({
          iata,
          code: iata,
          city_name: value.city,
          city: value.city,
          airport_name: value.name,
          name: value.name,
          country: value.country,
          score: isIataExact ? 1 : isIataPrefix ? 2 : isCityExact ? 3 : isIataPartial ? 4 : isCityPartial ? 5 : 6
        });
      }
    }

    additionalMatches.sort((a, b) => a.score - b.score);
    for (const m of additionalMatches) {
      if (results.length >= limit) break;
      const { score, ...item } = m;
      results.push(item);
    }
  }

  // If online data hasn't been preloaded yet, trigger it now in the background
  if (!isOnlineLoadingStarted) {
    preloadStaticDatasets();
  }

  return results.slice(0, limit);
}

export function getCarriersByQueryLocally(query: string, limit: number = 15): Array<{
  iata: string;
  company_name: string;
  code?: string;
  name?: string;
}> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  // Step 1: Instant search in Top 50 airlines (Tier 1)
  const topMatches = searchTopAirlines(q, limit);
  const seenIatas = new Set<string>();
  const results: Array<{
    iata: string;
    company_name: string;
    code?: string;
    name?: string;
  }> = [];

  for (const c of topMatches) {
    seenIatas.add(c.iata.toUpperCase());
    results.push({
      iata: c.iata,
      code: c.iata,
      company_name: c.name,
      name: c.name
    });
  }

  // Step 2: Fallback / search additional carriers from full GitHub online dataset
  if (results.length < limit) {
    const additionalMatches: Array<{
      iata: string;
      company_name: string;
      code?: string;
      name?: string;
      score: number;
    }> = [];

    for (const [iata, value] of onlineCarriers.entries()) {
      if (seenIatas.has(iata)) continue;

      const cleanName = formatCommercialAirlineName(value.name, iata);
      const isIataExact = iata.toLowerCase() === q;
      const isIataPrefix = iata.toLowerCase().startsWith(q);
      const isNameExact = cleanName.toLowerCase() === q;
      const isNamePartial = cleanName.toLowerCase().includes(q) || (value.name || '').toLowerCase().includes(q);

      if (isIataExact || isIataPrefix || isNameExact || isNamePartial) {
        additionalMatches.push({
          iata,
          code: iata,
          company_name: cleanName,
          name: cleanName,
          score: isIataExact ? 1 : isIataPrefix ? 2 : isNameExact ? 3 : 4
        });
      }
    }

    additionalMatches.sort((a, b) => a.score - b.score);
    for (const m of additionalMatches) {
      if (results.length >= limit) break;
      const { score, ...item } = m;
      results.push(item);
    }
  }

  // If online data hasn't been preloaded yet, trigger it now in the background
  if (!isOnlineLoadingStarted) {
    preloadStaticDatasets();
  }

  return results.slice(0, limit);
}

function parseDateTimeStr(str: string, defaultDate: string = ''): { date: string, time: string, timestamp: number } {
  if (!str) return { date: defaultDate, time: '', timestamp: 0 };
  const clean = str.trim();
  if (!clean) return { date: defaultDate, time: '', timestamp: 0 };

  // ISO Format or similar (e.g. "2026-05-24T12:15:00Z")
  if (clean.includes('T')) {
    const [d, tPart] = clean.split('T');
    const time = tPart.substring(0, 5); // get HH:MM
    return { date: d, time, timestamp: new Date(clean).getTime() };
  }

  // Space-separated format (e.g. "2026-05-24 12:15")
  const spaceMatch = clean.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/);
  if (spaceMatch) {
    return {
      date: spaceMatch[1],
      time: spaceMatch[2],
      timestamp: new Date(clean.replace(' ', 'T')).getTime()
    };
  }

  // Just time format (e.g. "12:10")
  if (clean.includes(':')) {
    const time = clean.substring(0, 5);
    const fullIso = `${defaultDate || '2026-01-01'}T${time}:00`;
    return { date: defaultDate, time, timestamp: new Date(fullIso).getTime() };
  }

  return { date: defaultDate, time: clean, timestamp: 0 };
}

export function getFlightStatusTags(flight: Transport) {
  const isCanceledField = flight.customFields?.find(f => f.key.toLowerCase() === 'canceled' && f.value.toUpperCase() === 'TRUE');
  const isCanceled = isCanceledField || flight.isApproximate; // we mapped isCanceled to isApproximate in Import

  // Scheduled Departure info
  const depScheduledDate = flight.departureDate || '';
  const depScheduledTime = flight.departureTime || '00:00';
  const depScheduledTimestamp = new Date(`${depScheduledDate}T${depScheduledTime}:00`).getTime();

  // Scheduled Arrival info
  const arrScheduledDate = flight.arrivalDate || depScheduledDate;
  const arrScheduledTime = flight.arrivalTime || '00:00';
  const arrScheduledTimestamp = new Date(`${arrScheduledDate}T${arrScheduledTime}:00`).getTime();

  // Actual info from custom fields
  const actualDepVal = flight.customFields?.find(f => f.key.toLowerCase().includes('actual departure') || f.key.toLowerCase() === 'actual_departure')?.value;
  const actualArrVal = flight.customFields?.find(f => f.key.toLowerCase().includes('actual arrival') || f.key.toLowerCase() === 'actual_arrival')?.value;

  let depActualDate = depScheduledDate;
  let depActualTime = depScheduledTime;
  let depActualTimestamp = depScheduledTimestamp;

  let arrActualDate = arrScheduledDate;
  let arrActualTime = arrScheduledTime;
  let arrActualTimestamp = arrScheduledTimestamp;

  let hasActual = false;

  if (flight.actualDepartureTime) {
    depActualTime = flight.actualDepartureTime;
    depActualTimestamp = new Date(`${depScheduledDate}T${flight.actualDepartureTime}:00`).getTime();
    hasActual = true;
  } else if (actualDepVal) {
    const parsed = parseDateTimeStr(actualDepVal, depScheduledDate);
    if (parsed.time) {
      depActualDate = parsed.date;
      depActualTime = parsed.time;
      if (parsed.timestamp) depActualTimestamp = parsed.timestamp;
      hasActual = true;
    }
  }

  if (flight.actualArrivalTime) {
    arrActualTime = flight.actualArrivalTime;
    arrActualTimestamp = new Date(`${arrScheduledDate}T${flight.actualArrivalTime}:00`).getTime();
    hasActual = true;
  } else if (actualArrVal) {
    const parsed = parseDateTimeStr(actualArrVal, arrScheduledDate);
    if (parsed.time) {
      arrActualDate = parsed.date;
      arrActualTime = parsed.time;
      if (parsed.timestamp) arrActualTimestamp = parsed.timestamp;
      hasActual = true;
    }
  }

  if (isCanceled) {
    return {
      label: 'CANCELED' as const,
      bgClass: 'bg-red-950/40 text-rose-450 border border-red-900/40 hover:bg-red-900/30 font-black',
      textClass: 'text-red-650 dark:text-red-400',
      dotClass: 'bg-red-600',
      depScheduledDate,
      depScheduledTime,
      depActualDate: undefined,
      depActualTime: undefined,
      arrScheduledDate,
      arrScheduledTime,
      arrActualDate: undefined,
      arrActualTime: undefined,
      isDifferent: true
    };
  }

  if (!hasActual) {
    return {
      label: 'SCHEDULED' as const,
      bgClass: 'bg-zinc-150 text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700/50 hover:bg-zinc-200/50 dark:hover:bg-zinc-700/50',
      textClass: 'text-zinc-500 dark:text-zinc-400 font-extrabold',
      dotClass: 'bg-zinc-400 dark:bg-zinc-500',
      depScheduledDate,
      depScheduledTime,
      depActualDate,
      depActualTime,
      arrScheduledDate,
      arrScheduledTime,
      arrActualDate,
      arrActualTime,
      isDifferent: false
    };
  }

  // Compare departure or arrival delay.
  // Let's compute differences (actual - scheduled) in minutes.
  const depDiffMinutes = (depActualTimestamp - depScheduledTimestamp) / (1000 * 60);
  const arrDiffMinutes = (arrActualTimestamp - arrScheduledTimestamp) / (1000 * 60);

  const delayMinutes = arrDiffMinutes || depDiffMinutes;

  if (delayMinutes > 5) {
    return {
      label: 'LATE' as const,
      bgClass: 'bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20',
      textClass: 'text-red-600 dark:text-red-400',
      dotClass: 'bg-red-500',
      depScheduledDate,
      depScheduledTime,
      depActualDate,
      depActualTime,
      arrScheduledDate,
      arrScheduledTime,
      arrActualDate,
      arrActualTime,
      isDifferent: true
    };
  } else if (delayMinutes < -5) {
    return {
      label: 'EARLY' as const,
      bgClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-500 border border-amber-500/20 hover:bg-amber-500/20',
      textClass: 'text-amber-700 dark:text-amber-400',
      dotClass: 'bg-amber-500',
      depScheduledDate,
      depScheduledTime,
      depActualDate,
      depActualTime,
      arrScheduledDate,
      arrScheduledTime,
      arrActualDate,
      arrActualTime,
      isDifferent: true
    };
  } else {
    return {
      label: 'ON TIME' as const,
      bgClass: 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500/20',
      textClass: 'text-emerald-700 dark:text-emerald-400',
      dotClass: 'bg-emerald-500',
      depScheduledDate,
      depScheduledTime,
      depActualDate,
      depActualTime,
      arrScheduledDate,
      arrScheduledTime,
      arrActualDate,
      arrActualTime,
      isDifferent: true
    };
  }
}
