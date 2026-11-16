import type { PublicHoliday, SavedConfig, User } from '../types';

/**
 * What the holiday proxy (`/api/proxy/holidays`) answers: the nationwide public holidays of one country and year, plus,
 * when a region was asked for, that region's own (marked `regional`).
 */
export interface HolidayAnswer {
    countryCode: string;
    region?: string;
    year: number;
    source: string;
    holidays: { date: string; name: string; localName?: string; regional?: boolean }[];
    regionalSkipped?: number;
}

export interface CountryOption { code: string; name: string }

/** A followed calendar, every year: a country ("BE") or a region ("DE-BY"). */
export const calendarKey = (c: Pick<SavedConfig, 'countryCode' | 'region'>): string => (c.region ? c.region.toUpperCase() : c.countryCode.toUpperCase());

/** A saved calendar's id: `<country>-<year>`, or `<region>-<year>` for a region (`DE-BY-2026`). */
export const configId = (countryCode: string, year: number, region?: string) => `${(region || countryCode).toUpperCase()}-${year}`;

/** The key and year a saved calendar id stands for (`DE-BY-2026` → `DE-BY`, 2026). */
export const keyOfConfigId = (id: string): string => id.replace(/-\d{4}$/, '').toUpperCase();

/**
 * Turns an answer into a saved calendar; every holiday starts as a day off. Refreshing a saved calendar keeps its
 * day-off switches and the days added by hand (`previous`).
 */
export const buildConfig = (answer: HolidayAnswer, countryName: string, now = new Date(), regionName?: string, previous?: SavedConfig): SavedConfig => {
    const code = answer.countryCode.toUpperCase();
    const region = answer.region ? answer.region.toUpperCase() : undefined;
    const id = configId(code, answer.year, region);
    const holidays: PublicHoliday[] = answer.holidays.map((h, i) => {
        const old = previous?.holidays.find(o => o.date === h.date && o.name === h.name && !o.custom);
        return {
            id: old?.id ?? `${id}-${h.date}-${i}`,
            name: h.name,
            date: h.date,
            countryCode: code,
            isIncluded: old ? old.isIncluded : true,
            configId: id,
            ...(h.regional ? { regional: true } : {}),
        };
    });
    const custom = (previous?.holidays || []).filter(h => h.custom);
    return {
        id, countryCode: code, countryName, ...(region ? { region, regionName: regionName || region } : {}), year: answer.year,
        holidays: [...holidays, ...custom].sort((a, b) => a.date.localeCompare(b.date)), updatedAt: now.toISOString(),
    };
};

/** A day added by hand to a saved calendar (a company holiday, a local feast the service does not know). */
export const withCustomHoliday = (config: SavedConfig, date: string, name: string): SavedConfig => ({
    ...config,
    holidays: [...config.holidays, {
        id: `${config.id}-custom-${date}-${Math.random().toString(36).slice(2, 6)}`, name: name.trim() || 'Holiday', date,
        countryCode: config.countryCode, isIncluded: true, configId: config.id, custom: true,
    }].sort((a, b) => a.date.localeCompare(b.date)),
    updatedAt: new Date().toISOString(),
});

export const withoutHoliday = (config: SavedConfig, holidayId: string): SavedConfig => ({
    ...config,
    holidays: config.holidays.filter(h => h.id !== holidayId),
    updatedAt: new Date().toISOString(),
});

/**
 * The calendars a member follows, every year: `holidayCalendars`, else the keys of the saved calendars they followed
 * one year at a time before (`holidayConfigIds`).
 */
export const followedKeys = (user: Pick<User, 'holidayCalendars' | 'holidayConfigIds'>): string[] =>
    user.holidayCalendars ? [...new Set(user.holidayCalendars.map(k => k.toUpperCase()))] : [...new Set((user.holidayConfigIds || []).map(keyOfConfigId))];

/** For each followed calendar, the years in `years` that have no saved calendar yet (to fetch). */
export const missingYears = (keys: string[], configs: SavedConfig[], years: number[]): { key: string; countryCode: string; region?: string; countryName: string; regionName?: string; year: number }[] => {
    const out: { key: string; countryCode: string; region?: string; countryName: string; regionName?: string; year: number }[] = [];
    keys.forEach(key => {
        const known = configs.filter(c => calendarKey(c) === key);
        const sample = known[0];
        if (!sample) return;
        years.forEach(year => {
            if (!known.some(c => c.year === year)) out.push({ key, countryCode: sample.countryCode, region: sample.region, countryName: sample.countryName, regionName: sample.regionName, year });
        });
    });
    return out;
};

/** Countries matching what was typed (name or code), best matches first; everything when nothing is typed. */
export const matchCountries = (countries: CountryOption[], query: string, limit = 8): CountryOption[] => {
    const q = query.trim().toLowerCase();
    if (!q) return countries.slice(0, limit);
    const rank = (c: CountryOption) => {
        const name = c.name.toLowerCase();
        if (c.code.toLowerCase() === q || name === q) return 0;
        if (name.startsWith(q)) return 1;
        if (name.split(/[\s-]+/).some(w => w.startsWith(q))) return 2;
        return name.includes(q) ? 3 : 9;
    };
    return countries.map(c => [c, rank(c)] as const).filter(([, r]) => r < 9).sort((a, b) => a[1] - b[1] || a[0].name.localeCompare(b[0].name)).slice(0, limit).map(([c]) => c);
};

/** The years worth offering: last year, this year and the next two. */
export const offeredYears = (thisYear: number): number[] => [thisYear - 1, thisYear, thisYear + 1, thisYear + 2];

/** Nager.Date's rows to an answer (used straight from the browser in local mode, where there is no server). */
export const answerFromNager = (rows: unknown, year: number, countryCode: string, region?: string): HolidayAnswer | null => {
    if (!Array.isArray(rows)) return null;
    const want = region ? region.toUpperCase() : '';
    let regional = 0;
    const seen = new Set<string>();
    const holidays: HolidayAnswer['holidays'] = [];
    for (const r of rows as Record<string, any>[]) {
        const date = typeof r?.date === 'string' ? r.date.slice(0, 10) : '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !date.startsWith(String(year))) continue;
        const types: string[] = Array.isArray(r.types) && r.types.length ? r.types : ['Public'];
        if (!types.includes('Public')) continue;
        const counties: string[] = Array.isArray(r.counties) ? r.counties.map((c: unknown) => String(c).toUpperCase()) : [];
        const nationwide = r.global !== false && counties.length === 0;
        const mine = !nationwide && Boolean(want) && counties.includes(want);
        if (!nationwide && !mine) { regional++; continue; }
        const name = String(r.name || r.localName || 'Public holiday');
        const key = `${date}|${name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        holidays.push({ date, name, localName: String(r.localName || name), ...(mine ? { regional: true } : {}) });
    }
    holidays.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
    return holidays.length ? { countryCode: countryCode.toUpperCase(), ...(want ? { region: want } : {}), year, source: 'nager', holidays, regionalSkipped: regional } : null;
};
