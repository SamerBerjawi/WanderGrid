import React, { useState, useEffect } from 'react';
import { 
    Trash, 
    Plus, 
    Receipt, 
    WarningCircle,
    Check,
    X,
    CalendarBlank
} from '@phosphor-icons/react';
import { Button, Input } from './ui';
import { Transport, TransportMode } from '../types';
import { dataService } from '../services/mockDb';
import { 
    TripType, 
    SegmentForm, 
    CarForm, 
    AirportData, 
    AirlineData, 
    TRANSPORT_MODES, 
    createDefaultSegment 
} from './transport/transportTypes';
import { FlightForm } from './transport/FlightForm';
import { TrainForm } from './transport/TrainForm';
import { BusForm } from './transport/BusForm';
import { CarRentalForm } from './transport/CarRentalForm';
import { PersonalCarForm } from './transport/PersonalCarForm';
import { CruiseForm } from './transport/CruiseForm';
import { getCurrencySymbol } from '../utils/formatters';
import { STATUS_DANGER_STYLE, BTN_PRIMARY_STYLE, BTN_SECONDARY_STYLE, BTN_DANGER_STYLE } from '../constants';

export interface TransportConfiguratorProps {
    initialData?: Transport[];
    onSave: (transports: Transport[]) => void;
    onDelete?: (ids: string[]) => void;
    onCancel: () => void;
    defaultStartDate?: string;
    defaultEndDate?: string;
}

