import React, { useState } from 'react';
import type { RoadTripWaypoint, Transport } from '../../../types';
import { ArrowDown, ArrowUp, CaretDown, Plus, Trash } from '../../ui/hugeicons';
import { RP_FIELD, RpField } from '../fields';
import { PlaceField } from '../PlaceField';
import { RpChip, RpToggle } from '../ui';
import { modeLook } from './transportModes';
import { cn } from '../../../utils/cn';

/**
 * The details of one transport leg beyond where, when and how much: seat and class, terminals and
 * gates, vehicle, website, notes, custom fields, and for road legs the stops along the way
 * (UI_UX_DESIGN_REFERENCE.md decision 51). Folded away until asked for, so the common case stays short.
 */

type Patch = (p: Partial<Transport>) => void;

const CLASSES = ['Economy', 'Premium Economy', 'Business', 'First'] as const;
const SEATS = ['Window', 'Aisle', 'Middle'] as const;
const STOP_TYPES: RoadTripWaypoint['type'][] = ['Stop', 'Food', 'Lodging', 'Sightseeing', 'Fuel'];
const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `w-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

const text = (value: string | undefined, onChange: (v: string) => void, placeholder?: string) => (id: string) => (
    <input id={id} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={RP_FIELD} autoComplete="off" />
);

const Group: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="mt-3 first:mt-0">
        <p className="mb-1 text-xs font-medium text-rp-muted">{title}</p>
        {children}
    </div>
);

/** Stops along a road leg: where, what kind, and whether they count as visited places. */
const Waypoints: React.FC<{ leg: Partial<Transport>; patch: Patch }> = ({ leg, patch }) => {
    const stops = leg.waypoints || [];
    const set = (next: RoadTripWaypoint[]) => patch({ waypoints: next });
    const update = (i: number, p: Partial<RoadTripWaypoint>) => set(stops.map((s, j) => (j === i ? { ...s, ...p } : s)));
    const move = (i: number, by: number) => {
        const to = i + by;
        if (to < 0 || to >= stops.length) return;
        const next = [...stops];
        [next[i], next[to]] = [next[to], next[i]];
        set(next);
    };
    return (
        <Group title="Stops along the way">
            <ul className="flex flex-col gap-2">
                {stops.map((s, i) => (
                    <li key={s.id} className="rounded-rp-inset bg-rp-surface p-3">
                        <div className="flex items-start gap-2">
                            <div className="min-w-0 flex-1">
                                <RpField label={`Stop ${i + 1}`}>
                                    {id => (
                                        <PlaceField
                                            id={id}
                                            value={s.name}
                                            located={Boolean(s.coordinates)}
                                            placeholder="Town, sight or station"
                                            onChange={name => update(i, { name, coordinates: undefined })}
                                            onPick={(name, coordinates) => update(i, { name, coordinates })}
                                            format={p => p.name}
                                        />
                                    )}
                                </RpField>
                            </div>
                            <div className="flex shrink-0 pt-6">
                                <button type="button" aria-label={`Move stop ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)} className="inline-flex size-11 items-center justify-center rounded-full text-rp-muted outline-none hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted disabled:opacity-30"><ArrowUp size={16} aria-hidden /></button>
                                <button type="button" aria-label={`Move stop ${i + 1} down`} disabled={i === stops.length - 1} onClick={() => move(i, 1)} className="inline-flex size-11 items-center justify-center rounded-full text-rp-muted outline-none hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted disabled:opacity-30"><ArrowDown size={16} aria-hidden /></button>
                                <button type="button" aria-label={`Remove stop ${i + 1}`} onClick={() => set(stops.filter((_, j) => j !== i))} className="inline-flex size-11 items-center justify-center rounded-full text-rp-muted outline-none hover:text-rp-rust focus-visible:ring-2 focus-visible:ring-rp-muted"><Trash size={16} aria-hidden /></button>
                            </div>
                        </div>
                        <div role="group" aria-label={`Kind of stop ${i + 1}`} className="flex flex-wrap gap-2">
                            {STOP_TYPES.map(t => <RpChip key={t} selected={s.type === t} onClick={() => update(i, { type: t })}>{t}</RpChip>)}
                        </div>
                        <RpToggle label="Add to visited places" checked={s.addToVisited !== false} onChange={v => update(i, { addToVisited: v })} />
                    </li>
                ))}
            </ul>
            <button
                type="button"
                onClick={() => set([...stops, { id: newId(), name: '', type: 'Stop', addToVisited: true }])}
                className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-full bg-rp-surface px-4 text-sm font-medium text-rp-ink outline-none hover:bg-rp-line focus-visible:ring-2 focus-visible:ring-rp-muted"
            >
                <Plus size={16} aria-hidden /> Add a stop
            </button>
        </Group>
    );
};

