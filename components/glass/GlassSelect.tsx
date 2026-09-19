import React, { forwardRef, ReactNode } from 'react';
import GlassPanel from './GlassPanel';
import { CaretDown } from '@phosphor-icons/react';

export interface GlassSelectOption {
  value: string;
  label: string;
}

export interface GlassSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options?: GlassSelectOption[];
  error?: string;
  leftElement?: ReactNode;
  containerClassName?: string;
  children?: ReactNode;
}

export const GlassSelect = forwardRef<HTMLSelectElement, GlassSelectProps>(({
  label,
  options,
  error,
  leftElement,
  className = '',
  containerClassName = '',
  disabled,
  children,
  ...props
}, ref) => {
  return (
    <div className={`flex flex-col gap-1.5 w-full ${containerClassName}`}>
      {label && (
        <label className="block text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
          {label}
        </label>
      )}
      <div className="relative group w-full">
        <GlassPanel
          className={`wg-glass-pill w-full transition-all duration-200 ${
            error 
              ? '!border-rose-500 ring-2 ring-rose-500/20' 
              : 'border-black/10 dark:border-white/10 group-focus-within:border-primary-500 group-focus-within:ring-2 group-focus-within:ring-primary-500/25'
          } ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
          padding="0px"
          overrides={{ borderRadius: 16 }}
        >
          <div className="flex items-center min-h-[44px] h-11 px-3.5 w-full gap-2 relative">
            {leftElement && <span className="shrink-0 text-light-text-secondary dark:text-dark-text-secondary">{leftElement}</span>}
            <select
              ref={ref}
              disabled={disabled}
              className={`w-full bg-transparent text-xs font-bold text-light-text dark:text-dark-text focus:outline-none appearance-none cursor-pointer pr-7 py-2.5 ${className}`}
              {...props}
            >
              {options 
                ? options.map(opt => (
                    <option key={opt.value} value={opt.value} className="bg-white dark:bg-dark-card text-light-text dark:text-dark-text font-bold">
                      {opt.label}
                    </option>
                  ))
                : children
              }
            </select>
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-light-text-secondary dark:text-dark-text-secondary opacity-70">
              <CaretDown className="w-3.5 h-3.5" weight="bold" />
            </div>
          </div>
        </GlassPanel>
      </div>
      {error && <p className="text-2xs text-rose-500 font-bold ml-1">{error}</p>}
    </div>
  );
});

GlassSelect.displayName = 'GlassSelect';
export default GlassSelect;
