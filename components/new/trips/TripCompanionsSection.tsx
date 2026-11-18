import React, { useMemo, useState } from 'react';
import type { CompanionRole, Trip, TripCompanion, User } from '../../../types';
import { COMPANION_ROLES, defaultCompanionFlags, knownCompanions } from '../../../utils/tripPeople';
import { Plus, Users, X } from '../../ui/hugeicons';
import { RP_FIELD, RpField } from '../fields';
import { RpChip, RpIconButton, RpSection, RpToggle } from '../ui';

const newCompanionId = () =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? `comp_${crypto.randomUUID()}`
        : `comp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

/**
 * Trip members section: established workspace accounts plus non-account companions and external payers
 * (Partner, Family, Friend, Employer, Colleague, Other) that participate in planning, Paid by, and analytics.
 */
export const TripCompanionsSection: React.FC<{
    users: User[];
    participants: string[];
    onParticipantsChange: (next: string[]) => void;
    companions: TripCompanion[];
    onCompanionsChange: (next: TripCompanion[]) => void;
    trips?: Trip[];
}> = ({ users, participants, onParticipantsChange, companions, onCompanionsChange, trips = [] }) => {
    const [adding, setAdding] = useState(false);
    const [name, setName] = useState('');
    const [role, setRole] = useState<CompanionRole>('Partner');
    const [isPayerOnly, setIsPayerOnly] = useState(false);
    const [excludeFromAnalytics, setExcludeFromAnalytics] = useState(false);

    const suggestions = useMemo(() => knownCompanions(trips, companions), [trips, companions]);

    const selectRole = (next: CompanionRole) => {
        setRole(next);
        const defaults = defaultCompanionFlags(next);
        setIsPayerOnly(defaults.isPayerOnly);
        setExcludeFromAnalytics(defaults.excludeFromAnalytics);
    };

    const resetForm = () => {
        setName('');
        selectRole('Partner');
        setAdding(false);
    };

    const addCompanion = () => {
        const clean = name.trim();
        if (!clean) return;
        onCompanionsChange([
            ...companions,
            {
                id: newCompanionId(),
                name: clean,
                role,
                ...(isPayerOnly ? { isPayerOnly: true } : {}),
                ...(excludeFromAnalytics ? { excludeFromAnalytics: true } : {}),
            },
        ]);
        resetForm();
    };

    const addSuggestion = (s: TripCompanion) => {
        onCompanionsChange([...companions, { ...s, id: newCompanionId() }]);
    };

    const removeCompanion = (id: string) => {
        onCompanionsChange(companions.filter(c => c.id !== id));
    };

    return (
        <RpSection title="Members & companions" icon={Users}>
            {users.length > 1 ? (
                <div className="flex flex-col gap-1.5 py-2">
                    <span className="text-xs text-rp-muted">Workspace accounts</span>
                    <div role="group" aria-label="Members" className="flex flex-wrap gap-2">
                        {users.map(u => {
                            const on = participants.includes(u.id);
                            return (
                                <RpChip
                                    key={u.id}
                                    selected={on}
                                    onClick={() => onParticipantsChange(on ? participants.filter(p => p !== u.id) : [...participants, u.id])}
                                >
                                    {u.name}
                                </RpChip>
                            );
                        })}
                    </div>
                </div>
            ) : null}

            <div className="flex flex-col gap-2 py-2">
                {companions.length > 0 ? (
                    <ul className="flex flex-col gap-1.5" aria-label="Companions without accounts">
                        {companions.map(c => {
                            const meta = [
                                c.role,
                                c.isPayerOnly ? 'Payer only' : 'Travels',
                                c.excludeFromAnalytics ? 'Excludes paid costs' : '',
                            ].filter(Boolean).join(' · ');
                            return (
                                <li key={c.id} className="flex items-center justify-between gap-2 rounded-rp-inset bg-rp-surface py-1 pr-1 pl-3">
                                    <span className="min-w-0">
                                        <span className="block truncate text-sm font-medium text-rp-ink">{c.name}</span>
                                        <span className="block truncate text-xs text-rp-muted">{meta}</span>
                                    </span>
                                    <RpIconButton label={`Remove ${c.name}`} tone="ghost" onClick={() => removeCompanion(c.id)}>
                                        <X size={16} />
                                    </RpIconButton>
                                </li>
                            );
                        })}
                    </ul>
                ) : null}

                {suggestions.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-rp-muted">From earlier trips:</span>
                        {suggestions.slice(0, 6).map(s => (
                            <RpChip key={`${s.name}-${s.role}`} selected={false} onClick={() => addSuggestion(s)}>
                                <Plus size={14} aria-hidden /> {s.name} ({s.role})
                            </RpChip>
                        ))}
                    </div>
                ) : null}

                {adding ? (
                    <div className="flex flex-col gap-3 rounded-rp-inset bg-rp-surface p-3">
                        <RpField label="Name">
                            {id => (
                                <input
                                    id={id}
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder="Sarah, Mom or Employer"
                                    className={RP_FIELD}
                                    autoComplete="off"
                                    autoFocus
                                />
                            )}
                        </RpField>
                        <div className="flex flex-col gap-1.5">
                            <span className="text-xs font-medium text-rp-muted">Relationship or role</span>
                            <div role="group" aria-label="Companion role" className="flex flex-wrap gap-1.5">
                                {COMPANION_ROLES.map(r => (
                                    <RpChip key={r} selected={role === r} onClick={() => selectRole(r)}>
                                        {r}
                                    </RpChip>
                                ))}
                            </div>
                        </div>
                        <RpToggle
                            label="Payer only (doesn't travel)"
                            hint="Selectable in Paid by without counting as a traveller."
                            checked={isPayerOnly}
                            onChange={setIsPayerOnly}
                        />
                        <RpToggle
                            label="Exclude costs they pay from personal analytics"
                            hint="For example flights or hotels covered by an employer."
                            checked={excludeFromAnalytics}
                            onChange={setExcludeFromAnalytics}
                        />
                        <div className="flex flex-wrap gap-2 pt-1">
                            <button
                                type="button"
                                onClick={addCompanion}
                                disabled={!name.trim()}
                                className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-rp-ink px-4 text-sm font-medium text-rp-on-ink outline-none hover:bg-rp-ink/90 focus-visible:ring-2 focus-visible:ring-rp-muted disabled:opacity-40"
                            >
                                <Plus size={16} aria-hidden /> Add
                            </button>
                            <button
                                type="button"
                                onClick={resetForm}
                                className="inline-flex min-h-11 items-center rounded-full bg-rp-inset px-4 text-sm font-medium text-rp-ink outline-none hover:bg-rp-line focus-visible:ring-2 focus-visible:ring-rp-muted"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => setAdding(true)}
                        className="inline-flex min-h-11 items-center gap-2 self-start rounded-full bg-rp-surface px-4 text-sm font-medium text-rp-ink outline-none hover:bg-rp-line focus-visible:ring-2 focus-visible:ring-rp-muted"
                    >
                        <Plus size={16} aria-hidden /> Add person or payer
                    </button>
                )}
            </div>
        </RpSection>
    );
};
