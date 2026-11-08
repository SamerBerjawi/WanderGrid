import React from 'react';
import type { User } from '../../../types';
import { cn } from '../../../utils/cn';
import { formatMeasure, programLabel, tierProgress, type LoyaltyProgram } from '../../../utils/loyalty';
import type { JourneyRecord } from '../../../utils/journeysModel';
import { Airplane, Bed, PencilSimple, Plus } from '../../ui/hugeicons';
import { RpEmpty } from '../ui';

/**
 * A member's loyalty wallet: the frequent-flyer and hotel numbers they keep, each with the status they hold and,
 * for airlines with levels set, how far this year's flying is towards the next one. The numbers also appear on
 * the matching boarding pass and stay. Counted from the flights in the log; nothing is read from an airline.
 */

const Programme: React.FC<{ p: LoyaltyProgram; member: User; records: JourneyRecord[]; today: string }> = ({ p, member, records, today }) => {
    const progress = p.kind === 'airline' && p.levels?.length ? tierProgress(p, member, records, today) : null;
    const Icon = p.kind === 'airline' ? Airplane : Bed;
    const status = progress?.reached?.name ?? p.tier?.trim();
    return (
        <li className="flex flex-col gap-2.5 border-t border-rp-line py-3 first:border-t-0">
            <div className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-rp-inset text-rp-ink"><Icon size={18} aria-hidden /></span>
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-rp-ink">{programLabel(p)}</span>
                    <span className="block truncate text-xs text-rp-muted">{p.programme?.trim() ? `${p.provider} · ` : ''}<span className="rp-tabular font-mono tracking-wide">{p.number}</span></span>
                </span>
                {status ? <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-rp-inset px-2.5 text-xs font-medium text-rp-ink">{status}</span> : null}
            </div>
            {progress ? (
                <div className="flex flex-col gap-1.5 pl-12">
                    <div className="h-1.5 overflow-hidden rounded-full bg-rp-line" role="progressbar" aria-label={`${progress.next ? progress.next.name : 'Top level'} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.fraction * 100)}>
                        <div className={cn('h-full rounded-full', progress.next ? 'bg-rp-navy dark:bg-rp-sea' : 'bg-rp-green')} style={{ width: `${Math.round(progress.fraction * 100)}%` }} />
                    </div>
                    <p className="text-xs text-rp-muted">
                        <span className="rp-tabular">{formatMeasure(progress.value, progress.measure)}</span> with {p.provider} in {progress.year}
                        {progress.next ? <> · <span className="rp-tabular">{formatMeasure(progress.remaining, progress.measure)}</span> to {progress.next.name}</> : ' · top level reached'}
                    </p>
                </div>
            ) : null}
        </li>
    );
};

export const LoyaltyPanel: React.FC<{ member: User; records: JourneyRecord[]; today: string; onEdit?: () => void; className?: string }> = ({ member, records, today, onEdit, className }) => {
    const programs = member.loyalty || [];
    const firstName = member.name.split(' ')[0];
    if (programs.length === 0) {
        return (
            <div className={className}>
                <RpEmpty
                    title="No loyalty numbers"
                    action={onEdit ? <button type="button" onClick={onEdit} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-rp-ink px-5 text-sm font-medium text-rp-on-ink outline-none hover:bg-rp-ink/90 focus-visible:ring-2 focus-visible:ring-rp-muted"><Plus size={16} aria-hidden /> Add a number</button> : undefined}
                >
                    Frequent-flyer and hotel numbers show up on {firstName}'s boarding passes and stays.
                </RpEmpty>
            </div>
        );
    }
    return (
        <section aria-label="Loyalty wallet" className={cn('p-4', className)}>
            <div className="flex min-h-11 items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-rp-ink">Loyalty wallet</h3>
                {onEdit ? (
                    <button type="button" onClick={onEdit} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-rp-inset px-4 text-sm font-medium text-rp-ink outline-none hover:bg-rp-line focus-visible:ring-2 focus-visible:ring-rp-muted">
                        <PencilSimple size={16} aria-hidden /> Edit
                    </button>
                ) : null}
            </div>
            <ul>{programs.map(p => <Programme key={p.id} p={p} member={member} records={records} today={today} />)}</ul>
        </section>
    );
};
