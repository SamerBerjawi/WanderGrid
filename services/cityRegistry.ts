import { VisitedItem } from '../types';
import { normalizeCountryCode, canonicalCountryName } from './countryRegistry';

/**
 * One city, one record. Cities reach the Travel Atlas from several sources (manual entries, scans of flights,
 * trips and road trips, pit stops) and each describes the same place differently: "Aarhus" with country DK
 * and "Aarhus" with an unknown country, "AMS" instead of Amsterdam, "ABU Dhabi" vs "Abu Dhabi". This module
 * folds those into a single record. Pure; nothing here writes.
 */

/** Country labels that mean "we don't know" rather than a real country name. */
const PLACEHOLDER_COUNTRIES = new Set([
  '', 'xx', 'unknown', 'imported', 'trip stop', 'road trip pit stop', 'road trip origin', 'flight arrival', 'visited country',
]);

export interface AirportInfo {
  city?: string;
  countryCode?: string;
  lat?: number;
  lng?: number;
}

export interface CityMergeOptions {
  /** Resolve a 3-letter airport code to its city; injected so this module stays free of the geocoding bundle. */
  resolveAirport?: (code: string) => AirportInfo | undefined;
  /** Same-named records with unknown country join a known one within this distance (km). */
  matchRadiusKm?: number;
}

export type MergedCity = VisitedItem & { duplicateIds: string[] };

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
};

const distanceKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/** Comparison key: case, accents, punctuation and ", Country" suffixes do not make a different city. */
export const cityKey = (name: string): string =>
  (name || '')
    .split(',')[0]
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** "Akron AND Washington" is two places. Single names, and anything with a comma (a "City, Country"), are left alone. */
export const splitCombinedPlaces = (raw: string): string[] => {
  const text = (raw || '').trim();
  if (!text) return [];
  if (text.includes(',')) return [text];
  const parts = text.split(/\s+(?:and|&)\s+|\s*;\s*|\s+\/\s+/i).map(p => p.trim()).filter(p => p.length >= 2);
  return parts.length > 1 ? parts : [text];
};

const looksLikeAirportCode = (name: string) => /^[A-Z]{3}$/.test((name || '').trim());

/** "ABU Dhabi" -> "Abu Dhabi": an all-caps word inside an otherwise mixed-case name is a casing slip, not an acronym. */
export const tidyCityName = (name: string): string => {
  const trimmed = (name || '').trim().replace(/\s+/g, ' ');
  if (!/[a-z]/.test(trimmed)) return trimmed;
  return trimmed
    .split(' ')
    .map(word => (word.length >= 3 && /^[A-Z]+$/.test(word) ? word.charAt(0) + word.slice(1).toLowerCase() : word))
    .join(' ');
};

const isUnknownCountry = (item: VisitedItem): boolean => {
  const code = normalizeCountryCode(item.countryCode);
  if (code && code !== 'XX') return false;
  return true;
};

interface Prepared {
  item: VisitedItem;
  key: string;
  country: string; // normalized code, '' when unknown
  lat?: number;
  lng?: number;
  name: string;
}

const prepare = (item: VisitedItem, opts: CityMergeOptions): Prepared => {
  let name = (item.name || '').trim();
  let country = isUnknownCountry(item) ? '' : normalizeCountryCode(item.countryCode);
  let lat = num(item.lat);
  let lng = num(item.lng);

  // Airport codes stored as cities ("AMS", "Flight to AGP") become the city they serve.
  if (looksLikeAirportCode(name) && opts.resolveAirport) {
    const info = opts.resolveAirport(name.toUpperCase());
    if (info?.city) {
      name = info.city;
      if (!country && info.countryCode) country = normalizeCountryCode(info.countryCode);
      if (lat === undefined) lat = info.lat;
      if (lng === undefined) lng = info.lng;
    }
  }
  return { item, key: cityKey(name), country, lat, lng, name };
};

const hasCoords = (p: Prepared): p is Prepared & { lat: number; lng: number } => p.lat !== undefined && p.lng !== undefined;

