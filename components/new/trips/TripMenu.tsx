import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { DotsThreeOutline, type Icon } from '../../ui/hugeicons';
import { RpIconButton } from '../ui';
import { cn } from '../../../utils/cn';

export interface TripMenuItem {
    id: string;
    label: string;
    icon: Icon;
    onSelect: () => void;
    tone?: 'danger';
    /** Draws a divider above this item. */
    separated?: boolean;
}

const WIDTH = 232;

/**
 * The "···" menu on a trip. It is also the keyboard and plain-tap way to do everything a drag does
 * (Move to…, Archive). Rendered in a portal so scrolling columns never clip it.
 */
export const TripMenu: React.FC<{ label: string; items: TripMenuItem[]; triggerClassName?: string }> = ({ label, items, triggerClassName }) => {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const close = useCallback((returnFocus = true) => {
        setOpen(false);
        if (returnFocus) triggerRef.current?.focus();
    }, []);

    useLayoutEffect(() => {
        if (!open || !triggerRef.current) return;
        const r = triggerRef.current.getBoundingClientRect();
        const height = menuRef.current?.offsetHeight ?? items.length * 44 + 16;
        const left = Math.min(Math.max(8, r.right - WIDTH), window.innerWidth - WIDTH - 8);
        let top = r.bottom + 6;
        if (top + height > window.innerHeight - 8) top = Math.max(8, r.top - height - 6);
        setPos({ left, top });
    }, [open, items.length]);

    useEffect(() => {
        if (!open) return;
        menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
        const onDown = (e: PointerEvent) => {
            const t = e.target as Node;
            if (!menuRef.current?.contains(t) && !triggerRef.current?.contains(t)) close(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.preventDefault(); close(); return; }
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
            e.preventDefault();
            const els = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
            const at = els.indexOf(document.activeElement as HTMLElement);
            els[(at + (e.key === 'ArrowDown' ? 1 : -1) + els.length) % els.length]?.focus();
        };
        const onMove = () => close(false);
        document.addEventListener('pointerdown', onDown);
        window.addEventListener('keydown', onKey);
        window.addEventListener('resize', onMove);
        window.addEventListener('scroll', onMove, true);
        return () => {
            document.removeEventListener('pointerdown', onDown);
            window.removeEventListener('keydown', onKey);
            window.removeEventListener('resize', onMove);
            window.removeEventListener('scroll', onMove, true);
        };
    }, [open, close]);

    return (
        <>
            <RpIconButton
                ref={triggerRef}
                label={label}
                tone="ghost"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => { setPos(null); setOpen(o => !o); }}
                className={triggerClassName}
            >
                <DotsThreeOutline size={20} />
            </RpIconButton>
            {createPortal(
                <AnimatePresence>
                    {open ? (
                        <motion.div
                            ref={menuRef}
                            role="menu"
                            aria-label={label}
                            initial={{ opacity: 0, scale: 0.96 }}
                            animate={{ opacity: pos ? 1 : 0, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.96 }}
                            transition={{ duration: 0.14, ease: [0.23, 1, 0.32, 1] }}
                            style={{ position: 'fixed', left: pos?.left ?? 0, top: pos?.top ?? 0, width: WIDTH }}
                            className="rp-root z-popover origin-top-right rounded-rp-tile bg-rp-surface p-2 font-rp text-rp-ink rp-shadow-float"
                        >
                            {items.map(item => (
                                <React.Fragment key={item.id}>
                                    {item.separated ? <div className="my-1 h-px bg-rp-line" role="separator" /> : null}
                                    <button
                                        role="menuitem"
                                        type="button"
                                        onClick={() => { close(false); item.onSelect(); }}
                                        className={cn(
                                            'flex min-h-11 w-full items-center gap-3 rounded-[14px] px-3 text-sm outline-none hover:bg-rp-inset focus-visible:bg-rp-inset',
                                            item.tone === 'danger' ? 'text-rp-rust' : 'text-rp-ink'
                                        )}
                                    >
                                        <item.icon size={18} aria-hidden /> {item.label}
                                    </button>
                                </React.Fragment>
                            ))}
                        </motion.div>
                    ) : null}
                </AnimatePresence>,
                document.body
            )}
        </>
    );
};
