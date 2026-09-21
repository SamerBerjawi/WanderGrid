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
    CaretLeft, 
    CaretRight,
    Sparkle,
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
    WarningCircle
} from '@phosphor-icons/react';
import GlassPanel from './glass/GlassPanel';
import { EmptyState } from './EmptyState';
import { Trip, Transport, Accommodation, Activity, WorkspaceSettings } from '../types';
import { formatDate, formatCurrency } from '../utils/formatters';
import { 
    STATUS_INFO_STYLE, 
    STATUS_SUCCESS_STYLE, 
    STATUS_WARNING_STYLE,
    CARD_FILL_STYLE,
    CARD_ELEVATED_STYLE,
    BTN_PRIMARY_STYLE,
    BTN_SECONDARY_STYLE,
    CLOSE_BTN_STYLE 
} from '../constants';

export interface DailyPlannerBoardProps {
    trip: Trip;
    tripDates?: string[];
    settings?: WorkspaceSettings | null;
    onEditTransport: (transports?: Transport[], date?: string) => void;
    onEditAccommodation: (accommodation?: Accommodation, date?: string) => void;
    onEditActivity: (dateStr: string, activity?: Activity) => void;
    onDeleteActivity?: (activityId: string) => void;
}

interface PlannerItem {
    id: string;
    type: 'Transport' | 'Accommodation' | 'Activity';
    subType?: string;
    time: string;
    title: string;
    location?: string;
    cost?: number;
    meta?: string;
    ref: any;
    isDropoff?: boolean;
    isCheckOut?: boolean;
    isOvernight?: boolean;
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
    // Safely compute tripDates if not passed or empty
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

    // Mobile active day index (0 for first day, or -1 for floating lane)
    const [selectedDayIndex, setSelectedDayIndex] = useState<number>(0);
    const [showFloatingLane, setShowFloatingLane] = useState<boolean>(false);

    // Approximate / Unscheduled Floating Items
    const floatingItems = useMemo(() => {
        const items: PlannerItem[] = [];
        
        (trip.transports || []).forEach(t => {
            if (t.isApproximate || !t.departureDate) {
                items.push({
                    id: t.id,
                    type: 'Transport',
                    subType: t.mode,
                    time: 'Flexible',
                    title: `${t.mode} to ${t.destination || 'Destination'}`,
                    location: t.origin ? `${t.origin} → ${t.destination}` : t.destination,
                    cost: t.cost,
                    meta: t.approximateYear ? `Approx. ${t.approximateYear}` : 'Flexible Logistics',
                    ref: t
                });
            }
        });

        (trip.activities || []).forEach(act => {
            if (!act.date) {
                items.push({
                    id: act.id,
                    type: 'Activity',
                    subType: act.type,
                    time: act.time || 'Flexible',
                    title: act.title,
                    location: act.location,
                    cost: act.cost,
                    meta: 'Unscheduled Activity',
                    ref: act
                });
            }
        });

        return items;
    }, [trip.transports, trip.activities]);

