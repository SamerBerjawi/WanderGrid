const CACHE_KEY = 'wandergrid_geo_cache_v2';

let internalCache: Map<string, any> = new Map();
let isCacheLoaded = false;

const loadCache = () => {
    if (isCacheLoaded) return;
    try {
        const stored = localStorage.getItem(CACHE_KEY);
        if (stored) internalCache = new Map(JSON.parse(stored));
    } catch (e) {}
    
    Object.keys(STATIC_GEO_DATA).forEach(key => {
        if (!internalCache.has(key)) internalCache.set(key, STATIC_GEO_DATA[key]);
    });
    isCacheLoaded = true;
};

const saveCache = () => {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(Array.from(internalCache.entries())));
    } catch (e) {}
};

const STATIC_GEO_DATA: Record<string, any> = {
    // Top Airports
    "AMS": { "lat": "52.3086", "lon": "4.7639", "name": "Schiphol", "city": "Amsterdam", "country": "Netherlands", "tz": "Europe/Amsterdam", "iso": "NL" },
    "LHR": { "lat": "51.4706", "lon": "-0.4619", "name": "Heathrow", "city": "London", "country": "United Kingdom", "tz": "Europe/London", "iso": "GB" },
    "JFK": { "lat": "40.6398", "lon": "-73.7789", "name": "John F Kennedy Intl", "city": "New York", "country": "United States", "tz": "America/New_York", "iso": "US" },
    "DXB": { "lat": "25.2528", "lon": "55.3644", "name": "Dubai Intl", "city": "Dubai", "country": "United Arab Emirates", "tz": "Asia/Dubai", "iso": "AE" },
    "CDG": { "lat": "49.0097", "lon": "2.5478", "name": "Charles De Gaulle", "city": "Paris", "country": "France", "tz": "Europe/Paris", "iso": "FR" },
    "FRA": { "lat": "50.0333", "lon": "8.5706", "name": "Frankfurt am Main", "city": "Frankfurt", "country": "Germany", "tz": "Europe/Berlin", "iso": "DE" },
    "SIN": { "lat": "1.3502", "lon": "103.994", "name": "Changi Intl", "city": "Singapore", "country": "Singapore", "tz": "Asia/Singapore", "iso": "SG" },
    "HKG": { "lat": "22.3089", "lon": "113.915", "name": "Hong Kong Intl", "city": "Hong Kong", "country": "Hong Kong", "tz": "Asia/Hong_Kong", "iso": "HK" },
    "HND": { "lat": "35.5523", "lon": "139.78", "name": "Haneda", "city": "Tokyo", "country": "Japan", "tz": "Asia/Tokyo", "iso": "JP" },
    "SYD": { "lat": "-33.9461", "lon": "151.177", "name": "Kingsford Smith", "city": "Sydney", "country": "Australia", "tz": "Australia/Sydney", "iso": "AU" },
    // Popular Cities
    "Paris": { "lat": "48.8566", "lon": "2.3522", "city": "Paris", "country": "France", "countryCode": "FR" },
    "London": { "lat": "51.5074", "lon": "-0.1278", "city": "London", "country": "United Kingdom", "countryCode": "GB" },
    "New York": { "lat": "40.7128", "lon": "-74.0060", "city": "New York", "country": "United States", "countryCode": "US" },
    "Tokyo": { "lat": "35.6762", "lon": "139.6503", "city": "Tokyo", "country": "Japan", "countryCode": "JP" },
    "Dubai": { "lat": "25.2048", "lon": "55.2708", "city": "Dubai", "country": "United Arab Emirates", "countryCode": "AE" },
    "Rome": { "lat": "41.9028", "lon": "12.4964", "city": "Rome", "country": "Italy", "countryCode": "IT" },
    "Barcelona": { "lat": "41.3851", "lon": "2.1734", "city": "Barcelona", "country": "Spain", "countryCode": "ES" },
    "Berlin": { "lat": "52.5200", "lon": "13.4050", "city": "Berlin", "country": "Germany", "countryCode": "DE" },
    "Amsterdam": { "lat": "52.3676", "lon": "4.9041", "city": "Amsterdam", "country": "Netherlands", "countryCode": "NL" },
    "Brussels": { "lat": "50.8503", "lon": "4.3517", "city": "Brussels", "country": "Belgium", "countryCode": "BE" },
    "Singapore": { "lat": "1.3521", "lon": "103.8198", "city": "Singapore", "country": "Singapore", "countryCode": "SG" },
    "Bali": { "lat": "-8.4095", "lon": "115.1889", "city": "Denpasar", "country": "Indonesia", "countryCode": "ID" },
    "Sydney": { "lat": "-33.8688", "lon": "151.2093", "city": "Sydney", "country": "Australia", "countryCode": "AU" },
};

