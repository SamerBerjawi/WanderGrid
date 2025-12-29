
const CACHE_KEY = 'wandergrid_geo_cache_v2';

// 1. In-Memory Cache (Syncs with LocalStorage)
let internalCache: Map<string, any> = new Map();
let isCacheLoaded = false;

// Initialize Cache from Storage
const loadCache = () => {
    if (isCacheLoaded) return;
    try {
        const stored = localStorage.getItem(CACHE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            // Convert array back to Map
            internalCache = new Map(parsed);
        }
    } catch (e) {
        console.warn("Failed to load geo cache", e);
    }
    
    // Merge Fallback Airports into Cache if missing
    Object.keys(FALLBACK_AIRPORTS).forEach(key => {
        if (!internalCache.has(key)) {
            internalCache.set(key, FALLBACK_AIRPORTS[key]);
        }
    });
    
    isCacheLoaded = true;
};

// Save Cache to Storage (Debounced could be better, but direct is safer for data integrity here)
const saveCache = () => {
    try {
        const entryArray = Array.from(internalCache.entries());
        localStorage.setItem(CACHE_KEY, JSON.stringify(entryArray));
    } catch (e) {
        console.warn("Failed to save geo cache (quota exceeded?)", e);
    }
};

const FALLBACK_AIRPORTS: Record<string, any> = {
    "AMS": { "lat": "52.3086", "lon": "4.7639", "name": "Schiphol", "city": "Amsterdam", "country": "Netherlands", "tz": "Europe/Amsterdam", "iso": "NL" },
    "LHR": { "lat": "51.4706", "lon": "-0.4619", "name": "Heathrow", "city": "London", "country": "United Kingdom", "tz": "Europe/London", "iso": "GB" },
    "JFK": { "lat": "40.6398", "lon": "-73.7789", "name": "John F Kennedy Intl", "city": "New York", "country": "United States", "tz": "America/New_York", "iso": "US" },
    "DXB": { "lat": "25.2528", "lon": "55.3644", "name": "Dubai Intl", "city": "Dubai", "country": "United Arab Emirates", "tz": "Asia/Dubai", "iso": "AE" },
    "CDG": { "lat": "49.0097", "lon": "2.5478", "name": "Charles De Gaulle", "city": "Paris", "country": "France", "tz": "Europe/Paris", "iso": "FR" },
    "SFO": { "lat": "37.6189", "lon": "-122.375", "name": "San Francisco Intl", "city": "San Francisco", "country": "United States", "tz": "America/Los_Angeles", "iso": "US" },
    "SIN": { "lat": "1.3502", "lon": "103.994", "name": "Changi Intl", "city": "Singapore", "country": "Singapore", "tz": "Asia/Singapore", "iso": "SG" },
    "HKG": { "lat": "22.3089", "lon": "113.915", "name": "Hong Kong Intl", "city": "Hong Kong", "country": "Hong Kong", "tz": "Asia/Hong_Kong", "iso": "HK" },
    "HND": { "lat": "35.5523", "lon": "139.78", "name": "Haneda", "city": "Tokyo", "country": "Japan", "tz": "Asia/Tokyo", "iso": "JP" },
    "SYD": { "lat": "-33.9461", "lon": "151.177", "name": "Kingsford Smith", "city": "Sydney", "country": "Australia", "tz": "Australia/Sydney", "iso": "AU" },
    "LAX": { "lat": "33.9425", "lon": "-118.408", "name": "Los Angeles Intl", "city": "Los Angeles", "country": "United States", "tz": "America/Los_Angeles", "iso": "US" },
    "ORD": { "lat": "41.9742", "lon": "-87.9073", "name": "O'Hare Intl", "city": "Chicago", "country": "United States", "tz": "America/Chicago", "iso": "US" },
    "FRA": { "lat": "50.0333", "lon": "8.5706", "name": "Frankfurt am Main", "city": "Frankfurt", "country": "Germany", "tz": "Europe/Berlin", "iso": "DE" },
    "MAD": { "lat": "40.4719", "lon": "-3.5626", "name": "Adolfo Suárez Madrid–Barajas", "city": "Madrid", "country": "Spain", "tz": "Europe/Madrid", "iso": "ES" },
    "BCN": { "lat": "41.2971", "lon": "2.0785", "name": "Barcelona–El Prat", "city": "Barcelona", "country": "Spain", "tz": "Europe/Madrid", "iso": "ES" },
    "MUC": { "lat": "48.3538", "lon": "11.7861", "name": "Munich", "city": "Munich", "country": "Germany", "tz": "Europe/Berlin", "iso": "DE" },
    "ZRH": { "lat": "47.4647", "lon": "8.5492", "name": "Zurich", "city": "Zurich", "country": "Switzerland", "tz": "Europe/Zurich", "iso": "CH" },
    "YYZ": { "lat": "43.6772", "lon": "-79.6306", "name": "Pearson Intl", "city": "Toronto", "country": "Canada", "tz": "America/Toronto", "iso": "CA" },
    "ICN": { "lat": "37.4692", "lon": "126.451", "name": "Incheon Intl", "city": "Seoul", "country": "South Korea", "tz": "Asia/Seoul", "iso": "KR" },
    "PEK": { "lat": "40.0801", "lon": "116.585", "name": "Capital Intl", "city": "Beijing", "country": "China", "tz": "Asia/Shanghai", "iso": "CN" }
};

