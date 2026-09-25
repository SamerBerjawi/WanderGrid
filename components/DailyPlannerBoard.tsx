import React, { useState, useMemo } from 'react';
import { 
    CalendarBlank, 
    AirplaneTilt, 
    Bed, 
    Ticket, 
    Plus, 
    PencilSimple, 
    Trash, 
    MapPin, 
    Clock, 
    Compass, 
    Buildings, 
    House, 
    Boat, 
    Train, 
    Bus, 
    Key, 
    Car, 
    Anchor, 
    ForkKnife, 
    WarningCircle,
    CaretLeft,
    CaretRight,
    SquaresFour,
    Kanban,
    Eye,
    Camera,
    Mountains,
    FilmSlate,
    ShoppingBag,
    Sparkle,
    Wine
} from '@phosphor-icons/react';
import GlassPanel from './glass/GlassPanel';
import { EmptyState } from './EmptyState';
import { Trip, Transport, Accommodation, Activity, WorkspaceSettings } from '../types';
import { formatDate, formatCurrency } from '../utils/formatters';
import { 
    isCarRentalBooking, 
    getTransportScheduleTitle, 
    getTransportScheduleLocation, 
    getTransportScheduleEventsForDate,
    getTransportUtcTimestamp 
} from '../utils/transportSchedule';

export interface DailyPlannerBoardProps {
    trip: Trip;
    tripDates?: string[];
    settings?: WorkspaceSettings | null;
    onEditTransport: (transports?: Transport[], date?: string) => void;
    onEditAccommodation: (accommodation?: Accommodation, date?: string) => void;
    onEditActivity: (dateStr: string, activity?: Activity) => void;
    onDeleteActivity?: (activityId: string) => void;
}

interface AccommodationSpan {
    accommodation: Accommodation;
    startDayIndex: number; // 0-based index in tripDates
    endDayIndex: number;   // 0-based index in tripDates (day before checkout or clamp)
    totalNights: number;
    gridRowStart: number;
    gridRowEnd: number;
}

interface AccommodationGap {
    startDayIndex: number;
    endDayIndex: number;
    gridRowStart: number;
    gridRowEnd: number;
}

