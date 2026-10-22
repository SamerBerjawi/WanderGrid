import React from 'react';
import type { Transport } from '../../../types';
import { AirplaneLanding, AirplaneTilt, CheckCircle, Clock, XCircle, type Icon } from '../../ui/hugeicons';
import { RpLogo } from '../ui';
import { modeLook } from '../trips/transportModes';
import { carrierLabel, type JourneyState, type JourneyStatus } from '../../../utils/journeysModel';
import { cn } from '../../../utils/cn';
import type { Carrier } from '../../../types';

/** Small pieces shared by the journey table, board and sheet (Flights now, Road trips next). */

interface StatusLook { icon: Icon; pill: string; /** The colour a filled card takes for this state. */ fill: string; fillText: string }

/**
 * One colour per state, as everywhere on the New pages: green is booked and coming, ink is under way,
 * white with a tick is done, rust is cancelled (decision 3). Class names are written out for Tailwind.
 */
export const STATUS_LOOK: Record<JourneyState, StatusLook> = {
    scheduled: { icon: Clock, pill: 'bg-rp-green text-rp-paper', fill: 'bg-rp-green', fillText: 'text-rp-paper' },
    travelling: { icon: AirplaneTilt, pill: 'bg-rp-ink text-rp-on-ink', fill: 'bg-rp-ink', fillText: 'text-rp-on-ink' },
    done: { icon: CheckCircle, pill: 'bg-rp-inset text-rp-ink', fill: 'bg-rp-surface', fillText: 'text-rp-ink' },
    cancelled: { icon: XCircle, pill: 'bg-rp-rust text-rp-paper', fill: 'bg-rp-rust', fillText: 'text-rp-paper' },
};

export const StatusPill: React.FC<{ status: JourneyStatus; className?: string; mode?: Transport['mode'] }> = ({ status, className, mode }) => {
    const look = STATUS_LOOK[status.state];
    const Glyph = status.state === 'done' && mode === 'Flight' ? AirplaneLanding : look.icon;
    return (
        <span className={cn('inline-flex min-h-6 items-center gap-1 whitespace-nowrap rounded-full pr-2.5 pl-2 text-2xs font-semibold', look.pill, className)}>
            <Glyph size={12} className={status.state === 'done' ? 'text-rp-green' : undefined} aria-hidden />
            {status.label}
        </span>
    );
};

/** "+25 min" in rust when late, "−5 min" when early; nothing within five minutes. */
export const DelayChip: React.FC<{ delay: number; className?: string }> = ({ delay, className }) => {
    if (Math.abs(delay) <= 5) return null;
    return (
        <span className={cn('rp-tabular inline-flex min-h-6 items-center whitespace-nowrap rounded-full px-2 text-2xs font-semibold', delay > 0 ? 'bg-rp-rust/15 text-rp-rust' : 'bg-rp-green/15 text-rp-green', className)}>
            {delay > 0 ? '+' : '−'}{Math.abs(delay)} min
        </span>
    );
};

/** The carrier's logo (or the mode's default icon) beside its name and the journey number. */
export const CarrierCell: React.FC<{ t: Transport; brandfetchApiKey?: string; carriers?: Carrier[]; size?: 'sm' | 'md'; /** `onInk` for text on an ink fill. */ tone?: 'default' | 'onInk'; className?: string }> = ({ t, brandfetchApiKey, carriers, size = 'md', tone = 'default', className }) => {
    const look = modeLook(t.mode);
    return (
        <span className={cn('flex min-w-0 items-center gap-3', className)}>
            <RpLogo name={t.provider} src={t.logoUrl} brandfetchApiKey={brandfetchApiKey} carriers={carriers} fallback={look.icon} iconClassName={look.text} size={size} />
            <span className="flex min-w-0 flex-col">
                <span className={cn('truncate text-sm font-medium', tone === 'onInk' ? 'text-rp-on-ink' : 'text-rp-ink')}>{carrierLabel(t) || look.label}</span>
                <span className={cn('rp-tabular truncate text-xs', tone === 'onInk' ? 'text-rp-on-ink/70' : 'text-rp-muted')}>{t.identifier || look.label}</span>
            </span>
        </span>
    );
};

/** Colour of a layover chip: green under 3 hours, yellow from 3 to 5, rust over 5. A stay of a day or more is neutral. */
export const layoverTone = (minutes: number): string =>
    minutes > 24 * 60 ? 'bg-rp-inset text-rp-ink'
        : minutes < 180 ? 'bg-rp-green text-rp-paper'
        : minutes <= 300 ? 'bg-rp-mustard text-rp-on-mustard'
        : 'bg-rp-rust text-rp-paper';
