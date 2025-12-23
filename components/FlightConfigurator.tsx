
import React, { useState, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Button, Input, Select, Autocomplete, Badge, TimeInput } from './ui';
import { Transport, TransportMode } from '../types';
import { dataService } from '../services/mockDb';

interface TransportConfiguratorProps {
    initialData?: Transport[];
    onSave: (transports: Transport[]) => void;
    onDelete?: (ids: string[]) => void;
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
    time: string;
    provider: string; 
    identifier: string;
    confirmationCode: string;
    travelClass: string;
    seatType: string;
    seatNumber: string;
    isExitRow: boolean;
    cost?: number;
    website?: string;
    distance?: number;
}

// Separate interface for Car logic to keep state clean
interface CarForm {
    pickupLocation: string;
    dropoffLocation: string;
    pickupDate: string;
    pickupTime: string;
    dropoffDate: string;
    dropoffTime: string;
    agency: string; // provider
    model: string; // vehicleModel
    confirmationCode: string;
    cost?: number;
    website?: string;
    sameDropoff: boolean;
    distance?: number;
}

interface AirportData {
    iata: string;
    name: string;
    city: string;
    country: string;
}

interface AirlineData {
    name: string;
    iata: string;
    icao?: string;
}

const DEFAULT_SEGMENT: Omit<SegmentForm, 'id'> = {
    origin: '',
    destination: '',
    date: '',
    time: '12:00',
    provider: '',
    identifier: '',
    confirmationCode: '',
    travelClass: 'Economy',
    seatType: 'Window',
    seatNumber: '',
    isExitRow: false
};

const getCurrencySymbol = (code: string) => {
    const symbols: Record<string, string> = {
        'USD': '$', 'EUR': '€', 'GBP': '£', 'AUD': 'A$', 'JPY': '¥'
    };
    return symbols[code] || code || '$';
};

const TRANSPORT_MODES: { mode: TransportMode; label: string; icon: string }[] = [
    { mode: 'Flight', label: 'Flight', icon: 'flight' },
    { mode: 'Train', label: 'Train', icon: 'train' },
    { mode: 'Bus', label: 'Bus', icon: 'directions_bus' },
    { mode: 'Cruise', label: 'Cruise', icon: 'directions_boat' },
    { mode: 'Car Rental', label: 'Rental', icon: 'key' },
    { mode: 'Personal Car', label: 'My Car', icon: 'directions_car' },
];

