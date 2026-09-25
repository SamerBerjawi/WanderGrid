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
    ArrowUpRight,
    Bed,
    Users,
    Compass,
    AirplaneTilt,
    MapTrifold,
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
import { Trip, User } from '../types';
import { formatDateRange } from '../utils/formatters';
import { NewTripDrawer } from '../components/NewTripDrawer';
import { TripSetupBoard } from '../components/TripSetupBoard';

interface PlannerViewProps {
    onTripClick?: (tripId: string) => void;
    users?: User[];
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



export const PlannerView: React.FC<PlannerViewProps> = ({ onTripClick, users: usersProp }) => {
    // 1. Reactive SWR Trips Synchronization
    const { data: tripsData } = useWanderSync<Trip[]>(
        'planner_trips',
        () => dataService.getTrips()
    );

    const trips = useMemo(() => tripsData || [], [tripsData]);

    const { data: usersData } = useWanderSync<User[]>(
        'planner_users',
        () => dataService.getUsers()
    );

    const users = useMemo(() => usersProp || usersData || [], [usersProp, usersData]);

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

    // 5. Collapsible Bucket Columns State (Past, Confirmed, Planned)
    const [collapsedBuckets, setCollapsedBuckets] = useState<Record<'past' | 'confirmed' | 'planned', boolean>>({
        past: false,
        confirmed: false,
        planned: false
    });

    const toggleBucket = (bucket: 'past' | 'confirmed' | 'planned') => {
        setCollapsedBuckets(prev => ({
            ...prev,
            [bucket]: !prev[bucket]
        }));
    };

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

    if (isNewTripOpen) {
        return (
            <TripSetupBoard 
                isOpen={isNewTripOpen}
                initialStatus={drawerStatus}
                users={users}
                onClose={() => setIsNewTripOpen(false)}
                onTripCreated={(savedTrip) => {
                    setIsNewTripOpen(false);
                    if (onTripClick && savedTrip?.id) {
                        onTripClick(savedTrip.id);
                    }
                }}
            />
        );
    }

    return (
        <div className="w-full max-w-[1680px] mx-auto pt-2 sm:pt-4 px-1 sm:px-4 md:px-6 lg:px-8 flex flex-col gap-5 sm:gap-6 animate-fadeIn pb-16">
            
            {/* ========================================================================= */}
            {/* HERO HEADER: Title Aligned Left, Button Aligned Right on Mobile & Desktop */}
            {/* ========================================================================= */}
            <div className="flex flex-row items-center justify-between gap-2.5 sm:gap-4 w-full pt-1 pb-1">
                {/* Left: Pure Icon + Responsive Page Name (Aligned Left) */}
                <div className="flex items-center justify-start gap-2 sm:gap-3 md:gap-4 min-w-0">
                    <MapTrifold 
                        className="w-7 h-7 sm:w-9 sm:h-9 md:w-12 md:h-12 text-emerald-500 dark:text-emerald-400 shrink-0" 
                        weight="duotone" 
                    />
                    <h1 className="text-xl sm:text-3xl md:text-5xl font-black text-light-text dark:text-white tracking-tight leading-tight sm:leading-none truncate sm:overflow-visible">
                        Expedition Planner
                    </h1>
                </div>

                {/* Right: + New Trip Button (Aligned Right on Mobile & Desktop) */}
                <div className="flex items-center justify-end shrink-0">
                    <Button 
                        variant="primary" 
                        color="emerald"
                        className="shrink-0"
                        onClick={() => handleOpenNewTrip('Planning')}
                        icon={<Plus className="w-4 h-4" />}
                    >
                        New Trip
                    </Button>
                </div>
            </div>

            {/* ========================================================================= */}
            {/* FLOATING MAP-STYLE TAB SELECTOR & MULTI-FILTER BAR                        */}
            {/* ========================================================================= */}
            {/* ========================================================================= */}
            {/* RESPONSIVE BAR: TABS (LEFT) & FILTER (RIGHT) ON DESKTOP, STACKED ON MOBILE*/}
            {/* ========================================================================= */}
            <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 w-full">
                {/* 1. Tabs Row (Left on desktop, centered on mobile) - Unclipped for smooth shadow */}
                <div className="flex items-center justify-center sm:justify-start overflow-x-auto sm:overflow-visible no-scrollbar p-3 -m-3 shrink-0 w-full sm:w-auto">
                    <GlassPanel
                        className="wg-glass-pill shadow-lg shadow-black/5 dark:shadow-black/25 shrink-0"
                        padding="4px 6px"
                        overrides={{ borderRadius: 9999 }}
                    >
                        <div className="flex gap-1 relative items-center">
                            {(['past', 'confirmed', 'planned', 'all'] as TabKey[]).map((tabKey) => {
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
            {/* 3-COLUMN PANORAMIC BUCKETS: Past, Confirmed, Planned                      */}
            {/* ========================================================================= */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                {/* --------------------------------------------------------------------- */}
                {/* BUCKET 1: PAST (Land & Sea / Emerald)                                 */}
                {/* --------------------------------------------------------------------- */}
                {(activeTab === 'all' || activeTab === 'past') && (
                    <div className={`flex flex-col overflow-hidden rounded-[28px] ${activeTab === 'past' ? 'lg:col-span-12' : 'lg:col-span-4'}`}>
                        <GlassPanel
                            className="wg-glass-card shadow-glass-card flex flex-col h-full overflow-hidden border border-black/5 dark:border-white/10"
                            overrides={{ borderRadius: 28 }}
                            padding="0px"
                        >
                            <div className="flex flex-col h-full w-full overflow-hidden rounded-[28px]">
                                {/* Bucket Header Banner - Clickable to collapse/expand */}
                                <div 
                                    onClick={() => toggleBucket('past')}
                                    className={`p-5 flex items-center justify-between bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent shrink-0 cursor-pointer select-none transition-colors hover:from-emerald-500/15 ${
                                        collapsedBuckets.past ? '' : 'border-b border-black/10 dark:border-white/5'
                                    }`}
                                >
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

                                    <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
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
                                                <Plus className="w-4 h-4" />
                                            </button>
                                        </GlassPanel>

                                        <GlassPanel
                                            className="wg-glass-pill shadow-xs transition-transform hover:scale-105 active:scale-95 shrink-0"
                                            padding="0px"
                                            overrides={{ borderRadius: 12 }}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => toggleBucket('past')}
                                                className="w-9 h-9 rounded-xl flex items-center justify-center text-light-text-secondary dark:text-dark-text-secondary hover:text-emerald-500 hover:bg-emerald-500/10 transition-colors cursor-pointer"
                                                title={collapsedBuckets.past ? "Expand Past trips" : "Collapse Past trips"}
                                                aria-expanded={!collapsedBuckets.past}
                                            >
                                                <CaretDown className={`w-4 h-4 transition-transform duration-300 ${collapsedBuckets.past ? '-rotate-90' : 'rotate-0'}`} />
                                            </button>
                                        </GlassPanel>
                                    </div>
                                </div>

                                {/* Bucket Card Inventory - Animated Collapsible */}
                                <AnimatePresence initial={false}>
                                    {!collapsedBuckets.past && (
                                        <motion.div
                                            key="past-column-content"
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.25, ease: "easeInOut" }}
                                            className="overflow-hidden flex flex-col flex-1"
                                        >
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
                                                        label={isFilterActive ? "No past trips match filter" : "No logged past journeys yet"}
                                                        actionLabel={isFilterActive ? "Clear Filters" : "Log first trip"}
                                                        onAction={isFilterActive ? handleClearFilters : () => handleOpenNewTrip('Past')}
                                                    />
                                                )}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </GlassPanel>
                    </div>
                )}

                {/* --------------------------------------------------------------------- */}
                {/* BUCKET 2: CONFIRMED (Aviation / Sky)                                  */}
                {/* --------------------------------------------------------------------- */}
                {(activeTab === 'all' || activeTab === 'confirmed') && (
                    <div className={`flex flex-col overflow-hidden rounded-[28px] ${activeTab === 'confirmed' ? 'lg:col-span-12' : 'lg:col-span-4'}`}>
                        <GlassPanel
                            className="wg-glass-card shadow-glass-card flex flex-col h-full overflow-hidden border border-black/5 dark:border-white/10"
                            overrides={{ borderRadius: 28 }}
                            padding="0px"
                        >
                            <div className="flex flex-col h-full w-full overflow-hidden rounded-[28px]">
                                {/* Bucket Header Banner - Clickable to collapse/expand */}
                                <div 
                                    onClick={() => toggleBucket('confirmed')}
                                    className={`p-5 flex items-center justify-between bg-gradient-to-r from-sky-500/10 via-sky-500/5 to-transparent shrink-0 cursor-pointer select-none transition-colors hover:from-sky-500/15 ${
                                        collapsedBuckets.confirmed ? '' : 'border-b border-black/10 dark:border-white/5'
                                    }`}
                                >
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

                                    <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
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
                                                <Plus className="w-4 h-4" />
                                            </button>
                                        </GlassPanel>

                                        <GlassPanel
                                            className="wg-glass-pill shadow-xs transition-transform hover:scale-105 active:scale-95 shrink-0"
                                            padding="0px"
                                            overrides={{ borderRadius: 12 }}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => toggleBucket('confirmed')}
                                                className="w-9 h-9 rounded-xl flex items-center justify-center text-light-text-secondary dark:text-dark-text-secondary hover:text-sky-500 hover:bg-sky-500/10 transition-colors cursor-pointer"
                                                title={collapsedBuckets.confirmed ? "Expand Confirmed trips" : "Collapse Confirmed trips"}
                                                aria-expanded={!collapsedBuckets.confirmed}
                                            >
                                                <CaretDown className={`w-4 h-4 transition-transform duration-300 ${collapsedBuckets.confirmed ? '-rotate-90' : 'rotate-0'}`} />
                                            </button>
                                        </GlassPanel>
                                    </div>
                                </div>

                                {/* Bucket Card Inventory - Animated Collapsible */}
                                <AnimatePresence initial={false}>
                                    {!collapsedBuckets.confirmed && (
                                        <motion.div
                                            key="confirmed-column-content"
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.25, ease: "easeInOut" }}
                                            className="overflow-hidden flex flex-col flex-1"
                                        >
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
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </GlassPanel>
                    </div>
                )}

                {/* --------------------------------------------------------------------- */}
                {/* BUCKET 3: PLANNED (Scratch / Amber)                                   */}
                {/* --------------------------------------------------------------------- */}
                {(activeTab === 'all' || activeTab === 'planned') && (
                    <div className={`flex flex-col overflow-hidden rounded-[28px] ${activeTab === 'planned' ? 'lg:col-span-12' : 'lg:col-span-4'}`}>
                        <GlassPanel
                            className="wg-glass-card shadow-glass-card flex flex-col h-full overflow-hidden border border-black/5 dark:border-white/10"
                            overrides={{ borderRadius: 28 }}
                            padding="0px"
                        >
                            <div className="flex flex-col h-full w-full overflow-hidden rounded-[28px]">
                                {/* Bucket Header Banner - Clickable to collapse/expand */}
                                <div 
                                    onClick={() => toggleBucket('planned')}
                                    className={`p-5 flex items-center justify-between bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent shrink-0 cursor-pointer select-none transition-colors hover:from-amber-500/15 ${
                                        collapsedBuckets.planned ? '' : 'border-b border-black/10 dark:border-white/5'
                                    }`}
                                >
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

                                    <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
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
                                                <Plus className="w-4 h-4" />
                                            </button>
                                        </GlassPanel>

                                        <GlassPanel
                                            className="wg-glass-pill shadow-xs transition-transform hover:scale-105 active:scale-95 shrink-0"
                                            padding="0px"
                                            overrides={{ borderRadius: 12 }}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => toggleBucket('planned')}
                                                className="w-9 h-9 rounded-xl flex items-center justify-center text-light-text-secondary dark:text-dark-text-secondary hover:text-amber-500 hover:bg-amber-500/10 transition-colors cursor-pointer"
                                                title={collapsedBuckets.planned ? "Expand Planned trips" : "Collapse Planned trips"}
                                                aria-expanded={!collapsedBuckets.planned}
                                            >
                                                <CaretDown className={`w-4 h-4 transition-transform duration-300 ${collapsedBuckets.planned ? '-rotate-90' : 'rotate-0'}`} />
                                            </button>
                                        </GlassPanel>
                                    </div>
                                </div>

                                {/* Bucket Card Inventory - Animated Collapsible */}
                                <AnimatePresence initial={false}>
                                    {!collapsedBuckets.planned && (
                                        <motion.div
                                            key="planned-column-content"
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.25, ease: "easeInOut" }}
                                            className="overflow-hidden flex flex-col flex-1"
                                        >
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
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </GlassPanel>
                    </div>
                )}

            </div>

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

    // Stage theme configuration
    const stageConfig = useMemo(() => {
        if (stage === 'emerald') {
            return {
                railColor: 'bg-emerald-500',
                railGlow: 'shadow-[0_0_12px_rgba(16,185,129,0.7)]',
                auraColor: 'bg-emerald-500/15',
                ambientWash: 'from-emerald-500/[0.08] via-teal-500/[0.02] to-transparent',
                iconBadge: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400',
                defaultIcon: CheckCircle,
                statusTag: 'COMPLETED',
                statusBadge: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25',
                calendarColor: 'text-emerald-500 dark:text-emerald-400',
                pinColor: 'text-emerald-500 dark:text-emerald-400',
                durationBadge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
                stopsBadge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
                arrowHover: 'group-hover:!bg-emerald-500 group-hover:!text-white group-hover:!border-emerald-400 group-hover:shadow-[0_0_14px_rgba(16,185,129,0.5)]'
            };
        }
        if (stage === 'sky') {
            return {
                railColor: 'bg-sky-500',
                railGlow: 'shadow-[0_0_12px_rgba(14,165,233,0.7)]',
                auraColor: 'bg-sky-500/15',
                ambientWash: 'from-sky-500/[0.08] via-indigo-500/[0.02] to-transparent',
                iconBadge: 'bg-sky-500/10 border-sky-500/25 text-sky-600 dark:text-sky-400',
                defaultIcon: AirplaneTilt,
                statusTag: 'CONFIRMED',
                statusBadge: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/25',
                calendarColor: 'text-sky-500 dark:text-sky-400',
                pinColor: 'text-sky-500 dark:text-sky-400',
                durationBadge: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
                stopsBadge: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
                arrowHover: 'group-hover:!bg-sky-500 group-hover:!text-white group-hover:!border-sky-400 group-hover:shadow-[0_0_14px_rgba(14,165,233,0.5)]'
            };
        }
        return {
            railColor: 'bg-amber-500',
            railGlow: 'shadow-[0_0_12px_rgba(245,158,11,0.7)]',
            auraColor: 'bg-amber-500/15',
            ambientWash: 'from-amber-500/[0.08] via-orange-500/[0.02] to-transparent',
            iconBadge: 'bg-amber-500/10 border-amber-500/25 text-amber-600 dark:text-amber-400',
            defaultIcon: Compass,
            statusTag: 'PLANNED',
            statusBadge: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25',
            calendarColor: 'text-amber-500 dark:text-amber-400',
            pinColor: 'text-amber-500 dark:text-amber-400',
            durationBadge: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
            stopsBadge: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
            arrowHover: 'group-hover:!bg-amber-500 group-hover:!text-white group-hover:!border-amber-400 group-hover:shadow-[0_0_14px_rgba(245,158,11,0.5)]'
        };
    }, [stage]);

    const DefaultStageIcon = stageConfig.defaultIcon;

    return (
        <GlassPanel
            className="wg-glass-card shadow-glass-card hover:shadow-2xl transition-all duration-300 w-full cursor-pointer overflow-hidden rounded-[26px] active:scale-[0.99]"
            padding="0px"
            overrides={{ borderRadius: 26 }}
            onClick={onClick}
        >
            <div
                className={`group relative p-5 bg-white/70 dark:bg-dark-card/75 backdrop-blur-xl border border-black/8 dark:border-white/10 hover:border-black/20 dark:hover:border-white/25 transition-all duration-300 flex flex-col gap-3.5 overflow-hidden rounded-[26px] bg-gradient-to-br ${stageConfig.ambientWash}`}
            >
                {/* Stage Ambient Light Glow (Top-Left) */}
                <div 
                    className={`w-36 h-36 rounded-full absolute -top-12 -left-12 ${stageConfig.auraColor} blur-2xl pointer-events-none opacity-40 group-hover:opacity-75 transition-opacity duration-500`} 
                />

                {/* Left Edge Tactile Indicator Rail */}
                <div className={`absolute left-0 top-3.5 bottom-3.5 w-1.5 rounded-r-full ${stageConfig.railColor} ${stageConfig.railGlow} transition-all duration-300 group-hover:w-2 group-hover:opacity-100 opacity-90`} />

                {/* Top Row: Identity Icon, Title & Micro-Action */}
                <div className="flex items-start justify-between gap-3 relative z-10 pl-2">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                        {/* Micro-Icon / Emoji Surface */}
                        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border shadow-xs transition-transform duration-300 group-hover:scale-105 backdrop-blur-md ${stageConfig.iconBadge}`}>
                            {trip.icon ? (
                                <span className="text-xl leading-none select-none">{trip.icon}</span>
                            ) : (
                                <DefaultStageIcon className="w-5 h-5" weight="duotone" />
                            )}
                        </div>

                        {/* Title & Optional Subtitle */}
                        <div className="min-w-0 flex-1">
                            <h3 className="text-base sm:text-lg font-bold text-light-text dark:text-dark-text tracking-tight truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                                {trip.name}
                            </h3>
                            {(trip.subtitle || trip.description) && (
                                <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary truncate mt-0.5 font-medium">
                                    {trip.subtitle || trip.description}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Right Arrow Micro-Action Trigger */}
                    <div 
                        className={`w-10 h-10 min-w-[40px] min-h-[40px] rounded-2xl flex items-center justify-center bg-black/5 dark:bg-white/[0.06] backdrop-blur-md border border-black/5 dark:border-white/10 text-light-text-secondary dark:text-dark-text-secondary ${stageConfig.arrowHover} transition-all duration-300 shrink-0 shadow-xs active:scale-95 cursor-pointer`}
                        aria-label="View trip details"
                    >
                        <ArrowUpRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" weight="bold" />
                    </div>
                </div>

                {/* Middle Row: Clean Timeline Date Range & Duration (No border, no background) */}
                <div className="flex items-center gap-2.5 text-xs text-light-text-secondary dark:text-dark-text-secondary font-medium flex-wrap relative z-10 pl-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <CalendarBlank className={`w-4 h-4 shrink-0 ${stageConfig.calendarColor} opacity-90`} weight="duotone" />
                        <span className="font-semibold text-light-text dark:text-dark-text">
                            {formatDateRange(trip.startDate, trip.endDate)}
                        </span>
                    </div>
                    {durationDays && (
                        <span 
                            style={{ WebkitBackdropFilter: 'blur(8px)' }}
                            className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full border backdrop-blur-md shadow-xs ${stageConfig.durationBadge}`}
                        >
                            {durationDays} {durationDays === 1 ? 'day' : 'days'}
                        </span>
                    )}
                </div>

                {/* Route Row: Origin ➔ Destination Journey Itinerary with Liquid-Glass Styling */}
                <div className="flex items-center gap-2 relative z-10 pl-2 flex-wrap">
                    {destinationsList.length === 0 ? (
                        <span className="text-2xs text-light-text-secondary dark:text-dark-text-secondary font-medium italic">
                            No destinations specified
                        </span>
                    ) : destinationsList.length === 1 ? (
                        <span 
                            style={{ WebkitBackdropFilter: 'blur(8px)' }}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-cyan-500/15 dark:bg-cyan-500/20 text-cyan-800 dark:text-cyan-200 border border-cyan-500/30 shadow-xs backdrop-blur-md truncate max-w-[240px]"
                        >
                            <MapPin className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" weight="duotone" />
                            <span className="truncate">{destinationsList[0]}</span>
                        </span>
                    ) : (
                        <>
                            <span 
                                style={{ WebkitBackdropFilter: 'blur(8px)' }}
                                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-cyan-500/15 dark:bg-cyan-500/20 text-cyan-800 dark:text-cyan-200 border border-cyan-500/30 shadow-xs backdrop-blur-md truncate max-w-[150px] sm:max-w-[170px]"
                            >
                                <MapPin className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" weight="duotone" />
                                <span className="truncate">{destinationsList[0]}</span>
                            </span>

                            <ArrowRight className="w-3.5 h-3.5 text-cyan-600/70 dark:text-cyan-400/70 shrink-0" />

                            <span 
                                style={{ WebkitBackdropFilter: 'blur(8px)' }}
                                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-cyan-500/15 dark:bg-cyan-500/20 text-cyan-800 dark:text-cyan-200 border border-cyan-500/30 shadow-xs backdrop-blur-md truncate max-w-[150px] sm:max-w-[170px]"
                            >
                                <MapPin className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" weight="duotone" />
                                <span className="truncate">{destinationsList[1]}</span>
                            </span>

                            {destinationsList.length > 2 && (
                                <span 
                                    style={{ WebkitBackdropFilter: 'blur(8px)' }}
                                    title={destinationsList.slice(2).join(', ')}
                                    className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-cyan-500/20 text-cyan-800 dark:text-cyan-200 border border-cyan-500/30 backdrop-blur-md shadow-xs shrink-0 cursor-default"
                                >
                                    +{destinationsList.length - 2}
                                </span>
                            )}
                        </>
                    )}
                </div>

                {/* Bottom Row: Logistics (Stays / Travelers) & Transport Emblems */}
                <div className="flex items-center justify-between gap-2 pt-3 border-t border-black/5 dark:border-white/5 relative z-10 pl-2 flex-wrap">
                    {/* Left: Optional Logistics Badges */}
                    <div className="flex items-center gap-3">
                        {trip.accommodations && trip.accommodations.length > 0 && (
                            <span className="inline-flex items-center gap-1 text-2xs font-semibold text-light-text-secondary dark:text-dark-text-secondary">
                                <Bed className="w-3.5 h-3.5 text-primary-500" weight="duotone" />
                                <span>{trip.accommodations.length} {trip.accommodations.length === 1 ? 'stay' : 'stays'}</span>
                            </span>
                        )}
                        {trip.participants && trip.participants.length > 0 && (
                            <span className="inline-flex items-center gap-1 text-2xs font-semibold text-light-text-secondary dark:text-dark-text-secondary">
                                <Users className="w-3.5 h-3.5 text-indigo-500" weight="duotone" />
                                <span>{trip.participants.length} {trip.participants.length === 1 ? 'traveler' : 'travelers'}</span>
                            </span>
                        )}
                    </div>

                    {/* Right: Transport Mode Badges */}
                    {transportModes.length > 0 && (
                        <div 
                            style={{ WebkitBackdropFilter: 'blur(8px)' }}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-black/5 dark:bg-white/5 backdrop-blur-md border border-black/5 dark:border-white/10 shadow-xs shrink-0 ml-auto"
                        >
                            {transportModes.slice(0, 4).map((mode, i) => {
                                switch (mode as string) {
                                    case 'Flight': 
                                        return (
                                            <span key={i} title="Flight" className="flex items-center">
                                                <Airplane className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400 shrink-0" weight="duotone" />
                                            </span>
                                        );
                                    case 'Train': 
                                        return (
                                            <span key={i} title="Train" className="flex items-center">
                                                <Train className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400 shrink-0" weight="duotone" />
                                            </span>
                                        );
                                    case 'Car':
                                    case 'Car Rental':
                                    case 'Personal Car': 
                                        return (
                                            <span key={i} title="Road / Car" className="flex items-center">
                                                <Car className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" weight="duotone" />
                                            </span>
                                        );
                                    case 'Ferry':
                                    case 'Cruise': 
                                        return (
                                            <span key={i} title="Sea / Boat" className="flex items-center">
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
    stage: 'past' | 'confirmed' | 'planned' | 'Past' | 'Confirmed' | 'Planned';
    label: string;
    actionLabel: string;
    onAction: () => void;
}

const EmptyBucketPlaceholder: React.FC<EmptyBucketPlaceholderProps> = ({ stage, label, actionLabel, onAction }) => {
    return (
        <div className="p-8 rounded-2xl border border-dashed border-black/20 dark:border-white/15 flex flex-col items-center justify-center text-center gap-3 bg-black/[0.01] dark:bg-white/[0.01]">
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
                    <Plus className="w-3 h-3" />
                    <span>{actionLabel}</span>
                </button>
            </GlassPanel>
        </div>
    );
};
