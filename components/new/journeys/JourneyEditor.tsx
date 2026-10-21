import React, { useEffect, useMemo, useState } from 'react';
import type { FlightStatusResponse, Transport, TransportMode, Trip, WorkspaceSettings } from '../../../types';
import ParticleButton from '../../kokonutui/particle-button';
import { flightTracker } from '../../../services/flightTracker';
import { calculateDurationMinutes } from '../../../services/geocoding';
import { Broadcast, Suitcase, X } from '../../ui/hugeicons';
import { RP_FIELD, RpField } from '../fields';
import { RpSection, RpSheet } from '../ui';
import { TripMenu } from '../trips/TripMenu';
import { LEG_DATE, LegForm } from '../trips/LegForm';
import { extractIata } from '../../../hooks/useFlightLog';
import { isIndependent, type JourneyRecord } from '../../../utils/journeysModel';
import { errorMessage } from '../../../services/toast';
import { cn } from '../../../utils/cn';

/**
 * Add or change one journey. The fields are the transport editor of the trip sheets (LegForm), so a
 * flight is edited the same way here and on a trip; this sheet adds the trip, the times it was actually
 * flown, and "Fill from flight number" for flights. Saving keeps every field the form doesn't show.
 */

export type JourneyEditorTarget = { kind: 'create' } | { kind: 'edit'; record: JourneyRecord };

const newId = () => Math.random().toString(36).slice(2, 11);
const today = () => new Date().toISOString().slice(0, 10);
const num = (v: string): number | undefined => { const n = parseFloat(v); return Number.isFinite(n) ? n : undefined; };
const hhmm = (iso?: string) => ((iso || '').split('T')[1] || '').slice(0, 5);

