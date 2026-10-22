import React, { useEffect, useMemo, useState } from 'react';
import type { Transport, TransportMode, Trip } from '../../../types';
import { RpChip, RpSheet } from '../ui';
import { MODE_LOOKS } from '../trips/transportModes';
import { estimateLeg } from '../../../services/journeyEstimate';
import { formatDate } from '../../../utils/formatters';
import { Plus } from '../../ui/hugeicons';
import { cn } from '../../../utils/cn';

/**
 * "From a trip's route": proposes one journey between each pair of consecutive stops of a trip's route
 * planner (the old Road trips page's import). Stops already linked by a journey are left out; the list
 * can be trimmed before anything is saved.
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** One journey per consecutive pair of stops. Distance and time come from the places (the road, the rail line or the sea lane when they can be found, else an estimate); only stops with no position at all fall back to the gap between the dates. */
const suggest = async (trip: Trip, mode: TransportMode, newId: () => string): Promise<Transport[]> => {
    const stops = [...(trip.locations || [])].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    const have = trip.transports || [];
    const out: Transport[] = [];
    for (let i = 0; i < stops.length - 1; i++) {
        const a = stops[i];
        const b = stops[i + 1];
        const same = (x?: string, y?: string) => (x || '').toLowerCase().trim() === (y || '').toLowerCase().trim();
        if (have.some(t => same(t.origin, a.name) && same(t.destination, b.name))) continue;
        let km = 0;
        let minutes = 0;
        if (a.coordinates && b.coordinates) {
            const est = await estimateLeg(mode, [[a.coordinates.lng, a.coordinates.lat], [b.coordinates.lng, b.coordinates.lat]]);
            km = est.km; minutes = est.minutes;
        }
        if (!minutes) {
            let hours = Math.abs(new Date(b.startDate).getTime() - new Date(a.endDate || a.startDate).getTime()) / 3_600_000;
            if (!Number.isFinite(hours) || hours <= 0) hours = 4;
            if (hours > 24) hours = 6;
            minutes = Math.round(hours * 60);
        }
        const departureDate = a.endDate || a.startDate;
        const depart = new Date(`${departureDate}T10:00:00`);
        const arrive = new Date(depart.getTime() + minutes * 60000);
        out.push({
            id: newId(), itineraryId: newId(), type: 'One-Way', mode, origin: a.name, destination: b.name,
            originLat: a.coordinates?.lat, originLng: a.coordinates?.lng, destLat: b.coordinates?.lat, destLng: b.coordinates?.lng,
            departureDate, departureTime: '10:00',
            arrivalDate: `${arrive.getFullYear()}-${pad(arrive.getMonth() + 1)}-${pad(arrive.getDate())}`, arrivalTime: `${pad(arrive.getHours())}:${pad(arrive.getMinutes())}`,
            provider: '', identifier: '', confirmationCode: '', cost: 0, waypoints: [],
            duration: minutes, distance: km || undefined,
            notes: "From the trip's route planner.",
        } as Transport);
    }
    return out;
};

export const RouteImportSheet: React.FC<{
    open: boolean;
    trips: Trip[];
    modes: TransportMode[];
    newId: () => string;
    onClose: () => void;
    onSave: (items: Transport[], tripId: string) => Promise<void>;
}> = ({ open, trips, modes, newId, onClose, onSave }) => {
    const withRoute = useMemo(() => trips.filter(t => (t.locations || []).length >= 2), [trips]);
    const [tripId, setTripId] = useState('');
    const [mode, setMode] = useState<TransportMode>(modes[0]);
    const [skipped, setSkipped] = useState<Set<string>>(new Set());
    const [busy, setBusy] = useState(false);
    const trip = withRoute.find(t => t.id === tripId);
    const [items, setItems] = useState<Transport[]>([]);
    const [working, setWorking] = useState(false);
    useEffect(() => {
        let live = true;
        if (!trip) { setItems([]); return; }
        setWorking(true);
        void suggest(trip, mode, newId).then(list => { if (live) { setItems(list); setWorking(false); } }).catch(() => { if (live) { setItems([]); setWorking(false); } });
        return () => { live = false; };
    }, [trip, mode, newId]);
    const chosen = items.filter(i => !skipped.has(`${i.origin}>${i.destination}`));
    const key = (t: Transport) => `${t.origin}>${t.destination}`;

    const save = async () => {
        setBusy(true);
        try { await onSave(chosen, tripId); onClose(); } finally { setBusy(false); }
    };

    return (
        <RpSheet
            open={open}
            onClose={onClose}
            title="From a trip's route"
            subtitle="One journey between each pair of stops"
            footer={withRoute.length === 0 ? null : (
                <button type="button" disabled={chosen.length === 0 || busy || working} onClick={() => void save()} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-rp-ink px-5 text-sm font-medium text-rp-on-ink outline-none hover:bg-rp-ink/90 focus-visible:ring-2 focus-visible:ring-rp-muted disabled:opacity-40">
                    <Plus size={16} aria-hidden /> {chosen.length ? `Add ${chosen.length} ${chosen.length === 1 ? 'journey' : 'journeys'}` : 'Add journeys'}
                </button>
            )}
        >
            {withRoute.length === 0 ? (
                <p className="text-sm text-rp-muted">None of your trips has a route yet. Add at least two stops to a trip's route first.</p>
            ) : (
                <div className="flex flex-col gap-5">
                    <div className="flex flex-col gap-1.5">
                        <span className="text-sm font-medium text-rp-ink">Trip</span>
                        <div className="custom-scrollbar flex max-h-52 flex-col gap-1 overflow-y-auto" role="group" aria-label="Trip">
                            {withRoute.map(t => (
                                <button key={t.id} type="button" aria-pressed={t.id === tripId} onClick={() => { setTripId(t.id); setSkipped(new Set()); }} className={cn('flex min-h-11 items-center rounded-rp-inset px-3 text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-rp-muted', t.id === tripId ? 'bg-rp-ink text-rp-on-ink' : 'bg-rp-inset text-rp-ink hover:bg-rp-line')}>
                                    <span className="truncate">{t.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2" role="group" aria-label="Kind of transport">
                        {MODE_LOOKS.filter(m => modes.includes(m.mode)).map(m => (
                            <RpChip key={m.mode} selected={mode === m.mode} onClick={() => setMode(m.mode)}><m.icon size={16} aria-hidden /> {m.label}</RpChip>
                        ))}
                    </div>
                    {trip ? (
                        working ? <p className="text-sm text-rp-muted">Working out distances…</p> : items.length === 0 ? (
                            <p className="text-sm text-rp-muted">Every stop on this route is already linked by a journey.</p>
                        ) : (
                            <ul className="flex flex-col gap-2">
                                {items.map(i => {
                                    const on = !skipped.has(key(i));
                                    return (
                                        <li key={key(i)}>
                                            <button type="button" aria-pressed={on} onClick={() => setSkipped(s => { const n = new Set(s); if (on) n.add(key(i)); else n.delete(key(i)); return n; })} className={cn('flex min-h-11 w-full items-center justify-between gap-3 rounded-rp-inset px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-rp-muted', on ? 'bg-rp-inset text-rp-ink' : 'text-rp-muted line-through')}>
                                                <span className="min-w-0 truncate text-sm font-medium">{i.origin} to {i.destination}</span>
                                                <span className="rp-tabular shrink-0 text-xs text-rp-muted">{formatDate(i.departureDate)}</span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )
                    ) : null}
                </div>
            )}
        </RpSheet>
    );
};
