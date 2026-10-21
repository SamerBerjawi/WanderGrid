import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { LocationEntry, Trip } from '../../../types';
import { loadMapAppearanceSettings } from '../../../types/mapAppearance';
import { RpMapCanvas, type RpMapHandle, type RpMapHover } from '../map/RpMapCanvas';
import { buildMapModel, type LngLat } from '../map/mapModel';
import { formatDate } from '../../../utils/formatters';
import { ArrowDown, ArrowUp, MapPin, Path, Plus, Trash } from '../../ui/hugeicons';
import { RP_FIELD, RpField } from '../fields';
import { PlaceField } from '../PlaceField';
import { RpEmpty } from '../ui';
import ParticleButton from '../../kokonutui/particle-button';
import { modeLook } from '../trips/transportModes';
import { STAY_ACCENT } from '../trips/accents';
import { cn } from '../../../utils/cn';

/**
 * The trip on a map (UI_UX_DESIGN_REFERENCE.md decision 52): its legs as routes, its airports, stays
 * and route stops as pins, with the legs listed beside it and the stops editable. It uses the New
 * map engine in its route-and-pins mode, so basemaps, globe and route tracing behave as on the Map page.
 */

const DAY = 86_400_000;
const PADDING = { top: 48, right: 32, bottom: 32, left: 32 };
const CARD = 'rounded-rp-card bg-rp-surface p-4 rp-shadow-rest sm:p-6';
const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `l-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

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

const boundsOf = (points: LngLat[]): [LngLat, LngLat] | null => {
    if (points.length === 0) return null;
    let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
    points.forEach(([x, y]) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); });
    // A single point still needs a box to fit.
    if (minX === maxX && minY === maxY) { minX -= 0.5; maxX += 0.5; minY -= 0.3; maxY += 0.3; }
    return [[minX, minY], [maxX, maxY]];
};

/* ------------------------------------------------------------------ */
/* Route stops */
/* ------------------------------------------------------------------ */

const Stops: React.FC<{ trip: Trip; onSave: (locations: LocationEntry[]) => Promise<void> }> = ({ trip, onSave }) => {
    const saved = trip.locations || [];
    const [stops, setStops] = useState<LocationEntry[]>(saved);
    const [base, setBase] = useState(saved);
    // Saved changes from elsewhere replace the list only when nothing here is unsaved.
    if (saved !== base) { if (JSON.stringify(stops) === JSON.stringify(base)) setStops(saved); setBase(saved); }
    const dirty = JSON.stringify(stops) !== JSON.stringify(base);
    const update = (i: number, p: Partial<LocationEntry>) => setStops(list => list.map((s, j) => (j === i ? { ...s, ...p } : s)));
    const move = (i: number, by: number) => setStops(list => {
        const to = i + by;
        if (to < 0 || to >= list.length) return list;
        const next = [...list];
        [next[i], next[to]] = [next[to], next[i]];
        return next;
    });
    const add = () => {
        const last = stops[stops.length - 1];
        setStops(list => [...list, { id: newId(), name: '', startDate: last?.endDate || trip.startDate, endDate: last?.endDate || trip.endDate || trip.startDate }]);
    };

    return (
        <section className={CARD}>
            <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-base font-medium text-rp-ink"><MapPin size={18} className={STAY_ACCENT} aria-hidden /> Route stops <span className="rp-tabular text-sm text-rp-muted">{stops.length}</span></h2>
                <button type="button" onClick={add} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-rp-inset px-4 text-sm font-medium text-rp-ink outline-none hover:bg-rp-line focus-visible:ring-2 focus-visible:ring-rp-muted"><Plus size={16} aria-hidden /> Add</button>
            </div>
            {stops.length === 0 ? <RpEmpty title="No stops yet">Add the cities you pass through, in order.</RpEmpty> : (
                <ol className="flex flex-col gap-3">
                    {stops.map((s, i) => (
                        <li key={s.id} className="rounded-rp-inset bg-rp-inset p-3">
                            <div className="flex items-start gap-2">
                                <span className="mt-8 flex size-6 shrink-0 items-center justify-center rounded-full bg-rp-ink text-2xs font-semibold text-rp-on-ink">{i + 1}</span>
                                <div className="min-w-0 flex-1">
                                    <RpField label="Place">
                                        {id => (
                                            <PlaceField
                                                id={id}
                                                value={s.name}
                                                located={Boolean(s.coordinates)}
                                                placeholder="City or region"
                                                onChange={name => update(i, { name, coordinates: undefined })}
                                                onPick={(name, c) => update(i, { name, coordinates: { lat: c.lat, lng: c.lng, tz: c.tz, country: c.country, countryCode: c.countryCode } })}
                                                format={p => p.name}
                                            />
                                        )}
                                    </RpField>
                                    <div className="grid grid-cols-2 gap-x-3">
                                        <RpField label="From">{id => <input id={id} type="date" value={s.startDate || ''} onChange={e => update(i, { startDate: e.target.value, endDate: s.endDate && s.endDate >= e.target.value ? s.endDate : e.target.value })} className={cn(RP_FIELD, 'rp-date rp-tabular')} />}</RpField>
                                        <RpField label="To">{id => <input id={id} type="date" min={s.startDate || undefined} value={s.endDate || ''} onChange={e => update(i, { endDate: e.target.value })} className={cn(RP_FIELD, 'rp-date rp-tabular')} />}</RpField>
                                    </div>
                                </div>
                                <div className="flex shrink-0 flex-col pt-5">
                                    <button type="button" aria-label={`Move stop ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)} className="inline-flex size-11 items-center justify-center rounded-full text-rp-muted outline-none hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted disabled:opacity-30"><ArrowUp size={16} aria-hidden /></button>
                                    <button type="button" aria-label={`Move stop ${i + 1} down`} disabled={i === stops.length - 1} onClick={() => move(i, 1)} className="inline-flex size-11 items-center justify-center rounded-full text-rp-muted outline-none hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted disabled:opacity-30"><ArrowDown size={16} aria-hidden /></button>
                                    <button type="button" aria-label={`Remove stop ${i + 1}`} onClick={() => setStops(list => list.filter((_, j) => j !== i))} className="inline-flex size-11 items-center justify-center rounded-full text-rp-muted outline-none hover:text-rp-rust focus-visible:ring-2 focus-visible:ring-rp-muted"><Trash size={16} aria-hidden /></button>
                                </div>
                            </div>
                        </li>
                    ))}
                </ol>
            )}
            {dirty ? (
                <div className="mt-4 flex justify-end">
                    <ParticleButton
                        onClick={async () => { await onSave(stops.filter(s => s.name.trim()).map(s => ({ ...s, name: s.name.trim() }))); }}
                        pendingLabel="Saving"
                        successLabel="Saved"
                        errorLabel="Try again"
                    >
                        Save route
                    </ParticleButton>
                </div>
            ) : null}
        </section>
    );
};

