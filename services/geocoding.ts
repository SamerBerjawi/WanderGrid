import { COUNTRY_REGION_MAP } from './geoData';

const CACHE_KEY = 'wandergrid_geo_cache_v3';
const GEO_DB_NAME = 'wandergrid_geo_db_v3';
const GEO_STORE_NAME = 'geo_entries';

let internalCache: Map<string, any> = new Map();
let isCacheLoaded = false;
let isIndexedDbLoaded = false;

let lastNetworkFetchTime = 0;

async function throttleNetwork() {
    const minInterval = 900; // ms
    const now = Date.now();
    const elapsed = now - lastNetworkFetchTime;
    if (elapsed < minInterval) {
        const delay = minInterval - elapsed;
        await new Promise(resolve => setTimeout(resolve, delay));
    }
    lastNetworkFetchTime = Date.now();
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs: number = 3000): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const customHeaders: Record<string, string> = { ...(options.headers as any) };
        if (url.startsWith('/api')) {
            const token = typeof window !== 'undefined' ? localStorage.getItem('wandergrid_session_token') : null;
            if (token && !customHeaders['Authorization']) {
                customHeaders['Authorization'] = `Bearer ${token}`;
            }
        }
        const response = await fetch(url, {
            ...options,
            headers: customHeaders,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
}

const cleanupContaminatedCache = () => {
    const contaminatedKeys = [
        'BER', 'BER AIRPORT', 'BERLIN', 'BERLIN, GERMANY', 'BERLIN BRANDENBURG', 'BERLIN BRANDENBURG AIRPORT (BER)',
        'MAN', 'MAN AIRPORT', 'MANCHESTER', 'MANCHESTER, UNITED KINGDOM', 'MANCHESTER AIRPORT (MAN)',
        'TUN', 'TUN AIRPORT', 'TUNIS', 'TUNIS, TUNISIA', 'TUNIS CARTHAGE', 'TUNIS CARTHAGE AIRPORT', 'TUNIS CARTHAGE AIRPORT (TUN)',
        'NAPLES', 'NAPOLI', 'CAPRI', 'VATICAN', 'VATICAN CITY', 'ROME', 'ROME, ITALY'
    ];
    let cleanedAny = false;
    contaminatedKeys.forEach(k => {
        if (internalCache.has(k)) {
            internalCache.delete(k);
            cleanedAny = true;
        }
        const u = k.toUpperCase();
        if (internalCache.has(u)) {
            internalCache.delete(u);
            cleanedAny = true;
        }
        const l = k.toLowerCase();
        if (internalCache.has(l)) {
            internalCache.delete(l);
            cleanedAny = true;
        }
    });
    if (cleanedAny) {
        saveCache();
    }
};

const loadCache = () => {
    if (isCacheLoaded) return;
    try {
        const stored = localStorage.getItem(CACHE_KEY);
        if (stored) internalCache = new Map(JSON.parse(stored));
    } catch (e) {}
    
    Object.keys(STATIC_GEO_DATA).forEach(key => {
        if (!internalCache.has(key)) internalCache.set(key, STATIC_GEO_DATA[key]);
    });
    cleanupContaminatedCache();
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
    try {
        const request = indexedDB.open(GEO_DB_NAME, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(GEO_STORE_NAME)) {
                db.createObjectStore(GEO_STORE_NAME, { keyPath: 'key' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
    } catch (e) {
        console.warn("IndexedDB access was blocked or threw an exception:", e);
        resolve(null);
    }
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
            cleanupContaminatedCache();
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

export const STATIC_GEO_DATA: Record<string, any> = {
    // Top Airports
    "AMS": { "lat": "52.3086", "lon": "4.7639", "name": "Schiphol", "city": "Amsterdam", "country": "Netherlands", "tz": "Europe/Amsterdam", "iso": "NL" },
    "LHR": { "lat": "51.4706", "lon": "-0.4619", "name": "Heathrow", "city": "London", "country": "England", "tz": "Europe/London", "iso": "GB-ENG" },
    "LGW": { "lat": "51.1537", "lon": "-0.1821", "name": "Gatwick Airport", "city": "London", "country": "England", "tz": "Europe/London", "iso": "GB-ENG" },
    "STN": { "lat": "51.8860", "lon": "0.2389", "name": "Stansted Airport", "city": "London", "country": "England", "tz": "Europe/London", "iso": "GB-ENG" },
    "LTN": { "lat": "51.8747", "lon": "-0.3683", "name": "Luton Airport", "city": "London", "country": "England", "tz": "Europe/London", "iso": "GB-ENG" },
    "BHX": { "lat": "52.4539", "lon": "-1.7480", "name": "Birmingham Airport", "city": "Birmingham", "country": "England", "tz": "Europe/London", "iso": "GB-ENG" },
    "EDI": { "lat": "55.9508", "lon": "-3.3725", "name": "Edinburgh Airport", "city": "Edinburgh", "country": "Scotland", "tz": "Europe/London", "iso": "GB-SCT" },
    "GLA": { "lat": "55.8719", "lon": "-4.4331", "name": "Glasgow Airport", "city": "Glasgow", "country": "Scotland", "tz": "Europe/London", "iso": "GB-SCT" },
    "CWL": { "lat": "51.3967", "lon": "-3.3433", "name": "Cardiff Airport", "city": "Cardiff", "country": "Wales", "tz": "Europe/London", "iso": "GB-WLS" },
    "BFS": { "lat": "54.6575", "lon": "-6.2158", "name": "Belfast Intl Airport", "city": "Belfast", "country": "Northern Ireland", "tz": "Europe/London", "iso": "GB-NIR" },
    "BHD": { "lat": "54.6181", "lon": "-5.8725", "name": "George Best Belfast City", "city": "Belfast", "country": "Northern Ireland", "tz": "Europe/London", "iso": "GB-NIR" },
    "JFK": { "lat": "40.6398", "lon": "-73.7789", "name": "John F Kennedy Intl", "city": "New York", "country": "United States", "tz": "America/New_York", "iso": "US" },
    "DXB": { "lat": "25.2528", "lon": "55.3644", "name": "Dubai Intl", "city": "Dubai", "country": "United Arab Emirates", "tz": "Asia/Dubai", "iso": "AE" },
    "CDG": { "lat": "49.0097", "lon": "2.5478", "name": "Charles De Gaulle", "city": "Paris", "country": "France", "tz": "Europe/Paris", "iso": "FR" },
    "FRA": { "lat": "50.0333", "lon": "8.5706", "name": "Frankfurt am Main", "city": "Frankfurt", "country": "Germany", "tz": "Europe/Berlin", "iso": "DE" },
    "BER": { "lat": "52.3667", "lon": "13.5033", "name": "Berlin Brandenburg", "city": "Berlin", "country": "Germany", "tz": "Europe/Berlin", "iso": "DE" },
    "VIE": { "lat": "48.1103", "lon": "16.5697", "name": "Vienna Intl", "city": "Vienna", "country": "Austria", "tz": "Europe/Vienna", "iso": "AT" },
    "SIN": { "lat": "1.3502", "lon": "103.994", "name": "Changi Intl", "city": "Singapore", "country": "Singapore", "tz": "Asia/Singapore", "iso": "SG" },
    "HKG": { "lat": "22.3089", "lon": "113.915", "name": "Hong Kong Intl", "city": "Hong Kong", "country": "Hong Kong", "tz": "Asia/Hong_Kong", "iso": "HK" },
    "HND": { "lat": "35.5523", "lon": "139.78", "name": "Haneda", "city": "Tokyo", "country": "Japan", "tz": "Asia/Tokyo", "iso": "JP" },
    "SYD": { "lat": "-33.9461", "lon": "151.177", "name": "Kingsford Smith", "city": "Sydney", "country": "Australia", "tz": "Australia/Sydney", "iso": "AU" },
    
    // Requested Missing Airports
    "MAN": { "lat": "53.3588", "lon": "-2.2728", "name": "Manchester Airport", "city": "Manchester", "country": "England", "tz": "Europe/London", "iso": "GB-ENG" },
    "BEY": { "lat": "33.82", "lon": "35.49", "name": "Beirut Airport", "city": "Beirut", "country": "Lebanon", "iso": "LB" },
    "PRG": { "lat": "50.10", "lon": "14.26", "name": "Prague Airport", "city": "Prague", "country": "Czechia", "iso": "CZ" },
    "BCN": { "lat": "41.29", "lon": "2.07", "name": "Barcelona Airport", "city": "Barcelona", "country": "Spain", "iso": "ES" },
    "ORD": { "lat": "41.97", "lon": "-87.90", "name": "O'Hare Airport", "city": "Chicago", "country": "United States", "iso": "US" },
    "DTW": { "lat": "42.21", "lon": "-83.35", "name": "Detroit Airport", "city": "Detroit", "country": "United States", "iso": "US" },
    "IAD": { "lat": "38.95", "lon": "-77.45", "name": "Dulles Airport", "city": "Washington D.C.", "country": "United States", "iso": "US" },
    "GRR": { "lat": "42.88", "lon": "-85.52", "name": "Grand Rapids Airport", "city": "Grand Rapids", "country": "United States", "iso": "US" },
    "ATL": { "lat": "33.64", "lon": "-84.42", "name": "Atlanta Airport", "city": "Atlanta", "country": "United States", "iso": "US" },
    "AMM": { "lat": "31.72", "lon": "35.99", "name": "Queen Alia Airport", "city": "Amman", "country": "Jordan", "iso": "JO" },
    "TUN": { "lat": "36.85", "lon": "10.22", "name": "Tunis Airport", "city": "Tunis", "country": "Tunisia", "iso": "TN" },
    "DJE": { "lat": "33.86", "lon": "10.77", "name": "Djerba Airport", "city": "Djerba", "country": "Tunisia", "iso": "TN" },
    "SAW": { "lat": "40.89", "lon": "29.30", "name": "Sabiha Gökçen Airport", "city": "Istanbul", "country": "Turkey", "iso": "TR" },
    "IST": { "lat": "41.27", "lon": "28.74", "name": "Istanbul Airport", "city": "Istanbul", "country": "Turkey", "iso": "TR" },
    "ISL": { "lat": "41.27", "lon": "28.74", "name": "Atatürk Airport", "city": "Istanbul", "country": "Turkey", "iso": "TR" },
    "CPH": { "lat": "55.61", "lon": "12.65", "name": "Copenhagen Airport", "city": "Copenhagen", "country": "Denmark", "iso": "DK" },
    "LIS": { "lat": "38.77", "lon": "-9.13", "name": "Lisbon Airport", "city": "Lisbon", "country": "Portugal", "iso": "PT" },
    "ATH": { "lat": "37.93", "lon": "23.94", "name": "Athens Airport", "city": "Athens", "country": "Greece", "iso": "GR" },
    "MCT": { "lat": "23.59", "lon": "58.28", "name": "Muscat Airport", "city": "Muscat", "country": "Oman", "iso": "OM" },
    "AUH": { "lat": "24.43", "lon": "54.65", "name": "Abu Dhabi Airport", "city": "Abu Dhabi", "country": "United Arab Emirates", "iso": "AE" },
    "PSA": { "lat": "43.68", "lon": "10.39", "name": "Pisa Airport", "city": "Pisa", "country": "Italy", "iso": "IT" },
    "SXF": { "lat": "52.38", "lon": "13.52", "name": "Schönefeld Airport", "city": "Berlin", "country": "Germany", "iso": "DE" },
    "FLR": { "lat": "43.81", "lon": "11.20", "name": "Florence Airport", "city": "Florence", "country": "Italy", "iso": "IT" },
    "OTP": { "lat": "44.57", "lon": "26.10", "name": "Otopeni Airport", "city": "Bucharest", "country": "Romania", "iso": "RO" },
    "BRU": { "lat": "50.90", "lon": "4.48", "name": "Brussels Airport", "city": "Brussels", "country": "Belgium", "iso": "BE" },
    "LCA": { "lat": "34.87", "lon": "33.62", "name": "Larnaca Airport", "city": "Larnaca", "country": "Cyprus", "iso": "CY" },
    "CRL": { "lat": "50.45", "lon": "4.45", "name": "Charleroi Airport", "city": "Brussels", "country": "Belgium", "iso": "BE" },
    "ZRH": { "lat": "47.46", "lon": "8.54", "name": "Zurich Airport", "city": "Zurich", "country": "Switzerland", "iso": "CH" },
    "NCE": { "lat": "43.66", "lon": "7.21", "name": "Nice Airport", "city": "Nice", "country": "France", "iso": "FR" },
    "WAW": { "lat": "52.16", "lon": "20.96", "name": "Chopin Airport", "city": "Warsaw", "country": "Poland", "iso": "PL" },
    "KUL": { "lat": "2.74", "lon": "101.70", "name": "Kuala Lumpur Airport", "city": "Kuala Lumpur", "country": "Malaysia", "iso": "MY" },
    "LGK": { "lat": "6.32", "lon": "99.73", "name": "Langkawi Airport", "city": "Langkawi", "country": "Malaysia", "iso": "MY" },
    "DPS": { "lat": "-8.74", "lon": "115.16", "name": "Ngurah Rai Airport", "city": "Bali", "country": "Indonesia", "iso": "ID" },
    "FCO": { "lat": "41.80", "lon": "12.24", "name": "Fiumicino Airport", "city": "Rome", "country": "Italy", "iso": "IT" },
    "NAP": { "lat": "40.88", "lon": "14.29", "name": "Naples Airport", "city": "Naples", "country": "Italy", "iso": "IT" },
    "OPO": { "lat": "41.24", "lon": "-8.67", "name": "Porto Airport", "city": "Porto", "country": "Portugal", "iso": "PT" },
    "BUD": { "lat": "47.43", "lon": "19.26", "name": "Ferenc Liszt Airport", "city": "Budapest", "country": "Hungary", "iso": "HU" },
    "TFS": { "lat": "28.04", "lon": "-16.57", "name": "Tenerife South Airport", "city": "Tenerife", "country": "Spain", "iso": "ES" },
    "LAX": { "lat": "33.94", "lon": "-118.40", "name": "Los Angeles Airport", "city": "Los Angeles", "country": "United States", "iso": "US" },
    "SFO": { "lat": "37.62", "lon": "-122.37", "name": "San Francisco Airport", "city": "San Francisco", "country": "United States", "iso": "US" },
    "ORY": { "lat": "48.72", "lon": "2.36", "name": "Orly Airport", "city": "Paris", "country": "France", "iso": "FR" },
    "SOF": { "lat": "42.69", "lon": "23.41", "name": "Sofia Airport", "city": "Sofia", "country": "Bulgaria", "iso": "BG" },
    "AGP": { "lat": "36.67", "lon": "-4.49", "name": "Málaga Airport", "city": "Málaga", "country": "Spain", "iso": "ES" },
    "TLL": { "lat": "59.41", "lon": "24.83", "name": "Tallinn Airport", "city": "Tallinn", "country": "Estonia", "iso": "EE" },
    "DUB": { "lat": "53.42", "lon": "-6.24", "name": "Dublin Airport", "city": "Dublin", "country": "Ireland", "iso": "IE" },
    "CLE": { "lat": "41.41", "lon": "-81.85", "name": "Cleveland Airport", "city": "Cleveland", "country": "United States", "iso": "US" },
    "BRI": { "lat": "41.13", "lon": "16.76", "name": "Bari Airport", "city": "Bari", "country": "Italy", "iso": "IT" },
    "CAI": { "lat": "30.12", "lon": "31.40", "name": "Cairo Airport", "city": "Cairo", "country": "Egypt", "iso": "EG" },
    "ASW": { "lat": "23.96", "lon": "32.81", "name": "Aswan Airport", "city": "Aswan", "country": "Egypt", "iso": "EG" },
    "LXR": { "lat": "25.67", "lon": "32.70", "name": "Luxor Airport", "city": "Luxor", "country": "Egypt", "iso": "EG" },
    "PDL": { "lat": "37.74", "lon": "-25.69", "name": "Ponta Delgada Airport", "city": "Azores", "country": "Portugal", "iso": "PT" },
    "MAD": { "lat": "40.4839", "lon": "-3.5679", "name": "Adolfo Suárez Madrid-Barajas", "city": "Madrid", "country": "Spain", "tz": "Europe/Madrid", "iso": "ES" },
    "DOH": { "lat": "25.2611", "lon": "51.5650", "name": "Hamad Intl", "city": "Doha", "country": "Qatar", "tz": "Asia/Qatar", "iso": "QA" },
    "CMB": { "lat": "7.1807", "lon": "79.8837", "name": "Bandaranaike Intl", "city": "Colombo", "country": "Sri Lanka", "tz": "Asia/Colombo", "iso": "LK" },
    "PNH": { "lat": "11.5466", "lon": "104.8460", "name": "Phnom Penh Intl", "city": "Phnom Penh", "country": "Cambodia", "tz": "Asia/Phnom_Penh", "iso": "KH" },
    "ARN": { "lat": "59.6519", "lon": "17.9186", "name": "Stockholm Arlanda", "city": "Stockholm", "country": "Sweden", "tz": "Europe/Stockholm", "iso": "SE" },

    // Popular Cities and Requested Locations
    "Paris": { "lat": "48.8566", "lon": "2.3522", "city": "Paris", "country": "France", "countryCode": "FR" },
    "Nice": { "lat": "43.7031", "lon": "7.2626", "city": "Nice", "country": "France", "countryCode": "FR" },
    "Monaco": { "lat": "43.7333", "lon": "7.4167", "city": "Monaco", "country": "Monaco", "countryCode": "MC" },
    "London": { "lat": "51.5074", "lon": "-0.1278", "city": "London", "country": "England", "countryCode": "GB-ENG" },
    "Manchester": { "lat": "53.4808", "lon": "-2.2426", "city": "Manchester", "country": "England", "countryCode": "GB-ENG" },
    "Birmingham": { "lat": "52.4862", "lon": "-1.8904", "city": "Birmingham", "country": "England", "countryCode": "GB-ENG" },
    "Edinburgh": { "lat": "55.9533", "lon": "-3.1883", "city": "Edinburgh", "country": "Scotland", "countryCode": "GB-SCT" },
    "Glasgow": { "lat": "55.8642", "lon": "-4.2518", "city": "Glasgow", "country": "Scotland", "countryCode": "GB-SCT" },
    "Cardiff": { "lat": "51.4816", "lon": "-3.1791", "city": "Cardiff", "country": "Wales", "countryCode": "GB-WLS" },
    "Belfast": { "lat": "54.5973", "lon": "-5.9301", "city": "Belfast", "country": "Northern Ireland", "countryCode": "GB-NIR" },
    "New York": { "lat": "40.7128", "lon": "-74.0060", "city": "New York", "country": "United States", "countryCode": "US" },
    "Tokyo": { "lat": "35.6762", "lon": "139.6503", "city": "Tokyo", "country": "Japan", "countryCode": "JP" },
    "Dubai": { "lat": "25.2048", "lon": "55.2708", "city": "Dubai", "country": "United Arab Emirates", "countryCode": "AE" },
    "Rome": { "lat": "41.9028", "lon": "12.4964", "city": "Rome", "country": "Italy", "countryCode": "IT" },
    "Vatican City": { "lat": "41.9029", "lon": "12.4534", "city": "Vatican City", "country": "Vatican City", "countryCode": "VA" },
    "Vatican": { "lat": "41.9029", "lon": "12.4534", "city": "Vatican City", "country": "Vatican City", "countryCode": "VA" },
    "Naples": { "lat": "40.8518", "lon": "14.2681", "city": "Naples", "country": "Italy", "countryCode": "IT" },
    "Napoli": { "lat": "40.8518", "lon": "14.2681", "city": "Naples", "country": "Italy", "countryCode": "IT" },
    "Capri": { "lat": "40.5518", "lon": "14.2447", "city": "Capri", "country": "Italy", "countryCode": "IT" },
    "Milan": { "lat": "45.4642", "lon": "9.1900", "city": "Milan", "country": "Italy", "countryCode": "IT" },
    "Venice": { "lat": "45.4408", "lon": "12.3155", "city": "Venice", "country": "Italy", "countryCode": "IT" },
    "Florence": { "lat": "43.7696", "lon": "11.2558", "city": "Florence", "country": "Italy", "countryCode": "IT" },
    "Barcelona": { "lat": "41.3851", "lon": "2.1734", "city": "Barcelona", "country": "Spain", "countryCode": "ES" },
    "Berlin": { "lat": "52.5200", "lon": "13.4050", "city": "Berlin", "country": "Germany", "countryCode": "DE" },
    "Amsterdam": { "lat": "52.3676", "lon": "4.9041", "city": "Amsterdam", "country": "Netherlands", "countryCode": "NL" },
    "Brussels": { "lat": "50.8503", "lon": "4.3517", "city": "Brussels", "country": "Belgium", "countryCode": "BE" },
    "Singapore": { "lat": "1.3521", "lon": "103.8198", "city": "Singapore", "country": "Singapore", "countryCode": "SG" },
    "Bali": { "lat": "-8.4095", "lon": "115.1889", "city": "Denpasar", "country": "Indonesia", "countryCode": "ID" },
    "Sydney": { "lat": "-33.8688", "lon": "151.2093", "city": "Sydney", "country": "Australia", "countryCode": "AU" },
    
    // Requested exact city/location entries
    "Madrid": { "lat": "40.4168", "lon": "-3.7038", "city": "Madrid", "country": "Spain", "countryCode": "ES" },
    "Doha": { "lat": "25.2854", "lon": "51.5310", "city": "Doha", "country": "Qatar", "countryCode": "QA" },
    "Sri Lanka": { "lat": "7.8731", "lon": "80.7718", "city": "Colombo", "country": "Sri Lanka", "countryCode": "LK" },
    "Colombo": { "lat": "6.9271", "lon": "79.8612", "city": "Colombo", "country": "Sri Lanka", "countryCode": "LK" },
    "Cambodia": { "lat": "12.5657", "lon": "104.9910", "city": "Phnom Penh", "country": "Cambodia", "countryCode": "KH" },
    "Phnom Penh": { "lat": "11.5564", "lon": "104.9282", "city": "Phnom Penh", "country": "Cambodia", "countryCode": "KH" },
    "Stockholm": { "lat": "59.3293", "lon": "18.0686", "city": "Stockholm", "country": "Sweden", "countryCode": "SE" },
    "Sweden": { "lat": "60.1282", "lon": "18.6435", "city": "Stockholm", "country": "Sweden", "countryCode": "SE" },
    "Tunis": { "lat": "36.8065", "lon": "10.1815", "city": "Tunis", "country": "Tunisia", "countryCode": "TN" },
    "Tunisia": { "lat": "33.8869", "lon": "9.5375", "city": "Tunis", "country": "Tunisia", "countryCode": "TN" },
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

async function fetchOpenMeteoGeocoding(query: string): Promise<any[]> {
    try {
        // 1. Fetch from backend geocoding search endpoint first (with PostgreSQL caching, local search, and logging)
        const res = await fetchWithTimeout(`/api/geocode/search?q=${encodeURIComponent(query)}`, {}, 3000);
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) return data;
        }
    } catch (e) {
        console.warn("Backend geocoding search failed, trying fallback proxy...", e);
    }

    try {
        // Fallback to proxy route
        const res = await fetchWithTimeout(`/api/proxy/geocoding?q=${encodeURIComponent(query)}`, {}, 3000);
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) return data;
        }
    } catch (e) {
        console.warn("Backend geocoding proxy failed. Falling back to direct client-side fetch...", e);
    }

    try {
        // 2. Direct client-side fallback if backend is offline or slow
        const res = await fetchWithTimeout(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=10&language=en&format=json`, {}, 3000);
        if (res.ok) {
            const data = await res.json();
            return data.results || [];
        }
    } catch (e) {
        console.error("Direct Open-Meteo geocoding failed as well:", e);
    }
    return [];
}

export async function searchLocations(query: string): Promise<string[]> {
    if (!query) return [];
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2) return [];

    const lowerQuery = trimmedQuery.toLowerCase();
    
    // Check local memory cache first for instant sub-millisecond snapping
    if (searchQueriesCache.has(lowerQuery)) {
        return searchQueriesCache.get(lowerQuery)!;
    }

    const citySuggestions = new Set<string>();
    const airportSuggestions = new Set<string>();

    // 1. Direct IATA airport code extraction & static airport name search (FAST & offline)
    const uppercaseQuery = trimmedQuery.toUpperCase();
    if (uppercaseQuery.length === 3 && STATIC_GEO_DATA[uppercaseQuery]) {
        const ap = STATIC_GEO_DATA[uppercaseQuery];
        airportSuggestions.add(`${uppercaseQuery} - ${ap.name}, ${ap.city}, ${ap.country}`);
    }

    Object.entries(STATIC_GEO_DATA).forEach(([key, ap]) => {
        if (
            key.toLowerCase().includes(lowerQuery) ||
            ap.name?.toLowerCase().includes(lowerQuery) ||
            ap.city?.toLowerCase().includes(lowerQuery) ||
            ap.country?.toLowerCase().includes(lowerQuery)
        ) {
            airportSuggestions.add(`${key} - ${ap.name}, ${ap.city}, ${ap.country}`);
        }
    });

    // 2. Offline-first local database query matching based on keywords or city name
    LOCAL_GEO_MAP.forEach(item => {
        const cityMatch = item.city.toLowerCase().includes(lowerQuery);
        const countryMatch = item.country.toLowerCase().includes(lowerQuery);
        const keywordMatch = item.keywords.some(kw => kw.includes(lowerQuery) || lowerQuery.includes(kw));

        if (cityMatch || countryMatch || keywordMatch) {
            citySuggestions.add(`${item.city}, ${item.country}`);
        }
    });

    // 3. Match from existing geocoding cache entries
    try {
        internalCache.forEach((val, key) => {
            if (key.toLowerCase().includes(lowerQuery)) {
                if (val.city && val.country) {
                    citySuggestions.add(`${val.city}, ${val.country}`);
                } else if (typeof val === 'string') {
                    if (val.toLowerCase().includes('airport')) {
                        airportSuggestions.add(val);
                    } else {
                        citySuggestions.add(val);
                    }
                } else if (val.displayName) {
                    if (val.displayName.toLowerCase().includes('airport')) {
                        airportSuggestions.add(val.displayName);
                    } else {
                        citySuggestions.add(val.displayName);
                    }
                }
            }
        });
    } catch (e) {}

    // 4. Osm/Nominatim and Open-Meteo network query matching with abort logic
    let networkCitySuggestions: string[] = [];
    let networkAirportSuggestions: string[] = [];
    if (trimmedQuery.length >= 3) {
        try {
            // Try Open-Meteo first for high reliability and unblocking
            const meteoResults = await fetchOpenMeteoGeocoding(trimmedQuery);
            if (meteoResults && meteoResults.length > 0) {
                meteoResults.forEach((item: any, idx: number) => {
                    const displayName = `${item.name}${item.admin1 ? `, ${item.admin1}` : ''}, ${item.country}`;
                    networkCitySuggestions.push(displayName);

                    // Hydrate cache with exact lookup data so it is instant afterwards
                    const cacheData = {
                        lat: item.latitude,
                        lng: item.longitude,
                        lon: item.longitude,
                        tz: item.timezone || 'UTC',
                        city: item.name,
                        country: item.country,
                        countryCode: item.country_code?.toUpperCase(),
                        name: item.name
                    };
                    internalCache.set(displayName.trim(), cacheData);
                    internalCache.set(displayName.trim().toUpperCase(), cacheData);
                    if (idx === 0) {
                        const nameUpper = item.name.trim().toUpperCase();
                        // Never overwrite 3-letter codes with random geocoding names (avoids contaminating airport/IATA codes)
                        if (nameUpper.length !== 3) {
                            internalCache.set(nameUpper, cacheData);
                        }
                    }
                });
                saveCache();
            }

            // Cancel running requests for optimal network utilization
            if (activeSearchAborts.has('search')) {
                activeSearchAborts.get('search')?.abort();
            }
            const controller = new AbortController();
            activeSearchAborts.set('search', controller);

            // Timeout request after 1.5s
            const timerId = setTimeout(() => controller.abort(), 1500);

            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(trimmedQuery)}&limit=10`, {
                signal: controller.signal,
                headers: { 'Accept-Language': 'en' }
            });
            clearTimeout(timerId);

            if (res.ok) {
                const data = await res.json();
                data.forEach((item: any) => {
                    const name: string = item.display_name;
                    if (name.toLowerCase().includes('airport') || name.toLowerCase().includes('aerod')) {
                        if (!networkAirportSuggestions.includes(name)) networkAirportSuggestions.push(name);
                    } else {
                        if (!networkCitySuggestions.includes(name)) networkCitySuggestions.push(name);
                    }
                });
            }
        } catch (e) {
            // Graceful fallback to offline/cached results
        }
    }

    const combined = new Set<string>();
    const isAirportQuery = lowerQuery.includes('airport') || 
                            lowerQuery.includes('apt') || 
                            lowerQuery.includes('fly') || 
                            lowerQuery.includes('transit') || 
                            lowerQuery.includes('terminal') || 
                            lowerQuery.includes('iata') || 
                            (trimmedQuery.length === 3 && trimmedQuery === trimmedQuery.toUpperCase());

    if (isAirportQuery) {
        // Airport search prioritizes airport nodes
        airportSuggestions.forEach(s => combined.add(s));
        networkAirportSuggestions.forEach(s => combined.add(s));
        citySuggestions.forEach(s => combined.add(s));
        networkCitySuggestions.forEach(s => combined.add(s));
    } else {
        // General search prioritizes cities and clean addresses
        citySuggestions.forEach(s => combined.add(s));
        networkCitySuggestions.forEach(s => combined.add(s));
        airportSuggestions.forEach(s => combined.add(s));
        networkAirportSuggestions.forEach(s => combined.add(s));
    }

    const finalResult = Array.from(combined).slice(0, 8);
    searchQueriesCache.set(lowerQuery, finalResult);
    return finalResult;
}

// Reusable debouncing utility helper
export function debounce<T extends (...args: any[]) => any>(fn: T, delay: number) {
    let timer: any = null;
    return (...args: Parameters<T>): Promise<ReturnType<T> | undefined> => {
        return new Promise((resolve) => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(async () => {
                const res = await fn(...args);
                resolve(res);
            }, delay);
        });
    };
}

