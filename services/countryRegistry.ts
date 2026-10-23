import { VisitedItem, CountryResidenceStatus, getResidenceStatuses } from '../types';

/**
 * Single source of truth for how country records in the `visited` collection are identified.
 *
 * Several features write country records (Travel Atlas, pit-stop sync, the Expedition map, demo seed),
 * and each used to invent its own id and its own duplicate check, so one country could appear many times
 * ("United States" + "United States of America"). Every writer now goes through `countryId` /
 * `findCountryRecord`, and every reader goes through `mergeCountryRecords`, which also heals data that
 * was already written with the old ids.
 */

export const UK_CONSTITUENTS = ['GB-ENG', 'GB-SCT', 'GB-WLS', 'GB-NIR'] as const;

const UK_CONSTITUENT_NAMES: Record<string, string> = {
  'GB-ENG': 'England',
  'GB-SCT': 'Scotland',
  'GB-WLS': 'Wales',
  'GB-NIR': 'Northern Ireland',
};

/** Codes people and geocoders use for the same country. Keys are upper case. */
const CODE_ALIASES: Record<string, string> = {
  UK: 'GB',
  USA: 'US',
  GBR: 'GB',
  NLD: 'NL',
  FRA: 'FR',
  ENG: 'GB-ENG',
  SCT: 'GB-SCT',
  SCO: 'GB-SCT',
  WLS: 'GB-WLS',
  WAL: 'GB-WLS',
  NIR: 'GB-NIR',
};

/** Country *names* that geocoders return, mapped to a code when the record has no usable code. */
const NAME_ALIASES: Record<string, string> = {
  'united states': 'US',
  'united states of america': 'US',
  usa: 'US',
  'u.s.': 'US',
  'united kingdom': 'GB',
  'great britain': 'GB',
  uk: 'GB',
  england: 'GB-ENG',
  scotland: 'GB-SCT',
  wales: 'GB-WLS',
  'northern ireland': 'GB-NIR',
  holland: 'NL',
  'the netherlands': 'NL',
  netherlands: 'NL',
};

export const normalizeCountryCode = (raw?: string | null): string => {
  const code = (raw || '').trim().toUpperCase().replace(/_/g, '-');
  return CODE_ALIASES[code] || code;
};

/** Best-effort code for a record: its own code first, then its name. Empty string when unknown. */
export const resolveCountryCode = (item: { code?: string; name?: string }): string => {
  const fromCode = normalizeCountryCode(item.code);
  if (fromCode && fromCode !== 'XX') return fromCode;
  return NAME_ALIASES[(item.name || '').trim().toLowerCase()] || '';
};

export const isUKParent = (code: string) => normalizeCountryCode(code) === 'GB';
export const isUKConstituent = (code: string) => (UK_CONSTITUENTS as readonly string[]).includes(normalizeCountryCode(code));

/** The one id a country record should have. Writers must use this. */
export const countryId = (code: string) => `country_${normalizeCountryCode(code)}`;

let regionNames: Intl.DisplayNames | null | undefined;

/** Canonical English name derived from the code, so geocoder wording never leaks into the UI. */
export const canonicalCountryName = (code: string, fallback = ''): string => {
  const normalized = normalizeCountryCode(code);
  if (UK_CONSTITUENT_NAMES[normalized]) return UK_CONSTITUENT_NAMES[normalized];
  if (/^[A-Z]{2}$/.test(normalized)) {
    if (regionNames === undefined) {
      try { regionNames = new Intl.DisplayNames(['en'], { type: 'region' }); } catch { regionNames = null; }
    }
    try {
      const name = regionNames?.of(normalized);
      if (name && name !== normalized) return name;
    } catch { /* unknown region code: fall through */ }
  }
  return fallback || normalized;
};

/** Find the existing record for a country, whatever id or spelling it was stored with. */
export const findCountryRecord = <T extends { type?: string; code?: string; name?: string }>(
  list: T[] | null | undefined,
  code: string,
  name?: string
): T | undefined => {
  const wanted = resolveCountryCode({ code, name });
  if (!wanted) return undefined;
  return (list || []).find(v => v.type === 'country' && resolveCountryCode(v) === wanted);
};

