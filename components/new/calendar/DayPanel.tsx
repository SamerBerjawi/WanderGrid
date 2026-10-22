import React from 'react';
import type { EntitlementType, Trip, User } from '../../../types';
import { dayWeight, isStandaloneLeave, isWeekend, type CalendarItem, type LeaveContext } from '../../../utils/calendarModel';
import { formatDate, formatDateRange } from '../../../utils/formatters';
import SmoothDrawer from '../../kokonutui/smooth-drawer';
import { ArrowUpRight, Flag, PencilSimple, Plus, Star, SunHorizon } from '../../ui/hugeicons';
import { Avatar } from '../member/Avatar';
import { RpEmpty, RpSheet } from '../ui';
import { itemIcon, STATE_CHIP, STATE_LABEL } from './calendarStyles';
import { cn } from '../../../utils/cn';

/**
 * One day's detail: its holidays and events, and every trip or leave that covers it with what the day
 * counts for, and a way to change that leave or open the trip. A right sheet on wider screens, a Smooth
 * Drawer on phones.
 */

const PILL = 'inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-rp-muted focus-visible:ring-offset-2 focus-visible:ring-offset-rp-surface active:scale-[0.97]';

const weightWords = (trip: Trip, iso: string, ctx: LeaveContext): string => {
    if ((trip.excludedDates || []).includes(iso)) return 'A day you work: not counted';
    if (isWeekend(iso, ctx.workingDays)) return 'Weekend: not counted';
    if (ctx.offDays.has(iso)) return 'Public holiday: not counted';
    const w = dayWeight(trip, iso, ctx);
    return w === 0.5 ? 'Counts as half a day' : 'Counts as a day';
};

const DayBody: React.FC<{
    iso: string;
    items: CalendarItem[];
    users: User[];
    entitlements: EntitlementType[];
    contextFor: (memberId: string) => LeaveContext;
    canEdit: (trip: Trip) => boolean;
    onEditLeave: (trip: Trip) => void;
    onOpenTrip: (id: string) => void;
    onAddLeave: () => void;
    onManageHolidays: () => void;
}> = ({ iso, items, users, entitlements, contextFor, canEdit, onEditLeave, onOpenTrip, onAddLeave, onManageHolidays }) => {
    if (items.length === 0) {
        return (
            <RpEmpty title="Nothing on this day" action={<button type="button" onClick={onAddLeave} className={cn(PILL, 'bg-rp-ink text-rp-on-ink hover:bg-rp-ink/90')}><Plus size={16} aria-hidden /> Add leave</button>} />
        );
    }
    return (
        <ul className="flex flex-col gap-2">
            {items.map(item => {
                const Icon = itemIcon(item);
                if (item.kind === 'holiday' && item.holiday) {
                    const h = item.holiday;
                    return (
                        <li key={item.key} className="flex items-start gap-3 rounded-rp-inset bg-rp-inset px-3 py-3">
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-rp-ochre/15 text-rp-ochre"><Flag size={18} aria-hidden /></span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-medium text-rp-ink">{h.name}</span>
                                <span className="block text-xs text-rp-muted">
                                    {h.countryName} · {h.counted ? 'Day off' : 'Not a day off'}
                                    {h.observed !== h.date ? ` · Observed instead of ${formatDate(h.date, 'weekday-short')}` : ''}
                                </span>
                            </span>
                            <button type="button" onClick={onManageHolidays} className={cn(PILL, 'bg-rp-surface text-rp-ink hover:bg-rp-line')}>Manage</button>
                        </li>
                    );
                }
                if (item.kind === 'event' && item.event) {
                    return (
                        <li key={item.key} className="flex items-start gap-3 rounded-rp-inset bg-rp-inset px-3 py-3">
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-rp-navy/15 text-rp-navy"><Star size={18} aria-hidden /></span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-medium text-rp-ink">{item.title}</span>
                                <span className="block text-xs text-rp-muted">{item.event.isWorkingDay ? 'A working day' : 'Not a working day'}</span>
                            </span>
                        </li>
                    );
                }
                const trip = item.trip!;
                const who = users.filter(u => (trip.participants || []).includes(u.id));
                const type = entitlements.find(e => e.id === trip.entitlementId);
                const split = (trip.allocations || []).length > 1;
                const ctx = contextFor(who[0]?.id ?? '');
                return (
                    <li key={item.key} className="flex flex-col gap-2 rounded-rp-inset bg-rp-inset px-3 py-3">
                        <div className="flex items-start gap-3">
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-rp-surface text-rp-ink"><Icon size={18} aria-hidden /></span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium text-rp-ink">{trip.name}</span>
                                <span className="rp-tabular block text-xs text-rp-muted">{formatDateRange(trip.startDate, trip.endDate || trip.startDate)}</span>
                            </span>
                            <span className={cn('inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-xs font-medium', STATE_CHIP[item.state])}>{STATE_LABEL[item.state]}</span>
                        </div>
                        {who.length > 0 ? (
                            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-[3.25rem] text-xs text-rp-muted">
                                <span className="flex -space-x-1.5">{who.slice(0, 4).map(u => <Avatar key={u.id} user={u} size={22} className="ring-2 ring-rp-inset" />)}</span>
                                <span className="truncate">{who.map(u => u.name.split(' ')[0]).join(', ')}</span>
                            </p>
                        ) : null}
                        {item.leave ? (
                            <p className="pl-[3.25rem] text-xs text-rp-ink">
                                <SunHorizon size={14} className="mr-1 inline text-rp-ochre" aria-hidden />
                                {split ? 'Split across leave types' : type?.name ?? 'Leave'} · {weightWords(trip, iso, ctx)}
                            </p>
                        ) : null}
                        <div className="flex flex-wrap gap-2 pl-[3.25rem]">
                            {canEdit(trip) ? (
                                <button type="button" onClick={() => onEditLeave(trip)} className={cn(PILL, 'bg-rp-surface text-rp-ink hover:bg-rp-line')}>
                                    {item.leave ? <PencilSimple size={16} aria-hidden /> : <Plus size={16} aria-hidden />}
                                    {item.leave ? 'Edit leave' : 'Add leave'}
                                </button>
                            ) : null}
                            {!isStandaloneLeave(trip) ? (
                                <button type="button" onClick={() => onOpenTrip(trip.id)} className={cn(PILL, 'bg-rp-surface text-rp-ink hover:bg-rp-line')}>
                                    Open trip <ArrowUpRight size={16} aria-hidden />
                                </button>
                            ) : null}
                        </div>
                    </li>
                );
            })}
        </ul>
    );
};

