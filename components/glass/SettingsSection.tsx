import React from 'react';

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
