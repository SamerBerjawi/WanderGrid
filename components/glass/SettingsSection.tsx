import React from 'react';
import { isGoldenHour } from '../golden/ghControls';

export interface SettingsSectionProps {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  accentColor?:
    | 'primary'
    | 'emerald'
    | 'amber'
    | 'rose'
    | 'sky'
    | 'indigo'
    | 'cyan'
    | 'purple';
  children: React.ReactNode;
  className?: string;
}

const DOT_ACCENTS = {
  primary: 'bg-primary-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  sky: 'bg-sky-500',
  indigo: 'bg-indigo-500',
  cyan: 'bg-cyan-500',
  purple: 'bg-purple-500',
};

export const SettingsSection: React.FC<SettingsSectionProps> = ({
  title,
  subtitle,
  action,
  accentColor,
  children,
  className = '',
}) => {
  if (isGoldenHour()) {
    const DOT: Record<string, string> = {
      primary: 'bg-sunset-coral', emerald: 'bg-sunset-teal', amber: 'bg-sunset-sun', rose: 'bg-sunset-coral',
      sky: 'bg-sunset-teal', indigo: 'bg-sunset-lilac', cyan: 'bg-sunset-teal', purple: 'bg-sunset-lilac',
    };
    return (
      <div className={`p-4 sm:p-5 rounded-3xl bg-white dark:bg-sunset-plum shadow-card space-y-4 ${className}`}>
        {(title || action) && (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              {accentColor && <span className={`w-3 h-3 rounded-full ${DOT[accentColor] || 'bg-sunset-coral'} shrink-0`} />}
              <div className="min-w-0">
                {title && <h4 className="text-lg font-black tracking-tight text-sunset-ink dark:text-white">{title}</h4>}
                {subtitle && <p className="text-sm text-sunset-ink/70 dark:text-white/70 mt-0.5">{subtitle}</p>}
              </div>
            </div>
            {action && <div className="shrink-0">{action}</div>}
          </div>
        )}
        {children}
      </div>
    );
  }

  return (
    <div
      className={`p-3 sm:p-3.5 rounded-2xl bg-white/40 dark:bg-white/[0.03] backdrop-blur-sm border border-black/5 dark:border-white/5 space-y-2 ${className}`}
    >
      {(title || action) && (
        <div className="flex items-center justify-between gap-2 pb-0.5">
          <div className="flex items-center gap-1.5">
            {accentColor && (
              <span
                className={`w-1.5 h-1.5 rounded-full ${DOT_ACCENTS[accentColor] || 'bg-primary-500'} shrink-0`}
              />
            )}
            <div>
              {title && (
                <h4 className="text-2xs sm:text-xs font-bold uppercase tracking-wider text-light-text dark:text-dark-text">
                  {title}
                </h4>
              )}
              {subtitle && (
                <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
};

export default SettingsSection;
