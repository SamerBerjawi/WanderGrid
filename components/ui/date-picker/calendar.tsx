import type { PropsWithChildren, ReactNode } from 'react';
import { Fragment, useState } from 'react';
import { getLocalTimeZone, today } from '@internationalized/date';
import type { CalendarProps as AriaCalendarProps, DateValue } from 'react-aria-components';
import {
    Calendar as AriaCalendar,
    CalendarContext as AriaCalendarContext,
    CalendarGrid as AriaCalendarGrid,
    CalendarGridBody as AriaCalendarGridBody,
    CalendarGridHeader as AriaCalendarGridHeader,
    CalendarHeaderCell as AriaCalendarHeaderCell,
    Heading as AriaHeading,
    useSlottedContext,
} from 'react-aria-components';
import { CaretLeft, CaretRight } from '../hugeicons';
import { cn } from '../../../utils/cn';
import { PickerButton } from './button';
import { CalendarCell } from './cell';
import { InputDateBase } from './input-date';
import { usePickerPrefs } from './prefs';

/** Untitled UI `application/date-picker/calendar`: a month grid with a typed date and a Today button. */
export const CalendarContextProvider = ({ children }: PropsWithChildren) => {
    const [value, setValue] = useState<DateValue | null>(null);
    const [focusedValue, onFocusChange] = useState<DateValue | undefined>();

    // React Aria's Calendar context also allows multiple selection; this calendar is single-select.
    const onChange = (next: DateValue | readonly DateValue[] | null) => {
        setValue(Array.isArray(next) ? (next[0] ?? null) : (next as DateValue | null));
    };

    return <AriaCalendarContext.Provider value={{ value, onChange, focusedValue, onFocusChange }}>{children}</AriaCalendarContext.Provider>;
};

interface CalendarProps extends AriaCalendarProps<DateValue> {
    /** The dates to highlight. */
    highlightedDates?: DateValue[];
    /** Content between the header and the grid; by default a typed date and a Today button. */
    children?: ReactNode;
}

export const Calendar = ({ highlightedDates, className, children, ...props }: CalendarProps) => {
    const context = useSlottedContext(AriaCalendarContext);
    const { firstDayOfWeek } = usePickerPrefs();

    const ContextWrapper = context ? Fragment : CalendarContextProvider;

    return (
        <ContextWrapper>
            <AriaCalendar
                firstDayOfWeek={firstDayOfWeek}
                {...props}
                className={state => cn('flex flex-col gap-3', typeof className === 'function' ? className(state) : className)}
            >
                {({ state }) => (
                    <>
                        <header className="flex items-center justify-between">
                            <PickerButton slot="previous" iconLeading={CaretLeft} color="tertiary" aria-label="Previous month" />
                            <AriaHeading className="text-sm font-semibold text-rp-ink" />
                            <PickerButton slot="next" iconLeading={CaretRight} color="tertiary" aria-label="Next month" />
                        </header>

                        {children || (
                            <div className="flex gap-3">
                                <InputDateBase aria-label="Date" className="flex-1" />
                                <PickerButton
                                    slot={null}
                                    color="secondary"
                                    isDisabled={state.isInvalid(today(getLocalTimeZone()))}
                                    onPress={() => {
                                        state.setValue(today(getLocalTimeZone()));
                                        state.setFocusedDate(today(getLocalTimeZone()));
                                    }}
                                >
                                    Today
                                </PickerButton>
                            </div>
                        )}

                        <AriaCalendarGrid weekdayStyle="short" className="w-max">
                            <AriaCalendarGridHeader className="border-b-4 border-transparent">
                                {day => (
                                    <AriaCalendarHeaderCell className="p-0">
                                        <div className="flex size-11 items-center justify-center text-xs font-semibold text-rp-muted">{day.slice(0, 2)}</div>
                                    </AriaCalendarHeaderCell>
                                )}
                            </AriaCalendarGridHeader>
                            <AriaCalendarGridBody className="[&_td]:p-0 [&_tr]:border-b-4 [&_tr]:border-transparent [&_tr:last-of-type]:border-none">
                                {date => <CalendarCell date={date} isHighlighted={highlightedDates?.some(d => date.compare(d) === 0)} />}
                            </AriaCalendarGridBody>
                        </AriaCalendarGrid>
                    </>
                )}
            </AriaCalendar>
        </ContextWrapper>
    );
};
