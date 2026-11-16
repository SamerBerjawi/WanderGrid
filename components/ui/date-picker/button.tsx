import type { ButtonProps as AriaButtonProps } from 'react-aria-components';
import { Button as AriaButton } from 'react-aria-components';
import type { Icon } from '../hugeicons';
import { cn } from '../../../utils/cn';

/**
 * The few Untitled UI button styles the date pickers use (base/buttons/button), drawn with the New pages'
 * tokens: an ink pill (primary), an inset pill (secondary), a ghost circle (tertiary, the month arrows) and a
 * text link (the phone range presets). Every one is at least 44px tall.
 */
const COLORS = {
    primary: 'rounded-full bg-rp-ink px-5 text-rp-on-ink hover:bg-rp-ink/90',
    secondary: 'rounded-full bg-rp-inset px-5 text-rp-ink hover:bg-rp-line',
    tertiary: 'size-11 rounded-full text-rp-ink hover:bg-rp-inset',
    link: 'px-1 text-rp-ink underline-offset-4 hover:underline',
} as const;

export interface PickerButtonProps extends Omit<AriaButtonProps, 'className' | 'children'> {
    color?: keyof typeof COLORS;
    iconLeading?: Icon;
    className?: string;
    children?: React.ReactNode;
}

export const PickerButton = ({ color = 'secondary', iconLeading: IconC, className, children, ...props }: PickerButtonProps) => (
    <AriaButton
        {...props}
        className={({ isFocusVisible, isDisabled }) =>
            cn(
                'inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap text-sm font-medium outline-none transition-colors duration-150',
                COLORS[color],
                isFocusVisible && 'ring-2 ring-rp-muted ring-offset-2 ring-offset-rp-surface',
                isDisabled && 'pointer-events-none opacity-40',
                className
            )
        }
    >
        {IconC ? <IconC size={20} aria-hidden /> : null}
        {children}
    </AriaButton>
);