loadCache();

function toRad(value: number) { return (value * Math.PI) / 180; }

export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function getCachedTimeZone(iata: string): string | undefined {
    const fromCache = internalCache.get(iata.toUpperCase());
    return fromCache?.tz;
}

function getWallTimeAsUtc(dateStr: string, timeStr: string): number {
    const [y, m, d] = dateStr.split('-').map(Number);
    const [h, min] = timeStr.split(':').map(Number);
    return Date.UTC(y, m - 1, d, h, min, 0);
}

export function calculateDurationMinutes(originIata: string, destIata: string, depDateStr: string, depTimeStr: string, arrDateStr: string, arrTimeStr: string): number {
    const originTz = getCachedTimeZone(originIata) || 'UTC';
    const destTz = getCachedTimeZone(destIata) || 'UTC';
    const depWallUtc = getWallTimeAsUtc(depDateStr, depTimeStr);
    const arrWallUtc = getWallTimeAsUtc(arrDateStr, arrTimeStr);
    /* Corrected typo: iNaN to isNaN */
    if (isNaN(depWallUtc) || isNaN(arrWallUtc)) return 0;
    const getOff = (tz: string, dt: number) => {
        try { return new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date(dt)).find(p => p.type === 'timeZoneName')?.value.replace(/GMT|UTC/, '') || ''; } catch(e) { return ''; }
    };
    const parseOff = (off: string) => {
        if (!off) return 0;
        const sign = off.includes('-') ? -1 : 1;
        const [h, m] = off.replace('+', '').replace('-', '').split(':').map(Number);
        return sign * (h * 60 + (m || 0));
    };
    const duration = ((arrWallUtc - depWallUtc) / 60000) - (parseOff(getOff(destTz, arrWallUtc)) - parseOff(getOff(originTz, depWallUtc)));
    return Math.max(0, Math.round(duration));
}

// Added calculateArrivalTime to fix missing export error in FlightConfigurator.tsx
/**
 * Calculates local arrival time given local departure time and duration.
 */
export function calculateArrivalTime(originIata: string, destIata: string, depDateStr: string, depTimeStr: string, durationMinutes: number): { date: string, time: string } {
    const originTz = getCachedTimeZone(originIata) || 'UTC';
    const destTz = getCachedTimeZone(destIata) || 'UTC';
    const depWallUtc = getWallTimeAsUtc(depDateStr, depTimeStr);
    if (isNaN(depWallUtc)) return { date: depDateStr, time: depTimeStr };

    const getOff = (tz: string, dt: number) => {
        try { 
            return new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' })
                .formatToParts(new Date(dt))
                .find(p => p.type === 'timeZoneName')?.value.replace(/GMT|UTC/, '') || ''; 
        } catch(e) { return ''; }
    };
    const parseOff = (off: string) => {
        if (!off) return 0;
        const sign = off.includes('-') ? -1 : 1;
        const [h, m] = off.replace('+', '').replace('-', '').split(':').map(Number);
        return sign * (h * 60 + (m || 0));
    };

    const depOff = parseOff(getOff(originTz, depWallUtc));
    const depUtc = depWallUtc - (depOff * 60000);
    const arrUtc = depUtc + (durationMinutes * 60000);
    const arrOff = parseOff(getOff(destTz, arrUtc));
    const arrWall = arrUtc + (arrOff * 60000);

    const d = new Date(arrWall);
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    const hours = String(d.getUTCHours()).padStart(2, '0');
    const mins = String(d.getUTCMinutes()).padStart(2, '0');

    return {
        date: `${year}-${month}-${day}`,
        time: `${hours}:${mins}`
    };
}

export async function searchLocations(query: string): Promise<string[]> {
    if (!query || query.length < 3) return [];
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
        if (!res.ok) return [];
        const data = await res.json();
        return data.map((item: any) => item.display_name);
    } catch (e) { return []; }
}

export async function searchStations(query: string, type: 'train' | 'bus'): Promise<string[]> {
    return searchLocations(`${query} ${type === 'train' ? 'railway station' : 'bus station'}`);
}

