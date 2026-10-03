// Route Corridor Intelligence & Airport Geodesy Service for WanderGrid
import { STATIC_GEO_DATA, formatProperLocationName } from './geocoding';
import { getPhysicalRunwaysSync } from './airportRunways';
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
    originCity: string;
    destCity: string;
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
 * Formats an airport display name by including the city name (e.g. "Paris Charles De Gaulle").
 * Avoids redundancy if the airport name already includes or starts with the city name.
 */
export function formatAirportDisplayName(name: string, city?: string): string {
    if (!name) return '';
    const cleanName = name.trim();
    if (!city) return cleanName;

    const cleanCity = city.split(',')[0].trim();
    if (!cleanCity || cleanCity.toUpperCase() === cleanName.toUpperCase()) {
        return cleanName;
    }

    const lowerName = cleanName.toLowerCase();
    const lowerCity = cleanCity.toLowerCase();
    if (lowerName.startsWith(lowerCity) || lowerName.includes(lowerCity)) {
        return cleanName;
    }

    return `${cleanCity} ${cleanName}`;
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
    } else {
        const runways = getPhysicalRunwaysSync();
        if (runways && runways[cleanCode] && runways[cleanCode].length > 0) {
            const rw = runways[cleanCode][0];
            coords = [rw.start[0], rw.start[1]];
            name = `${cleanCode} Airport`;
        }
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

            const oCode = t.origin.trim();
            const dCode = t.destination.trim();
            const oUpper = oCode.toUpperCase();
            const dUpper = dCode.toUpperCase();

            // Bidirectional corridor key (lexicographically sorted)
            const corridorId = oUpper < dUpper ? `${oUpper}<->${dUpper}` : `${dUpper}<->${oUpper}`;

            const cleanProvider = (t.provider || '').trim();
            const leg: CorridorFlightLeg = {
                id: `${trip.id}_${t.identifier || ''}_${t.departureDate || ''}`,
                tripId: trip.id,
                tripName: trip.name,
                origin: formatProperLocationName(oCode),
                destination: formatProperLocationName(dCode),
                provider: cleanProvider,
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
                    originCode: formatProperLocationName(oCode),
                    destCode: formatProperLocationName(dCode),
                    originName: meta1.name,
                    destName: meta2.name,
                    originCity: meta1.city,
                    destCity: meta2.city,
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
                    airlines: cleanProvider ? [cleanProvider] : [],
                    firstFlownDate: leg.departureDate,
                    lastFlownDate: leg.departureDate,
                    flights: [leg]
                });
            } else {
                const existing = corridors.get(corridorId)!;
                existing.totalFlights += 1;
                existing.flights.push(leg);

                if (cleanProvider && !existing.airlines.includes(cleanProvider)) {
                    existing.airlines.push(cleanProvider);
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

export interface RouteTransportSummary {
    primaryMode: string;
    isMultiModal: boolean;
    activityLabel: string;        // "Cruises", "Flights", "Trains", "Buses", "Drives", "Trips"
    singleActivityLabel: string;  // "Cruise", "Flight", "Train", "Bus", "Drive", "Trip"
    providerLabel: string;        // "Cruise Lines", "Airlines", "Rail Operators", "Bus Operators", "Car Rentals", "Operators"
    singleProviderLabel: string;  // "Cruise Line", "Airline", "Rail Operator", "Bus Operator", "Car Rental", "Operator"
    providerCount: number;
    verbPast: string;             // "last sailed", "last flown", "last traveled", "last driven"
    listTitle: string;            // "CRUISES", "FLIGHTS", "TRAINS", "BUSES", "DRIVES", "JOURNEYS"
    modeIconType: 'flight' | 'cruise' | 'ferry' | 'train' | 'bus' | 'car' | 'mixed';
    distinctModes: string[];
}

export function getRouteTransportSummary(corridor: RouteCorridor): RouteTransportSummary {
    const legs = corridor.flights || [];
    const rawModes = legs.map(l => (l.mode || 'Flight').trim());
    const distinctModes = Array.from(new Set(rawModes));

    // Categorize modes into primary types:
    const categorizedModes = distinctModes.map(m => {
        const lower = m.toLowerCase();
        if (lower.includes('flight') || lower.includes('plane') || lower.includes('air')) return 'flight';
        if (lower.includes('train') || lower.includes('rail')) return 'train';
        if (lower.includes('bus')) return 'bus';
        if (lower.includes('cruise')) return 'cruise';
        if (lower.includes('ferry') || lower.includes('boat') || lower.includes('ship')) return 'ferry';
        if (lower.includes('car') || lower.includes('drive') || lower.includes('taxi')) return 'car';
        return 'other';
    });

    const uniqueCategories = Array.from(new Set(categorizedModes));
    const isMultiModal = uniqueCategories.length > 1;

    // Calculate real distinct providers
    const knownProviders = new Set<string>();
    legs.forEach(l => {
        const p = (l.provider || '').trim();
        if (p && p.toLowerCase() !== 'flight' && !distinctModes.some(dm => dm.toLowerCase() === p.toLowerCase())) {
            knownProviders.add(p);
        }
    });

    const count = legs.length;
    const providerCount = knownProviders.size > 0 ? knownProviders.size : (corridor.airlines?.length > 0 ? corridor.airlines.length : 1);

    if (isMultiModal) {
        return {
            primaryMode: 'Multi-modal',
            isMultiModal: true,
            activityLabel: count === 1 ? 'Trip' : 'Trips',
            singleActivityLabel: 'Trip',
            providerLabel: providerCount === 1 ? 'Operator' : 'Operators',
            singleProviderLabel: 'Operator',
            providerCount,
            verbPast: 'last traveled',
            listTitle: 'JOURNEYS',
            modeIconType: 'mixed',
            distinctModes
        };
    }

    const singleCat = uniqueCategories[0] || 'flight';

    switch (singleCat) {
        case 'cruise':
            return {
                primaryMode: 'Cruise',
                isMultiModal: false,
                activityLabel: count === 1 ? 'Cruise' : 'Cruises',
                singleActivityLabel: 'Cruise',
                providerLabel: providerCount === 1 ? 'Cruise Line' : 'Cruise Lines',
                singleProviderLabel: 'Cruise Line',
                providerCount,
                verbPast: 'last sailed',
                listTitle: 'CRUISES',
                modeIconType: 'cruise',
                distinctModes
            };
        case 'ferry':
            return {
                primaryMode: 'Ferry',
                isMultiModal: false,
                activityLabel: count === 1 ? 'Ferry Trip' : 'Ferries',
                singleActivityLabel: 'Ferry',
                providerLabel: providerCount === 1 ? 'Ferry Line' : 'Ferry Lines',
                singleProviderLabel: 'Ferry Line',
                providerCount,
                verbPast: 'last sailed',
                listTitle: 'FERRIES',
                modeIconType: 'ferry',
                distinctModes
            };
        case 'train':
            return {
                primaryMode: 'Train',
                isMultiModal: false,
                activityLabel: count === 1 ? 'Train' : 'Trains',
                singleActivityLabel: 'Train',
                providerLabel: providerCount === 1 ? 'Rail Operator' : 'Rail Operators',
                singleProviderLabel: 'Rail Operator',
                providerCount,
                verbPast: 'last traveled',
                listTitle: 'TRAINS',
                modeIconType: 'train',
                distinctModes
            };
        case 'bus':
            return {
                primaryMode: 'Bus',
                isMultiModal: false,
                activityLabel: count === 1 ? 'Bus' : 'Buses',
                singleActivityLabel: 'Bus',
                providerLabel: providerCount === 1 ? 'Bus Line' : 'Bus Operators',
                singleProviderLabel: 'Bus Operator',
                providerCount,
                verbPast: 'last traveled',
                listTitle: 'BUSES',
                modeIconType: 'bus',
                distinctModes
            };
        case 'car': {
            const isRental = distinctModes.some(m => m.toLowerCase().includes('rental'));
            return {
                primaryMode: isRental ? 'Car Rental' : 'Car',
                isMultiModal: false,
                activityLabel: count === 1 ? 'Drive' : 'Drives',
                singleActivityLabel: 'Drive',
                providerLabel: isRental ? (providerCount === 1 ? 'Car Rental' : 'Car Rentals') : (providerCount === 1 ? 'Vehicle' : 'Vehicles'),
                singleProviderLabel: isRental ? 'Car Rental' : 'Vehicle',
                providerCount,
                verbPast: 'last driven',
                listTitle: 'DRIVES',
                modeIconType: 'car',
                distinctModes
            };
        }
        case 'flight':
        default:
            return {
                primaryMode: 'Flight',
                isMultiModal: false,
                activityLabel: count === 1 ? 'Flight' : 'Flights',
                singleActivityLabel: 'Flight',
                providerLabel: providerCount === 1 ? 'Airline' : 'Airlines',
                singleProviderLabel: 'Airline',
                providerCount,
                verbPast: 'last flown',
                listTitle: 'FLIGHTS',
                modeIconType: 'flight',
                distinctModes
            };
    }
}
