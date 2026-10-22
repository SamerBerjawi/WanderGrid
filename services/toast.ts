// App-wide notification store. `toast.error(...)` from anywhere; <Toaster /> renders the list.
// The list lives here (not in the component), so a toast survives the host being remounted when the
// app swaps between the New shell, an old page and the sign-in screen.
import type { Icon } from '../components/ui/hugeicons';

export type ToastKind = 'error' | 'success' | 'info';

/** A button on the toast, shown before Undo (for example "Open"). */
export interface ToastAction {
  label: string;
  icon?: Icon;
  onClick: () => void | Promise<void>;
}

export interface ToastOptions {
  /** Milliseconds before it goes away (default 6000, 8000 for errors). 0 keeps it until dismissed. */
  duration?: number;
  /** Replaces an earlier toast with the same key instead of stacking, and lets `toast.dismiss(key)` remove it. */
  key?: string;
  /** Kept above the transient toasts and outside the stack limit (offline, update ready). Never times out. */
  sticky?: boolean;
  action?: ToastAction;
  /** Called when the person closes the toast with its ✕ (not when it times out or an action is used). */
  onDismiss?: () => void;
}

export interface ToastMessage {
  id: number;
  kind: ToastKind;
  message: string;
  key?: string;
  duration: number;
  sticky: boolean;
  action?: ToastAction;
  onDismiss?: () => void;
  /** Present for an undo toast: shows the mustard Undo button. */
  onUndo?: () => void | Promise<void>;
}

const DEFAULT_MS = 6000;
const ERROR_MS = 8000;
export const MAX_TRANSIENT_TOASTS = 3;

let nextId = 1;
let items: ToastMessage[] = [];
const listeners = new Set<() => void>();
const newListeners = new Set<(t: ToastMessage) => void>();

const publish = (next: ToastMessage[]) => {
  items = next;
  listeners.forEach((l) => l());
};

const push = (kind: ToastKind, message: string, opts: ToastOptions = {}, onUndo?: ToastMessage['onUndo']): number => {
  const id = nextId++;
  const sticky = !!opts.sticky;
  const t: ToastMessage = {
    id,
    kind,
    message,
    key: opts.key,
    sticky,
    duration: sticky ? 0 : opts.duration ?? (kind === 'error' ? ERROR_MS : DEFAULT_MS),
    action: opts.action,
    onDismiss: opts.onDismiss,
    onUndo,
  };
  // Same key, or the same plain message (no buttons), replaces the earlier one rather than stacking.
  const plain = !onUndo && !opts.action;
  const kept = items.filter((p) => (t.key ? p.key !== t.key : !(plain && !p.onUndo && !p.action && p.message === message)));
  const sticks = kept.filter((p) => p.sticky);
  const transient = kept.filter((p) => !p.sticky);
  publish([
    ...(sticky ? [...sticks, t] : sticks),
    ...(sticky ? transient : [...transient.slice(-(MAX_TRANSIENT_TOASTS - 1)), t]),
  ]);
  newListeners.forEach((l) => l(t));
  return id;
};

export const toast = {
  error: (message: string, opts?: ToastOptions) => push('error', message, opts),
  success: (message: string, opts?: ToastOptions) => push('success', message, opts),
  info: (message: string, opts?: ToastOptions) => push('info', message, opts),
  /** A change that was made at once and can be taken back: an ink pill with a mustard Undo. */
  undo: (message: string, onUndo: () => void | Promise<void>, opts?: ToastOptions) => push('info', message, opts, onUndo),
  /** Removes a toast by the id returned from a call, or by its `key`. */
  dismiss: (idOrKey: number | string) => publish(items.filter((p) => (typeof idOrKey === 'number' ? p.id !== idOrKey : p.key !== idOrKey))),
};

/** For useSyncExternalStore. The array identity only changes when the list does. */
export const getToasts = () => items;
export const subscribeToastList = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

/** Called for every new toast (kept for callers that want to react to one, such as tests). */
export const subscribeToToasts = (listener: (t: ToastMessage) => void) => {
  newListeners.add(listener);
  return () => { newListeners.delete(listener); };
};

/** Human-readable text for an unknown error value. */
export const errorMessage = (err: unknown, fallback = 'Something went wrong.') => {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err) return err;
  return fallback;
};
