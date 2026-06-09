import React, { useEffect, useState, useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
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
    const [customMergeName, setCustomMergeName] = useState('');

    // New Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [filterYear, setFilterYear] = useState<string>('all');
    const [filterPrivacy, setFilterPrivacy] = useState<string>('all');

    useEffect(() => {
        refreshData();
    }, []);

    const refreshData = () => {
        Promise.all([
            dataService.getTrips(), 
            dataService.getUsers(),
            dataService.getWorkspaceSettings(),
            dataService.getEntitlementTypes(),
            dataService.getSavedConfigs(),
            dataService.getFlights()
        ]).then(([t, u, s, ents, configs, independentFlights]) => {
            const runAutoAssignment = async () => {
                let hasChanges = false;
                const updatedTrips = [...t];
                const flightsToDelete: string[] = [];

                for (const flight of (independentFlights || [])) {
                    // Only auto-assign flights that are truly independent (unassigned)
                    if (flight.tripId && flight.tripId !== 'unassigned') continue;
                    if (!flight.departureDate) continue;
                    const fDate = new Date(flight.departureDate);
                    if (isNaN(fDate.getTime())) continue;

                    // Match with a trip
                    const matchingTripIndex = updatedTrips.findIndex(tripItem => {
                        if (!tripItem.startDate || !tripItem.endDate) return false;
                        const sDate = new Date(tripItem.startDate);
                        const eDate = new Date(tripItem.endDate);
                        return fDate >= sDate && fDate <= eDate;
                    });

                    if (matchingTripIndex >= 0) {
                        const trip = updatedTrips[matchingTripIndex];
                        if (!trip.transports) trip.transports = [];

                        if (!trip.transports.some(item => item.id === flight.id)) {
                            trip.transports.push({ ...flight, mode: 'Flight' });
                            flightsToDelete.push(flight.id);
                            hasChanges = true;
                        }
                    }
                }

                if (hasChanges) {
                    for (const trip of updatedTrips) {
                        const gotAdded = trip.transports?.some(item => flightsToDelete.includes(item.id));
                        if (gotAdded) {
                            await dataService.updateTrip(trip);
                        }
                    }
                    for (const fId of flightsToDelete) {
                        await dataService.deleteFlight(fId);
                    }
                    // Fetch latest trips to synchronize state
                    const freshTrips = await dataService.getTrips();
                    return freshTrips;
                }
                return t;
            };

            runAutoAssignment().then(finalTrips => {
                setTrips(finalTrips);
                setUsers(u);
                setSettings(s);
                setEntitlements(ents);
                const flatHolidays = configs.flatMap(c => c.holidays.map(h => ({ ...h, configId: c.id })));
                setHolidays(flatHolidays);
            });
        }).catch(err => {
            console.error("Failed to load vacation planner metrics:", err);
        });
    };

    const handleUpdateStatus = async (trip: Trip, newStatus: 'Planning' | 'Upcoming') => {
        await dataService.updateTrip({ ...trip, status: newStatus });
        refreshData();
    };

    const handleSaveTrip = async (tripData: Trip, unassignedFlightsToRemove?: string[]) => {
        let savedTrip: Trip;
        if (tripData.id && trips.some(t => t.id === tripData.id)) {
            savedTrip = await dataService.updateTrip(tripData);
        } else {
            savedTrip = await dataService.addTrip(tripData);
        }
        
        if (unassignedFlightsToRemove && unassignedFlightsToRemove.length > 0) {
            for (const fId of unassignedFlightsToRemove) {
                await dataService.deleteFlight(fId);
            }
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
            setIsSelectionMode(false);
            setSelectedTripIds(new Set());
            setCustomMergeName('');
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
        const mergedParticipants = Array.from(new Set(tripsToMerge.flatMap(t => t.participants || [])));

        const newName = customMergeName.trim() || `Merged: ${primary.name} & +${tripsToMerge.length - 1} Plans`;

        const mergedTrip: Trip = {
            ...primary,
            id: 'merge-' + Math.random().toString(36).substr(2, 9),
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
        setCustomMergeName('');
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

    // Calculate planning completeness score (0 to 100)
    const calculateCompleteness = (trip: Trip) => {
        let score = 0;
        if (trip.transports && trip.transports.length > 0) score += 25;
        if (trip.accommodations && trip.accommodations.length > 0) score += 25;
        if (trip.locations && trip.locations.length > 0) score += 25;
        if (trip.participants && trip.participants.length > 0) score += 25;
        return score;
    };

    // Filtered base
    const filteredTrips = useMemo(() => {
        return trips.filter(t => {
            if ((t as any).isBundleOnly || (t as any).hideInPlanner) return false;
            const matchesSearch = !searchQuery 
                || t.name.toLowerCase().includes(searchQuery.toLowerCase()) 
                || t.location.toLowerCase().includes(searchQuery.toLowerCase());
            
            const year = new Date(t.startDate).getFullYear().toString();
            const matchesYear = filterYear === 'all' || year === filterYear;

            const matchesPrivacy = filterPrivacy === 'all' 
                || (filterPrivacy === 'public' && t.privacy === 'Public')
                || (filterPrivacy === 'private' && t.privacy !== 'Public');

            return matchesSearch && matchesYear && matchesPrivacy;
        });
    }, [trips, searchQuery, filterYear, filterPrivacy]);

    // Available Years for Filter
    const availableYears = useMemo(() => {
        const years = new Set<number>();
        trips.forEach(t => years.add(new Date(t.startDate).getFullYear()));
        return Array.from(years).sort((a,b) => b - a);
    }, [trips]);

    // Planned: Grid view
    const plannedTrips = useMemo(() => {
        return filteredTrips
            .filter(t => t.status === 'Planning')
            .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    }, [filteredTrips]);

    // Confirmed (Upcoming)
    const confirmedTrips = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return filteredTrips
            .filter(t => t.status !== 'Planning' && new Date(t.endDate) >= today)
            .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    }, [filteredTrips]);

    // History (Past)
    const historyTrips = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return filteredTrips
            .filter(t => t.status !== 'Planning' && new Date(t.endDate) < today)
            .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
    }, [filteredTrips]);

    // Grouping Logic for Timeline
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

    const getDaysDifference = (targetDateStr: string) => {
        const today = new Date();
        today.setHours(0,0,0,0);
        const target = new Date(targetDateStr);
        const diffTime = target.getTime() - today.getTime();
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    };

    // Render a gorgeous, feature-rich Trip Card
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
        const completeness = calculateCompleteness(trip);

        // Dynamic visual theme based on destination or status
        const isPast = activeTab === 'History';
        const isConfirmed = activeTab === 'Confirmed';
        
        const cardThemeColor = trip.status === 'Planning' ? 'amber' :
                               trip.status === 'Upcoming' ? 'emerald' : 'purple';

        const daysDiff = getDaysDifference(trip.startDate);

        return (
            <motion.div 
                key={trip.id} 
                layoutId={`trip-card-${trip.id}`}
                onClick={() => {
                    if (isSelectionMode) {
                        toggleTripSelection(trip.id);
                    } else if (onTripClick) {
                        onTripClick(trip.id);
                    } else {
                        handleEditTrip(trip);
                    }
                }}
                className={`group relative bg-white/70 dark:bg-zinc-900/80 rounded-[2.25rem] border backdrop-blur-xl shadow-md hover:shadow-2xl transition-all duration-300 cursor-pointer overflow-hidden flex flex-col ${
                    isSelectionMode && isSelected 
                    ? 'border-[#fa9a1d] ring-4 ring-[#fa9a1d]/30 dark:ring-offset-black scale-[1.02]' 
                    : 'border-gray-100 dark:border-white/5'
                }`}
                whileHover={{ y: -6 }}
            >
                {/* Floating Batch Selection Handle */}
                {isSelectionMode && (
                    <div className="absolute top-5 right-5 z-20">
                        <motion.div 
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className={`w-6.5 h-6.5 rounded-full border-2 flex items-center justify-center transition-all ${
                                isSelected 
                                ? 'bg-[#fa9a1d] border-[#fa9a1d] text-white shadow-md shadow-[#fa9a1d]/30' 
                                : 'bg-white border-zinc-300 dark:bg-zinc-800 dark:border-zinc-700'
                            }`}
                        >
                            {isSelected && <span className="material-icons-outlined text-sm font-black text-white">check</span>}
                        </motion.div>
                    </div>
                )}

                {/* Aesthetic Season/Ambient Header Gradient Block */}
                <div className={`h-2.5 w-full relative z-10 ${
                    cardThemeColor === 'amber' ? 'bg-gradient-to-r from-amber-400 to-orange-500' :
                    cardThemeColor === 'emerald' ? 'bg-gradient-to-r from-emerald-400 to-teal-500' : 
                    'bg-gradient-to-r from-violet-500 to-purple-600'
                }`} />

                {/* Cover section with brand badge & countdown */}
                <div className="p-6 pb-2 flex justify-between items-start relative z-10">
                    <div className="flex items-center gap-4 min-w-0">
                        {/* Dynamic Emoji Frame */}
                        <div className="w-13 h-13 rounded-2xl bg-zinc-50 dark:bg-zinc-800 text-3xl flex items-center justify-center shadow-inner shrink-0 group-hover:rotate-6 group-hover:scale-110 transition-transform duration-300">
                            {trip.icon || '✈️'}
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-lg font-black text-gray-900 dark:text-white leading-tight group-hover:text-[#fa9a1d] transition-colors truncate">
                                {trip.name}
                            </h3>
                            <div className="text-xs font-bold text-gray-400 mt-1 flex items-center gap-1.5 flex-wrap">
                                <span className="flex items-center gap-0.5 max-w-[120px] truncate">
                                    <span className="material-icons-outlined text-xs text-zinc-400">location_on</span>
                                    <span>{trip.location || 'Remote'}</span>
                                </span>
                                <span className="w-1 h-1 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                                <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${
                                    trip.privacy === 'Public' 
                                    ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/20 dark:text-blue-400 border border-blue-100/30' 
                                    : 'bg-zinc-50 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-400'
                                }`}>
                                    <span className="material-icons-outlined text-[10px]">{trip.privacy === 'Public' ? 'public' : 'lock'}</span>
                                    {trip.privacy || 'Private'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Dates Block */}
                <div className="px-6 py-2.5">
                    <div className="flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-gray-300 bg-zinc-50 dark:bg-zinc-800/40 p-3 rounded-2xl border border-zinc-100/40 dark:border-zinc-805/10">
                        <span className="material-icons-outlined text-sm text-[#fa9a1d]">calendar_today</span>
                        <div className="truncate">
                            {new Date(trip.startDate).toLocaleDateString(undefined, {month:'short', day:'numeric'})} - {new Date(trip.endDate).toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'})}
                        </div>
                        <span className="ml-auto text-xs font-black px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-gray-800 dark:text-white rounded-lg shrink-0">
                            {days} Days
                        </span>
                    </div>
                </div>

                {/* Stoppovers Matrix Line */}
                <div className="px-6 py-1 flex-1">
                    {locationsArray.length > 0 ? (
                        <div className="my-2 p-3 bg-zinc-50/50 dark:bg-[#fa9a1d]/5 rounded-2xl border border-zinc-100/10">
                            <div className="text-[10px] font-black uppercase text-zinc-450 dark:text-zinc-400 tracking-wider flex items-center justify-between">
                                <span className="flex items-center gap-1">
                                    <span className="material-icons-outlined text-xs text-[#fa9a1d]">alt_route</span>
                                    <span>Transit Routing ({locationsArray.length} stops)</span>
                                </span>
                            </div>
                            <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                                {locationsArray.slice(0, 3).map((loc, idx) => (
                                    <React.Fragment key={idx}>
                                        {idx > 0 && <span className="text-[#fa9a1d]/40 dark:text-zinc-650 text-[10px] font-black shrink-0">&bull;</span>}
                                        <span className="text-[9px] font-black text-gray-650 dark:text-gray-300 bg-white/80 dark:bg-zinc-800/80 border border-zinc-200/30 px-2.5 py-1 rounded-lg truncate max-w-[85px]" title={loc.name}>
                                            {loc.name}
                                        </span>
                                    </React.Fragment>
                                ))}
                                {locationsArray.length > 3 && (
                                    <span className="text-[9px] font-black text-white bg-gradient-to-r from-[#fa9a1d] to-[#fcb045] px-2 py-1 rounded-lg shrink-0">
                                        +{locationsArray.length - 3}
                                    </span>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="my-2 p-3 border border-dashed border-zinc-200/50 dark:border-zinc-800 rounded-2xl text-[10px] font-bold text-gray-400 italic flex items-center gap-1.5">
                            <span className="material-icons-outlined text-sm text-[#fa9a1d]/60">architecture</span>
                            <span>No stops mapped in route planner</span>
                        </div>
                    )}
                </div>

                {/* Completeness Meter & Overlapping Avatars */}
                <div className="px-6 py-2.5 space-y-3">
                    {/* Completeness Tracker */}
                    <div className="space-y-1.5">
                        <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-gray-400">
                            <span>Planning Completeness</span>
                            <span className={`font-black ${completeness === 100 ? 'text-emerald-500' : 'text-[#fa9a1d]'}`}>{completeness}%</span>
                        </div>
                        <div className="w-full h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                            <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${completeness}%` }}
                                transition={{ duration: 1, ease: 'easeOut' }}
                                className={`h-full rounded-full ${
                                    completeness === 100 
                                    ? 'bg-gradient-to-r from-emerald-400 to-teal-500' 
                                    : completeness >= 50 
                                    ? 'bg-gradient-to-r from-[#fa9a1d] to-[#fcb045]' 
                                    : 'bg-gradient-to-r from-zinc-300 to-zinc-400'
                                }`}
                            />
                        </div>
                    </div>

                    {/* Co-Travelers Avatars */}
                    <div className="flex items-center justify-between border-t border-zinc-100/80 dark:border-white/5 pt-3">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[#fa9a1d]">Co-Travelers</span>
                        <div className="flex -space-x-2.5">
                            {(trip.participants || []).slice(0, 5).map((pid, idx) => {
                                const u = users.find(user => user.id === pid);
                                if (!u) return null;
                                return (
                                    <div 
                                        key={pid} 
                                        className={`w-7 h-7 rounded-full border-2 border-white dark:border-zinc-900 flex items-center justify-center text-[9px] font-black text-white shrink-0 shadow-sm ${
                                            u.role === 'Partner' ? 'bg-[#fa9a1d]' : u.role === 'Admin' ? 'bg-sky-500' : 'bg-emerald-500'
                                        }`}
                                        title={u.name}
                                    >
                                        {u.name.charAt(0)}
                                    </div>
                                );
                            })}
                            {(trip.participants || []).length > 5 && (
                                <div className="w-7 h-7 rounded-full border-2 border-white dark:border-zinc-900 bg-zinc-800 text-white flex items-center justify-center text-[8px] font-black leading-none shrink-0 shadow-sm">
                                    +{(trip.participants || []).length - 5}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer and Interactive Actions Layout */}
                <div className="mt-auto bg-zinc-50/70 dark:bg-zinc-950/45 border-t border-gray-150/40 dark:border-white/5 p-4 space-y-3 relative z-10">
                    {/* Live Logistics Metrics grid */}
                    <div className="grid grid-cols-3 gap-1.5 text-center">
                        <div className="bg-white/80 dark:bg-zinc-900 p-2 rounded-xl border border-zinc-150/30 dark:border-zinc-800/40 shadow-xs">
                            <span className="text-[8px] font-black uppercase text-gray-400 block tracking-wider">Transport</span>
                            <span className="text-xs font-black text-zinc-800 dark:text-white mt-0.5 block">{transportCount}</span>
                        </div>
                        <div className="bg-white/80 dark:bg-zinc-900 p-2 rounded-xl border border-zinc-150/30 dark:border-zinc-800/40 shadow-xs">
                            <span className="text-[8px] font-black uppercase text-gray-400 block tracking-wider">Stays</span>
                            <span className="text-xs font-black text-zinc-800 dark:text-white mt-0.5 block">{accommodationCount}</span>
                        </div>
                        <div className="bg-white/80 dark:bg-zinc-900 p-2 rounded-xl border border-zinc-150/30 dark:border-zinc-800/40 shadow-xs">
                            <span className="text-[8px] font-black uppercase text-gray-400 block tracking-wider">Activities</span>
                            <span className="text-xs font-black text-zinc-800 dark:text-white mt-0.5 block">{activityCount}</span>
                        </div>
                    </div>

                    {/* Financial Summary */}
                    <div className="flex justify-between items-center text-xs px-1">
                        <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Estimated Budget</span>
                        <span className="font-extrabold text-emerald-600 dark:text-emerald-400 text-sm">{formatCurrency(totalCost)}</span>
                    </div>

                    {/* Interaction Block */}
                    {!isSelectionMode && (
                        <div className="flex gap-2 pt-1 pointer-events-auto">
                            {!isPast && (
                                <button 
                                    onClick={(e) => { 
                                        e.stopPropagation(); 
                                        handleUpdateStatus(trip, trip.status === 'Planning' ? 'Upcoming' : 'Planning'); 
                                    }} 
                                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3.5 rounded-xl text-xs font-black tracking-wide border transition-all ${
                                        trip.status === 'Planning' 
                                        ? 'bg-emerald-50 hover:bg-emerald-100 border-emerald-100 dark:bg-emerald-905/10 dark:hover:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' 
                                        : 'bg-amber-50 hover:bg-amber-100 border-amber-100 dark:bg-amber-905/10 dark:hover:bg-amber-900/20 text-amber-600 dark:text-amber-400'
                                    }`}
                                >
                                    <span className="material-icons-outlined text-sm font-bold">{trip.status === 'Planning' ? 'check_circle' : 'undo'}</span>
                                    <span>{trip.status === 'Planning' ? 'Confirm' : 'Revert'}</span>
                                </button>
                            )}
                            <button 
                                onClick={(e) => { 
                                    e.stopPropagation(); 
                                    if (onTripClick) onTripClick(trip.id); 
                                }} 
                                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3.5 rounded-xl text-xs font-black tracking-wide bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md shadow-blue-500/10 active:scale-95 transition-all"
                            >
                                <span className="material-icons-outlined text-sm">visibility</span>
                                <span>Manage</span>
                            </button>
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleEditTrip(trip); }} 
                                className="p-2 text-zinc-400 hover:text-[#fa9a1d] hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all"
                                title="Edit Configuration"
                            >
                                <span className="material-icons-outlined text-sm font-black">settings</span>
                            </button>
                        </div>
                    )}
                </div>
            </motion.div>
        );
    };

    return (
        <div className="space-y-8 max-w-[1400px] mx-auto pb-24 relative select-none">
            
            {/* Header: Redesigned premium Dashboard banner */}
            <header className="relative overflow-hidden bg-white/40 dark:bg-zinc-900/40 p-6 md:p-8 rounded-[2.5rem] backdrop-blur-2xl border border-white/50 dark:border-white/5 shadow-xl flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#fa9a1d]/5 dark:bg-[#fa9a1d]/10 rounded-full blur-[140px] pointer-events-none translate-x-[20%] -translate-y-[20%]" />
                
                <div className="space-y-2 relative z-10 w-full lg:w-auto">
                    <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#fa9a1d] animate-pulse" />
                        <span className="text-[10px] font-black uppercase text-[#fa9a1d] tracking-[0.2em]">Expeditions Base</span>
                    </div>
                    <h2 className="text-4xl lg:text-5xl font-black text-gray-900 dark:text-white tracking-tight">Active Planner</h2>
                    <p className="text-sm font-medium text-gray-500 dark:text-zinc-400 max-w-xl">Configure travel scopes, integrate flight itineraries, co-align workspace calendars, and batch-merge overlapping stays.</p>
                </div>
                
                <div className="flex flex-col sm:flex-row flex-wrap gap-4 w-full lg:w-auto relative z-10 items-stretch sm:items-center">
                    {/* Highly interactive modular filtering controls */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-white/60 dark:bg-zinc-950/35 p-2 rounded-2xl border border-zinc-200/50 dark:border-white/10 flex-1 lg:flex-initial min-w-0">
                        <div className="relative flex-1 min-w-[180px]">
                            <span className="material-icons-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-lg">search</span>
                            <input 
                                type="text"
                                placeholder="Search trip names, stops..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full bg-transparent pl-11 pr-4 py-2 text-sm font-medium outline-none text-gray-800 dark:text-white placeholder-zinc-455"
                            />
                        </div>
                        <div className="h-px sm:h-6 w-full sm:w-px bg-zinc-200 dark:bg-zinc-800 shrink-0" />
                        
                        <div className="flex gap-2 shrink-0">
                            <select 
                                value={filterYear}
                                onChange={e => setFilterYear(e.target.value)}
                                className="bg-transparent text-xs font-black text-gray-600 dark:text-zinc-300 outline-none px-3 py-2 cursor-pointer border border-zinc-200/40 dark:border-transparent dark:hover:border-zinc-800 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800"
                            >
                                <option value="all">All Years</option>
                                {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                            
                            <select 
                                value={filterPrivacy}
                                onChange={e => setFilterPrivacy(e.target.value)}
                                className="bg-transparent text-xs font-black text-gray-600 dark:text-zinc-300 outline-none px-3 py-2 cursor-pointer border border-zinc-200/40 dark:border-transparent dark:hover:border-zinc-800 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-805"
                            >
                                <option value="all">All Privacy</option>
                                <option value="public">🌍 Public Trips</option>
                                <option value="private">🔒 Private Trips</option>
                            </select>
                        </div>
                    </div>

                    {!isSelectionMode && (
                        <div className="flex gap-2 shrink-0 w-full sm:w-auto justify-end sm:justify-start">
                            <button 
                                onClick={toggleSelectionMode}
                                className="px-5 py-3 rounded-2xl border-2 border-zinc-200 dark:border-zinc-850 font-black text-xs text-zinc-600 dark:text-zinc-350 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-all flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                            >
                                <span className="material-icons-outlined text-sm">checklist</span>
                                <span>Batch Merge</span>
                            </button>
                            <button 
                                onClick={() => { setEditingTrip(null); setIsCreateTripOpen(true); }}
                                className="flex-1 sm:flex-initial px-6 py-3 bg-gradient-to-r from-[#fa9a1d] to-[#fcb045] text-white hover:opacity-95 shadow-lg shadow-[#fa9a1d]/20 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 active:scale-95 transition-all whitespace-nowrap cursor-pointer"
                            >
                                <span className="material-icons-outlined text-sm font-bold">add_location_alt</span>
                                <span>New Trip</span>
                            </button>
                        </div>
                    )}
                </div>
            </header>

            {/* Bento Dashboard Metrics Section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                
                {/* Micro Countdown Event Card */}
                <div className="bg-white/60 dark:bg-zinc-900/60 rounded-[2.25rem] p-6 border border-zinc-100 dark:border-white/5 shadow-md relative overflow-hidden group hover:shadow-xl transition-all duration-300 flex flex-col justify-between min-h-[140px]">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/5 rounded-full blur-2xl translate-x-1/2 -translate-y-1/2 pointer-events-none group-hover:scale-125 transition-transform duration-500" />
                    <div className="flex justify-between items-start">
                        <div className="w-11 h-11 rounded-xl bg-sky-50 dark:bg-sky-950/20 text-sky-500 flex items-center justify-center text-xl shadow-inner shrink-0 leading-none">
                            <span className="material-icons-outlined">flight_takeoff</span>
                        </div>
                        {nextTripCountdown ? (
                            <div className="text-right">
                                <span className="text-2xl font-extrabold text-blue-600 dark:text-blue-400">{nextTripCountdown.days}</span>
                                <span className="text-[10px] font-black uppercase text-zinc-400 block tracking-wider">Days to Launch</span>
                            </div>
                        ) : (
                            <span className="text-[10px] font-black uppercase text-amber-500">Standby</span>
                        )}
                    </div>
                    <div>
                        <div className="text-xs font-black text-gray-900 dark:text-white truncate max-w-[200px]" title={nextTripCountdown?.name || "No upcoming plans"}>
                            {nextTripCountdown ? nextTripCountdown.name : "Ready to plan next route?"}
                        </div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">
                            {nextTripCountdown ? `Next up / ${nextTripCountdown.location}` : "No upcoming assignments"}
                        </p>
                    </div>
                </div>

                {/* Confirmed / Active Metrics */}
                <div className="bg-white/60 dark:bg-zinc-900/60 rounded-[2.25rem] p-6 border border-zinc-100 dark:border-white/5 shadow-md relative overflow-hidden group hover:shadow-xl transition-all duration-300 flex flex-col justify-between min-h-[140px]">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl translate-x-1/2 -translate-y-1/2 pointer-events-none group-hover:scale-125 transition-transform duration-500" />
                    <div className="flex justify-between items-start">
                        <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 text-emerald-500 flex items-center justify-center text-xl shadow-inner shrink-0 leading-none">
                            <span className="material-icons-outlined">check_circle_outline</span>
                        </div>
                        <div className="text-right">
                            <span className="text-2xl font-extrabold text-[#fa9a1d]">{confirmedTrips.length}</span>
                            <span className="text-[10px] font-black uppercase text-zinc-400 block tracking-wider">Confirmed</span>
                        </div>
                    </div>
                    <div>
                        <div className="text-xs font-black text-gray-950 dark:text-white">Upcoming itineraries locked in</div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Confirmed & Sync-ready</p>
                    </div>
                </div>

                {/* Draft / Planning Queue */}
                <div className="bg-white/60 dark:bg-zinc-900/60 rounded-[2.25rem] p-6 border border-zinc-100 dark:border-white/5 shadow-md relative overflow-hidden group hover:shadow-xl transition-all duration-300 flex flex-col justify-between min-h-[140px]">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl translate-x-1/2 -translate-y-1/2 pointer-events-none group-hover:scale-125 transition-transform duration-500" />
                    <div className="flex justify-between items-start">
                        <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-950/20 text-amber-500 flex items-center justify-center text-xl shadow-inner shrink-0 leading-none">
                            <span className="material-icons-outlined">pending_actions</span>
                        </div>
                        <div className="text-right">
                            <span className="text-2xl font-extrabold text-[#fa9a1d]">{plannedTrips.length}</span>
                            <span className="text-[10px] font-black uppercase text-zinc-400 block tracking-wider">In Draft</span>
                        </div>
                    </div>
                    <div>
                        <div className="text-xs font-black text-zinc-800 dark:text-white">Active blueprints being refined</div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Planning queue status</p>
                    </div>
                </div>

                {/* Financial Pipeline */}
                <div className="bg-white/60 dark:bg-zinc-900/60 rounded-[2.25rem] p-6 border border-zinc-100 dark:border-white/5 shadow-md relative overflow-hidden group hover:shadow-xl transition-all duration-300 flex flex-col justify-between min-h-[140px]">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-2xl translate-x-1/2 -translate-y-1/2 pointer-events-none group-hover:scale-125 transition-transform duration-500" />
                    <div className="flex justify-between items-start">
                        <div className="w-11 h-11 rounded-xl bg-purple-50 dark:bg-purple-950/20 text-purple-500 flex items-center justify-center text-xl shadow-inner shrink-0 leading-none">
                            <span className="material-icons-outlined">payments</span>
                        </div>
                        <div className="text-right">
                            <span className="text-xl font-black text-emerald-500">
                                {formatCurrency(estimatedBudgetPlanned + estimatedBudgetConfirmed)}
                            </span>
                            <span className="text-[10px] font-black uppercase text-zinc-400 block tracking-wider">Committed</span>
                        </div>
                    </div>
                    <div>
                        <div className="text-xs font-black text-zinc-800 dark:text-white">Includes lodging & transit bookings</div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Aggregate budget estimate</p>
                    </div>
                </div>

            </div>

            {/* Redesigned Premium Tabs Select Bar */}
            <div className="flex justify-start relative max-w-lg mx-auto bg-zinc-100/55 dark:bg-zinc-900/50 p-1.5 rounded-[1.75rem] border border-zinc-200/50 dark:border-white/5">
                <div className="grid grid-cols-3 w-full relative">
                    <button 
                        onClick={() => setActiveTab('Planned')}
                        className={`relative z-10 py-3 rounded-2xl text-xs font-extrabold uppercase tracking-widest text-center transition-all ${
                            activeTab === 'Planned' 
                            ? 'text-[#fa9a1d]' 
                            : 'text-zinc-400 hover:text-zinc-650 dark:hover:text-zinc-300'
                        }`}
                    >
                        Planned ({plannedTrips.length})
                    </button>
                    <button 
                        onClick={() => setActiveTab('Confirmed')}
                        className={`relative z-10 py-3 rounded-2xl text-xs font-extrabold uppercase tracking-widest text-center transition-all ${
                            activeTab === 'Confirmed' 
                            ? 'text-emerald-500' 
                            : 'text-zinc-400 hover:text-zinc-650 dark:hover:text-zinc-200'
                        }`}
                    >
                        Confirmed ({confirmedTrips.length})
                    </button>
                    <button 
                        onClick={() => setActiveTab('History')}
                        className={`relative z-10 py-3 rounded-2xl text-xs font-extrabold uppercase tracking-widest text-center transition-all ${
                            activeTab === 'History' 
                            ? 'text-purple-500' 
                            : 'text-zinc-400 hover:text-zinc-650 dark:hover:text-zinc-250'
                        }`}
                    >
                        History ({historyTrips.length})
                    </button>

                    {/* Sliding Highlight Indicator */}
                    <motion.div 
                        layoutId="activeTabHighlight"
                        className={`absolute top-0 bottom-0 rounded-2xl bg-white dark:bg-zinc-850 shadow-sm transition-shadow ${
                            activeTab === 'Planned' ? 'left-[0%] w-[33.3%]' :
                            activeTab === 'Confirmed' ? 'left-[33.3%] w-[33.3%]' :
                            'left-[66.6%] w-[33.3%]'
                        }`}
                        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                </div>
            </div>

            {/* Main Content Displays */}
            <AnimatePresence mode="wait">
                {activeTab === 'Planned' ? (
                    <motion.div 
                        key="planned-tab-grid"
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -15 }}
                        className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8"
                    >
                        {plannedTrips.map(trip => renderTripCard(trip))}
                        
                        {/* Designer Wireframe Stub Add New Card */}
                        <motion.button 
                            onClick={() => { setEditingTrip(null); setIsCreateTripOpen(true); }}
                            className="group min-h-[360px] rounded-[2.25rem] border-2 border-dashed border-zinc-250 hover:border-[#fa9a1d] dark:border-zinc-800 dark:hover:border-[#fa9a1d] hover:bg-zinc-50/20 dark:hover:bg-zinc-900/10 flex flex-col items-center justify-center gap-5 transition-all duration-350"
                        >
                            <div className="w-14 h-14 rounded-full bg-zinc-55 dark:bg-zinc-800 text-zinc-350 group-hover:bg-[#fa9a1d] group-hover:text-white flex items-center justify-center transition-all duration-300 shadow-inner group-hover:scale-110">
                                <span className="material-icons-outlined text-3xl font-bold">add</span>
                            </div>
                            <div className="text-center space-y-1.5">
                                <span className="font-extrabold text-zinc-400 group-hover:text-[#fa9a1d] uppercase tracking-[0.2em] text-[10px] block">Draft New Journey</span>
                                <span className="text-[10px] font-medium text-zinc-350 dark:text-zinc-550 block max-w-[180px]">Establish route logs, link incoming flight codes, and define participants and dates.</span>
                            </div>
                        </motion.button>
                    </motion.div>
                ) : (
                    <motion.div 
                        key="timeline-tab-grid"
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -15 }}
                        className="space-y-12 relative"
                    >
                        {/* High-Fidelity Central Timeline Transit Tracker Path */}
                        <div className="absolute left-[15px] md:left-24 top-4 bottom-4 w-1 bg-gradient-to-b from-zinc-200 via-zinc-200/40 to-zinc-250/10 dark:from-zinc-800 dark:via-zinc-800/45 dark:to-zinc-850/5 hidden md:block" />
                        
                        {timelineYears.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-24 text-center">
                                <span className="material-icons-outlined text-5xl text-zinc-400 mb-4">{activeTab === 'Confirmed' ? 'event_note' : 'inventory_2'}</span>
                                <h3 className="text-xl font-bold text-zinc-800 dark:text-zinc-100">{activeTab === 'Confirmed' ? 'No Locked Expeditions' : 'Archive Registry Empty'}</h3>
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-2">{activeTab === 'Confirmed' ? 'Confirm a planned trip itinerary to activate it' : 'Historic items will generate here'}</p>
                            </div>
                        ) : (
                            timelineYears.map(year => {
                                const isCollapsed = collapsedYears.has(year);
                                return (
                                    <div key={year} className="relative md:pl-32">
                                        
                                        {/* Station Marker Dot representing Calendar Year */}
                                        <button 
                                            onClick={() => toggleYearCollapse(year)}
                                            className={`absolute left-[81px] top-1.5 w-[38px] h-[38px] rounded-full border-4 flex items-center justify-center z-15 hidden md:flex active:scale-90 transition-all ${
                                                isCollapsed 
                                                ? 'bg-zinc-100 border-zinc-200 text-zinc-400 dark:bg-zinc-800 dark:border-zinc-700' 
                                                : 'bg-white border-[#fa9a1d] text-[#fa9a1d] dark:bg-zinc-900 shadow-md shadow-[#fa9a1d]/20'
                                            }`}
                                            title={isCollapsed ? "Expand Year Record" : "Collapse Year Record"}
                                        >
                                            <ChevronDown 
                                                className="w-5 h-5 text-[#fa9a1d] transform transition-transform duration-300 pointer-events-none" 
                                                style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                                            />
                                        </button>
                                        
                                        {/* Year Title Frame */}
                                        <div 
                                            className="flex items-center gap-4 mb-8 cursor-pointer group select-none"
                                            onClick={() => toggleYearCollapse(year)}
                                        >
                                            <div className="text-left shrink-0 md:absolute md:left-0 md:top-2 md:w-20 md:text-right">
                                                <h3 className="text-2xl font-black text-[#fa9a1d] dark:text-[#fa9a1d] opacity-50 group-hover:opacity-100 transition-opacity tracking-tight">{year}</h3>
                                            </div>
                                            <div className="h-0.5 bg-zinc-200/40 dark:bg-zinc-800/40 flex-1 hidden md:block" />
                                        </div>
     
                                        <div className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 transition-all duration-300 origin-top ${isCollapsed ? 'opacity-0 scale-y-0 h-0 overflow-hidden' : 'opacity-100 scale-y-100 h-auto'}`}>
                                            {timelineTripsByYear[year].map(trip => renderTripCard(trip))}
                                        </div>
                                    </div>
                                )
                            })
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Gorgeous Bubble Dock Floating Bottom Selection Menu */}
            <AnimatePresence>
                {isSelectionMode && (
                    <motion.div 
                        initial={{ y: 80, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 80, opacity: 0 }}
                        className="fixed bottom-6 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:max-w-xl z-50 pointer-events-auto"
                    >
                        <div className="bg-zinc-950/95 dark:bg-zinc-900/95 backdrop-blur-2xl px-6 py-4.5 rounded-[1.85rem] border border-white/10 shadow-3xl text-white flex flex-col md:flex-row gap-4 items-center justify-between">
                            <div className="flex items-center gap-3.5 min-w-0 self-start md:self-auto">
                                <div className="w-10 h-10 rounded-xl bg-[#fa9a1d]/10 border border-[#fa9a1d]/30 text-[#fa9a1d] flex items-center justify-center text-lg shrink-0 scale-95">
                                    <span className="material-icons-outlined animate-pulse">merge_type</span>
                                </div>
                                <div className="min-w-0">
                                    <div className="text-xs font-black uppercase tracking-widest text-[#fa9a1d]">Batch Integrator</div>
                                    <p className="text-[11px] font-bold text-zinc-300 mt-0.5 truncate">
                                        {selectedTripIds.size === 0 
                                            ? 'Select trips to consolidate' 
                                            : `Integrate ${selectedTripIds.size} plans into unified track`}
                                    </p>
                                </div>
                            </div>

                            {selectedTripIds.size >= 2 && (
                                <div className="w-full md:w-auto shrink-0 animate-fade-in flex flex-col gap-2">
                                    <input 
                                        type="text" 
                                        placeholder="Custom unified journey name..." 
                                        value={customMergeName} 
                                        onChange={e => setCustomMergeName(e.target.value)}
                                        className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-1.5 text-xs font-bold text-white outline-none focus:border-[#fa9a1d] placeholder-zinc-500" 
                                    />
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={toggleSelectionMode} 
                                            className="flex-1 py-1.5 px-3 rounded-lg text-[10px] font-black uppercase text-zinc-400 hover:text-white transition-colors"
                                        >
                                            Dismiss
                                        </button>
                                        <button 
                                            onClick={handleMergeTrips}
                                            className="flex-1 py-1.5 px-3.5 bg-[#fa9a1d] hover:bg-[#e78310] rounded-xl text-[10px] font-black uppercase text-zinc-950 transition-all shadow-md active:scale-95 flex items-center justify-center gap-1 shrink-0"
                                        >
                                            <span className="material-icons-outlined text-xs">merge</span>
                                            Consolidate
                                        </button>
                                    </div>
                                </div>
                            )}

                            {selectedTripIds.size < 2 && (
                                <div className="flex gap-2 w-full md:w-auto shrink-0 justify-end">
                                    <button 
                                        onClick={toggleSelectionMode} 
                                        className="px-4 py-2 bg-white/10 hover:bg-white/15 rounded-xl text-xs font-bold transition-all"
                                    >
                                        Exit Selection Mode
                                    </button>
                                </div>
                            )}

                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            
            {/* Create Trip Wizard Configurator Modal */}
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
