import React, { useEffect, useMemo, useState } from 'react';
import type { Transport, TransportMode, Trip, User, WorkspaceSettings } from '../../../types';
import ParticleButton from '../../kokonutui/particle-button';
import { useFlightLegAssist } from '../../../hooks/useFlightLegAssist';
import { FlightLookupLead } from './FlightFinder';
import { calculateDurationMinutes } from '../../../services/geocoding';
import { Suitcase, Users, X } from '../../ui/hugeicons';
import { RP_FIELD, RpField } from '../fields';
import { RpSection, RpSheet } from '../ui';
import { TripMenu } from '../trips/TripMenu';
import { LEG_DATE, LegForm } from '../trips/LegForm';
import { ItemSharingFields } from '../trips/ItemSharingFields';
import { extractIata } from '../../../hooks/useFlightLog';
import { MODE_SPEED_KMH, durationBetween, elapsedMinutes, isIndependent, journeyKm, localArrival, type JourneyRecord } from '../../../utils/journeysModel';
import { tripAllPeople, tripTravellers } from '../../../utils/tripPeople';
import { errorMessage, toast } from '../../../services/toast';
import { cn } from '../../../utils/cn';

/**
 * Add or change one journey. The fields are the transport editor of the trip sheets (LegForm), so a
 * flight is edited the same way here and on a trip; this sheet adds the trip, the times it was actually
 * flown, and "Fill from flight number" for flights. Saving keeps every field the form doesn't show.
 */

/** `seed` starts a new flight from another (a copy, the way back, the next leg); `tripId` keeps it on the same trip. */
export type JourneyEditorTarget = { kind: 'create'; seed?: Partial<Transport>; tripId?: string } | { kind: 'edit'; record: JourneyRecord };

const newId = () => Math.random().toString(36).slice(2, 11);
const today = () => new Date().toISOString().slice(0, 10);
const num = (v: string): number | undefined => { const n = parseFloat(v); return Number.isFinite(n) ? n : undefined; };

