import React, { useEffect, useState } from 'react';
import type { GeoCoordinates, Transport, TransportMode } from '../../../types';
import { fetchAirlineSuggestions } from '../../../hooks/useFlightLog';
import { RP_FIELD, RpField } from '../fields';
import { BookingTicket, Seat } from '../../ui/hugeicons';
import { PlaceField } from '../PlaceField';
import { RpChip } from '../ui';
import { LegDetails } from './LegDetails';
import { LEG_PLACES, MODE_LOOKS, legText, modeLook } from './transportModes';
import { cn } from '../../../utils/cn';
import { RpCarrierLogo } from '../CarrierLogos';

/**
 * The fields of one transport leg: kind of transport, From and To (place search tuned to the kind),
 * dates and times, operator with its logo, number, confirmation, seat, cost and the folded
 * "More details". Shared by the trip sheets (every mode) and the flight and road-trip sheets (their
 * own modes), so a leg is edited the same way everywhere (UI_UX_DESIGN_REFERENCE.md decisions 49, 51).
 */

export const LEG_DATE = cn(RP_FIELD, 'rp-date rp-tabular');

/** A leg has a position when it was picked here, or looked up on an earlier save for this same text. */
export const legLocated = (text?: string, lat?: number, key?: string) => Boolean(text && lat != null && (key === undefined || key === text));

