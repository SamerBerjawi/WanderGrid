/**
 * Unified place search for WanderGrid: cities, airports, stations and POIs.
 *
 * Design goals
 *  - FAST: a local index answers synchronously (0 ms), providers run in parallel, partial results are streamed to the
 *    caller as they arrive and the final promise settles as soon as the good answers are in.
 *  - ACCURATE: results are ranked (exact name > prefix > population / place rank > kind intent > country hint >
 *    proximity bias) instead of trusting whichever provider answers first, and a "City, Country" query keeps its
 *    country hint so "Malmö, Sweden" can never resolve to another Swedish city.
 *  - EXACT: every suggestion that is shown is remembered in a label -> place registry, so resolving the label the
 *    user picked returns the very same coordinates instead of re-geocoding free text.
 */
import { STATIC_GEO_DATA, cleanCityName } from './geocoding';

export type PlaceKind = 'city' | 'airport' | 'station' | 'poi' | 'region' | 'country';
export type SearchMode = 'auto' | 'airport' | 'station' | 'bus' | 'address';

export interface Place {
    id: string;
    label: string;
    name: string;
    subtitle: string;
    kind: PlaceKind;
    lat: number;
    lng: number;
    country: string;
    countryCode: string;
    admin1?: string;
    tz?: string;
    iata?: string;
    population?: number;
    /** Importance hint for providers that give no population (OSM place=city/town/village...). */
    rank?: number;
    provider: string;
    viewport?: [number, number, number, number];
    score: number;
}

/** Provider-normalised record, identical for the backend proxy and the direct browser fallback. */
export interface RawPlace {
    name: string;
    latitude: number;
    longitude: number;
    country?: string;
    country_code?: string;
    admin1?: string;
    timezone?: string;
    population?: number;
    provider: string;
    feature_code?: string;
    osm_key?: string;
    osm_value?: string;
    ptype?: string;
    locality?: string;
    street?: string;
    housenumber?: string;
    viewport?: [number, number, number, number];
    /** Verified IATA code when the provider knows it (airport database). */
    iata?: string;
}

export interface SearchOptions {
    mode?: SearchMode;
    bias?: { lat?: number; lon?: number };
    /** Called every time a better merged result list is available (first call is the instant local tier). */
    onUpdate?: (places: Place[]) => void;
    limit?: number;
}

// ---------------------------------------------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------------------------------------------

const CHAR_FOLD: Record<string, string> = { 'ø': 'o', 'æ': 'ae', 'œ': 'oe', 'ł': 'l', 'đ': 'd', 'ð': 'd', 'þ': 'th', 'ı': 'i', 'ß': 'ss' };

export function norm(input?: string): string {
    if (!input) return '';
    return input
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[øæœłđðþıß]/g, c => CHAR_FOLD[c] || c)
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

const AIRPORT_WORDS = /\b(airport|airfield|aerodrome|airbase|airstrip|flughafen|aeroport|aeropuerto|aeroporto|flygplats|lufthavn|lotnisko|letiste)\b/g;
const STATION_WORDS = /\b(station|stn|railway|rail|train|gare|bahnhof|hbf|hauptbahnhof|centraal|central|stazione|estacion|estacao|stasjon|termini|bus|coach|terminal)\b/g;

function stripWords(normalizedQuery: string, re: RegExp): string {
    const stripped = normalizedQuery.replace(re, ' ').replace(/\s+/g, ' ').trim();
    return stripped.length >= 2 ? stripped : normalizedQuery;
}

const toRad = (d: number) => (d * Math.PI) / 180;
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const validCoord = (lat: number, lng: number) =>
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0);

const UK_NATIONS: Record<string, string> = {
    england: 'GB-ENG',
    scotland: 'GB-SCT',
    wales: 'GB-WLS',
    'northern ireland': 'GB-NIR'
};

// ---------------------------------------------------------------------------------------------------------------
// Picked-place registry (label -> exact place)
// ---------------------------------------------------------------------------------------------------------------

const REGISTRY_KEY = 'wandergrid_place_registry_v1';
const REGISTRY_MAX = 800;
const registry = new Map<string, Place>();
let registryLoaded = false;
let registryTimer: ReturnType<typeof setTimeout> | null = null;

export function cleanLabel(label: string): string {
    return (label || '').replace(/^📍\s*/, '').replace(/\s*\(Google Maps\)$/i, '').trim();
}

