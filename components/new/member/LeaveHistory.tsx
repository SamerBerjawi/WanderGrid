import React from 'react';
import type { YearRow } from '../../../utils/leaveInsights';
import { cn } from '../../../utils/cn';

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * A member's leave over time (leave Phase 2b): leave days per month of the chosen year as bars, the line on what that
 * leave bought, and one row per year (offered, taken, planned, carried in, lost, left). Years still to come are marked
 * as a forecast. Pure layout: the figures come from utils/leaveInsights.
 */
export const LeaveHistory: React.FC<{
    year: number;
    months: number[];
    sentence: string | null;
    rows: YearRow[];
    /** The calendar year today is in: its row reads "this year", later ones "forecast". */
    thisYear: number;
    onYear: (year: number) => void;
}> = ({ year, months, sentence, rows: all, thisYear, onYear }) => {
    // Years still to come with nothing offered or booked say nothing.
    const rows = all.filter(r => r.year <= thisYear || r.total > 0 || r.used + r.planned + r.pending > 0);
    const peak = Math.max(1, ...months);
    const any = months.some(m => m > 0);
    return (
        <div className="flex flex-col gap-4">
            <section aria-label={`Leave by month in ${year}`} className="flex flex-col gap-3 rounded-rp-card bg-rp-surface p-4 rp-shadow-rest sm:p-5">
                <h2 className="text-base font-medium text-rp-ink">Leave by month</h2>
                {any ? (
                    <ol className="grid h-28 grid-cols-12 items-end gap-1 sm:gap-2">
                        {months.map((m, i) => (
                            <li key={i} className="flex h-full flex-col items-center justify-end gap-1" title={`${MONTH_NAMES[i]}: ${num(m)} ${m === 1 ? 'day' : 'days'}`}>
                                <span className="rp-tabular text-2xs text-rp-muted">{m > 0 ? num(m) : ''}</span>
                                <span
                                    className={cn('w-full max-w-8 rounded-t-md', m > 0 ? 'bg-rp-green' : 'bg-rp-inset')}
                                    style={{ height: m > 0 ? `${Math.max(8, (m / peak) * 72)}%` : '4px' }}
                                    aria-hidden
                                />
                                <span className="text-2xs text-rp-muted" aria-hidden>{MONTHS[i]}</span>
                                <span className="sr-only">{MONTH_NAMES[i]}: {num(m)} {m === 1 ? 'day' : 'days'}</span>
                            </li>
                        ))}
                    </ol>
                ) : (
                    <p className="text-sm text-rp-muted">No leave in {year} yet.</p>
                )}
                {sentence ? <p className="text-sm text-rp-ink">{sentence}</p> : null}
            </section>

            {rows.length > 1 ? (
                <section aria-label="Leave by year" className="flex flex-col gap-2 rounded-rp-card bg-rp-surface p-4 rp-shadow-rest sm:p-5">
                    <h2 className="text-base font-medium text-rp-ink">Year by year</h2>
                    <div className="-mx-2 overflow-x-auto">
                        <table className="rp-tabular w-full min-w-[28rem] text-sm">
                            <thead>
                                <tr className="text-left text-xs text-rp-muted">
                                    <th scope="col" className="px-2 py-1.5 font-medium">Year</th>
                                    <th scope="col" className="px-2 py-1.5 text-right font-medium">Offered</th>
                                    <th scope="col" className="px-2 py-1.5 text-right font-medium">Taken</th>
                                    <th scope="col" className="px-2 py-1.5 text-right font-medium">Planned</th>
                                    <th scope="col" className="px-2 py-1.5 text-right font-medium">Carried in</th>
                                    <th scope="col" className="px-2 py-1.5 text-right font-medium">Lost</th>
                                    <th scope="col" className="px-2 py-1.5 text-right font-medium">Left</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(r => (
                                    <tr key={r.year} className={cn('border-t border-rp-line', r.year === year && 'bg-rp-inset/60')}>
                                        <th scope="row" className="px-2 py-0 text-left font-medium">
                                            <button type="button" onClick={() => onYear(r.year)} aria-pressed={r.year === year} className="min-h-11 rounded-full px-1 text-rp-ink outline-none hover:underline focus-visible:ring-2 focus-visible:ring-rp-muted">
                                                {r.year}{r.forecast ? <span className="ml-1.5 text-xs font-normal text-rp-muted">{r.year === thisYear ? 'this year' : 'forecast'}</span> : null}
                                            </button>
                                        </th>
                                        <td className="px-2 text-right">{r.total > 0 ? num(r.total) : '–'}</td>
                                        <td className="px-2 text-right">{num(r.used)}</td>
                                        <td className="px-2 text-right">{num(r.planned + r.pending)}</td>
                                        <td className="px-2 text-right">{r.carriedIn > 0 ? num(r.carriedIn) : '–'}</td>
                                        <td className={cn('px-2 text-right', r.expired > 0 && 'text-rp-rust')}>{r.expired > 0 ? num(r.expired) : '–'}</td>
                                        <td className="px-2 text-right font-medium">{r.total > 0 ? num(r.left) : '–'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            ) : null}
        </div>
    );
};
