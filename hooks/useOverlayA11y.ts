import { useEffect, useRef, type RefObject } from 'react';

/**
 * The accessibility basics every New overlay shares (UI_UX_DESIGN_REFERENCE.md §6): while `open`,
 *  - Escape calls `onClose` (and is not passed on, so an overlay underneath stays open),
 *  - Tab and Shift+Tab stay inside `containerRef` (`trap`, on for modal dialogs),
 *  - the page behind does not scroll (`lockScroll`),
 *  - focus moves in (an element marked `data-autofocus`, else the first control, else the container),
 *    and returns to what had it when the overlay opens.
 * Vaul drawers (Smooth Drawer, RpSheet on phones) already do all of this; use this hook for the rest.
 */

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

let scrollLocks = 0;
let savedOverflow = '';
const lockScroll = () => {
    if (scrollLocks++ === 0) {
        savedOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
    }
};
const unlockScroll = () => {
    if (--scrollLocks === 0) document.body.style.overflow = savedOverflow;
};

export interface OverlayA11yOptions {
    trap?: boolean;
    lockScroll?: boolean;
}

export const useOverlayA11y = (open: boolean, containerRef: RefObject<HTMLElement | null>, onClose: () => void, options: OverlayA11yOptions = {}) => {
    const { trap = true, lockScroll: lock = true } = options;
    const closeRef = useRef(onClose);
    closeRef.current = onClose;

    useEffect(() => {
        if (!open) return;
        const returnTo = document.activeElement as HTMLElement | null;
        if (lock) lockScroll();

        const focusables = () => Array.from(containerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(el => el.offsetParent !== null || el === document.activeElement);
        const raf = requestAnimationFrame(() => {
            const box = containerRef.current;
            if (!box || box.contains(document.activeElement)) return;
            (box.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0] ?? box).focus({ preventScroll: true });
        });

        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !e.defaultPrevented) {
                e.stopPropagation();
                e.preventDefault();
                closeRef.current();
                return;
            }
            if (!trap || e.key !== 'Tab') return;
            const items = focusables();
            const box = containerRef.current;
            if (!box) return;
            if (!items.length) { e.preventDefault(); box.focus(); return; }
            const first = items[0];
            const last = items[items.length - 1];
            const active = document.activeElement;
            if (e.shiftKey && (active === first || active === box || !box.contains(active))) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && (active === last || !box.contains(active))) { e.preventDefault(); first.focus(); }
        };
        // Capture, so Escape reaches the topmost overlay first and a sheet underneath does not also close.
        window.addEventListener('keydown', onKey, true);
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener('keydown', onKey, true);
            if (lock) unlockScroll();
            if (returnTo?.isConnected) returnTo.focus({ preventScroll: true });
        };
    }, [open, trap, lock, containerRef]);
};

let sheetsOpen = 0;
/**
 * Marks <html data-rp-sheet> while a bottom sheet is open on a phone, so the toast host moves to the top
 * instead of covering the sheet's buttons (components/Toaster.tsx).
 */
export const useSheetFlag = (open: boolean) => {
    useEffect(() => {
        if (!open) return;
        sheetsOpen++;
        document.documentElement.setAttribute('data-rp-sheet', '');
        return () => {
            if (--sheetsOpen === 0) document.documentElement.removeAttribute('data-rp-sheet');
        };
    }, [open]);
};
