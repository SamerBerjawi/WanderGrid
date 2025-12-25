
const FALLBACK_AIRPORTS: Record<string, any> = {
    "AMS": { "lat": "52.3086", "lon": "4.7639", "name": "Schiphol", "city": "Amsterdam", "country": "NL", "tz": "Europe/Amsterdam" },
    "LHR": { "lat": "51.4706", "lon": "-0.4619", "name": "Heathrow", "city": "London", "country": "GB", "tz": "Europe/London" },
    "JFK": { "lat": "40.6398", "lon": "-73.7789", "name": "John F Kennedy Intl", "city": "New York", "country": "US", "tz": "America/New_York" },
    "DXB": { "lat": "25.2528", "lon": "55.3644", "name": "Dubai Intl", "city": "Dubai", "country": "AE", "tz": "Asia/Dubai" },
    "CDG": { "lat": "49.0097", "lon": "2.5478", "name": "Charles De Gaulle", "city": "Paris", "country": "FR", "tz": "Europe/Paris" },
    "SFO": { "lat": "37.6189", "lon": "-122.375", "name": "San Francisco Intl", "city": "San Francisco", "country": "US", "tz": "America/Los_Angeles" },
    "SIN": { "lat": "1.3502", "lon": "103.994", "name": "Changi Intl", "city": "Singapore", "country": "SG", "tz": "Asia/Singapore" },
    "HKG": { "lat": "22.3089", "lon": "113.915", "name": "Hong Kong Intl", "city": "Hong Kong", "country": "HK", "tz": "Asia/Hong_Kong" },
    "HND": { "lat": "35.5523", "lon": "139.78", "name": "Haneda", "city": "Tokyo", "country": "JP", "tz": "Asia/Tokyo" },
    "SYD": { "lat": "-33.9461", "lon": "151.177", "name": "Kingsford Smith", "city": "Sydney", "country": "AU", "tz": "Australia/Sydney" },
    "LAX": { "lat": "33.9425", "lon": "-118.408", "name": "Los Angeles Intl", "city": "Los Angeles", "country": "US", "tz": "America/Los_Angeles" },
    "ORD": { "lat": "41.9742", "lon": "-87.9073", "name": "O'Hare Intl", "city": "Chicago", "country": "US", "tz": "America/Chicago" },
    "FRA": { "lat": "50.0333", "lon": "8.5706", "name": "Frankfurt am Main", "city": "Frankfurt", "country": "DE", "tz": "Europe/Berlin" },
    "MAD": { "lat": "40.4719", "lon": "-3.5626", "name": "Adolfo Suárez Madrid–Barajas", "city": "Madrid", "country": "ES", "tz": "Europe/Madrid" },
    "BCN": { "lat": "41.2971", "lon": "2.0785", "name": "Barcelona–El Prat", "city": "Barcelona", "country": "ES", "tz": "Europe/Madrid" },
    "MUC": { "lat": "48.3538", "lon": "11.7861", "name": "Munich", "city": "Munich", "country": "DE", "tz": "Europe/Berlin" },
    "ZRH": { "lat": "47.4647", "lon": "8.5492", "name": "Zurich", "city": "Zurich", "country": "CH", "tz": "Europe/Zurich" },
    "YYZ": { "lat": "43.6772", "lon": "-79.6306", "name": "Pearson Intl", "city": "Toronto", "country": "CA", "tz": "America/Toronto" },
    "ICN": { "lat": "37.4692", "lon": "126.451", "name": "Incheon Intl", "city": "Seoul", "country": "KR", "tz": "Asia/Seoul" },
    "PEK": { "lat": "40.0801", "lon": "116.585", "name": "Capital Intl", "city": "Beijing", "country": "CN", "tz": "Asia/Shanghai" }
};

// Initialize with fallback
let airportCache: Record<string, any> = { ...FALLBACK_AIRPORTS };

async function loadAirportData() {
    // If we have more than the fallback, assume loaded
    if (Object.keys(airportCache).length > 50) return;
    
    try {
        const res = await fetch('https://raw.githubusercontent.com/mwgg/Airports/master/airports.json');
        if (res.ok) {
            const data = await res.json();
            // Merge to preserve manual overrides if any
            airportCache = { ...airportCache, ...data };
        }
    } catch (e) {
        console.warn("Failed to load full airport dataset, using fallback cache.", e);
    }
}

