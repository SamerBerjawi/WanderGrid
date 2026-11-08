import React from 'react';
import type { Trip } from '../../../types';
import { countryName, type CheckState, type CountryFinding, type MemberCheck } from '../../../utils/entryCheck';
import { RULES_REVIEWED, type EntryRule } from '../../../utils/entryRules';
import { formatDate } from '../../../utils/formatters';
import { ArrowUpRight, IdentificationCard } from '../../ui/hugeicons';
import { RpSection, RpSheet } from '../ui';
import { cn } from '../../../utils/cn';

/**
 * Documents for a trip: each traveller's passport against every country the trip goes to. What it says is
 * decided in utils/entryCheck.ts from a small starter table (utils/entryRules.ts); this sheet says it plainly,
 * says when the table was reviewed, and sends you to the traveller's passport details to fix what is missing.
 */

const flagOf = (code: string): string => (/^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map(c => 0x1f1a5 + c.charCodeAt(0))) : '');

const STATE: Record<CheckState, { label: string; pill: string }> = {
    ok: { label: 'All good', pill: 'bg-rp-green/15 text-rp-green' },
    check: { label: 'To arrange', pill: 'bg-rp-mustard text-rp-on-mustard' },
    missing: { label: 'Add details', pill: 'bg-rp-inset text-rp-muted' },
    problem: { label: 'Problem', pill: 'bg-rp-rust text-rp-paper' },
};

const entryText = (e: EntryRule): { text: string; tone: 'ok' | 'act' | 'unknown' } => {
    const stay = e.days ? `, up to ${e.days} days` : '';
    switch (e.kind) {
        case 'free': return { text: `No visa needed${stay}`, tone: 'ok' };
        case 'eta': return { text: `${e.doc || 'A travel permit'} needed${stay}`, tone: 'act' };
        case 'evisa': return { text: `${e.doc || 'An e-Visa'} needed`, tone: 'act' };
        case 'visa': return { text: 'A visa is needed', tone: 'act' };
        default: return { text: 'Check the entry requirements', tone: 'unknown' };
    }
};

/** "13 days after you return", "5 months after you return", "3 days before you return". */
const afterReturn = (days: number): string => {
    const n = Math.abs(days);
    const span = n >= 60 ? `${Math.round(n / 30)} months` : `${n} ${n === 1 ? 'day' : 'days'}`;
    return days >= 0 ? `${span} after you return` : `${span} before you return`;
};

const Finding: React.FC<{ f: CountryFinding }> = ({ f }) => {
    const entry = entryText(f.entry);
    return (
        <li className="flex flex-col gap-1 border-t border-rp-line py-2.5 first:border-t-0">
            <span className="flex items-center gap-2 text-sm font-medium text-rp-ink"><span aria-hidden>{flagOf(f.code)}</span>{f.name}</span>
            <span className={cn('text-sm', entry.tone === 'act' ? 'font-medium text-rp-ink' : 'text-rp-muted')}>
                {entry.text}{entry.tone === 'act' ? <span className="ml-1.5 rounded-full bg-rp-mustard px-2 py-0.5 text-2xs font-semibold text-rp-on-mustard">To arrange</span> : null}
            </span>
            {f.entry.note ? <span className="text-xs text-rp-muted">{f.entry.note}</span> : null}
            {!f.validity.ok && (f.validity.shortDays > 0 || f.validity.tooOld) ? (
                <span role="alert" className="text-xs font-medium text-rp-rust">
                    {f.validity.shortDays > 0
                        ? `The passport must be valid until ${formatDate(f.validity.until, 'short-with-year')}${f.validity.months ? `, ${f.validity.months} months after you leave` : ''}. It is ${f.validity.shortDays} ${f.validity.shortDays === 1 ? 'day' : 'days'} short.`
                        : 'This passport is too old for this destination.'}
                    {f.validity.note ? ` ${f.validity.note}` : ''}
                </span>
            ) : f.validity.months > 0 ? <span className="text-xs text-rp-muted">Passport valid for {f.validity.months} months after you leave: fine.</span> : null}
        </li>
    );
};

export const DocumentsSheet: React.FC<{
    open: boolean;
    onClose: () => void;
    trip: Trip;
    checks: MemberCheck[];
    countries: string[];
    onOpenMember?: (userId: string) => void;
}> = ({ open, onClose, trip, checks, countries, onOpenMember }) => (
    <RpSheet open={open} onClose={onClose} title="Documents" subtitle={trip.name} width={460}>
        <div className="flex flex-col gap-4">
            <p className="text-sm text-rp-muted">
                {countries.length ? `Checked against ${countries.map(countryName).join(', ')}, with the trip ending ${formatDate(trip.endDate || trip.startDate, 'short-with-year')}.` : 'This trip has no destination abroad to check yet.'}
            </p>
            {checks.map(c => (
                <RpSection key={c.user.id} title={c.user.name} icon={IdentificationCard} action={<span className={cn('rounded-full px-2.5 py-0.5 text-2xs font-semibold', STATE[c.state].pill)}>{STATE[c.state].label}</span>}>
                    <div className="flex flex-col gap-1 py-2 text-sm">
                        <p className="text-rp-ink">
                            {c.expiry
                                ? `Passport expires ${formatDate(c.expiry, 'short-with-year')}, ${afterReturn(c.daysAfterReturn ?? 0)}.`
                                : 'No passport date on file, so validity can\'t be checked.'}
                        </p>
                        <p className="text-xs text-rp-muted">{c.nationality ? `Citizen of ${countryName(c.nationality)}.` : 'Nationality not set, so entry rules can\'t be looked up.'}</p>
                    </div>
                    {c.findings.length ? <ul aria-label={`${c.user.name}: entry by country`} className="flex flex-col">{c.findings.map(f => <Finding key={f.code} f={f} />)}</ul> : null}
                    {onOpenMember && (c.state === 'missing' || c.state === 'problem') ? (
                        <button type="button" onClick={() => onOpenMember(c.user.id)} className="mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-rp-ink outline-none hover:bg-rp-inset focus-visible:ring-2 focus-visible:ring-rp-muted">
                            Edit passport details <ArrowUpRight size={14} aria-hidden />
                        </button>
                    ) : null}
                </RpSection>
            ))}
            <p className="px-1 text-xs text-rp-muted">A starter guide for common passports and destinations, last reviewed {formatDate(`${RULES_REVIEWED}-01`, 'month-year')}. Rules change, and "check the entry requirements" means the table doesn't cover it: confirm with the destination's official government site before you travel.</p>
        </div>
    </RpSheet>
);
