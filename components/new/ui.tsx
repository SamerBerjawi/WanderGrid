import React, { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Drawer } from 'vaul';
import { X, type Icon } from '../ui/hugeicons';
import type { Carrier } from '../../types';
import { carrierLogoSources } from '../../utils/carrierLogo';
import { cn } from '../../utils/cn';
import { useSheetFlag } from '../../hooks/useOverlayA11y';

/**
 * Small building blocks shared by the New pages (UI_UX_DESIGN_REFERENCE.md §1–§3). KokonutUI
 * components are used first; these cover the gaps: icon buttons, toggles, sliders, chips, rows
 * and the side/bottom sheet.
 */

/** True below the tablet breakpoint (768px), where sheets become bottom sheets. */
export const useIsMobile = () => {
    const query = '(max-width: 767px)';
    const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
    useEffect(() => {
        const mq = window.matchMedia(query);
        const sync = () => setMobile(mq.matches);
        mq.addEventListener('change', sync);
        return () => mq.removeEventListener('change', sync);
    }, []);
    return mobile;
};

type IconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
    label: string;
    tone?: 'surface' | 'ink' | 'ghost';
    pressed?: boolean;
};

/** A 44px circular icon button with a required accessible name. */
export const RpIconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function RpIconButton(
    { label, tone = 'surface', pressed, className, children, ...rest },
    ref
) {
    return (
        <button
            ref={ref}
            type="button"
            aria-label={label}
            title={label}
            aria-pressed={pressed}
            className={cn(
                'inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors duration-150',
                'outline-none focus-visible:ring-2 focus-visible:ring-rp-muted focus-visible:ring-offset-2 focus-visible:ring-offset-rp-canvas',
                'active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40',
                tone === 'surface' && 'bg-rp-surface text-rp-ink hover:bg-rp-inset rp-shadow-rest',
                tone === 'ink' && 'bg-rp-ink text-rp-on-ink hover:bg-rp-ink/90',
                tone === 'ghost' && 'text-rp-ink hover:bg-rp-inset',
                pressed && tone !== 'ink' && 'bg-rp-ink text-rp-on-ink hover:bg-rp-ink/90',
                className
            )}
            {...rest}
        >
            {children}
        </button>
    );
});

/** A labelled on/off switch row (role="switch"), 44px tall. */
export const RpToggle: React.FC<{
    label: string;
    hint?: string;
    icon?: Icon;
    checked: boolean;
    onChange: (next: boolean) => void;
    disabled?: boolean;
}> = ({ label, hint, icon: IconC, checked, onChange, disabled }) => {
    const id = useId();
    return (
        <div className={cn('flex min-h-11 items-center justify-between gap-3', disabled && 'opacity-50')}>
            <label htmlFor={id} className="flex min-w-0 items-center gap-3">
                {IconC ? <IconC size={18} className="shrink-0 text-rp-muted" aria-hidden /> : null}
                <span className="flex min-w-0 flex-col">
                    <span className="text-sm font-medium text-rp-ink">{label}</span>
                    {hint ? <span className="text-xs text-rp-muted">{hint}</span> : null}
                </span>
            </label>
            <button
                id={id}
                type="button"
                role="switch"
                aria-checked={checked}
                disabled={disabled}
                onClick={() => onChange(!checked)}
                className={cn(
                    'relative inline-flex h-11 w-14 shrink-0 items-center rounded-full outline-none',
                    'focus-visible:ring-2 focus-visible:ring-rp-muted focus-visible:ring-offset-2 focus-visible:ring-offset-rp-surface'
                )}
            >
                <span className={cn('absolute inset-x-0 top-1/2 h-7 -translate-y-1/2 rounded-full transition-colors duration-200', checked ? 'bg-rp-green' : 'bg-rp-line')} />
                <span
                    className={cn(
                        'relative ml-1 size-5 rounded-full bg-rp-surface rp-shadow-raised transition-transform duration-200',
                        checked ? 'translate-x-7' : 'translate-x-0'
                    )}
                />
            </button>
        </div>
    );
};

/** A labelled range slider that shows its value. */
export const RpSlider: React.FC<{
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (v: number) => void;
    format?: (v: number) => string;
}> = ({ label, value, min, max, step, onChange, format }) => {
    const id = useId();
    return (
        <div className="flex flex-col gap-1 py-1">
            <div className="flex items-center justify-between">
                <label htmlFor={id} className="text-xs text-rp-muted">{label}</label>
                <span className="rp-tabular text-xs font-medium text-rp-ink">{format ? format(value) : value}</span>
            </div>
            <input
                id={id}
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={e => onChange(Number(e.target.value))}
                className="h-11 w-full cursor-pointer accent-rp-ink"
            />
        </div>
    );
};

/** A toggle chip (aria-pressed); the selected chip is ink. */
export const RpChip: React.FC<{
    selected: boolean;
    onClick: () => void;
    children: ReactNode;
    className?: string;
}> = ({ selected, onClick, children, className }) => (
    <button
        type="button"
        aria-pressed={selected}
        onClick={onClick}
        className={cn(
            'inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors duration-150',
            'outline-none focus-visible:ring-2 focus-visible:ring-rp-muted focus-visible:ring-offset-2 focus-visible:ring-offset-rp-surface',
            selected ? 'bg-rp-ink text-rp-on-ink' : 'bg-rp-inset text-rp-ink hover:bg-rp-line',
            className
        )}
    >
        {children}
    </button>
);

