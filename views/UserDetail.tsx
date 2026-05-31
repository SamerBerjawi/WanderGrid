import React, { useEffect, useState, useMemo } from 'react';
import { Card, Button, Badge, Input, Select, Modal } from '../components/ui';
import { dataService } from '../services/mockDb';
import { User, Trip } from '../types';

interface UserDetailProps {
    userId: string;
    onBack: () => void;
    onLogout?: () => void;
}

export const UserDetail: React.FC<UserDetailProps> = ({ userId, onBack, onLogout }) => {
    const [user, setUser] = useState<User | null>(null);
    const [trips, setTrips] = useState<Trip[]>([]);
    const [loading, setLoading] = useState(true);

    // Profile Edit States
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState('');
    const [editPassword, setEditPassword] = useState('');
    const [editWeekendRule, setEditWeekendRule] = useState<'none' | 'monday' | 'lieu'>('none');
    const [editLeaveBalance, setEditLeaveBalance] = useState(25);
    const [editTakenLeave, setEditTakenLeave] = useState(0);
    const [saveLoading, setSaveLoading] = useState(false);

    const refreshProfile = () => {
        setLoading(true);
        dataService.getUsers()
            .then(allUsers => {
                const foundUser = allUsers.find(u => u.id === userId);
                if (foundUser) {
                    setUser(foundUser);
                    setEditName(foundUser.name || '');
                    setEditPassword(foundUser.password || '');
                    setEditWeekendRule(foundUser.holidayWeekendRule || 'none');
                    setEditLeaveBalance(foundUser.leaveBalance ?? 25);
                    setEditTakenLeave(foundUser.takenLeave ?? 0);
                }
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
    };

    useEffect(() => {
        refreshProfile();
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
        const locations = Array.from(new Set(nonCancelled.map(t => t.location.trim()).filter(Boolean)));

        return {
            total: nonCancelled.length,
            upcoming: upcoming.length,
            completed: completed.length,
            totalDays,
            uniqueDestinations: locations.length,
            destinationsList: locations
        };
    }, [trips]);

    const handleSaveProfile = async () => {
        if (!user || !editName.trim()) return;
        setSaveLoading(true);
        try {
            const updatedUser: User = {
                ...user,
                name: editName.trim(),
                password: editPassword.trim(),
                holidayWeekendRule: editWeekendRule,
                leaveBalance: editLeaveBalance,
                takenLeave: editTakenLeave
            };
            await dataService.updateUser(updatedUser);
            setUser(updatedUser);
            setIsEditing(false);
            // If editing own session, update cached user
            const sessionRaw = localStorage.getItem('wandergrid_session_user');
            if (sessionRaw) {
                const sessionUser = JSON.parse(sessionRaw);
                if (sessionUser.id === userId) {
                    localStorage.setItem('wandergrid_session_user', JSON.stringify(updatedUser));
                }
            }
        } catch (e) {
            console.error("Failed to update user profile details", e);
        } finally {
            setSaveLoading(false);
        }
    };

    if (loading || !user) {
        return (
            <div className="flex flex-col items-center justify-center p-24 text-gray-400 gap-4 animate-pulse w-full">
                <span className="material-icons-outlined text-5xl animate-spin text-blue-500">sync</span>
                <p className="font-bold text-xs uppercase tracking-widest text-zinc-550">Retrieving Traveler ID...</p>
            </div>
        );
    }

    // Dynamic ink colors for airport stamps
    const stampColors = [
        'border-blue-600/70 text-blue-600/85 bg-blue-50/5 dark:border-blue-550/50 dark:text-blue-400/80',
        'border-rose-600/70 text-rose-600/85 bg-rose-50/5 dark:border-rose-550/50 dark:text-rose-400/80',
        'border-emerald-600/70 text-emerald-600/85 bg-emerald-50/5 dark:border-emerald-550/50 dark:text-emerald-400/80',
        'border-indigo-600/70 text-indigo-600/85 bg-indigo-50/5 dark:border-indigo-550/50 dark:text-indigo-400/80',
        'border-amber-600/70 text-amber-600/85 bg-amber-50/5 dark:border-amber-550/50 dark:text-amber-400/80',
    ];

    const leavePercentage = Math.round(((user.takenLeave || 0) / (user.leaveBalance || 25)) * 100);

    return (
        <div className="space-y-8 animate-fade-in max-w-[85rem] mx-auto pb-16 px-4 md:px-0 w-full">
            {/* HERO PROFILE HEADER */}
            <div className="relative w-full rounded-[2.2rem] bg-white dark:bg-gray-900 border border-gray-150/45 dark:border-white/5 overflow-hidden shadow-2xl">
                <div className="absolute top-0 right-0 w-[450px] h-[450px] bg-gradient-to-br from-blue-500/10 to-indigo-500/10 rounded-full blur-[90px] -translate-y-1/2 translate-x-1/3 pointer-events-none" />
                
                <div className="relative p-8 lg:p-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
                    <div className="flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
                        <div className="relative">
                            <div className={`w-28 h-28 rounded-[2rem] flex items-center justify-center text-5xl font-black text-white shadow-xl transition-all hover:scale-105 duration-300 border border-white/20
                                ${user.role === 'Partner' ? 'bg-gradient-to-br from-blue-600 to-indigo-700 shadow-indigo-500/20' : 
                                  user.role === 'Admin' ? 'bg-gradient-to-br from-purple-500 to-indigo-650 shadow-purple-500/20' : 
                                  'bg-gradient-to-br from-emerald-500 to-teal-600 shadow-teal-500/20'}`}>
                                {user.name?.charAt(0) || '?'}
                            </div>
                            <div className="absolute -bottom-2 -right-2 bg-white dark:bg-gray-800 px-3 py-1 rounded-xl shadow-md border border-gray-100 dark:border-white/10">
                                <span className={`text-[10px] font-black uppercase tracking-wider ${
                                    user.role === 'Partner' ? 'text-blue-500' : 
                                    user.role === 'Admin' ? 'text-purple-500' : 
                                    'text-emerald-500'}`}>{user.role}</span>
                            </div>
                        </div>
                        
                        <div className="space-y-2">
                            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
                                <h1 className="text-3xl lg:text-5xl font-black text-gray-950 dark:text-white tracking-tight leading-none">{user.name}</h1>
                                <button 
                                    onClick={() => {
                                        setEditName(user.name || '');
                                        setEditPassword(user.password || '');
                                        setEditWeekendRule(user.holidayWeekendRule || 'none');
                                        setEditLeaveBalance(user.leaveBalance ?? 25);
                                        setEditTakenLeave(user.takenLeave ?? 0);
                                        setIsEditing(true);
                                    }}
                                    className="p-2 text-zinc-400 hover:text-blue-500 hover:bg-slate-100 dark:hover:bg-zinc-805 rounded-xl transition-colors cursor-pointer"
                                    title="Edit Profile Details"
                                >
                                    <span className="material-icons-outlined text-xl block">edit_note</span>
                                </button>
                            </div>
                            {user.email && (
                                <p className="text-sm text-gray-500 dark:text-gray-400 font-semibold font-mono tracking-tight">{user.email}</p>
                            )}
                            <div className="flex items-center justify-center sm:justify-start gap-2 mt-2 select-none">
                                <span className="text-[10px] font-mono tracking-widest font-bold text-gray-400 dark:text-zinc-500 uppercase block">CREDENTIAL-KEY: <span className="text-teal-500 font-black">{user.id}</span></span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 self-stretch sm:self-auto shrink-0 flex-wrap justify-center">
                        <Button variant="secondary" className="!rounded-xl border-zinc-200" onClick={onBack} icon={<span className="material-icons-outlined text-sm">arrow_back</span>}>
                            Core Dashboard
                        </Button>
                        {onLogout && (
                            <Button 
                                variant="danger" 
                                className="!rounded-xl border-none" 
                                onClick={onLogout} 
                                icon={<span className="material-icons-outlined text-sm">logout</span>}
                            >
                                Secure Exit
                            </Button>
                        )}
                    </div>
                </div>

                {/* PASSPORT STATISTICS STATS GRID */}
                <div className="grid grid-cols-2 md:grid-cols-5 border-t border-gray-150/45 dark:border-white/5 divide-x divide-y md:divide-y-0 divide-gray-100 dark:divide-white/5 bg-gray-50/40 dark:bg-zinc-950/20">
                    <div className="p-6 flex flex-col items-center justify-center text-center gap-1">
                        <span className="material-icons-outlined text-blue-500 text-2xl">flight_takeoff</span>
                        <span className="text-3xl font-black text-gray-900 dark:text-white mt-1">{stats.total}</span>
                        <span className="text-[9px] font-bold text-gray-450 dark:text-zinc-450 uppercase tracking-widest font-mono">Active Trips</span>
                    </div>

                    <div className="p-6 flex flex-col items-center justify-center text-center gap-1 border-t md:border-t-0">
                        <span className="material-icons-outlined text-amber-500 text-2xl">upcoming</span>
                        <span className="text-3xl font-black text-gray-900 dark:text-white mt-1">{stats.upcoming}</span>
                        <span className="text-[9px] font-bold text-gray-450 dark:text-zinc-450 uppercase tracking-widest font-mono">Upcoming Journeys</span>
                    </div>

                    <div className="p-6 flex flex-col items-center justify-center text-center gap-1 border-t md:border-t-0">
                        <span className="material-icons-outlined text-emerald-500 text-2xl">done_all</span>
                        <span className="text-3xl font-black text-gray-900 dark:text-white mt-1">{stats.completed}</span>
                        <span className="text-[9px] font-bold text-gray-450 dark:text-zinc-450 uppercase tracking-widest font-mono">Completed Voyages</span>
                    </div>

                    <div className="p-6 flex flex-col items-center justify-center text-center gap-1 border-t md:border-t-0">
                        <span className="material-icons-outlined text-purple-500 text-2xl">room</span>
                        <span className="text-3xl font-black text-gray-900 dark:text-white mt-1">{stats.uniqueDestinations}</span>
                        <span className="text-[9px] font-bold text-gray-450 dark:text-zinc-450 uppercase tracking-widest font-mono">Destinations Visited</span>
                    </div>

                    <div className="p-6 flex flex-col items-center justify-center text-center gap-1 col-span-2 md:col-span-1 border-t md:border-t-0">
                        <span className="material-icons-outlined text-indigo-500 text-2xl">date_range</span>
                        <span className="text-3xl font-black text-gray-900 dark:text-white mt-1">{stats.totalDays}</span>
                        <span className="text-[9px] font-bold text-gray-450 dark:text-zinc-450 uppercase tracking-widest font-mono">Total Days on Voyage</span>
                    </div>
                </div>
            </div>

            {/* LOWER PORTION: TWO COLUMN DETAILS */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start w-full">
                {/* Left side: Vacation leave progress & Passport stamps */}
                <div className="lg:col-span-4 space-y-8 h-full w-full">
                    {/* ACCRUED LEAVE STATS CARD */}
                    <Card noPadding className="rounded-[2.2rem] overflow-hidden">
                        <div className="p-6 border-b border-gray-150/40 dark:border-white/5 bg-gradient-to-r from-teal-500/5 to-emerald-500/5 flex justify-between items-center bg-gray-50/50 dark:bg-white/5">
                            <div>
                                <h3 className="font-extrabold text-gray-900 dark:text-white text-base">Leave & Entitlements</h3>
                                <p className="text-[9.5px] font-mono text-gray-400 uppercase tracking-widest font-black">Vacation Days Allocations</p>
                            </div>
                            <Badge color={leavePercentage > 80 ? 'rose' : leavePercentage > 40 ? 'amber' : 'green'}>
                                {leavePercentage}% Consumed
                            </Badge>
                        </div>
                        <div className="p-6 space-y-6">
                            {/* Linear percentage gauges */}
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center text-xs font-bold">
                                        <span className="text-gray-500 dark:text-gray-400">Accrued Annual Leave</span>
                                        <span className="text-gray-800 dark:text-zinc-200">{user.leaveBalance ?? 25} Days</span>
                                    </div>
                                    <div className="w-full h-2.5 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                                        <div className="h-full bg-indigo-550 rounded-full" style={{ width: '100%' }} />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex justify-between items-center text-xs font-bold">
                                        <span className="text-gray-500 dark:text-gray-400">Consumed Days Taken</span>
                                        <span className="text-gray-800 dark:text-zinc-200">{user.takenLeave ?? 0} of {user.leaveBalance ?? 25} Days</span>
                                    </div>
                                    <div className="w-full h-2.5 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full transition-all ${leavePercentage > 85 ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(leavePercentage, 100)}%` }} />
                                    </div>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-gray-100 dark:border-white/5 grid grid-cols-2 gap-4 text-left p-3.5 bg-slate-50/50 dark:bg-black/10 rounded-xl leading-none">
                                <div>
                                    <span className="text-[9.5px] font-bold text-zinc-400 block uppercase tracking-wide">Remaining Balance</span>
                                    <span className="text-lg font-black text-slate-800 dark:text-zinc-200 block mt-1">{(user.leaveBalance ?? 25) - (user.takenLeave ?? 0)} Days</span>
                                </div>
                                <div>
                                    <span className="text-[9.5px] font-bold text-zinc-400 block uppercase tracking-wide">Weekend Rule</span>
                                    <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 block mt-2.5 uppercase font-mono truncate">{user.holidayWeekendRule || 'None'}</span>
                                </div>
                            </div>
                        </div>
                    </Card>

                    {/* MOOD BOOSTER PASSPORT STAMPS */}
                    <Card noPadding className="rounded-[2.2rem]">
                        <div className="p-6 border-b border-gray-150/45 dark:border-white/5 bg-gradient-to-r from-indigo-550/5 to-purple-550/5 bg-gray-50/50 dark:bg-white/5">
                            <h3 className="font-extrabold text-gray-900 dark:text-white text-base">Travel Stamps</h3>
                            <p className="text-[9.5px] font-mono text-gray-400 uppercase tracking-widest font-black">Aero Passport Stamp Seal Roster</p>
                        </div>
                        <div className="p-6">
                            {stats.uniqueDestinations === 0 ? (
                                <div className="py-12 text-center text-zinc-400 border border-dashed border-gray-200 dark:border-zinc-800 rounded-2xl select-none">
                                    <span className="material-icons-outlined text-4xl block text-zinc-400">confirmation_number</span>
                                    <p className="text-[10px] font-mono tracking-widest font-bold uppercase mt-3">No active country seals stamped</p>
                                    <p className="text-[10px] opacity-75 mt-1">Stamps are visual seals dynamically minted from flight logs.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-4">
                                    {stats.destinationsList.slice(0, 6).map((dest, i) => {
                                        const colorIdx = i % stampColors.length;
                                        return (
                                            <div 
                                                key={dest} 
                                                className={`p-4 border-2 rounded-[2rem] border-dashed flex flex-col items-center justify-center text-center relative overflow-hidden select-none h-28 transform hover:scale-103 transition-transform ${stampColors[colorIdx]}`}
                                            >
                                                {/* Retro flight details circles */}
                                                <div className="absolute -top-3 -left-3 w-8 h-8 rounded-full border border-current opacity-20" />
                                                <div className="absolute -bottom-3 -right-3 w-10 h-10 rounded-full border border-current opacity-20" />
                                                
                                                <span className="text-[8px] font-mono font-black uppercase tracking-widest opacity-80 leading-none">BORDER ENTRANCE</span>
                                                <span className="text-sm font-black uppercase tracking-tight truncate max-w-full my-1">{dest}</span>
                                                <span className="text-[8px] font-mono font-bold tracking-wider leading-none opacity-90">{2026 - i}.0{(i % 8) + 1}.{(i % 24) + 1}</span>
                                                <div className="mt-1.5 px-2 py-0.5 rounded border border-current text-[7px] font-mono font-black scale-90 uppercase tracking-wider">APPROVED</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </Card>
                </div>

                {/* Right side: Expeditions, Trips & Flights list */}
                <div className="lg:col-span-8 space-y-6 w-full">
                    <div className="flex justify-between items-center px-1">
                        <div className="space-y-1">
                            <h2 className="text-2xl font-black text-gray-950 dark:text-white tracking-tight">Expeditions Passport</h2>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Chronological travel roster and calendar entries</p>
                        </div>
                    </div>

                    {trips.length === 0 ? (
                        <Card className="rounded-[2.2rem] p-16 text-center border-dashed border-zinc-250 select-none bg-white dark:bg-gray-900">
                            <span className="material-icons-outlined text-gray-300 dark:text-gray-700 text-6xl">explore_off</span>
                            <p className="text-sm font-bold text-gray-400 uppercase tracking-wider mt-4">No active expeditions found for this traveler</p>
                            <p className="text-xs text-gray-500 max-w-xs mx-auto mt-2">When this user joins or gets assigned to a trip, their complete flight route details will appear beautifully styled here.</p>
                        </Card>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                            {trips.map(trip => {
                                const ongoing = new Date(trip.startDate) <= new Date() && new Date() <= new Date(trip.endDate);
                                return (
                                    <Card key={trip.id} noPadding className="rounded-[2rem] border-zinc-200 dark:border-white/5 hover:shadow-xl transition-all group overflow-hidden flex flex-col h-full bg-white dark:bg-gray-900">
                                        <div className="p-6 border-b border-gray-100 dark:border-white/5 flex items-center justify-between bg-gray-50/50 dark:bg-white/5">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/10 rounded-xl flex items-center justify-center text-blue-500 text-2xl group-hover:rotate-12 transition-transform">
                                                    <span className="material-icons-outlined">{trip.icon || 'map'}</span>
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-gray-900 dark:text-white text-base leading-snug truncate max-w-[13rem]" title={trip.name}>
                                                        {trip.name}
                                                    </h3>
                                                    <div className="flex items-center gap-1 text-xs text-gray-450 dark:text-gray-500 mt-0.5">
                                                        <span className="material-icons-outlined text-xs">place</span>
                                                        <span className="truncate max-w-[11rem]">{trip.location}</span>
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
                                            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-300 font-semibold bg-gray-50 dark:bg-white/5 p-3 rounded-xl font-mono leading-none">
                                                <div className="flex flex-col">
                                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Departure</span>
                                                    <span>{new Date(trip.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                                </div>
                                                <span className="material-icons-outlined text-gray-300 dark:text-gray-750 text-lg">trending_flat</span>
                                                <div className="flex flex-col text-right">
                                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Return Date</span>
                                                    <span>{new Date(trip.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-3 text-xs">
                                                <div className="p-3 rounded-xl bg-violet-50/50 dark:bg-violet-900/5 border border-violet-100/50 dark:border-violet-900/20 flex flex-col justify-center">
                                                    <span className="text-[9px] font-black text-violet-500 dark:text-violet-400 uppercase tracking-widest leading-none mb-1.5 font-mono block">Flight Legs</span>
                                                    <span className="font-extrabold text-gray-800 dark:text-gray-200 text-base">
                                                        {(trip.transports?.filter(t => t.mode === 'Flight').length) || 0}
                                                    </span>
                                                </div>

                                                <div className="p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-900/5 border border-emerald-100/50 dark:border-emerald-900/20 flex flex-col justify-center">
                                                    <span className="text-[9px] font-black text-emerald-500 dark:text-emerald-400 uppercase tracking-widest leading-none mb-1.5 font-mono block">Overnights</span>
                                                    <span className="font-extrabold text-gray-800 dark:text-gray-200 text-base">
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

            {/* MODAL: SELF PROFILE DETAILS MODAL */}
            <Modal isOpen={isEditing} onClose={() => setIsEditing(false)} title="Edit Inhabitant Details">
                <div className="space-y-6 text-left">
                    <div className="space-y-4">
                        <Input 
                            label="Traveler Display Name" 
                            placeholder="e.g. Elena Rostova" 
                            value={editName} 
                            onChange={e => setEditName(e.target.value)} 
                        />
                        <Input 
                            label="Change Portal Password" 
                            type="password"
                            placeholder="Type a secure password" 
                            value={editPassword} 
                            onChange={e => setEditPassword(e.target.value)} 
                        />
                        
                        <div className="grid grid-cols-1 gap-4">
                            <Select 
                                label="Holiday Weekend Rule" 
                                value={editWeekendRule} 
                                onInput={(e: any) => setEditWeekendRule(e.target.value)}
                                options={[
                                    { label: 'Standard No Override', value: 'none' },
                                    { label: 'Cycle Monday Policy', value: 'monday' },
                                    { label: 'Compensate Lieu Rule', value: 'lieu' }
                                ]}
                            />
                        </div>

                        {/* Admin-only properties editable in User profile as well */}
                        {user.role === 'Admin' && (
                            <div className="grid grid-cols-2 gap-4">
                                <Input 
                                    label="Accrued Vacation Allowance" 
                                    type="number"
                                    value={editLeaveBalance} 
                                    onChange={e => setEditLeaveBalance(parseInt(e.target.value) || 0)} 
                                />
                                <Input 
                                    label="Spent Days Consumed" 
                                    type="number"
                                    value={editTakenLeave} 
                                    onChange={e => setEditTakenLeave(parseInt(e.target.value) || 0)} 
                                />
                            </div>
                        )}
                    </div>

                    <div className="flex gap-4 pt-4 border-t border-gray-150/50 dark:border-white/10 shrink-0">
                        <Button variant="ghost" className="flex-1 !rounded-xl cursor-pointer" onClick={() => setIsEditing(false)}>Cancel</Button>
                        <Button 
                            variant="primary" 
                            className="flex-1 border-none !rounded-xl text-white font-bold cursor-pointer bg-blue-650 shadow-md shadow-blue-500/10" 
                            disabled={!editName.trim()}
                            onClick={handleSaveProfile}
                            isLoading={saveLoading}
                        >
                            Commit Changes
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
