import React, { useMemo, useState } from 'react';
import type { LocationEntry, Transport, TransportMode, Trip } from '../../../types';
import {
    compileRoute, dayNumber, dayTripTitle, estimateSegment, formatDuration, loadRoute, mirrorReturn, newDayTrip, nextSegment, returnsSameWay,
    type RouteSector, type RouteSegment,
} from '../../../utils/tripRoute';
import { shiftDate } from '../../../utils/tripItinerary';
import { formatDate } from '../../../utils/formatters';
import { ArrowDown, ArrowRight, ArrowUp, CalendarBlank, MapPin, Moon, Path, Plus, Trash } from '../../ui/hugeicons';
import { RP_FIELD, RpField } from '../fields';
import { PlaceField } from '../PlaceField';
import { RpEmpty } from '../ui';
import { WeatherChip } from '../WeatherChip';
import ParticleButton from '../../kokonutui/particle-button';
import { LEG_PLACES, legText, modeLook } from '../trips/transportModes';
import { cn } from '../../../utils/cn';

/**
 * The route planner (UI_UX_DESIGN_REFERENCE.md decision 56): the main journey from place to place on
 * given days, and day trips from the places on the way. Each leg shows how far and how long it is and
 * the weather where it ends; saving turns it into transports and stops, so the whole journey is
 * on the map, the canvas and the itinerary.
 */

const CARD = 'rounded-rp-card bg-rp-surface p-4 rp-shadow-rest sm:p-6';
const DATE = cn(RP_FIELD, 'rp-date rp-tabular');
const GHOST = 'inline-flex min-h-11 items-center gap-2 rounded-full bg-rp-inset px-4 text-sm font-medium text-rp-ink outline-none transition-colors duration-150 hover:bg-rp-line focus-visible:ring-2 focus-visible:ring-rp-muted';
const ICON_BTN = 'inline-flex size-11 shrink-0 items-center justify-center rounded-full text-rp-muted outline-none hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted disabled:opacity-30';
/** The modes a route is driven, taken or sailed in; flights live under Bookings. */
const ROUTE_MODES: TransportMode[] = ['Personal Car', 'Car Rental', 'Train', 'Bus', 'Ferry', 'Cruise'];

const nightsBetween = (a?: string, b?: string) => (a && b ? Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)) : 0);

const ModePicker: React.FC<{ value: TransportMode; onChange: (m: TransportMode) => void }> = ({ value, onChange }) => (
    <div role="group" aria-label="How" className="flex flex-wrap gap-1">
        {ROUTE_MODES.map(m => {
            const look = modeLook(m);
            const on = value === m;
            return (
                <button
                    key={m}
                    type="button"
                    aria-pressed={on}
                    aria-label={look.label}
                    title={look.label}
                    onClick={() => onChange(m)}
                    className={cn('inline-flex size-11 items-center justify-center rounded-full outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-rp-muted', on ? look.fill : cn('bg-rp-inset hover:bg-rp-line', look.text))}
                >
                    <look.icon size={18} aria-hidden />
                </button>
            );
        })}
    </div>
);

const Places: React.FC<{ seg: RouteSegment; onChange: (p: Partial<RouteSegment>) => void; originLabel?: string }> = ({ seg, onChange, originLabel = 'From' }) => {
    const places = LEG_PLACES[seg.mode];
    const format = legText(seg.mode);
    const tint = modeLook(seg.mode).tint;
    return (
        <div className="grid gap-x-3 sm:grid-cols-2">
            <RpField label={originLabel}>
                {id => (
                    <PlaceField
                        id={id}
                        value={seg.origin}
                        located={seg.originLat != null}
                        placeholder="City or place"
                        mode={places.mode === 'airport' ? 'auto' : places.mode}
                        prefer={places.prefer}
                        format={format}
                        pillClassName={tint}
                        onChange={text => onChange({ origin: text, originLat: undefined, originLng: undefined })}
                        onPick={(text, c) => onChange({ origin: text, originLat: c.lat, originLng: c.lng })}
                    />
                )}
            </RpField>
            <RpField label="To">
                {id => (
                    <PlaceField
                        id={id}
                        value={seg.destination}
                        located={seg.destLat != null}
                        placeholder="City or place"
                        mode={places.mode === 'airport' ? 'auto' : places.mode}
                        prefer={places.prefer}
                        align="end"
                        bias={seg.originLat != null && seg.originLng != null ? { lat: seg.originLat, lon: seg.originLng } : undefined}
                        format={format}
                        pillClassName={tint}
                        onChange={text => onChange({ destination: text, destLat: undefined, destLng: undefined })}
                        onPick={(text, c) => onChange({ destination: text, destLat: c.lat, destLng: c.lng })}
                    />
                )}
            </RpField>
        </div>
    );
};

