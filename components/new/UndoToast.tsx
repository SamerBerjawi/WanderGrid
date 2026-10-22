import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowUndo, type Icon } from '../ui/hugeicons';
import { cn } from '../../utils/cn';

/**
 * The New pages' toast (UI_UX_DESIGN_REFERENCE.md §3.2): an ink pill at the bottom with a mustard
 * Undo. A reversible change is made at once and kept for a few seconds, so Undo can take it back.
 * `useUndoToast()` returns `show` and a `host` element to render once on the page.
 */

/** A second button before Undo, such as "Open" for what was just created. */
export interface UndoAction {
    label: string;
    icon?: Icon;
    onClick: () => void | Promise<void>;
}

interface UndoItem {
    id: number;
    message: string;
    onUndo: () => void | Promise<void>;
    duration: number;
    action?: UndoAction;
}

export const useUndoToast = () => {
    const [item, setItem] = useState<UndoItem | null>(null);
    const nextId = useRef(1);

    const show = useCallback((message: string, onUndo: () => void | Promise<void>, duration: number | { duration?: number; action?: UndoAction } = 6000) => {
        const opts = typeof duration === 'number' ? { duration } : duration;
        setItem({ id: nextId.current++, message, onUndo, duration: opts.duration ?? 6000, action: opts.action });
    }, []);
    const dismiss = useCallback(() => setItem(null), []);

    return { show, dismiss, host: <UndoToastHost item={item} onDismiss={dismiss} /> };
};

const UndoToastHost: React.FC<{ item: UndoItem | null; onDismiss: () => void }> = ({ item, onDismiss }) => {
    const reduce = useReducedMotion();
    const [paused, setPaused] = useState(false);

    useEffect(() => {
        if (!item || paused) return;
        const timer = window.setTimeout(onDismiss, item.duration);
        return () => window.clearTimeout(timer);
    }, [item, paused, onDismiss]);

    return (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(96px+env(safe-area-inset-bottom,0px))] z-toast flex justify-center px-3 md:bottom-6">
            <AnimatePresence>
                {item ? (
                    <motion.div
                        key={item.id}
                        role="status"
                        aria-live="polite"
                        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.97 }}
                        transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                        onPointerEnter={() => setPaused(true)}
                        onPointerLeave={() => setPaused(false)}
                        onFocus={() => setPaused(true)}
                        onBlur={() => setPaused(false)}
                        className={cn('rp-root pointer-events-auto flex max-w-md items-center gap-2 rounded-full bg-rp-ink py-1.5 pr-1.5 pl-5 text-rp-on-ink rp-shadow-float')}
                    >
                        <span className="min-w-0 truncate text-sm">{item.message}</span>
                        {item.action ? (
                            <button
                                type="button"
                                onClick={() => { const run = item.action!.onClick; onDismiss(); void run(); }}
                                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-rp-on-ink/15 px-4 text-sm font-medium text-rp-on-ink outline-none transition-transform active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-rp-paper"
                            >
                                {item.action.icon ? <item.action.icon size={16} aria-hidden /> : null}
                                {item.action.label}
                            </button>
                        ) : null}
                        <button
                            type="button"
                            onClick={() => { const undo = item.onUndo; onDismiss(); void undo(); }}
                            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-rp-mustard px-4 text-sm font-medium text-rp-on-mustard outline-none transition-transform active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-rp-paper"
                        >
                            <ArrowUndo size={16} aria-hidden />
                            Undo
                        </button>
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </div>
    );
};
