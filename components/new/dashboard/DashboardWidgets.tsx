import React, { useMemo, useState, type ReactNode } from 'react';
import NumberFlow from '@number-flow/react';
import type { Trip, User, VisitedItem } from '../../../types';
import type { DashboardData } from '../../../hooks/useDashboardData';
import type { WidgetSize } from '../../kokonutui/bento-grid';
import { SpendingRing, type SpendingCategory } from '../../kokonutui/spending-ring';
import { MetricCard } from '../../kokonutui/metric-card';
import MomentumRail, { type RailItem } from '../../kokonutui/momentum-rail';
import ThrowDeck, { type DeckCard } from '../../kokonutui/throw-deck';
import { BarChart } from '../../bklit/bar-chart';
import { FlagArt, FlagBadge } from '../atlas/AtlasParts';
import { RpHugeicon } from '../RpHugeicon';
import { RpChip, RpEmpty, RpSheet, useIsMobile } from '../ui';
import { openNewPage } from '../devLinks';
import { Airplane, ArrowUpRight, Check, Clock, Suitcase } from '../../ui/hugeicons';
import { formatCurrency, formatDate, formatDateRange, getActiveCurrency } from '../../../utils/formatters';
import { destinationLabel, bucketOf, timingOf, tripCost } from '../../../utils/tripsModel';
import { rankOf, type LeaveUse } from '../../../utils/dashboardModel';
import { regionOf } from '../../../utils/atlasModel';
import { cn } from '../../../utils/cn';

/**
 * The widgets of the New Dashboard (UI_UX_DESIGN_REFERENCE.md §5.2 rows 2 and 14). Each one is a body for
 * the Widget Grid: it gets the size its column span maps to, shows what fits, and opens the page that
 * holds the rest. Colour is meaning only: green confirmed or distance, mustard planned, ink travelling.
 */

const PILL = 'inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-rp-muted focus-visible:ring-offset-2 active:scale-[0.97]';

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
const km = (n: number) => `${Math.round(n).toLocaleString('en-US')} km`;

/** The fade that closes a capped list, over the card's own surface. */
const FADE = 'pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-rp-surface to-transparent';

/* ---------------------------------- next ---------------------------------- */

export const nextTone = (data: DashboardData): 'ink' | 'green' | 'mustard' | 'surface' => {
    if (!data.next) return 'surface';
    if (data.next.travelling) return 'ink';
    return bucketOf(data.next.trip, data.today) === 'confirmed' ? 'green' : 'mustard';
};

/** Chip fills that read on each accent card (alpha of the card's own text colour). */
const CHIP: Record<'ink' | 'green' | 'mustard' | 'surface', { chip: string; hover: string }> = {
    ink: { chip: 'bg-rp-on-ink/15', hover: 'hover:bg-rp-on-ink/25' },
    green: { chip: 'bg-rp-paper/20', hover: 'hover:bg-rp-paper/30' },
    mustard: { chip: 'bg-rp-on-mustard/15', hover: 'hover:bg-rp-on-mustard/25' },
    surface: { chip: 'bg-rp-inset', hover: 'hover:bg-rp-line' },
};

