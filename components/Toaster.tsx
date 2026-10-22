import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowUndo, Check, Info, Warning, X } from './ui/hugeicons';
import { getToasts, subscribeToastList, toast, type ToastMessage } from '../services/toast';
import { cn } from '../utils/cn';
import './new/new.css';

/**
 * The one toast host (UI_UX_DESIGN_REFERENCE.md §3.2, decision 175): an ink pill at the bottom with an
 * optional mustard Undo, fed by services/toast (and by useUndoToast in components/new/UndoToast.tsx, so
 * only one pill style ever appears). It carries its own `rp-root`, so it renders the same above the New
 * shell and above an old page. Up to three transient toasts stack; sticky ones (offline, update ready)
 * sit above them. A toast pauses while hovered or focused.
 */

const STYLE: Record<ToastMessage['kind'], { icon: typeof Info | null; chip: string }> = {
  success: { icon: Check, chip: 'bg-rp-green text-rp-paper' },
  error: { icon: Warning, chip: 'bg-rp-rust text-rp-paper' },
  info: { icon: null, chip: '' },
};

const ToastPill: React.FC<{ t: ToastMessage }> = ({ t }) => {
  const reduce = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const remaining = useRef(t.duration);
  const startedAt = useRef(0);
  const style = STYLE[t.kind];
  const dismiss = useCallback(() => toast.dismiss(t.id), [t.id]);

  useEffect(() => {
    if (!t.duration || paused) return;
    startedAt.current = Date.now();
    const timer = window.setTimeout(dismiss, remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(1200, remaining.current - (Date.now() - startedAt.current));
    };
  }, [t.duration, paused, dismiss]);

  const act = (run: () => void | Promise<void>) => { dismiss(); void run(); };
  const btn = 'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-medium outline-none transition-transform active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-rp-paper';

  return (
    <motion.div
      layout={!reduce}
      role={t.kind === 'error' ? 'alert' : 'status'}
      aria-live={t.kind === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.97 }}
      transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="pointer-events-auto flex min-h-14 w-fit max-w-full items-center gap-2 rounded-rp-card bg-rp-ink py-1.5 pr-1.5 pl-3 text-rp-on-ink rp-shadow-ink"
    >
      {style.icon ? (
        <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-full', style.chip)} aria-hidden>
          <style.icon size={14} />
        </span>
      ) : <span className="w-1" aria-hidden />}
      <span className="min-w-0 py-2 text-sm leading-snug break-words">{t.message}</span>
      {t.action ? (
        <button type="button" onClick={() => act(t.action!.onClick)} className={cn(btn, 'bg-rp-on-ink/15 text-rp-on-ink')}>
          {t.action.icon ? <t.action.icon size={16} aria-hidden /> : null}
          {t.action.label}
        </button>
      ) : null}
      {t.onUndo ? (
        <button type="button" onClick={() => act(t.onUndo!)} className={cn(btn, 'bg-rp-mustard text-rp-on-mustard')}>
          <ArrowUndo size={16} aria-hidden />
          Undo
        </button>
      ) : null}
      {!t.onUndo ? (
        <button
          type="button"
          onClick={() => { dismiss(); t.onDismiss?.(); }}
          aria-label="Dismiss notification"
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-rp-on-ink/80 outline-none transition-colors hover:bg-rp-on-ink/15 hover:text-rp-on-ink focus-visible:ring-2 focus-visible:ring-rp-paper"
        >
          <X size={16} aria-hidden />
        </button>
      ) : null}
    </motion.div>
  );
};

/** Renders the toast list from services/toast. Errors are announced at once (assertive); the rest politely. */
export const Toaster: React.FC = () => {
  const items = useSyncExternalStore(subscribeToastList, getToasts, getToasts);
  return (
    <div className="rp-root pointer-events-none fixed inset-x-0 bottom-[calc(96px+env(safe-area-inset-bottom,0px))] z-toast flex flex-col items-center gap-2 px-3 md:bottom-6">
      <AnimatePresence initial={false} mode="popLayout">
        {items.map((t) => <ToastPill key={t.id} t={t} />)}
      </AnimatePresence>
    </div>
  );
};
