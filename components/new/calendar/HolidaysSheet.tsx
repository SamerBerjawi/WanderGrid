import React, { useEffect, useMemo, useState } from 'react';
import type { SavedConfig, User } from '../../../types';
import { formatDate } from '../../../utils/formatters';
import { Flag, Info, Plus, Trash } from '../../ui/hugeicons';
import { RpChip, RpEmpty, RpIconButton, RpSheet, RpToggle } from '../ui';
import { RP_FIELD, RpField } from '../fields';
import { calendarKey, followedKeys } from '../../../utils/holidayCalendar';
import { cn } from '../../../utils/cn';
import HoldButton from '../../kokonutui/hold-button';
import { AddCalendar } from './AddCalendar';

/**
 * Public holidays: which calendars a member follows (a country or one of its regions, every year), which of their
 * holidays are a day off, and days added by hand. A day off is never counted as leave. Changing a calendar's days
 * needs an admin; following a calendar needs an admin or the member themself.
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
    /** Adds or removes a day by hand (admins). */
    onAddDay: (config: SavedConfig, date: string, name: string) => void;
    onRemoveDay: (config: SavedConfig, holidayId: string) => void;
    /** Adding and removing country calendars (admins). */
    thisYear: number;
    onAddCalendar: (config: SavedConfig, regionalSkipped: number) => Promise<void>;
    onRemoveCalendar: (config: SavedConfig) => Promise<void>;
}> = ({ open, onClose, configs, member, canLink, canEditDays, initialYear, onLink, onToggleDay, onAddDay, onRemoveDay, thisYear, onAddCalendar, onRemoveCalendar }) => {
    const years = useMemo(() => [...new Set(configs.map(c => c.year))].sort((a, b) => b - a), [configs]);
    const [year, setYear] = useState(initialYear);
    useEffect(() => {
        if (open) setYear(years.includes(initialYear) ? initialYear : years[0] ?? initialYear);
    }, [open, initialYear, years]);

    const shown = configs.filter(c => c.year === year).sort((a, b) => a.countryName.localeCompare(b.countryName) || (a.regionName || '').localeCompare(b.regionName || ''));
    const linked = new Set(member ? followedKeys(member) : []);

    return (
        <RpSheet open={open} onClose={onClose} title="Holidays" subtitle={member ? `Calendars ${member.name.split(' ')[0]} follows` : undefined} width={460}>
            <div className="flex flex-col gap-4">
                {canEditDays ? <AddCalendar thisYear={thisYear} initialYear={year} saved={configs} onAdd={onAddCalendar} /> : null}
                {configs.length === 0 ? (
                    <RpEmpty title="No holiday calendars yet">{canEditDays ? 'Add a country above to see its public holidays.' : 'An admin can add a country calendar.'}</RpEmpty>
                ) : (
                    <>
                    {years.length > 1 ? (
                        <div className="-m-3 flex gap-2 overflow-x-auto p-3 [scrollbar-width:none]" role="group" aria-label="Year">
                            {years.map(y => <RpChip key={y} selected={y === year} onClick={() => setYear(y)} className="rp-tabular">{y}</RpChip>)}
                        </div>
                    ) : null}
                    {member && linked.size === 0 ? (
                        <p className="flex items-start gap-2 px-1 text-xs text-rp-muted"><Info size={14} className="mt-0.5 shrink-0" aria-hidden /> No calendar is followed yet, so every calendar shows. Follow one to narrow it.</p>
                    ) : null}
                    {!canEditDays ? <p className="px-1 text-xs text-rp-muted">Only an admin can switch a holiday on or off as a day off.</p> : null}
                    {shown.map(config => <ConfigCard key={config.id} config={config} member={member} linked={linked.has(calendarKey(config))} canLink={canLink} canEditDays={canEditDays} onLink={onLink} onToggleDay={onToggleDay} onAddDay={onAddDay} onRemoveDay={onRemoveDay} onRemove={onRemoveCalendar} />)}
                    {shown.length === 0 ? <RpEmpty title={`No calendar for ${year}`} /> : null}
                    </>
                )}
            </div>
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
    onAddDay: (config: SavedConfig, date: string, name: string) => void;
    onRemoveDay: (config: SavedConfig, holidayId: string) => void;
    onRemove: (config: SavedConfig) => Promise<void>;
}> = ({ config, member, linked, canLink, canEditDays, onLink, onToggleDay, onAddDay, onRemoveDay, onRemove }) => {
    const [all, setAll] = useState(false);
    const [adding, setAdding] = useState(false);
    const [newDate, setNewDate] = useState('');
    const [newName, setNewName] = useState('');
    const label = config.regionName ? `${config.countryName}, ${config.regionName}` : config.countryName;
    const inYear = newDate.startsWith(String(config.year));
    const days = [...config.holidays].sort((a, b) => a.date.localeCompare(b.date));
    const rows = all ? days : days.slice(0, SHOWN);
    return (
        <section aria-label={label} className="rounded-rp-inset bg-rp-inset/60 px-4 py-3">
            <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-rp-ochre/15 text-rp-ochre"><Flag size={18} aria-hidden /></span>
                <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-medium text-rp-ink">{label}</h3>
                    <p className="rp-tabular text-xs text-rp-muted">{config.region || config.countryCode} · {config.year} · {days.length} {days.length === 1 ? 'holiday' : 'holidays'}</p>
                </div>
            </div>
            {member ? (
                <RpToggle
                    label={`Follow for ${member.name.split(' ')[0]}`}
                    hint={'Every year, not just this one'}
                    checked={linked}
                    disabled={!canLink}
                    onChange={next => onLink(member, config, next)}
                />
            ) : null}
            <ul className={cn('mt-1 flex flex-col border-t border-rp-line')}>
                {rows.map(h => (
                    <li key={h.id} className="flex items-center gap-1">
                        <div className="min-w-0 flex-1">
                            <RpToggle
                                label={h.name}
                                hint={`${formatDate(h.date, 'weekday-short')}${h.regional ? ' · Regional' : ''}${h.custom ? ' · Added by hand' : ''}${h.isIncluded === false ? ' · Not a day off' : ' · Day off'}`}
                                checked={h.isIncluded !== false}
                                disabled={!canEditDays}
                                onChange={next => onToggleDay(config, h.id, next)}
                            />
                        </div>
                        {h.custom && canEditDays ? (
                            <RpIconButton label={`Remove ${h.name}`} tone="ghost" onClick={() => onRemoveDay(config, h.id)}><Trash size={16} aria-hidden /></RpIconButton>
                        ) : null}
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
            {canEditDays ? (
                adding ? (
                    <div className="flex flex-col gap-2 rounded-rp-inset bg-rp-surface p-3">
                        <div className="grid grid-cols-[9.5rem_1fr] gap-2">
                            <RpField label="Date">{id => <input id={id} type="date" value={newDate} min={`${config.year}-01-01`} max={`${config.year}-12-31`} onChange={e => setNewDate(e.target.value)} className={cn(RP_FIELD, 'rp-date rp-tabular bg-rp-inset')} />}</RpField>
                            <RpField label="Name">{id => <input id={id} value={newName} maxLength={120} onChange={e => setNewName(e.target.value)} placeholder="Company day, local feast" className={cn(RP_FIELD, 'bg-rp-inset')} />}</RpField>
                        </div>
                        {newDate && !inYear ? <p role="alert" className="text-xs text-rp-rust">Pick a day in {config.year}.</p> : null}
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setAdding(false)} className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium text-rp-muted outline-none hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted">Cancel</button>
                            <button type="button" disabled={!inYear} onClick={() => { onAddDay(config, newDate, newName); setAdding(false); setNewDate(''); setNewName(''); }} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-rp-ink px-4 text-sm font-medium text-rp-on-ink outline-none disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-rp-muted"><Plus size={16} aria-hidden /> Add day</button>
                        </div>
                    </div>
                ) : (
                    <button type="button" onClick={() => setAdding(true)} className="mt-1 inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-medium text-rp-ink outline-none hover:bg-rp-line focus-visible:ring-2 focus-visible:ring-rp-muted">
                        <Plus size={16} aria-hidden /> Add a day by hand
                    </button>
                )
            ) : null}
            {canEditDays ? (
                <div className="flex justify-end pt-2">
                    <HoldButton onHoldComplete={() => onRemove(config)} resetAfter={0}>Hold to remove {config.region || config.countryCode} {config.year}</HoldButton>
                </div>
            ) : null}
        </section>
    );
};
