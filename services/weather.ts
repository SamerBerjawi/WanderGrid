/**
 * Weather for a place, from Open-Meteo (no key): the current conditions and a daily forecast for the
 * next two weeks. Answers are cached for half an hour per place and shared by everything that asks, and
 * a failure or a slow answer returns null: weather is a nicety and must never hold up a page.
 */

export interface DayWeather { max: number; min: number; code: number }
export interface PlaceWeather {
    current: { temp: number; code: number };
    /** By ISO date. */
    daily: Record<string, DayWeather>;
}

const TTL_MS = 30 * 60 * 1000;
const TIMEOUT_MS = 4000;
const cache = new Map<string, { at: number; value: PlaceWeather | null }>();
const pending = new Map<string, Promise<PlaceWeather | null>>();

const keyOf = (lat: number, lng: number) => `${lat.toFixed(2)},${lng.toFixed(2)}`;

export const fetchWeather = (lat: number, lng: number): Promise<PlaceWeather | null> => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return Promise.resolve(null);
    const key = keyOf(lat, lng);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return Promise.resolve(hit.value);
    const inflight = pending.get(key);
    if (inflight) return inflight;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const request = fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=16&timezone=auto`,
        { signal: controller.signal }
    )
        .then(r => (r.ok ? r.json() : null))
        .then((j): PlaceWeather | null => {
            if (!j?.current || !j?.daily?.time) return null;
            const daily: Record<string, DayWeather> = {};
            (j.daily.time as string[]).forEach((d, i) => {
                daily[d] = { max: j.daily.temperature_2m_max[i], min: j.daily.temperature_2m_min[i], code: j.daily.weather_code[i] };
            });
            return { current: { temp: j.current.temperature_2m, code: j.current.weather_code }, daily };
        })
        .catch(() => null)
        .then(value => {
            clearTimeout(timer);
            pending.delete(key);
            // A failure is remembered only briefly, so a flaky network is retried soon.
            cache.set(key, { at: value ? Date.now() : Date.now() - TTL_MS + 60_000, value });
            return value;
        });
    pending.set(key, request);
    return request;
};

export type WeatherKind = 'clear' | 'partly' | 'cloud' | 'fog' | 'rain' | 'snow' | 'storm';

/** WMO weather codes grouped into the few looks the app shows. */
export const weatherKind = (code: number): { kind: WeatherKind; label: string } => {
    if (code === 0) return { kind: 'clear', label: 'Clear' };
    if (code <= 2) return { kind: 'partly', label: 'Partly cloudy' };
    if (code === 3) return { kind: 'cloud', label: 'Cloudy' };
    if (code === 45 || code === 48) return { kind: 'fog', label: 'Fog' };
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return { kind: 'rain', label: 'Rain' };
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { kind: 'snow', label: 'Snow' };
    if (code >= 95) return { kind: 'storm', label: 'Thunderstorm' };
    return { kind: 'cloud', label: 'Cloudy' };
};
