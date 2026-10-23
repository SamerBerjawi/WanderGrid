import { dataService } from './mockDb';
import { answerFromNager, type CountryOption, type HolidayAnswer } from '../utils/holidayCalendar';

/**
 * Public holidays for "Add a country calendar". With the server they come from its proxy
 * (`/api/proxy/holidays`: Nager.Date with OpenHolidays as a fallback, cached for a day). In local mode there
 * is no server, so the browser asks Nager.Date directly (it allows cross-origin requests).
 */

const NAGER = 'https://date.nager.at/api/v3';
const TIMEOUT_MS = 9000;

const authHeaders = (): Record<string, string> => {
    try { const t = localStorage.getItem('wandergrid_session_token'); return t ? { Authorization: `Bearer ${t}` } : {}; } catch { return {}; }
};

const getJson = async (url: string, headers: Record<string, string> = {}): Promise<{ status: number; body: any }> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(url, { headers, signal: controller.signal });
        let body: unknown = null;
        try { body = await res.json(); } catch { /* not JSON */ }
        return { status: res.status, body };
    } catch {
        throw new Error('The holiday service could not be reached. Check your connection and try again.');
    } finally {
        clearTimeout(timer);
    }
};

export const fetchHolidayCountries = async (): Promise<CountryOption[]> => {
    if (dataService.isDatabaseMode()) {
        const { status, body } = await getJson('/api/proxy/holidays/countries', authHeaders());
        if (status !== 200 || !Array.isArray(body?.countries)) throw new Error(body?.error || 'The list of countries is not available right now.');
        return body.countries;
    }
    const { status, body } = await getJson(`${NAGER}/AvailableCountries`);
    if (status !== 200 || !Array.isArray(body)) throw new Error('The list of countries is not available right now.');
    return body.filter((c: any) => c?.countryCode && c?.name).map((c: any) => ({ code: String(c.countryCode).toUpperCase(), name: String(c.name) }))
        .sort((a: CountryOption, b: CountryOption) => a.name.localeCompare(b.name));
};

export const fetchHolidays = async (countryCode: string, year: number): Promise<HolidayAnswer> => {
    if (dataService.isDatabaseMode()) {
        const { status, body } = await getJson(`/api/proxy/holidays/${year}/${encodeURIComponent(countryCode)}`, authHeaders());
        if (status === 200 && Array.isArray(body?.holidays)) return body as HolidayAnswer;
        throw new Error(body?.error || 'No holidays came back for that country and year.');
    }
    const { status, body } = await getJson(`${NAGER}/PublicHolidays/${year}/${encodeURIComponent(countryCode)}`);
    const answer = status === 200 ? answerFromNager(body, year, countryCode) : null;
    if (!answer) throw new Error(status === 404 ? `No public holidays found for ${countryCode.toUpperCase()} in ${year}.` : 'No holidays came back for that country and year.');
    return answer;
};
