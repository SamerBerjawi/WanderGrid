import React from 'react';

export interface SettingRowProps {
  label: string;
  helper?: string;
  badge?: React.ReactNode;
  icon?: React.ReactNode;
  control?: React.ReactNode;
  children?: React.ReactNode;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export const SettingRow: React.FC<SettingRowProps> = ({
  label,
  helper,
  badge,
  icon,
  control,
  children,
  disabled = false,
  className = '',
  id,
}) => {
  return (
    <div
      id={id}
      className={`space-y-1.5 ${disabled ? 'opacity-50 pointer-events-none' : ''} ${className}`}
    >
      <div className="flex items-center justify-between gap-2 min-h-[36px] sm:min-h-[38px]">
        <div className="flex items-center gap-2 min-w-0 pr-1">
          {icon && <div className="shrink-0">{icon}</div>}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-light-text dark:text-dark-text leading-tight">
                {label}
              </span>
              {badge && <span className="shrink-0">{badge}</span>}
            </div>
            {helper && (
              <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5 leading-tight">
                {helper}
              </p>
            )}
          </div>
        </div>

        {control && <div className="shrink-0 flex items-center">{control}</div>}
      </div>

      {children && (
        <div className="pt-1.5 border-t border-black/5 dark:border-white/5 space-y-1.5 animate-fadeIn">
          {children}
        </div>
      )}
    </div>
  );
};

export default SettingRow;
