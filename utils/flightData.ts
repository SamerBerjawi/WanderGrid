import { Transport } from '../types';

export const AIRPORT_CODES: Record<string, string> = {
  "LHR": "London",
  "DXB": "Dubai",
  "JFK": "New York",
  "LGA": "New York",
  "EWR": "New York",
  "STN": "London",
  "LGW": "London",
  "CDG": "Paris",
  "ORY": "Paris",
  "AMS": "Amsterdam",
  "FRA": "Frankfurt",
  "SIN": "Singapore",
  "HKG": "Hong Kong",
  "LAX": "Los Angeles",
  "SYD": "Sydney",
  "HND": "Tokyo",
  "NRT": "Tokyo",
  "PEK": "Beijing",
  "YYZ": "Toronto",
  "YVR": "Vancouver",
  "MAD": "Madrid",
  "BCN": "Barcelona",
  "FCO": "Rome",
  "MUC": "Munich",
  "ZRH": "Zurich",
  "CPH": "Copenhagen",
  "OSL": "Oslo",
  "ARN": "Stockholm",
  "HEL": "Helsinki",
  "VIE": "Vienna",
  "SFO": "San Francisco",
  "ORD": "Chicago",
  "ATL": "Atlanta",
  "DFW": "Dallas",
  "DEN": "Denver",
  "SEA": "Seattle",
  "MIA": "Miami",
  "BOS": "Boston",
  "IAD": "Washington D.C.",
  "DOH": "Doha",
  "BKK": "Bangkok",
  "ICN": "Seoul",
  "KUL": "Kuala Lumpur",
  "TPE": "Taipei",
  "MEL": "Melbourne",
  "BNE": "Brisbane",
  "AKL": "Auckland",
  "JNB": "Johannesburg",
  "CPT": "Cape Town",
  "CAI": "Cairo",
  "IST": "Istanbul",
  "ATH": "Athens",
  "LIS": "Lisbon",
  "BRU": "Brussels",
  "GVA": "Geneva",
  "MXP": "Milan",
  "MXV": "Mexico City",
  "GRU": "São Paulo",
  "EZE": "Buenos Aires",
  "BOG": "Bogotá",
  "LIM": "Lima",
  "SCL": "Santiago",
  "DTW": "Detroit",
  "PHL": "Philadelphia",
  "CLT": "Charlotte",
  "BEY": "Beirut",
  "AUH": "Abu Dhabi",
  "LAS": "Las Vegas",
  "PVG": "Shanghai",
  "KIX": "Osaka",
  "DEL": "Delhi",
  "BOM": "Mumbai"
};

export const AIRLINE_CODES: Record<string, string> = {
  "DL": "Delta Air Lines",
  "AA": "American Airlines",
  "UA": "United Airlines",
  "WN": "Southwest Airlines",
  "BA": "British Airways",
  "AF": "Air France",
  "LH": "Lufthansa",
  "EK": "Emirates",
  "QR": "Qatar Airways",
  "SQ": "Singapore Airlines",
  "CX": "Cathay Pacific",
  "JL": "Japan Airlines",
  "NH": "All Nippon Airways",
  "KL": "KLM",
  "QF": "Qantas",
  "AC": "Air Canada",
  "NZ": "Air New Zealand",
  "TK": "Turkish Airlines",
  "EY": "Etihad Airways",
  "VS": "Virgin Atlantic",
  "FR": "Ryanair",
  "U2": "easyJet",
  "B6": "JetBlue",
  "AS": "Alaska Airlines",
  "NK": "Spirit Airlines",
  "F9": "Frontier Airlines"
};

// Direct online datasets from GitHub to guarantee full offline/local and fast coverage
export const onlineAirports = new Map<string, { city: string, name: string, country?: string }>();
export const onlineCarriers = new Map<string, { name: string, country?: string }>();
export const onlineCarrierIcaoToIata = new Map<string, string>();

