import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Plus } from '../../ui/hugeicons';

/**
 * The tray of widgets the person turned off (UI_UX_DESIGN_REFERENCE.md decision 320): it exists only while
 * the dashboard is in Edit mode, so outside it there is no heading, no space and no count. Each hidden widget
 * is a button that brings it back. With nothing hidden the tray renders nothing at all.
 */

export interface HiddenWidget { id: string; title: string }

const Tray: React.FC<{ widgets: HiddenWidget[]; onShow: (id: string) => void; returnFocusTo: () => HTMLElement | null }> = ({ widgets, onShow, returnFocusTo }) => {
    const ref = useRef<HTMLDivElement>(null);
    // If the tray is left (Edit mode ends, or the last chip is used) while focus is inside it, hand focus to the Edit button.
    useEffect(() => () => {
        if (document.activeElement === document.body || ref.current?.contains(document.activeElement)) returnFocusTo()?.focus({ preventScroll: true });
    }, [returnFocusTo]);

    const restore = (id: string, index: number) => {
        const siblings = ref.current ? Array.from(ref.current.querySelectorAll<HTMLElement>('button')) : [];
        const next = siblings[index + 1] ?? siblings[index - 1];
        onShow(id);
        // Chips re-render without the one restored: move focus to its neighbour before the button unmounts.
        if (next) next.focus({ preventScroll: true });
    };

    return (
        <div ref={ref} className="flex flex-wrap items-center gap-2" role="group" aria-label="Hidden widgets">
            <span className="text-sm text-rp-muted">Hidden</span>
            {widgets.map((w, i) => (
                <button key={w.id} type="button" onClick={() => restore(w.id, i)} aria-label={`Show ${w.title}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-rp-surface px-4 text-sm font-medium text-rp-ink outline-none rp-shadow-rest focus-visible:ring-2 focus-visible:ring-rp-muted">
                    <Plus size={14} aria-hidden />{w.title}
                </button>
            ))}
        </div>
    );
};

export const HiddenWidgets: React.FC<{ editing: boolean; widgets: HiddenWidget[]; onShow: (id: string) => void; returnFocusTo: () => HTMLElement | null }> = ({ editing, widgets, onShow, returnFocusTo }) => {
    const reduce = useReducedMotion();
    const open = editing && widgets.length > 0;
    return (
        <AnimatePresence initial={false}>
            {open ? (
                <motion.div
                    key="tray"
                    initial={reduce ? false : { height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { height: 0, opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    // The chips' ring and shadow would be clipped by the height animation, so the inner padding keeps them in (padding on the animated box itself would not collapse); the bottom padding is the gap to the grid.
                    className="-mx-1 -mt-1 overflow-hidden"
                >
                    <div className="px-1 pt-1 pb-6"><Tray widgets={widgets} onShow={onShow} returnFocusTo={returnFocusTo} /></div>
                </motion.div>
            ) : null}
        </AnimatePresence>
    );
};
