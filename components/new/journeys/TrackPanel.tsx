import React, { useEffect, useMemo, useState } from 'react';
import type { Transport } from '../../../types';
import { useLiveFlight } from '../../../hooks/useLiveFlight';
import ParticleButton from '../../kokonutui/particle-button';
import { Airport, BaggageClaim, Broadcast, Check, DoorOpen, type Icon } from '../../ui/hugeicons';
import { RpSection } from '../ui';
import { RoutesMap } from './RoutesMap';
import { FlightProgress } from './FlightProgress';
import { isLiveWindow, journeyEnds } from '../../../utils/journeysModel';
import { cn } from '../../../utils/cn';

/**
 * Live status of a flight. Within three hours of departure and until it has landed the panel follows the
 * flight by itself (every minute, while the page is visible): status, a progress bar, gates, times and,
 * when the engine has a transponder position, altitude, speed and a small still map with the aircraft.
 * Outside that window "Track flight" asks once. "Save to this flight" writes the actual times, gates and
 * aircraft back to the log.
 */

const clock = (iso?: string) => {
    const t = (iso || '').split('T')[1];
    return t ? t.slice(0, 5) : '';
};
const at = (d: number | null) => (d ? new Date(d).toTimeString().slice(0, 5) : '');

const STATE: Record<string, { label: string; tone: string }> = {
    scheduled: { label: 'Scheduled', tone: 'bg-rp-green text-rp-paper' },
    active: { label: 'In the air', tone: 'bg-rp-ink text-rp-on-ink' },
    landed: { label: 'Landed', tone: 'bg-rp-inset text-rp-ink' },
    cancelled: { label: 'Cancelled', tone: 'bg-rp-rust text-rp-paper' },
    incident: { label: 'Incident', tone: 'bg-rp-rust text-rp-paper' },
    diverted: { label: 'Diverted', tone: 'bg-rp-mustard text-rp-on-mustard' },
};

const Row: React.FC<{ label: string; value?: React.ReactNode; icon?: Icon }> = ({ label, value, icon: IconC }) => (
    <div className="flex min-h-9 items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-1.5 text-rp-muted">{IconC ? <IconC size={14} className="text-rp-ochre" aria-hidden /> : null}{label}</span>
        <span className="rp-tabular text-right font-medium text-rp-ink">{value || '—'}</span>
    </div>
);

/** Terminal and gate on one line, each with its icon. */
const terminalGate = (terminal?: string, gate?: string): React.ReactNode => (terminal || gate ? (
    <span className="inline-flex items-center gap-3">
        {terminal ? <span className="inline-flex items-center gap-1"><Airport size={14} className="text-rp-ochre" aria-hidden /><span className="sr-only">Terminal </span>{terminal}</span> : null}
        {gate ? <span className="inline-flex items-center gap-1"><DoorOpen size={14} className="text-rp-ochre" aria-hidden /><span className="sr-only">Gate </span>{gate}</span> : null}
    </span>
) : undefined);

