import React from 'react';
import type { Carrier, Transport } from '../../../types';
import CardFlip from '../../kokonutui/card-flip';
import { CarrierCell, DelayChip, STATUS_LOOK, StatusPill } from './JourneyParts';
import { modeLook } from '../trips/transportModes';
import { formatDate, formatCurrency } from '../../../utils/formatters';
import { formatMinutes, journeyMinutes, journeyStatus, placeCode, placeName } from '../../../utils/journeysModel';
import { Airport, BookingTicket, DoorOpen, Seat, type Icon } from '../../ui/hugeicons';
import { cn } from '../../../utils/cn';

/**
 * The boarding pass of a journey: a Flick Card. The front is the pass (carrier, route, date, times,
 * length) in the colour of the journey's state; flip it (drag, tap or Enter) for the booking: reference,
 * seat, class, terminals and gates, aircraft or vehicle, and cost.
 */

const Field: React.FC<{ label: string; value?: React.ReactNode; icon?: Icon; onFill?: boolean; className?: string }> = ({ label, value, icon: IconC, onFill, className }) => (
    <div className={cn('flex min-w-0 flex-col', className)}>
        <dt className={cn('flex items-center gap-1 text-2xs', onFill ? 'opacity-70' : 'text-rp-muted')}>{IconC ? <IconC size={12} aria-hidden /> : null}{label}</dt>
        <dd className="rp-tabular truncate text-sm font-medium">{value || '—'}</dd>
    </div>
);

/** Terminal and gate, each with its icon. */
const gate = (terminal?: string, g?: string): React.ReactNode => (terminal || g ? (
    <span className="inline-flex items-center gap-2">
        {terminal ? <span className="inline-flex items-center gap-1"><Airport size={13} aria-hidden /><span className="sr-only">Terminal </span>{terminal}</span> : null}
        {g ? <span className="inline-flex items-center gap-1"><DoorOpen size={13} aria-hidden /><span className="sr-only">Gate </span>{g}</span> : null}
    </span>
) : undefined);

export const BoardingPass: React.FC<{ t: Transport; brandfetchApiKey?: string; carriers?: Carrier[]; className?: string }> = ({ t, brandfetchApiKey, carriers, className }) => {
    const look = modeLook(t.mode);
    const status = journeyStatus(t);
    const fill = STATUS_LOOK[status.state];
    const minutes = journeyMinutes(t);
    const crossesDay = Boolean(t.arrivalDate && t.departureDate && t.arrivalDate > t.departureDate);

    const front = (
        <div className={cn('flex h-full flex-col gap-2 p-4', fill.fillText)}>
            <div className="flex items-center justify-between gap-2">
                <CarrierCell t={t} brandfetchApiKey={brandfetchApiKey} carriers={carriers} size="sm" tone={status.state === 'done' ? 'default' : 'onInk'} className="min-w-0" />
                <span className="flex shrink-0 items-center gap-1.5">
                    <DelayChip delay={status.delay} className="bg-rp-surface text-rp-ink" />
                    <StatusPill status={status} mode={t.mode} className={status.state === 'done' ? undefined : 'bg-rp-surface text-rp-ink'} />
                </span>
            </div>
            <div className="mt-auto flex items-center gap-3">
                <span className="flex flex-col">
                    <span className="rp-tabular text-[2rem] font-medium leading-none">{placeCode(t.origin)}</span>
                    <span className="mt-1 max-w-[6.5rem] truncate text-2xs opacity-70">{placeName(t.origin)}</span>
                </span>
                <span className="flex min-w-6 flex-1 items-center gap-1 opacity-80" aria-hidden>
                    <span className="h-px flex-1 border-t-2 border-dotted border-current" />
                    <look.icon size={18} />
                    <span className="h-px flex-1 border-t-2 border-dotted border-current" />
                </span>
                <span className="flex flex-col items-end text-right">
                    <span className="rp-tabular text-[2rem] font-medium leading-none">{placeCode(t.destination)}</span>
                    <span className="mt-1 max-w-[6.5rem] truncate text-2xs opacity-70">{placeName(t.destination)}</span>
                </span>
            </div>
            <div className="-mx-4 border-t border-dashed border-current opacity-30" aria-hidden />
            <dl className="grid grid-cols-4 gap-2">
                <Field label="Date" value={formatDate(t.departureDate, 'short')} onFill />
                <Field label="Departs" value={t.departureTime} onFill />
                <Field label="Arrives" value={t.arrivalTime ? `${t.arrivalTime}${crossesDay ? ' +1' : ''}` : undefined} onFill />
                <Field label="Length" value={minutes ? formatMinutes(minutes) : undefined} onFill />
            </dl>
        </div>
    );

    const details: [string, React.ReactNode, Icon?][] = [
        ['Confirmation', t.confirmationCode, BookingTicket],
        ['Seat', [t.seatNumber, t.seatType && t.seatType.toLowerCase()].filter(Boolean).join(' · '), Seat],
        ['Class', t.travelClass],
        ['Departure', gate(t.departureTerminal, t.departureGate)],
        ['Arrival', gate(t.arrivalTerminal, t.arrivalGate)],
        [t.mode === 'Flight' ? 'Aircraft' : 'Vehicle', [t.vehicleModel, t.tailNumber].filter(Boolean).join(' · ')],
        ['Cost', t.cost != null ? formatCurrency(t.cost) : undefined],
    ];
    const shown = details.filter(([, v]) => v);

    const back = (
        <div className="flex h-full flex-col gap-3 p-4">
            <div className="flex items-center justify-between gap-2">
                <span className="text-2xs font-semibold uppercase tracking-[0.14em] text-rp-muted">Booking</span>
                <span className="rp-tabular text-xs text-rp-muted">{placeCode(t.origin)} → {placeCode(t.destination)}</span>
            </div>
            {shown.length ? (
                <dl className="grid grid-cols-3 gap-x-3 gap-y-3">
                    {shown.map(([label, value, icon]) => <Field key={label} label={label} value={value} icon={icon} className={label === 'Confirmation' ? 'col-span-2' : undefined} />)}
                </dl>
            ) : (
                <p className="my-auto text-center text-sm text-rp-muted">No booking details yet. Edit the flight to add them.</p>
            )}
        </div>
    );

    return (
        <div className={cn('flex justify-center', className)}>
            <CardFlip
                front={front}
                back={back}
                label={`Boarding pass, ${t.origin} to ${t.destination}`}
                className="aspect-[16/10] w-full max-w-[23rem] rounded-rp-tile"
                faceClassName={cn('rounded-rp-tile border-0 rp-shadow-raised', fill.fill, status.state === 'done' && 'border border-rp-line')}
                backFaceClassName="border border-rp-line bg-rp-surface text-rp-ink"
            />
        </div>
    );
};