export const JourneyEditor: React.FC<{
    target: JourneyEditorTarget | null;
    trips: Trip[];
    users?: User[];
    modes: TransportMode[];
    noun: string;
    settings: WorkspaceSettings | null;
    brandfetchApiKey?: string;
    onClose: () => void;
    onSave: (leg: Transport, tripId: string, original?: { flight: Transport; tripId: string }) => Promise<void>;
    /** The flights already logged: "the same flight number as before" offers its times. */
    history?: JourneyRecord[];
    /** After "Save and add the next leg": the saved flight, so the page can open a connecting one. */
    onNextLeg?: (saved: Transport, tripId: string) => void;
}> = ({ target, trips, users = [], modes, noun, settings, brandfetchApiKey, onClose, onSave, history = [], onNextLeg }) => {
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
            const seed = target.seed;
            setLeg({ ...blank(), ...(seed ? { ...seed, id: undefined, version: undefined } as Partial<Transport> : {}) });
            setCost(seed?.cost != null ? String(seed.cost) : '');
            setTripId(target.tripId && trips.some(t => t.id === target.tripId) ? target.tripId : 'unassigned');
        }
        setError('');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [target]);

    const patch = (p: Partial<Transport>) => setLeg(l => ({ ...l, ...p }));
    const trip = trips.find(t => t.id === tripId);
    const assist = useFlightLegAssist({
        leg,
        setLeg,
        editing: Boolean(editing),
        resetKey: target,
        blankOrigin: leg.mode === 'Flight' ? settings?.defaultStartingAirport || '' : '',
        history,
    });
    const { flight } = assist;

    const save = async (next = false) => {
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
            const minutes = flight ? (durationBetween(origin, destination, leg.departureDate, leg.departureTime || '00:00', arrivalDate, leg.arrivalTime || '00:00') ?? calculateDurationMinutes(origin, destination, leg.departureDate, leg.departureTime || '00:00', arrivalDate, leg.arrivalTime || '00:00')) : 0;
            // Land and sea: the time is the wall-clock gap (no airport zones), the distance the one given, else the time at the mode's average speed, else the straight line.
            if (!flight) {
                // Zones for both ends (cached after the first time), so a crossing of a zone line is counted.
                try {
                    const { getCoordinates } = await import('../../../services/geocoding');
                    const { ensureZone } = await import('../../../services/timezone');
                    const [a, b] = await Promise.all([getCoordinates(origin), getCoordinates(destination)]);
                    await Promise.all([ensureZone(origin, leg.originLat ?? a?.lat, leg.originLng ?? a?.lng), ensureZone(destination, leg.destLat ?? b?.lat, leg.destLng ?? b?.lng)]);
                } catch { /* the clock gap is used */ }
            }
            const wall = flight ? 0 : elapsedMinutes(origin, destination, leg.departureDate, leg.departureTime || '00:00', arrivalDate, leg.arrivalTime || '00:00');
            // The distance given, else the places (stretched for how winding the route is), else the time at the mode's average speed.
            // A distance left over from other places is not kept when From or To changed.
            const stale = Boolean(editing && (origin !== editing.flight.origin || destination !== editing.flight.destination) && leg.distance === editing.flight.distance);
            const landKm = flight ? undefined : (stale ? 0 : leg.distance) || Math.round(journeyKm({ mode: leg.mode, origin, destination, originLat: leg.originLat, originLng: leg.originLng, destLat: leg.destLat, destLng: leg.destLng } as Transport)) || (wall ? Math.round((wall / 60) * (MODE_SPEED_KMH[leg.mode || ''] || 80)) : undefined);
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
                duration: flight ? minutes || leg.duration : wall || leg.duration,
                ...(flight ? {} : { distance: landKm }),
                actualDepartureTime: leg.actualDepartureTime || undefined,
                actualArrivalTime: leg.actualArrivalTime || undefined,
                passengers: travellers.length > 1 ? leg.passengers : undefined,
                paidBy: trip ? leg.paidBy : undefined,
                excludeFromAnalytics: leg.excludeFromAnalytics,
            };
            await onSave(payload, tripId, editing ? { flight: editing.flight, tripId: isIndependent(editing.trip.id) ? 'unassigned' : editing.trip.id } : undefined);
            if (next && onNextLeg) onNextLeg(payload, tripId); else onClose();
        } catch (e) {
            const msg = errorMessage(e, "That didn't save. Try again.");
            setError(msg);
            throw e;
        }
    };

    // Land and sea: the road distance and time from the routing service (cars, coaches), or an estimate from the places at the mode's average speed.
    const [routing, setRouting] = useState(false);
    const canRoute = !flight && Boolean(leg.origin?.trim() && leg.destination?.trim());
    const calcRoute = async () => {
        setError('');
        setRouting(true);
        try {
            const [{ getCoordinates }, { estimateLeg, SOURCE_LABEL }] = await Promise.all([import('../../../services/geocoding'), import('../../../services/journeyEstimate')]);
            const [a, b] = await Promise.all([getCoordinates(leg.origin!.trim()), getCoordinates(leg.destination!.trim())]);
            if (!a || !b) throw new Error('Could not find both places on the map.');
            const coords: [number, number][] = [[a.lng, a.lat]];
            for (const w of leg.waypoints || []) {
                if (w.coordinates) coords.push([w.coordinates.lng, w.coordinates.lat]);
                else if (w.name) { const c = await getCoordinates(w.name); if (c) coords.push([c.lng, c.lat]); }
            }
            coords.push([b.lng, b.lat]);
            const { ensureZone } = await import('../../../services/timezone');
            await Promise.all([ensureZone(leg.origin!.trim(), a.lat, a.lng), ensureZone(leg.destination!.trim(), b.lat, b.lng)]);
            const est = await estimateLeg(leg.mode, coords);
            if (est.km <= 0) throw new Error("Couldn't work out the distance between these places.");
            const minutes = est.minutes;
            const patchBody: Partial<Transport> = { distance: est.km, duration: minutes, originLat: a.lat, originLng: a.lng, originGeoKey: leg.origin!.trim(), destLat: b.lat, destLng: b.lng, destGeoKey: leg.destination!.trim() };
            if (leg.departureDate && leg.departureTime && minutes > 0) {
                // The arrival on the destination's clock: its own time zone when both places are known.
                const zoned = localArrival(leg.origin!.trim(), leg.destination!.trim(), leg.departureDate, leg.departureTime, minutes);
                if (zoned) { patchBody.arrivalDate = zoned.date; patchBody.arrivalTime = zoned.time; }
                else {
                    const arr = new Date(new Date(`${leg.departureDate}T${leg.departureTime}:00`).getTime() + minutes * 60000);
                    const pad = (n: number) => String(n).padStart(2, '0');
                    patchBody.arrivalDate = `${arr.getFullYear()}-${pad(arr.getMonth() + 1)}-${pad(arr.getDate())}`;
                    patchBody.arrivalTime = `${pad(arr.getHours())}:${pad(arr.getMinutes())}`;
                }
            }
            const h = Math.floor(minutes / 60);
            toast.info(`${est.km.toLocaleString('en-US')} km, ${h ? `${h} h ` : ''}${minutes % 60} min, ${SOURCE_LABEL[est.source]}.`);
            patch(patchBody);
        } catch (e) {
            setError(errorMessage(e, "Couldn't work out the route."));
        } finally {
            setRouting(false);
        }
    };

    const estimate = () => {
        const res = assist.estimate();
        setError(res.ok ? '' : res.error);
    };

    const people = useMemo(() => tripAllPeople(trip, users), [trip, users]);
    const travellers = useMemo(() => tripTravellers(trip, users), [trip, users]);

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
                    <span className="flex flex-wrap items-center justify-end gap-2">
                        {!editing && onNextLeg ? (
                            <ParticleButton onClick={() => save(true)} variant="inset" pendingLabel="Saving" successLabel="Saved" errorLabel="Check the details">Save and add next leg</ParticleButton>
                        ) : null}
                        <ParticleButton onClick={() => save(false)} pendingLabel="Saving" successLabel="Saved" errorLabel="Check the details">{editing ? 'Save changes' : `Add ${noun}`}</ParticleButton>
                    </span>
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
                        omit={flight ? ['identifier', 'departureDate'] : []}
                        lead={flight ? (
                            <FlightLookupLead
                                leg={leg}
                                patch={patch}
                                lookup={assist.lookup}
                                appliedIndex={assist.appliedIndex}
                                onUse={assist.useCandidate}
                                editing={Boolean(editing)}
                                logged={assist.logged}
                                onUseLogged={assist.useLogged}
                                brandfetchApiKey={brandfetchApiKey}
                            />
                        ) : undefined}
                    />
                    {canRoute ? (
                        <button type="button" onClick={() => void calcRoute()} disabled={routing} className="mt-1 inline-flex min-h-11 items-center gap-2 self-start rounded-full bg-rp-inset px-4 text-sm font-medium text-rp-ink outline-none hover:bg-rp-line focus-visible:ring-2 focus-visible:ring-rp-muted disabled:opacity-50">{routing ? 'Working it out' : leg.mode === 'Car Rental' || leg.mode === 'Personal Car' || leg.mode === 'Bus' ? 'Calculate route' : 'Estimate distance and time'}</button>
                    ) : null}
                    {assist.canEstimate ? (
                        <button type="button" onClick={estimate} className="mt-1 inline-flex min-h-11 items-center gap-2 self-start rounded-full bg-rp-inset px-4 text-sm font-medium text-rp-ink outline-none hover:bg-rp-line focus-visible:ring-2 focus-visible:ring-rp-muted">Estimate arrival time</button>
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

                <RpSection title={travellers.length > 1 || people.length > 0 ? 'Cost & sharing' : 'Analytics'} icon={Users}>
                    <ItemSharingFields
                        travellers={travellers}
                        people={people}
                        selectedMembers={leg.passengers}
                        onSelectedMembersChange={next => patch({ passengers: next })}
                        membersLabel={flight ? "Who's flying" : "Who's travelling"}
                        paidBy={leg.paidBy}
                        onPaidByChange={next => patch({ paidBy: next })}
                        excludeFromAnalytics={leg.excludeFromAnalytics}
                        onExcludeChange={next => patch({ excludeFromAnalytics: next })}
                        trip={trip}
                    />
                </RpSection>

                {error ? <p role="alert" className="text-sm text-rp-rust">{error}</p> : null}
            </div>
        </RpSheet>
    );
};
