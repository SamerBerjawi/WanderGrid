
import React, { useState, useEffect } from 'react';
import { 
  WarningCircle as AlertCircle, WarningCircle, Info, AirplaneTakeoff, 
  AirplaneTilt, NavigationArrow, Broadcast, Database 
} from '@/components/ui/hugeicons';
import { Modal, Button, Input } from './ui';
import { flightTracker } from '../services/flightTracker';
import { FlightStatusResponse, Transport } from '../types';
import { dataService } from '../services/mockDb';
import { formatDate } from '../utils/formatters';

interface FlightTrackerModalProps {
    isOpen: boolean;
    onClose: () => void;
    suggestedFlight?: {
        iata: string;
        origin: string;
        destination: string;
        date: string;
    };
}

export const FlightTrackerModal: React.FC<FlightTrackerModalProps> = ({ isOpen, onClose, suggestedFlight }) => {
    const [flightNum, setFlightNum] = useState('');
    const [flightDate, setFlightDate] = useState(new Date().toISOString().split('T')[0]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [flightData, setFlightData] = useState<FlightStatusResponse | null>(null);
    const [aviationKey, setAviationKey] = useState('');
    const [aeroDataBoxKey, setAeroDataBoxKey] = useState('');
    // Keyless open radar is the only engine that always works; keyed engines are preferred once configured.
    const [provider, setProvider] = useState<'aviationstack' | 'adsbdb' | 'aerodatabox'>('adsbdb');

    useEffect(() => {
        let cancelled = false;
        dataService.getWorkspaceSettings().then(s => {
            if (cancelled) return;
            // The server masks paid keys, so a non-empty value (or configuredKeys flag) means "configured".
            const configured = (k: 'aviationStackApiKey' | 'aeroDataBoxApiKey') =>
                s[k] || (s.configuredKeys?.[k] ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' : '');
            setAviationKey(configured('aviationStackApiKey'));
            setAeroDataBoxKey(configured('aeroDataBoxApiKey'));
            if (configured('aeroDataBoxApiKey')) {
                setProvider('aerodatabox');
            } else if (configured('aviationStackApiKey')) {
                setProvider('aviationstack');
            }
        }).catch(() => {});
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        if (isOpen) {
            if (suggestedFlight) {
                setFlightNum(suggestedFlight.iata);
                setFlightDate(suggestedFlight.date);
            } else {
                setFlightNum('');
                setFlightDate(new Date().toISOString().split('T')[0]);
            }
            setFlightData(null);
            setError('');
        }
    }, [isOpen, suggestedFlight]);

    const handleTrack = async (overrideIata?: string) => {
        const iata = overrideIata || flightNum;
        if (!iata) return;
        
        setIsLoading(true);
        setError('');
        setFlightData(null);

        try {
            let activeKey = '';
            if (provider === 'aerodatabox') {
                activeKey = aeroDataBoxKey;
                if (!activeKey) {
                    throw new Error("AeroDataBox API key is not configured. Add it in Settings, or switch to ADSBdb (Free).");
                }
            } else if (provider === 'aviationstack') {
                activeKey = aviationKey;
                if (!activeKey) {
                    throw new Error("AviationStack API key is not configured. Add it in Settings, or switch to ADSBdb (Free).");
                }
            }
            const data = await flightTracker.getFlightStatus(activeKey, iata, flightDate, provider);
            setFlightData(data);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Unknown error occurred");
        } finally {
            setIsLoading(false);
        }
    };

    const getStatusColor = (status?: string) => {
        switch (status) {
            case 'active': return 'bg-emerald-500 text-white shadow-emerald-500/40';
            case 'landed': return 'bg-blue-500 text-white shadow-blue-500/40';
            case 'scheduled': return 'bg-gray-500 text-white';
            case 'cancelled': return 'bg-rose-500 text-white shadow-rose-500/40';
            case 'incident': return 'bg-amber-500 text-white shadow-amber-500/40';
            case 'diverted': return 'bg-purple-500 text-white shadow-purple-500/40';
            default: return 'bg-gray-400 text-white';
        }
    };

    const formatTime = (isoString?: string) => {
        if (!isoString) return '--:--';
        return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Where's My Flight?" subtitle="Live Telemetry & Flight Tracker" icon="flight" maxWidth="max-w-2xl">
            <div className="space-y-6 font-sans">
                {/* Provider SelectorTabs */}
                <div className="space-y-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">Flight Data Engine</label>
                    <div className="grid grid-cols-3 gap-1 p-1 bg-black/5 dark:bg-white/5 rounded-2xl border border-black/5 dark:border-white/5">
                        {[
                            { id: 'adsbdb', label: 'ADSBdb (Free)', Icon: Broadcast },
                            { id: 'aviationstack', label: 'AvStack', Icon: AirplaneTakeoff },
                            { id: 'aerodatabox', label: 'AeroData', Icon: Database }
                        ].map(p => {
                            const PIcon = p.Icon;
                            return (
                                <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => setProvider(p.id as any)}
                                    className={`flex flex-col md:flex-row items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                                        provider === p.id 
                                            ? 'bg-white dark:bg-dark-card text-primary-800 dark:text-primary-400 shadow-sm' 
                                            : 'text-light-text-secondary dark:text-dark-text-secondary opacity-60 hover:opacity-100'
                                    }`}
                                >
                                    <PIcon className="w-4 h-4" />
                                    <span className="hidden sm:inline">{p.label}</span>
                                    <span className="sm:hidden text-2xs">{p.label.split(' ')[0]}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {provider === 'aviationstack' && !aviationKey && (
                    <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-semibold flex items-center gap-3">
                        <WarningCircle className="w-5 h-5 shrink-0" />
                        <span>AviationStack API Key is missing. Add it in Settings, or switch to ADSBdb (Free).</span>
                    </div>
                )}
                
                {provider === 'aerodatabox' && !aeroDataBoxKey && (
                    <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-semibold flex items-center gap-3">
                        <WarningCircle className="w-5 h-5 shrink-0" />
                        <span>AeroDataBox API Key is missing. Add it in Settings, or switch to ADSBdb (Free).</span>
                    </div>
                )}

                {/* Suggestion Card */}
                {!flightData && suggestedFlight && !error && (
                    <div className="p-4 rounded-2xl bg-primary-500/10 border border-primary-500/20 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-primary-500 text-slate-950 flex items-center justify-center shadow-md">
                                <AirplaneTakeoff className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-2xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider">Itinerary Match</p>
                                <p className="font-bold text-light-text dark:text-dark-text text-sm">{suggestedFlight.iata}: {suggestedFlight.origin} &rarr; {suggestedFlight.destination}</p>
                            </div>
                        </div>
                        <Button size="sm" onClick={() => handleTrack(suggestedFlight.iata)}>Track Now</Button>
                    </div>
                )}

                {/* Search Inputs */}
                <div className="flex flex-col sm:flex-row gap-4 items-end bg-light-fill dark:bg-dark-fill/50 p-5 rounded-2xl border border-black/5 dark:border-white/5">
                    <Input 
                        label="Flight Number" 
                        placeholder="e.g. AA100" 
                        value={flightNum} 
                        onChange={e => setFlightNum(e.target.value.toUpperCase())}
                        className="!text-sm font-mono uppercase font-bold"
                    />
                    <Input 
                        label="Date" 
                        type="date" 
                        value={flightDate} 
                        onChange={e => setFlightDate(e.target.value)} 
                    />
                    <Button 
                        onClick={() => handleTrack()} 
                        disabled={isLoading || !flightNum} 
                        className="h-11 min-h-[44px] px-6 shrink-0 w-full sm:w-auto"
                        isLoading={isLoading}
                    >
                        Search
                    </Button>
                </div>

                {error && (
                    <div className="p-5 text-center rounded-2xl bg-rose-500/10 border border-rose-500/20">
                        <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-2" />
                        <p className="text-rose-600 dark:text-rose-400 font-bold text-sm">{error}</p>
                    </div>
                )}

                {/* Flight Result */}
                {flightData && (
                    <div className="animate-fade-in space-y-6">
                        {/* Header Status */}
                        <div className="flex justify-between items-center">
                            <div>
                                <h3 className="text-2xl sm:text-3xl font-black text-light-text dark:text-dark-text leading-none">
                                    {flightData.airline.name} {flightData.flight.iata}
                                </h3>
                                <p className="text-light-text-secondary dark:text-dark-text-secondary text-xs font-bold mt-1">
                                    {flightData.flight_date ? formatDate(flightData.flight_date, 'weekday-long') : 'Verified Route'}
                                </p>
                            </div>
                            {flightData.source === 'adsbdb-route' && !flightData.flight_status ? (
                                <div className="px-3 py-1.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-xs">
                                    Route verified · no schedule data
                                </div>
                            ) : (
                                <div className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest shadow-md ${getStatusColor(flightData.flight_status)}`}>
                                    {flightData.flight_status || 'Scheduled'}
                                </div>
                            )}
                        </div>

                        {/* Route Display */}
                        <div className="relative flex justify-between items-center p-6 bg-light-fill dark:bg-dark-fill/50 rounded-2xl border border-black/5 dark:border-white/5">
                            <div className="text-center z-raised">
                                <span className="text-3xl sm:text-4xl font-black text-light-text dark:text-dark-text block mb-1">{flightData.departure.iata}</span>
                                <span className="text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wider">{flightData.departure.airport}</span>
                            </div>
                            
                            {/* Plane Graphic */}
                            <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 flex items-center justify-center px-24 pointer-events-none opacity-20">
                                <div className="h-0.5 w-full bg-black/20 dark:bg-white/20 relative">
                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-light-fill dark:bg-dark-fill/80 p-2 rounded-full border border-black/5 dark:border-white/5">
                                        <AirplaneTilt className="w-6 h-6 transform rotate-90 text-light-text-secondary dark:text-dark-text-secondary" />
                                    </div>
                                </div>
                            </div>

                            <div className="text-center z-raised">
                                <span className="text-3xl sm:text-4xl font-black text-light-text dark:text-dark-text block mb-1">{flightData.arrival.iata}</span>
                                <span className="text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wider">{flightData.arrival.airport}</span>
                            </div>
                        </div>

                        {/* Times & Gates */}
                        {flightData.source === 'adsbdb-route' && !flightData.departure.scheduled ? (
                            <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 text-center text-xs text-light-text-secondary dark:text-dark-text-secondary font-medium">
                                Origin, destination, airline and airframe verified via ADSBdb community radar. Carrier schedule timings require AviationStack or AeroDataBox.
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-6">
                                {/* Departure */}
                                <div className="p-5 bg-light-fill dark:bg-dark-fill/50 rounded-2xl border border-black/5 dark:border-white/5">
                                    <h4 className="text-xs font-black text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-widest mb-4 border-b border-black/5 dark:border-white/10 pb-2">Departure</h4>
                                    <div className="space-y-3">
                                        <div className="flex justify-between">
                                            <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary font-medium">Scheduled</span>
                                            <span className="font-mono font-bold text-light-text dark:text-dark-text">{formatTime(flightData.departure.scheduled)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary font-medium">Actual</span>
                                            <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{formatTime(flightData.departure.actual || flightData.departure.estimated)}</span>
                                        </div>
                                        <div className="pt-2 flex gap-2">
                                            <div className="flex-1 bg-black/5 dark:bg-white/5 p-2 rounded-xl text-center">
                                                <span className="block text-2xs font-bold text-light-text-secondary dark:text-dark-text-secondary uppercase">Terminal</span>
                                                <span className="font-bold text-light-text dark:text-dark-text">{flightData.departure.terminal || '-'}</span>
                                            </div>
                                            <div className="flex-1 bg-black/5 dark:bg-white/5 p-2 rounded-xl text-center">
                                                <span className="block text-2xs font-bold text-light-text-secondary dark:text-dark-text-secondary uppercase">Gate</span>
                                                <span className="font-bold text-light-text dark:text-dark-text">{flightData.departure.gate || '-'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Arrival */}
                                <div className="p-5 bg-light-fill dark:bg-dark-fill/50 rounded-2xl border border-black/5 dark:border-white/5">
                                    <h4 className="text-xs font-black text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-widest mb-4 border-b border-black/5 dark:border-white/10 pb-2">Arrival</h4>
                                    <div className="space-y-3">
                                        <div className="flex justify-between">
                                            <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary font-medium">Scheduled</span>
                                            <span className="font-mono font-bold text-light-text dark:text-dark-text">{formatTime(flightData.arrival.scheduled)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary font-medium">Estimated</span>
                                            <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{formatTime(flightData.arrival.actual || flightData.arrival.estimated)}</span>
                                        </div>
                                        <div className="pt-2 flex gap-2">
                                            <div className="flex-1 bg-black/5 dark:bg-white/5 p-2 rounded-xl text-center">
                                                <span className="block text-2xs font-bold text-light-text-secondary dark:text-dark-text-secondary uppercase">Terminal</span>
                                                <span className="font-bold text-light-text dark:text-dark-text">{flightData.arrival.terminal || '-'}</span>
                                            </div>
                                            <div className="flex-1 bg-black/5 dark:bg-white/5 p-2 rounded-xl text-center">
                                                <span className="block text-2xs font-bold text-light-text-secondary dark:text-dark-text-secondary uppercase">Gate</span>
                                                <span className="font-bold text-light-text dark:text-dark-text">{flightData.arrival.gate || '-'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}


                        {/* Aircraft Info */}
                        {flightData.aircraft && (
                            <div className="flex items-center justify-between px-4 py-2.5 bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5 rounded-2xl text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">
                                <span>Aircraft: {flightData.aircraft.model}</span>
                                <span>Reg: {flightData.aircraft.registration}</span>
                            </div>
                        )}
                        
                        {/* Live Lat/Lon if available */}
                        {flightData.live && (
                            <div className="p-3 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-2xl flex items-center gap-3">
                                <NavigationArrow className="w-4 h-4 text-blue-500 animate-pulse" />
                                <span className="text-xs font-bold text-blue-700 dark:text-blue-300">
                                    Live Position: {flightData.live.latitude.toFixed(4)}, {flightData.live.longitude.toFixed(4)} • Alt: {flightData.live.altitude}m
                                </span>
                            </div>
                        )}
                    </div>
                )}

                <div className="flex justify-end pt-4 border-t border-black/10 dark:border-white/10 mt-6">
                    <Button variant="secondary" onClick={onClose} className="min-h-[44px]">
                        Close
                    </Button>
                </div>
            </div>
        </Modal>
    );
};