export const DEFAULT_AIRPORT_TIMEZONES: Record<string, string> = {
  "LHR": "Europe/London",
  "LGW": "Europe/London",
  "STN": "Europe/London",
  "DXB": "Asia/Dubai",
  "JFK": "America/New_York",
  "LGA": "America/New_York",
  "EWR": "America/New_York",
  "CDG": "Europe/Paris",
  "ORY": "Europe/Paris",
  "AMS": "Europe/Amsterdam",
  "FRA": "Europe/Frankfurt",
  "SIN": "Asia/Singapore",
  "HKG": "Asia/Hong_Kong",
  "LAX": "America/Los_Angeles",
  "SFO": "America/Los_Angeles",
  "SYD": "Australia/Sydney",
  "MEL": "Australia/Melbourne",
  "BNE": "Australia/Brisbane",
  "HND": "Asia/Tokyo",
  "NRT": "Asia/Tokyo",
  "PEK": "Asia/Shanghai",
  "PVG": "Asia/Shanghai",
  "YYZ": "America/Toronto",
  "YVR": "America/Vancouver",
  "MAD": "Europe/Madrid",
  "BCN": "Europe/Madrid",
  "FCO": "Europe/Rome",
  "MXP": "Europe/Rome",
  "MUC": "Europe/Berlin",
  "ZRH": "Europe/Zurich",
  "CPH": "Europe/Copenhagen",
  "OSL": "Europe/Oslo",
  "ARN": "Europe/Stockholm",
  "HEL": "Europe/Helsinki",
  "VIE": "Europe/Vienna",
  "ORD": "America/Chicago",
  "ATL": "America/New_York",
  "DFW": "America/Chicago",
  "DEN": "America/Denver",
  "SEA": "America/Los_Angeles",
  "MIA": "America/New_York",
  "BOS": "America/New_York",
  "IAD": "America/New_York",
  "DOH": "Asia/Qatar",
  "BKK": "Asia/Bangkok",
  "ICN": "Asia/Seoul",
  "KUL": "Asia/Kuala_Lumpur",
  "TPE": "Asia/Taipei",
  "AKL": "Pacific/Auckland",
  "JNB": "Africa/Johannesburg",
  "CPT": "Africa/Johannesburg",
  "CAI": "Africa/Cairo",
  "IST": "Europe/Istanbul",
  "ATH": "Europe/Athens",
  "LIS": "Europe/Lisbon",
  "BRU": "Europe/Brussels",
  "GVA": "Europe/Zurich",
  "DEL": "Asia/Kolkata",
  "BOM": "Asia/Kolkata",
  "BEY": "Asia/Beirut",
  "AUH": "Asia/Dubai",
  "LAS": "America/Los_Angeles"
};

export const airportTimezones = new Map<string, string>(Object.entries(DEFAULT_AIRPORT_TIMEZONES));

export function getAirportTimezone(iataCode: string): string | undefined {
  const code = (iataCode || "").trim().toUpperCase();
  if (!code) return undefined;
  return airportTimezones.get(code);
}

export function parseLocalDateInTimezone(dateStr: string, timeStr: string, timeZoneId?: string): Date {
  const timeHex = timeStr ? timeStr.substring(0, 5) : '00:00';
  const iso = `${dateStr}T${timeHex}:00`;
  
  if (!timeZoneId) {
    return new Date(iso);
  }
  
  try {
    const parsedUtc = new Date(iso + 'Z');
    if (isNaN(parsedUtc.getTime())) {
      return new Date(iso);
    }
    
    // Format UTC candidate in the target timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZoneId,
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
      hour12: false
    });
    
    const parts = formatter.formatToParts(parsedUtc);
    const getPart = (type: string) => parts.find(p => p.type === type)?.value || '';
    
    const yr = getPart('year');
    const mo = getPart('month').padStart(2, '0');
    const dy = getPart('day').padStart(2, '0');
    let hr = getPart('hour');
    if (hr === '24') hr = '00';
    const min = getPart('minute').padStart(2, '0');
    const sec = getPart('second').padStart(2, '0');
    
    const formattedIsoLocal = `${yr}-${mo}-${dy}T${hr.padStart(2, '0')}:${min}:${sec}Z`;
    const formattedUtc = new Date(formattedIsoLocal);
    
    const offsetMs = formattedUtc.getTime() - parsedUtc.getTime();
    return new Date(parsedUtc.getTime() - offsetMs);
  } catch (err) {
    return new Date(iso);
  }
}

export function getFlightDepartureUtcDate(flight: Transport): Date {
  const tz = getAirportTimezone(flight.origin);
  const depDate = flight.departureDate || '2026-05-24';
  const depTime = flight.departureTime || '00:00';
  return parseLocalDateInTimezone(depDate, depTime, tz);
}

