import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
    Compass, 
    AirplaneTilt, 
    Bed, 
    CheckCircle, 
    ArrowRight, 
    ArrowLeft, 
    X, 
    CalendarBlank, 
    MapPin, 
    Users, 
    Plus, 
    Trash, 
    Buildings, 
    House, 
    Sparkle, 
    Clock, 
    ForkKnife, 
    Key, 
    Car, 
    Train, 
    Bus, 
    Boat, 
    Anchor,
    Check,
    PencilSimple,
    Receipt,
    Globe,
    Ticket,
    Armchair,
    Tag
} from '@phosphor-icons/react';
import { Input, Autocomplete, TimeInput, Select } from './ui';
import GlassPanel from './glass/GlassPanel';
import { Trip, Transport, Accommodation, TransportMode, User, GeoCoordinates } from '../types';
import { dataService } from '../services/mockDb';
import { invalidateGlobalWanderCache } from '../hooks/useWanderSync';
import { searchLocations, searchStations, getCoordinates } from '../services/geocoding';
import { parseGoogleMapsUrl } from '../services/locationParser';
import { getAirportsByQueryLocally, getCarriersByQueryLocally } from '../utils/flightData';
import { formatDate, formatDateRange, formatCurrency, getCurrencySymbol } from '../utils/formatters';
import { 
    MODAL_SHELL_STYLE, 
    MODAL_BACKDROP_STYLE, 
    BTN_PRIMARY_STYLE, 
    BTN_SECONDARY_STYLE, 
    CARD_FILL_STYLE,
    CARD_ELEVATED_STYLE,
    STATUS_PILL_STYLE,
    SEGMENTED_TAB_WRAPPER,
    SEGMENTED_TAB_ACTIVE,
    SEGMENTED_TAB_INACTIVE,
    CLOSE_BTN_STYLE,
    INPUT_BASE_STYLE
} from '../constants';
import { TRANSPORT_MODES } from './transport/transportTypes';

export interface TripSetupBoardProps {
    isOpen: boolean;
    onClose: () => void;
    onTripCreated: (trip: Trip) => void;
    initialStatus?: 'Planning' | 'Upcoming' | 'Past';
    users?: User[];
}

type StageKey = 'basics' | 'transport' | 'accommodation' | 'review';

const STAGES: { key: StageKey; label: string; icon: React.ElementType }[] = [
    { key: 'basics', label: '1. Trip Basics', icon: Compass },
    { key: 'transport', label: '2. Transport', icon: AirplaneTilt },
    { key: 'accommodation', label: '3. Stays', icon: Bed },
    { key: 'review', label: '4. Finalize', icon: CheckCircle },
];

const ACCOMMODATION_TYPES: Array<Accommodation['type']> = [
    'Hotel',
    'Airbnb',
    'Resort',
    'Villa',
    'Apartment',
    'Hostel',
    'Campground',
    'Friends/Family'
];

const CABIN_OPTIONS = [
    { label: 'Economy', value: 'Economy' },
    { label: 'Premium Economy', value: 'Premium Economy' },
    { label: 'Business', value: 'Business' },
    { label: 'First Class', value: 'First' }
];

