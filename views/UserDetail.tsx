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

    // Profile picture and passport states
    const [editProfilePicture, setEditProfilePicture] = useState('');
    const [editNationality, setEditNationality] = useState('');
    const [editDateOfBirth, setEditDateOfBirth] = useState('');
    const [editPassportNumber, setEditPassportNumber] = useState('');
    const [editPassportIssuingEntity, setEditPassportIssuingEntity] = useState('');
    const [editPassportIssueDate, setEditPassportIssueDate] = useState('');
    const [editPassportExpiryDate, setEditPassportExpiryDate] = useState('');
    const [isDragging, setIsDragging] = useState(false);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const processFile = (file: File) => {
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (event) => {
                if (event.target?.result) {
                    setEditProfilePicture(event.target.result as string);
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        processFile(file);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            processFile(file);
        }
    };

    // Trip Edit and Delete States
    const [isEditingTrip, setIsEditingTrip] = useState(false);
    const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
    const [editTripName, setEditTripName] = useState('');
    const [editTripLocation, setEditTripLocation] = useState('');
    const [editTripStartDate, setEditTripStartDate] = useState('');
    const [editTripEndDate, setEditTripEndDate] = useState('');
    const [editTripStatus, setEditTripStatus] = useState<'Planning' | 'Upcoming' | 'Past' | 'Cancelled'>('Planning');

    const [isDeletingTripConfirm, setIsDeletingTripConfirm] = useState(false);
    const [deletingTripId, setDeletingTripId] = useState<string | null>(null);

    const handleStartEditTrip = (trip: Trip) => {
        setEditingTrip(trip);
        setEditTripName(trip.name || '');
        setEditTripLocation(trip.location || '');
        setEditTripStartDate(trip.startDate || '');
        setEditTripEndDate(trip.endDate || '');
        setEditTripStatus(trip.status || 'Planning');
        setIsEditingTrip(true);
    };

    const handleSaveTrip = async () => {
        if (!editingTrip || !editTripName.trim() || !editTripLocation.trim()) return;
        setSaveLoading(true);
        try {
            const updatedTrip: Trip = {
                ...editingTrip,
                name: editTripName.trim(),
                location: editTripLocation.trim(),
                startDate: editTripStartDate,
                endDate: editTripEndDate,
                status: editTripStatus
            };
            await dataService.updateTrip(updatedTrip);
            setIsEditingTrip(false);
            setEditingTrip(null);
            refreshProfile();
            try { window.dispatchEvent(new CustomEvent('wandergrid_db_updated')); } catch (e) {}
        } catch (err) {
            console.error("Failed to save trip", err);
        } finally {
            setSaveLoading(false);
        }
    };

    const handleDeleteTripClick = (tripId: string) => {
        setDeletingTripId(tripId);
        setIsDeletingTripConfirm(true);
    };

    const handleConfirmDeleteTrip = async () => {
        if (!deletingTripId) return;
        setSaveLoading(true);
        try {
            await dataService.deleteTrip(deletingTripId);
            setIsDeletingTripConfirm(false);
            setDeletingTripId(null);
            refreshProfile();
            try { window.dispatchEvent(new CustomEvent('wandergrid_db_updated')); } catch (e) {}
        } catch (err) {
            console.error("Failed to delete trip", err);
        } finally {
            setSaveLoading(false);
        }
    };

    const handleCreateTripFromBundle = async (trip: Trip) => {
        setSaveLoading(true);
        try {
            const updatedTrip: Trip = {
                ...trip,
                isBundleOnly: false,
                hideInPlanner: false,
            };
            await dataService.updateTrip(updatedTrip);
            refreshProfile();
            try { window.dispatchEvent(new CustomEvent('wandergrid_db_updated')); } catch (e) {}
        } catch (err) {
            console.error("Failed to promote bundle to trip", err);
        } finally {
            setSaveLoading(false);
        }
    };

    const getTripPlannerStatus = (trip: Trip) => {
        if (trip.status === 'Planning') {
            return { text: 'Planning', color: 'amber' as const };
        }
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tripEnd = new Date(trip.endDate);
        if (tripEnd >= today) {
            return { text: 'Upcoming', color: 'emerald' as const };
        } else {
            return { text: 'Past', color: 'purple' as const };
        }
    };

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
                    setEditProfilePicture(foundUser.profilePicture || '');
                    setEditNationality(foundUser.nationality || '');
                    setEditDateOfBirth(foundUser.dateOfBirth || '');
                    setEditPassportNumber(foundUser.passportNumber || '');
                    setEditPassportIssuingEntity(foundUser.passportIssuingEntity || '');
                    setEditPassportIssueDate(foundUser.passportIssueDate || '');
                    setEditPassportExpiryDate(foundUser.passportExpiryDate || '');
                }
                return dataService.getTrips();
            })
            .then(allTrips => {
                setTrips((allTrips || []).filter(t => (t.participants || []).includes(userId)));
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
                takenLeave: editTakenLeave,
                profilePicture: editProfilePicture,
                nationality: editNationality,
                dateOfBirth: editDateOfBirth,
                passportNumber: editPassportNumber,
                passportIssuingEntity: editPassportIssuingEntity,
                passportIssueDate: editPassportIssueDate,
                passportExpiryDate: editPassportExpiryDate
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
                            <div className={`w-28 h-28 rounded-[2rem] flex items-center justify-center overflow-hidden text-5xl font-black text-white shadow-xl transition-all hover:scale-105 duration-300 border border-white/20
                                ${user.role === 'Partner' ? 'bg-gradient-to-br from-blue-600 to-indigo-700 shadow-indigo-500/20' : 
                                  user.role === 'Admin' ? 'bg-gradient-to-br from-purple-500 to-indigo-650 shadow-purple-500/20' : 
                                  'bg-gradient-to-br from-emerald-500 to-teal-600 shadow-teal-500/20'}`}>
                                {user.profilePicture ? (
                                    <img src={user.profilePicture} alt={user.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                ) : (
                                    user.name?.charAt(0) || '?'
                                )}
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
                                        setEditProfilePicture(user.profilePicture || '');
                                        setEditNationality(user.nationality || '');
                                        setEditDateOfBirth(user.dateOfBirth || '');
                                        setEditPassportNumber(user.passportNumber || '');
                                        setEditPassportIssuingEntity(user.passportIssuingEntity || '');
                                        setEditPassportIssueDate(user.passportIssueDate || '');
                                        setEditPassportExpiryDate(user.passportExpiryDate || '');
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
                        <Card noPadding className="rounded-[2rem] border-zinc-200 dark:border-white/5 bg-white dark:bg-gray-900 overflow-hidden shadow-xs">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-gray-100 dark:border-white/4 bg-gray-50/40 dark:bg-white/5 text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500">
                                            <th className="py-4 px-6">Expedition</th>
                                            <th className="py-4 px-6">Schedule</th>
                                            <th className="py-4 px-6 text-center">Status</th>
                                            <th className="py-4 px-6 text-center">Stats</th>
                                            <th className="py-4 px-6 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                                        {trips.map(trip => {
                                            const ongoing = new Date(trip.startDate) <= new Date() && new Date() <= new Date(trip.endDate);
                                            const departuresStr = new Date(trip.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                                            const returnStr = new Date(trip.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                                            const flightCount = (trip.transports?.filter(t => t.mode === 'Flight').length) || 0;
                                            const overnightsCount = trip.accommodations?.length || 0;

                                            return (
                                                <tr key={trip.id} className="hover:bg-gray-50/40 dark:hover:bg-white/5/30 transition-colors group">
                                                    <td className="py-4 px-6">
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/10 rounded-xl flex items-center justify-center text-blue-500 text-xl group-hover:scale-105 transition-transform shrink-0">
                                                                <span className="material-icons-outlined">{trip.icon || 'map'}</span>
                                                            </div>
                                                            <div className="min-w-0">
                                                                <h4 className="font-bold text-gray-900 dark:text-white text-sm leading-snug truncate max-w-[12rem]" title={trip.name}>
                                                                    {trip.name}
                                                                </h4>
                                                                <div className="flex items-center gap-1 text-[11px] text-gray-450 dark:text-gray-500 mt-0.5 font-medium">
                                                                    <span className="material-icons-outlined text-xs shrink-0">place</span>
                                                                    <span className="truncate max-w-[10rem]">{trip.location}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="py-4 px-6">
                                                        <div className="flex flex-col text-xs font-mono text-gray-500 dark:text-gray-400 font-semibold gap-0.5">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="text-[9px] font-black uppercase text-gray-350 dark:text-gray-650 tracking-wider">DEP</span>
                                                                <span>{departuresStr}</span>
                                                            </div>
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="text-[9px] font-black uppercase text-gray-350 dark:text-gray-650 tracking-wider">RET</span>
                                                                <span>{returnStr}</span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="py-4 px-6 text-center whitespace-nowrap">
                                                        {trip.isBundleOnly || trip.hideInPlanner ? (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleCreateTripFromBundle(trip);
                                                                }}
                                                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-black tracking-wide uppercase bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-950/30 dark:hover:bg-blue-900/40 dark:text-blue-400 rounded-lg border border-blue-100 dark:border-blue-900/20 transition-all cursor-pointer shadow-xs active:scale-95"
                                                                title="Add this travel schedule directly to your Planner boards"
                                                            >
                                                                <span className="material-icons-outlined text-xs">add</span>
                                                                <span>Create Trip</span>
                                                            </button>
                                                        ) : ongoing ? (
                                                            <Badge color="amber" className="animate-pulse inline-block">Active Now</Badge>
                                                        ) : (
                                                            (() => {
                                                                const plannerStatus = getTripPlannerStatus(trip);
                                                                return (
                                                                    <Badge color={plannerStatus.color} className="inline-block">
                                                                        {plannerStatus.text}
                                                                    </Badge>
                                                                );
                                                            })()
                                                        )}
                                                    </td>
                                                    <td className="py-4 px-6 text-center">
                                                        <div className="flex items-center justify-center gap-2.5 text-xs">
                                                            <div className="flex items-center gap-1 bg-violet-50/50 dark:bg-violet-900/5 px-2 py-1 rounded-lg border border-violet-100/30 dark:border-violet-900/10" title={`${flightCount} Flight Legs`}>
                                                                <span className="material-icons-outlined text-sm text-violet-555 dark:text-violet-400">flight</span>
                                                                <span className="font-extrabold text-gray-800 dark:text-gray-200">{flightCount}</span>
                                                            </div>
                                                            <div className="flex items-center gap-1 bg-emerald-50/50 dark:bg-emerald-900/5 px-2 py-1 rounded-lg border border-emerald-100/30 dark:border-emerald-900/10" title={`${overnightsCount} Overnights`}>
                                                                <span className="material-icons-outlined text-sm text-emerald-555 dark:text-emerald-400">hotel</span>
                                                                <span className="font-extrabold text-gray-800 dark:text-gray-200">{overnightsCount}</span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="py-4 px-6 text-right">
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleStartEditTrip(trip);
                                                                }}
                                                                className="p-1 px-2.5 rounded-lg bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-800 dark:hover:bg-zinc-750 text-blue-500 font-bold flex items-center gap-1 transition-colors cursor-pointer border border-zinc-200 dark:border-white/5 text-[11px]"
                                                                title="Edit Trip Settings"
                                                            >
                                                                <span className="material-icons-outlined text-sm">edit</span>
                                                                <span>Edit</span>
                                                            </button>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleDeleteTripClick(trip.id);
                                                                }}
                                                                className="p-1 px-2.5 rounded-lg bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-800 dark:hover:bg-rose-950/20 text-rose-500 font-bold flex items-center gap-1 transition-colors cursor-pointer border border-zinc-200 dark:border-white/5 text-[11px]"
                                                                title="Delete Trip"
                                                            >
                                                                <span className="material-icons-outlined text-sm">delete</span>
                                                                <span>Delete</span>
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    )}
                </div>
            </div>

            {/* MODAL: SELF PROFILE DETAILS MODAL */}
            <Modal 
                isOpen={isEditing} 
                onClose={() => setIsEditing(false)} 
                title="Edit Inhabitant Details"
                subtitle="Personnel Parameters & Identification"
                icon="person"
            >
                <div className="space-y-6 text-left font-sans">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="block text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
                                Traveler Display Name <span className="text-rose-500">*</span>
                            </label>
                            <Input 
                                placeholder="e.g. Elena Rostova" 
                                value={editName} 
                                onChange={e => setEditName(e.target.value)} 
                                className="h-14 !text-xl font-bold"
                                autoFocus
                            />
                        </div>

                        <div className="p-5 rounded-3xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5 space-y-4">
                            <span className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block">
                                Account Access
                            </span>
                            <Input 
                                label="Change Portal Password" 
                                type="password"
                                placeholder="Type a secure password" 
                                value={editPassword} 
                                onChange={e => setEditPassword(e.target.value)} 
                            />
                            
                            <Select 
                                label="Holiday Weekend Rule" 
                                value={editWeekendRule} 
                                onChange={(e: any) => setEditWeekendRule(e.target.value)}
                                options={[
                                    { label: 'Standard No Override', value: 'none' },
                                    { label: 'Cycle Monday Policy', value: 'monday' },
                                    { label: 'Compensate Lieu Rule', value: 'lieu' }
                                ]}
                            />
                        </div>

                        {/* Biometric & Passport details */}
                        <div className="p-5 rounded-3xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5 space-y-4">
                            <span className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block">
                                Passport & Biometrics
                            </span>
                            
                            {/* Portrait Photo Dropzone */}
                            <div className="space-y-1.5">
                                <label className="block text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">Portrait Biography Photo</label>
                                <div 
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onDrop={handleDrop}
                                    className={`border-2 border-dashed rounded-2xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${
                                        isDragging 
                                            ? 'border-primary-500 bg-primary-500/10' 
                                            : 'border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20 bg-white/50 dark:bg-black/10'
                                    }`}
                                    onClick={() => document.getElementById('profile-pic-input')?.click()}
                                >
                                    <input 
                                        id="profile-pic-input" 
                                        type="file" 
                                        accept="image/*" 
                                        className="hidden" 
                                        onChange={handleFileChange} 
                                    />
                                    {editProfilePicture ? (
                                        <div className="flex items-center gap-4 w-full">
                                            <img src={editProfilePicture} className="w-16 h-16 rounded-xl object-cover shrink-0 border border-black/10 dark:border-white/10 shadow-sm" alt="Preview" />
                                            <div className="flex-1 text-left">
                                                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                                                    <span className="material-icons-outlined text-sm">check_circle</span> Loaded Successfully
                                                </span>
                                                <button 
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setEditProfilePicture('');
                                                    }}
                                                    className="text-2xs text-rose-500 font-bold tracking-wider uppercase mt-1 hover:underline cursor-pointer"
                                                >
                                                    Remove Photo
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-center py-2">
                                            <span className="material-icons-outlined text-2xl text-light-text-secondary dark:text-dark-text-secondary block mb-1 opacity-60">add_a_photo</span>
                                            <span className="text-xs font-bold text-light-text dark:text-dark-text block">Drag & drop or click to select image</span>
                                            <span className="text-2xs text-light-text-secondary dark:text-dark-text-secondary block font-mono mt-0.5 opacity-60">PNG, JPG, WebP</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <Input 
                                    label="Nationality / Nationalities" 
                                    placeholder="e.g. Lebanese, Italian" 
                                    value={editNationality} 
                                    onChange={e => setEditNationality(e.target.value)} 
                                />
                                <Input 
                                    label="Date of Birth" 
                                    type="date" 
                                    value={editDateOfBirth} 
                                    onChange={e => setEditDateOfBirth(e.target.value)} 
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Input 
                                    label="Passport Number" 
                                    placeholder="e.g. RL1234567" 
                                    value={editPassportNumber} 
                                    onChange={e => setEditPassportNumber(e.target.value)} 
                                />
                                <Input 
                                    label="Issuing Entity" 
                                    placeholder="e.g. WG Aviation HQ" 
                                    value={editPassportIssuingEntity} 
                                    onChange={e => setEditPassportIssuingEntity(e.target.value)} 
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <Input 
                                    label="Issue Date" 
                                    type="date" 
                                    value={editPassportIssueDate} 
                                    onChange={e => setEditPassportIssueDate(e.target.value)} 
                                />
                                <Input 
                                    label="Expiry Date" 
                                    type="date" 
                                    value={editPassportExpiryDate} 
                                    onChange={e => setEditPassportExpiryDate(e.target.value)} 
                                />
                            </div>
                        </div>

                        {/* Admin-only properties editable in User profile as well */}
                        {user.role === 'Admin' && (
                            <div className="p-5 rounded-3xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5 space-y-4">
                                <span className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block">
                                    Administrative Allowance
                                </span>
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
                            </div>
                        )}
                    </div>

                    <div className="flex gap-3 pt-4 border-t border-black/5 dark:border-white/5 shrink-0 justify-end">
                        <Button variant="secondary" onClick={() => setIsEditing(false)}>Cancel</Button>
                        <Button 
                            variant="primary" 
                            disabled={!editName.trim()}
                            onClick={handleSaveProfile}
                            isLoading={saveLoading}
                        >
                            Save Changes
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* MODAL: EDIT TRIP DETAILS MODAL */}
            <Modal 
                isOpen={isEditingTrip} 
                onClose={() => setIsEditingTrip(false)} 
                title="Edit Expedition Details"
                subtitle="Modify Expedition Logistics"
                icon="map"
            >
                <div className="space-y-6 text-left font-sans">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="block text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
                                Expedition Name <span className="text-rose-500">*</span>
                            </label>
                            <Input 
                                placeholder="e.g. Summer Vacation" 
                                value={editTripName} 
                                onChange={e => setEditTripName(e.target.value)} 
                                className="h-14 !text-xl font-bold"
                                autoFocus
                            />
                        </div>
                        <Input 
                            label="Destination / Location" 
                            placeholder="e.g. Paris, France" 
                            value={editTripLocation} 
                            onChange={e => setEditTripLocation(e.target.value)} 
                        />
                        <div className="grid grid-cols-2 gap-4">
                            <Input 
                                label="Start Date" 
                                type="date"
                                value={editTripStartDate} 
                                onChange={e => setEditTripStartDate(e.target.value)} 
                            />
                            <Input 
                                label="End Date" 
                                type="date"
                                value={editTripEndDate} 
                                onChange={e => setEditTripEndDate(e.target.value)} 
                            />
                        </div>
                        <Select 
                            label="Trip Status" 
                            value={editTripStatus} 
                            onChange={(e: any) => setEditTripStatus(e.target.value)}
                            options={[
                                { label: 'Planning', value: 'Planning' },
                                { label: 'Upcoming', value: 'Upcoming' },
                                { label: 'Past', value: 'Past' },
                                { label: 'Cancelled', value: 'Cancelled' }
                            ]}
                        />
                    </div>

                    <div className="flex gap-3 pt-4 border-t border-black/5 dark:border-white/5 shrink-0 justify-end">
                        <Button variant="secondary" onClick={() => setIsEditingTrip(false)}>Cancel</Button>
                        <Button 
                            variant="primary" 
                            disabled={!editTripName.trim() || !editTripLocation.trim()}
                            onClick={handleSaveTrip}
                            isLoading={saveLoading}
                        >
                            Save Expedition
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* MODAL: EXTRAPOLATED TRIPS DELETION CONFIRMATION */}
            <Modal 
                isOpen={isDeletingTripConfirm} 
                onClose={() => setIsDeletingTripConfirm(false)} 
                title="Delete Expedition"
                subtitle="Permanent Archive"
                icon="delete_forever"
                maxWidth="max-w-md"
            >
                <div className="space-y-6 text-left font-sans">
                    <div className="p-5 rounded-3xl bg-rose-500/10 border border-rose-500/20">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 mb-2">
                            Aviation Archive Warning
                        </h4>
                        <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary leading-relaxed font-medium">
                            You are about to delete this expedition and permanently unregister all linked travel parameters from this user profile. Standard metrics like accrued overnights and flight logs associated with this schedule will be adjusted.
                        </p>
                    </div>

                    <p className="text-xs font-bold text-light-text dark:text-dark-text">
                        Are you sure you want to delete this trip forever? This action cannot be undone.
                    </p>

                    <div className="flex gap-3 pt-4 border-t border-black/5 dark:border-white/5 shrink-0 justify-end">
                        <Button variant="secondary" onClick={() => setIsDeletingTripConfirm(false)}>Cancel</Button>
                        <Button
                            variant="danger"
                            onClick={handleConfirmDeleteTrip}
                            isLoading={saveLoading}
                        >
                            Confirm Delete
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
