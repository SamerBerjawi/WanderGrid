import { Flag, Star, SunHorizon, Suitcase, type Icon } from '../../ui/hugeicons';
import type { CalendarItem, ItemState, LeaveColor } from '../../../utils/calendarModel';

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

/**
 * "Colour leave by type": a leave type's colour as a tinted fill with a solid edge (a tint reads on both
 * themes, where white text on the light dark-mode accents would not). The ten leave-type colours fold into
 * the app's accents, so some share one: the legend names each type, and the chip carries the type's icon.
 */
export const TINT: Record<LeaveColor, { chip: string; dot: string; swatch: string }> = {
    blue: { chip: 'bg-rp-navy/20 text-rp-ink border-l-[3px] border-rp-navy', dot: 'bg-rp-navy', swatch: 'bg-rp-navy' },
    indigo: { chip: 'bg-rp-navy/20 text-rp-ink border-l-[3px] border-rp-navy', dot: 'bg-rp-navy', swatch: 'bg-rp-navy' },
    green: { chip: 'bg-rp-green/20 text-rp-ink border-l-[3px] border-rp-green', dot: 'bg-rp-green', swatch: 'bg-rp-green' },
    teal: { chip: 'bg-rp-sea/20 text-rp-ink border-l-[3px] border-rp-sea', dot: 'bg-rp-sea', swatch: 'bg-rp-sea' },
    cyan: { chip: 'bg-rp-sea/20 text-rp-ink border-l-[3px] border-rp-sea', dot: 'bg-rp-sea', swatch: 'bg-rp-sea' },
    amber: { chip: 'bg-rp-mustard/30 text-rp-ink border-l-[3px] border-rp-mustard', dot: 'bg-rp-mustard', swatch: 'bg-rp-mustard' },
    red: { chip: 'bg-rp-rust/20 text-rp-ink border-l-[3px] border-rp-rust', dot: 'bg-rp-rust', swatch: 'bg-rp-rust' },
    pink: { chip: 'bg-rp-rust/20 text-rp-ink border-l-[3px] border-rp-rust', dot: 'bg-rp-rust', swatch: 'bg-rp-rust' },
    purple: { chip: 'bg-rp-plum/20 text-rp-ink border-l-[3px] border-rp-plum', dot: 'bg-rp-plum', swatch: 'bg-rp-plum' },
    gray: { chip: 'bg-rp-line text-rp-ink border-l-[3px] border-rp-muted', dot: 'bg-rp-muted', swatch: 'bg-rp-muted' },
};

/** The pill for a trip item in a list: its leave type's tint when it has one, else its state. */
export const tripChip = (item: CalendarItem): string =>
    item.tint ? `${TINT[item.tint].chip}${item.state === 'past' ? ' opacity-60' : ''}` : STATE_CHIP[item.state];

/** Chip classes for an item. */
export const chipClass = (item: CalendarItem): string => {
    if (item.kind === 'holiday') return item.muted ? HOLIDAY_OFF_CHIP : HOLIDAY_CHIP;
    if (item.kind === 'event') return item.muted ? HOLIDAY_OFF_CHIP : EVENT_CHIP;
    return tripChip(item);
};

export const dotClass = (item: CalendarItem): string => {
    if (item.kind === 'holiday') return item.muted ? 'rounded-[2px] border border-rp-muted' : 'rounded-[2px] bg-rp-ochre';
    if (item.kind === 'event') return 'rounded-[2px] bg-rp-navy';
    return `rounded-full ${item.tint ? `${TINT[item.tint].dot}${item.state === 'past' ? ' opacity-50' : ''}` : STATE_DOT[item.state]}`;
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
