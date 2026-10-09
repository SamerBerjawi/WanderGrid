import React from 'react';
import { Check } from '@phosphor-icons/react';

export interface GlassSegmentedOption<T extends string = string> {
  id: T;
  label: string;
  icon?: React.ComponentType<{ className?: string; weight?: any; size?: number }>;
  description?: string;
  disabled?: boolean;
  accentColor?:
    | 'primary'
    | 'emerald'
    | 'amber'
    | 'rose'
    | 'sky'
    | 'indigo'
    | 'cyan'
    | 'purple';
}

export interface GlassSegmentedProps<T extends string = string> {
  options: GlassSegmentedOption<T>[];
  value: T | T[];
  onChange: (value: any) => void;
  isMulti?: boolean;
  columns?: number;
  showCheckOnSelected?: boolean;
  accentColor?:
    | 'primary'
    | 'emerald'
    | 'amber'
    | 'rose'
    | 'sky'
    | 'indigo'
    | 'cyan'
    | 'purple';
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
}

const SEGMENTED_ACCENTS = {
  primary: {
    active: 'bg-primary-500/15 dark:bg-primary-500/25 border-primary-500/40 dark:border-primary-400/50 text-primary-700 dark:text-primary-300 font-bold shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(234,88,12,0.15)]',
    icon: 'text-primary-600 dark:text-primary-400',
  },
  emerald: {
    active: 'bg-emerald-500/15 dark:bg-emerald-500/25 border-emerald-500/40 dark:border-emerald-400/50 text-emerald-700 dark:text-emerald-300 font-bold shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(16,185,129,0.15)]',
    icon: 'text-emerald-600 dark:text-emerald-400',
  },
  amber: {
    active: 'bg-amber-500/15 dark:bg-amber-500/25 border-amber-500/40 dark:border-amber-400/50 text-amber-700 dark:text-amber-300 font-bold shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(245,158,11,0.15)]',
    icon: 'text-amber-600 dark:text-amber-400',
  },
  rose: {
    active: 'bg-rose-500/15 dark:bg-rose-500/25 border-rose-500/40 dark:border-rose-400/50 text-rose-700 dark:text-rose-300 font-bold shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(244,63,94,0.15)]',
    icon: 'text-rose-600 dark:text-rose-400',
  },
  sky: {
    active: 'bg-sky-500/15 dark:bg-sky-500/25 border-sky-500/40 dark:border-sky-400/50 text-sky-700 dark:text-sky-300 font-bold shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(14,165,233,0.15)]',
    icon: 'text-sky-600 dark:text-sky-400',
  },
  indigo: {
    active: 'bg-indigo-500/15 dark:bg-indigo-500/25 border-indigo-500/40 dark:border-indigo-400/50 text-indigo-700 dark:text-indigo-300 font-bold shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(99,102,241,0.15)]',
    icon: 'text-indigo-600 dark:text-indigo-400',
  },
  cyan: {
    active: 'bg-cyan-500/15 dark:bg-cyan-500/25 border-cyan-500/40 dark:border-cyan-400/50 text-cyan-700 dark:text-cyan-300 font-bold shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(6,182,212,0.15)]',
    icon: 'text-cyan-600 dark:text-cyan-400',
  },
  purple: {
    active: 'bg-purple-500/15 dark:bg-purple-500/25 border-purple-500/40 dark:border-purple-400/50 text-purple-700 dark:text-purple-300 font-bold shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(168,85,247,0.15)]',
    icon: 'text-purple-600 dark:text-purple-400',
  },
};

export function GlassSegmented<T extends string = string>({
  options,
  value,
  onChange,
  isMulti = false,
  columns,
  showCheckOnSelected = false,
  accentColor = 'primary',
  className = '',
  ariaLabel,
  disabled = false,
}: GlassSegmentedProps<T>) {
  const isSelected = (id: T): boolean => {
    if (isMulti && Array.isArray(value)) {
      return value.includes(id);
    }
    return value === id;
  };

  const handleSelect = (id: T) => {
    if (disabled) return;
    if (isMulti) {
      const arr = Array.isArray(value) ? [...value] : [];
      if (arr.includes(id)) {
        onChange(arr.filter((item) => item !== id));
      } else {
        onChange([...arr, id]);
      }
    } else {
      onChange(id);
    }
  };

  // Determine grid columns or responsive flex wrap
  const gridClass = columns
    ? columns === 2
      ? 'grid grid-cols-2'
      : columns === 3
      ? 'grid grid-cols-3'
      : columns === 4
      ? 'grid grid-cols-2 sm:grid-cols-4'
      : `grid grid-cols-${columns}`
    : 'flex flex-wrap';

  return (
    <div
      role={isMulti ? 'group' : 'radiogroup'}
      aria-label={ariaLabel}
      className={`${gridClass} gap-1.5 w-full ${disabled ? 'opacity-50 pointer-events-none' : ''} ${className}`}
    >
      {options.map((option) => {
        const selected = isSelected(option.id);
        const IconComponent = option.icon;
        const optDisabled = disabled || option.disabled;
        const optAccent = SEGMENTED_ACCENTS[option.accentColor || accentColor || 'primary'] || SEGMENTED_ACCENTS.primary;

        return (
          <button
            key={option.id}
            type="button"
            role={isMulti ? 'button' : 'radio'}
            aria-checked={isMulti ? undefined : selected}
            aria-pressed={isMulti ? selected : undefined}
            disabled={optDisabled}
            onClick={() => handleSelect(option.id)}
            className={`min-h-[38px] px-2.5 py-1.5 rounded-xl border text-center transition-all duration-150 cursor-pointer select-none active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 flex items-center justify-center gap-1.5 ${
              gridClass.includes('flex') ? 'flex-1 min-w-[64px]' : 'w-full'
            } ${
              selected
                ? `${optAccent.active} wg-glass-surface`
                : 'bg-white/40 dark:bg-white/[0.04] border-black/5 dark:border-white/10 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text hover:border-black/15 dark:hover:border-white/20'
            }`}
          >
            {IconComponent && (
              <IconComponent
                className={`w-3.5 h-3.5 shrink-0 transition-colors duration-150 ${
                  selected ? optAccent.icon : 'text-light-text-secondary dark:text-dark-text-secondary'
                }`}
                weight={selected ? 'bold' : 'regular'}
              />
            )}
            <div className="flex flex-col items-center justify-center min-w-0">
              <span className="text-xs font-bold leading-tight truncate">{option.label}</span>
              {option.description && (
                <span className="text-3xs opacity-75 mt-0.5 leading-none truncate">{option.description}</span>
              )}
            </div>
            {showCheckOnSelected && selected && (
              <Check className={`w-3.5 h-3.5 shrink-0 ${optAccent.icon}`} weight="bold" />
            )}
          </button>
        );
      })}
    </div>
  );
}

export default GlassSegmented;