function loadRegistry() {
    if (registryLoaded) return;
    registryLoaded = true;
    try {
        if (typeof localStorage === 'undefined') return;
        const raw = localStorage.getItem(REGISTRY_KEY);
        if (!raw) return;
        const entries: Array<[string, Place]> = JSON.parse(raw);
        for (const [k, v] of entries) {
            if (v && validCoord(v.lat, v.lng)) registry.set(k, v);
        }
    } catch { /* ignore corrupt registry */ }
}

function persistRegistry() {
    if (registryTimer) clearTimeout(registryTimer);
    registryTimer = setTimeout(() => {
        registryTimer = null;
        try {
            localStorage.setItem(REGISTRY_KEY, JSON.stringify(Array.from(registry.entries())));
        } catch { /* quota */ }
    }, 800);
}

export function rememberPlaces(places: Place[]) {
    loadRegistry();
    for (const p of places) {
        const key = norm(p.label);
        if (!key) continue;
        registry.delete(key);
        registry.set(key, p);
        if (p.iata) {
            // Allow resolving the bare IATA code to the airport itself
            registry.set(`iata:${p.iata}`, p);
        }
    }
    while (registry.size > REGISTRY_MAX) {
        const oldest = registry.keys().next().value;
        if (oldest === undefined) break;
        registry.delete(oldest);
    }
    persistRegistry();
}

export function lookupPlaceByLabel(label: string): Place | undefined {
    loadRegistry();
    const key = norm(cleanLabel(label));
    return key ? registry.get(key) : undefined;
}

// ---------------------------------------------------------------------------------------------------------------
// Local (offline, synchronous) index built from the static dataset
// ---------------------------------------------------------------------------------------------------------------

interface LocalEntry {
    kind: 'airport' | 'city';
    iata?: string;
    name: string;
    city: string;
    country: string;
    countryCode: string;
    lat: number;
    lng: number;
    tz?: string;
    nName: string;
    nCity: string;
}

let localIndex: LocalEntry[] | null = null;

function getLocalIndex(): LocalEntry[] {
    if (localIndex) return localIndex;
    const entries: LocalEntry[] = [];
    for (const [key, ap] of Object.entries(STATIC_GEO_DATA as Record<string, any>)) {
        const lat = parseFloat(ap.lat);
        const lng = parseFloat(ap.lon ?? ap.lng);
        if (!validCoord(lat, lng)) continue;
        const isIata = /^[A-Z]{3}$/.test(key);
        const country = ap.country || '';
        // Country-level placeholder rows ("Sweden") carry an arbitrary representative point: never offer them as places.
        if (!isIata && norm(key) === norm(country)) continue;
        const city = ap.city || key;
        entries.push({
            kind: isIata ? 'airport' : 'city',
            iata: isIata ? key : undefined,
            name: isIata ? (ap.name || `${city} Airport`) : city,
            city,
            country,
            countryCode: ap.iso || '',
            lat,
            lng,
            tz: ap.tz,
            nName: norm(isIata ? (ap.name || '') : city),
            nCity: norm(city)
        });
    }
    localIndex = entries;
    return entries;
}

function findNearbyIata(lat: number, lng: number, countryCode?: string): LocalEntry | undefined {
    let best: LocalEntry | undefined;
    let bestDist = 12; // km
    for (const e of getLocalIndex()) {
        if (e.kind !== 'airport') continue;
        const d = distanceKm(lat, lng, e.lat, e.lng);
        if (d < bestDist) {
            bestDist = d;
            best = e;
        }
    }
    return best;
}

function localMatches(nq: string, queryUpper: string): RawPlaceLike[] {
    const out: RawPlaceLike[] = [];
    if (nq.length < 2) return out;
    const isIataQuery = /^[A-Z]{3}$/.test(queryUpper);
    for (const e of getLocalIndex()) {
        let hit = false;
        if (e.kind === 'airport' && isIataQuery && e.iata === queryUpper) hit = true;
        else if (nq.length >= 3) {
            const words = (e.nName + ' ' + e.nCity).split(' ');
            hit = e.nName.startsWith(nq) || e.nCity.startsWith(nq) || words.some(w => w.length > 2 && w.startsWith(nq));
        }
        if (hit) out.push({ entry: e });
    }
    return out;
}

interface RawPlaceLike { entry: LocalEntry }

