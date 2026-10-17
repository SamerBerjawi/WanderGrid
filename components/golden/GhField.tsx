import React from 'react';
import { clsx } from 'clsx';

/** Flat labelled text input for Golden Hour forms: sand fill, rounded, no border. */
export const GhField: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label: string }> = ({ label, className, id, name, ...rest }) => {
  const fieldId = id || `gh-${name}`;
  return (
    <label htmlFor={fieldId} className="block text-left">
      <span className="block text-xs font-bold uppercase tracking-wider text-sunset-ink/70 dark:text-white/70 mb-1.5 px-1">{label}</span>
      <input
        id={fieldId}
        name={name}
        {...rest}
        className={clsx(
          'w-full min-h-[48px] rounded-2xl px-4 text-base font-semibold bg-sunset-sand dark:bg-sunset-dusk text-sunset-ink dark:text-white',
          'placeholder:text-sunset-ink/40 dark:placeholder:text-white/40 outline-none focus:ring-2 focus:ring-sunset-coral',
          className
        )}
      />
    </label>
  );
};
