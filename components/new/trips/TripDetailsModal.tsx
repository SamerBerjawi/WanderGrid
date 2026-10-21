import React, { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Drawer } from 'vaul';
import type { Trip, User } from '../../../types';
import { bucketOf, destinationsOf, isTravelling, timingOf, todayISO, tripDays, type TripBucket } from '../../../utils/tripsModel';
import { formatCurrency, formatDate, formatDateRange } from '../../../utils/formatters';
import {
    Airplane, ArrowRight, ArrowUpRight, Bed, Boat, Bus, CalendarBlank, Car, CarProfile, FileText, MapPin, PencilSimple, Train, X, type Icon,
} from '../../ui/hugeicons';
import { RpLogo, useIsMobile } from '../ui';
import { stayIcon } from './stayIcon';
import { STAY_ACCENT, TRANSPORT_ACCENT } from './accents';
import { cn } from '../../../utils/cn';

/**
 * A trip's details (UI_UX_DESIGN_REFERENCE.md §5.2 row 5, the "deal modal"): a card in the trip's
 * status colour, a stepper, a few key facts, the people and a note, then the first three cities,
 * transport legs, stays and activities with "+N more". The primary action moves the trip to its next
 * status in place, and the colour follows. A centred modal from tablets up; a bottom sheet on phones.
 */

export interface TripOrigin { x: number; y: number; width: number }

export type Look = 'ink' | TripBucket;
export interface Skin {
    card: string; muted: string; panel: string; line: string; bar: string; track: string; outline: string; primary: string; ring: string;
}
export const SKINS: Record<Look, Skin> = {
    ink: {
        card: 'bg-rp-ink text-rp-on-ink', muted: 'text-rp-on-ink/70', panel: 'bg-rp-on-ink/10', line: 'border-rp-on-ink/15', bar: 'bg-rp-mustard', track: 'bg-rp-on-ink/20',
        outline: 'border-rp-on-ink/40 text-rp-on-ink hover:bg-rp-on-ink/10', primary: 'bg-rp-mustard text-rp-on-mustard hover:bg-rp-mustard/90', ring: 'border-rp-on-ink/30 hover:bg-rp-on-ink/10',
    },
    planned: {
        card: 'bg-rp-mustard text-rp-on-mustard', muted: 'text-rp-on-mustard/70', panel: 'bg-rp-on-mustard/10', line: 'border-rp-on-mustard/15', bar: 'bg-rp-on-mustard', track: 'bg-rp-on-mustard/15',
        outline: 'border-rp-on-mustard/50 text-rp-on-mustard hover:bg-rp-on-mustard/10', primary: 'bg-rp-ink text-rp-on-ink hover:bg-rp-ink/90', ring: 'border-rp-on-mustard/30 hover:bg-rp-on-mustard/10',
    },
    confirmed: {
        card: 'bg-rp-green text-rp-paper', muted: 'text-rp-paper/80', panel: 'bg-rp-paper/15', line: 'border-rp-paper/20', bar: 'bg-rp-paper', track: 'bg-rp-paper/25',
        outline: 'border-rp-paper/50 text-rp-paper hover:bg-rp-paper/15', primary: 'bg-rp-ink text-rp-on-ink hover:bg-rp-ink/90', ring: 'border-rp-paper/30 hover:bg-rp-paper/15',
    },
    past: {
        card: 'bg-rp-surface text-rp-ink', muted: 'text-rp-muted', panel: 'bg-rp-inset', line: 'border-rp-line', bar: 'bg-rp-ink', track: 'bg-rp-line',
        outline: 'border-rp-line text-rp-ink hover:bg-rp-inset', primary: 'bg-rp-ink text-rp-on-ink hover:bg-rp-ink/90', ring: 'border-rp-line hover:bg-rp-inset',
    },
};

export const STEPS = ['Planned', 'Confirmed', 'Travelling', 'Done'] as const;
export const MODE_ICON: Record<string, Icon> = { Flight: Airplane, Train, Bus, 'Car Rental': Car, 'Personal Car': CarProfile, Cruise: Boat, Ferry: Boat };
const SHOW = 3;