// ---------------------------------------------------------------------------------------------------------------
// Classification + place construction
// ---------------------------------------------------------------------------------------------------------------

function classify(raw: RawPlace): PlaceKind {
    const fc = raw.feature_code || '';
    const key = raw.osm_key || '';
    const val = raw.osm_value || '';
    const ptype = raw.ptype || '';

    if (key === 'aeroway' || fc === 'AIRP' || fc === 'AIRF') return 'airport';
    if (key === 'railway' && (val === 'station' || val === 'halt')) return 'station';
    if (key === 'public_transport' && val === 'station') return 'station';
    if (key === 'amenity' && val === 'bus_station') return 'station';
    if (key === 'building' && val === 'train_station') return 'station';
    if (key === 'place') {
        if (val === 'country') return 'country';
        if (['state', 'region', 'province', 'county', 'district'].includes(val)) return 'region';
        return 'city';
    }
    if (fc.startsWith('PPL')) return 'city';
    if (fc.startsWith('PCL')) return 'country';
    if (fc.startsWith('ADM')) return 'region';
    if (key === 'boundary') return ptype === 'country' ? 'country' : ptype === 'state' || ptype === 'county' ? 'region' : 'city';
    if (ptype === 'city') return 'city';
    if (ptype === 'state' || ptype === 'county') return 'region';
    if (ptype === 'country') return 'country';
    return 'poi';
}

/** Rank of an OSM place value when the provider gives no population. */
const OSM_PLACE_RANK: Record<string, number> = { city: 34, town: 24, municipality: 20, borough: 14, suburb: 12, village: 10, quarter: 8, neighbourhood: 6, hamlet: 3, locality: 3 };

function resolveCountry(raw: RawPlace): { country: string; countryCode: string } {
    let country = raw.country || '';
    let countryCode = (raw.country_code || '').toUpperCase();
    if (countryCode === 'GB' || countryCode === 'UK') {
        const nation = [raw.admin1, raw.country].map(v => norm(v)).find(v => UK_NATIONS[v]);
        if (nation) {
            country = nation.replace(/\b\w/g, c => c.toUpperCase());
            countryCode = UK_NATIONS[nation];
        }
    }
    return { country, countryCode };
}

function buildPlaceFromRaw(raw: RawPlace): Place | null {
    const lat = Number(raw.latitude);
    const lng = Number(raw.longitude);
    if (!raw.name || !validCoord(lat, lng)) return null;

    const kind = classify(raw);
    const { country, countryCode } = resolveCountry(raw);
    const admin1 = raw.admin1 || '';
    let name = raw.name.trim();
    let label: string;
    let subtitle = [admin1, country].filter(Boolean).join(', ');
    let iata: string | undefined;
    let tz = raw.timezone;

    if (kind === 'city') {
        name = cleanCityName(name, countryCode, admin1) || name;
        label = country ? `${name}, ${country}` : name;
    } else if (kind === 'country') {
        label = name;
    } else if (kind === 'region') {
        label = country && norm(country) !== norm(name) ? `${name}, ${country}` : name;
    } else {
        // Airports, stations and POIs keep their full name: never run them through the city cleaner
        // (it strips "Airport" / "Station" and would make them collide with the city itself).
        let displayName = name;
        if (kind === 'airport') {
            const near = raw.iata ? getLocalIndex().find(e => e.iata === raw.iata) || findNearbyIata(lat, lng, countryCode) : findNearbyIata(lat, lng, countryCode);
            if (raw.iata) {
                iata = raw.iata;
                if (near && near.iata === raw.iata) { tz = tz || near.tz; displayName = near.name; }
            } else if (near && near.iata) {
                iata = near.iata;
                tz = tz || near.tz;
                displayName = near.name;
            }
        }
        const locality = raw.locality && norm(raw.locality) !== norm(displayName) && !norm(displayName).includes(norm(raw.locality))
            ? raw.locality
            : (kind === 'airport' && iata ? (getLocalIndex().find(e => e.iata === iata)?.city || '') : '');
        const parts = [displayName, locality, country].filter(Boolean);
        label = iata ? `${iata} - ${parts.join(', ')}` : parts.join(', ');
        name = displayName;
        subtitle = [locality, admin1, country].filter(Boolean).join(', ');
    }

    return {
        id: `${lat.toFixed(5)}:${lng.toFixed(5)}:${norm(label)}`,
        label,
        name,
        subtitle,
        kind,
        lat,
        lng,
        country,
        countryCode,
        admin1: admin1 || undefined,
        tz,
        iata,
        population: raw.population || undefined,
        rank: OSM_PLACE_RANK[raw.osm_value || ''] ?? (raw.ptype === 'city' ? 30 : undefined),
        provider: raw.provider,
        viewport: raw.viewport,
        score: 0
    };
}