export function getFlightArrivalUtcDate(flight: Transport): Date {
  const tz = getAirportTimezone(flight.destination);
  const arrDate = flight.arrivalDate || flight.departureDate || '2026-05-24';
  const arrTime = flight.arrivalTime || '00:00';
  return parseLocalDateInTimezone(arrDate, arrTime, tz);
}

let isOnlineLoadingStarted = false;
let isOnlineDataLoaded = false;

export async function preloadStaticDatasets() {
  if (isOnlineLoadingStarted) return;
  isOnlineLoadingStarted = true;
  console.log("Preloading full airline, airport, and timezone data from GitHub...");
  
  try {
    // 1. Fetch carriers
    const carriersPromise = fetch('https://raw.githubusercontent.com/dlubom/iata_code_fetcher/main/carrier_data_full_processed.jsonl')
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const text = await res.text();
        const lines = text.split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const item = JSON.parse(line);
            const iata = (item.iata || '').trim().toUpperCase();
            if (iata) {
              onlineCarriers.set(iata, {
                name: item.company_name || item.name || '',
                country: item.country_or_territory || ''
              });
            }
          } catch (e) {}
        }
        console.log(`Preloaded ${onlineCarriers.size} carriers from GitHub.`);
      })
      .catch((err) => console.warn("Failed preloading carriers from GitHub:", err));

    // 2. Fetch OpenFlights airlines for robust ICAO -> IATA mapping
    const openflightsPromise = fetch('https://raw.githubusercontent.com/jpatokal/openflights/master/data/airlines.dat')
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const text = await res.text();
        const lines = text.split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
          if (parts.length >= 5) {
            const iata = parts[3].replace(/\"/g, '').trim().toUpperCase();
            const icao = parts[4].replace(/\"/g, '').trim().toUpperCase();
            const companyName = parts[1].replace(/\"/g, '').trim();
            if (iata && iata !== '\\N' && iata !== '-' && iata.length === 2 && icao && icao !== '\\N' && icao !== '-' && icao.length === 3) {
              onlineCarrierIcaoToIata.set(icao, iata);
              if (!onlineCarriers.has(iata)) {
                onlineCarriers.set(iata, { name: companyName });
              }
            }
          }
        }
        console.log(`Preloaded ${onlineCarrierIcaoToIata.size} ICAO -> IATA carrier mappings.`);
      })
      .catch((err) => console.warn("Failed preloading OpenFlights carriers mapping:", err));

    // 3. Fetch airports
    const airportsPromise = fetch('https://raw.githubusercontent.com/dlubom/iata_code_fetcher/main/airport_data_full_processed.jsonl')
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const text = await res.text();
        const lines = text.split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const item = JSON.parse(line);
            const iata = (item.iata || '').trim().toUpperCase();
            if (iata) {
              onlineAirports.set(iata, {
                city: item.city_name || '',
                name: item.airport_name || '',
                country: item.country_name || ''
              });
            }
          } catch (e) {}
        }
        console.log(`Preloaded ${onlineAirports.size} airports from GitHub.`);
      })
      .catch((err) => console.warn("Failed preloading airports from GitHub:", err));

    // 4. Fetch OpenFlights airports database to enrich airportTimezones
    const openflightsAirportsPromise = fetch('https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat')
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const text = await res.text();
        const lines = text.split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
          if (parts.length >= 12) {
            const iata = parts[4].replace(/\"/g, '').trim().toUpperCase();
            const tzName = parts[11].replace(/\"/g, '').trim();
            if (iata && iata.length === 3 && tzName && tzName !== '\\N' && tzName !== '-') {
              airportTimezones.set(iata, tzName);
            }
          }
        }
        console.log(`Preloaded ${airportTimezones.size} airport timezones from OpenFlights.`);
      })
      .catch((err) => console.warn("Failed preloading OpenFlights timezone data:", err));

    await Promise.allSettled([carriersPromise, openflightsPromise, airportsPromise, openflightsAirportsPromise]);
    isOnlineDataLoaded = true;
    
    // Dispatch master reload event to cause views to refresh
    window.dispatchEvent(new CustomEvent('wandergrid_metadata_resolved', {
      detail: { type: 'batch_refresh' }
    }));
  } catch (e) {
    console.error("Failed to preload full online datasets:", e);
  }
}