// Initialize
loadCache();

function toRad(value: number) {
    return (value * Math.PI) / 180;
}

export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
}

// --- Time Zone Logic ---

export function getCachedTimeZone(iata: string): string | undefined {
    // Check internal cache first
    const fromCache = internalCache.get(iata.toUpperCase()) || internalCache.get(iata);
    if (fromCache && fromCache.tz) return fromCache.tz;
    return undefined;
}

// Helper: Get UTC offset in minutes
function getOffsetMinutes(timeZone: string, date: Date): number {
    try {
        const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' }).formatToParts(date);
        const offsetPart = parts.find(p => p.type === 'timeZoneName');
        if (!offsetPart) return 0;
        const val = offsetPart.value.replace(/^(GMT|UTC)/, '');
        if (!val) return 0;
        const sign = val.includes('-') ? -1 : 1;
        const [h, m] = val.replace('+', '').replace('-', '').split(':').map(Number);
        return sign * ((isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m));
    } catch (e) { return 0; }
}

function getWallTimeAsUtc(dateStr: string, timeStr: string): number {
    const [y, m, d] = dateStr.split('-').map(Number);
    const [h, min] = timeStr.split(':').map(Number);
    return Date.UTC(y, m - 1, d, h, min, 0);
}

export function calculateDurationMinutes(originIata: string, destIata: string, depDateStr: string, depTimeStr: string, arrDateStr: string, arrTimeStr: string): number {
    if (!originIata || !destIata || !depDateStr || !depTimeStr || !arrDateStr || !arrTimeStr) return 0;
    const originTz = getCachedTimeZone(originIata) || 'UTC';
    const destTz = getCachedTimeZone(destIata) || 'UTC';
    const depWallUtc = getWallTimeAsUtc(depDateStr, depTimeStr);
    const arrWallUtc = getWallTimeAsUtc(arrDateStr, arrTimeStr);
    if (isNaN(depWallUtc) || isNaN(arrWallUtc)) return 0;
    const depOffset = getOffsetMinutes(originTz, new Date(depWallUtc));
    const arrOffset = getOffsetMinutes(destTz, new Date(arrWallUtc));
    const wallDiffMinutes = (arrWallUtc - depWallUtc) / 60000;
    const offsetDiffMinutes = arrOffset - depOffset;
    let duration = wallDiffMinutes - offsetDiffMinutes;
    return Math.max(0, Math.round(duration));
}

export function calculateArrivalTime(originIata: string, destIata: string, depDateStr: string, depTimeStr: string, durationMinutes: number): { date: string, time: string } {
    const originTz = getCachedTimeZone(originIata) || 'UTC';
    const destTz = getCachedTimeZone(destIata) || 'UTC';
    const depWallUtc = getWallTimeAsUtc(depDateStr, depTimeStr);
    if (isNaN(depWallUtc)) return { date: '', time: '' };
    const depOffset = getOffsetMinutes(originTz, new Date(depWallUtc));
    const depRealUtc = depWallUtc - (depOffset * 60000);
    const arrRealUtc = depRealUtc + (durationMinutes * 60000);
    const arrDateObj = new Date(arrRealUtc);
    try {
        const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: destTz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
        const parts = formatter.formatToParts(arrDateObj);
        const getPart = (type: string) => parts.find(p => p.type === type)?.value || '';
        return { date: `${getPart('year')}-${getPart('month')}-${getPart('day')}`, time: `${getPart('hour')}:${getPart('minute')}` };
    } catch (e) { return { date: '', time: '' }; }
}

// --- Search & Resolve with Caching ---

