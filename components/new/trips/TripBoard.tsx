import React, { useState } from 'react';
import {
    DndContext, DragOverlay, MouseSensor, TouchSensor, pointerWithin, rectIntersection, useDroppable, useSensor, useSensors,
    type CollisionDetection, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { Trip, User } from '../../../types';
import { bucketOf, canMoveTo, tripDays, type TripBucket } from '../../../utils/tripsModel';
import { toast } from '../../../services/toast';
import { Archive, Plus, Trash } from '../../ui/hugeicons';
import { RpIconButton } from '../ui';
import { BUCKET_LABEL, DraggableTripCard, TripCardBody, type TripActions } from './TripCard';
import { cn } from '../../../utils/cn';

/**
 * The board (UI_UX_DESIGN_REFERENCE.md §5.2 row 3): one column per trip status. On desktop every
 * column is visible; on tablets the columns scroll sideways; on phones the page shows one column at
 * a time. Dragging (mouse, or a long press on touch) changes the status; while a card is lifted,
 * Archive and Delete drop zones appear. The "···" menu does the same without dragging.
 */

export const BUCKET_ACCENT: Record<TripBucket, string> = {
    planned: 'bg-rp-mustard',
    confirmed: 'bg-rp-green',
    past: 'bg-rp-ink',
};

const EMPTY_COPY: Record<TripBucket, string> = {
    planned: 'Trips you are still planning',
    confirmed: 'Trips that are booked',
    past: 'Trips you have taken',
};

const collision: CollisionDetection = args => {
    const within = pointerWithin(args);
    return within.length ? within : rectIntersection(args);
};

const Column: React.FC<{
    bucket: TripBucket;
    trips: Trip[];
    users: User[];
    today: string;
    actions: TripActions;
    dragEnabled: boolean;
    /** One column on its own (phones): no inset panel around the cards. */
    bare?: boolean;
    className?: string;
    onAdd: (bucket: TripBucket) => void;
}> = ({ bucket, trips, users, today, actions, dragEnabled, bare, className, onAdd }) => {
    const { setNodeRef, isOver } = useDroppable({ id: `column:${bucket}`, disabled: !dragEnabled });
    const days = trips.reduce((sum, t) => sum + tripDays(t), 0);
    return (
        <section aria-label={BUCKET_LABEL[bucket]} className={cn('flex min-w-0 flex-col gap-3', className)}>
            <header className="flex min-h-11 items-center justify-between gap-2 px-1">
                <h2 className="flex min-w-0 items-center gap-2 text-sm font-medium text-rp-ink">
                    <span className={cn('size-2.5 shrink-0 rounded-full', BUCKET_ACCENT[bucket])} aria-hidden />
                    {BUCKET_LABEL[bucket]}
                    <span className="rp-tabular text-xs font-normal text-rp-muted">
                        {trips.length}{days > 0 ? ` · ${days} ${days === 1 ? 'day' : 'days'}` : ''}
                    </span>
                </h2>
                <RpIconButton label={`Add a trip to ${BUCKET_LABEL[bucket]}`} tone="ghost" onClick={() => onAdd(bucket)}>
                    <Plus size={20} />
                </RpIconButton>
            </header>
            <div
                ref={setNodeRef}
                className={cn(
                    'flex min-h-40 flex-col gap-3 transition-shadow duration-150',
                    !bare && 'rounded-rp-card bg-rp-inset/60 p-3',
                    isOver && 'ring-2 ring-rp-ink'
                )}
            >
                {trips.length === 0 ? (
                    <p className="my-auto px-4 py-8 text-center text-sm text-rp-muted">{dragEnabled ? 'Drop a trip here' : EMPTY_COPY[bucket]}</p>
                ) : trips.map((trip, i) => (
                    <DraggableTripCard key={trip.id} trip={trip} users={users} today={today} actions={actions} index={i} dragEnabled={dragEnabled} />
                ))}
            </div>
        </section>
    );
};

const DropZone: React.FC<{ id: string; label: string; icon: typeof Archive; overClass: string }> = ({ id, label, icon: IconC, overClass }) => {
    const { setNodeRef, isOver } = useDroppable({ id });
    return (
        <div
            ref={setNodeRef}
            className={cn(
                'flex min-h-14 min-w-40 items-center justify-center gap-2 rounded-full px-6 text-sm font-medium transition-colors duration-150 rp-shadow-float',
                isOver ? overClass : 'bg-rp-surface text-rp-ink'
            )}
        >
            <IconC size={18} aria-hidden /> {label}
        </div>
    );
};

export const TripBoard: React.FC<{
    columns: Record<TripBucket, Trip[]>;
    users: User[];
    today: string;
    actions: TripActions;
    /** Which columns to show: all of them, or one at a time (phones). */
    show: 'all' | TripBucket;
    /** Mouse and touch dragging on. Off on phones, where the menu moves trips. */
    dragEnabled: boolean;
    onAdd: (bucket: TripBucket) => void;
    onDropMove: (trip: Trip, bucket: TripBucket) => void;
    onDropArchive: (trip: Trip) => void;
    onDropDelete: (trip: Trip) => void;
}> = ({ columns, users, today, actions, show, dragEnabled, onAdd, onDropMove, onDropArchive, onDropDelete }) => {
    const reduce = useReducedMotion();
    const [activeId, setActiveId] = useState<string | null>(null);
    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } })
    );

    const all = [...columns.planned, ...columns.confirmed, ...columns.past];
    const activeTrip = activeId ? all.find(t => t.id === activeId) : undefined;

    const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
    const onDragEnd = (e: DragEndEvent) => {
        setActiveId(null);
        const trip = all.find(t => t.id === e.active.id);
        const target = e.over ? String(e.over.id) : '';
        if (!trip || !target) return;
        if (target === 'zone:archive') return onDropArchive(trip);
        if (target === 'zone:delete') return onDropDelete(trip);
        if (!target.startsWith('column:')) return;
        const bucket = target.slice('column:'.length) as TripBucket;
        if (bucket === bucketOf(trip, today)) return;
        const can = canMoveTo(trip, bucket, today);
        if (!can.ok) { toast.info(can.reason); return; }
        onDropMove(trip, bucket);
    };

    const buckets: TripBucket[] = show === 'all' ? ['planned', 'confirmed', 'past'] : [show];

    return (
        <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
            <div
                className={cn(
                    show === 'all' && 'custom-scrollbar -m-3 flex snap-x gap-4 overflow-x-auto p-3 lg:m-0 lg:grid lg:grid-cols-3 lg:items-start lg:overflow-visible lg:p-0'
                )}
            >
                {buckets.map(bucket => (
                    <Column
                        key={bucket}
                        bucket={bucket}
                        trips={columns[bucket]}
                        users={users}
                        today={today}
                        actions={actions}
                        dragEnabled={dragEnabled}
                        bare={show !== 'all'}
                        onAdd={onAdd}
                        className={cn(show === 'all' && 'w-[min(20rem,82vw)] shrink-0 snap-start lg:w-auto')}
                    />
                ))}
            </div>

            <DragOverlay dropAnimation={reduce ? null : undefined}>
                {activeTrip ? <TripCardBody trip={activeTrip} users={users} today={today} actions={actions} overlay /> : null}
            </DragOverlay>

            <AnimatePresence>
                {dragEnabled && activeId ? (
                    <motion.div
                        key="zones"
                        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
                        transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                        className="rp-root pointer-events-none fixed inset-x-0 bottom-6 z-sticky flex justify-center gap-3 px-3"
                    >
                        <DropZone id="zone:archive" label="Archive" icon={Archive} overClass="bg-rp-ink text-rp-on-ink" />
                        <DropZone id="zone:delete" label="Delete" icon={Trash} overClass="bg-rp-rust text-rp-paper" />
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </DndContext>
    );
};
