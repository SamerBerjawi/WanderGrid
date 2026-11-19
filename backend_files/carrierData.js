'use strict';
/**
 * The airline reference data, built on the server from live public datasets. Browsers used to download both files
 * from GitHub themselves (utils/flightData.ts preloadStaticDatasets) and the app shipped a hand-kept top-50 list.
 *
 *  - names:       dlubom/iata_code_fetcher carrier list: IATA's current designator register (code, legal name, country)
 *  - openflights: OpenFlights airlines.dat (ODbL): ICAO code, commercial name, country and an active flag
 *
 * IATA's register decides who holds a code today. OpenFlights is years out of date in places (it still lists D8 as
 * Djibouti Airlines and 2A as Deutsche Bahn), so a row of it is only used for an IATA code when its name agrees with
 * IATA's; it then supplies the ICAO code, the active flag and, if shorter, the commercial name. Codes IATA's list
 * lacks are taken from OpenFlights when they have an ICAO code (the browser did the same).
 *
 * BRAND_NAMES keeps the names people know for the busiest airlines ("SWISS", "Saudia", "ITA Airways"). Neither
 * dataset spells these the way the airlines do, and they are the names the app has always shown for them.
 *
 * Only the names list is required. If OpenFlights cannot be fetched the refresh still goes ahead without ICAO codes.
 */

const { parseCsv } = require('./airportData');

const SOURCES = {
  names: 'https://raw.githubusercontent.com/dlubom/iata_code_fetcher/main/carrier_data_full_processed.jsonl',
  openflights: 'https://raw.githubusercontent.com/jpatokal/openflights/master/data/airlines.dat',
};

const COLUMNS = ['iata', 'company_name', 'country_or_territory', 'icao', 'active'];

const BRAND_NAMES = {
  DL: 'Delta Air Lines', AA: 'American Airlines', UA: 'United Airlines', WN: 'Southwest Airlines',
  BA: 'British Airways', AF: 'Air France', LH: 'Lufthansa', EK: 'Emirates', QR: 'Qatar Airways',
  SQ: 'Singapore Airlines', CX: 'Cathay Pacific', KL: 'KLM Royal Dutch Airlines', QF: 'Qantas', AC: 'Air Canada',
  TK: 'Turkish Airlines', EY: 'Etihad Airways', VS: 'Virgin Atlantic', FR: 'Ryanair', U2: 'easyJet',
  B6: 'JetBlue Airways', AS: 'Alaska Airlines', NK: 'Spirit Airlines', F9: 'Frontier Airlines', JL: 'Japan Airlines',
  NH: 'All Nippon Airways', KE: 'Korean Air', OZ: 'Asiana Airlines', BR: 'EVA Air', CI: 'China Airlines',
  CZ: 'China Southern Airlines', MU: 'China Eastern Airlines', CA: 'Air China', AI: 'Air India', '6E': 'IndiGo',
  IB: 'Iberia', TP: 'TAP Air Portugal', AZ: 'ITA Airways', LX: 'SWISS', OS: 'Austrian Airlines',
  SK: 'Scandinavian Airlines (SAS)', AY: 'Finnair', EI: 'Aer Lingus', W6: 'Wizz Air', D8: 'Norwegian Air',
  SV: 'Saudia', ME: 'Middle East Airlines', MS: 'EgyptAir', ET: 'Ethiopian Airlines', LA: 'LATAM Airlines',
  AV: 'Avianca',
};

/**
 * Legal registration -> commercial name ("Delta Air Lines, Inc." -> "Delta Air Lines", "Astra Airways Limited dba
 * Air Astra" -> "Air Astra"). The same rules as formatCommercialAirlineName in utils/flightData.ts, which still
 * cleans names from the per-code lookups; tests/unit/carrierIndex.test.ts checks that the two agree.
 */
