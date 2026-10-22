import React, { useEffect, useState } from 'react';
import type { Carrier } from '../../../types';
import SmoothDrawer from '../../kokonutui/smooth-drawer';
import { ArrowUpRight, Check, PencilSimple, Suitcase, X } from '../../ui/hugeicons';
import { RP_FIELD } from '../fields';
import { ShareMenu } from './ShareMenu';
import { RpSection, RpSheet, useIsMobile } from '../ui';
import { CarrierCell, DelayChip, STATUS_LOOK, StatusPill, layoverTone } from './JourneyParts';
import { modeLook } from '../trips/transportModes';
import { formatDate, formatCurrency } from '../../../utils/formatters';
import {
    formatMinutes, isIndependent, journeyKm, journeyMinutes, journeyRoute, journeyStatus, layoverMinutes, placeCode, placeName,
    type JourneyGroup, type JourneyRecord,
} from '../../../utils/journeysModel';
import { cn } from '../../../utils/cn';

/**
 * The timeline of a journey (flights that belong together, such as there and back, or with a change):
 * every leg in order with its times, the time spent waiting between legs, the stay at the turnaround,
 * and the journey's totals. Tap a leg to open it. A right sheet from tablets up, a Smooth Drawer on phones.
 */

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <div className="flex min-w-0 flex-col rounded-rp-inset bg-rp-inset/60 px-3 py-2">
        <span className="text-2xs text-rp-muted">{label}</span>
        <span className="rp-tabular truncate text-sm font-semibold text-rp-ink">{value}</span>
    </div>
);

/** What fills the gap between two legs: a wait at the airport, or a stay somewhere. */
const Gap: React.FC<{ a: JourneyRecord; b: JourneyRecord }> = ({ a, b }) => {
    const mins = layoverMinutes(a.flight, b.flight);
    if (mins <= 0) return null;
    const stay = mins >= 24 * 60;
    const place = placeName(a.flight.destination) || placeCode(a.flight.destination);
    return (
        <li aria-hidden={false} className="relative ml-[0.7rem] flex min-h-9 items-center border-l-2 border-dashed border-rp-line pl-6">
            <span className={cn('rp-tabular inline-flex min-h-6 items-center rounded-full px-2.5 text-2xs font-semibold', layoverTone(mins))}>
                {stay ? `${Math.round(mins / 1440)} ${Math.round(mins / 1440) === 1 ? 'day' : 'days'} in ${place}` : `Layover ${formatMinutes(mins)} in ${placeCode(a.flight.destination)}`}
            </span>
        </li>
    );
};

const Leg: React.FC<{ rec: JourneyRecord; last: boolean; onOpen: (r: JourneyRecord) => void; onRemove?: (r: JourneyRecord) => void; brandfetchApiKey?: string; carriers?: Carrier[] }> = ({ rec, last, onOpen, onRemove, brandfetchApiKey, carriers }) => {
    const t = rec.flight;
    const look = modeLook(t.mode);
    const status = journeyStatus(t);
    const fill = STATUS_LOOK[status.state];
    return (
        <li className={cn('relative ml-[0.7rem] border-l-2 pl-6', last ? 'border-transparent' : 'border-rp-line')}>
            <span aria-hidden className={cn('absolute -left-[0.55rem] top-4 size-4 rounded-full border-2 border-rp-surface', fill.fill, status.state === 'done' && 'bg-rp-green')} />
            <button
                type="button"
                onClick={() => onOpen(rec)}
                aria-label={`${t.origin} to ${t.destination}, ${formatDate(t.departureDate, 'short-with-year')}`}
                className="mb-2 flex w-full min-h-11 flex-col gap-2 rounded-rp-inset bg-rp-inset/60 p-3 text-left outline-none transition-colors duration-150 hover:bg-rp-inset focus-visible:ring-2 focus-visible:ring-rp-muted"
            >
                <span className="flex items-center justify-between gap-2">
                    <span className="rp-tabular text-xs font-medium text-rp-muted">{formatDate(t.departureDate, 'weekday-short')}</span>
                    <span className="flex items-center gap-1.5"><DelayChip delay={status.delay} /><StatusPill status={status} mode={t.mode} /></span>
                </span>
                <span className="flex items-center gap-3">
                    <span className="flex flex-col">
                        <span className="rp-tabular text-xl font-semibold leading-none text-rp-ink">{placeCode(t.origin)}</span>
                        <span className="rp-tabular mt-1 text-xs text-rp-muted">{t.departureTime || '--:--'}</span>
                    </span>
                    <span className="flex min-w-6 flex-1 items-center gap-1 text-rp-muted" aria-hidden>
                        <span className="h-px flex-1 border-t-2 border-dotted border-rp-line" />
                        <look.icon size={16} className={look.text} />
                        <span className="h-px flex-1 border-t-2 border-dotted border-rp-line" />
                    </span>
                    <span className="flex flex-col items-end">
                        <span className="rp-tabular text-xl font-semibold leading-none text-rp-ink">{placeCode(t.destination)}</span>
                        <span className="rp-tabular mt-1 text-xs text-rp-muted">{t.arrivalTime || '--:--'}{t.arrivalDate && t.departureDate && t.arrivalDate > t.departureDate ? ' +1' : ''}</span>
                    </span>
                </span>
                <span className="flex items-center justify-between gap-2">
                    <CarrierCell t={t} size="sm" brandfetchApiKey={brandfetchApiKey} carriers={carriers} className="min-w-0" />
                    <span className="rp-tabular shrink-0 text-xs text-rp-muted">{formatMinutes(journeyMinutes(t))}{journeyKm(t) ? ` · ${journeyKm(t).toLocaleString('en-US')} km` : ''}</span>
                </span>
            </button>
            {onRemove ? (
                <button type="button" onClick={() => onRemove(rec)} className="-mt-1 mb-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-rp-muted outline-none hover:bg-rp-inset hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted">
                    <X size={14} aria-hidden /> Take off trip
                </button>
            ) : null}
        </li>
    );
};

