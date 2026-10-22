import React from 'react';
import NumberFlow from '@number-flow/react';
import type { Icon } from '../../ui/hugeicons';
import { cn } from '../../../utils/cn';

/** The page's filled tiles: a rolling figure with its unit and one line of detail (as on Member and Trip). */
const TONE = {
    ink: { card: 'bg-rp-ink text-rp-on-ink', muted: 'text-rp-on-ink/70', circle: 'bg-rp-on-ink/15' },
    green: { card: 'bg-rp-green text-rp-paper', muted: 'text-rp-paper/80', circle: 'bg-rp-paper/20' },
    mustard: { card: 'bg-rp-mustard text-rp-on-mustard', muted: 'text-rp-on-mustard/70', circle: 'bg-rp-on-mustard/10' },
} as const;

export const CalendarTile: React.FC<{
    icon: Icon;
    tone: keyof typeof TONE;
    /** A number rolls; text (a date) is shown as it is. */
    value: number | string;
    unit: string;
    sub: string;
}> = ({ icon: IconC, tone, value, unit, sub }) => {
    const t = TONE[tone];
    return (
        <div className={cn('flex min-w-0 items-center gap-3 rounded-rp-tile p-3 rp-shadow-rest sm:p-4', t.card)}>
            <span className={cn('hidden size-10 shrink-0 items-center justify-center rounded-full sm:flex', t.circle)}><IconC size={18} aria-hidden /></span>
            <span className="min-w-0">
                <span className="flex flex-col sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-1.5">
                    {typeof value === 'number'
                        ? <NumberFlow value={value} format={{ maximumFractionDigits: 1 }} className="rp-tabular text-xl leading-tight font-semibold" />
                        : <span className="rp-tabular text-xl leading-tight font-semibold">{value}</span>}
                    <span className={cn('text-sm', t.muted)}>{unit}</span>
                </span>
                <span className={cn('block text-xs leading-snug sm:truncate', t.muted)}>{sub}</span>
            </span>
        </div>
    );
};