// Trigger preload
loadAirportData();

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
    return airportCache[iata.toUpperCase()]?.tz;
}

// Helper: Get UTC offset in minutes for a specific TimeZone at a specific Date
function getOffsetMinutes(timeZone: string, date: Date): number {
    try {
        // Use shortOffset (e.g. "GMT-5" or "GMT+5:30")
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone,
            timeZoneName: 'shortOffset',
        }).formatToParts(date);
        
        const offsetPart = parts.find(p => p.type === 'timeZoneName');
        if (!offsetPart) return 0;
        
        // Parse "GMT-5", "GMT+5:30", "UTC+1"
        // Remove GMT/UTC prefix
        const val = offsetPart.value.replace(/^(GMT|UTC)/, '');
        if (!val) return 0; // GMT or UTC with no offset
        
        const sign = val.includes('-') ? -1 : 1;
        const [h, m] = val.replace('+', '').replace('-', '').split(':').map(Number);
        
        const hours = isNaN(h) ? 0 : h;
        const minutes = isNaN(m) ? 0 : m;
        
        return sign * (hours * 60 + minutes);
    } catch (e) {
        console.warn("Offset Calc Error", e);
        return 0;
    }
}

// Helper: Convert YYYY-MM-DD + HH:mm into a UTC timestamp (Wall Time treated as UTC)
// This avoids browser local timezone interference
function getWallTimeAsUtc(dateStr: string, timeStr: string): number {
    const [y, m, d] = dateStr.split('-').map(Number);
    const [h, min] = timeStr.split(':').map(Number);
    return Date.UTC(y, m - 1, d, h, min, 0);
}

// Calculate duration (minutes) between two locations/times respecting TZ
export function calculateDurationMinutes(
    originIata: string, 
    destIata: string, 
    depDateStr: string, 
    depTimeStr: string, 
    arrDateStr: string, 
    arrTimeStr: string
): number {
    if (!originIata || !destIata || !depDateStr || !depTimeStr || !arrDateStr || !arrTimeStr) return 0;

    const originTz = getCachedTimeZone(originIata) || 'UTC';
    const destTz = getCachedTimeZone(destIata) || 'UTC';

    // 1. Get Wall Times as UTC Timestamps to measure pure wall difference
    const depWallUtc = getWallTimeAsUtc(depDateStr, depTimeStr);
    const arrWallUtc = getWallTimeAsUtc(arrDateStr, arrTimeStr);

    if (isNaN(depWallUtc) || isNaN(arrWallUtc)) return 0;

    // 2. Get Offsets at those times
    // We use the Wall Time as the lookup instant. This is 99% accurate unless flight is exactly during a DST jump.
    const depOffset = getOffsetMinutes(originTz, new Date(depWallUtc));
    const arrOffset = getOffsetMinutes(destTz, new Date(arrWallUtc));

    // 3. Formula:
    // UTC_Departure = Wall_Departure - Offset_Departure
    // UTC_Arrival = Wall_Arrival - Offset_Arrival
    // Duration = UTC_Arrival - UTC_Departure
    //          = (Wall_Arrival - Offset_Arrival) - (Wall_Departure - Offset_Departure)
    //          = (Wall_Arrival - Wall_Departure) - (Offset_Arrival - Offset_Departure)
    
    const wallDiffMinutes = (arrWallUtc - depWallUtc) / 60000;
    const offsetDiffMinutes = arrOffset - depOffset;
    
    let duration = wallDiffMinutes - offsetDiffMinutes;
    
    // Safety clamp
    return Math.max(0, Math.round(duration));
}

