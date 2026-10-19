import React, { useMemo } from 'react';
import NumberFlow from '@number-flow/react';
import type { Trip, User } from '../../../types';
import { formatCurrency, formatDateRange } from '../../../utils/formatters';
import { bucketOf, destinationLabel, isTravelling, timingOf, tripCost, tripDays, tripNeeds, type TripBucket } from '../../../utils/tripsModel';
import { Airplane, ArrowUpRight, Bed } from '../../ui/hugeicons';
import { RpIconButton } from '../ui';
import { CappedTrips } from './CappedTrips';
import { BUCKET_HEAD, BUCKET_LABEL, tripMenuItems, type TripActions } from './TripCard';
import { TripMenu } from './TripMenu';
import { cn } from '../../../utils/cn';

/**
 * The list view: the same trips as rows, grouped by status, or one flat list for the archive. On wide
 * screens each row is a table line (dates, length, when, what is booked, cost, who); on phones it is
 * the name with one line of facts under it.
 */

const COLS = 'lg:grid-cols-[2rem_minmax(0,1.7fr)_10rem_4.5rem_7rem_8rem_5.5rem_4.5rem_auto]';

const RowIcon: React.FC<{ bucket: TripBucket; size?: number }> = ({ bucket, size = 16 }) => {
    const IconC = BUCKET_HEAD[bucket].icon;
    return <IconC size={size} aria-hidden />;
};

const initials = (name?: string) => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]!.toUpperCase()).join('');

const Row: React.FC<{ trip: Trip; users: User[]; today: string; actions: TripActions }> = ({ trip, users, today, actions }) => {
    const bucket = bucketOf(trip, today);
    const now = isTravelling(trip, today);
    const timing = timingOf(trip, today);
    const days = tripDays(trip);
    const cost = tripCost(trip);
    const flights = (trip.transports || []).length;
    const stays = (trip.accommodations || []).length;
    const needs = tripNeeds(trip, today);
    const members = useMemo(() => (trip.participants || []).map(id => users.find(u => u.id === id)).filter((u): u is User => Boolean(u)), [trip.participants, users]);
    const dates = trip.startDate ? formatDateRange(trip.startDate, trip.endDate || trip.startDate) : '';
    const muted = now ? 'text-rp-on-ink/70' : 'text-rp-muted';
    const dayText = days > 0 ? `${days} ${days === 1 ? 'day' : 'days'}` : '';
    const facts = [dates, dayText, cost > 0 ? formatCurrency(cost) : ''].filter(Boolean).join(' · ');
    const avatar = cn('flex size-6 items-center justify-center rounded-full text-2xs font-semibold ring-2', now ? 'bg-rp-on-ink text-rp-ink ring-rp-ink' : 'bg-rp-inset text-rp-ink ring-rp-surface');

    return (
        <li className={cn('grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 rounded-rp-tile py-1 pr-1 pl-4 rp-shadow-rest', COLS, now ? 'bg-rp-ink text-rp-on-ink' : 'bg-rp-surface text-rp-ink')}>
            <span className={cn('flex size-8 items-center justify-center rounded-full', now ? 'bg-rp-mustard text-rp-on-mustard' : BUCKET_HEAD[bucket].circle)} aria-hidden><RowIcon bucket={bucket} /></span>

            <button
                type="button"
                onClick={e => actions.onDetails(trip, e.currentTarget.closest('li')?.getBoundingClientRect())}
                className="min-h-11 min-w-0 rounded-rp-inset px-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-rp-muted"
            >
                <span className="block truncate text-sm font-medium">{trip.name}</span>
                <span className={cn('block truncate text-xs', muted)}>{destinationLabel(trip, 2) || 'No destination yet'}</span>
                {facts ? <span className={cn('rp-tabular block truncate text-xs lg:hidden', muted)}>{facts}</span> : null}
            </button>

            <span className={cn('rp-tabular hidden truncate text-xs lg:block', muted)}>{dates}</span>
            <span className={cn('rp-tabular hidden text-right text-xs lg:block', muted)}>{dayText}</span>
            <span className="rp-tabular hidden text-right text-xs font-medium lg:block">
                {timing.state === 'past' ? '' : timing.value !== null ? `${timing.value} ${timing.unit}` : timing.unit}
            </span>

            <span className="hidden items-center gap-2 pl-2 lg:flex">
                {flights > 0 ? <span className={cn('rp-tabular flex items-center gap-1 text-xs', muted)} title={`${flights} transport`}><Airplane size={14} aria-hidden /> {flights}</span> : null}
                {stays > 0 ? <span className={cn('rp-tabular flex items-center gap-1 text-xs', muted)} title={`${stays} stays`}><Bed size={14} aria-hidden /> {stays}</span> : null}
                {needs.length > 0 ? (
                    <span className="inline-flex min-h-6 items-center rounded-full bg-rp-rust px-2 text-2xs font-semibold whitespace-nowrap text-rp-paper">
                        {needs.length === 2 ? 'Not booked' : needs[0] === 'flights' ? 'No flights' : 'No stay'}
                    </span>
                ) : null}
            </span>

            <span className="rp-tabular hidden text-right text-sm font-medium lg:block">{cost > 0 ? formatCurrency(cost) : <span className={muted}>–</span>}</span>

            <span className="hidden -space-x-2 lg:flex" aria-label={members.length ? `${members.length} members` : undefined}>
                {members.slice(0, 3).map(u => <span key={u.id} title={u.name} className={avatar}>{initials(u.name)}</span>)}
                {members.length > 3 ? <span className={avatar}>+{members.length - 3}</span> : null}
            </span>

            <span className="col-start-3 row-start-1 flex lg:col-auto lg:row-auto">
                <RpIconButton label={`Open ${trip.name}`} tone="ghost" onClick={() => actions.onOpenTrip(trip)} className={cn(now && 'text-rp-on-ink hover:bg-rp-on-ink/15')}>
                    <ArrowUpRight size={20} />
                </RpIconButton>
                <TripMenu label={`Actions for ${trip.name}`} items={tripMenuItems(trip, bucket, actions)} triggerClassName={cn(now && 'text-rp-on-ink hover:bg-rp-on-ink/15')} />
            </span>
        </li>
    );
};

