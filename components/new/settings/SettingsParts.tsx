import React, { useEffect, useState, type ReactNode } from 'react';
import NumberFlow from '@number-flow/react';
import { RpSheet } from '../ui';
import { RP_FIELD, RpField } from '../fields';
import HoldButton from '../../kokonutui/hold-button';
import ParticleButton from '../../kokonutui/particle-button';
import { errorMessage, toast } from '../../../services/toast';
import type { Icon } from '../../ui/hugeicons';
import { cn } from '../../../utils/cn';

/** Small pieces shared by the settings panes: the card, the pane header, tiles, chips and two generic sheets. */

/** A field sitting straight on a sheet (not inside an inset section) needs its own inset fill to show. */
export const FIELD = cn(RP_FIELD, 'bg-rp-inset');

export const card = 'rounded-rp-card bg-rp-surface rp-shadow-rest';

export const GHOST_BTN =
    'inline-flex min-h-11 items-center gap-2 rounded-full bg-rp-inset px-4 text-sm font-medium text-rp-ink outline-none transition-colors hover:bg-rp-line focus-visible:ring-2 focus-visible:ring-rp-muted';
export const CANCEL_BTN =
    'inline-flex min-h-11 items-center rounded-full bg-rp-inset px-5 text-sm font-medium text-rp-ink outline-none hover:bg-rp-line focus-visible:ring-2 focus-visible:ring-rp-muted';

/** A pane's title row: icon, name, an optional count and the pane's actions on the right. */
export const PaneHeader: React.FC<{ icon: Icon; title: string; count?: number | string; actions?: ReactNode; accent?: string }> = ({ icon: IconC, title, count, actions, accent = 'text-rp-muted' }) => (
    <div className="mb-2 flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-2 px-1">
        <h2 className="flex items-center gap-2 text-base font-medium">
            <IconC size={18} className={accent} aria-hidden /> {title}
            {count !== undefined ? <span className="rp-tabular text-sm text-rp-muted">{count}</span> : null}
        </h2>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
);

/** Accent per tile: the icon colour. The tile itself is unboxed, like Rapport's KPI triplet. */
const TILE_TONE = {
    ink: 'text-rp-ink',
    green: 'text-rp-green',
    mustard: 'text-rp-ochre',
} as const;

/** A count: a glass icon circle beside a rolling figure, its unit and one muted line of detail. */
export const StatTile: React.FC<{ icon: Icon; tone: keyof typeof TILE_TONE; value: number; unit: string; sub: string }> = ({ icon: IconC, tone, value, unit, sub }) => (
    <div className="flex min-w-0 items-center gap-3 px-1">
        <span className={cn('hidden size-10 shrink-0 items-center justify-center rounded-full bg-white/65 ring-1 ring-inset ring-white/80 dark:bg-white/10 dark:ring-white/10 sm:flex', TILE_TONE[tone])}><IconC size={18} aria-hidden /></span>
        <span className="min-w-0">
            <span className="flex flex-wrap items-baseline gap-x-1.5">
                <NumberFlow value={value} format={{ maximumFractionDigits: 0 }} className="rp-tabular text-xl leading-tight font-semibold" />
                <span className="text-sm text-rp-muted">{unit}</span>
            </span>
            <span className="block text-xs leading-snug text-rp-muted sm:truncate">{sub}</span>
        </span>
    </div>
);

const CHIP_TONE = {
    green: 'bg-rp-green text-rp-paper',
    rust: 'bg-rp-rust text-rp-paper',
    mustard: 'bg-rp-mustard text-rp-on-mustard',
    ink: 'bg-rp-ink text-rp-on-ink',
    muted: 'bg-rp-inset text-rp-muted',
} as const;

export const StatusChip: React.FC<{ tone: keyof typeof CHIP_TONE; children: ReactNode; icon?: Icon }> = ({ tone, children, icon: IconC }) => (
    <span className={cn('inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-medium', CHIP_TONE[tone])}>
        {IconC ? <IconC size={12} aria-hidden /> : null}{children}
    </span>
);

/** Runs a write, turning a failure into an error toast instead of an unhandled rejection. */
export const attempt = async (run: () => Promise<unknown>, fallback = "That didn't save. Try again.") => {
    try { await run(); return true; } catch (e) { toast.error(errorMessage(e, fallback)); return false; }
};

/** One text field in a sheet, saved with a Particle Button. */
export const TextSheet: React.FC<{
    open: boolean;
    title: string;
    subtitle?: string;
    label: string;
    icon?: Icon;
    value: string;
    placeholder?: string;
    maxLength?: number;
    mono?: boolean;
    uppercase?: boolean;
    onClose: () => void;
    onSave: (value: string) => Promise<void>;
}> = ({ open, title, subtitle, label, icon, value, placeholder, maxLength, mono, uppercase, onClose, onSave }) => {
    const [draft, setDraft] = useState(value);
    const [error, setError] = useState('');
    useEffect(() => { if (open) { setDraft(value); setError(''); } }, [open, value]);

    const save = async () => {
        try {
            await onSave(draft.trim());
            onClose();
        } catch (e) {
            setError(errorMessage(e, "That didn't save. Try again."));
            throw e;
        }
    };

    return (
        <RpSheet
            open={open}
            onClose={onClose}
            title={title}
            subtitle={subtitle}
            footer={
                <>
                    <button type="button" onClick={onClose} className={CANCEL_BTN}>Cancel</button>
                    <ParticleButton onClick={save} successDuration={700} onError={() => undefined} className="!min-h-11">Save changes</ParticleButton>
                </>
            }
        >
            <RpField label={label} icon={icon} error={error}>
                {id => (
                    <input
                        id={id}
                        value={draft}
                        maxLength={maxLength}
                        placeholder={placeholder}
                        autoFocus
                        autoComplete="off"
                        onChange={e => setDraft(uppercase ? e.target.value.toUpperCase() : e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
                        className={cn(FIELD, mono && 'font-mono', uppercase && 'uppercase')}
                    />
                )}
            </RpField>
        </RpSheet>
    );
};

/** A permanent or hard-to-undo action, confirmed with a Hold button (decision 9). */
export const HoldSheet: React.FC<{
    open: boolean;
    title: string;
    children: ReactNode;
    holdLabel: string;
    cancelLabel?: string;
    onClose: () => void;
    onConfirm: () => Promise<void>;
}> = ({ open, title, children, holdLabel, cancelLabel = 'Cancel', onClose, onConfirm }) => {
    const [error, setError] = useState('');
    useEffect(() => { if (open) setError(''); }, [open]);
    return (
        <RpSheet
            open={open}
            onClose={onClose}
            title={title}
            footer={
                <>
                    <button type="button" onClick={onClose} className={CANCEL_BTN}>{cancelLabel}</button>
                    <HoldButton
                        resetAfter={0}
                        onHoldComplete={() => {
                            onConfirm().then(onClose).catch(e => setError(errorMessage(e, 'That did not work. Try again.')));
                        }}
                    >
                        {holdLabel}
                    </HoldButton>
                </>
            }
        >
            <div className="flex flex-col gap-3">
                <div className="text-sm text-rp-muted">{children}</div>
                {error ? <p role="alert" className="text-sm break-words text-rp-rust">{error}</p> : null}
            </div>
        </RpSheet>
    );
};
