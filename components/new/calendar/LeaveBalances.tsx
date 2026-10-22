import React, { useMemo } from 'react';
import type { User } from '../../../types';
import type { LeaveSummary, TypeBalance } from '../../../utils/calendarModel';
import { ENTITLEMENT_ACCENT } from '../../../utils/dashboardModel';
import { SpendingRing, type SpendingCategory } from '../../kokonutui/spending-ring';
import { RpChip, RpEmpty } from '../ui';
import { leaveColor } from '../member/MemberRing';
import { ArrowUpRight, InfinityMark, Warning } from '../../ui/hugeicons';
import { cn } from '../../../utils/cn';

/**
 * Leave for one member and year: the Spending Ring by leave type with what is left, a year switch, and
 * a row per type with its total, used, planned, remaining and what was carried over. Rust means over the
 * allowance (action needed), always with the words "Over by".
 */

const days = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} ${n === 1 ? 'day' : 'days'}`;

export const LeaveBalances: React.FC<{
    member: User | undefined;
    year: number;
    years: number[];
    onYear: (y: number) => void;
    balances: TypeBalance[];
    summary: LeaveSummary;
    onMember?: (id: string) => void;
}> = ({ member, year, years, onYear, balances, summary, onMember }) => {
    const categories = useMemo<SpendingCategory[]>(() => {
        const used = balances
            .filter(b => b.used + b.planned > 0)
            .map(b => ({ name: b.entitlement.name, amount: b.used + b.planned, accent: ENTITLEMENT_ACCENT[b.entitlement.color] }));
        // Without leave types, the days recorded as taken stand alone.
        const other = summary.fallback && used.length === 0 && summary.used + summary.planned > 0
            ? [{ name: 'Leave', amount: summary.used + summary.planned, accent: 'mustard' as const }]
            : [];
        const left = summary.left > 0 ? [{ name: 'Left', amount: summary.left, accent: 'ink' as const }] : [];
        return [...used, ...other, ...left];
    }, [balances, summary]);

    const empty = categories.length === 0;

    return (
        <section aria-label="Leave" className="flex flex-col gap-3 rounded-rp-card bg-rp-surface p-4 rp-shadow-rest sm:p-5">
            <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-medium text-rp-ink">
                    Leave{member ? <span className="text-rp-muted"> · {member.name.split(' ')[0]}</span> : null}
                </h2>
                {member && onMember ? (
                    <button type="button" aria-label={`Open ${member.name}`} onClick={() => onMember(member.id)} className="inline-flex size-11 items-center justify-center rounded-full text-rp-muted outline-none hover:bg-rp-inset hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted">
                        <ArrowUpRight size={18} aria-hidden />
                    </button>
                ) : null}
            </div>

            {years.length > 1 ? (
                <div className="-m-3 flex gap-2 overflow-x-auto p-3 [scrollbar-width:none]" role="group" aria-label="Year">
                    {years.map(y => <RpChip key={y} selected={y === year} onClick={() => onYear(y)} className="rp-tabular">{y}</RpChip>)}
                </div>
            ) : null}

            {empty ? (
                <RpEmpty title="No leave set up">{member ? `${member.name.split(' ')[0]} has no allowance or leave in ${year}.` : 'No allowance or leave this year.'}</RpEmpty>
            ) : (
                <>
                    <div className="mx-auto w-full max-w-[17rem]">
                        <SpendingRing
                            categories={categories}
                            format={days}
                            caption={summary.total > 0 ? c => (c.name === 'Left' ? `of ${summary.total} in ${year}` : `${days(summary.used + summary.planned)} booked of ${summary.total}`) : undefined}
                        />
                    </div>
                    <p className="rp-tabular text-center text-sm text-rp-muted">
                        {summary.used} taken · {summary.planned} planned · {summary.left} left
                    </p>
                </>
            )}

            {balances.length > 0 ? (
                <ul className="flex flex-col gap-1.5">
                    {balances.map(b => {
                        const over = b.remaining !== null && b.remaining < 0;
                        return (
                            <li key={b.entitlement.id} className="rounded-rp-inset bg-rp-inset px-3 py-2">
                                <div className="flex min-h-7 items-center gap-2">
                                    <span className={cn('size-3 shrink-0 rounded-full', leaveColor(b.entitlement.color).dot)} aria-hidden />
                                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-rp-ink">{b.entitlement.name}</span>
                                    {b.unlimited ? (
                                        <span className="inline-flex items-center gap-1 text-sm text-rp-muted"><InfinityMark size={14} aria-hidden /> Unlimited</span>
                                    ) : over ? (
                                        <span className="inline-flex h-6 items-center gap-1 rounded-full bg-rp-rust px-2.5 text-xs font-medium text-rp-paper"><Warning size={12} aria-hidden /> Over by {days(Math.abs(b.remaining as number))}</span>
                                    ) : b.remaining !== null ? (
                                        <span className="rp-tabular text-sm font-medium text-rp-ink">{days(b.remaining)} left</span>
                                    ) : null}
                                </div>
                                <p className="rp-tabular mt-0.5 pl-5 text-xs text-rp-muted">
                                    {b.total !== null ? `${b.allowance} a year` : 'No allowance'}
                                    {b.carryOver > 0 ? ` + ${days(b.carryOver)} carried over` : ''}
                                    {` · ${b.used} used · ${b.planned} planned`}
                                </p>
                            </li>
                        );
                    })}
                </ul>
            ) : null}
        </section>
    );
};
