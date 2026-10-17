import React, { ReactNode } from 'react';
import { clsx } from 'clsx';

/** One setting: title and optional hint on the left, control on the right (stacks on mobile). */
export const GhSettingRow: React.FC<{ title: string; hint?: string; children: ReactNode; stack?: boolean }> = ({ title, hint, children, stack }) => (
  <div className={clsx('py-4 first:pt-0 last:pb-0 flex gap-3', stack ? 'flex-col' : 'flex-col sm:flex-row sm:items-center sm:justify-between')}>
    <div className="min-w-0">
      <div className="text-base font-black text-sunset-ink dark:text-white">{title}</div>
      {hint && <div className="text-sm text-sunset-ink/70 dark:text-white/70 mt-0.5">{hint}</div>}
    </div>
    <div className={clsx('min-w-0', !stack && 'sm:max-w-[60%]')}>{children}</div>
  </div>
);