function buildPlaceFromLocal(e: LocalEntry): Place {
    const iata = e.iata;
    const label = iata
        ? `${iata} - ${e.name}, ${e.city}, ${e.country}`
        : `${cleanCityName(e.city, e.countryCode)}, ${e.country}`;
    return {
        id: `${e.lat.toFixed(5)}:${e.lng.toFixed(5)}:${norm(label)}`,
        label,
        name: iata ? e.name : cleanCityName(e.city, e.countryCode),
        subtitle: e.country,
        kind: e.kind,
        lat: e.lat,
        lng: e.lng,
        country: e.country,
        countryCode: e.countryCode,
        tz: e.tz,
        iata,
        provider: 'local',
        score: 0
    };
}

// ---------------------------------------------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------------------------------------------

interface QueryProfile {
    raw: string;
    nMain: string;
    nHint: string;
    tokens: string[];
    upper: string;
    mode: SearchMode;
    airportIntent: boolean;
    stationIntent: boolean;
    bias?: { lat: number; lon: number };
}

const AIRPORT_TEST = new RegExp(AIRPORT_WORDS.source);
const STATION_TEST = new RegExp(STATION_WORDS.source);
const GENERIC_WORDS = new RegExp(`${AIRPORT_WORDS.source}|${STATION_WORDS.source}`, 'g');

function profileQuery(query: string, mode: SearchMode, bias?: { lat?: number; lon?: number }): QueryProfile {
    const cleaned = cleanLabel(query);
    const parts = cleaned.split(',').map(s => s.trim()).filter(Boolean);
    const nMain = norm(parts[0] || cleaned);
    const nHint = norm(parts.slice(1).join(' '));
    const airportIntent = mode === 'airport' || AIRPORT_TEST.test(nMain);
    const stationIntent = mode === 'station' || mode === 'bus' || STATION_TEST.test(nMain);
    const tokens = nMain.replace(GENERIC_WORDS, ' ').split(' ').filter(t => t.length > 0);
    return {
        raw: cleaned,
        nMain,
        nHint,
        tokens: tokens.length ? tokens : nMain.split(' ').filter(Boolean),
        upper: cleaned.toUpperCase(),
        mode,
        airportIntent,
        stationIntent,
        bias: bias && Number.isFinite(bias.lat) && Number.isFinite(bias.lon) ? { lat: bias.lat as number, lon: bias.lon as number } : undefined
    };
}

