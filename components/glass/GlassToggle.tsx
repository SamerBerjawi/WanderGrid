import React from 'react';

export interface GlassToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  ariaLabel?: string;
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
  id?: string;
}

const ACCENT_STYLES = {
  primary: 'bg-primary-500/85 dark:bg-primary-500/90 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_0_10px_rgba(234,88,12,0.3)] border-primary-500/40',
  emerald: 'bg-emerald-500/85 dark:bg-emerald-500/90 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_0_10px_rgba(16,185,129,0.3)] border-emerald-500/40',
  amber: 'bg-amber-500/85 dark:bg-amber-500/90 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_0_10px_rgba(245,158,11,0.3)] border-amber-500/40',
  rose: 'bg-rose-500/85 dark:bg-rose-500/90 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_0_10px_rgba(244,63,94,0.3)] border-rose-500/40',
  sky: 'bg-sky-500/85 dark:bg-sky-500/90 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_0_10px_rgba(14,165,233,0.3)] border-sky-500/40',
  indigo: 'bg-indigo-500/85 dark:bg-indigo-500/90 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_0_10px_rgba(99,102,241,0.3)] border-indigo-500/40',
  cyan: 'bg-cyan-500/85 dark:bg-cyan-500/90 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_0_10px_rgba(6,182,212,0.3)] border-cyan-500/40',
  purple: 'bg-purple-500/85 dark:bg-purple-500/90 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_0_10px_rgba(168,85,247,0.3)] border-purple-500/40',
};

export const GlassToggle: React.FC<GlassToggleProps> = ({
  checked,
  onChange,
  disabled = false,
  label,
  ariaLabel,
  accentColor = 'primary',
  className = '',
  id,
}) => {
  const activeAccent = ACCENT_STYLES[accentColor] || ACCENT_STYLES.primary;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!disabled) {
      onChange(!checked);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      onChange(!checked);
    }
  };

  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel || label}
      disabled={disabled}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`min-w-[40px] min-h-[38px] sm:min-w-[44px] sm:min-h-[40px] inline-flex items-center justify-center p-0.5 rounded-full cursor-pointer select-none group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 active:scale-[0.98] transition-transform duration-150 ${
        disabled ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''
      } ${className}`}
    >
      <div
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-all duration-200 ease-in-out wg-glass-surface ${
          checked
            ? activeAccent
            : 'bg-black/15 dark:bg-white/15 border-black/10 dark:border-white/15 shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-white/95 shadow-[0_1px_3px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.8)] ring-0 transition-transform duration-200 ease-in-out ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </div>
    </button>
  );
};

export default GlassToggle;