export const mergeCityRecords = (items: VisitedItem[] | null | undefined, options: CityMergeOptions = {}): MergedCity[] => {
  const radius = options.matchRadiusKm ?? 60;
  const prepared = (items || []).filter(i => i && i.type === 'city').map(i => prepare(i, options));

  // Anything still an unresolved airport code joins a named city nearby, if there is one.
  const named = prepared.filter(p => !looksLikeAirportCode(p.name) && p.key);

  const groups = new Map<string, Prepared[]>();
  const assigned = new Map<Prepared, string>();
  const push = (k: string, p: Prepared) => {
    const g = groups.get(k);
    if (g) g.push(p); else groups.set(k, [p]);
    assigned.set(p, k);
  };

  // Pass 1: records with a known country group by (name, country).
  const unknownCountry: Prepared[] = [];
  const airportCodes: Prepared[] = [];
  prepared.forEach(p => {
    if (!p.key) { push(`raw:${p.item.id}`, p); return; }
    if (looksLikeAirportCode(p.name)) { airportCodes.push(p); return; }
    if (p.country) push(`${p.key}|${p.country}`, p);
    else unknownCountry.push(p);
  });

  // Pass 2: unknown-country records join a same-named known city (nearest one when several countries share the
  // name), or another unknown-country record of that name.
  unknownCountry.forEach(p => {
    const candidates = Array.from(groups.keys()).filter(k => k.startsWith(`${p.key}|`) && !k.endsWith('|'));
    let target: string | undefined;
    if (candidates.length === 1) {
      target = candidates[0];
    } else if (candidates.length > 1 && hasCoords(p)) {
      let best = Infinity;
      candidates.forEach(k => {
        groups.get(k)!.filter(hasCoords).forEach(c => {
          const d = distanceKm(p as any, c as any);
          if (d < best && d <= radius) { best = d; target = k; }
        });
      });
    }
    push(target || `${p.key}|`, p);
  });

  // Pass 3: airport codes that could not be resolved by name join the nearest named city, if there is one.
  airportCodes.forEach(p => {
    const near = hasCoords(p)
      ? named.filter(hasCoords).filter(n => assigned.has(n))
          .map(n => ({ n, d: distanceKm(p as any, n as any) }))
          .filter(x => x.d <= radius)
          .sort((a, b) => a.d - b.d)[0]?.n
      : undefined;
    push(near ? assigned.get(near)! : `${p.key}|`, p);
  });

  const merged: MergedCity[] = [];
  groups.forEach(records => {
    const rank = (r: Prepared) =>
      (r.item.isManual ? 4 : 0) + (r.country ? 2 : 0) + (hasCoords(r) ? 1 : 0)
      // A record that was only an airport code carries the airport's coordinates, not the city's.
      - (r.name !== (r.item.name || '').trim() ? 3 : 0);
    const sorted = [...records].sort((a, b) => rank(b) - rank(a) || String(a.item.id).localeCompare(String(b.item.id)));
    const primary = sorted[0];

    const country = sorted.find(r => r.country)?.country || '';
    const withCoords = sorted.find(hasCoords);
    const dates = sorted.map(r => r.item.visitDate).filter((d): d is string => !!d).sort();
    // Prefer a spelling that is not shouted: "Abu Dhabi" over "ABU Dhabi" when both exist.
    const display = tidyCityName(
      [...sorted].sort((a, b) => Number(/[a-z]/.test(b.name)) - Number(/[a-z]/.test(a.name)))[0].name
    );

    const knownCountryName = country ? canonicalCountryName(country) : '';
    const fallbackCountryName = sorted
      .map(r => (r.item.countryName || '').trim())
      .find(n => n && !PLACEHOLDER_COUNTRIES.has(n.toLowerCase()));

    merged.push({
      ...primary.item,
      name: display,
      code: display,
      countryCode: country || undefined,
      countryName: knownCountryName || fallbackCountryName || undefined,
      lat: withCoords?.lat,
      lng: withCoords?.lng,
      visitDate: dates.length > 0 ? dates[dates.length - 1] : primary.item.visitDate,
      isManual: sorted.some(r => r.item.isManual),
      duplicateIds: sorted.filter(r => r.item.id !== primary.item.id).map(r => r.item.id),
    });
  });

  return merged;
};

export interface CityCleanupPlan {
  deleteIds: string[];
  upserts: VisitedItem[];
  /** Surviving record id -> the stored ids folded into it (only for records that are rewritten). */
  folds: Record<string, string[]>;
}

/** Stored city records to rewrite or remove so storage matches `mergeCityRecords`. */
export const planCityCleanup = (items: VisitedItem[] | null | undefined, options: CityMergeOptions = {}): CityCleanupPlan => {
  const stored = (items || []).filter(i => i && i.type === 'city');
  const storedById = new Map(stored.map(s => [s.id, s]));
  const merged = mergeCityRecords(stored, options);
  const keep = new Set(merged.map(m => m.id));
  const upserts: VisitedItem[] = [];
  const folds: Record<string, string[]> = {};

  merged.forEach(m => {
    const { duplicateIds, ...record } = m;
    const original = storedById.get(m.id);
    // Only rewrite when duplicates were folded in; cosmetic differences alone are not worth a write.
    if (original && duplicateIds.length > 0) { upserts.push(record); folds[record.id] = duplicateIds; }
  });

  return { deleteIds: stored.filter(s => !keep.has(s.id)).map(s => s.id), upserts, folds };
};
