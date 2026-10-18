import React, { useMemo, useState } from 'react';
import { MagnifyingGlass } from '../../ui/hugeicons';
import { RpChip, RpSection, RpSheet } from '../ui';

type Status = 'all' | 'Past' | 'Upcoming' | 'Planning';
interface Option { label: string; value: string }

export interface MapFilterSheetProps {
    open: boolean;
    onClose: () => void;
    topOffset: number;
    statusFilter: Status;
    setStatusFilter: (s: Status) => void;
    yearFilter: string;
    setYearFilter: (y: string) => void;
    years: string[];
    origins: Option[];
    destinations: Option[];
    depFilter: string[];
    setDepFilter: (v: string[]) => void;
    arrFilter: string[];
    setArrFilter: (v: string[]) => void;
    dateFrom: string;
    setDateFrom: (v: string) => void;
    dateTo: string;
    setDateTo: (v: string) => void;
    activeFilterCount: number;
    onClear: () => void;
}

const STATUSES: { value: Status; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'Past', label: 'Past' },
    { value: 'Upcoming', label: 'Upcoming' },
    { value: 'Planning', label: 'Planning' },
];

const DATE_INPUT = 'min-h-11 w-full rounded-full bg-rp-surface px-4 text-sm text-rp-ink outline-none focus-visible:ring-2 focus-visible:ring-rp-muted [color-scheme:light] dark:[color-scheme:dark]';

/** Search a long list of places and toggle them as chips; selected ones stay on top. */
const PlacePicker: React.FC<{ label: string; options: Option[]; selected: string[]; onChange: (v: string[]) => void }> = ({ label, options, selected, onChange }) => {
    const [q, setQ] = useState('');
    const shown = useMemo(() => {
        const needle = q.trim().toLowerCase();
        const picked = options.filter(o => selected.includes(o.value));
        const rest = options.filter(o => !selected.includes(o.value) && (!needle || o.label.toLowerCase().includes(needle) || o.value.toLowerCase().includes(needle)));
        return [...picked, ...rest.slice(0, needle ? 24 : 12)];
    }, [options, selected, q]);
    return (
        <div className="flex flex-col gap-2 py-2">
            <label className="flex min-h-11 items-center gap-2 rounded-full bg-rp-surface px-4">
                <MagnifyingGlass size={16} className="text-rp-muted" />
                <span className="sr-only">{label}</span>
                <input
                    value={q}
                    onChange={e => setQ(e.target.value)}
                    placeholder="Any airport or city"
                    className="min-w-0 flex-1 bg-transparent text-sm text-rp-ink outline-none placeholder:text-rp-muted"
                />
            </label>
            <div className="flex flex-wrap gap-2">
                {shown.map(o => (
                    <RpChip key={o.value} selected={selected.includes(o.value)} onClick={() => onChange(selected.includes(o.value) ? selected.filter(v => v !== o.value) : [...selected, o.value])}>
                        {o.label}
                    </RpChip>
                ))}
                {shown.length === 0 ? <p className="px-1 text-sm text-rp-muted">No matches</p> : null}
            </div>
        </div>
    );
};

export const MapFilterSheet: React.FC<MapFilterSheetProps> = props => {
    const { open, onClose, topOffset, activeFilterCount, onClear } = props;
    return (
        <RpSheet
            open={open}
            onClose={onClose}
            title="Filter"
            subtitle={activeFilterCount ? `${activeFilterCount} active` : undefined}
            topOffset={topOffset}
            footer={
                <button
                    type="button"
                    onClick={onClear}
                    disabled={!activeFilterCount}
                    className="min-h-11 rounded-full px-4 text-sm font-medium text-rp-ink hover:bg-rp-inset disabled:opacity-40"
                >
                    Clear filters
                </button>
            }
        >
            <div className="flex flex-col gap-5">
                <RpSection title="Status">
                    <div className="flex flex-wrap gap-2 py-2">
                        {STATUSES.map(s => <RpChip key={s.value} selected={props.statusFilter === s.value} onClick={() => props.setStatusFilter(s.value)}>{s.label}</RpChip>)}
                    </div>
                </RpSection>
                {props.years.length > 0 ? (
                    <RpSection title="Year">
                        <div className="flex flex-wrap gap-2 py-2">
                            <RpChip selected={props.yearFilter === 'all'} onClick={() => props.setYearFilter('all')}>All</RpChip>
                            {props.years.map(y => <RpChip key={y} selected={props.yearFilter === y} onClick={() => props.setYearFilter(y)}>{y}</RpChip>)}
                        </div>
                    </RpSection>
                ) : null}
                <RpSection title="From">
                    <PlacePicker label="From" options={props.origins} selected={props.depFilter} onChange={props.setDepFilter} />
                </RpSection>
                <RpSection title="To">
                    <PlacePicker label="To" options={props.destinations} selected={props.arrFilter} onChange={props.setArrFilter} />
                </RpSection>
                <RpSection title="Dates">
                    <div className="grid grid-cols-2 gap-2 py-2">
                        <label className="flex flex-col gap-1">
                            <span className="px-1 text-xs text-rp-muted">From</span>
                            <input type="date" value={props.dateFrom} max={props.dateTo || undefined} onChange={e => props.setDateFrom(e.target.value)} className={DATE_INPUT} />
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="px-1 text-xs text-rp-muted">To</span>
                            <input type="date" value={props.dateTo} min={props.dateFrom || undefined} onChange={e => props.setDateTo(e.target.value)} className={DATE_INPUT} />
                        </label>
                    </div>
                </RpSection>
            </div>
        </RpSheet>
    );
};
