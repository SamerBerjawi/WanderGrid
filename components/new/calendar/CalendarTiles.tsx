import React from 'react';
import NumberFlow from '@number-flow/react';
import type { Icon } from '../../ui/hugeicons';
import { cn } from '../../../utils/cn';

/** The page's figures, unboxed like Rapport's KPI triplet: a glass icon circle, a rolling value and unit, one muted line. The accent is the icon colour. */
const TONE = {
    ink: 'text-rp-ink',
    green: 'text-rp-green',
    mustard: 'text-rp-ochre',
} as const;

export const CalendarTile: React.FC<{
    icon: Icon;
    tone: keyof typeof TONE;
    /** A number rolls; text (a date) is shown as it is. */
    value: number | string;
    unit: string;
    sub: string;
}> = ({ icon: IconC, tone, value, unit, sub }) => {
    return (
        <div className="flex min-w-0 items-center gap-3 px-1">
            <span className={cn('hidden size-10 shrink-0 items-center justify-center rounded-full bg-white/65 ring-1 ring-inset ring-white/80 dark:bg-white/10 dark:ring-white/10 sm:flex', TONE[tone])}><IconC size={18} aria-hidden /></span>
            <span className="min-w-0">
                <span className="flex flex-col sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-1.5">
                    {typeof value === 'number'
                        ? <NumberFlow value={value} format={{ maximumFractionDigits: 1 }} className="rp-tabular text-xl leading-tight font-semibold" />
                        : <span className="rp-tabular text-xl leading-tight font-semibold">{value}</span>}
                    <span className="text-sm text-rp-muted">{unit}</span>
                </span>
                <span className="block text-xs leading-snug text-rp-muted sm:truncate">{sub}</span>
            </span>
        </div>
    );
};