function formatAirlineName(rawName, iataCode) {
  if (!rawName) return '';
  let name = String(rawName).trim();
  const dbaMatch = name.match(/^(.*?)\s+(?:dba|d\/b\/a|d\.b\.a\.|doing business as|t\/a)\s+(.*?)$/i);
  if (dbaMatch) {
    const before = dbaMatch[1].trim();
    const after = dbaMatch[2].trim();
    const iata = String(iataCode || '').toUpperCase();
    const isAcronymOnly = /^[A-Z0-9]{2,4}$/.test(after) || (iata && after.toUpperCase() === iata);
    name = isAcronymOnly ? before : after;
  }
  name = name.replace(/\s*[-/]?\s*(?:AirLiban|Air Liban)\b/i, '');
  name = name.replace(/\s*\((?:pty|uk|usa|corp|ltd|plc|group|malta|cyprus|poland|europe|international)\)\s*/gi, ' ');
  const legalRegex = /(?:,\s*|\s+)(?:inc\.?|incorporated|corp\.?|corporation|llc\.?|l\.l\.c\.?|ltd\.?|limited|plc\.?|p\.l\.c\.?|s\.a\.?|s\.a\.s\.?|s\.p\.a\.?|gmbh|ag|s\.l\.?|co\.?,?\s*ltd\.?|co\.?,?\s*limited|company limited|pte\.?,?\s*ltd\.?|pvt\.?,?\s*ltd\.?|dac|oy|ab|b\.v\.?|n\.v\.?|k\.k\.?|jsc|s\.a\.l\.?)\.?$/i;
  let prev = '';
  while (prev !== name) {
    prev = name;
    name = name.replace(legalRegex, '').trim();
  }
  name = name.replace(/[\s,.-]+$/, '').trim();
  if (name.length > 3 && name === name.toUpperCase()) {
    name = name.toLowerCase().split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  return name || String(rawName);
}

const IATA_RE = /^[A-Z0-9]{2}$/;
const ICAO_RE = /^[A-Z]{3}$/;
const clean = (v) => {
  const s = String(v ?? '').trim();
  return s === '\\N' || s === '-' || s === 'N/A' ? '' : s;
};

// Words that say nothing about which airline a name is, so "Air Astra" and "Deutsche Bahn" share none.
const GENERIC_WORDS = new Set(('air airline airlines airways aviation aero aerolineas lineas aereas aerea aereo line lines '
  + 'company international intl transport transportes services express group holding holdings the of de del da do and '
  + 'inc ltd limited llc plc sa sas spa ag gmbh corp corporation co jsc pte pvt dba operadora').split(' '));
const nameTokens = (name) => String(name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .split(/[^a-z0-9]+/).filter((t) => t.length >= 2 && !GENERIC_WORDS.has(t));

/** True when two names plausibly belong to the same airline: they share a distinctive word, or squash to each other. */
function sameAirline(a, b) {
  const ta = nameTokens(a);
  const tb = new Set(nameTokens(b));
  if (ta.some((t) => tb.has(t))) return true;
  const sa = ta.join('');
  const sb = [...tb].join('');
  return sa.length >= 3 && sb.length >= 3 && (sa.includes(sb) || sb.includes(sa));
}

/** dlubom JSONL -> { items: [{ iata, name, country }], skipped }. Lines without an IATA code are skipped. */
function parseCarrierNames(text) {
  const items = [];
  let skipped = 0;
  for (const line of String(text || '').split('\n')) {
    if (!line.trim()) continue;
    try {
      const item = JSON.parse(line);
      const iata = String(item.iata || '').trim().toUpperCase();
      if (iata) items.push({ iata, name: String(item.company_name || item.name || '').trim(), country: String(item.country_or_territory || '').trim() });
      else skipped++;
    } catch {
      skipped++;
    }
  }
  return { items, skipped };
}

/** OpenFlights airlines.dat -> Map<IATA, [{ name, icao, country, active }]> (every row that has a 2-character code). */
function parseOpenFlightsAirlines(text) {
  const out = new Map();
  for (const row of parseCsv(text)) {
    if (row.length < 8) continue;
    const iata = clean(row[3]).toUpperCase();
    const name = clean(row[1]);
    if (!IATA_RE.test(iata) || !name) continue;
    const icao = clean(row[4]).toUpperCase();
    const rec = { name, icao: ICAO_RE.test(icao) ? icao : '', country: clean(row[6]), active: clean(row[7]).toUpperCase() === 'Y' };
    if (!out.has(iata)) out.set(iata, []);
    out.get(iata).push(rec);
  }
  return out;
}

// Active rows first, then rows with an ICAO code, then the shorter name.
const rankOpenFlights = (a, b) => (b.active - a.active) || (!!b.icao - !!a.icao) || (a.name.length - b.name.length);
const shorter = (a, b) => (b && b.length < a.length ? b : a);

/**
 * Joins the two sources into table rows (COLUMNS order), one per IATA code, sorted by code. company_name is the
 * display name; active is true/false from a matching OpenFlights row and null when there is none.
 */
function buildCarrierRows(names, openFlights) {
  const byIata = new Map();
  for (const n of names) {
    if (!byIata.has(n.iata)) byIata.set(n.iata, []);
    byIata.get(n.iata).push(n);
  }
  const rows = [];
  for (const [iata, list] of byIata) {
    // The register can list a code more than once (renamed or "dba" entries); the last one is the current name.
    const named = list.filter((n) => n.name);
    const current = named[named.length - 1] || list[list.length - 1];
    const matches = (openFlights.get(iata) || []).filter((of) => named.some((n) => sameAirline(n.name, of.name))).sort(rankOpenFlights);
    const of = matches[0];
    const name = BRAND_NAMES[iata] || shorter(formatAirlineName(current.name, iata), of && formatAirlineName(of.name, iata));
    rows.push([iata, name, current.country || (of && of.country) || '', (of && of.icao) || '', of ? of.active : null]);
  }
  for (const [iata, list] of openFlights) {
    if (byIata.has(iata)) continue;
    const of = list.filter((x) => x.icao).sort(rankOpenFlights)[0];
    if (!of) continue;
    rows.push([iata, BRAND_NAMES[iata] || formatAirlineName(of.name, iata), of.country || '', of.icao, of.active]);
  }
  return rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

async function fetchText(url, timeoutMs) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`${url} download failed with HTTP ${response.status}`);
  return response.text();
}

/** Downloads and joins the sources. The names list is required; OpenFlights is best effort. */
async function downloadCarrierRows({ timeoutMs = 60000, log = console } = {}) {
  const [namesText, ofText] = await Promise.all([
    fetchText(SOURCES.names, timeoutMs),
    fetchText(SOURCES.openflights, timeoutMs).catch((err) => { log.warn(`[DATASETS] OpenFlights airlines unavailable (${err.message}); carriers keep no ICAO codes`); return ''; }),
  ]);
  const { items, skipped } = parseCarrierNames(namesText);
  const rows = buildCarrierRows(items, parseOpenFlightsAirlines(ofText));
  return { rows, skipped, enriched: { icao: rows.filter((r) => r[3]).length } };
}

/** Carrier records ({ iata, company_name, country_or_territory, icao, active }) -> /api/carriers/index rows. */
function indexRows(records) {
  const out = [];
  for (const c of records) {
    if (!c || !c.iata) continue;
    out.push([c.iata, c.icao || '', c.company_name || '', c.country_or_territory || '', c.active === true ? 1 : c.active === false ? 0 : null]);
  }
  return out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

/** Table rows (COLUMNS order) -> records, as loadGlobalData builds them from the database. */
const recordFromRow = (r) => Object.fromEntries(COLUMNS.map((c, i) => [c, r[i]]));

module.exports = {
  SOURCES,
  COLUMNS,
  BRAND_NAMES,
  formatAirlineName,
  sameAirline,
  parseCarrierNames,
  parseOpenFlightsAirlines,
  buildCarrierRows,
  downloadCarrierRows,
  indexRows,
  recordFromRow,
};
