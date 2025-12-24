
const FALLBACK_AIRPORTS: Record<string, any> = {
    "AMS": { "lat": "52.3086", "lon": "4.7639", "name": "Schiphol", "city": "Amsterdam", "country": "NL" },
    "LHR": { "lat": "51.4706", "lon": "-0.4619", "name": "Heathrow", "city": "London", "country": "GB" },
    "JFK": { "lat": "40.6398", "lon": "-73.7789", "name": "John F Kennedy Intl", "city": "New York", "country": "US" },
    "DXB": { "lat": "25.2528", "lon": "55.3644", "name": "Dubai Intl", "city": "Dubai", "country": "AE" },
    "CDG": { "lat": "49.0097", "lon": "2.5478", "name": "Charles De Gaulle", "city": "Paris", "country": "FR" },
    "SFO": { "lat": "37.6189", "lon": "-122.375", "name": "San Francisco Intl", "city": "San Francisco", "country": "US" },
    "SIN": { "lat": "1.3502", "lon": "103.994", "name": "Changi Intl", "city": "Singapore", "country": "SG" },
    "HKG": { "lat": "22.3089", "lon": "113.915", "name": "Hong Kong Intl", "city": "Hong Kong", "country": "HK" },
    "HND": { "lat": "35.5523", "lon": "139.78", "name": "Haneda", "city": "Tokyo", "country": "JP" },
    "SYD": { "lat": "-33.9461", "lon": "151.177", "name": "Kingsford Smith", "city": "Sydney", "country": "AU" },
    "LAX": { "lat": "33.9425", "lon": "-118.408", "name": "Los Angeles Intl", "city": "Los Angeles", "country": "US" },
    "ORD": { "lat": "41.9742", "lon": "-87.9073", "name": "O'Hare Intl", "city": "Chicago", "country": "US" },
    "FRA": { "lat": "50.0333", "lon": "8.5706", "name": "Frankfurt am Main", "city": "Frankfurt", "country": "DE" },
    "MAD": { "lat": "40.4719", "lon": "-3.5626", "name": "Adolfo Suárez Madrid–Barajas", "city": "Madrid", "country": "ES" },
    "BCN": { "lat": "41.2971", "lon": "2.0785", "name": "Barcelona–El Prat", "city": "Barcelona", "country": "ES" },
    "MUC": { "lat": "48.3538", "lon": "11.7861", "name": "Munich", "city": "Munich", "country": "DE" },
    "ZRH": { "lat": "47.4647", "lon": "8.5492", "name": "Zurich", "city": "Zurich", "country": "CH" },
    "YYZ": { "lat": "43.6772", "lon": "-79.6306", "name": "Pearson Intl", "city": "Toronto", "country": "CA" },
    "ICN": { "lat": "37.4692", "lon": "126.451", "name": "Incheon Intl", "city": "Seoul", "country": "KR" },
    "PEK": { "lat": "40.0801", "lon": "116.585", "name": "Capital Intl", "city": "Beijing", "country": "CN" }
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

export async function getCoordinates(location: string): Promise<{ lat: number; lng: number } | undefined> {
  if (!location) return undefined;

  // 1. Fast Path: IATA Code Lookup (3 letters)
  if (location.length === 3 && /^[A-Za-z]{3}$/.test(location)) {
      // Try cache first (including fallback)
      const code = location.toUpperCase();
      if (airportCache[code]) {
          const airport = airportCache[code];
          return { lat: parseFloat(airport.lat), lng: parseFloat(airport.lon) };
      }
      
      // If not in cache, try waiting for load
      await loadAirportData(); 
      if (airportCache[code]) {
          const airport = airportCache[code];
          return { lat: parseFloat(airport.lat), lng: parseFloat(airport.lon) };
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