export const when = (date?: string, time?: string) => (date ? [formatDate(date, 'short'), time].filter(Boolean).join(' ') : '');
export const money = (n?: number) => (n != null && n > 0 ? formatCurrency(n) : undefined);
export const initials = (name?: string) => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]!.toUpperCase()).join('');
export const nights = (a?: string, b?: string) => {
    if (!a || !b) return undefined;
    const n = Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
    return n > 0 ? `${n} ${n === 1 ? 'night' : 'nights'}` : undefined;
};

/** The next status the primary button offers, or null when the trip is already done. */
export const nextMove = (bucket: TripBucket): { to: TripBucket; label: string } | null =>
    bucket === 'planned' ? { to: 'confirmed', label: 'Move to Confirmed' } : bucket === 'confirmed' ? { to: 'past', label: 'Mark as done' } : null;

/* ------------------------------------------------------------------ */
/* Content */
/* ------------------------------------------------------------------ */

const Section: React.FC<{ title: string; icon: Icon; count: number; skin: Skin; children: React.ReactNode; more: number; onMore: () => void }> = ({
    title, icon: IconC, count, skin, children, more, onMore,
}) => (
    <section className="flex flex-col gap-2">
        <h3 className={cn('flex items-center gap-1.5 px-0.5 text-xs font-medium', skin.muted)}>
            <IconC size={14} aria-hidden /> {title}
            <span className="rp-tabular opacity-80">{count}</span>
        </h3>
        <ul className={cn('flex flex-col rounded-rp-tile px-3', skin.panel)}>{children}</ul>
        {more > 0 ? (
            <button type="button" onClick={onMore} className={cn('self-start rounded-full px-1 text-xs font-medium underline-offset-4 hover:underline min-h-11', skin.muted)}>
                +{more} more
            </button>
        ) : null}
    </section>
);

const Row: React.FC<{ logo: React.ReactNode; title: string; meta: string; cost?: string; skin: Skin }> = ({ logo, title, meta, cost, skin }) => (
    <li className={cn('grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 border-t py-2.5 first:border-t-0', skin.line)}>
        {logo}
        <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{title}</span>
            {meta ? <span className={cn('block truncate text-xs', skin.muted)}>{meta}</span> : null}
        </span>
        <span className="rp-tabular text-right text-sm font-medium">{cost ?? ''}</span>
    </li>
);