export async function searchLocations(query: string): Promise<string[]> {
    if (!query || query.length < 3) return [];
    try {
        // No caching for autocomplete search results as they are transient UI state
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=5`;
        const response = await fetch(url); 
        if (!response.ok) return [];
        const data = await response.json();
        return data.map((item: any) => item.display_name || item.name);
    } catch (e) { return []; }
}

export async function searchStations(query: string, type: 'train' | 'bus'): Promise<string[]> {
    if (!query || query.length < 3) return [];
    try {
        const suffix = type === 'train' ? 'railway station' : 'bus station';
        const q = `${query} ${suffix}`;
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&addressdetails=1&limit=8`;
        const response = await fetch(url);
        if (!response.ok) return [];
        const data = await response.json();
        return data.map((item: any) => item.display_name || item.name);
    } catch (e) { return []; }
}

// Optimized Get Coordinates - READS FROM CACHE & FETCHES TZ
export async function getCoordinates(location: string): Promise<{ lat: number; lng: number; tz?: string } | undefined> {
  if (!location) return undefined;
  loadCache(); // Ensure loaded

  // 1. Check Cache
  if (internalCache.has(location)) {
      const c = internalCache.get(location);
      // If valid coords but missing TZ, we might want to refresh, but for now rely on cache speed.
      // If needed, we can do a background refresh.
      if (c.lat && c.lng) {
          if (!c.tz) {
              // Trigger TZ fetch only if missing
              fetchTzForCoords(parseFloat(c.lat), parseFloat(c.lon || c.lng)).then(tz => {
                  if (tz) {
                      c.tz = tz;
                      internalCache.set(location, c);
                      if (location.length === 3) internalCache.set(location.toUpperCase(), c);
                      saveCache();
                  }
              });
          }
          return { lat: parseFloat(c.lat), lng: parseFloat(c.lon || c.lng), tz: c.tz };
      }
  }

  // 2. Check IATA Cache
  if (location.length === 3 && /^[A-Za-z]{3}$/.test(location)) {
      const code = location.toUpperCase();
      if (internalCache.has(code)) {
          const c = internalCache.get(code);
          if (c.lat && c.lng) {
             return { lat: parseFloat(c.lat), lng: parseFloat(c.lon || c.lng), tz: c.tz };
          }
      }
  }

  // 3. Network Fetch
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&limit=1`;
    const response = await fetch(url);
    if (!response.ok) return undefined;
    const data = await response.json();

    if (Array.isArray(data) && data.length > 0) {
      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);
      
      const tz = await fetchTzForCoords(lat, lng);

      const res = {
        lat,
        lng,
        lon: lng, // Store both keys for compatibility
        tz: tz || 'UTC'
      };
      
      // Save to Cache
      internalCache.set(location, res);
      if (location.length === 3 && /^[A-Za-z]{3}$/.test(location)) {
          internalCache.set(location.toUpperCase(), res);
      }
      saveCache();
      
      return res;
    }
    return undefined;
  } catch (e) { return undefined; }
}

async function fetchTzForCoords(lat: number, lng: number): Promise<string | undefined> {
    try {
        const tzRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true&timezone=auto`);
        if (tzRes.ok) {
            const tzData = await tzRes.json();
            if (tzData.timezone) return tzData.timezone;
        }
    } catch (e) {
        console.warn("Timezone fetch failed", e);
    }
    return undefined;
}

