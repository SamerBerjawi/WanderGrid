import React, { ReactNode } from 'react';
import { BTN_PRIMARY_STYLE, BTN_SECONDARY_STYLE, CARD_FILL_STYLE } from '../constants';
import Icon from './ui/Icon';

export interface EmptyStateProps {
  icon?: string | ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: string | ReactNode;
    variant?: 'primary' | 'secondary';
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
    icon?: string | ReactNode;
  };
  compact?: boolean;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = 'inbox',
  title,
  description,
  action,
  secondaryAction,
  compact = false,
  className = '',
}) => {
  return (
    <div
      className={`${CARD_FILL_STYLE} flex flex-col items-center justify-center text-center ${
        compact ? 'p-4 min-h-[140px]' : 'p-10 min-h-[260px]'
      } ${className}`}
    >
      {icon && (
        <div className={`${compact ? 'w-10 h-10 rounded-xl mb-2.5' : 'w-14 h-14 rounded-2xl mb-4'} bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 flex items-center justify-center text-light-text-secondary dark:text-dark-text-secondary shadow-sm`}>
          {typeof icon === 'string' ? (
            <Icon name={icon} className={`${compact ? 'text-lg' : 'text-2xl'} text-primary-500`} />
          ) : (
            icon
          )}
        </div>
      )}

      <h3 className={`${compact ? 'text-sm' : 'text-base'} font-bold text-light-text dark:text-dark-text tracking-tight`}>
        {title}
      </h3>

      {description && (
        <p className={`${compact ? 'text-2xs max-w-xs mt-1' : 'text-xs max-w-sm mt-1.5'} text-light-text-secondary dark:text-dark-text-secondary leading-relaxed font-medium`}>
          {description}
        </p>
      )}

      {(action || secondaryAction) && (
        <div className={`flex flex-wrap items-center justify-center gap-2.5 ${compact ? 'mt-3.5' : 'mt-5'}`}>
          {action && (
            <button
              type="button"
              onClick={action.onClick}
              className={`${
                action.variant === 'secondary' ? BTN_SECONDARY_STYLE : BTN_PRIMARY_STYLE
              } ${compact ? 'h-9 px-4 text-2xs' : 'min-h-[44px] px-5 py-2.5 text-xs'} font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer`}
            >
              {action.icon && (
                typeof action.icon === 'string' ? (
                  <Icon name={action.icon} className="text-sm" />
                ) : (
                  action.icon
                )
              )}
              <span>{action.label}</span>
            </button>
          )}

          {secondaryAction && (
            <button
              type="button"
              onClick={secondaryAction.onClick}
              className={`${BTN_SECONDARY_STYLE} min-h-[44px] px-5 py-2.5 text-xs font-bold uppercase tracking-wider flex items-center gap-2`}
            >
              {secondaryAction.icon && (
                typeof secondaryAction.icon === 'string' ? (
                  <Icon name={secondaryAction.icon} className="text-sm" />
                ) : (
                  secondaryAction.icon
                )
              )}
              <span>{secondaryAction.label}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default EmptyState;
