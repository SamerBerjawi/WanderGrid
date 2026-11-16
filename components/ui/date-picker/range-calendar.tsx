import type { HTMLAttributes, PropsWithChildren } from 'react';
import { Fragment, useContext, useState } from 'react';
import type { CalendarDate } from '@internationalized/date';
import { useDateFormatter } from 'react-aria';
import type { RangeCalendarProps as AriaRangeCalendarProps, DateValue } from 'react-aria-components';
import {
    CalendarGrid as AriaCalendarGrid,
    CalendarGridBody as AriaCalendarGridBody,
    CalendarGridHeader as AriaCalendarGridHeader,
    CalendarHeaderCell as AriaCalendarHeaderCell,
    RangeCalendar as AriaRangeCalendar,
    RangeCalendarContext,
    RangeCalendarStateContext,
    useSlottedContext,
} from 'react-aria-components';
import { CaretLeft, CaretRight } from '../hugeicons';
import { cn } from '../../../utils/cn';
import { PickerButton } from './button';
import { CalendarCell } from './cell';
import { InputDateBase } from './input-date';
import { usePickerPrefs } from './prefs';
import { useMinWidth } from './useMinWidth';

/** Untitled UI `application/date-picker/range-calendar`: one month on phones, two side by side from 768px. */
export type RangeValue = { start: DateValue; end: DateValue };
export type RangePreset = { label: string; value: RangeValue };

export const RangeCalendarContextProvider = ({ children }: PropsWithChildren) => {
    const [value, onChange] = useState<RangeValue | null>(null);
    const [focusedValue, onFocusChange] = useState<DateValue | undefined>();

    return <RangeCalendarContext.Provider value={{ value, onChange, focusedValue, onFocusChange }}>{children}</RangeCalendarContext.Provider>;
};

const RangeCalendarTitle = ({ part }: { part: 'start' | 'end' }) => {
    const context = useContext(RangeCalendarStateContext);
    if (!context) throw new Error('<RangeCalendarTitle /> must be used within a <RangeCalendar /> component.');

    const formatter = useDateFormatter({
        month: 'long',
        year: 'numeric',
        calendar: context.visibleRange.start.calendar.identifier,
        timeZone: context.timeZone,
    });

    return part === 'start'
        ? formatter.format(context.visibleRange.start.toDate(context.timeZone))
        : formatter.format(context.visibleRange.end.toDate(context.timeZone));
};

interface RangePresetButtonProps extends HTMLAttributes<HTMLButtonElement> {
    /** The range applied when the preset is pressed; the button is highlighted while it is the selected range. */
    value: RangeValue;
}

export const RangePresetButton = ({ value, className, children, ...props }: RangePresetButtonProps) => {
    const context = useSlottedContext(RangeCalendarContext);
    const isSelected = context?.value?.start?.compare(value.start) === 0 && context?.value?.end?.compare(value.end) === 0;

    return (
        <button
            type="button"
            {...props}
            aria-pressed={isSelected}
            className={cn(
                'min-h-11 cursor-pointer rounded-full px-3 text-left text-sm font-medium outline-none transition-colors duration-100 focus-visible:ring-2 focus-visible:ring-rp-muted',
                isSelected ? 'bg-rp-ink text-rp-on-ink' : 'text-rp-ink hover:bg-rp-inset',
                className
            )}
        >
            {children}
        </button>
    );
};

const MobilePresetButton = ({ value, children }: { value: RangeValue; children: React.ReactNode }) => {
    const context = useContext(RangeCalendarStateContext);
    return (
        <PickerButton
            slot={null}
            color="link"
            onPress={() => {
                context?.setValue(value);
                context?.setFocusedDate(value.start as CalendarDate);
            }}
        >
            {children}
        </PickerButton>
    );
};

interface RangeCalendarProps extends AriaRangeCalendarProps<DateValue> {
    /** The dates to highlight. */
    highlightedDates?: DateValue[];
    /** The presets shown above the grid on phones (the picker lists them beside the grid on desktop). */
    presets?: Record<string, RangePreset>;
    /** Whether to show days of the next and previous month. */
    showOutOfRangeDates?: boolean;
    /** Whether to show the presets above the grid on desktop too. */
    showPresetsOnDesktop?: boolean;
}

