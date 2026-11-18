import React from 'react';
import type { Trip } from '../../../types';
import { isCostExcluded, type TripPerson } from '../../../utils/tripPeople';
import { RpChip, RpToggle } from '../ui';

/**
 * Granular per-item member assignment, Paid by selector, and personal-analytics exclusion toggle,
 * shared across transport legs, stays, activities and the standalone flight/journey editor.
 */
export const ItemSharingFields: React.FC<{
    /** Travelling members (account users + travelling companions). When 2+, shows the granular member chips. */
    travellers: TripPerson[];
    /** All trip people including payer-only entries (such as Employer). When 1+, shows Paid by chips. */
    people: TripPerson[];
    /** Selected traveller IDs (`undefined` means everyone in `travellers`). */
    selectedMembers: string[] | undefined;
    onSelectedMembersChange: (next: string[] | undefined) => void;
    /** Label for the member selection group, e.g. "Who flew", "Who's staying", "Who's joining". */
    membersLabel: string;
    paidBy: string | undefined;
    onPaidByChange: (next: string | undefined) => void;
    excludeFromAnalytics: boolean | undefined;
    onExcludeChange: (next: boolean | undefined) => void;
    trip?: Pick<Trip, 'excludeCostsFromAnalytics' | 'companions'> | null;
}> = ({
    travellers,
    people,
    selectedMembers,
    onSelectedMembersChange,
    membersLabel,
    paidBy,
    onPaidByChange,
    excludeFromAnalytics,
    onExcludeChange,
    trip,
}) => {
    const travellerIds = travellers.map(t => t.id);
    const activeIds = selectedMembers !== undefined ? selectedMembers : travellerIds;
    const toggleMember = (id: string) => {
        const next = activeIds.includes(id)
            ? activeIds.filter(x => x !== id)
            : travellerIds.filter(x => x === id || activeIds.includes(x));
        const allSelected = next.length === travellerIds.length && travellerIds.every(tid => next.includes(tid));
        onSelectedMembersChange(allSelected ? undefined : next);
    };

    const payer = paidBy ? people.find(p => p.id === paidBy) : undefined;
    const payerExcluded = Boolean(payer?.excludeFromAnalytics);
    const excluded = isCostExcluded({ paidBy, excludeFromAnalytics }, trip);

    const hint = excludeFromAnalytics === true
        ? 'Excluded from personal cost totals and charts.'
        : excludeFromAnalytics === false && (payerExcluded || trip?.excludeCostsFromAnalytics)
            ? 'Included in personal analytics (overrides trip or payer default).'
            : payerExcluded
                ? `Excluded automatically because ${payer?.name || 'this payer'} pays.`
                : trip?.excludeCostsFromAnalytics
                    ? "Excluded by this trip's analytics setting."
                    : 'Included in personal cost totals and charts.';

    const pickPayer = (id: string) => {
        const next = paidBy === id ? undefined : id;
        onPaidByChange(next);
        if (excludeFromAnalytics !== undefined) onExcludeChange(undefined);
    };

    return (
        <div className="mt-2 flex flex-col gap-3 rounded-rp-inset bg-rp-surface/70 p-3">
            {travellers.length > 1 ? (
                <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-rp-muted">{membersLabel}</span>
                        <span className="rp-tabular text-xs text-rp-muted">{activeIds.length} of {travellers.length}</span>
                    </div>
                    <div role="group" aria-label={membersLabel} className="flex flex-wrap gap-2">
                        {travellers.map(t => (
                            <RpChip key={t.id} selected={activeIds.includes(t.id)} onClick={() => toggleMember(t.id)}>
                                {t.name}
                            </RpChip>
                        ))}
                    </div>
                </div>
            ) : null}

            {people.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-rp-muted">Paid by</span>
                    <div role="group" aria-label="Paid by" className="flex flex-wrap gap-2">
                        {people.map(p => (
                            <RpChip key={p.id} selected={paidBy === p.id} onClick={() => pickPayer(p.id)}>
                                {p.name}
                                {p.kind === 'companion' ? <span className="opacity-70">· {p.role}</span> : null}
                            </RpChip>
                        ))}
                    </div>
                </div>
            ) : null}

            <RpToggle
                label="Exclude cost from personal analytics"
                hint={hint}
                checked={excluded}
                onChange={next => onExcludeChange(next)}
            />
        </div>
    );
};