export const TrackPanel: React.FC<{
    flight: Transport;
    onSave?: (patch: Partial<Transport>) => Promise<void>;
}> = ({ flight, onSave }) => {
    const live = isLiveWindow(flight);
    const { data, candidate, source, error, loading, updatedAt, refresh } = useLiveFlight(flight, live);
    const [saved, setSaved] = useState(false);
    useEffect(() => { setSaved(false); }, [flight.id]);

    const status = data ? STATE[data.flight_status || 'scheduled'] ?? STATE.scheduled : null;
    const depActual = clock(data?.departure.actual || data?.departure.estimated);
    const arrActual = clock(data?.arrival.actual || data?.arrival.estimated);
    const canSave = Boolean(onSave && data && (depActual || arrActual || data.departure.gate || data.arrival.gate || data.departure.terminal || data.arrival.terminal));
    const position = data?.live && data.live.latitude != null ? { lat: data.live.latitude, lng: data.live.longitude } : undefined;
    const ends = useMemo(() => journeyEnds(flight), [flight]);

    const save = async () => {
        if (!data || !onSave) return;
        await onSave({
            ...(depActual ? { actualDepartureTime: depActual } : {}),
            ...(arrActual ? { actualArrivalTime: arrActual } : {}),
            ...(data.departure.terminal ? { departureTerminal: data.departure.terminal } : {}),
            ...(data.departure.gate ? { departureGate: data.departure.gate } : {}),
            ...(data.arrival.terminal ? { arrivalTerminal: data.arrival.terminal } : {}),
            ...(data.arrival.gate ? { arrivalGate: data.arrival.gate } : {}),
            ...(data.aircraft?.registration ? { tailNumber: data.aircraft.registration } : {}),
            ...(data.aircraft?.model && !flight.vehicleModel ? { vehicleModel: data.aircraft.model } : {}),
        });
        setSaved(true);
    };

    return (
        <RpSection
            title={live ? 'Live' : 'Live status'}
            icon={Broadcast}
            action={
                <span className="flex items-center gap-2">
                    {live ? (
                        <span className="flex items-center gap-1.5 text-2xs font-medium text-rp-muted">
                            <span className={cn('size-2 rounded-full bg-rp-green', loading && 'animate-pulse')} aria-hidden />
                            {updatedAt ? `Updated ${at(updatedAt)}` : 'Following'}
                        </span>
                    ) : null}
                    {status ? <span className={cn('inline-flex min-h-6 items-center rounded-full px-2.5 text-2xs font-semibold', status.tone)}>{status.label}</span> : null}
                </span>
            }
        >
            <div className="flex flex-col gap-2 py-2">
                {live ? <FlightProgress flight={flight} candidate={candidate} /> : null}
                {position && ends ? (
                    <RoutesMap className="h-40 rounded-rp-inset bg-rp-surface" routes={[{ ...ends, count: 1, label: `${flight.origin} to ${flight.destination}` }]} marker={position} label="Where the aircraft is now" />
                ) : null}
                {data ? (
                    <div className="flex flex-col divide-y divide-rp-line">
                        {data.live ? (
                            <div className="py-1">
                                <Row label="Altitude" value={data.live.is_ground ? 'On the ground' : data.live.altitude ? `${Math.round(data.live.altitude).toLocaleString('en-US')} ft` : undefined} />
                                <Row label="Speed" value={data.live.speed_horizontal ? `${Math.round(data.live.speed_horizontal)} km/h` : undefined} />
                            </div>
                        ) : null}
                        <div className="py-1">
                            <Row label="Departs" value={[clock(data.departure.scheduled), depActual && depActual !== clock(data.departure.scheduled) ? `now ${depActual}` : ''].filter(Boolean).join(' · ')} />
                            <Row label="Terminal and gate" icon={Airport} value={terminalGate(data.departure.terminal, data.departure.gate)} />
                        </div>
                        <div className="py-1">
                            <Row label="Arrives" value={[clock(data.arrival.scheduled), arrActual && arrActual !== clock(data.arrival.scheduled) ? `now ${arrActual}` : ''].filter(Boolean).join(' · ')} />
                            <Row label="Terminal and gate" icon={Airport} value={terminalGate(data.arrival.terminal, data.arrival.gate)} />
                            {data.arrival.baggage ? <Row label="Baggage claim" icon={BaggageClaim} value={data.arrival.baggage} /> : null}
                        </div>
                        {data.aircraft?.registration || data.aircraft?.model ? (
                            <div className="py-1"><Row label="Aircraft" value={[data.aircraft.model, data.aircraft.registration].filter(Boolean).join(' · ')} /></div>
                        ) : null}
                    </div>
                ) : null}
                {error ? <p role="alert" className="text-sm text-rp-rust">{error}</p> : null}
                {source && data ? <p className="text-2xs text-rp-muted">Source: {source}</p> : null}
                <div className="flex flex-wrap items-center gap-2">
                    <ParticleButton onClick={refresh} variant="inset" pendingLabel="Checking" successLabel="Updated" errorLabel="No result" icon={<Broadcast size={16} aria-hidden />}>
                        {data ? 'Check again' : 'Track flight'}
                    </ParticleButton>
                    {canSave ? (
                        <ParticleButton onClick={save} variant="default" pendingLabel="Saving" successLabel="Saved" errorLabel="Couldn't save" icon={saved ? <Check size={16} aria-hidden /> : undefined}>
                            Save to this flight
                        </ParticleButton>
                    ) : null}
                </div>
            </div>
        </RpSection>
    );
};