export async function getCoordinates(location: string): Promise<{ lat: number; lng: number; tz?: string } | undefined> {
  if (!location) return undefined;
  loadCache();
  const cached = internalCache.get(location) || internalCache.get(location.toUpperCase());
  if (cached?.lat) return { lat: parseFloat(cached.lat), lng: parseFloat(cached.lon || cached.lng), tz: cached.tz };

  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&limit=1`);
    if (!res.ok) return undefined;
    const data = await res.json();
    if (data.length > 0) {
      const lat = parseFloat(data[0].lat), lng = parseFloat(data[0].lon);
      const entry = { lat, lng, lon: lng, tz: 'UTC' };
      internalCache.set(location, entry);
      saveCache();
      return entry;
    }
  } catch (e) {}
  return undefined;
}

export async function resolvePlaceName(query: string): Promise<{ city: string, country: string, countryCode?: string, displayName: string } | null> {
    if (!query) return null;
    loadCache();
    const cached = internalCache.get(query) || internalCache.get(query.toUpperCase());
    if (cached?.city) return { city: cached.city, country: cached.country, countryCode: countryCode || cached.iso, displayName: cached.name || query };

    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=1`);
        if (res.ok) {
            const data = await res.json();
            if (data.length > 0) {
                const r = data[0], a = r.address || {};
                const city = a.city || a.town || a.village || query, country = a.country || '', code = a.country_code?.toUpperCase() || '';
                const obj = { city, country, countryCode: code, displayName: r.display_name };
                internalCache.set(query, obj);
                saveCache();
                return obj;
            }
        }
    } catch (e) {}
    return { city: query, country: 'Unknown', displayName: query };
}

export const getRegion = (code: string) => COUNTRY_REGION_MAP[code] || 'Unknown';

const COUNTRY_REGION_MAP: Record<string, string> = {
    'US': 'North America', 'CA': 'North America', 'MX': 'North America', 'CR': 'Central America', 'CU': 'Central America', 'JM': 'Central America', 'BS': 'Central America', 'DO': 'Central America', 'PA': 'Central America', 'GT': 'Central America', 'BZ': 'Central America', 'HN': 'Central America', 'BR': 'South America', 'AR': 'South America', 'CL': 'South America', 'CO': 'South America', 'PE': 'South America', 'EC': 'South America', 'UY': 'South America', 'PY': 'South America', 'BO': 'South America', 'NO': 'Northern Europe', 'SE': 'Northern Europe', 'DK': 'Northern Europe', 'FI': 'Northern Europe', 'IS': 'Northern Europe', 'EE': 'Northern Europe', 'LV': 'Northern Europe', 'LT': 'Northern Europe', 'GB': 'Western Europe', 'FR': 'Western Europe', 'DE': 'Western Europe', 'BE': 'Western Europe', 'NL': 'Western Europe', 'CH': 'Western Europe', 'AT': 'Western Europe', 'IE': 'Western Europe', 'LU': 'Western Europe', 'IT': 'Southern Europe', 'ES': 'Southern Europe', 'PT': 'Southern Europe', 'GR': 'Southern Europe', 'HR': 'Southern Europe', 'SI': 'Southern Europe', 'MT': 'Southern Europe', 'CY': 'Southern Europe', 'PL': 'Eastern Europe', 'CZ': 'Eastern Europe', 'HU': 'Eastern Europe', 'RU': 'Eastern Europe', 'RO': 'Eastern Europe', 'BG': 'Eastern Europe', 'SK': 'Eastern Europe', 'UA': 'Eastern Europe', 'RS': 'Eastern Europe', 'JP': 'East Asia', 'CN': 'East Asia', 'KR': 'East Asia', 'TW': 'East Asia', 'HK': 'East Asia', 'MO': 'East Asia', 'TH': 'Southeast Asia', 'VN': 'Southeast Asia', 'ID': 'Southeast Asia', 'MY': 'Southeast Asia', 'SG': 'Southeast Asia', 'PH': 'Southeast Asia', 'KH': 'Southeast Asia', 'LA': 'Southeast Asia', 'MM': 'Southeast Asia', 'IN': 'South & West Asia', 'MV': 'South & West Asia', 'LK': 'South & West Asia', 'NP': 'South & West Asia', 'AE': 'South & West Asia', 'SA': 'South & West Asia', 'IL': 'South & West Asia', 'QA': 'South & West Asia', 'TR': 'South & West Asia', 'JO': 'South & West Asia', 'LB': 'South & West Asia', 'EG': 'North Africa', 'MA': 'North Africa', 'TN': 'North Africa', 'DZ': 'North Africa', 'ZA': 'Sub-Saharan Africa', 'KE': 'Sub-Saharan Africa', 'TZ': 'Sub-Saharan Africa', 'GH': 'Sub-Saharan Africa', 'NG': 'Sub-Saharan Africa', 'MU': 'Sub-Saharan Africa', 'SC': 'Sub-Saharan Africa', 'ZW': 'Sub-Saharan Africa', 'NA': 'Sub-Saharan Africa', 'AU': 'Oceania', 'NZ': 'Oceania', 'FJ': 'Oceania', 'PF': 'Oceania', 'PG': 'Oceania'
};