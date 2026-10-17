import React, { useEffect, useState } from 'react';
import { Modal } from './ui';
import { BTN_SECONDARY_STYLE } from '../constants';
import { GoldenConfirmActions, isGoldenHour } from './golden/GoldenDialog';
import { markConfirmHostMounted, subscribeToConfirms, PendingConfirm } from '../services/confirm';

/** Renders confirmDialog() requests one at a time in the shared Modal (focus trap, Escape = cancel). */
export const ConfirmHost: React.FC = () => {
  const [queue, setQueue] = useState<PendingConfirm[]>([]);
  useEffect(() => {
    markConfirmHostMounted(true);
    const off = subscribeToConfirms((c) => setQueue((q) => [...q, c]));
    return () => { off(); markConfirmHostMounted(false); };
  }, []);
  const current = queue[0];
  const settle = (ok: boolean) => {
    if (!current) return;
    current.resolve(ok);
    setQueue((q) => q.slice(1));
  };
  if (isGoldenHour()) {
    return (
      <Modal isOpen={!!current} onClose={() => settle(false)} title={current?.title || 'Please confirm'} icon={current?.danger ? 'warning' : 'help'} maxWidth="max-w-md"
        footerActions={<GoldenConfirmActions cancelLabel={current?.cancelLabel || 'Cancel'} confirmLabel={current?.confirmLabel || 'Confirm'} danger={current?.danger} onCancel={() => settle(false)} onConfirm={() => settle(true)} />}
      >
        <p className="text-base leading-relaxed text-left pb-2">{current?.message}</p>
      </Modal>
    );
  }
  return (
    <Modal isOpen={!!current} onClose={() => settle(false)} title={current?.title || 'Please confirm'} icon={current?.danger ? 'warning' : 'help'} maxWidth="max-w-md">
      <div className="space-y-6 text-left font-sans">
        <p className="text-sm text-light-text dark:text-dark-text leading-relaxed">{current?.message}</p>
        <div className="flex gap-3 justify-end pt-4 border-t border-black/10 dark:border-white/10 mt-6">
          <button type="button" onClick={() => settle(false)} className={`${BTN_SECONDARY_STYLE} px-4 py-2 text-xs font-bold uppercase`}>
            {current?.cancelLabel || 'Cancel'}
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => settle(true)}
            className={`min-h-[44px] px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border cursor-pointer ${current?.danger
              ? 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-800 dark:text-rose-300 border-rose-500/35'
              : 'bg-primary-500/15 hover:bg-primary-500/25 text-primary-900 dark:text-primary-300 border-primary-500/35'}`}
          >
            {current?.confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </Modal>
  );
};
