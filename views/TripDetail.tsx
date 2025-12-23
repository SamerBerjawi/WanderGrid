
import React, { useEffect, useState } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Card, Button, Badge, Tabs, Modal, Input, Autocomplete, TimeInput } from '../components/ui';
import { TransportConfigurator } from '../components/FlightConfigurator';
import { AccommodationConfigurator } from '../components/AccommodationConfigurator';
import { LocationManager } from '../components/LocationManager';
import { TripModal } from '../components/TripModal';
import { LeaveRequestModal } from '../components/LeaveRequestModal';
import { dataService } from '../services/mockDb';
import { Trip, User, Transport, Accommodation, WorkspaceSettings, Activity, TransportMode, LocationEntry, EntitlementType, PublicHoliday, SavedConfig } from '../types';

interface TripDetailProps {
    tripId: string;
    onBack: () => void;
}

export const TripDetail: React.FC<TripDetailProps> = ({ tripId, onBack }) => {
    const [trip, setTrip] = useState<Trip | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
    
    // Dependencies for Leave Request Modal
    const [entitlements, setEntitlements] = useState<EntitlementType[]>([]);
    const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
    const [allTrips, setAllTrips] = useState<Trip[]>([]);

    const [activeTab, setActiveTab] = useState('planner'); 
    const [plannerView, setPlannerView] = useState<'list' | 'table'>('list'); 
    const [loading, setLoading] = useState(true);

    // Modals
    const [isTransportModalOpen, setIsTransportModalOpen] = useState(false);
    const [isAccommodationModalOpen, setIsAccommodationModalOpen] = useState(false);
    const [isEditTripOpen, setIsEditTripOpen] = useState(false);
    const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
    const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
    
    // Activity Modal
    const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
    const [currentDayForActivity, setCurrentDayForActivity] = useState<string>('');
    const [activityForm, setActivityForm] = useState<Partial<Activity>>({});
    
    // Context State for Modals (Pre-fill date)
    const [selectedDateForModal, setSelectedDateForModal] = useState<string | null>(null);
    const [openMenuDate, setOpenMenuDate] = useState<string | null>(null);

    // Editing States
    const [editingTransports, setEditingTransports] = useState<Transport[] | null>(null);
    const [editingAccommodations, setEditingAccommodations] = useState<Accommodation[] | null>(null);

    useEffect(() => {
        loadData();
        // Close menus on outside click
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
        if (existingActivity) {
            setActivityForm({ ...existingActivity });
        } else {
            setActivityForm({
                id: Math.random().toString(36).substr(2, 9),
                date: dateStr,
                title: '',
                time: '12:00',
                cost: 0,
                location: '',
                description: '',
                type: 'Activity'
            });
        }
        setIsActivityModalOpen(true);
    };

    const handleSaveActivity = async () => {
        if (!trip || !activityForm.title || !activityForm.date) return;
        
        const newActivity = activityForm as Activity;
        // Default to Activity if not set
        if (!newActivity.type) newActivity.type = 'Activity';

        let updatedActivities = [...(trip.activities || [])];
        
        const existingIndex = updatedActivities.findIndex(a => a.id === newActivity.id);
        if (existingIndex >= 0) {
            updatedActivities[existingIndex] = newActivity;
        } else {
            updatedActivities.push(newActivity);
        }
        
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

    // --- Time Off Handlers ---
    const handleBookTimeOff = () => {
        setIsLeaveModalOpen(true);
    };

    const handleTimeOffSubmit = async (tripData: Trip) => {
        if (!trip) return;
        
        const mergedTrip: Trip = {
            ...trip,
            ...tripData, 
            id: trip.id, 
            status: 'Upcoming' 
        };

        await dataService.updateTrip(mergedTrip);
        setTrip(mergedTrip);
        const newTrips = allTrips.map(t => t.id === mergedTrip.id ? mergedTrip : t);
        setAllTrips(newTrips);
        setIsLeaveModalOpen(false);
    };

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
        const symbols: Record<string, string> = {
            'USD': '$', 'EUR': '€', 'GBP': '£', 'AUD': 'A$', 'JPY': '¥'
        };
        return symbols[code] || code || '$';
    };

    const formatCurrency = (amount: number) => {
        if (!settings) return `$${amount}`;
        try {
            return new Intl.NumberFormat('en-US', { style: 'currency', currency: settings.currency }).format(amount);
        } catch (e) {
            return `${settings.currency} ${amount}`;
        }
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
        const m = diff % 60;
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

    const fetchLocationSuggestions = async (query: string): Promise<string[]> => {
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const context = trip?.location ? `in or near ${trip.location}` : '';
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: `List 5 distinct places, restaurants, or attractions ${context} that match "${query}". Return ONLY a raw JSON array of strings (e.g. ["Eiffel Tower, Paris", "Louvre Museum, Paris"]).`,
                config: { responseMimeType: 'application/json' }
            });
            return response.text ? JSON.parse(response.text) : [];
        } catch (e) {
            console.error(e);
            return [];
        }
    };

    // Helper to get day transports including drops for cars
    const getDayEvents = (dateStr: string) => {
        if (!trip?.transports) return [];
        const events: (Transport & { isDropoff?: boolean })[] = [];
        
        trip.transports.forEach(t => {
            // Standard Departure
            if (t.departureDate === dateStr) {
                events.push(t);
            }
            // Car Drop-off on a different day
            if (t.arrivalDate === dateStr && t.departureDate !== dateStr && (t.mode === 'Car Rental' || t.mode === 'Personal Car')) {
                events.push({ ...t, isDropoff: true });
            }
        });
        return events;
    };

    if (loading || !trip) return <div className="p-8 text-gray-400 animate-pulse">Loading Trip Data...</div>;

    const activityCost = trip.activities?.reduce((sum, a) => sum + (a.cost || 0), 0) || 0;
    const transportCost = trip.transports?.reduce((sum, f) => sum + (f.cost || 0), 0) || 0;
    const stayCost = trip.accommodations?.reduce((sum, a) => sum + (a.cost || 0), 0) || 0;
    const totalCost = transportCost + stayCost + activityCost;

    const duration = Math.ceil((new Date(trip.endDate).getTime() - new Date(trip.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1;

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

    return (
        <div className="space-y-8 animate-fade-in max-w-[1400px] mx-auto pb-12">
            
            {/* HERO CARD */}
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
                                    <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                                    <span className={trip.status === 'Upcoming' ? 'text-blue-500' : trip.status === 'Past' ? 'text-gray-400' : 'text-amber-500'}>{trip.status}</span>
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
                                    return u ? (
                                        <div key={idx} className="w-6 h-6 rounded-full bg-purple-200 border-2 border-white flex items-center justify-center text-[8px] font-bold text-purple-800" title={u.name}>{u.name.charAt(0)}</div>
                                    ) : null;
                                })}
                            </div>
                            <span className="text-[9px] font-bold text-purple-500/70 uppercase tracking-widest">{trip.participants.length} Travelers</span>
                        </div>
                        <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-white/5 flex flex-col items-center justify-center text-center">
                            <span className="text-2xl font-black text-gray-700 dark:text-gray-300">{(trip.transports?.length || 0) + (trip.accommodations?.length || 0) + (trip.activities?.length || 0)}</span>
                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Planned Items</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <Tabs 
                    tabs={[
                        { id: 'planner', label: 'Daily Planner', icon: <span className="material-icons-outlined">calendar_view_day</span> },
                        { id: 'itinerary', label: 'Bookings', icon: <span className="material-icons-outlined">commute</span> },
                        { id: 'budget', label: 'Cost Breakdown', icon: <span className="material-icons-outlined">receipt_long</span> },
                    ]}
                    activeTab={activeTab}
                    onChange={setActiveTab}
                />
                
                {activeTab === 'planner' && (
                    <div className="flex gap-2">
                        <Button variant="secondary" size="sm" onClick={() => setIsLocationModalOpen(true)} className="hidden md:flex">
                            <span className="material-icons-outlined text-sm mr-2">map</span> Manage Route
                        </Button>
                        <div className="flex p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
                            <button 
                                onClick={() => setPlannerView('list')}
                                className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${plannerView === 'list' ? 'bg-white shadow text-blue-600 dark:bg-gray-700 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}
                            >
                                <span className="material-icons-outlined text-sm align-middle mr-1">view_agenda</span> List
                            </button>
                            <button 
                                onClick={() => setPlannerView('table')}
                                className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${plannerView === 'table' ? 'bg-white shadow text-blue-600 dark:bg-gray-700 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}
                            >
                                <span className="material-icons-outlined text-sm align-middle mr-1">table_chart</span> Table
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* DAILY PLANNER VIEW */}
            {activeTab === 'planner' && (
                <>
                    {plannerView === 'list' ? (
                        <div className="space-y-6 relative">
                            {/* Vertical Timeline Line */}
                            <div className="absolute left-8 top-4 bottom-4 w-0.5 bg-gray-200 dark:bg-gray-800 hidden md:block" />

                            {tripDates.map((dateStr, index) => {
                                const dateObj = new Date(dateStr); 
                                
                                const dayEvents = getDayEvents(dateStr);
                                const dayStay = trip.accommodations?.find(a => dateStr >= a.checkInDate && dateStr < a.checkOutDate);
                                const location = getLocationForDate(dateStr);
                                
                                // Unified sorted activities list
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
                                            {/* Location Badge for Day */}
                                            {location && (
                                                <div className="inline-flex items-center gap-1 px-3 py-1 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-full text-xs font-bold uppercase tracking-wider mb-2">
                                                    <span className="material-icons-outlined text-xs">place</span>
                                                    {location.name}
                                                </div>
                                            )}

                                            {/* TRANSPORTS (Events) */}
                                            {dayEvents.map(t => (
                                                <div key={t.id + (t.isDropoff ? '_drop' : '')} className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 p-4 rounded-2xl flex items-center gap-4 hover:shadow-md transition-all">
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
                                                            {t.isDropoff && (
                                                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                                                                    to {t.dropoffLocation || t.destination}
                                                                </p>
                                                            )}
                                                            {!t.isDropoff && (t.mode === 'Car Rental' || t.mode === 'Personal Car') && (
                                                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                                                                    from {t.pickupLocation || t.origin}
                                                                </p>
                                                            )}
                                                            {!t.isDropoff && t.mode !== 'Car Rental' && t.mode !== 'Personal Car' && (
                                                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                                                                    {calculateDuration(t)} Duration
                                                                </p>
                                                            )}
                                                            {!t.isDropoff && t.distance && <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{t.distance} km</p>}
                                                        </div>
                                                    </div>
                                                    <button onClick={() => openTransportModal([t])} className="text-gray-400 hover:text-blue-500"><span className="material-icons-outlined text-sm">edit</span></button>
                                                </div>
                                            ))}

                                            {/* ACCOMMODATION */}
                                            {dayStay && (
                                                <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 p-4 rounded-2xl flex items-center gap-4 hover:shadow-md transition-all">
                                                    <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-lg shadow-amber-500/30">
                                                        <span className="material-icons-outlined">hotel</span>
                                                    </div>
                                                    <div className="flex-1">
                                                        <h4 className="font-bold text-gray-900 dark:text-white text-sm">{dayStay.name}</h4>
                                                        <p className="text-[10px] text-amber-600 dark:text-amber-300 font-bold uppercase tracking-wider">
                                                            {dayStay.checkInDate === dateStr ? 'Check-In' : 'Overnight Stay'}
                                                        </p>
                                                    </div>
                                                    <button onClick={() => openAccommodationModal()} className="text-gray-400 hover:text-amber-500"><span className="material-icons-outlined text-sm">edit</span></button>
                                                </div>
                                            )}

                                            {/* UNIFIED SCHEDULE */}
                                            {dayActivities.length > 0 && dayActivities.map(item => {
                                                if (item.type === 'Reservation') {
                                                    return (
                                                        <div key={item.id} className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30 p-4 rounded-2xl flex items-center gap-4 hover:shadow-md transition-all group/act border-l-4 border-l-emerald-500">
                                                            <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20">
                                                                <span className="material-icons-outlined">confirmation_number</span>
                                                            </div>
                                                            <div className="flex-1">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-xs font-black text-gray-500 dark:text-gray-400 bg-white dark:bg-black/20 px-1.5 py-0.5 rounded">{formatTime(item.time)}</span>
                                                                    <h4 className="font-bold text-emerald-900 dark:text-emerald-100 text-sm">{item.title}</h4>
                                                                </div>
                                                                <div className="flex gap-2 mt-1 items-center">
                                                                    <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600/70 dark:text-emerald-400/70">Reservation</span>
                                                                    {item.description && <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate max-w-[200px]">• {item.description}</span>}
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2 opacity-0 group-hover/act:opacity-100 transition-opacity">
                                                                <button onClick={() => handleOpenActivityModal(dateStr, item)} className="text-gray-400 hover:text-blue-500"><span className="material-icons-outlined text-sm">edit</span></button>
                                                                <button onClick={() => handleDeleteActivity(item.id)} className="text-gray-400 hover:text-rose-500"><span className="material-icons-outlined text-sm">delete</span></button>
                                                            </div>
                                                        </div>
                                                    );
                                                } else {
                                                    return (
                                                        <div key={item.id} className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-white/10 p-4 rounded-2xl flex items-center gap-4 hover:shadow-md transition-all group/act">
                                                            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                                                                <span className="material-icons-outlined">local_activity</span>
                                                            </div>
                                                            <div className="flex-1">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-xs font-black text-gray-400">{formatTime(item.time)}</span>
                                                                    <h4 className="font-bold text-gray-900 dark:text-white text-sm">{item.title}</h4>
                                                                </div>
                                                                {item.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">{item.description}</p>}
                                                            </div>
                                                            <div className="flex items-center gap-2 opacity-0 group-hover/act:opacity-100 transition-opacity">
                                                                <button onClick={() => handleOpenActivityModal(dateStr, item)} className="text-gray-400 hover:text-blue-500"><span className="material-icons-outlined text-sm">edit</span></button>
                                                                <button onClick={() => handleDeleteActivity(item.id)} className="text-gray-400 hover:text-rose-500"><span className="material-icons-outlined text-sm">delete</span></button>
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                            })}

                                            <button 
                                                onClick={() => handleOpenActivityModal(dateStr)}
                                                className="w-full py-3 border-2 border-dashed border-gray-200 dark:border-white/10 rounded-2xl text-xs font-bold text-gray-400 uppercase tracking-widest hover:border-blue-300 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 focus:opacity-100"
                                            >
                                                <span className="material-icons-outlined text-sm">add</span> Add Schedule Item
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        // TABLE VIEW
                        <div className="bg-white dark:bg-gray-800 rounded-[2rem] border border-gray-100 dark:border-white/5 overflow-hidden shadow-sm">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-gray-50/50 dark:bg-white/5 border-b border-gray-100 dark:border-white/5">
                                            <th className="p-4 text-[10px] font-black uppercase tracking-widest text-gray-400 w-24">Date</th>
                                            <th className="p-4 text-[10px] font-black uppercase tracking-widest text-gray-400 w-48">Transport</th>
                                            <th className="p-4 text-[10px] font-black uppercase tracking-widest text-gray-400 w-32">Location</th>
                                            <th className="p-4 text-[10px] font-black uppercase tracking-widest text-gray-400 w-24">Distance</th>
                                            <th className="p-4 text-[10px] font-black uppercase tracking-widest text-gray-400 w-24">Duration</th>
                                            <th className="p-4 text-[10px] font-black uppercase tracking-widest text-gray-400 w-48">Accommodation</th>
                                            <th className="p-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Schedule</th>
                                            <th className="p-4 text-[10px] font-black uppercase tracking-widest text-gray-400 w-12"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                                        {tripDates.map((dateStr, index) => {
                                            const dateObj = new Date(dateStr);
                                            const dayEvents = getDayEvents(dateStr);
                                            const dayStay = trip.accommodations?.find(a => dateStr >= a.checkInDate && dateStr < a.checkOutDate);
                                            const location = getLocationForDate(dateStr);
                                            
                                            // Unified sorted activities list
                                            const dayActivities = sortActivities(trip.activities?.filter(a => a.date === dateStr) || []);

                                            return (
                                                <tr key={dateStr} className="hover:bg-gray-50/50 dark:hover:bg-white/5 transition-colors group">
                                                    <td className="p-4 align-middle cursor-default">
                                                        <div className="flex flex-col">
                                                            <span className="text-xs font-black text-gray-800 dark:text-white">{dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}</span>
                                                            <span className="text-[9px] font-bold text-gray-400 uppercase">{dateObj.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}</span>
                                                        </div>
                                                    </td>
                                                    <td className="p-4 align-middle cursor-pointer hover:bg-gray-100 dark:hover:bg-white/10" onClick={() => openTransportModal(undefined, dateStr)}>
                                                        {dayEvents && dayEvents.length > 0 ? (
                                                            <div className="space-y-2">
                                                                {dayEvents.map(t => (
                                                                    <div key={t.id + (t.isDropoff ? '_d' : '')} className="flex items-center gap-2 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-1.5 rounded-lg border border-blue-100 dark:border-blue-900/30 cursor-pointer hover:bg-blue-100" onClick={(e) => { e.stopPropagation(); openTransportModal([t]); }}>
                                                                        <span className="material-icons-outlined text-sm">{getTransportIcon(t.mode)}</span>
                                                                        <span>{t.isDropoff ? `Return ${t.mode}` : (t.mode === 'Car Rental' || t.mode === 'Personal Car' ? `Pickup ${t.mode}` : `${t.origin} → ${t.destination}`)}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <span className="text-[10px] text-gray-300 font-bold uppercase tracking-widest">-</span>
                                                        )}
                                                    </td>
                                                    <td className="p-4 align-middle cursor-pointer hover:bg-gray-100 dark:hover:bg-white/10" onClick={() => openLocationModal(dateStr)}>
                                                        {location ? (
                                                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-lg text-xs font-bold">
                                                                {location.name}
                                                            </span>
                                                        ) : (
                                                            <span className="text-[10px] text-gray-300 font-bold uppercase tracking-widest">-</span>
                                                        )}
                                                    </td>
                                                    <td className="p-4 align-middle text-xs font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-white/10" onClick={() => openTransportModal(undefined, dateStr)}>
                                                        {dayEvents && dayEvents.length > 0 ? (
                                                            dayEvents.map((t, i) => (
                                                                <div key={i} className="mb-2 h-8 flex items-center">
                                                                    {!t.isDropoff && t.distance ? `${t.distance} km` : '-'}
                                                                </div>
                                                            ))
                                                        ) : (
                                                            <span className="text-[10px] text-gray-300 font-bold uppercase tracking-widest">-</span>
                                                        )}
                                                    </td>
                                                    <td className="p-4 align-middle cursor-pointer hover:bg-gray-100 dark:hover:bg-white/10" onClick={() => openTransportModal(undefined, dateStr)}>
                                                        {dayEvents && dayEvents.length > 0 ? (
                                                            <div className="space-y-2">
                                                                {dayEvents.map(t => (
                                                                    <div key={t.id} className="flex items-center h-[34px]">
                                                                         <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
                                                                             {t.isDropoff ? formatTime(t.arrivalTime) : calculateDuration(t)}
                                                                         </span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <span className="text-[10px] text-gray-300 font-bold uppercase tracking-widest">-</span>
                                                        )}
                                                    </td>
                                                    <td className="p-4 align-middle cursor-pointer hover:bg-gray-100 dark:hover:bg-white/10" onClick={() => openAccommodationModal(dateStr)}>
                                                        {dayStay ? (
                                                            <div className="flex items-center gap-2 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-1.5 rounded-lg border border-amber-100 dark:border-amber-900/30 cursor-pointer hover:bg-amber-100" onClick={(e) => { e.stopPropagation(); openAccommodationModal(dateStr); }}>
                                                                <span className="material-icons-outlined text-sm">hotel</span>
                                                                <span className="truncate max-w-[120px]">{dayStay.name}</span>
                                                            </div>
                                                        ) : (
                                                            <span className="text-[10px] text-gray-300 font-bold uppercase tracking-widest">-</span>
                                                        )}
                                                    </td>
                                                    <td className="p-4 align-middle cursor-pointer hover:bg-gray-100 dark:hover:bg-white/10" onClick={() => handleOpenActivityModal(dateStr)}>
                                                        <div className="space-y-1.5">
                                                            {dayActivities.map(item => {
                                                                if (item.type === 'Reservation') {
                                                                    return (
                                                                        <div key={item.id} onClick={(e) => { e.stopPropagation(); handleOpenActivityModal(dateStr, item); }} className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/10 px-2 py-1 rounded border border-emerald-100 dark:border-emerald-900/20 group/item hover:bg-emerald-100 dark:hover:bg-emerald-900/30 cursor-pointer">
                                                                            <span className="text-[10px] font-black opacity-70 w-8">{formatTime(item.time)}</span>
                                                                            <span className="font-bold truncate">{item.title}</span>
                                                                            <button onClick={(e) => { e.stopPropagation(); handleDeleteActivity(item.id); }} className="opacity-0 group-hover/item:opacity-100 text-emerald-400 hover:text-emerald-600 ml-auto"><span className="material-icons-outlined text-[10px]">close</span></button>
                                                                        </div>
                                                                    );
                                                                } else {
                                                                    return (
                                                                        <div key={item.id} onClick={(e) => { e.stopPropagation(); handleOpenActivityModal(dateStr, item); }} className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 group/item hover:bg-gray-100 dark:hover:bg-white/10 rounded px-1 py-0.5 cursor-pointer">
                                                                            <span className="text-[10px] font-bold text-gray-400 w-8">{formatTime(item.time)}</span>
                                                                            <span className="font-medium truncate">{item.title}</span>
                                                                            <button onClick={(e) => { e.stopPropagation(); handleDeleteActivity(item.id); }} className="opacity-0 group-hover/item:opacity-100 text-rose-400 hover:text-rose-600 ml-auto"><span className="material-icons-outlined text-[10px]">close</span></button>
                                                                        </div>
                                                                    );
                                                                }
                                                            })}
                                                            <div 
                                                                className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider hover:text-indigo-700 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity mt-2"
                                                            >
                                                                <span className="material-icons-outlined text-[10px]">add</span> Plan
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="p-4 align-middle text-center relative">
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); setOpenMenuDate(openMenuDate === dateStr ? null : dateStr); }}
                                                            className={`text-gray-300 hover:text-blue-500 transition-all p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/5 ${openMenuDate === dateStr ? 'text-blue-500 bg-gray-100 dark:bg-white/5' : ''}`}
                                                        >
                                                            <span className="material-icons-outlined text-sm">more_vert</span>
                                                        </button>
                                                        {openMenuDate === dateStr && (
                                                            <div className="absolute right-0 top-10 w-48 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-white/10 z-50 overflow-hidden flex flex-col py-1 text-left animate-fade-in origin-top-right">
                                                                <button onClick={(e) => { e.stopPropagation(); openLocationModal(dateStr); setOpenMenuDate(null); }} className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/5 text-xs font-bold text-gray-700 dark:text-gray-200 flex items-center gap-2 w-full text-left transition-colors">
                                                                    <span className="material-icons-outlined text-sm text-indigo-500">place</span> Set Location
                                                                </button>
                                                                <button onClick={(e) => { e.stopPropagation(); handleOpenActivityModal(dateStr); setOpenMenuDate(null); }} className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/5 text-xs font-bold text-gray-700 dark:text-gray-200 flex items-center gap-2 w-full text-left transition-colors">
                                                                    <span className="material-icons-outlined text-sm text-indigo-500">add_task</span> Add Activity
                                                                </button>
                                                                <button onClick={(e) => { e.stopPropagation(); openTransportModal(undefined, dateStr); setOpenMenuDate(null); }} className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/5 text-xs font-bold text-gray-700 dark:text-gray-200 flex items-center gap-2 w-full text-left transition-colors">
                                                                    <span className="material-icons-outlined text-sm text-blue-500">commute</span> Add Transport
                                                                </button>
                                                                 <button onClick={(e) => { e.stopPropagation(); openAccommodationModal(dateStr); setOpenMenuDate(null); }} className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/5 text-xs font-bold text-gray-700 dark:text-gray-200 flex items-center gap-2 w-full text-left transition-colors">
                                                                    <span className="material-icons-outlined text-sm text-amber-500">hotel</span> Add Stay
                                                                </button>
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* MANAGE BOOKINGS TAB (Updated Design) */}
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
                            <Button size="sm" variant="secondary" onClick={() => openTransportModal()}>+ Add Booking</Button>
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
                                    
                                    // CAR RENTAL / PERSONAL CAR CARD
                                    if (mode === 'Car Rental' || mode === 'Personal Car') {
                                        const car = items[0];
                                        return (
                                            <div key={gId} className="group relative bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-white/5 overflow-hidden hover:shadow-lg transition-all border-l-4 border-l-orange-500">
                                                {/* Header */}
                                                <div className="p-5 border-b border-gray-100 dark:border-white/5 flex justify-between items-start bg-orange-50/30 dark:bg-orange-900/5">
                                                    <div className="flex gap-4">
                                                        <div className="w-10 h-10 bg-white dark:bg-gray-700 rounded-lg shadow-sm flex items-center justify-center border border-gray-100 dark:border-white/5 overflow-hidden relative">
                                                            {car.logoUrl ? (
                                                                <img src={car.logoUrl} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <span className="material-icons-outlined text-orange-500 text-xl">directions_car</span>
                                                            )}
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

                                                {/* Route Grid */}
                                                <div className="p-5 grid grid-cols-2 gap-6 relative">
                                                    {/* Center Car Icon Overlay */}
                                                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white dark:bg-gray-800 rounded-full border border-gray-100 dark:border-white/10 flex items-center justify-center z-10 shadow-sm">
                                                        <span className="material-icons-outlined text-gray-400 text-sm">key</span>
                                                    </div>
                                                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[1px] h-full bg-dashed border-l border-dashed border-gray-200 dark:border-white/10 z-0"></div>

                                                    <div className="space-y-1">
                                                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">Pickup</span>
                                                        <div className="font-bold text-gray-900 dark:text-white text-sm">{car.pickupLocation}</div>
                                                        <div className="text-xs text-gray-500">{new Date(car.departureDate).toLocaleDateString()}</div>
                                                        <div className="text-xs font-mono text-gray-400">{formatTime(car.departureTime)}</div>
                                                    </div>
                                                    <div className="space-y-1 text-right">
                                                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">Dropoff</span>
                                                        <div className="font-bold text-gray-900 dark:text-white text-sm">{car.dropoffLocation}</div>
                                                        <div className="text-xs text-gray-500">{new Date(car.arrivalDate).toLocaleDateString()}</div>
                                                        <div className="text-xs font-mono text-gray-400">{formatTime(car.arrivalTime)}</div>
                                                    </div>
                                                </div>

                                                {/* Vehicle Details Footer */}
                                                <div className="bg-gray-50 dark:bg-white/5 p-4 border-t border-gray-100 dark:border-white/5 flex justify-between items-center">
                                                    <div>
                                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Vehicle</span>
                                                        <span className="font-bold text-sm text-gray-800 dark:text-gray-200">{car.vehicleModel || 'Standard Car'}</span>
                                                    </div>
                                                    {car.cost && <div className="text-lg font-black text-emerald-600 dark:text-emerald-400">{formatCurrency(car.cost)}</div>}
                                                </div>
                                            </div>
                                        );
                                    }

                                    // FLIGHT / TRAIN / BUS TICKET
                                    return (
                                        <div key={gId} className="group relative flex bg-white dark:bg-gray-800 rounded-3xl shadow-sm hover:shadow-xl transition-all border border-gray-100 dark:border-white/5 overflow-hidden border-l-4 border-l-blue-500">
                                            
                                            {/* Main Ticket Section (Left) */}
                                            <div className="flex-1 p-5 flex flex-col justify-between relative">
                                                {/* Header */}
                                                <div className="flex justify-between items-start mb-6">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 bg-white dark:bg-gray-700 rounded-lg shadow-sm border border-gray-100 dark:border-white/5 flex items-center justify-center overflow-hidden relative">
                                                            {items[0].logoUrl ? <img src={items[0].logoUrl} className="w-full h-full object-cover"/> : <span className="material-icons-outlined text-blue-500">flight</span>}
                                                        </div>
                                                        <div>
                                                            <h4 className="font-black text-gray-900 dark:text-white text-sm leading-none">{items[0].provider}</h4>
                                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{items[0].identifier}</span>
                                                        </div>
                                                    </div>
                                                    {/* Removed Class from Header, moving to leg */}
                                                </div>

                                                {/* Route Info - Iterate Segments */}
                                                <div className="space-y-0 divide-y divide-dashed divide-gray-100 dark:divide-white/5">
                                                    {items.map((leg, idx) => (
                                                        <div key={leg.id} className="relative py-4 first:pt-0 last:pb-0">
                                                            <div className="flex justify-between items-center relative">
                                                                {/* Origin */}
                                                                <div className="text-left min-w-[60px]">
                                                                    <div className="text-3xl font-black text-gray-900 dark:text-white leading-none">{leg.origin}</div>
                                                                    <div className="text-[10px] font-bold text-blue-600 dark:text-blue-400 mt-1">{formatTime(leg.departureTime)}</div>
                                                                    <div className="text-[9px] font-bold text-gray-400 uppercase">{new Date(leg.departureDate).toLocaleDateString(undefined, {month:'short', day:'numeric'})}</div>
                                                                </div>

                                                                {/* Center Graphic */}
                                                                <div className="flex flex-col items-center justify-center px-4 flex-1">
                                                                    <div className="flex items-center w-full gap-2 opacity-30 mb-1">
                                                                        <div className="h-[2px] bg-gray-400 w-full rounded-full"></div>
                                                                        {/* No rotation class, just icon */}
                                                                        <span className="material-icons-outlined text-sm text-gray-600 dark:text-gray-300">{getTransportIcon(mode)}</span>
                                                                        <div className="h-[2px] bg-gray-400 w-full rounded-full"></div>
                                                                    </div>
                                                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{calculateDuration(leg)}</span>
                                                                </div>

                                                                {/* Dest */}
                                                                <div className="text-right min-w-[60px]">
                                                                    <div className="text-3xl font-black text-gray-900 dark:text-white leading-none">{leg.destination}</div>
                                                                    <div className="text-[10px] font-bold text-blue-600 dark:text-blue-400 mt-1">{formatTime(leg.arrivalTime)}</div>
                                                                    <div className="text-[9px] font-bold text-gray-400 uppercase">{new Date(leg.arrivalDate).toLocaleDateString(undefined, {month:'short', day:'numeric'})}</div>
                                                                </div>
                                                            </div>

                                                            {/* Leg Details Row: Class, Seat, Exit */}
                                                            <div className="flex items-center justify-center gap-4 mt-3 pt-2">
                                                                {/* Class Badge with Color Coding */}
                                                                <span className={`h-6 flex items-center text-[9px] font-bold px-2 rounded uppercase tracking-wider border ${getClassColor(leg.travelClass)}`}>
                                                                    {leg.travelClass || 'Economy'}
                                                                </span>
                                                                
                                                                {/* Seat Info */}
                                                                <div className="h-6 flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 rounded border border-emerald-100 dark:border-emerald-900/30">
                                                                    <span className="material-icons-outlined text-[12px] opacity-70">{getSeatTypeIcon(leg.seatType)}</span>
                                                                    <span>{leg.seatNumber || 'Unassigned'}</span>
                                                                </div>

                                                                {/* Exit Row Indicator */}
                                                                {leg.isExitRow && (
                                                                     <div className="h-6 flex items-center gap-1 text-[9px] font-black text-orange-500 uppercase tracking-wider bg-orange-50 dark:bg-orange-900/20 px-2 rounded border border-orange-100 dark:border-orange-900/30">
                                                                        <span className="material-icons-outlined text-[10px]">emergency</span> Exit
                                                                     </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Divider Line (Dashed) */}
                                            <div className="relative w-[1px] my-4 border-l-2 border-dashed border-gray-200 dark:border-white/10 flex flex-col justify-between">
                                                <div className="absolute -top-6 -left-3 w-6 h-6 rounded-full bg-[#f3f4f6] dark:bg-black z-10"></div>
                                                <div className="absolute -bottom-6 -left-3 w-6 h-6 rounded-full bg-[#f3f4f6] dark:bg-black z-10"></div>
                                            </div>

                                            {/* Stub Section (Right) */}
                                            <div className="w-24 bg-gray-50 dark:bg-white/5 p-4 flex flex-col items-center justify-between text-center relative">
                                                <button onClick={() => openTransportModal(items)} className="absolute top-2 right-2 text-gray-300 hover:text-blue-500 p-1"><span className="material-icons-outlined text-sm">edit</span></button>
                                                
                                                <div className="mt-6 flex flex-col items-center gap-1">
                                                    {/* QR Code Removed */}
                                                </div>

                                                <div className="mb-2">
                                                    {items[0].cost && <span className="block font-black text-emerald-600 dark:text-emerald-400 text-sm">{formatCurrency(items[0].cost)}</span>}
                                                </div>
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
                                            {/* Left: Image/Icon */}
                                            <div className="w-24 h-24 rounded-2xl bg-amber-50 dark:bg-amber-900/10 flex items-center justify-center shrink-0 overflow-hidden shadow-inner relative">
                                                {stay.logoUrl ? (
                                                    <img src={stay.logoUrl} className="w-full h-full object-cover" />
                                                ) : (
                                                    <span className="material-icons-outlined text-4xl text-amber-400 opacity-50">{stay.type === 'Hotel' ? 'apartment' : 'house'}</span>
                                                )}
                                                <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[9px] font-bold text-center py-0.5 backdrop-blur-sm">
                                                    {calculateNights(stay.checkInDate, stay.checkOutDate)} Nights
                                                </div>
                                            </div>

                                            {/* Right: Info */}
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
                                        
                                        {/* Footer Bar */}
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

            {/* BUDGET TAB */}
            {activeTab === 'budget' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <Card noPadding className="rounded-[2rem] h-fit">
                        <div className="p-6 border-b border-gray-100 dark:border-white/5">
                            <h3 className="text-lg font-black text-gray-900 dark:text-white">Cost Summary</h3>
                        </div>
                        <div className="p-6 space-y-6">
                            <div className="flex justify-between items-center">
                                <span className="font-bold text-gray-600 dark:text-gray-300">Transportation</span>
                                <span className="font-black text-gray-900 dark:text-white">{formatCurrency(transportCost)}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="font-bold text-gray-600 dark:text-gray-300">Accommodation Total</span>
                                <span className="font-black text-gray-900 dark:text-white">{formatCurrency(stayCost)}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="font-bold text-gray-600 dark:text-gray-300">Activities / Misc</span>
                                <span className="font-black text-gray-900 dark:text-white">{formatCurrency(activityCost)}</span>
                            </div>
                            <div className="h-px bg-gray-100 dark:bg-white/10 my-2" />
                            <div className="flex justify-between items-center text-xl">
                                <span className="font-black text-gray-900 dark:text-white">Grand Total</span>
                                <span className="font-black text-emerald-600 dark:text-emerald-400">{formatCurrency(totalCost)}</span>
                            </div>
                        </div>
                    </Card>

                    <Card noPadding className="rounded-[2rem]">
                        <div className="p-6 border-b border-gray-100 dark:border-white/5">
                            <h3 className="text-lg font-black text-gray-900 dark:text-white">Expense Details</h3>
                        </div>
                        <div className="p-6 space-y-4 max-h-[500px] overflow-y-auto custom-scrollbar">
                            {(trip.transports || []).filter(t => t.cost).map((t, i) => (
                                <div key={'t'+i} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-white/5 rounded-xl">
                                    <div>
                                        <div className="font-bold text-sm text-gray-800 dark:text-white">{t.mode}: {t.provider}</div>
                                        <div className="text-[10px] text-gray-500">{t.origin} -&gt; {t.destination}</div>
                                    </div>
                                    <span className="font-bold text-gray-900 dark:text-white">{formatCurrency(t.cost || 0)}</span>
                                </div>
                            ))}
                            {(trip.accommodations || []).filter(a => a.cost).map((a, i) => (
                                <div key={'a'+i} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-white/5 rounded-xl">
                                    <div>
                                        <div className="font-bold text-sm text-gray-800 dark:text-white">Stay: {a.name}</div>
                                        <div className="text-[10px] text-gray-500">{a.type}</div>
                                    </div>
                                    <span className="font-bold text-gray-900 dark:text-white">{formatCurrency(a.cost || 0)}</span>
                                </div>
                            ))}
                            {(trip.activities || []).filter(a => a.cost).map((a, i) => (
                                <div key={'act'+i} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-white/5 rounded-xl">
                                    <div>
                                        <div className="font-bold text-sm text-gray-800 dark:text-white">Activity: {a.title}</div>
                                        <div className="text-[10px] text-gray-500">{new Date(a.date).toLocaleDateString()}</div>
                                    </div>
                                    <span className="font-bold text-gray-900 dark:text-white">{formatCurrency(a.cost || 0)}</span>
                                </div>
                            ))}
                            {totalCost === 0 && <div className="text-center text-gray-400 text-xs py-8 font-bold uppercase">No expenses recorded</div>}
                        </div>
                    </Card>
                </div>
            )}

            {/* MODALS */}
            <TripModal 
                isOpen={isEditTripOpen} 
                onClose={() => setIsEditTripOpen(false)} 
                onSubmit={handleUpdateTrip}
                onDelete={handleDeleteTrip}
                users={users}
                initialData={trip}
            />

            <Modal isOpen={isTransportModalOpen} onClose={() => { setIsTransportModalOpen(false); setEditingTransports(null); }} title="Manage Transport" maxWidth="max-w-6xl">
                 <TransportConfigurator 
                    initialData={editingTransports || undefined}
                    onSave={handleSaveTransports}
                    onDelete={handleDeleteTransports}
                    onCancel={() => { setIsTransportModalOpen(false); setEditingTransports(null); }}
                    defaultStartDate={selectedDateForModal || trip.startDate}
                    defaultEndDate={trip.endDate}
                 />
            </Modal>

            <Modal isOpen={isAccommodationModalOpen} onClose={() => setIsAccommodationModalOpen(false)} title="Manage Accommodations" maxWidth="max-w-4xl">
                <AccommodationConfigurator
                    initialData={editingAccommodations || []}
                    onSave={handleSaveAccommodations}
                    onDelete={handleDeleteAccommodations}
                    onCancel={() => setIsAccommodationModalOpen(false)}
                    defaultStartDate={selectedDateForModal || trip.startDate}
                    defaultEndDate={trip.endDate}
                />
            </Modal>

            <Modal isOpen={isLocationModalOpen} onClose={() => setIsLocationModalOpen(false)} title="Manage Route Locations" maxWidth="max-w-xl">
                <LocationManager 
                    locations={trip.locations || []} 
                    onSave={handleSaveLocations} 
                    onCancel={() => setIsLocationModalOpen(false)} 
                    defaultStartDate={selectedDateForModal || trip.startDate} 
                    defaultEndDate={selectedDateForModal || trip.endDate}
                />
            </Modal>

            {/* LEAVE REQUEST MODAL */}
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

            {/* ACTIVITY EDITOR MODAL */}
            <Modal isOpen={isActivityModalOpen} onClose={() => { setIsActivityModalOpen(false); setActivityForm({}); }} title="Activity Details">
                <div className="space-y-5">
                    <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-2xl flex items-center gap-4 border border-indigo-100 dark:border-indigo-900/30">
                        <div className="w-10 h-10 rounded-xl bg-indigo-500 text-white flex items-center justify-center shrink-0">
                            <span className="material-icons-outlined">calendar_today</span>
                        </div>
                        <div>
                            <h4 className="font-bold text-gray-900 dark:text-white text-sm">Planning for {currentDayForActivity ? new Date(currentDayForActivity).toLocaleDateString() : 'Date'}</h4>
                            <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">Add reservations, tours, or general plans.</p>
                        </div>
                    </div>

                    <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
                        <button 
                            onClick={() => setActivityForm(prev => ({ ...prev, type: 'Activity' }))}
                            className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase transition-all ${activityForm.type !== 'Reservation' ? 'bg-white shadow text-indigo-600 dark:bg-gray-700 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}
                        >
                            General Activity
                        </button>
                        <button 
                            onClick={() => setActivityForm(prev => ({ ...prev, type: 'Reservation' }))}
                            className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase transition-all ${activityForm.type === 'Reservation' ? 'bg-white shadow text-emerald-600 dark:bg-gray-700 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}
                        >
                            Reservation
                        </button>
                    </div>

                    <Input 
                        label="Title" 
                        placeholder={activityForm.type === 'Reservation' ? "e.g. Dinner at Mario's" : "e.g. Walk around city center"}
                        value={activityForm.title || ''}
                        onChange={e => setActivityForm({...activityForm, title: e.target.value})}
                        className="!font-bold"
                    />

                    <div className="grid grid-cols-2 gap-4">
                        <TimeInput 
                            label="Time" 
                            value={activityForm.time || '12:00'}
                            onChange={val => setActivityForm({...activityForm, time: val})}
                        />
                        <div className="relative">
                            <Input 
                                label="Cost" 
                                type="number" 
                                placeholder="0.00"
                                className="pl-8"
                                value={activityForm.cost || ''}
                                onChange={e => setActivityForm({...activityForm, cost: parseFloat(e.target.value)})}
                            />
                            <span className="absolute left-3 top-9 text-gray-400 font-bold">{getCurrencySymbol(settings?.currency || 'USD')}</span>
                        </div>
                    </div>

                    <Autocomplete 
                        label="Location" 
                        placeholder="e.g. 123 Main St"
                        value={activityForm.location || ''}
                        onChange={val => setActivityForm({...activityForm, location: val})}
                        fetchSuggestions={fetchLocationSuggestions}
                    />

                    <Input 
                        label={activityForm.type === 'Reservation' ? "Booking Reference / Notes" : "Notes / Description"} 
                        placeholder={activityForm.type === 'Reservation' ? "Res #12345" : "Bring sunscreen"}
                        value={activityForm.description || ''}
                        onChange={e => setActivityForm({...activityForm, description: e.target.value})}
                    />

                    <div className="flex gap-3 pt-2 justify-end">
                        <Button variant="ghost" onClick={() => setIsActivityModalOpen(false)}>Cancel</Button>
                        <Button variant="primary" onClick={handleSaveActivity} disabled={!activityForm.title}>Save {activityForm.type === 'Reservation' ? 'Reservation' : 'Activity'}</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