// Optimized Resolve Place - READS FROM CACHE
export async function resolvePlaceName(query: string): Promise<{ city: string, country: string, countryCode?: string, displayName: string } | null> {
    if (!query) return null;
    loadCache();

    // 1. Check Cache (Exact string match)
    if (internalCache.has(query)) {
        const cached = internalCache.get(query);
        // If the cache has full detail structure (custom saved)
        if (cached.city && cached.country) {
            return {
                city: cached.city,
                country: cached.country,
                countryCode: cached.iso || cached.countryCode,
                displayName: cached.name || query
            };
        }
    }

    // 2. IATA Lookup
    if (query.length === 3 && /^[A-Za-z]{3}$/.test(query)) {
        const code = query.toUpperCase();
        if (internalCache.has(code)) {
            const a = internalCache.get(code);
            return { 
                city: a.city, 
                country: a.country, 
                countryCode: a.iso || undefined, 
                displayName: `${a.city}, ${a.country}` 
            };
        }
    }
    
    // 3. Network Fetch
    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=1`;
        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                const result = data[0];
                const addr = result.address || {};
                const city = addr.city || addr.town || addr.village || addr.municipality || addr.state || query;
                const country = addr.country || '';
                const countryCode = addr.country_code ? addr.country_code.toUpperCase() : '';
                
                const finalObj = { 
                    city, 
                    country, 
                    countryCode, 
                    displayName: result.display_name,
                    // Store coords too while we are at it
                    lat: result.lat,
                    lon: result.lon
                };

                // Cache it
                internalCache.set(query, finalObj);
                saveCache();

                return finalObj;
            }
        }
    } catch (e) { console.warn("Resolve failed", e); }

    // 4. Fallback: Parse string manually
    if (query.includes(',')) {
        const parts = query.split(',').map(s => s.trim());
        if (parts.length >= 2) {
            const country = parts[parts.length - 1];
            const city = parts[parts.length - 2];
            if (!/^\d+$/.test(country) && !/^\d+$/.test(city)) {
                 return { city, country, displayName: `${city}, ${country}` };
            }
        }
    }

    return { city: query, country: 'Unknown', displayName: query };
}

// Region Mappings (Static)
// ... (Region map constant remains the same)
const COUNTRY_REGION_MAP: Record<string, string> = {
    'US': 'North America', 'CA': 'North America', 'MX': 'North America',
    'CR': 'Central America', 'CU': 'Central America', 'JM': 'Central America', 'BS': 'Central America', 'DO': 'Central America', 'PA': 'Central America', 'GT': 'Central America', 'BZ': 'Central America', 'HN': 'Central America',
    'BR': 'South America', 'AR': 'South America', 'CL': 'South America', 'CO': 'South America', 'PE': 'South America', 'EC': 'South America', 'UY': 'South America', 'PY': 'South America', 'BO': 'South America',
    'NO': 'Northern Europe', 'SE': 'Northern Europe', 'DK': 'Northern Europe', 'FI': 'Northern Europe', 'IS': 'Northern Europe', 'EE': 'Northern Europe', 'LV': 'Northern Europe', 'LT': 'Northern Europe',
    'GB': 'Western Europe', 'UK': 'Western Europe', 'FR': 'Western Europe', 'DE': 'Western Europe', 'BE': 'Western Europe', 'NL': 'Western Europe', 'CH': 'Western Europe', 'AT': 'Western Europe', 'IE': 'Western Europe', 'LU': 'Western Europe',
    'IT': 'Southern Europe', 'ES': 'Southern Europe', 'PT': 'Southern Europe', 'GR': 'Southern Europe', 'HR': 'Southern Europe', 'SI': 'Southern Europe', 'MT': 'Southern Europe', 'CY': 'Southern Europe',
    'PL': 'Eastern Europe', 'CZ': 'Eastern Europe', 'HU': 'Eastern Europe', 'RU': 'Eastern Europe', 'RO': 'Eastern Europe', 'BG': 'Eastern Europe', 'SK': 'Eastern Europe', 'UA': 'Eastern Europe', 'RS': 'Eastern Europe',
    'JP': 'East Asia', 'CN': 'East Asia', 'KR': 'East Asia', 'TW': 'East Asia', 'HK': 'East Asia', 'MO': 'East Asia',
    'TH': 'Southeast Asia', 'VN': 'Southeast Asia', 'ID': 'Southeast Asia', 'MY': 'Southeast Asia', 'SG': 'Southeast Asia', 'PH': 'Southeast Asia', 'KH': 'Southeast Asia', 'LA': 'Southeast Asia', 'MM': 'Southeast Asia',
    'IN': 'South & West Asia', 'MV': 'South & West Asia', 'LK': 'South & West Asia', 'NP': 'South & West Asia', 'AE': 'South & West Asia', 'SA': 'South & West Asia', 'IL': 'South & West Asia', 'QA': 'South & West Asia', 'TR': 'South & West Asia', 'JO': 'South & West Asia', 'LB': 'South & West Asia',
    'EG': 'North Africa', 'MA': 'North Africa', 'TN': 'North Africa', 'DZ': 'North Africa',
    'ZA': 'Sub-Saharan Africa', 'KE': 'Sub-Saharan Africa', 'TZ': 'Sub-Saharan Africa', 'GH': 'Sub-Saharan Africa', 'NG': 'Sub-Saharan Africa', 'MU': 'Sub-Saharan Africa', 'SC': 'Sub-Saharan Africa', 'ZW': 'Sub-Saharan Africa', 'NA': 'Sub-Saharan Africa',
    'AU': 'Oceania', 'NZ': 'Oceania', 'FJ': 'Oceania', 'PF': 'Oceania', 'PG': 'Oceania'
};

export const getRegion = (code: string) => COUNTRY_REGION_MAP[code] || 'Unknown';
