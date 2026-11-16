import type { ReactNode, RefObject } from 'react';
import { Dialog as AriaDialog, Popover as AriaPopover } from 'react-aria-components';
import { cn } from '../../../utils/cn';

/**
 * The popover and dialog shared by DatePicker and DateRangePicker. It carries `rp-root` because it is portalled
 * out of the page, and the New pages' colour variables are scoped to that class. Inside a phone bottom sheet
 * (Vaul) it is portalled into the sheet instead, so a tap on the calendar is not a tap outside the sheet.
 */
export const PickerPopover = ({ triggerRef, label, className, children }: {
    triggerRef: RefObject<HTMLElement | null>;
    label: string;
    className?: string;
    children: ReactNode | ((opts: { close: () => void }) => ReactNode);
}) => {
    const sheet = triggerRef.current?.closest('[data-vaul-drawer]') ?? undefined;
    return (
        <AriaPopover
            offset={8}
            placement="bottom end"
            UNSTABLE_portalContainer={sheet}
            className={({ isEntering, isExiting }) =>
                cn(
                    'rp-root font-rp text-rp-ink outline-none',
                    'motion-safe:transition motion-safe:duration-150 motion-safe:ease-out',
                    (isEntering || isExiting) && 'opacity-0 motion-safe:scale-[0.98]'
                )
            }
        >
            <AriaDialog aria-label={label} className={cn('rounded-rp-card bg-rp-surface ring-1 ring-rp-line rp-shadow-float outline-none', className)}>
                {children}
            </AriaDialog>
        </AriaPopover>
    );
};

/** The trigger style: a 44px field like RP_FIELD, with the calendar icon on the left. */
export const TRIGGER =
    'rp-tabular flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-rp-inset bg-rp-surface px-3 text-left text-sm text-rp-ink outline-none transition-colors';
