import React, { useState, useEffect } from 'react';
import { 
    AirplaneTilt, 
    MagnifyingGlass, 
    Clock, 
    Speedometer, 
    WarningCircle,
    Check, 
    Buildings, 
    Armchair, 
    Crown,
    X,
    Path
} from '@phosphor-icons/react';
import { Input, Select, Autocomplete, Badge, TimeInput } from '../ui';
import GlassPanel from '../glass/GlassPanel';
import { SegmentForm, AirportData, AirlineData } from './transportTypes';
import { DurationInput } from './DurationInput';
import { FlightStatusResponse } from '../../types';
import { getCoordinates, calculateDistance, calculateDurationMinutes, calculateArrivalTime } from '../../services/geocoding';
import { getAirportsByQueryLocally, getCarriersByQueryLocally } from '../../utils/flightData';
import { flightTracker } from '../../services/flightTracker';
import { STATUS_DANGER_STYLE } from '../../constants';

interface FlightFormProps {
    segment: SegmentForm;
    index: number;
    totalSegments: number;
    tripType: 'Round Trip' | 'One-Way' | 'Multi-City';
    apiKey: string;
    brandfetchKey: string;
    onUpdate: (updates: Partial<SegmentForm>) => void;
    onRemove?: () => void;
    airlineList: AirlineData[];
    airportList: AirportData[];
}