const Grid = ({ offset, showOutOfRangeDates, highlightedDates }: { offset?: { months: number }; showOutOfRangeDates?: boolean; highlightedDates?: DateValue[] }) => (
    <AriaCalendarGrid weekdayStyle="short" offset={offset} className="w-max">
        <AriaCalendarGridHeader>
            {day => (
                <AriaCalendarHeaderCell className="border-b-4 border-transparent p-0">
                    <div className="flex size-11 items-center justify-center text-xs font-semibold text-rp-muted">{day.slice(0, 2)}</div>
                </AriaCalendarHeaderCell>
            )}
        </AriaCalendarGridHeader>
        <AriaCalendarGridBody className="[&_td]:p-0 [&_tr]:border-b-4 [&_tr]:border-transparent [&_tr:last-of-type]:border-none">
            {date => <CalendarCell date={date} showOutOfRangeDates={showOutOfRangeDates} isHighlighted={highlightedDates?.some(d => date.compare(d) === 0)} />}
        </AriaCalendarGridBody>
    </AriaCalendarGrid>
);

export const RangeCalendar = ({ presets, visibleDuration, showOutOfRangeDates = false, showPresetsOnDesktop = false, highlightedDates, ...props }: RangeCalendarProps) => {
    const isDesktop = useMinWidth(768);
    const context = useSlottedContext(RangeCalendarContext);
    const { firstDayOfWeek } = usePickerPrefs();

    const ContextWrapper = context ? Fragment : RangeCalendarContextProvider;

    const visibleDurationMonths = visibleDuration?.months || (isDesktop ? 2 : 1);

    return (
        <ContextWrapper>
            <AriaRangeCalendar
                firstDayOfWeek={firstDayOfWeek}
                {...props}
                className={state => cn('flex', typeof props.className === 'function' ? props.className(state) : props.className)}
                visibleDuration={{ months: visibleDurationMonths }}
            >
                <div className="flex flex-col gap-3 px-4 py-4 md:gap-2">
                    <header className={cn('relative flex items-center', visibleDurationMonths > 1 ? 'justify-start' : 'justify-between')}>
                        <PickerButton slot="previous" iconLeading={CaretLeft} color="tertiary" aria-label="Previous month" />
                        <h2 className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-sm font-semibold text-rp-ink">
                            <RangeCalendarTitle part="start" />
                        </h2>
                        {visibleDurationMonths === 1 ? <PickerButton slot="next" iconLeading={CaretRight} color="tertiary" aria-label="Next month" /> : null}
                    </header>

                    {!isDesktop ? (
                        <div className="flex items-center gap-2">
                            <InputDateBase slot="start" aria-label="Start date" className="flex-1" />
                            <div className="text-sm text-rp-muted" aria-hidden>–</div>
                            <InputDateBase slot="end" aria-label="End date" className="flex-1" />
                        </div>
                    ) : null}

                    {(showPresetsOnDesktop || !isDesktop) && presets ? (
                        <div className="flex flex-wrap justify-between gap-x-3 px-1">
                            {Object.values(presets).map(preset => (
                                <MobilePresetButton key={preset.label} value={preset.value}>{preset.label}</MobilePresetButton>
                            ))}
                        </div>
                    ) : null}

                    <Grid showOutOfRangeDates={showOutOfRangeDates} highlightedDates={highlightedDates} />
                </div>

                {visibleDurationMonths > 1 ? (
                    <div className="flex flex-col gap-2 border-l border-rp-line px-4 py-4">
                        <header className="relative flex items-center justify-end">
                            <h2 className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-sm font-semibold text-rp-ink">
                                <RangeCalendarTitle part="end" />
                            </h2>
                            <PickerButton slot="next" iconLeading={CaretRight} color="tertiary" aria-label="Next month" />
                        </header>
                        <Grid offset={{ months: 1 }} highlightedDates={highlightedDates} />
                    </div>
                ) : null}
            </AriaRangeCalendar>
        </ContextWrapper>
    );
};
