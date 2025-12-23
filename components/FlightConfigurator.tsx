
import React, { useState, useEffect } from 'react';
import { Button, Input, Select, Badge, Autocomplete } from './ui';
import { Flight } from '../types';
import { dataService } from '../services/mockDb';

interface FlightConfiguratorProps {
    initialData?: Flight[];
    onSave: (flights: Flight[]) => void;
    onDelete?: (flightIds: string[]) => void;
    onCancel: () => void;
    defaultStartDate?: string;
    defaultEndDate?: string;
}

type TripType = 'Round Trip' | 'One-Way' | 'Multi-City';

interface SegmentForm {
    id: string;
    origin: string;
    destination: string;
    date: string;
    airline: string;
    flightNumber: string;
    confirmationCode: string;
    travelClass: string;
    seatType: string;
    seatNumber: string;
    isExitRow: boolean;
    cost?: number;
    website?: string;
}

interface AirportData {
    iata: string;
    name: string;
    city: string;
    country: string;
}

const DEFAULT_SEGMENT: Omit<SegmentForm, 'id'> = {
    origin: '',
    destination: '',
    date: '',
    airline: '',
    flightNumber: '',
    confirmationCode: '',
    travelClass: 'Economy',
    seatType: 'Window',
    seatNumber: '',
    isExitRow: false
};

const getCurrencySymbol = (code: string) => {
    const symbols: Record<string, string> = {
        'USD': '$',
        'EUR': '€',
        'GBP': '£',
        'AUD': 'A$',
        'JPY': '¥'
    };
    return symbols[code] || code || '$';
};

