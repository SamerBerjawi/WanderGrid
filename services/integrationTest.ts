import { dataService } from './mockDb';

/**
 * Connection tests for Settings › Integrations. Keyless services are tested by the server
 * (GET /api/proxy/test/:provider); when no server answers (local mode) the browser pings the
 * provider itself. Services with a key are tested by the server with the key it holds.
 */

export interface TestResult {
    success: boolean;
    latencyMs: number;
    message: string;
    at: number;
}

export type KeylessProvider = 'adsbdb' | 'osrm' | 'geocoding' | 'openfreemap' | 'gibs';
export type KeyedService = 'aviationstack' | 'aerodatabox' | 'openaip' | 'brandfetch';

const timed = async (url: string, ms: number, name: string, okStatuses: number[] = []) => {
    const t0 = performance.now();
    const res = await fetch(url, { signal: AbortSignal.timeout(ms) });
    const latencyMs = Math.round(performance.now() - t0);
    const ok = res.ok || okStatuses.includes(res.status);
    return { success: ok, latencyMs, message: ok ? `${name} operational` : `${name} returned HTTP ${res.status}` };
};

const yesterday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
};

const DIRECT: Record<KeylessProvider, () => Promise<{ success: boolean; latencyMs: number; message: string }>> = {
    adsbdb: () => timed('https://api.adsbdb.com/v0/callsign/AAL1', 4000, 'ADSBdb', [404]),
    osrm: () => timed('https://routing.openstreetmap.de/routed-car/route/v1/driving/2.3522,48.8566;2.3600,48.8600?overview=false', 5000, 'FOSSGIS OSRM'),
    geocoding: () => timed('https://geocoding-api.open-meteo.com/v1/search?name=London&count=1&language=en&format=json', 4000, 'Open-Meteo'),
    openfreemap: () => timed('https://tiles.openfreemap.org/styles/liberty', 4000, 'OpenFreeMap'),
    gibs: () => timed(`https://gibs-a.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA21_CorrectedReflectance_TrueColor/default/${yesterday()}/GoogleMapsCompatible_Level9/0/0/0.jpg`, 5000, 'NASA GIBS'),
};

export const testKeyless = async (provider: KeylessProvider): Promise<TestResult> => {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        let data: any = null;
        try {
            const token = localStorage.getItem('wandergrid_session_token');
            const res = await fetch(`/api/proxy/test/${provider}`, { signal: controller.signal, headers: token ? { Authorization: `Bearer ${token}` } : undefined });
            if ((res.headers.get('content-type') || '').includes('application/json')) data = await res.json();
        } catch { /* no server: ping directly */ } finally { clearTimeout(timer); }
        if (data && typeof data.success === 'boolean') {
            return { success: data.success, latencyMs: data.latencyMs || 0, message: data.message || (data.success ? 'Operational' : 'Unavailable'), at: Date.now() };
        }
        return { ...(await DIRECT[provider]()), at: Date.now() };
    } catch (e) {
        return { success: false, latencyMs: 0, message: e instanceof Error && e.message ? e.message : 'Connection failed', at: Date.now() };
    }
};

export const testKeyed = async (service: KeyedService): Promise<TestResult> => {
    try {
        const r = await dataService.testApiKey(service);
        return { success: Boolean(r.success), latencyMs: r.latencyMs || 0, message: r.message || (r.success ? 'Operational' : 'Unavailable'), at: Date.now() };
    } catch (e) {
        const message = e instanceof Error && /route not found/i.test(e.message) ? 'Testing a key needs the server' : e instanceof Error && e.message ? e.message : 'Connection failed';
        return { success: false, latencyMs: 0, message, at: Date.now() };
    }
};
