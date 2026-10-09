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
  accentColor?: 'primary' | 'emerald' | 'amber';
  disabled?: boolean;
  className?: string;
}

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
  const accentClasses = {
    primary: 'accent-primary-500 text-primary-600 dark:text-primary-400',
    emerald: 'accent-emerald-500 text-emerald-600 dark:text-emerald-400',
    amber: 'accent-amber-500 text-amber-600 dark:text-amber-400',
  }[accentColor];

  return (
    <div className={`space-y-1.5 w-full ${disabled ? 'opacity-40 pointer-events-none' : ''} ${className}`}>
      {label && (
        <div className="flex items-center justify-between text-2xs font-bold text-light-text dark:text-dark-text">
          <span className="text-light-text-secondary dark:text-dark-text-secondary">{label}</span>
          <span className={`font-mono ${accentClasses.split(' ')[1]} ${accentClasses.split(' ')[2]}`}>
            {formatValue(value)}
          </span>
        </div>
      )}
      <div className="flex items-center min-h-[44px] py-2">
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
          className={`w-full cursor-pointer h-2 bg-black/10 dark:bg-white/10 rounded-lg ${accentClasses.split(' ')[0]} transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50`}
        />
      </div>
    </div>
  );
};

export default GlassSlider;
