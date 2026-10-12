// In-app confirmation dialogs (UI-012): replaces window.confirm with the shared, styled, accessible Modal.
//   if (!(await confirmDialog({ message: 'Delete this trip?', confirmLabel: 'Delete', danger: true }))) return;
export interface ConfirmRequest {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
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
  // Before the app shell (and its ConfirmHost) is mounted, fall back to the browser dialog.
  if (!hostMounted || typeof window === 'undefined') return Promise.resolve(window.confirm(req.message));
  return new Promise((resolve) => {
    window.dispatchEvent(new CustomEvent<PendingConfirm>(CONFIRM_EVENT, { detail: { ...req, id: nextId++, resolve } }));
  });
}

export const subscribeToConfirms = (listener: (c: PendingConfirm) => void) => {
  const handler = (e: Event) => listener((e as CustomEvent<PendingConfirm>).detail);
  window.addEventListener(CONFIRM_EVENT, handler);
  return () => window.removeEventListener(CONFIRM_EVENT, handler);
};
