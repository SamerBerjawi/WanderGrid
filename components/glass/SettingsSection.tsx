import React from 'react';

export interface SettingsSectionProps {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const SettingsSection: React.FC<SettingsSectionProps> = ({
  title,
  subtitle,
  action,
  children,
  className = '',
}) => {
  return (
    <div
      className={`p-4 rounded-2xl bg-white/40 dark:bg-white/[0.03] backdrop-blur-sm border border-black/5 dark:border-white/5 space-y-3 ${className}`}
    >
      {(title || action) && (
        <div className="flex items-center justify-between gap-2">
          <div>
            {title && (
              <h4 className="text-xs font-bold uppercase tracking-wider text-light-text dark:text-dark-text">
                {title}
              </h4>
            )}
            {subtitle && (
              <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
};

export default SettingsSection;
