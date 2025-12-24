
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
    date: string; // Departure Date
    time: string; // Departure Time
    arrivalDate: string; // Arrival Date
    arrivalTime: string; // Arrival Time
    duration: number; // Duration in minutes
    provider: string; 
    providerCode: string; 
    identifier: string; 
    travelClass: string;
    seatType: string;
    seatNumber: string;
    isExitRow: boolean;
    website?: string;
    distance?: number;
    logoUrl?: string;
}

interface CarForm {
    pickupLocation: string;
    dropoffLocation: string;
    pickupDate: string;
    pickupTime: string;
    dropoffDate: string;
    dropoffTime: string;
    duration: number; // Duration in minutes
    agency: string; 
    model: string; 
    confirmationCode: string;
    cost?: number;
    website?: string;
    sameDropoff: boolean;
    distance?: number;
    logoUrl?: string;
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
    time: '10:00',
    arrivalDate: '',
    arrivalTime: '14:00',
    duration: 240, // 4 hours default
    provider: '',
    providerCode: '',
    identifier: '',
    travelClass: 'Economy',
    seatType: 'Window',
    seatNumber: '',
    isExitRow: false
};

const AVERAGE_SPEEDS: Record<TransportMode, number> = {
    'Flight': 800,
    'Train': 100,
    'Bus': 60,
    'Car Rental': 80,
    'Personal Car': 80,
    'Cruise': 30
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

const DurationInput: React.FC<{ minutes: number; onChange: (m: number) => void }> = ({ minutes, onChange }) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    return (
        <div className="flex flex-col gap-1.5 w-full">
            <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide ml-1">Duration</label>
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <input 
                        type="number" 
                        min="0"
                        className="w-full px-3 py-3 rounded-2xl bg-gray-50/50 border border-gray-200 focus:bg-white focus:border-blue-500 outline-none font-bold text-gray-800 dark:bg-gray-800/40 dark:border-white/10 dark:text-gray-100 pr-8"
                        value={hours}
                        onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value) || 0);
                            onChange(val * 60 + mins);
                        }}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">h</span>
                </div>
                <div className="relative flex-1">
                    <input 
                        type="number" 
                        min="0" 
                        max="59"
                        className="w-full px-3 py-3 rounded-2xl bg-gray-50/50 border border-gray-200 focus:bg-white focus:border-blue-500 outline-none font-bold text-gray-800 dark:bg-gray-800/40 dark:border-white/10 dark:text-gray-100 pr-8"
                        value={mins}
                        onChange={(e) => {
                            const val = Math.max(0, Math.min(59, parseInt(e.target.value) || 0));
                            onChange(hours * 60 + val);
                        }}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">m</span>
                </div>
            </div>
        </div>
    );
};

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
    const [brandfetchKey, setBrandfetchKey] = useState<string>('');

    // Booking Details (Global for Public Transport)
    const [bookingCost, setBookingCost] = useState<string>('');
    const [bookingRef, setBookingRef] = useState<string>('');

    // Public Transport State (Flight/Train/Bus)
    const [segments, setSegments] = useState<SegmentForm[]>([
        { id: '1', ...DEFAULT_SEGMENT, date: defaultStartDate || '', arrivalDate: defaultStartDate || '' },
        { id: '2', ...DEFAULT_SEGMENT, date: defaultEndDate || '', arrivalDate: defaultEndDate || '' } 
    ]);
    const [isAutoFilling, setIsAutoFilling] = useState<string | null>(null);
    const [isEstimatingDistance, setIsEstimatingDistance] = useState<string | null>(null); // segment ID or 'car'
    const [isFetchingBrand, setIsFetchingBrand] = useState<string | null>(null); // segment ID or 'car'
    
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
        duration: 0,
        agency: '',
        model: '',
        confirmationCode: '',
        sameDropoff: true,
        logoUrl: ''
    });

    // Helper: Calculate diff in minutes
    const getDiffMinutes = (d1: string, t1: string, d2: string, t2: string) => {
        if (!d1 || !t1 || !d2 || !t2) return 0;
        const start = new Date(`${d1}T${t1}`);
        const end = new Date(`${d2}T${t2}`);
        return Math.round((end.getTime() - start.getTime()) / 60000);
    };

    // Helper: Add minutes to date
    const addMinutes = (d: string, t: string, minutes: number) => {
        if (!d || !t) return { date: '', time: '' };
        const start = new Date(`${d}T${t}`);
        const end = new Date(start.getTime() + minutes * 60000);
        // Handle local date string manually to avoid timezone shifts if using toISOString
        const year = end.getFullYear();
        const month = String(end.getMonth() + 1).padStart(2, '0');
        const day = String(end.getDate()).padStart(2, '0');
        const hours = String(end.getHours()).padStart(2, '0');
        const mins = String(end.getMinutes()).padStart(2, '0');
        return {
            date: `${year}-${month}-${day}`,
            time: `${hours}:${mins}`
        };
    };

    // --- Init & Data Loading ---
    useEffect(() => {
        dataService.getWorkspaceSettings().then(s => {
            if (s.aviationStackApiKey) setApiKey(s.aviationStackApiKey);
            if (s.brandfetchApiKey) setBrandfetchKey(s.brandfetchApiKey);
            setCurrencySymbol(getCurrencySymbol(s.currency));
        });

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

        fetch('https://raw.githubusercontent.com/dlubom/iata_code_fetcher/main/carrier_data_full_processed.jsonl')
            .then(res => res.text())
            .then(text => {
                const lines = text.split('\n').filter(line => line.trim() !== '');
                const list: AirlineData[] = lines.map(line => {
                    try {
                        const d = JSON.parse(line);
                        return {
                            name: d.company_name || d.name || '',
                            iata: d.iata || '',
                            icao: d.icao || ''
                        };
                    } catch { return null; }
                }).filter(x => x && x.name && x.iata) as AirlineData[];
                setAirlineList(list);
            })
            .catch(e => console.error("Failed to load airlines", e));
    }, []);

    // --- Load Initial Data ---
    useEffect(() => {
        if (initialData && initialData.length > 0) {
            const first = initialData[0];
            setMode(first.mode);
            
            if (first.mode === 'Car Rental' || first.mode === 'Personal Car') {
                const isSame = first.origin === first.destination;
                setCarForm({
                    pickupLocation: first.pickupLocation || first.origin || '',
                    dropoffLocation: first.dropoffLocation || first.destination || '',
                    pickupDate: first.departureDate,
                    pickupTime: first.departureTime,
                    dropoffDate: first.arrivalDate,
                    dropoffTime: first.arrivalTime,
                    duration: getDiffMinutes(first.departureDate, first.departureTime, first.arrivalDate, first.arrivalTime),
                    agency: first.provider,
                    model: first.vehicleModel || '',
                    confirmationCode: first.confirmationCode,
                    cost: first.cost,
                    website: first.website,
                    sameDropoff: isSame,
                    distance: first.distance,
                    logoUrl: first.logoUrl
                });
            } else {
                setTripType(first.type);
                const totalCost = initialData.reduce((acc, curr) => acc + (curr.cost || 0), 0);
                setBookingCost(totalCost > 0 ? totalCost.toString() : '');
                setBookingRef(first.confirmationCode || '');

                const sortedData = [...initialData].sort((a, b) => {
                    const timeA = a.departureTime || '00:00';
                    const timeB = b.departureTime || '00:00';
                    const dateA = new Date(`${a.departureDate}T${timeA}`).getTime();
                    const dateB = new Date(`${b.departureDate}T${timeB}`).getTime();
                    return dateA - dateB;
                });

                const mapped: SegmentForm[] = sortedData.map(f => {
                    let providerName = f.provider || '';
                    let providerCode = '';
                    const splitMatch = f.provider.match(/^(.*) - ([A-Z0-9]{2,3})$/);
                    if (splitMatch) {
                        providerName = splitMatch[1];
                        providerCode = splitMatch[2];
                    }

                    return {
                        id: f.id,
                        origin: f.origin,
                        destination: f.destination,
                        date: f.departureDate,
                        time: f.departureTime,
                        arrivalDate: f.arrivalDate || f.departureDate,
                        arrivalTime: f.arrivalTime || '14:00',
                        duration: getDiffMinutes(f.departureDate, f.departureTime, f.arrivalDate || f.departureDate, f.arrivalTime || '14:00'),
                        provider: providerName,
                        providerCode: providerCode,
                        identifier: f.identifier,
                        travelClass: f.travelClass || 'Economy',
                        seatType: f.seatType || 'Window',
                        seatNumber: f.seatNumber || '',
                        isExitRow: f.isExitRow || false,
                        website: f.website,
                        distance: f.distance,
                        logoUrl: f.logoUrl
                    };
                });
                setSegments(mapped);
            }
        }
    }, [initialData]);

    // --- Handlers: Mode Switch ---
    const handleModeChange = (newMode: TransportMode) => {
        setMode(newMode);
        if (newMode === 'Flight') {
            if (!['Round Trip', 'One-Way', 'Multi-City'].includes(tripType)) setTripType('Round Trip');
        } else if (newMode === 'Train' || newMode === 'Bus' || newMode === 'Cruise') {
            if (tripType === 'Multi-City') setTripType('Round Trip');
        }
    };

    // --- Handlers: Public Transport ---
    const handleTripTypeChange = (type: TripType) => {
        setTripType(type);
        if (type === 'One-Way') {
            setSegments([segments[0] || { id: '1', ...DEFAULT_SEGMENT, date: defaultStartDate || '', arrivalDate: defaultStartDate || '' }]);
        } else if (type === 'Round Trip') {
            const first = segments[0] || { id: '1', ...DEFAULT_SEGMENT, date: defaultStartDate || '', arrivalDate: defaultStartDate || '' };
            const second = segments[1] || { 
                id: '2', 
                ...DEFAULT_SEGMENT, 
                origin: first.destination, 
                destination: first.origin,
                date: defaultEndDate || '',
                arrivalDate: defaultEndDate || ''
            };
            setSegments([first, second]);
        } else {
            if (segments.length < 2) {
                setSegments([...segments, { id: Math.random().toString(), ...DEFAULT_SEGMENT }]);
            }
        }
    };

    const updateSegment = (index: number, field: keyof SegmentForm, value: any) => {
        const newSegments = [...segments];
        const prev = newSegments[index];
        let updates: Partial<SegmentForm> = { [field]: value };

        // Provider Logic
        if (field === 'provider' && mode === 'Flight') {
            const matchedAirline = airlineList.find(a => a.name.toLowerCase() === (value as string).toLowerCase());
            if (matchedAirline) {
                updates.providerCode = matchedAirline.iata;
            }
        }

        // --- Recalculation Logic ---
        
        // 1. Changing Date or Time -> Shift Arrival based on current Duration
        if (field === 'date' || field === 'time') {
            const newDate = field === 'date' ? value : prev.date;
            const newTime = field === 'time' ? value : prev.time;
            const { date: arrDate, time: arrTime } = addMinutes(newDate, newTime, prev.duration);
            updates.arrivalDate = arrDate;
            updates.arrivalTime = arrTime;
        }
        
        // 2. Changing Duration -> Update Arrival
        else if (field === 'duration') {
            const mins = value as number;
            const { date: arrDate, time: arrTime } = addMinutes(prev.date, prev.time, mins);
            updates.arrivalDate = arrDate;
            updates.arrivalTime = arrTime;
        }

        // 3. Changing Arrival -> Update Duration
        else if (field === 'arrivalDate' || field === 'arrivalTime') {
            const newArrDate = field === 'arrivalDate' ? value : prev.arrivalDate;
            const newArrTime = field === 'arrivalTime' ? value : prev.arrivalTime;
            const newDur = getDiffMinutes(prev.date, prev.time, newArrDate, newArrTime);
            updates.duration = newDur > 0 ? newDur : 0;
        }

        // 4. Changing Distance -> Estimate Duration -> Update Arrival
        else if (field === 'distance') {
            const dist = value as number;
            const speed = AVERAGE_SPEEDS[mode] || 800;
            // dist (km) / speed (km/h) * 60 = minutes
            const estimatedMins = Math.round((dist / speed) * 60);
            
            // Add buffering for public transport (boarding etc not usually included in pure travel time, but user expects travel time)
            // Let's stick to pure physics calculation as a baseline
            updates.duration = estimatedMins;
            const { date: arrDate, time: arrTime } = addMinutes(prev.date, prev.time, estimatedMins);
            updates.arrivalDate = arrDate;
            updates.arrivalTime = arrTime;
        }

        newSegments[index] = { ...prev, ...updates };
        
        // Auto-link round trip
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
            date: last ? last.arrivalDate : '',
            arrivalDate: last ? last.arrivalDate : ''
        }]);
    };

    const addLayover = (index: number) => {
        const current = segments[index];
        const next = segments[index + 1];
        
        // Calculate smart default time (e.g. +2h from arrival)
        let defaultTime = '12:00';
        let defaultDate = current.arrivalDate || current.date;
        
        if (current.arrivalTime) {
            const [h, m] = current.arrivalTime.split(':').map(Number);
            let newH = h + 2;
            if (newH >= 24) {
                newH -= 24;
                // Simple wrapping, date increment ideally needed but keeping simple for now
            }
            defaultTime = `${String(newH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        }

        const newSegment: SegmentForm = {
            id: Math.random().toString(),
            ...DEFAULT_SEGMENT,
            origin: current.destination, // Start where previous ended
            destination: next ? next.origin : '', // Connect to next if exists
            date: defaultDate,
            time: defaultTime,
            arrivalDate: defaultDate, 
            arrivalTime: defaultTime, 
        };
        
        const newSegments = [...segments];
        newSegments.splice(index + 1, 0, newSegment);
        setSegments(newSegments);
        setTripType('Multi-City');
    };

    const removeSegment = (index: number) => {
        if (segments.length <= 1) return;
        setSegments(segments.filter((_, i) => i !== index));
    };

    // --- Handlers: Car ---
    const updateCar = (field: keyof CarForm, value: any) => {
        setCarForm(prev => {
            const updates: Partial<CarForm> = { [field]: value };
            
            // 1. Changing Pickup -> Shift Dropoff using Duration
            if (field === 'pickupDate' || field === 'pickupTime') {
                const newDate = field === 'pickupDate' ? value : prev.pickupDate;
                const newTime = field === 'pickupTime' ? value : prev.pickupTime;
                const { date, time } = addMinutes(newDate, newTime, prev.duration);
                updates.dropoffDate = date;
                updates.dropoffTime = time;
            }
            // 2. Changing Duration -> Update Dropoff
            else if (field === 'duration') {
                const mins = value as number;
                const { date, time } = addMinutes(prev.pickupDate, prev.pickupTime, mins);
                updates.dropoffDate = date;
                updates.dropoffTime = time;
            }
            // 3. Changing Dropoff -> Update Duration
            else if (field === 'dropoffDate' || field === 'dropoffTime') {
                const newD = field === 'dropoffDate' ? value : prev.dropoffDate;
                const newT = field === 'dropoffTime' ? value : prev.dropoffTime;
                const newDur = getDiffMinutes(prev.pickupDate, prev.pickupTime, newD, newT);
                updates.duration = newDur > 0 ? newDur : 0;
            }
            // 4. Changing Distance -> Estimate
            else if (field === 'distance') {
                const dist = value as number;
                const speed = AVERAGE_SPEEDS[mode] || 80;
                const estimatedMins = Math.round((dist / speed) * 60);
                updates.duration = estimatedMins;
                const { date, time } = addMinutes(prev.pickupDate, prev.pickupTime, estimatedMins);
                updates.dropoffDate = date;
                updates.dropoffTime = time;
            }

            return { ...prev, ...updates };
        });
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

    // --- Brandfetch Logic ---
    const handleFetchBrandForCar = async () => {
        if (!carForm.agency || !brandfetchKey) return;
        setIsFetchingBrand('car');
        try {
            const response = await fetch(`https://api.brandfetch.io/v2/search/${encodeURIComponent(carForm.agency)}?c=${brandfetchKey}`);
            if (response.ok) {
                const data = await response.json();
                if (Array.isArray(data) && data.length > 0 && data[0].icon) {
                    updateCar('logoUrl', data[0].icon);
                }
            }
        } catch (e) { console.error("Brand fetch error", e); }
        finally { setIsFetchingBrand(null); }
    };

    const handleFetchBrandForSegment = async (index: number) => {
        const seg = segments[index];
        if (!seg.provider || !brandfetchKey) return;
        setIsFetchingBrand(seg.id);
        try {
            const response = await fetch(`https://api.brandfetch.io/v2/search/${encodeURIComponent(seg.provider)}?c=${brandfetchKey}`);
            if (response.ok) {
                const data = await response.json();
                if (Array.isArray(data) && data.length > 0 && data[0].icon) {
                    updateSegment(index, 'logoUrl', data[0].icon);
                }
            }
        } catch (e) { console.error("Brand fetch error", e); }
        finally { setIsFetchingBrand(null); }
    };

    // --- Save Logic ---
    const handleSave = () => {
        const itineraryId = (initialData && initialData.length > 0) ? initialData[0].itineraryId : Math.random().toString(36).substr(2, 9);
        const isCar = mode === 'Car Rental' || mode === 'Personal Car';

        if (isCar) {
            const t: Transport = {
                id: (initialData && initialData.length > 0) ? initialData[0].id : Math.random().toString(36).substr(2, 9),
                itineraryId,
                type: 'One-Way', 
                mode: mode,
                provider: carForm.agency,
                identifier: '', 
                confirmationCode: carForm.confirmationCode,
                origin: carForm.pickupLocation,
                departureDate: carForm.pickupDate,
                departureTime: carForm.pickupTime,
                pickupLocation: carForm.pickupLocation,
                destination: carForm.sameDropoff ? carForm.pickupLocation : carForm.dropoffLocation,
                arrivalDate: carForm.dropoffDate,
                arrivalTime: carForm.dropoffTime,
                dropoffLocation: carForm.sameDropoff ? carForm.pickupLocation : carForm.dropoffLocation,
                vehicleModel: carForm.model,
                cost: carForm.cost,
                website: carForm.website,
                reason: 'Personal',
                distance: carForm.distance,
                logoUrl: carForm.logoUrl
            };
            onSave([t]);
        } else {
            const parsedCost = parseFloat(bookingCost);
            const finalCost = isNaN(parsedCost) ? 0 : parsedCost;

            const transports: Transport[] = segments.map((seg, idx) => ({
                id: (initialData?.find(f => f.id === seg.id)?.id) || Math.random().toString(36).substr(2, 9),
                itineraryId,
                type: tripType,
                mode: mode,
                provider: seg.provider,
                identifier: seg.identifier,
                confirmationCode: bookingRef.toUpperCase(),
                origin: extractIata(seg.origin),
                destination: extractIata(seg.destination),
                departureDate: seg.date,
                departureTime: seg.time,
                arrivalDate: seg.arrivalDate || seg.date,
                arrivalTime: seg.arrivalTime || '00:00',
                travelClass: seg.travelClass as any,
                seatNumber: seg.seatNumber,
                seatType: seg.seatType as any,
                isExitRow: seg.isExitRow,
                reason: 'Personal',
                cost: idx === 0 ? finalCost : 0, 
                website: seg.website,
                distance: seg.distance,
                logoUrl: seg.logoUrl
            }));
            onSave(transports);
        }
    };

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
            .map(a => a.name); 
    };

    const extractIata = (val: string) => val.includes(' - ') ? val.split(' - ')[0] : val;

    const handleAutoFill = async (index: number) => {
        const seg = segments[index];
        const fullFlightIata = seg.providerCode ? `${seg.providerCode}${seg.identifier}` : seg.identifier;

        if (!fullFlightIata || !seg.date || !apiKey) {
            alert("Please enter Flight Number and Date.");
            return;
        }
        setIsAutoFilling(seg.id);
        try {
            const res = await fetch(`http://api.aviationstack.com/v1/flights?access_key=${apiKey}&flight_iata=${fullFlightIata}`);
            const data = await res.json();
            if (data.data && data.data.length > 0) {
                const flight = data.data[0];
                const updates: Partial<SegmentForm> = {
                    provider: flight.airline?.name || seg.provider,
                    origin: flight.departure?.iata || seg.origin,
                    destination: flight.arrival?.iata || seg.destination,
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

                const newDur = getDiffMinutes(
                    updates.date || seg.date, 
                    updates.time || seg.time, 
                    updates.arrivalDate || seg.arrivalDate, 
                    updates.arrivalTime || seg.arrivalTime
                );
                updates.duration = newDur;

                const newSegments = [...segments];
                newSegments[index] = { ...newSegments[index], ...updates };
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

    const isCar = mode === 'Car Rental' || mode === 'Personal Car';
    const isValid = isCar 
        ? carForm.pickupLocation && carForm.pickupDate && carForm.dropoffDate
        : segments.every(s => s.origin && s.destination && s.date);

    const getClassColor = (cls?: string) => {
        const c = (cls || '').toLowerCase();
        if (c.includes('first')) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50';
        if (c.includes('business')) return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border border-purple-200 dark:border-purple-900/50';
        if (c.includes('economy+')) return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/50';
        return 'bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-900/30';
    };

    const getSeatTypeIcon = (type?: string) => {
        switch(type) {
            case 'Window': return 'crop_portrait'; 
            case 'Aisle': return 'chair_alt'; 
            case 'Middle': return 'event_seat'; 
            default: return 'airline_seat_recline_normal';
        }
    };

    const calculateDuration = (seg: SegmentForm) => {
        const h = Math.floor(seg.duration / 60);
        const m = seg.duration % 60;
        return `${h}h ${m}m`;
    };

    const formatTime = (t?: string) => {
        if (!t) return '';
        const [h, m] = t.split(':');
        const hour = parseInt(h);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour % 12 || 12;
        return `${hour12}:${m} ${ampm}`;
    };

    const getTransportIcon = (mode: TransportMode) => {
        switch(mode) {
            case 'Train': return 'train';
            case 'Bus': return 'directions_bus';
            case 'Car Rental': return 'car_rental';
            case 'Personal Car': return 'directions_car';
            case 'Cruise': return 'directions_boat';
            default: return 'flight_takeoff';
        }
    };

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

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end pt-2">
                        <DurationInput minutes={carForm.duration} onChange={m => updateCar('duration', m)} />
                        
                        <div className="relative">
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

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-gray-200 dark:border-white/5">
                        {mode === 'Car Rental' ? (
                            <>
                                <div className="relative">
                                    <Input 
                                        label="Agency" 
                                        placeholder="Hertz, Avis..." 
                                        value={carForm.agency} 
                                        onChange={e => updateCar('agency', e.target.value)} 
                                        rightElement={
                                            brandfetchKey && (
                                                <button 
                                                    onClick={handleFetchBrandForCar}
                                                    disabled={isFetchingBrand === 'car' || !carForm.agency}
                                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-blue-500 disabled:opacity-50 transition-colors"
                                                    title="Fetch Brand Logo"
                                                >
                                                    {isFetchingBrand === 'car' ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin block" /> : <span className="material-icons-outlined text-lg">image_search</span>}
                                                </button>
                                            )
                                        }
                                        className="pr-10"
                                    />
                                    {carForm.logoUrl && (
                                        <div className="absolute top-8 right-12 w-8 h-8 rounded-lg overflow-hidden border border-gray-200 shadow-sm bg-white">
                                            <img src={carForm.logoUrl} alt="Logo" className="w-full h-full object-contain" />
                                        </div>
                                    )}
                                </div>
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
                </div>
            ) : (
                // --- PUBLIC TRANSPORT FORM (Flight/Train/Bus) ---
                <div className="space-y-6">
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
                                    <div className="flex items-center gap-3">
                                        <Badge color="blue" className="!text-[9px]">
                                            {tripType === 'Round Trip' ? (index === 0 ? 'Outbound' : 'Return') : `Leg ${index + 1}`}
                                        </Badge>
                                        {segment.logoUrl && (
                                            <div className="w-6 h-6 rounded overflow-hidden bg-white border shadow-sm">
                                                <img src={segment.logoUrl} alt="Logo" className="w-full h-full object-contain" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button 
                                            onClick={() => addLayover(index)}
                                            className="text-[10px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 dark:text-blue-400 dark:bg-blue-900/20 dark:hover:bg-blue-900/30 px-2 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                                            title="Add Connecting Flight"
                                        >
                                            <span className="material-icons-outlined text-xs">add_circle_outline</span> Layover
                                        </button>

                                        {tripType === 'Multi-City' && segments.length > 1 && (
                                            <button onClick={() => removeSegment(index)} className="text-gray-300 hover:text-rose-500 transition-colors">
                                                <span className="material-icons-outlined text-sm">close</span>
                                            </button>
                                        )}
                                    </div>
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

                                    {/* Date/Time - DEPARTURE */}
                                    <div className="md:col-span-2">
                                        <Input 
                                            label="Dep. Date" 
                                            type="date" 
                                            value={segment.date} 
                                            min={index === 0 ? defaultStartDate : segments[index - 1]?.date}
                                            onChange={e => updateSegment(index, 'date', e.target.value)} 
                                        />
                                    </div>
                                    <div className="md:col-span-4">
                                        <TimeInput label="Dep. Time" value={segment.time} onChange={val => updateSegment(index, 'time', val)} />
                                    </div>

                                    {/* Date/Time - ARRIVAL */}
                                    <div className="md:col-span-2">
                                        <Input 
                                            label="Arr. Date" 
                                            type="date" 
                                            value={segment.arrivalDate} 
                                            min={segment.date}
                                            onChange={e => updateSegment(index, 'arrivalDate', e.target.value)} 
                                        />
                                    </div>
                                    <div className="md:col-span-4">
                                        <TimeInput label="Arr. Time" value={segment.arrivalTime} onChange={val => updateSegment(index, 'arrivalTime', val)} />
                                    </div>

                                    {/* Duration & Distance Row */}
                                    <div className="md:col-span-6">
                                        <DurationInput minutes={segment.duration} onChange={m => updateSegment(index, 'duration', m)} />
                                    </div>
                                    
                                    <div className="md:col-span-6 relative">
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

                                    {/* Details */}
                                    {mode === 'Flight' ? (
                                        <>
                                            <div className="md:col-span-4 relative">
                                                <div className="relative w-full">
                                                    <Autocomplete 
                                                        label="Carrier" 
                                                        placeholder="Delta Air Lines" 
                                                        value={segment.provider} 
                                                        onChange={val => updateSegment(index, 'provider', val)} 
                                                        fetchSuggestions={fetchAirlineSuggestions}
                                                        className="pr-10"
                                                    />
                                                    {brandfetchKey && (
                                                        <button 
                                                            onClick={() => handleFetchBrandForSegment(index)}
                                                            disabled={isFetchingBrand === segment.id || !segment.provider}
                                                            className="absolute right-2 top-8 text-gray-400 hover:text-blue-500 disabled:opacity-50 transition-colors z-10"
                                                            title="Fetch Brand Logo"
                                                        >
                                                            {isFetchingBrand === segment.id ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin block" /> : <span className="material-icons-outlined text-lg">image_search</span>}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="md:col-span-2">
                                                <Input 
                                                    label="IATA"
                                                    placeholder="DL"
                                                    value={segment.providerCode} 
                                                    onChange={e => updateSegment(index, 'providerCode', e.target.value.toUpperCase())}
                                                    className="font-mono font-bold uppercase"
                                                />
                                            </div>
                                            <div className="md:col-span-3 relative">
                                                <Input 
                                                    label="Flight #"
                                                    placeholder="1234"
                                                    value={segment.identifier} 
                                                    onChange={e => updateSegment(index, 'identifier', e.target.value.toUpperCase())} 
                                                />
                                                {mode === 'Flight' && apiKey && (
                                                    <button 
                                                        onClick={() => handleAutoFill(index)}
                                                        className="absolute right-2 top-8 text-blue-500 hover:text-blue-600 disabled:opacity-50"
                                                        title="Auto-fill from AviationStack"
                                                        disabled={isAutoFilling === segment.id || !segment.identifier}
                                                    >
                                                        {isAutoFilling === segment.id ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <span className="material-icons-outlined text-lg">bolt</span>}
                                                    </button>
                                                )}
                                            </div>
                                        </>
                                    ) : (
                                        <div className="md:col-span-6 relative">
                                            <div className="relative w-full">
                                                <Input 
                                                    label={mode === 'Cruise' ? "Cruise Line" : "Carrier"} 
                                                    placeholder={mode === 'Cruise' ? "Royal Caribbean" : "Eurostar"} 
                                                    value={segment.provider} 
                                                    onChange={e => updateSegment(index, 'provider', e.target.value)}
                                                    className="pr-10"
                                                />
                                                {brandfetchKey && (
                                                    <button 
                                                        onClick={() => handleFetchBrandForSegment(index)}
                                                        disabled={isFetchingBrand === segment.id || !segment.provider}
                                                        className="absolute right-2 top-8 text-gray-400 hover:text-blue-500 disabled:opacity-50 transition-colors z-10"
                                                        title="Fetch Brand Logo"
                                                    >
                                                        {isFetchingBrand === segment.id ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin block" /> : <span className="material-icons-outlined text-lg">image_search</span>}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {mode !== 'Flight' && (
                                        <div className="md:col-span-3 relative">
                                            <Input 
                                                label={mode === 'Cruise' ? "Voyage #" : "Train/Bus #"}
                                                placeholder="1234"
                                                value={segment.identifier} 
                                                onChange={e => updateSegment(index, 'identifier', e.target.value.toUpperCase())} 
                                            />
                                        </div>
                                    )}

                                    {mode === 'Flight' && (
                                        <div className="md:col-span-12 grid grid-cols-4 gap-4 mt-2 p-3 bg-gray-50 dark:bg-white/5 rounded-xl border border-gray-100 dark:border-white/5">
                                            <Select label="Class" options={[{label:'Economy', value:'Economy'}, {label:'Business', value:'Business'}, {label:'First', value:'First'}]} value={segment.travelClass} onChange={e => updateSegment(index, 'travelClass', e.target.value)} className="!py-2 !text-xs" />
                                            <Input label="Seat" placeholder="12A" value={segment.seatNumber} onChange={e => updateSegment(index, 'seatNumber', e.target.value)} className="!py-2 !text-xs" />
                                            <Select label="Type" options={[{label:'Window', value:'Window'}, {label:'Middle', value:'Middle'}, {label:'Aisle', value:'Aisle'}]} value={segment.seatType} onChange={e => updateSegment(index, 'seatType', e.target.value)} className="!py-2 !text-xs" />
                                            <div className="flex items-center h-full pt-6">
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${segment.isExitRow ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-gray-300 dark:border-gray-600 dark:bg-gray-800'}`}>
                                                        {segment.isExitRow && <span className="material-icons-outlined text-white text-[10px]">check</span>}
                                                    </div>
                                                    <input type="checkbox" className="hidden" checked={segment.isExitRow} onChange={e => updateSegment(index, 'isExitRow', e.target.checked)} />
                                                    <span className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase">Exit Row</span>
                                                </label>
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
                        
                        <div className="bg-gray-50 dark:bg-white/5 p-5 rounded-2xl border border-gray-100 dark:border-white/5 space-y-4">
                            <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                <span className="material-icons-outlined text-sm">receipt_long</span> Booking Summary
                            </h4>
                            <div className="grid grid-cols-2 gap-6">
                                <Input 
                                    label="Booking Ref / PNR" 
                                    placeholder="XYZ-123" 
                                    value={bookingRef} 
                                    onChange={e => setBookingRef(e.target.value.toUpperCase())} 
                                    className="font-mono uppercase tracking-wide font-bold" 
                                />
                                <div className="relative">
                                    <Input 
                                        label="Total Cost" 
                                        type="number" 
                                        placeholder="0.00" 
                                        value={bookingCost} 
                                        onChange={e => setBookingCost(e.target.value)} 
                                        className="pl-8 font-black text-lg" 
                                    />
                                    <span className="absolute left-3 top-10 text-gray-400 font-bold text-sm">{currencySymbol}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex gap-3 pt-4 border-t border-gray-100 dark:border-white/5 sticky bottom-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur p-2 justify-between z-20 rounded-b-2xl">
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
