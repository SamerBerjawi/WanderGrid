import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
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
    ArrowRight,
    Compass,
    SuitcaseSimple,
    Clock,
    CalendarCheck,
    MagnifyingGlass,
    CaretDown,
    X,
    Funnel,
    Check
} from '@phosphor-icons/react';
import GlassPanel from '../components/glass/GlassPanel';
import { Button } from '../components/ui';
import { LiquidGlassSelect } from '../components/LiquidGlassSelect';
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

const MONTHS = [
    { value: '01', label: 'Jan' },
    { value: '02', label: 'Feb' },
    { value: '03', label: 'Mar' },
    { value: '04', label: 'Apr' },
    { value: '05', label: 'May' },
    { value: '06', label: 'Jun' },
    { value: '07', label: 'Jul' },
    { value: '08', label: 'Aug' },
    { value: '09', label: 'Sep' },
    { value: '10', label: 'Oct' },
    { value: '11', label: 'Nov' },
    { value: '12', label: 'Dec' },
];



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

    // 4. Multi-Attribute Filter State
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedYear, setSelectedYear] = useState<string>('all');
    const [selectedMonth, setSelectedMonth] = useState<string>('all');
    const [selectedDestination, setSelectedDestination] = useState<string>('all');

    // Responsive screen-size detection for clean mobile layout
    const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 640 : false));

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 640);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Dynamically derive available filter options
    const { availableYears, availableDestinations } = useMemo(() => {
        const yearsSet = new Set<string>();
        const destsSet = new Set<string>();

        trips.forEach(t => {
            if (t.startDate) {
                const y = t.startDate.slice(0, 4);
                if (y && !isNaN(Number(y))) yearsSet.add(y);
            }
            if (t.endDate) {
                const y = t.endDate.slice(0, 4);
                if (y && !isNaN(Number(y))) yearsSet.add(y);
            }
            if (t.locations && t.locations.length > 0) {
                t.locations.forEach(l => {
                    if (l.name) destsSet.add(l.name);
                });
            } else if (t.location) {
                t.location.split(',').forEach(s => {
                    const trimmed = s.trim();
                    if (trimmed) destsSet.add(trimmed);
                });
            }
        });

        return {
            availableYears: Array.from(yearsSet).sort((a, b) => b.localeCompare(a)),
            availableDestinations: Array.from(destsSet).sort((a, b) => a.localeCompare(b))
        };
    }, [trips]);

    const isFilterActive = Boolean(
        searchQuery.trim() || 
        selectedYear !== 'all' || 
        selectedMonth !== 'all' || 
        selectedDestination !== 'all'
    );

    const handleClearFilters = () => {
        setSearchQuery('');
        setSelectedYear('all');
        setSelectedMonth('all');
        setSelectedDestination('all');
    };

    // Filter Trips based on Title/Subtitle/Description, Year, Month, Destination
    const filteredTrips = useMemo(() => {
        const q = searchQuery.toLowerCase().trim();

        return trips.filter(trip => {
            if (trip.status === 'Cancelled') return false;

            // Search query match
            if (q) {
                const nameMatch = (trip.name || '').toLowerCase().includes(q);
                const subtitleMatch = (trip.subtitle || '').toLowerCase().includes(q);
                const descMatch = (trip.description || '').toLowerCase().includes(q);
                const locationMatch = (trip.location || '').toLowerCase().includes(q);
                const locationsMatch = (trip.locations || []).some(l => (l.name || '').toLowerCase().includes(q));

                if (!nameMatch && !subtitleMatch && !descMatch && !locationMatch && !locationsMatch) {
                    return false;
                }
            }

            // Year match
            if (selectedYear !== 'all') {
                const startYear = trip.startDate ? trip.startDate.slice(0, 4) : '';
                const endYear = trip.endDate ? trip.endDate.slice(0, 4) : '';
                if (startYear !== selectedYear && endYear !== selectedYear) {
                    return false;
                }
            }

            // Month match
            if (selectedMonth !== 'all') {
                const startMonth = trip.startDate ? trip.startDate.slice(5, 7) : '';
                const endMonth = trip.endDate ? trip.endDate.slice(5, 7) : '';
                if (startMonth !== selectedMonth && endMonth !== selectedMonth) {
                    return false;
                }
            }

            // Destination match
            if (selectedDestination !== 'all') {
                const hasLoc = (trip.locations || []).some(l => l.name === selectedDestination);
                const hasLocStr = (trip.location || '').split(',').map(s => s.trim()).includes(selectedDestination);
                if (!hasLoc && !hasLocStr) {
                    return false;
                }
            }

            return true;
        });
    }, [trips, searchQuery, selectedYear, selectedMonth, selectedDestination]);

    // Categorize filtered trips into Confirmed, Past, Planned
    const today = new Date().toISOString().split('T')[0];

    const { plannedTrips, confirmedTrips, pastTrips } = useMemo(() => {
        const planned: Trip[] = [];
        const confirmed: Trip[] = [];
        const past: Trip[] = [];

        filteredTrips.forEach(trip => {
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
    }, [filteredTrips, today]);

    const handleOpenNewTrip = (status: 'Planning' | 'Upcoming' | 'Past' = 'Planning') => {
        setDrawerStatus(status);
        setIsNewTripOpen(true);
    };

    return (
        <div className="w-full max-w-[1680px] mx-auto px-2 sm:px-4 lg:px-6 flex flex-col gap-6 animate-fadeIn pb-16">
            
            {/* ========================================================================= */}
            {/* HERO HEADER: Clean Title & Liquid-Glass Action (had-homeassistantdashboard style) */}
            {/* ========================================================================= */}
            <div className="flex items-center justify-between gap-4 w-full pt-1 pb-1">
                {/* Left: Pure Icon (without background and border) + Page Name */}
                <div className="flex items-center gap-3 md:gap-4">
                    <Compass 
                        className="w-9 h-9 md:w-12 md:h-12 text-emerald-500 dark:text-emerald-400 shrink-0" 
                        weight="duotone" 
                    />
                    <h1 className="text-4xl md:text-5xl font-black text-light-text dark:text-white tracking-tight leading-none">
                        Expedition Planner
                    </h1>
                </div>

                {/* Right: + New Trip Button (Matches Add Flight in Flights.tsx with duotone icon) */}
                <Button 
                    variant="primary" 
                    className="rounded-2xl cursor-pointer hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 px-6 shrink-0"
                    onClick={() => handleOpenNewTrip('Planning')}
                    icon={<Plus className="w-4 h-4" weight="duotone" />}
                >
                    New Trip
                </Button>
            </div>

            {/* ========================================================================= */}
            {/* FLOATING MAP-STYLE TAB SELECTOR & MULTI-FILTER BAR                        */}
            {/* ========================================================================= */}
            {/* ========================================================================= */}
            {/* RESPONSIVE BAR: TABS (LEFT) & FILTER (RIGHT) ON DESKTOP, STACKED ON MOBILE*/}
            {/* ========================================================================= */}
            <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 w-full">
                {/* 1. Tabs Row (Left on desktop) */}
                <div className="flex items-center justify-start overflow-x-auto no-scrollbar py-0.5 shrink-0">
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
                                    ? filteredTrips.length 
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
                                                className={`w-5 h-5 shrink-0 transition-colors duration-200 ${config.color}`} 
                                                weight="duotone" 
                                            />
                                            <span className={`tracking-tight ${isSelected ? 'inline' : 'hidden sm:inline'}`}>
                                                {config.label}
                                            </span>
                                            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold border transition-colors ${config.badgeStyle} ${
                                                isSelected 
                                                    ? 'inline shadow-xs' 
                                                    : 'hidden sm:inline opacity-90 hover:opacity-100'
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

                {/* 2. Filter Controls Bar (Right on desktop, below on mobile) */}
                <div className="flex-1 xl:max-w-4xl w-full">
                    <GlassPanel
                        className="wg-glass-pill shadow-glass-card w-full"
                        padding={isMobile ? "6px 8px" : "4px 6px"}
                        overrides={{ borderRadius: isMobile ? 22 : 9999 }}
                    >
                        <div className="flex flex-col sm:flex-row items-center gap-1.5 sm:gap-2 w-full">
                            {/* Search Input */}
                            <div className="relative w-full sm:flex-1 min-w-[140px] flex items-center">
                                <MagnifyingGlass className="absolute left-3.5 w-4 h-4 text-light-text-secondary dark:text-dark-text-secondary pointer-events-none" weight="duotone" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder={isMobile ? "Filter trips..." : "Filter by title, subtitle, destination..."}
                                    className="w-full h-10 sm:h-11 pl-10 pr-9 bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-full text-xs font-semibold text-light-text dark:text-dark-text placeholder-light-text-secondary/60 dark:placeholder-dark-text-secondary/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all"
                                />
                                {searchQuery && (
                                    <button
                                        type="button"
                                        onClick={() => setSearchQuery('')}
                                        className="absolute right-3 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text cursor-pointer p-0.5"
                                        title="Clear search"
                                    >
                                        <X className="w-3.5 h-3.5" weight="duotone" />
                                    </button>
                                )}
                            </div>

                            {/* Selectors Row: Grid of 3 on mobile (fits properly without scrolling), Flex row on desktop */}
                            <div className={isMobile ? "grid grid-cols-3 gap-1.5 w-full shrink-0" : "flex items-center gap-1.5 sm:gap-2 shrink-0"}>
                                {/* Year Filter */}
                                <LiquidGlassSelect
                                    value={selectedYear}
                                    onChange={setSelectedYear}
                                    options={[
                                        { value: 'all', label: 'All Years' },
                                        ...availableYears.map(y => ({ value: y, label: y }))
                                    ]}
                                    placeholder="All Years"
                                    mobilePlaceholder="Year"
                                    icon={CalendarBlank}
                                    align="left"
                                    isMobile={isMobile}
                                />

                                {/* Month Filter */}
                                <LiquidGlassSelect
                                    value={selectedMonth}
                                    onChange={setSelectedMonth}
                                    options={[
                                        { value: 'all', label: 'All Months' },
                                        ...MONTHS.map(m => ({ value: m.value, label: m.label }))
                                    ]}
                                    placeholder="All Months"
                                    mobilePlaceholder="Month"
                                    icon={Clock}
                                    align={isMobile ? 'center' : 'left'}
                                    isMobile={isMobile}
                                />

                                {/* Destination Filter */}
                                <LiquidGlassSelect
                                    value={selectedDestination}
                                    onChange={setSelectedDestination}
                                    options={[
                                        { value: 'all', label: 'All Destinations' },
                                        ...availableDestinations.map(d => ({ value: d, label: d }))
                                    ]}
                                    placeholder="All Destinations"
                                    mobilePlaceholder="Dest"
                                    icon={MapPin}
                                    align="right"
                                    searchable
                                    isMobile={isMobile}
                                />
                            </div>

                            {/* Reset Button */}
                            {isFilterActive && (
                                <button
                                    type="button"
                                    onClick={handleClearFilters}
                                    className="w-full sm:w-auto h-9 sm:h-11 px-3 sm:px-4 rounded-full bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-400 border border-rose-500/20 text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0 active:scale-95 whitespace-nowrap"
                                    title="Clear all filters"
                                >
                                    <X className="w-3.5 h-3.5" weight="duotone" />
                                    <span className="whitespace-nowrap">Clear ({filteredTrips.length})</span>
                                </button>
                            )}
                        </div>
                    </GlassPanel>
                </div>
            </div>

            {/* ========================================================================= */}
            {/* 3-COLUMN PANORAMIC BUCKETS: Confirmed, Past, Planned                      */}
            {/* ========================================================================= */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                {/* --------------------------------------------------------------------- */}
                {/* BUCKET 1: CONFIRMED (Aviation / Sky)                                  */}
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
                                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-white bg-gradient-to-br from-sky-500 to-blue-600 shadow-md shadow-sky-500/20 shrink-0">
                                        <CheckCircle className="w-5 h-5" weight="duotone" />
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
                                            Upcoming bookings &amp; confirmed itineraries
                                        </p>
                                    </div>
                                </div>

                                <GlassPanel
                                    className="wg-glass-pill shadow-xs transition-transform hover:scale-105 active:scale-95 shrink-0"
                                    padding="0px"
                                    overrides={{ borderRadius: 12 }}
                                >
                                    <button
                                        type="button"
                                        onClick={() => handleOpenNewTrip('Upcoming')}
                                        className="w-9 h-9 rounded-xl flex items-center justify-center text-light-text-secondary dark:text-dark-text-secondary hover:text-sky-500 hover:bg-sky-500/10 transition-colors cursor-pointer"
                                        title="Add confirmed trip"
                                    >
                                        <Plus className="w-4 h-4" weight="duotone" />
                                    </button>
                                </GlassPanel>
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
                                        label={isFilterActive ? "No confirmed trips match filter" : "No confirmed bookings yet"}
                                        actionLabel={isFilterActive ? "Clear Filters" : "Add confirmed trip"}
                                        onAction={isFilterActive ? handleClearFilters : () => handleOpenNewTrip('Upcoming')}
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
                                        <ClockCounterClockwise className="w-5 h-5" weight="duotone" />
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

                                <GlassPanel
                                    className="wg-glass-pill shadow-xs transition-transform hover:scale-105 active:scale-95 shrink-0"
                                    padding="0px"
                                    overrides={{ borderRadius: 12 }}
                                >
                                    <button
                                        type="button"
                                        onClick={() => handleOpenNewTrip('Past')}
                                        className="w-9 h-9 rounded-xl flex items-center justify-center text-light-text-secondary dark:text-dark-text-secondary hover:text-emerald-500 hover:bg-emerald-500/10 transition-colors cursor-pointer"
                                        title="Log past trip"
                                    >
                                        <Plus className="w-4 h-4" weight="duotone" />
                                    </button>
                                </GlassPanel>
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
                                        label={isFilterActive ? "No past trips match filter" : "No past trips recorded"}
                                        actionLabel={isFilterActive ? "Clear Filters" : "Log a past journey"}
                                        onAction={isFilterActive ? handleClearFilters : () => handleOpenNewTrip('Past')}
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
                                        <Clock className="w-5 h-5" weight="duotone" />
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
                                            Ideas, drafts, &amp; wishlist expeditions
                                        </p>
                                    </div>
                                </div>

                                <GlassPanel
                                    className="wg-glass-pill shadow-xs transition-transform hover:scale-105 active:scale-95 shrink-0"
                                    padding="0px"
                                    overrides={{ borderRadius: 12 }}
                                >
                                    <button
                                        type="button"
                                        onClick={() => handleOpenNewTrip('Planning')}
                                        className="w-9 h-9 rounded-xl flex items-center justify-center text-light-text-secondary dark:text-dark-text-secondary hover:text-amber-500 hover:bg-amber-500/10 transition-colors cursor-pointer"
                                        title="Add draft plan"
                                    >
                                        <Plus className="w-4 h-4" weight="duotone" />
                                    </button>
                                </GlassPanel>
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
                                        label={isFilterActive ? "No planned trips match filter" : "No draft plans yet"}
                                        actionLabel={isFilterActive ? "Clear Filters" : "Create new plan"}
                                        onAction={isFilterActive ? handleClearFilters : () => handleOpenNewTrip('Planning')}
                                    />
                                )}
                            </div>
                        </GlassPanel>
                    </div>
                )}

            </div>

            {/* Slide-out Drawer for Quick Trip Creation */}
            <NewTripDrawer 
                isOpen={isNewTripOpen}
                initialStatus={drawerStatus}
                onClose={() => setIsNewTripOpen(false)}
                onTripCreated={() => {
                    setIsNewTripOpen(false);
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
                calendarIcon: 'text-sky-500 dark:text-sky-400',
                pinIcon: 'text-sky-500',
                arrowAction: 'hover:!bg-sky-500 hover:!text-white hover:!border-sky-400 hover:shadow-[0_0_12px_rgba(14,165,233,0.5)] active:!bg-sky-600 group-hover:bg-sky-500/15 group-hover:text-sky-600 dark:group-hover:text-sky-300 group-hover:border-sky-500/30'
            }
            : stage === 'emerald'
            ? {
                titleHover: 'group-hover:text-emerald-500 dark:group-hover:text-emerald-400',
                calendarIcon: 'text-emerald-500 dark:text-emerald-400',
                pinIcon: 'text-emerald-500',
                arrowAction: 'hover:!bg-emerald-500 hover:!text-white hover:!border-emerald-400 hover:shadow-[0_0_12px_rgba(16,185,129,0.5)] active:!bg-emerald-600 group-hover:bg-emerald-500/15 group-hover:text-emerald-600 dark:group-hover:text-emerald-300 group-hover:border-emerald-500/30'
            }
            : {
                titleHover: 'group-hover:text-amber-500 dark:group-hover:text-amber-400',
                calendarIcon: 'text-amber-500 dark:text-amber-400',
                pinIcon: 'text-amber-500',
                arrowAction: 'hover:!bg-amber-500 hover:!text-white hover:!border-amber-400 hover:shadow-[0_0_12px_rgba(245,158,11,0.5)] active:!bg-amber-600 group-hover:bg-amber-500/15 group-hover:text-amber-600 dark:group-hover:text-amber-300 group-hover:border-amber-500/30'
            };

    return (
        <GlassPanel
            className="wg-glass-card shadow-glass-card w-full cursor-pointer overflow-hidden transition-all duration-200 active:scale-[0.99]"
            padding="0px"
            overrides={{ borderRadius: 24 }}
            onClick={onClick}
        >
            <div
                className="group relative p-5 pl-6 bg-white/60 dark:bg-dark-card/65 backdrop-blur-xl border border-black/10 dark:border-white/15 hover:border-black/20 dark:hover:border-white/30 hover:shadow-xl transition-all duration-200 flex flex-col gap-3.5 overflow-hidden"
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

                    {/* Right Arrow Micro-Action: Liquid-Glass Neutral by default, Accent on Hover/Click */}
                    <GlassPanel
                        className="wg-glass-pill shadow-xs transition-transform group-hover:scale-105 active:scale-95 shrink-0"
                        padding="0px"
                        overrides={{ borderRadius: 12 }}
                    >
                        <div 
                            className={`w-8 h-8 rounded-xl flex items-center justify-center bg-white/50 dark:bg-white/[0.06] backdrop-blur-md border border-black/5 dark:border-white/10 text-light-text-secondary dark:text-dark-text-secondary ${stageColors.arrowAction} transition-all duration-200 cursor-pointer`}
                        >
                            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" weight="duotone" />
                        </div>
                    </GlassPanel>
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
                        <span 
                            style={{ WebkitBackdropFilter: 'blur(8px)' }}
                            className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full border backdrop-blur-md shadow-xs ${
                                stage === 'sky'
                                    ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30'
                                    : stage === 'emerald'
                                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                                    : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
                            }`}
                        >
                            {durationDays} {durationDays === 1 ? 'day' : 'days'}
                        </span>
                    )}
                </div>

                {/* Bottom Row: Destination Chips & Transport Icons */}
                <div className="flex items-center justify-between gap-2 pt-3 border-t border-black/5 dark:border-white/5 flex-wrap">
                    {/* Destination Chips - Colored not neutral */}
                    <div className="flex flex-wrap items-center gap-1.5 min-w-0 flex-1">
                        {destinationsList.length > 0 ? (
                            destinationsList.slice(0, 2).map((dest, i) => (
                                <span 
                                    key={i}
                                    style={{ WebkitBackdropFilter: 'blur(8px)' }}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold bg-cyan-500/15 dark:bg-cyan-500/20 text-cyan-800 dark:text-cyan-200 border border-cyan-500/30 shadow-xs backdrop-blur-md truncate max-w-[170px]"
                                >
                                    <MapPin className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" weight="duotone" />
                                    <span className="truncate">{dest}</span>
                                </span>
                            ))
                        ) : (
                            <span className="text-2xs text-light-text-secondary dark:text-dark-text-secondary font-medium italic">
                                No destination specified
                            </span>
                        )}

                        {destinationsList.length > 2 && (
                            <span 
                                style={{ WebkitBackdropFilter: 'blur(8px)' }}
                                className="text-[10px] font-mono font-bold px-2 py-1 rounded-xl bg-cyan-500/20 text-cyan-800 dark:text-cyan-200 border border-cyan-500/30 backdrop-blur-md"
                            >
                                +{destinationsList.length - 2}
                            </span>
                        )}
                    </div>

                    {/* Transport Mode Badges - Individual colors for each transport method */}
                    {transportModes.length > 0 && (
                        <div 
                            style={{ WebkitBackdropFilter: 'blur(8px)' }}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-black/5 dark:bg-white/5 backdrop-blur-md border border-black/5 dark:border-white/10 shadow-xs shrink-0"
                        >
                            {transportModes.slice(0, 3).map((mode, i) => {
                                switch (mode as string) {
                                    case 'Flight': 
                                        return (
                                            <span key={i} title="Flight">
                                                <Airplane className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400 shrink-0" weight="duotone" />
                                            </span>
                                        );
                                    case 'Train': 
                                        return (
                                            <span key={i} title="Train">
                                                <Train className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400 shrink-0" weight="duotone" />
                                            </span>
                                        );
                                    case 'Car':
                                    case 'Car Rental':
                                    case 'Personal Car': 
                                        return (
                                            <span key={i} title="Road / Car">
                                                <Car className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" weight="duotone" />
                                            </span>
                                        );
                                    case 'Ferry':
                                    case 'Cruise': 
                                        return (
                                            <span key={i} title="Sea / Boat">
                                                <Boat className="w-3.5 h-3.5 text-teal-500 dark:text-teal-400 shrink-0" weight="duotone" />
                                            </span>
                                        );
                                    default: 
                                        return null;
                                }
                            })}
                        </div>
                    )}
                </div>
            </div>
        </GlassPanel>
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
                <SuitcaseSimple className="w-5 h-5 opacity-60" weight="duotone" />
            </div>
            <div>
                <p className="text-xs font-bold text-light-text dark:text-dark-text">
                    {label}
                </p>
                <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5">
                    Start by setting up a trip in this column
                </p>
            </div>
            <GlassPanel
                className="wg-glass-pill shadow-xs active:scale-95 transition-transform"
                padding="0px"
                overrides={{ borderRadius: 12 }}
            >
                <button
                    type="button"
                    onClick={onAction}
                    className="px-3.5 py-1.5 rounded-xl text-2xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 transition-all cursor-pointer flex items-center gap-1.5"
                >
                    <Plus className="w-3 h-3" weight="duotone" />
                    <span>{actionLabel}</span>
                </button>
            </GlassPanel>
        </div>
    );
};
