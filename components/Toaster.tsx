import React, { useEffect, useState } from 'react';
import { isGoldenHour } from './golden/GoldenDialog';
import { subscribeToToasts, ToastMessage } from '../services/toast';

const KIND_STYLE: Record<ToastMessage['kind'], string> = {
  error: 'bg-rose-600 text-white',
  success: 'bg-emerald-600 text-white',
  info: 'bg-slate-800 text-white dark:bg-white dark:text-slate-900',
};

const GH_TOAST: Record<ToastMessage['kind'], string> = {
  error: 'bg-sunset-coral text-white',
  success: 'bg-sunset-teal text-sunset-ink',
  info: 'bg-sunset-sun text-sunset-ink',
};
const GH_TOAST_GLYPH: Record<ToastMessage['kind'], string> = { error: '!', success: '✓', info: 'i' };

/** Renders toasts from services/toast. Errors are announced to screen readers immediately. */
export const Toaster: React.FC = () => {
  const [items, setItems] = useState<ToastMessage[]>([]);

  useEffect(() => subscribeToToasts((t) => {
    setItems((prev) => [...prev.filter((p) => p.message !== t.message), t].slice(-3));
    window.setTimeout(() => setItems((prev) => prev.filter((p) => p.id !== t.id)), t.kind === 'error' ? 8000 : 4000);
  }), []);

  if (isGoldenHour()) {
    return (
      <div className="fixed top-safe-offset left-1/2 -translate-x-1/2 z-toast flex flex-col items-center gap-2 w-[min(92vw,28rem)] pointer-events-none font-sans">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto w-full flex items-center justify-between gap-3 pl-3 pr-1 py-1 rounded-full shadow-card text-sm font-semibold animate-fadeIn ${GH_TOAST[t.kind]}`}
          >
            <span aria-hidden="true" className="w-8 h-8 rounded-full bg-white/90 text-sunset-ink flex items-center justify-center text-base font-black shrink-0">{GH_TOAST_GLYPH[t.kind]}</span>
            <span className="min-w-0 break-words flex-1 py-2">{t.message}</span>
            <button
              type="button"
              onClick={() => setItems((prev) => prev.filter((p) => p.id !== t.id))}
              className="shrink-0 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center cursor-pointer hover:bg-black/10"
              aria-label="Dismiss notification"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="fixed top-safe-offset left-1/2 -translate-x-1/2 z-toast flex flex-col items-center gap-2 w-[min(92vw,28rem)] pointer-events-none">
      {items.map((t) => (
        <div
          key={t.id}
          role={t.kind === 'error' ? 'alert' : 'status'}
          className={`pointer-events-auto w-full flex items-start justify-between gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm font-semibold ${KIND_STYLE[t.kind]}`}
        >
          <span className="min-w-0 break-words">{t.message}</span>
          <button
            type="button"
            onClick={() => setItems((prev) => prev.filter((p) => p.id !== t.id))}
            className="shrink-0 min-w-[44px] min-h-[44px] -my-3 -mr-3 flex items-center justify-center opacity-80 hover:opacity-100 cursor-pointer"
            aria-label="Dismiss notification"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
};
