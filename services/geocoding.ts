import { COUNTRY_REGION_MAP } from './geoData';

const CACHE_KEY = 'wandergrid_geo_cache_v2';
const GEO_DB_NAME = 'wandergrid_geo_db';
const GEO_STORE_NAME = 'geo_entries';

let internalCache: Map<string, any> = new Map();
let isCacheLoaded = false;
let isIndexedDbLoaded = false;

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
    if (!isIndexedDbLoaded) {
        isIndexedDbLoaded = true;
        void hydrateCacheFromIndexedDb();
    }
};

const saveCache = () => {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(Array.from(internalCache.entries())));
    } catch (e) {}
    void persistCacheToIndexedDb();
};

const openGeoDb = (): Promise<IDBDatabase | null> => new Promise((resolve) => {
    if (!('indexedDB' in window)) {
        resolve(null);
        return;
    }
    const request = indexedDB.open(GEO_DB_NAME, 1);
    request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(GEO_STORE_NAME)) {
            db.createObjectStore(GEO_STORE_NAME, { keyPath: 'key' });
        }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
});

const hydrateCacheFromIndexedDb = async () => {
    const db = await openGeoDb();
    if (!db) return;
    await new Promise<void>((resolve) => {
        const tx = db.transaction(GEO_STORE_NAME, 'readonly');
        const store = tx.objectStore(GEO_STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => {
            request.result.forEach((entry: { key: string; value: any }) => {
                if (!internalCache.has(entry.key)) internalCache.set(entry.key, entry.value);
            });
            resolve();
        };
        request.onerror = () => resolve();
    });
    db.close();
};

const persistCacheToIndexedDb = async () => {
    const db = await openGeoDb();
    if (!db) return;
    await new Promise<void>((resolve) => {
        const tx = db.transaction(GEO_STORE_NAME, 'readwrite');
        const store = tx.objectStore(GEO_STORE_NAME);
        internalCache.forEach((value, key) => {
            store.put({ key, value });
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
    });
    db.close();
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

// Active search abort controllers to cancel stale queries
const activeSearchAborts = new Map<string, AbortController>();
const searchQueriesCache = new Map<string, string[]>();

export async function searchLocations(query: string): Promise<string[]> {
    if (!query) return [];
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2) return [];

    const lowerQuery = trimmedQuery.toLowerCase();
    
    // Check local memory cache first for instant sub-millisecond snapping
    if (searchQueriesCache.has(lowerQuery)) {
        return searchQueriesCache.get(lowerQuery)!;
    }

    const suggestionsSet = new Set<string>();

    // 1. Direct IATA airport code extraction & static airport name search (FAST & offline)
    const uppercaseQuery = trimmedQuery.toUpperCase();
    if (uppercaseQuery.length === 3 && STATIC_GEO_DATA[uppercaseQuery]) {
        const ap = STATIC_GEO_DATA[uppercaseQuery];
        suggestionsSet.add(`${uppercaseQuery} - ${ap.name}, ${ap.city}, ${ap.country}`);
    }

    Object.entries(STATIC_GEO_DATA).forEach(([key, ap]) => {
        if (
            key.toLowerCase().includes(lowerQuery) ||
            ap.name?.toLowerCase().includes(lowerQuery) ||
            ap.city?.toLowerCase().includes(lowerQuery) ||
            ap.country?.toLowerCase().includes(lowerQuery)
        ) {
            suggestionsSet.add(`${key} - ${ap.name}, ${ap.city}, ${ap.country}`);
        }
    });

    // 2. Offline-first local database query matching based on keywords or city name
    LOCAL_GEO_MAP.forEach(item => {
        const cityMatch = item.city.toLowerCase().includes(lowerQuery);
        const countryMatch = item.country.toLowerCase().includes(lowerQuery);
        const keywordMatch = item.keywords.some(kw => kw.includes(lowerQuery) || lowerQuery.includes(kw));

        if (cityMatch || countryMatch || keywordMatch) {
            suggestionsSet.add(`${item.city}, ${item.country}`);
        }
    });

    // 3. Match from existing geocoding cache entries
    try {
        internalCache.forEach((val, key) => {
            if (key.toLowerCase().includes(lowerQuery)) {
                if (val.city && val.country) {
                    suggestionsSet.add(`${val.city}, ${val.country}`);
                } else if (typeof val === 'string') {
                    suggestionsSet.add(val);
                } else if (val.displayName) {
                    suggestionsSet.add(val.displayName);
                }
            }
        });
    } catch (e) {}

    const localSuggestions = Array.from(suggestionsSet);

    // 4. Osm/Nominatim network query matching with abort logic
    let networkSuggestions: string[] = [];
    if (trimmedQuery.length >= 3) {
        try {
            // Cancel running requests for optimal network utilization
            if (activeSearchAborts.has('search')) {
                activeSearchAborts.get('search')?.abort();
            }
            const controller = new AbortController();
            activeSearchAborts.set('search', controller);

            // Timeout request after 1.5s
            const timerId = setTimeout(() => controller.abort(), 1500);

            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(trimmedQuery)}&limit=6`, {
                signal: controller.signal,
                headers: { 'Accept-Language': 'en' }
            });
            clearTimeout(timerId);

            if (res.ok) {
                const data = await res.json();
                networkSuggestions = data.map((item: any) => item.display_name);
            }
        } catch (e) {
            // Graceful fallback to offline/cached results
        }
    }

    const combined = new Set<string>();
    localSuggestions.forEach(s => combined.add(s));
    networkSuggestions.forEach(s => combined.add(s));

    const finalResult = Array.from(combined).slice(0, 8);
    searchQueriesCache.set(lowerQuery, finalResult);
    return finalResult;
}

export async function searchStations(query: string, type: 'train' | 'bus'): Promise<string[]> {
    return searchLocations(`${query} ${type === 'train' ? 'railway station' : 'bus station'}`);
}

export async function getCoordinates(location: string): Promise<{ lat: number; lng: number; tz?: string; city?: string; country?: string; countryCode?: string } | undefined> {
  if (!location) return undefined;
  loadCache();

  const cleanLocation = location.trim();

  // A. Quick IATA token parsing
  const iataMatch = cleanLocation.match(/^([A-Z]{3})\s*-\s*/);
  if (iataMatch) {
      const code = iataMatch[1];
      if (STATIC_GEO_DATA[code]) {
          const ap = STATIC_GEO_DATA[code];
          return {
              lat: parseFloat(ap.lat),
              lng: parseFloat(ap.lon || ap.lng),
              tz: ap.tz,
              city: ap.city,
              country: ap.country,
              countryCode: ap.iso
          };
      }
  }

  // B. Check exact match in active cash
  const uppercaseLoc = cleanLocation.toUpperCase();
  const cached = internalCache.get(cleanLocation) || internalCache.get(uppercaseLoc);
  if (cached?.lat) {
      return { 
          lat: parseFloat(cached.lat), 
          lng: parseFloat(cached.lon || cached.lng), 
          tz: cached.tz,
          city: cached.city,
          country: cached.country,
          countryCode: cached.countryCode || cached.iso
      };
  }

  // C. Direct airport lookup
  if (STATIC_GEO_DATA[uppercaseLoc]) {
      const ap = STATIC_GEO_DATA[uppercaseLoc];
      return {
          lat: parseFloat(ap.lat),
          lng: parseFloat(ap.lon || ap.lng),
          tz: ap.tz,
          city: ap.city,
          country: ap.country,
          countryCode: ap.iso
      };
  }

  // D. Quick local keyword map lookup
  const lowerLoc = cleanLocation.toLowerCase();
  const localMatch = LOCAL_GEO_MAP.find(item => item.city.toLowerCase() === lowerLoc || item.keywords.includes(lowerLoc));
  if (localMatch) {
      const staticMatch = Object.values(STATIC_GEO_DATA).find(ap => ap.city?.toLowerCase() === localMatch.city.toLowerCase());
      if (staticMatch) {
          return {
              lat: parseFloat(staticMatch.lat),
              lng: parseFloat(staticMatch.lon || staticMatch.lng),
              tz: staticMatch.tz,
              city: localMatch.city,
              country: localMatch.country,
              countryCode: localMatch.countryCode
          };
      }
  }

  // E. Live network query
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanLocation)}&limit=1`, {
        headers: { 'Accept-Language': 'en' }
    });
    if (!res.ok) return undefined;
    const data = await res.json();
    if (data.length > 0) {
      const lat = parseFloat(data[0].lat), lng = parseFloat(data[0].lon);
      const entry = { lat, lng, lon: lng, tz: 'UTC' };
      internalCache.set(cleanLocation, entry);
      saveCache();
      return { ...entry, lat, lng };
    }
  } catch (e) {}
  return undefined;
}

export const LOCAL_GEO_MAP: Array<{ keywords: string[]; city: string; country: string; countryCode: string }> = [
    { keywords: ['france', 'paris', 'nice', 'lyon', 'cdg', 'marseille', 'champs-elysees', 'french'], city: 'Paris', country: 'France', countryCode: 'FR' },
    { keywords: ['united kingdom', 'uk', 'gb', 'london', 'lhr', 'heathrow', 'edinburgh', 'manchester', 'belfast', 'scotland', 'england', 'british'], city: 'London', country: 'United Kingdom', countryCode: 'GB' },
    { keywords: ['united states', 'usa', 'us', 'new york', 'jfk', 'california', 'los angeles', 'san francisco', 'miami', 'chicago', 'hawaii', 'vegas', 'american'], city: 'New York', country: 'United States', countryCode: 'US' },
    { keywords: ['japan', 'tokyo', 'kyoto', 'osaka', 'hnd', 'narita', 'shibuya', 'japanese'], city: 'Tokyo', country: 'Japan', countryCode: 'JP' },
    { keywords: ['united arab emirates', 'uae', 'dubai', 'dxb', 'abu dhabi', 'emirati'], city: 'Dubai', country: 'United Arab Emirates', countryCode: 'AE' },
    { keywords: ['italy', 'rome', 'milan', 'venice', 'florence', 'naples', 'fco', 'colosseum', 'italian'], city: 'Rome', country: 'Italy', countryCode: 'IT' },
    { keywords: ['spain', 'madrid', 'barcelona', 'seville', 'ibiza', 'bcn', 'mallorca', 'spanish'], city: 'Barcelona', country: 'Spain', countryCode: 'ES' },
    { keywords: ['germany', 'berlin', 'munich', 'frankfurt', 'fra', 'hamburg', 'cologne', 'german'], city: 'Berlin', country: 'Germany', countryCode: 'DE' },
    { keywords: ['netherlands', 'amsterdam', 'schiphol', 'ams', 'rotterdam', 'dutch'], city: 'Amsterdam', country: 'Netherlands', countryCode: 'NL' },
    { keywords: ['belgium', 'brussels', 'bruges', 'antwerp', 'belgian'], city: 'Brussels', country: 'Belgium', countryCode: 'BE' },
    { keywords: ['singapore', 'changi', 'sin'], city: 'Singapore', country: 'Singapore', countryCode: 'SG' },
    { keywords: ['indonesia', 'bali', 'denpasar', 'jakarta', 'ubud', 'indonesian'], city: 'Denpasar', country: 'Indonesia', countryCode: 'ID' },
    { keywords: ['australia', 'sydney', 'melbourne', 'syd', 'brisbane', 'australian'], city: 'Sydney', country: 'Australia', countryCode: 'AU' },
    { keywords: ['greece', 'athens', 'santorini', 'mykonos', 'greek'], city: 'Athens', country: 'Greece', countryCode: 'GR' },
    { keywords: ['switzerland', 'zurich', 'geneva', 'basel', 'swiss'], city: 'Zurich', country: 'Switzerland', countryCode: 'CH' },
    { keywords: ['canada', 'toronto', 'vancouver', 'montreal', 'ottawa', 'canadian'], city: 'Toronto', country: 'Canada', countryCode: 'CA' },
    { keywords: ['thailand', 'bangkok', 'phuket', 'chiang mai', 'thai'], city: 'Bangkok', country: 'Thailand', countryCode: 'TH' },
    { keywords: ['china', 'beijing', 'shanghai', 'shenzhen', 'chinese'], city: 'Beijing', country: 'China', countryCode: 'CN' },
    { keywords: ['hong kong', 'hkg'], city: 'Hong Kong', country: 'Hong Kong', countryCode: 'HK' },
    { keywords: ['south korea', 'seoul', 'icn', 'busan', 'korean'], city: 'Seoul', country: 'South Korea', countryCode: 'KR' },
    { keywords: ['austria', 'vienna', 'salzburg', 'austrian'], city: 'Vienna', country: 'Austria', countryCode: 'AT' },
    { keywords: ['portugal', 'lisbon', 'porto', 'algarve', 'portuguese'], city: 'Lisbon', country: 'Portugal', countryCode: 'PT' },
    { keywords: ['turkey', 'istanbul', 'ankara', 'antalya', 'turkish'], city: 'Istanbul', country: 'Turkey', countryCode: 'TR' },
    { keywords: ['egypt', 'cairo', 'giza', 'luxor', 'egyptian'], city: 'Cairo', country: 'Egypt', countryCode: 'EG' },
    { keywords: ['brazil', 'rio', 'saulo', 'sao paulo', 'brazilian'], city: 'Rio de Janeiro', country: 'Brazil', countryCode: 'BR' },
];

export async function resolvePlaceName(query: string): Promise<{ city: string, country: string, countryCode?: string, displayName: string } | null> {
    if (!query) return null;
    loadCache();
    
    const cleanQuery = query.trim();

    // 1. Check IATA prefixes
    const iataMatch = cleanQuery.match(/^([A-Z]{3})\s*-\s*/);
    if (iataMatch) {
        const code = iataMatch[1];
        if (STATIC_GEO_DATA[code]) {
            const ap = STATIC_GEO_DATA[code];
            return {
                city: ap.city,
                country: ap.country,
                countryCode: ap.iso,
                displayName: cleanQuery
            };
        }
    }

    const uppercaseQuery = cleanQuery.toUpperCase();

    // 2. Check exact cache match
    const cached = internalCache.get(cleanQuery) || internalCache.get(uppercaseQuery);
    if (cached?.city) return { city: cached.city, country: cached.country, countryCode: cached.countryCode || cached.iso, displayName: cached.name || cleanQuery };

    // Direct match against airports
    if (STATIC_GEO_DATA[uppercaseQuery]) {
        const ap = STATIC_GEO_DATA[uppercaseQuery];
        return {
            city: ap.city,
            country: ap.country,
            countryCode: ap.iso,
            displayName: `${uppercaseQuery} - ${ap.name}, ${ap.city}`
        };
    }

    // 3. Perform localized fallback lookup first (highly responsive!)
    const norm = cleanQuery.toLowerCase();
    for (const item of LOCAL_GEO_MAP) {
        if (item.keywords.some(kw => norm.includes(kw) || kw.includes(norm))) {
            const obj = { city: item.city, country: item.country, countryCode: item.countryCode, displayName: cleanQuery };
            internalCache.set(cleanQuery, obj);
            saveCache();
            return obj;
        }
    }

    // 4. Perform network search matching via Nominatim
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanQuery)}&addressdetails=1&limit=1`, {
            headers: { 'Accept-Language': 'en' }
        });
        if (res.ok) {
            const data = await res.json();
            if (data.length > 0) {
                const r = data[0], a = r.address || {};
                const city = a.city || a.town || a.village || cleanQuery, country = a.country || '', code = a.country_code?.toUpperCase() || '';
                const obj = { city, country, countryCode: code, displayName: r.display_name };
                internalCache.set(cleanQuery, obj);
                saveCache();
                return obj;
            }
        }
    } catch (e) {}

    // 5. Last-ditch: if everything failed
    if (uppercaseQuery.length === 2 && COUNTRY_REGION_MAP[uppercaseQuery]) {
        return { city: cleanQuery, country: uppercaseQuery, countryCode: uppercaseQuery, displayName: cleanQuery };
    }

    return { city: cleanQuery, country: 'Unknown', displayName: cleanQuery };
}

export const getRegion = (code: string) => COUNTRY_REGION_MAP[code] || 'Unknown';
