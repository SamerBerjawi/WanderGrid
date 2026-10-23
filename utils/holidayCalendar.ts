import type { PublicHoliday, SavedConfig } from '../types';

/** What the holiday proxy (`/api/proxy/holidays`) answers: nationwide public holidays of one country and year. */
export interface HolidayAnswer {
    countryCode: string;
    year: number;
    source: string;
    holidays: { date: string; name: string; localName?: string }[];
    regionalSkipped?: number;
}

export interface CountryOption { code: string; name: string }

/** A saved calendar's id: `<country>-<year>`, the shape the rest of the app expects. */
export const configId = (countryCode: string, year: number) => `${countryCode.toUpperCase()}-${year}`;

/** Turns an answer into a saved calendar; every holiday starts as a day off. */
export const buildConfig = (answer: HolidayAnswer, countryName: string, now = new Date()): SavedConfig => {
    const code = answer.countryCode.toUpperCase();
    const id = configId(code, answer.year);
    const holidays: PublicHoliday[] = answer.holidays.map((h, i) => ({
        id: `${id}-${h.date}-${i}`,
        name: h.name,
        date: h.date,
        countryCode: code,
        isIncluded: true,
        configId: id,
    }));
    return { id, countryCode: code, countryName, year: answer.year, holidays, updatedAt: now.toISOString() };
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
export const answerFromNager = (rows: unknown, year: number, countryCode: string): HolidayAnswer | null => {
    if (!Array.isArray(rows)) return null;
    let regional = 0;
    const seen = new Set<string>();
    const holidays: HolidayAnswer['holidays'] = [];
    for (const r of rows as Record<string, any>[]) {
        const date = typeof r?.date === 'string' ? r.date.slice(0, 10) : '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !date.startsWith(String(year))) continue;
        const types: string[] = Array.isArray(r.types) && r.types.length ? r.types : ['Public'];
        if (!types.includes('Public')) continue;
        if (r.global === false || (Array.isArray(r.counties) && r.counties.length)) { regional++; continue; }
        const name = String(r.name || r.localName || 'Public holiday');
        const key = `${date}|${name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        holidays.push({ date, name, localName: String(r.localName || name) });
    }
    holidays.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
    return holidays.length ? { countryCode: countryCode.toUpperCase(), year, source: 'nager', holidays, regionalSkipped: regional } : null;
};
