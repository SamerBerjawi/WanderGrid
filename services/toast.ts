// Minimal app-wide notification bus. `toast.error(...)` from anywhere; <Toaster /> renders them.
export type ToastKind = 'error' | 'success' | 'info';
export interface ToastMessage {
  id: number;
  kind: ToastKind;
  message: string;
}

const TOAST_EVENT = 'wandergrid:toast';
let nextId = 1;

const emit = (kind: ToastKind, message: string) => {
  try {
    window.dispatchEvent(new CustomEvent<ToastMessage>(TOAST_EVENT, { detail: { id: nextId++, kind, message } }));
  } catch (e) {}
};

export const toast = {
  error: (message: string) => emit('error', message),
  success: (message: string) => emit('success', message),
  info: (message: string) => emit('info', message),
};

export const subscribeToToasts = (listener: (t: ToastMessage) => void) => {
  const handler = (e: Event) => listener((e as CustomEvent<ToastMessage>).detail);
  window.addEventListener(TOAST_EVENT, handler);
  return () => window.removeEventListener(TOAST_EVENT, handler);
};

/** Human-readable text for an unknown error value. */
export const errorMessage = (err: unknown, fallback = 'Something went wrong.') => {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err) return err;
  return fallback;
};