/** A titled group inside a sheet: a muted heading over an inset panel. */
export const RpSection: React.FC<{ title: string; icon?: Icon; children: ReactNode; action?: ReactNode }> = ({ title, icon: IconC, children, action }) => (
    <section className="flex flex-col gap-2">
        <div className="flex min-h-6 items-center justify-between px-1">
            <h3 className="flex items-center gap-1.5 text-xs font-medium text-rp-muted">
                {IconC ? <IconC size={14} aria-hidden /> : null}
                {title}
            </h3>
            {action}
        </div>
        <div className="flex flex-col gap-1 rounded-rp-inset bg-rp-inset/60 px-4 py-2">{children}</div>
    </section>
);

/** A label on the left with any control on the right. */
export const RpRow: React.FC<{ label: string; hint?: string; icon?: Icon; children: ReactNode }> = ({ label, hint, icon: IconC, children }) => (
    <div className="flex min-h-11 flex-col items-stretch gap-2 py-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="flex min-w-0 items-center gap-3">
            {IconC ? <IconC size={18} className="shrink-0 text-rp-muted" aria-hidden /> : null}
            <span className="flex min-w-0 flex-col">
                <span className="text-sm font-medium text-rp-ink">{label}</span>
                {hint ? <span className="text-xs text-rp-muted">{hint}</span> : null}
            </span>
        </div>
        {children}
    </div>
);

export interface RpSheetProps {
    open: boolean;
    onClose: () => void;
    title: string;
    subtitle?: ReactNode;
    children: ReactNode;
    footer?: ReactNode;
    /** Desktop panel width in px. */
    width?: number;
    /** Distance from the top on desktop, to clear a header. */
    topOffset?: number;
    /**
     * Phone only: trap focus, lock page scroll and blur the page behind (Vaul's modal mode). Off by default,
     * so a map stays explorable behind a settings sheet; the shell's More and Quick actions sheets turn it on.
     */
    modal?: boolean;
}

/**
 * Settings and detail panel. Desktop: a floating panel on the right that leaves the page usable
 * (non-modal, so the map can still be explored while it is open). Mobile: a Vaul bottom sheet with
 * snap points. Escape closes both; focus moves into the panel and returns to the trigger.
 */
export const RpSheet: React.FC<RpSheetProps> = ({ open, onClose, title, subtitle, children, footer, width = 400, topOffset = 12, modal = false }) => {
    const mobile = useIsMobile();
    const reduce = useReducedMotion();
    const panelRef = useRef<HTMLDivElement>(null);
    const returnFocus = useRef<HTMLElement | null>(null);
    const titleId = useId();
    useSheetFlag(open && mobile);
    const drawerRef = useRef<HTMLDivElement>(null);
    // Vaul's modal mode traps focus but leaves it on the trigger until the first Tab; start inside the sheet and return to the trigger on close.
    useEffect(() => {
        if (!open || !mobile || !modal) return;
        const trigger = document.activeElement as HTMLElement | null;
        const id = requestAnimationFrame(() => drawerRef.current?.focus({ preventScroll: true }));
        return () => {
            cancelAnimationFrame(id);
            // There is no Vaul trigger to return to (the sheet is opened from outside): give focus back by hand.
            requestAnimationFrame(() => { if (trigger?.isConnected) trigger.focus({ preventScroll: true }); });
        };
    }, [open, mobile, modal]);

    useEffect(() => {
        if (!open || mobile) return;
        returnFocus.current = document.activeElement as HTMLElement | null;
        // Keep focus that is already inside the panel (an autofocused field); otherwise focus the panel.
        const id = requestAnimationFrame(() => {
            if (!panelRef.current?.contains(document.activeElement)) panelRef.current?.focus();
        });
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !e.defaultPrevented) onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => {
            cancelAnimationFrame(id);
            window.removeEventListener('keydown', onKey);
            if (returnFocus.current?.isConnected) returnFocus.current.focus();
        };
    }, [open, mobile, onClose]);

    if (mobile) {
        return (
            <Drawer.Root open={open} onOpenChange={o => { if (!o) onClose(); }} modal={modal}>
                <Drawer.Portal>
                    {modal ? <Drawer.Overlay className="rp-root fixed inset-0 z-modal-backdrop bg-rp-canvas/50 backdrop-blur-xl" /> : null}
                    <Drawer.Content
                        ref={drawerRef}
                        className="rp-root fixed inset-x-0 bottom-0 z-modal flex max-h-[92dvh] flex-col rounded-t-rp-card bg-rp-surface rp-shadow-float outline-none"
                        aria-describedby={undefined}
                    >
                        <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-rp-line" aria-hidden />
                        <div className="flex items-start justify-between gap-3 px-5 pt-3 pb-2">
                            <div className="min-w-0">
                                <Drawer.Title className="text-lg font-medium text-rp-ink">{title}</Drawer.Title>
                                {subtitle ? <div className="text-sm text-rp-muted">{subtitle}</div> : null}
                            </div>
                            <RpIconButton label="Close" tone="ghost" onClick={onClose}><X size={20} /></RpIconButton>
                        </div>
                        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]" data-vaul-no-drag>
                            {children}
                            {footer ? <div className="mt-6 flex items-center justify-between gap-3 border-t border-rp-line pt-4">{footer}</div> : null}
                        </div>
                    </Drawer.Content>
                </Drawer.Portal>
            </Drawer.Root>
        );
    }

    return (
        <AnimatePresence>
            {open ? (
                <motion.div
                    ref={panelRef}
                    key="sheet"
                    role="dialog"
                    aria-modal="false"
                    aria-labelledby={titleId}
                    tabIndex={-1}
                    initial={reduce ? { opacity: 0 } : { opacity: 0, x: 32 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, x: 32 }}
                    transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
                    style={{ width, top: topOffset }}
                    className="absolute right-3 bottom-3 z-modal flex flex-col overflow-hidden rounded-rp-card bg-rp-surface rp-shadow-float outline-none"
                >
                    <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-3">
                        <div className="min-w-0">
                            <h2 id={titleId} className="text-lg font-medium text-rp-ink">{title}</h2>
                            {subtitle ? <div className="text-sm text-rp-muted">{subtitle}</div> : null}
                        </div>
                        <RpIconButton label="Close" tone="ghost" onClick={onClose} className="-mr-2 -mt-1"><X size={20} /></RpIconButton>
                    </div>
                    <div className="custom-scrollbar flex-1 overflow-y-auto px-6 pb-6">
                        {children}
                        {footer ? <div className="mt-6 flex items-center justify-between gap-3 border-t border-rp-line pt-4">{footer}</div> : null}
                    </div>
                </motion.div>
            ) : null}
        </AnimatePresence>
    );
};