export const LegForm: React.FC<{
    leg: Partial<Transport>;
    patch: (p: Partial<Transport>) => void;
    cost: string;
    onCost: (v: string) => void;
    brandfetchApiKey?: string;
    /** Ranks places near the trip's destination first in To. */
    bias?: GeoCoordinates | { lat: number; lng: number };
    /** Kinds of transport to offer; one kind hides the chips. All kinds by default. */
    modes?: TransportMode[];
    /** Opens the folded details (for a leg that has stops). */
    detailsOpen?: boolean;
    /** Changing this resets the folded details (the leg being edited). */
    detailsKey?: string | number;
    /** Shown first, before From and To (the flight editor puts the flight number, date and lookup here). */
    lead?: React.ReactNode;
    /** Fields the lead already holds, left out of the grid below. */
    omit?: Array<'identifier' | 'departureDate'>;
}> = ({ leg, patch, cost, onCost, brandfetchApiKey, bias, modes, detailsOpen, detailsKey, lead, omit = [] }) => {
    const m = modeLook(leg.mode);
    const places = LEG_PLACES[leg.mode || 'Flight'];
    const format = legText(leg.mode);
    const choices = modes ? MODE_LOOKS.filter(o => modes.includes(o.mode)) : MODE_LOOKS;
    const [airlines, setAirlines] = useState<string[]>([]);
    const isFlight = leg.mode === 'Flight';

    // Airline suggestions as you type (the carrier list, local and from the server).
    useEffect(() => {
        if (!isFlight || !leg.provider || leg.provider.length < 1) { setAirlines([]); return; }
        let live = true;
        const timer = window.setTimeout(() => { void fetchAirlineSuggestions(leg.provider!).then(list => { if (live) setAirlines(list.slice(0, 8)); }); }, 200);
        return () => { live = false; window.clearTimeout(timer); };
    }, [isFlight, leg.provider]);

    const noDate = omit.includes('departureDate');
    const noNumber = omit.includes('identifier');
    return (
        <>
            {lead}
            {choices.length > 1 ? (
                <div role="group" aria-label="Type of transport" className="flex flex-wrap gap-2 py-2">
                    {choices.map(o => (
                        <RpChip key={o.mode} selected={leg.mode === o.mode} onClick={() => patch({ mode: o.mode })} className={leg.mode === o.mode ? o.fill : undefined}>
                            <o.icon size={16} className={leg.mode === o.mode ? undefined : o.text} aria-hidden /> {o.label}
                        </RpChip>
                    ))}
                </div>
            ) : null}
            <div className="grid gap-x-3 sm:grid-cols-2">
                <RpField label="From">{id => (
                    <PlaceField
                        id={id}
                        value={leg.origin || ''}
                        located={legLocated(leg.origin, leg.originLat, leg.originGeoKey)}
                        placeholder={places.hint}
                        mode={places.mode}
                        prefer={places.prefer}
                        format={format}
                        pillClassName={m.tint}
                        onChange={text => patch({ origin: text, originLat: undefined, originLng: undefined, originGeoKey: undefined })}
                        onPick={(text, c) => patch({ origin: text, originLat: c.lat, originLng: c.lng, originGeoKey: text })}
                    />
                )}</RpField>
                <RpField label="To">{id => (
                    <PlaceField
                        id={id}
                        value={leg.destination || ''}
                        located={legLocated(leg.destination, leg.destLat, leg.destGeoKey)}
                        placeholder={places.hint}
                        mode={places.mode}
                        prefer={places.prefer}
                        align="end"
                        bias={bias ? { lat: bias.lat, lon: 'lng' in bias ? bias.lng : undefined } : undefined}
                        format={format}
                        pillClassName={m.tint}
                        onChange={text => patch({ destination: text, destLat: undefined, destLng: undefined, destGeoKey: undefined })}
                        onPick={(text, c) => patch({ destination: text, destLat: c.lat, destLng: c.lng, destGeoKey: text })}
                    />
                )}</RpField>
                {noDate ? null : <RpField label="Departs">{id => <input id={id} type="date" value={leg.departureDate || ''} onChange={e => patch({ departureDate: e.target.value, arrivalDate: leg.arrivalDate && leg.arrivalDate >= e.target.value ? leg.arrivalDate : e.target.value })} className={LEG_DATE} />}</RpField>}
                <RpField label="Departure time">{id => <input id={id} type="time" value={leg.departureTime || ''} onChange={e => patch({ departureTime: e.target.value })} className={LEG_DATE} />}</RpField>
                {noDate ? <RpField label="Arrival time">{id => <input id={id} type="time" value={leg.arrivalTime || ''} onChange={e => patch({ arrivalTime: e.target.value })} className={LEG_DATE} />}</RpField> : null}
                <RpField label="Arrives">{id => <input id={id} type="date" value={leg.arrivalDate || ''} min={leg.departureDate || undefined} onChange={e => patch({ arrivalDate: e.target.value })} className={LEG_DATE} />}</RpField>
                {noDate ? null : <RpField label="Arrival time">{id => <input id={id} type="time" value={leg.arrivalTime || ''} onChange={e => patch({ arrivalTime: e.target.value })} className={LEG_DATE} />}</RpField>}
            </div>
            <RpField label={isFlight ? 'Airline' : 'Operator'}>
                {id => (
                    <div className="flex items-center gap-2">
                        <RpCarrierLogo provider={leg.provider} identifier={leg.identifier} src={leg.logoUrl} fallback={m.icon} iconClassName={m.text} />
                        <input
                            id={id}
                            list={isFlight ? `${id}-airlines` : undefined}
                            value={leg.provider || ''}
                            onChange={e => patch({ provider: e.target.value })}
                            className={RP_FIELD}
                            placeholder={isFlight ? 'KLM' : ''}
                            autoComplete="off"
                        />
                        {isFlight ? <datalist id={`${id}-airlines`}>{airlines.map(a => <option key={a} value={a} />)}</datalist> : null}
                    </div>
                )}
            </RpField>
            <div className="grid gap-x-3 sm:grid-cols-2">
                {noNumber ? null : <RpField label={m.number}>{id => <input id={id} value={leg.identifier || ''} onChange={e => patch({ identifier: e.target.value })} className={RP_FIELD} autoComplete="off" />}</RpField>}
                <RpField label="Confirmation" icon={BookingTicket}>{id => <input id={id} value={leg.confirmationCode || ''} onChange={e => patch({ confirmationCode: e.target.value })} className={RP_FIELD} autoComplete="off" />}</RpField>
                <RpField label="Seat" icon={Seat}>{id => <input id={id} value={leg.seatNumber || ''} onChange={e => patch({ seatNumber: e.target.value })} className={RP_FIELD} autoComplete="off" />}</RpField>
                <RpField label="Cost">{id => <input id={id} inputMode="decimal" value={cost} onChange={e => onCost(e.target.value)} className={cn(RP_FIELD, 'rp-tabular')} placeholder="0" autoComplete="off" />}</RpField>
            </div>
            <LegDetails key={detailsKey ?? 'new'} leg={leg} patch={patch} open={detailsOpen} />
        </>
    );
};