/** Column titles, on wide screens only. */
const Head: React.FC = () => (
    <div className={cn('hidden items-center gap-x-3 px-4 pr-1 text-xs text-rp-muted lg:grid', COLS)} aria-hidden>
        <span />
        <span>Trip</span>
        <span>Dates</span>
        <span className="text-right">Length</span>
        <span className="text-right">When</span>
        <span className="pl-2">Booked</span>
        <span className="text-right">Cost</span>
        <span>Who</span>
        <span className="w-[5.5rem]" />
    </div>
);

export const TripList: React.FC<{
    columns?: Record<TripBucket, Trip[]>;
    flat?: Trip[];
    users: User[];
    today: string;
    actions: TripActions;
    onAdd: (bucket: TripBucket) => void;
    expanded?: Record<TripBucket, boolean>;
    onExpandedChange?: (bucket: TripBucket, expanded: boolean) => void;
    filtering?: boolean;
}> = ({ columns, flat, users, today, actions, expanded, onExpandedChange, filtering }) => {
    if (flat) {
        return (
            <div className="flex flex-col gap-2">
                <Head />
                <ul className="flex flex-col gap-2">{flat.map(t => <Row key={t.id} trip={t} users={users} today={today} actions={actions} />)}</ul>
            </div>
        );
    }
    return (
        <div className="flex flex-col gap-3">
            <Head />
            {(['planned', 'confirmed', 'past'] as TripBucket[]).filter(b => columns![b].length > 0).map(b => (
                <section key={b} aria-label={BUCKET_LABEL[b]} className="flex flex-col gap-2">
                    <h2 className="flex items-center gap-2.5 px-1 text-base font-medium text-rp-ink">
                        <span className={cn('flex size-9 items-center justify-center rounded-full', BUCKET_HEAD[b].circle)}><RowIcon bucket={b} size={18} /></span>
                        {BUCKET_LABEL[b]}
                        <NumberFlow value={columns![b].length} className="rp-tabular text-2xl leading-none font-semibold text-rp-ink" />
                    </h2>
                    <CappedTrips
                        bucket={b}
                        trips={columns![b]}
                        expanded={expanded?.[b] ?? false}
                        onExpandedChange={v => onExpandedChange?.(b, v)}
                        filtering={Boolean(filtering)}
                        layout="stack"
                        gap="gap-2"
                        renderItem={t => <ul><Row trip={t} users={users} today={today} actions={actions} /></ul>}
                    />
                </section>
            ))}
        </div>
    );
};