export const FlightConfigurator: React.FC<FlightConfiguratorProps> = ({ 
    initialData, 
    onSave, 
    onDelete, 
    onCancel,
    defaultStartDate,
    defaultEndDate
}) => {
    const [tripType, setTripType] = useState<TripType>('Round Trip');
    const [segments, setSegments] = useState<SegmentForm[]>([
        { id: '1', ...DEFAULT_SEGMENT, date: defaultStartDate || '' },
        { id: '2', ...DEFAULT_SEGMENT, date: defaultEndDate || '' } // Default 2 for Round Trip
    ]);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    
    // Data Loading State
    const [airportList, setAirportList] = useState<AirportData[]>([]);
    const [isLoadingAirports, setIsLoadingAirports] = useState(false);
    const [isAutoFilling, setIsAutoFilling] = useState<string | null>(null); // holds ID of segment being filled
    const [apiKey, setApiKey] = useState<string>('');
    const [currencySymbol, setCurrencySymbol] = useState('$');

    useEffect(() => {
        // Load settings to get API Key and Currency
        dataService.getWorkspaceSettings().then(s => {
            if (s.aviationStackApiKey) setApiKey(s.aviationStackApiKey);
            setCurrencySymbol(getCurrencySymbol(s.currency));
        });

        // Load Airport Data (Free, Static)
        setIsLoadingAirports(true);
        fetch('https://raw.githubusercontent.com/mwgg/Airports/master/airports.json')
            .then(res => res.json())
            .then(data => {
                const list: AirportData[] = Object.values(data)
                    .filter((details: any) => details.iata && details.iata.length === 3) 
                    .map((details: any) => ({
                        iata: details.iata,
                        name: details.name,
                        city: details.city,
                        country: details.country
                    }));
                setAirportList(list);
                setIsLoadingAirports(false);
            })
            .catch(e => {
                console.error("Failed to load airports", e);
                setIsLoadingAirports(false);
            });
    }, []);

    useEffect(() => {
        if (initialData && initialData.length > 0) {
            // Determine type from first flight
            const first = initialData[0];
            setTripType(first.type);

            const mapped: SegmentForm[] = initialData.map(f => ({
                id: f.id,
                origin: f.origin,
                destination: f.destination,
                date: f.departureDate,
                airline: f.airline,
                flightNumber: f.flightNumber,
                confirmationCode: f.confirmationCode,
                travelClass: f.travelClass,
                seatType: f.seatType,
                seatNumber: f.seatNumber,
                isExitRow: f.isExitRow,
                cost: f.cost,
                website: f.website
            }));
            setSegments(mapped);
        }
    }, [initialData]);

    const handleAutoFill = async (index: number) => {
        const seg = segments[index];
        if (!seg.flightNumber || !seg.date || !apiKey) {
            alert("Please enter a Flight Number, Date and ensure API Key is set in Settings.");
            return;
        }

        setIsAutoFilling(seg.id);
        
        try {
            // AviationStack Call
            const res = await fetch(`http://api.aviationstack.com/v1/flights?access_key=${apiKey}&flight_iata=${seg.flightNumber}`);
            const data = await res.json();
            
            if (data.data && data.data.length > 0) {
                // Find entry that matches or is closest
                const flight = data.data[0]; // Simplification: Take first match
                
                const updates: Partial<SegmentForm> = {
                    airline: flight.airline?.name || seg.airline,
                    origin: flight.departure?.iata || seg.origin,
                    destination: flight.arrival?.iata || seg.destination,
                };
                
                // Update State
                const newSegments = [...segments];
                newSegments[index] = { ...newSegments[index], ...updates };
                
                // If it's a round trip and this is the first segment, try to update the return leg origin/dest too
                if (tripType === 'Round Trip' && index === 0) {
                     if (updates.origin) newSegments[1].destination = updates.origin;
                     if (updates.destination) newSegments[1].origin = updates.destination;
                }

                setSegments(newSegments);
            } else {
                alert("No flight details found. Please check the flight number.");
            }
        } catch (e) {
            console.error("Flight lookup failed", e);
            alert("Flight lookup failed. Check your API key or network connection (Note: Free tier only supports HTTP).");
        } finally {
            setIsAutoFilling(null);
        }
    };

    // Filter Logic for Autocomplete
    const fetchAirportSuggestions = async (query: string): Promise<string[]> => {
        if (!query || query.length < 2) return [];
        const lower = query.toLowerCase();
        
        return airportList
            .filter(a => 
                a.iata.toLowerCase().includes(lower) || 
                a.city.toLowerCase().includes(lower) || 
                a.name.toLowerCase().includes(lower)
            )
            .slice(0, 10)
            .map(a => `${a.iata} - ${a.city} (${a.name})`);
    };

    const extractIata = (val: string) => {
        if (val.includes(' - ')) return val.split(' - ')[0];
        return val;
    };

    // Handle Trip Type switching logic
    const handleTripTypeChange = (type: TripType) => {
        setTripType(type);
        if (type === 'One-Way') {
            setSegments([segments[0] || { id: '1', ...DEFAULT_SEGMENT, date: defaultStartDate || '' }]);
        } else if (type === 'Round Trip') {
            // Ensure 2 segments
            const first = segments[0] || { id: '1', ...DEFAULT_SEGMENT, date: defaultStartDate || '' };
            const second = segments[1] || { 
                id: '2', 
                ...DEFAULT_SEGMENT, 
                origin: first.destination, 
                destination: first.origin,
                date: defaultEndDate || '' 
            };
            setSegments([first, second]);
        } else {
            // Multi-City: Start with what we have, ensure at least 2
            if (segments.length < 2) {
                setSegments([...segments, { id: Math.random().toString(), ...DEFAULT_SEGMENT }]);
            }
        }
    };

    const updateSegment = (index: number, field: keyof SegmentForm, value: any) => {
        const newSegments = [...segments];
        newSegments[index] = { ...newSegments[index], [field]: value };
        
        // Auto-link logic for Round Trip & Multi-City conveniences
        if (tripType === 'Round Trip' && index === 0) {
            // If changing outbound, update return automatically
            if (field === 'origin') newSegments[1].destination = value;
            if (field === 'destination') newSegments[1].origin = value;
        }
        
        if (tripType === 'Multi-City' && field === 'destination' && index < segments.length - 1) {
            // Suggest next origin
             if (!newSegments[index + 1].origin) {
                 newSegments[index + 1].origin = value;
             }
        }

        setSegments(newSegments);
    };

    const addSegment = () => {
        const last = segments[segments.length - 1];
        setSegments([...segments, { 
            id: Math.random().toString(), 
            ...DEFAULT_SEGMENT,
            origin: last ? last.destination : '',
            date: last ? last.date : ''
        }]);
    };

    const removeSegment = (index: number) => {
        if (segments.length <= 1) return;
        setSegments(segments.filter((_, i) => i !== index));
    };

    const handleGenerateItinerary = () => {
        // Reuse itineraryId if editing, else generate new
        const itineraryId = (initialData && initialData.length > 0) ? initialData[0].itineraryId : Math.random().toString(36).substr(2, 9);
        
        const newFlights: Flight[] = segments.map(seg => ({
            id: (initialData?.find(f => f.id === seg.id)?.id) || Math.random().toString(36).substr(2, 9),
            itineraryId,
            type: tripType,
            airline: seg.airline,
            flightNumber: seg.flightNumber,
            confirmationCode: seg.confirmationCode,
            origin: extractIata(seg.origin),
            destination: extractIata(seg.destination),
            departureDate: seg.date,
            departureTime: '12:00', // Default if not editing time
            arrivalDate: seg.date,
            arrivalTime: '16:00',
            travelClass: seg.travelClass as any,
            seatNumber: seg.seatNumber,
            seatType: seg.seatType as any,
            isExitRow: seg.isExitRow,
            reason: 'Personal', // Defaulting for simplicity
            cost: seg.cost,
            website: seg.website
        }));

        onSave(newFlights);
    };

    const handleDelete = () => {
        if (onDelete && initialData) {
            onDelete(initialData.map(f => f.id));
        }
    };

    const isValid = segments.every(s => s.origin && s.destination && s.date);

    if (showDeleteConfirm) {
        return (
            <div className="text-center space-y-6 animate-fade-in py-8">
                <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center mx-auto text-rose-600 animate-pulse">
                    <span className="material-icons-outlined text-4xl">flight_takeoff</span>
                </div>
                <div>
                    <h4 className="text-xl font-bold text-gray-900 dark:text-white">Delete Itinerary?</h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                        This will remove all {segments.length} flight segments in this itinerary.
                    </p>
                </div>
                <div className="flex gap-3 pt-2 max-w-xs mx-auto">
                    <Button variant="ghost" className="flex-1" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
                    <Button variant="danger" className="flex-1" onClick={handleDelete}>Confirm</Button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in max-h-[80vh] overflow-y-auto custom-scrollbar p-1">
            {/* Trip Type Tabs */}
            <div className="flex p-1 bg-gray-100 dark:bg-gray-800 rounded-xl sticky top-0 z-10">
                {['Round Trip', 'One-Way', 'Multi-City'].map((t) => (
                    <button
                        key={t}
                        onClick={() => handleTripTypeChange(t as TripType)}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase transition-all ${
                            tripType === t 
                            ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-white' 
                            : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
                        }`}
                    >
                        {t}
                    </button>
                ))}
            </div>

            <div className="space-y-6">
                {segments.map((segment, index) => (
                    <div key={segment.id} className="relative p-5 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/5 group">
                        <div className="flex justify-between items-center mb-4">
                            <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">
                                {tripType === 'Round Trip' 
                                    ? (index === 0 ? 'Outbound Flight' : 'Return Flight')
                                    : `Flight Segment ${index + 1}`
                                }
                            </h4>
                            {tripType === 'Multi-City' && segments.length > 1 && (
                                <button onClick={() => removeSegment(index)} className="text-gray-300 hover:text-rose-500 transition-colors">
                                    <span className="material-icons-outlined text-sm">close</span>
                                </button>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                            {/* Route Row */}
                            <div className="md:col-span-3">
                                <Autocomplete 
                                    label="Origin" 
                                    placeholder="JFK" 
                                    value={segment.origin} 
                                    onChange={val => updateSegment(index, 'origin', val)} 
                                    fetchSuggestions={fetchAirportSuggestions}
                                />
                            </div>
                            <div className="md:col-span-1 flex items-end justify-center pb-3 text-gray-300">
                                <span className="material-icons-outlined">arrow_right_alt</span>
                            </div>
                            <div className="md:col-span-3">
                                <Autocomplete 
                                    label="Destination" 
                                    placeholder="LHR" 
                                    value={segment.destination} 
                                    onChange={val => updateSegment(index, 'destination', val)} 
                                    fetchSuggestions={fetchAirportSuggestions}
                                />
                            </div>
                            <div className="md:col-span-5">
                                <Input 
                                    label="Date" 
                                    type="date" 
                                    value={segment.date} 
                                    min={index === 0 ? defaultStartDate : segments[index - 1]?.date}
                                    onChange={e => updateSegment(index, 'date', e.target.value)} 
                                />
                            </div>

                            {/* Details Row */}
                            <div className="md:col-span-4 relative">
                                <Input 
                                    label="Flight #" 
                                    placeholder="DL123" 
                                    value={segment.flightNumber} 
                                    onChange={e => updateSegment(index, 'flightNumber', e.target.value.toUpperCase())} 
                                />
                                {apiKey && (
                                    <button 
                                        onClick={() => handleAutoFill(index)}
                                        className="absolute right-2 top-8 text-blue-500 hover:text-blue-600 disabled:opacity-50"
                                        title="Auto-fill details from AviationStack"
                                        disabled={isAutoFilling === segment.id || !segment.flightNumber}
                                    >
                                        {isAutoFilling === segment.id ? (
                                            <span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin block" />
                                        ) : (
                                            <span className="material-icons-outlined text-lg">bolt</span>
                                        )}
                                    </button>
                                )}
                            </div>
                            <div className="md:col-span-4">
                                <Input label="Airline" placeholder="Delta" value={segment.airline} onChange={e => updateSegment(index, 'airline', e.target.value)} />
                            </div>
                            <div className="md:col-span-4">
                                <Input label="Confirm Code" placeholder="XYZ123" value={segment.confirmationCode} onChange={e => updateSegment(index, 'confirmationCode', e.target.value.toUpperCase())} />
                            </div>

                            {/* Seat Row - Collapsed visual */}
                            <div className="md:col-span-12 pt-2 border-t border-gray-200 dark:border-white/5 mt-2">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
                                    <Select 
                                        label="Class"
                                        options={[{label:'Economy', value:'Economy'}, {label:'Economy+', value:'Economy+'}, {label:'Business', value:'Business'}, {label:'First', value:'First'}]}
                                        value={segment.travelClass}
                                        onChange={e => updateSegment(index, 'travelClass', e.target.value)}
                                        className="!py-2 !text-xs"
                                    />
                                    <Select 
                                        label="Seat Type"
                                        options={[{label:'Window', value:'Window'}, {label:'Aisle', value:'Aisle'}, {label:'Middle', value:'Middle'}]}
                                        value={segment.seatType}
                                        onChange={e => updateSegment(index, 'seatType', e.target.value)}
                                        className="!py-2 !text-xs"
                                    />
                                    <Input label="Seat" placeholder="12A" value={segment.seatNumber} onChange={e => updateSegment(index, 'seatNumber', e.target.value.toUpperCase())} className="!py-2 !text-xs" />
                                    
                                    <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-white/50 dark:hover:bg-black/20 transition-colors h-10">
                                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${segment.isExitRow ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300 dark:bg-gray-800 dark:border-gray-600'}`}>
                                            {segment.isExitRow && <span className="material-icons-outlined text-white text-[10px]">check</span>}
                                        </div>
                                        <input type="checkbox" className="hidden" checked={segment.isExitRow} onChange={e => updateSegment(index, 'isExitRow', e.target.checked)} />
                                        <span className="text-xs font-bold text-gray-700 dark:text-gray-200">Exit Row</span>
                                    </label>
                                </div>
                            </div>

                            {/* Cost & Booking Info */}
                            <div className="md:col-span-12 pt-2 border-t border-gray-200 dark:border-white/5 mt-2 bg-blue-50/50 dark:bg-blue-900/10 p-4 rounded-xl">
                                <h5 className="text-[10px] font-black uppercase text-blue-500 mb-2">Booking & Cost</h5>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="relative">
                                        <Input 
                                            label="Total Cost" 
                                            type="number" 
                                            placeholder="0.00" 
                                            value={segment.cost || ''} 
                                            onChange={e => updateSegment(index, 'cost', parseFloat(e.target.value))} 
                                            className="pl-8"
                                        />
                                        <span className="absolute left-3 top-9 text-gray-400 font-bold">{currencySymbol}</span>
                                    </div>
                                    <Input 
                                        label="Booking Website / Source" 
                                        placeholder="e.g. Skyscanner, Airline Direct" 
                                        value={segment.website || ''} 
                                        onChange={e => updateSegment(index, 'website', e.target.value)} 
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                ))}

                {tripType === 'Multi-City' && (
                    <Button variant="secondary" onClick={addSegment} className="w-full border-dashed" icon={<span className="material-icons-outlined">add</span>}>
                        Add Flight Segment
                    </Button>
                )}
            </div>

            <div className="flex gap-3 pt-4 border-t border-gray-100 dark:border-white/5 sticky bottom-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur p-2 justify-between">
                {initialData && onDelete && (
                    <Button variant="danger" onClick={() => setShowDeleteConfirm(true)} icon={<span className="material-icons-outlined">delete</span>}>
                        Delete
                    </Button>
                )}
                <div className="flex gap-3 flex-1 justify-end">
                    <Button variant="ghost" onClick={onCancel} className="w-full md:w-auto">Cancel</Button>
                    <Button variant="primary" onClick={handleGenerateItinerary} className="w-full md:w-auto" disabled={!isValid}>
                        {tripType === 'Multi-City' ? `Save ${segments.length} Flights` : 'Save Itinerary'}
                    </Button>
                </div>
            </div>
        </div>
    );
};
