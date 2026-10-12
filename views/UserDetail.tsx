import React, { useEffect, useState, useMemo } from 'react';
import { EmptyState } from '../components/EmptyState';
import { Button, Badge, Input, Select, Modal, Tabs } from '../components/ui';
import GlassPanel from '../components/glass/GlassPanel';
import DatePicker from '../components/ui/DatePicker';
import {
  ArrowLeft, SignOut, AirplaneTakeoff, MapPin, CalendarBlank, Compass,
  AirplaneTilt, Bed, PencilSimple, Trash, Camera, Spinner, UserCircle,
  IdentificationCard, Suitcase, Globe, SunHorizon, Eye, EyeSlash, Plus, Envelope
} from '@phosphor-icons/react';
import { dataService } from '../services/mockDb';
import { User, Trip } from '../types';
import { formatDate } from '../utils/formatters';

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
                <EmptyState
                    icon="person_off"
                    title="Member not found"
                    description="This profile doesn't exist or has been removed."
                    action={{ label: 'Back to Dashboard', onClick: onBack }}
                />
            </div>
        );
    }

    if (loading || !user) {
        return (
            <div className="flex flex-col items-center justify-center p-24 gap-4 w-full" role="status" aria-label="Loading profile">
                <Spinner className="w-10 h-10 animate-spin text-primary-500" />
            </div>
        );
    }

    const allowance = user.leaveBalance ?? 25;
    const taken = user.takenLeave ?? 0;
    const remaining = allowance - taken;
    const leavePercent = allowance > 0 ? Math.min(100, Math.round((taken / allowance) * 100)) : 0;
    const leaveBarColor = leavePercent > 85 ? 'bg-rose-500' : leavePercent > 60 ? 'bg-amber-500' : 'bg-emerald-500';
    const weekendRuleLabel = { none: 'Standard', monday: 'Move to Monday', lieu: 'Day in lieu' }[user.holidayWeekendRule || 'none'];
    const roleColor = user.role === 'Admin' ? 'purple' : user.role === 'Partner' ? 'blue' : 'green';
    const roleGradient = user.role === 'Admin'
        ? 'from-purple-500 to-indigo-600 shadow-purple-500/25'
        : user.role === 'Partner'
            ? 'from-blue-500 to-indigo-600 shadow-indigo-500/25'
            : 'from-emerald-500 to-teal-600 shadow-teal-500/25';

    let isOwnProfile = false;
    try {
        const sessionRaw = localStorage.getItem('wandergrid_session_user');
        isOwnProfile = !!sessionRaw && JSON.parse(sessionRaw).id === userId;
    } catch { /* unreadable session: treat as not own */ }

    const maskedPassport = user.passportNumber
        ? `•••• ${user.passportNumber.slice(-4)}`
        : '';

    const profileTabs = [
        { id: 'trips', label: `Trips · ${trips.length}`, icon: <Suitcase className="w-5 h-5" weight="duotone" />, color: 'primary' as const },
        { id: 'destinations', label: `Destinations · ${stats.destinations.length}`, icon: <Globe className="w-5 h-5" weight="duotone" />, color: 'emerald' as const },
        { id: 'leave', label: 'Leave', icon: <SunHorizon className="w-5 h-5" weight="duotone" />, color: 'amber' as const },
    ];

    const statTiles = [
        { label: 'Trips', value: stats.trips, icon: Suitcase, tone: 'text-primary-500' },
        { label: 'Upcoming', value: stats.upcoming, icon: CalendarBlank, tone: 'text-sky-500' },
        { label: 'Days travelled', value: stats.daysTravelled, icon: SunHorizon, tone: 'text-amber-500' },
        { label: 'Destinations', value: stats.destinations.length, icon: Globe, tone: 'text-emerald-500' },
        { label: 'Flights', value: stats.flights, icon: AirplaneTakeoff, tone: 'text-violet-500' },
    ];

    const passportRows: { label: string; value: string }[] = [
        { label: 'Nationality', value: user.nationality || '' },
        { label: 'Date of birth', value: user.dateOfBirth ? formatDate(user.dateOfBirth, 'long') : '' },
        { label: 'Issued by', value: user.passportIssuingEntity || '' },
        { label: 'Issued', value: user.passportIssueDate ? formatDate(user.passportIssueDate, 'short-with-year') : '' },
        { label: 'Expires', value: user.passportExpiryDate ? formatDate(user.passportExpiryDate, 'short-with-year') : '' },
    ];
    const hasPassportData = !!user.passportNumber || passportRows.some(r => r.value);

    const sectionHeader = (icon: React.ReactNode, title: string, right?: React.ReactNode) => (
        <div className="p-5 border-b border-black/5 dark:border-white/5 flex items-center justify-between gap-3 bg-gradient-to-r from-primary-500/10 via-primary-500/5 to-transparent shrink-0">
            <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary-500 to-indigo-600 text-white shadow-md shadow-primary-500/20 flex items-center justify-center shrink-0">
                    {icon}
                </div>
                <h2 className="text-base font-bold text-light-text dark:text-dark-text tracking-tight truncate">{title}</h2>
            </div>
            {right}
        </div>
    );

    return (
        <div className="w-full max-w-[1680px] mx-auto pt-2 sm:pt-4 px-1 sm:px-4 md:px-6 lg:px-8 flex flex-col gap-5 sm:gap-6 animate-fadeIn pb-16 text-light-text dark:text-dark-text">
            {/* HERO HEADER */}
            <div className="flex flex-row items-center justify-between gap-2.5 sm:gap-4 w-full pt-1 pb-1 text-left">
                <div className="flex items-center justify-start gap-2 sm:gap-3 md:gap-4 min-w-0">
                    <UserCircle className="w-6 h-6 sm:w-9 sm:h-9 md:w-12 md:h-12 text-primary-500 dark:text-primary-400 shrink-0" weight="duotone" />
                    <h1 className="text-xl sm:text-3xl md:text-5xl font-black text-light-text dark:text-dark-text tracking-tight leading-tight sm:leading-none truncate">
                        Profile
                    </h1>
                </div>
                <div className="flex items-center justify-end gap-2 shrink-0">
                    <Button variant="secondary" onClick={onBack} icon={<ArrowLeft className="w-4 h-4" />} aria-label="Back to dashboard">
                        <span className="hidden sm:inline">Dashboard</span>
                    </Button>
                    <Button variant="primary" onClick={openEditProfile} icon={<PencilSimple className="w-4 h-4" />}>
                        Edit
                    </Button>
                </div>
            </div>

            {/* IDENTITY + STATS */}
            <GlassPanel className="wg-glass-card shadow-glass-card overflow-hidden border border-black/5 dark:border-white/10" overrides={{ borderRadius: 28 }} padding="0px">
                <div className="rounded-[28px] overflow-hidden">
                    <div className="p-5 sm:p-8 flex flex-col sm:flex-row items-center sm:items-center gap-5 sm:gap-8 bg-gradient-to-r from-primary-500/10 via-primary-500/5 to-transparent">
                        <div className={`w-24 h-24 sm:w-32 sm:h-32 rounded-3xl flex items-center justify-center overflow-hidden text-5xl font-black text-white shadow-xl border-2 border-white/20 shrink-0 bg-gradient-to-br ${roleGradient}`}>
                            {user.profilePicture ? (
                                <img src={user.profilePicture} alt={user.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                                <span aria-hidden="true">{user.name?.charAt(0)?.toUpperCase() || '?'}</span>
                            )}
                        </div>
                        <div className="min-w-0 flex-1 text-center sm:text-left space-y-2">
                            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
                                <h2 className="text-2xl sm:text-4xl font-black tracking-tight leading-tight truncate max-w-full">{user.name}</h2>
                                <Badge color={roleColor}>{user.role}</Badge>
                            </div>
                            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-5 gap-y-1 text-sm font-medium text-light-text-secondary dark:text-dark-text-secondary">
                                {user.email && (
                                    <span className="inline-flex items-center gap-1.5 min-w-0">
                                        <Envelope className="w-4 h-4 shrink-0" weight="duotone" />
                                        <span className="truncate">{user.email}</span>
                                    </span>
                                )}
                                {user.nationality && (
                                    <span className="inline-flex items-center gap-1.5">
                                        <Globe className="w-4 h-4 shrink-0" weight="duotone" />
                                        {user.nationality}
                                    </span>
                                )}
                            </div>
                        </div>
                        {isOwnProfile && onLogout && (
                            <Button variant="danger" onClick={onLogout} icon={<SignOut className="w-4 h-4" />} className="shrink-0 w-full sm:w-auto">
                                Sign out
                            </Button>
                        )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 border-t border-black/5 dark:border-white/5 divide-x divide-black/5 dark:divide-white/5">
                        {statTiles.map((tile, i) => {
                            const TileIcon = tile.icon;
                            return (
                                <div
                                    key={tile.label}
                                    className={`p-4 sm:p-5 flex flex-col items-center text-center gap-1 ${i >= 2 ? 'border-t sm:border-t-0 border-black/5 dark:border-white/5' : ''} ${i === 4 ? 'col-span-2 sm:col-span-1' : ''}`}
                                >
                                    <TileIcon className={`w-6 h-6 ${tile.tone}`} weight="duotone" />
                                    <span className="text-2xl sm:text-3xl font-black tabular-nums">{tile.value}</span>
                                    <span className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">{tile.label}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </GlassPanel>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start w-full">
                {/* PASSPORT */}
                <div className="lg:col-span-4 flex flex-col overflow-hidden rounded-[28px]">
                    <GlassPanel className="wg-glass-card shadow-glass-card overflow-hidden border border-black/5 dark:border-white/10" overrides={{ borderRadius: 28 }} padding="0px">
                        <div className="flex flex-col w-full overflow-hidden rounded-[28px]">
                            {sectionHeader(
                                <IdentificationCard className="w-5 h-5" weight="duotone" />,
                                'Passport',
                                passportStatus && <Badge color={passportStatus.color}>{passportStatus.label}</Badge>
                            )}
                            {hasPassportData ? (
                                <dl className="p-5 sm:p-6 space-y-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <dt className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">Number</dt>
                                            <dd className="text-lg font-mono font-bold tracking-wide truncate">
                                                {user.passportNumber ? (showPassportNumber ? user.passportNumber : maskedPassport) : '—'}
                                            </dd>
                                        </div>
                                        {user.passportNumber && (
                                            <button
                                                type="button"
                                                onClick={() => setShowPassportNumber(v => !v)}
                                                className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-light-text-secondary dark:text-dark-text-secondary hover:bg-black/5 dark:hover:bg-white/5 transition-colors shrink-0 cursor-pointer"
                                                aria-label={showPassportNumber ? 'Hide passport number' : 'Show passport number'}
                                                aria-pressed={showPassportNumber}
                                            >
                                                {showPassportNumber ? <EyeSlash className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                            </button>
                                        )}
                                    </div>
                                    {passportRows.filter(r => r.value).map(row => (
                                        <div key={row.label} className="flex items-baseline justify-between gap-4 pt-3 border-t border-black/5 dark:border-white/5">
                                            <dt className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary shrink-0">{row.label}</dt>
                                            <dd className="text-sm font-semibold text-right truncate">{row.value}</dd>
                                        </div>
                                    ))}
                                </dl>
                            ) : (
                                <div className="p-5 sm:p-6">
                                    <EmptyState
                                        compact
                                        icon={<IdentificationCard className="w-8 h-8" weight="duotone" />}
                                        title="No passport details"
                                        action={{ label: 'Add details', onClick: openEditProfile, icon: <Plus className="w-4 h-4" />, variant: 'secondary' }}
                                    />
                                </div>
                            )}
                        </div>
                    </GlassPanel>
                </div>

                {/* TABBED CONTENT */}
                <div className="lg:col-span-8 flex flex-col gap-5 min-w-0">
                    <Tabs tabs={profileTabs} activeTab={activeTab} onChange={id => setActiveTab(id as 'trips' | 'destinations' | 'leave')} />

                    {activeTab === 'trips' && (
                        trips.length === 0 ? (
                            <EmptyState
                                icon={<Compass className="w-10 h-10" weight="duotone" />}
                                title="No trips yet"
                                description="Trips this member joins appear here."
                            />
                        ) : (
                            <GlassPanel className="wg-glass-card shadow-glass-card overflow-hidden border border-black/5 dark:border-white/10" overrides={{ borderRadius: 28 }} padding="0px">
                                <ul className="divide-y divide-black/5 dark:divide-white/5 rounded-[28px] overflow-hidden">
                                    {sortedTrips.map(trip => {
                                        const phase = getPhase(trip);
                                        const isBundle = trip.isBundleOnly || trip.hideInPlanner;
                                        const flightCount = trip.transports?.filter(t => t.mode === 'Flight').length || 0;
                                        const stayCount = trip.accommodations?.length || 0;
                                        return (
                                            <li key={trip.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5 hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors">
                                                <div className="flex items-center gap-4 min-w-0 flex-1">
                                                    <div className="w-11 h-11 rounded-2xl bg-primary-500/10 text-primary-500 flex items-center justify-center shrink-0">
                                                        <Suitcase className="w-6 h-6" weight="duotone" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <h3 className="font-bold text-sm sm:text-base leading-snug truncate" title={trip.name}>{trip.name}</h3>
                                                        <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary font-medium flex items-center gap-1.5 mt-0.5 min-w-0">
                                                            <MapPin className="w-3.5 h-3.5 shrink-0" />
                                                            <span className="truncate">{trip.location}</span>
                                                            <span aria-hidden="true">·</span>
                                                            <span className="whitespace-nowrap">{formatDate(trip.startDate, 'short')} – {formatDate(trip.endDate, 'short-with-year')}</span>
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2 sm:gap-3 flex-wrap sm:flex-nowrap shrink-0">
                                                    <span className="inline-flex items-center gap-1 text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary" title={`${flightCount} flights`}>
                                                        <AirplaneTilt className="w-4 h-4 text-violet-500" weight="duotone" />{flightCount}
                                                    </span>
                                                    <span className="inline-flex items-center gap-1 text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary" title={`${stayCount} stays`}>
                                                        <Bed className="w-4 h-4 text-emerald-500" weight="duotone" />{stayCount}
                                                    </span>
                                                    {isBundle ? (
                                                        <Button
                                                            variant="secondary"
                                                            size="sm"
                                                            onClick={() => handleCreateTripFromBundle(trip)}
                                                            icon={<Plus className="w-3.5 h-3.5" />}
                                                        >
                                                            Add to Planner
                                                        </Button>
                                                    ) : (
                                                        <Badge color={PHASE_BADGE[phase]}>{phase}</Badge>
                                                    )}
                                                    <div className="flex items-center ml-auto sm:ml-0">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleStartEditTrip(trip)}
                                                            className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-light-text-secondary dark:text-dark-text-secondary hover:text-primary-500 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                                                            aria-label={`Edit ${trip.name}`}
                                                        >
                                                            <PencilSimple className="w-5 h-5" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteTripClick(trip.id)}
                                                            className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-light-text-secondary dark:text-dark-text-secondary hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                                                            aria-label={`Delete ${trip.name}`}
                                                        >
                                                            <Trash className="w-5 h-5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </GlassPanel>
                        )
                    )}

                    {activeTab === 'destinations' && (
                        stats.destinations.length === 0 ? (
                            <EmptyState
                                icon={<Globe className="w-10 h-10" weight="duotone" />}
                                title="No destinations yet"
                                description="Destinations appear after a trip is completed."
                            />
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                                {stats.destinations.map(dest => (
                                    <GlassPanel key={dest.name} className="wg-glass-pill" overrides={{ borderRadius: 20 }} padding="16px">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                                                <MapPin className="w-5 h-5" weight="duotone" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-bold truncate" title={dest.name}>{dest.name}</p>
                                                <p className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">{formatDate(dest.date, 'month-year')}</p>
                                            </div>
                                        </div>
                                    </GlassPanel>
                                ))}
                            </div>
                        )
                    )}

                    {activeTab === 'leave' && (
                        <GlassPanel className="wg-glass-card shadow-glass-card overflow-hidden border border-black/5 dark:border-white/10" overrides={{ borderRadius: 28 }} padding="0px">
                            <div className="rounded-[28px] overflow-hidden">
                                {sectionHeader(
                                    <SunHorizon className="w-5 h-5" weight="duotone" />,
                                    'Leave',
                                    <Badge color={leavePercent > 85 ? 'red' : leavePercent > 60 ? 'amber' : 'green'}>{leavePercent}% used</Badge>
                                )}
                                <div className="p-5 sm:p-6 space-y-6">
                                    <div className="flex items-end justify-between gap-4">
                                        <div>
                                            <span className="text-5xl font-black tabular-nums">{remaining}</span>
                                            <span className="text-sm font-bold text-light-text-secondary dark:text-dark-text-secondary ml-2">days left</span>
                                        </div>
                                        <span className="text-sm font-semibold text-light-text-secondary dark:text-dark-text-secondary tabular-nums">{taken} of {allowance} taken</span>
                                    </div>
                                    <div
                                        className="w-full h-3 bg-black/5 dark:bg-white/10 rounded-full overflow-hidden"
                                        role="progressbar"
                                        aria-label="Leave used"
                                        aria-valuemin={0}
                                        aria-valuemax={100}
                                        aria-valuenow={leavePercent}
                                    >
                                        <div className={`h-full rounded-full transition-all duration-500 ${leaveBarColor}`} style={{ width: `${leavePercent}%` }} />
                                    </div>
                                    <div className="pt-4 border-t border-black/5 dark:border-white/5 flex items-baseline justify-between gap-4">
                                        <span className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">Weekend holidays</span>
                                        <span className="text-sm font-semibold">{weekendRuleLabel}</span>
                                    </div>
                                </div>
                            </div>
                        </GlassPanel>
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

                    <div className="flex gap-3 pt-4 border-t border-black/5 dark:border-white/5 shrink-0 justify-end">
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
                    <div className="flex gap-3 pt-4 border-t border-black/5 dark:border-white/5 shrink-0 justify-end">
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
                    <div className="flex gap-3 pt-4 border-t border-black/5 dark:border-white/5 shrink-0 justify-end">
                        <Button variant="secondary" onClick={() => setIsDeletingTripConfirm(false)}>Cancel</Button>
                        <Button variant="danger" onClick={handleConfirmDeleteTrip} isLoading={saveLoading}>Delete trip</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
