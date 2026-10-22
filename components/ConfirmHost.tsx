import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { markConfirmHostMounted, subscribeToConfirms, PendingConfirm } from '../services/confirm';

// The dialog, Vaul and the Hold Button load with the first confirmation, not with the app.
const ConfirmDialog = lazy(() => import('./new/ConfirmDialog'));

/**
 * Renders confirmDialog() requests one at a time (decision 176): a centred dialog from tablet up and a
 * Smooth Drawer on phones (components/new/RpDialog.tsx, which carries its own `rp-root`, so it also
 * works above an old page). A destructive request (`danger`) asks for the Hold Button (decision 9) and
 * focuses Cancel first; an ordinary one is a plain Cancel / Confirm pill pair. Escape cancels.
 */
export const ConfirmHost: React.FC = () => {
  const [queue, setQueue] = useState<PendingConfirm[]>([]);
  // Keep the last request while the dialog animates out, so its text does not vanish mid-fade.
  const [shown, setShown] = useState<PendingConfirm | null>(null);
  const pending = useRef<PendingConfirm[]>([]);
  pending.current = queue;
  useEffect(() => {
    markConfirmHostMounted(true);
    const off = subscribeToConfirms((c) => setQueue((q) => [...q, c]));
    // If the host goes away (the app swaps shells), answer "no" to what is still open rather than leave it hanging.
    return () => { off(); markConfirmHostMounted(false); pending.current.forEach((c) => c.resolve(false)); };
  }, []);
  const current = queue[0];
  useEffect(() => { if (current) setShown(current); }, [current]);
  const view = current ?? shown;

  const settle = (ok: boolean) => {
    if (!current) return;
    current.resolve(ok);
    setQueue((q) => q.slice(1));
  };

  if (!view) return null;
  return (
    <Suspense fallback={null}>
      <ConfirmDialog open={!!current} request={view} onSettle={settle} />
    </Suspense>
  );
};
