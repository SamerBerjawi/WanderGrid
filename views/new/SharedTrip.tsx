import React, { useEffect, useMemo, useRef, useState } from 'react';
import { TripHeroMap } from '../../components/new/trip/TripMapPanel';
import { StatusPill } from '../../components/new/journeys/JourneyParts';
import { RpEmpty } from '../../components/new/ui';
import { Airplane, Bed, CalendarBlank, Clock, MapPin, Suitcase, type Icon } from '../../components/ui/hugeicons';
import { loadShared, type SharedResult } from '../../services/sharedTrip';
import { asTrip, buildDays, focusDay, namesText, type DayItem } from '../../utils/sharedTrip';
import { journeyStatus } from '../../utils/journeysModel';
import { formatDate, formatDateRange } from '../../utils/formatters';
import { todayISO } from '../../utils/tripsModel';
import { cn } from '../../utils/cn';

/**
 * A trip shared by link (`/s/:token`): the plan for family, read only and with no account. It shows the
 * itinerary by day, the map and the schedule status of each flight, and nothing private: the server sends a
 * whitelisted snapshot (costs, booking references, seats and notes are never in it). Standing apart from the
 * app shell, it has no menus and nothing to edit. Flight status follows the schedule, not a live feed.
 */

const ICON: Record<DayItem['kind'], Icon> = {
    flight: Airplane, transport: Suitcase, 'check-in': Bed, 'check-out': Bed, activity: MapPin,
};

/** Follows the member's theme choice on this device, else the system. */
const useTheme = () => {
    useEffect(() => {
        let pref: string | null = null;
        try { pref = localStorage.getItem('wandergrid_theme_preference'); } catch { /* the system theme is used */ }
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const apply = () => document.documentElement.classList.toggle('dark', pref === 'dark' || (pref !== 'light' && media.matches));
        apply();
        media.addEventListener('change', apply);
        return () => media.removeEventListener('change', apply);
    }, []);
};

const Row: React.FC<{ item: DayItem }> = ({ item }) => {
    const Icon = ICON[item.kind];
    const status = item.leg ? journeyStatus(item.leg) : null;
    return (
        <li className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 border-t border-rp-line py-3 first:border-t-0">
            <span className="flex size-9 items-center justify-center rounded-full bg-rp-inset text-rp-ink"><Icon size={18} aria-hidden /></span>
            <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-rp-ink">{item.title}</span>
                {item.detail ? <span className="block truncate text-xs text-rp-muted">{item.detail}</span> : null}
            </span>
            <span className="flex flex-col items-end gap-1">
                {item.time ? <span className="rp-tabular text-sm font-medium text-rp-ink">{item.time}</span> : null}
                {status ? <StatusPill status={status} mode="Flight" /> : null}
            </span>
        </li>
    );
};

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="rp-root rp-canvas-glow fixed inset-0 overflow-y-auto bg-rp-canvas font-rp text-rp-ink antialiased">
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-4 px-4 py-6 sm:py-10">{children}</div>
    </div>
);

