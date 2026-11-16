import React from 'react';
import type { LeaveReminder } from '../../../utils/leaveInsights';
import { ArrowUpRight, Bell } from '../../ui/hugeicons';
import { cn } from '../../../utils/cn';

const DOT: Record<LeaveReminder['tone'], string> = {
    rust: 'bg-rp-rust',
    ochre: 'bg-rp-mustard',
    green: 'bg-rp-green',
    muted: 'bg-rp-muted',
};

/**
 * The member's own leave reminders (leave Phase 2b): leave coming up, carried-over days about to expire, leave left late
 * in the year, requests still waiting. In-app only; each kind can be switched off in Settings › Leave. A row about one
 * leave entry opens it. Shown only when there is something to say.
 */
export const LeaveReminders: React.FC<{
    reminders: LeaveReminder[];
    onOpenEntry?: (entryId: string) => void;
    onSettings?: () => void;
}> = ({ reminders, onOpenEntry, onSettings }) => {
    if (reminders.length === 0) return null;
    return (
        <section aria-label="Reminders" className="flex flex-col gap-2 rounded-rp-card bg-rp-surface p-4 rp-shadow-rest sm:p-5">
            <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-base font-medium text-rp-ink"><Bell size={18} className="text-rp-muted" aria-hidden /> Reminders</h2>
                {onSettings ? (
                    <button type="button" onClick={onSettings} className="min-h-11 rounded-full px-3 text-xs font-medium text-rp-muted outline-none hover:bg-rp-inset hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted">Choose reminders</button>
                ) : null}
            </div>
            <ul className="flex flex-col gap-1">
                {reminders.slice(0, 5).map(r => {
                    const body = (
                        <>
                            <span className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', DOT[r.tone])} aria-hidden />
                            <span className="min-w-0 flex-1 text-sm text-rp-ink">{r.text}</span>
                        </>
                    );
                    return (
                        <li key={r.id}>
                            {r.entryId && onOpenEntry ? (
                                <button type="button" onClick={() => onOpenEntry(r.entryId!)} className="flex min-h-11 w-full items-start gap-3 rounded-rp-inset px-2 py-1.5 text-left outline-none hover:bg-rp-inset focus-visible:ring-2 focus-visible:ring-rp-muted">
                                    {body}
                                    <ArrowUpRight size={16} className="mt-0.5 shrink-0 text-rp-muted" aria-hidden />
                                </button>
                            ) : (
                                <div className="flex min-h-11 items-start gap-3 px-2 py-1.5">{body}</div>
                            )}
                        </li>
                    );
                })}
            </ul>
        </section>
    );
};