const Estimate: React.FC<{ seg: RouteSegment }> = ({ seg }) => {
    const est = estimateSegment(seg);
    if (!est) return <span className="text-xs text-rp-muted">Pick both places to see the distance and time.</span>;
    return <span className="rp-tabular text-xs font-medium text-rp-ink">≈ {est.km.toLocaleString()} km · {formatDuration(est.minutes)}</span>;
};

/* ------------------------------------------------------------------ */
/* Editor */
/* ------------------------------------------------------------------ */

const RouteEditor: React.FC<{ trip: Trip; initial: RouteSector[]; onSave: (transports: Transport[], locations: LocationEntry[]) => Promise<void>; onFocus?: (seg: RouteSegment) => void }> = ({ trip, initial, onSave, onFocus }) => {
    const [sectors, setSectors] = useState<RouteSector[]>(initial);
    const dirty = useMemo(() => JSON.stringify(sectors) !== JSON.stringify(initial), [sectors, initial]);
    const fallbackDate = trip.startDate || '';
    const journeys = sectors.filter(s => s.kind === 'journey');
    const dayTrips = sectors.filter(s => s.kind === 'daytrip');

    const setSector = (id: string, fn: (s: RouteSector) => RouteSector) => setSectors(list => list.map(s => (s.id === id ? fn(s) : s)));
    const patchSegment = (sectorId: string, segId: string, p: Partial<RouteSegment>) => setSector(sectorId, sector => {
        const idx = sector.segments.findIndex(s => s.id === segId);
        if (idx < 0) return sector;
        const old = sector.segments[idx];
        let segments = sector.segments.map(s => (s.id === segId ? { ...s, ...p } : s));
        // A journey stays joined up: the next leg starts where this one now ends.
        const next = segments[idx + 1];
        if (sector.kind === 'journey' && next && ('destination' in p || 'destLat' in p) && (next.origin === old.destination || !next.origin)) {
            segments = segments.map((s, i) => (i === idx + 1 ? { ...s, origin: segments[idx].destination, originLat: segments[idx].destLat, originLng: segments[idx].destLng } : s));
        }
        let out: RouteSector = { ...sector, segments };
        if (sector.kind === 'daytrip') {
            const wasReturn = returnsSameWay(sector) || sector.segments.length === 2;
            if (idx === 0 && wasReturn) out = mirrorReturn(out);
            if (idx === 0 && (!sector.title || sector.title === 'Day trip' || sector.title === dayTripTitle(sector))) out = { ...out, title: dayTripTitle(out) };
        }
        return out;
    });
    const move = (sectorId: string, i: number, by: number) => setSector(sectorId, s => {
        const to = i + by;
        if (to < 0 || to >= s.segments.length) return s;
        const segments = [...s.segments];
        [segments[i], segments[to]] = [segments[to], segments[i]];
        return { ...s, segments };
    });
    const removeSegment = (sectorId: string, segId: string) => setSector(sectorId, s => ({ ...s, segments: s.segments.filter(x => x.id !== segId) }));
    const addLeg = (sectorId: string) => setSector(sectorId, s => ({ ...s, segments: [...s.segments, nextSegment(s, fallbackDate, trip.coordinates ? { name: trip.location, lat: trip.coordinates.lat, lng: trip.coordinates.lng } : { name: trip.location })] }));
    const addDayTrip = (base: { name: string; lat?: number; lng?: number }, date: string) => setSectors(list => [...list, newDayTrip(base, date)]);
    const removeSector = (id: string) => setSectors(list => list.filter(s => s.id !== id));
    const toggleReturn = (sector: RouteSector, on: boolean) => setSector(sector.id, s => (on
        ? mirrorReturn({ ...s, segments: [s.segments[0], { ...s.segments[0], id: s.segments[1]?.id ?? `${s.segments[0].id}-back`, original: s.segments[1]?.original }] })
        : { ...s, segments: s.segments.slice(0, 1) }));

    const save = async () => {
        const { transports, locations } = compileRoute(trip, sectors);
        await onSave(transports, locations);
    };

    const journey = journeys[0];

    return (
        <div className="flex flex-col gap-3 lg:gap-6">
            {/* The main journey */}
            <section className={CARD}>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <h2 className="flex items-center gap-2 text-base font-medium text-rp-ink"><Path size={18} className="text-rp-muted" aria-hidden /> Journey</h2>
                    <button type="button" onClick={() => (journey ? addLeg(journey.id) : setSectors(l => [{ id: 'journey', title: 'Journey', kind: 'journey', segments: [nextSegment({ id: 'journey', title: 'Journey', kind: 'journey', segments: [] }, fallbackDate)] }, ...l]))} className={GHOST}>
                        <Plus size={16} aria-hidden /> Add a leg
                    </button>
                </div>
                {!journey || journey.segments.length === 0 ? (
                    <RpEmpty title="Plan the route">Add the first leg, like Paris to Amsterdam on day 1, then keep adding where you go next.</RpEmpty>
                ) : (
                    <ol className="flex flex-col">
                        {journey.segments.map((seg, i) => {
                            const next = journey.segments[i + 1];
                            const nights = nightsBetween(seg.date, next ? next.date : trip.endDate);
                            const day = dayNumber(trip, seg.date);
                            return (
                                <li key={seg.id}>
                                    <div className="rounded-rp-inset bg-rp-inset p-3">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <span className="flex items-center gap-2 text-sm font-medium text-rp-ink">
                                                <span className="flex size-6 items-center justify-center rounded-full bg-rp-ink text-2xs font-semibold text-rp-on-ink">{i + 1}</span>
                                                {day > 0 ? `Day ${day}` : 'Leg'}
                                            </span>
                                            <div className="flex items-center">
                                                <button type="button" aria-label={`Move leg ${i + 1} up`} disabled={i === 0} onClick={() => move(journey.id, i, -1)} className={ICON_BTN}><ArrowUp size={16} aria-hidden /></button>
                                                <button type="button" aria-label={`Move leg ${i + 1} down`} disabled={i === journey.segments.length - 1} onClick={() => move(journey.id, i, 1)} className={ICON_BTN}><ArrowDown size={16} aria-hidden /></button>
                                                <button type="button" aria-label={`Remove leg ${i + 1}`} onClick={() => removeSegment(journey.id, seg.id)} className={cn(ICON_BTN, 'hover:text-rp-rust')}><Trash size={16} aria-hidden /></button>
                                            </div>
                                        </div>
                                        <div className="mt-1 flex flex-wrap items-end gap-x-3 gap-y-1">
                                            <div className="w-40"><RpField label="Date">{id => <input id={id} type="date" value={seg.date} min={trip.startDate || undefined} onChange={e => patchSegment(journey.id, seg.id, { date: e.target.value })} className={DATE} />}</RpField></div>
                                            <div className="pb-1.5"><ModePicker value={seg.mode} onChange={mode => patchSegment(journey.id, seg.id, { mode })} /></div>
                                        </div>
                                        <Places seg={seg} onChange={p => patchSegment(journey.id, seg.id, p)} />
                                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                                            <Estimate seg={seg} />
                                            {seg.originLat != null && seg.destLat != null && onFocus ? (
                                                <button type="button" onClick={() => onFocus(seg)} className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-rp-muted outline-none hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted"><MapPin size={14} aria-hidden /> Show on the map</button>
                                            ) : null}
                                        </div>
                                    </div>

                                    {/* The stop this leg reaches: how long you stay, the weather, and day trips from here */}
                                    {seg.destination.trim() ? (
                                        <div className="my-1 ml-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-l-2 border-rp-line py-2 pl-4">
                                            <span className="flex items-center gap-2 text-sm font-medium text-rp-ink"><MapPin size={16} className="text-rp-green" aria-hidden /> {seg.destination}</span>
                                            <span className="flex items-center gap-1.5 text-xs text-rp-muted">
                                                <Moon size={14} aria-hidden />
                                                {nights > 0 ? `${nights} ${nights === 1 ? 'night' : 'nights'}` : next ? 'Passing through' : 'Last stop'}
                                            </span>
                                            <WeatherChip lat={seg.destLat} lng={seg.destLng} date={seg.date} />
                                            <button
                                                type="button"
                                                onClick={() => addDayTrip({ name: seg.destination, lat: seg.destLat, lng: seg.destLng }, nights > 0 ? shiftDate(seg.date, 1) : seg.date)}
                                                className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-rp-muted outline-none hover:bg-rp-inset hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted"
                                            >
                                                <Plus size={14} aria-hidden /> Day trip from {seg.destination}
                                            </button>
                                        </div>
                                    ) : <div className="h-3" />}
                                </li>
                            );
                        })}
                    </ol>
                )}
                {journeys.slice(1).map(extra => (
                    <p key={extra.id} className="mt-3 text-xs text-rp-muted">{extra.title}: {extra.segments.length} {extra.segments.length === 1 ? 'leg' : 'legs'} from an earlier plan are kept as they are.</p>
                ))}
            </section>

            {/* Day trips */}
            <section className={CARD}>
                <h2 className="mb-1 flex items-center gap-2 text-base font-medium text-rp-ink"><CalendarBlank size={18} className="text-rp-green" aria-hidden /> Day trips <span className="rp-tabular text-sm text-rp-muted">{dayTrips.length}</span></h2>
                <p className="mb-4 text-xs text-rp-muted">A drive or ride out from a stop on the journey, like Amsterdam to Delft and back. Add one from a stop above.</p>
                {dayTrips.length === 0 ? <RpEmpty title="No day trips yet">Use "Day trip from …" under a stop to plan one.</RpEmpty> : (
                    <ul className="flex flex-col gap-3">
                        {dayTrips.map(sector => {
                            const out = sector.segments[0];
                            if (!out) return null;
                            const generic = sector.segments.length > 2 || (sector.segments.length === 2 && !returnsSameWay(sector));
                            const round = sector.segments.length === 2;
                            return (
                                <li key={sector.id} className="rounded-rp-inset bg-rp-inset p-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-rp-ink">
                                            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-rp-green text-rp-paper"><MapPin size={14} aria-hidden /></span>
                                            <span className="truncate">{sector.title}</span>
                                        </p>
                                        <button type="button" aria-label={`Remove ${sector.title}`} onClick={() => removeSector(sector.id)} className={cn(ICON_BTN, 'hover:text-rp-rust')}><Trash size={16} aria-hidden /></button>
                                    </div>
                                    <div className="mt-1 flex flex-wrap items-end gap-x-3 gap-y-1">
                                        <div className="w-40"><RpField label="Date">{id => <input id={id} type="date" value={out.date} min={trip.startDate || undefined} max={trip.endDate || undefined} onChange={e => patchSegment(sector.id, out.id, { date: e.target.value })} className={DATE} />}</RpField></div>
                                        <div className="pb-1.5"><ModePicker value={out.mode} onChange={mode => patchSegment(sector.id, out.id, { mode })} /></div>
                                    </div>
                                    <Places seg={out} originLabel="Starting from" onChange={p => patchSegment(sector.id, out.id, p)} />
                                    {generic ? (
                                        <ul className="mb-2 mt-1 flex flex-col gap-1 text-xs text-rp-muted">
                                            {sector.segments.slice(1).map(s => <li key={s.id} className="flex items-center gap-1.5">{s.origin} <ArrowRight size={12} aria-hidden /> {s.destination} · {formatDate(s.date, 'short')}</li>)}
                                        </ul>
                                    ) : (
                                        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-rp-ink">
                                            <input type="checkbox" checked={round} onChange={e => toggleReturn(sector, e.target.checked)} className="size-5 accent-rp-ink" />
                                            Come back the same day
                                        </label>
                                    )}
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-1">
                                        <Estimate seg={out} />
                                        {round && !generic && estimateSegment(out) ? <span className="text-xs text-rp-muted">{(estimateSegment(out)!.km * 2).toLocaleString()} km there and back</span> : null}
                                        <WeatherChip lat={out.destLat} lng={out.destLng} date={out.date} />
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>

            {dirty ? (
                <div className="sticky bottom-[calc(96px+env(safe-area-inset-bottom,0px))] z-raised flex items-center justify-between gap-3 rounded-full bg-rp-ink py-1.5 pr-1.5 pl-5 text-rp-on-ink rp-shadow-float md:bottom-4">
                    <span className="text-sm">Unsaved route changes</span>
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setSectors(initial)} className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium outline-none hover:bg-rp-on-ink/15 focus-visible:ring-2 focus-visible:ring-current">Discard</button>
                        <ParticleButton onClick={save} pendingLabel="Saving" successLabel="Saved" errorLabel="Try again" variant="mustard">Save route</ParticleButton>
                    </div>
                </div>
            ) : null}
        </div>
    );
};

/** Loads the trip's route and remounts the editor when the saved route changes. */
export const RoutePlanner: React.FC<{ trip: Trip; onSave: (transports: Transport[], locations: LocationEntry[]) => Promise<void>; onFocus?: (seg: RouteSegment) => void }> = ({ trip, onSave, onFocus }) => {
    const initial = useMemo(() => loadRoute(trip), [trip.transports, trip.locations, trip.startDate]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const key = useMemo(() => JSON.stringify(initial.map(s => [s.id, s.segments.map(g => [g.id, g.origin, g.destination, g.date, g.mode, g.originLat, g.destLat])])), [initial]);
    return <RouteEditor key={key} trip={trip} initial={initial} onSave={onSave} onFocus={onFocus} />;
};

export default RoutePlanner;