/** The trip under way, or the next one: its countdown, where, when, and the flight today. */
export const NextWidget: React.FC<{ data: DashboardData; size: WidgetSize; onTripClick: (id: string) => void }> = ({ data, size, onTripClick }) => {
    const c = CHIP[nextTone(data)];
    const next = data.next;
    if (!next) {
        return (
            <RpEmpty title="Nothing planned yet" action={<button type="button" className={cn(PILL, 'bg-rp-ink text-rp-on-ink focus-visible:ring-offset-rp-surface')} onClick={() => openNewPage('/trips-new?new=1')}>Plan a trip</button>}>
                Your next trip shows up here.
            </RpEmpty>
        );
    }
    const { trip, travelling, days } = next;
    const dim = travelling ? 'opacity-80' : 'opacity-85';
    const flight = data.flightNow;
    return (
        <div className="flex h-full flex-col justify-between gap-3">
            <div className="min-w-0">
                <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', c.chip)}>
                    {travelling ? <Airplane size={12} aria-hidden /> : <Clock size={12} aria-hidden />}
                    {travelling ? 'Travelling now' : 'Next trip'}
                </span>
                <p className="mt-2 line-clamp-2 text-2xl leading-tight font-medium tracking-tight">{trip.name}</p>
                {size !== 's' ? <p className={cn('mt-1 truncate text-sm', dim)}>{destinationLabel(trip)}</p> : null}
            </div>
            <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                    <p className="flex items-baseline gap-2">
                        <NumberFlow value={days} className="rp-tabular text-5xl leading-none font-semibold" />
                        <span className={cn('text-sm', dim)}>{travelling ? (days === 1 ? 'day left' : 'days left') : days === 1 ? 'day to go' : 'days to go'}</span>
                    </p>
                    {size !== 's' ? <p className={cn('mt-1 truncate text-xs', dim)}>{formatDateRange(trip.startDate, trip.endDate)}</p> : null}
                </div>
                {size !== 's' ? (
                    <button type="button" onClick={() => onTripClick(trip.id)} className={cn(PILL, c.chip, c.hover, 'focus-visible:ring-offset-0')}>
                        Open trip <ArrowUpRight size={16} aria-hidden />
                    </button>
                ) : null}
            </div>
            {flight && size !== 's' ? (
                <button type="button" onClick={() => openNewPage('/flights')} className={cn('flex min-h-11 items-center gap-2 rounded-full px-4 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-rp-muted', c.chip, c.hover)}>
                    <Airplane size={16} aria-hidden className="shrink-0" />
                    <span className="truncate"><span className="font-semibold">{flight.code}</span> {flight.origin} → {flight.destination}{flight.time ? ` · ${flight.time}` : ''}</span>
                </button>
            ) : null}
        </div>
    );
};

/* -------------------------------- upcoming -------------------------------- */

const BUCKET_ART: Record<'planned' | 'confirmed' | 'now', { box: string; label: string }> = {
    planned: { box: 'bg-rp-mustard text-rp-on-mustard', label: 'Planned' },
    confirmed: { box: 'bg-rp-green text-rp-paper', label: 'Confirmed' },
    now: { box: 'bg-rp-ink text-rp-on-ink', label: 'Travelling now' },
};

const skinOf = (trip: Trip, today: string) => {
    const t = timingOf(trip, today);
    if (t.state === 'now') return BUCKET_ART.now;
    return bucketOf(trip, today) === 'confirmed' ? BUCKET_ART.confirmed : BUCKET_ART.planned;
};

/** A rail card's artwork: the trip's icon and its countdown on the status colour. */
const TripArt: React.FC<{ trip: Trip; today: string }> = ({ trip, today }) => {
    const t = timingOf(trip, today);
    return (
        <span className={cn('flex h-full w-full flex-col items-center justify-center gap-3', skinOf(trip, today).box)}>
            <RpHugeicon name={trip.hugeicon} size={44} fallback={<Suitcase size={44} aria-hidden />} />
            {t.value !== null ? (
                <span className="text-center leading-tight">
                    <span className="rp-tabular block text-3xl font-semibold">{t.value}</span>
                    <span className="block text-xs opacity-80">{t.unit}</span>
                </span>
            ) : null}
        </span>
    );
};

/** A trip tile in its status colour: icon, status, name, where and when, and the countdown. */
const TripTile: React.FC<{ trip: Trip; today: string; onClick: () => void }> = ({ trip, today, onClick }) => {
    const skin = skinOf(trip, today);
    const t = timingOf(trip, today);
    return (
        <li className="min-w-0">
            <button type="button" onClick={onClick} className={cn('flex h-full min-h-52 w-full flex-col justify-between gap-3 rounded-rp-tile p-4 text-left outline-none rp-shadow-raised transition-transform duration-150 focus-visible:ring-2 focus-visible:ring-rp-muted focus-visible:ring-offset-2 focus-visible:ring-offset-rp-surface active:scale-[0.98]', skin.box)}>
                <span className="flex items-center justify-between gap-2">
                    <RpHugeicon name={trip.hugeicon} size={20} fallback={<Suitcase size={20} aria-hidden />} />
                    <span className="text-xs font-semibold opacity-80">{skin.label}</span>
                </span>
                <span className="min-w-0">
                    <span className="block truncate text-base leading-tight font-medium">{trip.name}</span>
                    <span className="mt-0.5 block truncate text-xs opacity-80">{destinationLabel(trip) || 'No destination yet'}</span>
                    <span className="block truncate text-xs opacity-80">{formatDateRange(trip.startDate, trip.endDate)}</span>
                </span>
                {t.value !== null ? (
                    <span className="flex items-baseline gap-1.5">
                        <span className="rp-tabular text-3xl leading-none font-semibold">{t.value}</span>
                        <span className="text-xs opacity-80">{t.unit}</span>
                    </span>
                ) : null}
            </button>
        </li>
    );
};