export const TransportConfigurator: React.FC<TransportConfiguratorProps> = ({ 
    initialData, 
    onSave, 
    onDelete, 
    onCancel,
    defaultStartDate,
    defaultEndDate
}) => {
    // Top Level State
    const [mode, setMode] = useState<TransportMode>('Flight');
    const [tripType, setTripType] = useState<TripType>('Round Trip');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [currencySymbol, setCurrencySymbol] = useState('$');
    const [apiKey, setApiKey] = useState<string>('');

    // Public Transport State (Flight/Train/Bus)
    const [segments, setSegments] = useState<SegmentForm[]>([
        { id: '1', ...DEFAULT_SEGMENT, date: defaultStartDate || '' },
        { id: '2', ...DEFAULT_SEGMENT, date: defaultEndDate || '' } 
    ]);
    const [isAutoFilling, setIsAutoFilling] = useState<string | null>(null);
    const [isEstimatingDistance, setIsEstimatingDistance] = useState<string | null>(null); // segment ID or 'car'
    const [airportList, setAirportList] = useState<AirportData[]>([]);
    const [airlineList, setAirlineList] = useState<AirlineData[]>([]);

    // Private Transport State (Rental/Personal)
    const [carForm, setCarForm] = useState<CarForm>({
        pickupLocation: '',
        dropoffLocation: '',
        pickupDate: defaultStartDate || '',
        pickupTime: '10:00',
        dropoffDate: defaultEndDate || '',
        dropoffTime: '10:00',
        agency: '',
        model: '',
        confirmationCode: '',
        sameDropoff: true
    });

    // --- Init & Data Loading ---
    useEffect(() => {
        dataService.getWorkspaceSettings().then(s => {
            if (s.aviationStackApiKey) setApiKey(s.aviationStackApiKey);
            setCurrencySymbol(getCurrencySymbol(s.currency));
        });

        // Load Airports
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
            })
            .catch(e => console.error("Failed to load airports", e));

        // Load Airlines from processed JSONL
        fetch('https://raw.githubusercontent.com/dlubom/iata_code_fetcher/main/carrier_data_full_processed.jsonl')
            .then(res => res.text())
            .then(text => {
                const lines = text.split('\n').filter(line => line.trim() !== '');
                const list: AirlineData[] = lines.map(line => {
                    try {
                        const d = JSON.parse(line);
                        // Support keys from standard IATA datasets
                        return {
                            name: d.name || d.Name || '',
                            iata: d.iata || d.IATA || '',
                            icao: d.icao || d.ICAO || ''
                        };
                    } catch { return null; }
                }).filter(x => x && x.name) as AirlineData[];
                setAirlineList(list);
            })
            .catch(e => console.error("Failed to load airlines", e));
    }, []);

    // --- Load Initial Data ---
    useEffect(() => {
        if (initialData && initialData.length > 0) {
            const first = initialData[0];
            setMode(first.mode);
            
            // Is it a car/rental?
            if (first.mode === 'Car Rental' || first.mode === 'Personal Car') {
                const isSame = first.origin === first.destination;
                setCarForm({
                    pickupLocation: first.pickupLocation || first.origin || '',
                    dropoffLocation: first.dropoffLocation || first.destination || '',
                    pickupDate: first.departureDate,
                    pickupTime: first.departureTime,
                    dropoffDate: first.arrivalDate,
                    dropoffTime: first.arrivalTime,
                    agency: first.provider,
                    model: first.vehicleModel || '',
                    confirmationCode: first.confirmationCode,
                    cost: first.cost,
                    website: first.website,
                    sameDropoff: isSame,
                    distance: first.distance
                });
            } else {
                // It's public transport
                setTripType(first.type);
                const mapped: SegmentForm[] = initialData.map(f => ({
                    id: f.id,
                    origin: f.origin,
                    destination: f.destination,
                    date: f.departureDate,
                    time: f.departureTime,
                    provider: f.provider,
                    identifier: f.identifier,
                    confirmationCode: f.confirmationCode,
                    travelClass: f.travelClass || 'Economy',
                    seatType: f.seatType || 'Window',
                    seatNumber: f.seatNumber || '',
                    isExitRow: f.isExitRow || false,
                    cost: f.cost,
                    website: f.website,
                    distance: f.distance
                }));
                setSegments(mapped);
            }
        }
    }, [initialData]);

    // --- Handlers: Mode Switch ---
    const handleModeChange = (newMode: TransportMode) => {
        setMode(newMode);
        
        // Reset trip type based on constraints
        if (newMode === 'Flight') {
            // Keep current if valid, else default
            if (!['Round Trip', 'One-Way', 'Multi-City'].includes(tripType)) setTripType('Round Trip');
        } else if (newMode === 'Train' || newMode === 'Bus' || newMode === 'Cruise') {
            if (tripType === 'Multi-City') setTripType('Round Trip');
        }
    };

    // --- Handlers: Public Transport ---
    const handleTripTypeChange = (type: TripType) => {
        setTripType(type);
        if (type === 'One-Way') {
            setSegments([segments[0] || { id: '1', ...DEFAULT_SEGMENT, date: defaultStartDate || '' }]);
        } else if (type === 'Round Trip') {
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
            // Multi-city
            if (segments.length < 2) {
                setSegments([...segments, { id: Math.random().toString(), ...DEFAULT_SEGMENT }]);
            }
        }
    };

    const updateSegment = (index: number, field: keyof SegmentForm, value: any) => {
        const newSegments = [...segments];
        newSegments[index] = { ...newSegments[index], [field]: value };
        
        // Auto-link round trip logic
        if (tripType === 'Round Trip' && index === 0) {
            if (field === 'origin') newSegments[1].destination = value;
            if (field === 'destination') newSegments[1].origin = value;
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

    // --- Handlers: Car ---
    const updateCar = (field: keyof CarForm, value: any) => {
        setCarForm(prev => ({ ...prev, [field]: value }));
    };

    // --- AI Estimate Distance ---
    const estimateDistance = async (origin: string, dest: string, transportMode: string, setCallback: (val: number) => void, loadingId: string) => {
        if (!origin || !dest) return;
        setIsEstimatingDistance(loadingId);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: `Estimate the travel distance in Kilometers between "${origin}" and "${dest}" by ${transportMode}. Return ONLY the number (e.g. 150.5). Do not include units or text.`,
            });
            const text = response.text?.trim();
            const dist = parseFloat(text || '');
            if (!isNaN(dist)) {
                setCallback(dist);
            }
        } catch (e) {
            console.error("Distance estimation failed", e);
        } finally {
            setIsEstimatingDistance(null);
        }
    };

    // --- Save Logic ---
    const handleSave = () => {
        const itineraryId = (initialData && initialData.length > 0) ? initialData[0].itineraryId : Math.random().toString(36).substr(2, 9);
        const isCar = mode === 'Car Rental' || mode === 'Personal Car';

        if (isCar) {
            // Map Car Form to single Transport object
            const t: Transport = {
                id: (initialData && initialData.length > 0) ? initialData[0].id : Math.random().toString(36).substr(2, 9),
                itineraryId,
                type: 'One-Way', // Arbitrary for cars
                mode: mode,
                provider: carForm.agency,
                identifier: '', // No specific identifier usually
                confirmationCode: carForm.confirmationCode,
                // Map Pickup to Origin/Departure
                origin: carForm.pickupLocation,
                departureDate: carForm.pickupDate,
                departureTime: carForm.pickupTime,
                pickupLocation: carForm.pickupLocation,
                // Map Dropoff to Dest/Arrival
                destination: carForm.sameDropoff ? carForm.pickupLocation : carForm.dropoffLocation,
                arrivalDate: carForm.dropoffDate,
                arrivalTime: carForm.dropoffTime,
                dropoffLocation: carForm.sameDropoff ? carForm.pickupLocation : carForm.dropoffLocation,
                
                vehicleModel: carForm.model,
                cost: carForm.cost,
                website: carForm.website,
                reason: 'Personal',
                distance: carForm.distance
            };
            onSave([t]);
        } else {
            // Map Segments
            const transports: Transport[] = segments.map(seg => ({
                id: (initialData?.find(f => f.id === seg.id)?.id) || Math.random().toString(36).substr(2, 9),
                itineraryId,
                type: tripType,
                mode: mode,
                provider: seg.provider,
                identifier: seg.identifier,
                confirmationCode: seg.confirmationCode,
                origin: extractIata(seg.origin),
                destination: extractIata(seg.destination),
                departureDate: seg.date,
                departureTime: seg.time,
                arrivalDate: seg.date, // Simplifying arrival date = dep date for segments unless we add arrival date field
                arrivalTime: '00:00', // Simplify
                travelClass: seg.travelClass as any,
                seatNumber: seg.seatNumber,
                seatType: seg.seatType as any,
                isExitRow: seg.isExitRow,
                reason: 'Personal',
                cost: seg.cost,
                website: seg.website,
                distance: seg.distance
            }));
            onSave(transports);
        }
    };

    // --- Helpers ---
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

    const fetchAirlineSuggestions = async (query: string): Promise<string[]> => {
        if (!query || query.length < 2) return [];
        const lower = query.toLowerCase();
        return airlineList
            .filter(a => 
                (a.name && a.name.toLowerCase().includes(lower)) || 
                (a.iata && a.iata.toLowerCase().includes(lower))
            )
            .slice(0, 10)
            .map(a => a.iata ? `${a.iata} - ${a.name}` : a.name);
    };

    const extractIata = (val: string) => val.includes(' - ') ? val.split(' - ')[0] : val;

    const handleAutoFill = async (index: number) => {
        const seg = segments[index];
        if (!seg.identifier || !seg.date || !apiKey) {
            alert("Please enter Flight Number, Date and check Settings for API Key.");
            return;
        }
        setIsAutoFilling(seg.id);
        try {
            const res = await fetch(`http://api.aviationstack.com/v1/flights?access_key=${apiKey}&flight_iata=${seg.identifier}`);
            const data = await res.json();
            if (data.data && data.data.length > 0) {
                const flight = data.data[0];
                const updates: Partial<SegmentForm> = {
                    provider: flight.airline?.name || seg.provider,
                    origin: flight.departure?.iata || seg.origin,
                    destination: flight.arrival?.iata || seg.destination,
                };
                const newSegments = [...segments];
                newSegments[index] = { ...newSegments[index], ...updates };
                // Sync return leg if needed
                if (tripType === 'Round Trip' && index === 0) {
                     if (updates.origin) newSegments[1].destination = updates.origin;
                     if (updates.destination) newSegments[1].origin = updates.destination;
                }
                setSegments(newSegments);
            } else {
                alert("No details found.");
            }
        } catch (e) { alert("Lookup failed."); } 
        finally { setIsAutoFilling(null); }
    };

    // --- Validation ---
    const isCar = mode === 'Car Rental' || mode === 'Personal Car';
    const isValid = isCar 
        ? carForm.pickupLocation && carForm.pickupDate && carForm.dropoffDate
        : segments.every(s => s.origin && s.destination && s.date);

    // --- Renderers ---

    if (showDeleteConfirm) {
        return (
            <div className="text-center space-y-6 animate-fade-in py-8">
                <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center mx-auto text-rose-600 animate-pulse">
                    <span className="material-icons-outlined text-4xl">delete_forever</span>
                </div>
                <div>
                    <h4 className="text-xl font-bold text-gray-900 dark:text-white">Delete Booking?</h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                        This will remove the current configuration.
                    </p>
                </div>
                <div className="flex gap-3 pt-2 max-w-xs mx-auto">
                    <Button variant="ghost" className="flex-1" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
                    <Button variant="danger" className="flex-1" onClick={() => { if(onDelete && initialData) onDelete(initialData.map(f => f.id)) }}>Confirm</Button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in max-h-[80vh] overflow-y-auto custom-scrollbar p-1">
            
            {/* 1. Mode Selector */}
            <div className="bg-gray-100 dark:bg-black/30 p-1.5 rounded-2xl flex gap-1 overflow-x-auto">
                {TRANSPORT_MODES.map(m => (
                    <button
                        key={m.mode}
                        onClick={() => handleModeChange(m.mode)}
                        className={`flex-1 flex flex-col items-center justify-center py-3 rounded-xl transition-all min-w-[70px] ${
                            mode === m.mode
                            ? 'bg-white shadow-md text-blue-600 dark:bg-gray-800 dark:text-white'
                            : 'text-gray-500 hover:bg-gray-200/50 dark:hover:bg-white/5 dark:text-gray-400'
                        }`}
                    >
                        <span className="material-icons-outlined text-xl mb-1">{m.icon}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wide">{m.label}</span>
                    </button>
                ))}
            </div>

            {/* 2. Configuration Form */}
            {isCar ? (
                // --- PRIVATE TRANSPORT FORM ---
                <div className="space-y-6 bg-gray-50 dark:bg-white/5 p-6 rounded-3xl border border-gray-100 dark:border-white/5 animate-fade-in">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Input 
                            label={mode === 'Car Rental' ? "Pickup Location" : "Start Location"} 
                            placeholder="e.g. LAX Terminal 4"
                            value={carForm.pickupLocation} 
                            onChange={e => updateCar('pickupLocation', e.target.value)} 
                        />
                        {!carForm.sameDropoff && (
                            <Input 
                                label={mode === 'Car Rental' ? "Drop-off Location" : "Destination"} 
                                placeholder="e.g. SFO Rental Return"
                                value={carForm.dropoffLocation} 
                                onChange={e => updateCar('dropoffLocation', e.target.value)} 
                            />
                        )}
                        {mode === 'Car Rental' && (
                            <div className={`md:col-span-2 flex items-center gap-2 p-3 rounded-xl bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 w-fit cursor-pointer ${carForm.sameDropoff ? 'text-blue-600 dark:text-blue-400 border-blue-200' : 'text-gray-500'}`} onClick={() => updateCar('sameDropoff', !carForm.sameDropoff)}>
                                <div className={`w-4 h-4 rounded border flex items-center justify-center ${carForm.sameDropoff ? 'bg-blue-600 border-blue-600' : 'bg-white'}`}>
                                    {carForm.sameDropoff && <span className="material-icons-outlined text-white text-[10px]">check</span>}
                                </div>
                                <span className="text-xs font-bold">Return to same location</span>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200 dark:border-white/5">
                        <div className="space-y-2">
                            <Input label="Pickup Date" type="date" value={carForm.pickupDate} onChange={e => updateCar('pickupDate', e.target.value)} />
                            <TimeInput value={carForm.pickupTime} onChange={val => updateCar('pickupTime', val)} />
                        </div>
                        <div className="space-y-2">
                            <Input label="Drop-off Date" type="date" value={carForm.dropoffDate} min={carForm.pickupDate} onChange={e => updateCar('dropoffDate', e.target.value)} />
                            <TimeInput value={carForm.dropoffTime} onChange={val => updateCar('dropoffTime', val)} />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-gray-200 dark:border-white/5">
                        {mode === 'Car Rental' ? (
                            <>
                                <Input label="Agency" placeholder="Hertz, Avis..." value={carForm.agency} onChange={e => updateCar('agency', e.target.value)} />
                                <Input label="Car Model" placeholder="Ford Mustang" value={carForm.model} onChange={e => updateCar('model', e.target.value)} />
                                <Input label="Reservation #" placeholder="RES-123" value={carForm.confirmationCode} onChange={e => updateCar('confirmationCode', e.target.value)} />
                            </>
                        ) : (
                            <div className="md:col-span-3">
                                <Input label="Vehicle Description" placeholder="My Red Toyota" value={carForm.model} onChange={e => updateCar('model', e.target.value)} />
                            </div>
                        )}
                    </div>

                    <div className="flex gap-4 pt-2">
                        <div className="relative flex-1">
                            <Input label="Estimated Cost" type="number" placeholder="0.00" value={carForm.cost || ''} onChange={e => updateCar('cost', parseFloat(e.target.value))} className="pl-8" />
                            <span className="absolute left-3 top-9 text-gray-400 font-bold">{currencySymbol}</span>
                        </div>
                        {mode === 'Car Rental' && (
                            <div className="flex-[2]">
                                <Input label="Booking Link" placeholder="https://" value={carForm.website || ''} onChange={e => updateCar('website', e.target.value)} />
                            </div>
                        )}
                    </div>
                    {/* Car Distance */}
                    <div className="relative pt-2">
                        <Input 
                            label="Distance (km)" 
                            type="number"
                            placeholder="e.g. 450" 
                            value={carForm.distance || ''} 
                            onChange={e => updateCar('distance', parseFloat(e.target.value))} 
                            className="pr-12"
                        />
                        <button 
                            onClick={() => estimateDistance(carForm.pickupLocation, carForm.sameDropoff ? carForm.pickupLocation : carForm.dropoffLocation, 'Car', (val) => updateCar('distance', val), 'car')}
                            className="absolute right-2 top-8 text-blue-500 hover:text-blue-600 disabled:opacity-50"
                            title="Auto-Estimate Distance"
                            disabled={isEstimatingDistance === 'car' || !carForm.pickupLocation}
                        >
                            {isEstimatingDistance === 'car' ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <span className="material-icons-outlined text-lg">timeline</span>}
                        </button>
                    </div>
                </div>
            ) : (
                // --- PUBLIC TRANSPORT FORM (Flight/Train/Bus) ---
                <div className="space-y-6">
                    {/* Sub-Tabs for Trip Type */}
                    <div className="flex p-1 bg-gray-50 dark:bg-white/5 rounded-xl border border-gray-100 dark:border-white/5">
                        {(mode === 'Flight' ? ['Round Trip', 'One-Way', 'Multi-City'] : ['Round Trip', 'One-Way']).map((t) => (
                            <button
                                key={t}
                                onClick={() => handleTripTypeChange(t as TripType)}
                                className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase transition-all ${
                                    tripType === t 
                                    ? 'bg-white text-gray-900 shadow-sm border border-gray-100 dark:bg-gray-700 dark:text-white dark:border-gray-600' 
                                    : 'text-gray-400 hover:text-gray-600 dark:text-gray-500'
                                }`}
                            >
                                {t}
                            </button>
                        ))}
                    </div>

                    <div className="space-y-6">
                        {segments.map((segment, index) => (
                            <div key={segment.id} className="relative p-5 bg-white dark:bg-white/5 rounded-3xl border border-gray-100 dark:border-white/5 shadow-sm group">
                                <div className="flex justify-between items-center mb-4">
                                    <Badge color="blue" className="!text-[9px]">
                                        {tripType === 'Round Trip' ? (index === 0 ? 'Outbound' : 'Return') : `Leg ${index + 1}`}
                                    </Badge>
                                    {tripType === 'Multi-City' && segments.length > 1 && (
                                        <button onClick={() => removeSegment(index)} className="text-gray-300 hover:text-rose-500 transition-colors">
                                            <span className="material-icons-outlined text-sm">close</span>
                                        </button>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                                    {/* Route */}
                                    <div className="md:col-span-5">
                                        <Autocomplete 
                                            label="Origin" 
                                            placeholder={mode === 'Flight' ? "JFK" : "Station/City/Port"} 
                                            value={segment.origin} 
                                            onChange={val => updateSegment(index, 'origin', val)} 
                                            fetchSuggestions={mode === 'Flight' ? fetchAirportSuggestions : () => Promise.resolve([])}
                                        />
                                    </div>
                                    <div className="md:col-span-2 flex items-center justify-center pt-4">
                                        <span className="material-icons-outlined text-gray-300">arrow_right_alt</span>
                                    </div>
                                    <div className="md:col-span-5">
                                        <Autocomplete 
                                            label="Destination" 
                                            placeholder={mode === 'Flight' ? "LHR" : "Station/City/Port"} 
                                            value={segment.destination} 
                                            onChange={val => updateSegment(index, 'destination', val)} 
                                            fetchSuggestions={mode === 'Flight' ? fetchAirportSuggestions : () => Promise.resolve([])}
                                        />
                                    </div>

                                    {/* Date/Time */}
                                    <div className="md:col-span-8">
                                        <Input 
                                            label="Date" 
                                            type="date" 
                                            value={segment.date} 
                                            min={index === 0 ? defaultStartDate : segments[index - 1]?.date}
                                            onChange={e => updateSegment(index, 'date', e.target.value)} 
                                        />
                                    </div>
                                    <div className="md:col-span-4">
                                        <TimeInput label="Time" value={segment.time} onChange={val => updateSegment(index, 'time', val)} />
                                    </div>

                                    {/* Details */}
                                    <div className="md:col-span-4 relative">
                                        <Input 
                                            label={mode === 'Flight' ? "Flight #" : mode === 'Cruise' ? "Voyage #" : "Train/Bus #"}
                                            placeholder="1234"
                                            value={segment.identifier} 
                                            onChange={e => updateSegment(index, 'identifier', e.target.value.toUpperCase())} 
                                        />
                                        {mode === 'Flight' && apiKey && (
                                            <button 
                                                onClick={() => handleAutoFill(index)}
                                                className="absolute right-2 top-8 text-blue-500 hover:text-blue-600 disabled:opacity-50"
                                                title="Auto-fill"
                                                disabled={isAutoFilling === segment.id || !segment.identifier}
                                            >
                                                {isAutoFilling === segment.id ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <span className="material-icons-outlined text-lg">bolt</span>}
                                            </button>
                                        )}
                                    </div>
                                    <div className="md:col-span-4">
                                        {mode === 'Flight' ? (
                                            <Autocomplete 
                                                label="Carrier" 
                                                placeholder="Delta" 
                                                value={segment.provider} 
                                                onChange={val => updateSegment(index, 'provider', val)} 
                                                fetchSuggestions={fetchAirlineSuggestions}
                                            />
                                        ) : (
                                            <Input 
                                                label={mode === 'Cruise' ? "Cruise Line" : "Carrier"} 
                                                placeholder={mode === 'Cruise' ? "Royal Caribbean" : "Eurostar"} 
                                                value={segment.provider} 
                                                onChange={e => updateSegment(index, 'provider', e.target.value)} 
                                            />
                                        )}
                                    </div>
                                    <div className="md:col-span-4">
                                        <Input label="Conf. Code" placeholder="XYZ" value={segment.confirmationCode} onChange={e => updateSegment(index, 'confirmationCode', e.target.value.toUpperCase())} />
                                    </div>

                                    {/* Distance Field for Public Transport */}
                                    <div className="md:col-span-4 relative">
                                        <Input 
                                            label="Distance (km)"
                                            type="number"
                                            value={segment.distance || ''} 
                                            onChange={e => updateSegment(index, 'distance', parseFloat(e.target.value))} 
                                            className="pr-12"
                                        />
                                        <button 
                                            onClick={() => estimateDistance(segment.origin, segment.destination, mode, (val) => updateSegment(index, 'distance', val), segment.id)}
                                            className="absolute right-2 top-8 text-blue-500 hover:text-blue-600 disabled:opacity-50"
                                            title="Auto-Estimate Distance"
                                            disabled={isEstimatingDistance === segment.id || !segment.origin || !segment.destination}
                                        >
                                            {isEstimatingDistance === segment.id ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <span className="material-icons-outlined text-lg">timeline</span>}
                                        </button>
                                    </div>

                                    {mode === 'Flight' && (
                                        <div className="md:col-span-12 grid grid-cols-4 gap-4 mt-2">
                                            <Select label="Class" options={[{label:'Economy', value:'Economy'}, {label:'Business', value:'Business'}, {label:'First', value:'First'}]} value={segment.travelClass} onChange={e => updateSegment(index, 'travelClass', e.target.value)} className="!py-2 !text-xs" />
                                            <Input label="Seat" value={segment.seatNumber} onChange={e => updateSegment(index, 'seatNumber', e.target.value)} className="!py-2 !text-xs" />
                                            <div className="col-span-2 flex items-center gap-2 mt-6">
                                                <div className="relative w-full">
                                                    <Input label="Cost" type="number" placeholder="0.00" value={segment.cost || ''} onChange={e => updateSegment(index, 'cost', parseFloat(e.target.value))} className="pl-6 !py-2 !text-xs" />
                                                    <span className="absolute left-2 top-7 text-xs text-gray-400">{currencySymbol}</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}

                        {tripType === 'Multi-City' && (
                            <Button variant="secondary" onClick={addSegment} className="w-full border-dashed" icon={<span className="material-icons-outlined">add</span>}>
                                Add Segment
                            </Button>
                        )}
                    </div>
                </div>
            )}

            <div className="flex gap-3 pt-4 border-t border-gray-100 dark:border-white/5 sticky bottom-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur p-2 justify-between">
                {initialData && onDelete && (
                    <Button variant="danger" onClick={() => setShowDeleteConfirm(true)} icon={<span className="material-icons-outlined">delete</span>}>
                        Delete
                    </Button>
                )}
                <div className="flex gap-3 flex-1 justify-end">
                    <Button variant="ghost" onClick={onCancel} className="w-full md:w-auto">Cancel</Button>
                    <Button variant="primary" onClick={handleSave} className="w-full md:w-auto" disabled={!isValid}>
                        Save {mode}
                    </Button>
                </div>
            </div>
        </div>
    );
};
