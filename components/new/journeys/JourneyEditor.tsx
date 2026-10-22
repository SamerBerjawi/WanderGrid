import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Transport, TransportMode, Trip, WorkspaceSettings } from '../../../types';
import ParticleButton from '../../kokonutui/particle-button';
import { candidateToLeg, type FlightCandidate } from '../../../services/flightLookup';
import { useFlightLookup } from '../../../hooks/useFlightLookup';
import { FlightFinder } from './FlightFinder';
import { calculateDurationMinutes } from '../../../services/geocoding';
import { Broadcast, Suitcase, X } from '../../ui/hugeicons';
import { RP_FIELD, RpField } from '../fields';
import { RpSection, RpSheet } from '../ui';
import { TripMenu } from '../trips/TripMenu';
import { LEG_DATE, LegForm } from '../trips/LegForm';
import { extractIata } from '../../../hooks/useFlightLog';
import { MODE_SPEED_KMH, elapsedMinutes, estimateMinutes, fromLog, isIndependent, journeyKm, localArrival, type JourneyRecord } from '../../../utils/journeysModel';
import { toast } from '../../../services/toast';
import { errorMessage } from '../../../services/toast';
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
}> = ({ target, trips, modes, noun, settings, brandfetchApiKey, onClose, onSave, history = [], onNextLeg }) => {
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
    const flight = leg.mode === 'Flight';
    const trip = trips.find(t => t.id === tripId);
    // Find the flight from its number and date: by itself for a new flight, on request for an existing one.
    const lookup = useFlightLookup(leg.identifier || '', leg.departureDate || '', flight && !editing);
    const [applied, setApplied] = useState<{ key: string; index: number } | null>(null);
    const lastSig = useRef('');
    const sigOf = (l: Partial<Transport>) => [l.origin, l.destination, l.departureDate, l.departureTime, l.arrivalTime].join('|');
    const blankOrigin = flight ? settings?.defaultStartingAirport || '' : '';
    const use = (c: FlightCandidate, index: number) => {
        const p = candidateToLeg(c);
        setLeg(l => {
            const next = { ...l, ...p, originLat: undefined, originLng: undefined, originGeoKey: undefined, destLat: undefined, destLng: undefined, destGeoKey: undefined };
            lastSig.current = sigOf(next);
            return next;
        });
        setApplied({ key: lookup.key, index });
    };
    // One result for a new flight is filled in at once, unless the person has already chosen the places themselves.
    useEffect(() => {
        if (editing || lookup.status !== 'done' || !lookup.result || lookup.result.candidates.length !== 1) return;
        if (applied?.key === lookup.key) return;
        const untouched = (!leg.origin?.trim() || leg.origin === blankOrigin) && !leg.destination?.trim();
        if (untouched || sigOf(leg) === lastSig.current) use(lookup.result.candidates[0], 0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lookup.status, lookup.key, lookup.result]);
    useEffect(() => { setApplied(null); lastSig.current = ''; }, [target]);

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
            const minutes = flight ? calculateDurationMinutes(origin, destination, leg.departureDate, leg.departureTime || '00:00', arrivalDate, leg.arrivalTime || '00:00') : 0;
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

    // A guess at the arrival from the distance, for a flight whose schedule can't be looked up.
    const canEstimate = flight && /^[A-Za-z]{3}$/.test((leg.origin || '').trim()) && /^[A-Za-z]{3}$/.test((leg.destination || '').trim()) && Boolean(leg.departureDate && leg.departureTime);
    const estimate = () => {
        const km = journeyKm({ origin: leg.origin || '', destination: leg.destination || '', originLat: leg.originLat, originLng: leg.originLng, destLat: leg.destLat, destLng: leg.destLng } as Transport);
        const minutes = estimateMinutes(km);
        if (!minutes) { setError("Couldn't work out the distance. Enter the arrival time."); return; }
        setError('');
        const arr = localArrival(leg.origin!, leg.destination!, leg.departureDate!, leg.departureTime!, minutes);
        if (!arr) { setError("Couldn't find the time zones. Enter the arrival time."); return; }
        patch({ arrivalDate: arr.date, arrivalTime: arr.time, duration: minutes });
    };
    // The same flight number logged before gives its times for another day.
    const logged = useMemo(() => (flight && !editing && lookup.status === 'done' && !(lookup.result?.candidates || []).some(c => c.confidence === 'schedule') ? fromLog(history, leg.identifier || '') : null), [flight, editing, lookup.status, lookup.result, history, leg.identifier]);
    const useLogged = () => {
        if (!logged) return;
        const dayShift = Math.round((Date.parse(`${logged.arrivalDate || logged.departureDate}T12:00:00Z`) - Date.parse(`${logged.departureDate}T12:00:00Z`)) / 86400000);
        const arrival = new Date(`${leg.departureDate}T12:00:00Z`); arrival.setUTCDate(arrival.getUTCDate() + Math.max(0, dayShift));
        patch({ origin: logged.origin, destination: logged.destination, provider: logged.provider || leg.provider, departureTime: logged.departureTime, arrivalTime: logged.arrivalTime, arrivalDate: arrival.toISOString().slice(0, 10), duration: logged.duration, originLat: undefined, originLng: undefined, originGeoKey: undefined, destLat: undefined, destLng: undefined, destGeoKey: undefined });
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
                            <div className="flex flex-col gap-1 pb-2">
                                <div className="grid gap-x-3 sm:grid-cols-2">
                                    <RpField label="Flight number">{id => <input id={id} value={leg.identifier || ''} onChange={e => patch({ identifier: e.target.value })} placeholder="ME215" className={RP_FIELD} autoComplete="off" autoCapitalize="characters" />}</RpField>
                                    <RpField label="Departure date">{id => <input id={id} type="date" value={leg.departureDate || ''} onChange={e => patch({ departureDate: e.target.value, arrivalDate: leg.arrivalDate && leg.arrivalDate >= e.target.value ? leg.arrivalDate : e.target.value })} className={LEG_DATE} />}</RpField>
                                </div>
                                <FlightFinder
                                    status={lookup.status}
                                    result={lookup.result}
                                    message={lookup.message}
                                    valid={lookup.valid}
                                    appliedIndex={applied?.key === lookup.key ? applied.index : -1}
                                    onUse={use}
                                    onRun={editing ? () => void lookup.run() : undefined}
                                    brandfetchApiKey={brandfetchApiKey}
                                />
                                {logged ? (
                                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-rp-inset bg-rp-surface p-3">
                                        <p className="text-sm text-rp-ink">You logged {logged.identifier} before: <span className="rp-tabular font-medium">{logged.origin} {logged.departureTime} → {logged.destination} {logged.arrivalTime}</span></p>
                                        <button type="button" onClick={useLogged} className="inline-flex min-h-11 items-center rounded-full bg-rp-ink px-4 text-sm font-medium text-rp-on-ink outline-none hover:bg-rp-ink/90 focus-visible:ring-2 focus-visible:ring-rp-muted">Use these times</button>
                                    </div>
                                ) : null}
                            </div>
                        ) : undefined}
                    />
                    {canRoute ? (
                        <button type="button" onClick={() => void calcRoute()} disabled={routing} className="mt-1 inline-flex min-h-11 items-center gap-2 self-start rounded-full bg-rp-inset px-4 text-sm font-medium text-rp-ink outline-none hover:bg-rp-line focus-visible:ring-2 focus-visible:ring-rp-muted disabled:opacity-50">{routing ? 'Working it out' : leg.mode === 'Car Rental' || leg.mode === 'Personal Car' || leg.mode === 'Bus' ? 'Calculate route' : 'Estimate distance and time'}</button>
                    ) : null}
                    {canEstimate ? (
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

                {error ? <p role="alert" className="text-sm text-rp-rust">{error}</p> : null}
            </div>
        </RpSheet>
    );
};
