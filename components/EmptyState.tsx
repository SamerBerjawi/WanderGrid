import React, { ReactNode } from 'react';
import GlassPanel from './glass/GlassPanel';
import GlassButton from './glass/GlassButton';
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
    <GlassPanel
      className={`wg-glass-card rounded-2xl flex flex-col items-center justify-center text-center w-full transition-all duration-300 ${
        compact ? 'p-5 min-h-[140px]' : 'p-8 min-h-[220px]'
      } ${className}`}
      overrides={{ borderRadius: compact ? 20 : 28 }}
      padding="0px"
    >
      <div className="flex flex-col items-center justify-center text-center w-full p-2">
        {icon && (
          <div className={`${compact ? 'w-10 h-10 rounded-xl mb-2.5' : 'w-14 h-14 rounded-2xl mb-4'} bg-primary-500/10 border border-primary-500/20 flex items-center justify-center text-primary-500 shadow-sm`}>
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
              <GlassButton
                variant={action.variant || 'primary'}
                size={compact ? 'sm' : 'md'}
                onClick={action.onClick}
                icon={
                  action.icon && (
                    typeof action.icon === 'string' ? (
                      <Icon name={action.icon} className="text-sm" />
                    ) : (
                      action.icon
                    )
                  )
                }
              >
                {action.label}
              </GlassButton>
            )}

            {secondaryAction && (
              <GlassButton
                variant="secondary"
                size={compact ? 'sm' : 'md'}
                onClick={secondaryAction.onClick}
                icon={
                  secondaryAction.icon && (
                    typeof secondaryAction.icon === 'string' ? (
                      <Icon name={secondaryAction.icon} className="text-sm" />
                    ) : (
                      secondaryAction.icon
                    )
                  )
                }
              >
                {secondaryAction.label}
              </GlassButton>
            )}
          </div>
        )}
      </div>
    </GlassPanel>
  );
};

export default EmptyState;
