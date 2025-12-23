import React, { useEffect, useState } from 'react';
import { Card, Button, Badge, Tabs, Modal, Input } from '../components/ui';
import { TransportConfigurator } from '../components/FlightConfigurator';
import { AccommodationConfigurator } from '../components/AccommodationConfigurator';
import { TripModal } from '../components/TripModal';
import { dataService } from '../services/mockDb';
import { Trip, User, Transport, Accommodation, WorkspaceSettings, Activity, TransportMode } from '../types';

interface TripDetailProps {
    tripId: string;
    onBack: () => void;
}

export const TripDetail: React.FC<TripDetailProps> = ({ tripId, onBack }) => {
    const [trip, setTrip] = useState<Trip | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
    const [activeTab, setActiveTab] = useState('planner'); 
    const [plannerView, setPlannerView] = useState<'list' | 'table'>('list'); 
    const [loading, setLoading] = useState(true);

    // Modals
    const [isTransportModalOpen, setIsTransportModalOpen] = useState(false);
    const [isAccommodationModalOpen, setIsAccommodationModalOpen] = useState(false);
    const [isEditTripOpen, setIsEditTripOpen] = useState(false);
    
    // Activity Modal
    const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
    const [currentDayForActivity, setCurrentDayForActivity] = useState<string>('');
    const [activityForm, setActivityForm] = useState<Partial<Activity>>({});
    
    // Editing States
    const [editingTransports, setEditingTransports] = useState<Transport[] | null>(null);
    const [editingAccommodations, setEditingAccommodations] = useState<Accommodation[] | null>(null);

    useEffect(() => {
        loadData();
    }, [tripId]);

    const loadData = () => {
        setLoading(true);
        Promise.all([
            dataService.getTrips(), 
            dataService.getUsers(),
            dataService.getWorkspaceSettings()
        ]).then(([allTrips, allUsers, s]) => {
            const t = allTrips.find(t => t.id === tripId);
            setTrip(t || null);
            setUsers(allUsers);
            setSettings(s);
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
                description: ''
            });
        }
        setIsActivityModalOpen(true);
    };

    const handleSaveActivity = async () => {
        if (!trip || !activityForm.title || !activityForm.date) return;
        
        const newActivity = activityForm as Activity;
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

    const openTransportModal = (transportSet?: Transport[]) => {
        setEditingTransports(transportSet || null);
        setIsTransportModalOpen(true);
    };

    const openAccommodationModal = () => {
        setEditingAccommodations(trip?.accommodations || []);
        setIsAccommodationModalOpen(true);
    };

    const formatCurrency = (amount: number) => {
        if (!settings) return `$${amount}`;
        try {
            return new Intl.NumberFormat('en-US', { style: 'currency', currency: settings.currency }).format(amount);
        } catch (e) {
            return `${settings.currency} ${amount}`;
        }
    };

    const getTransportIcon = (mode: TransportMode) => {
        switch(mode) {
            case 'Train': return 'train';
            case 'Bus': return 'directions_bus';
            case 'Car Rental': return 'car_rental';
            case 'Personal Car': return 'directions_car';
            default: return 'flight_takeoff';
        }
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
                        <Button variant="secondary" onClick={() => setIsEditTripOpen(true)} icon={<span className="material-icons-outlined">edit</span>}>Edit Details</Button>
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
                        { id: 'itinerary', label: 'Transportation', icon: <span className="material-icons-outlined">commute</span> },
                        { id: 'budget', label: 'Cost Breakdown', icon: <span className="material-icons-outlined">receipt_long</span> },
                    ]}
                    activeTab={activeTab}
                    onChange={setActiveTab}
                />
                
                {activeTab === 'planner' && (
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
                                
                                const dayTransports = trip.transports?.filter(f => f.departureDate === dateStr);
                                const dayStay = trip.accommodations?.find(a => dateStr >= a.checkInDate && dateStr < a.checkOutDate);
                                const dayActivities = trip.activities?.filter(a => a.date === dateStr);

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
                                            {/* TRANSPORTS */}
                                            {dayTransports && dayTransports.length > 0 && dayTransports.map(t => (
                                                <div key={t.id} className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 p-4 rounded-2xl flex items-center gap-4 hover:shadow-md transition-all">
                                                    <div className="w-10 h-10 rounded-xl bg-blue-500 text-white flex items-center justify-center shadow-lg shadow-blue-500/30">
                                                        <span className="material-icons-outlined">{getTransportIcon(t.mode)}</span>
                                                    </div>
                                                    <div className="flex-1">
                                                        <h4 className="font-bold text-gray-900 dark:text-white text-sm">{t.mode} to {t.destination}</h4>
                                                        <p className="text-[10px] text-blue-600 dark:text-blue-300 font-bold uppercase tracking-wider">
                                                            {t.provider} {t.identifier} • {t.departureTime}
                                                        </p>
                                                    </div>
                                                    <button onClick={() => { setActiveTab('itinerary'); setTimeout(() => openTransportModal([t]), 100); }} className="text-gray-400 hover:text-blue-500"><span className="material-icons-outlined text-sm">edit</span></button>
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
                                                    <button onClick={() => { setActiveTab('itinerary'); setTimeout(() => openAccommodationModal(), 100); }} className="text-gray-400 hover:text-amber-500"><span className="material-icons-outlined text-sm">edit</span></button>
                                                </div>
                                            )}

                                            {/* ACTIVITIES */}
                                            {dayActivities && dayActivities.map(act => (
                                                <div key={act.id} className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-white/10 p-4 rounded-2xl flex items-center gap-4 hover:shadow-md transition-all group/act">
                                                    <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                                                        <span className="material-icons-outlined">local_activity</span>
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs font-black text-gray-400">{act.time}</span>
                                                            <h4 className="font-bold text-gray-900 dark:text-white text-sm">{act.title}</h4>
                                                        </div>
                                                        {act.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">{act.description}</p>}
                                                    </div>
                                                    <div className="flex items-center gap-2 opacity-0 group-hover/act:opacity-100 transition-opacity">
                                                        <button onClick={() => handleOpenActivityModal(dateStr, act)} className="text-gray-400 hover:text-blue-500"><span className="material-icons-outlined text-sm">edit</span></button>
                                                        <button onClick={() => handleDeleteActivity(act.id)} className="text-gray-400 hover:text-rose-500"><span className="material-icons-outlined text-sm">delete</span></button>
                                                    </div>
                                                </div>
                                            ))}

                                            <button 
                                                onClick={() => handleOpenActivityModal(dateStr)}
                                                className="w-full py-3 border-2 border-dashed border-gray-200 dark:border-white/10 rounded-2xl text-xs font-bold text-gray-400 uppercase tracking-widest hover:border-blue-300 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 focus:opacity-100"
                                            >
                                                <span className="material-icons-outlined text-sm">add</span> Add Activity
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
                                            <th className="p-4 text-[10px] font-black uppercase tracking-widest text-gray-400 w-48">Accommodation</th>
                                            <th className="p-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Activity Plan</th>
                                            <th className="p-4 text-[10px] font-black uppercase tracking-widest text-gray-400 w-12"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                                        {tripDates.map((dateStr, index) => {
                                            const dateObj = new Date(dateStr);
                                            const dayTransports = trip.transports?.filter(f => f.departureDate === dateStr);
                                            const dayStay = trip.accommodations?.find(a => dateStr >= a.checkInDate && dateStr < a.checkOutDate);
                                            const dayActivities = trip.activities?.filter(a => a.date === dateStr);

                                            return (
                                                <tr key={dateStr} className="hover:bg-gray-50/50 dark:hover:bg-white/5 transition-colors group">
                                                    <td className="p-4 align-top">
                                                        <div className="flex flex-col">
                                                            <span className="text-xs font-black text-gray-800 dark:text-white">{dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}</span>
                                                            <span className="text-[9px] font-bold text-gray-400 uppercase">{dateObj.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}</span>
                                                        </div>
                                                    </td>
                                                    <td className="p-4 align-top">
                                                        {dayTransports && dayTransports.length > 0 ? (
                                                            <div className="space-y-2">
                                                                {dayTransports.map(t => (
                                                                    <div key={t.id} className="flex items-center gap-2 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-1.5 rounded-lg border border-blue-100 dark:border-blue-900/30 cursor-pointer hover:bg-blue-100" onClick={() => { setActiveTab('itinerary'); setTimeout(() => openTransportModal([t]), 100); }}>
                                                                        <span className="material-icons-outlined text-sm">{getTransportIcon(t.mode)}</span>
                                                                        <span>{t.origin} &rarr; {t.destination}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <span className="text-[10px] text-gray-300 font-bold uppercase tracking-widest">-</span>
                                                        )}
                                                    </td>
                                                    <td className="p-4 align-top">
                                                        {dayStay ? (
                                                            <div className="flex items-center gap-2 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-1.5 rounded-lg border border-amber-100 dark:border-amber-900/30 cursor-pointer hover:bg-amber-100" onClick={() => { setActiveTab('itinerary'); setTimeout(() => openAccommodationModal(), 100); }}>
                                                                <span className="material-icons-outlined text-sm">hotel</span>
                                                                <span className="truncate max-w-[120px]">{dayStay.name}</span>
                                                            </div>
                                                        ) : (
                                                            <span className="text-[10px] text-gray-300 font-bold uppercase tracking-widest">-</span>
                                                        )}
                                                    </td>
                                                    <td className="p-4 align-top">
                                                        <div className="space-y-1.5">
                                                            {dayActivities && dayActivities.map(act => (
                                                                <div key={act.id} className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 group/item">
                                                                    <span className="text-[10px] font-bold text-gray-400 w-8">{act.time}</span>
                                                                    <span className="font-medium truncate">{act.title}</span>
                                                                    <button onClick={() => handleDeleteActivity(act.id)} className="opacity-0 group-hover/item:opacity-100 text-rose-400 hover:text-rose-600 ml-auto"><span className="material-icons-outlined text-[10px]">close</span></button>
                                                                </div>
                                                            ))}
                                                            <button 
                                                                onClick={() => handleOpenActivityModal(dateStr)}
                                                                className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider hover:text-indigo-700 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                                            >
                                                                <span className="material-icons-outlined text-[10px]">add</span> Plan
                                                            </button>
                                                        </div>
                                                    </td>
                                                    <td className="p-4 align-middle text-center">
                                                        <button className="text-gray-300 hover:text-blue-500 transition-colors opacity-0 group-hover:opacity-100">
                                                            <span className="material-icons-outlined text-sm">more_vert</span>
                                                        </button>
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

            {/* MANAGE BOOKINGS TAB */}
            {activeTab === 'itinerary' && (
                <div className="space-y-8">
                    {/* TRANSPORT */}
                    <Card noPadding className="rounded-[2rem]">
                        <div className="p-6 border-b border-gray-100 dark:border-white/5 flex justify-between items-center bg-blue-50/10">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
                                    <span className="material-icons-outlined">commute</span>
                                </div>
                                <h3 className="text-lg font-black text-gray-900 dark:text-white">Transportation</h3>
                            </div>
                            <Button size="sm" variant="secondary" onClick={() => openTransportModal()}>+ Add Transport</Button>
                        </div>
                        <div className="p-6 space-y-6">
                            {Object.keys(transportGroups).length === 0 ? (
                                <div className="text-center py-8 text-gray-400 text-xs font-bold uppercase tracking-widest">No transport booked</div>
                            ) : (
                                Object.entries(transportGroups).map(([gId, groupTransports]) => {
                                    const items = groupTransports as Transport[];
                                    return (
                                    <div key={gId} className="bg-gray-50 dark:bg-white/5 rounded-2xl p-4 border border-gray-100 dark:border-white/5 relative group">
                                        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => openTransportModal(items)} className="p-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm text-blue-500 hover:bg-blue-50 transition-colors">
                                                <span className="material-icons-outlined text-sm">edit</span>
                                            </button>
                                        </div>
                                        <div className="space-y-4">
                                            {items.map((t, idx) => (
                                                <div key={t.id} className="flex items-center gap-4">
                                                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                                                        <span className="material-icons-outlined text-sm">{getTransportIcon(t.mode)}</span>
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-black text-gray-800 dark:text-white">{t.origin}</span>
                                                            <span className="material-icons-outlined text-xs text-gray-400">arrow_forward</span>
                                                            <span className="font-black text-gray-800 dark:text-white">{t.destination}</span>
                                                        </div>
                                                        <div className="text-xs text-gray-500 mt-0.5">{t.mode} • {t.provider} {t.identifier} • {new Date(t.departureDate).toLocaleDateString()}</div>
                                                    </div>
                                                    {t.cost && <div className="font-bold text-gray-700 dark:text-gray-300">{formatCurrency(t.cost)}</div>}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )})
                            )}
                        </div>
                    </Card>

                    {/* ACCOMMODATIONS */}
                    <Card noPadding className="rounded-[2rem]">
                        <div className="p-6 border-b border-gray-100 dark:border-white/5 flex justify-between items-center bg-amber-50/10">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                                    <span className="material-icons-outlined">hotel</span>
                                </div>
                                <h3 className="text-lg font-black text-gray-900 dark:text-white">Accommodations</h3>
                            </div>
                            <Button size="sm" variant="secondary" onClick={() => openAccommodationModal()}>Manage Stays</Button>
                        </div>
                        <div className="p-6 space-y-3">
                            {!trip.accommodations || trip.accommodations.length === 0 ? (
                                <div className="text-center py-8 text-gray-400 text-xs font-bold uppercase tracking-widest">No stays booked</div>
                            ) : (
                                trip.accommodations.map((stay, idx) => (
                                    <div key={idx} className="flex gap-4 p-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm hover:shadow-md transition-all items-center">
                                        <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 flex items-center justify-center text-2xl shrink-0">
                                            <span className="material-icons-outlined">
                                                {stay.type === 'Hotel' ? 'hotel' : stay.type === 'Airbnb' ? 'house' : 'apartment'}
                                            </span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h5 className="font-bold text-gray-900 dark:text-white truncate">{stay.name}</h5>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{stay.address}</p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <Badge color="gray" className="!px-1.5 !py-0 !text-[9px]">
                                                    {new Date(stay.checkInDate).toLocaleDateString(undefined, {month:'short', day:'numeric'})} - {new Date(stay.checkOutDate).toLocaleDateString(undefined, {month:'short', day:'numeric'})}
                                                </Badge>
                                                {stay.website && (
                                                    <a href={stay.website.startsWith('http') ? stay.website : `https://${stay.website}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-500 font-bold uppercase hover:underline">Link</a>
                                                )}
                                            </div>
                                        </div>
                                        {stay.cost && (
                                            <div className="text-right">
                                                <div className="font-black text-lg text-emerald-600 dark:text-emerald-400">{formatCurrency(stay.cost)}</div>
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </Card>
                </div>
            )}

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

            <Modal isOpen={isTransportModalOpen} onClose={() => { setIsTransportModalOpen(false); setEditingTransports(null); }} title="Manage Transport" maxWidth="max-w-2xl">
                 <TransportConfigurator 
                    initialData={editingTransports || undefined}
                    onSave={handleSaveTransports}
                    onDelete={handleDeleteTransports}
                    onCancel={() => { setIsTransportModalOpen(false); setEditingTransports(null); }}
                    defaultStartDate={trip.startDate}
                    defaultEndDate={trip.endDate}
                 />
            </Modal>

            <Modal isOpen={isAccommodationModalOpen} onClose={() => setIsAccommodationModalOpen(false)} title="Manage Accommodations" maxWidth="max-w-xl">
                <AccommodationConfigurator
                    initialData={editingAccommodations || []}
                    onSave={handleSaveAccommodations}
                    onDelete={handleDeleteAccommodations}
                    onCancel={() => setIsAccommodationModalOpen(false)}
                    defaultStartDate={trip.startDate}
                    defaultEndDate={trip.endDate}
                />
            </Modal>

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

                    <Input 
                        label="Activity Title" 
                        placeholder="e.g. Dinner at Mario's"
                        value={activityForm.title || ''}
                        onChange={e => setActivityForm({...activityForm, title: e.target.value})}
                        className="!font-bold"
                    />

                    <div className="grid grid-cols-2 gap-4">
                        <Input 
                            label="Time" 
                            type="time"
                            value={activityForm.time || ''}
                            onChange={e => setActivityForm({...activityForm, time: e.target.value})}
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
                            <span className="absolute left-3 top-9 text-gray-400 font-bold">$</span>
                        </div>
                    </div>

                    <Input 
                        label="Location" 
                        placeholder="e.g. 123 Main St"
                        value={activityForm.location || ''}
                        onChange={e => setActivityForm({...activityForm, location: e.target.value})}
                    />

                    <Input 
                        label="Notes / Description" 
                        placeholder="Reservation #, Links, etc."
                        value={activityForm.description || ''}
                        onChange={e => setActivityForm({...activityForm, description: e.target.value})}
                    />

                    <div className="flex gap-3 pt-2 justify-end">
                        <Button variant="ghost" onClick={() => setIsActivityModalOpen(false)}>Cancel</Button>
                        <Button variant="primary" onClick={handleSaveActivity} disabled={!activityForm.title}>Save Activity</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};