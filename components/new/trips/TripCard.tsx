import React, { useMemo } from 'react';
import NumberFlow from '@number-flow/react';
import { motion, useReducedMotion } from 'motion/react';
import { useDraggable } from '@dnd-kit/core';
import type { Trip, User } from '../../../types';
import { formatDateRange } from '../../../utils/formatters';
import { bucketOf, destinationsOf, isTravelling, timingOf, tripDays, tripNeeds, type TripBucket } from '../../../utils/tripsModel';
import {
    Airplane, Archive, ArrowCounterClockwise, ArrowUpRight, Bed, CalendarBlank, CheckCircle, Clock, PencilSimple, Suitcase, Trash, type Icon,
} from '../../ui/hugeicons';
import { RpIconButton } from '../ui';
import { TripMenu, type TripMenuItem } from './TripMenu';
import { cn } from '../../../utils/cn';

/**
 * A trip on the board (UI_UX_DESIGN_REFERENCE.md §2.3 card anatomy): title, "···", "↗", a hero number
 * with a muted qualifier, and a row of chips. Colour is status only: mustard planned, green
 * confirmed, white with a tick past, ink for a trip under way, rust for what still needs doing.
 */

export const BUCKET_LABEL: Record<TripBucket, string> = { planned: 'Planned', confirmed: 'Confirmed', past: 'Past' };

const BUCKET_LOOK: Record<TripBucket, { circle: string; icon: Icon }> = {
    planned: { circle: 'bg-rp-mustard text-rp-on-mustard', icon: Clock },
    confirmed: { circle: 'bg-rp-green text-rp-paper', icon: Suitcase },
    past: { circle: 'bg-rp-inset text-rp-ink', icon: CheckCircle },
};

/** The card's fill follows its status: ink while travelling, mustard planned, green confirmed, white past. */
interface Skin { card: string; muted: string; chip: string; circle: string; button: string; avatar: string }
const SKINS: Record<'ink' | TripBucket, Skin> = {
    ink: {
        card: 'bg-rp-ink text-rp-on-ink', muted: 'text-rp-on-ink/70', chip: 'bg-rp-on-ink/15 text-rp-on-ink',
        circle: 'bg-rp-mustard text-rp-on-mustard', button: 'text-rp-on-ink hover:bg-rp-on-ink/15', avatar: 'bg-rp-on-ink text-rp-ink ring-rp-ink',
    },
    planned: {
        card: 'bg-rp-mustard text-rp-on-mustard', muted: 'text-rp-on-mustard/70', chip: 'bg-rp-on-mustard/15 text-rp-on-mustard',
        circle: 'bg-rp-on-mustard/15 text-rp-on-mustard', button: 'text-rp-on-mustard hover:bg-rp-on-mustard/15', avatar: 'bg-rp-on-mustard text-rp-mustard ring-rp-mustard',
    },
    confirmed: {
        card: 'bg-rp-green text-rp-paper', muted: 'text-rp-paper/80', chip: 'bg-rp-paper/20 text-rp-paper',
        circle: 'bg-rp-paper/20 text-rp-paper', button: 'text-rp-paper hover:bg-rp-paper/20', avatar: 'bg-rp-paper text-rp-green ring-rp-green',
    },
    past: {
        card: 'bg-rp-surface text-rp-ink', muted: 'text-rp-muted', chip: 'bg-rp-inset text-rp-ink',
        circle: 'bg-rp-inset text-rp-ink', button: '', avatar: 'bg-rp-inset text-rp-ink ring-rp-surface',
    },
};

const initials = (name?: string) =>
    (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]!.toUpperCase()).join('');

export interface TripActions {
    onEdit: (trip: Trip) => void;
    onOpenTrip: (trip: Trip) => void;
    onMove: (trip: Trip, bucket: TripBucket) => void;
    onArchive: (trip: Trip) => void;
    onRestore: (trip: Trip) => void;
    onDelete: (trip: Trip) => void;
}

/** The menu for a trip: the keyboard and tap version of every drag. */
export const tripMenuItems = (trip: Trip, bucket: TripBucket, actions: TripActions): TripMenuItem[] => {
    const items: TripMenuItem[] = [
        { id: 'edit', label: 'Edit trip', icon: PencilSimple, onSelect: () => actions.onEdit(trip) },
        { id: 'open', label: 'Open trip', icon: ArrowUpRight, onSelect: () => actions.onOpenTrip(trip) },
    ];
    if (!trip.archived) {
        (['planned', 'confirmed', 'past'] as TripBucket[])
            .filter(b => b !== bucket)
            .forEach((b, i) => items.push({
                id: `move-${b}`, label: `Move to ${BUCKET_LABEL[b]}`, icon: BUCKET_LOOK[b].icon, separated: i === 0,
                onSelect: () => actions.onMove(trip, b),
            }));
        items.push({ id: 'archive', label: 'Archive', icon: Archive, separated: true, onSelect: () => actions.onArchive(trip) });
    } else {
        items.push({ id: 'restore', label: 'Restore', icon: ArrowCounterClockwise, separated: true, onSelect: () => actions.onRestore(trip) });
    }
    items.push({ id: 'delete', label: 'Delete', icon: Trash, tone: 'danger', onSelect: () => actions.onDelete(trip) });
    return items;
};

interface CardProps {
    trip: Trip;
    users: User[];
    today: string;
    actions: TripActions;
    /** Position in the column, for the staggered entrance (first eight only). */
    index?: number;
    /** The lifted copy that follows the pointer while dragging. */
    overlay?: boolean;
    /** A faded placeholder left behind while its copy is dragged. */
    ghost?: boolean;
}

