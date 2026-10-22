import React, { useEffect, useMemo, useState } from 'react';
import type { Trip } from '../../../types';
import { DEFAULT_MAP_APPEARANCE, type MapAppearanceSettings } from '../../../types/mapAppearance';
import { RpMapCanvas, type RpMapHandle, type RpMapHover } from '../map/RpMapCanvas';
import { buildMapModel, type LngLat } from '../map/mapModel';
import { boundsOf } from '../../../utils/mapBounds';
import { formatProperLocationName } from '../../../services/geocoding';
import { cn } from '../../../utils/cn';

/**
 * The trip's map, for the header card (UI_UX_DESIGN_REFERENCE.md decision 52): legs as routes, airports,
 * stays and stops as pins, framed to fit, on a plain light or dark basemap so the route is what you see.
 * It uses the New map engine in its route-and-pins mode.
 */

const PADDING = { top: 40, right: 32, bottom: 32, left: 32 };

/** A calm map: a plain basemap, no overlays, no animation. */
const simpleAppearance = (): MapAppearanceSettings => ({
    ...DEFAULT_MAP_APPEARANCE,
    projection: 'flat',
    airportDetail: 'none',
    airportSize: 'small',
    airportMode: 'uniform',
    routeWidthMode: 'uniform',
    routeScale: 'normal',
    routeColorMode: 'gradient',
    animateRoutes: false,
    timeOfDay: false,
    atmosphere: false,
    rainRadar: false,
    terrainHillshade: false,
    transitOverlay: false,
    gibsDaily: false,
    terrain3d: false,
    openAipOverlay: false,
    scratchCitySize: 'small',
});

/** Follows the app's light or dark class, so the basemap matches the page. */
const useIsDark = () => {
    const read = () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
    const [dark, setDark] = useState(read);
    useEffect(() => {
        const observer = new MutationObserver(() => setDark(read()));
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);
    return dark;
};

export const TripHeroMap: React.FC<{ trip: Trip; mapRef: React.RefObject<RpMapHandle | null>; className?: string }> = ({ trip, mapRef, className }) => {
    const isDark = useIsDark();
    // The basemap is a plain one for the theme; the person's own map settings stay on the Map page.
    const appearance = useMemo<MapAppearanceSettings>(() => ({ ...simpleAppearance(), basemap: isDark ? 'dark' : 'positron' }), [isDark]);
    const [hover, setHover] = useState<string | null>(null);

    // The scratch mode draws routes together with pins, which is what a single trip needs.
    const model = useMemo(() => buildMapModel([trip], { mode: 'scratch', groupAirports: false, scratchRoutes: ['flight', 'land', 'sea'] }), [trip]);
    const pins = useMemo(() => {
        const out: { lat: number; lng: number; name: string }[] = [];
        (trip.accommodations || []).forEach(a => { if (a.coordinates) out.push({ lat: a.coordinates.lat, lng: a.coordinates.lng, name: a.name }); });
        (trip.locations || []).forEach(l => { if (l.coordinates) out.push({ lat: l.coordinates.lat, lng: l.coordinates.lng, name: formatProperLocationName(l.name) }); });
        (trip.transports || []).forEach(t => (t.waypoints || []).forEach(w => { if (w.coordinates) out.push({ lat: w.coordinates.lat, lng: w.coordinates.lng, name: w.name }); }));
        return out;
    }, [trip]);
    const bounds = useMemo(() => boundsOf([...model.routes.flatMap(r => [r.from, r.to]), ...pins.map(p => [p.lng, p.lat] as LngLat)]), [model.routes, pins]);
    const boundsKey = bounds ? bounds.flat().join(',') : '';

    // Frame everything once the map is up, and again whenever the trip's places change.
    useEffect(() => {
        if (!bounds) return;
        const timer = window.setTimeout(() => mapRef.current?.fitBounds(bounds), 700);
        return () => window.clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [boundsKey]);

    const onHover = (h: RpMapHover | null) => setHover(!h ? null
        : h.kind === 'route' ? `${formatProperLocationName(h.route.origin)} → ${formatProperLocationName(h.route.destination)}`
        : h.kind === 'place' ? h.place.label
        : h.kind === 'pin' ? h.name : null);
    const empty = model.routes.length === 0 && pins.length === 0;

    return (
        <div className={cn('relative overflow-hidden bg-rp-surface', className)}>
            <RpMapCanvas
                ref={mapRef}
                className="absolute inset-0"
                model={model}
                mode="scratch"
                appearance={appearance}
                isDark={isDark}
                visitedCountryCodes={[]}
                countryStatusMap={{}}
                visitedPlaces={pins}
                openAipAvailable={false}
                padding={PADDING}
                onHover={onHover}
            />
            {hover ? <p className="pointer-events-none absolute top-3 left-3 max-w-[80%] truncate rounded-full bg-rp-ink px-3 py-1.5 text-xs font-medium text-rp-on-ink rp-shadow-float">{hover}</p> : null}
            {empty ? (
                <p className="pointer-events-none absolute inset-x-3 bottom-3 rounded-rp-tile bg-rp-surface/95 px-4 py-3 text-sm text-rp-muted rp-shadow-float">
                    Plan the route and pick places for your transport and stays: they appear here.
                </p>
            ) : null}
        </div>
    );
};

export default TripHeroMap;