export const SharedTripPage: React.FC<{ token: string }> = ({ token }) => {
    useTheme();
    const [result, setResult] = useState<SharedResult | null>(null);
    const todayRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        void loadShared(token, controller.signal).then(r => { if (!controller.signal.aborted) setResult(r); });
        return () => controller.abort();
    }, [token]);

    const snapshot = result?.kind === 'ok' ? result.snapshot : null;
    const days = useMemo(() => (snapshot ? buildDays(snapshot) : []), [snapshot]);
    const trip = useMemo(() => (snapshot ? asTrip(snapshot) : null), [snapshot]);
    const today = todayISO();
    const focus = focusDay(days, today);

    useEffect(() => { if (focus && days.length > 4) todayRef.current?.scrollIntoView({ block: 'center' }); }, [focus, days.length]);

    useEffect(() => {
        document.title = snapshot ? `${snapshot.trip.name} · WanderGrid` : 'Shared trip · WanderGrid';
        // The page is for people who were given the link; keep it out of search results.
        const meta = document.createElement('meta');
        meta.name = 'robots';
        meta.content = 'noindex, nofollow';
        document.head.appendChild(meta);
        return () => { meta.remove(); };
    }, [snapshot]);

    if (!result) return <Shell><p role="status" className="py-24 text-center text-sm text-rp-muted">Loading the trip…</p></Shell>;

    if (!snapshot || !trip) {
        return (
            <Shell>
                <div className="rounded-rp-card bg-rp-surface rp-shadow-rest">
                    <RpEmpty title={result.kind === 'gone' ? 'This link is not active' : "The trip couldn't load"}>
                        {result.kind === 'gone' ? 'It may have been turned off. Ask whoever sent it for a new link.' : 'Check your connection and reload the page.'}
                    </RpEmpty>
                </div>
            </Shell>
        );
    }

    const { trip: meta, travellers } = snapshot;
    const range = meta.startDate && meta.endDate ? formatDateRange(meta.startDate, meta.endDate) : '';
    return (
        <Shell>
            <header className="flex items-center justify-between gap-3 text-xs text-rp-muted">
                <span className="font-semibold uppercase tracking-[0.14em]">WanderGrid</span>
                <span className="inline-flex h-6 items-center rounded-full bg-rp-inset px-2.5 font-medium text-rp-ink">Shared · read only</span>
            </header>

            <section className="overflow-hidden rounded-rp-card bg-rp-surface rp-shadow-rest" aria-label="Trip">
                <div className="flex flex-col gap-1.5 p-5 sm:p-6">
                    <h1 className="text-3xl font-medium leading-tight sm:text-4xl">{meta.name}</h1>
                    {meta.subtitle ? <p className="text-sm text-rp-muted">{meta.subtitle}</p> : null}
                    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-rp-muted">
                        {meta.location ? <span className="inline-flex items-center gap-1.5"><MapPin size={16} aria-hidden />{meta.location}</span> : null}
                        {range ? <span className="inline-flex items-center gap-1.5"><CalendarBlank size={16} aria-hidden />{range}</span> : null}
                    </p>
                    {travellers.length ? <p className="text-sm text-rp-ink">Travelling: {namesText(travellers)}</p> : null}
                </div>
                <TripHeroMap trip={trip} emptyMessage="The route will show here once the places are known." className="h-56 border-t border-rp-line sm:h-72" />
            </section>

            <section aria-label="Itinerary" className="flex flex-col gap-3">
                {days.length === 0 ? (
                    <div className="rounded-rp-card bg-rp-surface rp-shadow-rest"><RpEmpty title="Nothing planned yet">Flights, stays and plans appear here as they are added.</RpEmpty></div>
                ) : days.map(day => (
                    <article key={day.date} ref={day.date === focus ? todayRef : undefined} className={cn('rounded-rp-card bg-rp-surface p-4 rp-shadow-rest sm:p-5', day.date === focus && days.length > 1 && 'ring-1 ring-rp-line')} aria-label={formatDate(day.date, 'weekday-long')}>
                        <h2 className="flex items-center justify-between gap-3 text-sm font-semibold text-rp-ink">
                            <span>{formatDate(day.date, 'weekday-long')}</span>
                            {day.date === today ? <span className="inline-flex h-6 items-center gap-1 rounded-full bg-rp-ink px-2.5 text-xs font-medium text-rp-on-ink"><Clock size={12} aria-hidden />Today</span> : null}
                        </h2>
                        <ul>{day.items.map(item => <Row key={item.id} item={item} />)}</ul>
                    </article>
                ))}
            </section>

            <footer className="pb-4 text-center text-xs text-rp-muted">Flight status follows the schedule, so it may differ from the airline's live board.</footer>
        </Shell>
    );
};