function scorePlace(p: Place, q: QueryProfile): number {
    const nName = norm(p.name);
    const nLabelName = norm(p.label.replace(/^[A-Z]{3}\s*-\s*/, '').split(',')[0]);
    let s = 0;

    // 1. Name relevance (compared with generic words like "airport"/"station" removed on both sides)
    const target = q.tokens.join(' ');
    const core = (v: string) => v.replace(GENERIC_WORDS, ' ').replace(/\s+/g, ' ').trim() || v;
    const cName = core(nName);
    const cLabel = core(nLabelName);
    if (cName === target || cLabel === target || nName === q.nMain || nLabelName === q.nMain) s += 100;
    else if (cName.startsWith(target) || cLabel.startsWith(target)) s += 62;
    else if ((' ' + cName).includes(' ' + target) || (' ' + cLabel).includes(' ' + target)) s += 56;
    else if (cName.includes(target)) s += 16;
    else if (target.startsWith(cName) && cName.length >= 3) s += 22;

    // 2. Token coverage over name + locality + region + country (kills irrelevant provider noise)
    const haystack = norm(`${p.name} ${p.subtitle} ${p.label}`);
    let covered = 0;
    q.tokens.forEach((t, i) => {
        const isLast = i === q.tokens.length - 1;
        if ((' ' + haystack).includes(' ' + t) || (isLast && haystack.includes(t))) covered++;
    });
    const coverage = q.tokens.length ? covered / q.tokens.length : 1;
    s += coverage * 30;
    if (coverage === 0) s -= 90;

    // 3. Importance: population, else OSM place rank
    if (p.population && p.population > 0) s += Math.log10(p.population + 10) * 9;
    else if (p.kind === 'city') s += p.rank ?? 6;

    // 4. Kind intent
    // Tiny localities must not outrank real destinations: the city bonus scales with importance.
    const importance = p.population ?? 0;
    const cityBoost = importance >= 100_000 || (p.rank ?? 0) >= 30 ? 24 : importance >= 10_000 || (p.rank ?? 0) >= 20 ? 16 : 6;
    const intentBoost: Record<PlaceKind, number> = { city: cityBoost, region: 6, country: 12, airport: 10, station: 10, poi: 4 };
    if (q.mode === 'airport') s += p.kind === 'airport' ? 90 : -40;
    else if (q.mode === 'station' || q.mode === 'bus') s += p.kind === 'station' ? 90 : -40;
    else if (q.mode === 'address') s += p.kind === 'poi' ? 22 : p.kind === 'city' ? 10 : 0;
    else {
        s += intentBoost[p.kind];
        if (q.airportIntent && p.kind === 'airport') s += 70;
        if (q.stationIntent && p.kind === 'station') s += 70;
    }

    // 5. Verified airports (known IATA code) are what travellers mean; unverified airstrips rank below
    if (p.kind === 'airport' && p.iata) s += 45;
    // Exact IATA
    if (p.iata && q.raw.length === 3 && p.iata === q.upper) s += 250;

    // 6. Country / region hint from "City, Country"
    if (q.nHint) {
        const hay = [p.country, p.countryCode, p.admin1].map(v => norm(v));
        const hintTokens = q.nHint.split(' ').filter(Boolean);
        const matched = hay.some(h => h && (h === q.nHint || (h.length > 2 && q.nHint.includes(h)) || (q.nHint.length > 2 && h.startsWith(q.nHint)))) ||
            (hintTokens.length > 0 && hintTokens.every(t => hay.some(h => h && h.split(' ').includes(t))));
        s += matched ? 85 : -70;
    }

    // 7. Proximity bias (e.g. the trip destination when adding legs inside it)
    if (q.bias) {
        const d = distanceKm(q.bias.lat, q.bias.lon, p.lat, p.lng);
        if (d < 60) s += 28;
        else if (d < 300) s += 14;
        else if (d < 1000) s += 5;
    }

    // 8. Tiny provider trust tie-breaker
    if (p.provider === 'local') s += 3;
    return s;
}

const SAME_PLACE_KM: Record<PlaceKind, number> = { airport: 8, station: 1.2, poi: 0.4, city: 25, region: 80, country: 500 };

function mergeAndRank(candidates: Place[], q: QueryProfile, limit: number): Place[] {
    candidates.forEach(p => { p.score = scorePlace(p, q); });
    candidates.sort((a, b) => b.score - a.score);

    const kept: Place[] = [];
    for (const p of candidates) {
        const dup = kept.find(k =>
            k.kind === p.kind &&
            (k.kind !== 'city' || norm(k.name) === norm(p.name)) &&
            distanceKm(k.lat, k.lng, p.lat, p.lng) < SAME_PLACE_KM[p.kind]
        );
        if (dup) {
            // Keep the richer record (IATA / timezone / population) but the better-ranked position
            if (!dup.iata && p.iata) { dup.iata = p.iata; dup.label = p.label; }
            if (!dup.tz && p.tz) dup.tz = p.tz;
            if (!dup.population && p.population) dup.population = p.population;
            if (dup.rank === undefined && p.rank !== undefined) dup.rank = p.rank;
            if (!dup.viewport && p.viewport) dup.viewport = p.viewport;
            continue;
        }
        kept.push({ ...p });
    }

    // Disambiguate identical labels (e.g. several "Springfield, United States")
    const seen = new Map<string, number>();
    for (const p of kept) {
        const key = norm(p.label);
        const n = seen.get(key) || 0;
        seen.set(key, n + 1);
        if (n > 0) {
            const extra = p.admin1 && !norm(p.label).includes(norm(p.admin1)) ? p.admin1 : `${p.lat.toFixed(2)}, ${p.lng.toFixed(2)}`;
            const parts = p.label.split(', ');
            parts.splice(Math.max(1, parts.length - 1), 0, extra);
            p.label = parts.join(', ');
        }
    }
    return kept.slice(0, limit);
}

