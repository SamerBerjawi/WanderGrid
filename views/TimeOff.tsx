
import React, { useEffect, useState } from 'react';
import { Card, Button, Badge, Select } from '../components/ui';
import { LeaveRequestModal } from '../components/LeaveRequestModal';
import { dataService } from '../services/mockDb';
import { Trip, User, EntitlementType, WorkspaceSettings, PublicHoliday } from '../types';

export const TimeOff: React.FC = () => {
    const [trips, setTrips] = useState<Trip[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [entitlements, setEntitlements] = useState<EntitlementType[]>([]);
    const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
    const [workspaceConfig, setWorkspaceConfig] = useState<WorkspaceSettings | null>(null);
    const [filterUser, setFilterUser] = useState<string>('all');
    const [loading, setLoading] = useState(true);

    // Collapsible State (Store IDs of collapsed sections)
    const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

    const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
    const [editingTrip, setEditingTrip] = useState<Trip | undefined>(undefined);

    useEffect(() => {
        refreshData();
    }, []);

    const refreshData = () => {
        setLoading(true);
        Promise.all([
            dataService.getTrips(),
            dataService.getUsers(),
            dataService.getEntitlementTypes(),
            dataService.getSavedConfigs(),
            dataService.getWorkspaceSettings()
        ]).then(([t, u, ents, configs, config]) => {
            setTrips(t.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()));
            setUsers(u);
            setEntitlements(ents);
            const allHolidays = configs.flatMap(c => c.holidays.map(h => ({ ...h, configId: c.id })));
            setHolidays(allHolidays);
            setWorkspaceConfig(config);
            setLoading(false);
        });
    };

    const formatDate = (dateStr: string) => {
        if (!workspaceConfig) return dateStr;
        const [y, m, d] = dateStr.split('-');
        if (workspaceConfig.dateFormat === 'DD/MM/YYYY') return `${d}/${m}/${y}`;
        if (workspaceConfig.dateFormat === 'MM/DD/YYYY') return `${m}/${d}/${y}`;
        return dateStr;
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

    const toggleSection = (sectionId: string) => {
        const newSet = new Set(collapsedSections);
        if (newSet.has(sectionId)) {
            newSet.delete(sectionId);
        } else {
            newSet.add(sectionId);
        }
        setCollapsedSections(newSet);
    };

    const filteredTrips = filterUser === 'all' ? trips : trips.filter(t => t.participants.includes(filterUser));
    const upcomingTrips = filteredTrips.filter(t => new Date(t.endDate) >= new Date());
    const pastTrips = filteredTrips.filter(t => new Date(t.endDate) < new Date());

    // Group past trips by year
    const pastTripsByYear = pastTrips.reduce((groups, trip) => {
        const year = new Date(trip.startDate).getFullYear();
        if (!groups[year]) groups[year] = [];
        groups[year].push(trip);
        return groups;
    }, {} as Record<number, Trip[]>);

    const pastYears = Object.keys(pastTripsByYear).map(Number).sort((a, b) => b - a);

    const getEntitlementColor = (id?: string) => {
        if (!id) return 'text-slate-600 border-slate-200 dark:text-slate-400 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/20';

        const ent = entitlements.find(e => e.id === id);
        const map: any = { 
            blue: 'text-blue-600 border-blue-200 dark:text-blue-300 dark:border-blue-800', 
            green: 'text-emerald-600 border-emerald-200 dark:text-emerald-300 dark:border-emerald-800', 
            amber: 'text-amber-600 border-amber-200 dark:text-amber-300 dark:border-amber-800', 
            purple: 'text-purple-600 border-purple-200 dark:text-purple-300 dark:border-purple-800',
            red: 'text-rose-600 border-rose-200 dark:text-rose-300 dark:border-rose-800',
            indigo: 'text-indigo-600 border-indigo-200 dark:text-indigo-300 dark:border-indigo-800',
            gray: 'text-gray-600 border-gray-200 dark:text-gray-300 dark:border-gray-800',
            pink: 'text-pink-600 border-pink-200 dark:text-pink-300 dark:border-pink-800',
            teal: 'text-teal-600 border-teal-200 dark:text-teal-300 dark:border-teal-800',
            cyan: 'text-cyan-600 border-cyan-200 dark:text-cyan-300 dark:border-cyan-800'
        };
        return ent ? (map[ent.color] || 'text-gray-600 border-gray-200 dark:text-gray-400 dark:border-gray-700') : 'text-gray-600 border-gray-200 dark:text-gray-400 dark:border-gray-700';
    };

    const renderTripList = (list: Trip[], title: string, sectionId: string) => {
        const isCollapsed = collapsedSections.has(sectionId);

        return (
            <div className="mb-6 bg-white/60 dark:bg-gray-900/60 backdrop-blur-2xl border border-white/50 dark:border-white/5 shadow-xl rounded-[2rem] overflow-hidden transition-all duration-300">
                {/* Collapsible Header */}
                <div 
                    className="px-6 py-5 border-b border-gray-100/50 dark:border-white/5 flex justify-between items-center bg-white/40 dark:bg-white/5 cursor-pointer hover:bg-white/60 dark:hover:bg-white/10 transition-colors"
                    onClick={() => toggleSection(sectionId)}
                >
                    <div className="flex items-center gap-3">
                        <span className={`material-icons-outlined text-gray-400 transition-transform duration-300 ${isCollapsed ? '-rotate-90' : 'rotate-0'}`}>expand_more</span>
                        <div className="text-lg font-bold text-gray-800 dark:text-gray-100 tracking-tight">{title}</div>
                    </div>
                    {list.length > 0 && <Badge color="gray">{list.length} Trips</Badge>}
                </div>

                {/* List Body */}
                <div className={`transition-all duration-500 ease-in-out overflow-hidden ${isCollapsed ? 'max-h-0 opacity-0' : 'max-h-[2000px] opacity-100'}`}>
                    <div className="p-6 space-y-3">
                        {list.length === 0 && <div className="text-center py-8 text-gray-400 font-medium text-sm">No records found.</div>}
                        {list.map(trip => {
                            const isPast = new Date(trip.endDate) < new Date();
                            // Strip prefix "Category: " if present
                            const displayName = trip.name.includes(':') ? trip.name.substring(trip.name.indexOf(':') + 1).trim() : trip.name;

                            return (
                                <div key={trip.id} className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-2xl bg-white border border-gray-100 hover:shadow-md transition-all dark:bg-white/5 dark:border-white/5">
                                    <div className="flex items-start gap-4 flex-1">
                                        <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center text-2xl dark:bg-gray-800">{trip.icon || '✈️'}</div>
                                        <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h4 className="font-bold text-gray-800 dark:text-white mr-2">{displayName}</h4>
                                                
                                                {/* Split Allocation Display or Single Category */}
                                                {trip.allocations && trip.allocations.length > 0 ? (
                                                    trip.allocations.map((alloc, idx) => {
                                                        const entName = entitlements.find(e => e.id === alloc.entitlementId)?.name || 'Unknown';
                                                        return (
                                                            <Badge key={idx} className={getEntitlementColor(alloc.entitlementId)}>
                                                                {entName}: {Number(alloc.days).toFixed(1)}d
                                                            </Badge>
                                                        );
                                                    })
                                                ) : (
                                                    <Badge className={getEntitlementColor(trip.entitlementId)}>
                                                        {entitlements.find(e => e.id === trip.entitlementId)?.name || 'General Event'}
                                                    </Badge>
                                                )}
                                            </div>
                                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{formatDate(trip.startDate)} - {formatDate(trip.endDate)}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 mt-4 md:mt-0 pl-16 md:pl-0">
                                        <Badge color={isPast ? 'gray' : 'blue'}>{isPast ? 'Past' : 'Upcoming'}</Badge>
                                        <button onClick={() => handleEditRequest(trip)} className="p-2 text-gray-400 hover:text-blue-600 transition-colors"><span className="material-icons-outlined text-lg">edit</span></button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6 animate-fade-in max-w-5xl mx-auto pb-12">
            <div className="flex flex-col sm:flex-row justify-between items-end gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-gray-800 dark:text-white">Time Off History</h2>
                    <p className="text-gray-500 mt-1 dark:text-gray-400">View and manage all booked leaves.</p>
                </div>
                <div className="flex items-end gap-3 w-full sm:w-auto">
                    <Select label="Filter by Person" options={[{ label: 'All Members', value: 'all' }, ...users.map(u => ({ label: u.name, value: u.id }))]} value={filterUser} onChange={e => setFilterUser(e.target.value)} />
                    <Button variant="primary" icon={<span className="material-icons-outlined text-lg">add</span>} onClick={handleOpenRequest}>Book Leave</Button>
                </div>
            </div>

            {renderTripList(upcomingTrips, 'Upcoming Time Off', 'upcoming')}
            
            {pastYears.length > 0 ? (
                pastYears.map(year => (
                    <React.Fragment key={year}>
                        {renderTripList(pastTripsByYear[year], `${year} Archive`, `archive-${year}`)}
                    </React.Fragment>
                ))
            ) : (
                renderTripList([], 'Past History', 'history-empty')
            )}

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