export const JourneyEditor: React.FC<{
    target: JourneyEditorTarget | null;
    trips: Trip[];
    modes: TransportMode[];
    noun: string;
    settings: WorkspaceSettings | null;
    brandfetchApiKey?: string;
    onClose: () => void;
    onSave: (leg: Transport, tripId: string, original?: { flight: Transport; tripId: string }) => Promise<void>;
}> = ({ target, trips, modes, noun, settings, brandfetchApiKey, onClose, onSave }) => {
    const open = Boolean(target);
    const editing = target?.kind === 'edit' ? target.record : null;
    const blank = (): Partial<Transport> => ({
        mode: modes[0] || 'Flight', type: 'One-Way', origin: modes[0] === 'Flight' ? settings?.defaultStartingAirport || '' : '', destination: '',
        departureDate: today(), departureTime: '10:00', arrivalDate: today(), arrivalTime: '14:00', provider: '', identifier: '', confirmationCode: '',
        travelClass: modes[0] === 'Flight' ? (settings?.defaultTravelClass as Transport['travelClass']) || undefined : undefined,
    });
    const [leg, setLeg] = useState<Partial<Transport>>(blank);
    const [cost, setCost] = useState('');
    const [tripId, setTripId] = useState('unassigned');
    const [error, setError] = useState('');

    // Load the journey being changed, or a clean form, whenever the sheet opens on something new.
    useEffect(() => {
        if (!target) return;
        if (target.kind === 'edit') {
            const f = target.record.flight;
            setLeg({ ...f });
            setCost(f.cost != null ? String(f.cost) : '');
            setTripId(isIndependent(target.record.trip.id) ? 'unassigned' : target.record.trip.id);
        } else {
            setLeg(blank());
            setCost('');
            setTripId('unassigned');
        }
        setError('');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [target]);

    const patch = (p: Partial<Transport>) => setLeg(l => ({ ...l, ...p }));
    const flight = leg.mode === 'Flight';
    const trip = trips.find(t => t.id === tripId);
    const canLookUp = flight && !editing && Boolean(leg.identifier?.trim() && leg.departureDate);

    const lookUp = async () => {
        setError('');
        try {
            const key = settings?.aeroDataBoxApiKey || settings?.aviationStackApiKey || '';
            const provider = settings?.aeroDataBoxApiKey ? 'aerodatabox' : settings?.aviationStackApiKey ? 'aviationstack' : 'adsbdb';
            const r: FlightStatusResponse = await flightTracker.getFlightStatus(key, leg.identifier!.replace(/\s/g, ''), leg.departureDate, provider);
            const dep = r.departure, arr = r.arrival;
            const [depDate, depTime] = (dep.scheduled || '').split('T');
            const [arrDate, arrTime] = (arr.scheduled || '').split('T');
            patch({
                ...(r.airline?.name ? { provider: r.airline.name } : {}),
                ...(dep.iata ? { origin: dep.iata, originLat: undefined, originLng: undefined, originGeoKey: undefined } : {}),
                ...(arr.iata ? { destination: arr.iata, destLat: undefined, destLng: undefined, destGeoKey: undefined } : {}),
                ...(depDate ? { departureDate: depDate } : {}),
                ...(depTime ? { departureTime: depTime.slice(0, 5) } : {}),
                ...(arrDate ? { arrivalDate: arrDate } : {}),
                ...(arrTime ? { arrivalTime: arrTime.slice(0, 5) } : {}),
                ...(dep.terminal ? { departureTerminal: dep.terminal } : {}),
                ...(dep.gate ? { departureGate: dep.gate } : {}),
                ...(arr.terminal ? { arrivalTerminal: arr.terminal } : {}),
                ...(arr.gate ? { arrivalGate: arr.gate } : {}),
            });
        } catch (e) {
            setError(errorMessage(e, "Couldn't find that flight. Check the number and date."));
            throw e;
        }
    };

    const save = async () => {
        setError('');
        if (!leg.origin?.trim() || !leg.destination?.trim() || !leg.departureDate) {
            const msg = 'Add where from, where to and the departure date.';
            setError(msg);
            throw new Error(msg);
        }
        try {
            const origin = flight ? extractIata(leg.origin).toUpperCase() || leg.origin.trim() : leg.origin.trim();
            const destination = flight ? extractIata(leg.destination).toUpperCase() || leg.destination.trim() : leg.destination.trim();
            const arrivalDate = leg.arrivalDate || leg.departureDate;
            const minutes = flight ? calculateDurationMinutes(origin, destination, leg.departureDate, leg.departureTime || '00:00', arrivalDate, leg.arrivalTime || '00:00') : 0;
            const payload: Transport = {
                ...(editing?.flight ?? {}),
                ...(leg as Transport),
                id: editing?.flight.id ?? newId(),
                itineraryId: editing?.flight.itineraryId ?? newId(),
                mode: leg.mode || 'Flight',
                type: leg.type || 'One-Way',
                provider: leg.provider || '',
                identifier: (leg.identifier || '').toUpperCase(),
                confirmationCode: (leg.confirmationCode || '').toUpperCase(),
                origin, destination,
                departureDate: leg.departureDate,
                departureTime: leg.departureTime || '00:00',
                arrivalDate,
                arrivalTime: leg.arrivalTime || '00:00',
                cost: num(cost),
                duration: minutes || leg.duration,
                actualDepartureTime: leg.actualDepartureTime || undefined,
                actualArrivalTime: leg.actualArrivalTime || undefined,
            };
            await onSave(payload, tripId, editing ? { flight: editing.flight, tripId: isIndependent(editing.trip.id) ? 'unassigned' : editing.trip.id } : undefined);
            onClose();
        } catch (e) {
            const msg = errorMessage(e, "That didn't save. Try again.");
            setError(msg);
            throw e;
        }
    };

    const tripItems = useMemo(() => [
        { id: 'unassigned', label: 'No trip', icon: X, selected: tripId === 'unassigned', onSelect: () => setTripId('unassigned') },
        ...trips.map(t => ({ id: t.id, label: t.name, icon: Suitcase, selected: t.id === tripId, onSelect: () => setTripId(t.id) })),
    ], [trips, tripId]);

    return (
        <RpSheet
            open={open}
            onClose={onClose}
            title={editing ? `Edit ${noun}` : `New ${noun}`}
            subtitle={editing ? `${editing.flight.origin} to ${editing.flight.destination}` : undefined}
            width={480}
            footer={
                <>
                    <button type="button" onClick={onClose} className="inline-flex min-h-11 items-center rounded-full bg-rp-inset px-5 text-sm font-medium text-rp-ink outline-none hover:bg-rp-line focus-visible:ring-2 focus-visible:ring-rp-muted">Cancel</button>
                    <ParticleButton onClick={save} pendingLabel="Saving" successLabel="Saved" errorLabel="Check the details">{editing ? 'Save changes' : `Add ${noun}`}</ParticleButton>
                </>
            }
        >
            <div className="flex flex-col gap-5">
                <RpSection title={editing ? 'Details' : 'Where and when'}>
                    <LegForm
                        leg={leg}
                        patch={patch}
                        cost={cost}
                        onCost={setCost}
                        brandfetchApiKey={brandfetchApiKey}
                        bias={trip?.coordinates}
                        modes={modes}
                        detailsKey={editing?.flight.id ?? 'new'}
                    />
                    {canLookUp ? (
                        <div className="py-2">
                            <ParticleButton onClick={lookUp} variant="inset" icon={<Broadcast size={16} aria-hidden />} pendingLabel="Looking" successLabel="Filled in" errorLabel="Not found">Fill from flight number</ParticleButton>
                        </div>
                    ) : null}
                </RpSection>

                {flight && editing ? (
                    <RpSection title="As flown">
                        <div className="grid gap-x-3 py-1 sm:grid-cols-2">
                            <RpField label="Actual departure">{id => <input id={id} type="time" value={leg.actualDepartureTime || ''} onChange={e => patch({ actualDepartureTime: e.target.value })} className={LEG_DATE} />}</RpField>
                            <RpField label="Actual arrival">{id => <input id={id} type="time" value={leg.actualArrivalTime || ''} onChange={e => patch({ actualArrivalTime: e.target.value })} className={LEG_DATE} />}</RpField>
                            <RpField label="Aircraft type">{id => <input id={id} value={leg.vehicleModel || ''} onChange={e => patch({ vehicleModel: e.target.value })} placeholder="Boeing 787-9" className={RP_FIELD} autoComplete="off" />}</RpField>
                        </div>
                    </RpSection>
                ) : null}

                <RpSection title="Trip" icon={Suitcase}>
                    <div className="flex min-h-11 items-center justify-between gap-3 py-1">
                        <span className={cn('min-w-0 truncate text-sm', trip ? 'text-rp-ink' : 'text-rp-muted')}>{trip ? trip.name : 'Not on a trip'}</span>
                        <TripMenu label="Choose a trip" pill={{ label: trip ? 'Change' : 'Add to trip', icon: Suitcase }} items={tripItems} />
                    </div>
                </RpSection>

                {error ? <p role="alert" className="text-sm text-rp-rust">{error}</p> : null}
            </div>
        </RpSheet>
    );
};