export const DailyPlannerBoard: React.FC<DailyPlannerBoardProps> = ({
    trip,
    tripDates: propTripDates,
    settings,
    onEditTransport,
    onEditAccommodation,
    onEditActivity,
    onDeleteActivity
}) => {
    // 1. Compute Safe Trip Dates
    const tripDates = useMemo(() => {
        if (Array.isArray(propTripDates) && propTripDates.length > 0) return propTripDates;
        if (!trip?.startDate || !trip?.endDate) return [];
        const dates: string[] = [];
        try {
            const startParts = (trip.startDate || '').split('-').map(Number);
            const endParts = (trip.endDate || '').split('-').map(Number);
            if (startParts.length === 3 && endParts.length === 3) {
                const curr = new Date(Date.UTC(startParts[0], startParts[1] - 1, startParts[2]));
                const last = new Date(Date.UTC(endParts[0], endParts[1] - 1, endParts[2]));
                if (!isNaN(curr.getTime()) && !isNaN(last.getTime())) {
                    while (curr <= last) {
                        dates.push(curr.toISOString().split('T')[0]);
                        curr.setUTCDate(curr.getUTCDate() + 1);
                    }
                }
            }
        } catch {
            return trip.startDate ? [trip.startDate] : [];
        }
        return dates.length > 0 ? dates : (trip.startDate ? [trip.startDate] : []);
    }, [propTripDates, trip?.startDate, trip?.endDate]);

    // Mobile view state
    const [selectedDayIndex, setSelectedDayIndex] = useState<number>(0);
    const [mobileViewMode, setMobileViewMode] = useState<'day' | 'canvas'>('day');
    const [showFloatingLane, setShowFloatingLane] = useState<boolean>(false);

    // Unscheduled / flexible items
    const floatingTransports = useMemo(() => {
        return (trip.transports || []).filter(t => t.isApproximate || !t.departureDate);
    }, [trip.transports]);

    const floatingActivities = useMemo(() => {
        return (trip.activities || []).filter(act => !act.date);
    }, [trip.activities]);

    const totalFloatingCount = floatingTransports.length + floatingActivities.length;

    // Helper: Location for date
    const getLocationForDate = (dateStr: string) => {
        if (!trip.locations || trip.locations.length === 0) return null;
        return trip.locations.find(l => dateStr >= l.startDate && dateStr <= l.endDate);
    };

    // Helper: Transport Mode Icon
    const getTransportIcon = (mode?: string) => {
        switch (mode) {
            case 'Train': return <Train className="w-4 h-4 shrink-0" weight="duotone" />;
            case 'Bus': return <Bus className="w-4 h-4 shrink-0" weight="duotone" />;
            case 'Ferry': return <Anchor className="w-4 h-4 shrink-0" weight="duotone" />;
            case 'Cruise': return <Boat className="w-4 h-4 shrink-0" weight="duotone" />;
            case 'Car Rental': return <Key className="w-4 h-4 shrink-0" weight="duotone" />;
            case 'Personal Car': return <Car className="w-4 h-4 shrink-0" weight="duotone" />;
            case 'Flight':
            default:
                return <AirplaneTilt className="w-4 h-4 shrink-0" weight="duotone" />;
        }
    };

    // Helper: Transport Card Styling based on Mode (Liquid Glass Translucent)
    const getTransportGlassStyle = (mode?: string) => {
        switch (mode) {
            case 'Flight':
                return 'wg-glass-card-emerald text-light-text dark:text-dark-text hover:border-emerald-400';
            case 'Ferry':
            case 'Cruise':
                return 'wg-glass-card-sky text-light-text dark:text-dark-text hover:border-sky-400';
            case 'Train':
                return 'wg-glass-card-amber text-light-text dark:text-dark-text hover:border-amber-400';
            case 'Car Rental':
            case 'Personal Car':
                return 'wg-glass-card-indigo text-light-text dark:text-dark-text hover:border-indigo-400';
            case 'Bus':
                return 'wg-glass-card-teal text-light-text dark:text-dark-text hover:border-teal-400';
            default:
                return 'wg-glass-card-slate text-light-text dark:text-dark-text hover:border-slate-400';
        }
    };

    // Helper: Transport Icon Container Avatar Style
    const getTransportIconContainerStyle = (mode?: string) => {
        switch (mode) {
            case 'Flight':
                return 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border-emerald-500/30';
            case 'Ferry':
            case 'Cruise':
                return 'bg-sky-500/20 text-sky-600 dark:text-sky-300 border-sky-500/30';
            case 'Train':
                return 'bg-amber-500/20 text-amber-600 dark:text-amber-300 border-amber-500/30';
            case 'Car Rental':
            case 'Personal Car':
                return 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border-indigo-500/30';
            case 'Bus':
                return 'bg-teal-500/20 text-teal-600 dark:text-teal-300 border-teal-500/30';
            default:
                return 'bg-slate-500/20 text-slate-600 dark:text-slate-300 border-slate-500/30';
        }
    };

    // Helper: Transport Time Badge Style
    const getTransportTimeBadgeStyle = (mode?: string) => {
        switch (mode) {
            case 'Flight':
                return 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 border-emerald-500/30';
            case 'Ferry':
            case 'Cruise':
                return 'bg-sky-500/20 text-sky-800 dark:text-sky-200 border-sky-500/30';
            case 'Train':
                return 'bg-amber-500/20 text-amber-800 dark:text-amber-200 border-amber-500/30';
            case 'Car Rental':
            case 'Personal Car':
                return 'bg-indigo-500/20 text-indigo-800 dark:text-indigo-200 border-indigo-500/30';
            case 'Bus':
                return 'bg-teal-500/20 text-teal-800 dark:text-teal-200 border-teal-500/30';
            default:
                return 'bg-slate-500/20 text-slate-800 dark:text-slate-200 border-slate-500/30';
        }
    };

    // Helper: Activity Card Styling based on Type (Liquid Glass Tinted)
    const getActivityGlassStyle = (type?: string) => {
        switch (type) {
            case 'Reservation':
            case 'Dining':
                return 'wg-glass-card-dining text-emerald-950 dark:text-emerald-100 hover:border-emerald-400';
            case 'Tour':
                return 'wg-glass-card-tour text-purple-950 dark:text-purple-100 hover:border-purple-400';
            case 'Sightseeing':
                return 'wg-glass-card-sightseeing text-sky-950 dark:text-sky-100 hover:border-sky-400';
            case 'Museum':
                return 'wg-glass-card-museum text-indigo-950 dark:text-indigo-100 hover:border-indigo-400';
            case 'Outdoor':
                return 'wg-glass-card-outdoor text-teal-950 dark:text-teal-100 hover:border-teal-400';
            case 'Entertainment':
                return 'wg-glass-card-entertainment text-pink-950 dark:text-pink-100 hover:border-pink-400';
            case 'Shopping':
                return 'wg-glass-card-shopping text-amber-950 dark:text-amber-100 hover:border-amber-400';
            case 'Wellness':
                return 'wg-glass-card-wellness text-cyan-950 dark:text-cyan-100 hover:border-cyan-400';
            case 'Nightlife':
                return 'wg-glass-card-nightlife text-violet-950 dark:text-violet-100 hover:border-violet-400';
            case 'Activity':
            default:
                return 'wg-glass-card-activity text-rose-950 dark:text-rose-100 hover:border-rose-400';
        }
    };

    // Helper: Activity Icon Container Avatar Style
    const getActivityIconContainerStyle = (type?: string) => {
        switch (type) {
            case 'Reservation':
            case 'Dining':
                return 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30';
            case 'Tour':
                return 'bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-500/30';
            case 'Sightseeing':
                return 'bg-sky-500/20 text-sky-700 dark:text-sky-300 border-sky-500/30';
            case 'Museum':
                return 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border-indigo-500/30';
            case 'Outdoor':
                return 'bg-teal-500/20 text-teal-700 dark:text-teal-300 border-teal-500/30';
            case 'Entertainment':
                return 'bg-pink-500/20 text-pink-700 dark:text-pink-300 border-pink-500/30';
            case 'Shopping':
                return 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30';
            case 'Wellness':
                return 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border-cyan-500/30';
            case 'Nightlife':
                return 'bg-violet-500/20 text-violet-700 dark:text-violet-300 border-violet-500/30';
            case 'Activity':
            default:
                return 'bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/30';
        }
    };

    // Helper: Activity Category Icon
    const getActivityIcon = (type?: string) => {
        switch (type) {
            case 'Reservation':
            case 'Dining':
                return <ForkKnife className="w-3.5 h-3.5 shrink-0" weight="duotone" />;
            case 'Tour':
                return <Compass className="w-3.5 h-3.5 shrink-0" weight="duotone" />;
            case 'Sightseeing':
                return <Camera className="w-3.5 h-3.5 shrink-0" weight="duotone" />;
            case 'Museum':
                return <Buildings className="w-3.5 h-3.5 shrink-0" weight="duotone" />;
            case 'Outdoor':
                return <Mountains className="w-3.5 h-3.5 shrink-0" weight="duotone" />;
            case 'Entertainment':
                return <FilmSlate className="w-3.5 h-3.5 shrink-0" weight="duotone" />;
            case 'Shopping':
                return <ShoppingBag className="w-3.5 h-3.5 shrink-0" weight="duotone" />;
            case 'Wellness':
                return <Sparkle className="w-3.5 h-3.5 shrink-0" weight="duotone" />;
            case 'Nightlife':
                return <Wine className="w-3.5 h-3.5 shrink-0" weight="duotone" />;
            case 'Activity':
            default:
                return <Ticket className="w-3.5 h-3.5 shrink-0" weight="duotone" />;
        }
    };

    // Helper: Accommodation Icon
    const getAccommodationIcon = (type?: string) => {
        switch (type) {
            case 'Hotel':
            case 'Resort': return <Buildings className="w-4 h-4 shrink-0 text-sky-600 dark:text-sky-400" weight="duotone" />;
            case 'Airbnb':
            case 'Villa':
            case 'Apartment': return <House className="w-4 h-4 shrink-0 text-sky-600 dark:text-sky-400" weight="duotone" />;
            default: return <Bed className="w-4 h-4 shrink-0 text-sky-600 dark:text-sky-400" weight="duotone" />;
        }
    };

    // =========================================================================
    // Multi-Day Accommodation Spanning Logic for Bento Canvas
    // =========================================================================
    const { accommodationSpans, accommodationGaps } = useMemo(() => {
        if (!tripDates || tripDates.length === 0) {
            return { accommodationSpans: [], accommodationGaps: [] };
        }

        const stays = (trip.accommodations || []).filter(a => Boolean(a.checkInDate));
        // Sort by check-in date
        stays.sort((a, b) => (a.checkInDate || '').localeCompare(b.checkInDate || ''));

        const spans: AccommodationSpan[] = [];
        const coveredDayIndices = new Set<number>();

        stays.forEach(stay => {
            const inDate = stay.checkInDate;
            const outDate = stay.checkOutDate || stay.checkInDate;

            // Find matching index in tripDates
            let startIdx = tripDates.findIndex(d => d === inDate);
            if (startIdx === -1) {
                if (inDate < tripDates[0]) startIdx = 0;
                else return; // Outside trip window
            }

            let endIdx = tripDates.findIndex(d => d === outDate);
            if (endIdx === -1) {
                if (outDate > tripDates[tripDates.length - 1]) endIdx = tripDates.length;
                else endIdx = startIdx + 1;
            }

            // In travel planning, check-out date is departure morning.
            // So if checking in Day 1 and checking out Day 7, the stay covers Day 1 through Day 6 nights.
            // If check-in and check-out are on the same day, cover that 1 day.
            const spanEndDayIndex = endIdx > startIdx ? endIdx - 1 : startIdx;

            for (let i = startIdx; i <= spanEndDayIndex; i++) {
                coveredDayIndices.add(i);
            }

            // In CSS Grid: Row 1 is Header. Row 2 is Day 0.
            // gridRowStart = startIdx + 2
            // gridRowEnd = Math.max(startIdx + 1, endIdx) + 2
            const gridRowStart = startIdx + 2;
            const gridRowEnd = Math.max(startIdx + 1, endIdx) + 2;

            const nights = Math.max(1, spanEndDayIndex - startIdx + 1);

            spans.push({
                accommodation: stay,
                startDayIndex: startIdx,
                endDayIndex: spanEndDayIndex,
                totalNights: nights,
                gridRowStart,
                gridRowEnd
            });
        });

        // Compute Gaps (days with no accommodation booked)
        const gaps: AccommodationGap[] = [];
        let gapStart: number | null = null;

        for (let i = 0; i < tripDates.length; i++) {
            if (!coveredDayIndices.has(i)) {
                if (gapStart === null) gapStart = i;
            } else {
                if (gapStart !== null) {
                    gaps.push({
                        startDayIndex: gapStart,
                        endDayIndex: i - 1,
                        gridRowStart: gapStart + 2,
                        gridRowEnd: i + 2
                    });
                    gapStart = null;
                }
            }
        }

        if (gapStart !== null) {
            gaps.push({
                startDayIndex: gapStart,
                endDayIndex: tripDates.length - 1,
                gridRowStart: gapStart + 2,
                gridRowEnd: tripDates.length + 2
            });
        }

        return { accommodationSpans: spans, accommodationGaps: gaps };
    }, [tripDates, trip.accommodations]);

    if (!tripDates || tripDates.length === 0) {
        return (
            <GlassPanel className="wg-glass-card rounded-[28px] p-8 text-center" overrides={{ borderRadius: 28 }}>
                <EmptyState 
                    title="No Dates Configured" 
                    description="Set your trip start and end dates to activate the Bento Canvas." 
                />
            </GlassPanel>
        );
    }

    return (
        <div className="space-y-6">

            {/* Top Toolbar & Summary Header */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-white/40 dark:bg-dark-card/40 backdrop-blur-md p-4 rounded-3xl border border-black/10 dark:border-white/10 shadow-xs">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center shrink-0 border border-primary-500/20">
                        <SquaresFour className="w-5 h-5" weight="duotone" />
                    </div>
                    <div>
                        <h2 className="text-base sm:text-lg font-black text-light-text dark:text-dark-text tracking-tight flex items-center gap-2">
                            <span>Trip Canvas</span>
                            <span className="px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-black/5 dark:bg-white/5 text-light-text-secondary">
                                {tripDates.length} Days
                            </span>
                        </h2>
                        <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary font-medium">
                            Comprehensive bento itinerary matrix across transport, accommodation & daily activities
                        </p>
                    </div>
                </div>

                {/* Mobile View Toggle */}
                <div className="flex items-center gap-2">
                    <div className="md:hidden flex items-center bg-black/5 dark:bg-white/5 p-1 rounded-2xl border border-black/10 dark:border-white/10">
                        <button
                            type="button"
                            onClick={() => setMobileViewMode('day')}
                            className={`px-3 py-1.5 rounded-xl text-2xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                                mobileViewMode === 'day'
                                ? 'bg-white dark:bg-dark-card text-primary-600 dark:text-primary-400 shadow-sm'
                                : 'text-light-text-secondary dark:text-dark-text-secondary'
                            }`}
                        >
                            Day View
                        </button>
                        <button
                            type="button"
                            onClick={() => setMobileViewMode('canvas')}
                            className={`px-3 py-1.5 rounded-xl text-2xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                                mobileViewMode === 'canvas'
                                ? 'bg-white dark:bg-dark-card text-primary-600 dark:text-primary-400 shadow-sm'
                                : 'text-light-text-secondary dark:text-dark-text-secondary'
                            }`}
                        >
                            Full Canvas
                        </button>
                    </div>

                    {/* Quick Add Actions */}
                    <div className="hidden sm:flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => onEditTransport(undefined, tripDates[0])}
                            className="h-9 px-3 rounded-xl text-2xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-xs"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Transport</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => onEditAccommodation(undefined, tripDates[0])}
                            className="h-9 px-3 rounded-xl text-2xs font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-xs"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Stay</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => onEditActivity(tripDates[0])}
                            className="h-9 px-3 rounded-xl text-2xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-xs"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Activity</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Unscheduled Logistics Drawer (if approximate items exist) */}
            {totalFloatingCount > 0 && (
                <GlassPanel 
                    className="wg-glass-card rounded-[28px] overflow-hidden p-4 space-y-3 border border-amber-500/30"
                    overrides={{ borderRadius: 28 }}
                    padding="0px"
                >
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-400 flex items-center gap-1.5">
                                <span>Flexible & Unscheduled Logistics</span>
                                <span className="px-2 py-0.5 rounded-full text-2xs bg-amber-500/20 font-mono font-bold">
                                    {totalFloatingCount}
                                </span>
                            </h4>
                        </div>
                        <button 
                            type="button"
                            onClick={() => setShowFloatingLane(!showFloatingLane)}
                            className="text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                        >
                            {showFloatingLane ? 'Hide Drawer' : 'Show Details'}
                        </button>
                    </div>

                    {showFloatingLane && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pt-2">
                            {floatingTransports.map(t => (
                                <div
                                    key={t.id}
                                    onClick={() => onEditTransport([t])}
                                    className="p-3 rounded-2xl bg-white/70 dark:bg-dark-card/70 border border-black/10 dark:border-white/10 hover:border-primary-500/50 cursor-pointer space-y-1"
                                >
                                    <span className="text-2xs font-bold text-blue-600 dark:text-blue-400 uppercase">{t.mode}</span>
                                    <p className="text-xs font-bold truncate">{t.origin} → {t.destination || 'Flexible'}</p>
                                    <p className="text-2xs text-light-text-secondary">Flexible Date</p>
                                </div>
                            ))}
                            {floatingActivities.map(act => (
                                <div
                                    key={act.id}
                                    onClick={() => onEditActivity(tripDates[0], act)}
                                    className="p-3 rounded-2xl bg-white/70 dark:bg-dark-card/70 border border-black/10 dark:border-white/10 hover:border-amber-500/50 cursor-pointer space-y-1 relative group"
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="text-2xs font-bold text-amber-600 dark:text-amber-400 uppercase">{act.type}</span>
                                        {onDeleteActivity && (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (window.confirm(`Delete activity "${act.title}"?`)) {
                                                        onDeleteActivity(act.id);
                                                    }
                                                }}
                                                className="opacity-0 group-hover:opacity-100 hover:text-rose-500 p-1 rounded-lg transition-all text-light-text-secondary dark:text-dark-text-secondary hover:bg-rose-500/10 cursor-pointer min-w-[28px] min-h-[28px] flex items-center justify-center"
                                                aria-label={`Delete activity ${act.title}`}
                                                title="Delete activity"
                                            >
                                                <Trash className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                    <p className="text-xs font-bold truncate">{act.title}</p>
                                    <p className="text-2xs text-light-text-secondary">Flexible Date</p>
                                </div>
                            ))}
                        </div>
                    )}
                </GlassPanel>
            )}

            {/* ============================================================== */}
            {/* MOBILE LAYOUT (< 768px): Single Day View with Bento Boxes      */}
            {/* ============================================================== */}
            <div className={`md:hidden ${mobileViewMode === 'day' ? 'block' : 'hidden'} space-y-4`}>
                {/* Horizontal Date Switcher Bar */}
                <div className="flex items-center gap-2 overflow-x-auto pb-2 custom-scrollbar">
                    {tripDates.map((dateStr, idx) => {
                        const dateObj = new Date(dateStr);
                        const isSelected = selectedDayIndex === idx;
                        const dayTransports = getTransportScheduleEventsForDate(trip.transports, dateStr);
                        const dayActivities = (trip.activities || []).filter(a => a.date === dateStr);
                        const totalEvents = dayTransports.length + dayActivities.length;

                        return (
                            <button
                                key={dateStr}
                                type="button"
                                onClick={() => setSelectedDayIndex(idx)}
                                className={`px-3.5 py-2.5 rounded-2xl flex flex-col items-center justify-center shrink-0 min-w-[72px] min-h-[58px] transition-all border cursor-pointer ${
                                    isSelected
                                    ? 'bg-primary-500 text-white border-primary-500 shadow-md shadow-primary-500/20 scale-102'
                                    : 'bg-white/80 dark:bg-dark-card/80 border-black/10 dark:border-white/10 text-light-text dark:text-dark-text'
                                }`}
                            >
                                <span className="text-2xs font-bold uppercase tracking-widest opacity-80">
                                    {formatDate(dateObj, 'month-short', settings)}
                                </span>
                                <span className="text-base font-black leading-none my-0.5">
                                    {dateObj.getUTCDate()}
                                </span>
                                <span className="text-2xs font-bold opacity-75">
                                    Day {idx + 1} ({totalEvents})
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* Selected Day Bento Showcase */}
                {(() => {
                    const activeDateStr = tripDates[selectedDayIndex] || tripDates[0];
                    if (!activeDateStr) return null;
                    const dateObj = new Date(activeDateStr);
                    const location = getLocationForDate(activeDateStr);
                    const dayTransports = getTransportScheduleEventsForDate(trip.transports, activeDateStr).sort((a, b) => {
                        const utcA = getTransportUtcTimestamp(a, a.isDropoff);
                        const utcB = getTransportUtcTimestamp(b, b.isDropoff);
                        if (utcA !== utcB) return utcA - utcB;
                        const timeA = (a.isDropoff ? a.arrivalTime : a.departureTime) || '00:00';
                        const timeB = (b.isDropoff ? b.arrivalTime : b.departureTime) || '00:00';
                        return timeA.localeCompare(timeB);
                    });
                    const dayActivities = (trip.activities || [])
                        .filter(a => a.date === activeDateStr)
                        .sort((a, b) => (a.time || '00:00').localeCompare(b.time || '00:00'));
                    const activeStay = trip.accommodations?.find(a => activeDateStr >= (a.checkInDate || '') && activeDateStr <= (a.checkOutDate || a.checkInDate || ''));

                    return (
                        <div className="space-y-4">
                            {/* Day Header Banner */}
                            <GlassPanel className="wg-glass-card rounded-3xl p-4 flex items-center justify-between" overrides={{ borderRadius: 24 }}>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="px-2.5 py-0.5 rounded-full text-2xs font-black uppercase tracking-wider bg-primary-500 text-white">
                                            Day {selectedDayIndex + 1}
                                        </span>
                                        <h3 className="text-sm font-bold text-light-text dark:text-dark-text">
                                            {formatDate(dateObj, 'weekday-long', settings)}
                                        </h3>
                                    </div>
                                    {location && (
                                        <div className="inline-flex items-center gap-1 text-2xs font-bold text-primary-600 dark:text-primary-400 mt-1">
                                            <MapPin className="w-3.5 h-3.5" weight="duotone" />
                                            <span>{location.name}</span>
                                        </div>
                                    )}
                                </div>
                            </GlassPanel>

                            {/* Bento Section 1: Transport */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between px-1">
                                    <span className="text-xs font-bold uppercase tracking-wider text-light-text-secondary flex items-center gap-1.5">
                                        <AirplaneTilt className="w-4 h-4 text-blue-500" weight="duotone" /> Transport
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => onEditTransport(undefined, activeDateStr)}
                                        className="text-2xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                                    >
                                        + Add Transport
                                    </button>
                                </div>
                                {dayTransports.length === 0 ? (
                                    <GlassPanel 
                                        onClick={() => onEditTransport(undefined, activeDateStr)}
                                        className="wg-glass-card p-4 rounded-2xl border border-dashed border-black/10 dark:border-white/10 text-center text-xs text-light-text-secondary cursor-pointer hover:border-blue-500/50"
                                        overrides={{ borderRadius: 18 }}
                                        padding="14px"
                                    >
                                        No transport scheduled. Tap to add.
                                    </GlassPanel>
                                ) : (
                                    <div className="space-y-2">
                                        {dayTransports.map((t, idx) => (
                                            <GlassPanel
                                                key={`${t.id}-${idx}`}
                                                onClick={() => onEditTransport([t], activeDateStr)}
                                                className={`wg-glass-card shadow-sm border transition-all cursor-pointer space-y-1.5 ${getTransportGlassStyle(t.mode)}`}
                                                overrides={{ borderRadius: 18 }}
                                                padding="12px"
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 shadow-xs border ${getTransportIconContainerStyle(t.mode)}`}>
                                                            {getTransportIcon(t.mode)}
                                                        </div>
                                                        <h4 className="font-bold text-sm leading-tight text-light-text dark:text-dark-text truncate">
                                                            {getTransportScheduleTitle(t, t.isDropoff)}
                                                        </h4>
                                                    </div>
                                                    <span className={`font-mono text-2xs font-bold px-2 py-0.5 rounded-full shrink-0 border ${getTransportTimeBadgeStyle(t.mode)}`}>
                                                        {t.isDropoff ? t.arrivalTime || '00:00' : t.departureTime || '00:00'}
                                                    </span>
                                                </div>
                                                <div className="flex items-center justify-between text-2xs text-light-text-secondary pt-1 border-t border-black/5 dark:border-white/5">
                                                    <span className="truncate">{getTransportScheduleLocation(t, t.isDropoff)}</span>
                                                    {t.cost ? <span className="font-mono font-bold text-light-text dark:text-dark-text">{formatCurrency(t.cost)}</span> : null}
                                                </div>
                                            </GlassPanel>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Bento Section 2: Accommodation */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between px-1">
                                    <span className="text-xs font-bold uppercase tracking-wider text-light-text-secondary flex items-center gap-1.5">
                                        <Bed className="w-4 h-4 text-sky-500" weight="duotone" /> Accommodation
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => onEditAccommodation(undefined, activeDateStr)}
                                        className="text-2xs font-bold text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
                                    >
                                        + Add Stay
                                    </button>
                                </div>
                                {activeStay ? (
                                    <GlassPanel
                                        onClick={() => onEditAccommodation(activeStay, activeDateStr)}
                                        className="wg-glass-card shadow-xs rounded-2xl border border-sky-300/40 dark:border-sky-700/30 bg-sky-50/70 dark:bg-sky-950/30 text-light-text dark:text-dark-text cursor-pointer space-y-2"
                                        overrides={{ borderRadius: 20 }}
                                        padding="14px"
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-xs bg-sky-500/20 text-sky-600 dark:text-sky-300 border border-sky-500/30">
                                                    {getAccommodationIcon(activeStay.type)}
                                                </div>
                                                <div className="min-w-0">
                                                    <h4 className="font-black text-sm text-light-text dark:text-dark-text truncate">
                                                        {activeStay.name}
                                                    </h4>
                                                    {activeStay.address && (
                                                        <p className="text-2xs text-light-text-secondary mt-0.5 flex items-center gap-1 truncate">
                                                            <MapPin className="w-3 h-3 text-sky-500 shrink-0" />
                                                            <span className="truncate">{activeStay.address}</span>
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                            {activeStay.cost ? (
                                                <span className="font-mono text-xs font-bold text-sky-700 dark:text-sky-300 shrink-0">
                                                    {formatCurrency(activeStay.cost)}
                                                </span>
                                            ) : null}
                                        </div>
                                    </GlassPanel>
                                ) : (
                                    <GlassPanel 
                                        onClick={() => onEditAccommodation(undefined, activeDateStr)}
                                        className="wg-glass-card p-4 rounded-2xl border border-dashed border-sky-300/40 dark:border-sky-700/40 text-center text-xs text-light-text-secondary cursor-pointer hover:border-sky-500/50"
                                        overrides={{ borderRadius: 18 }}
                                        padding="14px"
                                    >
                                        No stay booked for tonight. Tap to book stay.
                                    </GlassPanel>
                                )}
                            </div>

                            {/* Bento Section 3: Activities */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between px-1">
                                    <span className="text-xs font-bold uppercase tracking-wider text-light-text-secondary flex items-center gap-1.5">
                                        <Ticket className="w-4 h-4 text-amber-500" weight="duotone" /> Activities
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => onEditActivity(activeDateStr)}
                                        className="text-2xs font-bold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                                    >
                                        + Add Activity
                                    </button>
                                </div>
                                {dayActivities.length === 0 ? (
                                    <GlassPanel 
                                        onClick={() => onEditActivity(activeDateStr)}
                                        className="wg-glass-card p-4 rounded-2xl border border-dashed border-black/10 dark:border-white/10 text-center text-xs text-light-text-secondary cursor-pointer hover:border-amber-500/50"
                                        overrides={{ borderRadius: 18 }}
                                        padding="14px"
                                    >
                                        No activities planned. Tap to add.
                                    </GlassPanel>
                                ) : (
                                    <div className="space-y-2">
                                        {dayActivities.map(act => (
                                            <GlassPanel
                                                key={act.id}
                                                onClick={() => onEditActivity(activeDateStr, act)}
                                                className={`wg-glass-card shadow-xs border transition-all cursor-pointer space-y-1 ${getActivityGlassStyle(act.type)}`}
                                                overrides={{ borderRadius: 18 }}
                                                padding="12px"
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 shadow-xs border ${getActivityIconContainerStyle(act.type)}`}>
                                                            {getActivityIcon(act.type)}
                                                        </div>
                                                        <h4 className="font-bold text-sm leading-tight truncate">
                                                            {act.title}
                                                        </h4>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        {act.time && (
                                                            <span className="font-mono text-2xs font-bold opacity-80 px-1.5 py-0.5 rounded-md bg-black/5 dark:bg-white/10">
                                                                {act.time}
                                                            </span>
                                                        )}
                                                        {onDeleteActivity && (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (window.confirm(`Delete activity "${act.title}"?`)) {
                                                                        onDeleteActivity(act.id);
                                                                    }
                                                                }}
                                                                className="text-light-text-secondary dark:text-dark-text-secondary hover:text-rose-500 hover:bg-rose-500/10 p-1 rounded-lg transition-colors cursor-pointer min-w-[28px] min-h-[28px] flex items-center justify-center"
                                                                aria-label={`Delete activity ${act.title}`}
                                                                title="Delete activity"
                                                            >
                                                                <Trash className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                {act.location && (
                                                    <p className="text-2xs opacity-80 flex items-center gap-1 truncate pt-1 border-t border-black/5 dark:border-white/5">
                                                        <MapPin className="w-3 h-3 shrink-0" />
                                                        <span className="truncate">{act.location}</span>
                                                    </p>
                                                )}
                                            </GlassPanel>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })()}
            </div>

            {/* ============================================================== */}
            {/* DESKTOP & FULL CANVAS GRID: Bento Matrix Canvas                */}
            {/* ============================================================== */}
            <div className={`overflow-x-auto pb-12 custom-scrollbar ${mobileViewMode === 'canvas' ? 'block' : 'hidden md:block'}`}>
                <div 
                    className="min-w-[980px] grid gap-3 items-stretch font-sans"
                    style={{
                        gridTemplateColumns: 'minmax(200px, 230px) minmax(260px, 1fr) minmax(280px, 1.25fr) minmax(270px, 1.1fr)',
                        gridTemplateRows: `auto repeat(${tripDates.length}, minmax(110px, auto))`
                    }}
                >
                    {/* ========================================================== */}
                    {/* STICKY HEADER ROW (Grid Row 1)                             */}
                    {/* ========================================================== */}
                    
                    {/* Col 1 Header: Day */}
                    <GlassPanel 
                        className="sticky top-2 z-20 wg-glass-card shadow-sm flex items-center justify-between" 
                        overrides={{ borderRadius: 20 }}
                        padding="14px"
                    >
                        <div className="flex items-center gap-2">
                            <CalendarBlank className="w-4 h-4 text-primary-500" weight="duotone" />
                            <span className="text-xs font-black uppercase tracking-wider text-light-text dark:text-dark-text">Day</span>
                        </div>
                        <span className="text-2xs font-mono font-bold text-light-text-secondary bg-black/5 dark:bg-white/5 px-2 py-0.5 rounded-full">
                            {tripDates.length}
                        </span>
                    </GlassPanel>

                    {/* Col 2 Header: Transport */}
                    <GlassPanel 
                        className="sticky top-2 z-20 wg-glass-card shadow-sm flex items-center justify-between" 
                        overrides={{ borderRadius: 20 }}
                        padding="14px"
                    >
                        <div className="flex items-center gap-2">
                            <AirplaneTilt className="w-4 h-4 text-blue-500" weight="duotone" />
                            <span className="text-xs font-black uppercase tracking-wider text-light-text dark:text-dark-text">Transport</span>
                        </div>
                        <span className="text-2xs font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">
                            {trip.transports?.length || 0}
                        </span>
                    </GlassPanel>

                    {/* Col 3 Header: Accommodation */}
                    <GlassPanel 
                        className="sticky top-2 z-20 wg-glass-card shadow-sm flex items-center justify-between" 
                        overrides={{ borderRadius: 20 }}
                        padding="14px"
                    >
                        <div className="flex items-center gap-2">
                            <Bed className="w-4 h-4 text-sky-500" weight="duotone" />
                            <span className="text-xs font-black uppercase tracking-wider text-light-text dark:text-dark-text">Accommodation</span>
                        </div>
                        <span className="text-2xs font-mono font-bold text-sky-600 dark:text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-full">
                            {trip.accommodations?.length || 0}
                        </span>
                    </GlassPanel>

                    {/* Col 4 Header: Activities */}
                    <GlassPanel 
                        className="sticky top-2 z-20 wg-glass-card shadow-sm flex items-center justify-between" 
                        overrides={{ borderRadius: 20 }}
                        padding="14px"
                    >
                        <div className="flex items-center gap-2">
                            <Ticket className="w-4 h-4 text-amber-500" weight="duotone" />
                            <span className="text-xs font-black uppercase tracking-wider text-light-text dark:text-dark-text">Activities</span>
                        </div>
                        <span className="text-2xs font-mono font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">
                            {trip.activities?.length || 0}
                        </span>
                    </GlassPanel>

                    {/* ========================================================== */}
                    {/* DAILY ROWS: Day Column (Col 1), Transport (Col 2), Activities (Col 4) */}
                    {/* ========================================================== */}
                    {tripDates.map((dateStr, dIdx) => {
                        const dateObj = new Date(dateStr);
                        const isToday = new Date().toDateString() === dateObj.toDateString();
                        const location = getLocationForDate(dateStr);
                        const dayTransports = getTransportScheduleEventsForDate(trip.transports, dateStr).sort((a, b) => {
                            const utcA = getTransportUtcTimestamp(a, a.isDropoff);
                            const utcB = getTransportUtcTimestamp(b, b.isDropoff);
                            if (utcA !== utcB) return utcA - utcB;
                            const timeA = (a.isDropoff ? a.arrivalTime : a.departureTime) || '00:00';
                            const timeB = (b.isDropoff ? b.arrivalTime : b.departureTime) || '00:00';
                            return timeA.localeCompare(timeB);
                        });
                        const dayActivities = (trip.activities || [])
                            .filter(a => a.date === dateStr)
                            .sort((a, b) => (a.time || '00:00').localeCompare(b.time || '00:00'));
                        const rowIndex = dIdx + 2;

                        return (
                            <React.Fragment key={dateStr}>
                                
                                {/* ---------------------------------------------------- */}
                                {/* COL 1: DAY CARD                                      */}
                                {/* ---------------------------------------------------- */}
                                <div style={{ gridColumn: 1, gridRow: rowIndex }} className="h-full">
                                    <GlassPanel 
                                        className={`wg-glass-card shadow-xs h-full flex flex-col justify-between transition-all ${
                                            isToday
                                            ? 'ring-2 ring-primary-500/50 border-primary-500/40 bg-primary-500/10'
                                            : 'border-black/10 dark:border-white/10'
                                        }`}
                                        overrides={{ borderRadius: 20 }}
                                        padding="14px"
                                    >
                                        <div className="space-y-1.5">
                                            <div className="flex items-center justify-between gap-1">
                                                <span className={`px-2 py-0.5 rounded-lg text-2xs font-black uppercase tracking-wider ${
                                                    isToday ? 'bg-primary-500 text-white shadow-xs' : 'bg-black/5 dark:bg-white/5 text-light-text-secondary dark:text-dark-text-secondary'
                                                }`}>
                                                    Day {dIdx + 1}
                                                </span>
                                                {isToday && (
                                                    <span className="text-2xs font-bold text-primary-500 uppercase tracking-widest flex items-center gap-1">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse" />
                                                        Today
                                                    </span>
                                                )}
                                            </div>

                                            <h4 className="font-black text-sm text-light-text dark:text-dark-text tracking-tight leading-snug">
                                                {formatDate(dateObj, 'weekday-long', settings)}
                                            </h4>
                                        </div>

                                        {location && (
                                            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider text-primary-600 dark:text-primary-400 bg-primary-500/10 border border-primary-500/20 truncate mt-2 self-start max-w-full">
                                                <MapPin className="w-3 h-3 shrink-0" weight="duotone" />
                                                <span className="truncate">{location.name}</span>
                                            </div>
                                        )}
                                    </GlassPanel>
                                </div>

                                {/* ---------------------------------------------------- */}
                                {/* COL 2: TRANSPORT CELL                                */}
                                {/* ---------------------------------------------------- */}
                                <div 
                                    style={{ gridColumn: 2, gridRow: rowIndex }}
                                    className="h-full"
                                >
                                    {dayTransports.length === 0 ? (
                                        <GlassPanel 
                                            onClick={() => onEditTransport(undefined, dateStr)}
                                            className="wg-glass-card wg-glass-card-dashed h-full flex flex-col items-center justify-center text-light-text-secondary hover:border-blue-500/50 hover:bg-blue-500/5 transition-all cursor-pointer group"
                                            overrides={{ borderRadius: 20 }}
                                            padding="14px"
                                        >
                                            <Plus className="w-4 h-4 opacity-40 group-hover:opacity-100 group-hover:scale-110 transition-all text-blue-500" />
                                            <span className="text-2xs font-bold uppercase tracking-wider opacity-40 group-hover:opacity-100 mt-1">
                                                Add Transport
                                            </span>
                                        </GlassPanel>
                                    ) : (
                                        <div className="h-full flex flex-col justify-between gap-2">
                                            {dayTransports.map((t, tIdx) => (
                                                <GlassPanel
                                                    key={`${t.id}-${tIdx}`}
                                                    onClick={() => onEditTransport([t], dateStr)}
                                                    className={`wg-glass-card h-full flex flex-col justify-between shadow-sm transition-all cursor-pointer group hover:scale-[1.01] ${getTransportGlassStyle(t.mode)}`}
                                                    overrides={{ borderRadius: 20 }}
                                                    padding="14px"
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 shadow-xs border ${getTransportIconContainerStyle(t.mode)}`}>
                                                                {getTransportIcon(t.mode)}
                                                            </div>
                                                            <h5 className="font-black text-xs sm:text-sm text-light-text dark:text-dark-text leading-tight truncate">
                                                                {getTransportScheduleTitle(t, t.isDropoff)}
                                                            </h5>
                                                        </div>
                                                        <span className={`font-mono text-2xs font-bold px-2 py-0.5 rounded-full shrink-0 border ${getTransportTimeBadgeStyle(t.mode)}`}>
                                                            {t.isDropoff ? t.arrivalTime || '00:00' : t.departureTime || '00:00'}
                                                        </span>
                                                    </div>

                                                    <div className="flex items-center justify-between text-2xs text-light-text-secondary pt-1.5 border-t border-black/10 dark:border-white/10 mt-auto">
                                                        <span className="truncate max-w-[170px]" title={getTransportScheduleLocation(t, t.isDropoff)}>
                                                            {getTransportScheduleLocation(t, t.isDropoff)}
                                                        </span>
                                                        {t.cost ? (
                                                            <span className="font-mono font-bold text-light-text dark:text-dark-text">
                                                                {formatCurrency(t.cost)}
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                </GlassPanel>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* ---------------------------------------------------- */}
                                {/* COL 4: ACTIVITIES CELL                               */}
                                {/* ---------------------------------------------------- */}
                                <div 
                                    style={{ gridColumn: 4, gridRow: rowIndex }}
                                    className="h-full"
                                >
                                    {dayActivities.length === 0 ? (
                                        <GlassPanel 
                                            onClick={() => onEditActivity(dateStr)}
                                            className="wg-glass-card wg-glass-card-dashed h-full flex flex-col items-center justify-center text-light-text-secondary hover:border-amber-500/50 hover:bg-amber-500/5 transition-all cursor-pointer group"
                                            overrides={{ borderRadius: 20 }}
                                            padding="14px"
                                        >
                                            <Plus className="w-4 h-4 opacity-40 group-hover:opacity-100 group-hover:scale-110 transition-all text-amber-500" />
                                            <span className="text-2xs font-bold uppercase tracking-wider opacity-40 group-hover:opacity-100 mt-1">
                                                Add Activity
                                            </span>
                                        </GlassPanel>
                                    ) : (
                                        <div className="h-full flex flex-col justify-between gap-2">
                                            {dayActivities.map(act => (
                                                <GlassPanel
                                                    key={act.id}
                                                    onClick={() => onEditActivity(dateStr, act)}
                                                    className={`wg-glass-card h-full flex flex-col justify-between shadow-xs transition-all cursor-pointer group hover:scale-[1.01] ${getActivityGlassStyle(act.type)}`}
                                                    overrides={{ borderRadius: 20 }}
                                                    padding="14px"
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 shadow-xs border ${getActivityIconContainerStyle(act.type)}`}>
                                                                {getActivityIcon(act.type)}
                                                            </div>
                                                            <h5 className="font-black text-xs sm:text-sm leading-tight truncate text-light-text dark:text-dark-text">
                                                                {act.title}
                                                            </h5>
                                                        </div>
                                                        <div className="flex items-center gap-1 shrink-0">
                                                            {act.time && (
                                                                <span className="font-mono text-2xs font-bold opacity-80 shrink-0 px-1.5 py-0.5 rounded-md bg-black/5 dark:bg-white/10">
                                                                    {act.time}
                                                                </span>
                                                            )}
                                                            {onDeleteActivity && (
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        if (window.confirm(`Delete activity "${act.title}"?`)) {
                                                                            onDeleteActivity(act.id);
                                                                        }
                                                                    }}
                                                                    className="opacity-0 group-hover:opacity-100 hover:text-rose-500 p-1 rounded-lg transition-all text-light-text-secondary dark:text-dark-text-secondary hover:bg-rose-500/10 cursor-pointer min-w-[26px] min-h-[26px] flex items-center justify-center"
                                                                    aria-label={`Delete activity ${act.title}`}
                                                                    title="Delete activity"
                                                                >
                                                                    <Trash className="w-3.5 h-3.5" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center justify-between text-2xs opacity-80 pt-1.5 border-t border-black/10 dark:border-white/10 mt-auto">
                                                        <span className="truncate max-w-[170px]" title={act.location}>
                                                            {act.location || 'Local Landmark'}
                                                        </span>
                                                        {act.cost ? (
                                                            <span className="font-mono font-bold">
                                                                {formatCurrency(act.cost)}
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                </GlassPanel>
                                            ))}
                                        </div>
                                    )}
                                </div>

                            </React.Fragment>
                        );
                    })}

                    {/* ========================================================== */}
                    {/* COL 3: ACCOMMODATION SPANS & GAPS                          */}
                    {/* ========================================================== */}
                    
                    {/* 1. Spanning Accommodation Cards */}
                    {accommodationSpans.map(span => {
                        const stay = span.accommodation;
                        return (
                            <div
                                key={stay.id}
                                style={{
                                    gridColumn: 3,
                                    gridRow: `${span.gridRowStart} / ${span.gridRowEnd}`
                                }}
                                className="h-full"
                            >
                                <GlassPanel
                                    onClick={() => onEditAccommodation(stay)}
                                    className="wg-glass-card wg-glass-card-sightseeing shadow-sm hover:shadow-md transition-all cursor-pointer h-full flex flex-col justify-between group hover:border-sky-400"
                                    overrides={{ borderRadius: 24 }}
                                    padding="16px"
                                >
                                    <div className="space-y-2">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-xs bg-sky-500/20 text-sky-600 dark:text-sky-300 border border-sky-500/30">
                                                    {getAccommodationIcon(stay.type)}
                                                </div>
                                                <div className="min-w-0">
                                                    <h4 className="font-black text-sm sm:text-base text-light-text dark:text-dark-text tracking-tight truncate group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                                                        {stay.name}
                                                    </h4>
                                                    {stay.address && (
                                                        <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5 flex items-center gap-1 truncate">
                                                            <MapPin className="w-3 h-3 text-sky-500 shrink-0" weight="duotone" />
                                                            <span className="truncate">{stay.address}</span>
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-1.5 shrink-0">
                                                <span className="px-2 py-0.5 rounded-full text-2xs font-mono font-bold bg-sky-500/20 text-sky-800 dark:text-sky-200">
                                                    {span.totalNights} {span.totalNights === 1 ? 'Night' : 'Nights'}
                                                </span>
                                                {stay.cost ? (
                                                    <span className="font-mono text-2xs font-black text-sky-800 dark:text-sky-200 px-2 py-0.5 rounded-full bg-sky-500/20">
                                                        {formatCurrency(stay.cost)}
                                                    </span>
                                                ) : null}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-4 pt-3 border-t border-sky-500/15 flex flex-wrap items-center justify-between gap-2 text-2xs text-light-text-secondary">
                                        <span>
                                            In: <strong className="text-light-text dark:text-dark-text">{formatDate(new Date(stay.checkInDate), 'short', settings)}</strong> {stay.checkInTime ? `(${stay.checkInTime})` : ''}
                                        </span>
                                        <span>
                                            Out: <strong className="text-light-text dark:text-dark-text">{stay.checkOutDate ? formatDate(new Date(stay.checkOutDate), 'short', settings) : ''}</strong> {stay.checkOutTime ? `(${stay.checkOutTime})` : ''}
                                        </span>
                                    </div>
                                </GlassPanel>
                            </div>
                        );
                    })}

                    {/* 2. Gaps (Days with no accommodation) */}
                    {accommodationGaps.map((gap, gIdx) => {
                        const gapDays = gap.endDayIndex - gap.startDayIndex + 1;
                        const defaultDate = tripDates[gap.startDayIndex];
                        return (
                            <div
                                key={`gap-${gIdx}`}
                                style={{
                                    gridColumn: 3,
                                    gridRow: `${gap.gridRowStart} / ${gap.gridRowEnd}`
                                }}
                                className="h-full"
                            >
                                <GlassPanel
                                    onClick={() => onEditAccommodation(undefined, defaultDate)}
                                    className="wg-glass-card wg-glass-card-dashed h-full flex flex-col items-center justify-center text-light-text-secondary hover:border-sky-500/60 hover:bg-sky-500/5 transition-all cursor-pointer group"
                                    overrides={{ borderRadius: 24 }}
                                    padding="16px"
                                >
                                    <Bed className="w-5 h-5 text-sky-500/50 group-hover:text-sky-500 group-hover:scale-110 transition-all" weight="duotone" />
                                    <span className="text-xs font-bold uppercase tracking-wider text-sky-700 dark:text-sky-400 mt-2">
                                        + Book Stay
                                    </span>
                                    <span className="text-2xs text-light-text-secondary opacity-60 mt-0.5">
                                        No stay booked ({gapDays} {gapDays === 1 ? 'day' : 'days'})
                                    </span>
                                </GlassPanel>
                            </div>
                        );
                    })}

                </div>
            </div>

        </div>
    );
};

export default DailyPlannerBoard;
