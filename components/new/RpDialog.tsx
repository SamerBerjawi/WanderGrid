import React, { useId, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import SmoothDrawer from '../kokonutui/smooth-drawer';
import { useOverlayA11y } from '../../hooks/useOverlayA11y';
import { useIsMobile } from './ui';
import { Warning, type Icon } from '../ui/hugeicons';
import { cn } from '../../utils/cn';
import './new.css';

export { dialogButton } from './dialogButton';

/**
 * The centred dialog of the New design language (UI_UX_DESIGN_REFERENCE.md §3.1, decision 176): a
 * blurred page behind (no dark dimming), a 22px-radius `rp-surface` card from tablet up, and a Smooth
 * Drawer on phones. It owns its `rp-root`, so it works above an old page as well as inside the New shell
 * (unlike `RpSheet`, which is positioned inside the shell). Escape closes it, focus is trapped and
 * returns to the trigger, and the page behind does not scroll. Used by ConfirmHost and the install help.
 */

export interface RpDialogProps {
    open: boolean;
    onClose: () => void;
    title: string;
    description?: ReactNode;
    /** A round icon beside the title on tablet and up. */
    icon?: Icon;
    tone?: 'default' | 'danger';
    /** `alertdialog` for a question that needs an answer (a confirm). */
    role?: 'dialog' | 'alertdialog';
    /** Body content, between the description and the actions (the details on phones). */
    children?: ReactNode;
    /** The inline footer: buttons, in DOM order Cancel then the primary one. */
    actions: ReactNode;
    /** Height of the phone sheet's peek in px (title, description and actions). */
    peekHeight?: number;
}

export const RpDialog: React.FC<RpDialogProps> = ({ open, onClose, title, description, icon, tone = 'default', role = 'dialog', children, actions, peekHeight = 220 }) => {
    const mobile = useIsMobile();
    const reduce = useReducedMotion();
    const panelRef = useRef<HTMLDivElement>(null);
    const titleId = useId();
    const descId = useId();
    useOverlayA11y(open && !mobile, panelRef, onClose);
    const IconC = icon ?? (tone === 'danger' ? Warning : undefined);

    if (mobile) {
        return (
            <SmoothDrawer
                open={open}
                onOpenChange={o => { if (!o) onClose(); }}
                title={title}
                description={description}
                action={<div className="flex flex-col-reverse gap-2 [&>*]:w-full">{actions}</div>}
                defaultExpanded
                peekHeight={peekHeight}
            >
                {children}
            </SmoothDrawer>
        );
    }

    return (
        <AnimatePresence>
            {open ? (
                <div className="rp-root fixed inset-0 z-modal flex items-center justify-center p-4 font-sans">
                    <motion.div
                        aria-hidden
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-rp-canvas/55 backdrop-blur-xl"
                    />
                    <motion.div
                        ref={panelRef}
                        role={role}
                        aria-modal="true"
                        aria-labelledby={titleId}
                        aria-describedby={description ? descId : undefined}
                        tabIndex={-1}
                        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={reduce ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.98 }}
                        transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                        className="relative flex w-full max-w-md flex-col gap-5 rounded-rp-tile bg-rp-surface p-6 text-rp-ink outline-none rp-shadow-float"
                    >
                        <div className="flex items-start gap-4">
                            {IconC ? (
                                <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-full', tone === 'danger' ? 'bg-rp-rust/15 text-rp-rust' : 'bg-rp-inset text-rp-ink')} aria-hidden>
                                    <IconC size={22} />
                                </span>
                            ) : null}
                            <div className="flex min-w-0 flex-col gap-1.5 pt-0.5">
                                <h2 id={titleId} className="text-xl font-medium tracking-tight">{title}</h2>
                                {description ? <div id={descId} className="text-sm leading-relaxed text-rp-muted">{description}</div> : null}
                            </div>
                        </div>
                        {children}
                        <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>
                    </motion.div>
                </div>
            ) : null}
        </AnimatePresence>
    );
};