const Body: React.FC<{
    trip: Trip;
    users: User[];
    brandfetchApiKey?: string;
    onClose: () => void;
    onEdit: (trip: Trip) => void;
    onOpenTrip: (trip: Trip) => void;
    onMove: (trip: Trip, bucket: TripBucket) => void;
    titleId: string;
}> = ({ trip, users, brandfetchApiKey, onClose, onEdit, onOpenTrip, onMove, titleId }) => {
    const today = todayISO();
    const bucket = bucketOf(trip, today);
    const now = isTravelling(trip, today);
    const skin = SKINS[now ? 'ink' : bucket];
    const step = bucket === 'planned' ? 0 : bucket === 'confirmed' ? (now ? 2 : 1) : 3;
    const move = nextMove(bucket);

    const data = useMemo(() => {
        const transports = [...(trip.transports || [])].sort((a, b) => `${a.departureDate}${a.departureTime}`.localeCompare(`${b.departureDate}${b.departureTime}`));
        const stays = [...(trip.accommodations || [])].sort((a, b) => (a.checkInDate || '').localeCompare(b.checkInDate || ''));
        const activities = [...(trip.activities || [])].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
        const total = [...transports, ...stays, ...activities].reduce((sum, i) => sum + (i.cost || 0), 0);
        const members = (trip.participants || []).map(id => users.find(u => u.id === id)).filter((u): u is User => Boolean(u));
        return { transports, stays, activities, total, members, cities: destinationsOf(trip) };
    }, [trip, users]);

    const days = tripDays(trip);
    const timing = timingOf(trip, today);
    const hero = data.total > 0
        ? { text: formatCurrency(data.total), unit: 'Total cost' }
        : timing.value !== null && timing.state !== 'past' ? { text: String(timing.value), unit: timing.unit } : null;

    const circleBtn = cn('inline-flex size-11 items-center justify-center rounded-full border outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-current', skin.ring);
    const pill = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2 active:scale-[0.98]';

    return (
        <div className="flex flex-col gap-5">
            <div className="flex items-start justify-between gap-3">
                <p className={cn('rp-tabular pt-3 text-sm', skin.muted)}>
                    {trip.startDate ? formatDateRange(trip.startDate, trip.endDate || trip.startDate) : 'No dates yet'}
                </p>
                <div className="flex shrink-0 gap-2">
                    <button type="button" aria-label={`Edit ${trip.name}`} onClick={() => onEdit(trip)} className={circleBtn}><PencilSimple size={18} aria-hidden /></button>
                    <button type="button" aria-label="Close" onClick={onClose} className={circleBtn}><X size={18} aria-hidden /></button>
                </div>
            </div>

            <div>
                <h2 id={titleId} className="text-[2rem] leading-[1.1] font-medium tracking-tight">{trip.name}</h2>
                {data.cities.length > 0 ? <p className={cn('mt-1 text-base', skin.muted)}>{data.cities.slice(0, SHOW).join(' · ')}{data.cities.length > SHOW ? ` · +${data.cities.length - SHOW}` : ''}</p> : null}
            </div>

            {hero ? (
                <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="rp-tabular text-[3rem] leading-none font-semibold tracking-tight">{hero.text}</span>
                    <span className={cn('text-sm', skin.muted)}>{hero.unit}</span>
                </p>
            ) : null}

            <div>
                <ol className="grid grid-cols-4 gap-1.5" aria-label="Status">
                    {STEPS.map((label, i) => (
                        <li key={label} aria-current={i === step ? 'step' : undefined} className="flex flex-col gap-2">
                            <span className={cn('h-1.5 rounded-full', i <= step ? skin.bar : skin.track)} />
                            <span className={cn('truncate text-xs', i === step ? 'font-semibold' : skin.muted)}>{label}</span>
                        </li>
                    ))}
                </ol>
            </div>

            <dl className={cn('grid grid-cols-3 gap-3 rounded-rp-tile p-4', skin.panel)}>
                {[
                    ['Starts', trip.startDate ? formatDate(trip.startDate, 'short') : '–'],
                    ['Ends', trip.endDate ? formatDate(trip.endDate, 'short') : '–'],
                    ['Length', days > 0 ? `${days} ${days === 1 ? 'day' : 'days'}` : '–'],
                ].map(([label, value]) => (
                    <div key={label} className="min-w-0">
                        <dt className={cn('text-xs', skin.muted)}>{label}</dt>
                        <dd className="rp-tabular truncate text-sm font-semibold">{value}</dd>
                    </div>
                ))}
            </dl>

            {data.members.length > 0 ? (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    {data.members.slice(0, 3).map(u => (
                        <span key={u.id} className="flex items-center gap-2 text-sm">
                            <span className={cn('flex size-9 items-center justify-center rounded-full text-xs font-semibold', skin.panel)}>{initials(u.name)}</span>
                            {u.name.split(' ')[0]}
                        </span>
                    ))}
                    {data.members.length > 3 ? <span className={cn('text-sm', skin.muted)}>+{data.members.length - 3}</span> : null}
                </div>
            ) : null}

            {trip.notes || trip.description ? (
                <p className="flex items-start gap-2.5 text-sm">
                    <FileText size={18} className="mt-0.5 shrink-0" aria-hidden />
                    <span className="line-clamp-2">{trip.notes || trip.description}</span>
                </p>
            ) : null}

            {data.cities.length > 1 ? (
                <section className="flex flex-col gap-2">
                    <h3 className={cn('flex items-center gap-1.5 px-0.5 text-xs font-medium', skin.muted)}><MapPin size={14} aria-hidden /> Cities <span className="rp-tabular opacity-80">{data.cities.length}</span></h3>
                    <ul className="flex flex-wrap gap-2">
                        {data.cities.slice(0, SHOW).map(c => <li key={c} className={cn('inline-flex min-h-8 items-center rounded-full px-3 text-xs font-medium', skin.panel)}>{c}</li>)}
                        {data.cities.length > SHOW ? (
                            <li><button type="button" onClick={() => onOpenTrip(trip)} className={cn('inline-flex min-h-8 items-center rounded-full px-3 text-xs font-medium', skin.panel)}>+{data.cities.length - SHOW}</button></li>
                        ) : null}
                    </ul>
                </section>
            ) : null}

            {data.transports.length > 0 ? (
                <Section title="Transport" icon={Airplane} count={data.transports.length} skin={skin} more={data.transports.length - SHOW} onMore={() => onOpenTrip(trip)}>
                    {data.transports.slice(0, SHOW).map(t => {
                        const Mode = MODE_ICON[t.mode] || Airplane;
                        return (
                            <Row
                                key={t.id}
                                skin={skin}
                                logo={<RpLogo name={t.provider} src={t.logoUrl} brandfetchApiKey={brandfetchApiKey} fallback={Mode} iconClassName={TRANSPORT_ACCENT} />}
                                title={`${t.origin} → ${t.destination}`}
                                meta={[t.provider, t.identifier, when(t.departureDate, t.departureTime)].filter(Boolean).join(' · ')}
                                cost={money(t.cost)}
                            />
                        );
                    })}
                </Section>
            ) : null}

            {data.stays.length > 0 ? (
                <Section title="Stays" icon={Bed} count={data.stays.length} skin={skin} more={data.stays.length - SHOW} onMore={() => onOpenTrip(trip)}>
                    {data.stays.slice(0, SHOW).map(a => (
                        <Row
                            key={a.id}
                            skin={skin}
                            logo={<RpLogo name={a.name} src={a.logoUrl} brandfetchApiKey={brandfetchApiKey} fallback={stayIcon(a.type)} iconClassName={STAY_ACCENT} />}
                            title={a.name}
                            meta={[a.checkInDate && a.checkOutDate ? `${formatDate(a.checkInDate, 'short')} – ${formatDate(a.checkOutDate, 'short')}` : '', nights(a.checkInDate, a.checkOutDate)].filter(Boolean).join(' · ')}
                            cost={money(a.cost)}
                        />
                    ))}
                </Section>
            ) : null}

            {data.activities.length > 0 ? (
                <Section title="Activities" icon={CalendarBlank} count={data.activities.length} skin={skin} more={data.activities.length - SHOW} onMore={() => onOpenTrip(trip)}>
                    {data.activities.slice(0, SHOW).map(a => (
                        <Row
                            key={a.id}
                            skin={skin}
                            logo={<span className="flex size-9 items-center justify-center rounded-[10px] bg-white text-rp-muted"><CalendarBlank size={16} aria-hidden /></span>}
                            title={a.title}
                            meta={[when(a.date, a.time), a.location].filter(Boolean).join(' · ')}
                            cost={money(a.cost)}
                        />
                    ))}
                </Section>
            ) : null}

            <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
                <button type="button" onClick={() => onOpenTrip(trip)} className={cn(pill, 'border', skin.outline)}>
                    Open trip <ArrowUpRight size={16} aria-hidden />
                </button>
                {move ? (
                    <button type="button" onClick={() => onMove(trip, move.to)} className={cn(pill, skin.primary)}>
                        {move.label} <ArrowRight size={16} aria-hidden />
                    </button>
                ) : (
                    <button type="button" onClick={() => onEdit(trip)} className={cn(pill, skin.primary)}>
                        Edit trip <PencilSimple size={16} aria-hidden />
                    </button>
                )}
            </div>
        </div>
    );
};

