import React, { type ReactNode } from 'react';
import NumberFlow, { type Format } from '@number-flow/react';
import type { VisitedItem } from '../../../types';
import type { Icon } from '../../ui/hugeicons';
import { getFlagEmoji } from '../../../services/geoData';
import { formatDate } from '../../../utils/formatters';
import { TONE_CHIP, TONE_ICON, TONE_LABEL, toneOf, type AtlasTone } from './atlasStatus';
import { cn } from '../../../utils/cn';

/** Small pieces of the New Atlas page (UI_UX_DESIGN_REFERENCE.md §1.2, §2.2–§2.3). */

export type KpiAccent = 'green' | 'ink' | 'mustard' | 'rust';

/** Filled accent circles for KPI icons (UI_UX_DESIGN_REFERENCE.md §1.1: colour carries meaning). */
const KPI_ACCENT: Record<KpiAccent, string> = {
    green: 'bg-rp-green text-rp-paper',
    ink: 'bg-rp-ink text-rp-on-ink',
    mustard: 'bg-rp-mustard text-rp-on-mustard',
    rust: 'bg-rp-rust text-rp-paper',
};

/**
 * KPI: an icon in a 40px circle, the value (rolling), an optional chip, a muted label. `stacked` puts
 * the icon above a larger value from the `lg` breakpoint (stat tiles beside the map); below it the
 * tile stays a compact row so stats above the map don't waste height.
 */
export const RpKpi: React.FC<{ icon: Icon; value: number; label: string; chip?: ReactNode; format?: Format; stacked?: boolean; accent?: KpiAccent }> = ({
    icon: IconC, value, label, chip, format, stacked, accent,
}) => (
    <div
        className={cn(
            'flex min-w-0',
            stacked
                ? 'items-center gap-3 lg:h-full lg:flex-col lg:items-start lg:justify-between lg:gap-4'
                // Phones: icon above the value, so KPIs fit side by side.
                : 'flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3'
        )}
    >
        <span
            className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-full',
                accent ? KPI_ACCENT[accent] : stacked ? 'bg-rp-inset text-rp-ink' : 'bg-rp-surface text-rp-ink rp-shadow-rest'
            )}
        >
            <IconC size={18} aria-hidden />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <NumberFlow
                    value={value}
                    format={format}
                    className={cn('rp-tabular font-semibold leading-tight text-rp-ink', stacked ? 'text-xl lg:text-[1.75rem]' : 'text-xl')}
                />
                {chip}
            </span>
            <span className={cn('text-xs leading-snug text-rp-muted', !stacked && 'sm:truncate')}>{label}</span>
        </span>
    </div>
);

/** A highlight chip (mustard), e.g. "12% of the world". */
export const RpChipLabel: React.FC<{ children: ReactNode; tone?: 'mustard' | 'green' | 'inset' }> = ({ children, tone = 'mustard' }) => (
    <span
        className={cn(
            'rp-tabular inline-flex min-h-6 items-center whitespace-nowrap rounded-full px-2 text-2xs font-semibold',
            tone === 'mustard' && 'bg-rp-mustard text-rp-on-mustard',
            tone === 'green' && 'bg-rp-green text-rp-paper',
            tone === 'inset' && 'bg-rp-inset text-rp-ink'
        )}
    >
        {children}
    </span>
);

export const ToneChip: React.FC<{ tone: AtlasTone; className?: string }> = ({ tone, className }) => {
    const IconC = TONE_ICON[tone];
    return (
        <span className={cn('inline-flex min-h-6 items-center gap-1 rounded-full pr-2.5 pl-2 text-2xs font-semibold', TONE_CHIP[tone], className)}>
            <IconC size={12} aria-hidden />
            {TONE_LABEL[tone]}
        </span>
    );
};

/** A flag on a soft circle. Emoji flags need no network and work offline. */
export const FlagBadge: React.FC<{ code?: string; size?: 'md' | 'lg'; className?: string }> = ({ code, size = 'md', className }) => (
    <span
        aria-hidden
        className={cn(
            'flex shrink-0 items-center justify-center rounded-full bg-rp-inset leading-none',
            size === 'md' ? 'size-10 text-xl' : 'size-14 text-3xl',
            className
        )}
    >
        {code && code !== 'XX' ? getFlagEmoji(code) : '📍'}
    </span>
);

/** Region heading inside a list; Scroll Index ticks on these. */
export const RegionHeading: React.FC<{ region: string; count: number }> = ({ region, count }) => (
    <h3 data-atlas-index data-index-label={region} className="flex scroll-mt-4 items-baseline gap-2 px-1 pb-3 text-sm font-medium text-rp-ink">
        {region}
        <span className="rp-tabular text-xs font-normal text-rp-muted">{count}</span>
    </h3>
);

/** A country in a list: flag, name, tone and the visit date. */
export const CountryTile: React.FC<{ item: VisitedItem; onClick: () => void }> = ({ item, onClick }) => {
    const tone = toneOf(item);
    return (
        <button
            type="button"
            onClick={onClick}
            className="group flex min-h-16 w-full items-center gap-3 rounded-rp-tile bg-rp-surface p-3 pr-4 text-left rp-shadow-rest outline-none transition-colors duration-150 hover:bg-rp-inset focus-visible:ring-2 focus-visible:ring-rp-muted active:scale-[0.99]"
        >
            <FlagBadge code={item.code} />
            <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-rp-ink">{item.name}</span>
                <span className="rp-tabular truncate text-xs text-rp-muted">
                    {item.visitDate ? formatDate(item.visitDate, 'month-year') : item.isManual === false ? 'From your trips' : 'No date'}
                </span>
            </span>
            <ToneChip tone={tone} />
        </button>
    );
};

/** A city in a list. Places that come from trips can't be edited here. */
export const CityTile: React.FC<{ item: VisitedItem; derived: boolean; onClick?: () => void }> = ({ item, derived, onClick }) => {
    const body = (
        <>
            <FlagBadge code={item.countryCode} />
            <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-rp-ink">{item.name}</span>
                <span className="truncate text-xs text-rp-muted">
                    {[item.countryName, item.visitDate ? formatDate(item.visitDate, 'month-year') : null].filter(Boolean).join(' · ')
                        || (Number.isFinite(item.lat) && Number.isFinite(item.lng) ? `${(item.lat as number).toFixed(3)}, ${(item.lng as number).toFixed(3)}` : 'Unknown country')}
                </span>
            </span>
            {derived ? <span className="shrink-0 text-2xs font-medium text-rp-muted">From trips</span> : null}
        </>
    );
    const base = 'flex min-h-16 w-full items-center gap-3 rounded-rp-tile bg-rp-surface p-3 pr-4 text-left rp-shadow-rest';
    if (!onClick) return <div className={base}>{body}</div>;
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(base, 'outline-none transition-colors duration-150 hover:bg-rp-inset focus-visible:ring-2 focus-visible:ring-rp-muted active:scale-[0.99]')}
        >
            {body}
        </button>
    );
};

/** Card artwork for the deck and the rail: a big flag on a tone-coloured field. */
export const FlagArt: React.FC<{ code?: string; tone: AtlasTone }> = ({ code, tone }) => (
    <span
        aria-hidden
        className={cn(
            'flex h-full w-full items-center justify-center text-7xl',
            tone === 'visited' && 'bg-rp-green/15',
            tone === 'lived' && 'bg-rp-ink/10',
            tone === 'wishlist' && 'bg-rp-mustard/25',
            tone === 'layover' && 'bg-rp-inset'
        )}
    >
        {code && code !== 'XX' ? getFlagEmoji(code) : '📍'}
    </span>
);
