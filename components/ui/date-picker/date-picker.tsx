import { useRef, useState } from 'react';
import { getLocalTimeZone, today } from '@internationalized/date';
import type { DatePickerProps as AriaDatePickerProps, DateValue } from 'react-aria-components';
import { Button as AriaButton, DatePicker as AriaDatePicker, Group as AriaGroup } from 'react-aria-components';
import { CalendarBlank } from '../hugeicons';
import { cn } from '../../../utils/cn';
import { formatDate } from '../../../utils/formatters';
import { toIso } from '../../../utils/datePicker';
import { PickerButton } from './button';
import { Calendar } from './calendar';
import { PickerPopover, TRIGGER } from './popover';
import { PickerPrefsProvider, usePickerPrefs } from './prefs';

/**
 * Untitled UI `application/date-picker/date-picker` (their DatePickerControlledDemo): a trigger showing the date,
 * a calendar in a popover, and Cancel / Apply. The date picked in the calendar is a draft until Apply; Cancel,
 * Escape or a tap outside keep the old value. The trigger shows the date in the format chosen in Settings.
 */
export interface DatePickerProps extends Omit<AriaDatePickerProps<DateValue>, 'children' | 'className' | 'onChange'> {
    onChange?: (value: DateValue | null) => void;
    /** Called after Apply. */
    onApply?: () => void;
    /** Called after Cancel. */
    onCancel?: () => void;
    /** Text on the trigger when there is no date. */
    placeholder?: string;
    /** Adds a Clear button for optional dates. */
    clearable?: boolean;
    /** The trigger button's id (so a `<label htmlFor>` names it). */
    triggerId?: string;
    /** Extra classes for the trigger (its background, mostly). */
    triggerClassName?: string;
}

const highlightedDates = [today(getLocalTimeZone())];

const Picker = ({ value, defaultValue, onChange, onApply, onCancel, placeholder = 'Select date', clearable, triggerId, triggerClassName, ...props }: DatePickerProps) => {
    const { dateFormat } = usePickerPrefs();
    const triggerRef = useRef<HTMLButtonElement>(null);
    const [uncontrolled, setUncontrolled] = useState<DateValue | null>(defaultValue ?? null);
    const committed = value !== undefined ? value : uncontrolled;
    const [isOpen, setOpen] = useState(false);
    const [draft, setDraft] = useState<DateValue | null>(committed);

    const commit = (next: DateValue | null) => {
        if (value === undefined) setUncontrolled(next);
        onChange?.(next);
    };
    const openChange = (open: boolean) => {
        if (open) setDraft(committed);
        setOpen(open);
    };

    const label = committed ? formatDate(toIso(committed), 'numeric', dateFormat) : null;

    return (
        <AriaDatePicker
            aria-label="Date picker"
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
            <PickerPopover triggerRef={triggerRef} label={props['aria-label'] ?? 'Date picker'}>
                {({ close }) => (
                    <>
                        <div className="flex px-4 py-4">
                            <Calendar highlightedDates={highlightedDates} />
                        </div>
                        <div className="flex gap-3 border-t border-rp-line p-4">
                            {clearable ? (
                                <PickerButton color="link" onPress={() => { commit(null); close(); }} isDisabled={!committed && !draft}>Clear</PickerButton>
                            ) : null}
                            <div className="grid flex-1 grid-cols-2 gap-3">
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
                    </>
                )}
            </PickerPopover>
        </AriaDatePicker>
    );
};

export const DatePicker = (props: DatePickerProps) => (
    <PickerPrefsProvider>
        <Picker {...props} />
    </PickerPrefsProvider>
);
