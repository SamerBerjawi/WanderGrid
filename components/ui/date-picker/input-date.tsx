import type { DateInputProps as AriaDateInputProps } from 'react-aria-components';
import { DateInput as AriaDateInput, DateSegment as AriaDateSegment, Group as AriaGroup } from 'react-aria-components';
import { cn } from '../../../utils/cn';

/**
 * Untitled UI `base/input/input-date` (`InputDateBase`): the typed date inside a picker's popover, one segment per
 * part. The segment order follows the date format chosen in Settings (PickerPrefsProvider sets the locale).
 * The tooltip, shortcut and leading-icon options are left out: the pickers do not use them.
 */
export const InputDateBase = ({ className, ...inputProps }: Omit<AriaDateInputProps, 'children' | 'className'> & { className?: string }) => (
    <AriaGroup
        className={({ isFocusWithin, isDisabled, isInvalid }) =>
            cn(
                'relative flex min-h-11 w-full items-center rounded-rp-inset bg-rp-inset ring-1 ring-inset ring-rp-line transition-shadow duration-100',
                isFocusWithin && !isDisabled && 'ring-2 ring-rp-muted',
                isDisabled && 'cursor-not-allowed opacity-50',
                isInvalid && 'ring-rp-rust',
                className
            )
        }
    >
        <AriaDateInput {...inputProps} className="flex w-full px-3 text-sm">
            {segment => (
                <AriaDateSegment
                    segment={segment}
                    className={cn(
                        'rp-tabular rounded px-0.5 text-rp-ink caret-transparent outline-none focus:bg-rp-ink focus:font-medium focus:text-rp-on-ink',
                        segment.isPlaceholder && 'uppercase text-rp-muted',
                        segment.type === 'literal' && 'text-rp-muted'
                    )}
                />
            )}
        </AriaDateInput>
    </AriaGroup>
);
