import { useRef, useState } from 'react';
import { endOfMonth, endOfWeek, getLocalTimeZone, startOfMonth, startOfWeek, today } from '@internationalized/date';
import type { DateRangePickerProps as AriaDateRangePickerProps, DateValue } from 'react-aria-components';
import { Button as AriaButton, DateRangePicker as AriaDateRangePicker, Group as AriaGroup, useLocale } from 'react-aria-components';
import { CalendarBlank } from '../hugeicons';
import { cn } from '../../../utils/cn';
import { formatDateRange } from '../../../utils/formatters';
import { toIso, type FirstDayOfWeek } from '../../../utils/datePicker';
import { PickerButton } from './button';
import { InputDateBase } from './input-date';
import { PickerPopover, TRIGGER } from './popover';
import { PickerPrefsProvider, usePickerPrefs } from './prefs';
import { RangeCalendar, RangePresetButton, type RangePreset, type RangeValue } from './range-calendar';

/**
 * Untitled UI `application/date-picker/date-range-picker` (their DateRangePickerControlledDemo): a trigger showing
 * both dates, two months on desktop (one on phones), optional presets, typed start and end dates, and Cancel /
 * Apply. As with DatePicker, the range is a draft until Apply. Dates show in the format chosen in Settings.
 */
export interface DateRangePickerProps extends Omit<AriaDateRangePickerProps<DateValue>, 'children' | 'className' | 'onChange'> {
    onChange?: (value: RangeValue | null) => void;
    onApply?: () => void;
    onCancel?: () => void;
    /**
     * Ranges listed beside the calendar on desktop; the ones marked `mobile` also show above it on phones.
     * `'past'` is Untitled UI's look-back list (Today, Last week, This month…), for filters over past dates.
     */
    presets?: (RangePreset & { mobile?: boolean })[] | 'past';
    placeholder?: string;
    clearable?: boolean;
    triggerId?: string;
    triggerClassName?: string;
}

const highlightedDates = [today(getLocalTimeZone())];

/** Untitled UI's preset list (looking back from today), for filters over past dates. */
export const pastRangePresets = (locale: string, firstDayOfWeek: FirstDayOfWeek): (RangePreset & { mobile?: boolean })[] => {
    const now = today(getLocalTimeZone());
    const weekStart = startOfWeek(now, locale, firstDayOfWeek);
    const weekEnd = endOfWeek(now, locale, firstDayOfWeek);
    return [
        { label: 'Today', value: { start: now, end: now } },
        { label: 'Yesterday', value: { start: now.subtract({ days: 1 }), end: now.subtract({ days: 1 }) } },
        { label: 'This week', value: { start: weekStart, end: weekEnd } },
        { label: 'Last week', value: { start: weekStart.subtract({ weeks: 1 }), end: weekEnd.subtract({ weeks: 1 }) }, mobile: true },
        { label: 'This month', value: { start: startOfMonth(now), end: endOfMonth(now) } },
        { label: 'Last month', value: { start: startOfMonth(now).subtract({ months: 1 }), end: endOfMonth(now.subtract({ months: 1 })) }, mobile: true },
        { label: 'This year', value: { start: startOfMonth(now.set({ month: 1 })), end: endOfMonth(now.set({ month: 12 })) } },
        { label: 'Last year', value: { start: startOfMonth(now.set({ month: 1 }).subtract({ years: 1 })), end: endOfMonth(now.set({ month: 12 }).subtract({ years: 1 })) }, mobile: true },
    ];
};

