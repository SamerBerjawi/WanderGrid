import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
    Compass, 
    MapTrifold,
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
    Tag,
    Path
} from '@phosphor-icons/react';
import { Input, Autocomplete, TimeInput, Select } from './ui';
import GlassPanel from './glass/GlassPanel';
import GlassButton from './glass/GlassButton';
import { Trip, Transport, Accommodation, TransportMode, User, GeoCoordinates, WorkspaceSettings } from '../types';
import { dataService } from '../services/mockDb';
import { invalidateGlobalWanderCache, useWanderSync } from '../hooks/useWanderSync';
import { searchLocations, searchStations, getCoordinates } from '../services/geocoding';
import { parseGoogleMapsUrl } from '../services/locationParser';
import { getAirportsByQueryLocally, getCarriersByQueryLocally, AIRLINE_CODES, formatCommercialAirlineName } from '../utils/flightData';
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

type StageKey = 'basics' | 'transport' | 'accommodation';

const STAGES: { key: StageKey; label: string; icon: React.ElementType }[] = [
    { key: 'basics', label: '1. Trip Basics', icon: Compass },
    { key: 'transport', label: '2. Transport', icon: AirplaneTilt },
    { key: 'accommodation', label: '3. Stays', icon: Bed },
];

const STAGE_THEMES: Record<StageKey, {
    label: string;
    icon: React.ElementType;
    color: string;
    activeText: string;
    activeBg: string;
    activeBorder: string;
    activeShadow: string;
    badgeStyle: string;
}> = {
    basics: {
        label: 'Trip Basics',
        icon: Compass,
        color: 'text-emerald-500 dark:text-emerald-400',
        activeText: 'text-emerald-700 dark:text-emerald-300',
        activeBg: 'bg-emerald-500/15 dark:bg-emerald-500/25',
        activeBorder: 'border-emerald-500/35 dark:border-emerald-400/45',
        activeShadow: 'shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(16,185,129,0.15)]',
        badgeStyle: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
    },
    transport: {
        label: 'Transports',
        icon: AirplaneTilt,
        color: 'text-sky-500 dark:text-sky-400',
        activeText: 'text-sky-700 dark:text-sky-300',
        activeBg: 'bg-sky-500/15 dark:bg-sky-500/25',
        activeBorder: 'border-sky-500/35 dark:border-sky-400/45',
        activeShadow: 'shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(14,165,233,0.15)]',
        badgeStyle: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20'
    },
    accommodation: {
        label: 'Stays',
        icon: Bed,
        color: 'text-amber-500 dark:text-amber-400',
        activeText: 'text-amber-700 dark:text-amber-300',
        activeBg: 'bg-amber-500/15 dark:bg-amber-500/25',
        activeBorder: 'border-amber-500/35 dark:border-amber-400/45',
        activeShadow: 'shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(245,158,11,0.15)]',
        badgeStyle: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
    }
};

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
    { label: 'First Class', value: 'First Class' }
];

export const AIRLINE_DOMAINS: Record<string, string> = {
    'delta': 'delta.com', 'delta air lines': 'delta.com', 'dl': 'delta.com',
    'american': 'aa.com', 'american airlines': 'aa.com', 'aa': 'aa.com',
    'united': 'united.com', 'united airlines': 'united.com', 'ua': 'united.com',
    'southwest': 'southwest.com', 'southwest airlines': 'southwest.com', 'wn': 'southwest.com',
    'british airways': 'britishairways.com', 'ba': 'britishairways.com',
    'air france': 'airfrance.com', 'af': 'airfrance.com',
    'lufthansa': 'lufthansa.com', 'lh': 'lufthansa.com',
    'emirates': 'emirates.com', 'ek': 'emirates.com',
    'qatar airways': 'qatarairways.com', 'qr': 'qatarairways.com',
    'singapore airlines': 'singaporeair.com', 'sq': 'singaporeair.com',
    'cathay pacific': 'cathaypacific.com', 'cx': 'cathaypacific.com',
    'klm': 'klm.com', 'kl': 'klm.com',
    'ryanair': 'ryanair.com', 'fr': 'ryanair.com',
    'easyjet': 'easyjet.com', 'u2': 'easyjet.com',
    'jetblue': 'jetblue.com', 'b6': 'jetblue.com',
    'alaska airlines': 'alaskaair.com', 'as': 'alaskaair.com',
    'spirit airlines': 'spirit.com', 'nk': 'spirit.com',
    'frontier airlines': 'flyfrontier.com', 'f9': 'flyfrontier.com',
    'turkish airlines': 'turkishairlines.com', 'tk': 'turkishairlines.com',
    'etihad airways': 'etihad.com', 'ey': 'etihad.com',
    'virgin atlantic': 'virginatlantic.com', 'vs': 'virginatlantic.com',
    'air canada': 'aircanada.com', 'ac': 'aircanada.com',
    'japan airlines': 'jal.com', 'jl': 'jal.com',
    'all nippon airways': 'ana.co.jp', 'nh': 'ana.co.jp',
    'qantas': 'qantas.com', 'qf': 'qantas.com',
    'iberia': 'iberia.com', 'ib': 'iberia.com',
    'ita airways': 'ita-airways.com', 'az': 'ita-airways.com',
    'swiss': 'swiss.com', 'lx': 'swiss.com',
    'austrian': 'austrian.com', 'os': 'austrian.com',
    'sas': 'flysas.com', 'sk': 'flysas.com',
    'tap air portugal': 'flytap.com', 'tp': 'flytap.com',
    'wizz air': 'wizzair.com', 'w6': 'wizzair.com',
    'norwegian': 'norwegian.com', 'd8': 'norwegian.com',
    'finnair': 'finnair.com', 'ay': 'finnair.com',
    'aer lingus': 'aerlingus.com', 'ei': 'aerlingus.com',
    'icelandair': 'icelandair.com', 'fi': 'icelandair.com',
    'saudi arabian airlines': 'saudia.com', 'saudia': 'saudia.com', 'sv': 'saudia.com',
    'middle east airlines': 'mea.com.lb', 'mea': 'mea.com.lb', 'me': 'mea.com.lb'
};

export const resolveAirlineDomain = (carrier: string): string => {
    if (!carrier) return '';
    const clean = carrier.replace(/\s*\([A-Z0-9]+\)\s*$/, '').trim().toLowerCase();
    if (AIRLINE_DOMAINS[clean]) return AIRLINE_DOMAINS[clean];
    const noSpace = clean.replace(/[^a-z0-9]/g, '');
    if (AIRLINE_DOMAINS[noSpace]) return AIRLINE_DOMAINS[noSpace];
    return `${noSpace}.com`;
};

export const detectCarrierFromFlightNumber = (flightNum: string): { code: string; name: string } | null => {
    if (!flightNum) return null;
    const trimmed = flightNum.trim().toUpperCase();
    const match = trimmed.match(/^([A-Z0-9]{2})\s*(\d+)/i);
    if (!match) return null;
    const code = match[1];
    if (AIRLINE_CODES[code]) {
        return { code, name: formatCommercialAirlineName(AIRLINE_CODES[code], code) };
    }
    const online = getCarriersByQueryLocally(code, 1);
    if (online && online.length > 0 && (online[0].iata === code || online[0].code === code)) {
        return { code, name: formatCommercialAirlineName(online[0].company_name || online[0].name || '', code) };
    }
    return null;
};

export const cleanAirportCode = (str: string): string => {
    if (!str) return '';
    const trimmed = str.trim();
    if (trimmed.includes(' - ')) {
        const part = trimmed.split(' - ')[0].trim().toUpperCase();
        if (part.length === 3) return part;
    }
    const match = trimmed.match(/\b([A-Z]{3})\b/);
    if (match) return match[1];
    return trimmed;
};

export const AirlineLogoBadge: React.FC<{ carrier: string; className?: string }> = ({ carrier, className = "w-8 h-8" }) => {
    const [imgFailed, setImgFailed] = useState(false);
    const domain = useMemo(() => resolveAirlineDomain(carrier), [carrier]);

    useEffect(() => {
        setImgFailed(false);
    }, [domain]);

    if (!carrier) return null;

    const logoSrc = `https://logo.clearbit.com/${domain}`;
    const fallbackSrc = `https://www.google.com/s2/favicons?sz=64&domain=${domain}`;

    return (
        <div className={`relative rounded-xl overflow-hidden bg-white dark:bg-dark-card border border-black/10 dark:border-white/10 shrink-0 flex items-center justify-center p-1 shadow-xs transition-transform hover:scale-105 ${className}`}>
            {!imgFailed ? (
                <img 
                    src={logoSrc} 
                    alt={carrier}
                    className="w-full h-full object-contain"
                    onError={(e) => {
                        const target = e.currentTarget as HTMLImageElement;
                        if (target.src !== fallbackSrc) {
                            target.src = fallbackSrc;
                        } else {
                            setImgFailed(true);
                        }
                    }}
                />
            ) : (
                <AirplaneTilt className="w-4 h-4 text-primary-500" weight="duotone" />
            )}
        </div>
    );
};

