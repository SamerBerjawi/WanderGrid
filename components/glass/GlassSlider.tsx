import React from 'react';

export interface GlassSliderProps {
  value: number;
  onChange: (val: number) => void;
  onPointerUp?: () => void;
  min: number;
  max: number;
  step?: number;
  label?: string;
  formatValue?: (val: number) => string;
  accentColor?:
    | 'primary'
    | 'emerald'
    | 'amber'
    | 'rose'
    | 'sky'
    | 'indigo'
    | 'cyan'
    | 'purple';
  disabled?: boolean;
  className?: string;
}

const ACCENT_CLASSES: Record<string, { accent: string; text: string }> = {
  primary: { accent: 'accent-primary-500', text: 'text-primary-600 dark:text-primary-400' },
  emerald: { accent: 'accent-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
  amber: { accent: 'accent-amber-500', text: 'text-amber-600 dark:text-amber-400' },
  rose: { accent: 'accent-rose-500', text: 'text-rose-600 dark:text-rose-400' },
  sky: { accent: 'accent-sky-500', text: 'text-sky-600 dark:text-sky-400' },
  indigo: { accent: 'accent-indigo-500', text: 'text-indigo-600 dark:text-indigo-400' },
  cyan: { accent: 'accent-cyan-500', text: 'text-cyan-600 dark:text-cyan-400' },
  purple: { accent: 'accent-purple-500', text: 'text-purple-600 dark:text-purple-400' },
};

export const GlassSlider: React.FC<GlassSliderProps> = ({
  value,
  onChange,
  onPointerUp,
  min,
  max,
  step = 0.05,
  label,
  formatValue = (v) => `${Math.round(v * 100)}%`,
  accentColor = 'primary',
  disabled = false,
  className = '',
}) => {
  const currentAccent = ACCENT_CLASSES[accentColor] || ACCENT_CLASSES.primary;

  return (
    <div className={`space-y-1 w-full ${disabled ? 'opacity-40 pointer-events-none' : ''} ${className}`}>
      {label && (
        <div className="flex items-center justify-between text-2xs font-bold text-light-text dark:text-dark-text">
          <span className="text-light-text-secondary dark:text-dark-text-secondary">{label}</span>
          <span className={`font-mono font-bold ${currentAccent.text}`}>
            {formatValue(value)}
          </span>
        </div>
      )}
      <div className="flex items-center min-h-[32px] py-1">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          onPointerUp={onPointerUp}
          onMouseUp={onPointerUp}
          onTouchEnd={onPointerUp}
          className={`w-full cursor-pointer h-1.5 bg-black/10 dark:bg-white/10 rounded-lg ${currentAccent.accent} transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50`}
        />
      </div>
    </div>
  );
};

export default GlassSlider;