const Section: React.FC<{ title: string; legs: JourneyRecord[]; onOpen: (r: JourneyRecord) => void; onRemove?: (r: JourneyRecord) => void; brandfetchApiKey?: string; carriers?: Carrier[] }> = ({ title, legs, onOpen, onRemove, brandfetchApiKey, carriers }) => (
    <RpSection title={title}>
        <ol className="flex flex-col py-2">
            {legs.map((r, i) => (
                <React.Fragment key={r.flight.id}>
                    <Leg rec={r} last={i === legs.length - 1} onOpen={onOpen} onRemove={onRemove} brandfetchApiKey={brandfetchApiKey} carriers={carriers} />
                    {i < legs.length - 1 ? <Gap a={r} b={legs[i + 1]} /> : null}
                </React.Fragment>
            ))}
        </ol>
    </RpSection>
);

export const JourneyTimeline: React.FC<{
    group: JourneyGroup | null;
    onClose: () => void;
    onOpenLeg: (record: JourneyRecord) => void;
    onOpenTrip?: (tripId: string) => void;
    /** Rename the trip these flights are on. */
    onRenameTrip?: (tripId: string, name: string) => Promise<void> | void;
    /** Take one flight off its trip (it stays in the log). */
    onTakeOff?: (record: JourneyRecord) => void;
    /** Make a trip of flights that are on no trip yet. */
    onCreateTrip?: (group: JourneyGroup) => void;
    brandfetchApiKey?: string;
    carriers?: Carrier[];
}> = ({ group, onClose, onOpenLeg, onOpenTrip, onRenameTrip, onTakeOff, onCreateTrip, brandfetchApiKey, carriers }) => {
    const mobile = useIsMobile();
    const kept = React.useRef(group);
    if (group) kept.current = group;
    const g = group ?? kept.current;
    const [editingName, setEditingName] = useState(false);
    const [name, setName] = useState('');
    useEffect(() => { setEditingName(false); setName(g?.trip.name || ''); }, [g?.id, g?.trip.name]);
    if (!g) return null;
    const onTrip = !isIndependent(g.trip.id);
    const remove = onTrip && onTakeOff && g.legs.length > 1 ? onTakeOff : undefined;

    const minutes = g.legs.reduce((n, r) => n + journeyMinutes(r.flight), 0);
    const km = g.legs.reduce((n, r) => n + journeyKm(r.flight), 0);
    const cost = g.legs.reduce((n, r) => n + (r.flight.cost || 0), 0);
    const title = journeyRoute(g.legs).join(' → ');
    const first = g.legs[0].flight;
    const last = g.legs[g.legs.length - 1].flight;
    const subtitle = `${formatDate(first.departureDate, 'short')}${last.departureDate !== first.departureDate ? ` – ${formatDate(last.departureDate, 'short-with-year')}` : `, ${new Date(first.departureDate).getFullYear()}`} · ${g.legs.length} flights · ${g.shape === 'round-trip' ? 'round trip' : g.shape === 'multi-city' ? 'multi-city' : g.stops > 0 ? `${g.stops} ${g.stops === 1 ? 'stop' : 'stops'}` : 'connection'}`;
    const turn = g.outbound.length && g.returns.length ? layoverMinutes(g.outbound[g.outbound.length - 1].flight, g.returns[0].flight) : 0;

    const body = (
        <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Flights" value={String(g.legs.length)} />
                <Stat label="Time" value={formatMinutes(minutes)} />
                <Stat label="Distance" value={km ? `${km.toLocaleString('en-US')} km` : '—'} />
                <Stat label="Cost" value={cost ? formatCurrency(cost) : '—'} />
            </div>
            <Section title={g.returns.length ? 'Way out' : 'Flights'} legs={g.outbound} onOpen={onOpenLeg} onRemove={remove} brandfetchApiKey={brandfetchApiKey} carriers={carriers} />
            {g.returns.length ? (
                <>
                    {turn > 0 ? <p className="rp-tabular -my-2 text-center text-xs text-rp-muted">{Math.round(turn / 1440) >= 1 ? `${Math.round(turn / 1440)} ${Math.round(turn / 1440) === 1 ? 'day' : 'days'} away` : `${formatMinutes(turn)} before the way back`}</p> : null}
                    <Section title="Way back" legs={g.returns} onOpen={onOpenLeg} onRemove={remove} brandfetchApiKey={brandfetchApiKey} carriers={carriers} />
                </>
            ) : null}
            {!onTrip && onCreateTrip ? (
                <RpSection title="Trip" icon={Suitcase}>
                    <div className="flex min-h-11 items-center justify-between gap-3 py-1">
                        <span className="min-w-0 truncate text-sm text-rp-muted">{g.source === 'detected' ? 'Matched by airports and dates' : 'Not on a trip'}</span>
                        <button type="button" onClick={() => onCreateTrip(g)} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-rp-ink px-4 text-sm font-medium text-rp-on-ink outline-none hover:bg-rp-ink/90 focus-visible:ring-2 focus-visible:ring-rp-muted"><Suitcase size={16} aria-hidden /> Create trip</button>
                    </div>
                </RpSection>
            ) : null}
            <div className="flex justify-end"><ShareMenu records={g.legs} name="journey" /></div>
            {onTrip ? (
                <RpSection title="Trip" icon={Suitcase}>
                    {editingName ? (
                        <form
                            className="flex items-center gap-2 py-1"
                            onSubmit={e => { e.preventDefault(); const next = name.trim(); if (next && next !== g.trip.name) void onRenameTrip?.(g.trip.id, next); setEditingName(false); }}
                        >
                            <input autoFocus aria-label="Trip name" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setEditingName(false); } }} className={RP_FIELD} />
                            <button type="submit" aria-label="Save name" className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-rp-ink text-rp-on-ink outline-none hover:bg-rp-ink/90 focus-visible:ring-2 focus-visible:ring-rp-muted"><Check size={18} /></button>
                        </form>
                    ) : (
                        <div className="flex min-h-11 items-center justify-between gap-3 py-1">
                            <span className="min-w-0 truncate text-sm text-rp-ink">{g.trip.name}</span>
                            <span className="flex shrink-0 items-center">
                                {onRenameTrip ? (
                                    <button type="button" aria-label="Rename trip" onClick={() => setEditingName(true)} className="inline-flex size-11 items-center justify-center rounded-full text-rp-muted outline-none hover:bg-rp-line hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted"><PencilSimple size={18} /></button>
                                ) : null}
                                {onOpenTrip ? (
                                    <button type="button" aria-label={`Open ${g.trip.name}`} onClick={() => onOpenTrip(g.trip.id)} className="inline-flex size-11 items-center justify-center rounded-full text-rp-muted outline-none hover:bg-rp-line hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted"><ArrowUpRight size={18} /></button>
                                ) : null}
                            </span>
                        </div>
                    )}
                </RpSection>
            ) : null}
        </div>
    );

    if (mobile) {
        return (
            <SmoothDrawer open={Boolean(group)} onOpenChange={o => { if (!o) onClose(); }} title={title} description={subtitle} detailsLabel="Show timeline" hideDetailsLabel="Hide timeline" defaultExpanded peekHeight={130}>
                {body}
            </SmoothDrawer>
        );
    }
    return <RpSheet open={Boolean(group)} onClose={onClose} title={title} subtitle={subtitle} width={460}>{body}</RpSheet>;
};
