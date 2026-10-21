import React, { useEffect, useState } from 'react';
import type { FlightStatusResponse, Transport } from '../../../types';
import { flightTracker } from '../../../services/flightTracker';
import { dataService } from '../../../services/mockDb';
import ParticleButton from '../../kokonutui/particle-button';
import { Broadcast, Check } from '../../ui/hugeicons';
import { RpSection } from '../ui';
import { errorMessage } from '../../../services/toast';
import { cn } from '../../../utils/cn';

/**
 * Live status of a flight: asks the flight data engines (the free open radar first; AeroDataBox or
 * AviationStack when the workspace has a key) and shows the status, gates, terminals and times.
 * "Save to this flight" writes the actual times and gates back to the log.
 */

type Provider = 'adsbdb' | 'aviationstack' | 'aerodatabox';

const clock = (iso?: string) => {
    const t = (iso || '').split('T')[1];
    return t ? t.slice(0, 5) : '';
};

const STATE: Record<string, { label: string; tone: string }> = {
    scheduled: { label: 'Scheduled', tone: 'bg-rp-green text-rp-paper' },
    active: { label: 'In the air', tone: 'bg-rp-ink text-rp-on-ink' },
    landed: { label: 'Landed', tone: 'bg-rp-inset text-rp-ink' },
    cancelled: { label: 'Cancelled', tone: 'bg-rp-rust text-rp-paper' },
    incident: { label: 'Incident', tone: 'bg-rp-rust text-rp-paper' },
    diverted: { label: 'Diverted', tone: 'bg-rp-mustard text-rp-on-mustard' },
};

const Row: React.FC<{ label: string; value?: string }> = ({ label, value }) => (
    <div className="flex min-h-9 items-center justify-between gap-3 text-sm">
        <span className="text-rp-muted">{label}</span>
        <span className="rp-tabular text-right font-medium text-rp-ink">{value || '—'}</span>
    </div>
);

export const TrackPanel: React.FC<{
    flight: Transport;
    onSave?: (patch: Partial<Transport>) => Promise<void>;
}> = ({ flight, onSave }) => {
    const [keys, setKeys] = useState<{ aviation: string; aero: string }>({ aviation: '', aero: '' });
    const [provider, setProvider] = useState<Provider>('adsbdb');
    const [data, setData] = useState<FlightStatusResponse | null>(null);
    const [error, setError] = useState('');
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        let live = true;
        dataService.getWorkspaceSettings().then(s => {
            if (!live) return;
            // The server masks paid keys, so a non-empty value (or the configured flag) means "set up".
            const configured = (k: 'aviationStackApiKey' | 'aeroDataBoxApiKey') => s[k] || (s.configuredKeys?.[k] ? '••••••••' : '');
            const aviation = configured('aviationStackApiKey');
            const aero = configured('aeroDataBoxApiKey');
            setKeys({ aviation, aero });
            setProvider(aero ? 'aerodatabox' : aviation ? 'aviationstack' : 'adsbdb');
        }).catch(() => undefined);
        return () => { live = false; };
    }, []);

    // A different flight starts clean.
    useEffect(() => { setData(null); setError(''); setSaved(false); }, [flight.id]);

    const track = async () => {
        setError('');
        setSaved(false);
        const key = provider === 'aerodatabox' ? keys.aero : provider === 'aviationstack' ? keys.aviation : '';
        try {
            const ident = `${flight.providerCode || ''}${flight.identifier || ''}`.replace(/\s/g, '') || flight.identifier;
            if (!ident) throw new Error('Add the flight number first.');
            setData(await flightTracker.getFlightStatus(key, ident, flight.departureDate, provider));
        } catch (e) {
            setData(null);
            setError(errorMessage(e, "Couldn't reach the flight data. Try again."));
            throw e;
        }
    };

    const status = data ? STATE[data.flight_status || 'scheduled'] ?? STATE.scheduled : null;
    const depActual = clock(data?.departure.actual || data?.departure.estimated);
    const arrActual = clock(data?.arrival.actual || data?.arrival.estimated);
    const canSave = Boolean(onSave && data && (depActual || arrActual || data.departure.gate || data.arrival.gate || data.departure.terminal || data.arrival.terminal));

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
            title="Live status"
            icon={Broadcast}
            action={status ? <span className={cn('inline-flex min-h-6 items-center rounded-full px-2.5 text-2xs font-semibold', status.tone)}>{status.label}</span> : undefined}
        >
            <div className="flex flex-col gap-2 py-2">
                {data ? (
                    <div className="flex flex-col divide-y divide-rp-line">
                        <div className="py-1">
                            <Row label="Departs" value={[clock(data.departure.scheduled), depActual && depActual !== clock(data.departure.scheduled) ? `now ${depActual}` : ''].filter(Boolean).join(' · ')} />
                            <Row label="Terminal and gate" value={[data.departure.terminal && `T${data.departure.terminal}`, data.departure.gate && `Gate ${data.departure.gate}`].filter(Boolean).join(' · ')} />
                        </div>
                        <div className="py-1">
                            <Row label="Arrives" value={[clock(data.arrival.scheduled), arrActual && arrActual !== clock(data.arrival.scheduled) ? `now ${arrActual}` : ''].filter(Boolean).join(' · ')} />
                            <Row label="Terminal and gate" value={[data.arrival.terminal && `T${data.arrival.terminal}`, data.arrival.gate && `Gate ${data.arrival.gate}`].filter(Boolean).join(' · ')} />
                            {data.arrival.baggage ? <Row label="Baggage belt" value={data.arrival.baggage} /> : null}
                        </div>
                        {data.aircraft?.registration || data.aircraft?.model ? (
                            <div className="py-1"><Row label="Aircraft" value={[data.aircraft.model, data.aircraft.registration].filter(Boolean).join(' · ')} /></div>
                        ) : null}
                    </div>
                ) : null}
                {error ? <p role="alert" className="text-sm text-rp-rust">{error}</p> : null}
                <div className="flex flex-wrap items-center gap-2">
                    <ParticleButton onClick={track} variant="inset" pendingLabel="Checking" successLabel="Updated" errorLabel="No result" icon={<Broadcast size={16} aria-hidden />}>
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
