import React, { useMemo, useState } from 'react';
import type { Accommodation, PackingItem, Trip, Transport, User } from '../../../types';
import { buildDays, costSplit, type DayItem, type TripDay } from '../../../utils/tripItinerary';
import { tripDays } from '../../../utils/tripsModel';
import { formatCurrency, formatDate } from '../../../utils/formatters';
import { Airplane, Bed, Backpack, CalendarBlank, Check, FileText, PencilSimple, Plus, Receipt, Square, CheckSquare, Trash, type Icon } from '../../ui/hugeicons';
import { RP_FIELD } from '../fields';
import { RpChip, RpEmpty, RpLogo } from '../ui';
import ParticleButton from '../../kokonutui/particle-button';
import { MODE_ICON, money, nights, when } from '../trips/TripDetailsModal';
import { stayIcon } from '../trips/stayIcon';
import { STAY_ACCENT, TRANSPORT_ACCENT } from '../trips/accents';
import { modeLook } from '../trips/transportModes';
import { cn } from '../../../utils/cn';

/**
 * The panels under a trip's header on TripNew (UI_UX_DESIGN_REFERENCE.md §5.2): Itinerary (day by
 * day), Bookings (transport and stays), Costs, Gear (packing list) and Notes. They show a trip and
 * hand every edit of legs, stays and activities to the trip sheet, opened on the right step.
 */

export type EditStep = 0 | 1 | 2 | 3;

const CARD = 'rounded-rp-card bg-rp-surface p-4 rp-shadow-rest sm:p-6';
const PILL = 'inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-rp-muted focus-visible:ring-offset-2 focus-visible:ring-offset-rp-surface active:scale-[0.97]';
const GHOST = cn(PILL, 'bg-rp-inset text-rp-ink hover:bg-rp-line');

const AddButton: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
    <button type="button" onClick={onClick} className={GHOST}><Plus size={16} aria-hidden /> {label}</button>
);

const EditButton: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
    <button type="button" aria-label={label} onClick={onClick} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-rp-muted outline-none hover:bg-rp-inset hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted">
        <PencilSimple size={16} aria-hidden />
    </button>
);

const Heading: React.FC<{ icon: Icon; title: string; count?: number; action?: React.ReactNode; accent?: string }> = ({ icon: IconC, title, count, action, accent }) => (
    <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-medium text-rp-ink">
            <IconC size={18} className={accent ?? 'text-rp-muted'} aria-hidden /> {title}
            {count != null ? <span className="rp-tabular text-sm text-rp-muted">{count}</span> : null}
        </h2>
        {action}
    </div>
);

const dayLabel = (d: TripDay) => `${d.number > 0 ? `Day ${d.number} · ` : ''}${formatDate(d.date, 'long')}`;

/* ------------------------------------------------------------------ */
/* Itinerary */
/* ------------------------------------------------------------------ */

const itemRow = (d: DayItem, brandfetchApiKey?: string) => {
    if (d.kind === 'transport') {
        const t = d.item;
        const Mode = MODE_ICON[t.mode] || Airplane;
        const arrive = d.part === 'arrive';
        return {
            logo: <RpLogo name={t.provider} src={t.logoUrl} brandfetchApiKey={brandfetchApiKey} fallback={Mode} iconClassName={modeLook(t.mode).text} />,
            title: arrive ? `Arrive in ${t.destination}` : `${t.origin} → ${t.destination}`,
            meta: [t.provider, t.identifier, arrive ? '' : t.arrivalTime ? `arrives ${t.arrivalTime}` : ''].filter(Boolean).join(' · '),
            cost: arrive ? undefined : money(t.cost),
        };
    }
    if (d.kind === 'stay') {
        const a = d.item;
        const out = d.part === 'out';
        return {
            logo: <RpLogo name={a.name} src={a.logoUrl} brandfetchApiKey={brandfetchApiKey} fallback={stayIcon(a.type)} iconClassName={STAY_ACCENT} />,
            title: `${out ? 'Check out' : 'Check in'} · ${a.name}`,
            meta: [a.address, out ? '' : nights(a.checkInDate, a.checkOutDate)].filter(Boolean).join(' · '),
            cost: out ? undefined : money(a.cost),
        };
    }
    const a = d.item;
    return {
        logo: <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-rp-inset text-rp-muted"><CalendarBlank size={16} aria-hidden /></span>,
        title: a.title,
        meta: [a.type && a.type !== 'Activity' ? a.type : '', a.location].filter(Boolean).join(' · '),
        cost: money(a.cost),
    };
};

