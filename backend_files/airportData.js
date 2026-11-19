'use strict';
/**
 * The airport reference data, built from live public datasets instead of hand-kept tables.
 *
 *  - names:       dlubom/iata_code_fetcher (IATA code, city and airport name; the names the app has always shown)
 *  - ourairports: OurAirports airports.csv (public domain, updated nightly): coordinates, ICAO code, country,
 *                 region (GB-ENG, GB-SCT, ...) and airport type
 *  - timezones:   mwgg/Airports airports.json (MIT): IANA timezone per ICAO code
 *
 * Only the names list is required. The other two enrich it; if one cannot be fetched or parsed the refresh still
 * goes ahead and coordinates fall back to the bundled runway dataset (airportCoords.js) at serve time.
 */

const SOURCES = {
  names: 'https://raw.githubusercontent.com/dlubom/iata_code_fetcher/main/airport_data_full_processed.jsonl',
  ourairports: 'https://davidmegginson.github.io/ourairports-data/airports.csv',
  timezones: 'https://raw.githubusercontent.com/mwgg/Airports/master/airports.json',
};

const COLUMNS = ['iata', 'city_name', 'airport_name', 'icao', 'latitude', 'longitude', 'country_code', 'country', 'timezone', 'kind'];

const UK_NATIONS = {
  'GB-ENG': 'England',
  'GB-SCT': 'Scotland',
  'GB-WLS': 'Wales',
  'GB-NIR': 'Northern Ireland',
};

let regionNames = null;
try {
  regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
} catch {
  regionNames = null;
}

/** Country name and code the app uses: UK airports carry their nation (GB-SCT, "Scotland"), like the rest of the app. */
function countryOf(isoCountry, isoRegion) {
  const cc = String(isoCountry || '').trim().toUpperCase();
  if (!cc) return { country_code: '', country: '' };
  if (cc === 'GB') {
    const region = String(isoRegion || '').trim().toUpperCase();
    if (UK_NATIONS[region]) return { country_code: region, country: UK_NATIONS[region] };
  }
  let name = '';
  try {
    name = regionNames ? regionNames.of(cc) || '' : '';
  } catch {
    name = '';
  }
  return { country_code: cc, country: name && name !== cc ? name : '' };
}

/** Minimal RFC 4180 CSV parser (quoted fields, doubled quotes, commas and newlines inside quotes). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const TYPE_RANK = { large_airport: 0, medium_airport: 1, small_airport: 2, seaplane_base: 3, heliport: 4, balloonport: 5 };

/** OurAirports CSV -> Map<IATA, record>. Where two rows share an IATA code, the scheduled, larger airport wins. */
function parseOurAirports(text) {
  const out = new Map();
  const rows = parseCsv(text);
  if (rows.length < 2) return out;
  const header = rows[0].map(h => h.trim());
  const col = (name) => header.indexOf(name);
  const idx = {
    type: col('type'), name: col('name'), lat: col('latitude_deg'), lng: col('longitude_deg'),
    country: col('iso_country'), region: col('iso_region'), city: col('municipality'),
    scheduled: col('scheduled_service'), icao: col('icao_code'), ident: col('ident'), iata: col('iata_code'),
  };
  if (idx.iata < 0 || idx.lat < 0 || idx.lng < 0) return out;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const iata = String(row[idx.iata] || '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(iata)) continue;
    const type = String(row[idx.type] || '').trim();
    if (type === 'closed') continue;
    const lat = Number(row[idx.lat]);
    const lng = Number(row[idx.lng]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) continue;
    const rec = {
      iata,
      icao: String((idx.icao >= 0 && row[idx.icao]) || (idx.ident >= 0 && row[idx.ident]) || '').trim().toUpperCase(),
      name: String(row[idx.name] || '').trim(),
      city: String(row[idx.city] || '').trim(),
      lat, lng,
      isoCountry: String(row[idx.country] || '').trim().toUpperCase(),
      isoRegion: String(row[idx.region] || '').trim().toUpperCase(),
      type,
      scheduled: String(row[idx.scheduled] || '').trim() === 'yes',
    };
    const prev = out.get(iata);
    const rank = (x) => (x.scheduled ? 0 : 10) + (TYPE_RANK[x.type] ?? 9);
    if (!prev || rank(rec) < rank(prev)) out.set(iata, rec);
  }
  return out;
}

/** mwgg airports.json -> { byIcao, byIata } timezone maps. Anything unparsable yields empty maps. */
function parseTimezones(text) {
  const byIcao = new Map();
  const byIata = new Map();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { byIcao, byIata };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { byIcao, byIata };
  for (const [key, ap] of Object.entries(data)) {
    const tz = ap && typeof ap.tz === 'string' ? ap.tz.trim() : '';
    if (!tz || !/^[A-Za-z_]+\/[A-Za-z0-9_+\-/]+$/.test(tz)) continue;
    const icao = String(ap.icao || key || '').trim().toUpperCase();
    const iata = String(ap.iata || '').trim().toUpperCase();
    if (icao) byIcao.set(icao, tz);
    if (/^[A-Z]{3}$/.test(iata) && !byIata.has(iata)) byIata.set(iata, tz);
  }
  return { byIcao, byIata };
}

