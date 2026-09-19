import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { 
    CalendarBlank, 
    CheckCircle, 
    ClockCounterClockwise, 
    Plus, 
    MapPin, 
    Airplane, 
    Train, 
    Car, 
    Boat, 
    Globe,
    Hourglass,
    ArrowRight,
    Compass,
    SuitcaseSimple,
    Clock,
    Sparkle,
    CalendarCheck
} from '@phosphor-icons/react';
import GlassPanel from '../components/glass/GlassPanel';
import { useWanderSync } from '../hooks/useWanderSync';
import { dataService } from '../services/mockDb';
import { Trip } from '../types';
import { formatDateRange } from '../utils/formatters';
import { NewTripDrawer } from '../components/NewTripDrawer';

interface PlannerViewProps {
    onTripClick?: (tripId: string) => void;
}

type TabKey = 'all' | 'planned' | 'confirmed' | 'past';

interface TabThemeConfig {
    id: TabKey;
    label: string;
    icon: React.ComponentType<any>;
    color: string;
    activeText: string;
    activeBg: string;
    activeBorder: string;
    activeShadow: string;
    badgeStyle: string;
}

const PLANNER_TAB_THEMES: Record<TabKey, TabThemeConfig> = {
    confirmed: {
        id: 'confirmed',
        label: 'Confirmed',
        icon: CheckCircle,
        color: 'text-sky-500 dark:text-sky-400',
        activeText: 'text-sky-700 dark:text-sky-300',
        activeBg: 'bg-sky-500/20 dark:bg-sky-500/30',
        activeBorder: 'border-sky-500/40 dark:border-sky-400/50',
        activeShadow: 'shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_2px_10px_rgba(14,165,233,0.3)]',
        badgeStyle: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/20'
    },
    past: {
        id: 'past',
        label: 'Past',
        icon: ClockCounterClockwise,
        color: 'text-emerald-500 dark:text-emerald-400',
        activeText: 'text-emerald-700 dark:text-emerald-300',
        activeBg: 'bg-emerald-500/20 dark:bg-emerald-500/30',
        activeBorder: 'border-emerald-500/40 dark:border-emerald-400/50',
        activeShadow: 'shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_2px_10px_rgba(16,185,129,0.3)]',
        badgeStyle: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'
    },
    planned: {
        id: 'planned',
        label: 'Planned',
        icon: Clock,
        color: 'text-amber-500 dark:text-amber-400',
        activeText: 'text-amber-700 dark:text-amber-300',
        activeBg: 'bg-amber-500/20 dark:bg-amber-500/30',
        activeBorder: 'border-amber-500/40 dark:border-amber-400/50',
        activeShadow: 'shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_2px_10px_rgba(245,158,11,0.3)]',
        badgeStyle: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/20'
    },
    all: {
        id: 'all',
        label: 'All Expeditions',
        icon: Globe,
        color: 'text-indigo-500 dark:text-indigo-400',
        activeText: 'text-indigo-700 dark:text-indigo-300',
        activeBg: 'bg-indigo-500/20 dark:bg-indigo-500/30',
        activeBorder: 'border-indigo-500/40 dark:border-indigo-400/50',
        activeShadow: 'shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_2px_10px_rgba(99,102,241,0.3)]',
        badgeStyle: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/20'
    }
};

