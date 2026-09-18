import React, { ReactNode } from 'react';
import GlassPanel from './glass/GlassPanel';

export const intFmt = new Intl.NumberFormat('en-US').format;

export interface TooltipRow {
  color: string;
  label: string;
  value: string | number;
}

export interface TooltipContentProps {
  title?: string;
  rows: TooltipRow[];
  /** Optional additional content (e.g., markers) */
  children?: ReactNode;
}

export function TooltipContent({ title, rows, children }: TooltipContentProps) {
  return (
    <GlassPanel
      className="wg-glass-card shadow-2xl min-w-[160px] max-w-xs animate-airtrail-pop"
      overrides={{ borderRadius: 18 }}
      padding="10px 14px"
    >
      {title && (
        <div className="mb-2 text-left font-bold text-light-text dark:text-dark-text text-xs tracking-tight">
          {title}
        </div>
      )}
      <div className="space-y-1.5">
        {rows.map((row) => (
          <div
            className="flex items-center justify-between gap-4"
            key={`${row.label}-${row.color}`}
          >
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full shadow-sm"
                style={{ backgroundColor: row.color }}
              />
              <span className="text-light-text-secondary dark:text-dark-text-secondary text-xs font-semibold">
                {row.label}
              </span>
            </div>
            <span className="font-bold text-light-text dark:text-dark-text text-xs tabular-nums">
              {typeof row.value === 'number' ? intFmt(row.value) : row.value}
            </span>
          </div>
        ))}
      </div>

      {children && (
        <div className="mt-2 transition-opacity duration-200 ease-out">
          {children}
        </div>
      )}
    </GlassPanel>
  );
}

TooltipContent.displayName = 'TooltipContent';

export default TooltipContent;
