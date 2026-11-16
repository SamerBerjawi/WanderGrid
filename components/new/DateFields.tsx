import React from 'react';
import type { DateValue } from '@internationalized/date';
import { DatePicker } from '../ui/date-picker/date-picker';
import { DateRangePicker } from '../ui/date-picker/date-range-picker';
import { toDateValue, toIso } from '../../utils/datePicker';

/**
 * The date fields of the New pages: the Untitled UI pickers (components/ui/date-picker) with the app's stored
 * ISO `YYYY-MM-DD` strings in and out. `id` goes on the trigger, so `RpField`'s label names it.
 */

interface Common {
    id?: string;
    /** The accessible name (the visible label's text). */
    label: string;
    /** Earliest and latest allowed day, ISO. */
    min?: string;
    max?: string;
    /** Days that cannot be picked, ISO. */
    isDateUnavailable?: (iso: string) => boolean;
    /** Optional dates get a Clear button. */
    clearable?: boolean;
    placeholder?: string;
    isDisabled?: boolean;
    className?: string;
}

const bounds = ({ min, max, isDateUnavailable }: Pick<Common, 'min' | 'max' | 'isDateUnavailable'>) => ({
    minValue: toDateValue(min) ?? undefined,
    maxValue: toDateValue(max) ?? undefined,
    isDateUnavailable: isDateUnavailable ? (d: DateValue) => isDateUnavailable(toIso(d)) : undefined,
});

export const RpDatePicker: React.FC<Common & { value: string | null | undefined; onChange: (iso: string) => void }> = ({
    id, label, value, onChange, min, max, isDateUnavailable, clearable, placeholder, isDisabled, className,
}) => (
    <DatePicker
        aria-label={label}
        triggerId={id}
        triggerClassName={className}
        value={toDateValue(value)}
        onChange={v => onChange(toIso(v))}
        clearable={clearable}
        placeholder={placeholder}
        isDisabled={isDisabled}
        {...bounds({ min, max, isDateUnavailable })}
    />
);

export type IsoRange = { start: string; end: string };

export const RpDateRangePicker: React.FC<Common & {
    value: { start?: string | null; end?: string | null };
    onChange: (range: IsoRange) => void;
    /** Untitled UI's look-back presets (Today, Last week, This month…), for filters over past dates. */
    pastPresets?: boolean;
}> = ({ id, label, value, onChange, min, max, isDateUnavailable, clearable, placeholder, isDisabled, className, pastPresets }) => {
    const start = toDateValue(value.start);
    const end = toDateValue(value.end) ?? start;
    return (
        <DateRangePicker
            aria-label={label}
            triggerId={id}
            triggerClassName={className}
            value={start && end ? { start, end } : null}
            onChange={v => onChange(v ? { start: toIso(v.start), end: toIso(v.end) } : { start: '', end: '' })}
            presets={pastPresets ? 'past' : undefined}
            clearable={clearable}
            placeholder={placeholder}
            isDisabled={isDisabled}
            {...bounds({ min, max, isDateUnavailable })}
        />
    );
};
