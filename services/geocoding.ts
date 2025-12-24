
export async function getCoordinates(location: string): Promise<{ lat: number; lng: number } | undefined> {
  if (!location) return undefined;
  try {
    // Use OpenStreetMap Nominatim API (Free, no key required)
    // We add a User-Agent header as requested by OSM usage policy
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&limit=1`;
    
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'WanderGrid-App/1.0'
        }
    });

    if (!response.ok) {
        throw new Error(`Geocoding error: ${response.statusText}`);
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
    console.error("Geocoding failed", e);
    return undefined;
  }
}