/**
 * Upcoming trips in their status colours. Phones get a Momentum Rail (a card and a peek, swiped);
 * wider screens get tiles, six across on a full-width widget, with a fade and Show all beyond that.
 */
export const UpcomingWidget: React.FC<{ data: DashboardData; size: WidgetSize; onTripClick: (id: string) => void }> = ({ data, size, onTripClick }) => {
    const mobile = useIsMobile();
    const trips = data.upcoming;
    const items = useMemo<RailItem[]>(() => trips.map(t => ({
        id: t.id,
        title: t.name,
        location: destinationLabel(t) || 'No destination yet',
        meta: t.startDate ? formatDateRange(t.startDate, t.endDate) : undefined,
        badge: skinOf(t, data.today).label,
        art: <TripArt trip={t} today={data.today} />,
    })), [trips, data.today]);

    if (!trips.length) {
        return (
            <RpEmpty title="No trips coming up" action={<button type="button" className={cn(PILL, 'bg-rp-ink text-rp-on-ink focus-visible:ring-offset-rp-surface')} onClick={() => openNewPage('/trips-new?new=1')}>Plan a trip</button>}>
                Planned and confirmed trips line up here.
            </RpEmpty>
        );
    }
    if (mobile && trips.length >= 3) {
        return (
            <div className="-mx-5 -mt-2 h-full">
                <MomentumRail
                    title=""
                    eyebrow={`${plural(trips.length, 'trip')} · ${trips.filter(t => bucketOf(t, data.today) === 'confirmed').length} confirmed`}
                    items={items}
                    onSelect={item => onTripClick(item.id)}
                />
            </div>
        );
    }
    if (size === 's') {
        return (
            <ul className="flex flex-col gap-2">
                {trips.slice(0, 3).map(t => <TripRow key={t.id} trip={t} today={data.today} onClick={() => onTripClick(t.id)} />)}
            </ul>
        );
    }
    const cap = size === 'l' ? 6 : 3;
    const shown = trips.slice(0, cap);
    return (
        <div className="relative h-full">
            <ul className={cn('grid gap-3', size === 'l' ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6' : 'grid-cols-1 sm:grid-cols-3')}>
                {shown.map(t => <TripTile key={t.id} trip={t} today={data.today} onClick={() => onTripClick(t.id)} />)}
            </ul>
            {trips.length > shown.length ? (
                <>
                    <div className={FADE} />
                    <div className="absolute inset-x-0 bottom-0 flex justify-center">
                        <button type="button" onClick={() => openNewPage('/trips-new')} className={cn(PILL, 'bg-rp-inset text-rp-ink hover:bg-rp-line focus-visible:ring-offset-rp-surface')}>Show all {trips.length}</button>
                    </div>
                </>
            ) : null}
        </div>
    );
};

/* --------------------------------- rows ----------------------------------- */

const TripRow: React.FC<{ trip: Trip; today: string; onClick: () => void }> = ({ trip, today, onClick }) => {
    const skin = skinOf(trip, today);
    const past = bucketOf(trip, today) === 'past';
    return (
        <li>
            <button type="button" onClick={onClick} className="flex min-h-14 w-full items-center gap-3 rounded-rp-inset bg-rp-inset/60 px-3 py-2 text-left outline-none transition-colors hover:bg-rp-inset focus-visible:ring-2 focus-visible:ring-rp-muted">
                <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', past ? 'bg-rp-inset text-rp-ink' : skin.box)}>
                    <RpHugeicon name={trip.hugeicon} size={18} fallback={<Suitcase size={18} aria-hidden />} />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-rp-ink">{trip.name}</span>
                    <span className="block truncate text-xs text-rp-muted">{[destinationLabel(trip), formatDateRange(trip.startDate, trip.endDate)].filter(Boolean).join(' · ')}</span>
                </span>
                {tripCost(trip) > 0 ? <span className="rp-tabular hidden shrink-0 text-xs text-rp-muted sm:block">{formatCurrency(tripCost(trip), undefined, { maximumFractionDigits: 0 })}</span> : null}
            </button>
        </li>
    );
};

/** Recent trips: a capped list with a fade and Show all, which opens the Trips page. */
export const RecentWidget: React.FC<{ data: DashboardData; size: WidgetSize; onTripClick: (id: string) => void }> = ({ data, size, onTripClick }) => {
    const all = data.recent;
    if (!all.length) {
        return <RpEmpty title="No past trips yet">Trips you have taken land here.</RpEmpty>;
    }
    const shown = all.slice(0, size === 's' ? 3 : 6);
    return (
        <div className="relative h-full">
            <ul className={cn('grid gap-2', size === 'l' && 'sm:grid-cols-2')}>
                {shown.map(t => <TripRow key={t.id} trip={t} today={data.today} onClick={() => onTripClick(t.id)} />)}
            </ul>
            <div className={FADE} />
            <div className="absolute inset-x-0 bottom-0 flex justify-center">
                <button type="button" onClick={() => openNewPage('/trips-new')} className={cn(PILL, 'bg-rp-inset text-rp-ink hover:bg-rp-line focus-visible:ring-offset-rp-surface')}>
                    Show all {all.length}
                </button>
            </div>
        </div>
    );
};

/* --------------------------------- metrics -------------------------------- */

type MetricId = 'distance' | 'nights' | 'spend';

const PERIODS = [{ days: 90, label: '3M' }, { days: 180, label: '6M' }, { days: 365, label: '12M' }];

/** Distance, nights or spend over time with trips pinned as events: the Metric Card. */
export const MetricWidget: React.FC<{ data: DashboardData; size: WidgetSize }> = ({ data, size }) => {
    const [metric, setMetric] = useState<MetricId>('distance');
    const series = data.series[metric];
    const empty = useMemo(() => !series.data.some(d => d.parts.some(p => p > 0)), [series]);
    const currency = getActiveCurrency();

    const config = {
        distance: { label: 'Distance', accent: 'green' as const, suffix: ' km', format: { maximumFractionDigits: 0 }, text: km },
        nights: { label: 'Nights away', accent: 'ink' as const, suffix: ' nights', format: { maximumFractionDigits: 0 }, text: (n: number) => plural(Math.round(n), 'night') },
        spend: {
            label: 'Spend', accent: 'mustard' as const, suffix: undefined,
            format: { style: 'currency' as const, currency, maximumFractionDigits: 0 },
            text: (n: number) => formatCurrency(n, currency, { maximumFractionDigits: 0 }),
        },
    }[metric];

    const chips = (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none]" role="group" aria-label="Metric">
            {(['distance', 'nights', 'spend'] as MetricId[]).map(id => (
                <RpChip key={id} selected={metric === id} onClick={() => setMetric(id)} className="px-3.5">
                    {id === 'distance' ? 'Distance' : id === 'nights' ? 'Nights' : 'Spend'}
                </RpChip>
            ))}
        </div>
    );

    if (empty) {
        return (
            <div className="flex h-full flex-col gap-2">
                {chips}
                <RpEmpty title="Nothing in the last two years">
                    {metric === 'spend' ? 'Costs you add to trips are counted here.' : 'Trips you take are counted here.'}
                </RpEmpty>
            </div>
        );
    }
    return (
        <MetricCard
            key={metric}
            className="h-full"
            label={config.label}
            headerStart={chips}
            segments={series.segments}
            data={series.data}
            events={data.events}
            periods={PERIODS}
            defaultPeriod={365}
            valueFormat={config.format}
            suffix={config.suffix}
            formatValue={config.text}
            smoothing={p => Math.max(1, Math.round(p / 18))}
            accent={config.accent}
            breakdownColumns={size === 'l' || size === 'm' ? 2 : 1}
        />
    );
};

type YearMetric = 'trips' | 'km' | 'nights';

/** Trips, distance and nights for each year: a Bklit bar chart. */
export const YearsWidget: React.FC<{ data: DashboardData }> = ({ data }) => {
    const [metric, setMetric] = useState<YearMetric>('trips');
    // At least five years on the axis, so one or two years of travel don't fill the chart with two huge bars.
    const last = Number(data.today.slice(0, 4));
    const known = new Map(data.years.map(r => [r.year, r]));
    const count = Math.min(8, Math.max(5, data.years.length));
    const rows = Array.from({ length: count }, (_, i) => {
        const year = String(last - (count - 1 - i));
        return known.get(year) ?? { year, trips: 0, km: 0, nights: 0 };
    });
    if (!data.years.length) return <RpEmpty title="No years to compare yet">Your trips by year show up here.</RpEmpty>;
    const color = metric === 'trips' ? 'rust' : metric === 'km' ? 'green' : 'ink';
    const label = metric === 'trips' ? 'Trips per year' : metric === 'km' ? 'Kilometres per year' : 'Nights away per year';
    return (
        <div className="flex h-full flex-col gap-2">
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 [scrollbar-width:none]" role="group" aria-label="Metric">
                <RpChip selected={metric === 'trips'} onClick={() => setMetric('trips')}>Trips</RpChip>
                <RpChip selected={metric === 'km'} onClick={() => setMetric('km')}>Distance</RpChip>
                <RpChip selected={metric === 'nights'} onClick={() => setMetric('nights')}>Nights</RpChip>
            </div>
            <BarChart
                className="min-h-0 flex-1"
                data={rows.map(r => ({ label: r.year, value: r[metric] }))}
                color={color}
                format={v => (v >= 10_000 ? `${Math.round(v / 1000)}k` : v.toLocaleString('en-US'))}
                label={label}
            />
        </div>
    );
};

/* ---------------------------------- leave --------------------------------- */

const initialsOf = (name?: string) => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]!.toUpperCase()).join('');
const days = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} d`;

/** Leave by type for one member this year, with what is left: the Spending Ring. */
export const LeaveWidget: React.FC<{
    users: User[];
    memberId: string;
    onMember: (id: string) => void;
    use: LeaveUse[];
    allowance: number;
    year: number;
}> = ({ users, memberId, onMember, use, allowance, year }) => {
    const booked = use.reduce((n, u) => n + u.days, 0);
    const left = Math.max(0, allowance - booked);
    const categories = useMemo<SpendingCategory[]>(() => [
        ...use.map(u => ({ name: u.name, amount: u.days, accent: u.accent })),
        ...(left > 0 ? [{ name: 'Left', amount: left, accent: 'ink' as const }] : []),
    ], [use, left]);

    return (
        <div className="flex h-full flex-col gap-2">
            {users.length > 1 ? (
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 [scrollbar-width:none]" role="group" aria-label="Member">
                    {users.map(u => (
                        <button
                            key={u.id}
                            type="button"
                            aria-pressed={u.id === memberId}
                            aria-label={u.name}
                            title={u.name}
                            onClick={() => onMember(u.id)}
                            className={cn(
                                'flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-rp-muted',
                                u.id === memberId ? 'bg-rp-ink text-rp-on-ink' : 'bg-rp-inset text-rp-ink hover:bg-rp-line'
                            )}
                        >
                            {initialsOf(u.name)}
                        </button>
                    ))}
                </div>
            ) : null}
            {categories.length === 0 ? (
                <RpEmpty title="No leave booked">Give a trip a leave type to see it here.</RpEmpty>
            ) : (
                <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none]">
                    <SpendingRing
                        categories={categories}
                        format={days}
                        caption={allowance > 0 ? (c, total) => (c.name === 'Left' ? `of ${allowance} days in ${year}` : `${days(booked)} booked of ${allowance}`) : undefined}
                    />
                </div>
            )}
        </div>
    );
};

/* -------------------------------- passport -------------------------------- */

/** The stamp collection: countries as passport stamps, the rank, and the landmark stickers. */
export const PassportWidget: React.FC<{ data: DashboardData; size: WidgetSize }> = ({ data, size }) => {
    const [open, setOpen] = useState(false);
    const countries = data.countries;
    const rank = rankOf(countries.length);
    const shown = countries.slice().sort((a, b) => (b.visitDate || '').localeCompare(a.visitDate || '')).slice(0, size === 's' ? 6 : 12);
    if (!countries.length) {
        return <RpEmpty title="No stamps yet">Countries you visit are stamped here.</RpEmpty>;
    }
    const stickerShare = data.stickers.total ? (data.stickers.unlocked / data.stickers.total) * 100 : 0;
    return (
        <div className="flex h-full flex-col gap-3">
            <div className="flex items-end justify-between gap-3">
                <p className="flex items-baseline gap-2">
                    <NumberFlow value={countries.length} className="rp-tabular text-5xl leading-none font-semibold text-rp-ink" />
                    <span className="text-sm text-rp-muted">{countries.length === 1 ? 'country' : 'countries'}</span>
                </p>
                <span className="inline-flex max-w-[55%] items-center truncate rounded-full bg-rp-mustard px-2.5 py-1 text-xs font-semibold text-rp-on-mustard">{rank.name}</span>
            </div>
            <div className="relative min-h-0 flex-1 overflow-hidden">
                <ul className="flex flex-wrap gap-2">
                    {shown.map(c => (
                        <li key={c.id} className="inline-flex h-9 max-w-full items-center gap-2 rounded-full bg-rp-inset py-1 pr-3 pl-1 text-xs font-medium text-rp-ink">
                            <FlagBadge code={c.code} />
                            <span className="truncate">{c.name}</span>
                        </li>
                    ))}
                </ul>
                {countries.length > shown.length ? <div className={FADE} /> : null}
            </div>
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <p className="flex justify-between text-xs text-rp-muted"><span>Landmark stickers</span><span className="rp-tabular">{data.stickers.unlocked} / {data.stickers.total}</span></p>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-rp-inset"><div className="h-full rounded-full bg-rp-green" style={{ width: `${stickerShare}%` }} /></div>
                </div>
                <button type="button" onClick={() => setOpen(true)} className={cn(PILL, 'bg-rp-inset text-rp-ink hover:bg-rp-line focus-visible:ring-offset-rp-surface')}>
                    Show all {countries.length}
                </button>
            </div>
            <RpSheet open={open} onClose={() => setOpen(false)} title="Passport" subtitle={`${plural(countries.length, 'stamp')} · ${data.worldShare}% of the world`}>
                <ul className="flex flex-col">
                    {countries.slice().sort((a, b) => a.name.localeCompare(b.name)).map(c => (
                        <li key={c.id} className="flex min-h-14 items-center gap-3 border-b border-rp-line py-2 last:border-0">
                            <FlagBadge code={c.code} />
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium text-rp-ink">{c.name}</span>
                                <span className="block truncate text-xs text-rp-muted">{regionOf(c.code)}{c.visitDate ? ` · ${formatDate(c.visitDate, 'month-year')}` : ''}</span>
                            </span>
                        </li>
                    ))}
                </ul>
            </RpSheet>
        </div>
    );
};

/* -------------------------------- where next ------------------------------ */

/** Where next? A Throw Deck of the Atlas wishlist: flick one away to keep it, or mark it visited. */
export const WhereNextWidget: React.FC<{ data: DashboardData }> = ({ data }) => {
    const items = data.wishlist;
    const cards = useMemo<DeckCard[]>(() => items.map(item => ({
        id: item.id,
        title: item.name,
        subtitle: regionOf(item.code),
        art: <FlagArt code={item.code} tone="wishlist" />,
        description: item.notes,
    })), [items]);
    const byId = useMemo(() => new Map<string, VisitedItem>(items.map(i => [i.id, i])), [items]);
    if (!items.length) {
        return (
            <RpEmpty title="Your wishlist is empty" action={<button type="button" className={cn(PILL, 'bg-rp-ink text-rp-on-ink focus-visible:ring-offset-rp-surface')} onClick={() => openNewPage('/atlas-new')}>Open Atlas</button>}>
                Countries you want to see turn up here.
            </RpEmpty>
        );
    }
    return (
        <div className="-mx-3 h-full overflow-y-auto [scrollbar-width:none]">
            <ThrowDeck
                key={cards.map(c => c.id).join('|')}
                cards={cards}
                label="Wishlist deck. Drag the top card away, or use the arrow keys, to see the next country."
                actionLabel="Open"
                onAction={() => openNewPage('/atlas-new')}
                topActionLabel="Been there"
                topActionIcon={<Check size={16} />}
                onTopAction={card => { const item = byId.get(card.id); if (item) void data.markVisited(item); }}
                className="min-h-0 py-2"
            />
        </div>
    );
};

