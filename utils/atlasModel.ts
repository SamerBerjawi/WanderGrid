import { CountryResidenceStatus, Trip, VisitedItem, getResidenceStatuses } from '../types';
import { getRegion } from '../services/geoData';
import { cleanCityName, formatPlaceName, resolvePlaceName, getCoordinates, STATIC_GEO_DATA } from '../services/geocoding';
import { mergeCityRecords, splitCombinedPlaces, type AirportInfo } from '../services/cityRegistry';
import {
    canonicalCountryName, countryId, excludedCountryCodes, findCountryRecord, normalizeCountryCode, type MergedCountry,
} from '../services/countryRegistry';

/**
 * Atlas data rules (visited countries and cities), shared by the New Atlas page. Pure functions over
 * the data layer: no UI. Moved from the feature logic of the original Atlas so both can use them.
 */

/** Countries in the world, for the share-of-world figure. */
export const WORLD_COUNTRY_COUNT = 198;

export type AtlasSource = 'flight' | 'trip' | 'layover' | 'roadtrip';

export interface ScanCountry { code: string; name: string; source: AtlasSource; date: string }
export interface ScanCity { name: string; countryCode: string; countryName: string; source: AtlasSource; date: string; lat?: number; lng?: number }
export interface ScanResult { countries: ScanCountry[]; cities: ScanCity[] }

const today = () => new Date().toISOString().split('T')[0];

export const resolveAirportCity = (code: string): AirportInfo | undefined => {
    const ap = (STATIC_GEO_DATA as Record<string, any>)[code];
    if (!ap?.city) return undefined;
    return { city: ap.city as string, countryCode: ap.iso as string, lat: parseFloat(ap.lat), lng: parseFloat(ap.lon) };
};

const statuses = (item: VisitedItem) => getResidenceStatuses(item);
export const isVisitedCountry = (item: VisitedItem) => statuses(item).some(s => s === 'visited' || s === 'lived_past' || s === 'lived_current');
export const isLayoverCountry = (item: VisitedItem) => statuses(item).includes('layover') || item.isTransit === true;
export const isWishlistCountry = (item: VisitedItem) => statuses(item).includes('wishlist');

/** Region of a country code; UK nations count as Northern Europe like the UK itself. */
export const regionOf = (code?: string) => {
    const c = normalizeCountryCode(code || '');
    return getRegion(c.startsWith('GB-') ? 'GB' : c);
};

/** Groups items by region, regions in alphabetical order with "Unknown" last; items by name. */
export const groupByRegion = <T extends { name: string }>(items: T[], codeOf: (item: T) => string | undefined) => {
    const groups = new Map<string, T[]>();
    items.forEach(item => {
        const region = regionOf(codeOf(item));
        groups.set(region, [...(groups.get(region) || []), item]);
    });
    return Array.from(groups.entries())
        .map(([region, list]) => ({ region, items: list.sort((a, b) => a.name.localeCompare(b.name)) }))
        .sort((a, b) => (a.region === 'Unknown' ? 1 : b.region === 'Unknown' ? -1 : a.region.localeCompare(b.region)));
};

/**
 * Every city the user has been to: cities they added, plus places from past trips (and their stops),
 * road trips and flight arrivals. The sources describe the same place differently, so they are merged.
 */
