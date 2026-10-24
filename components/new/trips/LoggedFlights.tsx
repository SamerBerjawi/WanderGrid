import React, { useEffect, useId, useMemo, useState } from 'react';
import type { Transport } from '../../../types';
import type { TripDraft } from '../../../hooks/useTripsData';
import { dataService } from '../../../services/mockDb';
import { Airplane, ArrowRight, Plus } from '../../ui/hugeicons';
import { RpMoreButton } from '../ui';
import { formatDate } from '../../../utils/formatters';
import { placeCode } from '../../../utils/journeysModel';
import { RpCarrierLogo } from '../CarrierLogos';

/**
 * While a trip is made or edited: the flights already in the Flights log (not on any trip) that fall on
 * the trip's dates, one day either side, offered to add. Adding one puts it on the trip and marks it to
 * leave the independent list when the trip is saved, so it never shows twice.
 */

const shift = (date: string, days: number) => {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const LoggedFlights: React.FC<{
    draft: TripDraft;
    set: <K extends keyof TripDraft>(key: K, value: TripDraft[K]) => void;
    brandfetchApiKey?: string;
}> = ({ draft, set, brandfetchApiKey }) => {
    const [flights, setFlights] = useState<Transport[]>([]);
    useEffect(() => {
        let live = true;
        const load = () => dataService.getFlights().then(list => { if (live) setFlights((list || []).filter(f => !f.tripId || f.tripId === 'unassigned')); }).catch(() => undefined);
        void load();
        window.addEventListener('wandergrid_db_updated', load);
        return () => { live = false; window.removeEventListener('wandergrid_db_updated', load); };
    }, []);

    const start = draft.startDate;
    const end = draft.endDate || draft.startDate;
    const onTrip = useMemo(() => new Set((draft.transports || []).map(t => t.id)), [draft.transports]);
    const matches = useMemo(() => {
        if (!start) return [];
        const from = shift(start, -1), to = shift(end, 1);
        return flights
            .filter(f => f.departureDate && f.departureDate >= from && f.departureDate <= to && !onTrip.has(f.id))
            .sort((a, b) => `${a.departureDate}${a.departureTime}`.localeCompare(`${b.departureDate}${b.departureTime}`));
    }, [flights, start, end, onTrip]);

    const [all, setAll] = useState(false);
    const moreId = useId();
    if (matches.length === 0) return null;

    const add = (list: Transport[]) => {
        set('transports', [...(draft.transports || []), ...list]);
        set('adoptedFlightIds', [...(draft.adoptedFlightIds || []), ...list.map(f => f.id)]);
    };
    const shown = all ? matches : matches.slice(0, 3);

    return (
        <section aria-label="Flights in your log" className="flex flex-col gap-2 rounded-rp-inset bg-rp-green/10 p-3 ring-1 ring-rp-green/30">
            <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-medium text-rp-ink"><Airplane size={16} className="text-rp-rust" aria-hidden /> {matches.length === 1 ? '1 flight in your log is on these dates' : `${matches.length} flights in your log are on these dates`}</p>
                {matches.length > 1 ? (
                    <button type="button" onClick={() => add(matches)} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-rp-ink px-4 text-sm font-medium text-rp-on-ink outline-none hover:bg-rp-ink/90 focus-visible:ring-2 focus-visible:ring-rp-muted"><Plus size={16} aria-hidden /> Add all</button>
                ) : null}
            </div>
            <ul id={moreId} className="flex flex-col">
                {shown.map(f => (
                    <li key={f.id} className="flex min-h-14 items-center justify-between gap-3 border-t border-rp-green/20 py-1.5 first:border-t-0">
                        <span className="flex min-w-0 items-center gap-3">
                            <RpCarrierLogo provider={f.provider} identifier={f.identifier} src={f.logoUrl} fallback={Airplane} iconClassName="text-rp-rust" size="sm" />
                            <span className="flex min-w-0 flex-col">
                                <span className="rp-tabular flex items-center gap-1.5 text-sm font-semibold text-rp-ink">{placeCode(f.origin)} <ArrowRight size={12} className="text-rp-rust" aria-hidden /> {placeCode(f.destination)}</span>
                                <span className="rp-tabular truncate text-xs text-rp-muted">{formatDate(f.departureDate, 'short')}{f.identifier ? ` · ${f.identifier}` : ''}</span>
                            </span>
                        </span>
                        <button type="button" onClick={() => add([f])} aria-label={`Add ${f.origin} to ${f.destination} to the trip`} className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-rp-surface px-4 text-sm font-medium text-rp-ink outline-none hover:bg-rp-line focus-visible:ring-2 focus-visible:ring-rp-muted">Add</button>
                    </li>
                ))}
            </ul>
            {matches.length > 3 ? <RpMoreButton count={matches.length - 3} noun="flights" expanded={all} onToggle={() => setAll(a => !a)} controls={moreId} /> : null}
        </section>
    );
};
