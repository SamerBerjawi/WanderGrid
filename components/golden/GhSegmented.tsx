import React from 'react';
import { clsx } from 'clsx';

export interface GhSegmentedOption<T extends string> { value: T; label: string; hint?: string; icon?: React.ReactNode }

/** Pill-shaped single choice control. `wrap` lets many options flow onto several rows. */
export function GhSegmented<T extends string>({ options, value, onChange, label, wrap, fill }: {
  options: GhSegmentedOption<T>[]; value: T; onChange: (v: T) => void; label: string; wrap?: boolean; fill?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={clsx('gap-1 p-1 rounded-3xl bg-sunset-sand dark:bg-sunset-dusk', wrap ? 'grid grid-cols-2' : fill ? 'flex w-full' : 'inline-flex max-w-full overflow-x-auto no-scrollbar')}>
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            fill && 'flex-1', 'min-h-[44px] px-4 rounded-full text-sm font-semibold whitespace-nowrap cursor-pointer transition-colors inline-flex items-center justify-center gap-2',
            value === o.value ? 'bg-sunset-coral text-white shadow-card' : 'text-sunset-ink dark:text-white/80'
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}
