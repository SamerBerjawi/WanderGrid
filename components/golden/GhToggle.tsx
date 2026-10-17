import React from 'react';
import { clsx } from 'clsx';

/** Big flat on/off switch. Coral when on, sand when off. 44px tall hit area. */
export const GhToggle: React.FC<{ checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean }> = ({ checked, onChange, label, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className="min-h-[44px] min-w-[64px] inline-flex items-center justify-center cursor-pointer disabled:opacity-50 shrink-0"
  >
    <span className={clsx('relative w-16 h-9 rounded-full transition-colors', checked ? 'bg-sunset-coral' : 'bg-sunset-sand dark:bg-sunset-dusk')}>
      <span className={clsx('absolute top-1 w-7 h-7 rounded-full bg-white shadow-card transition-all', checked ? 'left-8' : 'left-1')} />
    </span>
  </button>
);
