import React, { useId, useMemo, useState } from 'react';
import {
    AirplaneLanding,
    AirplaneTakeoff,
    Calendar,
    CalendarBlank,
    CaretDown,
    Globe,
    MagnifyingGlass,
    X,
} from '../../ui/hugeicons';
import { RpSection, RpSheet } from '../ui';
import { RP_FIELD } from '../fields';
import { RpDatePicker } from '../DateFields';
import { cn } from '../../../utils/cn';

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
    countries: Option[];
    countryFilter: string[];
    setCountryFilter: (v: string[]) => void;
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
    { value: 'all', label: 'All statuses' },
    { value: 'Past', label: 'Past' },
    { value: 'Upcoming', label: 'Upcoming' },
    { value: 'Planning', label: 'Planning' },
];

const SelectDropdown: React.FC<{
    label: string;
    value: string;
    options: { value: string; label: string }[];
    onChange: (value: string) => void;
}> = ({ label, value, options, onChange }) => {
    const id = useId();
    return (
        <div className="flex flex-col gap-1">
            <label htmlFor={id} className="px-1 text-xs text-rp-muted">{label}</label>
            <div className="relative">
                <select
                    id={id}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    className={cn(RP_FIELD, 'appearance-none pr-9 cursor-pointer')}
                >
                    {options.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                </select>
                <CaretDown
                    size={16}
                    aria-hidden
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-rp-muted"
                />
            </div>
        </div>
    );
};

/** Searchable dropdown menu with checkboxes; selected items stay pinned at the top. */
const MultiSelectDropdown: React.FC<{
    label: string;
    placeholder: string;
    searchPlaceholder: string;
    options: Option[];
    selected: string[];
    onChange: (v: string[]) => void;
}> = ({ label, placeholder, searchPlaceholder, options, selected, onChange }) => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const listId = useId();

    const selectedSet = useMemo(() => new Set(selected), [selected]);

    const sortedOptions = useMemo(() => {
        const needle = query.trim().toLowerCase();
        const picked = options.filter(o => selectedSet.has(o.value));
        const rest = options.filter(o => !selectedSet.has(o.value));
        const filterMatch = (o: Option) =>
            !needle || o.label.toLowerCase().includes(needle) || o.value.toLowerCase().includes(needle);
        return [...picked.filter(filterMatch), ...rest.filter(filterMatch)];
    }, [options, selectedSet, query]);

    const summary = useMemo(() => {
        if (selected.length === 0) return placeholder;
        const labels = selected
            .map(v => options.find(o => o.value === v)?.label ?? v);
        if (labels.length <= 2) return labels.join(', ');
        return `${labels[0]}, ${labels[1]} +${labels.length - 2}`;
    }, [selected, options, placeholder]);

    const toggle = (val: string) => {
        onChange(
            selectedSet.has(val)
                ? selected.filter(v => v !== val)
                : [...selected, val]
        );
    };

    return (
        <div className="flex flex-col gap-2 py-1">
            <button
                type="button"
                aria-expanded={open}
                aria-controls={listId}
                aria-label={label}
                onClick={() => setOpen(o => !o)}
                className={cn(
                    'flex min-h-11 w-full items-center justify-between gap-2 rounded-rp-inset bg-rp-surface px-3.5 text-left text-sm transition-colors',
                    'outline-none focus-visible:ring-2 focus-visible:ring-rp-muted',
                    selected.length > 0 ? 'font-medium text-rp-ink' : 'text-rp-muted'
                )}
            >
                <span className="min-w-0 flex-1 truncate">{summary}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                    {selected.length > 0 ? (
                        <span className="rounded-full bg-rp-ink px-2 py-0.5 text-xs font-medium text-rp-on-ink rp-tabular">
                            {selected.length}
                        </span>
                    ) : null}
                    <CaretDown
                        size={16}
                        aria-hidden
                        className={cn('text-rp-muted transition-transform duration-150', open && 'rotate-180')}
                    />
                </span>
            </button>

            {open ? (
                <div
                    id={listId}
                    className="overflow-hidden rounded-rp-inset border border-rp-line bg-rp-surface"
                >
                    <label className="flex min-h-11 items-center gap-2 border-b border-rp-line px-3">
                        <MagnifyingGlass size={15} className="shrink-0 text-rp-muted" aria-hidden />
                        <span className="sr-only">Search {label}</span>
                        <input
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder={searchPlaceholder}
                            className="min-w-0 flex-1 bg-transparent text-sm text-rp-ink outline-none placeholder:text-rp-muted"
                        />
                        {query ? (
                            <button
                                type="button"
                                onClick={() => setQuery('')}
                                aria-label="Clear search"
                                className="inline-flex size-7 items-center justify-center rounded-full text-rp-muted hover:bg-rp-inset hover:text-rp-ink"
                            >
                                <X size={14} />
                            </button>
                        ) : null}
                    </label>
                    <div className="max-h-52 overflow-y-auto custom-scrollbar divide-y divide-rp-line/40">
                        {sortedOptions.map(o => {
                            const checked = selectedSet.has(o.value);
                            return (
                                <label
                                    key={o.value}
                                    className={cn(
                                        'flex min-h-11 cursor-pointer items-center gap-2.5 px-3.5 py-2 text-sm transition-colors hover:bg-rp-inset/70',
                                        checked ? 'font-medium text-rp-ink' : 'text-rp-ink'
                                    )}
                                >
                                    <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggle(o.value)}
                                        className="size-4 shrink-0 cursor-pointer rounded accent-rp-ink"
                                    />
                                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                                </label>
                            );
                        })}
                        {sortedOptions.length === 0 ? (
                            <p className="px-3.5 py-3 text-sm text-rp-muted">No matches</p>
                        ) : null}
                    </div>
                </div>
            ) : null}
        </div>
    );
};