export const TripSetupBoard: React.FC<TripSetupBoardProps> = ({
    isOpen,
    onClose,
    onTripCreated,
    initialStatus = 'Planning',
    users = []
}) => {
    // Workspace settings & active currency
    const { data: settings } = useWanderSync<WorkspaceSettings>('settings', () => dataService.getWorkspaceSettings());
    const activeCurrency = settings?.currency || 'USD';

    // Current Active Stage
    const [currentStage, setCurrentStage] = useState<StageKey>('basics');

    // Editing State for Configured Legs and Stays
    const [editingTransportIndex, setEditingTransportIndex] = useState<number | null>(null);
    const [editingAccommodationIndex, setEditingAccommodationIndex] = useState<number | null>(null);

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

    // Flight Route Structure (Direct vs With Layovers)
    const [flightRouteType, setFlightRouteType] = useState<'direct' | 'layovers'>('direct');
    const [layoverAirports, setLayoverAirports] = useState<string[]>(['']);
    
    interface ConnectingLegForm {
        id: string;
        flightNumber: string;
        carrier: string;
        departureDate: string;
        departureTime: string;
        arrivalDate: string;
        arrivalTime: string;
        travelClass: 'Economy' | 'Premium Economy' | 'Business' | 'First';
        seatNumber: string;
    }

    const [connectingLegs, setConnectingLegs] = useState<ConnectingLegForm[]>([
        {
            id: 'leg-0',
            flightNumber: '',
            carrier: '',
            departureDate: '',
            departureTime: '10:00',
            arrivalDate: '',
            arrivalTime: '13:00',
            travelClass: 'Economy',
            seatNumber: ''
        },
        {
            id: 'leg-1',
            flightNumber: '',
            carrier: '',
            departureDate: '',
            departureTime: '15:00',
            arrivalDate: '',
            arrivalTime: '18:00',
            travelClass: 'Economy',
            seatNumber: ''
        }
    ]);

    // Return Leg fields (for Round Trip)
    const [returnDate, setReturnDate] = useState('');
    const [returnTime, setReturnTime] = useState('14:00');
    const [returnNumber, setReturnNumber] = useState('');
    const [returnTravelClass, setReturnTravelClass] = useState<string>('Economy');
    const [returnSeatInfo, setReturnSeatInfo] = useState<string>('');

    // Handlers for Flight Carrier detection and layovers
    const handleFlightNumberChange = (val: string) => {
        setOutboundNumber(val);
        const detected = detectCarrierFromFlightNumber(val);
        if (detected && (!outboundCarrier || outboundCarrier.trim() === '')) {
            setOutboundCarrier(detected.name);
        }
    };

    const handleCarrierChange = (val: string) => {
        const cleaned = val.replace(/\s*\([A-Z0-9]+\)\s*$/, '').trim();
        setOutboundCarrier(cleaned || val);
    };

    const handleAddLayover = () => {
        setLayoverAirports(prev => [...prev, '']);
        setConnectingLegs(prev => [
            ...prev,
            {
                id: `leg-${prev.length}`,
                flightNumber: '',
                carrier: outboundCarrier || '',
                departureDate: outboundDate || startDate,
                departureTime: '19:00',
                arrivalDate: outboundArrivalDate || outboundDate || startDate,
                arrivalTime: '22:00',
                travelClass: travelClass || 'Economy',
                seatNumber: ''
            }
        ]);
    };

    const handleRemoveLayover = (index: number) => {
        if (layoverAirports.length <= 1) return;
        setLayoverAirports(prev => prev.filter((_, i) => i !== index));
        setConnectingLegs(prev => prev.filter((_, i) => i !== (index + 1)));
    };

    const handleLayoverChange = (index: number, val: string) => {
        setLayoverAirports(prev => {
            const next = [...prev];
            next[index] = val;
            return next;
        });
    };

    const handleConnectingLegChange = (index: number, field: keyof ConnectingLegForm, val: any) => {
        setConnectingLegs(prev => {
            const next = [...prev];
            const updated = { ...next[index], [field]: val };
            if (field === 'flightNumber') {
                const detected = detectCarrierFromFlightNumber(val);
                if (detected && !updated.carrier) {
                    updated.carrier = detected.name;
                }
            }
            next[index] = updated;
            return next;
        });
    };

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

    // Destination change handler
    const handleDestinationChange = (val: string) => {
        setDestination(val);
        getCoordinates(val).then(c => {
            if (c) setDestinationCoords(c);
        }).catch(() => {});
    };

    // Date change handlers with automatic default date propagation
    const handleStartDateChange = (val: string) => {
        setStartDate(val);
        // Propagate to outbound transport if unset or previously matching start date
        if (!outboundDate || outboundDate === startDate) {
            setOutboundDate(val);
            setOutboundArrivalDate(val);
            setConnectingLegs(prev => prev.map((l, i) => i === 0 && (!l.departureDate || l.departureDate === startDate) ? { ...l, departureDate: val } : l));
        }
        // Propagate to accommodation check-in if unset or previously matching start date
        if (!accCheckIn || accCheckIn === startDate) {
            setAccCheckIn(val);
        }
        // If end date is now earlier than start date, automatically align end date
        if (endDate && new Date(endDate) < new Date(val)) {
            setEndDate(val);
            setReturnDate(val);
            setAccCheckOut(val);
        }
    };

    const handleEndDateChange = (val: string) => {
        setEndDate(val);
        // Propagate to return transport if unset or previously matching end date
        if (!returnDate || returnDate === endDate) {
            setReturnDate(val);
        }
        // Propagate to accommodation check-out if unset or previously matching end date
        if (!accCheckOut || accCheckOut === endDate) {
            setAccCheckOut(val);
        }
    };

    // Calculate nights for the active accommodation form
    const activeAccNights = useMemo(() => {
        const inDate = accCheckIn || startDate;
        const outDate = accCheckOut || endDate;
        if (!inDate || !outDate) return 0;
        const diff = new Date(outDate).getTime() - new Date(inDate).getTime();
        return Math.max(0, Math.round(diff / (1000 * 60 * 60 * 24)));
    }, [accCheckIn, accCheckOut, startDate, endDate]);

    // Total Expedition Costs Calculations (including live uncommitted drafts and editing legs/stays)
    const draftTransportCost = useMemo(() => {
        const val = parseFloat(outboundCost);
        return isNaN(val) ? 0 : val;
    }, [outboundCost]);

    const draftAccCost = useMemo(() => {
        const val = parseFloat(accCost);
        return isNaN(val) ? 0 : val;
    }, [accCost]);

    const totalTransportCost = useMemo(() => {
        if (editingTransportIndex !== null) {
            return transportsList.reduce((sum, t, idx) => {
                if (idx === editingTransportIndex) return sum + draftTransportCost;
                return sum + (t.cost || 0);
            }, 0);
        }
        const committed = transportsList.reduce((sum, t) => sum + (t.cost || 0), 0);
        return committed + draftTransportCost;
    }, [transportsList, draftTransportCost, editingTransportIndex]);

    const totalAccommodationCost = useMemo(() => {
        if (editingAccommodationIndex !== null) {
            return accommodationsList.reduce((sum, a, idx) => {
                if (idx === editingAccommodationIndex) return sum + draftAccCost;
                return sum + (a.cost || 0);
            }, 0);
        }
        const committed = accommodationsList.reduce((sum, a) => sum + (a.cost || 0), 0);
        return committed + draftAccCost;
    }, [accommodationsList, draftAccCost, editingAccommodationIndex]);

    const totalEstimatedCost = useMemo(() => {
        return totalTransportCost + totalAccommodationCost;
    }, [totalTransportCost, totalAccommodationCost]);

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
        if (!query || query.trim().length < 1) return [];
        const trimmed = query.trim();

        // 1. Instant local search from preloaded airports & static geo data
        const localMatches = getAirportsByQueryLocally(trimmed, 15);
        const seenIatas = new Set<string>();
        const results: Array<{ iata: string; city: string; name: string; country?: string }> = [];

        for (const m of localMatches) {
            const iata = (m.iata || m.code || '').toUpperCase();
            if (iata && !seenIatas.has(iata)) {
                seenIatas.add(iata);
                results.push({
                    iata,
                    city: m.city_name || m.city || '',
                    name: m.airport_name || m.name || '',
                    country: m.country || ''
                });
            }
        }

        // 2. Network API lookup if online and results can be augmented
        if (trimmed.length >= 2 && results.length < 8) {
            try {
                const token = localStorage.getItem('wandergrid_session_token');
                const headers: Record<string, string> = token ? { 'Authorization': `Bearer ${token}` } : {};
                const res = await fetch(`/api/airports/search?q=${encodeURIComponent(trimmed)}`, { headers });
                if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
                    const apiResults = await res.json();
                    if (Array.isArray(apiResults)) {
                        for (const item of apiResults) {
                            const iata = (item.iata || '').toUpperCase();
                            if (iata && !seenIatas.has(iata)) {
                                seenIatas.add(iata);
                                results.push({
                                    iata,
                                    city: item.city_name || item.city || '',
                                    name: item.airport_name || item.name || '',
                                    country: item.country_or_territory || item.country || ''
                                });
                            }
                        }
                    }
                }
            } catch (e) {
                // Safe fallback
            }
        }

        return results.slice(0, 15).map(a => {
            const parts = [a.city, a.name].filter(Boolean);
            return `${a.iata} - ${parts.join(', ')}`;
        });
    };

    // Airline autocomplete
    const fetchAirlineSuggestions = async (query: string): Promise<string[]> => {
        if (!query || query.trim().length < 1) return [];
        const trimmed = query.trim();

        // 1. Local search from airline dataset
        const localMatches = getCarriersByQueryLocally(trimmed, 15);
        const seenNames = new Set<string>();
        const results: Array<{ name: string; code: string }> = [];

        for (const m of localMatches) {
            const name = m.company_name || m.name || '';
            const code = (m.iata || m.code || '').toUpperCase();
            if (name && !seenNames.has(name.toLowerCase())) {
                seenNames.add(name.toLowerCase());
                results.push({ name, code });
            }
        }

        // 2. Also check AIRLINE_CODES
        Object.entries(AIRLINE_CODES).forEach(([code, rawName]) => {
            const name = formatCommercialAirlineName(rawName, code);
            if (
                (code.toLowerCase().includes(trimmed.toLowerCase()) || name.toLowerCase().includes(trimmed.toLowerCase())) &&
                !seenNames.has(name.toLowerCase())
            ) {
                seenNames.add(name.toLowerCase());
                results.push({ name, code });
            }
        });

        // 3. Network API if online
        if (trimmed.length >= 2 && results.length < 8) {
            try {
                const token = localStorage.getItem('wandergrid_session_token');
                const headers: Record<string, string> = token ? { 'Authorization': `Bearer ${token}` } : {};
                const res = await fetch(`/api/carriers/search?q=${encodeURIComponent(trimmed)}`, { headers });
                if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
                    const apiResults = await res.json();
                    if (Array.isArray(apiResults)) {
                        for (const item of apiResults) {
                            const name = item.company_name || item.name;
                            const code = (item.iata || '').toUpperCase();
                            if (name && !seenNames.has(name.toLowerCase())) {
                                seenNames.add(name.toLowerCase());
                                results.push({ name, code });
                            }
                        }
                    }
                }
            } catch (e) {
                // Fall back to local
            }
        }

        return results.slice(0, 15).map(c => c.code ? `${c.name} (${c.code})` : c.name);
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
    // STACKING / MULTIPLE ENTRIES & EDITING HANDLERS
    // -------------------------------------------------------------

    // Edit configured transport leg
    const handleEditTransport = (index: number) => {
        const item = transportsList[index];
        if (!item) return;

        setEditingTransportIndex(index);
        if (item.mode) setTransportMode(item.mode);
        if (item.type) setTransportStructure(item.type === 'One-Way' ? 'One-Way' : 'Round Trip');
        setOutboundOrigin(item.origin || '');
        setOutboundDest(item.destination || '');
        setOutboundCarrier(item.provider || '');
        setOutboundNumber(item.identifier || '');
        setOutboundDate(item.departureDate || '');
        setOutboundTime(item.departureTime || '10:00');
        setOutboundArrivalDate(item.arrivalDate || item.departureDate || '');
        setOutboundArrivalTime(item.arrivalTime || '14:00');
        setOutboundCost(item.cost !== undefined ? String(item.cost) : '');
        setOutboundConfCode(item.confirmationCode || '');
        if (item.travelClass) setTravelClass(item.travelClass as any);
        setSeatInfo(item.seatNumber || '');
        if (item.mode === 'Car Rental' || item.mode === 'Personal Car') {
            setReturnDate(item.arrivalDate || '');
            setReturnTime(item.arrivalTime || '14:00');
            setVehicleModel(item.identifier || '');
        }
    };

    const handleCancelEditTransport = () => {
        setEditingTransportIndex(null);
        setOutboundOrigin('');
        setOutboundDest('');
        setOutboundCarrier('');
        setOutboundNumber('');
        setOutboundCost('');
        setOutboundConfCode('');
        setSeatInfo('');
        setReturnNumber('');
        setReturnSeatInfo('');
        setVehicleModel('');
    };

    // Commit current transport to list (creates new or saves edits)
    const handleCommitTransport = () => {
        const originVal = outboundOrigin.trim();
        const destVal = (outboundDest || destination).trim();
        if (!originVal && !destVal && !outboundCarrier.trim()) return;

        const costNum = parseFloat(outboundCost) || undefined;

        // If editing an existing configured leg
        if (editingTransportIndex !== null) {
            const existing = transportsList[editingTransportIndex];
            const cleanOrigin = transportMode === 'Flight' ? (cleanAirportCode(originVal) || originVal) : originVal;
            const cleanDest = transportMode === 'Flight' ? (cleanAirportCode(destVal) || destVal) : destVal;
            const isCar = transportMode === 'Car Rental' || transportMode === 'Personal Car';

            const updated: Partial<Transport> = {
                ...existing,
                mode: transportMode,
                type: transportStructure,
                origin: cleanOrigin || 'Origin',
                destination: cleanDest || destination,
                departureDate: outboundDate || startDate,
                departureTime: outboundTime || '10:00',
                arrivalDate: isCar ? (returnDate || endDate || outboundDate || startDate) : (outboundArrivalDate || outboundDate || startDate),
                arrivalTime: isCar ? (returnTime || '14:00') : (outboundArrivalTime || '14:00'),
                pickupLocation: isCar ? cleanOrigin : existing.pickupLocation,
                dropoffLocation: isCar ? cleanDest : existing.dropoffLocation,
                provider: outboundCarrier.trim(),
                identifier: isCar ? (vehicleModel || outboundNumber) : outboundNumber.trim(),
                confirmationCode: outboundConfCode.trim().toUpperCase(),
                travelClass: transportMode === 'Flight' ? travelClass : undefined,
                seatNumber: seatInfo || undefined,
                cost: costNum
            };

            setTransportsList(prev => prev.map((item, i) => i === editingTransportIndex ? updated : item));
            handleCancelEditTransport();
            return;
        }

        const newTransports: Partial<Transport>[] = [];
        const itineraryId = crypto.randomUUID();

        if (transportMode === 'Flight' && flightRouteType === 'layovers') {
            // Multi-leg connecting flight itinerary
            const totalLegs = connectingLegs.length;
            connectingLegs.forEach((leg, idx) => {
                const rawOrigin = idx === 0 ? originVal : (layoverAirports[idx - 1] || 'Layover');
                const rawDest = idx === totalLegs - 1 ? destVal : (layoverAirports[idx] || 'Layover');
                const legOrigCode = cleanAirportCode(rawOrigin) || rawOrigin || 'Origin';
                const legDestCode = cleanAirportCode(rawDest) || rawDest || 'Destination';

                newTransports.push({
                    id: crypto.randomUUID(),
                    itineraryId,
                    mode: 'Flight',
                    type: transportStructure,
                    origin: legOrigCode,
                    destination: legDestCode,
                    departureDate: leg.departureDate || outboundDate || startDate,
                    departureTime: leg.departureTime || '10:00',
                    arrivalDate: leg.arrivalDate || outboundArrivalDate || outboundDate || startDate,
                    arrivalTime: leg.arrivalTime || '14:00',
                    provider: leg.carrier.trim() || outboundCarrier.trim(),
                    identifier: leg.flightNumber.trim(),
                    confirmationCode: outboundConfCode.trim().toUpperCase(),
                    travelClass: leg.travelClass || travelClass,
                    seatNumber: leg.seatNumber || undefined,
                    cost: costNum && idx === 0 ? costNum : undefined,
                    notes: `Connecting Flight (Leg ${idx + 1} of ${totalLegs})`
                });
            });

            // Return leg for Round Trip with layovers
            if (transportStructure === 'Round Trip') {
                newTransports.push({
                    id: crypto.randomUUID(),
                    itineraryId,
                    mode: 'Flight',
                    type: 'Round Trip',
                    origin: cleanAirportCode(destVal) || destVal || 'Destination',
                    destination: cleanAirportCode(originVal) || originVal || 'Origin',
                    departureDate: returnDate || endDate,
                    departureTime: returnTime || '14:00',
                    arrivalDate: returnDate || endDate,
                    arrivalTime: '18:00',
                    provider: outboundCarrier.trim(),
                    identifier: (returnNumber || outboundNumber).trim(),
                    confirmationCode: outboundConfCode.trim().toUpperCase(),
                    travelClass: (returnTravelClass as any) || travelClass,
                    seatNumber: returnSeatInfo || seatInfo || undefined,
                    notes: 'Return Flight'
                });
            }
        } else {
            // Direct flight or other transport modes (Train, Bus, Car, Cruise)
            const cleanOrigin = transportMode === 'Flight' ? (cleanAirportCode(originVal) || originVal) : originVal;
            const cleanDest = transportMode === 'Flight' ? (cleanAirportCode(destVal) || destVal) : destVal;

            newTransports.push({
                id: crypto.randomUUID(),
                itineraryId,
                mode: transportMode,
                type: transportStructure,
                origin: cleanOrigin || 'Origin',
                destination: cleanDest || destination,
                departureDate: outboundDate || startDate,
                departureTime: outboundTime || '10:00',
                arrivalDate: (transportMode === 'Car Rental' || transportMode === 'Personal Car') ? (returnDate || endDate || outboundDate || startDate) : (outboundArrivalDate || outboundDate || startDate),
                arrivalTime: (transportMode === 'Car Rental' || transportMode === 'Personal Car') ? (returnTime || '14:00') : (outboundArrivalTime || '14:00'),
                pickupLocation: (transportMode === 'Car Rental' || transportMode === 'Personal Car') ? cleanOrigin : undefined,
                dropoffLocation: (transportMode === 'Car Rental' || transportMode === 'Personal Car') ? cleanDest : undefined,
                provider: outboundCarrier.trim(),
                identifier: (transportMode === 'Car Rental' || transportMode === 'Personal Car') ? (vehicleModel || outboundNumber) : outboundNumber.trim(),
                confirmationCode: outboundConfCode.trim().toUpperCase(),
                travelClass: transportMode === 'Flight' ? travelClass : undefined,
                seatNumber: seatInfo || undefined,
                cost: costNum ? (transportStructure === 'Round Trip' ? costNum / 2 : costNum) : undefined
            });

            if (transportStructure === 'Round Trip' && transportMode !== 'Car Rental' && transportMode !== 'Personal Car') {
                newTransports.push({
                    id: crypto.randomUUID(),
                    itineraryId,
                    mode: transportMode,
                    type: 'Round Trip',
                    origin: cleanDest || destination,
                    destination: cleanOrigin || 'Origin',
                    departureDate: returnDate || endDate,
                    departureTime: returnTime || '14:00',
                    arrivalDate: returnDate || endDate,
                    arrivalTime: '18:00',
                    provider: outboundCarrier.trim(),
                    identifier: (returnNumber || outboundNumber).trim(),
                    confirmationCode: outboundConfCode.trim().toUpperCase(),
                    travelClass: transportMode === 'Flight' ? ((returnTravelClass as any) || travelClass) : undefined,
                    seatNumber: returnSeatInfo || seatInfo || undefined,
                    cost: costNum ? costNum / 2 : undefined
                });
            }
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
        setReturnNumber('');
        setReturnTravelClass('Economy');
        setReturnSeatInfo('');
        setOutboundDate(returnDate || outboundDate || startDate);
        setOutboundArrivalDate(returnDate || outboundDate || startDate);
        setConnectingLegs([
            {
                id: 'leg-0',
                flightNumber: '',
                carrier: '',
                departureDate: '',
                departureTime: '10:00',
                arrivalDate: '',
                arrivalTime: '13:00',
                travelClass: 'Economy',
                seatNumber: ''
            },
            {
                id: 'leg-1',
                flightNumber: '',
                carrier: '',
                departureDate: '',
                departureTime: '15:00',
                arrivalDate: '',
                arrivalTime: '18:00',
                travelClass: 'Economy',
                seatNumber: ''
            }
        ]);
        setLayoverAirports(['']);
    };

    const handleRemoveTransport = (index: number) => {
        if (editingTransportIndex === index) {
            handleCancelEditTransport();
        } else if (editingTransportIndex !== null && editingTransportIndex > index) {
            setEditingTransportIndex(editingTransportIndex - 1);
        }
        setTransportsList(prev => prev.filter((_, i) => i !== index));
    };

    // Edit configured accommodation
    const handleEditAccommodation = (index: number) => {
        const item = accommodationsList[index];
        if (!item) return;

        setEditingAccommodationIndex(index);
        if (item.type) setAccType(item.type);
        setAccName(item.name || '');
        setAccAddress(item.address || '');
        setAccCoords(item.coordinates);
        setAccCheckIn(item.checkInDate || '');
        setAccCheckInTime(item.checkInTime || '15:00');
        setAccCheckOut(item.checkOutDate || '');
        setAccCheckOutTime(item.checkOutTime || '11:00');
        setAccCost(item.cost !== undefined ? String(item.cost) : '');
        setAccRef(item.confirmationCode || '');
    };

    const handleCancelEditAccommodation = () => {
        setEditingAccommodationIndex(null);
        setAccName('');
        setAccAddress('');
        setAccCoords(undefined);
        setAccCost('');
        setAccRef('');
    };

    // Commit current accommodation to list (creates new or saves edits)
    const handleCommitAccommodation = () => {
        const nameVal = accName.trim();
        const addressVal = accAddress.trim();
        if (!nameVal && !addressVal) return;

        const costNum = parseFloat(accCost) || undefined;

        if (editingAccommodationIndex !== null) {
            const existing = accommodationsList[editingAccommodationIndex];
            const updated: Partial<Accommodation> = {
                ...existing,
                name: nameVal || `${accType} in ${destination}`,
                type: accType,
                address: addressVal || destination,
                checkInDate: accCheckIn || startDate,
                checkInTime: accCheckInTime || '15:00',
                checkOutDate: accCheckOut || endDate,
                checkOutTime: accCheckOutTime || '11:00',
                cost: costNum,
                confirmationCode: accRef.trim() || undefined,
                coordinates: accCoords
            };

            setAccommodationsList(prev => prev.map((item, i) => i === editingAccommodationIndex ? updated : item));
            handleCancelEditAccommodation();
            return;
        }

        const newAcc: Partial<Accommodation> = {
            id: crypto.randomUUID(),
            name: nameVal || `${accType} in ${destination}`,
            type: accType,
            address: addressVal || destination,
            checkInDate: accCheckIn || startDate,
            checkInTime: accCheckInTime || '15:00',
            checkOutDate: accCheckOut || endDate,
            checkOutTime: accCheckOutTime || '11:00',
            cost: costNum,
            confirmationCode: accRef.trim() || undefined,
            coordinates: accCoords
        };

        setAccommodationsList(prev => [...prev, newAcc]);

        // Smart reset for next accommodation leg with default date propagation
        setAccName('');
        setAccAddress('');
        setAccCoords(undefined);
        const nextCheckIn = accCheckOut || startDate;
        setAccCheckIn(nextCheckIn);
        setAccCheckOut(endDate && new Date(endDate) > new Date(nextCheckIn) ? endDate : nextCheckIn);
        setAccCost('');
        setAccRef('');
    };

    const handleRemoveAccommodation = (index: number) => {
        if (editingAccommodationIndex === index) {
            handleCancelEditAccommodation();
        } else if (editingAccommodationIndex !== null && editingAccommodationIndex > index) {
            setEditingAccommodationIndex(editingAccommodationIndex - 1);
        }
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
                    <div className="space-y-3.5">
                        {/* 1. Primary Route Anchors (ALWAYS visible and selected first) */}
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

                        {/* 2. Direct vs Layovers Toggle */}
                        <div className="flex items-center justify-between p-1 bg-black/5 dark:bg-white/5 rounded-2xl border border-black/5 dark:border-white/5">
                            <button
                                type="button"
                                onClick={() => setFlightRouteType('direct')}
                                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                    flightRouteType === 'direct'
                                    ? 'bg-white dark:bg-dark-card text-primary-600 dark:text-primary-400 shadow-sm'
                                    : 'text-light-text-secondary dark:text-dark-text-secondary opacity-70 hover:opacity-100'
                                }`}
                            >
                                <AirplaneTilt className="w-4 h-4" weight={flightRouteType === 'direct' ? "fill" : "regular"} />
                                <span>Direct Flight</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setFlightRouteType('layovers')}
                                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                    flightRouteType === 'layovers'
                                    ? 'bg-white dark:bg-dark-card text-primary-600 dark:text-primary-400 shadow-sm'
                                    : 'text-light-text-secondary dark:text-dark-text-secondary opacity-70 hover:opacity-100'
                                }`}
                            >
                                <Path className="w-4 h-4" weight={flightRouteType === 'layovers' ? "fill" : "regular"} />
                                <span>With Layovers</span>
                            </button>
                        </div>

                        {/* 3. If Layovers: Layover Stopover Airport(s) Selector */}
                        {flightRouteType === 'layovers' && (
                            <div className="p-3.5 rounded-2xl bg-primary-500/5 border border-primary-500/15 space-y-2.5">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-primary-500 animate-pulse" />
                                        <span className="text-2xs font-bold uppercase tracking-wider text-primary-600 dark:text-primary-400">
                                            Layover Stopover Airport(s)
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleAddLayover}
                                        className="text-2xs font-bold text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1 cursor-pointer"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                        <span>Add Stopover</span>
                                    </button>
                                </div>

                                <div className="space-y-2">
                                    {layoverAirports.map((layover, lIdx) => (
                                        <div key={lIdx} className="flex items-center gap-2">
                                            <div className="flex-1">
                                                <Autocomplete
                                                    label={`Layover Airport ${lIdx + 1} *`}
                                                    placeholder="e.g. LHR or London Heathrow"
                                                    value={layover}
                                                    onChange={(val) => handleLayoverChange(lIdx, val)}
                                                    fetchSuggestions={fetchAirportSuggestions}
                                                />
                                            </div>
                                            {layoverAirports.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveLayover(lIdx)}
                                                    className="mt-5 p-2 rounded-xl text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer shrink-0"
                                                    title="Remove layover airport"
                                                >
                                                    <Trash className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 4. Page Adapts: Render either Direct Leg or Connecting Legs */}
                        {flightRouteType === 'direct' ? (
                            /* Direct Flight Details */
                            <div className="space-y-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <Input 
                                        label="Flight Number" 
                                        placeholder="e.g. AF 022 or DL 402" 
                                        value={outboundNumber} 
                                        onChange={e => handleFlightNumberChange(e.target.value)} 
                                    />
                                    <div className="flex items-end gap-2">
                                        {outboundCarrier && (
                                            <AirlineLogoBadge carrier={outboundCarrier} className="w-11 h-11 mb-0.5 shrink-0" />
                                        )}
                                        <div className="flex-1">
                                            <Autocomplete 
                                                label="Airline / Carrier *" 
                                                placeholder="e.g. Air France or Delta" 
                                                value={outboundCarrier} 
                                                onChange={handleCarrierChange} 
                                                fetchSuggestions={fetchAirlineSuggestions} 
                                            />
                                        </div>
                                    </div>
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
                            </div>
                        ) : (
                            /* Connecting Flight Legs */
                            <div className="space-y-3">
                                <span className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block">
                                    Connecting Flight Legs ({connectingLegs.length})
                                </span>

                                {connectingLegs.map((leg, legIdx) => {
                                    const rawOrigin = legIdx === 0 ? outboundOrigin : (layoverAirports[legIdx - 1] || `Layover ${legIdx}`);
                                    const rawDest = legIdx === connectingLegs.length - 1 ? (outboundDest || destination) : (layoverAirports[legIdx] || `Layover ${legIdx + 1}`);
                                    const originCode = cleanAirportCode(rawOrigin) || 'Origin';
                                    const destCode = cleanAirportCode(rawDest) || 'Destination';

                                    return (
                                        <React.Fragment key={leg.id || legIdx}>
                                            <div className="p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl bg-white/90 dark:bg-dark-card/90 border border-black/10 dark:border-white/10 shadow-none sm:shadow-xs space-y-3">
                                                <div className="flex items-center justify-between border-b border-black/5 dark:border-white/5 pb-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-500/20">
                                                            Leg {legIdx + 1} of {connectingLegs.length}
                                                        </span>
                                                        <span className="font-bold text-xs text-light-text dark:text-dark-text">
                                                            {originCode} &rarr; {destCode}
                                                        </span>
                                                    </div>
                                                    {leg.carrier && (
                                                        <AirlineLogoBadge carrier={leg.carrier} className="w-7 h-7" />
                                                    )}
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                    <Input 
                                                        label="Flight Number" 
                                                        placeholder="e.g. AF 022" 
                                                        value={leg.flightNumber} 
                                                        onChange={e => handleConnectingLegChange(legIdx, 'flightNumber', e.target.value)} 
                                                    />
                                                    <Autocomplete 
                                                        label="Airline *" 
                                                        placeholder="e.g. Air France" 
                                                        value={leg.carrier} 
                                                        onChange={val => handleConnectingLegChange(legIdx, 'carrier', val.replace(/\s*\([A-Z0-9]+\)\s*$/, '').trim())} 
                                                        fetchSuggestions={fetchAirlineSuggestions} 
                                                    />
                                                </div>

                                                <div className="grid grid-cols-2 gap-2">
                                                    <Input 
                                                        label="Departure Date" 
                                                        type="date" 
                                                        value={leg.departureDate || outboundDate || startDate} 
                                                        onChange={e => handleConnectingLegChange(legIdx, 'departureDate', e.target.value)} 
                                                    />
                                                    <TimeInput 
                                                        label="Departure Time" 
                                                        value={leg.departureTime} 
                                                        onChange={val => handleConnectingLegChange(legIdx, 'departureTime', val)} 
                                                    />
                                                </div>

                                                <div className="grid grid-cols-2 gap-2">
                                                    <Select 
                                                        label="Cabin Class" 
                                                        value={leg.travelClass} 
                                                        onChange={e => handleConnectingLegChange(legIdx, 'travelClass', e.target.value as any)}
                                                        options={CABIN_OPTIONS}
                                                    />
                                                    <Input 
                                                        label="Seat" 
                                                        placeholder="e.g. 14A" 
                                                        value={leg.seatNumber} 
                                                        onChange={e => handleConnectingLegChange(legIdx, 'seatNumber', e.target.value)} 
                                                    />
                                                </div>
                                            </div>

                                            {legIdx < connectingLegs.length - 1 && (
                                                <div className="flex items-center justify-center gap-2 py-1 text-2xs font-bold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wider">
                                                    <div className="h-px bg-black/10 dark:bg-white/10 flex-1" />
                                                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5">
                                                        <Clock className="w-3.5 h-3.5 text-amber-500" />
                                                        <span>Transit at {cleanAirportCode(layoverAirports[legIdx]) || `Layover ${legIdx + 1}`}</span>
                                                    </div>
                                                    <div className="h-px bg-black/10 dark:bg-white/10 flex-1" />
                                                </div>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </div>
                        )}

                        {/* 5. Return Leg (for Round Trip) */}
                        {transportStructure === 'Round Trip' && (
                            <div className="p-3 rounded-2xl bg-primary-500/5 border border-primary-500/15 space-y-2">
                                <span className="text-2xs font-bold uppercase tracking-wider text-primary-600 dark:text-primary-400 block">
                                    Return Leg ({cleanAirportCode(outboundDest || destination) || 'Destination'} &rarr; {cleanAirportCode(outboundOrigin) || 'Origin'})
                                </span>
                                <div className="grid grid-cols-2 gap-2">
                                    <Input label="Return Date" type="date" value={returnDate || endDate} min={outboundDate || startDate} onChange={e => setReturnDate(e.target.value)} />
                                    <TimeInput label="Return Time" value={returnTime} onChange={setReturnTime} />
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    <Input label="Return Flight #" placeholder="e.g. AF 023" value={returnNumber} onChange={e => setReturnNumber(e.target.value)} />
                                    <Select label="Return Cabin Class" options={CABIN_OPTIONS} value={returnTravelClass} onChange={e => setReturnTravelClass(e.target.value as any)} />
                                    <Input label="Return Seat #" placeholder="e.g. 14A" value={returnSeatInfo} onChange={e => setReturnSeatInfo(e.target.value)} />
                                </div>
                            </div>
                        )}

                        {/* 6. Shared Booking Code & Cost */}
                        <div className="grid grid-cols-2 gap-2">
                            <Input label={`Total Ticket Cost (${getCurrencySymbol(activeCurrency)})`} type="number" placeholder="0.00" value={outboundCost} onChange={e => setOutboundCost(e.target.value)} />
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
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <Input label="Return Train / Service #" placeholder="e.g. TGV 6174" value={returnNumber} onChange={e => setReturnNumber(e.target.value)} />
                                    <Input label="Return Coach & Seat" placeholder="e.g. Coach 2, Seat 15" value={returnSeatInfo} onChange={e => setReturnSeatInfo(e.target.value)} />
                                </div>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                            <Input label="Coach & Seat" placeholder="e.g. Coach 4, Seat 21" value={seatInfo} onChange={e => setSeatInfo(e.target.value)} />
                            <Input label={`Total Cost (${getCurrencySymbol(activeCurrency)})`} type="number" placeholder="0.00" value={outboundCost} onChange={e => setOutboundCost(e.target.value)} />
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
                            <Input label={`Total Cost (${getCurrencySymbol(activeCurrency)})`} type="number" placeholder="0.00" value={outboundCost} onChange={e => setOutboundCost(e.target.value)} />
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
                            <Input label={`Total Rental Cost (${getCurrencySymbol(activeCurrency)})`} type="number" placeholder="0.00" value={outboundCost} onChange={e => setOutboundCost(e.target.value)} />
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
                        <Input label={`Estimated Fuel & Tolls Cost (${getCurrencySymbol(activeCurrency)})`} type="number" placeholder="0.00" value={outboundCost} onChange={e => setOutboundCost(e.target.value)} />
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
                            <Input label={`Total Cost (${getCurrencySymbol(activeCurrency)})`} type="number" placeholder="0.00" value={outboundCost} onChange={e => setOutboundCost(e.target.value)} />
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
                <div className="flex items-center justify-between text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
                    <span>Configured Legs ({transportsList.length})</span>
                    <span>Total: {formatCurrency(transportsList.reduce((sum, t) => sum + (t.cost || 0), 0), activeCurrency)}</span>
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                    {transportsList.map((t, idx) => {
                        const modeConfig = TRANSPORT_MODES.find(m => m.mode === t.mode);
                        const IconComponent = modeConfig ? modeConfig.icon : AirplaneTilt;
                        const isFlight = t.mode === 'Flight';
                        const isConnecting = t.notes && t.notes.includes('Connecting');
                        const isBeingEdited = editingTransportIndex === idx;

                        return (
                            <div 
                                key={t.id || idx} 
                                className={`p-2.5 sm:p-3 rounded-xl sm:rounded-2xl border transition-all flex items-center justify-between shadow-none sm:shadow-xs gap-3 group ${
                                    isBeingEdited 
                                        ? 'bg-sky-500/10 border-sky-500/40 ring-1 ring-sky-500/30' 
                                        : 'bg-white/90 dark:bg-dark-card/90 border-black/5 dark:border-white/5'
                                }`}
                            >
                                <div className="flex items-center gap-2.5 min-w-0">
                                    {isFlight && t.provider ? (
                                        <AirlineLogoBadge carrier={t.provider} className="w-8 h-8 shrink-0" />
                                    ) : (
                                        <div className="w-8 h-8 rounded-xl bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center shrink-0">
                                            <IconComponent className="w-4 h-4" />
                                        </div>
                                    )}
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="font-bold text-xs text-light-text dark:text-dark-text truncate">
                                                {t.origin} &rarr; {t.destination}
                                            </span>
                                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-black/5 dark:bg-white/5 text-light-text-secondary dark:text-dark-text-secondary">
                                                {t.mode}
                                            </span>
                                            {isConnecting && (
                                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-500/20">
                                                    Connecting
                                                </span>
                                            )}
                                            {isBeingEdited && (
                                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/30">
                                                    Editing
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary truncate">
                                            {t.provider || 'Unspecified'} {t.identifier ? `• ${t.identifier}` : ''} • {formatDate(t.departureDate || '')}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                    {t.cost !== undefined && t.cost > 0 && (
                                        <span className="font-mono font-bold text-xs text-light-text dark:text-dark-text mr-1">
                                            {formatCurrency(t.cost, activeCurrency)}
                                        </span>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => handleEditTransport(idx)}
                                        className="w-7 h-7 rounded-lg flex items-center justify-center text-light-text-secondary dark:text-dark-text-secondary hover:text-sky-600 dark:hover:text-sky-400 hover:bg-sky-500/10 transition-colors cursor-pointer"
                                        aria-label="Edit transport leg"
                                        title="Edit this leg"
                                    >
                                        <PencilSimple className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveTransport(idx)}
                                        className="w-7 h-7 rounded-lg flex items-center justify-center text-light-text-secondary dark:text-dark-text-secondary hover:text-semantic-red hover:bg-semantic-red/10 transition-colors cursor-pointer"
                                        aria-label="Remove transport leg"
                                        title="Remove this leg"
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
                <div className="flex items-center justify-between text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
                    <span>Configured Stays ({accommodationsList.length})</span>
                    <span>Total: {formatCurrency(accommodationsList.reduce((sum, a) => sum + (a.cost || 0), 0), activeCurrency)}</span>
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                    {accommodationsList.map((a, idx) => {
                        const isBeingEdited = editingAccommodationIndex === idx;
                        return (
                            <div 
                                key={a.id || idx} 
                                className={`p-2.5 sm:p-3 rounded-xl sm:rounded-2xl border transition-all flex items-center justify-between shadow-none sm:shadow-xs gap-3 group ${
                                    isBeingEdited 
                                        ? 'bg-amber-500/10 border-amber-500/40 ring-1 ring-amber-500/30' 
                                        : 'bg-white/90 dark:bg-dark-card/90 border-black/5 dark:border-white/5'
                                }`}
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
                                            {isBeingEdited && (
                                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                                                    Editing
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary truncate">
                                            {formatDateRange(a.checkInDate, a.checkOutDate)} • {a.address}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                    {a.cost !== undefined && a.cost > 0 && (
                                        <span className="font-mono font-bold text-xs text-light-text dark:text-dark-text mr-1 block">
                                            {formatCurrency(a.cost, activeCurrency)}
                                        </span>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => handleEditAccommodation(idx)}
                                        className="w-7 h-7 rounded-lg flex items-center justify-center text-light-text-secondary dark:text-dark-text-secondary hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-500/10 transition-colors cursor-pointer"
                                        aria-label="Edit accommodation"
                                        title="Edit this stay"
                                    >
                                        <PencilSimple className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveAccommodation(idx)}
                                        className="w-7 h-7 rounded-lg flex items-center justify-center text-light-text-secondary dark:text-dark-text-secondary hover:text-semantic-red hover:bg-semantic-red/10 transition-colors cursor-pointer"
                                        aria-label="Remove accommodation"
                                        title="Remove this stay"
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

    if (!isOpen) return null;

    return (
        <div className="w-full max-w-[1680px] mx-auto pt-2 sm:pt-4 px-1 sm:px-4 md:px-6 lg:px-8 flex flex-col gap-5 sm:gap-6 animate-fadeIn pb-16">
            
            {/* ========================================================================= */}
            {/* HERO HEADER: Title Aligned Left, 4. Finalize Aligned Right               */}
            {/* ========================================================================= */}
            <div className="flex flex-row items-center justify-between gap-2.5 sm:gap-4 w-full pt-1 pb-1">
                {/* Left: Pure Icon + Responsive Page Name (Aligned Left) */}
                <div className="flex items-center justify-start gap-2 sm:gap-3 md:gap-4 min-w-0">
                    <MapTrifold 
                        className="w-7 h-7 sm:w-9 sm:h-9 md:w-12 md:h-12 text-emerald-500 dark:text-emerald-400 shrink-0" 
                        weight="duotone" 
                    />
                    <div className="min-w-0">
                        <h1 className="text-xl sm:text-3xl md:text-5xl font-black text-light-text dark:text-white tracking-tight leading-tight sm:leading-none truncate sm:overflow-visible">
                            New Expedition
                        </h1>
                        {(destination || startDate) && (
                            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary font-medium truncate mt-1 flex items-center gap-1.5">
                                {destination && <span className="font-semibold text-light-text dark:text-dark-text">{destination}</span>}
                                {destination && startDate && <span>•</span>}
                                {startDate && <span>{formatDateRange(startDate, endDate)}</span>}
                            </p>
                        )}
                    </div>
                </div>

                {/* Right: 4. Finalize in Header */}
                <div className="flex items-center justify-end gap-2 sm:gap-3 shrink-0">
                    {/* Live Estimated Cost Pill */}
                    <div className="hidden sm:flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-white/70 dark:bg-dark-card/70 border border-black/5 dark:border-white/10 shadow-xs">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
                            Est. Total
                        </span>
                        <span className="text-xs font-mono font-black text-primary-600 dark:text-primary-400">
                            {formatCurrency(totalEstimatedCost, activeCurrency)}
                        </span>
                        {(transportsList.length > 0 || accommodationsList.length > 0) && (
                            <span className="text-2xs text-light-text-secondary dark:text-dark-text-secondary">
                                ({transportsList.length}L • {accommodationsList.length}S)
                            </span>
                        )}
                    </div>

                    {/* Cancel Button */}
                    <GlassButton
                        type="button"
                        variant="ghost"
                        onClick={onClose}
                        className="min-h-[44px] px-3.5 sm:px-4 text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text cursor-pointer"
                    >
                        Cancel
                    </GlassButton>

                    {/* Launch Expedition Button */}
                    <GlassButton
                        type="button"
                        variant="primary"
                        onClick={handleFinalizeTrip}
                        disabled={isSaving || !title || !startDate || !endDate}
                        className="min-h-[44px] px-4 sm:px-5 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
                    >
                        <span>{isSaving ? 'Creating...' : 'Launch Expedition'}</span>
                        <Check className="w-4 h-4" weight="bold" />
                    </GlassButton>
                </div>
            </div>

            {/* Map-Style Floating Stage Tabs (Planner Standard) */}
            <div className="flex items-center justify-center sm:justify-start overflow-x-auto sm:overflow-visible no-scrollbar p-3 -m-3 shrink-0 w-full sm:w-auto">
                <GlassPanel
                    className="wg-glass-pill shadow-lg shadow-black/5 dark:shadow-black/25 shrink-0"
                    padding="4px 6px"
                    overrides={{ borderRadius: 9999 }}
                >
                    <div className="flex gap-1 relative items-center">
                        {(['basics', 'transport', 'accommodation'] as StageKey[]).map((stageKey) => {
                            const config = STAGE_THEMES[stageKey];
                            const isSelected = currentStage === stageKey;
                            const IconComponent = config.icon;
                            
                            const count = stageKey === 'basics' 
                                ? (title && startDate && endDate ? '✓' : '1') 
                                : stageKey === 'transport' 
                                ? transportsList.length 
                                : accommodationsList.length;

                            return (
                                <button
                                    key={stageKey}
                                    type="button"
                                    onClick={() => setCurrentStage(stageKey)}
                                    title={config.label}
                                    className={`relative rounded-full text-xs font-bold transition-all duration-200 flex items-center justify-center cursor-pointer select-none active:scale-95 ${
                                        isSelected
                                            ? `${config.activeText} px-4 sm:px-5 py-2.5`
                                            : 'text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text px-3 sm:px-5 py-2.5'
                                    }`}
                                >
                                    {isSelected && (
                                        <motion.div
                                            layoutId="tripSetupTabActiveIndicator"
                                            className={`absolute inset-0 rounded-full ${config.activeBg} backdrop-blur-md border ${config.activeBorder} ${config.activeShadow} z-0`}
                                            style={{ WebkitBackdropFilter: 'blur(12px)' }}
                                            transition={{ type: "spring", stiffness: 450, damping: 32 }}
                                        />
                                    )}
                                    <span className="relative z-10 flex items-center gap-2 sm:gap-2.5">
                                        <IconComponent 
                                            className={`w-5 h-5 shrink-0 transition-colors duration-200 ${config.color}`} 
                                            weight="duotone" 
                                        />
                                        <span className={`tracking-tight ${isSelected ? 'inline' : 'hidden sm:inline'}`}>
                                            {config.label}
                                        </span>
                                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold border transition-colors ${config.badgeStyle} ${
                                            isSelected 
                                                ? 'inline shadow-xs' 
                                                : 'hidden sm:inline opacity-90 hover:opacity-100'
                                        }`}>
                                            {count}
                                        </span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </GlassPanel>
            </div>

            {/* Desktop 3-Column Bento Grid */}
            <div className="hidden lg:grid lg:grid-cols-3 gap-6 items-start">
                
                {/* ============================================================== */}
                {/* COLUMN 1: TRIP BASICS */}
                {/* ============================================================== */}
                <GlassPanel 
                            className={`rounded-[28px] overflow-hidden flex flex-col ${
                                currentStage === 'basics' 
                                ? 'wg-glass-card ring-2 ring-emerald-500/40 border border-emerald-500/30' 
                                : 'wg-glass-card border border-black/5 dark:border-white/10'
                            }`}
                            overrides={{ borderRadius: 28 }}
                            padding="0px"
                        >
                            <div className="p-5 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border-b border-black/10 dark:border-white/5 flex items-center justify-between shrink-0">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white bg-gradient-to-br from-emerald-500 to-teal-600 shadow-xs shrink-0">
                                        <Compass className="w-5 h-5" weight="duotone" />
                                    </div>
                                    <h3 className="text-sm font-bold text-light-text dark:text-dark-text tracking-tight">1. Trip Basics</h3>
                                </div>
                                {stageIndex > 0 && (
                                    <button 
                                        type="button" 
                                        onClick={() => setCurrentStage('basics')} 
                                        className="text-emerald-600 dark:text-emerald-400 hover:underline text-2xs font-bold uppercase flex items-center gap-1 cursor-pointer"
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
                                            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {destination}</p>
                                            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary flex items-center gap-1"><CalendarBlank className="w-3.5 h-3.5" /> {formatDateRange(startDate, endDate)}</p>
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
                                            <label className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">Expedition Title *</label>
                                            <Input 
                                                placeholder="e.g. Greek Island Odyssey" 
                                                value={title} 
                                                onChange={e => setTitle(e.target.value)} 
                                                className="!font-bold"
                                                autoFocus
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">Destination City *</label>
                                            <Autocomplete 
                                                placeholder="e.g. Santorini, Greece" 
                                                value={destination} 
                                                onChange={handleDestinationChange} 
                                                fetchSuggestions={fetchLocationSuggestions} 
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <Input label="Start Date *" type="date" value={startDate} onChange={e => handleStartDateChange(e.target.value)} />
                                            <Input label="End Date *" type="date" value={endDate} min={startDate} onChange={e => handleEndDateChange(e.target.value)} />
                                        </div>
                                        <div className="pt-2">
                                            <GlassButton 
                                                type="button" 
                                                variant="primary"
                                                onClick={handleCompleteBasics} 
                                                className="w-full h-11 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-none sm:shadow-xs cursor-pointer"
                                            >
                                                <span>Confirm Basics</span>
                                                <ArrowRight className="w-4 h-4" />
                                            </GlassButton>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </GlassPanel>

                        {/* ============================================================== */}
                        {/* COLUMN 2: TRANSPORT LOGISTICS */}
                        {/* ============================================================== */}
                        <GlassPanel 
                            className={`rounded-[28px] overflow-hidden flex flex-col ${
                                currentStage === 'transport' 
                                ? 'wg-glass-card ring-2 ring-sky-500/40 border border-sky-500/30' 
                                : 'wg-glass-card border border-black/5 dark:border-white/10'
                            }`}
                            overrides={{ borderRadius: 28 }}
                            padding="0px"
                        >
                            <div className="p-5 bg-gradient-to-r from-sky-500/10 via-sky-500/5 to-transparent border-b border-black/10 dark:border-white/5 flex items-center justify-between shrink-0">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white bg-gradient-to-br from-sky-500 to-blue-600 shadow-xs shrink-0">
                                        <AirplaneTilt className="w-5 h-5" weight="duotone" />
                                    </div>
                                    <h3 className="text-sm font-bold text-light-text dark:text-dark-text tracking-tight">2. Transport</h3>
                                </div>
                                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/25">
                                    {transportsList.length} Legs
                                </span>
                            </div>

                            <div className="p-5 flex-1 space-y-4 overflow-y-auto custom-scrollbar">
                                {/* Sub-step 2a: Method Picker */}
                                <div className="space-y-1.5">
                                    <label className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">Sub-step 2a: Method</label>
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
                                                        : 'bg-black/5 dark:bg-white/5 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text'
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
                                        <label className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">Routing Structure</label>
                                        <div className="flex gap-1.5">
                                            {(['Round Trip', 'One-Way'] as const).map(struct => (
                                                <button
                                                    key={struct}
                                                    type="button"
                                                    onClick={() => setTransportStructure(struct)}
                                                    className={`flex-1 py-1.5 rounded-xl text-2xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                                                        transportStructure === struct 
                                                        ? 'bg-white dark:bg-dark-card text-primary-600 dark:text-primary-400 shadow-sm border border-primary-500/30' 
                                                        : 'bg-black/5 dark:bg-white/5 text-light-text-secondary dark:text-dark-text-secondary'
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
                                    <span className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block">
                                        {transportMode} Logistics
                                    </span>
                                    {renderTransportFields()}
                                </div>

                                {/* Sub-step 2d: Action to add transport & multiple legs stack */}
                                <div className="space-y-2 pt-1">
                                    <div className="flex gap-2">
                                        <GlassButton 
                                            type="button" 
                                            variant={editingTransportIndex !== null ? "primary" : "secondary"}
                                            onClick={handleCommitTransport}
                                            className="flex-1 h-10 text-2xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer"
                                        >
                                            {editingTransportIndex !== null ? (
                                                <>
                                                    <Check className="w-3.5 h-3.5" weight="bold" />
                                                    <span>Save Leg Changes</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Plus className="w-3.5 h-3.5" weight="bold" />
                                                    <span>+ Add This Transport Leg</span>
                                                </>
                                            )}
                                        </GlassButton>
                                        {editingTransportIndex !== null && (
                                            <GlassButton
                                                type="button"
                                                variant="ghost"
                                                onClick={handleCancelEditTransport}
                                                className="h-10 px-3 text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary cursor-pointer"
                                            >
                                                Cancel
                                            </GlassButton>
                                        )}
                                    </div>

                                    {/* Render multiple added transports */}
                                    {renderTransportStackList()}

                                    <div className="flex gap-2 pt-2">
                                        <GlassButton 
                                            type="button" 
                                            variant="ghost"
                                            onClick={() => setCurrentStage('accommodation')}
                                            className="px-3 h-11 text-2xs text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text font-bold uppercase transition-colors cursor-pointer"
                                        >
                                            Skip
                                        </GlassButton>
                                        <GlassButton 
                                            type="button" 
                                            variant="primary"
                                            onClick={() => {
                                                if (outboundOrigin && transportsList.length === 0) {
                                                    handleCommitTransport();
                                                }
                                                setCurrentStage('accommodation');
                                            }}
                                            className="flex-1 h-11 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer"
                                        >
                                            <span>Proceed to Stay</span>
                                            <ArrowRight className="w-4 h-4" />
                                        </GlassButton>
                                    </div>
                                </div>
                            </div>
                        </GlassPanel>

                        {/* ============================================================== */}
                        {/* COLUMN 3: ACCOMMODATIONS & STAYS */}
                        {/* ============================================================== */}
                        <GlassPanel 
                            className={`rounded-[28px] overflow-hidden flex flex-col ${
                                currentStage === 'accommodation' 
                                ? 'wg-glass-card ring-2 ring-amber-500/40 border border-amber-500/30' 
                                : 'wg-glass-card border border-black/5 dark:border-white/10'
                            }`}
                            overrides={{ borderRadius: 28 }}
                            padding="0px"
                        >
                            <div className="p-5 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border-b border-black/10 dark:border-white/5 flex items-center justify-between shrink-0">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white bg-gradient-to-br from-amber-500 to-orange-600 shadow-xs shrink-0">
                                        <Bed className="w-5 h-5" weight="duotone" />
                                    </div>
                                    <h3 className="text-sm font-bold text-light-text dark:text-dark-text tracking-tight">3. Stays</h3>
                                </div>
                                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25">
                                    {accommodationsList.length} Stays
                                </span>
                            </div>

                            <div className="p-5 flex-1 space-y-4 overflow-y-auto custom-scrollbar">
                                {/* Sub-step 3a: Type Selection */}
                                <div className="space-y-1.5">
                                    <label className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">Stay Type</label>
                                    <div className="grid grid-cols-4 gap-1.5">
                                        {ACCOMMODATION_TYPES.map(t => (
                                            <button
                                                key={t}
                                                type="button"
                                                onClick={() => setAccType(t)}
                                                className={`py-1.5 px-1 rounded-xl text-center text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer truncate ${
                                                    accType === t
                                                    ? 'bg-white dark:bg-dark-card text-amber-600 dark:text-amber-400 shadow-sm border border-amber-500/30'
                                                    : 'bg-black/5 dark:bg-white/5 text-light-text-secondary dark:text-dark-text-secondary'
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
                                            <label className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary flex items-center gap-1">
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
                                            <label className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">Dates & Duration</label>
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
                                        <Input label={`Total Cost (${getCurrencySymbol(activeCurrency)})`} type="number" placeholder="0.00" value={accCost} onChange={e => setAccCost(e.target.value)} />
                                        <Input label="Booking Ref / PNR" placeholder="HTL-882" value={accRef} onChange={e => setAccRef(e.target.value)} />
                                    </div>
                                </div>

                                {/* Sub-step 3c: Stacking & Multiple Stays list */}
                                <div className="space-y-2 pt-1">
                                    <div className="flex gap-2">
                                        <GlassButton 
                                            type="button" 
                                            variant={editingAccommodationIndex !== null ? "primary" : "secondary"}
                                            onClick={handleCommitAccommodation}
                                            className="flex-1 h-10 text-2xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer"
                                        >
                                            {editingAccommodationIndex !== null ? (
                                                <>
                                                    <Check className="w-3.5 h-3.5" weight="bold" />
                                                    <span>Save Stay Changes</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Plus className="w-3.5 h-3.5" weight="bold" />
                                                    <span>+ Add This Stay</span>
                                                </>
                                            )}
                                        </GlassButton>
                                        {editingAccommodationIndex !== null && (
                                            <GlassButton
                                                type="button"
                                                variant="ghost"
                                                onClick={handleCancelEditAccommodation}
                                                className="h-10 px-3 text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary cursor-pointer"
                                            >
                                                Cancel
                                            </GlassButton>
                                        )}
                                    </div>

                                    {/* Render multiple added accommodations */}
                                    {renderAccommodationStackList()}

                                    {/* Column 3 Bottom Launch Strip */}
                                    <div className="pt-3 border-t border-black/5 dark:border-white/5 space-y-2.5">
                                        <div className="p-3 rounded-2xl bg-white/60 dark:bg-dark-card/60 border border-black/5 dark:border-white/5 flex items-center justify-between">
                                            <div>
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block">
                                                    Expedition Est. Total
                                                </span>
                                                <span className="font-mono font-black text-sm text-primary-600 dark:text-primary-400">
                                                    {formatCurrency(totalEstimatedCost, activeCurrency)}
                                                </span>
                                            </div>
                                            <span className="text-2xs text-light-text-secondary dark:text-dark-text-secondary">
                                                {transportsList.length} Legs • {accommodationsList.length} Stays
                                            </span>
                                        </div>

                                        <GlassButton 
                                            type="button" 
                                            variant="primary"
                                            onClick={handleFinalizeTrip}
                                            disabled={isSaving || !title || !startDate || !endDate}
                                            className="w-full h-11 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-xs active:scale-95 disabled:opacity-50 cursor-pointer"
                                        >
                                            <span>{isSaving ? 'Creating...' : 'Launch Expedition'}</span>
                                            <Check className="w-4 h-4" weight="bold" />
                                        </GlassButton>
                                    </div>
                                </div>
                            </div>
                        </GlassPanel>





                    </div>

                    {/* Mobile (< 1024px): Single-Column Active Stage View */}
                    <div className="lg:hidden w-full max-w-lg mx-auto space-y-5">
                        {currentStage === 'basics' && (
                            <div className="space-y-4 animate-fadeIn">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-none sm:shadow-xs shrink-0">
                                        <Compass className="w-4 h-4" weight="duotone" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-light-text dark:text-dark-text tracking-tight">Step 1: Trip Basics & Destination</h3>
                                        <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary font-medium">Destination and dates</p>
                                    </div>
                                </div>
                                {basicsError && <p className="text-xs font-semibold text-semantic-red p-2 bg-semantic-red/10 rounded-xl">{basicsError}</p>}
                                <Input label="Expedition Title *" placeholder="e.g. Italian Lakes & Alps" value={title} onChange={e => setTitle(e.target.value)} />
                                <Autocomplete label="Destination *" placeholder="e.g. Lake Como, Italy" value={destination} onChange={handleDestinationChange} fetchSuggestions={fetchLocationSuggestions} />
                                <div className="grid grid-cols-2 gap-3">
                                    <Input label="Start Date *" type="date" value={startDate} onChange={e => handleStartDateChange(e.target.value)} />
                                    <Input label="End Date *" type="date" value={endDate} min={startDate} onChange={e => handleEndDateChange(e.target.value)} />
                                </div>
                                <GlassButton 
                                    type="button" 
                                    variant="primary"
                                    onClick={handleCompleteBasics} 
                                    className="w-full h-12 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-none sm:shadow-xs"
                                >
                                    <span>Next: Configure Transport</span>
                                    <ArrowRight className="w-4 h-4" />
                                </GlassButton>
                            </div>
                        )}

                        {currentStage === 'transport' && (
                            <div className="space-y-4 animate-fadeIn">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center text-white shadow-none sm:shadow-xs shrink-0">
                                            <AirplaneTilt className="w-4 h-4" weight="duotone" />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-bold text-light-text dark:text-dark-text tracking-tight">Step 2: Transport Logistics</h3>
                                            <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary font-medium">Flights, trains, car rental, or drives</p>
                                        </div>
                                    </div>
                                    {transportsList.length > 0 && (
                                        <span className="px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                                            {transportsList.length} {transportsList.length === 1 ? 'Leg' : 'Legs'}
                                        </span>
                                    )}
                                </div>
                                
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
                                                    isSel ? 'bg-white dark:bg-dark-card text-primary-500 border border-primary-500/30 font-bold' : 'bg-black/5 dark:bg-white/5 text-light-text-secondary dark:text-dark-text-secondary'
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
                                                    ? 'bg-white dark:bg-dark-card text-primary-600 dark:text-primary-400 border border-primary-500/30' 
                                                    : 'bg-black/5 dark:bg-white/5 text-light-text-secondary dark:text-dark-text-secondary'
                                                }`}
                                            >
                                                {struct}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {/* Mode-Specific Fields */}
                                <div className="space-y-3 pt-1">
                                    {renderTransportFields()}
                                </div>

                                {/* Add Leg Button */}
                                <div className="flex gap-2">
                                    <GlassButton 
                                        type="button" 
                                        variant={editingTransportIndex !== null ? "primary" : "secondary"}
                                        onClick={handleCommitTransport}
                                        className="flex-1 h-11 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer shadow-none sm:shadow-xs"
                                    >
                                        {editingTransportIndex !== null ? (
                                            <>
                                                <Check className="w-4 h-4" weight="bold" />
                                                <span>Save Leg Changes</span>
                                            </>
                                        ) : (
                                            <>
                                                <Plus className="w-4 h-4" weight="bold" />
                                                <span>+ Add This Transport Leg</span>
                                            </>
                                        )}
                                    </GlassButton>
                                    {editingTransportIndex !== null && (
                                        <GlassButton
                                            type="button"
                                            variant="ghost"
                                            onClick={handleCancelEditTransport}
                                            className="h-11 px-3 text-xs font-bold uppercase tracking-wider cursor-pointer"
                                        >
                                            Cancel
                                        </GlassButton>
                                    )}
                                </div>

                                {/* Multiple Added Transports Stack */}
                                {renderTransportStackList()}

                                <div className="flex gap-2 pt-2">
                                    <GlassButton 
                                        type="button" 
                                        variant="ghost"
                                        onClick={() => setCurrentStage('accommodation')} 
                                        className="px-4 h-12 text-xs font-bold uppercase text-light-text-secondary dark:text-dark-text-secondary cursor-pointer"
                                    >
                                        Skip
                                    </GlassButton>
                                    <GlassButton 
                                        type="button" 
                                        variant="primary"
                                        onClick={() => { 
                                            if (outboundOrigin && transportsList.length === 0) {
                                                handleCommitTransport();
                                            }
                                            setCurrentStage('accommodation'); 
                                        }} 
                                        className="flex-1 h-12 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer shadow-none sm:shadow-xs"
                                    >
                                        <span>Next: Stays</span>
                                        <ArrowRight className="w-4 h-4" />
                                    </GlassButton>
                                </div>
                            </div>
                        )}

                        {currentStage === 'accommodation' && (
                            <div className="space-y-4 animate-fadeIn">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-none sm:shadow-xs shrink-0">
                                            <Bed className="w-4 h-4" weight="duotone" />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-bold text-light-text dark:text-dark-text tracking-tight">Step 3: Accommodations</h3>
                                            <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary font-medium">Hotels, resorts, airbnbs</p>
                                        </div>
                                    </div>
                                    {accommodationsList.length > 0 && (
                                        <span className="px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                            {accommodationsList.length} {accommodationsList.length === 1 ? 'Stay' : 'Stays'}
                                        </span>
                                    )}
                                </div>
                                
                                {/* Stay Type */}
                                <div className="grid grid-cols-4 gap-1.5">
                                    {ACCOMMODATION_TYPES.map(t => (
                                        <button 
                                            key={t} 
                                            type="button" 
                                            onClick={() => setAccType(t)} 
                                            className={`py-2 px-1 rounded-xl text-center text-2xs font-bold uppercase truncate cursor-pointer ${
                                                accType === t ? 'bg-white dark:bg-dark-card text-amber-600 dark:text-amber-400 border border-amber-500/30' : 'bg-black/5 dark:bg-white/5 text-light-text-secondary dark:text-dark-text-secondary'
                                            }`}
                                        >
                                            {t}
                                        </button>
                                    ))}
                                </div>

                                <Input label="Property Name *" placeholder="e.g. Grand Hotel Tremezzo" value={accName} onChange={e => setAccName(e.target.value)} />
                                
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between">
                                        <label className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary flex items-center gap-1">
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
                                        <label className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">Dates & Duration</label>
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
                                    <Input label={`Total Cost (${getCurrencySymbol(activeCurrency)})`} type="number" placeholder="0.00" value={accCost} onChange={e => setAccCost(e.target.value)} />
                                    <Input label="Booking Ref / PNR" placeholder="HTL-882" value={accRef} onChange={e => setAccRef(e.target.value)} />
                                </div>

                                {/* Add Stay Button */}
                                <div className="flex gap-2">
                                    <GlassButton 
                                        type="button" 
                                        variant={editingAccommodationIndex !== null ? "primary" : "secondary"}
                                        onClick={handleCommitAccommodation}
                                        className="flex-1 h-11 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer shadow-none sm:shadow-xs"
                                    >
                                        {editingAccommodationIndex !== null ? (
                                            <>
                                                <Check className="w-4 h-4" weight="bold" />
                                                <span>Save Stay Changes</span>
                                            </>
                                        ) : (
                                            <>
                                                <Plus className="w-4 h-4" weight="bold" />
                                                <span>+ Add This Stay</span>
                                            </>
                                        )}
                                    </GlassButton>
                                    {editingAccommodationIndex !== null && (
                                        <GlassButton
                                            type="button"
                                            variant="ghost"
                                            onClick={handleCancelEditAccommodation}
                                            className="h-11 px-3 text-xs font-bold uppercase tracking-wider cursor-pointer"
                                        >
                                            Cancel
                                        </GlassButton>
                                    )}
                                </div>

                                {/* Multiple Added Stays Stack */}
                                {renderAccommodationStackList()}

                                {/* Mobile Accommodation Finalize & Cost Breakdown */}
                                <div className="p-3.5 rounded-2xl bg-white/70 dark:bg-dark-card/70 space-y-3 border border-black/5 dark:border-white/5 mt-4">
                                    <div className="p-3 rounded-xl bg-black/5 dark:bg-white/5 space-y-1.5 text-xs">
                                        <div className="flex justify-between items-center text-2xs text-light-text-secondary dark:text-dark-text-secondary">
                                            <span>Transports ({transportsList.length})</span>
                                            <span className="font-mono font-bold text-light-text dark:text-dark-text">{formatCurrency(totalTransportCost, activeCurrency)}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-2xs text-light-text-secondary dark:text-dark-text-secondary">
                                            <span>Accommodations ({accommodationsList.length})</span>
                                            <span className="font-mono font-bold text-light-text dark:text-dark-text">{formatCurrency(totalAccommodationCost, activeCurrency)}</span>
                                        </div>
                                        <div className="flex justify-between items-center pt-1.5 border-t border-black/10 dark:border-white/10">
                                            <span className="font-bold uppercase tracking-wider text-2xs text-light-text dark:text-dark-text">Total Expedition Cost</span>
                                            <span className="font-mono font-black text-sm text-primary-600 dark:text-primary-400">
                                                {formatCurrency(totalEstimatedCost, activeCurrency)}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-2">
                                    <GlassButton 
                                        type="button" 
                                        variant="primary"
                                        onClick={() => { 
                                            if (accName && accommodationsList.length === 0) {
                                                handleCommitAccommodation();
                                            }
                                            handleFinalizeTrip(); 
                                        }} 
                                        disabled={isSaving || !title || !startDate || !endDate}
                                        className="w-full h-12 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-none sm:shadow-xs disabled:opacity-50"
                                    >
                                        <span>{isSaving ? 'Creating Expedition...' : 'Launch Expedition'}</span>
                                        <Check className="w-4 h-4" weight="bold" />
                                    </GlassButton>
                                </div>
                            </div>
                        )}
                    </div>
        </div>
    );
};

export default TripSetupBoard;