/** Shared empty state for New pages: a short line and an optional action. */
export const RpEmpty: React.FC<{ title: string; children?: ReactNode; action?: ReactNode }> = ({ title, children, action }) => (
    <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
        <p className="text-base font-medium text-rp-ink">{title}</p>
        {children ? <p className="max-w-xs text-sm text-rp-muted">{children}</p> : null}
        {action ? <div className="mt-2">{action}</div> : null}
    </div>
);

/**
 * A carrier or operator logo on a white chip (logos are drawn for light backgrounds), trying each
 * source in turn and falling back to an icon.
 */
export const RpLogo: React.FC<{
    name?: string;
    brandfetchApiKey?: string;
    carriers?: Carrier[];
    /** A logo URL saved with the record; tried first. */
    src?: string;
    /** Shown when no logo is found: the mode or type icon. */
    fallback: Icon;
    /** Colour of that icon (default muted), e.g. an accent for transport or stays. */
    iconClassName?: string;
    size?: 'sm' | 'md';
    className?: string;
}> = ({ name, brandfetchApiKey, carriers, src: saved, fallback: Fallback, iconClassName, size = 'md', className }) => {
    const sources = React.useMemo(
        () => [...(saved ? [saved] : []), ...carrierLogoSources(name, brandfetchApiKey, carriers)],
        [saved, name, brandfetchApiKey, carriers]
    );
    const [attempt, setAttempt] = useState(0);
    useEffect(() => setAttempt(0), [sources]);
    const src = sources[attempt];
    return (
        <span className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-white', size === 'sm' ? 'size-7' : 'size-9', className)}>
            {src ? (
                <img
                    src={src}
                    alt={name ? `${name} logo` : ''}
                    className="h-full w-full object-contain"
                    referrerPolicy="no-referrer"
                    onError={() => setAttempt(a => a + 1)}
                    // The favicon service answers an unknown site with a 16px globe: that is "no logo", so use the icon.
                    onLoad={e => { if (src.includes('google.com/s2/favicons') && e.currentTarget.naturalWidth <= 32) setAttempt(a => a + 1); }}
                />
            ) : (
                <Fallback size={size === 'sm' ? 14 : 16} className={cn('text-rp-muted', iconClassName)} aria-hidden />
            )}
        </span>
    );
};

/**
 * The "+N more" / "Show fewer" toggle that reveals the rest of a capped list in place (decision 321). A real
 * button: 44px tall, aria-expanded, aria-controls (the id of the revealed region), visible focus ring. The
 * visible text is "+N more"; a screen reader hears it with the noun ("+5 more stamps").
 */
export const RpMoreButton: React.FC<{ count: number; noun: string; expanded: boolean; onToggle: () => void; controls: string; className?: string }> = ({ count, noun, expanded, onToggle, controls, className }) => (
    <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={controls}
        className={cn('rp-tabular -ml-3 inline-flex min-h-11 items-center self-start rounded-full px-3 text-sm font-medium text-rp-muted outline-none hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted', className)}
    >
        {expanded ? 'Show fewer' : <>+{count} more<span className="sr-only"> {noun}</span></>}
    </button>
);
