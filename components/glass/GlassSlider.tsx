import React from 'react';
import { isGoldenHour } from '../golden/ghControls';

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

  if (isGoldenHour()) {
    const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
    return (
      <div className={`space-y-1 w-full ${disabled ? 'opacity-40 pointer-events-none' : ''} ${className}`}>
        {label && (
          <div className="flex items-center justify-between text-sm font-black text-sunset-ink dark:text-white">
            <span>{label}</span>
            <span className="px-2.5 py-0.5 rounded-full bg-sunset-sun text-sunset-ink text-xs font-black tabular-nums">{formatValue(value)}</span>
          </div>
        )}
        <div className="relative flex items-center min-h-[44px]">
          <div className="absolute inset-x-0 h-3 rounded-full bg-sunset-sand dark:bg-sunset-dusk" />
          <div className="absolute left-0 h-3 rounded-full bg-sunset-coral" style={{ width: `${pct}%` }} />
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            disabled={disabled}
            aria-label={label}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            onPointerUp={onPointerUp}
            onMouseUp={onPointerUp}
            onTouchEnd={onPointerUp}
            className="relative w-full h-11 cursor-pointer appearance-none bg-transparent focus:outline-none [&::-webkit-slider-runnable-track]:bg-transparent [&::-moz-range-track]:bg-transparent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:w-7 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_2px_8px_rgba(60,20,10,0.4)] [&::-moz-range-thumb]:h-7 [&::-moz-range-thumb]:w-7 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white focus-visible:[&::-webkit-slider-thumb]:ring-4 focus-visible:[&::-webkit-slider-thumb]:ring-sunset-coral/50"
          />
        </div>
      </div>
    );
  }

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
