
import React, { useEffect, useState, useMemo } from 'react';
import { Card, Button, Badge, Input } from '../components/ui';
import { LeaveRequestModal } from '../components/LeaveRequestModal';
import { dataService } from '../services/mockDb';
import { Trip, User, EntitlementType, WorkspaceSettings, PublicHoliday } from '../types';

const COLORS = ['blue', 'green', 'amber', 'purple', 'red', 'indigo', 'gray', 'pink', 'teal', 'cyan'];

const getEntitlementColorClass = (color?: string) => {
    const map: any = { 
        blue: 'bg-blue-500', green: 'bg-emerald-500', amber: 'bg-amber-500', 
        purple: 'bg-purple-500', red: 'bg-rose-500', indigo: 'bg-indigo-500', 
        gray: 'bg-gray-500', pink: 'bg-pink-500', teal: 'bg-teal-500', cyan: 'bg-cyan-500'
    };
    return map[color || 'gray'] || 'bg-gray-500';
};

const getEntitlementTextClass = (color?: string) => {
    const map: any = { 
        blue: 'text-blue-600 dark:text-blue-400', green: 'text-emerald-600 dark:text-emerald-400', 
        amber: 'text-amber-600 dark:text-amber-400', purple: 'text-purple-600 dark:text-purple-400', 
        red: 'text-rose-600 dark:text-rose-400', indigo: 'text-indigo-600 dark:text-indigo-400', 
        gray: 'text-gray-600 dark:text-gray-400', pink: 'text-pink-600 dark:text-pink-400', 
        teal: 'text-teal-600 dark:text-teal-400', cyan: 'text-cyan-600 dark:text-cyan-400'
    };
    return map[color || 'gray'] || 'text-gray-600';
};

