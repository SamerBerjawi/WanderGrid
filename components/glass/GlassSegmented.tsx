import React from 'react';
import { Check } from '@phosphor-icons/react';

export interface GlassSegmentedOption<T extends string = string> {
  id: T;
  label: string;
  icon?: React.ComponentType<{ className?: string; weight?: any; size?: number }>;
  description?: string;
  disabled?: boolean;
}

export interface GlassSegmentedProps<T extends string = string> {
  options: GlassSegmentedOption<T>[];
  value: T | T[];
  onChange: (value: any) => void;
  isMulti?: boolean;
  columns?: number;
  showCheckOnSelected?: boolean;
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
}

export function GlassSegmented<T extends string = string>({
  options,
  value,
  onChange,
  isMulti = false,
  columns,
  showCheckOnSelected = false,
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

        return (
          <button
            key={option.id}
            type="button"
            role={isMulti ? 'button' : 'radio'}
            aria-checked={isMulti ? undefined : selected}
            aria-pressed={isMulti ? selected : undefined}
            disabled={optDisabled}
            onClick={() => handleSelect(option.id)}
            className={`min-h-[44px] px-3 py-2 rounded-xl border text-center transition-all duration-150 cursor-pointer select-none active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 flex items-center justify-center gap-2 ${
              gridClass.includes('flex') ? 'flex-1 min-w-[70px]' : 'w-full'
            } ${
              selected
                ? 'bg-primary-500/15 dark:bg-primary-500/25 border-primary-500/40 dark:border-primary-400/50 text-primary-700 dark:text-primary-300 font-bold shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(234,88,12,0.15)] wg-glass-surface'
                : 'bg-white/40 dark:bg-white/[0.04] border-black/5 dark:border-white/10 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text hover:border-black/15 dark:hover:border-white/20'
            }`}
          >
            {IconComponent && (
              <IconComponent
                className={`w-4 h-4 shrink-0 transition-colors duration-150 ${
                  selected ? 'text-primary-600 dark:text-primary-400' : 'text-light-text-secondary dark:text-dark-text-secondary'
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
              <Check className="w-3.5 h-3.5 shrink-0 text-primary-600 dark:text-primary-400" weight="bold" />
            )}
          </button>
        );
      })}
    </div>
  );
}

export default GlassSegmented;
