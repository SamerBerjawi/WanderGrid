import React, { ReactNode } from 'react';
import { clsx } from 'clsx';

/** Rounded sand text input with an optional label and trailing element (e.g. show/hide key). */
export const GhTextInput: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label?: string; trailing?: ReactNode; mono?: boolean }> = ({
  label, trailing, mono, className, ...rest
}) => (
  <label className="block text-left">
    {label && <span className="block text-xs font-bold uppercase tracking-wider text-sunset-ink/70 dark:text-white/70 mb-1.5 px-1">{label}</span>}
    <span className="relative block">
      <input
        {...rest}
        className={clsx(
          'w-full min-h-[48px] rounded-2xl px-4 text-base font-semibold bg-sunset-sand dark:bg-sunset-dusk text-sunset-ink dark:text-white',
          'placeholder:text-sunset-ink/40 dark:placeholder:text-white/40 outline-none focus:ring-2 focus:ring-sunset-coral',
          mono && 'font-mono', trailing && 'pr-14', className
        )}
      />
      {trailing && <span className="absolute right-1 top-1/2 -translate-y-1/2">{trailing}</span>}
    </span>
  </label>
);