export const LegDetails: React.FC<{ leg: Partial<Transport>; patch: Patch; open?: boolean }> = ({ leg, patch, open: initiallyOpen }) => {
    const [open, setOpen] = useState(Boolean(initiallyOpen));
    const mode = leg.mode || 'Flight';
    const look = modeLook(mode);
    const flight = mode === 'Flight';
    const rental = mode === 'Car Rental';
    const road = mode === 'Car Rental' || mode === 'Personal Car';
    const seated = flight || mode === 'Train' || mode === 'Bus';
    const fields = leg.customFields || [];
    const setFields = (next: Array<{ key: string; value: string }>) => patch({ customFields: next.length ? next : undefined });

    return (
        <div className="mt-1 rounded-rp-inset bg-rp-inset p-3">
            <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpen(o => !o)}
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-full text-left text-sm font-medium text-rp-ink outline-none focus-visible:ring-2 focus-visible:ring-rp-muted"
            >
                <span className="flex items-center gap-2"><look.icon size={16} className={look.text} aria-hidden /> More details</span>
                <CaretDown size={16} className={cn('text-rp-muted transition-transform duration-200', open && 'rotate-180')} aria-hidden />
            </button>

            {open ? (
                <div className="pt-2">
                    {seated ? (
                        <Group title="Class">
                            <div role="group" aria-label="Class" className="flex flex-wrap gap-2">
                                {CLASSES.map(c => <RpChip key={c} selected={leg.travelClass === c} onClick={() => patch({ travelClass: leg.travelClass === c ? undefined : c })}>{c}</RpChip>)}
                            </div>
                        </Group>
                    ) : null}
                    {seated ? (
                        <Group title="Seat">
                            <div role="group" aria-label="Seat type" className="flex flex-wrap gap-2">
                                {SEATS.map(s => <RpChip key={s} selected={leg.seatType === s} onClick={() => patch({ seatType: leg.seatType === s ? undefined : s })}>{s}</RpChip>)}
                            </div>
                            {flight ? <RpToggle label="Exit row" checked={Boolean(leg.isExitRow)} onChange={v => patch({ isExitRow: v || undefined })} /> : null}
                        </Group>
                    ) : null}
                    {flight ? (
                        <Group title="Terminals and gates">
                            <div className="grid gap-x-3 sm:grid-cols-2">
                                <RpField label="Departure terminal">{text(leg.departureTerminal, v => patch({ departureTerminal: v }))}</RpField>
                                <RpField label="Departure gate">{text(leg.departureGate, v => patch({ departureGate: v }))}</RpField>
                                <RpField label="Arrival terminal">{text(leg.arrivalTerminal, v => patch({ arrivalTerminal: v }))}</RpField>
                                <RpField label="Arrival gate">{text(leg.arrivalGate, v => patch({ arrivalGate: v }))}</RpField>
                                <RpField label="Aircraft registration">{text(leg.tailNumber, v => patch({ tailNumber: v }), 'PH-BXA')}</RpField>
                            </div>
                        </Group>
                    ) : null}
                    {rental ? (
                        <Group title="Rental">
                            <div className="grid gap-x-3 sm:grid-cols-2">
                                <RpField label="Vehicle">{text(leg.vehicleModel, v => patch({ vehicleModel: v }), 'Model')}</RpField>
                                <RpField label="Pick-up">{text(leg.pickupLocation, v => patch({ pickupLocation: v }), 'Where you collect it')}</RpField>
                                <RpField label="Drop-off">{text(leg.dropoffLocation, v => patch({ dropoffLocation: v }), 'Where you return it')}</RpField>
                            </div>
                        </Group>
                    ) : null}
                    <Group title="Trip">
                        <div className="grid gap-x-3 sm:grid-cols-2">
                            <RpField label="Distance (km)">
                                {id => <input id={id} inputMode="decimal" value={leg.distance ?? ''} onChange={e => { const n = Number(e.target.value.replace(',', '.')); patch({ distance: e.target.value && Number.isFinite(n) && n >= 0 ? n : undefined }); }} placeholder="Worked out from the places" className={cn(RP_FIELD, 'rp-tabular')} autoComplete="off" />}
                            </RpField>
                            <RpField label="Website">{text(leg.website, v => patch({ website: v }), 'https://')}</RpField>
                        </div>
                        <RpField label="Notes">
                            {id => <textarea id={id} value={leg.notes || ''} onChange={e => patch({ notes: e.target.value })} rows={3} className={cn(RP_FIELD, 'resize-y py-3')} />}
                        </RpField>
                    </Group>
                    {road ? <Waypoints leg={leg} patch={patch} /> : null}
                    <Group title="Custom fields">
                        <ul className="flex flex-col gap-2">
                            {fields.map((f, i) => (
                                <li key={i} className="flex items-center gap-2">
                                    <input aria-label={`Field ${i + 1} name`} value={f.key} onChange={e => setFields(fields.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))} placeholder="Name" className={RP_FIELD} autoComplete="off" />
                                    <input aria-label={`Field ${i + 1} value`} value={f.value} onChange={e => setFields(fields.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} placeholder="Value" className={RP_FIELD} autoComplete="off" />
                                    <button type="button" aria-label={`Remove field ${i + 1}`} onClick={() => setFields(fields.filter((_, j) => j !== i))} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-rp-muted outline-none hover:text-rp-rust focus-visible:ring-2 focus-visible:ring-rp-muted"><Trash size={16} aria-hidden /></button>
                                </li>
                            ))}
                        </ul>
                        <button type="button" onClick={() => setFields([...fields, { key: '', value: '' }])} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-full bg-rp-surface px-4 text-sm font-medium text-rp-ink outline-none hover:bg-rp-line focus-visible:ring-2 focus-visible:ring-rp-muted">
                            <Plus size={16} aria-hidden /> Add a field
                        </button>
                    </Group>
                </div>
            ) : null}
        </div>
    );
};
