// In-app confirmation dialogs (UI-012): replaces window.confirm with the shared dialog (components/ConfirmHost.tsx).
//   if (!(await confirmDialog({ message: 'Delete this trip?', confirmLabel: 'Delete', danger: true }))) return;
export interface ConfirmRequest {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive: asks for the Hold Button instead of a plain confirm button, and focuses Cancel first. */
  danger?: boolean;
  /** Overrides the Hold Button (default: on when `danger`). */
  hold?: boolean;
}
export interface PendingConfirm extends ConfirmRequest {
  id: number;
  resolve: (ok: boolean) => void;
}

const CONFIRM_EVENT = 'wandergrid:confirm';
let nextId = 1;
let hostMounted = false;

export const markConfirmHostMounted = (mounted: boolean) => { hostMounted = mounted; };

export function confirmDialog(request: ConfirmRequest | string): Promise<boolean> {
  const req = typeof request === 'string' ? { message: request } : request;
  // No host mounted (the sign-in screens have none): answer "no", the safe side of a confirmation. Never a native dialog.
  if (!hostMounted || typeof window === 'undefined') return Promise.resolve(false);
  return new Promise((resolve) => {
    window.dispatchEvent(new CustomEvent<PendingConfirm>(CONFIRM_EVENT, { detail: { ...req, id: nextId++, resolve } }));
  });
}

export const subscribeToConfirms = (listener: (c: PendingConfirm) => void) => {
  const handler = (e: Event) => listener((e as CustomEvent<PendingConfirm>).detail);
  window.addEventListener(CONFIRM_EVENT, handler);
  return () => window.removeEventListener(CONFIRM_EVENT, handler);
};
