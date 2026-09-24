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
    Eye
} from '@phosphor-icons/react';
import GlassPanel from './glass/GlassPanel';
import { EmptyState } from './EmptyState';
import { Trip, Transport, Accommodation, Activity, WorkspaceSettings } from '../types';
import { formatDate, formatCurrency } from '../utils/formatters';
import { 
    isCarRentalBooking, 
    getTransportScheduleTitle, 
    getTransportScheduleLocation, 
    getTransportScheduleEventsForDate 
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

    // Helper: Transport Card Styling based on Mode
    const getTransportCardStyle = (mode?: string) => {
        switch (mode) {
            case 'Flight':
                return 'bg-emerald-700/90 hover:bg-emerald-700 text-white border-emerald-500/40 shadow-emerald-950/20';
            case 'Ferry':
            case 'Cruise':
                return 'bg-sky-700/90 hover:bg-sky-700 text-white border-sky-500/40 shadow-sky-950/20';
            case 'Train':
                return 'bg-amber-600/95 hover:bg-amber-600 text-white border-amber-400/40 shadow-amber-950/20';
            case 'Car Rental':
            case 'Personal Car':
                return 'bg-indigo-700/90 hover:bg-indigo-700 text-white border-indigo-500/40 shadow-indigo-950/20';
            case 'Bus':
                return 'bg-teal-700/90 hover:bg-teal-700 text-white border-teal-500/40 shadow-teal-950/20';
            default:
                return 'bg-slate-700/90 hover:bg-slate-700 text-white border-slate-500/40 shadow-slate-950/20';
        }
    };

    // Helper: Activity Card Styling based on Type
    const getActivityCardStyle = (type?: string) => {
        switch (type) {
            case 'Reservation':
                // Light mint / green for dining & reservations
                return 'bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-300/60 dark:border-emerald-700/40 text-emerald-950 dark:text-emerald-100 hover:border-emerald-400';
            case 'Tour':
                // Lilac / purple for tours & excursions
                return 'bg-purple-50/90 dark:bg-purple-950/40 border-purple-300/60 dark:border-purple-700/40 text-purple-950 dark:text-purple-100 hover:border-purple-400';
            case 'Activity':
            default:
                // Soft peach / warm coral for sightseeing & landmarks
                return 'bg-rose-50/90 dark:bg-rose-950/40 border-rose-300/60 dark:border-rose-700/40 text-rose-950 dark:text-rose-100 hover:border-rose-400';
        }
    };

    // Helper: Activity Category Icon
    const getActivityIcon = (type?: string) => {
        switch (type) {
            case 'Reservation': return <ForkKnife className="w-3.5 h-3.5 shrink-0" weight="duotone" />;
            case 'Tour': return <Compass className="w-3.5 h-3.5 shrink-0" weight="duotone" />;
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
                                    className="p-3 rounded-2xl bg-white/70 dark:bg-dark-card/70 border border-black/10 dark:border-white/10 hover:border-amber-500/50 cursor-pointer space-y-1"
                                >
                                    <span className="text-2xs font-bold text-amber-600 dark:text-amber-400 uppercase">{act.type}</span>
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
                    const dayTransports = getTransportScheduleEventsForDate(trip.transports, activeDateStr);
                    const dayActivities = (trip.activities || []).filter(a => a.date === activeDateStr);
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
                                    <p className="text-xs text-light-text-secondary mt-0.5">
                                        {formatDate(dateObj, 'long', settings)}
                                    </p>
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
                                        <AirplaneTilt className="w-4 h-4 text-blue-500" /> Transport
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
                                    <div 
                                        onClick={() => onEditTransport(undefined, activeDateStr)}
                                        className="p-4 rounded-2xl border border-dashed border-black/10 dark:border-white/10 text-center text-xs text-light-text-secondary cursor-pointer hover:border-blue-500/50"
                                    >
                                        No transport scheduled. Tap to add.
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {dayTransports.map((t, idx) => (
                                            <div
                                                key={`${t.id}-${idx}`}
                                                onClick={() => onEditTransport([t], activeDateStr)}
                                                className={`p-3.5 rounded-2xl border transition-all cursor-pointer space-y-1.5 ${getTransportCardStyle(t.mode)}`}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <span className="inline-flex items-center gap-1 text-2xs font-bold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full">
                                                        {getTransportIcon(t.mode)}
                                                        <span>{t.mode}</span>
                                                    </span>
                                                    <span className="font-mono text-2xs font-bold">
                                                        {t.isDropoff ? t.arrivalTime || '00:00' : t.departureTime || '00:00'}
                                                    </span>
                                                </div>
                                                <h4 className="font-black text-sm leading-snug">
                                                    {getTransportScheduleTitle(t, t.isDropoff)}
                                                </h4>
                                                <div className="flex items-center justify-between text-2xs opacity-80 pt-1 border-t border-white/10">
                                                    <span className="truncate">{getTransportScheduleLocation(t, t.isDropoff)}</span>
                                                    {t.cost ? <span className="font-mono font-bold">{formatCurrency(t.cost)}</span> : null}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Bento Section 2: Accommodation */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between px-1">
                                    <span className="text-xs font-bold uppercase tracking-wider text-light-text-secondary flex items-center gap-1.5">
                                        <Bed className="w-4 h-4 text-sky-500" /> Accommodation
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
                                    <div
                                        onClick={() => onEditAccommodation(activeStay, activeDateStr)}
                                        className="p-4 rounded-2xl bg-sky-50/90 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/40 text-light-text dark:text-dark-text cursor-pointer space-y-2 shadow-xs"
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="inline-flex items-center gap-1 text-2xs font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300 bg-sky-500/10 px-2 py-0.5 rounded-full border border-sky-500/20">
                                                {getAccommodationIcon(activeStay.type)}
                                                <span>{activeStay.type || 'Hotel'}</span>
                                            </span>
                                            {activeStay.cost ? (
                                                <span className="font-mono text-xs font-bold text-sky-700 dark:text-sky-300">
                                                    {formatCurrency(activeStay.cost)}
                                                </span>
                                            ) : null}
                                        </div>
                                        <div>
                                            <h4 className="font-black text-sm text-light-text dark:text-dark-text">
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
                                ) : (
                                    <div 
                                        onClick={() => onEditAccommodation(undefined, activeDateStr)}
                                        className="p-4 rounded-2xl border border-dashed border-sky-300/40 dark:border-sky-700/40 text-center text-xs text-light-text-secondary cursor-pointer hover:border-sky-500/50"
                                    >
                                        No stay booked for tonight. Tap to book stay.
                                    </div>
                                )}
                            </div>

                            {/* Bento Section 3: Activities */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between px-1">
                                    <span className="text-xs font-bold uppercase tracking-wider text-light-text-secondary flex items-center gap-1.5">
                                        <Ticket className="w-4 h-4 text-amber-500" /> Activities
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
                                    <div 
                                        onClick={() => onEditActivity(activeDateStr)}
                                        className="p-4 rounded-2xl border border-dashed border-black/10 dark:border-white/10 text-center text-xs text-light-text-secondary cursor-pointer hover:border-amber-500/50"
                                    >
                                        No activities planned. Tap to add.
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {dayActivities.map(act => (
                                            <div
                                                key={act.id}
                                                onClick={() => onEditActivity(activeDateStr, act)}
                                                className={`p-3.5 rounded-2xl border transition-all cursor-pointer space-y-1 ${getActivityCardStyle(act.type)}`}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <span className="inline-flex items-center gap-1 text-2xs font-bold uppercase tracking-wider opacity-80">
                                                        {getActivityIcon(act.type)}
                                                        <span>{act.type || 'Activity'}</span>
                                                    </span>
                                                    {act.time && (
                                                        <span className="font-mono text-2xs font-bold">
                                                            {act.time}
                                                        </span>
                                                    )}
                                                </div>
                                                <h4 className="font-bold text-sm leading-snug">
                                                    {act.title}
                                                </h4>
                                                {act.location && (
                                                    <p className="text-2xs opacity-80 flex items-center gap-1 truncate">
                                                        <MapPin className="w-3 h-3 shrink-0" />
                                                        <span className="truncate">{act.location}</span>
                                                    </p>
                                                )}
                                            </div>
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
                    <div className="sticky top-2 z-20 bg-white/90 dark:bg-dark-card/90 backdrop-blur-md p-3.5 rounded-2xl border border-black/10 dark:border-white/10 shadow-xs flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <CalendarBlank className="w-4 h-4 text-primary-500" weight="duotone" />
                            <span className="text-xs font-black uppercase tracking-wider text-light-text dark:text-dark-text">Day</span>
                        </div>
                        <span className="text-2xs font-mono font-bold text-light-text-secondary bg-black/5 dark:bg-white/5 px-2 py-0.5 rounded-full">
                            {tripDates.length}
                        </span>
                    </div>

                    {/* Col 2 Header: Transport */}
                    <div className="sticky top-2 z-20 bg-white/90 dark:bg-dark-card/90 backdrop-blur-md p-3.5 rounded-2xl border border-black/10 dark:border-white/10 shadow-xs flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <AirplaneTilt className="w-4 h-4 text-blue-500" weight="duotone" />
                            <span className="text-xs font-black uppercase tracking-wider text-light-text dark:text-dark-text">Transport</span>
                        </div>
                        <span className="text-2xs font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">
                            {trip.transports?.length || 0}
                        </span>
                    </div>

                    {/* Col 3 Header: Accommodation */}
                    <div className="sticky top-2 z-20 bg-white/90 dark:bg-dark-card/90 backdrop-blur-md p-3.5 rounded-2xl border border-black/10 dark:border-white/10 shadow-xs flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Bed className="w-4 h-4 text-sky-500" weight="duotone" />
                            <span className="text-xs font-black uppercase tracking-wider text-light-text dark:text-dark-text">Accommodation</span>
                        </div>
                        <span className="text-2xs font-mono font-bold text-sky-600 dark:text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-full">
                            {trip.accommodations?.length || 0}
                        </span>
                    </div>

                    {/* Col 4 Header: Activities */}
                    <div className="sticky top-2 z-20 bg-white/90 dark:bg-dark-card/90 backdrop-blur-md p-3.5 rounded-2xl border border-black/10 dark:border-white/10 shadow-xs flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Ticket className="w-4 h-4 text-amber-500" weight="duotone" />
                            <span className="text-xs font-black uppercase tracking-wider text-light-text dark:text-dark-text">Activities</span>
                        </div>
                        <span className="text-2xs font-mono font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">
                            {trip.activities?.length || 0}
                        </span>
                    </div>

                    {/* ========================================================== */}
                    {/* DAILY ROWS: Day Column (Col 1), Transport (Col 2), Activities (Col 4) */}
                    {/* ========================================================== */}
                    {tripDates.map((dateStr, dIdx) => {
                        const dateObj = new Date(dateStr);
                        const isToday = new Date().toDateString() === dateObj.toDateString();
                        const location = getLocationForDate(dateStr);
                        const dayTransports = getTransportScheduleEventsForDate(trip.transports, dateStr);
                        const dayActivities = (trip.activities || []).filter(a => a.date === dateStr);
                        const rowIndex = dIdx + 2;

                        return (
                            <React.Fragment key={dateStr}>
                                
                                {/* ---------------------------------------------------- */}
                                {/* COL 1: DAY CARD                                      */}
                                {/* ---------------------------------------------------- */}
                                <div 
                                    style={{ gridColumn: 1, gridRow: rowIndex }}
                                    className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between ${
                                        isToday
                                        ? 'bg-primary-500/10 border-primary-500/40 ring-1 ring-primary-500/30'
                                        : 'bg-white/70 dark:bg-dark-card/70 border-black/10 dark:border-white/10'
                                    }`}
                                >
                                    <div className="space-y-1">
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
                                        <p className="text-2xs text-light-text-secondary font-medium">
                                            {formatDate(dateObj, 'short-with-year', settings)}
                                        </p>
                                    </div>

                                    {location && (
                                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider text-primary-600 dark:text-primary-400 bg-primary-500/10 border border-primary-500/20 truncate mt-2">
                                            <MapPin className="w-3 h-3 shrink-0" weight="duotone" />
                                            <span className="truncate">{location.name}</span>
                                        </div>
                                    )}
                                </div>

                                {/* ---------------------------------------------------- */}
                                {/* COL 2: TRANSPORT CELL                                */}
                                {/* ---------------------------------------------------- */}
                                <div 
                                    style={{ gridColumn: 2, gridRow: rowIndex }}
                                    className="p-1 rounded-2xl flex flex-col justify-start gap-2"
                                >
                                    {dayTransports.length === 0 ? (
                                        <div 
                                            onClick={() => onEditTransport(undefined, dateStr)}
                                            className="h-full min-h-[96px] border border-dashed border-black/10 dark:border-white/10 rounded-2xl p-3 flex flex-col items-center justify-center text-light-text-secondary hover:border-blue-500/50 hover:bg-blue-500/5 transition-all cursor-pointer group"
                                            title="Add transport on this day"
                                        >
                                            <Plus className="w-4 h-4 opacity-30 group-hover:opacity-100 group-hover:scale-110 transition-all text-blue-500" />
                                            <span className="text-2xs font-bold uppercase tracking-wider opacity-30 group-hover:opacity-100 mt-1">
                                                Add Transport
                                            </span>
                                        </div>
                                    ) : (
                                        <div className="space-y-2 flex-1 flex flex-col justify-center">
                                            {dayTransports.map((t, tIdx) => (
                                                <div
                                                    key={`${t.id}-${tIdx}`}
                                                    onClick={() => onEditTransport([t], dateStr)}
                                                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer group space-y-1.5 shadow-sm hover:scale-[1.01] ${getTransportCardStyle(t.mode)}`}
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-black/20 text-white border border-white/20">
                                                            {getTransportIcon(t.mode)}
                                                            <span>{t.mode}</span>
                                                        </span>
                                                        <span className="font-mono text-2xs font-bold bg-white/20 px-2 py-0.5 rounded-full text-white">
                                                            {t.isDropoff ? t.arrivalTime || '00:00' : t.departureTime || '00:00'}
                                                        </span>
                                                    </div>

                                                    <h5 className="font-black text-xs sm:text-sm text-white leading-snug">
                                                        {getTransportScheduleTitle(t, t.isDropoff)}
                                                    </h5>

                                                    <div className="flex items-center justify-between text-2xs opacity-85 pt-1 border-t border-white/15">
                                                        <span className="truncate max-w-[170px]" title={getTransportScheduleLocation(t, t.isDropoff)}>
                                                            {getTransportScheduleLocation(t, t.isDropoff)}
                                                        </span>
                                                        {t.cost ? (
                                                            <span className="font-mono font-bold">
                                                                {formatCurrency(t.cost)}
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* ---------------------------------------------------- */}
                                {/* COL 4: ACTIVITIES CELL                               */}
                                {/* ---------------------------------------------------- */}
                                <div 
                                    style={{ gridColumn: 4, gridRow: rowIndex }}
                                    className="p-1 rounded-2xl flex flex-col justify-start gap-2"
                                >
                                    {dayActivities.length === 0 ? (
                                        <div 
                                            onClick={() => onEditActivity(dateStr)}
                                            className="h-full min-h-[96px] border border-dashed border-black/10 dark:border-white/10 rounded-2xl p-3 flex flex-col items-center justify-center text-light-text-secondary hover:border-amber-500/50 hover:bg-amber-500/5 transition-all cursor-pointer group"
                                            title="Add activity on this day"
                                        >
                                            <Plus className="w-4 h-4 opacity-30 group-hover:opacity-100 group-hover:scale-110 transition-all text-amber-500" />
                                            <span className="text-2xs font-bold uppercase tracking-wider opacity-30 group-hover:opacity-100 mt-1">
                                                Add Activity
                                            </span>
                                        </div>
                                    ) : (
                                        <div className="space-y-2 flex-1 flex flex-col justify-center">
                                            {dayActivities.map(act => (
                                                <div
                                                    key={act.id}
                                                    onClick={() => onEditActivity(dateStr, act)}
                                                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer group space-y-1.5 shadow-xs hover:scale-[1.01] ${getActivityCardStyle(act.type)}`}
                                                >
                                                    <div className="flex items-center justify-between gap-1">
                                                        <span className="inline-flex items-center gap-1 text-2xs font-bold uppercase tracking-wider opacity-85">
                                                            {getActivityIcon(act.type)}
                                                            <span>{act.type || 'Activity'}</span>
                                                        </span>
                                                        {act.time && (
                                                            <span className="font-mono text-2xs font-bold opacity-80">
                                                                {act.time}
                                                            </span>
                                                        )}
                                                    </div>

                                                    <h5 className="font-black text-xs sm:text-sm leading-snug">
                                                        {act.title}
                                                    </h5>

                                                    <div className="flex items-center justify-between text-2xs opacity-80 pt-1 border-t border-black/5 dark:border-white/5">
                                                        <span className="truncate max-w-[170px]" title={act.location}>
                                                            {act.location || 'Local Landmark'}
                                                        </span>
                                                        {act.cost ? (
                                                            <span className="font-mono font-bold">
                                                                {formatCurrency(act.cost)}
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            ))}
                                            <button
                                                type="button"
                                                onClick={() => onEditActivity(dateStr)}
                                                className="w-full py-1.5 rounded-xl border border-dashed border-black/10 dark:border-white/10 text-2xs font-bold uppercase tracking-wider text-light-text-secondary hover:text-amber-600 hover:border-amber-500/50 hover:bg-amber-500/5 transition-all flex items-center justify-center gap-1 cursor-pointer"
                                            >
                                                <Plus className="w-3 h-3" />
                                                <span>Add Another</span>
                                            </button>
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
                                onClick={() => onEditAccommodation(stay)}
                                className="p-4 sm:p-5 rounded-3xl bg-sky-50/90 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/40 text-light-text dark:text-dark-text shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group hover:border-sky-400"
                            >
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-2xs font-bold uppercase tracking-wider bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20">
                                            {getAccommodationIcon(stay.type)}
                                            <span>{stay.type || 'Hotel'}</span>
                                        </span>

                                        <div className="flex items-center gap-1.5">
                                            <span className="px-2.5 py-0.5 rounded-full text-2xs font-mono font-bold bg-sky-500/20 text-sky-800 dark:text-sky-200">
                                                {span.totalNights} {span.totalNights === 1 ? 'Night' : 'Nights'}
                                            </span>
                                            {stay.cost ? (
                                                <span className="font-mono text-xs font-black text-sky-800 dark:text-sky-200 px-2 py-0.5 rounded-full bg-sky-500/20">
                                                    {formatCurrency(stay.cost)}
                                                </span>
                                            ) : null}
                                        </div>
                                    </div>

                                    <div>
                                        <h4 className="font-black text-sm sm:text-base text-light-text dark:text-dark-text tracking-tight group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                                            {stay.name}
                                        </h4>
                                        {stay.address && (
                                            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-1 flex items-center gap-1.5 truncate">
                                                <MapPin className="w-3.5 h-3.5 text-sky-500 shrink-0" weight="duotone" />
                                                <span className="truncate">{stay.address}</span>
                                            </p>
                                        )}
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
                                onClick={() => onEditAccommodation(undefined, defaultDate)}
                                className="border border-dashed border-sky-300/40 dark:border-sky-700/30 bg-sky-500/[0.02] rounded-3xl p-4 flex flex-col items-center justify-center text-light-text-secondary hover:border-sky-500/60 hover:bg-sky-500/5 transition-all cursor-pointer group"
                                title="Book accommodation for this period"
                            >
                                <Bed className="w-5 h-5 text-sky-500/50 group-hover:text-sky-500 group-hover:scale-110 transition-all" weight="duotone" />
                                <span className="text-xs font-bold uppercase tracking-wider text-sky-700 dark:text-sky-400 mt-2">
                                    + Book Stay
                                </span>
                                <span className="text-2xs text-light-text-secondary opacity-60 mt-0.5">
                                    No stay booked ({gapDays} {gapDays === 1 ? 'day' : 'days'})
                                </span>
                            </div>
                        );
                    })}

                </div>
            </div>

        </div>
    );
};

export default DailyPlannerBoard;