export const MapFilterSheet: React.FC<MapFilterSheetProps> = props => {
    const { open, onClose, topOffset, activeFilterCount, onClear } = props;
    const yearOptions = useMemo(
        () => [{ value: 'all', label: 'All years' }, ...props.years.map(y => ({ value: y, label: y }))],
        [props.years]
    );

    const clearAction = (count: number, clear: () => void, label: string) =>
        count > 0 ? (
            <button
                type="button"
                onClick={clear}
                className="text-xs font-medium text-rp-muted hover:text-rp-ink"
                aria-label={`Clear ${label} filter`}
            >
                Clear ({count})
            </button>
        ) : null;

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
                <RpSection icon={Calendar} title="Trip">
                    <div className={cn('grid gap-2 py-2', props.years.length > 0 ? 'grid-cols-2' : 'grid-cols-1')}>
                        <SelectDropdown
                            label="Status"
                            value={props.statusFilter}
                            options={STATUSES}
                            onChange={v => props.setStatusFilter(v as Status)}
                        />
                        {props.years.length > 0 ? (
                            <SelectDropdown
                                label="Year"
                                value={props.yearFilter}
                                options={yearOptions}
                                onChange={props.setYearFilter}
                            />
                        ) : null}
                    </div>
                </RpSection>

                <RpSection
                    icon={Globe}
                    title="Country"
                    action={clearAction(props.countryFilter.length, () => props.setCountryFilter([]), 'country')}
                >
                    <MultiSelectDropdown
                        label="Country"
                        placeholder="Any country"
                        searchPlaceholder="Search countries"
                        options={props.countries}
                        selected={props.countryFilter}
                        onChange={props.setCountryFilter}
                    />
                    <p className="px-1 pb-1 text-xs text-rp-muted">
                        Shows routes from, to, and within selected countries.
                    </p>
                </RpSection>

                <RpSection
                    icon={AirplaneTakeoff}
                    title="From"
                    action={clearAction(props.depFilter.length, () => props.setDepFilter([]), 'origin')}
                >
                    <MultiSelectDropdown
                        label="From"
                        placeholder="Any airport or city"
                        searchPlaceholder="Search origin"
                        options={props.origins}
                        selected={props.depFilter}
                        onChange={props.setDepFilter}
                    />
                </RpSection>

                <RpSection
                    icon={AirplaneLanding}
                    title="To"
                    action={clearAction(props.arrFilter.length, () => props.setArrFilter([]), 'destination')}
                >
                    <MultiSelectDropdown
                        label="To"
                        placeholder="Any airport or city"
                        searchPlaceholder="Search destination"
                        options={props.destinations}
                        selected={props.arrFilter}
                        onChange={props.setArrFilter}
                    />
                </RpSection>

                <RpSection icon={CalendarBlank} title="Dates">
                    <div className="grid grid-cols-2 gap-2 py-2">
                        <div className="flex flex-col gap-1">
                            <span className="px-1 text-xs text-rp-muted">From</span>
                            <RpDatePicker label="From" value={props.dateFrom} max={props.dateTo || undefined} onChange={props.setDateFrom} placeholder="Any" clearable className="rounded-full px-4" />
                        </div>
                        <div className="flex flex-col gap-1">
                            <span className="px-1 text-xs text-rp-muted">To</span>
                            <RpDatePicker label="To" value={props.dateTo} min={props.dateFrom || undefined} onChange={props.setDateTo} placeholder="Any" clearable className="rounded-full px-4" />
                        </div>
                    </div>
                </RpSection>
            </div>
        </RpSheet>
    );
};
