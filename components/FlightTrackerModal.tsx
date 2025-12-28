
import React, { useState, useEffect } from 'react';
import { Modal, Button, Input } from './ui';
import { flightTracker } from '../services/flightTracker';
import { FlightStatusResponse, Transport } from '../types';
import { dataService } from '../services/mockDb';

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
    const [apiKey, setApiKey] = useState('');

    useEffect(() => {
        dataService.getWorkspaceSettings().then(s => setApiKey(s.aviationStackApiKey || ''));
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
            const data = await flightTracker.getFlightStatus(apiKey, iata, flightDate);
            setFlightData(data);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Unknown error occurred");
        } finally {
            setIsLoading(false);
        }
    };

    const getStatusColor = (status: string) => {
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
        <Modal isOpen={isOpen} onClose={onClose} title="Where's My Flight?" maxWidth="max-w-2xl">
            <div className="space-y-6">
                {!apiKey && (
                    <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-amber-800 dark:text-amber-200 text-sm font-medium flex items-center gap-3">
                        <span className="material-icons-outlined">warning</span>
                        <span>AviationStack API Key is missing in Settings. Flight tracking may not work.</span>
                    </div>
                )}

                {/* Suggestion Card */}
                {!flightData && suggestedFlight && !error && (
                    <div className="p-1 rounded-2xl bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500">
                        <div className="bg-white dark:bg-gray-900 rounded-xl p-4 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center">
                                    <span className="material-icons-outlined">flight_takeoff</span>
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Itinerary Match</p>
                                    <p className="font-black text-gray-900 dark:text-white text-lg">{suggestedFlight.iata}: {suggestedFlight.origin} &rarr; {suggestedFlight.destination}</p>
                                </div>
                            </div>
                            <Button size="sm" onClick={() => handleTrack(suggestedFlight.iata)}>Track Now</Button>
                        </div>
                    </div>
                )}

                {/* Search Inputs */}
                <div className="flex gap-4 items-end bg-gray-50 dark:bg-white/5 p-4 rounded-2xl border border-gray-100 dark:border-white/5">
                    <Input 
                        label="Flight Number" 
                        placeholder="e.g. AA100" 
                        value={flightNum} 
                        onChange={e => setFlightNum(e.target.value.toUpperCase())}
                        className="!text-lg font-black font-mono tracking-wide"
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
                        className="h-[52px] !rounded-2xl px-6 shadow-xl shadow-blue-500/20"
                        isLoading={isLoading}
                    >
                        Search
                    </Button>
                </div>

                {error && (
                    <div className="p-6 text-center rounded-2xl bg-rose-50 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-900/30">
                        <span className="material-icons-outlined text-4xl text-rose-400 mb-2">error_outline</span>
                        <p className="text-rose-600 dark:text-rose-300 font-bold">{error}</p>
                    </div>
                )}

                {/* Flight Result */}
                {flightData && (
                    <div className="animate-fade-in space-y-6">
                        {/* Header Status */}
                        <div className="flex justify-between items-center">
                            <div>
                                <h3 className="text-3xl font-black text-gray-900 dark:text-white leading-none">
                                    {flightData.airline.name} {flightData.flight.iata}
                                </h3>
                                <p className="text-gray-500 dark:text-gray-400 text-sm font-bold mt-1">
                                    {new Date(flightData.flight_date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                                </p>
                            </div>
                            <div className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest shadow-lg ${getStatusColor(flightData.flight_status)}`}>
                                {flightData.flight_status}
                            </div>
                        </div>

                        {/* Route Display */}
                        <div className="relative flex justify-between items-center p-6 bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-white/5 shadow-lg">
                            <div className="text-center z-10">
                                <span className="text-4xl font-black text-gray-900 dark:text-white block mb-1">{flightData.departure.iata}</span>
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{flightData.departure.airport}</span>
                            </div>
                            
                            {/* Plane Graphic */}
                            <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 flex items-center justify-center px-24 pointer-events-none opacity-20">
                                <div className="h-0.5 w-full bg-gray-300 dark:bg-gray-600 relative">
                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-800 p-2 rounded-full">
                                        <span className="material-icons-outlined text-2xl transform rotate-90 text-gray-400">flight</span>
                                    </div>
                                </div>
                            </div>

                            <div className="text-center z-10">
                                <span className="text-4xl font-black text-gray-900 dark:text-white block mb-1">{flightData.arrival.iata}</span>
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{flightData.arrival.airport}</span>
                            </div>
                        </div>

                        {/* Times & Gates */}
                        <div className="grid grid-cols-2 gap-6">
                            {/* Departure */}
                            <div className="p-5 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/5">
                                <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 border-b border-gray-200 dark:border-white/10 pb-2">Departure</h4>
                                <div className="space-y-3">
                                    <div className="flex justify-between">
                                        <span className="text-sm text-gray-500 font-medium">Scheduled</span>
                                        <span className="font-mono font-bold text-gray-900 dark:text-white">{formatTime(flightData.departure.scheduled)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-sm text-gray-500 font-medium">Actual</span>
                                        <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{formatTime(flightData.departure.actual || flightData.departure.estimated)}</span>
                                    </div>
                                    <div className="pt-2 flex gap-2">
                                        <div className="flex-1 bg-white dark:bg-gray-900 p-2 rounded-xl text-center shadow-sm">
                                            <span className="block text-[9px] font-black text-gray-400 uppercase">Terminal</span>
                                            <span className="font-bold text-gray-800 dark:text-white">{flightData.departure.terminal || '-'}</span>
                                        </div>
                                        <div className="flex-1 bg-white dark:bg-gray-900 p-2 rounded-xl text-center shadow-sm">
                                            <span className="block text-[9px] font-black text-gray-400 uppercase">Gate</span>
                                            <span className="font-bold text-gray-800 dark:text-white">{flightData.departure.gate || '-'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Arrival */}
                            <div className="p-5 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/5">
                                <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 border-b border-gray-200 dark:border-white/10 pb-2">Arrival</h4>
                                <div className="space-y-3">
                                    <div className="flex justify-between">
                                        <span className="text-sm text-gray-500 font-medium">Scheduled</span>
                                        <span className="font-mono font-bold text-gray-900 dark:text-white">{formatTime(flightData.arrival.scheduled)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-sm text-gray-500 font-medium">Estimated</span>
                                        <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{formatTime(flightData.arrival.actual || flightData.arrival.estimated)}</span>
                                    </div>
                                    <div className="pt-2 flex gap-2">
                                        <div className="flex-1 bg-white dark:bg-gray-900 p-2 rounded-xl text-center shadow-sm">
                                            <span className="block text-[9px] font-black text-gray-400 uppercase">Terminal</span>
                                            <span className="font-bold text-gray-800 dark:text-white">{flightData.arrival.terminal || '-'}</span>
                                        </div>
                                        <div className="flex-1 bg-white dark:bg-gray-900 p-2 rounded-xl text-center shadow-sm">
                                            <span className="block text-[9px] font-black text-gray-400 uppercase">Gate</span>
                                            <span className="font-bold text-gray-800 dark:text-white">{flightData.arrival.gate || '-'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Aircraft Info */}
                        {flightData.aircraft && (
                            <div className="flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-white/5 rounded-xl text-xs font-medium text-gray-500 dark:text-gray-400">
                                <span>Aircraft: {flightData.aircraft.model}</span>
                                <span>Reg: {flightData.aircraft.registration}</span>
                            </div>
                        )}
                        
                        {/* Live Lat/Lon if available */}
                        {flightData.live && (
                            <div className="p-3 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-xl flex items-center gap-3">
                                <span className="material-icons-outlined text-blue-500 animate-pulse">my_location</span>
                                <span className="text-xs font-bold text-blue-700 dark:text-blue-300">
                                    Live Position: {flightData.live.latitude.toFixed(4)}, {flightData.live.longitude.toFixed(4)} • Alt: {flightData.live.altitude}m
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </Modal>
    );
};
