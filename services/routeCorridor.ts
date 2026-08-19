// Route Corridor Intelligence & Airport Geodesy Service for WanderGrid
import { STATIC_GEO_DATA } from './geocoding';
import { GLOBAL_PHYSICAL_RUNWAYS } from './airportRunwayDataset';
import { Trip } from '../types';

export interface CorridorFlightLeg {
    id: string;
    tripId: string;
    tripName: string;
    origin: string;
    destination: string;
    provider: string;
    identifier: string;
    departureDate?: string;
    mode: string;
}

export interface RouteCorridor {
    id: string;
    originCode: string;
    destCode: string;
    originName: string;
    destName: string;
    originCountry: string;
    destCountry: string;
    originIso: string;
    destIso: string;
    originFlag: string;
    destFlag: string;
    originCoords: [number, number]; // [lng, lat]
    destCoords: [number, number];   // [lng, lat]
    distanceKm: number;
    distanceMiles: number;
    totalFlights: number;
    airlines: string[];
    firstFlownDate?: string;
    lastFlownDate?: string;
    flights: CorridorFlightLeg[];
}

/**
 * Converts 2-letter ISO country code to Unicode Flag Emoji.
 */
export function getFlagEmoji(countryCode: string): string {
    if (!countryCode) return '🌐';
    const code = countryCode.toUpperCase();
    if (code === 'GB-ENG') return '🏴󠁧󠁢󠁥󠁮󠁧󠁿';
    if (code === 'GB-SCT') return '🏴󠁧󠁢󠁳󠁣󠁴󠁿';
    if (code === 'GB-WLS') return '🏴󠁧󠁢󠁷󠁬󠁳󠁿';
    if (code === 'GB-NIR') return '🇬🇧';
    if (countryCode.length !== 2) return '🌐';
    try {
        const codePoints = countryCode
            .toUpperCase()
            .split('')
            .map(char => 127397 + char.charCodeAt(0));
        return String.fromCodePoint(...codePoints);
    } catch {
        return '🌐';
    }
}

/**
 * Resolves location metadata (name, country, ISO, flag emoji, coordinates) for an airport or city code.
 */
export function resolveLocationMetadata(code: string, fallbackLat?: number, fallbackLng?: number): {
    name: string;
    city: string;
    country: string;
    iso: string;
    flag: string;
    coords: [number, number];
} {
    const cleanCode = (code || '').toUpperCase().trim();
    const staticEntry = STATIC_GEO_DATA[cleanCode];

    let name = cleanCode;
    let city = cleanCode;
    let country = 'Global';
    let iso = '';
    let coords: [number, number] = [fallbackLng || 0, fallbackLat || 0];

    if (staticEntry) {
        name = staticEntry.name || cleanCode;
        city = staticEntry.city || cleanCode;
        country = staticEntry.country || 'Global';
        iso = staticEntry.iso || '';
        const lat = parseFloat(staticEntry.lat);
        const lon = parseFloat(staticEntry.lon);
        if (!isNaN(lat) && !isNaN(lon)) {
            coords = [lon, lat];
        }
    } else if (GLOBAL_PHYSICAL_RUNWAYS[cleanCode] && GLOBAL_PHYSICAL_RUNWAYS[cleanCode].length > 0) {
        const rw = GLOBAL_PHYSICAL_RUNWAYS[cleanCode][0];
        coords = [rw.start[0], rw.start[1]];
        name = `${cleanCode} Airport`;
    }

    const flag = getFlagEmoji(iso);

    return {
        name,
        city,
        country,
        iso,
        flag,
        coords
    };
}

/**
 * Calculates Great-Circle Geodesic Distance in Kilometers using Haversine formula.
 */
export function calculateGeodesicDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth radius in km
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLon = (lon2 - lon1) * rad;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
}

/**
 * Computes approximate local time and UTC offset based on geographic longitude.
 */