export const buildTrackedCities = (visited: VisitedItem[], trips: Trip[], flights: any[], roadTrips: any[]) => {
    const cityMap = new Map<string, VisitedItem>();
    const keyOf = (name: string, code?: string) => `${name.toLowerCase()}_${(code || 'XX').toLowerCase()}`;
    const add = (key: string, item: VisitedItem) => { if (!cityMap.has(key)) cityMap.set(key, item); };

    visited.filter(item => item.type === 'city').forEach(item => {
        const city = cleanCityName(item.name, item.countryCode);
        cityMap.set(keyOf(city, item.countryCode), {
            ...item,
            name: formatPlaceName(city),
            countryName: item.countryName ? formatPlaceName(item.countryName) : item.countryName,
        });
    });

    trips.filter(t => t.status !== 'Planning' && t.status !== 'Cancelled').forEach(t => {
        const places = t.location ? splitCombinedPlaces(t.location) : [];
        places.forEach(place => {
            const code = (t.coordinates?.countryCode || 'XX').toUpperCase();
            const city = cleanCityName(place, t.coordinates?.countryCode);
            const single = places.length === 1;
            add(keyOf(city, code), {
                id: `trip_city_${keyOf(city, code)}`, type: 'city', code, name: formatPlaceName(city), countryCode: code,
                countryName: t.coordinates?.country ? formatPlaceName(t.coordinates.country) : undefined,
                visitDate: t.endDate || t.startDate, lat: single ? t.coordinates?.lat : undefined, lng: single ? t.coordinates?.lng : undefined,
                notes: `Trip: ${t.name || t.location}`, isManual: false,
            });
        });
        t.locations?.forEach(l => {
            if (!l.name) return;
            const city = cleanCityName(l.name);
            add(keyOf(city), {
                id: `trip_loc_${l.id || keyOf(city)}`, type: 'city', code: 'XX', name: formatPlaceName(city), countryCode: 'XX',
                visitDate: t.endDate, lat: l.coordinates?.lat, lng: l.coordinates?.lng, notes: `Stop in ${t.name}`, isManual: false,
            });
        });
        t.transports?.forEach(tr => tr.waypoints?.forEach(wp => {
            if (!wp.name) return;
            const city = cleanCityName(wp.name);
            add(keyOf(city), {
                id: `transport_wp_${wp.id || keyOf(city)}`, type: 'city', code: 'XX', name: formatPlaceName(city), countryCode: 'XX',
                visitDate: wp.visitDate || tr.departureDate || t.startDate, lat: wp.coordinates?.lat, lng: wp.coordinates?.lng,
                notes: `Stop on ${tr.origin} → ${tr.destination}`, isManual: false,
            });
        }));
    });

    roadTrips.filter(r => r.status !== 'Cancelled').forEach(r => {
        const point = (name: string | undefined, id: string, date?: string, lat?: number, lng?: number) => {
            if (!name) return;
            const city = cleanCityName(name, r.countryCode);
            add(keyOf(city), {
                id: `${id}_${keyOf(city)}`, type: 'city', code: 'XX', name: formatPlaceName(city), countryCode: 'XX',
                visitDate: date, lat, lng, notes: `Road trip: ${r.name || `${r.origin} → ${r.destination}`}`, isManual: false,
            });
        };
        point(r.origin, 'rt_origin', r.departureDate || r.date, r.originLat || r.lat, r.originLng || r.lng);
        point(r.destination, 'rt_dest', r.arrivalDate || r.date, r.destLat || r.lat, r.destLng || r.lng);
        r.waypoints?.forEach((wp: any) => point(wp.name, `rt_wp_${wp.id || ''}`, wp.visitDate || r.departureDate || r.date, wp.coordinates?.lat, wp.coordinates?.lng));
    });

    flights.filter(f => f.status !== 'Cancelled').forEach(f => {
        const name = f.destCity || f.destination;
        if (!name) return;
        const code = (f.destCountryCode || 'XX').toUpperCase();
        const city = cleanCityName(name, f.destCountryCode);
        add(keyOf(city, code), {
            id: `flight_city_${keyOf(city, code)}`, type: 'city', code, name: formatPlaceName(city), countryCode: code,
            countryName: f.destCountry ? formatPlaceName(f.destCountry) : undefined, visitDate: f.arrivalDate || f.date,
            lat: f.destLat, lng: f.destLng, notes: `Flight to ${f.destination || city}`, isManual: false,
        });
    });

    return mergeCityRecords(Array.from(cityMap.values()), { resolveAirport: resolveAirportCity });
};

/** Merged records carry bookkeeping ids; never persist them. */
export const toStored = (item: VisitedItem): VisitedItem => {
    const { duplicateIds: _dup, ...rest } = item as MergedCountry;
    return rest;
};

/** The stored duplicates a merged record stands for (to delete alongside it). */
export const duplicateIdsOf = (item: VisitedItem, visited: VisitedItem[]) => {
    const stored = new Set(visited.map(v => v.id));
    return ((item as MergedCountry).duplicateIds || []).filter(id => stored.has(id));
};