// ---------------------------------------------------------------------------------------------------------------
// Providers (backend proxy first, direct browser fallback)
// ---------------------------------------------------------------------------------------------------------------

const PROVIDER_TIMEOUT_MS = 3000;
let backendDownUntil = 0;

async function fetchJson(url: string, timeoutMs: number, withAuth: boolean): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const headers: Record<string, string> = {};
        if (withAuth && typeof localStorage !== 'undefined') {
            const token = localStorage.getItem('wandergrid_session_token');
            if (token) headers['Authorization'] = `Bearer ${token}`;
        }
        const res = await fetch(url, { signal: controller.signal, headers });
        if (!res.ok) {
            const err: any = new Error(`HTTP ${res.status}`);
            err.status = res.status;
            throw err;
        }
        return await res.json();
    } finally {
        clearTimeout(timer);
    }
}

type ProviderName = 'open-meteo' | 'photon' | 'nominatim';

async function viaBackend(provider: ProviderName, q: string, bias?: QueryProfile['bias'], tag?: string): Promise<RawPlace[] | null> {
    if (Date.now() < backendDownUntil) return null;
    let url = `/api/geocode/search?provider=${provider}&q=${encodeURIComponent(q)}`;
    if (bias) url += `&lat=${bias.lat}&lon=${bias.lon}`;
    if (tag) url += `&tag=${encodeURIComponent(tag)}`;
    try {
        const data = await fetchJson(url, PROVIDER_TIMEOUT_MS + 500, true);
        if (data && Array.isArray(data.results)) return data.results as RawPlace[];
        backendDownUntil = Date.now() + 60_000;
        return null;
    } catch (e: any) {
        // Backend missing / crashed: stop paying the round-trip on every keystroke for a minute.
        if (!e || e.status === undefined || e.status >= 500 || e.status === 404) backendDownUntil = Date.now() + 60_000;
        return null;
    }
}

function splitMain(q: string): string {
    return (q.split(',')[0] || q).trim();
}

async function directOpenMeteo(q: string): Promise<RawPlace[]> {
    const main = splitMain(q);
    if (main.length < 2) return [];
    const data = await fetchJson(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(main)}&count=10&language=en&format=json`,
        PROVIDER_TIMEOUT_MS,
        false
    );
    return (data?.results || []).map((r: any): RawPlace => ({
        name: r.name,
        latitude: r.latitude,
        longitude: r.longitude,
        country: r.country || '',
        country_code: (r.country_code || '').toUpperCase(),
        timezone: r.timezone,
        admin1: r.admin1 || '',
        population: r.population || 0,
        feature_code: r.feature_code || '',
        provider: 'open-meteo'
    }));
}

async function directPhoton(q: string, bias?: QueryProfile['bias'], tag?: string): Promise<RawPlace[]> {
    let url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lang=en`;
    if (bias) url += `&lat=${bias.lat}&lon=${bias.lon}`;
    if (tag) url += `&osm_tag=${encodeURIComponent(tag)}`;
    const data = await fetchJson(url, PROVIDER_TIMEOUT_MS, false);
    return (data?.features || []).map((f: any): RawPlace => {
        const p = f.properties || {};
        const g = f.geometry?.coordinates || [];
        let viewport: RawPlace['viewport'];
        if (Array.isArray(p.extent) && p.extent.length === 4) {
            const [west, north, east, south] = p.extent;
            if (west <= east && south <= north) viewport = [west, south, east, north];
        }
        return {
            name: p.name || p.street || p.city || q,
            latitude: g[1],
            longitude: g[0],
            country: p.country || '',
            country_code: (p.countrycode || '').toUpperCase(),
            admin1: p.state || '',
            locality: p.city || p.town || p.village || p.municipality || p.district || p.county || '',
            street: p.street || '',
            housenumber: p.housenumber || '',
            osm_key: p.osm_key || '',
            osm_value: p.osm_value || '',
            ptype: p.type || '',
            provider: 'photon',
            viewport
        };
    });
}