// Start preloading immediately in the background upon import
preloadStaticDatasets();

// Background fetch handlers and tracking sets to avoid redundant API queries
const pendingAirportFetches = new Set<string>();
const failedAirportFetches = new Set<string>();

const pendingCarrierFetches = new Set<string>();
const failedCarrierFetches = new Set<string>();

interface CachedAirport {
  iata: string;
  city?: string;
  name?: string;
  country?: string;
}

interface CachedCarrier {
  iata: string;
  name: string;
}

function getAviationStackApiKey(): string {
  try {
    const s = localStorage.getItem('wandergrid_settings');
    if (s) {
      const parsed = JSON.parse(s);
      return parsed.aviationStackApiKey || '';
    }
  } catch (e) {}
  return '';
}

function getAirportFromCache(code: string): CachedAirport | null {
  try {
    const cached = localStorage.getItem('wandergrid_airports_cache_v1');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) {
        const found = parsed.find((item: any) => (item.iata || "").toUpperCase() === code);
        if (found) return found;
      }
    }
  } catch (e) {}
  return null;
}

function saveAirportToCache(item: CachedAirport) {
  try {
    const cached = localStorage.getItem('wandergrid_airports_cache_v1');
    let parsed: CachedAirport[] = [];
    if (cached) {
      try {
        const p = JSON.parse(cached);
        if (Array.isArray(p)) parsed = p;
      } catch (e) {}
    }
    
    parsed = parsed.filter((x: any) => (x.iata || "").toUpperCase() !== item.iata.toUpperCase());
    parsed.push(item);
    
    localStorage.setItem('wandergrid_airports_cache_v1', JSON.stringify(parsed));
    
    // Notify application views to re-render
    window.dispatchEvent(new CustomEvent('wandergrid_metadata_resolved', {
      detail: { type: 'airport', code: item.iata, data: item }
    }));
  } catch (e) {}
}

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('wandergrid_session_token') : null;
  const headers = {
    ...(options.headers || {}),
  } as Record<string, string>;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return fetch(url, { ...options, headers });
}

async function triggerBackgroundAirportFetch(code: string) {
  if (pendingAirportFetches.has(code) || failedAirportFetches.has(code)) return;
  pendingAirportFetches.add(code);
  
  try {
    const res = await fetchWithAuth(`/api/airports/lookup/${code}`);
    if (res.ok) {
      const data = await res.json();
      saveAirportToCache({
         iata: code,
         city: data.city_name || data.airport_name,
         name: data.airport_name,
         country: data.country_or_territory
      });
      return;
    }
    
    // Fallback back to AviationStack if apiKey exists
    const apiKey = getAviationStackApiKey();
    if (apiKey) {
      let extRes: Response;
      const isMockMode = localStorage.getItem('wandergrid_api_status') === 'unavailable';
      if (isMockMode) {
        extRes = await fetch(`http://api.aviationstack.com/v1/airports?access_key=${apiKey}&iata_code=${code}`);
      } else {
        extRes = await fetchWithAuth(`/api/proxy/airports?access_key=${apiKey}&iata_code=${code}`);
      }
      if (extRes.ok) {
        const json = await extRes.json();
        if (json && json.data && Array.isArray(json.data) && json.data.length > 0) {
          const first = json.data[0];
          const airportName = first.airport_name || first.name;
          const cityName = first.city_name || first.municipality || first.timezone?.split('/').pop()?.replace(/_/g, ' ');
          const countryName = first.country_name;
          
          saveAirportToCache({
            iata: code,
            city: cityName || airportName,
            name: airportName,
            country: countryName
          });
          return;
        }
      }
    }
    failedAirportFetches.add(code);
  } catch (e) {
    console.warn(`Failed background airport lookup for ${code}`, e);
    failedAirportFetches.add(code);
  } finally {
    pendingAirportFetches.delete(code);
  }
}

function getCarrierFromCache(code: string): CachedCarrier | null {
  try {
    const cached = localStorage.getItem('wandergrid_airlines_cache_v1');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) {
        const found = parsed.find((item: any) => 
          (item.id || "").toUpperCase() === code || 
          (item.code || "").toUpperCase() === code || 
          (item.iata || "").toUpperCase() === code
        );
        if (found) return { iata: code, name: found.name };
      }
    }
  } catch (e) {}
  return null;
}