/** A wishlist or layover country becomes a visited one, keeping any lived statuses. */
export const promoteToVisited = (item: VisitedItem, keepDate: boolean): VisitedItem => {
    const next = statuses(item).filter(s => s !== 'wishlist' && s !== 'layover');
    const list: CountryResidenceStatus[] = next.length > 0 ? next : ['visited'];
    return {
        ...toStored(item),
        residenceStatus: list[0],
        residenceStatuses: list,
        isTransit: false,
        visitDate: keepDate ? item.visitDate || today() : today(),
    };
};

export interface CountryDraft {
    code: string;
    name: string;
    statuses: CountryResidenceStatus[];
    visitDate?: string;
    notes?: string;
}

/** The record to store for a country, reusing an existing record for the same country. */
export const countryRecordFor = (draft: CountryDraft, visited: VisitedItem[], editing?: VisitedItem): { record: VisitedItem; existing?: VisitedItem } => {
    const code = normalizeCountryCode(draft.code);
    const list: CountryResidenceStatus[] = draft.statuses.length > 0 ? draft.statuses : ['visited'];
    const existing = editing ? undefined : findCountryRecord(visited, code, draft.name);
    const target = editing || existing;
    return {
        existing: target,
        record: {
            ...(target ? toStored(target) : {}),
            id: target?.id || countryId(code),
            type: 'country',
            code,
            name: canonicalCountryName(code, draft.name),
            visitDate: draft.visitDate,
            notes: draft.notes,
            isTransit: list.includes('layover'),
            residenceStatus: list[0],
            residenceStatuses: list,
            excluded: false,
            isManual: target ? target.isManual : true,
        },
    };
};

export interface CityDraft {
    name: string;
    countryCode: string;
    countryName: string;
    visitDate?: string;
    notes?: string;
    lat?: number;
    lng?: number;
}

/** The record to store for a city, geocoding it when no coordinates are given. */
export const cityRecordFor = async (draft: CityDraft, editing?: VisitedItem): Promise<VisitedItem> => {
    let { lat, lng } = draft;
    if (lat === undefined || lng === undefined || Number.isNaN(lat) || Number.isNaN(lng)) {
        const coords = await getCoordinates(`${draft.name}, ${draft.countryName}`).catch(() => undefined);
        if (coords) { lat = coords.lat; lng = coords.lng; }
    }
    return {
        ...(editing ? toStored(editing) : {}),
        id: editing?.id || `city_${draft.name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`,
        type: 'city',
        code: draft.name,
        name: draft.name,
        countryCode: normalizeCountryCode(draft.countryCode),
        countryName: draft.countryName,
        lat,
        lng,
        visitDate: draft.visitDate,
        notes: draft.notes,
        isManual: editing ? editing.isManual : true,
    };
};

/** Resolves free text ("Porto, Portugal") to a city draft, or null when nothing matches. */
export const resolveCityText = async (text: string): Promise<CityDraft | null> => {
    const res = await resolvePlaceName(text.trim()).catch(() => null);
    if (!res?.city) return null;
    const code = normalizeCountryCode(res.countryCode || 'XX');
    return {
        name: cleanCityName(res.city, code),
        countryCode: code,
        countryName: code !== 'XX' ? canonicalCountryName(code, res.country || '') : res.country || '',
        visitDate: today(),
    };
};

/**
 * Looks through flights, road trips and past trips for countries and cities not in the atlas yet.
 * Places the user explicitly cleared are skipped.
 */
