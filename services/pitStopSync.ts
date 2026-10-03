import { RoadTripWaypoint, VisitedItem } from '../types';
import { getCoordinates } from './geocoding';
import { dataService } from './mockDb';

/**
 * Automatically synchronizes road trip pit stops into the user's Visited places
 * (cities and countries) in the database and Travel Atlas.
 */
export async function syncPitStopsToVisited(
    waypoints: RoadTripWaypoint[] | undefined,
    context?: { date?: string; origin?: string; destination?: string }
): Promise<VisitedItem[]> {
    if (!waypoints || waypoints.length === 0) return [];

    const addedItems: VisitedItem[] = [];

    try {
        const existingVisited: VisitedItem[] = (await dataService.getVisited()) || [];

        // Build quick lookup sets for existing cities and countries
        const existingCityKeys = new Set(
            existingVisited
                .filter(item => item.type === 'city')
                .map(item => `${(item.name || '').toLowerCase()}_${(item.countryCode || '').toLowerCase()}`)
        );

        const existingCountryCodes = new Set(
            existingVisited
                .filter(item => item.type === 'country')
                .map(item => (item.code || '').toUpperCase())
        );

        for (const wp of waypoints) {
            // Respect user choice: default to true unless explicitly disabled
            if (wp.addToVisited === false || !wp.name || !wp.name.trim()) continue;

            const trimmedName = wp.name.trim();

            // Geocode the pit stop location to obtain city, country and coordinates
            const coords = await getCoordinates(trimmedName);
            const cityName = coords?.city || trimmedName.split(',')[0].trim();
            const countryCode = (coords?.countryCode || 'XX').toUpperCase();
            const countryName = coords?.country || 'Visited Country';
            const cityKey = `${cityName.toLowerCase()}_${countryCode.toLowerCase()}`;

            const visitDate = wp.visitDate || context?.date || new Date().toISOString().split('T')[0];
            const routeNote = context?.origin && context?.destination
                ? `Pit stop on road trip: ${context.origin} → ${context.destination}`
                : `Pit stop on road trip`;
            const note = wp.notes ? `${wp.notes} (${routeNote})` : routeNote;

            // 1. Add city if not already present
            if (!existingCityKeys.has(cityKey)) {
                const visitedCity: VisitedItem = {
                    id: `pitstop_city_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                    type: 'city',
                    code: cityName,
                    name: cityName,
                    countryCode: countryCode !== 'XX' ? countryCode : undefined,
                    countryName: countryName,
                    lat: coords?.lat,
                    lng: coords?.lng,
                    visitDate,
                    notes: note,
                    isManual: false,
                    residenceStatus: 'visited',
                    residenceStatuses: ['visited']
                };

                await dataService.addVisited(visitedCity);
                existingCityKeys.add(cityKey);
                addedItems.push(visitedCity);
            }

            // 2. Ensure country is registered in visited places if recognized
            if (countryCode && countryCode !== 'XX' && !existingCountryCodes.has(countryCode)) {
                const visitedCountry: VisitedItem = {
                    id: `pitstop_country_${countryCode}`,
                    type: 'country',
                    code: countryCode,
                    name: countryName,
                    lat: coords?.lat,
                    lng: coords?.lng,
                    visitDate,
                    notes: `Visited via pit stop in ${cityName}`,
                    isManual: false,
                    residenceStatus: 'visited',
                    residenceStatuses: ['visited']
                };

                await dataService.addVisited(visitedCountry);
                existingCountryCodes.add(countryCode);
                addedItems.push(visitedCountry);
            }
        }

        // Notify reactive caches across the app if any places were added
        if (addedItems.length > 0) {
            window.dispatchEvent(new CustomEvent('wandergrid_db_updated'));
        }
    } catch (err) {
        console.warn("Could not sync pit stops to visited places:", err);
    }

    return addedItems;
}