function saveCarrierToCache(item: CachedCarrier) {
  try {
    const cached = localStorage.getItem('wandergrid_airlines_cache_v1');
    let parsed: any[] = [];
    if (cached) {
      try {
        const p = JSON.parse(cached);
        if (Array.isArray(p)) parsed = p;
      } catch (e) {}
    }
    
    parsed = parsed.filter((x: any) => 
      (x.code || "").toUpperCase() !== item.iata.toUpperCase() && 
      (x.iata || "").toUpperCase() !== item.iata.toUpperCase()
    );
    parsed.push({
      iata: item.iata,
      code: item.iata,
      name: item.name
    });
    
    localStorage.setItem('wandergrid_airlines_cache_v1', JSON.stringify(parsed));
    
    // Notify application views to re-render
    window.dispatchEvent(new CustomEvent('wandergrid_metadata_resolved', {
      detail: { type: 'carrier', code: item.iata, data: item }
    }));
  } catch (e) {}
}

async function triggerBackgroundCarrierFetch(code: string) {
  if (pendingCarrierFetches.has(code) || failedCarrierFetches.has(code)) return;
  pendingCarrierFetches.add(code);
  
  try {
    const res = await fetchWithAuth(`/api/carriers/lookup/${code}`);
    if (res.ok) {
      const data = await res.json();
      saveCarrierToCache({
        iata: code,
        name: data.company_name
      });
      return;
    }
    
    // Fallback back to AviationStack if apiKey exists
    const apiKey = getAviationStackApiKey();
    if (apiKey) {
      let extRes: Response;
      const isMockMode = localStorage.getItem('wandergrid_api_status') === 'unavailable';
      if (isMockMode) {
        extRes = await fetch(`http://api.aviationstack.com/v1/airlines?access_key=${apiKey}&iata_code=${code}`);
      } else {
        extRes = await fetchWithAuth(`/api/proxy/airlines?access_key=${apiKey}&iata_code=${code}`);
      }
      if (extRes.ok) {
        const json = await extRes.json();
        if (json && json.data && Array.isArray(json.data) && json.data.length > 0) {
          const first = json.data[0];
          const airlineName = first.airline_name || first.name;
          if (airlineName) {
            saveCarrierToCache({
              iata: code,
              name: airlineName
            });
            return;
          }
        }
      }
    }
    failedCarrierFetches.add(code);
  } catch (e) {
    console.warn(`Failed background carrier lookup for ${code}`, e);
    failedCarrierFetches.add(code);
  } finally {
    pendingCarrierFetches.delete(code);
  }
}

export function getCityName(iataCode: string): string {
  const code = (iataCode || "").trim().toUpperCase();
  if (!code || code.length < 2) return code;

  // 1. Try loading from direct preloaded dataset (GitHub cache) first
  const onlineItem = onlineAirports.get(code);
  if (onlineItem) {
    return onlineItem.city || onlineItem.name || code;
  }

  // 2. Try loading from caches (populated from database)
  const cached = getAirportFromCache(code);
  if (cached) {
    return cached.city || cached.name || code;
  }
  
  // 3. Trigger dynamic background fetch
  triggerBackgroundAirportFetch(code);

  // 4. Fallback to static dictionary only as a temporary fallback while fetching
  if (AIRPORT_CODES[code]) {
    return AIRPORT_CODES[code];
  }
  
  return code;
}

export function getCarrierName(carrierCode: string): string {
  const code = (carrierCode || "").trim().toUpperCase();
  if (!code || code.length < 2) return code;

  // 1. Try loading from direct preloaded dataset (GitHub cache) first
  const onlineItem = onlineCarriers.get(code);
  if (onlineItem) {
    return onlineItem.name;
  }

  // 2. Try loading from caches (populated from database)
  const cached = getCarrierFromCache(code);
  if (cached) {
    return cached.name;
  }
  
  // 3. Trigger dynamic background fetch
  triggerBackgroundCarrierFetch(code);

  // 4. Fallback to static dictionary only as a temporary fallback while fetching
  if (AIRLINE_CODES[code]) {
    return AIRLINE_CODES[code];
  }
  
  return carrierCode;
}