async function directNominatim(q: string): Promise<RawPlace[]> {
    const data = await fetchJson(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q)}&addressdetails=1&limit=5&accept-language=en`,
        PROVIDER_TIMEOUT_MS,
        false
    );
    return (Array.isArray(data) ? data : []).map((r: any): RawPlace => {
        const a = r.address || {};
        return {
            name: r.name || a.city || a.town || a.village || String(r.display_name || '').split(',')[0],
            latitude: parseFloat(r.lat),
            longitude: parseFloat(r.lon),
            country: a.country || '',
            country_code: (a.country_code || '').toUpperCase(),
            admin1: a.state || a.province || '',
            locality: a.city || a.town || a.village || '',
            osm_key: r.category || '',
            osm_value: r.type || '',
            ptype: r.addresstype || '',
            provider: 'nominatim'
        };
    });
}

/** Backend airport database (names + IATA) joined with runway-derived coordinates: broad airport-name coverage. */
async function searchAirportDb(q: string): Promise<RawPlace[]> {
    if (Date.now() < backendDownUntil) return [];
    try {
        const rows = await fetchJson(`/api/airports/search?q=${encodeURIComponent(q)}`, PROVIDER_TIMEOUT_MS, true);
        if (!Array.isArray(rows) || rows.length === 0) return [];
        const { getPhysicalRunways } = await import('./airportRunways');
        const runways = await getPhysicalRunways();
        const out: RawPlace[] = [];
        for (const r of rows) {
            const code = String(r.iata || '').toUpperCase();
            const first = runways[code]?.[0];
            if (!first) continue;
            out.push({
                name: r.airport_name || `${r.city_name} Airport`,
                latitude: (first.start[1] + first.end[1]) / 2,
                longitude: (first.start[0] + first.end[0]) / 2,
                locality: r.city_name || '',
                osm_key: 'aeroway',
                osm_value: 'aerodrome',
                provider: 'airport-db',
                iata: code
            });
        }
        return out;
    } catch (e: any) {
        if (!e || e.status === undefined || e.status >= 500) backendDownUntil = Date.now() + 60_000;
        return [];
    }
}

async function runProvider(provider: ProviderName, q: string, bias?: QueryProfile['bias'], tag?: string): Promise<RawPlace[]> {
    const proxied = await viaBackend(provider, q, bias, tag);
    if (proxied) return proxied;
    try {
        if (provider === 'open-meteo') return await directOpenMeteo(q);
        if (provider === 'photon') return await directPhoton(q, bias, tag);
        return await directNominatim(q);
    } catch {
        return []; // fail-safe: never hang the UI on a provider outage
    }
}

// ---------------------------------------------------------------------------------------------------------------
// Public search API
// ---------------------------------------------------------------------------------------------------------------

const RESULT_CACHE = new Map<string, Place[]>();
const RESULT_CACHE_MAX = 300;
const INFLIGHT = new Map<string, Promise<Place[]>>();

function cacheKeyFor(q: QueryProfile): string {
    const b = q.bias ? `@${q.bias.lat.toFixed(1)},${q.bias.lon.toFixed(1)}` : '';
    return `${q.mode}|${norm(q.raw)}${b}`;
}

/** Synchronous, offline results – safe to call on every keystroke. */
export function searchPlacesLocal(query: string, opts: Pick<SearchOptions, 'mode' | 'bias' | 'limit'> = {}): Place[] {
    const q = profileQuery(query, opts.mode || 'auto', opts.bias);
    if (q.nMain.length < 2) return [];
    const base = localMatches(norm(q.raw.split(',')[0]), q.upper.split(',')[0].trim()).map(m => buildPlaceFromLocal(m.entry));
    return mergeAndRank(base, q, opts.limit || 8);
}

export async function searchPlaces(query: string, opts: SearchOptions = {}): Promise<Place[]> {
    const mode = opts.mode || 'auto';
    const q = profileQuery(query, mode, opts.bias);
    const limit = opts.limit || 8;
    if (q.nMain.length < 2) return [];

    const key = cacheKeyFor(q);
    const cached = RESULT_CACHE.get(key);
    if (cached) {
        opts.onUpdate?.(cached);
        return cached;
    }

    const arrived: Place[] = [];
    const emit = () => {
        const merged = mergeAndRank(arrived.map(p => ({ ...p })), q, limit);
        rememberPlaces(merged);
        opts.onUpdate?.(merged);
        return merged;
    };

    // Tier 0: instant local results
    const local = localMatches(norm(q.raw.split(',')[0]), q.upper.split(',')[0].trim()).map(m => buildPlaceFromLocal(m.entry));
    arrived.push(...local);
    let latest = local.length ? emit() : [];

    // Tier 1: parallel providers
    const main = splitMain(q.raw);
    const tasks: Array<{ name: string; promise: Promise<RawPlace[]>; critical: boolean }> = [];

    const photonQuery = q.raw;
    tasks.push({ name: 'meteo', critical: mode === 'auto' || mode === 'airport', promise: runProvider('open-meteo', q.raw, q.bias) });

    if (mode === 'airport' || q.airportIntent) {
        const stripped = stripWords(norm(main), AIRPORT_WORDS);
        tasks.push({ name: 'photon-airport', critical: mode === 'airport', promise: runProvider('photon', stripped, q.bias, 'aeroway:aerodrome') });
        tasks.push({ name: 'airport-db', critical: false, promise: searchAirportDb(stripped) });
    }
    if (mode === 'station' || mode === 'bus' || q.stationIntent) {
        const stripped = stripWords(norm(main), STATION_WORDS);
        const isStationMode = mode === 'station' || mode === 'bus';
        tasks.push({ name: 'photon-station', critical: isStationMode, promise: runProvider('photon', stripped, q.bias, mode === 'bus' ? 'amenity:bus_station' : 'railway:station') });
    }
    tasks.push({ name: 'photon', critical: mode === 'address', promise: runProvider('photon', photonQuery, q.bias) });

    const settled = new Set<string>();
    let gotRemote = false;
    await new Promise<void>(resolve => {
        const started = Date.now();
        let resolved = false;
        const finish = () => { if (!resolved) { resolved = true; resolve(); } };

        let graceTimer: ReturnType<typeof setTimeout> | null = null;
        const maybeFinish = () => {
            if (settled.size === tasks.length) return finish();
            const criticalDone = tasks.filter(t => t.critical).every(t => settled.has(t.name));
            // Good answers are in (critical providers done and something useful found): don't wait for slow stragglers
            // beyond a short grace window. Late results still land in the cache/registry for the next keystroke.
            if (criticalDone && gotRemote && !graceTimer) {
                graceTimer = setTimeout(finish, Math.max(0, 300 - (Date.now() - started)));
            }
        };

        for (const t of tasks) {
            t.promise.then(items => {
                const built = items.map(buildPlaceFromRaw).filter((p): p is Place => !!p);
                if (built.length) {
                    gotRemote = true;
                    arrived.push(...built);
                    latest = emit();
                }
            }).catch(() => { /* provider already fail-safes */ }).finally(() => {
                settled.add(t.name);
                maybeFinish();
            });
        }
        setTimeout(finish, PROVIDER_TIMEOUT_MS + 600);
    });

    // Last resort: Nominatim, only when everything else came back empty
    if (!gotRemote && local.length === 0) {
        const items = await runProvider('nominatim', q.raw);
        const built = items.map(buildPlaceFromRaw).filter((p): p is Place => !!p);
        if (built.length) {
            gotRemote = true;
            arrived.push(...built);
            latest = emit();
        }
    }

    // Stragglers (typically the slower Photon call) keep merging after we resolved, so the cache and the label registry
    // end up with the complete ranked list for the next keystroke / lookup.
    Promise.all(tasks.map(t => t.promise.catch(() => [] as RawPlace[]))).then(() => {
        const complete = mergeAndRank(arrived.map(p => ({ ...p })), q, limit);
        if (gotRemote && complete.length) {
            RESULT_CACHE.set(key, complete);
            rememberPlaces(complete);
        }
    });
    const final = mergeAndRank(arrived.map(p => ({ ...p })), q, limit);
    if (gotRemote) {
        if (RESULT_CACHE.size >= RESULT_CACHE_MAX) {
            const oldest = RESULT_CACHE.keys().next().value;
            if (oldest !== undefined) RESULT_CACHE.delete(oldest);
        }
        RESULT_CACHE.set(key, final);
    }
    return final.length ? final : latest;
}

/** The single best place for a free-text query (used when a typed, never-picked string must be resolved). */
export async function resolveBestPlace(query: string, opts: Omit<SearchOptions, 'onUpdate'> = {}): Promise<Place | undefined> {
    const key = cleanLabel(query);
    const picked = lookupPlaceByLabel(key);
    if (picked) return picked;
    if (INFLIGHT.has(key)) return (await INFLIGHT.get(key)!)[0];
    const p = searchPlaces(key, { ...opts, limit: 5 });
    INFLIGHT.set(key, p);
    try {
        return (await p)[0];
    } finally {
        INFLIGHT.delete(key);
    }
}