// Calculate Arrival Time given Departure, Duration and TZs
export function calculateArrivalTime(
    originIata: string,
    destIata: string,
    depDateStr: string,
    depTimeStr: string,
    durationMinutes: number
): { date: string, time: string } {
    const originTz = getCachedTimeZone(originIata) || 'UTC';
    const destTz = getCachedTimeZone(destIata) || 'UTC';

    // 1. Get Departure Wall Time as UTC Timestamp
    const depWallUtc = getWallTimeAsUtc(depDateStr, depTimeStr);
    if (isNaN(depWallUtc)) return { date: '', time: '' };

    // 2. Calculate Real UTC Departure Time
    const depOffset = getOffsetMinutes(originTz, new Date(depWallUtc));
    // Real UTC = Wall - Offset (in ms)
    const depRealUtc = depWallUtc - (depOffset * 60000);

    // 3. Calculate Real UTC Arrival Time
    const arrRealUtc = depRealUtc + (durationMinutes * 60000);

    // 4. Convert Real UTC Arrival to Destination Wall Time
    // We rely on Intl to do the heavy lifting of converting a UTC timestamp to a TZ-specific string
    const arrDateObj = new Date(arrRealUtc);
    
    try {
        // Format to parts in the destination timezone
        const formatter = new Intl.DateTimeFormat('en-CA', { // en-CA gives YYYY-MM-DD
            timeZone: destTz,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23' // Force 24h
        });
        
        const parts = formatter.formatToParts(arrDateObj);
        const getPart = (type: string) => parts.find(p => p.type === type)?.value || '';
        
        const year = getPart('year');
        const month = getPart('month');
        const day = getPart('day');
        const hour = getPart('hour');
        const minute = getPart('minute');

        return {
            date: `${year}-${month}-${day}`,
            time: `${hour}:${minute}`
        };
    } catch (e) {
        console.error("Arrival Calc Error", e);
        return { date: '', time: '' };
    }
}

// --- Search ---

export async function searchLocations(query: string): Promise<string[]> {
    if (!query || query.length < 3) return [];
    try {
        // Use OpenStreetMap Nominatim for search
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=5`;
        const response = await fetch(url); 
        
        if (!response.ok) return [];
        
        const data = await response.json();
        return data.map((item: any) => {
            // Simplify display name if possible, or return full
            return item.display_name || item.name;
        });
    } catch (e) {
        console.error("Location search failed", e);
        return [];
    }
}

export async function getCoordinates(location: string): Promise<{ lat: number; lng: number; tz?: string } | undefined> {
  if (!location) return undefined;

  // 1. Fast Path: IATA Code Lookup (3 letters)
  if (location.length === 3 && /^[A-Za-z]{3}$/.test(location)) {
      // Try cache first (including fallback)
      const code = location.toUpperCase();
      if (airportCache[code]) {
          const airport = airportCache[code];
          return { lat: parseFloat(airport.lat), lng: parseFloat(airport.lon), tz: airport.tz };
      }
      
      // If not in cache, try waiting for load
      await loadAirportData(); 
      if (airportCache[code]) {
          const airport = airportCache[code];
          return { lat: parseFloat(airport.lat), lng: parseFloat(airport.lon), tz: airport.tz };
      }
  }

  // 2. Slow Path: Nominatim Geocoding
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&limit=1`;
    
    const response = await fetch(url);

    if (!response.ok) {
        // Log as warning rather than error to reduce noise
        console.warn(`Geocoding HTTP error: ${response.statusText}`);
        return undefined;
    }

    const data = await response.json();

    if (Array.isArray(data) && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon)
        // Nominatim doesn't easily return TZ without extra calls
      };
    }
    
    return undefined;
  } catch (e) {
    console.warn(`Geocoding fetch failed for ${location}`, e);
    return undefined;
  }
}

export async function resolvePlaceName(query: string): Promise<{ city: string, country: string, displayName: string } | null> {
    if (!query) return null;
    
    // 1. IATA Lookup
    if (query.length === 3 && /^[A-Za-z]{3}$/.test(query)) {
        const code = query.toUpperCase();
        // Try cache immediately
        if (airportCache[code]) {
            const a = airportCache[code];
            return { city: a.city, country: a.country, displayName: `${a.city}, ${a.country}` };
        }
        // Try waiting
        await loadAirportData();
        if (airportCache[code]) {
            const a = airportCache[code];
            return { city: a.city, country: a.country, displayName: `${a.city}, ${a.country}` };
        }
    }
    
    // 2. Simple String Parsing
    // If user typed "London, UK", assume that's correct
    if (query.includes(',')) {
        const parts = query.split(',').map(s => s.trim());
        if (parts.length >= 2) {
            // Assume format "City, Country" or "Address, City, Country"
            const country = parts[parts.length - 1];
            const city = parts[parts.length - 2];
            // Filter out numbers (zip codes)
            if (!/^\d+$/.test(country) && !/^\d+$/.test(city)) {
                 return { city, country, displayName: `${city}, ${country}` };
            }
        }
    }

    // 3. Fallback: Treat as City
    return { city: query, country: '', displayName: query };
}