export function getAirportsByQueryLocally(query: string): Array<{iata: string, city_name: string, airport_name: string}> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results: Array<{iata: string, city_name: string, airport_name: string, score: number}> = [];
  
  for (const [iata, value] of onlineAirports.entries()) {
    const isIataMatch = iata.toLowerCase() === q;
    const isIataPartial = iata.toLowerCase().includes(q);
    const isCityMatch = (value.city || '').toLowerCase().includes(q);
    const isAirportMatch = (value.name || '').toLowerCase().includes(q);
    
    if (isIataMatch || isIataPartial || isCityMatch || isAirportMatch) {
      results.push({
        iata,
        city_name: value.city,
        airport_name: value.name,
        score: isIataMatch ? 1 : isIataPartial ? 2 : isCityMatch ? 3 : 4
      });
    }
  }
  
  results.sort((a,b) => a.score - b.score);
  return results.slice(0, 15).map(({score, ...rest}) => rest);
}

export function getCarriersByQueryLocally(query: string): Array<{iata: string, company_name: string}> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results: Array<{iata: string, company_name: string, score: number}> = [];
  
  for (const [iata, value] of onlineCarriers.entries()) {
    const isIataMatch = iata.toLowerCase() === q;
    const isIataPartial = iata.toLowerCase().includes(q);
    const isNameMatch = (value.name || '').toLowerCase().includes(q);
    
    if (isIataMatch || isIataPartial || isNameMatch) {
      results.push({
        iata,
        company_name: value.name,
        score: isIataMatch ? 1 : isNameMatch ? 2 : 3
      });
    }
  }
  
  results.sort((a,b) => a.score - b.score);
  return results.slice(0, 15).map(({score, ...rest}) => rest);
}

function parseDateTimeStr(str: string, defaultDate: string = ''): { date: string, time: string, timestamp: number } {
  if (!str) return { date: defaultDate, time: '', timestamp: 0 };
  const clean = str.trim();
  if (!clean) return { date: defaultDate, time: '', timestamp: 0 };

  // ISO Format or similar (e.g. "2026-05-24T12:15:00Z")
  if (clean.includes('T')) {
    const [d, tPart] = clean.split('T');
    const time = tPart.substring(0, 5); // get HH:MM
    return { date: d, time, timestamp: new Date(clean).getTime() };
  }

  // Space-separated format (e.g. "2026-05-24 12:15")
  const spaceMatch = clean.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/);
  if (spaceMatch) {
    return {
      date: spaceMatch[1],
      time: spaceMatch[2],
      timestamp: new Date(clean.replace(' ', 'T')).getTime()
    };
  }

  // Just time format (e.g. "12:10")
  if (clean.includes(':')) {
    const time = clean.substring(0, 5);
    const fullIso = `${defaultDate || '2026-01-01'}T${time}:00`;
    return { date: defaultDate, time, timestamp: new Date(fullIso).getTime() };
  }

  return { date: defaultDate, time: clean, timestamp: 0 };
}

