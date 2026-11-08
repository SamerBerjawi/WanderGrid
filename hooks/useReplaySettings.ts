import { useCallback, useEffect, useState } from 'react';
import { COUNTRIES_GEOJSON_URL } from '../services/mapStyle';
import { buildCountryIndex, type CountryIndex } from '../utils/countryLookup';
import { DEFAULT_REPLAY, readReplaySettings, type ReplaySettings } from '../utils/mapReplay';

const KEY = 'wandergrid_replay_settings';

/** The replay's options (camera, flying plane, captions, country fills, running totals), kept on this device. */
export const useReplaySettings = (): [ReplaySettings, (patch: Partial<ReplaySettings>) => void] => {
    const [settings, setSettings] = useState<ReplaySettings>(() => {
        try { return readReplaySettings(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch { return DEFAULT_REPLAY; }
    });
    const change = useCallback((patch: Partial<ReplaySettings>) => {
        setSettings(prev => {
            const next = { ...prev, ...patch };
            try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* the choice lasts for this visit */ }
            return next;
        });
    }, []);
    return [settings, change];
};

let cached: Promise<CountryIndex | null> | null = null;
const loadIndex = (): Promise<CountryIndex | null> => {
    cached ??= fetch(COUNTRIES_GEOJSON_URL).then(r => (r.ok ? r.json() : null)).then(d => (d ? buildCountryIndex(d) : null)).catch(() => { cached = null; return null; });
    return cached;
};

/** The country borders as a lookup, loaded once when the replay first needs them (null until then, or when they cannot load). */
export const useCountryIndex = (enabled: boolean): CountryIndex | null => {
    const [index, setIndex] = useState<CountryIndex | null>(null);
    useEffect(() => {
        if (!enabled || index) return;
        let alive = true;
        void loadIndex().then(i => { if (alive && i) setIndex(i); });
        return () => { alive = false; };
    }, [enabled, index]);
    return index;
};