/* ------------------------------------------------------------------ */
/* Frame */
/* ------------------------------------------------------------------ */

export const TripDetailsModal: React.FC<{
    trip: Trip | null;
    origin: TripOrigin | null;
    users: User[];
    brandfetchApiKey?: string;
    onClose: () => void;
    onEdit: (trip: Trip) => void;
    onOpenTrip: (trip: Trip) => void;
    onMove: (trip: Trip, bucket: TripBucket) => void;
}> = ({ trip, origin, users, brandfetchApiKey, onClose, onEdit, onOpenTrip, onMove }) => {
    const mobile = useIsMobile();
    const reduce = useReducedMotion();
    const panelRef = useRef<HTMLDivElement>(null);
    const returnFocus = useRef<HTMLElement | null>(null);
    const titleId = 'trip-details-title';
    const open = Boolean(trip);

    useEffect(() => {
        if (!open || mobile) return;
        returnFocus.current = document.activeElement as HTMLElement | null;
        const id = requestAnimationFrame(() => panelRef.current?.focus());
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) onClose(); };
        window.addEventListener('keydown', onKey);
        return () => {
            cancelAnimationFrame(id);
            window.removeEventListener('keydown', onKey);
            if (returnFocus.current?.isConnected) returnFocus.current.focus();
        };
    }, [open, mobile, onClose]);

    const bucket = trip ? bucketOf(trip, todayISO()) : 'planned';
    const skin = SKINS[trip && isTravelling(trip, todayISO()) ? 'ink' : bucket];

    if (mobile) {
        return (
            <Drawer.Root open={open} onOpenChange={o => { if (!o) onClose(); }}>
                <Drawer.Portal>
                    <Drawer.Overlay className="fixed inset-0 z-modal-backdrop bg-rp-canvas/50 backdrop-blur-md" />
                    <Drawer.Content
                        className={cn('rp-root fixed inset-x-0 bottom-0 z-modal flex max-h-[94dvh] flex-col rounded-t-rp-card font-rp rp-shadow-float outline-none', skin.card)}
                        aria-describedby={undefined}
                    >
                        <Drawer.Title className="sr-only">{trip?.name ?? 'Trip'}</Drawer.Title>
                        <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-current opacity-25" aria-hidden />
                        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]" data-vaul-no-drag>
                            {trip ? <Body trip={trip} users={users} brandfetchApiKey={brandfetchApiKey} onClose={onClose} onEdit={onEdit} onOpenTrip={onOpenTrip} onMove={onMove} titleId={titleId} /> : null}
                        </div>
                    </Drawer.Content>
                </Drawer.Portal>
            </Drawer.Root>
        );
    }

    // Grow from the tile that was clicked: start at its position and size, settle in the centre.
    const from = (() => {
        if (reduce || !origin || typeof window === 'undefined') return { opacity: 0, scale: 0.96, x: 0, y: 12 };
        return {
            opacity: 0,
            scale: Math.min(0.9, Math.max(0.45, origin.width / 560)),
            x: origin.x - window.innerWidth / 2,
            y: origin.y - window.innerHeight / 2,
        };
    })();

    return createPortal(
        <AnimatePresence>
            {open && trip ? (
                <div key="trip-details" className="rp-root fixed inset-0 z-modal flex items-center justify-center p-4 font-rp">
                    <motion.div
                        className="absolute inset-0 bg-rp-canvas/50 backdrop-blur-md"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        onClick={onClose}
                        aria-hidden
                    />
                    <motion.div
                        ref={panelRef}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={titleId}
                        tabIndex={-1}
                        initial={from}
                        animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                        exit={from}
                        transition={{ type: 'spring', duration: 0.5, bounce: 0.05 }}
                        className={cn('custom-scrollbar relative max-h-[90dvh] w-full max-w-[560px] overflow-y-auto rounded-rp-card p-6 outline-none rp-shadow-float sm:p-8', skin.card)}
                    >
                        <Body trip={trip} users={users} brandfetchApiKey={brandfetchApiKey} onClose={onClose} onEdit={onEdit} onOpenTrip={onOpenTrip} onMove={onMove} titleId={titleId} />
                    </motion.div>
                </div>
            ) : null}
        </AnimatePresence>,
        document.body
    );
};
