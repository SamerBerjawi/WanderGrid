import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Card, Button, Badge, Tabs, Modal, Input, Autocomplete, TimeInput } from '../components/ui';
import { TransportConfigurator } from '../components/FlightConfigurator';
import { AccommodationConfigurator } from '../components/AccommodationConfigurator';
import { LocationManager } from '../components/LocationManager';
import { TripModal } from '../components/TripModal';
import { LeaveRequestModal } from '../components/LeaveRequestModal';
import { dataService } from '../services/mockDb';
import { flightImporter } from '../services/flightImportExport';
import { Trip, User, Transport, Accommodation, WorkspaceSettings, Activity, TransportMode, LocationEntry, EntitlementType, PublicHoliday, SavedConfig } from '../types';
import { searchLocations, resolvePlaceName } from '../services/geocoding';

interface TripDetailProps {
    tripId: string;
    onBack: () => void;
}

interface ImportCandidate {
    trip: Trip;
    confidence: number;
    selected: boolean;
}

interface DetectedPlace {
    city: string;
    country: string;
    displayName: string;
    source: 'Transport' | 'Accommodation' | 'Location';
}

export const TripDetail: React.FC<TripDetailProps> = ({ tripId, onBack }) => {
    const [trip, setTrip] = useState<Trip | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
    const [entitlements, setEntitlements] = useState<EntitlementType[]>([]);
    const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
    const [allTrips, setAllTrips] = useState<Trip[]>([]);
    
    // View State
    const [activeTab, setActiveTab] = useState('planner'); 
    const [plannerView, setPlannerView] = useState<'list' | 'table'>('list'); 
    const [loading, setLoading] = useState(true);

    // Modal States
    const [isTransportModalOpen, setIsTransportModalOpen] = useState(false);
    const [isAccommodationModalOpen, setIsAccommodationModalOpen] = useState(false);
    const [isEditTripOpen, setIsEditTripOpen] = useState(false);
    const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
    const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
    const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
    
    // Import State
    const [importPreview, setImportPreview] = useState<{ open: boolean, candidates: ImportCandidate[] }>({ open: false, candidates: [] });
    const [expandedCandidateId, setExpandedCandidateId] = useState<string | null>(null);
    const importInputRef = useRef<HTMLInputElement>(null);

    // Editing State
    const [activityForm, setActivityForm] = useState<Partial<Activity>>({});
    const [currentDayForActivity, setCurrentDayForActivity] = useState<string>('');
    const [selectedDateForModal, setSelectedDateForModal] = useState<string | null>(null);
    const [editingTransports, setEditingTransports] = useState<Transport[] | null>(null);
    const [editingAccommodations, setEditingAccommodations] = useState<Accommodation[] | null>(null);
    
    // Maps / Geocoding
    const [visitedPlaces, setVisitedPlaces] = useState<DetectedPlace[]>([]);
    const [uniqueCountries, setUniqueCountries] = useState<Set<string>>(new Set());
    const [openMenuDate, setOpenMenuDate] = useState<string | null>(null);

    useEffect(() => {
        loadData();
        const handleClickOutside = () => setOpenMenuDate(null);
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, [tripId]);

    const loadData = () => {
        setLoading(true);
        Promise.all([
            dataService.getTrips(), 
            dataService.getUsers(),
            dataService.getWorkspaceSettings(),
            dataService.getEntitlementTypes(),
            dataService.getSavedConfigs()
        ]).then(([tripsList, allUsers, s, ents, configs]) => {
            const t = tripsList.find(t => t.id === tripId);
            setTrip(t || null);
            setUsers(allUsers);
            setSettings(s);
            setAllTrips(tripsList);
            setEntitlements(ents);
            const flatHolidays = configs.flatMap(c => c.holidays.map(h => ({ ...h, configId: c.id })));
            setHolidays(flatHolidays);
            setLoading(false);
        });
    };

    useEffect(() => {
        const detectPlaces = async () => {
            if (!trip) return;
            const detected: DetectedPlace[] = [];
            const processedKeys = new Set<string>();

            const addPlace = async (query: string, source: DetectedPlace['source']) => {
                if (!query) return;
                const details = await resolvePlaceName(query);
                if (details) {
                    const key = details.displayName.toLowerCase();
                    if (!processedKeys.has(key)) {
                        detected.push({ ...details, source });
                        processedKeys.add(key);
                    }
                }
            };

            if (trip.transports) {
                for (const t of trip.transports) {
                    const dest = t.mode === 'Car Rental' || t.mode === 'Personal Car' 
                        ? (t.dropoffLocation || t.destination) 
                        : t.destination;
                    await addPlace(dest, 'Transport');
                }
            }
            if (trip.locations) {
                for (const l of trip.locations) {
                    await addPlace(l.name, 'Location');
                }
            }
            if (trip.accommodations) {
                for (const a of trip.accommodations) {
                    await addPlace(a.address, 'Accommodation');
                }
            }
            setVisitedPlaces(detected);
            const countries = new Set<string>();
            detected.forEach(p => {
                if (p.country) countries.add(p.country);
            });
            setUniqueCountries(countries);
        };
        detectPlaces();
    }, [trip]);

    // ... (Helper functions remain same: calculateRelevance, handleUpdateTrip, etc.) ...
    const calculateRelevance = (currentTrip: Trip, candidateTrip: Trip): number => {
        let points = 0;
        const cStartDate = new Date(currentTrip.startDate).getTime();
        const cEndDate = new Date(currentTrip.endDate).getTime();
        const candStartDate = new Date(candidateTrip.startDate).getTime();
        const candEndDate = new Date(candidateTrip.endDate).getTime();

        const overlapStart = Math.max(cStartDate, candStartDate);
        const overlapEnd = Math.min(cEndDate, candEndDate);
        
        if (overlapEnd >= overlapStart) {
            points += 60;
            if (cStartDate === candStartDate) points += 10;
            if (cEndDate === candEndDate) points += 10;
        } else {
            const dist = Math.min(Math.abs(cStartDate - candEndDate), Math.abs(candStartDate - cEndDate));
            const daysOff = dist / (1000 * 60 * 60 * 24);
            if (daysOff < 2) points += 40; 
            else if (daysOff < 7) points += 20; 
        }

        if (currentTrip.location && candidateTrip.location) {
            const currLoc = currentTrip.location.toLowerCase();
            const candLoc = candidateTrip.location.toLowerCase();
            if (currLoc.includes(candLoc) || candLoc.includes(currLoc)) {
                points += 20;
            }
        }
        return Math.min(100, points);
    };

    const handleUpdateTrip = async (updatedTrip: Trip) => {
        if (!trip) return;
        const finalTrip = { ...trip, ...updatedTrip };
        await dataService.updateTrip(finalTrip);
        setTrip(finalTrip);
        setIsEditTripOpen(false);
    };

    const handleDeleteTrip = async (id: string) => {
        await dataService.deleteTrip(id);
        onBack();
    };

    const handleSaveTransports = async (newTransports: Transport[]) => {
        if (!trip) return;
        let updatedTransports = [...(trip.transports || [])];
        if (editingTransports && editingTransports.length > 0) {
             const oldIds = new Set(editingTransports.map(f => f.id));
             updatedTransports = updatedTransports.filter(f => !oldIds.has(f.id));
        }
        updatedTransports = [...updatedTransports, ...newTransports];
        const updatedTrip = { ...trip, transports: updatedTransports };
        await dataService.updateTrip(updatedTrip);
        setTrip(updatedTrip);
        setIsTransportModalOpen(false);
        setEditingTransports(null);
    };

    // ... (Import logic) ...
    const handleImportFlights = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !trip) return;
        const reader = new FileReader();
        reader.onload = async (evt) => {
            const content = evt.target?.result as string;
            let rawTransports: Transport[] = [];
            if (file.name.endsWith('.json')) {
                rawTransports = flightImporter.parseTransportsJson(content);
            } else if (file.name.endsWith('.csv')) {
                rawTransports = flightImporter.parseTransportsCsv(content);
            }
            if (rawTransports.length > 0) {
                const groupedTrips = flightImporter.groupTransports(rawTransports, trip.participants[0] || 'temp');
                const candidates: ImportCandidate[] = groupedTrips.map(gt => ({
                    trip: gt,
                    confidence: calculateRelevance(trip, gt),
                    selected: false
                })).sort((a, b) => b.confidence - a.confidence);
                if (candidates.length > 0 && candidates[0].confidence > 80) candidates[0].selected = true;
                setImportPreview({ open: true, candidates });
            } else {
                alert("No valid flights found in file.");
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const confirmImportFlights = async () => {
        if (!trip) return;
        const selectedTransports: Transport[] = [];
        importPreview.candidates.forEach(c => {
            if (c.selected && c.trip.transports) {
                const newTransports = c.trip.transports.map(t => ({
                    ...t,
                    id: Math.random().toString(36).substr(2, 9),
                    itineraryId: t.itineraryId || Math.random().toString(36).substr(2, 9)
                }));
                selectedTransports.push(...newTransports);
            }
        });
        if (selectedTransports.length === 0) return;
        const updatedTrip = { ...trip, transports: [...(trip.transports || []), ...selectedTransports] };
        await dataService.updateTrip(updatedTrip);
        setTrip(updatedTrip);
        setImportPreview({ open: false, candidates: [] });
    };

    const toggleCandidateSelection = (tripId: string) => {
        setImportPreview(prev => ({
            ...prev,
            candidates: prev.candidates.map(c => c.trip.id === tripId ? { ...c, selected: !c.selected } : c)
        }));
    };

    const handleDeleteTransports = async (ids: string[]) => {
        if (!trip) return;
        const updatedTransports = (trip.transports || []).filter(f => !ids.includes(f.id));
        const updatedTrip = { ...trip, transports: updatedTransports };
        await dataService.updateTrip(updatedTrip);
        setTrip(updatedTrip);
        setIsTransportModalOpen(false);
        setEditingTransports(null);
    };

    const handleSaveAccommodations = async (items: Accommodation[]) => {
        if (!trip) return;
        const updatedTrip = { ...trip, accommodations: items };
        await dataService.updateTrip(updatedTrip);
        setTrip(updatedTrip);
        setIsAccommodationModalOpen(false);
    };

    const handleDeleteAccommodations = async (ids: string[]) => {
        if (!trip) return;
        const updatedTrip = { ...trip, accommodations: [] };
        await dataService.updateTrip(updatedTrip);
        setTrip(updatedTrip);
        setIsAccommodationModalOpen(false);
    };

    const handleSaveLocations = async (items: LocationEntry[]) => {
        if (!trip) return;
        const updatedTrip = { ...trip, locations: items };
        await dataService.updateTrip(updatedTrip);
        setTrip(updatedTrip);
        setIsLocationModalOpen(false);
    };

    const handleOpenActivityModal = (dateStr: string, existingActivity?: Activity) => {
        setCurrentDayForActivity(dateStr);
        if (existingActivity) setActivityForm({ ...existingActivity });
        else setActivityForm({ id: Math.random().toString(36).substr(2, 9), date: dateStr, time: '12:00', cost: 0, location: '', description: '', type: 'Activity' });
        setIsActivityModalOpen(true);
    };

    const handleSaveActivity = async () => {
        if (!trip || !activityForm.title || !activityForm.date) return;
        const newActivity = activityForm as Activity;
        if (!newActivity.type) newActivity.type = 'Activity';
        let updatedActivities = [...(trip.activities || [])];
        const existingIndex = updatedActivities.findIndex(a => a.id === newActivity.id);
        if (existingIndex >= 0) updatedActivities[existingIndex] = newActivity;
        else updatedActivities.push(newActivity);
        const updatedTrip = { ...trip, activities: updatedActivities };
        await dataService.updateTrip(updatedTrip);
        setTrip(updatedTrip);
        setIsActivityModalOpen(false);
        setActivityForm({});
    };

    const handleDeleteActivity = async (activityId: string) => {
        if (!trip) return;
        const updatedActivities = (trip.activities || []).filter(a => a.id !== activityId);
        const updatedTrip = { ...trip, activities: updatedActivities };
        await dataService.updateTrip(updatedTrip);
        setTrip(updatedTrip);
        setIsActivityModalOpen(false);
        setActivityForm({});
    };

    const handleBookTimeOff = () => setIsLeaveModalOpen(true);

    const handleTimeOffSubmit = async (tripData: Trip) => {
        if (!trip) return;
        const mergedTrip: Trip = { ...trip, ...tripData, id: trip.id, status: 'Upcoming' };
        await dataService.updateTrip(mergedTrip);
        setTrip(mergedTrip);
        const newTrips = allTrips.map(t => t.id === mergedTrip.id ? mergedTrip : t);
        setAllTrips(newTrips);
        setIsLeaveModalOpen(false);
    };

    // ... (Helpers: formatCurrency, formatTime, etc.) ...
    const openTransportModal = (transportSet?: Transport[], date?: string) => {
        setEditingTransports(transportSet || null);
        setSelectedDateForModal(date || null);
        setIsTransportModalOpen(true);
    };

    const openAccommodationModal = (date?: string) => {
        setEditingAccommodations(trip?.accommodations || []);
        setSelectedDateForModal(date || null);
        setIsAccommodationModalOpen(true);
    };

    const openLocationModal = (date?: string) => {
        setSelectedDateForModal(date || null);
        setIsLocationModalOpen(true);
    };

    const getCurrencySymbol = (code: string) => {
        const symbols: Record<string, string> = { 'USD': '$', 'EUR': '€', 'GBP': '£', 'AUD': 'A$', 'JPY': '¥' };
        return symbols[code] || code || '$';
    };
    const formatCurrency = (amount: number) => {
        if (!settings) return `$${amount}`;
        try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: settings.currency }).format(amount); } catch (e) { return `${settings.currency} ${amount}`; }
    };
    const formatTime = (time24?: string) => {
        if (!time24) return '';
        const [h, m] = time24.split(':');
        const hour = parseInt(h);
        if (isNaN(hour)) return time24;
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
    const getLocationForDate = (dateStr: string) => {
        if (!trip?.locations) return null;
        return trip.locations.find(l => dateStr >= l.startDate && dateStr <= l.endDate);
    };
    const calculateDuration = (t: Transport) => {
        if (t.duration) {
            const h = Math.floor(t.duration / 60);
            const m = Math.round(t.duration % 60);
            return `${h}h ${m}m`;
        }
        if (!t.departureTime || !t.arrivalTime) return '';
        const [dh, dm] = t.departureTime.split(':').map(Number);
        const [ah, am] = t.arrivalTime.split(':').map(Number);
        let diff = (ah * 60 + am) - (dh * 60 + dm);
        if (diff < 0) diff += 24 * 60; 
        if (t.departureDate && t.arrivalDate) {
             const start = new Date(`${t.departureDate}T${t.departureTime}`);
             const end = new Date(`${t.arrivalDate}T${t.arrivalTime}`);
             if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                 diff = (end.getTime() - start.getTime()) / (1000 * 60);
             }
        }
        const h = Math.floor(diff / 60);
        const m = Math.round(diff % 60);
        return `${h}h ${m}m`;
    };
    const calculateNights = (start: string, end: string) => {
        const d1 = new Date(start);
        const d2 = new Date(end);
        if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;
        const diff = d2.getTime() - d1.getTime();
        return Math.ceil(diff / (1000 * 3600 * 24));
    }
    const sortActivities = (acts: Activity[]) => {
        return acts.sort((a, b) => {
            const timeA = a.time || '23:59';
            const timeB = b.time || '23:59';
            return timeA.localeCompare(timeB);
        });
    };
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
    const getSeatColor = (type?: string) => {
        const t = (type || '').toLowerCase();
        if (t.includes('window')) return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800';
        if (t.includes('aisle')) return 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800';
        if (t.includes('middle')) return 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800';
        return 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700';
    };
    const getTypeStyles = (type: string) => {
        switch(type) {
            case 'Transport': return 'bg-blue-50 dark:bg-blue-900/10 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800';
            case 'Accommodation': return 'bg-amber-50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800';
            case 'Reservation': return 'bg-orange-50 dark:bg-orange-900/10 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800';
            case 'Tour': return 'bg-emerald-50 dark:bg-emerald-900/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
            case 'Activity': 
            default: return 'bg-indigo-50 dark:bg-indigo-900/10 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800';
        }
    };
    const fetchLocationSuggestions = async (query: string): Promise<string[]> => {
        return searchLocations(query);
    };
    const getDayEvents = (dateStr: string) => {
        if (!trip?.transports) return [];
        const events: (Transport & { isDropoff?: boolean })[] = [];
        trip.transports.forEach(t => {
            if (t.departureDate === dateStr) events.push(t);
            if (t.arrivalDate === dateStr && t.departureDate !== dateStr && (t.mode === 'Car Rental' || t.mode === 'Personal Car')) events.push({ ...t, isDropoff: true });
        });
        return events;
    };

    if (loading || !trip) return <div className="p-8 text-gray-400 animate-pulse">Loading Trip Data...</div>;

    const activityCost = trip.activities?.reduce((sum, a) => sum + (a.cost || 0), 0) || 0;
    const transportCost = trip.transports?.reduce((sum, f) => sum + (f.cost || 0), 0) || 0;
    const stayCost = trip.accommodations?.reduce((sum, a) => sum + (a.cost || 0), 0) || 0;
    const totalCost = transportCost + stayCost + activityCost;
    const duration = Math.ceil((new Date(trip.endDate).getTime() - new Date(trip.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const costPerPerson = trip.participants.length > 0 ? totalCost / trip.participants.length : 0;
    const costPerDay = duration > 0 ? totalCost / duration : 0;

    // Find highest expense
    let highestExpense = { name: '', cost: 0, type: '' };
    trip.transports?.forEach(t => { if((t.cost || 0) > highestExpense.cost) highestExpense = { name: t.provider, cost: t.cost || 0, type: 'Transport' } });
    trip.accommodations?.forEach(a => { if((a.cost || 0) > highestExpense.cost) highestExpense = { name: a.name, cost: a.cost || 0, type: 'Accommodation' } });
    trip.activities?.forEach(a => { if((a.cost || 0) > highestExpense.cost) highestExpense = { name: a.title, cost: a.cost || 0, type: 'Activity' } });

    // Group by Itinerary ID
    const transportGroups = (trip.transports || []).reduce((groups, t) => {
        const key = t.itineraryId || 'misc';
        if (!groups[key]) groups[key] = [];
        groups[key].push(t);
        return groups;
    }, {} as Record<string, Transport[]>);

    const getTripDates = () => {
        const dates: string[] = [];
        const [sy, sm, sd] = trip.startDate.split('-').map(Number);
        const [ey, em, ed] = trip.endDate.split('-').map(Number);
        const curr = new Date(Date.UTC(sy, sm - 1, sd));
        const last = new Date(Date.UTC(ey, em - 1, ed));
        while (curr <= last) {
            dates.push(curr.toISOString().split('T')[0]);
            curr.setUTCDate(curr.getUTCDate() + 1);
        }
        return dates;
    };
    const tripDates = getTripDates();
    const selectedCount = importPreview.candidates.filter(c => c.selected).length;
    const getAllItemsForTable = (dateStr: string) => {
        const items: any[] = [];
        getDayEvents(dateStr).forEach(t => {
            const dur = !t.isDropoff ? calculateDuration(t) : '';
            const dist = t.distance ? `${t.distance} km` : '';
            items.push({
                id: t.id,
                type: 'Transport',
                subType: t.mode,
                time: t.isDropoff ? t.arrivalTime : t.departureTime,
                name: t.provider + (t.identifier ? ` ${t.identifier}` : ''),
                location: t.isDropoff ? t.dropoffLocation || t.destination : t.pickupLocation || t.origin,
                cost: (t.cost || 0) > 0 ? t.cost : null,
                icon: getTransportIcon(t.mode),
                ref: t,
                meta: !t.isDropoff ? `${dur}${dist ? ` • ${dist}` : ''}` : 'Arrival',
                isDropoff: t.isDropoff
            });
        });
        trip.accommodations?.forEach(a => {
            if (a.checkInDate === dateStr) {
                const nights = calculateNights(a.checkInDate, a.checkOutDate);
                items.push({
                    id: a.id,
                    type: 'Accommodation',
                    subType: a.type,
                    time: a.checkInTime,
                    name: a.name,
                    location: a.address,
                    cost: a.cost,
                    icon: 'hotel',
                    ref: a,
                    meta: `${nights} Night${nights > 1 ? 's' : ''}`
                });
            }
        });
        trip.activities?.forEach(a => {
            if (a.date === dateStr) {
                items.push({
                    id: a.id,
                    type: a.type || 'Activity',
                    subType: a.type,
                    time: a.time,
                    name: a.title,
                    location: a.location,
                    cost: a.cost,
                    icon: a.type === 'Reservation' ? 'restaurant' : a.type === 'Tour' ? 'tour' : 'local_activity',
                    ref: a,
                    meta: a.description
                });
            }
        });
        return items.sort((a,b) => (a.time || '23:59').localeCompare(b.time || '23:59'));
    };

    return (
        <div className="space-y-8 animate-fade-in max-w-[1400px] mx-auto pb-12">
            <div className="relative w-full rounded-[2.5rem] bg-white dark:bg-gray-900 shadow-2xl border border-gray-100 dark:border-white/5 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-purple-500/5 pointer-events-none" />
                <div className="relative p-8 lg:p-10 flex flex-col gap-8">
                    <div className="flex flex-col md:flex-row justify-between items-start gap-6">
                        <div className="flex items-start gap-6">
                            <button onClick={onBack} className="w-12 h-12 rounded-xl bg-white dark:bg-gray-800 shadow-md border border-gray-100 dark:border-white/10 flex items-center justify-center text-gray-400 hover:text-blue-500 transition-colors">
                                <span className="material-icons-outlined text-lg">arrow_back</span>
                            </button>
                            <div>
                                <div className="flex items-center gap-3 mb-2">
                                    <span className="text-4xl">{trip.icon || '✈️'}</span>
                                    <h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white tracking-tight">{trip.name}</h1>
                                </div>
                                <div className="flex flex-wrap items-center gap-3 text-sm font-bold text-gray-500 dark:text-gray-400">
                                    <span className="flex items-center gap-1"><span className="material-icons-outlined text-xs">location_on</span> {trip.location}</span>
                                    <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                                    <span>{new Date(trip.startDate).toLocaleDateString(undefined, {month:'short', day:'numeric'})} - {new Date(trip.endDate).toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'})}</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            {(!trip.entitlementId && trip.status === 'Planning') && (
                                <Button variant="primary" onClick={handleBookTimeOff} className="bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20" icon={<span className="material-icons-outlined">event_available</span>}>Book Time Off</Button>
                            )}
                            <Button variant="secondary" onClick={() => setIsEditTripOpen(true)} icon={<span className="material-icons-outlined">edit</span>}>Edit Details</Button>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30 flex flex-col items-center justify-center text-center">
                            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{formatCurrency(totalCost)}</span>
                            <span className="text-[9px] font-bold text-emerald-500/70 uppercase tracking-widest">Total Cost</span>
                        </div>
                        <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 flex flex-col items-center justify-center text-center">
                            <span className="text-2xl font-black text-blue-600 dark:text-blue-400">{duration}</span>
                            <span className="text-[9px] font-bold text-blue-500/70 uppercase tracking-widest">Days Duration</span>
                        </div>
                        <div className="p-4 rounded-2xl bg-purple-50 dark:bg-purple-900/10 border border-purple-100 dark:border-purple-900/30 flex flex-col items-center justify-center text-center">
                            <div className="flex -space-x-2 mb-1">
                                {trip.participants.map((pid, idx) => {
                                    const u = users.find(u => u.id === pid);
                                    return u ? <div key={idx} className="w-6 h-6 rounded-full bg-purple-200 border-2 border-white flex items-center justify-center text-[8px] font-bold text-purple-800" title={u.name}>{u.name.charAt(0)}</div> : null;
                                })}
                            </div>
                            <span className="text-[9px] font-bold text-purple-500/70 uppercase tracking-widest">{trip.participants.length} Travelers</span>
                        </div>
                        <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-white/5 flex flex-col items-center justify-center text-center">
                            <span className="text-2xl font-black text-gray-700 dark:text-gray-300">{(trip.transports?.length || 0) + (trip.accommodations?.length || 0) + (trip.activities?.length || 0)}</span>
                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Planned Items</span>
                        </div>
                    </div>
                    {(visitedPlaces.length > 0) && (
                        <div className="p-5 rounded-2xl bg-white/50 dark:bg-white/5 border border-white/20 dark:border-white/5 backdrop-blur-md">
                            <h4 className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-3 flex items-center gap-2"><span className="material-icons-outlined text-sm">public</span> Expedition Footprint</h4>
                            <div className="space-y-3">
                                {uniqueCountries.size > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        {Array.from(uniqueCountries).map(country => (
                                            <span key={country} className="px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900/30 text-[10px] font-black uppercase tracking-wider flex items-center gap-1"><span className="material-icons-outlined text-sm">flag</span> {country}</span>
                                        ))}
                                    </div>
                                )}
                                <div className="flex flex-wrap gap-2">
                                    {visitedPlaces.map((place, idx) => (
                                        <div key={idx} className="px-3 py-1 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-white/10 text-xs font-bold text-gray-600 dark:text-gray-300 shadow-sm flex items-center gap-1.5">
                                            <span className={`material-icons-outlined text-[10px] ${place.source === 'Transport' ? 'text-blue-500' : place.source === 'Accommodation' ? 'text-amber-500' : 'text-purple-500'}`}>{place.source === 'Transport' ? 'flight_land' : place.source === 'Accommodation' ? 'hotel' : 'place'}</span>{place.displayName}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <Tabs tabs={[{ id: 'planner', label: 'Daily Planner', icon: <span className="material-icons-outlined">calendar_view_day</span> }, { id: 'itinerary', label: 'Bookings', icon: <span className="material-icons-outlined">commute</span> }, { id: 'budget', label: 'Cost Breakdown', icon: <span className="material-icons-outlined">receipt_long</span> }]} activeTab={activeTab} onChange={setActiveTab} />
                {activeTab === 'planner' && (
                    <div className="flex gap-2">
                        <Button variant="secondary" size="sm" onClick={() => setIsLocationModalOpen(true)} className="hidden md:flex"><span className="material-icons-outlined text-sm mr-2">map</span> Manage Route</Button>
                        <div className="flex p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
                            <button onClick={() => setPlannerView('list')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${plannerView === 'list' ? 'bg-white shadow text-blue-600 dark:bg-gray-700 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}><span className="material-icons-outlined text-sm align-middle mr-1">view_agenda</span> List</button>
                            <button onClick={() => setPlannerView('table')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${plannerView === 'table' ? 'bg-white shadow text-blue-600 dark:bg-gray-700 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}><span className="material-icons-outlined text-sm align-middle mr-1">table_chart</span> Table</button>
                        </div>
                    </div>
                )}
            </div>

            {/* Content Switcher */}
            {activeTab === 'planner' && (
                <>
                    {plannerView === 'list' ? (
                        <div className="space-y-6 relative">
                            <div className="absolute left-8 top-4 bottom-4 w-0.5 bg-gray-200 dark:bg-gray-800 hidden md:block" />
                            {tripDates.map((dateStr, index) => {
                                const dateObj = new Date(dateStr); 
                                const dayEvents = getDayEvents(dateStr);
                                const dayStay = trip.accommodations?.find(a => dateStr >= a.checkInDate && dateStr < a.checkOutDate);
                                const location = getLocationForDate(dateStr);
                                const dayActivities = sortActivities(trip.activities?.filter(a => a.date === dateStr) || []);

                                return (
                                    <div key={dateStr} className="relative md:pl-20 group">
                                        <div className="hidden md:flex absolute left-0 top-0 w-16 h-16 bg-white dark:bg-gray-900 border-4 border-gray-100 dark:border-gray-800 rounded-2xl items-center justify-center flex-col z-10 shadow-sm">
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{dateObj.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}</span>
                                            <span className="text-xl font-black text-gray-800 dark:text-white leading-none">{dateObj.getUTCDate()}</span>
                                            <span className="text-[8px] font-bold text-gray-400 uppercase tracking-tighter mt-0.5">Day {index + 1}</span>
                                        </div>
                                        <div className="md:hidden mb-2 flex items-center gap-3">
                                            <div className="bg-blue-600 text-white px-3 py-1 rounded-lg text-xs font-bold">Day {index + 1}</div>
                                            <span className="text-lg font-black text-gray-800 dark:text-white">{dateObj.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })}</span>
                                        </div>
                                        <div className="space-y-3 pb-8">
                                            {location && (
                                                <div className="inline-flex items-center gap-1 px-3 py-1 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-full text-xs font-bold uppercase tracking-wider mb-2">
                                                    <span className="material-icons-outlined text-xs">place</span> {location.name}
                                                </div>
                                            )}
                                            {dayEvents.map(t => (
                                                <div key={t.id + (t.isDropoff ? '_drop' : '')} className="bg-blue-50 dark:bg-gray-800 border border-blue-100 dark:border-gray-700 p-4 rounded-2xl flex items-center gap-4 hover:shadow-md transition-all">
                                                    <div className="w-10 h-10 rounded-xl bg-blue-500 text-white flex items-center justify-center shadow-lg shadow-blue-500/30">
                                                        <span className="material-icons-outlined">{getTransportIcon(t.mode)}</span>
                                                    </div>
                                                    <div className="flex-1">
                                                        <h4 className="font-bold text-gray-900 dark:text-white text-sm">
                                                            {t.isDropoff ? `Dropoff ${t.mode}` : (t.mode === 'Car Rental' || t.mode === 'Personal Car' ? `Pickup ${t.mode}` : `${t.mode} to ${t.destination}`)}
                                                        </h4>
                                                        <div className="flex gap-4 mt-1">
                                                            <p className="text-[10px] text-blue-600 dark:text-blue-300 font-bold uppercase tracking-wider">
                                                                {t.provider} {t.identifier} • {formatTime(t.isDropoff ? t.arrivalTime : t.departureTime)}
                                                            </p>
                                                            {!t.isDropoff && t.mode !== 'Car Rental' && t.mode !== 'Personal Car' && (
                                                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                                                                    {calculateDuration(t)} Duration
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <button onClick={() => openTransportModal([t])} className="text-gray-400 hover:text-blue-500"><span className="material-icons-outlined text-sm">edit</span></button>
                                                </div>
                                            ))}
                                            {dayStay && (
                                                <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 p-4 rounded-2xl flex items-center gap-4 hover:shadow-md transition-all">
                                                    <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-lg shadow-amber-500/30"><span className="material-icons-outlined">hotel</span></div>
                                                    <div className="flex-1">
                                                        <h4 className="font-bold text-gray-900 dark:text-white text-sm">{dayStay.name}</h4>
                                                        <p className="text-[10px] text-amber-600 dark:text-amber-300 font-bold uppercase tracking-wider">{dayStay.checkInDate === dateStr ? 'Check-In' : 'Overnight Stay'}</p>
                                                    </div>
                                                    <button onClick={() => openAccommodationModal()} className="text-gray-400 hover:text-amber-500"><span className="material-icons-outlined text-sm">edit</span></button>
                                                </div>
                                            )}
                                            {dayActivities.length > 0 && dayActivities.map(item => {
                                                const isRes = item.type === 'Reservation';
                                                return (
                                                    <div key={item.id} className={`p-4 rounded-2xl flex items-center gap-4 hover:shadow-md transition-all group/act border ${
                                                        isRes 
                                                        ? 'bg-orange-50/50 dark:bg-orange-900/10 border-orange-100 dark:border-orange-900/30' 
                                                        : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-white/10'
                                                    }`}>
                                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                                            isRes 
                                                            ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' 
                                                            : 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400'
                                                        }`}>
                                                            <span className="material-icons-outlined">{isRes ? 'restaurant' : item.type === 'Tour' ? 'tour' : 'local_activity'}</span>
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <span className={`text-xs font-black whitespace-nowrap ${isRes ? 'text-orange-400' : 'text-gray-400'}`}>{formatTime(item.time)}</span>
                                                                <h4 className="font-bold text-gray-900 dark:text-white text-sm truncate">{item.title}</h4>
                                                            </div>
                                                            {item.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">{item.description}</p>}
                                                            {item.location && <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1 truncate"><span className="material-icons-outlined text-[10px]">place</span> {item.location}</p>}
                                                        </div>
                                                        {item.cost && <div className={`text-xs font-bold whitespace-nowrap ${isRes ? 'text-orange-600 dark:text-orange-400' : 'text-gray-600 dark:text-gray-300'}`}>{formatCurrency(item.cost)}</div>}
                                                        
                                                        <div className="flex items-center gap-1 opacity-0 group-hover/act:opacity-100 transition-opacity">
                                                            <button onClick={() => handleOpenActivityModal(dateStr, item)} className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all"><span className="material-icons-outlined text-sm">edit</span></button>
                                                            <button onClick={() => handleDeleteActivity(item.id)} className="p-1.5 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"><span className="material-icons-outlined text-sm">delete</span></button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            <button onClick={() => handleOpenActivityModal(dateStr)} className="w-full py-3 border-2 border-dashed border-gray-200 dark:border-white/10 rounded-2xl text-xs font-bold text-gray-400 uppercase tracking-widest hover:border-blue-300 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 focus:opacity-100">
                                                <span className="material-icons-outlined text-sm">add</span> Add Schedule Item
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        // Table View
                        <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-white/5 shadow-xl overflow-hidden">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-gray-50/80 dark:bg-white/5 backdrop-blur border-b border-gray-100 dark:border-white/5 text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400 sticky top-0 z-20">
                                    <tr>
                                        <th className="p-6 w-32">Time</th>
                                        <th className="p-6 w-48">Category</th>
                                        <th className="p-6">Description</th>
                                        <th className="p-6 w-48">Location</th>
                                        <th className="p-6 w-32 text-right">Cost</th>
                                        <th className="p-6 w-16"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {tripDates.map((dateStr) => {
                                        const items = getAllItemsForTable(dateStr);
                                        const dateObj = new Date(dateStr);
                                        const isToday = new Date().toDateString() === dateObj.toDateString();
                                        return (
                                            <React.Fragment key={dateStr}>
                                                <tr className={`border-b border-gray-50 dark:border-white/5 ${isToday ? 'bg-blue-50/50 dark:bg-blue-900/10' : 'bg-gray-50/30 dark:bg-black/20'}`}>
                                                    <td colSpan={6} className="px-6 py-3">
                                                        <div className="flex items-center gap-3">
                                                            <span className={`text-xs font-black uppercase tracking-wider ${isToday ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`}>
                                                                {dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                                                            </span>
                                                            {isToday && <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-300 uppercase tracking-widest">Today</span>}
                                                        </div>
                                                    </td>
                                                </tr>
                                                {items.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={6} className="px-6 py-8 text-center text-xs text-gray-400 dark:text-gray-600 italic font-medium">No scheduled items for this day</td>
                                                    </tr>
                                                ) : items.map((item, idx) => {
                                                    const styleClasses = getTypeStyles(item.type);
                                                    return (
                                                        <tr key={`${dateStr}-${idx}`} className="group hover:bg-blue-50/30 dark:hover:bg-white/5 transition-all duration-200 border-b border-gray-50 dark:border-white/5 last:border-0">
                                                            <td className="px-6 py-4"><div className="flex flex-col"><span className="text-sm font-bold text-gray-800 dark:text-gray-200 font-mono tracking-tight">{formatTime(item.time)}</span>{item.isDropoff && <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">Arrive</span>}</div></td>
                                                            <td className="px-6 py-4"><div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-bold uppercase tracking-wide ${styleClasses}`}><span className="material-icons-outlined text-sm">{item.icon}</span><span>{item.subType || item.type}</span></div></td>
                                                            <td className="px-6 py-4"><div><p className="font-bold text-gray-900 dark:text-white text-sm leading-snug">{item.name}</p>{item.meta && (<p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1.5 font-medium opacity-80">{item.type === 'Transport' && !item.isDropoff && <span className="material-icons-outlined text-[10px]">schedule</span>}{item.meta}</p>)}</div></td>
                                                            <td className="px-6 py-4"><div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 font-medium max-w-[180px]">{item.location ? (<><span className="material-icons-outlined text-[14px] opacity-60 shrink-0">place</span><span className="truncate" title={item.location}>{item.location}</span></>) : (<span className="opacity-30">-</span>)}</div></td>
                                                            <td className="px-6 py-4 text-right">{item.cost ? (<span className="font-bold text-gray-900 dark:text-white text-sm tabular-nums tracking-tight">{formatCurrency(item.cost)}</span>) : (<span className="text-gray-300 dark:text-gray-600 text-xs font-mono">-</span>)}</td>
                                                            <td className="px-6 py-4 text-right"><button onClick={() => { if (item.type === 'Transport') openTransportModal([item.ref]); if (item.type === 'Accommodation') openAccommodationModal(); if (item.type === 'Activity' || item.type === 'Reservation' || item.type === 'Tour') handleOpenActivityModal(dateStr, item.ref); }} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all opacity-0 group-hover:opacity-100"><span className="material-icons-outlined text-lg">edit_note</span></button></td>
                                                        </tr>
                                                    );
                                                })}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}

            {activeTab === 'itinerary' && (
                <div className="space-y-12">
                    {/* TRANSPORT SECTION */}
                    <div>
                        <div className="flex justify-between items-center mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
                                    <span className="material-icons-outlined">commute</span>
                                </div>
                                <h3 className="text-xl font-black text-gray-900 dark:text-white">Transportation</h3>
                            </div>
                            <div className="flex gap-2">
                                <div className="relative">
                                    <input 
                                        type="file" 
                                        ref={importInputRef} 
                                        className="hidden" 
                                        accept=".json,.csv"
                                        onChange={handleImportFlights}
                                    />
                                    <Button size="sm" variant="ghost" className="border-dashed border-2 text-gray-500 hover:text-blue-500 hover:border-blue-200 hover:bg-blue-50 dark:hover:bg-blue-900/10" onClick={() => importInputRef.current?.click()}>
                                        <span className="material-icons-outlined text-sm mr-1">upload_file</span> Import
                                    </Button>
                                </div>
                                <Button size="sm" variant="secondary" onClick={() => openTransportModal()}>+ Add Booking</Button>
                            </div>
                        </div>

                        {Object.keys(transportGroups).length === 0 ? (
                            <div className="text-center py-12 bg-gray-50 dark:bg-white/5 rounded-3xl border border-dashed border-gray-200 dark:border-white/10">
                                <span className="material-icons-outlined text-4xl text-gray-300">confirmation_number</span>
                                <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mt-2">No tickets added yet</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {Object.entries(transportGroups).map(([gId, groupTransports]) => {
                                    const items = groupTransports as Transport[];
                                    const mode = items[0]?.mode || 'Flight';
                                    const tripTypeLabel = items[0].type || 'One-Way';
                                    
                                    if (mode === 'Car Rental' || mode === 'Personal Car') {
                                        const car = items[0];
                                        return (
                                            <div key={gId} className="group relative bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-white/5 overflow-hidden hover:shadow-lg transition-all border-l-4 border-l-orange-500">
                                                <div className="p-5 border-b border-gray-100 dark:border-white/5 flex justify-between items-start bg-orange-50/30 dark:bg-orange-900/5">
                                                    <div className="flex gap-4">
                                                        <div className="w-10 h-10 bg-white dark:bg-gray-700 rounded-lg shadow-sm flex items-center justify-center border border-gray-100 dark:border-white/5 overflow-hidden relative">
                                                            {car.logoUrl ? <img src={car.logoUrl} className="w-full h-full object-cover" /> : <span className="material-icons-outlined text-orange-500 text-xl">directions_car</span>}
                                                        </div>
                                                        <div>
                                                            <h4 className="font-black text-gray-900 dark:text-white text-lg leading-none">{car.provider}</h4>
                                                            <div className="flex gap-2 mt-1">
                                                                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Rental Agreement</span>
                                                                {car.confirmationCode && <span className="text-[10px] font-mono bg-gray-100 dark:bg-white/10 px-1.5 rounded text-gray-600 dark:text-gray-300">{car.confirmationCode}</span>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <button onClick={() => openTransportModal(items)} className="text-gray-300 hover:text-orange-500 transition-colors"><span className="material-icons-outlined">edit</span></button>
                                                </div>
                                                <div className="p-5 grid grid-cols-2 gap-6 relative">
                                                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white dark:bg-gray-800 rounded-full border border-gray-100 dark:border-white/10 flex items-center justify-center z-10 shadow-sm"><span className="material-icons-outlined text-gray-400 text-sm">key</span></div>
                                                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[1px] h-full bg-dashed border-l border-dashed border-gray-200 dark:border-white/10 z-0"></div>
                                                    <div className="space-y-1"><span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">Pickup</span><div className="font-bold text-gray-900 dark:text-white text-sm">{car.pickupLocation}</div><div className="text-xs text-gray-500">{new Date(car.departureDate).toLocaleDateString()}</div><div className="text-xs font-mono text-gray-400">{formatTime(car.departureTime)}</div></div>
                                                    <div className="space-y-1 text-right"><span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">Dropoff</span><div className="font-bold text-gray-900 dark:text-white text-sm">{car.dropoffLocation}</div><div className="text-xs text-gray-500">{new Date(car.arrivalDate).toLocaleDateString()}</div><div className="text-xs font-mono text-gray-400">{formatTime(car.arrivalTime)}</div></div>
                                                </div>
                                                <div className="bg-gray-50 dark:bg-white/5 p-4 border-t border-gray-100 dark:border-white/5 flex justify-between items-center">
                                                    <div><span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Vehicle</span><span className="font-bold text-sm text-gray-800 dark:text-gray-200">{car.vehicleModel || 'Standard Car'}</span></div>
                                                    {car.cost && <div className="text-lg font-black text-emerald-600 dark:text-emerald-400">{formatCurrency(car.cost)}</div>}
                                                </div>
                                            </div>
                                        );
                                    }

                                    return (
                                        <div key={gId} className="flex flex-col bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-white/5 overflow-hidden hover:shadow-lg transition-all">
                                            {/* Header */}
                                            <div className="flex justify-between items-center p-5 border-b border-gray-50 dark:border-white/5 bg-gray-50/50 dark:bg-white/5">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-white dark:bg-gray-700 shadow-sm flex items-center justify-center overflow-hidden relative">
                                                         {items[0].logoUrl ? <img src={items[0].logoUrl} className="w-full h-full object-cover" /> : <span className="material-icons-outlined text-gray-400">{getTransportIcon(mode)}</span>}
                                                    </div>
                                                    <div>
                                                        <h4 className="font-black text-gray-900 dark:text-white text-base leading-none">{items[0].provider}</h4>
                                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1 block">{items[0].identifier} • {tripTypeLabel}</span>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                     {items[0].cost && <div className="text-lg font-black text-gray-900 dark:text-white leading-none">{formatCurrency(items[0].cost)}</div>}
                                                     <button onClick={() => openTransportModal(items)} className="text-[10px] font-bold text-blue-500 hover:underline uppercase tracking-wider mt-1">Edit Details</button>
                                                </div>
                                            </div>

                                            {/* Timeline Segments */}
                                            <div className="p-5 space-y-6">
                                                {items.map((leg, idx) => {
                                                    const prevLeg = items[idx - 1];
                                                    let showDivider = false;
                                                    let dividerLabel = "Connection";
                                                    let layoverDuration = "";

                                                    if (prevLeg) {
                                                        const arr = new Date(`${prevLeg.arrivalDate}T${prevLeg.arrivalTime}`);
                                                        const dep = new Date(`${leg.departureDate}T${leg.departureTime}`);
                                                        const diffMs = dep.getTime() - arr.getTime();
                                                        const diffHours = diffMs / (1000 * 60 * 60);
                                                        
                                                        const h = Math.floor(diffMs / (1000 * 60 * 60));
                                                        const m = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                                                        
                                                        const isRoundTrip = tripTypeLabel === 'Round Trip';
                                                        if (diffHours > 24 || (isRoundTrip && leg.origin === items[0].origin)) {
                                                            showDivider = true;
                                                            const diffDays = Math.round(diffHours / 24);
                                                            dividerLabel = diffDays > 0 ? `Return Journey • ${diffDays} Days Later` : "Return Journey";
                                                        } else if (diffMs > 0) {
                                                            layoverDuration = `${h}h ${m}m Layover in ${leg.origin}`;
                                                        }
                                                    }

                                                    const classColor = getClassColor(leg.travelClass);
                                                    const seatTypeColor = getSeatColor(leg.seatType);

                                                    return (
                                                        <div key={leg.id}>
                                                            {/* Divider Logic */}
                                                            {showDivider ? (
                                                                <div className="flex items-center gap-3 my-4">
                                                                    <div className="h-px bg-gray-200 dark:bg-white/10 flex-1"></div>
                                                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest bg-gray-50 dark:bg-white/5 px-2 py-1 rounded">{dividerLabel}</span>
                                                                    <div className="h-px bg-gray-200 dark:bg-white/10 flex-1"></div>
                                                                </div>
                                                            ) : layoverDuration ? (
                                                                <div className="flex justify-center my-4 relative">
                                                                    <div className="absolute top-0 bottom-0 left-[84px] w-0.5 bg-gray-100 dark:bg-white/5 -z-10" />
                                                                    <div className="bg-gray-50 dark:bg-white/5 px-3 py-1.5 rounded-lg border border-gray-100 dark:border-white/5 flex items-center gap-2 shadow-sm">
                                                                        <span className="material-icons-outlined text-[12px] text-gray-400">schedule</span>
                                                                        <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{layoverDuration}</span>
                                                                    </div>
                                                                </div>
                                                            ) : idx > 0 && (
                                                                <div className="my-2" />
                                                            )}

                                                            {/* Segment Row */}
                                                            <div className="flex gap-5 items-stretch relative group/segment">
                                                                {/* Times Column */}
                                                                <div className="flex flex-col justify-between py-1 text-right min-w-[70px]">
                                                                    <span className="text-xl font-black text-gray-900 dark:text-white leading-none tracking-tight">{formatTime(leg.departureTime)}</span>
                                                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest my-2">{calculateDuration(leg)}</span>
                                                                    <span className="text-xl font-black text-gray-500 dark:text-gray-400 leading-none tracking-tight">{formatTime(leg.arrivalTime)}</span>
                                                                </div>

                                                                {/* Visual Path Column */}
                                                                <div className="flex flex-col items-center relative pt-2">
                                                                    <div className="w-3 h-3 rounded-full bg-blue-500 shadow-[0_0_0_4px_rgba(59,130,246,0.2)] z-10"></div>
                                                                    <div className="w-0.5 flex-grow bg-gradient-to-b from-blue-500/50 to-gray-200 dark:to-white/10 my-1 rounded-full"></div>
                                                                    <div className="w-3 h-3 rounded-full border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 z-10"></div>
                                                                </div>

                                                                {/* Locations & Details */}
                                                                <div className="flex-1 pt-0.5 pb-2">
                                                                    {/* Origin Block */}
                                                                    <div className="mb-6">
                                                                        <div className="flex items-baseline gap-2">
                                                                            <span className="text-2xl font-black text-gray-900 dark:text-white leading-none tracking-tight">{leg.origin}</span>
                                                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{new Date(leg.departureDate).toLocaleDateString()}</span>
                                                                        </div>
                                                                    </div>
                                                                    
                                                                    {/* Destination Block */}
                                                                    <div>
                                                                        <div className="flex items-baseline gap-2">
                                                                            <span className="text-2xl font-black text-gray-900 dark:text-white leading-none tracking-tight">{leg.destination}</span>
                                                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{new Date(leg.arrivalDate).toLocaleDateString()}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Meta Info (Right Side) */}
                                                                <div className="flex flex-col gap-2 items-end pt-1">
                                                                    <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border ${classColor}`}>
                                                                        {leg.travelClass || 'Economy'}
                                                                    </span>
                                                                    <div className={`flex items-center gap-1.5 text-[10px] font-bold px-2 py-1.5 rounded-lg border ${seatTypeColor}`}>
                                                                        <span className="material-icons-outlined text-[12px] opacity-70">{getSeatTypeIcon(leg.seatType)}</span> 
                                                                        <span>{leg.seatNumber || '--'}</span>
                                                                    </div>
                                                                    {leg.isExitRow && (
                                                                         <span className="text-[9px] font-black text-rose-500 bg-rose-50 dark:bg-rose-900/20 px-2 py-1 rounded-lg uppercase tracking-wider flex items-center gap-1 border border-rose-200 dark:border-rose-900/30">
                                                                            <span className="material-icons-outlined text-[10px]">emergency</span> Exit
                                                                         </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    );
                                })
                            }
                            </div>
                        )}
                    </div>

                    {/* ACCOMMODATION SECTION */}
                    <div>
                        <div className="flex justify-between items-center mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                                    <span className="material-icons-outlined">hotel</span>
                                </div>
                                <h3 className="text-xl font-black text-gray-900 dark:text-white">Accommodations</h3>
                            </div>
                            <Button size="sm" variant="secondary" onClick={() => openAccommodationModal()}>+ Add Stay</Button>
                        </div>

                        {(!trip.accommodations || trip.accommodations.length === 0) ? (
                            <div className="text-center py-12 bg-gray-50 dark:bg-white/5 rounded-3xl border border-dashed border-gray-200 dark:border-white/10">
                                <span className="material-icons-outlined text-4xl text-gray-300">night_shelter</span>
                                <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mt-2">No accommodations booked</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {trip.accommodations.map((stay, idx) => (
                                    <div key={idx} className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-white/5 shadow-sm hover:shadow-xl transition-all overflow-hidden flex flex-col border-l-4 border-l-amber-500">
                                        <div className="p-5 flex gap-5">
                                            <div className="w-24 h-24 rounded-2xl bg-amber-50 dark:bg-amber-900/10 flex items-center justify-center shrink-0 overflow-hidden shadow-inner shadow-amber-500/20 relative">
                                                {stay.logoUrl ? (
                                                    <img src={stay.logoUrl} className="w-full h-full object-cover" />
                                                ) : (
                                                    <span className="material-icons-outlined text-4xl text-amber-400 opacity-50">{stay.type === 'Hotel' ? 'apartment' : 'house'}</span>
                                                )}
                                                <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[9px] font-bold text-center py-0.5 backdrop-blur-sm">
                                                    {calculateNights(stay.checkInDate, stay.checkOutDate)} Nights
                                                </div>
                                            </div>

                                            <div className="flex-1 flex flex-col justify-between">
                                                <div>
                                                    <div className="flex justify-between items-start">
                                                        <h4 className="font-black text-lg text-gray-900 dark:text-white leading-tight line-clamp-1">{stay.name}</h4>
                                                        <button onClick={() => openAccommodationModal()} className="text-gray-300 hover:text-amber-500 transition-colors -mt-1 -mr-1 p-1"><span className="material-icons-outlined text-lg">edit</span></button>
                                                    </div>
                                                    <p className="text-xs font-medium text-gray-500 mt-1 flex items-center gap-1 line-clamp-1">
                                                        <span className="material-icons-outlined text-xs">location_on</span> {stay.address}
                                                    </p>
                                                </div>

                                                <div className="flex gap-4 mt-3">
                                                    <div className="bg-gray-50 dark:bg-white/5 px-3 py-2 rounded-xl flex-1 text-center border border-gray-100 dark:border-white/5">
                                                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest block">Check-In</span>
                                                        <span className="font-bold text-xs text-gray-800 dark:text-gray-200">{new Date(stay.checkInDate).toLocaleDateString(undefined, {month:'short', day:'numeric'})}</span>
                                                    </div>
                                                    <div className="bg-gray-50 dark:bg-white/5 px-3 py-2 rounded-xl flex-1 text-center border border-gray-100 dark:border-white/5">
                                                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest block">Check-Out</span>
                                                        <span className="font-bold text-xs text-gray-800 dark:text-gray-200">{new Date(stay.checkOutDate).toLocaleDateString(undefined, {month:'short', day:'numeric'})}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="bg-amber-50/50 dark:bg-amber-900/10 px-5 py-3 flex justify-between items-center border-t border-amber-100/50 dark:border-white/5">
                                            <div className="flex gap-3">
                                                {stay.confirmationCode && <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded">Ref: {stay.confirmationCode}</span>}
                                                {stay.website && <a href={stay.website.startsWith('http') ? stay.website : `https://${stay.website}`} target="_blank" className="text-[10px] font-bold text-blue-500 hover:underline flex items-center gap-1">Website <span className="material-icons-outlined text-[10px]">open_in_new</span></a>}
                                            </div>
                                            {stay.cost && <span className="font-black text-emerald-600 dark:text-emerald-400 text-sm">{formatCurrency(stay.cost)}</span>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'budget' && (
                <div className="space-y-8 animate-fade-in">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Donut Chart Card */}
                        <div className="lg:col-span-1 bg-white dark:bg-gray-800 rounded-[2.5rem] p-8 border border-gray-100 dark:border-white/5 shadow-xl flex flex-col items-center justify-center relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-500 via-amber-500 to-purple-500" />
                            <h3 className="text-lg font-black text-gray-900 dark:text-white mb-8">Expense Composition</h3>
                            
                            {/* Custom Donut Chart */}
                            <div className="relative w-64 h-64">
                                <svg viewBox="0 0 100 100" className="transform -rotate-90 w-full h-full">
                                    {/* Calculations for SVG paths */}
                                    {(() => {
                                        const r = 40;
                                        const c = 2 * Math.PI * r;
                                        const tPct = totalCost > 0 ? transportCost / totalCost : 0;
                                        const sPct = totalCost > 0 ? stayCost / totalCost : 0;
                                        const aPct = totalCost > 0 ? activityCost / totalCost : 0;
                                        
                                        return (
                                            <>
                                                <circle cx="50" cy="50" r={r} fill="transparent" strokeWidth="12" className="stroke-gray-100 dark:stroke-white/5" />
                                                {tPct > 0 && <circle cx="50" cy="50" r={r} fill="transparent" strokeWidth="12" strokeDasharray={`${tPct * c} ${c}`} strokeDashoffset="0" className="stroke-blue-500 transition-all duration-1000 ease-out" strokeLinecap="round" />}
                                                {sPct > 0 && <circle cx="50" cy="50" r={r} fill="transparent" strokeWidth="12" strokeDasharray={`${sPct * c} ${c}`} strokeDashoffset={-(tPct * c)} className="stroke-amber-500 transition-all duration-1000 ease-out" strokeLinecap="round" />}
                                                {aPct > 0 && <circle cx="50" cy="50" r={r} fill="transparent" strokeWidth="12" strokeDasharray={`${aPct * c} ${c}`} strokeDashoffset={-((tPct + sPct) * c)} className="stroke-purple-500 transition-all duration-1000 ease-out" strokeLinecap="round" />}
                                            </>
                                        );
                                    })()}
                                </svg>
                                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Expenses</span>
                                    <span className="text-3xl font-black text-gray-800 dark:text-white">{totalCost > 0 ? 'Analysis' : '0'}</span>
                                </div>
                            </div>

                            {/* Legend */}
                            <div className="w-full mt-8 space-y-3">
                                <div className="flex justify-between items-center text-xs">
                                    <div className="flex items-center gap-2">
                                        <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                                        <span className="font-bold text-gray-600 dark:text-gray-300">Transport</span>
                                    </div>
                                    <span className="font-mono font-bold text-gray-900 dark:text-white">{formatCurrency(transportCost)}</span>
                                </div>
                                <div className="flex justify-between items-center text-xs">
                                    <div className="flex items-center gap-2">
                                        <span className="w-3 h-3 rounded-full bg-amber-500"></span>
                                        <span className="font-bold text-gray-600 dark:text-gray-300">Accommodation</span>
                                    </div>
                                    <span className="font-mono font-bold text-gray-900 dark:text-white">{formatCurrency(stayCost)}</span>
                                </div>
                                <div className="flex justify-between items-center text-xs">
                                    <div className="flex items-center gap-2">
                                        <span className="w-3 h-3 rounded-full bg-purple-500"></span>
                                        <span className="font-bold text-gray-600 dark:text-gray-300">Activities</span>
                                    </div>
                                    <span className="font-mono font-bold text-gray-900 dark:text-white">{formatCurrency(activityCost)}</span>
                                </div>
                            </div>
                        </div>

                        {/* Stats & Insights */}
                        <div className="lg:col-span-2 space-y-6">
                            {/* Key Metrics Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="p-6 bg-white dark:bg-gray-800 rounded-[2rem] border border-gray-100 dark:border-white/5 shadow-sm hover:shadow-md transition-all">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl dark:bg-emerald-900/30 dark:text-emerald-400"><span className="material-icons-outlined text-lg">group</span></div>
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Cost Per Person</span>
                                    </div>
                                    <span className="text-2xl font-black text-gray-900 dark:text-white">{formatCurrency(costPerPerson)}</span>
                                </div>
                                <div className="p-6 bg-white dark:bg-gray-800 rounded-[2rem] border border-gray-100 dark:border-white/5 shadow-sm hover:shadow-md transition-all">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="p-2 bg-blue-100 text-blue-600 rounded-xl dark:bg-blue-900/30 dark:text-blue-400"><span className="material-icons-outlined text-lg">today</span></div>
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Daily Average</span>
                                    </div>
                                    <span className="text-2xl font-black text-gray-900 dark:text-white">{formatCurrency(costPerDay)}</span>
                                </div>
                                {(() => {
                                    // Identify highest single expense item
                                    let maxItem = { name: 'None', cost: 0, icon: 'paid' };
                                    trip.transports?.forEach(t => { if((t.cost||0) > maxItem.cost) maxItem = { name: t.provider, cost: t.cost||0, icon: 'flight' } });
                                    trip.accommodations?.forEach(a => { if((a.cost||0) > maxItem.cost) maxItem = { name: a.name, cost: a.cost||0, icon: 'hotel' } });
                                    
                                    return (
                                        <div className="p-6 bg-white dark:bg-gray-800 rounded-[2rem] border border-gray-100 dark:border-white/5 shadow-sm hover:shadow-md transition-all">
                                            <div className="flex items-center gap-3 mb-2">
                                                <div className="p-2 bg-rose-100 text-rose-600 rounded-xl dark:bg-rose-900/30 dark:text-rose-400"><span className="material-icons-outlined text-lg">trending_up</span></div>
                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Highest Item</span>
                                            </div>
                                            <span className="text-lg font-black text-gray-900 dark:text-white truncate block" title={maxItem.name}>{maxItem.name}</span>
                                            <span className="text-xs font-bold text-rose-500">{formatCurrency(maxItem.cost)}</span>
                                        </div>
                                    );
                                })()}
                            </div>

                            {/* Category Cards (Horizontal Bars) */}
                            <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] p-8 border border-gray-100 dark:border-white/5 shadow-lg space-y-6">
                                <h4 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest mb-2">Category Breakdown</h4>
                                
                                {/* Transport */}
                                <div>
                                    <div className="flex justify-between items-end mb-2">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg flex items-center justify-center"><span className="material-icons-outlined text-sm">commute</span></div>
                                            <div>
                                                <div className="text-xs font-bold text-gray-900 dark:text-white">Transportation</div>
                                                <div className="text-[10px] text-gray-400">{trip.transports?.length || 0} Bookings</div>
                                            </div>
                                        </div>
                                        <span className="font-black text-gray-900 dark:text-white">{formatCurrency(transportCost)}</span>
                                    </div>
                                    <div className="h-2 w-full bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${totalCost > 0 ? (transportCost/totalCost)*100 : 0}%` }} />
                                    </div>
                                </div>

                                {/* Accommodation */}
                                <div>
                                    <div className="flex justify-between items-end mb-2">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-lg flex items-center justify-center"><span className="material-icons-outlined text-sm">hotel</span></div>
                                            <div>
                                                <div className="text-xs font-bold text-gray-900 dark:text-white">Accommodation</div>
                                                <div className="text-[10px] text-gray-400">{duration - 1} Nights • Avg {formatCurrency(stayCost / (duration - 1 || 1))}/night</div>
                                            </div>
                                        </div>
                                        <span className="font-black text-gray-900 dark:text-white">{formatCurrency(stayCost)}</span>
                                    </div>
                                    <div className="h-2 w-full bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                                        <div className="h-full bg-amber-500 rounded-full" style={{ width: `${totalCost > 0 ? (stayCost/totalCost)*100 : 0}%` }} />
                                    </div>
                                </div>

                                {/* Activities */}
                                <div>
                                    <div className="flex justify-between items-end mb-2">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg flex items-center justify-center"><span className="material-icons-outlined text-sm">local_activity</span></div>
                                            <div>
                                                <div className="text-xs font-bold text-gray-900 dark:text-white">Activities</div>
                                                <div className="text-[10px] text-gray-400">{trip.activities?.length || 0} Events</div>
                                            </div>
                                        </div>
                                        <span className="font-black text-gray-900 dark:text-white">{formatCurrency(activityCost)}</span>
                                    </div>
                                    <div className="h-2 w-full bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                                        <div className="h-full bg-purple-500 rounded-full" style={{ width: `${totalCost > 0 ? (activityCost/totalCost)*100 : 0}%` }} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Itemized Ledger */}
                    <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] border border-gray-100 dark:border-white/5 shadow-sm overflow-hidden">
                        <div className="p-8 border-b border-gray-100 dark:border-white/5 bg-gray-50/30 dark:bg-white/5">
                            <h4 className="text-lg font-black text-gray-900 dark:text-white">Transaction Ledger</h4>
                        </div>
                        <div className="divide-y divide-gray-100 dark:divide-white/5">
                            {/* Combined & Sorted Items */}
                            {[
                                ...(trip.transports || []).map(t => ({ ...t, cat: 'Transport', icon: getTransportIcon(t.mode), color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400' })),
                                ...(trip.accommodations || []).map(a => ({ ...a, cat: 'Accommodation', provider: a.name, icon: 'hotel', color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400' })),
                                ...(trip.activities || []).map(a => ({ ...a, cat: 'Activity', provider: a.title, icon: 'local_activity', color: 'text-purple-600 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-400' }))
                            ].sort((a,b) => (b.cost || 0) - (a.cost || 0)).map((item, i) => (
                                <div key={i} className="p-5 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                                    <div className="flex items-center gap-5">
                                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${item.color}`}>
                                            <span className="material-icons-outlined text-xl">{item.icon}</span>
                                        </div>
                                        <div>
                                            <p className="font-bold text-gray-900 dark:text-white text-sm">{item.provider}</p>
                                            <p className="text-xs text-gray-500 font-medium">{item.cat}</p>
                                        </div>
                                    </div>
                                    <span className={`font-mono font-bold text-sm ${!item.cost ? 'text-gray-300' : 'text-gray-900 dark:text-white'}`}>
                                        {item.cost ? formatCurrency(item.cost) : '-'}
                                    </span>
                                </div>
                            ))}
                            {[...(trip.transports||[]), ...(trip.accommodations||[]), ...(trip.activities||[])].length === 0 && (
                                <div className="p-8 text-center text-xs text-gray-400 font-bold uppercase tracking-widest">No expenses recorded</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <Modal isOpen={isTransportModalOpen} onClose={() => setIsTransportModalOpen(false)} title="Manage Transport" maxWidth="max-w-4xl">
                <TransportConfigurator 
                    initialData={editingTransports || []}
                    onSave={handleSaveTransports}
                    onDelete={handleDeleteTransports}
                    onCancel={() => setIsTransportModalOpen(false)}
                    defaultStartDate={selectedDateForModal || trip.startDate}
                    defaultEndDate={selectedDateForModal || trip.endDate}
                />
            </Modal>
            
            <Modal isOpen={isAccommodationModalOpen} onClose={() => setIsAccommodationModalOpen(false)} title="Manage Accommodation" maxWidth="max-w-3xl">
                <AccommodationConfigurator 
                    initialData={editingAccommodations || []}
                    onSave={handleSaveAccommodations}
                    onDelete={handleDeleteAccommodations}
                    onCancel={() => setIsAccommodationModalOpen(false)}
                    defaultStartDate={selectedDateForModal || trip.startDate}
                    defaultEndDate={selectedDateForModal || trip.endDate}
                />
            </Modal>

            <Modal isOpen={isLocationModalOpen} onClose={() => setIsLocationModalOpen(false)} title="Route Management">
                <LocationManager 
                    locations={trip.locations || []}
                    onSave={handleSaveLocations}
                    onCancel={() => setIsLocationModalOpen(false)}
                    defaultStartDate={selectedDateForModal || trip.startDate}
                    defaultEndDate={selectedDateForModal || trip.endDate}
                />
            </Modal>

            <TripModal 
                isOpen={isEditTripOpen} 
                onClose={() => setIsEditTripOpen(false)} 
                onSubmit={handleUpdateTrip}
                onDelete={handleDeleteTrip}
                users={users}
                initialData={trip}
            />

            <LeaveRequestModal 
                isOpen={isLeaveModalOpen}
                onClose={() => setIsLeaveModalOpen(false)}
                onSubmit={handleTimeOffSubmit}
                initialData={trip}
                users={users}
                entitlements={entitlements}
                trips={allTrips}
                holidays={holidays}
                workspaceConfig={settings}
            />

            <Modal isOpen={isActivityModalOpen} onClose={() => setIsActivityModalOpen(false)} title={activityForm.id ? "Edit Item" : "Add Schedule Item"}>
                <div className="space-y-5">
                    <div className="flex p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
                        {['Activity', 'Reservation', 'Tour'].map(t => (
                            <button 
                                key={t}
                                onClick={() => setActivityForm({...activityForm, type: t as any})}
                                className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                                    (activityForm.type || 'Activity') === t 
                                    ? 'bg-white shadow-sm text-blue-600 dark:bg-gray-700 dark:text-white' 
                                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
                                }`}
                            >
                                {t}
                            </button>
                        ))}
                    </div>
                    <Input label="Title" placeholder="e.g. Dinner" value={activityForm.title || ''} onChange={e => setActivityForm({...activityForm, title: e.target.value})} className="!text-lg font-bold" />
                    <div className="grid grid-cols-2 gap-4">
                        <Input label="Date" type="date" value={activityForm.date || ''} onChange={e => setActivityForm({...activityForm, date: e.target.value})} />
                        <TimeInput label="Time" value={activityForm.time || '12:00'} onChange={val => setActivityForm({...activityForm, time: val})} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                         <div className="relative">
                            <Input label="Cost" type="number" placeholder="0.00" value={activityForm.cost || ''} onChange={e => setActivityForm({...activityForm, cost: parseFloat(e.target.value)})} className="pl-8" />
                            <span className="absolute left-3 top-9 text-gray-400 font-bold">$</span>
                         </div>
                         <Input label="Location" placeholder="Address..." value={activityForm.location || ''} onChange={e => setActivityForm({...activityForm, location: e.target.value})} />
                    </div>
                    <Input label="Notes" placeholder="Details..." value={activityForm.description || ''} onChange={e => setActivityForm({...activityForm, description: e.target.value})} />
                    <div className="flex gap-3 pt-4 border-t border-gray-100 dark:border-white/5">
                        <Button variant="ghost" className="flex-1" onClick={() => setIsActivityModalOpen(false)}>Cancel</Button>
                        <Button variant="primary" className="flex-1" onClick={handleSaveActivity} disabled={!activityForm.title || !activityForm.date}>Save Item</Button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={importPreview.open} onClose={() => setImportPreview({ open: false, candidates: [] })} title="Flight Import Analysis" maxWidth="max-w-3xl">
                <div className="space-y-6">
                    <div className="bg-gradient-to-br from-blue-500/10 to-indigo-500/10 p-5 rounded-2xl border border-blue-500/20 flex items-start gap-4">
                        <div className="w-12 h-12 rounded-xl bg-blue-500 text-white flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/20"><span className="material-icons-outlined text-2xl">smart_toy</span></div>
                        <div><h4 className="font-black text-gray-900 dark:text-white text-lg">AI Flight Analysis</h4><p className="text-sm text-gray-600 dark:text-gray-300 mt-1 leading-relaxed">We detected <strong>{importPreview.candidates.length} potential trips</strong> in your file.</p></div>
                    </div>
                    <div className="flex justify-between items-center px-1"><span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Detected Itineraries</span><div className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded-lg">{selectedCount} Selected</div></div>
                    <div className="space-y-4 max-h-[50vh] overflow-y-auto custom-scrollbar p-1">
                        {importPreview.candidates.map((candidate, idx) => {
                            const isSelected = candidate.selected;
                            const isExpanded = expandedCandidateId === candidate.trip.id;
                            return (
                                <div key={candidate.trip.id} className={`relative rounded-3xl border transition-all duration-300 overflow-hidden ${isSelected ? 'bg-white dark:bg-gray-800 border-blue-500 ring-2 ring-blue-500 shadow-xl z-10' : 'bg-white dark:bg-gray-800/50 border-gray-200 dark:border-white/10 hover:border-blue-300 dark:hover:border-blue-700'}`}>
                                    <div className="p-5 flex items-start gap-4 cursor-pointer" onClick={() => toggleCandidateSelection(candidate.trip.id)}>
                                        <div className={`mt-1 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-blue-500 border-blue-500' : 'bg-transparent border-gray-300 dark:border-gray-600'}`}>{isSelected && <span className="material-icons-outlined text-white text-sm">check</span>}</div>
                                        <div className="flex-1"><div className="pr-20"><h4 className="font-bold text-lg text-gray-900 dark:text-white leading-tight">{candidate.trip.name}</h4><div className="flex flex-wrap items-center gap-3 mt-2 text-xs font-medium text-gray-500 dark:text-gray-400"><span className="flex items-center gap-1 bg-gray-100 dark:bg-white/10 px-2 py-1 rounded-lg"><span className="material-icons-outlined text-sm">calendar_today</span>{new Date(candidate.trip.startDate).toLocaleDateString()} - {new Date(candidate.trip.endDate).toLocaleDateString()}</span><span className="flex items-center gap-1 bg-gray-100 dark:bg-white/10 px-2 py-1 rounded-lg"><span className="material-icons-outlined text-sm">flight</span>{candidate.trip.transports?.length} Flights</span></div></div></div>
                                    </div>
                                    <div className="border-t border-gray-100 dark:border-white/5"><button onClick={(e) => { e.stopPropagation(); setExpandedCandidateId(isExpanded ? null : candidate.trip.id); }} className="w-full flex items-center justify-center py-2 text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">{isExpanded ? 'Hide Details' : 'Show Flights'} <span className="material-icons-outlined text-sm ml-1">{isExpanded ? 'expand_less' : 'expand_more'}</span></button>{isExpanded && (<div className="bg-gray-50/50 dark:bg-black/20 p-4 space-y-2 animate-fade-in">{candidate.trip.transports?.map((t, i) => (<div key={i} className="flex items-center justify-between text-xs bg-white dark:bg-white/5 p-3 rounded-xl border border-gray-100 dark:border-white/5"><div className="flex items-center gap-3"><div className="font-mono font-bold text-gray-500 dark:text-gray-400 w-16">{t.provider.substring(0, 10)}</div><div className="flex items-center gap-2 font-bold text-gray-800 dark:text-white"><span>{t.origin}</span><span className="material-icons-outlined text-[10px] text-gray-400">arrow_forward</span><span>{t.destination}</span></div></div><div className="text-gray-500">{new Date(t.departureDate).toLocaleDateString()}</div></div>))}</div>)}</div>
                                </div>
                            );
                        })}
                    </div>
                    <div className="flex gap-3 pt-4 border-t border-gray-100 dark:border-white/5"><Button variant="ghost" className="flex-1" onClick={() => setImportPreview({ open: false, candidates: [] })}>Cancel</Button><Button variant="primary" className="flex-1 shadow-lg shadow-blue-500/20" onClick={confirmImportFlights} disabled={selectedCount === 0}>Import {selectedCount} Trips</Button></div>
                </div>
            </Modal>

        </div>
    );
};