    // Derived day items calculation for a given date
    const getItemsForDate = (dateStr: string): PlannerItem[] => {
        const items: PlannerItem[] = [];

        // 1. Scheduled Transports (Strictly filter out approximate ones)
        (trip.transports || []).forEach(t => {
            if (t.isApproximate) return;
            if (t.departureDate === dateStr) {
                items.push({
                    id: `${t.id}_dep`,
                    type: 'Transport',
                    subType: t.mode,
                    time: t.departureTime || '00:00',
                    title: t.mode === 'Car Rental' || t.mode === 'Personal Car' 
                        ? `Pickup ${t.mode}` 
                        : `${t.mode} to ${t.destination}`,
                    location: t.origin ? `${t.origin} → ${t.destination}` : t.destination,
                    cost: t.cost,
                    meta: t.provider ? `${t.provider} ${t.identifier || ''}`.trim() : undefined,
                    ref: t
                });
            }
            if (t.arrivalDate === dateStr && t.departureDate !== dateStr && (t.mode === 'Car Rental' || t.mode === 'Personal Car')) {
                items.push({
                    id: `${t.id}_arr`,
                    type: 'Transport',
                    subType: t.mode,
                    time: t.arrivalTime || '00:00',
                    title: `Dropoff ${t.mode}`,
                    location: t.dropoffLocation || t.destination,
                    meta: t.provider,
                    ref: t,
                    isDropoff: true
                });
            }
        });

        // 2. Scheduled Accommodations
        (trip.accommodations || []).forEach(a => {
            if (a.checkInDate === dateStr) {
                items.push({
                    id: `${a.id}_in`,
                    type: 'Accommodation',
                    subType: a.type,
                    time: a.checkInTime || '15:00',
                    title: `${a.name} (Check-In)`,
                    location: a.address,
                    cost: a.cost,
                    meta: 'Check-In',
                    ref: a
                });
            }
            if (a.checkOutDate === dateStr) {
                items.push({
                    id: `${a.id}_out`,
                    type: 'Accommodation',
                    subType: a.type,
                    time: a.checkOutTime || '11:00',
                    title: `${a.name} (Check-Out)`,
                    location: a.address,
                    meta: 'Check-Out',
                    ref: a,
                    isCheckOut: true
                });
            }
            if (dateStr > (a.checkInDate || '') && dateStr < (a.checkOutDate || '')) {
                items.push({
                    id: `${a.id}_stay`,
                    type: 'Accommodation',
                    subType: a.type,
                    time: '08:00',
                    title: `${a.name} (Stay)`,
                    location: a.address,
                    meta: 'Overnight Stay',
                    ref: a,
                    isOvernight: true
                });
            }
        });

        // 3. Scheduled Activities / Excursions
        (trip.activities || []).forEach(act => {
            if (act.date === dateStr) {
                items.push({
                    id: act.id,
                    type: 'Activity',
                    subType: act.type,
                    time: act.time || '12:00',
                    title: act.title,
                    location: act.location,
                    cost: act.cost,
                    meta: act.description,
                    ref: act
                });
            }
        });

        return items.sort((a, b) => (a.time || '23:59').localeCompare(b.time || '23:59'));
    };

    const getLocationForDate = (dateStr: string) => {
        if (!trip.locations || trip.locations.length === 0) return null;
        return trip.locations.find(l => dateStr >= l.startDate && dateStr <= l.endDate);
    };

    const getTransportIcon = (mode?: string) => {
        switch (mode) {
            case 'Train': return <Train className="w-4 h-4" weight="duotone" />;
            case 'Bus': return <Bus className="w-4 h-4" weight="duotone" />;
            case 'Ferry': return <Anchor className="w-4 h-4" weight="duotone" />;
            case 'Cruise': return <Boat className="w-4 h-4" weight="duotone" />;
            case 'Car Rental': return <Key className="w-4 h-4" weight="duotone" />;
            case 'Personal Car': return <Car className="w-4 h-4" weight="duotone" />;
            case 'Flight':
            default:
                return <AirplaneTilt className="w-4 h-4" weight="duotone" />;
        }
    };