export const TripSetupBoard: React.FC<TripSetupBoardProps> = ({
    isOpen,
    onClose,
    onTripCreated,
    initialStatus = 'Planning',
    users = []
}) => {
    // Current Active Stage
    const [currentStage, setCurrentStage] = useState<StageKey>('basics');

    // Stage 1: Trip Basics State
    const [title, setTitle] = useState('');
    const [destination, setDestination] = useState('');
    const [destinationCoords, setDestinationCoords] = useState<{ lat: number; lng: number } | undefined>();
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [travelerCount, setTravelerCount] = useState(1);
    const [basicsError, setBasicsError] = useState<string | null>(null);

    // Stage 2: Transport Sub-Steps State
    const [transportMode, setTransportMode] = useState<TransportMode>('Flight');
    const [transportStructure, setTransportStructure] = useState<'Round Trip' | 'One-Way'>('Round Trip');
    const [transportsList, setTransportsList] = useState<Partial<Transport>[]>([]);
    
    // Transport fields
    const [outboundOrigin, setOutboundOrigin] = useState('');
    const [outboundDest, setOutboundDest] = useState('');
    const [outboundDate, setOutboundDate] = useState('');
    const [outboundTime, setOutboundTime] = useState('10:00');
    const [outboundArrivalDate, setOutboundArrivalDate] = useState('');
    const [outboundArrivalTime, setOutboundArrivalTime] = useState('14:00');
    const [outboundCarrier, setOutboundCarrier] = useState('');
    const [outboundNumber, setOutboundNumber] = useState('');
    const [outboundCost, setOutboundCost] = useState('');
    const [outboundConfCode, setOutboundConfCode] = useState('');
    const [travelClass, setTravelClass] = useState<'Economy' | 'Premium Economy' | 'Business' | 'First'>('Economy');
    const [seatInfo, setSeatInfo] = useState('');
    const [vehicleModel, setVehicleModel] = useState('');

    // Return Leg fields (for Round Trip)
    const [returnDate, setReturnDate] = useState('');
    const [returnTime, setReturnTime] = useState('14:00');
    const [returnNumber, setReturnNumber] = useState('');

    // Stage 3: Accommodation Sub-Steps State
    const [accommodationsList, setAccommodationsList] = useState<Partial<Accommodation>[]>([]);
    const [accType, setAccType] = useState<Accommodation['type']>('Hotel');
    const [accName, setAccName] = useState('');
    const [accAddress, setAccAddress] = useState('');
    const [accCoords, setAccCoords] = useState<GeoCoordinates | undefined>();
    const [accCheckIn, setAccCheckIn] = useState('');
    const [accCheckInTime, setAccCheckInTime] = useState('15:00');
    const [accCheckOut, setAccCheckOut] = useState('');
    const [accCheckOutTime, setAccCheckOutTime] = useState('11:00');
    const [accCost, setAccCost] = useState('');
    const [accRef, setAccRef] = useState('');

    // Submission State
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    // Destination change handler
    const handleDestinationChange = (val: string) => {
        setDestination(val);
        getCoordinates(val).then(c => {
            if (c) setDestinationCoords(c);
        }).catch(() => {});
    };

    // Calculate nights for the active accommodation form
    const activeAccNights = useMemo(() => {
        const inDate = accCheckIn || startDate;
        const outDate = accCheckOut || endDate;
        if (!inDate || !outDate) return 0;
        const diff = new Date(outDate).getTime() - new Date(inDate).getTime();
        return Math.max(0, Math.round(diff / (1000 * 60 * 60 * 24)));
    }, [accCheckIn, accCheckOut, startDate, endDate]);

    // Transition from Basics to Transport
    const handleCompleteBasics = async () => {
        setBasicsError(null);
        if (!title.trim()) {
            setBasicsError("Please provide an expedition or trip title.");
            return;
        }
        if (!destination.trim()) {
            setBasicsError("Please enter a destination.");
            return;
        }
        if (!startDate || !endDate) {
            setBasicsError("Please select both a start and end date.");
            return;
        }
        if (new Date(endDate) < new Date(startDate)) {
            setBasicsError("End date cannot be earlier than start date.");
            return;
        }

        // Pre-seed subsequent stages
        if (!outboundDest) setOutboundDest(destination);
        if (!outboundDate) {
            setOutboundDate(startDate);
            setOutboundArrivalDate(startDate);
        }
        if (!returnDate) setReturnDate(endDate);

        if (!accName) setAccName(`${destination} Stay`);
        if (!accAddress) setAccAddress(destination);
        if (!accCheckIn) setAccCheckIn(startDate);
        if (!accCheckOut) setAccCheckOut(endDate);

        // Resolve destination coordinates in background
        if (!destinationCoords) {
            getCoordinates(destination).then(c => {
                if (c) setDestinationCoords(c);
            }).catch(() => {});
        }

        setCurrentStage('transport');
    };

    // -------------------------------------------------------------
    // LOOKUP SERVICES FOR TRANSPORT & ACCOMMODATIONS
    // -------------------------------------------------------------

    // Generic location suggestions
    const fetchLocationSuggestions = async (query: string) => {
        if (!query || query.length < 2) return [];
        return searchLocations(query);
    };

    // Flight airports autocomplete (IATA, City, Airport Name)
    const fetchAirportSuggestions = async (query: string): Promise<string[]> => {
        if (!query || query.trim().length < 2) return [];
        let apiResults: any[] = [];
        try {
            const token = localStorage.getItem('wandergrid_session_token');
            const headers: Record<string, string> = token ? { 'Authorization': `Bearer ${token}` } : {};
            const res = await fetch(`/api/airports/search?q=${encodeURIComponent(query.trim())}`, { headers });
            if (res.ok) {
                apiResults = await res.json();
            }
        } catch (e) {
            // Fall back to local airports
        }

        const localResults = getAirportsByQueryLocally(query.trim());
        const seenIatas = new Set<string>();
        const merged: any[] = [];

        if (Array.isArray(apiResults)) {
            for (const item of apiResults) {
                if (item.iata) {
                    seenIatas.add(item.iata.toUpperCase());
                    merged.push(item);
                }
            }
        }

        for (const item of localResults) {
            if (item.iata && !seenIatas.has(item.iata.toUpperCase())) {
                merged.push(item);
            }
        }

        return merged.slice(0, 12).map((a: any) => `${a.iata} - ${a.city_name || a.city || ''} (${a.airport_name || a.name || ''})`);
    };

    // Airline autocomplete
    const fetchAirlineSuggestions = async (query: string): Promise<string[]> => {
        if (!query || query.trim().length < 1) return [];
        let apiResults: any[] = [];
        try {
            const token = localStorage.getItem('wandergrid_session_token');
            const headers: Record<string, string> = token ? { 'Authorization': `Bearer ${token}` } : {};
            const res = await fetch(`/api/carriers/search?q=${encodeURIComponent(query.trim())}`, { headers });
            if (res.ok) {
                apiResults = await res.json();
            }
        } catch (e) {
            // Fall back to local carriers
        }

        const localResults = getCarriersByQueryLocally(query.trim());
        const seenNames = new Set<string>();
        const merged: string[] = [];

        if (Array.isArray(apiResults)) {
            for (const item of apiResults) {
                const name = item.company_name || item.name;
                if (name && !seenNames.has(name.toLowerCase())) {
                    seenNames.add(name.toLowerCase());
                    merged.push(item.iata ? `${name} (${item.iata})` : name);
                }
            }
        }

        for (const item of localResults) {
            if (item.company_name && !seenNames.has(item.company_name.toLowerCase())) {
                seenNames.add(item.company_name.toLowerCase());
                merged.push(item.iata ? `${item.company_name} (${item.iata})` : item.company_name);
            }
        }

        return merged.slice(0, 12);
    };

    // Train Station suggestions (queries railway stations & city hubs)
    const fetchTrainStationSuggestions = async (query: string): Promise<string[]> => {
        if (!query || query.trim().length < 2) return [];
        const [stationRes, locRes] = await Promise.all([
            searchStations(query.trim(), 'train').catch(() => []),
            searchLocations(query.trim()).catch(() => [])
        ]);
        const merged = Array.from(new Set([...stationRes, ...locRes]));
        return merged.slice(0, 12);
    };

    // Bus Station suggestions (queries bus terminals & transit stations)
    const fetchBusStationSuggestions = async (query: string): Promise<string[]> => {
        if (!query || query.trim().length < 2) return [];
        const [stationRes, locRes] = await Promise.all([
            searchStations(query.trim(), 'bus').catch(() => []),
            searchLocations(query.trim()).catch(() => [])
        ]);
        const merged = Array.from(new Set([...stationRes, ...locRes]));
        return merged.slice(0, 12);
    };

    // Address & Google Maps suggestions for Accommodations
    const fetchAddressSuggestions = async (query: string): Promise<string[]> => {
        if (!query || query.trim().length < 2) return [];
        const trimmed = query.trim();

        // 1. Google Maps URL or coordinate link detection
        const gmap = parseGoogleMapsUrl(trimmed);
        if (gmap.isGoogleMaps) {
            if (gmap.placeName) {
                return [`📍 ${gmap.placeName} (Google Maps)`];
            }
            if (gmap.lat !== undefined && gmap.lng !== undefined) {
                return [`📍 Pin Coordinates: ${gmap.lat.toFixed(5)}, ${gmap.lng.toFixed(5)}`];
            }
        }

        const suggestions: string[] = [];
        const seen = new Set<string>();

        // 2. High-precision address search via Photon / OpenStreetMap API (handles house numbers, streets, postcodes, hotels)
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 2500);
            const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(trimmed)}&limit=10&lang=en`, {
                signal: controller.signal
            });
            clearTimeout(timeout);
            if (res.ok) {
                const data = await res.json();
                if (data?.features && Array.isArray(data.features)) {
                    for (const f of data.features) {
                        const p = f.properties || {};
                        const parts: string[] = [];
                        if (p.name) parts.push(p.name);
                        const streetPart = [p.housenumber, p.street].filter(Boolean).join(' ');
                        if (streetPart && (!p.name || !p.name.includes(p.street))) parts.push(streetPart);
                        const cityPart = p.city || p.town || p.village || p.municipality;
                        if (cityPart && (!p.name || !p.name.includes(cityPart))) parts.push(cityPart);
                        if (p.country) parts.push(p.country);

                        const formatted = parts.join(', ');
                        if (formatted && !seen.has(formatted.toLowerCase())) {
                            seen.add(formatted.toLowerCase());
                            suggestions.push(`📍 ${formatted}`);
                        }
                    }
                }
            }
        } catch {
            // Network fallback
        }

        // 3. Fallback to searchLocations from geocoding service
        if (suggestions.length < 5) {
            try {
                const locs = await searchLocations(trimmed);
                for (const loc of locs) {
                    const formatted = loc.startsWith('📍 ') ? loc : `📍 ${loc}`;
                    if (!seen.has(formatted.toLowerCase())) {
                        seen.add(formatted.toLowerCase());
                        suggestions.push(formatted);
                    }
                }
            } catch {}
        }

        return suggestions.slice(0, 12);
    };

    // Address input change handler (auto extracts Google Maps link coordinates & names)
    const handleAddressChange = (val: string) => {
        const gmap = parseGoogleMapsUrl(val);
        if (gmap.isGoogleMaps) {
            const cleanName = gmap.placeName || (gmap.lat && gmap.lng ? `${gmap.lat.toFixed(5)}, ${gmap.lng.toFixed(5)}` : val);
            setAccAddress(cleanName);
            if (gmap.lat !== undefined && gmap.lng !== undefined) {
                setAccCoords({ lat: gmap.lat, lng: gmap.lng });
            }
            if (!accName && gmap.placeName) {
                setAccName(gmap.placeName.split(',')[0]);
            }
            return;
        }

        const cleanVal = val.replace(/^📍\s*/, '').replace(/\s*\(Google Maps\)$/, '');
        setAccAddress(cleanVal);
        getCoordinates(cleanVal).then(coords => {
            if (coords) setAccCoords(coords);
        }).catch(() => {});
    };

    // -------------------------------------------------------------
    // STACKING / MULTIPLE ENTRIES HANDLERS
    // -------------------------------------------------------------

    // Commit current transport to list
    const handleCommitTransport = () => {
        const originVal = outboundOrigin.trim();
        const destVal = (outboundDest || destination).trim();
        if (!originVal && !destVal && !outboundCarrier.trim()) return;

        const costNum = parseFloat(outboundCost) || undefined;
        const newTransports: Partial<Transport>[] = [];
        const itineraryId = crypto.randomUUID();

        // Primary Outbound Leg
        newTransports.push({
            id: crypto.randomUUID(),
            itineraryId,
            mode: transportMode,
            type: transportStructure,
            origin: originVal || 'Origin',
            destination: destVal || destination,
            departureDate: outboundDate || startDate,
            departureTime: outboundTime || '10:00',
            arrivalDate: outboundArrivalDate || outboundDate || startDate,
            arrivalTime: outboundArrivalTime || '14:00',
            provider: outboundCarrier.trim(),
            identifier: (transportMode === 'Car Rental' || transportMode === 'Personal Car') ? (vehicleModel || outboundNumber) : outboundNumber.trim(),
            confirmationCode: outboundConfCode.trim().toUpperCase(),
            travelClass: transportMode === 'Flight' ? travelClass : undefined,
            seatNumber: seatInfo || undefined,
            cost: costNum ? (transportStructure === 'Round Trip' ? costNum / 2 : costNum) : undefined
        });

        // Return Leg if round-trip (applies to Flight, Train, Bus, Cruise)
        if (transportStructure === 'Round Trip' && transportMode !== 'Car Rental' && transportMode !== 'Personal Car') {
            newTransports.push({
                id: crypto.randomUUID(),
                itineraryId,
                mode: transportMode,
                type: 'Round Trip',
                origin: destVal || destination,
                destination: originVal || 'Origin',
                departureDate: returnDate || endDate,
                departureTime: returnTime || '14:00',
                arrivalDate: returnDate || endDate,
                arrivalTime: '18:00',
                provider: outboundCarrier.trim(),
                identifier: (returnNumber || outboundNumber).trim(),
                confirmationCode: outboundConfCode.trim().toUpperCase(),
                travelClass: transportMode === 'Flight' ? travelClass : undefined,
                seatNumber: seatInfo || undefined,
                cost: costNum ? costNum / 2 : undefined
            });
        }

        setTransportsList(prev => [...prev, ...newTransports]);

        // Smart reset for subsequent transport leg
        setOutboundOrigin(destVal);
        setOutboundDest('');
        setOutboundNumber('');
        setOutboundCost('');
        setOutboundConfCode('');
        setVehicleModel('');
        setSeatInfo('');
        setOutboundDate(returnDate || outboundDate || startDate);
        setOutboundArrivalDate(returnDate || outboundDate || startDate);
    };

    const handleRemoveTransport = (index: number) => {
        setTransportsList(prev => prev.filter((_, i) => i !== index));
    };

    // Commit current accommodation to list
    const handleCommitAccommodation = () => {
        const nameVal = accName.trim();
        const addressVal = accAddress.trim();
        if (!nameVal && !addressVal) return;

        const newAcc: Partial<Accommodation> = {
            id: crypto.randomUUID(),
            name: nameVal || `${accType} in ${destination}`,
            type: accType,
            address: addressVal || destination,
            checkInDate: accCheckIn || startDate,
            checkInTime: accCheckInTime || '15:00',
            checkOutDate: accCheckOut || endDate,
            checkOutTime: accCheckOutTime || '11:00',
            cost: parseFloat(accCost) || undefined,
            confirmationCode: accRef.trim() || undefined,
            coordinates: accCoords
        };

        setAccommodationsList(prev => [...prev, newAcc]);

        // Smart reset for next accommodation leg
        setAccName('');
        setAccAddress('');
        setAccCoords(undefined);
        setAccCheckIn(accCheckOut || startDate);
        setAccCheckOut(endDate);
        setAccCost('');
        setAccRef('');
    };

    const handleRemoveAccommodation = (index: number) => {
        setAccommodationsList(prev => prev.filter((_, i) => i !== index));
    };

    // Finalize Trip Creation
    const handleFinalizeTrip = async () => {
        setIsSaving(true);
        try {
            const tripId = crypto.randomUUID();
            const tripPayload: Trip = {
                id: tripId,
                name: title.trim(),
                location: destination.trim(),
                startDate,
                endDate,
                status: initialStatus,
                participants: users.length > 0 ? [users[0].id] : [],
                locations: [{
                    id: crypto.randomUUID(),
                    name: destination.trim(),
                    startDate,
                    endDate,
                    coordinates: destinationCoords
                }],
                transports: transportsList.map(t => ({
                    id: t.id || crypto.randomUUID(),
                    itineraryId: t.itineraryId || crypto.randomUUID(),
                    mode: t.mode || 'Flight',
                    type: t.type || 'One-Way',
                    origin: t.origin || '',
                    destination: t.destination || '',
                    departureDate: t.departureDate || startDate,
                    departureTime: t.departureTime || '10:00',
                    arrivalDate: t.arrivalDate || t.departureDate || startDate,
                    arrivalTime: t.arrivalTime || '14:00',
                    provider: t.provider || '',
                    identifier: t.identifier || '',
                    confirmationCode: t.confirmationCode || '',
                    cost: t.cost,
                    travelClass: t.travelClass as any,
                    seatNumber: t.seatNumber,
                    reason: 'Personal'
                })),
                accommodations: accommodationsList.map(a => ({
                    id: a.id || crypto.randomUUID(),
                    name: a.name || 'Stay',
                    type: a.type || 'Hotel',
                    address: a.address || destination,
                    checkInDate: a.checkInDate || startDate,
                    checkOutDate: a.checkOutDate || endDate,
                    checkInTime: a.checkInTime || '15:00',
                    checkOutTime: a.checkOutTime || '11:00',
                    confirmationCode: a.confirmationCode || '',
                    cost: a.cost,
                    coordinates: a.coordinates
                })),
                activities: []
            };

            const savedTrip = await dataService.addTrip(tripPayload);
            invalidateGlobalWanderCache();
            window.dispatchEvent(new CustomEvent('wandergrid_db_updated'));
            onTripCreated(savedTrip);
            onClose();
        } catch (err: any) {
            console.error("Failed to create expedition:", err);
            setIsSaving(false);
        }
    };

    const stageIndex = STAGES.findIndex(s => s.key === currentStage);

    // -------------------------------------------------------------
    // RENDER TRANSPORT MODE FIELDS
    // -------------------------------------------------------------
    const renderTransportFields = () => {
        switch (transportMode) {
            case 'Flight':
                return (
                    <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <Autocomplete 
                                label="Departure Airport (Origin) *" 
                                placeholder="e.g. JFK or New York" 
                                value={outboundOrigin} 
                                onChange={setOutboundOrigin} 
                                fetchSuggestions={fetchAirportSuggestions} 
                            />
                            <Autocomplete 
                                label="Arrival Airport (Destination) *" 
                                placeholder="e.g. CDG or Paris" 
                                value={outboundDest || destination} 
                                onChange={setOutboundDest} 
                                fetchSuggestions={fetchAirportSuggestions} 
                            />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <Autocomplete 
                                label="Airline *" 
                                placeholder="e.g. Air France or Delta" 
                                value={outboundCarrier} 
                                onChange={setOutboundCarrier} 
                                fetchSuggestions={fetchAirlineSuggestions} 
                            />
                            <Input 
                                label="Flight Number" 
                                placeholder="e.g. AF 022" 
                                value={outboundNumber} 
                                onChange={e => setOutboundNumber(e.target.value)} 
                            />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <Select 
                                label="Cabin / Travel Class" 
                                value={travelClass} 
                                onChange={e => setTravelClass(e.target.value as any)}
                                options={CABIN_OPTIONS}
                            />
                            <Input 
                                label="Seat Number" 
                                placeholder="e.g. 14A" 
                                value={seatInfo} 
                                onChange={e => setSeatInfo(e.target.value)} 
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <Input label="Departure Date" type="date" value={outboundDate || startDate} onChange={e => setOutboundDate(e.target.value)} />
                            <TimeInput label="Departure Time" value={outboundTime} onChange={setOutboundTime} />
                        </div>
                        {transportStructure === 'Round Trip' && (
                            <div className="p-3 rounded-2xl bg-primary-500/5 border border-primary-500/15 space-y-2">
                                <span className="text-2xs font-bold uppercase tracking-wider text-primary-600 dark:text-primary-400 block">
                                    Return Leg (Mirrored: {outboundDest || destination} &rarr; {outboundOrigin || 'Origin'})
                                </span>
                                <div className="grid grid-cols-2 gap-2">
                                    <Input label="Return Date" type="date" value={returnDate || endDate} min={outboundDate || startDate} onChange={e => setReturnDate(e.target.value)} />
                                    <TimeInput label="Return Time" value={returnTime} onChange={setReturnTime} />
                                </div>
                                <Input label="Return Flight #" placeholder="e.g. AF 023" value={returnNumber} onChange={e => setReturnNumber(e.target.value)} />
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                            <Input label="Total Cost" type="number" placeholder="0.00" value={outboundCost} onChange={e => setOutboundCost(e.target.value)} />
                            <Input label="Booking Code (PNR)" placeholder="e.g. DL7XYZ" value={outboundConfCode} onChange={e => setOutboundConfCode(e.target.value)} />
                        </div>
                    </div>
                );

            case 'Train':
                return (
                    <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <Autocomplete 
                                label="Departure Station *" 
                                placeholder="e.g. Paris Gare de Lyon" 
                                value={outboundOrigin} 
                                onChange={setOutboundOrigin} 
                                fetchSuggestions={fetchTrainStationSuggestions} 
                            />
                            <Autocomplete 
                                label="Arrival Station *" 
                                placeholder="e.g. Nice Ville" 
                                value={outboundDest || destination} 
                                onChange={setOutboundDest} 
                                fetchSuggestions={fetchTrainStationSuggestions} 
                            />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <Input 
                                label="Rail Operator" 
                                placeholder="e.g. SNCF, Eurostar, Amtrak" 
                                value={outboundCarrier} 
                                onChange={e => setOutboundCarrier(e.target.value)} 
                            />
                            <Input 
                                label="Train / Service #" 
                                placeholder="e.g. TGV 6173" 
                                value={outboundNumber} 
                                onChange={e => setOutboundNumber(e.target.value)} 
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <Input label="Departure Date" type="date" value={outboundDate || startDate} onChange={e => setOutboundDate(e.target.value)} />
                            <TimeInput label="Departure Time" value={outboundTime} onChange={setOutboundTime} />
                        </div>
                        {transportStructure === 'Round Trip' && (
                            <div className="p-3 rounded-2xl bg-primary-500/5 border border-primary-500/15 space-y-2">
                                <span className="text-2xs font-bold uppercase tracking-wider text-primary-600 dark:text-primary-400 block">
                                    Return Train Leg
                                </span>
                                <div className="grid grid-cols-2 gap-2">
                                    <Input label="Return Date" type="date" value={returnDate || endDate} min={outboundDate || startDate} onChange={e => setReturnDate(e.target.value)} />
                                    <TimeInput label="Return Time" value={returnTime} onChange={setReturnTime} />
                                </div>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                            <Input label="Coach & Seat" placeholder="e.g. Coach 4, Seat 21" value={seatInfo} onChange={e => setSeatInfo(e.target.value)} />
                            <Input label="Total Cost" type="number" placeholder="0.00" value={outboundCost} onChange={e => setOutboundCost(e.target.value)} />
                        </div>
                    </div>
                );

            case 'Bus':
                return (
                    <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <Autocomplete 
                                label="Departure Station / Stop *" 
                                placeholder="e.g. Victoria Coach Station" 
                                value={outboundOrigin} 
                                onChange={setOutboundOrigin} 
                                fetchSuggestions={fetchBusStationSuggestions} 
                            />
                            <Autocomplete 
                                label="Arrival Station / Stop *" 
                                placeholder="e.g. Paris Bercy Seine" 
                                value={outboundDest || destination} 
                                onChange={setOutboundDest} 
                                fetchSuggestions={fetchBusStationSuggestions} 
                            />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <Input 
                                label="Bus Operator" 
                                placeholder="e.g. FlixBus, Greyhound" 
                                value={outboundCarrier} 
                                onChange={e => setOutboundCarrier(e.target.value)} 
                            />
                            <Input 
                                label="Line / Route #" 
                                placeholder="e.g. Bus 401" 
                                value={outboundNumber} 
                                onChange={e => setOutboundNumber(e.target.value)} 
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <Input label="Departure Date" type="date" value={outboundDate || startDate} onChange={e => setOutboundDate(e.target.value)} />
                            <TimeInput label="Departure Time" value={outboundTime} onChange={setOutboundTime} />
                        </div>
                        {transportStructure === 'Round Trip' && (
                            <div className="p-3 rounded-2xl bg-primary-500/5 border border-primary-500/15 space-y-2">
                                <span className="text-2xs font-bold uppercase tracking-wider text-primary-600 dark:text-primary-400 block">
                                    Return Bus Leg
                                </span>
                                <div className="grid grid-cols-2 gap-2">
                                    <Input label="Return Date" type="date" value={returnDate || endDate} min={outboundDate || startDate} onChange={e => setReturnDate(e.target.value)} />
                                    <TimeInput label="Return Time" value={returnTime} onChange={setReturnTime} />
                                </div>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                            <Input label="Total Cost" type="number" placeholder="0.00" value={outboundCost} onChange={e => setOutboundCost(e.target.value)} />
                            <Input label="Booking Ref" placeholder="FLX-992" value={outboundConfCode} onChange={e => setOutboundConfCode(e.target.value)} />
                        </div>
                    </div>
                );

            case 'Car Rental':
                return (
                    <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <Autocomplete 
                                label="Pickup Location *" 
                                placeholder="e.g. Milan Malpensa Airport" 
                                value={outboundOrigin} 
                                onChange={setOutboundOrigin} 
                                fetchSuggestions={fetchLocationSuggestions} 
                            />
                            <Autocomplete 
                                label="Drop-off Location *" 
                                placeholder="e.g. Milan Central Station" 
                                value={outboundDest || destination} 
                                onChange={setOutboundDest} 
                                fetchSuggestions={fetchLocationSuggestions} 
                            />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <Input 
                                label="Rental Agency" 
                                placeholder="e.g. Hertz, Avis, Sixt" 
                                value={outboundCarrier} 
                                onChange={e => setOutboundCarrier(e.target.value)} 
                            />
                            <Input 
                                label="Vehicle Model / Category" 
                                placeholder="e.g. Compact SUV / Audi A4" 
                                value={vehicleModel} 
                                onChange={e => setVehicleModel(e.target.value)} 
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <Input label="Pickup Date" type="date" value={outboundDate || startDate} onChange={e => setOutboundDate(e.target.value)} />
                            <TimeInput label="Pickup Time" value={outboundTime} onChange={setOutboundTime} />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <Input label="Drop-off Date" type="date" value={returnDate || endDate} min={outboundDate || startDate} onChange={e => setReturnDate(e.target.value)} />
                            <TimeInput label="Drop-off Time" value={returnTime} onChange={setReturnTime} />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <Input label="Total Rental Cost" type="number" placeholder="0.00" value={outboundCost} onChange={e => setOutboundCost(e.target.value)} />
                            <Input label="Confirmation Code" placeholder="HTZ-881" value={outboundConfCode} onChange={e => setOutboundConfCode(e.target.value)} />
                        </div>
                    </div>
                );

            case 'Personal Car':
                return (
                    <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <Autocomplete 
                                label="Starting Point (Origin) *" 
                                placeholder="e.g. Home, Munich" 
                                value={outboundOrigin} 
                                onChange={setOutboundOrigin} 
                                fetchSuggestions={fetchLocationSuggestions} 
                            />
                            <Autocomplete 
                                label="Destination *" 
                                placeholder="e.g. Dolomites, Italy" 
                                value={outboundDest || destination} 
                                onChange={setOutboundDest} 
                                fetchSuggestions={fetchLocationSuggestions} 
                            />
                        </div>
                        <Input 
                            label="Vehicle / Route Notes" 
                            placeholder="e.g. Tesla Model 3 / Brenner Pass Highway" 
                            value={vehicleModel} 
                            onChange={e => setVehicleModel(e.target.value)} 
                        />
                        <div className="grid grid-cols-2 gap-2">
                            <Input label="Departure Date" type="date" value={outboundDate || startDate} onChange={e => setOutboundDate(e.target.value)} />
                            <TimeInput label="Departure Time" value={outboundTime} onChange={setOutboundTime} />
                        </div>
                        <Input label="Estimated Fuel & Tolls Cost" type="number" placeholder="0.00" value={outboundCost} onChange={e => setOutboundCost(e.target.value)} />
                    </div>
                );

            case 'Cruise':
            case 'Ferry':
            default:
                return (
                    <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <Autocomplete 
                                label="Departure Port *" 
                                placeholder="e.g. Port of Piraeus, Athens" 
                                value={outboundOrigin} 
                                onChange={setOutboundOrigin} 
                                fetchSuggestions={fetchLocationSuggestions} 
                            />
                            <Autocomplete 
                                label="Arrival Port *" 
                                placeholder="e.g. Mykonos Port" 
                                value={outboundDest || destination} 
                                onChange={setOutboundDest} 
                                fetchSuggestions={fetchLocationSuggestions} 
                            />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <Input 
                                label="Ferry Operator / Line" 
                                placeholder="e.g. Blue Star Ferries, MSC" 
                                value={outboundCarrier} 
                                onChange={e => setOutboundCarrier(e.target.value)} 
                            />
                            <Input 
                                label="Vessel / Ship Name" 
                                placeholder="e.g. Blue Star Delos" 
                                value={outboundNumber} 
                                onChange={e => setOutboundNumber(e.target.value)} 
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <Input label="Departure Date" type="date" value={outboundDate || startDate} onChange={e => setOutboundDate(e.target.value)} />
                            <TimeInput label="Departure Time" value={outboundTime} onChange={setOutboundTime} />
                        </div>
                        {transportStructure === 'Round Trip' && (
                            <div className="p-3 rounded-2xl bg-primary-500/5 border border-primary-500/15 space-y-2">
                                <span className="text-2xs font-bold uppercase tracking-wider text-primary-600 dark:text-primary-400 block">
                                    Return Voyage Leg
                                </span>
                                <div className="grid grid-cols-2 gap-2">
                                    <Input label="Return Date" type="date" value={returnDate || endDate} min={outboundDate || startDate} onChange={e => setReturnDate(e.target.value)} />
                                    <TimeInput label="Return Time" value={returnTime} onChange={setReturnTime} />
                                </div>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                            <Input label="Cabin / Deck" placeholder="e.g. Suite 402" value={seatInfo} onChange={e => setSeatInfo(e.target.value)} />
                            <Input label="Total Cost" type="number" placeholder="0.00" value={outboundCost} onChange={e => setOutboundCost(e.target.value)} />
                        </div>
                    </div>
                );
        }
    };

    // -------------------------------------------------------------
    // RENDER TRANSPORT STACK LIST (MULTIPLE TRANSPORTS)
    // -------------------------------------------------------------
    const renderTransportStackList = () => {
        if (transportsList.length === 0) return null;
        return (
            <div className="space-y-2 pt-2 border-t border-black/5 dark:border-white/5">
                <div className="flex items-center justify-between text-2xs font-bold uppercase tracking-wider text-light-text-secondary">
                    <span>Configured Legs ({transportsList.length})</span>
                    <span>Total: {formatCurrency(transportsList.reduce((sum, t) => sum + (t.cost || 0), 0))}</span>
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                    {transportsList.map((t, idx) => {
                        const modeConfig = TRANSPORT_MODES.find(m => m.mode === t.mode);
                        const IconComponent = modeConfig ? modeConfig.icon : AirplaneTilt;
                        return (
                            <div 
                                key={t.id || idx} 
                                className="p-3 rounded-2xl bg-white/90 dark:bg-dark-card/90 border border-black/5 dark:border-white/5 flex items-center justify-between shadow-xs gap-3 group"
                            >
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="w-8 h-8 rounded-xl bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center shrink-0">
                                        <IconComponent className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <span className="font-bold text-xs text-light-text dark:text-dark-text truncate">
                                                {t.origin} &rarr; {t.destination}
                                            </span>
                                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-black/5 dark:bg-white/5 text-light-text-secondary">
                                                {t.mode}
                                            </span>
                                        </div>
                                        <p className="text-2xs text-light-text-secondary truncate">
                                            {t.provider || 'Unspecified'} {t.identifier ? `• ${t.identifier}` : ''} • {formatDate(t.departureDate || '')}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    {t.cost !== undefined && t.cost > 0 && (
                                        <span className="font-mono font-bold text-xs text-light-text dark:text-dark-text">
                                            {formatCurrency(t.cost)}
                                        </span>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveTransport(idx)}
                                        className="w-7 h-7 rounded-lg flex items-center justify-center text-light-text-secondary hover:text-semantic-red hover:bg-semantic-red/10 transition-colors cursor-pointer"
                                        aria-label="Remove transport leg"
                                    >
                                        <Trash className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    // -------------------------------------------------------------
    // RENDER ACCOMMODATIONS STACK LIST (MULTIPLE ACCOMMODATIONS)
    // -------------------------------------------------------------
    const renderAccommodationStackList = () => {
        if (accommodationsList.length === 0) return null;
        return (
            <div className="space-y-2 pt-2 border-t border-black/5 dark:border-white/5">
                <div className="flex items-center justify-between text-2xs font-bold uppercase tracking-wider text-light-text-secondary">
                    <span>Configured Stays ({accommodationsList.length})</span>
                    <span>Total: {formatCurrency(accommodationsList.reduce((sum, a) => sum + (a.cost || 0), 0))}</span>
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                    {accommodationsList.map((a, idx) => (
                        <div 
                            key={a.id || idx} 
                            className="p-3 rounded-2xl bg-white/90 dark:bg-dark-card/90 border border-black/5 dark:border-white/5 flex items-center justify-between shadow-xs gap-3 group"
                        >
                            <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                                    <Bed className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <span className="font-bold text-xs text-light-text dark:text-dark-text truncate">
                                            {a.name}
                                        </span>
                                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-amber-500/10 text-amber-600 dark:text-amber-400">
                                            {a.type}
                                        </span>
                                    </div>
                                    <p className="text-2xs text-light-text-secondary truncate">
                                        {formatDateRange(a.checkInDate, a.checkOutDate)} • {a.address}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                {a.cost !== undefined && a.cost > 0 && (
                                    <span className="font-mono font-bold text-xs text-light-text dark:text-dark-text">
                                        {formatCurrency(a.cost)}
                                    </span>
                                )}
                                <button
                                    type="button"
                                    onClick={() => handleRemoveAccommodation(idx)}
                                    className="w-7 h-7 rounded-lg flex items-center justify-center text-light-text-secondary hover:text-semantic-red hover:bg-semantic-red/10 transition-colors cursor-pointer"
                                    aria-label="Remove accommodation"
                                >
                                    <Trash className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-modal overflow-hidden font-sans">
            {/* Backdrop */}
            <div 
                className="fixed inset-0 bg-gray-900/50 dark:bg-black/80 backdrop-blur-md transition-opacity duration-300"
                style={{ WebkitBackdropFilter: 'blur(12px)' }}
                onClick={onClose}
            />

            {/* In-Page Setup Board Container */}
            <div className="fixed inset-0 flex flex-col justify-between overflow-hidden bg-white/95 dark:bg-dark-card/95 backdrop-blur-md z-10">
                
                {/* Board Top Header */}
                <GlassPanel 
                    className="wg-glass-card rounded-none border-x-0 border-t-0 border-b border-black/10 dark:border-white/10 px-4 sm:px-8 py-4 flex items-center justify-between shrink-0 z-30"
                    overrides={{ borderRadius: 0 }}
                    padding="0px"
                >
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center shadow-sm">
                            <Compass className="w-6 h-6" weight="duotone" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-light-text dark:text-dark-text tracking-tight flex items-center gap-2">
                                <span>Expedition Setup Board</span>
                                <span className={STATUS_PILL_STYLE}>Onboarding</span>
                            </h2>
                            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary font-medium">
                                Staged itinerary builder with progressive sub-steps
                            </p>
                        </div>
                    </div>

                    <button 
                        type="button"
                        onClick={onClose}
                        className={CLOSE_BTN_STYLE}
                        aria-label="Close setup board"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </GlassPanel>

                {/* Mobile Segmented Stage Switcher (< 1024px) */}
                <div className="lg:hidden px-4 pt-3 pb-2 shrink-0 bg-white/50 dark:bg-dark-card/50 border-b border-black/5 dark:border-white/5">
                    <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar p-1 bg-black/5 dark:bg-white/5 rounded-2xl">
                        {STAGES.map((s, idx) => {
                            const IconC = s.icon;
                            const isActive = currentStage === s.key;
                            const isDone = idx < stageIndex;
                            return (
                                <button
                                    key={s.key}
                                    type="button"
                                    onClick={() => setCurrentStage(s.key)}
                                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider shrink-0 transition-all ${
                                        isActive
                                        ? 'bg-white dark:bg-dark-card text-primary-600 dark:text-primary-400 shadow-sm'
                                        : (isDone ? 'text-emerald-600 dark:text-emerald-400' : 'text-light-text-secondary opacity-60')
                                    }`}
                                >
                                    <IconC className="w-4 h-4" weight={isActive ? "duotone" : "regular"} />
                                    <span>{s.label.split('. ')[1]}</span>
                                    {isDone && <Check className="w-3.5 h-3.5 text-emerald-500" weight="bold" />}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Main Content Area: Responsive Bento Grid on Desktop, Single Active Panel on Mobile */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 custom-scrollbar">
                    
                    {/* Desktop: Bento Grid Board */}
                    <div className="hidden lg:grid lg:grid-cols-2 xl:grid-cols-4 gap-6 items-start">
                        
                        {/* ============================================================== */}
                        {/* COLUMN 1: TRIP BASICS */}
                        {/* ============================================================== */}
                        <GlassPanel 
                            className={`rounded-[28px] overflow-hidden flex flex-col transition-all duration-300 ${
                                currentStage === 'basics' 
                                ? 'wg-glass-card ring-2 ring-primary-500/40 shadow-xl shadow-primary-500/10' 
                                : 'wg-glass-card opacity-90 hover:opacity-100 shadow-xs'
                            }`}
                            overrides={{ borderRadius: 28 }}
                            padding="0px"
                        >
                            <div className="p-5 border-b border-black/5 dark:border-white/5 flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <Compass className="w-5 h-5 text-primary-500" weight="duotone" />
                                    <span className="text-xs font-bold uppercase tracking-wider text-light-text dark:text-dark-text">1. Trip Basics</span>
                                </div>
                                {stageIndex > 0 && (
                                    <button 
                                        type="button" 
                                        onClick={() => setCurrentStage('basics')} 
                                        className="text-primary-500 hover:underline text-2xs font-bold uppercase flex items-center gap-1 cursor-pointer"
                                    >
                                        <PencilSimple className="w-3.5 h-3.5" /> Edit
                                    </button>
                                )}
                            </div>

                            <div className="p-5 flex-1 space-y-4 overflow-y-auto custom-scrollbar">
                                {stageIndex > 0 && currentStage !== 'basics' ? (
                                    <div className="space-y-3">
                                        <div className="p-4 rounded-2xl bg-white/80 dark:bg-dark-card/80 border border-black/5 dark:border-white/5 space-y-2">
                                            <h4 className="font-black text-base text-light-text dark:text-dark-text">{title}</h4>
                                            <p className="text-xs text-light-text-secondary flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {destination}</p>
                                            <p className="text-xs text-light-text-secondary flex items-center gap-1"><CalendarBlank className="w-3.5 h-3.5" /> {formatDateRange(startDate, endDate)}</p>
                                            <span className="px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 inline-block">
                                                Configured
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {basicsError && (
                                            <p className="text-xs font-semibold text-semantic-red p-2 bg-semantic-red/10 rounded-xl">{basicsError}</p>
                                        )}
                                        <div className="space-y-1">
                                            <label className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary">Expedition Title *</label>
                                            <Input 
                                                placeholder="e.g. Greek Island Odyssey" 
                                                value={title} 
                                                onChange={e => setTitle(e.target.value)} 
                                                className="!font-bold"
                                                autoFocus
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary">Destination City *</label>
                                            <Autocomplete 
                                                placeholder="e.g. Santorini, Greece" 
                                                value={destination} 
                                                onChange={handleDestinationChange} 
                                                fetchSuggestions={fetchLocationSuggestions} 
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <Input label="Start Date *" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                                            <Input label="End Date *" type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} />
                                        </div>
                                        <div className="pt-2">
                                            <button 
                                                type="button" 
                                                onClick={handleCompleteBasics}
                                                className={`${BTN_PRIMARY_STYLE} w-full h-11 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-md cursor-pointer`}
                                            >
                                                <span>Confirm Basics</span>
                                                <ArrowRight className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </GlassPanel>

                        {/* ============================================================== */}
                        {/* COLUMN 2: TRANSPORT LOGISTICS */}
                        {/* ============================================================== */}
                        <GlassPanel 
                            className={`rounded-[28px] overflow-hidden flex flex-col transition-all duration-300 ${
                                currentStage === 'transport' 
                                ? 'wg-glass-card ring-2 ring-primary-500/40 shadow-xl shadow-primary-500/10' 
                                : 'wg-glass-card opacity-90 hover:opacity-100 shadow-xs'
                            }`}
                            overrides={{ borderRadius: 28 }}
                            padding="0px"
                        >
                            <div className="p-5 border-b border-black/5 dark:border-white/5 flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <AirplaneTilt className="w-5 h-5 text-blue-500" weight="duotone" />
                                    <span className="text-xs font-bold uppercase tracking-wider text-light-text dark:text-dark-text">2. Transport</span>
                                </div>
                                <span className="text-2xs font-bold text-light-text-secondary">{transportsList.length} Legs</span>
                            </div>

                            <div className="p-5 flex-1 space-y-4 overflow-y-auto custom-scrollbar">
                                {/* Sub-step 2a: Method Picker */}
                                <div className="space-y-1.5">
                                    <label className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary">Sub-step 2a: Method</label>
                                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                                        {TRANSPORT_MODES.map(m => {
                                            const IconM = m.icon;
                                            const isSel = transportMode === m.mode || (m.mode === 'Cruise' && transportMode === 'Ferry');
                                            return (
                                                <button
                                                    key={m.mode}
                                                    type="button"
                                                    onClick={() => setTransportMode(m.mode)}
                                                    className={`p-2 rounded-xl flex flex-col items-center justify-center text-center transition-all min-h-[50px] cursor-pointer ${
                                                        isSel 
                                                        ? 'bg-white dark:bg-dark-card text-primary-600 dark:text-primary-400 shadow-sm border border-primary-500/30 font-bold' 
                                                        : 'bg-black/5 dark:bg-white/5 text-light-text-secondary hover:text-light-text'
                                                    }`}
                                                >
                                                    <IconM className="w-4 h-4 mb-0.5" weight={isSel ? "duotone" : "regular"} />
                                                    <span className="text-[10px] font-semibold uppercase tracking-tight leading-tight">{m.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Sub-step 2b: Routing Structure */}
                                {transportMode !== 'Car Rental' && transportMode !== 'Personal Car' && (
                                    <div className="space-y-1.5">
                                        <label className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary">Routing Structure</label>
                                        <div className="flex gap-1.5">
                                            {(['Round Trip', 'One-Way'] as const).map(struct => (
                                                <button
                                                    key={struct}
                                                    type="button"
                                                    onClick={() => setTransportStructure(struct)}
                                                    className={`flex-1 py-1.5 rounded-xl text-2xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                                                        transportStructure === struct 
                                                        ? 'bg-white dark:bg-dark-card text-primary-600 dark:text-primary-400 shadow-sm border border-primary-500/30' 
                                                        : 'bg-black/5 dark:bg-white/5 text-light-text-secondary'
                                                    }`}
                                                >
                                                    {struct}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Sub-step 2c: Mode-Specific Input Fields */}
                                <div className="space-y-2 p-3 rounded-2xl bg-white/70 dark:bg-dark-card/70 border border-black/5 dark:border-white/5">
                                    <span className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary block">
                                        {transportMode} Logistics
                                    </span>
                                    {renderTransportFields()}
                                </div>

                                {/* Sub-step 2d: Action to add transport & multiple legs stack */}
                                <div className="space-y-2 pt-1">
                                    <button 
                                        type="button" 
                                        onClick={handleCommitTransport}
                                        className={`${BTN_SECONDARY_STYLE} w-full h-10 text-2xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer`}
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                        <span>+ Add This Transport Leg</span>
                                    </button>

                                    {/* Render multiple added transports */}
                                    {renderTransportStackList()}

                                    <div className="flex gap-2 pt-2">
                                        <button 
                                            type="button"
                                            onClick={() => setCurrentStage('accommodation')}
                                            className="px-3 h-11 text-2xs text-light-text-secondary hover:text-light-text font-bold uppercase transition-colors cursor-pointer"
                                        >
                                            Skip
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={() => {
                                                if (outboundOrigin && transportsList.length === 0) {
                                                    handleCommitTransport();
                                                }
                                                setCurrentStage('accommodation');
                                            }}
                                            className={`${BTN_PRIMARY_STYLE} flex-1 h-11 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer`}
                                        >
                                            <span>Proceed to Stay</span>
                                            <ArrowRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </GlassPanel>

                        {/* ============================================================== */}
                        {/* COLUMN 3: ACCOMMODATIONS & STAYS */}
                        {/* ============================================================== */}
                        <GlassPanel 
                            className={`rounded-[28px] overflow-hidden flex flex-col transition-all duration-300 ${
                                currentStage === 'accommodation' 
                                ? 'wg-glass-card ring-2 ring-primary-500/40 shadow-xl shadow-primary-500/10' 
                                : 'wg-glass-card opacity-90 hover:opacity-100 shadow-xs'
                            }`}
                            overrides={{ borderRadius: 28 }}
                            padding="0px"
                        >
                            <div className="p-5 border-b border-black/5 dark:border-white/5 flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <Bed className="w-5 h-5 text-amber-500" weight="duotone" />
                                    <span className="text-xs font-bold uppercase tracking-wider text-light-text dark:text-dark-text">3. Accommodations</span>
                                </div>
                                <span className="text-2xs font-bold text-light-text-secondary">{accommodationsList.length} Stays</span>
                            </div>

                            <div className="p-5 flex-1 space-y-4 overflow-y-auto custom-scrollbar">
                                {/* Sub-step 3a: Type Selection */}
                                <div className="space-y-1.5">
                                    <label className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary">Stay Type</label>
                                    <div className="grid grid-cols-4 gap-1.5">
                                        {ACCOMMODATION_TYPES.map(t => (
                                            <button
                                                key={t}
                                                type="button"
                                                onClick={() => setAccType(t)}
                                                className={`py-1.5 px-1 rounded-xl text-center text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer truncate ${
                                                    accType === t
                                                    ? 'bg-white dark:bg-dark-card text-amber-600 dark:text-amber-400 shadow-sm border border-amber-500/30'
                                                    : 'bg-black/5 dark:bg-white/5 text-light-text-secondary'
                                                }`}
                                                title={t}
                                            >
                                                {t}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Sub-step 3b: Property Name & Google Maps Address Lookup */}
                                <div className="space-y-2.5 p-3 rounded-2xl bg-white/70 dark:bg-dark-card/70 border border-black/5 dark:border-white/5">
                                    <Input 
                                        label="Property Name *" 
                                        placeholder="e.g. Grand Hotel Tremezzo or Villa Bellagio" 
                                        value={accName} 
                                        onChange={e => setAccName(e.target.value)} 
                                    />
                                    
                                    <div className="space-y-1">
                                        <div className="flex items-center justify-between">
                                            <label className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary flex items-center gap-1">
                                                <MapPin className="w-3.5 h-3.5 text-primary-500" />
                                                <span>Address / Google Maps Location</span>
                                            </label>
                                            <span className="text-[10px] text-primary-500 font-semibold">Live Lookup</span>
                                        </div>
                                        <Autocomplete 
                                            placeholder="Street address, hotel name, or paste Google Maps link..." 
                                            value={accAddress} 
                                            onChange={handleAddressChange} 
                                            fetchSuggestions={fetchAddressSuggestions} 
                                        />
                                    </div>

                                    {/* Check-In / Check-Out with Nights Badge */}
                                    <div className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <label className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary">Dates & Duration</label>
                                            {activeAccNights > 0 && (
                                                <span className="px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                                    {activeAccNights} {activeAccNights === 1 ? 'Night' : 'Nights'}
                                                </span>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <Input label="Check In" type="date" value={accCheckIn || startDate} onChange={e => setAccCheckIn(e.target.value)} />
                                            <Input label="Check Out" type="date" value={accCheckOut || endDate} min={accCheckIn || startDate} onChange={e => setAccCheckOut(e.target.value)} />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                        <Input label="Total Cost" type="number" placeholder="0.00" value={accCost} onChange={e => setAccCost(e.target.value)} />
                                        <Input label="Booking Ref / PNR" placeholder="HTL-882" value={accRef} onChange={e => setAccRef(e.target.value)} />
                                    </div>
                                </div>

                                {/* Sub-step 3c: Stacking & Multiple Stays list */}
                                <div className="space-y-2 pt-1">
                                    <button 
                                        type="button" 
                                        onClick={handleCommitAccommodation}
                                        className={`${BTN_SECONDARY_STYLE} w-full h-10 text-2xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer`}
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                        <span>+ Add This Stay</span>
                                    </button>

                                    {/* Render multiple added accommodations */}
                                    {renderAccommodationStackList()}

                                    <div className="flex gap-2 pt-2">
                                        <button 
                                            type="button"
                                            onClick={() => setCurrentStage('review')}
                                            className="px-3 h-11 text-2xs text-light-text-secondary hover:text-light-text font-bold uppercase transition-colors cursor-pointer"
                                        >
                                            Skip
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={() => {
                                                if (accName && accommodationsList.length === 0) {
                                                    handleCommitAccommodation();
                                                }
                                                setCurrentStage('review');
                                            }}
                                            className={`${BTN_PRIMARY_STYLE} flex-1 h-11 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer`}
                                        >
                                            <span>Proceed to Review</span>
                                            <ArrowRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </GlassPanel>

                        {/* ============================================================== */}
                        {/* COLUMN 4: REVIEW & FINALIZE */}
                        {/* ============================================================== */}
                        <GlassPanel 
                            className={`rounded-[28px] overflow-hidden flex flex-col transition-all duration-300 ${
                                currentStage === 'review' 
                                ? 'wg-glass-card ring-2 ring-primary-500/40 shadow-xl shadow-primary-500/10' 
                                : 'wg-glass-card opacity-90 hover:opacity-100 shadow-xs'
                            }`}
                            overrides={{ borderRadius: 28 }}
                            padding="0px"
                        >
                            <div className="p-5 border-b border-black/5 dark:border-white/5 flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <CheckCircle className="w-5 h-5 text-primary-500" weight="duotone" />
                                    <span className="text-xs font-bold uppercase tracking-wider text-light-text dark:text-dark-text">4. Finalize</span>
                                </div>
                                <span className={STATUS_PILL_STYLE}>Ready</span>
                            </div>

                            <div className="p-5 flex-1 space-y-4 overflow-y-auto custom-scrollbar flex flex-col justify-between">
                                <div className="space-y-3">
                                    <div className="p-4 rounded-2xl bg-white/80 dark:bg-dark-card/80 border border-black/5 dark:border-white/5 space-y-2">
                                        <h4 className="font-black text-lg text-light-text dark:text-dark-text">{title || 'Untitled Trip'}</h4>
                                        <p className="text-xs text-light-text-secondary flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-primary-500" /> {destination || 'Destination'}</p>
                                        <p className="text-xs text-light-text-secondary flex items-center gap-1"><CalendarBlank className="w-3.5 h-3.5 text-primary-500" /> {formatDateRange(startDate, endDate)}</p>
                                    </div>

                                    <div className="p-4 rounded-2xl bg-white/60 dark:bg-dark-card/60 border border-black/5 dark:border-white/5 space-y-2 text-xs">
                                        <div className="flex justify-between items-center py-1 border-b border-black/5 dark:border-white/5">
                                            <span className="text-light-text-secondary font-medium">Transport Legs</span>
                                            <span className="font-bold">{transportsList.length}</span>
                                        </div>
                                        <div className="flex justify-between items-center py-1">
                                            <span className="text-light-text-secondary font-medium">Stays Booked</span>
                                            <span className="font-bold">{accommodationsList.length}</span>
                                        </div>
                                    </div>

                                    {/* Mini summary lists */}
                                    {transportsList.length > 0 && (
                                        <div className="space-y-1">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-light-text-secondary block">Transports</span>
                                            {transportsList.map((t, i) => (
                                                <div key={i} className="text-2xs text-light-text-secondary flex justify-between py-0.5">
                                                    <span className="truncate">{t.mode}: {t.origin} &rarr; {t.destination}</span>
                                                    {t.cost && <span className="font-mono font-bold">{formatCurrency(t.cost)}</span>}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {accommodationsList.length > 0 && (
                                        <div className="space-y-1">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-light-text-secondary block">Accommodations</span>
                                            {accommodationsList.map((a, i) => (
                                                <div key={i} className="text-2xs text-light-text-secondary flex justify-between py-0.5">
                                                    <span className="truncate">{a.name} ({a.type})</span>
                                                    {a.cost && <span className="font-mono font-bold">{formatCurrency(a.cost)}</span>}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="pt-4">
                                    <button 
                                        type="button" 
                                        onClick={handleFinalizeTrip}
                                        disabled={isSaving || !title || !startDate || !endDate}
                                        className={`${BTN_PRIMARY_STYLE} w-full h-12 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-primary-500/20 active:scale-95 disabled:opacity-50 cursor-pointer`}
                                    >
                                        <span>{isSaving ? 'Creating Expedition...' : 'Launch Expedition Planner'}</span>
                                        <Check className="w-4 h-4" weight="bold" />
                                    </button>
                                </div>
                            </div>
                        </GlassPanel>

                    </div>

                    {/* Mobile (< 1024px): Single-Column Active Stage View */}
                    <div className="lg:hidden w-full max-w-lg mx-auto space-y-6">
                        {currentStage === 'basics' && (
                            <GlassPanel 
                                className="wg-glass-card rounded-[28px] overflow-hidden p-6 space-y-4"
                                overrides={{ borderRadius: 28 }}
                                padding="0px"
                            >
                                <h3 className="text-base font-bold text-light-text dark:text-dark-text flex items-center gap-2">
                                    <Compass className="w-5 h-5 text-primary-500" weight="duotone" />
                                    <span>Step 1: Trip Basics & Destination</span>
                                </h3>
                                {basicsError && <p className="text-xs font-semibold text-semantic-red p-2 bg-semantic-red/10 rounded-xl">{basicsError}</p>}
                                <Input label="Expedition Title *" placeholder="e.g. Italian Lakes & Alps" value={title} onChange={e => setTitle(e.target.value)} />
                                <Autocomplete label="Destination *" placeholder="e.g. Lake Como, Italy" value={destination} onChange={handleDestinationChange} fetchSuggestions={fetchLocationSuggestions} />
                                <div className="grid grid-cols-2 gap-3">
                                    <Input label="Start Date *" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                                    <Input label="End Date *" type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} />
                                </div>
                                <button type="button" onClick={handleCompleteBasics} className={`${BTN_PRIMARY_STYLE} w-full h-12 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer`}>
                                    <span>Next: Configure Transport</span>
                                    <ArrowRight className="w-4 h-4" />
                                </button>
                            </GlassPanel>
                        )}

                        {currentStage === 'transport' && (
                            <GlassPanel 
                                className="wg-glass-card rounded-[28px] overflow-hidden p-6 space-y-4"
                                overrides={{ borderRadius: 28 }}
                                padding="0px"
                            >
                                <h3 className="text-base font-bold text-light-text dark:text-dark-text flex items-center gap-2">
                                    <AirplaneTilt className="w-5 h-5 text-blue-500" weight="duotone" />
                                    <span>Step 2: Transport Logistics</span>
                                </h3>
                                
                                {/* Method Selector */}
                                <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                                    {TRANSPORT_MODES.map(m => {
                                        const IconM = m.icon;
                                        const isSel = transportMode === m.mode || (m.mode === 'Cruise' && transportMode === 'Ferry');
                                        return (
                                            <button
                                                key={m.mode}
                                                type="button"
                                                onClick={() => setTransportMode(m.mode)}
                                                className={`p-2 rounded-xl flex flex-col items-center justify-center text-center transition-all cursor-pointer ${
                                                    isSel ? 'bg-white dark:bg-dark-card text-primary-500 shadow-sm border border-primary-500/30 font-bold' : 'bg-black/5 dark:bg-white/5 text-light-text-secondary'
                                                }`}
                                            >
                                                <IconM className="w-5 h-5 mb-1" />
                                                <span className="text-[10px] font-semibold uppercase tracking-tight leading-tight">{m.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>

                                {transportMode !== 'Car Rental' && transportMode !== 'Personal Car' && (
                                    <div className="flex gap-1.5">
                                        {(['Round Trip', 'One-Way'] as const).map(struct => (
                                            <button
                                                key={struct}
                                                type="button"
                                                onClick={() => setTransportStructure(struct)}
                                                className={`flex-1 py-1.5 rounded-xl text-2xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                                                    transportStructure === struct 
                                                    ? 'bg-white dark:bg-dark-card text-primary-600 dark:text-primary-400 shadow-sm border border-primary-500/30' 
                                                    : 'bg-black/5 dark:bg-white/5 text-light-text-secondary'
                                                }`}
                                            >
                                                {struct}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {/* Mode-Specific Fields */}
                                <div className="p-3 rounded-2xl bg-white/70 dark:bg-dark-card/70 border border-black/5 dark:border-white/5">
                                    {renderTransportFields()}
                                </div>

                                {/* Add Leg Button */}
                                <button 
                                    type="button" 
                                    onClick={handleCommitTransport}
                                    className={`${BTN_SECONDARY_STYLE} w-full h-11 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer`}
                                >
                                    <Plus className="w-4 h-4" />
                                    <span>+ Add This Transport Leg</span>
                                </button>

                                {/* Multiple Added Transports Stack */}
                                {renderTransportStackList()}

                                <div className="flex gap-2 pt-2">
                                    <button type="button" onClick={() => setCurrentStage('accommodation')} className="px-4 h-12 text-xs font-bold uppercase text-light-text-secondary cursor-pointer">Skip</button>
                                    <button 
                                        type="button" 
                                        onClick={() => { 
                                            if (outboundOrigin && transportsList.length === 0) {
                                                handleCommitTransport();
                                            }
                                            setCurrentStage('accommodation'); 
                                        }} 
                                        className={`${BTN_PRIMARY_STYLE} flex-1 h-12 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer`}
                                    >
                                        <span>Next: Stays</span>
                                        <ArrowRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </GlassPanel>
                        )}

                        {currentStage === 'accommodation' && (
                            <GlassPanel 
                                className="wg-glass-card rounded-[28px] overflow-hidden p-6 space-y-4"
                                overrides={{ borderRadius: 28 }}
                                padding="0px"
                            >
                                <h3 className="text-base font-bold text-light-text dark:text-dark-text flex items-center gap-2">
                                    <Bed className="w-5 h-5 text-amber-500" weight="duotone" />
                                    <span>Step 3: Accommodations</span>
                                </h3>
                                
                                {/* Stay Type */}
                                <div className="grid grid-cols-4 gap-1.5">
                                    {ACCOMMODATION_TYPES.map(t => (
                                        <button 
                                            key={t} 
                                            type="button" 
                                            onClick={() => setAccType(t)} 
                                            className={`py-2 px-1 rounded-xl text-center text-2xs font-bold uppercase truncate cursor-pointer ${
                                                accType === t ? 'bg-white dark:bg-dark-card text-amber-600 dark:text-amber-400 shadow-sm border border-amber-500/30' : 'bg-black/5 dark:bg-white/5 text-light-text-secondary'
                                            }`}
                                        >
                                            {t}
                                        </button>
                                    ))}
                                </div>

                                <Input label="Property Name *" placeholder="e.g. Grand Hotel Tremezzo" value={accName} onChange={e => setAccName(e.target.value)} />
                                
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between">
                                        <label className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary flex items-center gap-1">
                                            <MapPin className="w-3.5 h-3.5 text-primary-500" />
                                            <span>Address / Google Maps Location</span>
                                        </label>
                                        <span className="text-[10px] text-primary-500 font-semibold">Live Lookup</span>
                                    </div>
                                    <Autocomplete 
                                        placeholder="Street address, hotel name, or paste Google Maps link..." 
                                        value={accAddress} 
                                        onChange={handleAddressChange} 
                                        fetchSuggestions={fetchAddressSuggestions} 
                                    />
                                </div>

                                <div className="space-y-1">
                                    <div className="flex items-center justify-between">
                                        <label className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary">Dates & Duration</label>
                                        {activeAccNights > 0 && (
                                            <span className="px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                                {activeAccNights} {activeAccNights === 1 ? 'Night' : 'Nights'}
                                            </span>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <Input label="Check In" type="date" value={accCheckIn || startDate} onChange={e => setAccCheckIn(e.target.value)} />
                                        <Input label="Check Out" type="date" value={accCheckOut || endDate} min={accCheckIn || startDate} onChange={e => setAccCheckOut(e.target.value)} />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <Input label="Total Cost" type="number" placeholder="0.00" value={accCost} onChange={e => setAccCost(e.target.value)} />
                                    <Input label="Booking Ref / PNR" placeholder="HTL-882" value={accRef} onChange={e => setAccRef(e.target.value)} />
                                </div>

                                {/* Add Stay Button */}
                                <button 
                                    type="button" 
                                    onClick={handleCommitAccommodation}
                                    className={`${BTN_SECONDARY_STYLE} w-full h-11 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer`}
                                >
                                    <Plus className="w-4 h-4" />
                                    <span>+ Add This Stay</span>
                                </button>

                                {/* Multiple Added Stays Stack */}
                                {renderAccommodationStackList()}

                                <div className="flex gap-2 pt-2">
                                    <button type="button" onClick={() => setCurrentStage('review')} className="px-4 h-12 text-xs font-bold uppercase text-light-text-secondary cursor-pointer">Skip</button>
                                    <button 
                                        type="button" 
                                        onClick={() => { 
                                            if (accName && accommodationsList.length === 0) {
                                                handleCommitAccommodation();
                                            }
                                            setCurrentStage('review'); 
                                        }} 
                                        className={`${BTN_PRIMARY_STYLE} flex-1 h-12 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer`}
                                    >
                                        <span>Next: Review</span>
                                        <ArrowRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </GlassPanel>
                        )}

                        {currentStage === 'review' && (
                            <GlassPanel 
                                className="wg-glass-card rounded-[28px] overflow-hidden p-6 space-y-4"
                                overrides={{ borderRadius: 28 }}
                                padding="0px"
                            >
                                <h3 className="text-base font-bold text-light-text dark:text-dark-text flex items-center gap-2">
                                    <CheckCircle className="w-5 h-5 text-primary-500" weight="duotone" />
                                    <span>Step 4: Review & Launch</span>
                                </h3>
                                <div className="p-4 rounded-2xl bg-white dark:bg-dark-card space-y-2 border border-black/5">
                                    <h4 className="font-bold text-lg">{title}</h4>
                                    <p className="text-xs text-light-text-secondary">{destination} • {formatDateRange(startDate, endDate)}</p>
                                    <div className="pt-2 text-xs text-light-text-secondary flex gap-3">
                                        <span>{transportsList.length} Transports</span>
                                        <span>•</span>
                                        <span>{accommodationsList.length} Stays</span>
                                    </div>
                                </div>
                                <button type="button" onClick={handleFinalizeTrip} disabled={isSaving} className={`${BTN_PRIMARY_STYLE} w-full h-12 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-primary-500/20 cursor-pointer`}>
                                    <span>{isSaving ? 'Creating Expedition...' : 'Launch Expedition'}</span>
                                    <Check className="w-4 h-4" weight="bold" />
                                </button>
                            </GlassPanel>
                        )}
                    </div>

                </div>

            </div>
        </div>,
        document.body
    );
};

export default TripSetupBoard;