export const TransportConfigurator: React.FC<TransportConfiguratorProps> = ({
    initialData,
    onSave,
    onDelete,
    onCancel,
    defaultStartDate,
    defaultEndDate
}) => {
    const [mode, setMode] = useState<TransportMode>('Flight');
    const [tripType, setTripType] = useState<TripType>('Round Trip');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [currencySymbol, setCurrencySymbol] = useState('$');
    const [apiKey, setApiKey] = useState<string>('');
    const [brandfetchKey, setBrandfetchKey] = useState<string>('');

    const [bookingCost, setBookingCost] = useState<string>('');
    const [bookingRef, setBookingRef] = useState<string>('');

    const [segments, setSegments] = useState<SegmentForm[]>([
        createDefaultSegment({ section: 'outbound', date: defaultStartDate || '', arrivalDate: defaultStartDate || '' }),
        createDefaultSegment({ section: 'return', date: defaultEndDate || '', arrivalDate: defaultEndDate || '' })
    ]);

    const [airportList, setAirportList] = useState<AirportData[]>([]);
    const [airlineList, setAirlineList] = useState<AirlineData[]>([]);

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
        cost: undefined,
        website: undefined,
        distance: undefined,
        logoUrl: undefined,
        notes: ''
    });

    // Load workspace settings
    useEffect(() => {
        dataService.getWorkspaceSettings().then(s => {
            if (s) {
                if (s.currency) setCurrencySymbol(getCurrencySymbol(s.currency));
                if (s.aviationstackApiKey) setApiKey(s.aviationstackApiKey);
                if (s.brandfetchApiKey) setBrandfetchKey(s.brandfetchApiKey);
                if (s.defaultLandTransportMethod && (!initialData || initialData.length === 0)) {
                    setMode(s.defaultLandTransportMethod);
                }
            }
        }).catch(err => console.warn("Failed to load settings:", err));
    }, []);

    // Hydrate from initialData
    useEffect(() => {
        if (initialData && initialData.length > 0) {
            const first = initialData[0];
            setMode(first.mode || 'Flight');
            setBookingRef(first.confirmationCode || '');

            // Unify cost calculation
            const totalInitialCost = initialData.reduce((acc, curr) => acc + (curr.cost || 0), 0);
            if (totalInitialCost > 0) {
                setBookingCost(totalInitialCost.toString());
            } else if (first.cost !== undefined) {
                setBookingCost(first.cost.toString());
            }

            if (first.mode === 'Car Rental' || first.mode === 'Personal Car') {
                setCarForm({
                    pickupLocation: first.pickupLocation || first.origin || '',
                    dropoffLocation: first.dropoffLocation || first.destination || '',
                    pickupDate: first.departureDate || '',
                    pickupTime: first.departureTime || '10:00',
                    dropoffDate: first.arrivalDate || first.departureDate || '',
                    dropoffTime: first.arrivalTime || '10:00',
                    duration: first.duration || 0,
                    agency: first.provider || '',
                    model: first.vehicleModel || '',
                    confirmationCode: first.confirmationCode || '',
                    cost: first.cost,
                    website: first.website,
                    distance: first.distance,
                    logoUrl: first.logoUrl,
                    notes: first.notes || ''
                });
            } else {
                if (first.type) setTripType(first.type as TripType);

                const sortedData = [...initialData].sort((a, b) => {
                    const dateA = new Date(`${a.departureDate}T${a.departureTime || '00:00'}`).getTime();
                    const dateB = new Date(`${b.departureDate}T${b.departureTime || '00:00'}`).getTime();
                    return dateA - dateB;
                });

                const mapped: SegmentForm[] = sortedData.map((f, idx) => {
                    let providerName = f.provider || '';
                    let providerCode = '';
                    
                    // Safe hydration: check f.provider with null guard
                    if (f.provider) {
                        const splitMatch = f.provider.match(/^(.*) - ([A-Z0-9]{2,3})$/);
                        if (splitMatch) {
                            providerName = splitMatch[1];
                            providerCode = splitMatch[2];
                        }
                    }

                    let section: 'outbound' | 'return' = 'outbound';
                    if (first.type === 'Round Trip') {
                        if (idx > 0) section = 'return';
                    }

                    return {
                        id: f.id || crypto.randomUUID(),
                        origin: f.origin || '',
                        destination: f.destination || '',
                        date: f.departureDate || '',
                        time: f.departureTime || '10:00',
                        actualDepartureTime: f.actualDepartureTime || '',
                        arrivalDate: f.arrivalDate || f.departureDate || '',
                        arrivalTime: f.arrivalTime || '14:00',
                        actualArrivalTime: f.actualArrivalTime || '',
                        duration: f.duration || 120,
                        provider: providerName,
                        providerCode: providerCode,
                        identifier: f.identifier || '',
                        travelClass: f.travelClass || 'Economy',
                        seatType: f.seatType || 'Window',
                        seatNumber: f.seatNumber || '',
                        isExitRow: f.isExitRow || false,
                        section,
                        departureTerminal: f.departureTerminal || '',
                        departureGate: f.departureGate || '',
                        arrivalTerminal: f.arrivalTerminal || '',
                        arrivalGate: f.arrivalGate || '',
                        tailNumber: f.tailNumber || '',
                        cabin: (f as any).cabin || '',
                        isApproximate: f.isApproximate || false,
                        approximateYear: f.approximateYear || new Date().getFullYear(),
                        customFields: f.customFields || [],
                        distance: f.distance,
                        logoUrl: f.logoUrl,
                        website: f.website
                    };
                });
                setSegments(mapped);
            }
        }
    }, [initialData]);

    const handleModeChange = (newMode: TransportMode) => {
        setMode(newMode);
        if (newMode === 'Flight') {
            if (!['Round Trip', 'One-Way', 'Multi-City'].includes(tripType)) setTripType('Round Trip');
        } else if (newMode === 'Train' || newMode === 'Bus' || newMode === 'Cruise' || newMode === 'Ferry') {
            if (tripType === 'Multi-City') setTripType('Round Trip');
        }
    };

    const handleTripTypeChange = (type: TripType) => {
        setTripType(type);
        if (type === 'One-Way') {
            const existingFirst = segments[0] || createDefaultSegment({ section: 'outbound', date: defaultStartDate || '' });
            setSegments([{ ...existingFirst, section: 'outbound' }]);
        } else if (type === 'Round Trip') {
            const existingFirst = segments[0] || createDefaultSegment({ section: 'outbound', date: defaultStartDate || '' });
            const existingSecond = segments[1] || createDefaultSegment({ 
                section: 'return', 
                origin: existingFirst.destination, 
                destination: existingFirst.origin, 
                date: defaultEndDate || existingFirst.date 
            });
            setSegments([
                { ...existingFirst, section: 'outbound' },
                { ...existingSecond, section: 'return', origin: existingSecond.origin || existingFirst.destination, destination: existingSecond.destination || existingFirst.origin }
            ]);
        } else if (type === 'Multi-City') {
            if (segments.length < 2) {
                setSegments([
                    segments[0] || createDefaultSegment({ section: 'outbound', date: defaultStartDate || '' }),
                    createDefaultSegment({ section: 'outbound', date: defaultEndDate || '' })
                ]);
            }
        }
    };

    const updateSegment = (index: number, updates: Partial<SegmentForm>) => {
        const newSegments = [...segments];
        newSegments[index] = { ...newSegments[index], ...updates };

        // Auto mirror round trip endpoints
        if (tripType === 'Round Trip' && index === 0 && newSegments.length === 2) {
            if (updates.origin) newSegments[1].destination = updates.origin;
            if (updates.destination) newSegments[1].origin = updates.destination;
            if (updates.date && !newSegments[1].date) {
                newSegments[1].date = updates.date;
                newSegments[1].arrivalDate = updates.date;
            }
        }
        setSegments(newSegments);
    };

    const addSegment = () => {
        const lastSeg = segments[segments.length - 1];
        setSegments([
            ...segments,
            createDefaultSegment({
                section: 'outbound',
                origin: lastSeg ? lastSeg.destination : '',
                date: lastSeg ? lastSeg.arrivalDate || lastSeg.date : defaultEndDate || ''
            })
        ]);
    };

    const removeSegment = (index: number) => {
        if (segments.length <= 1) return;
        setSegments(segments.filter((_, idx) => idx !== index));
    };

    const isCar = mode === 'Car Rental' || mode === 'Personal Car';
    const isValid = isCar 
        ? Boolean(carForm.pickupLocation && carForm.pickupDate)
        : segments.every(s => s.origin && s.destination && (s.date || s.isApproximate));

    const handleSave = () => {
        // Use crypto.randomUUID() instead of Math.random
        const itineraryId = (initialData && initialData.length > 0 && initialData[0].itineraryId) 
            ? initialData[0].itineraryId 
            : crypto.randomUUID();

        if (isCar) {
            const t: Transport = {
                id: (initialData && initialData.length > 0 && initialData[0].id) ? initialData[0].id : crypto.randomUUID(),
                itineraryId,
                type: 'One-Way',
                mode: mode,
                provider: carForm.agency || (mode === 'Personal Car' ? 'Personal Vehicle' : 'Rental Agency'),
                identifier: carForm.model || '',
                confirmationCode: carForm.confirmationCode || '',
                origin: carForm.pickupLocation,
                departureDate: carForm.pickupDate,
                departureTime: carForm.pickupTime || '10:00',
                pickupLocation: carForm.pickupLocation,
                destination: carForm.dropoffLocation || carForm.pickupLocation,
                arrivalDate: carForm.dropoffDate || carForm.pickupDate,
                arrivalTime: carForm.dropoffTime || '10:00',
                dropoffLocation: carForm.dropoffLocation || carForm.pickupLocation,
                vehicleModel: carForm.model,
                cost: carForm.cost,
                website: carForm.website,
                reason: 'Personal',
                distance: carForm.distance,
                duration: carForm.duration,
                logoUrl: carForm.logoUrl,
                notes: carForm.notes
            };
            onSave([t]);
        } else {
            const parsedCost = parseFloat(bookingCost);
            const totalCost = isNaN(parsedCost) ? 0 : parsedCost;
            // Equal distribution across legs to prevent leg 0 taking 100% and leg 1 taking $0
            const costPerLeg = segments.length > 0 ? (totalCost / segments.length) : 0;

            const transports: Transport[] = segments.map((seg, idx) => {
                const existingId = initialData?.find(f => f.id === seg.id)?.id;
                return {
                    id: existingId || crypto.randomUUID(),
                    itineraryId,
                    type: tripType,
                    mode: mode,
                    provider: seg.provider,
                    identifier: seg.identifier,
                    confirmationCode: bookingRef.toUpperCase(),
                    origin: seg.origin.includes(' - ') ? seg.origin.split(' - ')[0] : seg.origin,
                    destination: seg.destination.includes(' - ') ? seg.destination.split(' - ')[0] : seg.destination,
                    // Prevent approximate dates from polluting Jan 1 with synthetic strings
                    departureDate: seg.isApproximate ? (seg.date || '') : seg.date,
                    departureTime: seg.isApproximate ? '' : (seg.time || '10:00'),
                    actualDepartureTime: seg.isApproximate ? '' : (seg.actualDepartureTime || ''),
                    arrivalDate: seg.isApproximate ? (seg.arrivalDate || seg.date || '') : (seg.arrivalDate || seg.date),
                    arrivalTime: seg.isApproximate ? '' : (seg.arrivalTime || '14:00'),
                    actualArrivalTime: seg.isApproximate ? '' : (seg.actualArrivalTime || ''),
                    travelClass: seg.travelClass as any,
                    seatNumber: seg.seatNumber,
                    seatType: seg.seatType as any,
                    isExitRow: seg.isExitRow,
                    reason: 'Personal',
                    cost: costPerLeg,
                    website: seg.website,
                    distance: seg.distance,
                    duration: seg.duration,
                    logoUrl: seg.logoUrl,
                    departureTerminal: seg.departureTerminal,
                    departureGate: seg.departureGate,
                    arrivalTerminal: seg.arrivalTerminal,
                    arrivalGate: seg.arrivalGate,
                    tailNumber: seg.tailNumber,
                    isApproximate: seg.isApproximate,
                    approximateYear: seg.approximateYear,
                    customFields: seg.customFields
                };
            });
            onSave(transports);
        }
    };

    if (showDeleteConfirm) {
        return (
            <div className="text-center space-y-6 animate-fade-in py-8">
                <div className="w-20 h-20 bg-semantic-red/15 rounded-full flex items-center justify-center mx-auto text-semantic-red animate-pulse">
                    <Trash className="w-10 h-10" weight="duotone" />
                </div>
                <div>
                    <h4 className="text-xl font-bold text-light-text dark:text-dark-text">Delete Transport Booking?</h4>
                    <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mt-2">
                        This will remove the current booking and all associated legs.
                    </p>
                </div>
                <div className="flex gap-3 pt-2 max-w-xs mx-auto">
                    <button 
                        type="button" 
                        className={`${BTN_SECONDARY_STYLE} flex-1 h-12`} 
                        onClick={() => setShowDeleteConfirm(false)}
                    >
                        Cancel
                    </button>
                    <button 
                        type="button" 
                        className={`${BTN_DANGER_STYLE} flex-1 h-12`} 
                        onClick={() => { if (onDelete && initialData) onDelete(initialData.map(f => f.id)); }}
                    >
                        Confirm Delete
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in max-h-[80vh] overflow-y-auto custom-scrollbar p-1">
            
            {/* Mode Selector Pill Bar - Derived from single source of truth TRANSPORT_MODES */}
            <div className="bg-black/5 dark:bg-white/5 p-1.5 rounded-2xl flex gap-1 overflow-x-auto border border-black/5 dark:border-white/5">
                {TRANSPORT_MODES.map(m => {
                    const ModeIcon = m.icon;
                    const isActive = mode === m.mode || (m.mode === 'Cruise' && mode === 'Ferry');
                    return (
                        <button
                            type="button"
                            key={m.mode}
                            onClick={() => handleModeChange(m.mode)}
                            className={`flex-1 flex flex-col items-center justify-center py-2.5 px-3 rounded-xl transition-all min-w-[72px] min-h-[44px] cursor-pointer ${
                                isActive
                                ? 'bg-white dark:bg-dark-card shadow-sm text-primary-600 dark:text-primary-400 font-bold'
                                : 'text-light-text-secondary dark:text-dark-text-secondary hover:bg-black/5 dark:hover:bg-white/5'
                            }`}
                        >
                            <ModeIcon className="w-5 h-5 mb-1" weight={isActive ? "duotone" : "regular"} />
                            <span className="text-2xs font-bold uppercase tracking-wider">{m.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* Trip Type Selector (Round Trip, One-Way, Multi-City) for multi-segment modes */}
            {!isCar && (
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1 bg-black/5 dark:bg-white/5 p-1 rounded-xl border border-black/5 dark:border-white/5">
                        {(['Round Trip', 'One-Way', 'Multi-City'] as TripType[]).map(type => {
                            if (mode !== 'Flight' && type === 'Multi-City') return null;
                            const isActive = tripType === type;
                            return (
                                <button
                                    type="button"
                                    key={type}
                                    onClick={() => handleTripTypeChange(type)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                                        isActive
                                        ? 'bg-white dark:bg-dark-card text-primary-500 shadow-sm'
                                        : 'text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text'
                                    }`}
                                >
                                    {type}
                                </button>
                            );
                        })}
                    </div>

                    {tripType === 'Multi-City' && (
                        <button 
                            type="button"
                            onClick={addSegment}
                            className="px-3 py-1.5 rounded-xl bg-primary-500/10 hover:bg-primary-500/20 text-primary-600 dark:text-primary-400 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                            <Plus className="w-3.5 h-3.5" weight="bold" />
                            <span>Add Leg</span>
                        </button>
                    )}
                </div>
            )}

            {/* Mode-Specific Subcomponent Rendering */}
            {mode === 'Flight' && (
                <div className="space-y-4">
                    {segments.map((seg, idx) => (
                        <FlightForm 
                            key={seg.id}
                            segment={seg}
                            index={idx}
                            totalSegments={segments.length}
                            tripType={tripType}
                            apiKey={apiKey}
                            brandfetchKey={brandfetchKey}
                            onUpdate={updates => updateSegment(idx, updates)}
                            onRemove={() => removeSegment(idx)}
                            airlineList={airlineList}
                            airportList={airportList}
                        />
                    ))}
                </div>
            )}

            {mode === 'Train' && (
                <div className="space-y-4">
                    {segments.map((seg, idx) => (
                        <TrainForm 
                            key={seg.id}
                            segment={seg}
                            index={idx}
                            totalSegments={segments.length}
                            tripType={tripType}
                            onUpdate={updates => updateSegment(idx, updates)}
                            onRemove={() => removeSegment(idx)}
                        />
                    ))}
                </div>
            )}

            {mode === 'Bus' && (
                <div className="space-y-4">
                    {segments.map((seg, idx) => (
                        <BusForm 
                            key={seg.id}
                            segment={seg}
                            index={idx}
                            totalSegments={segments.length}
                            tripType={tripType}
                            onUpdate={updates => updateSegment(idx, updates)}
                            onRemove={() => removeSegment(idx)}
                        />
                    ))}
                </div>
            )}

            {(mode === 'Cruise' || mode === 'Ferry') && (
                <div className="space-y-4">
                    {segments.map((seg, idx) => (
                        <CruiseForm 
                            key={seg.id}
                            segment={seg}
                            index={idx}
                            totalSegments={segments.length}
                            tripType={tripType}
                            onUpdate={updates => updateSegment(idx, updates)}
                            onRemove={() => removeSegment(idx)}
                        />
                    ))}
                </div>
            )}

            {mode === 'Car Rental' && (
                <CarRentalForm 
                    form={carForm}
                    currencySymbol={currencySymbol}
                    onUpdate={updates => setCarForm(prev => ({ ...prev, ...updates }))}
                />
            )}

            {mode === 'Personal Car' && (
                <PersonalCarForm 
                    form={carForm}
                    currencySymbol={currencySymbol}
                    onUpdate={updates => setCarForm(prev => ({ ...prev, ...updates }))}
                />
            )}

            {/* Booking Reference & Cost Bar for non-car transports */}
            {!isCar && (
                <div className="p-5 rounded-3xl bg-light-fill dark:bg-dark-fill/50 border border-black/10 dark:border-white/5 space-y-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block">
                        Booking Reference & Financials
                    </span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input 
                            label="Confirmation Code" 
                            placeholder="e.g. 6-letter PNR (e.g. W9Q7KL)" 
                            value={bookingRef} 
                            onChange={e => setBookingRef(e.target.value.toUpperCase())} 
                            className="font-mono uppercase font-bold"
                        />
                        <div className="relative">
                            <Input 
                                label="Total Itinerary Cost" 
                                type="number" 
                                placeholder="0.00" 
                                value={bookingCost} 
                                onChange={e => setBookingCost(e.target.value)} 
                                className="pl-8 font-bold text-lg" 
                            />
                            <span className="absolute left-3 top-9 text-light-text-secondary font-bold text-xs">{currencySymbol}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Sticky Action Footer */}
            <div className="p-4 border-t border-black/10 dark:border-white/10 sticky bottom-0 bg-white/90 dark:bg-dark-card/90 backdrop-blur-md flex items-center justify-between gap-3 z-20 rounded-2xl">
                {initialData && onDelete ? (
                    <button 
                        type="button"
                        onClick={() => setShowDeleteConfirm(true)}
                        className="px-4 py-2.5 rounded-xl text-semantic-red hover:bg-semantic-red/10 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer min-h-[44px]"
                    >
                        <Trash className="w-4 h-4" />
                        <span>Delete Booking</span>
                    </button>
                ) : <div />}

                <div className="flex gap-3">
                    <button 
                        type="button" 
                        onClick={onCancel}
                        className={`${BTN_SECONDARY_STYLE} px-6 h-11 text-xs font-bold uppercase tracking-wider cursor-pointer`}
                    >
                        Cancel
                    </button>
                    <button 
                        type="button" 
                        onClick={handleSave}
                        disabled={!isValid}
                        className={`${BTN_PRIMARY_STYLE} px-8 h-11 text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer disabled:opacity-50`}
                    >
                        <span>Save {mode}</span>
                        <Check className="w-4 h-4" weight="bold" />
                    </button>
                </div>
            </div>

        </div>
    );
};

export { TransportConfigurator as FlightConfigurator };
export default TransportConfigurator;
