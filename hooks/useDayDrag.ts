import { useCallback, useEffect, useRef, useState } from 'react';
import type { LeaveEntry } from '../types';
import { addDaysISO, daysBetween, orderedRange } from '../utils/calendarModel';

/**
 * Dragging on a day grid (leave Phase 2c), for a mouse or pen:
 * - press on a day and drag across others to pick a range, which opens new leave for those days;
 * - press on a leave bar the viewer may change and drag it to other days, which moves the leave.
 * A press that does not leave its day stays a plain click (it opens the day). Escape cancels. Touch keeps scrolling the
 * page; on a phone the leave sheet sets dates, and the keyboard has Shift + arrows (see MonthGrid).
 *
 * Cells carry `data-iso`; leave bars carry `data-leave-key` (the CalendarItem key).
 */

export type DayDrag =
    | { mode: 'select'; anchor: string; over: string }
    | { mode: 'move'; entry: LeaveEntry; anchor: string; over: string };

export interface DayDragOptions {
    enabled: boolean;
    onSelectRange?: (start: string, end: string) => void;
    onMoveLeave?: (entry: LeaveEntry, by: number) => void;
    /** The leave entry behind a bar's key, when the viewer may move it. */
    movable?: (key: string) => LeaveEntry | undefined;
}

/** The days to paint while dragging: the range picked, or where the moved leave would land. */
export const dragRange = (drag: DayDrag | null): { start: string; end: string; mode: DayDrag['mode'] } | null => {
    if (!drag) return null;
    if (drag.mode === 'select') {
        const [start, end] = orderedRange(drag.anchor, drag.over);
        return { start, end, mode: 'select' };
    }
    const by = daysBetween(drag.anchor, drag.over);
    return { start: addDaysISO(drag.entry.startDate, by), end: addDaysISO(drag.entry.endDate || drag.entry.startDate, by), mode: 'move' };
};

export const useDayDrag = ({ enabled, onSelectRange, onMoveLeave, movable }: DayDragOptions) => {
    const [drag, setDrag] = useState<DayDrag | null>(null);
    const current = useRef<DayDrag | null>(null);
    const suppressClick = useRef(false);
    const cleanup = useRef<(() => void) | null>(null);
    const latest = useRef({ onSelectRange, onMoveLeave });
    latest.current = { onSelectRange, onMoveLeave };

    useEffect(() => () => cleanup.current?.(), []);

    const onPointerDown = useCallback((e: React.PointerEvent) => {
        if (!enabled || e.button !== 0 || e.pointerType === 'touch') return;
        const target = e.target as HTMLElement;
        const cell = target.closest<HTMLElement>('[data-iso]');
        const iso = cell?.dataset.iso;
        if (!iso) return;
        const key = target.closest<HTMLElement>('[data-leave-key]')?.dataset.leaveKey;
        const entry = key && latest.current.onMoveLeave ? movable?.(key) : undefined;
        let start: DayDrag | null = null;
        if (entry) start = { mode: 'move', entry, anchor: iso, over: iso };
        else if (latest.current.onSelectRange) start = { mode: 'select', anchor: iso, over: iso };
        if (!start) return;
        current.current = start;

        const finish = (commit: boolean) => {
            cleanup.current?.();
            const done = current.current;
            current.current = null;
            setDrag(null);
            if (!commit || !done || done.over === done.anchor) return;
            // The click that follows the release must not also open a day.
            suppressClick.current = true;
            window.setTimeout(() => { suppressClick.current = false; }, 0);
            if (done.mode === 'select') {
                const [a, b] = orderedRange(done.anchor, done.over);
                latest.current.onSelectRange?.(a, b);
            } else {
                latest.current.onMoveLeave?.(done.entry, daysBetween(done.anchor, done.over));
            }
        };
        const move = (ev: PointerEvent) => {
            const over = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-iso]')?.dataset.iso;
            const now = current.current;
            if (!over || !now || over === now.over) return;
            current.current = { ...now, over };
            setDrag(current.current);
        };
        const up = () => finish(true);
        const cancel = () => finish(false);
        const key2 = (ev: KeyboardEvent) => { if (ev.key === 'Escape') finish(false); };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', cancel);
        window.addEventListener('keydown', key2);
        cleanup.current = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', cancel);
            window.removeEventListener('keydown', key2);
            cleanup.current = null;
        };
    }, [enabled, movable]);

    const onClickCapture = useCallback((e: React.MouseEvent) => {
        if (!suppressClick.current) return;
        e.stopPropagation();
        e.preventDefault();
    }, []);

    return { drag, range: dragRange(drag), onPointerDown, onClickCapture };
};