/** dlubom JSONL -> { items, skipped }. */
function parseNames(text) {
  const items = [];
  let skipped = 0;
  for (const line of String(text || '').split('\n')) {
    if (!line.trim()) continue;
    try {
      const item = JSON.parse(line);
      const iata = String(item.iata || '').trim().toUpperCase();
      if (iata) items.push({ iata, city_name: item.city_name || '', airport_name: item.airport_name || '' });
      else skipped++;
    } catch {
      skipped++;
    }
  }
  return { items, skipped };
}

const round6 = (n) => Math.round(n * 1e6) / 1e6;

/**
 * Joins the three sources into table rows (COLUMNS order). Every names row is kept (the table has always held the
 * duplicate "Metropolitan Area" rows; server.js picks the real name per code). IATA codes that only OurAirports
 * knows are added with its name and municipality.
 */
function buildAirportRows(names, ourAirports, timezones) {
  const tzOf = (iata, icao) => (icao && timezones.byIcao.get(icao)) || timezones.byIata.get(iata) || '';
  const enrich = (iata) => {
    const oa = ourAirports.get(iata);
    if (!oa) return { icao: '', latitude: null, longitude: null, country_code: '', country: '', timezone: timezones.byIata.get(iata) || '', kind: '' };
    const { country_code, country } = countryOf(oa.isoCountry, oa.isoRegion);
    return { icao: oa.icao, latitude: round6(oa.lat), longitude: round6(oa.lng), country_code, country, timezone: tzOf(iata, oa.icao), kind: oa.type };
  };
  const rows = [];
  const seen = new Set();
  for (const n of names) {
    const e = enrich(n.iata);
    seen.add(n.iata);
    rows.push([n.iata, n.city_name, n.airport_name, e.icao, e.latitude, e.longitude, e.country_code, e.country, e.timezone, e.kind]);
  }
  for (const [iata, oa] of ourAirports) {
    if (seen.has(iata)) continue;
    const e = enrich(iata);
    rows.push([iata, oa.city || '', oa.name || '', e.icao, e.latitude, e.longitude, e.country_code, e.country, e.timezone, e.kind]);
  }
  return rows;
}

async function fetchText(url, timeoutMs) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`${url} download failed with HTTP ${response.status}`);
  return response.text();
}

/**
 * Downloads and joins the sources. The names list is required (its failure fails the refresh, so the
 * existing table is kept); coordinates and timezones are best effort.
 */
async function downloadAirportRows({ timeoutMs = 60000, log = console } = {}) {
  const [namesText, oaText, tzText] = await Promise.all([
    fetchText(SOURCES.names, timeoutMs),
    fetchText(SOURCES.ourairports, timeoutMs).catch((err) => { log.warn(`[DATASETS] OurAirports unavailable (${err.message}); coordinates fall back to the runway dataset`); return ''; }),
    fetchText(SOURCES.timezones, timeoutMs).catch((err) => { log.warn(`[DATASETS] airport timezones unavailable (${err.message})`); return ''; }),
  ]);
  const { items, skipped } = parseNames(namesText);
  const ourAirports = parseOurAirports(oaText);
  const timezones = parseTimezones(tzText);
  return { rows: buildAirportRows(items, ourAirports, timezones), skipped, enriched: { coordinates: ourAirports.size, timezones: timezones.byIcao.size } };
}

const isGenericAirportName = (name) => /^(metropolitan area|all airports)$/i.test(String(name || '').trim());

module.exports = {
  SOURCES,
  COLUMNS,
  countryOf,
  parseCsv,
  parseOurAirports,
  parseTimezones,
  parseNames,
  buildAirportRows,
  downloadAirportRows,
  isGenericAirportName,
};

/**
 * Table rows (COLUMNS order) -> /api/airports/index rows [iata, icao, name, city, lat, lng, countryCode, country,
 * timezone, kind], one per code, the real airport name winning over generic aliases. `fallbackCoords(iata)` fills a
 * missing position. Used by the Vite dev server, which answers the index itself in local mode (no backend).
 */
function indexRowsFromTableRows(rows, fallbackCoords = () => null) {
  const best = new Map();
  for (const r of rows) {
    const prev = best.get(r[0]);
    if (!prev || (isGenericAirportName(prev[2]) && !isGenericAirportName(r[2]))) best.set(r[0], r);
  }
  const out = [];
  for (const r of best.values()) {
    let lat = r[4];
    let lng = r[5];
    if (lat == null || lng == null) {
      const fb = fallbackCoords(r[0]);
      if (fb) { lat = fb.lat; lng = fb.lng; }
    }
    out.push([r[0], r[3] || '', isGenericAirportName(r[2]) ? '' : r[2] || '', r[1] || '', lat ?? null, lng ?? null, r[6] || '', r[7] || '', r[8] || '', r[9] || '']);
  }
  return out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

module.exports.indexRowsFromTableRows = indexRowsFromTableRows;
