import React from 'react';
import type { Trip, User } from '../../../types';
import { formatDateRange } from '../../../utils/formatters';
import { bucketOf, destinationsOf, isTravelling, timingOf, tripDays, type TripBucket } from '../../../utils/tripsModel';
import { ArrowUpRight } from '../../ui/hugeicons';
import { RpIconButton } from '../ui';
import { BUCKET_LABEL, tripMenuItems, type TripActions } from './TripCard';
import { TripMenu } from './TripMenu';
import { BUCKET_ACCENT } from './TripBoard';
import { cn } from '../../../utils/cn';

/** The list view: the same trips as rows, grouped by status, or one flat list for the archive. */

const Row: React.FC<{ trip: Trip; today: string; actions: TripActions }> = ({ trip, today, actions }) => {
    const bucket = bucketOf(trip, today);
    const now = isTravelling(trip, today);
    const timing = timingOf(trip, today);
    const days = tripDays(trip);
    return (
        <li className={cn('flex items-center gap-2 rounded-rp-tile py-1 pr-1 pl-4', now ? 'bg-rp-ink text-rp-on-ink' : 'bg-rp-surface text-rp-ink', 'rp-shadow-rest')}>
            <span className={cn('size-2.5 shrink-0 rounded-full', now ? 'bg-rp-mustard' : BUCKET_ACCENT[bucket])} aria-hidden />
            <button type="button" onClick={() => actions.onEdit(trip)} className="min-h-11 min-w-0 flex-1 rounded-rp-inset px-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-rp-muted">
                <span className="block truncate text-sm font-medium">{trip.name}</span>
                <span className={cn('block truncate text-xs', now ? 'text-rp-on-ink/70' : 'text-rp-muted')}>{destinationsOf(trip).join(' · ') || 'No destination yet'}</span>
            </button>
            <span className={cn('rp-tabular hidden shrink-0 text-xs sm:block', now ? 'text-rp-on-ink/70' : 'text-rp-muted')}>
                {trip.startDate ? formatDateRange(trip.startDate, trip.endDate || trip.startDate) : ''}
            </span>
            <span className={cn('rp-tabular hidden w-16 shrink-0 text-right text-xs md:block', now ? 'text-rp-on-ink/70' : 'text-rp-muted')}>
                {days > 0 ? `${days} ${days === 1 ? 'day' : 'days'}` : ''}
            </span>
            <span className="rp-tabular hidden w-28 shrink-0 text-right text-xs font-medium lg:block">
                {timing.value !== null ? `${timing.value} ${timing.unit}` : timing.unit}
            </span>
            <RpIconButton label={`Open ${trip.name}`} tone="ghost" onClick={() => actions.onOpenTrip(trip)} className={cn(now && 'text-rp-on-ink hover:bg-rp-on-ink/15')}>
                <ArrowUpRight size={20} />
            </RpIconButton>
            <TripMenu label={`Actions for ${trip.name}`} items={tripMenuItems(trip, bucket, actions)} triggerClassName={cn(now && 'text-rp-on-ink hover:bg-rp-on-ink/15')} />
        </li>
    );
};

export const TripList: React.FC<{
    columns?: Record<TripBucket, Trip[]>;
    flat?: Trip[];
    users: User[];
    today: string;
    actions: TripActions;
    onAdd: (bucket: TripBucket) => void;
}> = ({ columns, flat, today, actions }) => {
    if (flat) {
        return <ul className="flex flex-col gap-2">{flat.map(t => <Row key={t.id} trip={t} today={today} actions={actions} />)}</ul>;
    }
    return (
        <div className="flex flex-col gap-6">
            {(['planned', 'confirmed', 'past'] as TripBucket[]).filter(b => columns![b].length > 0).map(b => (
                <section key={b} aria-label={BUCKET_LABEL[b]} className="flex flex-col gap-2">
                    <h2 className="flex items-center gap-2 px-1 text-sm font-medium text-rp-ink">
                        <span className={cn('size-2.5 rounded-full', BUCKET_ACCENT[b])} aria-hidden />
                        {BUCKET_LABEL[b]}
                        <span className="rp-tabular text-xs font-normal text-rp-muted">{columns![b].length}</span>
                    </h2>
                    <ul className="flex flex-col gap-2">{columns![b].map(t => <Row key={t.id} trip={t} today={today} actions={actions} />)}</ul>
                </section>
            ))}
        </div>
    );
};
