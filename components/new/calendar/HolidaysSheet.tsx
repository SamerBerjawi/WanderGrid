import React, { useEffect, useMemo, useState } from 'react';
import type { SavedConfig, User } from '../../../types';
import { formatDate } from '../../../utils/formatters';
import { Flag, Info } from '../../ui/hugeicons';
import { RpChip, RpEmpty, RpSheet, RpToggle } from '../ui';
import { cn } from '../../../utils/cn';

/**
 * Public holidays: which saved country calendars a member follows (per year) and which of their
 * holidays are a day off. A day off is not counted as leave when it falls inside a trip. Changing a
 * calendar's days needs an admin; following a calendar needs an admin or the member themself.
 */

const SHOWN = 4;

export const HolidaysSheet: React.FC<{
    open: boolean;
    onClose: () => void;
    configs: SavedConfig[];
    /** The member whose calendars are being chosen. */
    member: User | undefined;
    canLink: boolean;
    canEditDays: boolean;
    initialYear: number;
    onLink: (member: User, config: SavedConfig, linked: boolean) => void;
    onToggleDay: (config: SavedConfig, holidayId: string, included: boolean) => void;
}> = ({ open, onClose, configs, member, canLink, canEditDays, initialYear, onLink, onToggleDay }) => {
    const years = useMemo(() => [...new Set(configs.map(c => c.year))].sort((a, b) => b - a), [configs]);
    const [year, setYear] = useState(initialYear);
    useEffect(() => {
        if (open) setYear(years.includes(initialYear) ? initialYear : years[0] ?? initialYear);
    }, [open, initialYear, years]);

    const shown = configs.filter(c => c.year === year).sort((a, b) => a.countryName.localeCompare(b.countryName));
    const linked = new Set(member?.holidayConfigIds || []);

    return (
        <RpSheet open={open} onClose={onClose} title="Holidays" subtitle={member ? `Calendars ${member.name.split(' ')[0]} follows` : undefined} width={460}>
            {configs.length === 0 ? (
                <RpEmpty title="No holiday calendars yet" />
            ) : (
                <div className="flex flex-col gap-4">
                    {years.length > 1 ? (
                        <div className="-m-3 flex gap-2 overflow-x-auto p-3 [scrollbar-width:none]" role="group" aria-label="Year">
                            {years.map(y => <RpChip key={y} selected={y === year} onClick={() => setYear(y)} className="rp-tabular">{y}</RpChip>)}
                        </div>
                    ) : null}
                    {member && linked.size === 0 ? (
                        <p className="flex items-start gap-2 px-1 text-xs text-rp-muted"><Info size={14} className="mt-0.5 shrink-0" aria-hidden /> No calendar is followed yet, so every calendar shows. Follow one to narrow it.</p>
                    ) : null}
                    {!canEditDays ? <p className="px-1 text-xs text-rp-muted">Only an admin can switch a holiday on or off as a day off.</p> : null}
                    {shown.map(config => <ConfigCard key={config.id} config={config} member={member} linked={linked.has(config.id)} canLink={canLink} canEditDays={canEditDays} onLink={onLink} onToggleDay={onToggleDay} />)}
                    {shown.length === 0 ? <RpEmpty title={`No calendar for ${year}`} /> : null}
                </div>
            )}
        </RpSheet>
    );
};

const ConfigCard: React.FC<{
    config: SavedConfig;
    member: User | undefined;
    linked: boolean;
    canLink: boolean;
    canEditDays: boolean;
    onLink: (member: User, config: SavedConfig, linked: boolean) => void;
    onToggleDay: (config: SavedConfig, holidayId: string, included: boolean) => void;
}> = ({ config, member, linked, canLink, canEditDays, onLink, onToggleDay }) => {
    const [all, setAll] = useState(false);
    const days = [...config.holidays].sort((a, b) => a.date.localeCompare(b.date));
    const rows = all ? days : days.slice(0, SHOWN);
    return (
        <section aria-label={config.countryName} className="rounded-rp-inset bg-rp-inset/60 px-4 py-3">
            <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-rp-ochre/15 text-rp-ochre"><Flag size={18} aria-hidden /></span>
                <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-medium text-rp-ink">{config.countryName}</h3>
                    <p className="rp-tabular text-xs text-rp-muted">{config.countryCode} · {config.year} · {days.length} {days.length === 1 ? 'holiday' : 'holidays'}</p>
                </div>
            </div>
            {member ? (
                <RpToggle
                    label={`Follow for ${member.name.split(' ')[0]}`}
                    checked={linked}
                    disabled={!canLink}
                    onChange={next => onLink(member, config, next)}
                />
            ) : null}
            <ul className={cn('mt-1 flex flex-col border-t border-rp-line')}>
                {rows.map(h => (
                    <li key={h.id}>
                        <RpToggle
                            label={h.name}
                            hint={`${formatDate(h.date, 'weekday-short')}${h.isIncluded === false ? ' · Not a day off' : ' · Day off'}`}
                            checked={h.isIncluded !== false}
                            disabled={!canEditDays}
                            onChange={next => onToggleDay(config, h.id, next)}
                        />
                    </li>
                ))}
            </ul>
            {days.length > SHOWN ? (
                <div className="flex justify-center pt-1">
                    <button type="button" onClick={() => setAll(v => !v)} className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium text-rp-muted outline-none hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted">
                        {all ? 'Show fewer' : `Show all ${days.length}`}
                    </button>
                </div>
            ) : null}
        </section>
    );
};
