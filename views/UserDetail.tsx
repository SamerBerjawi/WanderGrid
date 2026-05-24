import React, { useEffect, useState, useMemo } from 'react';
import { Card, Button, Badge } from '../components/ui';
import { dataService } from '../services/mockDb';
import { User, Trip } from '../types';

interface UserDetailProps {
    userId: string;
    onBack: () => void;
}

export const UserDetail: React.FC<UserDetailProps> = ({ userId, onBack }) => {
    const [user, setUser] = useState<User | null>(null);
    const [trips, setTrips] = useState<Trip[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        dataService.getUsers()
            .then(allUsers => {
                const foundUser = allUsers.find(u => u.id === userId);
                setUser(foundUser || null);
                
                return dataService.getTrips();
            })
            .then(allTrips => {
                setTrips(allTrips.filter(t => t.participants.includes(userId)));
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to load user detail metrics", err);
                setLoading(false);
            });
    }, [userId]);

    const stats = useMemo(() => {
        const nonCancelled = trips.filter(t => t.status !== 'Cancelled');
        const upcoming = nonCancelled.filter(t => t.status === 'Upcoming' || t.status === 'Planning');
        const completed = nonCancelled.filter(t => t.status === 'Past');
        
        // Calculate total days on road
        let totalDays = 0;
        nonCancelled.forEach(t => {
            const start = new Date(t.startDate);
            const end = new Date(t.endDate);
            const diffTime = Math.abs(end.getTime() - start.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
            totalDays += diffDays;
        });

        // Unique countries/locations in set
        const locations = new Set(nonCancelled.map(t => t.location.trim()).filter(Boolean));

        return {
            total: nonCancelled.length,
            upcoming: upcoming.length,
            completed: completed.length,
            totalDays,
            uniqueDestinations: locations.size
        };
    }, [trips]);

    if (loading || !user) {
        return (
            <div className="flex flex-col items-center justify-center p-24 text-gray-400 gap-4 animate-pulse">
                <span className="material-icons-outlined text-5xl animate-spin text-blue-500">sync</span>
                <p className="font-bold text-xs uppercase tracking-widest">Retrieving Traveler ID...</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fade-in max-w-[80rem] mx-auto pb-12">
            {/* HERO PROFILE HEADER */}
            <div className="relative w-full rounded-[2rem] bg-white dark:bg-gray-900 border border-gray-100 dark:border-white/5 overflow-hidden shadow-2xl">
                <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/3 pointer-events-none" />
                
                <div className="relative p-8 lg:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    <div className="flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
                        <div className="relative">
                            <div className={`w-24 h-24 rounded-[1.75rem] flex items-center justify-center text-4xl font-black text-white shadow-xl transition-all hover:scale-105 duration-300
                                ${user.role === 'Partner' ? 'bg-gradient-to-br from-blue-600 to-indigo-700 shadow-indigo-500/25' : 'bg-gradient-to-br from-emerald-500 to-teal-600 shadow-teal-500/25'}`}>
                                {user.name?.charAt(0) || '?'}
                            </div>
                            <div className="absolute -bottom-2 -right-2 bg-white dark:bg-gray-800 px-3 py-1 rounded-lg shadow-md border border-gray-100 dark:border-white/10">
                                <span className={`text-[9px] font-black uppercase tracking-widest ${user.role === 'Partner' ? 'text-blue-500' : 'text-emerald-500'}`}>{user.role}</span>
                            </div>
                        </div>
                        
                        <div className="space-y-1.5">
                            <h1 className="text-3xl lg:text-4xl font-black text-gray-900 dark:text-white tracking-tight leading-none">{user.name}</h1>
                            {user.email && (
                                <p className="text-sm text-gray-400 dark:text-gray-500 font-semibold">{user.email}</p>
                            )}
                            <div className="flex items-center justify-center sm:justify-start gap-2 mt-2">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">WanderGrid Inhabitant Since 2026</span>
                            </div>
                        </div>
                    </div>

                    <Button variant="secondary" className="!rounded-xl border-2 self-center md:self-auto shrink-0" onClick={onBack} icon={<span className="material-icons-outlined">arrow_back</span>}>
                        Back to Core
                    </Button>
                </div>

                {/* PASSPORT STATISTICS STATS GRID */}
                <div className="grid grid-cols-2 md:grid-cols-5 border-t border-gray-100 dark:border-white/5 divide-x divide-y md:divide-y-0 divide-gray-100 dark:divide-white/5 bg-gray-50/50 dark:bg-white/5">
                    <div className="p-6 flex flex-col items-center justify-center text-center gap-1">
                        <span className="material-icons-outlined text-blue-500 text-2xl">flight_takeoff</span>
                        <span className="text-2xl font-black text-gray-900 dark:text-white mt-1">{stats.total}</span>
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Active Trips</span>
                    </div>

                    <div className="p-6 flex flex-col items-center justify-center text-center gap-1">
                        <span className="material-icons-outlined text-amber-500 text-2xl">upcoming</span>
                        <span className="text-2xl font-black text-gray-900 dark:text-white mt-1">{stats.upcoming}</span>
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Upcoming Journeys</span>
                    </div>

                    <div className="p-6 flex flex-col items-center justify-center text-center gap-1">
                        <span className="material-icons-outlined text-emerald-500 text-2xl">done_all</span>
                        <span className="text-2xl font-black text-gray-900 dark:text-white mt-1">{stats.completed}</span>
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Completed Voyages</span>
                    </div>

                    <div className="p-6 flex flex-col items-center justify-center text-center gap-1">
                        <span className="material-icons-outlined text-purple-500 text-2xl">room</span>
                        <span className="text-2xl font-black text-gray-900 dark:text-white mt-1">{stats.uniqueDestinations}</span>
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Destinations Visited</span>
                    </div>

                    <div className="p-6 flex flex-col items-center justify-center text-center gap-1 col-span-2 md:col-span-1 border-t md:border-t-0">
                        <span className="material-icons-outlined text-indigo-500 text-2xl">date_range</span>
                        <span className="text-2xl font-black text-gray-900 dark:text-white mt-1">{stats.totalDays}</span>
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Total Days on Voyage</span>
                    </div>
                </div>
            </div>

            {/* EXPEDITIONS FEED */}
            <div className="space-y-6">
                <div className="flex justify-between items-center px-2">
                    <div className="space-y-1">
                        <h2 className="text-2xl font-black text-gray-950 dark:text-white tracking-tight">Expeditions Passport</h2>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Chronological travel roster and calendar entries</p>
                    </div>
                </div>

                {trips.length === 0 ? (
                    <Card className="rounded-[2rem] p-12 text-center border-dashed">
                        <span className="material-icons-outlined text-gray-300 dark:text-gray-700 text-5xl">explore_off</span>
                        <p className="text-sm font-bold text-gray-400 uppercase tracking-wider mt-4">No active expeditions found for this traveler</p>
                    </Card>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {trips.map(trip => {
                            const ongoing = new Date(trip.startDate) <= new Date() && new Date() <= new Date(trip.endDate);
                            return (
                                <Card key={trip.id} noPadding className="rounded-[2rem] border-white/50 dark:border-white/5 hover:shadow-xl transition-all group overflow-hidden flex flex-col h-full bg-white dark:bg-gray-900">
                                    <div className="p-6 border-b border-gray-100 dark:border-white/5 flex items-center justify-between bg-gray-50/50 dark:bg-white/5">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/10 rounded-xl flex items-center justify-center text-blue-500 text-2xl group-hover:rotate-12 transition-transform">
                                                <span className="material-icons-outlined">{trip.icon || 'map'}</span>
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-gray-900 dark:text-white text-base leading-snug truncate max-w-[15rem]" title={trip.name}>
                                                    {trip.name}
                                                </h3>
                                                <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                                    <span className="material-icons-outlined text-xs">place</span>
                                                    <span className="truncate max-w-[12rem]">{trip.location}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div>
                                            {ongoing ? (
                                                <Badge color="amber" className="animate-pulse">Active Now</Badge>
                                            ) : (
                                                <Badge color={
                                                    trip.status === 'Planning' ? 'amber' :
                                                    trip.status === 'Upcoming' ? 'blue' :
                                                    trip.status === 'Past' ? 'emerald' : 'gray'
                                                }>
                                                    {trip.status}
                                                </Badge>
                                            )}
                                        </div>
                                    </div>

                                    <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                                        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 font-semibold bg-gray-50 dark:bg-white/5 p-3 rounded-xl">
                                            <div className="flex flex-col">
                                                <span className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">Departure</span>
                                                <span>{new Date(trip.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                            </div>
                                            <span className="material-icons-outlined text-gray-300 dark:text-gray-700">trending_flat</span>
                                            <div className="flex flex-col text-right">
                                                <span className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">Return Date</span>
                                                <span>{new Date(trip.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3 text-xs">
                                            <div className="p-3 rounded-xl bg-violet-50/50 dark:bg-violet-900/5 border border-violet-100/50 dark:border-violet-900/20 flex flex-col justify-center">
                                                <span className="text-[9px] font-black text-violet-500 dark:text-violet-400 uppercase tracking-widest leading-none mb-1">Flight Legs</span>
                                                <span className="font-bold text-gray-800 dark:text-gray-200 text-sm">
                                                    {(trip.transports?.filter(t => t.mode === 'Flight').length) || 0}
                                                </span>
                                            </div>

                                            <div className="p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-900/5 border border-emerald-100/50 dark:border-emerald-900/20 flex flex-col justify-center">
                                                <span className="text-[9px] font-black text-emerald-500 dark:text-emerald-400 uppercase tracking-widest leading-none mb-1">Overnights</span>
                                                <span className="font-bold text-gray-800 dark:text-gray-200 text-sm">
                                                    {trip.accommodations?.length || 0}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};