export type MergedCountry = VisitedItem & {
  /** Ids of the other stored records that were folded into this one. */
  duplicateIds: string[];
};

const STATUS_ORDER: CountryResidenceStatus[] = ['lived_current', 'lived_past', 'visited', 'layover', 'wishlist'];
const VISIT_STATUSES: CountryResidenceStatus[] = ['visited', 'lived_past', 'lived_current'];

export interface MergeOptions {
  /**
   * Which UK nations a stored "Great Britain / United Kingdom" record stands for. Called only for UK parent
   * records. Return an empty array to fall back to England.
   */
  ukConstituentsFor?: (parent: VisitedItem) => string[];
  /** Keep the UK parent as a single country (used by consumers that do their own UK split). Default false. */
  keepUKParent?: boolean;
}

/**
 * Collapse all stored country records into exactly one record per country.
 *  - the same country under different ids, names or code spellings becomes one record;
 *  - a UK parent record ("GB") is replaced by the individual nations, never shown itself;
 *  - statuses are unioned; a visit beats a layover, since a layover only means "passed through".
 * Pure: does not write anything.
 */
export const mergeCountryRecords = (items: VisitedItem[] | null | undefined, options: MergeOptions = {}): MergedCountry[] => {
  const groups = new Map<string, VisitedItem[]>();
  const synthesised = new WeakSet<object>(); // split from a UK parent; never the preferred survivor

  const push = (key: string, item: VisitedItem) => {
    const group = groups.get(key);
    if (group) group.push(item); else groups.set(key, [item]);
  };

  // Records the user explicitly cleared are markers, not countries. A live record for the same code wins.
  const countries = (items || []).filter(i => i && i.type === 'country');
  countries.filter(i => !i.excluded).forEach(item => {
    const code = resolveCountryCode(item);
    if (!code) {
      push(`name:${(item.name || item.id).toLowerCase()}`, item);
      return;
    }
    if (code === 'GB' && !options.keepUKParent) {
      const nations = (options.ukConstituentsFor?.(item) || []).filter(isUKConstituent).map(normalizeCountryCode);
      const targets = nations.length > 0 ? Array.from(new Set(nations)) : ['GB-ENG'];
      // The first nation inherits the parent's id so an edit migrates the stored record; the rest get their own.
      targets.forEach((nation, index) => {
        const copy = { ...item, id: index === 0 ? item.id : countryId(nation), code: nation, name: canonicalCountryName(nation) };
        synthesised.add(copy);
        push(nation, copy);
      });
      return;
    }
    push(code, item);
  });

  const merged: MergedCountry[] = [];
  groups.forEach((records, key) => {
    const isNameOnly = key.startsWith('name:');
    const code = isNameOnly ? '' : key;
    const canonicalId = code ? countryId(code) : '';
    const real = records.filter(r => !synthesised.has(r));
    const pool = real.length > 0 ? real : records;
    const primary =
      pool.find(r => r.id === canonicalId) ||
      pool.find(r => getResidenceStatuses(r).some(st => VISIT_STATUSES.includes(st)) && r.isManual) ||
      pool.find(r => getResidenceStatuses(r).some(st => VISIT_STATUSES.includes(st))) ||
      pool.find(r => r.isManual) ||
      pool[0];

    const allStatuses = new Set<CountryResidenceStatus>();
    records.forEach(r => getResidenceStatuses(r).forEach(s => allStatuses.add(s)));
    if (records.some(r => r.isTransit)) allStatuses.add('layover');
    if (allStatuses.size === 0) allStatuses.add('visited');

    const hasVisit = VISIT_STATUSES.some(s => allStatuses.has(s));
    if (hasVisit) allStatuses.delete('layover');
    const statuses = STATUS_ORDER.filter(s => allStatuses.has(s));
    // A layover that is also a stored visit stays a visit; transit is only true when nothing says otherwise.
    const isTransit = !hasVisit && statuses.includes('layover');

    const dates = records.map(r => r.visitDate).filter((d): d is string => !!d).sort();
    const noteSource = records.find(r => r.notes && r.id === primary.id) || records.find(r => r.notes);
    const duplicateIds = records.filter(r => r.id !== primary.id).map(r => r.id);

    merged.push({
      ...primary,
      code: code || primary.code,
      name: code ? canonicalCountryName(code, primary.name) : primary.name,
      visitDate: dates.length > 0 ? dates[dates.length - 1] : primary.visitDate,
      notes: noteSource?.notes,
      isManual: records.some(r => r.isManual),
      isTransit,
      residenceStatus: statuses[0],
      residenceStatuses: statuses,
      duplicateIds,
    });
  });

  return merged;
};

