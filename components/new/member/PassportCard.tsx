import React from 'react';
import type { User } from '../../../types';
import { formatDate } from '../../../utils/formatters';
import { cn } from '../../../utils/cn';
import { Eye, EyeSlash, Globe, PencilSimple } from '../../ui/hugeicons';
import { initials } from '../trips/TripDetailsModal';

/**
 * A passport-style overview of a member: the identity page (photo, names, nationality, dates, number)
 * under a navy cover strip, then a page of stamps, one per country they have been to. The stamps are the
 * member's finished trips; nothing here is a travel document.
 */

const STAMP_TONES = [
    'border-rp-rust text-rp-rust',
    'border-rp-green text-rp-green',
    'border-rp-navy text-rp-navy dark:border-rp-sea dark:text-rp-sea',
    'border-rp-plum text-rp-plum',
] as const;
const STAMP_TILT = ['-rotate-3', 'rotate-2', '-rotate-1', 'rotate-3'] as const;
const STAMPS_SHOWN = 6;

const Field: React.FC<{ label: string; children: React.ReactNode; className?: string; mono?: boolean }> = ({ label, children, className, mono }) => (
    <div className={cn('min-w-0', className)}>
        <dt className="text-2xs uppercase tracking-wider text-rp-muted">{label}</dt>
        <dd className={cn('break-words text-sm font-medium text-rp-ink', mono && 'font-mono tracking-wide')}>{children || '—'}</dd>
    </div>
);

export const PassportCard: React.FC<{
    member: User;
    countries: Array<{ name: string; date: string }>;
    status: { label: string; className: string } | null;
    reveal: boolean;
    onToggleReveal: () => void;
    onEdit?: () => void;
}> = ({ member, countries, status, reveal, onToggleReveal, onEdit }) => {
    const parts = member.name.trim().split(/\s+/);
    const surname = parts.length > 1 ? parts[parts.length - 1] : '';
    const given = parts.length > 1 ? parts.slice(0, -1).join(' ') : member.name;
    const number = member.passportNumber ? (reveal ? member.passportNumber : `•••• ${member.passportNumber.slice(-4)}`) : '';
    const shown = countries.slice(0, STAMPS_SHOWN);

    return (
        <div className="overflow-hidden rounded-rp-card bg-rp-surface rp-shadow-rest">
            <div className="flex min-h-11 items-center justify-between gap-3 bg-rp-navy px-4 text-rp-paper sm:px-5 dark:text-rp-on-ink">
                <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em]"><Globe size={16} aria-hidden /> Passport</span>
                <span className="flex items-center gap-2">
                    {status ? <span className={cn('inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium', status.className)}>{status.label}</span> : null}
                    {onEdit ? (
                        <button type="button" onClick={onEdit} aria-label="Edit passport details" className="inline-flex size-11 items-center justify-center rounded-full outline-none hover:bg-rp-paper/15 focus-visible:ring-2 focus-visible:ring-current dark:hover:bg-rp-on-ink/10">
                            <PencilSimple size={18} aria-hidden />
                        </button>
                    ) : null}
                </span>
            </div>

            <div className="flex gap-4 p-4 sm:gap-6 sm:p-5">
                <div className="flex h-32 w-24 shrink-0 items-center justify-center self-start overflow-hidden rounded-rp-inset bg-rp-inset text-3xl font-medium text-rp-muted sm:h-40 sm:w-32">
                    {member.profilePicture ? <img src={member.profilePicture} alt="" className="size-full object-cover" referrerPolicy="no-referrer" /> : <span aria-hidden>{initials(member.name)}</span>}
                </div>
                <dl className="grid min-w-0 flex-1 grid-cols-2 content-start gap-x-4 gap-y-3 sm:grid-cols-3">
                    <Field label="Surname" className="col-span-1">{surname}</Field>
                    <Field label="Given names" className="col-span-1 sm:col-span-2">{given}</Field>
                    <Field label="Nationality">{member.nationality}</Field>
                    <Field label="Date of birth">{member.dateOfBirth ? formatDate(member.dateOfBirth, 'short-with-year') : ''}</Field>
                    <Field label="Issued by" className="col-span-2 sm:col-span-1">{member.passportIssuingEntity}</Field>
                    <Field label="Issued">{member.passportIssueDate ? formatDate(member.passportIssueDate, 'short-with-year') : ''}</Field>
                    <Field label="Expires">{member.passportExpiryDate ? formatDate(member.passportExpiryDate, 'short-with-year') : ''}</Field>
                    <div className="col-span-2 flex min-w-0 items-end gap-1 sm:col-span-1">
                        <Field label="Passport no." mono className="flex-1">{number}</Field>
                        {member.passportNumber ? (
                            <button type="button" onClick={onToggleReveal} aria-label={reveal ? 'Hide passport number' : 'Show passport number'} aria-pressed={reveal} className="-my-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-rp-muted outline-none hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted">
                                {reveal ? <EyeSlash size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
                            </button>
                        ) : null}
                    </div>
                </dl>
            </div>

            <div className="border-t border-dashed border-rp-line p-4 sm:p-5">
                <h3 className="mb-3 text-2xs uppercase tracking-wider text-rp-muted">Stamps</h3>
                {shown.length === 0 ? (
                    <p className="text-sm text-rp-muted">No stamps yet. A finished trip leaves one per country.</p>
                ) : (
                    <ul className="flex flex-wrap gap-3">
                        {shown.map((p, i) => (
                            <li key={p.name} className={cn('flex min-h-16 min-w-28 max-w-full flex-col items-center justify-center rounded-rp-inset border-2 border-dashed px-3 py-2 text-center', STAMP_TONES[i % STAMP_TONES.length], STAMP_TILT[i % STAMP_TILT.length])}>
                                <span className="max-w-40 truncate text-sm font-semibold uppercase tracking-wide">{p.name}</span>
                                <span className="rp-tabular text-xs">{formatDate(p.date, 'month-year')}</span>
                            </li>
                        ))}
                        {countries.length > STAMPS_SHOWN ? <li className="flex min-h-16 items-center px-2 text-sm text-rp-muted">+{countries.length - STAMPS_SHOWN} more</li> : null}
                    </ul>
                )}
            </div>
        </div>
    );
};