export function getApproxLocalTime(lng: number, date: Date = new Date()): {
    timeStr: string;
    dateStr: string;
    utcOffsetStr: string;
} {
    // Standard solar timezone approximation: 1 hour per 15 degrees longitude
    const rawOffsetHours = Math.round(lng / 15);
    const utcHours = date.getUTCHours();
    const utcMinutes = date.getUTCMinutes();

    let localHours = (utcHours + rawOffsetHours) % 24;
    if (localHours < 0) localHours += 24;

    const period = localHours >= 12 ? 'PM' : 'AM';
    const displayHours = localHours % 12 || 12;
    const displayMinutes = utcMinutes < 10 ? `0${utcMinutes}` : utcMinutes;

    const timeStr = `${displayHours}:${displayMinutes} ${period}`;
    const offsetSign = rawOffsetHours >= 0 ? '+' : '';
    const utcOffsetStr = `UTC${offsetSign}${rawOffsetHours}`;

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dateStr = `${days[date.getUTCDay()]}, ${months[date.getUTCMonth()]} ${date.getUTCDate()}`;

    return {
        timeStr,
        dateStr,
        utcOffsetStr
    };
}

/**
 * Generates an index of aggregated Route Corridors from all trips.
 */
export function buildRouteCorridors(trips: Trip[]): Map<string, RouteCorridor> {
    const corridors = new Map<string, RouteCorridor>();

    trips.forEach(trip => {
        trip.transports?.forEach(t => {
            if (!t.origin || !t.destination || !t.originLat || !t.originLng || !t.destLat || !t.destLng) return;

            const oCode = t.origin.toUpperCase().trim();
            const dCode = t.destination.toUpperCase().trim();

            // Bidirectional corridor key (lexicographically sorted)
            const corridorId = oCode < dCode ? `${oCode}<->${dCode}` : `${dCode}<->${oCode}`;

            const leg: CorridorFlightLeg = {
                id: `${trip.id}_${t.identifier || ''}_${t.departureDate || ''}`,
                tripId: trip.id,
                tripName: trip.name,
                origin: oCode,
                destination: dCode,
                provider: t.provider || (t.mode === 'Flight' || !t.mode ? 'Flight' : t.mode),
                identifier: t.identifier || '',
                departureDate: t.departureDate,
                mode: t.mode || 'Flight'
            };

            if (!corridors.has(corridorId)) {
                const meta1 = resolveLocationMetadata(oCode, t.originLat, t.originLng);
                const meta2 = resolveLocationMetadata(dCode, t.destLat, t.destLng);
                const distKm = calculateGeodesicDistanceKm(t.originLat, t.originLng, t.destLat, t.destLng);

                corridors.set(corridorId, {
                    id: corridorId,
                    originCode: oCode,
                    destCode: dCode,
                    originName: meta1.name,
                    destName: meta2.name,
                    originCountry: meta1.country,
                    destCountry: meta2.country,
                    originIso: meta1.iso,
                    destIso: meta2.iso,
                    originFlag: meta1.flag,
                    destFlag: meta2.flag,
                    originCoords: [t.originLng, t.originLat],
                    destCoords: [t.destLng, t.destLat],
                    distanceKm: distKm,
                    distanceMiles: Math.round(distKm * 0.621371),
                    totalFlights: 1,
                    airlines: leg.provider ? [leg.provider] : [],
                    firstFlownDate: leg.departureDate,
                    lastFlownDate: leg.departureDate,
                    flights: [leg]
                });
            } else {
                const existing = corridors.get(corridorId)!;
                existing.totalFlights += 1;
                existing.flights.push(leg);

                if (leg.provider && !existing.airlines.includes(leg.provider)) {
                    existing.airlines.push(leg.provider);
                }

                if (leg.departureDate) {
                    if (!existing.firstFlownDate || leg.departureDate < existing.firstFlownDate) {
                        existing.firstFlownDate = leg.departureDate;
                    }
                    if (!existing.lastFlownDate || leg.departureDate > existing.lastFlownDate) {
                        existing.lastFlownDate = leg.departureDate;
                    }
                }
            }
        });
    });

    return corridors;
}