export const FlightForm: React.FC<FlightFormProps> = ({
    segment,
    index,
    totalSegments,
    tripType,
    apiKey,
    brandfetchKey,
    onUpdate,
    onRemove,
    airlineList,
    airportList
}) => {
    const [isAutoFilling, setIsAutoFilling] = useState(false);
    const [isEstimatingDistance, setIsEstimatingDistance] = useState(false);
    const [isFetchingBrand, setIsFetchingBrand] = useState(false);
    const [inlineError, setInlineError] = useState<string | null>(null);
    const [searchedFlights, setSearchedFlights] = useState<FlightStatusResponse[]>([]);
    const [isRouteSearching, setIsRouteSearching] = useState(false);
    const [routeSearchError, setRouteSearchError] = useState<string | null>(null);

    const extractIata = (val: string) => val.includes(' - ') ? val.split(' - ')[0] : val;

    const fetchAirportSuggestions = async (query: string) => {
        if (!query || query.length < 2) return [];
        const localMatches = getAirportsByQueryLocally(query, 10);
        return localMatches.map(a => `${a.iata} - ${a.name} (${a.city}, ${a.country})`);
    };

    const fetchAirlineSuggestions = async (query: string) => {
        if (!query || query.length < 2) return [];
        const localMatches = getCarriersByQueryLocally(query, 8);
        return localMatches.map(c => `${c.name} - ${c.code}`);
    };

    const handleAutoFill = async () => {
        setInlineError(null);
        const fullFlightIata = segment.providerCode ? `${segment.providerCode}${segment.identifier}` : segment.identifier;

        if (!fullFlightIata || !segment.date) {
            setInlineError("Please enter Flight Number and Date before searching.");
            return;
        }

        if (!apiKey) {
            setInlineError("AviationStack API key is not configured in workspace settings.");
            return;
        }

        setIsAutoFilling(true);
        try {
            const res = await fetch(`http://api.aviationstack.com/v1/flights?access_key=${apiKey}&flight_iata=${fullFlightIata}`);
            const data = await res.json();
            if (data.data && data.data.length > 0) {
                const flight = data.data[0];
                const updates: Partial<SegmentForm> = {
                    provider: flight.airline?.name || segment.provider,
                    origin: flight.departure?.iata || segment.origin,
                    destination: flight.arrival?.iata || segment.destination,
                };
                
                if (flight.airline?.iata) {
                    updates.providerCode = flight.airline.iata;
                }
                
                if (flight.departure?.scheduled) {
                    const [dDate, dTime] = flight.departure.scheduled.split('T');
                    updates.date = dDate;
                    updates.time = dTime.substring(0, 5);
                }
                if (flight.arrival?.scheduled) {
                    const [aDate, aTime] = flight.arrival.scheduled.split('T');
                    updates.arrivalDate = aDate;
                    updates.arrivalTime = aTime.substring(0, 5);
                }

                const newDur = calculateDurationMinutes(
                    updates.origin || segment.origin,
                    updates.destination || segment.destination,
                    updates.date || segment.date,
                    updates.time || segment.time,
                    updates.arrivalDate || segment.arrivalDate,
                    updates.arrivalTime || segment.arrivalTime
                );
                updates.duration = newDur;
                onUpdate(updates);
            } else {
                setInlineError("No details found for this flight number and date.");
            }
        } catch (e: any) {
            setInlineError(e?.message || "Flight lookup failed. Please verify your connection.");
        } finally {
            setIsAutoFilling(false);
        }
    };

    const handleSearchRouteFlights = async () => {
        setRouteSearchError(null);
        const originIata = extractIata(segment.origin);
        const destIata = extractIata(segment.destination);

        if (!originIata || !destIata || !segment.date) {
            setRouteSearchError("Please input Origin, Destination, and Date first.");
            return;
        }

        if (!apiKey) {
            setRouteSearchError("AviationStack API key is not configured in workspace settings.");
            return;
        }

        setIsRouteSearching(true);
        try {
            const results = await flightTracker.searchFlightsByRoute(
                apiKey,
                originIata,
                destIata,
                segment.date
            );
            if (results && results.length > 0) {
                setSearchedFlights(results);
            } else {
                setSearchedFlights([]);
                setRouteSearchError("No scheduled flights found on this route and date.");
            }
        } catch (err: any) {
            setRouteSearchError(err.message || 'Search request failed. Please check network/settings.');
        } finally {
            setIsRouteSearching(false);
        }
    };

    const handleSelectRouteFlight = (flight: FlightStatusResponse) => {
        const updates: Partial<SegmentForm> = {
            provider: flight.airline?.name || segment.provider,
            providerCode: flight.airline?.iata || segment.providerCode,
            identifier: flight.flight?.number || segment.identifier,
        };

        if (flight.departure?.scheduled) {
            try {
                const parts = flight.departure.scheduled.split('T');
                if (parts.length === 2) {
                    updates.date = parts[0];
                    updates.time = parts[1].substring(0, 5);
                }
            } catch (err) {
                console.warn("Could not parse schedule time:", err);
            }
        }

        if (flight.arrival?.scheduled) {
            try {
                const parts = flight.arrival.scheduled.split('T');
                if (parts.length === 2) {
                    updates.arrivalDate = parts[0];
                    updates.arrivalTime = parts[1].substring(0, 5);
                }
            } catch (err) {
                console.warn("Could not parse arrival schedule time:", err);
            }
        }

        if (flight.departure?.iata) updates.origin = flight.departure.iata;
        if (flight.arrival?.iata) updates.destination = flight.arrival.iata;

        const dur = calculateDurationMinutes(
            updates.origin || segment.origin,
            updates.destination || segment.destination,
            updates.date || segment.date,
            updates.time || segment.time,
            updates.arrivalDate || segment.arrivalDate,
            updates.arrivalTime || segment.arrivalTime
        );
        updates.duration = dur;

        onUpdate(updates);
        setSearchedFlights([]);
    };

    const handleCalcDistance = async () => {
        setIsEstimatingDistance(true);
        const originIata = extractIata(segment.origin);
        const destIata = extractIata(segment.destination);
        try {
            const [c1, c2] = await Promise.all([
                getCoordinates(originIata),
                getCoordinates(destIata)
            ]);
            if (c1 && c2) {
                const d = calculateDistance(c1.lat, c1.lng, c2.lat, c2.lng);
                const dur = calculateDurationMinutes(originIata, destIata, segment.date, segment.time, segment.arrivalDate, segment.arrivalTime);
                onUpdate({ distance: d, duration: dur });
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsEstimatingDistance(false);
        }
    };

    const sectionBadgeColor = segment.section === 'return' 
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' 
        : 'bg-primary-500/10 text-primary-600 dark:text-primary-400';

    return (
        <GlassPanel className="wg-glass-card w-full shadow-2xl overflow-hidden relative" overrides={{ borderRadius: 28 }} padding="0px">
            <div className="p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 rounded-full text-2xs font-bold uppercase tracking-wider ${sectionBadgeColor}`}>
                        {tripType === 'Round Trip' ? (segment.section === 'return' ? 'Return Leg' : 'Outbound Leg') : `Leg ${index + 1}`}
                    </span>
                    {segment.distance ? (
                        <span className="text-2xs font-bold text-light-text-secondary dark:text-dark-text-secondary">
                            {segment.distance.toLocaleString()} km
                        </span>
                    ) : null}
                </div>
                {onRemove && totalSegments > 1 && (
                    <button 
                        type="button"
                        onClick={onRemove}
                        className="text-light-text-secondary hover:text-semantic-red p-1 rounded-lg transition-colors cursor-pointer"
                        aria-label="Remove leg"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Non-blocking Inline Error Banner */}
            {inlineError && (
                <div className={`p-3 rounded-2xl flex items-center justify-between text-xs font-semibold ${STATUS_DANGER_STYLE}`}>
                    <div className="flex items-center gap-2">
                        <WarningCircle className="w-4 h-4 shrink-0" weight="bold" />
                        <span>{inlineError}</span>
                    </div>
                    <button type="button" onClick={() => setInlineError(null)} className="cursor-pointer">
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}

            {/* Route row: Origin and Destination with Local Autocomplete */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Autocomplete 
                    label="Origin Airport" 
                    placeholder="e.g. LHR or London Heathrow" 
                    value={segment.origin} 
                    onChange={val => onUpdate({ origin: val })} 
                    fetchSuggestions={fetchAirportSuggestions} 
                />
                <Autocomplete 
                    label="Destination Airport" 
                    placeholder="e.g. JFK or New York JFK" 
                    value={segment.destination} 
                    onChange={val => onUpdate({ destination: val })} 
                    fetchSuggestions={fetchAirportSuggestions} 
                />
            </div>

            {/* Carrier, Flight Number & Live Lookup */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                <Autocomplete 
                    label="Airline" 
                    placeholder="e.g. British Airways - BA" 
                    value={segment.provider} 
                    onChange={val => {
                        let providerName = val;
                        let code = '';
                        if (val.includes(' - ')) {
                            const parts = val.split(' - ');
                            providerName = parts[0];
                            code = parts[1];
                        }
                        onUpdate({ provider: providerName, providerCode: code });
                    }} 
                    fetchSuggestions={fetchAirlineSuggestions} 
                />
                <Input 
                    label="Flight Number" 
                    placeholder="e.g. 178" 
                    value={segment.identifier} 
                    onChange={e => onUpdate({ identifier: e.target.value })} 
                />
                <div className="flex gap-2">
                    <button 
                        type="button"
                        onClick={handleAutoFill}
                        disabled={isAutoFilling}
                        className="flex-1 min-h-[44px] px-3 py-2 rounded-xl bg-primary-500/10 hover:bg-primary-500/20 text-primary-600 dark:text-primary-400 font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                        title="Auto-fill schedule via Flight API"
                    >
                        <MagnifyingGlass className="w-3.5 h-3.5" weight="bold" />
                        <span>{isAutoFilling ? 'Looking up...' : 'Lookup Flight'}</span>
                    </button>
                    <button 
                        type="button"
                        onClick={handleSearchRouteFlights}
                        disabled={isRouteSearching}
                        className="min-h-[44px] px-3 py-2 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-light-text dark:text-dark-text font-bold text-xs flex items-center justify-center gap-1 transition-all cursor-pointer disabled:opacity-50"
                        title="Search all flights on this route"
                    >
                        <Path className="w-3.5 h-3.5" weight="bold" />
                        <span>Route</span>
                    </button>
                </div>
            </div>

            {/* Route Search Results Preview */}
            {routeSearchError && (
                <div className={`p-3 rounded-2xl flex items-center justify-between text-xs font-semibold ${STATUS_DANGER_STYLE}`}>
                    <span>{routeSearchError}</span>
                    <button type="button" onClick={() => setRouteSearchError(null)} className="cursor-pointer"><X className="w-3.5 h-3.5" /></button>
                </div>
            )}
            {searchedFlights.length > 0 && (
                <div className="p-3 rounded-2xl bg-black/5 dark:bg-white/5 space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                    <span className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block">
                        Select Flight on this Route:
                    </span>
                    {searchedFlights.map((sf, sidx) => (
                        <div 
                            key={sidx}
                            onClick={() => handleSelectRouteFlight(sf)}
                            className="p-2.5 rounded-xl bg-white/80 dark:bg-white/10 backdrop-blur-md hover:border-primary-500/40 border border-black/5 dark:border-white/10 cursor-pointer flex items-center justify-between text-xs transition-all shadow-xs"
                        >
                            <div className="flex items-center gap-2">
                                <span className="font-bold text-primary-500">{sf.airline?.iata || ''}{sf.flight?.number}</span>
                                <span className="text-light-text-secondary">{sf.airline?.name}</span>
                            </div>
                            <span className="font-mono font-bold text-light-text dark:text-dark-text">
                                {sf.departure?.scheduled?.split('T')[1]?.substring(0, 5) || '--:--'} &rarr; {sf.arrival?.scheduled?.split('T')[1]?.substring(0, 5) || '--:--'}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* Schedule row: Departure and Arrival */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3.5 rounded-2xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5 space-y-2 shadow-xs">
                    <span className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Departure
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                        <Input 
                            label="Date" 
                            type="date" 
                            value={segment.date} 
                            onChange={e => onUpdate({ date: e.target.value })} 
                        />
                        <TimeInput 
                            label="Time" 
                            value={segment.time} 
                            onChange={val => onUpdate({ time: val })} 
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                        <Input 
                            label="Terminal" 
                            placeholder="e.g. 5" 
                            value={segment.departureTerminal || ''} 
                            onChange={e => onUpdate({ departureTerminal: e.target.value })} 
                        />
                        <Input 
                            label="Gate" 
                            placeholder="e.g. A12" 
                            value={segment.departureGate || ''} 
                            onChange={e => onUpdate({ departureGate: e.target.value })} 
                        />
                    </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5 space-y-2 shadow-xs">
                    <span className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Arrival
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                        <Input 
                            label="Date" 
                            type="date" 
                            value={segment.arrivalDate || segment.date} 
                            onChange={e => onUpdate({ arrivalDate: e.target.value })} 
                        />
                        <TimeInput 
                            label="Time" 
                            value={segment.arrivalTime} 
                            onChange={val => onUpdate({ arrivalTime: val })} 
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                        <Input 
                            label="Terminal" 
                            placeholder="e.g. 4" 
                            value={segment.arrivalTerminal || ''} 
                            onChange={e => onUpdate({ arrivalTerminal: e.target.value })} 
                        />
                        <Input 
                            label="Gate" 
                            placeholder="e.g. B24" 
                            value={segment.arrivalGate || ''} 
                            onChange={e => onUpdate({ arrivalGate: e.target.value })} 
                        />
                    </div>
                </div>
            </div>

            {/* Travel Class, Seat & Duration */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <Select 
                    label="Class" 
                    options={[
                        { label: 'Economy', value: 'Economy' },
                        { label: 'Premium Economy', value: 'Premium Economy' },
                        { label: 'Business', value: 'Business' },
                        { label: 'First', value: 'First' }
                    ]} 
                    value={segment.travelClass} 
                    onChange={e => onUpdate({ travelClass: e.target.value })} 
                />
                <Input 
                    label="Seat Number" 
                    placeholder="e.g. 14A" 
                    value={segment.seatNumber} 
                    onChange={e => onUpdate({ seatNumber: e.target.value })} 
                />
                <DurationInput 
                    minutes={segment.duration} 
                    onChange={dur => onUpdate({ duration: dur })} 
                    onAutoCalc={handleCalcDistance} 
                    canAutoCalc={Boolean(segment.origin && segment.destination)} 
                />
            </div>
            </div>
        </GlassPanel>
    );
};
