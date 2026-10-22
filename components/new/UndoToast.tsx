import React, { useCallback, useRef } from 'react';
import { toast, type ToastAction } from '../../services/toast';

/**
 * The New pages' Undo toast (UI_UX_DESIGN_REFERENCE.md §3.2). A reversible change is made at once and
 * kept for a few seconds, so Undo can take it back. Since decision 175 this is a thin front for the shared
 * toast host (components/Toaster.tsx, mounted once by App), so a plain toast and an Undo toast are one
 * stack and one look. `host` is kept so pages that render it need no change; it renders nothing. The toast outlives the page that
 * raised it on purpose (§3.2: it persists across page changes).
 */

/** A second button before Undo, such as "Open" for what was just created. */
export type UndoAction = ToastAction;

export const useUndoToast = () => {
    const last = useRef<number | null>(null);

    const show = useCallback((message: string, onUndo: () => void | Promise<void>, duration: number | { duration?: number; action?: UndoAction } = 6000) => {
        const opts = typeof duration === 'number' ? { duration } : duration;
        last.current = toast.undo(message, onUndo, { duration: opts.duration ?? 6000, action: opts.action });
    }, []);
    const dismiss = useCallback(() => {
        if (last.current != null) toast.dismiss(last.current);
        last.current = null;
    }, []);
    return { show, dismiss, host: null as React.ReactNode };
};