    const renderItemCard = (item: PlannerItem, dateStr?: string) => {
        if (item.type === 'Transport') {
            const t = item.ref as Transport;
            return (
                <div 
                    key={item.id}
                    onClick={() => onEditTransport([t])}
                    className="p-3.5 rounded-2xl bg-white/90 dark:bg-dark-card/90 backdrop-blur-md border border-black/10 dark:border-white/10 hover:border-blue-500/50 hover:shadow-md transition-all cursor-pointer group space-y-2"
                >
                    <div className="flex items-center justify-between">
                        <span className={`px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider ${STATUS_INFO_STYLE} flex items-center gap-1`}>
                            {getTransportIcon(t.mode)}
                            <span>{t.mode}</span>
                        </span>
                        <span className="text-2xs font-mono font-bold text-blue-600 dark:text-blue-400">
                            {item.time}
                        </span>
                    </div>
                    <div>
                        <h5 className="font-bold text-xs text-light-text dark:text-dark-text group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                            {item.title}
                        </h5>
                        {item.location && (
                            <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5 flex items-center gap-1 truncate">
                                <MapPin className="w-3 h-3 shrink-0" weight="duotone" />
                                <span className="truncate">{item.location}</span>
                            </p>
                        )}
                    </div>
                    <div className="flex items-center justify-between pt-1 text-2xs text-light-text-secondary border-t border-black/5 dark:border-white/5">
                        <span className="truncate max-w-[140px]">{item.meta || t.provider}</span>
                        {item.cost ? <span className="font-bold font-mono text-light-text dark:text-dark-text">{formatCurrency(item.cost)}</span> : null}
                    </div>
                </div>
            );
        }

        if (item.type === 'Accommodation') {
            const a = item.ref as Accommodation;
            return (
                <div 
                    key={item.id}
                    onClick={() => onEditAccommodation(a)}
                    className="p-3.5 rounded-2xl bg-white/90 dark:bg-dark-card/90 backdrop-blur-md border border-black/10 dark:border-white/10 hover:border-emerald-500/50 hover:shadow-md transition-all cursor-pointer group space-y-2"
                >
                    <div className="flex items-center justify-between">
                        <span className={`px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider ${STATUS_SUCCESS_STYLE} flex items-center gap-1`}>
                            <Bed className="w-3 h-3" weight="duotone" />
                            <span>{item.meta || 'Stay'}</span>
                        </span>
                        {!item.isOvernight && (
                            <span className="text-2xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                {item.time}
                            </span>
                        )}
                    </div>
                    <div>
                        <h5 className="font-bold text-xs text-light-text dark:text-dark-text group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                            {a.name}
                        </h5>
                        {a.address && (
                            <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5 flex items-center gap-1 truncate">
                                <MapPin className="w-3 h-3 shrink-0" weight="duotone" />
                                <span className="truncate">{a.address}</span>
                            </p>
                        )}
                    </div>
                    <div className="flex items-center justify-between pt-1 text-2xs text-light-text-secondary border-t border-black/5 dark:border-white/5">
                        <span>{a.type || 'Hotel'}</span>
                        {item.cost && !item.isOvernight && (
                            <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400">{formatCurrency(item.cost)}</span>
                        )}
                    </div>
                </div>
            );
        }

        // Activity / Excursion
        const act = item.ref as Activity;
        const isReservation = act.type === 'Reservation';
        return (
            <div 
                key={item.id}
                onClick={() => onEditActivity(dateStr || act.date, act)}
                className="p-3.5 rounded-2xl bg-white/90 dark:bg-dark-card/90 backdrop-blur-md border border-black/10 dark:border-white/10 hover:border-amber-500/50 hover:shadow-md transition-all cursor-pointer group space-y-2"
            >
                <div className="flex items-center justify-between">
                    <span className={`px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider ${STATUS_WARNING_STYLE} flex items-center gap-1`}>
                        {isReservation ? <ForkKnife className="w-3 h-3" weight="duotone" /> : <Compass className="w-3 h-3" weight="duotone" />}
                        <span>{act.type || 'Activity'}</span>
                    </span>
                    <span className="text-2xs font-mono font-bold text-amber-600 dark:text-amber-400">
                        {item.time}
                    </span>
                </div>
                <div>
                    <h5 className="font-bold text-xs text-light-text dark:text-dark-text group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                        {act.title}
                    </h5>
                    {act.location && (
                        <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5 flex items-center gap-1 truncate">
                            <MapPin className="w-3 h-3 shrink-0" weight="duotone" />
                            <span className="truncate">{act.location}</span>
                        </p>
                    )}
                </div>
                <div className="flex items-center justify-between pt-1 text-2xs text-light-text-secondary border-t border-black/5 dark:border-white/5">
                    <span className="truncate max-w-[130px]">{act.description || 'Confirmed'}</span>
                    {act.cost ? <span className="font-bold font-mono text-light-text dark:text-dark-text">{formatCurrency(act.cost)}</span> : null}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6">
            
            {/* Top Floating / Flexible Logistics Drawer if approximate items exist */}
            {floatingItems.length > 0 && (
                <GlassPanel 
                    className="wg-glass-card rounded-[28px] overflow-hidden p-5 space-y-3 border border-amber-500/30"
                    overrides={{ borderRadius: 28 }}
                    padding="0px"
                >
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-400 flex items-center gap-1.5">
                                <span>Unscheduled & Flexible Logistics</span>
                                <span className="px-2 py-0.5 rounded-full text-2xs bg-amber-500/20 font-mono">
                                    {floatingItems.length}
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
                            {floatingItems.map(item => renderItemCard(item))}
                        </div>
                    )}
                </GlassPanel>
            )}

