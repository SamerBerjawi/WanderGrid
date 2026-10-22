import React, { useEffect, useMemo, useState } from 'react';
import { geoNaturalEarth1, geoPath } from 'd3';
import type { FeatureCollection, Geometry } from 'geojson';
import { ParentSize } from '../../bklit/chart-parent-size';
import type { RouteLine } from '../../../utils/journeysModel';
import { cn } from '../../../utils/cn';

/**
 * A small, still map of routes: the land, one great-circle arc per route (thicker the more often it was
 * flown) and a dot at every airport, framed to fit what is shown. Not interactive: no pan, zoom or
 * hover, so it never takes the page's scroll. `marker` puts a live position (a flight in the air) on it.
 * The same data is listed in the page's table, which is the accessible equivalent.
 */

const EMPTY: { lng: number; lat: number }[] = [];
const GEOJSON_URL = '/data/ne_110m_admin_0_countries.geojson';
let landCache: Promise<FeatureCollection<Geometry>> | null = null;
const loadLand = () => {
    if (!landCache) {
        landCache = fetch(GEOJSON_URL)
            .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
            .then((fc: FeatureCollection<Geometry, { ISO_A3?: string }>) => ({ ...fc, features: fc.features.filter(f => f.properties?.ISO_A3 !== 'ATA') }))
            .catch(err => { landCache = null; throw err; });
    }
    return landCache;
};

const RouteSvg: React.FC<{ land: FeatureCollection<Geometry> | null; routes: RouteLine[]; pins: { lng: number; lat: number }[]; marker?: { lng: number; lat: number }; width: number; height: number; label: string; maxZoom: number }> = ({ land, routes, pins, marker, width, height, label, maxZoom }) => {
    const { path, project, lines, points } = useMemo(() => {
        const projection = geoNaturalEarth1();
        const pad = 14;
        const extent: [[number, number], [number, number]] = [[pad, pad], [width - pad, height - pad]];
        const pts: [number, number][] = routes.flatMap(r => [r.from, ...(r.via || []), r.to]);
        if (marker) pts.push([marker.lng, marker.lat]);
        pins.forEach(p => pts.push([p.lng, p.lat]));
        const unique = new Set(pts.map(p => p.join(',')));
        // Frame what is flown; with one place (or none) show the whole world.
        if (unique.size >= 2) {
            // Fit the arcs themselves (they bulge past the end points), not just the airports.
            const geometries: any[] = routes.map(r => ({ type: 'LineString', coordinates: r.path && r.path.length > 1 ? r.path : [r.from, ...(r.via || []), r.to] }));
            if (marker) geometries.push({ type: 'Point', coordinates: [marker.lng, marker.lat] });
            pins.forEach(p => geometries.push({ type: 'Point', coordinates: [p.lng, p.lat] }));
            projection.fitExtent(extent, { type: 'GeometryCollection', geometries });
        }
        else projection.fitExtent(extent, { type: 'Sphere' });
        // A short route would zoom in to street level: never closer than a continent.
        const world = geoNaturalEarth1().fitExtent(extent, { type: 'Sphere' });
        if (projection.scale() > world.scale() * maxZoom) {
            const center = projection.invert?.([width / 2, height / 2]);
            projection.scale(world.scale() * maxZoom);
            if (center) { projection.rotate([-center[0], 0]); projection.center([0, center[1]]); projection.translate([width / 2, height / 2]); }
        }
        const p = geoPath(projection);
        const seen = new Map<string, [number, number]>();
        routes.forEach(r => { seen.set(r.from.join(','), r.from); seen.set(r.to.join(','), r.to); (r.via || []).forEach(v => seen.set(v.join(','), v)); });
        return {
            path: p,
            project: projection,
            lines: routes.map(r => ({ d: p({ type: 'LineString', coordinates: r.path && r.path.length > 1 ? r.path : [r.from, ...(r.via || []), r.to] }) || '', count: r.count, label: r.label })),
            points: [...seen.values()],
        };
    }, [routes, pins, marker, width, height]);

    const maxCount = Math.max(1, ...routes.map(r => r.count));
    const m = marker ? project([marker.lng, marker.lat]) : null;
    return (
        <svg width={width} height={height} role="img" aria-label={label} className="pointer-events-none block select-none">
            {land ? <g className="fill-rp-line dark:fill-rp-inset">{land.features.map((f, i) => <path key={i} d={path(f) || ''} />)}</g> : null}
            <g fill="none" stroke="rgb(var(--rp-rust))" strokeLinecap="round">
                {lines.map((l, i) => <path key={i} d={l.d} strokeWidth={1 + (l.count / maxCount) * 1.6} strokeOpacity={0.45 + (l.count / maxCount) * 0.4} />)}
            </g>
            <g fill="rgb(var(--rp-ink))" stroke="rgb(var(--rp-surface))" strokeWidth={1.5}>
                {points.map(pt => { const q = project(pt); return q ? <circle key={pt.join(',')} cx={q[0]} cy={q[1]} r={3} /> : null; })}
            </g>
            <g fill="rgb(var(--rp-ochre))" stroke="rgb(var(--rp-surface))" strokeWidth={1.5}>
                {pins.map(pn => { const q = project([pn.lng, pn.lat]); return q ? <circle key={`${pn.lng},${pn.lat}`} cx={q[0]} cy={q[1]} r={3.5} /> : null; })}
            </g>
            {m ? (
                <g>
                    <circle cx={m[0]} cy={m[1]} r={9} fill="rgb(var(--rp-green))" fillOpacity={0.25} />
                    <circle cx={m[0]} cy={m[1]} r={4.5} fill="rgb(var(--rp-green))" stroke="rgb(var(--rp-surface))" strokeWidth={2} />
                </g>
            ) : null}
        </svg>
    );
};

export const RoutesMap: React.FC<{ routes: RouteLine[]; /** Places that are not ends of a route: stays and stops, drawn as ochre dots. */ pins?: { lng: number; lat: number }[]; marker?: { lng: number; lat: number }; className?: string; label?: string; /** How far in the map may zoom, as a multiple of the whole world; 3.2 keeps flights at continent level, short land and sea routes ask for more. */ maxZoom?: number }> = ({ routes, pins = EMPTY, marker, className, label, maxZoom = 3.2 }) => {
    const [land, setLand] = useState<FeatureCollection<Geometry> | null>(null);
    useEffect(() => { let live = true; loadLand().then(l => { if (live) setLand(l); }).catch(() => undefined); return () => { live = false; }; }, []);
    const summary = label ?? `Map of ${routes.length} ${routes.length === 1 ? 'route' : 'routes'}`;
    return (
        <div className={cn('relative w-full overflow-hidden', className)}>
            <ParentSize className="h-full">{({ width, height }) => (width > 0 && height > 0 ? <RouteSvg land={land} routes={routes} pins={pins} marker={marker} width={width} height={height} label={summary} maxZoom={maxZoom} /> : null)}</ParentSize>
        </div>
    );
};