/* ------------------------------------------------------------------ */
/* Panel */
/* ------------------------------------------------------------------ */

export const TripMapPanel: React.FC<{ trip: Trip; onSaveStops: (locations: LocationEntry[]) => Promise<void> }> = ({ trip, onSaveStops }) => {
    const mapRef = useRef<RpMapHandle>(null);
    const isDark = useIsDark();
    const appearance = useMemo(() => loadMapAppearanceSettings(), []);
    const [hover, setHover] = useState<string | null>(null);
    const [selected, setSelected] = useState<string | null>(null);

    // The scratch mode draws routes together with pins, which is what a single trip needs.
    const model = useMemo(() => buildMapModel([trip], { mode: 'scratch', groupAirports: false, scratchRoutes: ['flight', 'land', 'sea'] }), [trip]);
    const pins = useMemo(() => {
        const out: { lat: number; lng: number; name: string }[] = [];
        (trip.accommodations || []).forEach(a => { if (a.coordinates) out.push({ lat: a.coordinates.lat, lng: a.coordinates.lng, name: a.name }); });
        (trip.locations || []).forEach(l => { if (l.coordinates) out.push({ lat: l.coordinates.lat, lng: l.coordinates.lng, name: l.name }); });
        (trip.transports || []).forEach(t => (t.waypoints || []).forEach(w => { if (w.coordinates) out.push({ lat: w.coordinates.lat, lng: w.coordinates.lng, name: w.name }); }));
        return out;
    }, [trip]);
    const points = useMemo<LngLat[]>(() => [
        ...model.routes.flatMap(r => [r.from, r.to]),
        ...pins.map(p => [p.lng, p.lat] as LngLat),
    ], [model.routes, pins]);
    const bounds = useMemo(() => boundsOf(points), [points]);
    const boundsKey = bounds ? bounds.flat().join(',') : '';

    // Frame everything once the map is up, and again whenever the trip's places change.
    useEffect(() => {
        if (!bounds) return;
        const timer = window.setTimeout(() => mapRef.current?.fitBounds(bounds), 700);
        return () => window.clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [boundsKey]);

    const focus = (id: string, from: LngLat, to: LngLat) => {
        setSelected(id);
        const b = boundsOf([from, to]);
        if (b) mapRef.current?.fitBounds(b);
    };
    const onHover = (h: RpMapHover | null) => setHover(!h ? null : h.kind === 'route' ? `${h.route.origin} → ${h.route.destination}` : h.kind === 'place' ? h.place.label : h.kind === 'pin' ? h.name : null);

    const empty = model.routes.length === 0 && pins.length === 0;

    return (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-6">
            <div className="flex min-w-0 flex-col gap-3 lg:gap-6">
                <div className="relative h-[24rem] overflow-hidden rounded-rp-card bg-rp-surface rp-shadow-rest sm:h-[30rem] lg:h-[36rem]">
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
                        highlightRouteIds={selected ? [selected] : null}
                        onHover={onHover}
                    />
                    {hover ? <p className="pointer-events-none absolute top-3 left-3 max-w-[80%] truncate rounded-full bg-rp-ink px-3 py-1.5 text-xs font-medium text-rp-on-ink rp-shadow-float">{hover}</p> : null}
                    {empty ? (
                        <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded-rp-tile bg-rp-surface/95 px-4 py-3 text-sm text-rp-muted rp-shadow-float">
                            Nothing to draw yet. Pick places for your transport and stays and they appear here.
                        </div>
                    ) : null}
                </div>
            </div>

            <div className="flex min-w-0 flex-col gap-3 lg:gap-6">
                <section className={CARD}>
                    <h2 className="mb-3 flex items-center gap-2 text-base font-medium text-rp-ink"><Path size={18} className="text-rp-muted" aria-hidden /> Legs <span className="rp-tabular text-sm text-rp-muted">{model.routes.length}</span></h2>
                    {model.routes.length === 0 ? (
                        <p className="text-sm text-rp-muted">Legs with both places picked are drawn on the map.</p>
                    ) : (
                        <ul className="flex flex-col">
                            {model.routes.map(r => {
                                const look = modeLook(r.rawMode);
                                return (
                                    <li key={r.id} className="border-t border-rp-line first:border-t-0">
                                        <button
                                            type="button"
                                            aria-pressed={selected === r.id}
                                            onClick={() => focus(r.id, r.from, r.to)}
                                            className={cn('flex min-h-11 w-full items-center gap-3 rounded-rp-inset px-2 py-2 text-left outline-none transition-colors duration-150 hover:bg-rp-inset focus-visible:ring-2 focus-visible:ring-rp-muted', selected === r.id && 'bg-rp-inset')}
                                        >
                                            <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-[10px]', look.tint)}><look.icon size={16} aria-hidden /></span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-sm font-medium text-rp-ink">{r.origin} → {r.destination}</span>
                                                <span className="block truncate text-xs text-rp-muted">{[r.legs[0]?.date ? formatDate(r.legs[0].date, 'short') : '', r.legs[0]?.provider].filter(Boolean).join(' · ')}</span>
                                            </span>
                                            <span className="rp-tabular text-xs text-rp-muted">{Math.round(r.distanceKm).toLocaleString()} km</span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    {model.totals.routes > 0 ? <p className="rp-tabular mt-3 text-xs text-rp-muted">{Math.round(model.totals.distanceKm).toLocaleString()} km in total</p> : null}
                </section>
                <Stops trip={trip} onSave={onSaveStops} />
            </div>
        </div>
    );
};

export default TripMapPanel;