            {/* ============================================================== */}
            {/* MOBILE LAYOUT (< 768px): Date Switcher Carousel + Single Day View */}
            {/* ============================================================== */}
            <div className="md:hidden space-y-4">
                {/* Horizontal Date Carousel Switcher */}
                <div className="flex items-center gap-2 overflow-x-auto pb-2 custom-scrollbar">
                    {tripDates.map((dateStr, idx) => {
                        const dateObj = new Date(dateStr);
                        const isSelected = selectedDayIndex === idx;
                        const dayItems = getItemsForDate(dateStr);
                        return (
                            <button
                                key={dateStr}
                                type="button"
                                onClick={() => setSelectedDayIndex(idx)}
                                className={`px-3.5 py-2.5 rounded-2xl flex flex-col items-center justify-center shrink-0 min-w-[70px] min-h-[58px] transition-all border cursor-pointer ${
                                    isSelected
                                    ? 'bg-primary-500 text-white border-primary-500 shadow-md shadow-primary-500/20 scale-102'
                                    : 'bg-white/80 dark:bg-dark-card/80 border-black/10 dark:border-white/10 text-light-text dark:text-dark-text'
                                }`}
                            >
                                <span className="text-2xs font-bold uppercase tracking-widest opacity-80">
                                    {formatDate(dateObj, 'short', settings).split(' ')[0]}
                                </span>
                                <span className="text-base font-black leading-none my-0.5">
                                    {dateObj.getUTCDate()}
                                </span>
                                <span className="text-2xs font-bold opacity-75">
                                    Day {idx + 1} ({dayItems.length})
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* Mobile Single Active Day View */}
                {(() => {
                    const activeDateStr = tripDates[selectedDayIndex] || tripDates[0];
                    if (!activeDateStr) return null;
                    const dateObj = new Date(activeDateStr);
                    const location = getLocationForDate(activeDateStr);
                    const items = getItemsForDate(activeDateStr);

                    return (
                        <GlassPanel 
                            className="wg-glass-card rounded-[28px] overflow-hidden p-5 space-y-4"
                            overrides={{ borderRadius: 28 }}
                            padding="0px"
                        >
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="px-2.5 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-primary-500 text-white">
                                            Day {selectedDayIndex + 1}
                                        </span>
                                        <h3 className="text-sm font-bold text-light-text dark:text-dark-text">
                                            {formatDate(dateObj, 'weekday-long', settings)}
                                        </h3>
                                    </div>
                                    {location && (
                                        <p className="text-2xs text-light-text-secondary mt-1 flex items-center gap-1 font-semibold">
                                            <MapPin className="w-3.5 h-3.5 text-primary-500" weight="duotone" /> {location.name}
                                        </p>
                                    )}
                                </div>
                                <span className="text-2xs font-bold text-light-text-secondary uppercase tracking-wider">
                                    {items.length} {items.length === 1 ? 'Item' : 'Items'}
                                </span>
                            </div>

                            {/* Items */}
                            {items.length === 0 ? (
                                <EmptyState
                                    compact={true}
                                    title="Open Schedule"
                                    description="No flights, stays, or activities scheduled for today yet."
                                    action={{
                                        label: "+ Add Activity",
                                        onClick: () => onEditActivity(activeDateStr)
                                    }}
                                />
                            ) : (
                                <div className="space-y-3">
                                    {items.map(item => renderItemCard(item, activeDateStr))}
                                </div>
                            )}

                            {/* Quick Add Row */}
                            <div className="pt-2 flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => onEditActivity(activeDateStr)}
                                    className={`${BTN_PRIMARY_STYLE} flex-1 h-11 text-2xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5`}
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>Activity</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onEditAccommodation()}
                                    className={`${BTN_SECONDARY_STYLE} flex-1 h-11 text-2xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5`}
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>Stay</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onEditTransport()}
                                    className={`${BTN_SECONDARY_STYLE} flex-1 h-11 text-2xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5`}
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>Transport</span>
                                </button>
                            </div>
                        </GlassPanel>
                    );
                })()}
            </div>

            {/* ============================================================== */}
            {/* DESKTOP LAYOUT (>= 768px): Bento Style Grid */}
            {/* ============================================================== */}
            <div className="hidden md:block pb-10">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 items-stretch">
                    {tripDates.map((dateStr, index) => {
                        const dateObj = new Date(dateStr);
                        const location = getLocationForDate(dateStr);
                        const items = getItemsForDate(dateStr);
                        const isToday = new Date().toDateString() === dateObj.toDateString();

                        return (
                            <GlassPanel 
                                key={dateStr}
                                className={`rounded-[28px] overflow-hidden flex flex-col justify-between h-full transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5 ${
                                    isToday 
                                    ? 'wg-glass-card ring-2 ring-primary-500/50 shadow-md shadow-primary-500/10' 
                                    : 'wg-glass-card shadow-xs'
                                }`}
                                overrides={{ borderRadius: 28 }}
                                padding="0px"
                            >
                                {/* Column Day Header */}
                                <div className={`p-4 border-b border-black/5 dark:border-white/5 space-y-2.5 ${
                                    isToday ? 'bg-gradient-to-r from-primary-500/10 via-transparent to-transparent' : 'bg-black/[0.01] dark:bg-white/[0.01]'
                                }`}>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className={`px-2.5 py-0.5 rounded-full text-2xs font-black uppercase tracking-wider ${
                                                isToday ? 'bg-primary-500 text-white shadow-xs' : 'bg-black/5 dark:bg-white/5 text-light-text-secondary dark:text-dark-text-secondary'
                                            }`}>
                                                Day {index + 1}
                                            </span>
                                            {isToday && (
                                                <span className="text-2xs font-bold text-primary-500 uppercase tracking-widest flex items-center gap-1">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse" />
                                                    Today
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-2xs font-mono font-bold px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/5 text-light-text-secondary">
                                            {items.length} {items.length === 1 ? 'event' : 'events'}
                                        </span>
                                    </div>

                                    <div>
                                        <h4 className="font-black text-sm text-light-text dark:text-dark-text tracking-tight">
                                            {formatDate(dateObj, 'weekday-long', settings)}
                                        </h4>
                                        <p className="text-2xs text-light-text-secondary font-medium mt-0.5">
                                            {formatDate(dateObj, 'short', settings)}
                                        </p>
                                    </div>

                                    {location && (
                                        <div className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary-500/10 text-primary-600 dark:text-primary-400 rounded-full text-2xs font-bold uppercase tracking-wider">
                                            <MapPin className="w-3 h-3" weight="duotone" />
                                            <span className="truncate max-w-[180px]">{location.name}</span>
                                        </div>
                                    )}
                                </div>

                                {/* Events List */}
                                <div className="p-3.5 space-y-3 flex-1 min-h-[180px]">
                                    {items.length === 0 ? (
                                        <EmptyState 
                                            compact={true}
                                            title="Open Schedule"
                                            description="No events planned for this day."
                                            action={{
                                                label: "+ Add Activity",
                                                onClick: () => onEditActivity(dateStr)
                                            }}
                                        />
                                    ) : (
                                        items.map(item => renderItemCard(item, dateStr))
                                    )}
                                </div>

                                {/* Column Footer: Quick-add triggers */}
                                <div className="p-2 border-t border-black/5 dark:border-white/5 flex items-center justify-between gap-1 bg-white/40 dark:bg-dark-card/40 rounded-b-[28px]">
                                    <button
                                        type="button"
                                        onClick={() => onEditActivity(dateStr)}
                                        className="flex-1 py-1.5 px-1 rounded-xl text-[10px] font-bold uppercase tracking-wider text-light-text-secondary hover:text-primary-600 hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-center justify-center gap-1 cursor-pointer truncate"
                                        title="Add activity or tour"
                                    >
                                        <Plus className="w-3 h-3 shrink-0" />
                                        <span>Activity</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => onEditAccommodation()}
                                        className="flex-1 py-1.5 px-1 rounded-xl text-[10px] font-bold uppercase tracking-wider text-light-text-secondary hover:text-emerald-600 hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-center justify-center gap-1 cursor-pointer truncate"
                                        title="Add accommodation stay"
                                    >
                                        <Plus className="w-3 h-3 shrink-0" />
                                        <span>Stay</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => onEditTransport(undefined, dateStr)}
                                        className="flex-1 py-1.5 px-1 rounded-xl text-[10px] font-bold uppercase tracking-wider text-light-text-secondary hover:text-blue-600 hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-center justify-center gap-1 cursor-pointer truncate"
                                        title="Add transport leg"
                                    >
                                        <Plus className="w-3 h-3 shrink-0" />
                                        <span>Transport</span>
                                    </button>
                                </div>
                            </GlassPanel>
                        );
                    })}
                </div>
            </div>

        </div>
    );
};
export default DailyPlannerBoard;
