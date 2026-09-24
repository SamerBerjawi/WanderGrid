import React, { forwardRef, ReactNode } from 'react';
import GlassPanel from './GlassPanel';

export interface GlassInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  leftElement?: ReactNode;
  rightElement?: ReactNode;
  containerClassName?: string;
}

export const GlassInput = forwardRef<HTMLInputElement, GlassInputProps>(({
  label,
  error,
  leftElement,
  rightElement,
  className = '',
  containerClassName = '',
  disabled,
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
          <div className="flex items-center min-h-[44px] h-11 px-3.5 w-full gap-2">
            {leftElement && <span className="shrink-0 text-light-text-secondary dark:text-dark-text-secondary">{leftElement}</span>}
            <input
              ref={ref}
              disabled={disabled}
              className={`w-full bg-transparent text-xs font-bold text-light-text dark:text-dark-text placeholder-light-text-secondary/50 dark:placeholder-dark-text-secondary/50 focus:outline-none [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60 hover:[&::-webkit-calendar-picker-indicator]:opacity-100 dark:[&::-webkit-calendar-picker-indicator]:invert [&::-webkit-inner-spin-button]:cursor-pointer [&::-webkit-inner-spin-button]:opacity-50 hover:[&::-webkit-inner-spin-button]:opacity-90 ${className}`}
              {...props}
            />
            {rightElement && <span className="shrink-0 flex items-center">{rightElement}</span>}
          </div>
        </GlassPanel>
      </div>
      {error && <p className="text-2xs text-rose-500 font-bold ml-1">{error}</p>}
    </div>
  );
});

GlassInput.displayName = 'GlassInput';
export default GlassInput;