/**
 * UK nations evidenced by tracked cities. `refine` maps a city in the UK to a nation code (geocoding's
 * refineUKCountry); it is injected so this module stays free of the geocoding bundle.
 */
export const ukNationsFromCities = (
  items: VisitedItem[] | null | undefined,
  refine: (cityName: string) => string | undefined
): string[] => {
  const nations = new Set<string>();
  (items || []).filter(i => i && i.type === 'city').forEach(city => {
    const code = normalizeCountryCode(city.countryCode);
    if (isUKConstituent(code)) nations.add(code);
    else if (code === 'GB') {
      const nation = normalizeCountryCode(refine(city.name));
      if (isUKConstituent(nation)) nations.add(nation);
    }
  });
  return Array.from(nations);
};

/** Records that must be rewritten or removed so storage matches `mergeCountryRecords`. */
/** Codes the user explicitly cleared (and that no live record contradicts). */
export const excludedCountryCodes = (items: VisitedItem[] | null | undefined): Set<string> => {
  const countries = (items || []).filter(i => i && i.type === 'country');
  const live = new Set(countries.filter(i => !i.excluded).map(resolveCountryCode));
  const out = new Set<string>();
  countries.filter(i => i.excluded).forEach(i => {
    const code = resolveCountryCode(i);
    if (code && !live.has(code)) out.add(code);
  });
  return out;
};

export interface CountryCleanupPlan {
  deleteIds: string[];
  upserts: VisitedItem[];
  /** Number of redundant stored records (for a "N duplicates" label). */
  redundant: number;
  /** Surviving record id -> the stored ids folded into it. */
  folds: Record<string, string[]>;
}

export const planCountryCleanup = (items: VisitedItem[] | null | undefined, options: MergeOptions = {}): CountryCleanupPlan => {
  const stored = (items || []).filter(i => i && i.type === 'country');
  const merged = mergeCountryRecords(stored, options);
  const storedById = new Map(stored.map(s => [s.id, s]));
  const keepIds = new Set(merged.map(m => m.id));
  const upserts: VisitedItem[] = [];
  const folds: Record<string, string[]> = {};

  merged.forEach(m => {
    const { duplicateIds, ...record } = m;
    const original = storedById.get(m.id);
    if (duplicateIds.length > 0) folds[record.id] = duplicateIds;
    const changed = !original
      || original.code !== record.code
      || original.name !== record.name
      || duplicateIds.length > 0
      || (original.residenceStatuses || []).join() !== (record.residenceStatuses || []).join()
      || !!original.isTransit !== !!record.isTransit;
    if (changed) upserts.push(record);
  });

  // Anything stored that is not the surviving record of its group goes. A UK parent that was split keeps
  // its id on the first nation (see mergeCountryRecords), so it is rewritten rather than deleted.
  // Clear markers are kept unless a live record for the same country supersedes them.
  const liveCodes = new Set(merged.map(m => m.code));
  const deleteIds = stored
    .filter(s => !keepIds.has(s.id) && !(s.excluded && !liveCodes.has(resolveCountryCode(s))))
    .map(s => s.id);
  return { deleteIds, upserts, redundant: deleteIds.length, folds };
};
