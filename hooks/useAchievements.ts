import { useEffect, useMemo, useState } from 'react';
import type { Transport, Trip } from '../types';
import { dataService } from '../services/mockDb';
import { loadContinents } from '../services/countryContinents';
import { normalizeCountryCode } from '../services/countryRegistry';
import { legsOf } from '../utils/dashboardModel';
import { buildStamps, type Stamp } from '../utils/achievements';
import { todayISO } from '../utils/tripsModel';

/**
 * Achievements for the Atlas: reads the trips and flights when the sheet opens (the Atlas page itself holds only
 * places), then counts the stamps from them and the countries it was given. Loads nothing while closed.
 */
export const useAchievements = (open: boolean, countryCodes: string[]): { stamps: Stamp[]; loading: boolean; failed: boolean } => {
    const [trips, setTrips] = useState<Trip[] | null>(null);
    const [flights, setFlights] = useState<Transport[]>([]);
    const [continents, setContinents] = useState<Map<string, string>>(new Map());
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (!open) return;
        let live = true;
        setFailed(false);
        Promise.all([dataService.getTrips(), dataService.getFlights(), loadContinents()])
            .then(([t, f, c]) => { if (live) { setTrips(t || []); setFlights((f || []) as Transport[]); setContinents(c); } })
            .catch(() => { if (live) setFailed(true); });
        return () => { live = false; };
    }, [open]);

    const key = countryCodes.join('|');
    const stamps = useMemo(() => {
        if (!trips) return [];
        const today = todayISO();
        return buildStamps({
            today,
            countries: [...new Set(countryCodes.map(normalizeCountryCode))],
            continentOf: code => continents.get(normalizeCountryCode(code)),
            trips,
            legs: legsOf(trips, flights, today),
            flights,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [trips, flights, continents, key]);

    return { stamps, loading: open && !trips && !failed, failed };
};
