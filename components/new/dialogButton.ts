import { cn } from '../../utils/cn';

/** Pill buttons for a dialog's footer (44px, rp tokens). */
export const dialogButton = (kind: 'ghost' | 'primary') => cn(
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium outline-none transition-[background-color,transform] duration-150',
    'focus-visible:ring-2 focus-visible:ring-rp-muted focus-visible:ring-offset-2 focus-visible:ring-offset-rp-surface active:scale-[0.97]',
    kind === 'ghost' && 'bg-rp-inset text-rp-ink hover:bg-rp-line',
    kind === 'primary' && 'bg-rp-ink text-rp-on-ink hover:bg-rp-ink/90'
);
