import { useEffect } from 'react';

/**
 * True when Escape belongs to something inside the overlay rather than the overlay itself:
 * an open suggestion list already handled it, or focus is in a text field (Escape must never discard typed data).
 */
export function isEscapeForOverlay(e: KeyboardEvent): boolean {
    if (e.key !== 'Escape' || e.defaultPrevented) return false;
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|range|color)$/i.test((t as HTMLInputElement).type)))) return false;
    return true;
}

/** Close an overlay with Escape while it is open (UI-005: inline overlays lacked keyboard dismissal). */
export function useEscapeKey(active: boolean, onEscape: () => void) {
    useEffect(() => {
        if (!active) return;
        const handler = (e: KeyboardEvent) => {
            if (isEscapeForOverlay(e)) {
                e.stopPropagation();
                onEscape();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [active, onEscape]);
}