export const TripCardBody: React.FC<CardProps> = ({ trip, users, today, actions, index = 0, overlay, ghost }) => {
    const reduce = useReducedMotion();
    const bucket = bucketOf(trip, today);
    const now = isTravelling(trip, today);
    const timing = timingOf(trip, today);
    const days = tripDays(trip);
    const needs = tripNeeds(trip, today);
    const destinations = destinationsOf(trip);
    const flights = (trip.transports || []).length;
    const stays = (trip.accommodations || []).length;
    const members = useMemo(() => (trip.participants || []).map(id => users.find(u => u.id === id)).filter((u): u is User => Boolean(u)), [trip.participants, users]);
    const look = BUCKET_LOOK[bucket];
    const Circle = look.icon;

    const skin = SKINS[now ? 'ink' : bucket];
    const muted = skin.muted;
    const chip = cn('inline-flex min-h-6 items-center gap-1 rounded-full px-2 text-2xs font-semibold rp-tabular', skin.chip);

    return (
        <motion.article
            initial={reduce || index >= 8 || overlay ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: Math.min(index, 7) * 0.05, ease: [0.23, 1, 0.32, 1] }}
            aria-label={trip.name}
            className={cn(
                'flex flex-col gap-3 rounded-rp-tile p-4',
                skin.card,
                overlay ? 'rp-shadow-float' : 'rp-shadow-rest',
                ghost && 'opacity-40'
            )}
            style={overlay && !reduce ? { rotate: '2deg', scale: 1.02 } : undefined}
        >
            <div className="flex items-start gap-3">
                <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', skin.circle)}>
                    <Circle size={18} aria-hidden />
                </span>
                <button
                    type="button"
                    onClick={() => actions.onEdit(trip)}
                    className="min-h-11 min-w-0 flex-1 rounded-rp-inset text-left outline-none focus-visible:ring-2 focus-visible:ring-rp-muted"
                >
                    <span className="line-clamp-2 break-words text-base font-medium leading-tight">{trip.name}</span>
                    <span className={cn('block truncate text-xs', muted)}>{destinations.join(' · ') || 'No destination yet'}</span>
                </button>
                <div className="-mt-1 -mr-2 flex shrink-0">
                    <RpIconButton
                        label={`Open ${trip.name}`}
                        tone="ghost"
                        onClick={() => actions.onOpenTrip(trip)}
                        className={skin.button}
                    >
                        <ArrowUpRight size={20} />
                    </RpIconButton>
                    <TripMenu label={`Actions for ${trip.name}`} items={tripMenuItems(trip, bucket, actions)} triggerClassName={skin.button} />
                </div>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
                <p className="flex items-baseline gap-1.5">
                    {timing.value !== null ? <NumberFlow value={timing.value} className="rp-tabular text-[1.75rem] font-semibold leading-none" /> : null}
                    <span className={cn('whitespace-nowrap text-xs', muted)}>{timing.unit}</span>
                </p>
                <p className={cn('rp-tabular whitespace-nowrap text-right text-xs', muted)}>{trip.startDate ? formatDateRange(trip.startDate, trip.endDate || trip.startDate) : ''}</p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
                {now ? <span className="inline-flex min-h-6 items-center rounded-full bg-rp-mustard px-2 text-2xs font-semibold text-rp-on-mustard">Travelling now</span> : null}
                {days > 0 ? <span className={chip}><CalendarBlank size={12} aria-hidden /> {days} {days === 1 ? 'day' : 'days'}</span> : null}
                {flights > 0 ? <span className={chip}><Airplane size={12} aria-hidden /> {flights}</span> : null}
                {stays > 0 ? <span className={chip}><Bed size={12} aria-hidden /> {stays}</span> : null}
                {needs.map(n => (
                    <span key={n} className="inline-flex min-h-6 items-center rounded-full bg-rp-rust px-2 text-2xs font-semibold text-rp-paper">
                        {n === 'flights' ? 'Add flights' : 'Add a stay'}
                    </span>
                ))}
                {members.length > 0 ? (
                    <span className="ml-auto flex -space-x-2" aria-label={`${members.length} ${members.length === 1 ? 'member' : 'members'}`}>
                        {members.slice(0, 3).map(u => (
                            <span key={u.id} title={u.name} className={cn('flex size-6 items-center justify-center rounded-full text-2xs font-semibold ring-2', skin.avatar)}>
                                {initials(u.name)}
                            </span>
                        ))}
                        {members.length > 3 ? (
                            <span className={cn('flex size-6 items-center justify-center rounded-full text-2xs font-semibold ring-2', skin.avatar)}>+{members.length - 3}</span>
                        ) : null}
                    </span>
                ) : null}
            </div>
        </motion.article>
    );
};

/** A board card that can be picked up with a mouse or a long press. The menu is the keyboard route. */
export const DraggableTripCard: React.FC<CardProps & { dragEnabled: boolean }> = ({ dragEnabled, ...props }) => {
    const { setNodeRef, listeners, isDragging } = useDraggable({ id: props.trip.id, disabled: !dragEnabled });
    return (
        <div ref={setNodeRef} {...(dragEnabled ? listeners : {})} className={cn(dragEnabled && 'cursor-grab touch-manipulation active:cursor-grabbing')}>
            <TripCardBody {...props} ghost={isDragging} />
        </div>
    );
};
