import React, { ReactNode } from 'react';
import GlassPanel from './GlassPanel';

export type ButtonAccentColor = 'primary' | 'emerald' | 'blue' | 'sky' | 'amber' | 'rose' | 'indigo' | string;

export interface GlassButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  children?: ReactNode;
  variant?: 'primary' | 'secondary' | 'pill' | 'ghost' | 'danger' | 'outline' | 'glass';
  color?: ButtonAccentColor;
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  isLoading?: boolean;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  overrides?: {
    borderRadius?: number;
    displacementScale?: number;
    blurAmount?: number;
    saturation?: number;
  };
}

export const GlassButton = React.forwardRef<HTMLButtonElement, GlassButtonProps>(({
  children,
  variant = 'secondary',
  color,
  size = 'md',
  icon,
  isLoading,
  disabled,
  onClick,
  className = '',
  overrides,
  type = 'button',
  ...props
}, ref) => {
  const sizePadding = {
    sm: '6px 14px',
    md: '10px 20px',
    lg: '14px 26px',
  }[size];

  const sizeRadius = {
    sm: 16,
    md: 20,
    lg: 24,
  }[size];

  const resolvedColor = color || 'primary';
  const colorClass = `wg-glass-pill-colored wg-glass-pill-${resolvedColor}`;

  const variantStyles = {
    primary: `${colorClass} text-white font-bold`,
    secondary: 'bg-black/5 dark:bg-white/5 text-light-text dark:text-dark-text font-bold hover:bg-black/10 dark:hover:bg-white/10',
    pill: 'text-light-text dark:text-dark-text font-semibold',
    ghost: 'bg-transparent text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text font-bold',
    danger: 'wg-glass-pill-colored wg-glass-pill-danger text-white font-bold',
    outline: 'bg-transparent border border-black/10 dark:border-white/10 text-light-text dark:text-dark-text font-bold',
    glass: 'bg-white/20 dark:bg-white/10 text-light-text dark:text-dark-text font-bold',
  }[variant] || 'text-light-text dark:text-dark-text font-bold';

  // Sanitize caller classes to strip any decorative border, background, shadow, padding, or rounded utilities
  // that could cause an unwanted second container or border shell around the inner glass pill.
  const filteredClassName = className
    .split(/\s+/)
    .filter(token => !/^(?:[\w-]+:)*(?:border$|border-[0-9]|border-black|border-white|rounded|bg-|shadow|p-|px-|py-|pt-|pb-|pl-|pr-|backdrop-blur)[^\s]*/.test(token))
    .join(' ');

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || isLoading}
      onClick={disabled || isLoading ? undefined : onClick}
      className={`inline-flex items-center justify-center p-0 m-0 border-0 bg-transparent shadow-none appearance-none outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:ring-offset-2 rounded-full transition-transform duration-180 ease-glass active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${filteredClassName}`.trim()}
      {...props}
    >
      <GlassPanel
        className={`wg-glass-pill ${variantStyles} ${filteredClassName.includes('w-full') ? 'w-full' : ''} ${filteredClassName.includes('flex-1') ? 'flex-1' : ''}`}
        padding={sizePadding}
        overrides={{
          borderRadius: overrides?.borderRadius ?? 9999,
          ...overrides,
        }}
      >
        <span className={`inline-flex items-center gap-2 justify-center leading-none text-xs uppercase tracking-wider font-sans select-none whitespace-nowrap ${variant === 'primary' || variant === 'danger' ? 'text-white' : ''}`}>
          {isLoading ? (
            <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
          ) : icon ? (
            <span className="inline-flex items-center justify-center text-sm leading-none shrink-0">{icon}</span>
          ) : null}
          {children && <span className="inline-flex items-center justify-center gap-2 leading-none whitespace-nowrap">{children}</span>}
        </span>
      </GlassPanel>
    </button>
  );
});
GlassButton.displayName = 'GlassButton';

export default GlassButton;
