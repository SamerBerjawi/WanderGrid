import React from 'react';
import type { Trip } from '../../../types';
import { formatCurrency, formatDate } from '../../../utils/formatters';
import { Bed, Receipt } from '../../ui/hugeicons';
import { STAY_ACCENT } from '../trips/accents';
import { PlanBadge } from './PlanBadge';
import { cn } from '../../../utils/cn';

/**
 * The parts of a trip's plan that are not bookings (types.ts `TripPlan`): where the trip means to stay, with the
 * hotels being considered, and the budget estimate. Shown on the Bookings and Costs tabs, apart from what is booked.
 */

const CARD = 'rounded-rp-card bg-rp-surface p-4 rp-shadow-rest sm:p-6';
const nightsLabel = (n?: number) => (n ? `${n} ${n === 1 ? 'night' : 'nights'}` : '');

export const StayShortlist: React.FC<{ trip: Trip; onBook?: (stayIndex: number, candidateIndex: number) => void; className?: string }> = ({ trip, onBook, className }) => {
    const stays = trip.plan?.stays || [];
    const currency = trip.plan?.budget?.currency;
    const placeOf = (id?: string) => (trip.locations || []).find(l => id && l.plan?.externalId === id)?.name;
    const order = stays.map((s, i) => ({ s, i })).sort((a, b) => a.s.checkIn.localeCompare(b.s.checkIn));
    return (
        <section className={cn(CARD, className)} aria-labelledby="stay-shortlist">
            <div className="mb-1 flex items-center gap-2">
                <Bed size={18} className={STAY_ACCENT} aria-hidden />
                <h2 id="stay-shortlist" className="text-base font-medium text-rp-ink">Stay shortlist</h2>
                <span className="rp-tabular text-sm text-rp-muted">{stays.length}</span>
            </div>
            <p className="mb-3 text-sm text-rp-muted">Hotels being considered. None is booked until you book it; booking one adds it to Stays.</p>
            <ul className="grid gap-3 md:grid-cols-2">
                {order.map(({ s, i }) => {
                    const booked = s.status === 'booked';
                    return (
                        <li key={s.externalId || i} className="flex flex-col gap-2 rounded-rp-tile bg-rp-inset p-3">
                            <div className="flex items-start justify-between gap-2">
                                <span className="min-w-0">
                                    <span className="block truncate text-sm font-medium text-rp-ink">{placeOf(s.destinationId) || s.area || 'Stay'}</span>
                                    <span className="rp-tabular block text-xs text-rp-muted">
                                        {[`${formatDate(s.checkIn, 'short')} – ${formatDate(s.checkOut, 'short')}`, nightsLabel(s.nights), s.targetPerNight ? `target ${formatCurrency(s.targetPerNight, currency)}/night` : ''].filter(Boolean).join(' · ')}
                                    </span>
                                </span>
                                <PlanBadge tone={booked ? 'booked' : 'unbooked'}>{booked ? 'Booked' : 'Not booked'}</PlanBadge>
                            </div>
                            {s.area && placeOf(s.destinationId) ? <p className="text-xs text-rp-muted">Area: {s.area}</p> : null}
                            {s.requirements?.length ? <p className="text-xs text-rp-muted">Check: {s.requirements.join(', ')}</p> : null}
                            {s.notes ? <p className="text-xs text-rp-muted">{s.notes}</p> : null}
                            <ol className="flex flex-col rounded-rp-inset bg-rp-surface px-3" aria-label={`Hotels for ${placeOf(s.destinationId) || 'this stay'}`}>
                                {s.candidates.map((c, ci) => (
                                    <li key={c.externalId || ci} className="flex min-h-11 items-center gap-2 border-t border-rp-line py-1.5 first:border-t-0">
                                        <span className="rp-tabular w-6 shrink-0 text-xs text-rp-muted">{c.rank ? `#${c.rank}` : ''}</span>
                                        <span className={cn('min-w-0 flex-1 truncate text-sm', c.status === 'rejected' ? 'text-rp-muted line-through' : 'text-rp-ink')}>{c.name}</span>
                                        <PlanBadge tone={c.status === 'booked' ? 'booked' : c.status === 'rejected' ? 'planned' : 'candidate'}>{c.status === 'booked' ? 'Booked' : c.status === 'rejected' ? 'Ruled out' : 'Candidate'}</PlanBadge>
                                        {onBook && !booked && c.status === 'candidate' ? (
                                            <button type="button" onClick={() => onBook(i, ci)} aria-label={`Book ${c.name}`} className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-xs font-medium text-rp-ink outline-none hover:bg-rp-inset focus-visible:ring-2 focus-visible:ring-rp-muted">
                                                Book
                                            </button>
                                        ) : null}
                                    </li>
                                ))}
                            </ol>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
};

const label = (k: string) => { const t = k.replace(/[_-]+/g, ' ').trim(); return t.charAt(0).toUpperCase() + t.slice(1); };

/** The plan's budget by category. An estimate: it adds nothing to the ledger. */
export const BudgetEstimate: React.FC<{ trip: Trip }> = ({ trip }) => {
    const b = trip.plan?.budget;
    const cats = Object.entries(b?.categories || {});
    if (!b || (!cats.length && !b.target)) return null;
    const total = b.target ?? cats.reduce((s, [, v]) => s + v, 0);
    return (
        <section className={CARD} aria-labelledby="budget-estimate">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <h2 id="budget-estimate" className="flex items-center gap-2 text-base font-medium text-rp-ink"><Receipt size={18} className="text-rp-muted" aria-hidden /> Budget estimate</h2>
                <PlanBadge tone="optional">Estimate, not spending</PlanBadge>
            </div>
            <p className="mb-3 text-sm text-rp-muted">From the trip's plan. Nothing here is in the ledger; record real payments under Expenses.</p>
            <p className="rp-tabular mb-4 text-2xl font-semibold text-rp-ink">{formatCurrency(total, b.currency)}</p>
            {cats.length ? (
                <ul className="flex flex-col gap-3">
                    {cats.map(([k, v]) => (
                        <li key={k}>
                            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                                <span className="text-rp-ink">{label(k)}</span>
                                <span className="rp-tabular text-rp-ink">{formatCurrency(v, b.currency)} <span className="text-rp-muted">· {total > 0 ? Math.round((v / total) * 100) : 0}%</span></span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-rp-inset" aria-hidden>
                                <div className="h-full rounded-full bg-rp-muted/50" style={{ width: `${total > 0 ? Math.min(100, (v / total) * 100) : 0}%` }} />
                            </div>
                        </li>
                    ))}
                </ul>
            ) : null}
            {b.note ? <p className="mt-3 text-xs text-rp-muted">{b.note}</p> : null}
        </section>
    );
};