const Picker = ({ value, defaultValue, onChange, onApply, onCancel, presets: presetsProp, placeholder = 'Select dates', clearable, triggerId, triggerClassName, ...props }: DateRangePickerProps) => {
    const { dateFormat, firstDayOfWeek } = usePickerPrefs();
    const { locale } = useLocale();
    const presets = presetsProp === 'past' ? pastRangePresets(locale, firstDayOfWeek) : presetsProp;
    const triggerRef = useRef<HTMLButtonElement>(null);
    const [uncontrolled, setUncontrolled] = useState<RangeValue | null>(defaultValue ?? null);
    const committed = value !== undefined ? value : uncontrolled;
    const [isOpen, setOpen] = useState(false);
    const [draft, setDraft] = useState<RangeValue | null>(committed);
    const [focusedValue, setFocusedValue] = useState<DateValue | undefined>(undefined);

    const commit = (next: RangeValue | null) => {
        if (value === undefined) setUncontrolled(next);
        onChange?.(next);
    };
    const openChange = (open: boolean) => {
        if (open) {
            setDraft(committed);
            setFocusedValue(committed?.start ?? undefined);
        }
        setOpen(open);
    };

    const label = committed ? formatDateRange(toIso(committed.start), toIso(committed.end), dateFormat) : null;
    const mobilePresets = presets?.filter(p => p.mobile);

    return (
        <AriaDateRangePicker
            aria-label="Date range picker"
            shouldCloseOnSelect={false}
            {...props}
            value={isOpen ? draft : committed}
            onChange={setDraft}
            isOpen={isOpen}
            onOpenChange={openChange}
        >
            <AriaGroup className="w-full">
                {({ isInvalid, isDisabled }) => (
                    <AriaButton
                        ref={triggerRef}
                        id={triggerId}
                        className={({ isFocusVisible, isHovered }) =>
                            cn(
                                TRIGGER,
                                isHovered && 'bg-rp-inset',
                                isFocusVisible && 'ring-2 ring-rp-muted',
                                isInvalid && 'ring-2 ring-rp-rust',
                                isDisabled && 'pointer-events-none opacity-50',
                                triggerClassName
                            )
                        }
                    >
                        <CalendarBlank size={18} className="shrink-0 text-rp-muted" aria-hidden />
                        <span className={cn('min-w-0 flex-1 truncate', !label && 'text-rp-muted')}>{label ?? placeholder}</span>
                    </AriaButton>
                )}
            </AriaGroup>
            <PickerPopover triggerRef={triggerRef} label={props['aria-label'] ?? 'Date range picker'} className="flex">
                {({ close }) => (
                    <>
                        {presets?.length ? (
                            <div className="hidden w-40 flex-col gap-0.5 border-r border-rp-line p-3 lg:flex">
                                {presets.map(preset => (
                                    <RangePresetButton
                                        key={preset.label}
                                        value={preset.value}
                                        onClick={() => {
                                            setDraft(preset.value);
                                            setFocusedValue(preset.value.start);
                                        }}
                                    >
                                        {preset.label}
                                    </RangePresetButton>
                                ))}
                            </div>
                        ) : null}
                        <div className="flex flex-col">
                            <RangeCalendar
                                focusedValue={focusedValue}
                                onFocusChange={setFocusedValue}
                                highlightedDates={highlightedDates}
                                presets={mobilePresets?.length ? Object.fromEntries(mobilePresets.map(p => [p.label, p])) : undefined}
                            />
                            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rp-line p-4">
                                <div className="hidden items-center gap-2 md:flex">
                                    <InputDateBase slot="start" aria-label="Start date" className="w-36" />
                                    <div className="text-sm text-rp-muted" aria-hidden>–</div>
                                    <InputDateBase slot="end" aria-label="End date" className="w-36" />
                                </div>
                                <div className="flex w-full items-center gap-3 md:w-auto">
                                    {clearable ? (
                                        <PickerButton color="link" onPress={() => { commit(null); close(); }} isDisabled={!committed && !draft}>Clear</PickerButton>
                                    ) : null}
                                    <div className="grid flex-1 grid-cols-2 gap-3 md:flex">
                                        <PickerButton color="secondary" onPress={() => { onCancel?.(); close(); }}>Cancel</PickerButton>
                                        <PickerButton
                                            color="primary"
                                            onPress={() => {
                                                commit(draft);
                                                onApply?.();
                                                close();
                                            }}
                                        >
                                            Apply
                                        </PickerButton>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </PickerPopover>
        </AriaDateRangePicker>
    );
};

export const DateRangePicker = (props: DateRangePickerProps) => (
    <PickerPrefsProvider>
        <Picker {...props} />
    </PickerPrefsProvider>
);
