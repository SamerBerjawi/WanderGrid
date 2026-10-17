import React, { ReactNode } from 'react';
import { clsx } from 'clsx';
import { GhTone } from './Gh';

const BADGE: Record<Exclude<GhTone, 'surface'>, string> = {
  coral: 'bg-sunset-orange text-white', sun: 'bg-sunset-sun text-sunset-ink', teal: 'bg-sunset-teal text-sunset-ink',
  lilac: 'bg-sunset-lilac text-sunset-ink', ink: 'bg-sunset-ink text-white',
};

/** White/plum section card with a coloured icon badge, a title and optional right-hand action. */
export const GhSection: React.FC<{ title: string; icon?: ReactNode; tone?: Exclude<GhTone, 'surface'>; action?: ReactNode; className?: string; children: ReactNode }> = ({
  title, icon, tone = 'sun', action, className, children,
}) => (
  <section className={clsx('rounded-3xl bg-white dark:bg-sunset-plum shadow-card p-5 sm:p-6 text-sunset-ink dark:text-white', className)}>
    <div className="flex items-center justify-between gap-3 mb-5">
      <div className="flex items-center gap-3 min-w-0">
        {icon && <span className={clsx('w-11 h-11 rounded-2xl flex items-center justify-center shrink-0', BADGE[tone])}>{icon}</span>}
        <h2 className="text-xl font-black tracking-tight truncate">{title}</h2>
      </div>
      {action}
    </div>
    {children}
  </section>
);