export const PlannerView: React.FC<PlannerViewProps> = ({ onTripClick }) => {
    // 1. Reactive SWR Trips Synchronization
    const { data: tripsData } = useWanderSync<Trip[]>(
        'planner_trips',
        () => dataService.getTrips()
    );

    const trips = useMemo(() => tripsData || [], [tripsData]);

    // 2. Active Tab State ('all' | 'planned' | 'confirmed' | 'past')
    const [activeTab, setActiveTab] = useState<TabKey>('all');
    
    // 3. New Trip Drawer State
    const [isNewTripOpen, setIsNewTripOpen] = useState(false);
    const [drawerStatus, setDrawerStatus] = useState<'Planning' | 'Upcoming' | 'Past'>('Planning');

    // Categorize trips into Confirmed, Past, Planned
    const today = new Date().toISOString().split('T')[0];

    const { plannedTrips, confirmedTrips, pastTrips } = useMemo(() => {
        const planned: Trip[] = [];
        const confirmed: Trip[] = [];
        const past: Trip[] = [];

        trips.forEach(trip => {
            if (trip.status === 'Cancelled') return;

            // Trips with past end date (or past start date if no end date), or status explicitly Past
            const hasPastDates = Boolean(
                (trip.endDate && trip.endDate < today) ||
                (trip.startDate && trip.startDate < today && (!trip.endDate || trip.endDate < today))
            );

            if (trip.status === 'Past' || hasPastDates) {
                past.push(trip);
            } else if (trip.status === 'Upcoming') {
                confirmed.push(trip);
            } else {
                planned.push(trip);
            }
        });

        // Sort: Planned & Confirmed ascending by start date; Past descending by end date
        planned.sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
        confirmed.sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
        past.sort((a, b) => (b.endDate || b.startDate || '').localeCompare(a.endDate || a.startDate || ''));

        return { plannedTrips: planned, confirmedTrips: confirmed, pastTrips: past };
    }, [trips, today]);

    // Next upcoming trip countdown
    const nextTrip = useMemo(() => {
        if (confirmedTrips.length === 0) return null;
        const upcoming = confirmedTrips.find(t => t.startDate >= today);
        if (!upcoming) return null;

        const diffDays = Math.ceil(
            (new Date(upcoming.startDate).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24)
        );
        return { trip: upcoming, daysRemaining: Math.max(0, diffDays) };
    }, [confirmedTrips, today]);

    const handleOpenNewTrip = (status: 'Planning' | 'Upcoming' | 'Past' = 'Planning') => {
        setDrawerStatus(status);
        setIsNewTripOpen(true);
    };

    return (
        <div className="w-full max-w-[1680px] mx-auto flex flex-col gap-6 animate-fadeIn pb-16">
            
            {/* ========================================================================= */}
            {/* HERO BAR: Rich Liquid-Glass Command Header & Telemetry                    */}
            {/* ========================================================================= */}
            <GlassPanel
                className="wg-glass-card shadow-glass-card w-full overflow-hidden"
                overrides={{ borderRadius: 28 }}
                padding="0px"
            >
                <div className="p-6 sm:p-7 flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent">
                    
                    {/* Left: Brand Identity & Telemetry Metrics */}
                    <div className="flex items-center gap-5 sm:gap-6 flex-wrap">
                        {/* Hero Icon Container with Layered Glow */}
                        <div className="relative group shrink-0">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/25 ring-2 ring-white/20 transition-transform group-hover:scale-105">
                                <Compass className="w-7 h-7" weight="duotone" />
                            </div>
                            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-white dark:border-dark-card flex items-center justify-center text-white">
                                <Sparkle className="w-2.5 h-2.5" weight="fill" />
                            </div>
                        </div>

                        {/* Title & Minimalist Metrics Group */}
                        <div className="flex flex-col gap-3">
                            <div>
                                <div className="flex items-center gap-2">
                                    <h1 className="text-xl sm:text-2xl font-black text-light-text dark:text-dark-text tracking-tight">
                                        Expedition Planner
                                    </h1>
                                    <span className="px-2.5 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
                                        Itineraries
                                    </span>
                                </div>
                                <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary font-medium mt-0.5">
                                    Organized itinerary management across Planned, Confirmed, and Past journeys
                                </p>
                            </div>

                            {/* Minimalist Metrics Counters */}
                            <div className="flex items-center gap-4 sm:gap-6 flex-wrap pt-1">
                                <div className="flex items-baseline gap-2">
                                    <span className="w-2 h-2 rounded-full bg-sky-500 shadow-[0_0_6px_rgba(14,165,233,0.6)]" />
                                    <span className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
                                        Confirmed
                                    </span>
                                    <span className="text-lg font-black text-sky-600 dark:text-sky-400 font-mono">
                                        {confirmedTrips.length}
                                    </span>
                                </div>

                                <div className="h-4 w-px bg-black/10 dark:bg-white/10" />

                                <div className="flex items-baseline gap-2">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
                                    <span className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
                                        Past
                                    </span>
                                    <span className="text-lg font-black text-emerald-600 dark:text-emerald-400 font-mono">
                                        {pastTrips.length}
                                    </span>
                                </div>

                                <div className="h-4 w-px bg-black/10 dark:bg-white/10" />

                                <div className="flex items-baseline gap-2">
                                    <span className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.6)]" />
                                    <span className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
                                        Planned
                                    </span>
                                    <span className="text-lg font-black text-amber-600 dark:text-amber-400 font-mono">
                                        {plannedTrips.length}
                                    </span>
                                </div>

                                <div className="h-4 w-px bg-black/10 dark:bg-white/10" />

                                <div className="flex items-baseline gap-2">
                                    <span className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_6px_rgba(99,102,241,0.6)]" />
                                    <span className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
                                        Total
                                    </span>
                                    <span className="text-lg font-black text-indigo-600 dark:text-indigo-400 font-mono">
                                        {trips.length}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right: Upcoming Countdown Badge & New Trip Action */}
                    <div className="flex items-center gap-3 self-start lg:self-center shrink-0">
                        {nextTrip && (
                            <div className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-white/70 dark:bg-dark-card/70 border border-black/5 dark:border-white/10 backdrop-blur-md shadow-xs">
                                <Hourglass className="w-4 h-4 text-emerald-500 animate-pulse" />
                                <div className="flex flex-col">
                                    <span className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
                                        Next Departure
                                    </span>
                                    <span className="text-xs font-mono font-bold text-light-text dark:text-dark-text truncate max-w-[160px]">
                                        {nextTrip.daysRemaining === 0 
                                            ? 'Departing Today' 
                                            : `${nextTrip.daysRemaining}d • ${nextTrip.trip.name}`}
                                    </span>
                                </div>
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={() => handleOpenNewTrip('Planning')}
                            className="h-12 px-6 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 transition-all hover:scale-102 active:scale-98 cursor-pointer ring-1 ring-white/20"
                        >
                            <Plus className="w-4 h-4" weight="bold" />
                            <span>New Trip</span>
                        </button>
                    </div>

                </div>
            </GlassPanel>

            {/* ========================================================================= */}
            {/* FLOATING MAP-STYLE TAB SELECTOR (Liquid-Glass Pill with Motion Indicator) */}
            {/* ========================================================================= */}
            <div className="flex items-center justify-start overflow-x-auto no-scrollbar py-1">
                <GlassPanel
                    className="wg-glass-pill shadow-glass-card shrink-0"
                    padding="4px 6px"
                    overrides={{ borderRadius: 9999 }}
                >
                    <div className="flex gap-1 relative items-center">
                        {(['confirmed', 'past', 'planned', 'all'] as TabKey[]).map((tabKey) => {
                            const config = PLANNER_TAB_THEMES[tabKey];
                            const isSelected = activeTab === tabKey;
                            const IconComponent = config.icon;
                            
                            const count = tabKey === 'all' 
                                ? trips.length 
                                : tabKey === 'planned' 
                                ? plannedTrips.length 
                                : tabKey === 'confirmed' 
                                ? confirmedTrips.length 
                                : pastTrips.length;

                            return (
                                <button
                                    key={tabKey}
                                    onClick={() => setActiveTab(tabKey)}
                                    title={config.label}
                                    className={`relative rounded-full text-xs font-bold transition-all duration-200 flex items-center justify-center cursor-pointer select-none active:scale-95 ${
                                        isSelected
                                            ? `${config.activeText} px-4 sm:px-5 py-2.5`
                                            : 'text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text px-3 sm:px-5 py-2.5'
                                    }`}
                                >
                                    {isSelected && (
                                        <motion.div
                                            layoutId="plannerTabActiveIndicator"
                                            className={`absolute inset-0 rounded-full ${config.activeBg} backdrop-blur-md border ${config.activeBorder} ${config.activeShadow} z-0`}
                                            style={{ WebkitBackdropFilter: 'blur(12px)' }}
                                            transition={{ type: "spring", stiffness: 450, damping: 32 }}
                                        />
                                    )}
                                    <span className="relative z-10 flex items-center gap-2 sm:gap-2.5">
                                        <IconComponent 
                                            className={`w-5 h-5 shrink-0 transition-colors duration-200 ${isSelected ? config.color : 'opacity-70'}`} 
                                            weight={isSelected ? "duotone" : "bold"} 
                                        />
                                        <span className={`tracking-tight ${isSelected ? 'inline' : 'hidden sm:inline'}`}>
                                            {config.label}
                                        </span>
                                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold border transition-colors ${
                                            isSelected 
                                                ? `${config.badgeStyle} inline` 
                                                : 'hidden sm:inline bg-black/5 dark:bg-white/10 text-light-text-secondary dark:text-dark-text-secondary border-transparent'
                                        }`}>
                                            {count}
                                        </span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </GlassPanel>
            </div>

            {/* ========================================================================= */}
            {/* 3-COLUMN PANORAMIC BUCKETS: Confirmed, Past, Planned                      */}
            {/* ========================================================================= */}
            <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                
                {/* --------------------------------------------------------------------- */}
                {/* BUCKET 1: CONFIRMED (Flights / Sky)                                   */}
                {/* --------------------------------------------------------------------- */}
                {(activeTab === 'all' || activeTab === 'confirmed') && (
                    <div className={`flex flex-col ${activeTab === 'confirmed' ? 'lg:col-span-12' : 'lg:col-span-4'}`}>
                        <GlassPanel
                            className="wg-glass-card shadow-glass-card flex flex-col h-full overflow-hidden border border-black/5 dark:border-white/10"
                            overrides={{ borderRadius: 28 }}
                            padding="0px"
                        >
                            {/* Bucket Header Banner */}
                            <div className="p-5 border-b border-black/5 dark:border-white/5 flex items-center justify-between bg-gradient-to-r from-sky-500/10 via-sky-500/5 to-transparent shrink-0">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-white bg-gradient-to-br from-sky-500 to-emerald-600 shadow-md shadow-sky-500/20 shrink-0">
                                        <CheckCircle className="w-5 h-5" weight="bold" />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h2 className="text-base font-bold text-light-text dark:text-dark-text tracking-tight">
                                                Confirmed
                                            </h2>
                                            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/25">
                                                {confirmedTrips.length}
                                            </span>
                                        </div>
                                        <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary font-medium truncate mt-0.5">
                                            Booked flights, hotels &amp; schedules
                                        </p>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => handleOpenNewTrip('Upcoming')}
                                    className="w-9 h-9 rounded-xl flex items-center justify-center text-light-text-secondary dark:text-dark-text-secondary hover:text-sky-500 hover:bg-sky-500/10 transition-colors cursor-pointer shrink-0"
                                    title="Add confirmed trip"
                                >
                                    <Plus className="w-4 h-4" weight="bold" />
                                </button>
                            </div>

                            {/* Bucket Card Inventory */}
                            <div className="p-4 sm:p-5 flex-1 flex flex-col gap-3.5 overflow-y-auto custom-scrollbar">
                                {confirmedTrips.length > 0 ? (
                                    confirmedTrips.map(trip => (
                                        <TripCard 
                                            key={trip.id} 
                                            trip={trip} 
                                            stage="sky" 
                                            onClick={() => onTripClick?.(trip.id)} 
                                        />
                                    ))
                                ) : (
                                    <EmptyBucketPlaceholder 
                                        stage="Confirmed"
                                        label="No confirmed bookings yet"
                                        actionLabel="Add confirmed trip"
                                        onAction={() => handleOpenNewTrip('Upcoming')}
                                    />
                                )}
                            </div>
                        </GlassPanel>
                    </div>
                )}

                {/* --------------------------------------------------------------------- */}
                {/* BUCKET 2: PAST (Land & Sea / Emerald)                                 */}
                {/* --------------------------------------------------------------------- */}
                {(activeTab === 'all' || activeTab === 'past') && (
                    <div className={`flex flex-col ${activeTab === 'past' ? 'lg:col-span-12' : 'lg:col-span-4'}`}>
                        <GlassPanel
                            className="wg-glass-card shadow-glass-card flex flex-col h-full overflow-hidden border border-black/5 dark:border-white/10"
                            overrides={{ borderRadius: 28 }}
                            padding="0px"
                        >
                            {/* Bucket Header Banner */}
                            <div className="p-5 border-b border-black/5 dark:border-white/5 flex items-center justify-between bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent shrink-0">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-white bg-gradient-to-br from-emerald-500 to-teal-600 shadow-md shadow-emerald-500/20 shrink-0">
                                        <ClockCounterClockwise className="w-5 h-5" weight="bold" />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h2 className="text-base font-bold text-light-text dark:text-dark-text tracking-tight">
                                                Past
                                            </h2>
                                            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
                                                {pastTrips.length}
                                            </span>
                                        </div>
                                        <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary font-medium truncate mt-0.5">
                                            Travel history &amp; logged memories
                                        </p>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => handleOpenNewTrip('Past')}
                                    className="w-9 h-9 rounded-xl flex items-center justify-center text-light-text-secondary dark:text-dark-text-secondary hover:text-emerald-500 hover:bg-emerald-500/10 transition-colors cursor-pointer shrink-0"
                                    title="Log past trip"
                                >
                                    <Plus className="w-4 h-4" weight="bold" />
                                </button>
                            </div>

                            {/* Bucket Card Inventory */}
                            <div className="p-4 sm:p-5 flex-1 flex flex-col gap-3.5 overflow-y-auto custom-scrollbar">
                                {pastTrips.length > 0 ? (
                                    pastTrips.map(trip => (
                                        <TripCard 
                                            key={trip.id} 
                                            trip={trip} 
                                            stage="emerald" 
                                            onClick={() => onTripClick?.(trip.id)} 
                                        />
                                    ))
                                ) : (
                                    <EmptyBucketPlaceholder 
                                        stage="Past"
                                        label="No past trips recorded"
                                        actionLabel="Log a past journey"
                                        onAction={() => handleOpenNewTrip('Past')}
                                    />
                                )}
                            </div>
                        </GlassPanel>
                    </div>
                )}

                {/* --------------------------------------------------------------------- */}
                {/* BUCKET 3: PLANNED (Scratch / Amber)                                   */}
                {/* --------------------------------------------------------------------- */}
                {(activeTab === 'all' || activeTab === 'planned') && (
                    <div className={`flex flex-col ${activeTab === 'planned' ? 'lg:col-span-12' : 'lg:col-span-4'}`}>
                        <GlassPanel
                            className="wg-glass-card shadow-glass-card flex flex-col h-full overflow-hidden border border-black/5 dark:border-white/10"
                            overrides={{ borderRadius: 28 }}
                            padding="0px"
                        >
                            {/* Bucket Header Banner */}
                            <div className="p-5 border-b border-black/5 dark:border-white/5 flex items-center justify-between bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent shrink-0">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-white bg-gradient-to-br from-amber-500 to-orange-500 shadow-md shadow-amber-500/20 shrink-0">
                                        <Clock className="w-5 h-5" weight="bold" />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h2 className="text-base font-bold text-light-text dark:text-dark-text tracking-tight">
                                                Planned
                                            </h2>
                                            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25">
                                                {plannedTrips.length}
                                            </span>
                                        </div>
                                        <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary font-medium truncate mt-0.5">
                                            Drafts, itineraries &amp; upcoming ideas
                                        </p>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => handleOpenNewTrip('Planning')}
                                    className="w-9 h-9 rounded-xl flex items-center justify-center text-light-text-secondary dark:text-dark-text-secondary hover:text-amber-500 hover:bg-amber-500/10 transition-colors cursor-pointer shrink-0"
                                    title="Plan new trip"
                                >
                                    <Plus className="w-4 h-4" weight="bold" />
                                </button>
                            </div>

                            {/* Bucket Card Inventory */}
                            <div className="p-4 sm:p-5 flex-1 flex flex-col gap-3.5 overflow-y-auto custom-scrollbar">
                                {plannedTrips.length > 0 ? (
                                    plannedTrips.map(trip => (
                                        <TripCard 
                                            key={trip.id} 
                                            trip={trip} 
                                            stage="amber" 
                                            onClick={() => onTripClick?.(trip.id)} 
                                        />
                                    ))
                                ) : (
                                    <EmptyBucketPlaceholder 
                                        stage="Planned"
                                        label="No planned drafts yet"
                                        actionLabel="Plan a trip"
                                        onAction={() => handleOpenNewTrip('Planning')}
                                    />
                                )}
                            </div>
                        </GlassPanel>
                    </div>
                )}

            </div>

            {/* ========================================================================= */}
            {/* NEW TRIP DRAWER (StandardDrawer Pattern)                                  */}
            {/* ========================================================================= */}
            <NewTripDrawer 
                isOpen={isNewTripOpen}
                onClose={() => setIsNewTripOpen(false)}
                initialStatus={drawerStatus}
                onTripCreated={() => {
                    // Reactive SWR cache will automatically refresh
                }}
            />

        </div>
    );
};

// =============================================================================
// SUB-COMPONENTS: Tactile TripCard & EmptyBucketPlaceholder
// =============================================================================

interface TripCardProps {
    trip: Trip;
    stage: 'sky' | 'emerald' | 'amber';
    onClick: () => void;
}

const TripCard: React.FC<TripCardProps> = ({ trip, stage, onClick }) => {
    // Parse destinations for tags
    const destinationsList = useMemo(() => {
        if (trip.locations && trip.locations.length > 0) {
            return trip.locations.map(l => l.name);
        }
        if (trip.location) {
            return trip.location.split(',').map(s => s.trim()).filter(Boolean);
        }
        return [];
    }, [trip.locations, trip.location]);

    // Transport modes
    const transportModes = useMemo(() => {
        if (!trip.transports || trip.transports.length === 0) return [];
        return Array.from(new Set(trip.transports.map(t => t.mode)));
    }, [trip.transports]);

    // Duration calculation in days
    const durationDays = useMemo(() => {
        if (!trip.startDate || !trip.endDate) return null;
        const s = new Date(trip.startDate).getTime();
        const e = new Date(trip.endDate).getTime();
        if (isNaN(s) || isNaN(e) || e < s) return null;
        const diff = Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
        return diff > 0 ? diff : null;
    }, [trip.startDate, trip.endDate]);

    // Stage border accent
    const indicatorGlow = 
        stage === 'sky'
            ? 'bg-sky-500 shadow-[0_0_10px_rgba(14,165,233,0.7)]'
            : stage === 'emerald'
            ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.7)]'
            : 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.7)]';

    const stageColors = 
        stage === 'sky'
            ? {
                titleHover: 'group-hover:text-sky-500 dark:group-hover:text-sky-400',
                arrowHover: 'group-hover:bg-sky-500',
                calendarIcon: 'text-sky-500 dark:text-sky-400',
                pinIcon: 'text-sky-500'
            }
            : stage === 'emerald'
            ? {
                titleHover: 'group-hover:text-emerald-500 dark:group-hover:text-emerald-400',
                arrowHover: 'group-hover:bg-emerald-500',
                calendarIcon: 'text-emerald-500 dark:text-emerald-400',
                pinIcon: 'text-emerald-500'
            }
            : {
                titleHover: 'group-hover:text-amber-500 dark:group-hover:text-amber-400',
                arrowHover: 'group-hover:bg-amber-500',
                calendarIcon: 'text-amber-500 dark:text-amber-400',
                pinIcon: 'text-amber-500'
            };

    return (
        <div
            onClick={onClick}
            className="group relative p-5 pl-6 rounded-2xl bg-white/80 dark:bg-dark-card/80 backdrop-blur-xl border border-black/5 dark:border-white/10 hover:border-black/15 dark:hover:border-white/25 shadow-glass-card hover:shadow-lg transition-all duration-200 cursor-pointer flex flex-col gap-3.5 overflow-hidden active:scale-[0.99]"
        >
            {/* Left Edge Indicator Glow Accent */}
            <div className={`absolute left-0 top-3 bottom-3 w-1.5 rounded-r-full ${indicatorGlow}`} />

            {/* Top Row: Title, Subtitle, & Hover Action Arrow */}
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <h3 className={`text-base font-bold text-light-text dark:text-dark-text tracking-tight truncate ${stageColors.titleHover} transition-colors`}>
                        {trip.name}
                    </h3>
                    {(trip.subtitle || trip.description) && (
                        <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary truncate mt-0.5 font-medium">
                            {trip.subtitle || trip.description}
                        </p>
                    )}
                </div>

                {/* Right Arrow Micro-Action */}
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center bg-black/5 dark:bg-white/5 ${stageColors.arrowHover} group-hover:text-white transition-all text-light-text-secondary dark:text-dark-text-secondary shrink-0`}>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </div>
            </div>

            {/* Middle Row: Timeline Date Range Badge & Duration */}
            <div className="flex items-center gap-2.5 text-xs text-light-text-secondary dark:text-dark-text-secondary font-medium flex-wrap">
                <div className="flex items-center gap-1.5">
                    <CalendarBlank className={`w-4 h-4 shrink-0 ${stageColors.calendarIcon} opacity-90`} weight="duotone" />
                    <span className="font-semibold text-light-text dark:text-dark-text">
                        {formatDateRange(trip.startDate, trip.endDate)}
                    </span>
                </div>
                {durationDays && (
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10 text-light-text-secondary dark:text-dark-text-secondary">
                        {durationDays} {durationDays === 1 ? 'day' : 'days'}
                    </span>
                )}
            </div>

            {/* Bottom Row: Destination Chips & Transport Icons */}
            <div className="flex items-center justify-between gap-2 pt-3 border-t border-black/5 dark:border-white/5 flex-wrap">
                {/* Destination Chips */}
                <div className="flex flex-wrap items-center gap-1.5 min-w-0 flex-1">
                    {destinationsList.length > 0 ? (
                        destinationsList.slice(0, 2).map((dest, i) => (
                            <span 
                                key={i}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold bg-black/5 dark:bg-white/5 text-light-text dark:text-dark-text border border-black/5 dark:border-white/5 truncate max-w-[170px]"
                            >
                                <MapPin className={`w-3 h-3 ${stageColors.pinIcon} shrink-0`} weight="fill" />
                                <span className="truncate">{dest}</span>
                            </span>
                        ))
                    ) : (
                        <span className="text-2xs text-light-text-secondary dark:text-dark-text-secondary font-medium italic">
                            No destination specified
                        </span>
                    )}

                    {destinationsList.length > 2 && (
                        <span className="text-[10px] font-mono font-bold px-2 py-1 rounded-xl bg-black/5 dark:bg-white/5 text-light-text-secondary dark:text-dark-text-secondary border border-black/5 dark:border-white/5">
                            +{destinationsList.length - 2}
                        </span>
                    )}
                </div>

                {/* Transport Mode Badges */}
                {transportModes.length > 0 && (
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 text-light-text-secondary dark:text-dark-text-secondary shrink-0">
                        {transportModes.slice(0, 3).map((mode, i) => {
                            switch (mode) {
                                case 'Flight': return <Airplane key={i} className="w-3.5 h-3.5 text-light-text dark:text-dark-text" weight="bold" />;
                                case 'Train': return <Train key={i} className="w-3.5 h-3.5 text-light-text dark:text-dark-text" weight="bold" />;
                                case 'Car': return <Car key={i} className="w-3.5 h-3.5 text-light-text dark:text-dark-text" weight="bold" />;
                                case 'Ferry':
                                case 'Cruise': return <Boat key={i} className="w-3.5 h-3.5 text-light-text dark:text-dark-text" weight="bold" />;
                                default: return null;
                            }
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

interface EmptyBucketPlaceholderProps {
    stage: string;
    label: string;
    actionLabel: string;
    onAction: () => void;
}

const EmptyBucketPlaceholder: React.FC<EmptyBucketPlaceholderProps> = ({ stage, label, actionLabel, onAction }) => {
    return (
        <div className="p-8 rounded-2xl border border-dashed border-black/10 dark:border-white/10 flex flex-col items-center justify-center text-center gap-3 bg-black/[0.01] dark:bg-white/[0.01]">
            <div className="w-10 h-10 rounded-2xl bg-black/5 dark:bg-white/5 flex items-center justify-center text-light-text-secondary dark:text-dark-text-secondary">
                <SuitcaseSimple className="w-5 h-5 opacity-60" />
            </div>
            <div>
                <p className="text-xs font-bold text-light-text dark:text-dark-text">
                    {label}
                </p>
                <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5">
                    Start by setting up a trip in this column
                </p>
            </div>
            <button
                type="button"
                onClick={onAction}
                className="mt-1 px-3.5 py-1.5 rounded-xl text-2xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 transition-all cursor-pointer flex items-center gap-1.5"
            >
                <Plus className="w-3 h-3" weight="bold" />
                <span>{actionLabel}</span>
            </button>
        </div>
    );
};
