import React, { useEffect, useState, useMemo } from 'react';
import { Button, Input, Select, Modal } from '../../components/ui';
import DatePicker from '../../components/ui/DatePicker';
import {
  ArrowLeft, SignOut, MapPin, AirplaneTilt, Bed, PencilSimple, Trash, Camera,
  Spinner, IdentificationCard, Suitcase, Globe, SunHorizon, Eye, EyeSlash, Plus, Envelope
} from '@/components/ui/hugeicons';
import { dataService } from '../../services/mockDb';
import { User, Trip } from '../../types';
import { formatDate } from '../../utils/formatters';
import { GhButton, GhCard, GhChip, GhEmpty, GhStat, GhTabs } from '../../components/golden/Gh';
import { GhStamp, SunsetScene } from '../../components/golden/SunsetScene';
import type { GoldenViewProps } from './registry';

/** Golden Hour redesign of the member profile. State and handlers are copied from views/UserDetail.tsx. */
export const GoldenUserDetail: React.FC<GoldenViewProps> = ({ userId = '', onBack = () => {}, onLogout }) => {
    const [user, setUser] = useState<User | null>(null);
    const [trips, setTrips] = useState<Trip[]>([]);
    const [loading, setLoading] = useState(true);

    // Profile Edit States
    const [isEditing, setIsEditing] = useState(false);
    const [profileError, setProfileError] = useState('');
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
    const [activeTab, setActiveTab] = useState<'trips' | 'destinations' | 'leave'>('trips');
    const [showPassportNumber, setShowPassportNumber] = useState(false);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    // Avatars are stored inside the user record, so downscale to 512px JPEG (well under the 1 MB limit).
    const processFile = (file: File) => {
        if (!file || !/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) {
            setProfileError('Choose a PNG, JPEG, WebP or GIF image.');
            return;
        }
        setProfileError('');
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            const scale = Math.min(1, 512 / Math.max(img.width, img.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(img.width * scale));
            canvas.height = Math.max(1, Math.round(img.height * scale));
            canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);
            setEditProfilePicture(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            setProfileError('That image could not be read.');
        };
        img.src = url;
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

    type Phase = 'Planning' | 'Active' | 'Upcoming' | 'Past' | 'Cancelled';
    const PHASE_BADGE: Record<Phase, 'amber' | 'green' | 'blue' | 'purple' | 'red'> = {
        Planning: 'amber', Active: 'green', Upcoming: 'blue', Past: 'purple', Cancelled: 'red'
    };

    const getPhase = (trip: Trip): Phase => {
        if (trip.status === 'Cancelled') return 'Cancelled';
        if (trip.status === 'Planning') return 'Planning';
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const start = new Date(trip.startDate);
        const end = new Date(trip.endDate);
        if (start <= today && today <= end) return 'Active';
        return end >= today ? 'Upcoming' : 'Past';
    };

    const refreshProfile = () => {
        setLoading(true);
        dataService.getUsers()
            .then(allUsers => {
                const foundUser = allUsers.find(u => u.id === userId);
                if (foundUser) {
                    setUser(foundUser);
                    syncEditFields(foundUser);
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

    const syncEditFields = (u: User) => {
        setEditName(u.name || '');
        setEditPassword('');
        setEditWeekendRule(u.holidayWeekendRule || 'none');
        setEditLeaveBalance(u.leaveBalance ?? 25);
        setEditTakenLeave(u.takenLeave ?? 0);
        setEditProfilePicture(u.profilePicture || '');
        setEditNationality(u.nationality || '');
        setEditDateOfBirth(u.dateOfBirth || '');
        setEditPassportNumber(u.passportNumber || '');
        setEditPassportIssuingEntity(u.passportIssuingEntity || '');
        setEditPassportIssueDate(u.passportIssueDate || '');
        setEditPassportExpiryDate(u.passportExpiryDate || '');
    };

    useEffect(() => {
        refreshProfile();
    }, [userId]);

    const stats = useMemo(() => {
        const live = trips.filter(t => t.status !== 'Cancelled');
        const phases = live.map(t => ({ trip: t, phase: getPhase(t) }));
        const past = phases.filter(p => p.phase === 'Past').map(p => p.trip);

        let daysTravelled = 0;
        past.forEach(t => {
            const diff = new Date(t.endDate).getTime() - new Date(t.startDate).getTime();
            if (Number.isFinite(diff)) daysTravelled += Math.round(diff / 86400000) + 1;
        });

        // Most recent visit per destination, newest first
        const lastVisit = new Map<string, string>();
        past.forEach(t => {
            const key = (t.location || '').trim();
            if (!key) return;
            const prev = lastVisit.get(key);
            if (!prev || t.endDate > prev) lastVisit.set(key, t.endDate);
        });
        const destinations = Array.from(lastVisit.entries())
            .map(([name, date]) => ({ name, date }))
            .sort((a, b) => b.date.localeCompare(a.date));

        const flights = live.reduce((n, t) => n + (t.transports?.filter(x => x.mode === 'Flight').length || 0), 0);

        return {
            trips: live.length,
            upcoming: phases.filter(p => p.phase === 'Upcoming' || p.phase === 'Active' || p.phase === 'Planning').length,
            daysTravelled,
            flights,
            destinations
        };
    }, [trips]);

    const sortedTrips = useMemo(() => {
        const today = new Date().toISOString().slice(0, 10);
        const ahead = trips.filter(t => t.endDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate));
        const behind = trips.filter(t => t.endDate < today).sort((a, b) => b.startDate.localeCompare(a.startDate));
        return [...ahead, ...behind];
    }, [trips]);

    const passportStatus = useMemo(() => {
        if (!user?.passportExpiryDate) return null;
        const expiry = new Date(user.passportExpiryDate);
        if (isNaN(expiry.getTime())) return null;
        const now = new Date();
        if (expiry < now) return { label: 'Expired', color: 'red' as const };
        const months = (expiry.getFullYear() - now.getFullYear()) * 12 + expiry.getMonth() - now.getMonth();
        if (months < 6) return { label: months < 1 ? 'Expires <1 mo' : `Expires in ${months} mo`, color: 'amber' as const };
        return { label: 'Valid', color: 'green' as const };
    }, [user?.passportExpiryDate]);

    const handleSaveProfile = async () => {
        if (!user || !editName.trim()) return;
        if (editPassword.trim() && editPassword.trim().length < 8) {
            setProfileError('Password must be at least 8 characters.');
            return;
        }
        setProfileError('');
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
            // Keep the typed password out of component state and localStorage.
            const { password: _typedPassword, ...savedUser } = updatedUser;
            setUser(savedUser as User);
            setEditPassword('');
            setIsEditing(false);
            // If editing own session, update cached user
            const sessionRaw = localStorage.getItem('wandergrid_session_user');
            if (sessionRaw) {
                const sessionUser = JSON.parse(sessionRaw);
                if (sessionUser.id === userId) {
                    localStorage.setItem('wandergrid_session_user', JSON.stringify(savedUser));
                }
            }
        } catch (e: any) {
            console.error("Failed to update user profile details", e);
            setProfileError(e?.message || 'Could not save your profile.');
        } finally {
            setSaveLoading(false);
        }
    };

    const openEditProfile = () => {
        if (!user) return;
        syncEditFields(user);
        setProfileError('');
        setIsEditing(true);
    };

    if (!loading && !user) {
        return (
            <div className="w-full max-w-[1680px] mx-auto pt-12 px-4">
                <GhEmpty
                    title="Member not found"
                    hint="This profile doesn't exist or has been removed."
                    action={<GhButton onClick={onBack}>Back to dashboard</GhButton>}
                />
            </div>
        );
    }

    if (loading || !user) {
        return (
            <div className="flex flex-col items-center justify-center p-24 gap-4 w-full" role="status" aria-label="Loading profile">
                <Spinner className="w-10 h-10 animate-spin text-sunset-coral" />
            </div>
        );
    }
    const allowance = user.leaveBalance ?? 25;
    const taken = user.takenLeave ?? 0;
    const remaining = allowance - taken;
    const leavePercent = allowance > 0 ? Math.min(100, Math.round((taken / allowance) * 100)) : 0;
    const weekendRuleLabel = { none: 'Standard', monday: 'Move to Monday', lieu: 'Day in lieu' }[user.holidayWeekendRule || 'none'];
    let isOwnProfile = false;
    try {
        const sessionRaw = localStorage.getItem('wandergrid_session_user');
        isOwnProfile = !!sessionRaw && JSON.parse(sessionRaw).id === userId;
    } catch { /* unreadable session: treat as not own */ }

    const maskedPassport = user.passportNumber
        ? `•••• ${user.passportNumber.slice(-4)}`
        : '';

    const PHASE_TONE: Record<Phase, 'sun' | 'teal' | 'lilac' | 'coral' | 'plain'> = {
        Planning: 'sun', Active: 'teal', Upcoming: 'lilac', Past: 'plain', Cancelled: 'coral'
    };
    const STAMP_TONES = ['coral', 'teal', 'lilac', 'sun'] as const;
    const initial = user.name?.charAt(0)?.toUpperCase() || '?';
    const profileTabs = [
        { id: 'trips', label: 'Trips', count: trips.length },
        { id: 'destinations', label: 'Stamps', count: stats.destinations.length },
        { id: 'leave', label: 'Leave' },
    ];
    const passportRows: { label: string; value: string }[] = [
        { label: 'Nationality', value: user.nationality || '' },
        { label: 'Born', value: user.dateOfBirth ? formatDate(user.dateOfBirth, 'long') : '' },
        { label: 'Issued by', value: user.passportIssuingEntity || '' },
        { label: 'Issued', value: user.passportIssueDate ? formatDate(user.passportIssueDate, 'short-with-year') : '' },
        { label: 'Expires', value: user.passportExpiryDate ? formatDate(user.passportExpiryDate, 'short-with-year') : '' },
    ];
    const hasPassportData = !!user.passportNumber || passportRows.some(r => r.value);
    const iconBtn = 'w-11 h-11 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center cursor-pointer transition-colors hover:bg-sunset-sand dark:hover:bg-sunset-dusk';

    return (
        <div className="w-full max-w-[1680px] mx-auto pt-2 sm:pt-4 px-2 sm:px-4 md:px-6 lg:px-8 flex flex-col gap-5 sm:gap-6 animate-fadeIn pb-16 text-sunset-ink dark:text-white">
            <div className="flex items-center justify-between gap-3">
                <GhButton variant="soft" onClick={onBack} icon={<ArrowLeft className="w-4 h-4" />} label="Back to dashboard">
                    <span className="hidden sm:inline">Dashboard</span>
                </GhButton>
                <div className="flex items-center gap-2">
                    {isOwnProfile && onLogout && (
                        <GhButton variant="ghost" onClick={onLogout} icon={<SignOut className="w-4 h-4" />}>Sign out</GhButton>
                    )}
                    <GhButton onClick={openEditProfile} icon={<PencilSimple className="w-4 h-4" />}>Edit profile</GhButton>
                </div>
            </div>

            {/* POSTCARD HEADER */}
            <section className="rounded-3xl overflow-hidden bg-white dark:bg-sunset-plum shadow-card">
                <div className="relative h-36 sm:h-48">
                    <SunsetScene className="absolute inset-0" />
                </div>
                <div className="px-5 sm:px-8 pb-6 flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6 -mt-14 sm:-mt-16 relative">
                    <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden bg-sunset-coral text-white flex items-center justify-center text-5xl font-black shrink-0 ring-4 ring-white dark:ring-sunset-plum">
                        {user.profilePicture ? (
                            <img src={user.profilePicture} alt={user.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                            <span aria-hidden="true">{initial}</span>
                        )}
                    </div>
                    <div className="min-w-0 flex-1 sm:pb-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight break-words">{user.name}</h1>
                            <GhChip tone={user.role === 'Admin' ? 'coral' : user.role === 'Partner' ? 'lilac' : 'teal'}>{user.role}</GhChip>
                        </div>
                        <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-sm font-semibold opacity-80">
                            {user.email && (
                                <span className="inline-flex items-center gap-1.5 min-w-0"><Envelope className="w-4 h-4 shrink-0" /><span className="truncate">{user.email}</span></span>
                            )}
                            {user.nationality && (
                                <span className="inline-flex items-center gap-1.5"><Globe className="w-4 h-4 shrink-0" />{user.nationality}</span>
                            )}
                        </div>
                    </div>
                </div>
            </section>

            {/* STAT TILES */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
                <GhStat tone="coral" label="Trips" value={stats.trips} />
                <GhStat tone="sun" label="Upcoming" value={stats.upcoming} />
                <GhStat tone="sun" label="Days away" value={stats.daysTravelled} hint="on finished trips" />
                <GhStat tone="lilac" label="Places" value={stats.destinations.length} />
                <div className="col-span-2 lg:col-span-1 flex flex-col [&>*]:flex-1"><GhStat tone="teal" label="Flights" value={stats.flights} /></div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start">
                {/* PASSPORT */}
                <section className="lg:col-span-4 rounded-3xl bg-sunset-lilac text-sunset-ink p-5 sm:p-6 flex flex-col gap-4">
                    <div className="flex items-center justify-between gap-3">
                        <h2 className="text-xl font-black flex items-center gap-2"><IdentificationCard className="w-6 h-6" />Passport</h2>
                        {passportStatus && (
                            <GhChip tone={passportStatus.color === 'red' ? 'coral' : passportStatus.color === 'amber' ? 'sun' : 'teal'}>{passportStatus.label}</GhChip>
                        )}
                    </div>
                    {hasPassportData ? (
                        <dl className="flex flex-col gap-3">
                            <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/60 p-3">
                                <div className="min-w-0">
                                    <dt className="text-xs font-bold uppercase tracking-wider opacity-70">Number</dt>
                                    <dd className="text-lg font-mono font-black tracking-wide truncate">
                                        {user.passportNumber ? (showPassportNumber ? user.passportNumber : maskedPassport) : '—'}
                                    </dd>
                                </div>
                                {user.passportNumber && (
                                    <button
                                        type="button"
                                        onClick={() => setShowPassportNumber(v => !v)}
                                        className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center cursor-pointer hover:bg-white/60 shrink-0"
                                        aria-label={showPassportNumber ? 'Hide passport number' : 'Show passport number'}
                                        aria-pressed={showPassportNumber}
                                    >
                                        {showPassportNumber ? <EyeSlash className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                    </button>
                                )}
                            </div>
                            {passportRows.filter(r => r.value).map(row => (
                                <div key={row.label} className="flex items-baseline justify-between gap-4 px-1">
                                    <dt className="text-xs font-bold uppercase tracking-wider opacity-70 shrink-0">{row.label}</dt>
                                    <dd className="text-sm font-bold text-right truncate">{row.value}</dd>
                                </div>
                            ))}
                        </dl>
                    ) : (
                        <div className="flex flex-col items-start gap-3">
                            <p className="font-bold">No passport details yet.</p>
                            <GhButton variant="soft" onClick={openEditProfile} icon={<Plus className="w-4 h-4" />}>Add details</GhButton>
                        </div>
                    )}
                </section>

                {/* TABBED CONTENT */}
                <div className="lg:col-span-8 flex flex-col gap-4 min-w-0">
                    <GhTabs tabs={profileTabs} active={activeTab} onChange={id => setActiveTab(id as 'trips' | 'destinations' | 'leave')} />

                    {activeTab === 'trips' && (
                        trips.length === 0 ? (
                            <GhEmpty title="No trips yet" hint="Trips this member joins show up here." />
                        ) : (
                            <ul className="flex flex-col gap-3">
                                {sortedTrips.map(trip => {
                                    const phase = getPhase(trip);
                                    const isBundle = trip.isBundleOnly || trip.hideInPlanner;
                                    const flightCount = trip.transports?.filter(t => t.mode === 'Flight').length || 0;
                                    const stayCount = trip.accommodations?.length || 0;
                                    return (
                                        <li key={trip.id} className="rounded-3xl bg-white dark:bg-sunset-plum shadow-card p-4 sm:p-5 flex flex-col xl:flex-row xl:items-center gap-3 sm:gap-5">
                                            <div className="flex items-center gap-4 min-w-0 flex-1">
                                                <div className="w-12 h-12 rounded-2xl bg-sunset-sun text-sunset-ink flex items-center justify-center shrink-0">
                                                    <Suitcase className="w-6 h-6" />
                                                </div>
                                                <div className="min-w-0">
                                                    <h3 className="font-black text-base leading-snug truncate" title={trip.name}>{trip.name}</h3>
                                                    <p className="text-xs font-semibold opacity-70 flex items-center gap-1.5 mt-0.5 min-w-0">
                                                        <MapPin className="w-3.5 h-3.5 shrink-0" />
                                                        <span className="truncate">{trip.location}</span>
                                                        <span aria-hidden="true">·</span>
                                                        <span className="whitespace-nowrap">{formatDate(trip.startDate, 'short')} – {formatDate(trip.endDate, 'short-with-year')}</span>
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 sm:gap-3 flex-wrap shrink-0">
                                                <span className="inline-flex items-center gap-1 text-xs font-bold" title={`${flightCount} flights`}><AirplaneTilt className="w-4 h-4" />{flightCount}</span>
                                                <span className="inline-flex items-center gap-1 text-xs font-bold" title={`${stayCount} stays`}><Bed className="w-4 h-4" />{stayCount}</span>
                                                {isBundle ? (
                                                    <GhButton variant="soft" onClick={() => handleCreateTripFromBundle(trip)} icon={<Plus className="w-3.5 h-3.5" />}>Add to Planner</GhButton>
                                                ) : (
                                                    <GhChip tone={PHASE_TONE[phase] === 'plain' ? 'plain' : PHASE_TONE[phase]} className={PHASE_TONE[phase] === 'plain' ? 'bg-sunset-sand dark:bg-sunset-dusk dark:text-white' : ''}>{phase}</GhChip>
                                                )}
                                                <div className="flex items-center ml-auto sm:ml-0">
                                                    <button type="button" onClick={() => handleStartEditTrip(trip)} className={iconBtn} aria-label={`Edit ${trip.name}`}><PencilSimple className="w-5 h-5" /></button>
                                                    <button type="button" onClick={() => handleDeleteTripClick(trip.id)} className={iconBtn} aria-label={`Delete ${trip.name}`}><Trash className="w-5 h-5" /></button>
                                                </div>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )
                    )}

                    {activeTab === 'destinations' && (
                        stats.destinations.length === 0 ? (
                            <GhEmpty title="No stamps yet" hint="Finish a trip and its destination lands here." />
                        ) : (
                            <div className="flex flex-wrap gap-4 sm:gap-6 py-2">
                                {stats.destinations.map((dest, i) => (
                                    <GhStamp
                                        key={dest.name}
                                        label={dest.name.split(',')[0]}
                                        caption={formatDate(dest.date, 'month-year')}
                                        tone={STAMP_TONES[i % STAMP_TONES.length]}
                                        rotate={[-6, 4, -3, 7][i % 4]}
                                    />
                                ))}
                            </div>
                        )
                    )}

                    {activeTab === 'leave' && (
                        <GhCard tone="sun" className="flex flex-col gap-5 !p-6 sm:!p-8">
                            <div className="flex items-end justify-between gap-4 flex-wrap">
                                <div>
                                    <span className="text-6xl font-black tabular-nums">{remaining}</span>
                                    <span className="text-base font-bold ml-2">days left</span>
                                </div>
                                <span className="text-sm font-bold tabular-nums">{taken} of {allowance} taken</span>
                            </div>
                            <div className="w-full h-4 bg-white/60 rounded-full overflow-hidden" role="progressbar" aria-label="Leave used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={leavePercent}>
                                <div className="h-full rounded-full bg-sunset-coral transition-all duration-500" style={{ width: `${leavePercent}%` }} />
                            </div>
                            <div className="flex items-baseline justify-between gap-4">
                                <span className="text-xs font-bold uppercase tracking-wider opacity-70 flex items-center gap-1.5"><SunHorizon className="w-4 h-4" />Weekend holidays</span>
                                <span className="text-sm font-bold">{weekendRuleLabel}</span>
                            </div>
                        </GhCard>
                    )}
                </div>
            </div>

            {/* MODAL: EDIT PROFILE */}
            <Modal
                isOpen={isEditing}
                onClose={() => setIsEditing(false)}
                title="Edit Profile"
                subtitle={user.email || 'Member details'}
                icon="person"
            >
                <div className="space-y-5 text-left font-sans">
                    <div className="flex items-center gap-4">
                        <div
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            className={`w-20 h-20 rounded-3xl overflow-hidden shrink-0 flex items-center justify-center border-2 border-dashed transition-all ${
                                isDragging ? 'border-primary-500 bg-primary-500/10' : 'border-black/10 dark:border-white/15 bg-white/50 dark:bg-white/5'
                            }`}
                        >
                            {editProfilePicture ? (
                                <img src={editProfilePicture} alt="Profile preview" className="w-full h-full object-cover" />
                            ) : (
                                <Camera className="w-7 h-7 text-light-text-secondary dark:text-dark-text-secondary" weight="duotone" />
                            )}
                        </div>
                        <input id="profile-pic-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleFileChange} />
                        <div className="flex flex-wrap gap-2">
                            <Button variant="secondary" size="sm" onClick={() => document.getElementById('profile-pic-input')?.click()} icon={<Camera className="w-4 h-4" />}>
                                {editProfilePicture ? 'Change photo' : 'Upload photo'}
                            </Button>
                            {editProfilePicture && (
                                <Button variant="secondary" size="sm" onClick={() => setEditProfilePicture('')}>Remove</Button>
                            )}
                        </div>
                    </div>

                    <Input
                        label="Name"
                        placeholder="Full name"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="h-14 !text-xl font-bold"
                        autoFocus
                    />

                    <div className="p-5 rounded-3xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5 space-y-4">
                        <span className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block">Passport</span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Input label="Nationality" placeholder="e.g. Lebanese, Italian" value={editNationality} onChange={e => setEditNationality(e.target.value)} />
                            <DatePicker label="Date of birth" value={editDateOfBirth} onChange={setEditDateOfBirth} maxDate={new Date().toISOString().slice(0, 10)} />
                            <Input label="Passport number" placeholder="e.g. RL1234567" value={editPassportNumber} onChange={e => setEditPassportNumber(e.target.value)} />
                            <Input label="Issued by" placeholder="e.g. General Security" value={editPassportIssuingEntity} onChange={e => setEditPassportIssuingEntity(e.target.value)} />
                            <DatePicker label="Issue date" value={editPassportIssueDate} onChange={setEditPassportIssueDate} />
                            <DatePicker label="Expiry date" value={editPassportExpiryDate} onChange={setEditPassportExpiryDate} minDate={editPassportIssueDate || undefined} />
                        </div>
                    </div>

                    <div className="p-5 rounded-3xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5 space-y-4">
                        <span className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block">Account</span>
                        <Input
                            label="New password"
                            type="password"
                            autoComplete="new-password"
                            placeholder="Leave blank to keep current (8+ characters)"
                            value={editPassword}
                            onChange={e => setEditPassword(e.target.value)}
                        />
                        <Select
                            label="Weekend holidays"
                            value={editWeekendRule}
                            onChange={(e: any) => setEditWeekendRule(e.target.value)}
                            options={[
                                { label: 'Standard', value: 'none' },
                                { label: 'Move to Monday', value: 'monday' },
                                { label: 'Day in lieu', value: 'lieu' }
                            ]}
                        />
                    </div>

                    {user.role === 'Admin' && (
                        <div className="p-5 rounded-3xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5 space-y-4">
                            <span className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block">Leave allowance</span>
                            <div className="grid grid-cols-2 gap-4">
                                <Input label="Annual days" type="number" min={0} value={editLeaveBalance} onChange={e => setEditLeaveBalance(parseInt(e.target.value) || 0)} />
                                <Input label="Days taken" type="number" min={0} value={editTakenLeave} onChange={e => setEditTakenLeave(parseInt(e.target.value) || 0)} />
                            </div>
                        </div>
                    )}

                    {profileError && (
                        <p role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-400">{profileError}</p>
                    )}

                    <div className="flex gap-3 pt-4 border-t border-black/10 dark:border-white/10 mt-6 shrink-0 justify-end">
                        <Button variant="secondary" onClick={() => setIsEditing(false)}>Cancel</Button>
                        <Button variant="primary" disabled={!editName.trim()} onClick={handleSaveProfile} isLoading={saveLoading}>
                            Save changes
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* MODAL: EDIT TRIP */}
            <Modal
                isOpen={isEditingTrip}
                onClose={() => setIsEditingTrip(false)}
                title="Edit Trip"
                subtitle={editingTrip?.name}
                icon="map"
            >
                <div className="space-y-5 text-left font-sans">
                    <Input
                        label="Trip name"
                        placeholder="e.g. Summer Vacation"
                        value={editTripName}
                        onChange={e => setEditTripName(e.target.value)}
                        className="h-14 !text-xl font-bold"
                        autoFocus
                    />
                    <Input label="Location" placeholder="e.g. Paris, France" value={editTripLocation} onChange={e => setEditTripLocation(e.target.value)} />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <DatePicker label="Start date" value={editTripStartDate} onChange={setEditTripStartDate} />
                        <DatePicker label="End date" value={editTripEndDate} onChange={setEditTripEndDate} minDate={editTripStartDate || undefined} />
                    </div>
                    <Select
                        label="Status"
                        value={editTripStatus}
                        onChange={(e: any) => setEditTripStatus(e.target.value)}
                        options={[
                            { label: 'Planning', value: 'Planning' },
                            { label: 'Upcoming', value: 'Upcoming' },
                            { label: 'Past', value: 'Past' },
                            { label: 'Cancelled', value: 'Cancelled' }
                        ]}
                    />
                    <div className="flex gap-3 pt-4 border-t border-black/10 dark:border-white/10 mt-6 shrink-0 justify-end">
                        <Button variant="secondary" onClick={() => setIsEditingTrip(false)}>Cancel</Button>
                        <Button
                            variant="primary"
                            disabled={!editTripName.trim() || !editTripLocation.trim()}
                            onClick={handleSaveTrip}
                            isLoading={saveLoading}
                        >
                            Save trip
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* MODAL: DELETE TRIP */}
            <Modal
                isOpen={isDeletingTripConfirm}
                onClose={() => setIsDeletingTripConfirm(false)}
                title="Delete Trip"
                subtitle="This can't be undone"
                icon="delete_forever"
                maxWidth="max-w-md"
            >
                <div className="space-y-5 text-left font-sans">
                    <p className="text-sm font-medium text-light-text dark:text-dark-text">
                        Delete this trip and its linked flights and stays for everyone on it?
                    </p>
                    <div className="flex gap-3 pt-4 border-t border-black/10 dark:border-white/10 mt-6 shrink-0 justify-end">
                        <Button variant="secondary" onClick={() => setIsDeletingTripConfirm(false)}>Cancel</Button>
                        <Button variant="danger" onClick={handleConfirmDeleteTrip} isLoading={saveLoading}>Delete trip</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
