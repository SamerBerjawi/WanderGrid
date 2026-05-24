
import React, { useEffect, useState, useMemo } from 'react';
import { Button, Badge, Input, Select, Modal } from '../components/ui';
import { TripModal } from '../components/TripModal';
import { dataService } from '../services/mockDb';
import { Trip, User, WorkspaceSettings, EntitlementType, PublicHoliday } from '../types';

interface VacationPlannerProps {
    onTripClick?: (tripId: string) => void;
}

export const VacationPlanner: React.FC<VacationPlannerProps> = ({ onTripClick }) => {
    const [trips, setTrips] = useState<Trip[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
    const [entitlements, setEntitlements] = useState<EntitlementType[]>([]);
    const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
    const [activeTab, setActiveTab] = useState<'Planned' | 'Confirmed' | 'History'>('Planned');
    
    const [isCreateTripOpen, setIsCreateTripOpen] = useState(false);
    const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
    const [collapsedYears, setCollapsedYears] = useState<Set<number>>(new Set());

    // Selection & Merging State
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedTripIds, setSelectedTripIds] = useState<Set<string>>(new Set());

    // New Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [filterYear, setFilterYear] = useState<string>('all');

    // Post-Trip Workflow State
    const [pendingTrip, setPendingTrip] = useState<Trip | null>(null);
    const [showPostTripPrompt, setShowPostTripPrompt] = useState(false);

    useEffect(() => {
        refreshData();
    }, []);

    const refreshData = () => {
        Promise.all([
            dataService.getTrips(), 
            dataService.getUsers(),
            dataService.getWorkspaceSettings(),
            dataService.getEntitlementTypes(),
            dataService.getSavedConfigs()
        ]).then(([t, u, s, ents, configs]) => {
            setTrips(t);
            setUsers(u);
            setSettings(s);
            setEntitlements(ents);
            const flatHolidays = configs.flatMap(c => c.holidays.map(h => ({ ...h, configId: c.id })));
            setHolidays(flatHolidays);
        });
    };

    const handleUpdateStatus = async (trip: Trip, newStatus: 'Planning' | 'Upcoming') => {
        await dataService.updateTrip({ ...trip, status: newStatus });
        refreshData();
    };

    // --- Trip Handlers ---
    const handleSaveTrip = async (tripData: Trip) => {
        let savedTrip: Trip;
        if (tripData.id && trips.some(t => t.id === tripData.id)) {
            savedTrip = await dataService.updateTrip(tripData);
        } else {
            savedTrip = await dataService.addTrip(tripData);
        }
        
        refreshData();
        setEditingTrip(null);
        setIsCreateTripOpen(false);
    };



    const handleDeleteTrip = async (tripId: string) => {
        await dataService.deleteTrip(tripId);
        refreshData();
        setEditingTrip(null);
    };

    const handleEditTrip = (trip: Trip) => {
        if (isSelectionMode) {
            toggleTripSelection(trip.id);
        } else {
            setEditingTrip(trip);
            setIsCreateTripOpen(true);
        }
    };

    const toggleTripSelection = (id: string) => {
        const newSet = new Set(selectedTripIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedTripIds(newSet);
    };

    const toggleSelectionMode = () => {
        if (isSelectionMode) {
            // Cancel mode
            setIsSelectionMode(false);
            setSelectedTripIds(new Set());
        } else {
            setIsSelectionMode(true);
        }
    };

    const handleMergeTrips = async () => {
        if (selectedTripIds.size < 2) return;
        
        const tripsToMerge = trips.filter(t => selectedTripIds.has(t.id));
        if (tripsToMerge.length === 0) return;

        // Sort by start date to determine primary
        tripsToMerge.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
        
        const primary = tripsToMerge[0];
        
        // Calculate new ranges
        const allStartDates = tripsToMerge.map(t => new Date(t.startDate).getTime());
        const allEndDates = tripsToMerge.map(t => new Date(t.endDate).getTime());
        const minStart = new Date(Math.min(...allStartDates));
        const maxEnd = new Date(Math.max(...allEndDates));
        
        const fmt = (d: Date) => d.toISOString().split('T')[0];

        // Merge Arrays
        const mergedTransports = tripsToMerge.flatMap(t => t.transports || []);
        const mergedAccommodations = tripsToMerge.flatMap(t => t.accommodations || []);
        const mergedActivities = tripsToMerge.flatMap(t => t.activities || []);
        const mergedLocations = tripsToMerge.flatMap(t => t.locations || []);
        const mergedParticipants = Array.from(new Set(tripsToMerge.flatMap(t => t.participants)));

        const newName = `Merged: ${primary.name} & +${tripsToMerge.length - 1}`;

        const mergedTrip: Trip = {
            ...primary,
            id: Math.random().toString(36).substr(2, 9),
            name: newName,
            startDate: fmt(minStart),
            endDate: fmt(maxEnd),
            transports: mergedTransports,
            accommodations: mergedAccommodations,
            activities: mergedActivities,
            locations: mergedLocations,
            participants: mergedParticipants,
            status: 'Planning' // Always reset to Planning on merge for safety
        };

        // Save new
        await dataService.addTrip(mergedTrip);
        
        // Delete old
        for (const t of tripsToMerge) {
            await dataService.deleteTrip(t.id);
        }

        setIsSelectionMode(false);
        setSelectedTripIds(new Set());
        refreshData();
    };

    const toggleYearCollapse = (year: number) => {
        const newSet = new Set(collapsedYears);
        if (newSet.has(year)) {
            newSet.delete(year);
        } else {
            newSet.add(year);
        }
        setCollapsedYears(newSet);
    };

    const formatCurrency = (amount: number) => {
        if (!settings) return `$${amount}`;
        try {
            return new Intl.NumberFormat('en-US', { style: 'currency', currency: settings.currency }).format(amount);
        } catch (e) {
            return `${settings.currency} ${amount}`;
        }
    };

    // --- Data Processing ---
    
    // Filtered base
    const filteredTrips = useMemo(() => {
        return trips.filter(t => {
            // Search Text
            const matchesSearch = !searchQuery 
                || t.name.toLowerCase().includes(searchQuery.toLowerCase()) 
                || t.location.toLowerCase().includes(searchQuery.toLowerCase());
            
            // Year Filter
            const year = new Date(t.startDate).getFullYear().toString();
            const matchesYear = filterYear === 'all' || year === filterYear;

            return matchesSearch && matchesYear;
        });
    }, [trips, searchQuery, filterYear]);

    // Available Years for Filter
    const availableYears = useMemo(() => {
        const years = new Set<number>();
        trips.forEach(t => years.add(new Date(t.startDate).getFullYear()));
        return Array.from(years).sort((a,b) => b - a);
    }, [trips]);

    // Planned: Grid view, Ascending (Next up first)
    const plannedTrips = useMemo(() => {
        return filteredTrips
            .filter(t => t.status === 'Planning')
            .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    }, [filteredTrips]);

    // Confirmed (Upcoming): Timeline view, Ascending (Soonest first)
    const confirmedTrips = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return filteredTrips
            .filter(t => t.status !== 'Planning' && new Date(t.endDate) >= today)
            .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    }, [filteredTrips]);

    // History (Past): Timeline view, Descending (Newest first)
    const historyTrips = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return filteredTrips
            .filter(t => t.status !== 'Planning' && new Date(t.endDate) < today)
            .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
    }, [filteredTrips]);

    // Grouping Logic based on Active Tab
    const timelineTripsByYear = useMemo(() => {
        const source = activeTab === 'History' ? historyTrips : confirmedTrips;
        return source.reduce((groups, trip) => {
            const year = new Date(trip.startDate).getFullYear();
            if (!groups[year]) groups[year] = [];
            groups[year].push(trip);
            return groups;
        }, {} as Record<number, Trip[]>);
    }, [activeTab, confirmedTrips, historyTrips]);

    const timelineYears = useMemo(() => {
        const years = Object.keys(timelineTripsByYear).map(Number);
        // History: Descending (2024, 2023...)
        // Confirmed: Ascending (2025, 2026...)
        return activeTab === 'History' 
            ? years.sort((a, b) => b - a)
            : years.sort((a, b) => a - b);
    }, [timelineTripsByYear, activeTab]);

    const estimatedBudgetPlanned = useMemo(() => {
        return plannedTrips.reduce((sum, t) => {
            const fCost = t.transports?.reduce((s, tr) => s + (tr.cost || 0), 0) || 0;
            const aCost = t.accommodations?.reduce((s, ac) => s + (ac.cost || 0), 0) || 0;
            return sum + fCost + aCost;
        }, 0);
    }, [plannedTrips]);

    const estimatedBudgetConfirmed = useMemo(() => {
        return confirmedTrips.reduce((sum, t) => {
            const fCost = t.transports?.reduce((s, tr) => s + (tr.cost || 0), 0) || 0;
            const aCost = t.accommodations?.reduce((s, ac) => s + (ac.cost || 0), 0) || 0;
            return sum + fCost + aCost;
        }, 0);
    }, [confirmedTrips]);

    const nextTripCountdown = useMemo(() => {
        if (confirmedTrips.length === 0) return null;
        const today = new Date();
        today.setHours(0,0,0,0);
        const next = confirmedTrips[0];
        const diffTime = new Date(next.startDate).getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return {
            name: next.name,
            days: diffDays > 0 ? diffDays : 0,
            location: next.location,
            icon: next.icon || '✈️'
        };
    }, [confirmedTrips]);

    const renderTripCard = (trip: Trip) => {
        const days = Math.ceil((new Date(trip.endDate).getTime() - new Date(trip.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1;
        const transportCount = trip.transports?.length || 0;
        const accommodationCount = trip.accommodations?.length || 0;
        const activityCount = trip.activities?.length || 0;
        
        const transportCost = trip.transports?.reduce((sum, f) => sum + (f.cost || 0), 0) || 0;
        const stayCost = trip.accommodations?.reduce((sum, a) => sum + (a.cost || 0), 0) || 0;
        const totalCost = transportCost + stayCost;

        const isSelected = selectedTripIds.has(trip.id);
        const locationsArray = trip.locations || [];

        return (
            <div 
                key={trip.id} 
                onClick={() => {
                    if (isSelectionMode) toggleTripSelection(trip.id);
                    else if (onTripClick) onTripClick(trip.id);
                    else handleEditTrip(trip);
                }}
                className={`group relative bg-white dark:bg-gray-900 rounded-[2rem] border shadow-md hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300 cursor-pointer overflow-hidden flex flex-col ${
                    isSelectionMode && isSelected 
                    ? 'border-blue-500 ring-2 ring-blue-500/50 dark:ring-offset-black transform scale-[1.01]' 
                    : 'border-gray-100 dark:border-white/5'
                }`}
            >
                    {isSelectionMode && (
                        <div className={`absolute top-5 right-5 z-20 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-blue-500 border-blue-500 text-white' : 'bg-white border-gray-300 dark:bg-gray-800'}`}>
                            {isSelected && <span className="material-icons-outlined text-sm">check</span>}
                        </div>
                    )}

                    {/* Left Accent Bar depending on Status */}
                    <div className={`absolute left-0 top-0 bottom-0 w-1.5 z-10 ${
                        trip.status === 'Planning' ? 'bg-amber-500' :
                        trip.status === 'Upcoming' ? 'bg-emerald-500' : 'bg-purple-500'
                    }`} />

                    <div className="p-6 pb-4 flex justify-between items-start relative z-10">
                        <div className="flex items-center gap-4 min-w-0">
                            <div className="w-12 h-12 rounded-xl bg-gray-50 dark:bg-white/5 text-2xl flex items-center justify-center shadow-inner shrink-0 group-hover:scale-105 transition-transform duration-300">
                                {trip.icon || '✈️'}
                            </div>
                            <div className="min-w-0">
                                <h3 className="text-base font-black text-gray-900 dark:text-white leading-tight group-hover:text-blue-500 transition-colors truncate">{trip.name}</h3>
                                <div className="text-xs font-bold text-gray-400 mt-1 flex items-center gap-2">
                                    <div className="flex items-center gap-1 min-w-0 pr-2 border-r border-gray-200 dark:border-white/10">
                                        <span className="material-icons-outlined text-[11px] text-gray-300">location_on</span>
                                        <span className="truncate max-w-[120px]">{trip.location || 'Remote'}</span>
                                    </div>
                                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider leading-none shrink-0 ${
                                        trip.privacy === 'Public' 
                                        ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30' 
                                        : 'bg-gray-50 text-gray-400 dark:bg-white/5 dark:text-gray-400'
                                    }`}>
                                        <span className="material-icons-outlined text-[10px]">{trip.privacy === 'Public' ? 'public' : 'lock'}</span>
                                        {trip.privacy || 'Private'}
                                    </span>
                                </div>
                            </div>
                        </div>
                        {!isSelectionMode && (
                            <div className="shrink-0 ml-2">
                                <button 
                                    onClick={(e) => { e.stopPropagation(); handleEditTrip(trip); }} 
                                    className="p-1.5 text-gray-300 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-white/5 rounded-lg transition-all"
                                    title="Edit Trip Settings"
                                >
                                    <span className="material-icons-outlined text-base">edit</span>
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Flight & Travel Timeline */}
                    <div className="px-6 pb-4 relative z-10">
                        <div className="flex items-center gap-2 text-[11px] font-bold text-gray-500 dark:text-gray-400 bg-gray-50/50 dark:bg-black/10 p-2.5 rounded-xl border border-gray-100 dark:border-white/5">
                            <span className="material-icons-outlined text-xs text-blue-500">calendar_today</span>
                            <span>{new Date(trip.startDate).toLocaleDateString(undefined, {month:'short', day:'numeric'})} - {new Date(trip.endDate).toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'})}</span>
                            <span className="text-blue-600 dark:text-blue-400 ml-auto font-black shrink-0">{days} Days</span>
                        </div>

                        {/* Stoppovers Summary Indicator */}
                        {locationsArray.length > 0 ? (
                            <div className="mt-3">
                                <div className="text-[10px] font-black uppercase text-gray-400 tracking-wider flex items-center gap-1.5">
                                    <span className="material-icons-outlined text-[11px] text-amber-500">alt_route</span>
                                    <span>Route Matrix ({locationsArray.length} stops)</span>
                                </div>
                                <div className="mt-2 flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
                                    {locationsArray.slice(0, 3).map((loc, idx) => (
                                        <React.Fragment key={idx}>
                                            {idx > 0 && <span className="text-gray-300 dark:text-gray-750 text-[9px] font-black shrink-0">→</span>}
                                            <span className="text-[9px] font-black text-gray-500 dark:text-gray-300 bg-gray-100 dark:bg-white/5 px-2 py-0.5 rounded-md truncate max-w-[85px]" title={loc.name}>
                                                {loc.name}
                                            </span>
                                        </React.Fragment>
                                    ))}
                                    {locationsArray.length > 3 && (
                                        <span className="text-[9px] font-bold text-blue-500 bg-blue-50 dark:bg-blue-900/10 px-1.5 py-0.5 rounded shrink-0">
                                            +{locationsArray.length - 3}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="mt-4 text-[10px] font-bold text-gray-400/80 italic flex items-center gap-1">
                                <span className="material-icons-outlined text-xs">info_outline</span>
                                <span>No stops defined in route planner</span>
                            </div>
                        )}
                    </div>

                    <div className="mt-auto bg-gray-50/50 dark:bg-black/15 border-t border-gray-100 dark:border-white/5 p-4 relative z-10">
                        <div className="grid grid-cols-3 gap-2 text-center mb-4">
                            <div className="bg-white dark:bg-gray-900 p-2 rounded-xl border border-gray-100 dark:border-white/5">
                                <span className="text-[9px] font-bold uppercase text-gray-400 block tracking-tight">Transport</span>
                                <span className="text-sm font-black text-gray-800 dark:text-white mt-0.5 block">{transportCount}</span>
                            </div>
                            <div className="bg-white dark:bg-gray-900 p-2 rounded-xl border border-gray-100 dark:border-white/5">
                                <span className="text-[9px] font-bold uppercase text-gray-400 block tracking-tight">Stays</span>
                                <span className="text-sm font-black text-gray-800 dark:text-white mt-0.5 block">{accommodationCount}</span>
                            </div>
                            <div className="bg-white dark:bg-gray-900 p-2 rounded-xl border border-gray-100 dark:border-white/5">
                                <span className="text-[9px] font-bold uppercase text-gray-400 block tracking-tight">Activities</span>
                                <span className="text-sm font-black text-gray-800 dark:text-white mt-0.5 block">{activityCount}</span>
                            </div>
                        </div>

                        <div className="flex justify-between items-center mb-3">
                            <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Estimated Cost</span>
                            <span className="text-base font-black text-emerald-600 dark:text-emerald-400">{formatCurrency(totalCost)}</span>
                        </div>

                        {!isSelectionMode && (
                            <div className="flex gap-2 pointer-events-auto">
                                {activeTab === 'Planned' ? (
                                    <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); handleUpdateStatus(trip, 'Upcoming'); }} className="flex-1 !text-emerald-600 hover:!bg-emerald-50 border-emerald-100 dark:border-emerald-900/30 dark:bg-emerald-900/10 text-xs font-bold" icon={<span className="material-icons-outlined text-sm">check_circle</span>}>
                                        Confirm
                                    </Button>
                                ) : (
                                    <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); handleUpdateStatus(trip, 'Planning'); }} className="flex-1 !text-amber-600 hover:!bg-amber-50 border-amber-100 dark:border-amber-900/30 dark:bg-amber-900/10 text-xs font-bold" icon={<span className="material-icons-outlined text-sm">undo</span>}>
                                            Revert
                                    </Button>
                                )}
                                {onTripClick && (
                                <Button size="sm" variant="primary" onClick={(e) => { e.stopPropagation(); onTripClick(trip.id); }} className="flex-1 shadow-none text-xs font-bold" icon={<span className="material-icons-outlined text-sm">visibility</span>}>
                                        Manage
                                </Button>
                                )}
                            </div>
                        )}
                    </div>
            </div>
        );
    };

    return (
        <div className="space-y-8 animate-fade-in max-w-[1400px] mx-auto pb-12">
            
            <header className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 bg-white/40 dark:bg-gray-900/40 p-6 rounded-[2rem] backdrop-blur-xl border border-white/50 dark:border-white/5 shadow-xl">
                <div className="space-y-1">
                    <h2 className="text-4xl font-black text-gray-900 dark:text-white tracking-tight">Route Planner</h2>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Logistics, transport lines, and dynamic global itineraries.</p>
                </div>
                
                <div className="flex flex-col md:flex-row gap-4 w-full xl:w-auto">
                    {/* Filters */}
                    <div className="flex items-center gap-2 bg-white/60 dark:bg-black/30 p-1.5 rounded-2xl border border-white/20 dark:border-white/10 flex-1 xl:flex-initial">
                        <div className="relative flex-1 min-w-[200px]">
                            <span className="material-icons-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">search</span>
                            <input 
                                type="text"
                                placeholder="Search trip names, stops..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full bg-transparent pl-10 pr-4 py-2 text-sm font-medium outline-none text-gray-800 dark:text-white placeholder-gray-400"
                            />
                        </div>
                        <div className="w-px h-6 bg-gray-300 dark:bg-white/10 mx-1" />
                        <select 
                            value={filterYear}
                            onChange={e => setFilterYear(e.target.value)}
                            className="bg-transparent text-xs font-bold text-gray-600 dark:text-gray-300 outline-none px-2 py-2 cursor-pointer"
                        >
                            <option value="all">All Years</option>
                            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>

                    {isSelectionMode ? (
                        <div className="flex gap-2 animate-fade-in">
                            <Button 
                                variant="ghost"
                                onClick={toggleSelectionMode}
                            >
                                Cancel
                            </Button>
                            <Button 
                                variant="primary" 
                                disabled={selectedTripIds.size < 2}
                                onClick={handleMergeTrips}
                                icon={<span className="material-icons-outlined">merge</span>}
                            >
                                Merge ({selectedTripIds.size})
                            </Button>
                        </div>
                    ) : (
                        <div className="flex gap-2">
                            <Button 
                                variant="secondary" 
                                className="border-2"
                                onClick={toggleSelectionMode}
                                icon={<span className="material-icons-outlined">checklist</span>}
                            >
                                Batch Merge
                            </Button>
                            <Button 
                                variant="primary" 
                                size="lg" 
                                icon={<span className="material-icons-outlined">add_location_alt</span>} 
                                onClick={() => { setEditingTrip(null); setIsCreateTripOpen(true); }}
                            >
                                Create Trip
                            </Button>
                        </div>
                    )}
                </div>
            </header>

            {/* Bento Dashboard Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 animate-fade-in">
                {/* Card 1: Upcoming Trips */}
                <div className="bg-white dark:bg-gray-900 rounded-[2rem] p-6 border border-gray-100 dark:border-white/5 shadow-md flex items-center gap-4 relative overflow-hidden group hover:shadow-lg transition-all duration-300">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl translate-x-1/2 -translate-y-1/2 pointer-events-none group-hover:scale-125 transition-transform duration-500" />
                    <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 text-emerald-500 dark:text-emerald-400 flex items-center justify-center text-2xl shadow-inner shrink-0">
                        <span className="material-icons-outlined">flight_takeoff</span>
                    </div>
                    <div>
                        <div className="text-2xl font-black text-gray-900 dark:text-white leading-tight">{confirmedTrips.length}</div>
                        <div className="text-[10px] font-bold uppercase text-gray-400 tracking-wider mt-1">Upcoming Trips</div>
                    </div>
                </div>

                {/* Card 2: Past Trips */}
                <div className="bg-white dark:bg-gray-900 rounded-[2rem] p-6 border border-gray-100 dark:border-white/5 shadow-md flex items-center gap-4 relative overflow-hidden group hover:shadow-lg transition-all duration-300">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-2xl translate-x-1/2 -translate-y-1/2 pointer-events-none group-hover:scale-125 transition-transform duration-500" />
                    <div className="w-12 h-12 rounded-2xl bg-purple-50 dark:bg-purple-950/20 text-purple-500 dark:text-purple-400 flex items-center justify-center text-2xl shadow-inner shrink-0">
                        <span className="material-icons-outlined">history</span>
                    </div>
                    <div>
                        <div className="text-2xl font-black text-gray-900 dark:text-white leading-tight">{historyTrips.length}</div>
                        <div className="text-[10px] font-bold uppercase text-gray-400 tracking-wider mt-1">Past Trips</div>
                    </div>
                </div>

                {/* Card 3: Planned Trips */}
                <div className="bg-white dark:bg-gray-900 rounded-[2rem] p-6 border border-gray-100 dark:border-white/5 shadow-md flex items-center gap-4 relative overflow-hidden group hover:shadow-lg transition-all duration-300">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl translate-x-1/2 -translate-y-1/2 pointer-events-none group-hover:scale-125 transition-transform duration-500" />
                    <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/20 text-amber-500 dark:text-amber-400 flex items-center justify-center text-2xl shadow-inner shrink-0">
                        <span className="material-icons-outlined">calendar_today</span>
                    </div>
                    <div>
                        <div className="text-2xl font-black text-gray-900 dark:text-white leading-tight">{plannedTrips.length}</div>
                        <div className="text-[10px] font-bold uppercase text-gray-400 tracking-wider mt-1">Planned Trips</div>
                    </div>
                </div>

                {/* Card 4: Projected Financial Balance */}
                <div className="bg-white dark:bg-gray-900 rounded-[2rem] p-6 border border-gray-100 dark:border-white/5 shadow-md flex items-center gap-4 relative overflow-hidden group hover:shadow-lg transition-all duration-300">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/5 rounded-full blur-2xl translate-x-1/2 -translate-y-1/2 pointer-events-none group-hover:scale-125 transition-transform duration-500" />
                    <div className="w-12 h-12 rounded-2xl bg-sky-50 dark:bg-sky-950/20 text-sky-500 dark:text-sky-400 flex items-center justify-center text-2xl shadow-inner shrink-0">
                        <span className="material-icons-outlined">account_balance_wallet</span>
                    </div>
                    <div>
                        <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 leading-tight">{formatCurrency(estimatedBudgetPlanned + estimatedBudgetConfirmed)}</div>
                        <div className="text-[10px] font-bold uppercase text-gray-400 tracking-wider mt-1">Total Estimated</div>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200 dark:border-white/10">
                <button 
                    onClick={() => setActiveTab('Planned')}
                    className={`px-8 py-3 text-sm font-black uppercase tracking-widest border-b-2 transition-all ${activeTab === 'Planned' ? 'border-amber-500 text-amber-600 dark:text-amber-400' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                >
                    Planned
                </button>
                <button 
                    onClick={() => setActiveTab('Confirmed')}
                    className={`px-8 py-3 text-sm font-black uppercase tracking-widest border-b-2 transition-all ${activeTab === 'Confirmed' ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                >
                    Confirmed
                </button>
                <button 
                    onClick={() => setActiveTab('History')}
                    className={`px-8 py-3 text-sm font-black uppercase tracking-widest border-b-2 transition-all ${activeTab === 'History' ? 'border-purple-500 text-purple-600 dark:text-purple-400' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                >
                    History
                </button>
            </div>

            {/* Grid vs Grouped View */}
            {activeTab === 'Planned' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                    {plannedTrips.map(trip => renderTripCard(trip))}
                    
                    {/* Add New Card Stub */}
                    <button 
                        onClick={() => { setEditingTrip(null); setIsCreateTripOpen(true); }}
                        className="group min-h-[350px] rounded-[2rem] border-2 border-dashed border-gray-200 dark:border-white/10 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50/5 dark:hover:bg-white/5 flex flex-col items-center justify-center gap-4 transition-all duration-300"
                    >
                        <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-white/5 text-gray-300 dark:text-gray-600 group-hover:bg-blue-500 group-hover:text-white flex items-center justify-center transition-all duration-300 shadow-sm group-hover:shadow-blue-500/30 group-hover:scale-110">
                            <span className="material-icons-outlined text-3xl">add</span>
                        </div>
                        <span className="font-bold text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 uppercase tracking-widest text-[10px]">Plan New Expedition</span>
                    </button>
                </div>
            ) : (
                <div className="space-y-12 relative animate-fade-in">
                    {/* Timeline Line */}
                    <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-800 hidden md:block" />
                    
                    {timelineYears.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center opacity-40">
                            <span className="material-icons-outlined text-4xl text-gray-400 mb-4">{activeTab === 'Confirmed' ? 'event_busy' : 'history_edu'}</span>
                            <h3 className="text-xl font-black text-gray-900 dark:text-white">{activeTab === 'Confirmed' ? 'No Upcoming Trips' : 'No Past Trips'}</h3>
                            <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mt-2">{activeTab === 'Confirmed' ? 'Confirm a planned trip to see it here' : 'Archive is empty'}</p>
                        </div>
                    ) : (
                        timelineYears.map(year => {
                            const isCollapsed = collapsedYears.has(year);
                            return (
                                <div key={year} className="relative md:pl-12">
                                    {/* Timeline Dot with Collapse Chevron */}
                                    <button 
                                        onClick={() => toggleYearCollapse(year)}
                                        className="absolute left-0 top-0 w-8 h-8 rounded-full bg-white dark:bg-gray-900 border-4 border-gray-100 dark:border-gray-800 text-gray-400 hover:text-blue-500 hover:border-blue-100 dark:hover:border-blue-900 transition-all flex items-center justify-center z-10 hidden md:flex active:scale-95"
                                        title={isCollapsed ? "Expand Year" : "Collapse Year"}
                                    >
                                        <span 
                                            className="material-icons-outlined text-sm transform transition-transform duration-300" 
                                            style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                                        >
                                            expand_more
                                        </span>
                                    </button>
                                    
                                    <div 
                                        className="flex items-center gap-4 mb-6 cursor-pointer group select-none"
                                        onClick={() => toggleYearCollapse(year)}
                                    >
                                        <h3 className="text-2xl font-black text-gray-900 dark:text-white opacity-40 group-hover:opacity-100 transition-opacity">{year}</h3>
                                        <div className="h-px bg-gray-100 dark:bg-white/5 flex-1" />
                                    </div>
 
                                    <div className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 transition-all duration-500 ease-in-out origin-top ${isCollapsed ? 'opacity-0 scale-y-0 h-0 overflow-hidden' : 'opacity-100 scale-y-100 h-auto'}`}>
                                        {timelineTripsByYear[year].map(trip => renderTripCard(trip))}
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>
            )}
            
            {/* Create Trip Modal */}
            <TripModal 
                isOpen={isCreateTripOpen} 
                onClose={() => setIsCreateTripOpen(false)} 
                onSubmit={handleSaveTrip}
                onDelete={handleDeleteTrip}
                users={users}
                initialData={editingTrip}
            />


        </div>
    );
};