export const scanHistory = async (
    visited: VisitedItem[], countryRecords: VisitedItem[], trips: Trip[], flights: any[], roadTrips: any[]
): Promise<ScanResult> => {
    const knownCountries = new Set([...countryRecords.map(c => normalizeCountryCode(c.code)), ...excludedCountryCodes(visited)]);
    const cities = visited.filter(item => item.type === 'city');
    const knownCityKeys = new Set(cities.map(c => `${cleanCityName(c.name, c.countryCode).toLowerCase()}_${(c.countryCode || '').toLowerCase()}`));
    const knownCityNames = new Set(cities.map(c => cleanCityName(c.name, c.countryCode).toLowerCase()));
    const foundCountries: Record<string, ScanCountry> = {};
    const foundCities: Record<string, ScanCity> = {};

    const register = async (raw: string | undefined, source: AtlasSource, date?: string, latFallback?: number, lngFallback?: number) => {
        if (!raw || typeof raw !== 'string' || !raw.trim()) return;
        const res = await resolvePlaceName(raw.trim()).catch(() => null);
        if (!res?.city) return;
        const code = normalizeCountryCode(res.countryCode || 'XX');
        const city = cleanCityName(res.city, code);
        const countryName = code !== 'XX' ? canonicalCountryName(code, res.country || 'Unknown') : res.country || 'Unknown';
        const key = `${city.toLowerCase()}_${code.toLowerCase()}`;
        const when = date || today();
        if (code !== 'XX' && !knownCountries.has(code) && !foundCountries[code]) {
            foundCountries[code] = { code, name: countryName, source, date: when };
        }
        if (!knownCityKeys.has(key) && !knownCityNames.has(city.toLowerCase()) && !foundCities[key]) {
            const coords = (res as any).coordinates || res;
            foundCities[key] = {
                name: city, countryCode: code, countryName, source, date: when,
                lat: latFallback ?? coords?.lat,
                lng: lngFallback ?? coords?.lng ?? coords?.lon,
            };
        }
    };

    for (const f of flights) {
        if (!f || f.status === 'Cancelled') continue;
        if (f.origin && !f.layover) await register(f.origin, 'flight', f.departureDate || f.date, f.originLat, f.originLng);
        if (f.destination) await register(f.destination, f.isLayover ? 'layover' : 'flight', f.arrivalDate || f.date, f.destLat, f.destLng);
    }
    for (const r of roadTrips) {
        if (!r || r.status === 'Cancelled') continue;
        if (r.origin) await register(r.origin, 'roadtrip', r.departureDate || r.date, r.originLat || r.lat, r.originLng || r.lng);
        if (r.destination) await register(r.destination, 'roadtrip', r.arrivalDate || r.date, r.destLat || r.lat, r.destLng || r.lng);
    }
    for (const t of trips.filter(t => t.status !== 'Planning' && t.status !== 'Cancelled')) {
        if (t.location) await register(t.location, 'trip', t.endDate, t.coordinates?.lat, t.coordinates?.lng);
        for (const l of t.locations || []) if (l.name) await register(l.name, 'trip', t.endDate, l.coordinates?.lat, l.coordinates?.lng);
    }
    return { countries: Object.values(foundCountries), cities: Object.values(foundCities) };
};

/** Records to bulk-insert for the chosen scan suggestions (re-checked against current data). */
export const scanImportRecords = async (
    scan: ScanResult, chosenCountries: Set<string>, chosenCities: Set<string>, countryRecords: VisitedItem[]
): Promise<VisitedItem[]> => {
    const out: VisitedItem[] = [];
    for (const c of scan.countries) {
        if (!chosenCountries.has(c.code) || findCountryRecord(countryRecords, c.code, c.name)) continue;
        out.push({
            id: countryId(c.code), type: 'country', code: normalizeCountryCode(c.code), name: canonicalCountryName(c.code, c.name),
            visitDate: c.date, isTransit: c.source === 'layover', isManual: false, notes: `Found in your ${c.source === 'roadtrip' ? 'road trip' : c.source} history`,
        });
    }
    for (const c of scan.cities) {
        if (!chosenCities.has(cityScanKey(c))) continue;
        let { lat, lng } = c;
        if (!lat || !lng) {
            const coords = await getCoordinates(`${c.name}, ${c.countryName}`).catch(() => undefined);
            if (coords) { lat = coords.lat; lng = coords.lng; }
        }
        out.push({
            id: `city_${c.name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}_${out.length}`, type: 'city', code: c.name, name: c.name,
            countryCode: c.countryCode, countryName: c.countryName, lat, lng, visitDate: c.date, isManual: false,
            notes: `Found in your ${c.source === 'roadtrip' ? 'road trip' : c.source} history`,
        });
    }
    return out;
};

export const cityScanKey = (c: { name: string; countryCode: string }) => `${c.name.toLowerCase()}_${c.countryCode.toLowerCase()}`;
