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
    Receipt
} from '@phosphor-icons/react';
import { Input, Autocomplete, TimeInput } from './ui';
import GlassPanel from './glass/GlassPanel';
import { Trip, Transport, Accommodation, TransportMode, User } from '../types';
import { dataService } from '../services/mockDb';
import { invalidateGlobalWanderCache } from '../hooks/useWanderSync';
import { searchLocations, getCoordinates } from '../services/geocoding';
import { searchLocationSuggestions, ParsedLocationItem } from '../services/locationParser';
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
    CLOSE_BTN_STYLE 
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
    const [transportStructure, setTransportStructure] = useState<'Round Trip' | 'One-Way' | 'Multi-City'>('Round Trip');
    const [transportsList, setTransportsList] = useState<Partial<Transport>[]>([]);
    const [outboundOrigin, setOutboundOrigin] = useState('');
    const [outboundDest, setOutboundDest] = useState('');
    const [outboundDate, setOutboundDate] = useState('');
    const [outboundTime, setOutboundTime] = useState('10:00');
    const [outboundCarrier, setOutboundCarrier] = useState('');
    const [outboundNumber, setOutboundNumber] = useState('');
    const [outboundCost, setOutboundCost] = useState('');
    const [outboundConfCode, setOutboundConfCode] = useState('');
    const [hasReturnLeg, setHasReturnLeg] = useState(true);
    const [returnDate, setReturnDate] = useState('');
    const [returnTime, setReturnTime] = useState('14:00');
    const [returnNumber, setReturnNumber] = useState('');

    // Stage 3: Accommodation Sub-Steps State
    const [accommodationsList, setAccommodationsList] = useState<Partial<Accommodation>[]>([]);
    const [accType, setAccType] = useState('Hotel');
    const [accName, setAccName] = useState('');
    const [accAddress, setAccAddress] = useState('');
    const [accCheckIn, setAccCheckIn] = useState('');
    const [accCheckOut, setAccCheckOut] = useState('');
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

    if (!isOpen) return null;

    // Helper for location suggestions
    const fetchLocationSuggestions = async (query: string) => {
        if (!query || query.length < 2) return [];
        return searchLocations(query);
    };

    const handleDestinationChange = (val: string) => {
        setDestination(val);
        getCoordinates(val).then(c => {
            if (c) setDestinationCoords(c);
        }).catch(() => {});
    };

    // Transition from Basics to subsequent stages
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
        if (!outboundDate) setOutboundDate(startDate);
        if (!returnDate) setReturnDate(endDate);

        if (!accName) setAccName(`${destination} Stay`);
        if (!accAddress) setAccAddress(destination);
        if (!accCheckIn) setAccCheckIn(startDate);
        if (!accCheckOut) setAccCheckOut(endDate);

        if (!actDate) setActDate(startDate);
        if (!actLocation) setActLocation(destination);

        // Resolve destination coordinates in background
        if (!destinationCoords) {
            getCoordinates(destination).then(c => {
                if (c) setDestinationCoords(c);
            }).catch(() => {});
        }

        setCurrentStage('transport');
    };

    // Add or stack transport into column
    const handleCommitTransport = () => {
        const costNum = parseFloat(outboundCost) || undefined;
        const newTransports: Partial<Transport>[] = [];

        // Outbound
        newTransports.push({
            id: crypto.randomUUID(),
            itineraryId: crypto.randomUUID(),
            mode: transportMode,
            type: transportStructure,
            origin: outboundOrigin || 'Origin',
            destination: outboundDest || destination,
            departureDate: outboundDate || startDate,
            departureTime: outboundTime,
            arrivalDate: outboundDate || startDate,
            arrivalTime: '14:00',
            provider: outboundCarrier,
            identifier: outboundNumber,
            confirmationCode: outboundConfCode.toUpperCase(),
            cost: costNum ? (hasReturnLeg && transportStructure === 'Round Trip' ? costNum / 2 : costNum) : undefined
        });

        // Return Leg if round-trip
        if (transportStructure === 'Round Trip' && hasReturnLeg) {
            newTransports.push({
                id: crypto.randomUUID(),
                itineraryId: newTransports[0].itineraryId,
                mode: transportMode,
                type: 'Round Trip',
                origin: outboundDest || destination,
                destination: outboundOrigin || 'Origin',
                departureDate: returnDate || endDate,
                departureTime: returnTime,
                arrivalDate: returnDate || endDate,
                arrivalTime: '18:00',
                provider: outboundCarrier,
                identifier: returnNumber || outboundNumber,
                confirmationCode: outboundConfCode.toUpperCase(),
                cost: costNum ? costNum / 2 : undefined
            });
        }

        setTransportsList(prev => [...prev, ...newTransports]);
        // Reset form for optional another leg or proceed
        setOutboundNumber('');
        setOutboundCost('');
    };

    // Add or stack accommodation into column
    const handleCommitAccommodation = () => {
        if (!accName.trim()) return;
        const newAcc: Partial<Accommodation> = {
            id: crypto.randomUUID(),
            name: accName,
            type: accType,
            address: accAddress || destination,
            checkInDate: accCheckIn || startDate,
            checkOutDate: accCheckOut || endDate,
            checkInTime: '15:00',
            checkOutTime: '11:00',
            cost: parseFloat(accCost) || undefined,
            confirmationCode: accRef
        };
        setAccommodationsList(prev => [...prev, newAcc]);
        setAccName('');
        setAccCost('');
        setAccRef('');
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
                    cost: a.cost
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
                                    // Collapsed Summary Badge
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
                                    // Expanded Form
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
                                                onChange={setDestination} 
                                                fetchSuggestions={fetchLocationSuggestions} 
                                                onSelectCoordinate={handleDestinationSelect}
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
                                                className={`${BTN_PRIMARY_STYLE} w-full h-11 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-md`}
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
                        {/* COLUMN 2: TRANSPORT (Progressive Sub-Steps) */}
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
                                {/* Sub-step 2a: Method Picker (Big visual cards for Flight, Train, Ferry, Bus, Rental, Car, Cruise) */}
                                <div className="space-y-1.5">
                                    <label className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary">Sub-step 2a: Method</label>
                                    <div className="grid grid-cols-4 gap-1.5">
                                        {TRANSPORT_MODES.map(m => {
                                            const IconM = m.icon;
                                            const isSel = transportMode === m.mode;
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
                                <div className="space-y-1.5">
                                    <label className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary">Sub-step 2b: Routing</label>
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
                                    <div className="grid grid-cols-2 gap-2 pt-1">
                                        <Input placeholder="Origin (e.g. JFK)" value={outboundOrigin} onChange={e => setOutboundOrigin(e.target.value)} />
                                        <Input placeholder="Destination" value={outboundDest || destination} onChange={e => setOutboundDest(e.target.value)} />
                                    </div>
                                </div>

                                {/* Sub-step 2c: Logistics & Details */}
                                <div className="space-y-2 p-3 rounded-2xl bg-white/70 dark:bg-dark-card/70 border border-black/5 dark:border-white/5">
                                    <span className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary block">Sub-step 2c: Details</span>
                                    <div className="grid grid-cols-2 gap-2">
                                        <Input label="Carrier" placeholder="e.g. Delta, Eurostar" value={outboundCarrier} onChange={e => setOutboundCarrier(e.target.value)} />
                                        <Input label="Service / #" placeholder="e.g. DL 402" value={outboundNumber} onChange={e => setOutboundNumber(e.target.value)} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <Input label="Date" type="date" value={outboundDate || startDate} onChange={e => setOutboundDate(e.target.value)} />
                                        <TimeInput label="Time" value={outboundTime} onChange={setOutboundTime} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <Input label="Total Cost" type="number" placeholder="0.00" value={outboundCost} onChange={e => setOutboundCost(e.target.value)} />
                                        <Input label="PNR / Ref" placeholder="XYZ123" value={outboundConfCode} onChange={e => setOutboundConfCode(e.target.value)} />
                                    </div>
                                </div>

                                {/* Sub-step 2d: Summary & Stacking */}
                                <div className="space-y-2 pt-1">
                                    <button 
                                        type="button" 
                                        onClick={handleCommitTransport}
                                        className={`${BTN_SECONDARY_STYLE} w-full h-10 text-2xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5`}
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                        <span>+ Add This Transport Leg</span>
                                    </button>

                                    {transportsList.length > 0 && (
                                        <div className="space-y-1.5 pt-2">
                                            {transportsList.map((t, tidx) => (
                                                <div key={t.id || tidx} className="p-2.5 rounded-xl bg-white/80 dark:bg-dark-card/80 border border-black/5 text-xs flex items-center justify-between shadow-xs">
                                                    <div>
                                                        <span className="font-bold text-primary-500">{t.origin} &rarr; {t.destination}</span>
                                                        <p className="text-2xs text-light-text-secondary">{t.provider} {t.identifier} ({t.departureDate})</p>
                                                    </div>
                                                    {t.cost && <span className="font-mono font-bold text-2xs">{formatCurrency(t.cost)}</span>}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <div className="flex gap-2 pt-2">
                                        <button 
                                            type="button"
                                            onClick={() => setCurrentStage('accommodation')}
                                            className="px-3 h-11 text-2xs text-light-text-secondary hover:text-light-text font-bold uppercase transition-colors"
                                        >
                                            Skip
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={() => {
                                                if (outboundOrigin && outboundDest && transportsList.length === 0) {
                                                    handleCommitTransport();
                                                }
                                                setCurrentStage('accommodation');
                                            }}
                                            className={`${BTN_PRIMARY_STYLE} flex-1 h-11 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1`}
                                        >
                                            <span>Proceed to Stay</span>
                                            <ArrowRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </GlassPanel>

                        {/* ============================================================== */}
                        {/* COLUMN 3: ACCOMMODATIONS (Progressive Sub-Steps) */}
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
                                    <label className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary">Sub-step 3a: Type</label>
                                    <div className="grid grid-cols-5 gap-1.5">
                                        {['Hotel', 'Apartment', 'Villa', 'Resort', 'Hostel'].map(t => (
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

                                {/* Sub-step 3b: Dates & Location */}
                                <div className="space-y-2">
                                    <label className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary">Sub-step 3b: Location & Dates</label>
                                    <Input placeholder="Property / Hotel Name" value={accName} onChange={e => setAccName(e.target.value)} />
                                    <Autocomplete placeholder="Address / Area" value={accAddress} onChange={setAccAddress} fetchSuggestions={fetchLocationSuggestions} />
                                    <div className="grid grid-cols-2 gap-2">
                                        <Input label="Check In" type="date" value={accCheckIn || startDate} onChange={e => setAccCheckIn(e.target.value)} />
                                        <Input label="Check Out" type="date" value={accCheckOut || endDate} min={accCheckIn || startDate} onChange={e => setAccCheckOut(e.target.value)} />
                                    </div>
                                </div>

                                {/* Sub-step 3c: Room & Cost */}
                                <div className="space-y-2 p-3 rounded-2xl bg-white/70 dark:bg-dark-card/70 border border-black/5 dark:border-white/5">
                                    <span className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary block">Sub-step 3c: Cost & Ref</span>
                                    <div className="grid grid-cols-2 gap-2">
                                        <Input label="Total Cost" type="number" placeholder="0.00" value={accCost} onChange={e => setAccCost(e.target.value)} />
                                        <Input label="Booking Ref" placeholder="HTL-882" value={accRef} onChange={e => setAccRef(e.target.value)} />
                                    </div>
                                </div>

                                {/* Stacking and Proceed */}
                                <div className="space-y-2 pt-1">
                                    <button 
                                        type="button" 
                                        onClick={handleCommitAccommodation}
                                        className={`${BTN_SECONDARY_STYLE} w-full h-10 text-2xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5`}
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                        <span>+ Add This Stay</span>
                                    </button>

                                    {accommodationsList.length > 0 && (
                                        <div className="space-y-1.5 pt-2">
                                            {accommodationsList.map((a, aidx) => (
                                                <div key={a.id || aidx} className="p-2.5 rounded-xl bg-white/80 dark:bg-dark-card/80 border border-black/5 text-xs flex items-center justify-between shadow-xs">
                                                    <div>
                                                        <span className="font-bold text-amber-600 dark:text-amber-400">{a.name}</span>
                                                        <p className="text-2xs text-light-text-secondary">{formatDateRange(a.checkInDate, a.checkOutDate)}</p>
                                                    </div>
                                                    {a.cost && <span className="font-mono font-bold text-2xs">{formatCurrency(a.cost)}</span>}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <div className="flex gap-2 pt-2">
                                        <button 
                                            type="button"
                                            onClick={() => setCurrentStage('review')}
                                            className="px-3 h-11 text-2xs text-light-text-secondary hover:text-light-text font-bold uppercase transition-colors"
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
                                            className={`${BTN_PRIMARY_STYLE} flex-1 h-11 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1`}
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
                                </div>

                                <div className="pt-4">
                                    <button 
                                        type="button" 
                                        onClick={handleFinalizeTrip}
                                        disabled={isSaving || !title || !startDate || !endDate}
                                        className={`${BTN_PRIMARY_STYLE} w-full h-12 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-primary-500/20 active:scale-95 disabled:opacity-50`}
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
                                <Autocomplete label="Destination *" placeholder="e.g. Lake Como, Italy" value={destination} onChange={setDestination} fetchSuggestions={fetchLocationSuggestions} />
                                <div className="grid grid-cols-2 gap-3">
                                    <Input label="Start Date *" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                                    <Input label="End Date *" type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} />
                                </div>
                                <button type="button" onClick={handleCompleteBasics} className={`${BTN_PRIMARY_STYLE} w-full h-12 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2`}>
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
                                <div className="grid grid-cols-4 gap-2">
                                    {TRANSPORT_MODES.map(m => (
                                        <button
                                            key={m.mode}
                                            type="button"
                                            onClick={() => setTransportMode(m.mode)}
                                            className={`p-2.5 rounded-xl flex flex-col items-center justify-center text-center transition-all ${transportMode === m.mode ? 'bg-white text-primary-500 shadow-sm border border-primary-500/30 font-bold' : 'bg-black/5 text-light-text-secondary'}`}
                                        >
                                            <m.icon className="w-5 h-5 mb-1" />
                                            <span className="text-[10px] font-semibold uppercase tracking-tight leading-tight">{m.label}</span>
                                        </button>
                                    ))}
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <Input label="Origin" placeholder="From where?" value={outboundOrigin} onChange={e => setOutboundOrigin(e.target.value)} />
                                    <Input label="Destination" placeholder="To where?" value={outboundDest || destination} onChange={e => setOutboundDest(e.target.value)} />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <Input label="Carrier" placeholder="e.g. Airline / Train" value={outboundCarrier} onChange={e => setOutboundCarrier(e.target.value)} />
                                    <Input label="Flight / Line #" placeholder="e.g. 104" value={outboundNumber} onChange={e => setOutboundNumber(e.target.value)} />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <Input label="Date" type="date" value={outboundDate || startDate} onChange={e => setOutboundDate(e.target.value)} />
                                    <TimeInput label="Time" value={outboundTime} onChange={setOutboundTime} />
                                </div>
                                <Input label="Estimated Cost" type="number" placeholder="0.00" value={outboundCost} onChange={e => setOutboundCost(e.target.value)} />
                                <div className="flex gap-2 pt-2">
                                    <button type="button" onClick={() => setCurrentStage('accommodation')} className="px-4 h-12 text-xs font-bold uppercase text-light-text-secondary">Skip</button>
                                    <button type="button" onClick={() => { handleCommitTransport(); setCurrentStage('accommodation'); }} className={`${BTN_PRIMARY_STYLE} flex-1 h-12 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1`}>
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
                                <div className="grid grid-cols-3 gap-2">
                                    {['Hotel', 'Apartment', 'Villa', 'Resort', 'Hostel'].map(t => (
                                        <button key={t} type="button" onClick={() => setAccType(t)} className={`py-2 px-1 rounded-xl text-center text-2xs font-bold uppercase ${accType === t ? 'bg-white text-amber-600 shadow-sm border border-amber-500/30' : 'bg-black/5 text-light-text-secondary'}`}>
                                            {t}
                                        </button>
                                    ))}
                                </div>
                                <Input label="Property Name" placeholder="e.g. Grand Hotel Tremezzo" value={accName} onChange={e => setAccName(e.target.value)} />
                                <div className="grid grid-cols-2 gap-3">
                                    <Input label="Check In" type="date" value={accCheckIn || startDate} onChange={e => setAccCheckIn(e.target.value)} />
                                    <Input label="Check Out" type="date" value={accCheckOut || endDate} min={accCheckIn || startDate} onChange={e => setAccCheckOut(e.target.value)} />
                                </div>
                                <Input label="Total Cost" type="number" placeholder="0.00" value={accCost} onChange={e => setAccCost(e.target.value)} />
                                <div className="flex gap-2 pt-2">
                                    <button type="button" onClick={() => setCurrentStage('review')} className="px-4 h-12 text-xs font-bold uppercase text-light-text-secondary">Skip</button>
                                    <button type="button" onClick={() => { if (accName) handleCommitAccommodation(); setCurrentStage('review'); }} className={`${BTN_PRIMARY_STYLE} flex-1 h-12 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1`}>
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
                                <button type="button" onClick={handleFinalizeTrip} disabled={isSaving} className={`${BTN_PRIMARY_STYLE} w-full h-12 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-primary-500/20`}>
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
