
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
        // Create a string representation in the target timezone
        const str = date.toLocaleString('en-US', { timeZone, hourCycle: 'h23' });
        // Create a date object treating that string as local/UTC to find difference
        const targetTime = new Date(str);
        // Compare with the actual UTC timestamp of the original date object
        // NOTE: This assumes 'date' is created in browser local time. 
        // A robust way without libraries is to check the diff between UTC string and TZ string.
        
        // Let's use a simpler heuristic for the scope of this app:
        // Parse the offset from the detailed string
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone,
            timeZoneName: 'longOffset',
        }).formatToParts(date);
        
        const tzName = parts.find(p => p.type === 'timeZoneName')?.value; // "GMT-05:00"
        if (!tzName) return 0;
        
        // Extract offset
        const match = tzName.match(/GMT([+-])(\d{1,2}):?(\d{2})?/);
        if (match) {
            const sign = match[1] === '+' ? 1 : -1;
            const hours = parseInt(match[2], 10);
            const minutes = match[3] ? parseInt(match[3], 10) : 0;
            return sign * (hours * 60 + minutes);
        }
        return 0;
    } catch (e) {
        return 0;
    }
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

    // Construct "Wall Time" dates (treating input strings as local)
    // We pick an arbitrary base for calculation, but dates matter for DST
    const depWall = new Date(`${depDateStr}T${depTimeStr}:00`);
    const arrWall = new Date(`${arrDateStr}T${arrTimeStr}:00`);

    if (isNaN(depWall.getTime()) || isNaN(arrWall.getTime())) return 0;

    // Get offsets at those specific times
    const depOffset = getOffsetMinutes(originTz, depWall);
    const arrOffset = getOffsetMinutes(destTz, arrWall);

    // Duration = (ArrWall - DepWall) - (ArrOffset - DepOffset)
    // Example: NY (-300) to London (+60). Flight 10:00 -> 22:00.
    // Wall Diff: 720 mins.
    // Offset Diff: 60 - (-300) = 360 mins.
    // Duration: 720 - 360 = 360 mins (6 hours).
    
    const wallDiffMinutes = (arrWall.getTime() - depWall.getTime()) / 60000;
    const offsetDiffMinutes = arrOffset - depOffset;
    
    let duration = wallDiffMinutes - offsetDiffMinutes;
    
    // Fallback if calculation went negative (e.g. crossing date line wrong way in math)
    if (duration < 0) duration += 24 * 60; // Normalize? No, duration shouldn't be negative unless dates are wrong.
    
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

    const depWall = new Date(`${depDateStr}T${depTimeStr}:00`);
    if (isNaN(depWall.getTime())) return { date: '', time: '' };

    const depOffset = getOffsetMinutes(originTz, depWall);
    
    // We need to estimate Arrival Wall time to get the correct Arr Offset (chicken/egg problem with DST)
    // Approx Arr Offset = Dest standard offset? Let's use Dep time at Dest as proxy for offset lookups
    let arrOffset = getOffsetMinutes(destTz, depWall); 
    
    // Formula: ArrWall = DepWall + Duration + (ArrOffset - DepOffset)
    let offsetDiff = arrOffset - depOffset;
    let arrWallMs = depWall.getTime() + (durationMinutes * 60000) + (offsetDiff * 60000);
    
    // Re-check offset at the estimated arrival time to correct for DST boundary crossings
    const estimatedArrDate = new Date(arrWallMs);
    const refinedArrOffset = getOffsetMinutes(destTz, estimatedArrDate);
    
    if (refinedArrOffset !== arrOffset) {
        offsetDiff = refinedArrOffset - depOffset;
        arrWallMs = depWall.getTime() + (durationMinutes * 60000) + (offsetDiff * 60000);
    }

    const finalDate = new Date(arrWallMs);
    
    const year = finalDate.getFullYear();
    const month = String(finalDate.getMonth() + 1).padStart(2, '0');
    const day = String(finalDate.getDate()).padStart(2, '0');
    const hours = String(finalDate.getHours()).padStart(2, '0');
    const mins = String(finalDate.getMinutes()).padStart(2, '0');

    return {
        date: `${year}-${month}-${day}`,
        time: `${hours}:${mins}`
    };
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