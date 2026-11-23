import React from 'react';
import type { PlanBadge as Badge, PlanBadgeTone } from '../../../utils/tripPlan';
import { Check, Sparkle } from '../../ui/hugeicons';
import { cn } from '../../../utils/cn';

/**
 * A small label for an item's place in the plan (UI_UX_DESIGN_REFERENCE.md §7). Each status looks different, so
 * nothing planned reads as confirmed: dashed outlines for what isn't decided or booked, solid fills only for what is
 * booked or paid.
 */
const TONE: Record<PlanBadgeTone, string> = {
    planned: 'border-rp-line text-rp-muted',
    recommended: 'border-rp-line bg-rp-inset text-rp-ink',
    optional: 'border-dashed border-rp-muted text-rp-muted',
    alternative: 'border-dashed border-rp-ochre text-rp-ochre',
    candidate: 'border-rp-sea text-rp-sea',
    unbooked: 'border-dashed border-rp-rust text-rp-rust',
    booked: 'border-transparent bg-rp-green text-rp-paper',
    paid: 'border-transparent bg-rp-ink text-rp-on-ink',
    gem: 'border-transparent bg-rp-plum/15 text-rp-plum',
};

export const PlanBadge: React.FC<{ tone: PlanBadgeTone; children: React.ReactNode; className?: string }> = ({ tone, children, className }) => (
    <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-2xs leading-4 font-medium whitespace-nowrap', TONE[tone], className)}>
        {tone === 'gem' ? <Sparkle size={10} aria-hidden /> : tone === 'booked' || tone === 'paid' ? <Check size={10} aria-hidden /> : null}
        {children}
    </span>
);

export const PlanBadges: React.FC<{ badges: Badge[]; className?: string }> = ({ badges, className }) =>
    badges.length ? <span className={cn('flex flex-wrap items-center gap-1', className)}>{badges.map(b => <PlanBadge key={b.tone} tone={b.tone}>{b.label}</PlanBadge>)}</span> : null;