// Reusable debounced location search helper
export const debouncedSearchLocations = debounce(searchLocations, 350);

export async function searchStations(query: string, type: 'train' | 'bus'): Promise<string[]> {
    return searchLocations(`${query} ${type === 'train' ? 'railway station' : 'bus station'}`);
}

export function getCoordinatesSync(location: string): { lat: number; lng: number; tz?: string; city?: string; country?: string; countryCode?: string } | undefined {
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

  // B. Priority IATA 3-letter Exact Lookup (Structural bypass protecting airports)
  const uppercaseLoc = cleanLocation.toUpperCase();
  if (uppercaseLoc.length === 3 && STATIC_GEO_DATA[uppercaseLoc]) {
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

  // C. Check exact match in active cache
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

  // If we can match by city/country directly in static data
  const directMatch = STATIC_GEO_DATA[cleanLocation];
  if (directMatch?.lat) {
      return {
          lat: parseFloat(directMatch.lat),
          lng: parseFloat(directMatch.lon || directMatch.lng),
          tz: directMatch.tz,
          city: directMatch.city,
          country: directMatch.country,
          countryCode: directMatch.countryCode || directMatch.iso
      };
  }

  return undefined;
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

  // B. Priority IATA 3-letter Exact Lookup (Structural bypass protecting airports)
  const uppercaseLoc = cleanLocation.toUpperCase();
  if (uppercaseLoc.length === 3 && STATIC_GEO_DATA[uppercaseLoc]) {
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

  // C. Check exact match in active cash
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

  // E. Live network query (Open-Meteo + Nominatim fallback)
  try {
    const isIataLike = cleanLocation.length === 3 && cleanLocation === cleanLocation.toUpperCase();
    const searchQuery = isIataLike ? `${cleanLocation} airport` : cleanLocation;

    // Try Open-Meteo as primary (unblocked, reliable, fast, has timezone data)
    const meteoData = await fetchOpenMeteoGeocoding(searchQuery);
    if (meteoData && meteoData.length > 0) {
        const item = meteoData[0];
        const entry = {
            lat: item.latitude,
            lng: item.longitude,
            lon: item.longitude,
            tz: item.timezone || 'UTC',
            city: item.name,
            country: item.country,
            countryCode: item.country_code?.toUpperCase()
        };
        internalCache.set(cleanLocation, entry);
        saveCache();
        return { ...entry, lat: item.latitude, lng: item.longitude };
    }
    
    await throttleNetwork();
    const res = await fetchWithTimeout(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`, {
        headers: { 
            'Accept-Language': 'en',
            'User-Agent': 'WanderGridTravelMap/1.0 (contact: berjawi@gmail.com)'
        }
    }, 3000);
    if (res.ok) {
        const data = await res.json();
        if (data.length > 0) {
          const lat = parseFloat(data[0].lat), lng = parseFloat(data[0].lon);
          const entry = { lat, lng, lon: lng, tz: 'UTC' };
          internalCache.set(cleanLocation, entry);
          saveCache();
          return { ...entry, lat, lng };
        }
    }
  } catch (e) {}
  return undefined;
}

export const LOCAL_GEO_MAP: Array<{ keywords: string[]; city: string; country: string; countryCode: string }> = [
    { keywords: ['france', 'paris', 'nice', 'lyon', 'cdg', 'marseille', 'champs-elysees', 'french'], city: 'Paris', country: 'France', countryCode: 'FR' },
    { keywords: ['england', 'english', 'london', 'lhr', 'heathrow', 'manchester', 'birmingham', 'man', 'bhx', 'british', 'uk', 'gb'], city: 'London', country: 'England', countryCode: 'GB-ENG' },
    { keywords: ['scotland', 'scottish', 'edinburgh', 'glasgow', 'edi', 'gla', 'abz', 'aberdeen'], city: 'Edinburgh', country: 'Scotland', countryCode: 'GB-SCT' },
    { keywords: ['wales', 'welsh', 'cardiff', 'cwl'], city: 'Cardiff', country: 'Wales', countryCode: 'GB-WLS' },
    { keywords: ['northern ireland', 'belfast', 'bfs', 'bhd'], city: 'Belfast', country: 'Northern Ireland', countryCode: 'GB-NIR' },
    { keywords: ['united states', 'usa', 'us', 'new york', 'jfk', 'california', 'los angeles', 'san francisco', 'miami', 'chicago', 'hawaii', 'vegas', 'american'], city: 'New York', country: 'United States', countryCode: 'US' },
    { keywords: ['japan', 'tokyo', 'kyoto', 'osaka', 'hnd', 'narita', 'shibuya', 'japanese'], city: 'Tokyo', country: 'Japan', countryCode: 'JP' },
    { keywords: ['united arab emirates', 'uae', 'dubai', 'dxb', 'abu dhabi', 'emirati'], city: 'Dubai', country: 'United Arab Emirates', countryCode: 'AE' },
    { keywords: ['italy', 'rome', 'fco', 'colosseum', 'italian'], city: 'Rome', country: 'Italy', countryCode: 'IT' },
    { keywords: ['naples', 'napoli'], city: 'Naples', country: 'Italy', countryCode: 'IT' },
    { keywords: ['capri'], city: 'Capri', country: 'Italy', countryCode: 'IT' },
    { keywords: ['vatican', 'vatican city'], city: 'Vatican City', country: 'Vatican City', countryCode: 'VA' },
    { keywords: ['milan', 'milano'], city: 'Milan', country: 'Italy', countryCode: 'IT' },
    { keywords: ['venice', 'venezia'], city: 'Venice', country: 'Italy', countryCode: 'IT' },
    { keywords: ['florence', 'firenze'], city: 'Florence', country: 'Italy', countryCode: 'IT' },
    { keywords: ['spain', 'barcelona', 'seville', 'ibiza', 'bcn', 'mallorca', 'spanish'], city: 'Barcelona', country: 'Spain', countryCode: 'ES' },
    { keywords: ['madrid', 'mad'], city: 'Madrid', country: 'Spain', countryCode: 'ES' },
    { keywords: ['qatar', 'doha', 'doh'], city: 'Doha', country: 'Qatar', countryCode: 'QA' },
    { keywords: ['sri lanka', 'colombo', 'cmb'], city: 'Colombo', country: 'Sri Lanka', countryCode: 'LK' },
    { keywords: ['cambodia', 'phnom penh', 'pnh', 'siem reap', 'rep'], city: 'Phnom Penh', country: 'Cambodia', countryCode: 'KH' },
    { keywords: ['sweden', 'stockholm', 'arn'], city: 'Stockholm', country: 'Sweden', countryCode: 'SE' },
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

export function refineUKCountry(city: string, country: string, countryCode?: string, query?: string): { city: string, country: string, countryCode?: string } {
    const code = countryCode?.toUpperCase() || '';
    const normCountry = (country || '').toLowerCase();
    const isUK = code === 'GB' || code === 'UK' || normCountry.includes('united kingdom') || normCountry.includes('great britain') || normCountry.includes('england') || normCountry.includes('scotland') || normCountry.includes('wales') || normCountry.includes('northern ireland');

    if (!isUK) {
        return { city, country, countryCode: code };
    }

    const textToSearch = `${city || ''} ${country || ''} ${query || ''}`.toLowerCase();

    // Check Scotland
    if (
        textToSearch.includes('scotland') ||
        textToSearch.includes('scottish') ||
        textToSearch.includes('edinburgh') ||
        textToSearch.includes('glasgow') ||
        textToSearch.includes('edi') ||
        textToSearch.includes('gla') ||
        textToSearch.includes('abz') ||
        textToSearch.includes('inv') ||
        textToSearch.includes('aberdeen')
    ) {
        return { city, country: 'Scotland', countryCode: 'GB-SCT' };
    }

    // Check Wales
    if (
        textToSearch.includes('wales') ||
        textToSearch.includes('welsh') ||
        textToSearch.includes('cardiff') ||
        textToSearch.includes('swansea') ||
        textToSearch.includes('cwl')
    ) {
        return { city, country: 'Wales', countryCode: 'GB-WLS' };
    }

    // Check Northern Ireland
    if (
        textToSearch.includes('northern ireland') ||
        textToSearch.includes('belfast') ||
        textToSearch.includes('bfs') ||
        textToSearch.includes('bhd') ||
        textToSearch.includes('derry')
    ) {
        return { city, country: 'Northern Ireland', countryCode: 'GB-NIR' };
    }

    // Fallback to England
    return { city, country: 'England', countryCode: 'GB-ENG' };
}

export async function resolvePlaceName(query: string): Promise<{ city: string, country: string, countryCode?: string, displayName: string } | null> {
    const raw = await resolvePlaceNameRaw(query);
    if (!raw) return null;
    const refined = refineUKCountry(raw.city, raw.country, raw.countryCode, query);
    return {
        ...raw,
        city: refined.city,
        country: refined.country,
        countryCode: refined.countryCode
    };
}

async function resolvePlaceNameRaw(query: string): Promise<{ city: string, country: string, countryCode?: string, displayName: string } | null> {
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
        if (item.keywords.some(kw => {
            if (norm.length <= 3) {
                // For very short queries, only match if it matches a keyword exactly
                return kw === norm;
            }
            // For longer queries, match if the query contains the keyword (e.g. "vancouver airport" containing "vancouver")
            return norm.includes(kw);
        })) {
            const obj = { city: item.city, country: item.country, countryCode: item.countryCode, displayName: cleanQuery };
            internalCache.set(cleanQuery, obj);
            saveCache();
            return obj;
        }
    }

    // 4. Perform network search matching via Open-Meteo and Nominatim fallback
    try {
        const isIataLike = cleanQuery.length === 3 && cleanQuery === cleanQuery.toUpperCase();
        const searchQuery = isIataLike ? `${cleanQuery} airport` : cleanQuery;

        // Try Open-Meteo first
        const meteoData = await fetchOpenMeteoGeocoding(searchQuery);
        if (meteoData && meteoData.length > 0) {
            const item = meteoData[0];
            const name = item.name;
            const country = item.country || '';
            const code = item.country_code?.toUpperCase() || '';
            const displayName = `${item.name}${item.admin1 ? `, ${item.admin1}` : ''}, ${item.country}`;
            const obj = { city: name, country, countryCode: code, displayName };
            internalCache.set(cleanQuery, obj);
            saveCache();
            return obj;
        }

        // Nominatim backup
        await throttleNetwork();
        const res = await fetchWithTimeout(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&addressdetails=1&limit=1`, {
            headers: { 'Accept-Language': 'en' }
        }, 3000);
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