export const TimeOff: React.FC = () => {
    const [trips, setTrips] = useState<Trip[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [entitlements, setEntitlements] = useState<EntitlementType[]>([]);
    const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
    const [workspaceConfig, setWorkspaceConfig] = useState<WorkspaceSettings | null>(null);
    
    // Filters
    const [filterUser, setFilterUser] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'upcoming' | 'history'>('upcoming');

    // UI State
    const [collapsedYears, setCollapsedYears] = useState<Set<number>>(new Set());

    // Modal
    const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
    const [editingTrip, setEditingTrip] = useState<Trip | undefined>(undefined);

    useEffect(() => {
        refreshData();
    }, []);

    const refreshData = () => {
        Promise.all([
            dataService.getTrips(),
            dataService.getUsers(),
            dataService.getEntitlementTypes(),
            dataService.getSavedConfigs(),
            dataService.getWorkspaceSettings()
        ]).then(([t, u, ents, configs, config]) => {
            setTrips(t.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()));
            setUsers(u);
            setEntitlements(ents);
            const allHolidays = configs.flatMap(c => c.holidays.map(h => ({ ...h, configId: c.id })));
            setHolidays(allHolidays);
            setWorkspaceConfig(config);
        });
    };

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const getDayMonth = (dateStr: string) => {
        const d = new Date(dateStr);
        return {
            day: d.getDate(),
            month: d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase(),
            weekday: d.toLocaleDateString(undefined, { weekday: 'short' })
        };
    };

    const getDuration = (start: string, end: string) => {
        const s = new Date(start);
        const e = new Date(end);
        const diff = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        return diff;
    };

    const getNextMonday = (dateStr: string) => {
        const d = new Date(dateStr);
        const day = d.getDay();
        const diff = day === 0 ? 1 : (day === 6 ? 2 : 0);
        if (diff === 0) return dateStr;
        const next = new Date(d);
        next.setDate(d.getDate() + diff);
        return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
    };

    const calculateDeduction = (trip: Trip) => {
         // 1. Check allocations
         if (trip.allocations && trip.allocations.length > 0) {
             return trip.allocations.reduce((acc, curr) => acc + curr.days, 0);
         }

         // 2. Check Entitlement - if none, it's 0 (General Event)
         if (!trip.entitlementId) return 0;

         // 3. Calc Logic
         const userId = trip.participants[0];
         const user = users.find(u => u.id === userId);
         if (!user || !workspaceConfig) return 0;

         // Build holiday map for this user
         const holidaySet = new Set<string>();
         holidays.forEach(h => {
             if (h.isIncluded && user.holidayConfigIds?.includes(h.configId || '')) {
                 holidaySet.add(h.date);
                 if (user.holidayWeekendRule === 'monday') {
                     const d = new Date(h.date);
                     if (d.getDay() === 0 || d.getDay() === 6) {
                         holidaySet.add(getNextMonday(h.date));
                     }
                 }
             }
         });

         const parseDate = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
         const start = parseDate(trip.startDate);
         const end = parseDate(trip.endDate);
         
         if (end.getTime() < start.getTime()) return 0;

         let days = 0;
         const current = new Date(start);

         while (current <= end) {
             const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
             const day = current.getDay();
             const isWeekend = !workspaceConfig.workingDays.includes(day);
             const isHoliday = holidaySet.has(dateStr);
             const isExcluded = trip.excludedDates?.includes(dateStr);

             if (!isWeekend && !isHoliday && !isExcluded) {
                 let weight = 1;
                 if (trip.durationMode?.includes('am') || trip.durationMode?.includes('pm')) weight = 0.5;
                 else if (trip.durationMode === 'custom') {
                     const isStart = current.getTime() === start.getTime();
                     const isEnd = current.getTime() === end.getTime();
                     if (isStart && isEnd) {
                         if (trip.startPortion === 'pm' || trip.endPortion === 'am') weight = 0.5;
                     } else {
                         if (isStart && trip.startPortion === 'pm') weight = 0.5;
                         else if (isEnd && trip.endPortion === 'am') weight = 0.5;
                     }
                 }
                 days += weight;
             }
             current.setDate(current.getDate() + 1);
         }
         return days;
    };

    const handleOpenRequest = () => {
        setEditingTrip(undefined);
        setIsRequestModalOpen(true);
    };

    const handleEditRequest = (trip: Trip) => {
        setEditingTrip(trip);
        setIsRequestModalOpen(true);
    };

    const handleSubmitRequest = async (tripData: Trip) => {
        if (tripData.id && trips.some(t => t.id === tripData.id)) {
            await dataService.updateTrip(tripData);
        } else {
            await dataService.addTrip(tripData);
        }
        refreshData();
        setIsRequestModalOpen(false);
    };

    const handleDeleteRequest = async (tripId: string) => {
        await dataService.deleteTrip(tripId);
        refreshData();
        setIsRequestModalOpen(false);
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

    // --- Filtering Logic ---
    const filteredTrips = useMemo(() => {
        return trips.filter(t => {
            const matchesUser = filterUser === 'all' || t.participants.includes(filterUser);
            const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                  t.location.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesUser && matchesSearch;
        });
    }, [trips, filterUser, searchQuery]);

    const upcomingTrips = filteredTrips.filter(t => new Date(t.endDate) >= new Date()).sort((a,b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    const pastTrips = filteredTrips.filter(t => new Date(t.endDate) < new Date()).sort((a,b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

    const pastTripsByYear = useMemo(() => {
        return pastTrips.reduce((groups, trip) => {
            const year = new Date(trip.startDate).getFullYear();
            if (!groups[year]) groups[year] = [];
            groups[year].push(trip);
            return groups;
        }, {} as Record<number, Trip[]>);
    }, [pastTrips]);

    const years = Object.keys(pastTripsByYear).map(Number).sort((a, b) => b - a);

    const renderTripCard = (trip: Trip) => {
        const dateInfo = getDayMonth(trip.startDate);
        const duration = getDuration(trip.startDate, trip.endDate);
        const deduction = calculateDeduction(trip);
        const ent = entitlements.find(e => e.id === trip.entitlementId);
        const colorClass = getEntitlementColorClass(ent?.color);
        const textClass = getEntitlementTextClass(ent?.color);
        const displayName = trip.name.includes(':') ? trip.name.substring(trip.name.indexOf(':') + 1).trim() : trip.name;
        
        return (
            <div 
                key={trip.id}
                onClick={() => handleEditRequest(trip)}
                className="group relative flex flex-col sm:flex-row bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden cursor-pointer hover:-translate-y-1"
            >
                {/* Color Strip */}
                <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${colorClass} opacity-80 group-hover:opacity-100`} />

                {/* Date Block */}
                <div className="flex sm:flex-col items-center justify-center p-4 sm:p-6 bg-gray-50/50 dark:bg-black/20 border-b sm:border-b-0 sm:border-r border-gray-100 dark:border-white/5 min-w-[100px] gap-2 sm:gap-0">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{dateInfo.month}</span>
                    <span className="text-3xl font-black text-gray-800 dark:text-white leading-none sm:my-1">{dateInfo.day}</span>
                    <span className="text-xs font-bold text-gray-400 uppercase">{dateInfo.weekday}</span>
                </div>

                {/* Content */}
                <div className="flex-1 p-5 flex flex-col justify-center">
                    <div className="flex justify-between items-start">
                        <div>
                            <h4 className="font-bold text-lg text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                {trip.icon} {displayName}
                            </h4>
                            <div className="flex items-center gap-2 mt-1.5">
                                <span className={`text-[10px] font-black uppercase tracking-wider bg-gray-100 dark:bg-white/10 px-2 py-0.5 rounded ${textClass}`}>
                                    {ent?.name || 'Event'}
                                </span>
                                {trip.allocations && trip.allocations.length > 1 && (
                                    <span className="text-[9px] font-bold text-gray-400 bg-gray-100 dark:bg-white/5 px-2 py-0.5 rounded">+ Split</span>
                                )}
                            </div>
                        </div>
                        <div className="text-right space-y-1">
                             <div className="text-xs font-bold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-white/5 px-3 py-1 rounded-lg" title="Calendar Duration">
                                 {duration} Days Total
                             </div>
                             {trip.entitlementId && (
                                <div className="text-[10px] font-black text-blue-600 dark:text-blue-400 px-1" title="Allowance Deduction">
                                    {deduction} Days Off
                                </div>
                             )}
                        </div>
                    </div>
                    
                    <div className="flex items-center justify-between mt-4">
                        <div className="flex -space-x-2">
                            {trip.participants.map((pid, idx) => {
                                const user = users.find(u => u.id === pid);
                                if (!user) return null;
                                return (
                                    <div 
                                        key={idx} 
                                        title={user.name}
                                        className={`w-7 h-7 rounded-lg border-2 border-white dark:border-gray-800 flex items-center justify-center text-[10px] font-black text-white shadow-sm ${user.role === 'Partner' ? 'bg-gradient-to-br from-blue-500 to-indigo-600' : 'bg-gradient-to-br from-emerald-500 to-teal-600'}`}
                                    >
                                        {user.name.charAt(0)}
                                    </div>
                                )
                            })}
                        </div>
                        <div className="text-[10px] font-bold text-gray-400 group-hover:text-blue-500 transition-colors uppercase tracking-widest flex items-center gap-1">
                            Edit <span className="material-icons-outlined text-xs">arrow_forward</span>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-8 animate-fade-in max-w-[1200px] mx-auto pb-12">
            
            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-end gap-6 bg-white/40 dark:bg-gray-900/40 p-6 rounded-[2rem] backdrop-blur-xl border border-white/50 dark:border-white/5 shadow-xl">
                <div className="space-y-2 w-full md:w-auto">
                    <h2 className="text-4xl font-black text-gray-900 dark:text-white tracking-tight">Expedition Log</h2>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Manage time off requests and view travel history.</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                     <div className="relative group w-full sm:w-64">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 material-icons-outlined">search</span>
                        <input 
                            type="text" 
                            placeholder="Search trips..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 rounded-2xl bg-white/80 dark:bg-black/20 border border-gray-200 dark:border-white/10 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-sm font-medium"
                        />
                     </div>
                     <Button variant="primary" size="lg" className="shadow-xl shadow-blue-500/20" icon={<span className="material-icons-outlined">add_location_alt</span>} onClick={handleOpenRequest}>
                         New Request
                     </Button>
                </div>
            </div>

            {/* Quick Stats & Filters */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* Stats Cards */}
                <div className="lg:col-span-4 grid grid-cols-2 gap-3">
                    <div className="bg-blue-500/5 border border-blue-500/10 p-4 rounded-2xl flex flex-col justify-center items-center text-center">
                        <span className="text-2xl font-black text-blue-600 dark:text-blue-400">{upcomingTrips.length}</span>
                        <span className="text-[9px] font-black text-blue-400/70 uppercase tracking-widest mt-1">Upcoming</span>
                    </div>
                    <div className="bg-purple-500/5 border border-purple-500/10 p-4 rounded-2xl flex flex-col justify-center items-center text-center">
                        <span className="text-2xl font-black text-purple-600 dark:text-purple-400">{pastTrips.length}</span>
                        <span className="text-[9px] font-black text-purple-400/70 uppercase tracking-widest mt-1">Archived</span>
                    </div>
                </div>

                {/* User Filter (Chips) */}
                <div className="lg:col-span-8 bg-white/60 dark:bg-gray-900/60 backdrop-blur-xl border border-white/50 dark:border-white/5 rounded-2xl p-2 flex items-center">
                    <div className="flex gap-2 overflow-x-auto p-2 custom-scrollbar w-full">
                        <button 
                            onClick={() => setFilterUser('all')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all whitespace-nowrap ${
                                filterUser === 'all' 
                                ? 'bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-gray-900' 
                                : 'bg-transparent text-gray-500 border-transparent hover:bg-gray-100 dark:hover:bg-white/10'
                            }`}
                        >
                            <span className="material-icons-outlined text-sm">groups</span>
                            <span className="text-xs font-bold uppercase tracking-wider">All Members</span>
                        </button>
                        <div className="w-px h-6 bg-gray-200 dark:bg-white/10 mx-1 shrink-0 self-center" />
                        {users.map(u => (
                            <button
                                key={u.id}
                                onClick={() => setFilterUser(u.id)}
                                className={`flex items-center gap-2 pr-4 pl-1.5 py-1.5 rounded-xl border transition-all whitespace-nowrap ${
                                    filterUser === u.id 
                                    ? 'bg-white shadow-md border-gray-200 dark:bg-gray-800 dark:border-white/10' 
                                    : 'bg-transparent border-transparent hover:bg-gray-100 dark:hover:bg-white/5 opacity-60 hover:opacity-100'
                                }`}
                            >
                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black text-white ${u.role === 'Partner' ? 'bg-gradient-to-br from-blue-500 to-indigo-600' : 'bg-gradient-to-br from-emerald-500 to-teal-600'}`}>
                                    {u.name.charAt(0)}
                                </div>
                                <span className={`text-xs font-bold ${filterUser === u.id ? 'text-gray-900 dark:text-white' : 'text-gray-500'}`}>{u.name}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* View Tabs */}
            <div className="flex border-b border-gray-200 dark:border-white/10">
                <button 
                    onClick={() => setViewMode('upcoming')}
                    className={`px-6 py-3 text-sm font-black uppercase tracking-widest border-b-2 transition-all ${viewMode === 'upcoming' ? 'border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                >
                    Upcoming
                </button>
                <button 
                    onClick={() => setViewMode('history')}
                    className={`px-6 py-3 text-sm font-black uppercase tracking-widest border-b-2 transition-all ${viewMode === 'history' ? 'border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                >
                    History
                </button>
            </div>

            {/* Content Area */}
            <div className="min-h-[400px]">
                {viewMode === 'upcoming' && (
                    <div className="space-y-8 animate-fade-in">
                        {upcomingTrips.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-center opacity-40">
                                <div className="w-24 h-24 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-6">
                                    <span className="material-icons-outlined text-4xl text-gray-400">flight_takeoff</span>
                                </div>
                                <h3 className="text-xl font-black text-gray-900 dark:text-white">No Upcoming Expeditions</h3>
                                <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mt-2">Time to plan your next adventure</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {upcomingTrips.map(trip => renderTripCard(trip))}
                            </div>
                        )}
                    </div>
                )}

                {viewMode === 'history' && (
                    <div className="space-y-12 animate-fade-in relative">
                        {/* Timeline Line */}
                        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-800 hidden md:block" />
                        
                        {years.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-center opacity-40">
                                <span className="material-icons-outlined text-4xl text-gray-400 mb-4">history_edu</span>
                                <h3 className="text-xl font-black text-gray-900 dark:text-white">Archive Empty</h3>
                            </div>
                        ) : (
                            years.map(year => {
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

                                        <div className={`grid grid-cols-1 lg:grid-cols-2 gap-6 transition-all duration-500 ease-in-out origin-top ${isCollapsed ? 'opacity-0 scale-y-0 h-0 overflow-hidden' : 'opacity-100 scale-y-100 h-auto'}`}>
                                            {pastTripsByYear[year].map(trip => renderTripCard(trip))}
                                        </div>
                                    </div>
                                )
                            })
                        )}
                    </div>
                )}
            </div>

            <LeaveRequestModal 
                isOpen={isRequestModalOpen}
                onClose={() => setIsRequestModalOpen(false)}
                onSubmit={handleSubmitRequest}
                onDelete={handleDeleteRequest}
                initialData={editingTrip}
                users={users}
                entitlements={entitlements}
                trips={trips}
                holidays={holidays}
                workspaceConfig={workspaceConfig}
            />
        </div>
    );
};
