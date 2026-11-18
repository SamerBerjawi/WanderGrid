import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Transport } from '../types';
import { candidateToLeg, type FlightCandidate } from '../services/flightLookup';
import { useFlightLookup } from './useFlightLookup';
import { eastwardShare, estimateMinutes, fromLog, journeyKm, localArrival, type JourneyRecord } from '../utils/journeysModel';

export interface UseFlightLegAssistOptions {
    leg: Partial<Transport>;
    setLeg: Dispatch<SetStateAction<Partial<Transport>>>;
    /** True when editing an existing flight leg (lookup runs on request, never auto-fills). */
    editing: boolean;
    /** Changing this resets the applied candidate state and auto-fill signature. */
    resetKey: unknown;
    /** Origin value still treated as untouched (for example workspace defaultStartingAirport). */
    blankOrigin?: string;
    /** Previously logged flights; when lookup has no schedule, offers times from the log. */
    history?: JourneyRecord[];
}

const sigOf = (l: Partial<Transport>) => [l.origin, l.destination, l.departureDate, l.departureTime, l.arrivalTime].join('|');

/**
 * Shared flight lookup, auto-fill, logged-flight fallback and arrival-time estimation for leg forms
 * (used by both the Flights editor and the Trip sheet's Transport step).
 */
export const useFlightLegAssist = ({
    leg,
    setLeg,
    editing,
    resetKey,
    blankOrigin = '',
    history = [],
}: UseFlightLegAssistOptions) => {
    const flight = leg.mode === 'Flight';
    const lookup = useFlightLookup(leg.identifier || '', leg.departureDate || '', flight && !editing);
    const [applied, setApplied] = useState<{ key: string; index: number } | null>(null);
    const lastSig = useRef('');

    const useCandidate = (c: FlightCandidate, index: number) => {
        const p = candidateToLeg(c);
        setLeg(l => {
            const next = {
                ...l,
                ...p,
                originLat: undefined,
                originLng: undefined,
                originGeoKey: undefined,
                destLat: undefined,
                destLng: undefined,
                destGeoKey: undefined,
            };
            lastSig.current = sigOf(next);
            return next;
        });
        setApplied({ key: lookup.key, index });
    };

    // One result for a new flight is filled in at once, unless the person has already chosen the places themselves.
    useEffect(() => {
        if (editing || !flight || lookup.status !== 'done' || !lookup.result || lookup.result.candidates.length !== 1) return;
        if (applied?.key === lookup.key) return;
        const untouched = (!leg.origin?.trim() || leg.origin === blankOrigin) && !leg.destination?.trim();
        if (untouched || sigOf(leg) === lastSig.current) useCandidate(lookup.result.candidates[0], 0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editing, flight, lookup.status, lookup.key, lookup.result]);

    useEffect(() => {
        setApplied(null);
        lastSig.current = '';
    }, [resetKey]);

    // The same flight number logged before gives its times for another day.
    const logged = useMemo(
        () => (flight && !editing && history.length > 0 && lookup.status === 'done' && !(lookup.result?.candidates || []).some(c => c.confidence === 'schedule')
            ? fromLog(history, leg.identifier || '')
            : null),
        [flight, editing, history, lookup.status, lookup.result, leg.identifier],
    );

    const useLogged = () => {
        if (!logged) return;
        const dayShift = Math.round((Date.parse(`${logged.arrivalDate || logged.departureDate}T12:00:00Z`) - Date.parse(`${logged.departureDate}T12:00:00Z`)) / 86400000);
        const arrival = new Date(`${leg.departureDate}T12:00:00Z`);
        arrival.setUTCDate(arrival.getUTCDate() + Math.max(0, dayShift));
        setLeg(l => ({
            ...l,
            origin: logged.origin,
            destination: logged.destination,
            provider: logged.provider || l.provider,
            departureTime: logged.departureTime,
            arrivalTime: logged.arrivalTime,
            arrivalDate: arrival.toISOString().slice(0, 10),
            duration: logged.duration,
            originLat: undefined,
            originLng: undefined,
            originGeoKey: undefined,
            destLat: undefined,
            destLng: undefined,
            destGeoKey: undefined,
        }));
    };

    // A guess at the arrival from the distance, for a flight whose schedule can't be looked up.
    const canEstimate = flight && /^[A-Za-z]{3}$/.test((leg.origin || '').trim()) && /^[A-Za-z]{3}$/.test((leg.destination || '').trim()) && Boolean(leg.departureDate && leg.departureTime);
    const estimate = (): { ok: true } | { ok: false; error: string } => {
        const ends = { origin: leg.origin || '', destination: leg.destination || '', originLat: leg.originLat, originLng: leg.originLng, destLat: leg.destLat, destLng: leg.destLng };
        const km = journeyKm(ends as Transport);
        const minutes = estimateMinutes(km, eastwardShare(ends));
        if (!minutes) return { ok: false, error: "Couldn't work out the distance. Enter the arrival time." };
        const arr = localArrival(leg.origin!, leg.destination!, leg.departureDate!, leg.departureTime!, minutes);
        if (!arr) return { ok: false, error: "Couldn't find the time zones. Enter the arrival time." };
        setLeg(l => ({ ...l, arrivalDate: arr.date, arrivalTime: arr.time, duration: minutes }));
        return { ok: true };
    };

    return {
        flight,
        lookup,
        appliedIndex: applied?.key === lookup.key ? applied.index : -1,
        useCandidate,
        logged,
        useLogged,
        canEstimate,
        estimate,
    };
};
