import { Flag, Star, SunHorizon, Suitcase, type Icon } from '../../ui/hugeicons';
import type { CalendarItem, ItemState } from '../../../utils/calendarModel';

/**
 * How calendar items look (UI_UX_DESIGN_REFERENCE.md §5.1): mustard planned, green confirmed, ink
 * travelling now, a quiet line for past; holidays are ochre and events navy. Colour always travels with
 * an icon or a label. Class names are written out in full so Tailwind sees them.
 */

export const STATE_LABEL: Record<ItemState, string> = {
    planned: 'Planned',
    confirmed: 'Confirmed',
    now: 'Travelling now',
    past: 'Past',
};

/** A chip in a day cell and a pill in a list. */
export const STATE_CHIP: Record<ItemState, string> = {
    planned: 'bg-rp-mustard text-rp-on-mustard',
    confirmed: 'bg-rp-green text-rp-paper',
    now: 'bg-rp-ink text-rp-on-ink',
    past: 'bg-rp-line text-rp-ink',
};

/** The small marker on a phone's month grid: round for trips, square for holidays and events. */
export const STATE_DOT: Record<ItemState, string> = {
    planned: 'bg-rp-mustard',
    confirmed: 'bg-rp-green',
    now: 'bg-rp-ink',
    past: 'bg-rp-muted',
};

export const HOLIDAY_CHIP = 'bg-rp-ochre/15 text-rp-ink';
export const HOLIDAY_OFF_CHIP = 'border border-dashed border-rp-muted text-rp-muted';
export const EVENT_CHIP = 'bg-rp-navy/15 text-rp-ink';

/** Chip classes for an item. */
export const chipClass = (item: CalendarItem): string => {
    if (item.kind === 'holiday') return item.muted ? HOLIDAY_OFF_CHIP : HOLIDAY_CHIP;
    if (item.kind === 'event') return item.muted ? HOLIDAY_OFF_CHIP : EVENT_CHIP;
    return STATE_CHIP[item.state];
};

export const dotClass = (item: CalendarItem): string => {
    if (item.kind === 'holiday') return item.muted ? 'rounded-[2px] border border-rp-muted' : 'rounded-[2px] bg-rp-ochre';
    if (item.kind === 'event') return 'rounded-[2px] bg-rp-navy';
    return `rounded-full ${STATE_DOT[item.state]}`;
};

export const itemIcon = (item: CalendarItem): Icon => {
    if (item.kind === 'holiday') return Flag;
    if (item.kind === 'event') return Star;
    return item.leave ? SunHorizon : Suitcase;
};

/** The words for an item, for screen readers and tooltips. */
export const itemWords = (item: CalendarItem): string => {
    if (item.kind === 'holiday') return `${item.title}, public holiday${item.muted ? ', not a day off' : ''}`;
    if (item.kind === 'event') return `${item.title}, event`;
    return `${item.title}, ${STATE_LABEL[item.state].toLowerCase()}${item.leave ? ', leave' : ''}`;
};
