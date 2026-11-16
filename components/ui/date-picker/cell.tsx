import { getDayOfWeek, getLocalTimeZone, isToday } from '@internationalized/date';
import type { CalendarCellProps as AriaCalendarCellProps } from 'react-aria-components';
import { CalendarCell as AriaCalendarCell, RangeCalendarContext, useLocale, useSlottedContext } from 'react-aria-components';
import { cn } from '../../../utils/cn';
import { usePickerPrefs } from './prefs';

/** Untitled UI `application/date-picker/cell`, on the New pages' tokens, 44px square. */
interface CalendarCellProps extends AriaCalendarCellProps {
    /** Whether the cell is highlighted (a dot under the day). */
    isHighlighted?: boolean;
    /** Whether to show days of the next and previous month in a range calendar. */
    showOutOfRangeDates?: boolean;
}

export const CalendarCell = ({ date, isHighlighted, showOutOfRangeDates = false, ...props }: CalendarCellProps) => {
    const { locale } = useLocale();
    const { firstDayOfWeek } = usePickerPrefs();
    const dayOfWeek = getDayOfWeek(date, locale, firstDayOfWeek);
    const rangeCalendarContext = useSlottedContext(RangeCalendarContext);

    const isRangeCalendar = !!rangeCalendarContext;

    const start = rangeCalendarContext?.value?.start;
    const end = rangeCalendarContext?.value?.end;

    const isAfterStart = start ? date.compare(start) > 0 : true;
    const isBeforeEnd = end ? date.compare(end) < 0 : true;

    const isAfterOrOnStart = start && date.compare(start) >= 0;
    const isBeforeOrOnEnd = end && date.compare(end) <= 0;
    const isInRange = isAfterOrOnStart && isBeforeOrOnEnd;

    const lastDayOfMonth = new Date(date.year, date.month, 0).getDate();
    const isLastDayOfMonth = date.day === lastDayOfMonth;
    const isFirstDayOfMonth = date.day === 1;

    const isTodayDate = isToday(date, getLocalTimeZone());

    return (
        <AriaCalendarCell
            {...props}
            date={date}
            className={({ isDisabled, isFocusVisible, isSelectionStart, isSelectionEnd, isSelected, isOutsideMonth }) => {
                const isRoundedLeft = isSelectionStart || dayOfWeek === 0;
                const isRoundedRight = isSelectionEnd || dayOfWeek === 6;

                return cn(
                    'relative size-11 outline-none',
                    isRoundedLeft && 'rounded-l-full',
                    isRoundedRight && 'rounded-r-full',
                    isInRange && isDisabled && 'bg-rp-inset',
                    isSelected && isRangeCalendar && 'bg-rp-inset',
                    isDisabled ? 'pointer-events-none' : 'cursor-pointer',
                    isFocusVisible ? 'z-raised' : 'z-0',
                    isOutsideMonth && 'opacity-50',
                    isRangeCalendar && isOutsideMonth && !showOutOfRangeDates && 'hidden',

                    // Fade the range out past the last day of the month while it continues.
                    isLastDayOfMonth && isSelected && isBeforeEnd && isRangeCalendar &&
                        'after:absolute after:inset-0 after:translate-x-full after:bg-gradient-to-l after:from-transparent after:to-rp-inset [[role=gridcell]:last-child_&]:after:hidden',

                    // Fade the range in before the first day of the month when it started earlier.
                    isFirstDayOfMonth && isSelected && isAfterStart && isRangeCalendar &&
                        'after:absolute after:inset-0 after:-translate-x-full after:bg-gradient-to-r after:from-transparent after:to-rp-inset [[role=gridcell]:first-child_&]:after:hidden'
                );
            }}
        >
            {({ isDisabled, isUnavailable, isFocusVisible, isSelectionStart, isSelectionEnd, isSelected, formattedDate }) => {
                const markedAsSelected = isSelectionStart || isSelectionEnd || (isSelected && !isDisabled && !isRangeCalendar);

                return (
                    <div
                        className={cn(
                            'rp-tabular relative flex size-full items-center justify-center rounded-full text-sm text-rp-ink',
                            (isDisabled || isUnavailable) && 'text-rp-muted/60',
                            isUnavailable && 'line-through',
                            isFocusVisible && 'ring-2 ring-rp-muted ring-offset-2 ring-offset-rp-surface',
                            isSelected && !isDisabled && isRangeCalendar && 'font-medium',
                            markedAsSelected && 'bg-rp-ink font-medium text-rp-on-ink hover:bg-rp-ink/90',
                            !isSelected && !isDisabled && 'hover:bg-rp-inset hover:font-medium',
                            !isSelected && isTodayDate && 'bg-rp-inset font-medium'
                        )}
                    >
                        {formattedDate}

                        {isHighlighted || isTodayDate ? (
                            <div
                                aria-hidden
                                className={cn(
                                    'absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full',
                                    markedAsSelected ? 'bg-rp-on-ink' : 'bg-rp-rust',
                                    isDisabled && 'opacity-50'
                                )}
                            />
                        ) : null}
                    </div>
                );
            }}
        </AriaCalendarCell>
    );
};