export const ItineraryPanel: React.FC<{ trip: Trip; brandfetchApiKey?: string; onEdit: (step: EditStep) => void }> = ({ trip, brandfetchApiKey, onEdit }) => {
    const days = useMemo(() => buildDays(trip), [trip]);
    if (days.length === 0) {
        return (
            <div className={CARD}>
                <RpEmpty title="No dates yet" action={<button type="button" onClick={() => onEdit(0)} className={cn(PILL, 'bg-rp-ink text-rp-on-ink hover:bg-rp-ink/90')}><PencilSimple size={16} aria-hidden /> Set dates</button>}>
                    Add the trip's dates and its days appear here.
                </RpEmpty>
            </div>
        );
    }
    return (
        <ol className="flex flex-col gap-3" aria-label="Itinerary">
            {days.map(day => (
                <li key={day.date} data-trip-day className="rounded-rp-card bg-rp-surface p-4 rp-shadow-rest sm:p-5">
                    <div className="mb-2 flex items-center justify-between gap-3">
                        <h3 className="text-sm font-medium text-rp-ink">{dayLabel(day)}</h3>
                        <button type="button" onClick={() => onEdit(3)} className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-rp-muted outline-none hover:bg-rp-inset hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted">
                            <Plus size={14} aria-hidden /> Add activity
                        </button>
                    </div>
                    {day.items.length === 0 ? (
                        <p className="rounded-rp-inset bg-rp-inset px-3 py-3 text-sm text-rp-muted">Nothing planned yet.</p>
                    ) : (
                        <ul className="flex flex-col rounded-rp-inset bg-rp-inset px-3">
                            {day.items.map(it => {
                                const row = itemRow(it, brandfetchApiKey);
                                return (
                                    <li key={it.id} className="grid grid-cols-[3rem_2.25rem_minmax(0,1fr)_auto] items-center gap-3 border-t border-rp-line py-2.5 first:border-t-0">
                                        <span className="rp-tabular text-xs text-rp-muted">{it.time || 'All day'}</span>
                                        {row.logo}
                                        <span className="min-w-0">
                                            <span className="block truncate text-sm font-medium text-rp-ink">{row.title}</span>
                                            {row.meta ? <span className="block truncate text-xs text-rp-muted">{row.meta}</span> : null}
                                        </span>
                                        <span className="rp-tabular text-right text-sm font-medium text-rp-ink">{row.cost ?? ''}</span>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </li>
            ))}
        </ol>
    );
};

/* ------------------------------------------------------------------ */
/* Bookings */
/* ------------------------------------------------------------------ */

const TransportRow: React.FC<{ t: Transport; brandfetchApiKey?: string; onEdit: () => void }> = ({ t, brandfetchApiKey, onEdit }) => {
    const Mode = MODE_ICON[t.mode] || Airplane;
    return (
        <li className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto_auto] items-center gap-3 border-t border-rp-line py-3 first:border-t-0">
            <RpLogo name={t.provider} src={t.logoUrl} brandfetchApiKey={brandfetchApiKey} fallback={Mode} iconClassName={modeLook(t.mode).text} />
            <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-rp-ink">{t.origin} → {t.destination}</span>
                <span className="block truncate text-xs text-rp-muted">
                    {[t.provider, t.identifier, when(t.departureDate, t.departureTime), t.confirmationCode ? `Ref ${t.confirmationCode}` : ''].filter(Boolean).join(' · ')}
                </span>
            </span>
            <span className="rp-tabular text-right text-sm font-medium text-rp-ink">{money(t.cost) ?? ''}</span>
            <EditButton label={`Edit ${t.origin} to ${t.destination}`} onClick={onEdit} />
        </li>
    );
};

const StayRow: React.FC<{ a: Accommodation; brandfetchApiKey?: string; onEdit: () => void }> = ({ a, brandfetchApiKey, onEdit }) => (
    <li className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto_auto] items-center gap-3 border-t border-rp-line py-3 first:border-t-0">
        <RpLogo name={a.name} src={a.logoUrl} brandfetchApiKey={brandfetchApiKey} fallback={stayIcon(a.type)} iconClassName={STAY_ACCENT} />
        <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-rp-ink">{a.name}</span>
            <span className="block truncate text-xs text-rp-muted">
                {[a.checkInDate && a.checkOutDate ? `${formatDate(a.checkInDate, 'short')} – ${formatDate(a.checkOutDate, 'short')}` : '', nights(a.checkInDate, a.checkOutDate), a.confirmationCode ? `Ref ${a.confirmationCode}` : ''].filter(Boolean).join(' · ')}
            </span>
        </span>
        <span className="rp-tabular text-right text-sm font-medium text-rp-ink">{money(a.cost) ?? ''}</span>
        <EditButton label={`Edit ${a.name}`} onClick={onEdit} />
    </li>
);

export const BookingsPanel: React.FC<{ trip: Trip; brandfetchApiKey?: string; onEdit: (step: EditStep) => void }> = ({ trip, brandfetchApiKey, onEdit }) => {
    const transports = useMemo(() => [...(trip.transports || [])].sort((a, b) => `${a.departureDate}${a.departureTime}`.localeCompare(`${b.departureDate}${b.departureTime}`)), [trip.transports]);
    const stays = useMemo(() => [...(trip.accommodations || [])].sort((a, b) => (a.checkInDate || '').localeCompare(b.checkInDate || '')), [trip.accommodations]);
    return (
        <div className="grid gap-3 lg:grid-cols-2 lg:gap-6">
            <section className={CARD}>
                <Heading icon={Airplane} accent={TRANSPORT_ACCENT} title="Transport" count={transports.length} action={<AddButton label="Add" onClick={() => onEdit(1)} />} />
                {transports.length === 0 ? <RpEmpty title="No transport yet">Add flights, trains, ferries and rentals.</RpEmpty> : (
                    <ul>{transports.map(t => <TransportRow key={t.id} t={t} brandfetchApiKey={brandfetchApiKey} onEdit={() => onEdit(1)} />)}</ul>
                )}
            </section>
            <section className={CARD}>
                <Heading icon={Bed} accent={STAY_ACCENT} title="Stays" count={stays.length} action={<AddButton label="Add" onClick={() => onEdit(2)} />} />
                {stays.length === 0 ? <RpEmpty title="No stays yet">Add hotels, rentals and friends' places.</RpEmpty> : (
                    <ul>{stays.map(a => <StayRow key={a.id} a={a} brandfetchApiKey={brandfetchApiKey} onEdit={() => onEdit(2)} />)}</ul>
                )}
            </section>
        </div>
    );
};

/* ------------------------------------------------------------------ */
/* Costs */
/* ------------------------------------------------------------------ */

export const CostsPanel: React.FC<{ trip: Trip; members: number }> = ({ trip, members }) => {
    const split = costSplit(trip);
    const days = Math.max(1, tripDays(trip));
    const people = Math.max(1, members);
    const rows: { label: string; icon: Icon; value: number; bar: string; accent: string }[] = [
        { label: 'Transport', icon: Airplane, value: split.transport, bar: 'bg-rp-rust', accent: TRANSPORT_ACCENT },
        { label: 'Stays', icon: Bed, value: split.stays, bar: 'bg-rp-mustard', accent: STAY_ACCENT },
        { label: 'Activities', icon: CalendarBlank, value: split.activities, bar: 'bg-rp-green', accent: 'text-rp-green' },
    ];
    if (split.total === 0) {
        return <div className={CARD}><RpEmpty title="No costs yet">Costs you add to transport, stays and activities are totalled here.</RpEmpty></div>;
    }
    return (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-6">
            <section className={CARD}>
                <Heading icon={Receipt} title="Total" />
                <p className="rp-tabular text-[2.5rem] leading-none font-semibold tracking-tight text-rp-ink">{formatCurrency(split.total)}</p>
                <dl className="mt-5 grid grid-cols-2 gap-3">
                    <div className="rounded-rp-inset bg-rp-inset p-3"><dt className="text-xs text-rp-muted">Per person</dt><dd className="rp-tabular text-base font-semibold text-rp-ink">{formatCurrency(split.total / people)}</dd></div>
                    <div className="rounded-rp-inset bg-rp-inset p-3"><dt className="text-xs text-rp-muted">Per day</dt><dd className="rp-tabular text-base font-semibold text-rp-ink">{formatCurrency(split.total / days)}</dd></div>
                </dl>
            </section>
            <section className={CARD}>
                <Heading icon={Receipt} title="Breakdown" />
                <ul className="flex flex-col gap-4">
                    {rows.map(r => {
                        const pct = split.total > 0 ? (r.value / split.total) * 100 : 0;
                        return (
                            <li key={r.label}>
                                <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                                    <span className="flex items-center gap-2 font-medium text-rp-ink"><r.icon size={16} className={r.accent} aria-hidden /> {r.label}</span>
                                    <span className="rp-tabular text-rp-ink">{formatCurrency(r.value)} <span className="text-rp-muted">· {Math.round(pct)}%</span></span>
                                </div>
                                <div className="h-2 overflow-hidden rounded-full bg-rp-inset" role="img" aria-label={`${r.label} ${Math.round(pct)} percent`}>
                                    <div className={cn('h-full rounded-full', r.bar)} style={{ width: `${pct}%` }} />
                                </div>
                            </li>
                        );
                    })}
                </ul>
            </section>
        </div>
    );
};

/* ------------------------------------------------------------------ */
/* Gear */
/* ------------------------------------------------------------------ */

const GEAR_CATEGORIES = ['Clothing', 'Toiletries', 'Electronics', 'Documents', 'Health', 'Misc'] as const;
const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

export const GearPanel: React.FC<{ items: PackingItem[]; onChange: (items: PackingItem[]) => Promise<void> | void }> = ({ items, onChange }) => {
    const [text, setText] = useState('');
    const [category, setCategory] = useState<string>('Clothing');
    const done = items.filter(i => i.isChecked).length;
    const pct = items.length ? Math.round((done / items.length) * 100) : 0;
    const groups = useMemo(() => {
        const names = Array.from(new Set([...GEAR_CATEGORIES, ...items.map(i => i.category || 'Misc')]));
        return names.map(name => ({ name, list: items.filter(i => (i.category || 'Misc') === name) })).filter(g => g.list.length > 0);
    }, [items]);
    const add = () => {
        const t = text.trim();
        if (!t) return;
        void onChange([...items, { id: newId(), text: t, category, isChecked: false }]);
        setText('');
    };
    return (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:gap-6">
            <section className={cn(CARD, 'self-start')}>
                <Heading icon={Backpack} title="Packing" />
                <p className="rp-tabular text-[2.5rem] leading-none font-semibold tracking-tight text-rp-ink">{done}<span className="text-rp-muted">/{items.length}</span></p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-rp-inset" role="img" aria-label={`${pct} percent packed`}>
                    <div className="h-full rounded-full bg-rp-green transition-[width] duration-300" style={{ width: `${pct}%` }} />
                </div>
                <form className="mt-5 flex flex-col gap-3" onSubmit={e => { e.preventDefault(); add(); }}>
                    <label className="sr-only" htmlFor="gear-add">Add an item</label>
                    <input id="gear-add" value={text} onChange={e => setText(e.target.value)} placeholder="Add an item" className={RP_FIELD} />
                    <div className="flex flex-wrap gap-2" role="group" aria-label="Category">
                        {GEAR_CATEGORIES.map(c => <RpChip key={c} selected={category === c} onClick={() => setCategory(c)}>{c}</RpChip>)}
                    </div>
                    <button type="submit" disabled={!text.trim()} className={cn(PILL, 'bg-rp-ink text-rp-on-ink hover:bg-rp-ink/90 disabled:opacity-40')}><Plus size={16} aria-hidden /> Add</button>
                </form>
            </section>
            <section className={CARD}>
                {items.length === 0 ? <RpEmpty title="Nothing to pack yet">Add what you'll bring and tick it off as you pack.</RpEmpty> : (
                    <div className="flex flex-col gap-5">
                        {groups.map(g => (
                            <div key={g.name}>
                                <h3 className="mb-1 flex items-center gap-2 text-xs font-medium text-rp-muted">{g.name} <span className="rp-tabular">{g.list.filter(i => i.isChecked).length}/{g.list.length}</span></h3>
                                <ul className="flex flex-col rounded-rp-inset bg-rp-inset px-3">
                                    {g.list.map(i => (
                                        <li key={i.id} className="flex items-center gap-1 border-t border-rp-line first:border-t-0">
                                            <button
                                                type="button"
                                                role="checkbox"
                                                aria-checked={i.isChecked}
                                                onClick={() => void onChange(items.map(x => (x.id === i.id ? { ...x, isChecked: !x.isChecked } : x)))}
                                                className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-full text-left outline-none focus-visible:ring-2 focus-visible:ring-rp-muted"
                                            >
                                                {i.isChecked ? <CheckSquare size={20} className="shrink-0 text-rp-green" aria-hidden /> : <Square size={20} className="shrink-0 text-rp-muted" aria-hidden />}
                                                <span className={cn('truncate text-sm', i.isChecked ? 'text-rp-muted line-through' : 'text-rp-ink')}>{i.text}</span>
                                            </button>
                                            <button type="button" aria-label={`Remove ${i.text}`} onClick={() => void onChange(items.filter(x => x.id !== i.id))} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-rp-muted outline-none hover:text-rp-rust focus-visible:ring-2 focus-visible:ring-rp-muted">
                                                <Trash size={16} aria-hidden />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
};

/* ------------------------------------------------------------------ */
/* Notes */
/* ------------------------------------------------------------------ */

export const NotesPanel: React.FC<{ notes: string; members: User[]; onSave: (notes: string) => Promise<void> }> = ({ notes, members, onSave }) => {
    const [value, setValue] = useState(notes);
    const [base, setBase] = useState(notes);
    // A saved change from elsewhere replaces the text only when there is nothing unsaved here.
    if (notes !== base && value === base) { setValue(notes); setBase(notes); }
    const dirty = value !== base;
    return (
        <section className={CARD}>
            <Heading icon={FileText} title="Notes" />
            <label className="sr-only" htmlFor="trip-notes">Trip notes</label>
            <textarea
                id="trip-notes"
                value={value}
                onChange={e => setValue(e.target.value)}
                rows={10}
                placeholder="Booking details, ideas, things to remember"
                className={cn(RP_FIELD, 'min-h-48 resize-y py-3 leading-relaxed')}
            />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-rp-muted">{members.length > 0 ? `Shared with ${members.map(m => m.name.split(' ')[0]).join(', ')}` : 'Only you'}</p>
                <ParticleButton
                    disabled={!dirty}
                    onClick={async () => { await onSave(value.trim()); setBase(value.trim()); setValue(value.trim()); }}
                    pendingLabel="Saving"
                    successLabel="Saved"
                    errorLabel="Try again"
                    icon={<Check />}
                >
                    Save notes
                </ParticleButton>
            </div>
        </section>
    );
};
