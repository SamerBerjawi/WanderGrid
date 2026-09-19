import React, { ReactNode } from 'react';
import GlassPanel from './GlassPanel';

export interface GlassButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  children?: ReactNode;
  variant?: 'primary' | 'secondary' | 'pill' | 'ghost' | 'danger' | 'outline' | 'glass';
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

  const variantStyles = {
    primary: 'bg-primary-500/25 text-primary-600 dark:text-primary-400 font-bold border border-primary-500/30 shadow-xs',
    secondary: 'bg-black/5 dark:bg-white/5 text-light-text dark:text-dark-text font-bold hover:bg-black/10 dark:hover:bg-white/10',
    pill: 'text-light-text dark:text-dark-text font-semibold',
    ghost: 'bg-transparent text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text font-bold',
    danger: 'bg-rose-500/20 text-rose-600 dark:text-rose-400 font-bold border border-rose-500/30',
    outline: 'bg-transparent border border-black/10 dark:border-white/10 text-light-text dark:text-dark-text font-bold',
    glass: 'bg-white/20 dark:bg-white/10 text-light-text dark:text-dark-text font-bold',
  }[variant] || 'text-light-text dark:text-dark-text font-bold';

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || isLoading}
      onClick={disabled || isLoading ? undefined : onClick}
      className={`inline-block transition-transform duration-150 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${className}`}
      {...props}
    >
      <GlassPanel
        className={`wg-glass-pill ${variantStyles}`}
        padding={sizePadding}
        overrides={{
          borderRadius: overrides?.borderRadius ?? sizeRadius,
          ...overrides,
        }}
      >
        <span className="flex items-center gap-2 justify-center leading-none text-xs uppercase tracking-wider font-sans select-none">
          {isLoading ? (
            <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : icon ? (
            <span className="flex items-center text-sm leading-none shrink-0">{icon}</span>
          ) : null}
          {children && <span>{children}</span>}
        </span>
      </GlassPanel>
    </button>
  );
});
GlassButton.displayName = 'GlassButton';

export default GlassButton;
