export const hashString = (value: string) => {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
        hash = ((hash << 5) - hash) + value.charCodeAt(i);
        hash |= 0;
    }
    return hash.toString(36);
};

export const getTripsVersion = (tripList: any[]) => {
    const signature = tripList.map(trip => {
        const transports = trip.transports?.map((t: any) => `${t.origin}-${t.destination}-${t.departureDate}`).join(',') || '';
        const accommodations = trip.accommodations?.map((a: any) => a.address).join(',') || '';
        return [
            trip.id,
            trip.status,
            trip.startDate,
            trip.endDate,
            trip.location,
            transports,
            accommodations
        ].join('|');
    }).join('||');
    return hashString(signature);
};

export const serializeVisitedData = (data: any[]) => data.map(entry => ({
    ...entry,
    cities: Array.from(entry.cities),
    lastVisit: entry.lastVisit.toISOString()
}));

export const deserializeVisitedData = (data: any[]) =>
    data.map(entry => ({
        ...entry,
        cities: new Set(entry.cities),
        lastVisit: new Date(entry.lastVisit)
    }));

export const runAfterFirstPaint = (fn: () => void) => {
    if (typeof window === 'undefined') return;
    if ('requestIdleCallback' in window) {
        (window as Window & { requestIdleCallback: (cb: () => void) => number }).requestIdleCallback(fn);
        return;
    }
    setTimeout(fn, 0);
};

export const mapWithConcurrency = async <T, R>(
    items: T[],
    worker: (item: T) => Promise<R>,
    concurrency: number
) => {
    const results: R[] = new Array(items.length);
    let index = 0;
    const runner = async () => {
        while (index < items.length) {
            const current = index;
            index += 1;
            results[current] = await worker(items[current]);
        }
    };
    const runners = Array.from({ length: Math.min(concurrency, items.length) }, runner);
    await Promise.all(runners);
    return results;
};
