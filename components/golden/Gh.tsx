import React, { ReactNode } from 'react';
import { clsx } from 'clsx';

/**
 * Golden Hour primitives. Flat, solid, rounded and colourful: no glass, no blur, no hairline borders.
 * Light = cream canvas + white cards; dark = night canvas + plum cards. See docs/golden-hour-design.md.
 */

export type GhTone = 'surface' | 'coral' | 'sun' | 'teal' | 'lilac' | 'ink';

const TONE: Record<GhTone, string> = {
  surface: 'bg-white dark:bg-sunset-plum text-sunset-ink dark:text-white',
  coral: 'bg-sunset-orange text-white',
  sun: 'bg-sunset-sun text-sunset-ink',
  teal: 'bg-sunset-teal text-sunset-ink',
  lilac: 'bg-sunset-lilac text-sunset-ink',
  ink: 'bg-sunset-ink text-white',
};

export const GhCard: React.FC<{ tone?: GhTone; className?: string; children: ReactNode; onClick?: () => void; label?: string }> = ({
  tone = 'surface', className, children, onClick, label,
}) => {
  const base = clsx('rounded-3xl p-4 sm:p-5 shadow-card text-left', TONE[tone], className);
  return onClick ? (
    <button type="button" onClick={onClick} aria-label={label} className={clsx(base, 'w-full cursor-pointer hover:-translate-y-0.5 transition-transform min-h-[44px]')}>
      {children}
    </button>
  ) : (
    <div className={base}>{children}</div>
  );
};

export const GhButton: React.FC<{
  children: ReactNode; onClick?: () => void; icon?: ReactNode; variant?: 'primary' | 'soft' | 'ghost'; className?: string; label?: string; type?: 'button' | 'submit';
}> = ({ children, onClick, icon, variant = 'primary', className, label, type = 'button' }) => (
  <button
    type={type}
    onClick={onClick}
    aria-label={label}
    className={clsx(
      'min-h-[44px] px-5 rounded-full inline-flex items-center justify-center gap-2 text-sm font-semibold cursor-pointer transition-transform active:scale-95',
      variant === 'primary' && 'bg-sunset-coral text-white shadow-card hover:brightness-105',
      variant === 'soft' && 'bg-white dark:bg-sunset-dusk text-sunset-ink dark:text-white shadow-card',
      variant === 'ghost' && 'text-sunset-ink dark:text-white hover:bg-sunset-sand dark:hover:bg-sunset-dusk',
      className
    )}
  >
    {icon}
    {children}
  </button>
);

export const GhChip: React.FC<{ children: ReactNode; tone?: GhTone | 'plain'; className?: string }> = ({ children, tone = 'plain', className }) => (
  <span className={clsx('inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold', tone === 'plain' ? 'bg-white text-sunset-ink' : TONE[tone], className)}>
    {children}
  </span>
);

export const GhTabs: React.FC<{ tabs: { id: string; label: string; count?: number }[]; active: string; onChange: (id: string) => void }> = ({ tabs, active, onChange }) => (
  <div role="tablist" className="inline-flex gap-1 p-1 rounded-full bg-sunset-sand dark:bg-sunset-dusk overflow-x-auto no-scrollbar max-w-full">
    {tabs.map(t => (
      <button
        key={t.id}
        role="tab"
        aria-selected={active === t.id}
        onClick={() => onChange(t.id)}
        className={clsx(
          'min-h-[44px] px-4 rounded-full text-sm font-semibold whitespace-nowrap cursor-pointer transition-colors',
          active === t.id ? 'bg-sunset-coral text-white shadow-card' : 'text-sunset-ink dark:text-white/80'
        )}
      >
        {t.label}
        {t.count !== undefined && <span className="ml-2 opacity-70">{t.count}</span>}
      </button>
    ))}
  </div>
);

export const GhStat: React.FC<{ label: string; value: ReactNode; hint?: string; tone?: GhTone }> = ({ label, value, hint, tone = 'sun' }) => (
  <div className={clsx('rounded-3xl p-4 text-sunset-ink', TONE[tone])}>
    <div className="text-xs font-semibold uppercase tracking-wider opacity-80">{label}</div>
    <div className="text-3xl font-black tracking-tight mt-1">{value}</div>
    {hint && <div className="text-xs font-medium opacity-80 mt-0.5">{hint}</div>}
  </div>
);

/** Page shell: cream/night canvas padding, hero title left, action right, optional controls row centred on mobile. */
export const GhPage: React.FC<{ title: string; icon?: ReactNode; action?: ReactNode; controls?: ReactNode; children: ReactNode }> = ({
  title, icon, action, controls, children,
}) => (
  <div className="w-full max-w-[1680px] mx-auto pt-2 sm:pt-4 px-2 sm:px-4 md:px-6 lg:px-8 flex flex-col gap-5 sm:gap-6 animate-fadeIn pb-16">
    <header className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        {icon && <span className="text-sunset-coral shrink-0">{icon}</span>}
        <h1 className="text-2xl sm:text-4xl md:text-5xl font-black tracking-tight text-sunset-ink dark:text-white truncate">{title}</h1>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
    {controls && <div className="flex justify-center sm:justify-start">{controls}</div>}
    {children}
  </div>
);

export const GhEmpty: React.FC<{ title: string; hint?: string; action?: ReactNode }> = ({ title, hint, action }) => (
  <div className="rounded-3xl bg-sunset-sand dark:bg-sunset-dusk text-sunset-ink dark:text-white p-8 text-center flex flex-col items-center gap-3">
    <div className="text-xl font-black">{title}</div>
    {hint && <div className="text-sm opacity-80 max-w-sm">{hint}</div>}
    {action}
  </div>
);