export const DayPanel: React.FC<{
    iso: string | null;
    mobile: boolean;
    onClose: () => void;
    items: CalendarItem[];
    users: User[];
    entitlements: EntitlementType[];
    contextFor: (memberId: string) => LeaveContext;
    canEdit: (trip: Trip) => boolean;
    onEditLeave: (trip: Trip) => void;
    onOpenTrip: (id: string) => void;
    onAddLeave: (iso: string) => void;
    onManageHolidays: () => void;
}> = ({ iso, mobile, onClose, items, users, entitlements, contextFor, canEdit, onEditLeave, onOpenTrip, onAddLeave, onManageHolidays }) => {
    const day = iso ?? '';
    const title = iso ? formatDate(iso, 'weekday-long') : '';
    const count = items.length === 0 ? 'Nothing planned' : `${items.length} ${items.length === 1 ? 'thing' : 'things'}`;
    const body = iso ? (
        <DayBody
            iso={day}
            items={items}
            users={users}
            entitlements={entitlements}
            contextFor={contextFor}
            canEdit={canEdit}
            onEditLeave={onEditLeave}
            onOpenTrip={onOpenTrip}
            onAddLeave={() => onAddLeave(day)}
            onManageHolidays={onManageHolidays}
        />
    ) : null;
    const add = (
        <button type="button" onClick={() => iso && onAddLeave(iso)} className={cn(PILL, 'bg-rp-ink text-rp-on-ink hover:bg-rp-ink/90')}>
            <Plus size={16} aria-hidden /> Add leave
        </button>
    );

    if (mobile) {
        return (
            <SmoothDrawer
                open={Boolean(iso)}
                onOpenChange={o => { if (!o) onClose(); }}
                title={title || ' '}
                description={count}
                action={add}
                detailsLabel="Show the day"
                hideDetailsLabel="Hide details"
                defaultExpanded={items.length > 0}
                peekHeight={140}
            >
                {body}
            </SmoothDrawer>
        );
    }
    return (
        <RpSheet open={Boolean(iso)} onClose={onClose} title={title} subtitle={count} width={420} footer={<>{<span />}{add}</>}>
            {body}
        </RpSheet>
    );
};