export function getFlightStatusTags(flight: Transport) {
  const isCanceledField = flight.customFields?.find(f => f.key.toLowerCase() === 'canceled' && f.value.toUpperCase() === 'TRUE');
  const isCanceled = isCanceledField || flight.isApproximate; // we mapped isCanceled to isApproximate in Import

  // Scheduled Departure info
  const depScheduledDate = flight.departureDate || '';
  const depScheduledTime = flight.departureTime || '00:00';
  const depScheduledTimestamp = new Date(`${depScheduledDate}T${depScheduledTime}:00`).getTime();

  // Scheduled Arrival info
  const arrScheduledDate = flight.arrivalDate || depScheduledDate;
  const arrScheduledTime = flight.arrivalTime || '00:00';
  const arrScheduledTimestamp = new Date(`${arrScheduledDate}T${arrScheduledTime}:00`).getTime();

  // Actual info from custom fields
  const actualDepVal = flight.customFields?.find(f => f.key.toLowerCase().includes('actual departure') || f.key.toLowerCase() === 'actual_departure')?.value;
  const actualArrVal = flight.customFields?.find(f => f.key.toLowerCase().includes('actual arrival') || f.key.toLowerCase() === 'actual_arrival')?.value;

  let depActualDate = depScheduledDate;
  let depActualTime = depScheduledTime;
  let depActualTimestamp = depScheduledTimestamp;

  let arrActualDate = arrScheduledDate;
  let arrActualTime = arrScheduledTime;
  let arrActualTimestamp = arrScheduledTimestamp;

  let hasActual = false;

  if (flight.actualDepartureTime) {
    depActualTime = flight.actualDepartureTime;
    depActualTimestamp = new Date(`${depScheduledDate}T${flight.actualDepartureTime}:00`).getTime();
    hasActual = true;
  } else if (actualDepVal) {
    const parsed = parseDateTimeStr(actualDepVal, depScheduledDate);
    if (parsed.time) {
      depActualDate = parsed.date;
      depActualTime = parsed.time;
      if (parsed.timestamp) depActualTimestamp = parsed.timestamp;
      hasActual = true;
    }
  }

  if (flight.actualArrivalTime) {
    arrActualTime = flight.actualArrivalTime;
    arrActualTimestamp = new Date(`${arrScheduledDate}T${flight.actualArrivalTime}:00`).getTime();
    hasActual = true;
  } else if (actualArrVal) {
    const parsed = parseDateTimeStr(actualArrVal, arrScheduledDate);
    if (parsed.time) {
      arrActualDate = parsed.date;
      arrActualTime = parsed.time;
      if (parsed.timestamp) arrActualTimestamp = parsed.timestamp;
      hasActual = true;
    }
  }

  if (isCanceled) {
    return {
      label: 'CANCELED' as const,
      bgClass: 'bg-red-950/40 text-rose-450 border border-red-900/40 hover:bg-red-900/30 font-black',
      textClass: 'text-red-650 dark:text-red-400',
      dotClass: 'bg-red-600',
      depScheduledDate,
      depScheduledTime,
      depActualDate: undefined,
      depActualTime: undefined,
      arrScheduledDate,
      arrScheduledTime,
      arrActualDate: undefined,
      arrActualTime: undefined,
      isDifferent: true
    };
  }

  if (!hasActual) {
    return {
      label: 'SCHEDULED' as const,
      bgClass: 'bg-zinc-150 text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700/50 hover:bg-zinc-200/50 dark:hover:bg-zinc-700/50',
      textClass: 'text-zinc-500 dark:text-zinc-400 font-extrabold',
      dotClass: 'bg-zinc-400 dark:bg-zinc-500',
      depScheduledDate,
      depScheduledTime,
      depActualDate,
      depActualTime,
      arrScheduledDate,
      arrScheduledTime,
      arrActualDate,
      arrActualTime,
      isDifferent: false
    };
  }

  // Compare departure or arrival delay.
  // Let's compute differences (actual - scheduled) in minutes.
  const depDiffMinutes = (depActualTimestamp - depScheduledTimestamp) / (1000 * 60);
  const arrDiffMinutes = (arrActualTimestamp - arrScheduledTimestamp) / (1000 * 60);

  const delayMinutes = arrDiffMinutes || depDiffMinutes;

  if (delayMinutes > 5) {
    return {
      label: 'LATE' as const,
      bgClass: 'bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20',
      textClass: 'text-red-600 dark:text-red-400',
      dotClass: 'bg-red-500',
      depScheduledDate,
      depScheduledTime,
      depActualDate,
      depActualTime,
      arrScheduledDate,
      arrScheduledTime,
      arrActualDate,
      arrActualTime,
      isDifferent: true
    };
  } else if (delayMinutes < -5) {
    return {
      label: 'EARLY' as const,
      bgClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-500 border border-amber-500/20 hover:bg-amber-500/20',
      textClass: 'text-amber-700 dark:text-amber-400',
      dotClass: 'bg-amber-500',
      depScheduledDate,
      depScheduledTime,
      depActualDate,
      depActualTime,
      arrScheduledDate,
      arrScheduledTime,
      arrActualDate,
      arrActualTime,
      isDifferent: true
    };
  } else {
    return {
      label: 'ON TIME' as const,
      bgClass: 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500/20',
      textClass: 'text-emerald-700 dark:text-emerald-400',
      dotClass: 'bg-emerald-500',
      depScheduledDate,
      depScheduledTime,
      depActualDate,
      depActualTime,
      arrScheduledDate,
      arrScheduledTime,
      arrActualDate,
      arrActualTime,
      isDifferent: true
    };
  }
}
