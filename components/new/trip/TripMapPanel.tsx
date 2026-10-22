import React, { useMemo } from 'react';
import type { Trip } from '../../../types';
import { RoutesMap } from '../journeys/RoutesMap';
import { buildMapModel } from '../map/mapModel';
import { formatProperLocationName } from '../../../services/geocoding';
import { cn } from '../../../utils/cn';

/**
 * The trip's map for the header card (UI_UX_DESIGN_REFERENCE.md decisions 52, 58 and 76): the same still
 * map as the Flights page. The land, one arc per leg (flights, rail, road and sea alike), a dot at each
 * end and an ochre dot for each stay, place and stop, framed to fit. Not interactive, so it never takes
 * the page's scroll, and a trip across oceans fits as well as one across a country.
 */

export const TripHeroMap: React.FC<{ trip: Trip; className?: string }> = ({ trip, className }) => {
    // The scratch mode lists every leg of the trip as a route.
    const model = useMemo(() => buildMapModel([trip], { mode: 'scratch', groupAirports: false, scratchRoutes: ['flight', 'land', 'sea'] }), [trip]);
    const routes = useMemo(
        () => model.routes.map(r => ({ from: r.from, to: r.to, count: 1, label: `${formatProperLocationName(r.origin)} to ${formatProperLocationName(r.destination)}` })),
        [model.routes]
    );
    const pins = useMemo(() => {
        const out: { lng: number; lat: number }[] = [];
        (trip.accommodations || []).forEach(a => { if (a.coordinates) out.push({ lng: a.coordinates.lng, lat: a.coordinates.lat }); });
        (trip.locations || []).forEach(l => { if (l.coordinates) out.push({ lng: l.coordinates.lng, lat: l.coordinates.lat }); });
        (trip.transports || []).forEach(t => (t.waypoints || []).forEach(w => { if (w.coordinates) out.push({ lng: w.coordinates.lng, lat: w.coordinates.lat }); }));
        return out;
    }, [trip]);
    const empty = routes.length === 0 && pins.length === 0;

    return (
        <div className={cn('relative overflow-hidden bg-rp-surface', className)}>
            <RoutesMap routes={routes} pins={pins} className="absolute inset-0" label={`Map of ${trip.name}`} />
            {empty ? (
                <p className="pointer-events-none absolute inset-x-3 bottom-3 rounded-rp-tile bg-rp-surface/95 px-4 py-3 text-sm text-rp-muted rp-shadow-float">
                    Plan the route and pick places for your transport and stays: they appear here.
                </p>
            ) : null}
        </div>
    );
};

export default TripHeroMap;
