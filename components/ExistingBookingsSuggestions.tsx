import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
    Sparkle, 
    AirplaneTilt, 
    Bed, 
    Train, 
    Car, 
    Bus, 
    Boat, 
    Check, 
    Plus, 
    CaretDown, 
    CaretUp, 
    X, 
    ArrowRight,
    MapPin,
    CalendarBlank
} from '@phosphor-icons/react';
import GlassPanel from './glass/GlassPanel';
import GlassButton from './glass/GlassButton';
import { 
    DiscoveredFlightItem, 
    DiscoveredRouteItem, 
    DiscoveredStayItem,
    ExistingTripSuggestionsResult 
} from '../hooks/useExistingTripSuggestions';
import { formatDate, formatDateRange } from '../utils/formatters';
import { BTN_PRIMARY_STYLE, BTN_SECONDARY_STYLE } from '../constants';

export interface ExistingBookingsSuggestionsProps {
    suggestionsResult: ExistingTripSuggestionsResult;
    onApplySuggestions: (payload: {
        flights: DiscoveredFlightItem[];
        routes: DiscoveredRouteItem[];
        stays: DiscoveredStayItem[];
        suggestedDestination?: string;
    }) => void;
    currentDestination?: string;
    onNavigateStage?: (stageKey: 'transport' | 'accommodation') => void;
    mode?: 'full' | 'compact-transport' | 'compact-stays';
}

export const ExistingBookingsSuggestions: React.FC<ExistingBookingsSuggestionsProps> = ({
    suggestionsResult,
    onApplySuggestions,
    currentDestination = '',
    onNavigateStage,
    mode = 'full'
}) => {
    const { flights, routes, stays, suggestedDestination, totalCount, hasSuggestions } = suggestionsResult;

    const [isDismissed, setIsDismissed] = useState(false);
    const [isExpanded, setIsExpanded] = useState(true);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
        const initial = new Set<string>();
        flights.forEach(f => initial.add(`flight-${f.id}`));
        routes.forEach(r => initial.add(`route-${r.id}`));
        stays.forEach(s => initial.add(`stay-${s.id}`));
        return initial;
    });

    const [appliedSummary, setAppliedSummary] = useState<{
        count: number;
        hasFlights: boolean;
        hasStays: boolean;
    } | null>(null);

    // Keep all newly discovered items checked by default when suggestions change
    React.useEffect(() => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            flights.forEach(f => next.add(`flight-${f.id}`));
            routes.forEach(r => next.add(`route-${r.id}`));
            stays.forEach(s => next.add(`stay-${s.id}`));
            return next;
        });
    }, [flights, routes, stays]);

    const relevantTotal = useMemo(() => {
        if (mode === 'compact-transport') return flights.length + routes.length;
        if (mode === 'compact-stays') return stays.length;
        return totalCount;
    }, [mode, flights.length, routes.length, stays.length, totalCount]);

    if (!hasSuggestions || relevantTotal === 0 || isDismissed) {
        if (appliedSummary && mode === 'full') {
            return (
                <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="w-full"
                >
                    <GlassPanel
                        className="wg-glass-card border border-emerald-500/30 overflow-hidden"
                        overrides={{ borderRadius: 20 }}
                        padding="0px"
                    >
                        <div className="p-4 bg-emerald-500/10 dark:bg-emerald-500/15 flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-xs shrink-0">
                                    <Check className="w-4 h-4" weight="bold" />
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-emerald-800 dark:text-emerald-200">
                                        Imported {appliedSummary.count} existing booking{appliedSummary.count !== 1 ? 's' : ''} to this trip!
                                    </p>
                                    <p className="text-2xs text-emerald-700/80 dark:text-emerald-300/80 mt-0.5">
                                        You can view and adjust them in the Transport and Stays sections.
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {appliedSummary.hasFlights && onNavigateStage && (
                                    <button
                                        type="button"
                                        onClick={() => onNavigateStage('transport')}
                                        className="px-3 py-1.5 min-h-[36px] rounded-xl text-2xs font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-700 dark:text-emerald-200 hover:bg-emerald-500/30 transition-colors flex items-center gap-1 cursor-pointer"
                                    >
                                        <span>View Legs</span>
                                        <ArrowRight className="w-3 h-3" />
                                    </button>
                                )}
                                {appliedSummary.hasStays && onNavigateStage && (
                                    <button
                                        type="button"
                                        onClick={() => onNavigateStage('accommodation')}
                                        className="px-3 py-1.5 min-h-[36px] rounded-xl text-2xs font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-700 dark:text-emerald-200 hover:bg-emerald-500/30 transition-colors flex items-center gap-1 cursor-pointer"
                                    >
                                        <span>View Stays</span>
                                        <ArrowRight className="w-3 h-3" />
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setAppliedSummary(null)}
                                    className="w-8 h-8 min-w-[32px] min-h-[32px] rounded-lg text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 flex items-center justify-center transition-colors cursor-pointer"
                                    aria-label="Dismiss banner"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    </GlassPanel>
                </motion.div>
            );
        }
        return null;
    }

    const toggleSelection = (key: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    };

    const handleSelectAll = (select: boolean) => {
        if (!select) {
            setSelectedIds(new Set());
        } else {
            const all = new Set<string>();
            flights.forEach(f => all.add(`flight-${f.id}`));
            routes.forEach(r => all.add(`route-${r.id}`));
            stays.forEach(s => all.add(`stay-${s.id}`));
            setSelectedIds(all);
        }
    };

    const selectedFlights = flights.filter(f => selectedIds.has(`flight-${f.id}`));
    const selectedRoutes = routes.filter(r => selectedIds.has(`route-${r.id}`));
    const selectedStays = stays.filter(s => selectedIds.has(`stay-${s.id}`));
    const selectedCount = selectedFlights.length + selectedRoutes.length + selectedStays.length;

    const handleApply = (applyAll = false) => {
        const flightsToApply = applyAll ? flights : selectedFlights;
        const routesToApply = applyAll ? routes : selectedRoutes;
        const staysToApply = applyAll ? stays : selectedStays;

        const count = flightsToApply.length + routesToApply.length + staysToApply.length;
        if (count === 0) return;

        onApplySuggestions({
            flights: flightsToApply,
            routes: routesToApply,
            stays: staysToApply,
            suggestedDestination: !currentDestination.trim() ? suggestedDestination : undefined
        });

        setAppliedSummary({
            count,
            hasFlights: flightsToApply.length > 0 || routesToApply.length > 0,
            hasStays: staysToApply.length > 0
        });
    };

    const getModeIcon = (transportMode: string) => {
        switch (transportMode) {
            case 'Train': return Train;
            case 'Car Rental':
            case 'Personal Car': return Car;
            case 'Bus': return Bus;
            case 'Cruise':
            case 'Ferry': return Boat;
            default: return AirplaneTilt;
        }
    };

    // --- Compact Banner Mode (Used in Transport or Stays Stage) ---
    if (mode === 'compact-transport' || mode === 'compact-stays') {
        const isTransportMode = mode === 'compact-transport';
        const count = isTransportMode ? (flights.length + routes.length) : stays.length;

        if (count === 0) return null;

        return (
            <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full"
            >
                <GlassPanel
                    className="wg-glass-card border border-primary-500/25 shadow-md overflow-hidden"
                    overrides={{ borderRadius: 20 }}
                    padding="0px"
                >
                    <div className="p-3.5 sm:p-4 bg-gradient-to-r from-primary-500/10 via-emerald-500/5 to-transparent flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-primary-500 text-white flex items-center justify-center shadow-xs shrink-0">
                                <Sparkle className="w-4 h-4" weight="fill" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-xs font-bold text-light-text dark:text-dark-text tracking-tight truncate">
                                    {isTransportMode 
                                        ? `Found ${count} registered flight/route${count !== 1 ? 's' : ''} during this trip`
                                        : `Found ${count} registered stay${count !== 1 ? 's' : ''} during this trip`
                                    }
                                </p>
                                <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary truncate">
                                    Tap to import directly into your trip itinerary
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <GlassButton
                                variant="primary"
                                size="sm"
                                color="primary"
                                onClick={() => handleApply(true)}
                                icon={<Plus className="w-3.5 h-3.5" weight="bold" />}
                                className="!h-9 !px-3.5 !text-2xs font-bold uppercase tracking-wider"
                            >
                                Import {count} {isTransportMode ? (count === 1 ? 'Leg' : 'Legs') : (count === 1 ? 'Stay' : 'Stays')}
                            </GlassButton>
                            <button
                                type="button"
                                onClick={() => setIsDismissed(true)}
                                className="w-8 h-8 rounded-lg text-light-text-secondary dark:text-dark-text-secondary hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-center cursor-pointer transition-colors"
                                aria-label="Dismiss banner"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                </GlassPanel>
            </motion.div>
        );
    }

    // --- Full Wizard Mode (Stage 1 / Drawer) ---
    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="w-full"
        >
            <GlassPanel
                className="wg-glass-card border border-primary-500/30 dark:border-primary-400/25 shadow-xl relative overflow-hidden"
                overrides={{ borderRadius: 24 }}
                padding="0px"
            >
                {/* Header Strip */}
                <div className="p-4 sm:p-5 bg-gradient-to-r from-primary-500/15 via-emerald-500/10 to-transparent flex items-center justify-between gap-3 border-b border-black/5 dark:border-white/5">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary-500 to-emerald-500 text-white flex items-center justify-center shadow-md shadow-primary-500/20 shrink-0">
                            <Sparkle className="w-5 h-5" weight="fill" />
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-sm font-bold text-light-text dark:text-dark-text tracking-tight">
                                    Existing Bookings & Trips Detected
                                </h3>
                                <span className="px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-primary-500/15 text-primary-600 dark:text-primary-300 border border-primary-500/20">
                                    {totalCount} Found
                                </span>
                            </div>
                            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5 truncate">
                                Identified registered flights, routes, or accommodations matching these dates.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                        <GlassButton
                            variant="primary"
                            size="sm"
                            color="primary"
                            onClick={() => handleApply(true)}
                            icon={<Plus className="w-3.5 h-3.5" weight="bold" />}
                            className="!h-9 !px-3 sm:!px-4 !text-2xs font-bold uppercase tracking-wider hidden sm:flex"
                        >
                            Add All ({totalCount})
                        </GlassButton>
                        <button
                            type="button"
                            onClick={() => setIsExpanded(prev => !prev)}
                            className="w-9 h-9 min-w-[36px] min-h-[36px] rounded-xl flex items-center justify-center text-light-text-secondary dark:text-dark-text-secondary hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                            aria-label={isExpanded ? 'Collapse suggestions' : 'Expand suggestions'}
                        >
                            {isExpanded ? <CaretUp className="w-4 h-4" /> : <CaretDown className="w-4 h-4" />}
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsDismissed(true)}
                            className="w-9 h-9 min-w-[36px] min-h-[36px] rounded-xl flex items-center justify-center text-light-text-secondary dark:text-dark-text-secondary hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                            aria-label="Dismiss suggestions"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Badges Bar */}
                <div className="px-4 sm:px-5 py-2.5 bg-black/[0.02] dark:bg-white/[0.02] flex items-center justify-between gap-3 text-xs border-b border-black/5 dark:border-white/5 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                        {flights.length > 0 && (
                            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-2xs font-bold uppercase tracking-wider bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                                <AirplaneTilt className="w-3 h-3" />
                                {flights.length} {flights.length === 1 ? 'Flight' : 'Flights'}
                            </span>
                        )}
                        {routes.length > 0 && (
                            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-2xs font-bold uppercase tracking-wider bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                <Train className="w-3 h-3" />
                                {routes.length} {routes.length === 1 ? 'Route' : 'Routes'}
                            </span>
                        )}
                        {stays.length > 0 && (
                            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-2xs font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                <Bed className="w-3 h-3" />
                                {stays.length} {stays.length === 1 ? 'Stay' : 'Stays'}
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => handleSelectAll(selectedCount < totalCount)}
                            className="text-2xs font-bold uppercase tracking-wider text-primary-600 dark:text-primary-400 hover:underline cursor-pointer"
                        >
                            {selectedCount === totalCount ? 'Deselect All' : 'Select All'}
                        </button>
                    </div>
                </div>

                {/* Expandable Suggestions List */}
                <AnimatePresence>
                    {isExpanded && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                        >
                            <div className="p-4 sm:p-5 space-y-4 max-h-[380px] overflow-y-auto custom-scrollbar">

                                {/* 1. Flights List */}
                                {flights.length > 0 && (
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2 text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
                                            <AirplaneTilt className="w-3.5 h-3.5 text-sky-500" />
                                            <span>Registered Flights</span>
                                        </div>
                                        <div className="space-y-2">
                                            {flights.map(f => {
                                                const key = `flight-${f.id}`;
                                                const isSelected = selectedIds.has(key);
                                                return (
                                                    <div
                                                        key={key}
                                                        onClick={() => toggleSelection(key)}
                                                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                                                            isSelected
                                                                ? 'bg-sky-500/10 dark:bg-sky-500/15 border-sky-500/35 shadow-xs'
                                                                : 'bg-white/40 dark:bg-white/[0.03] border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5'
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-3 min-w-0">
                                                            <div className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                                                                isSelected
                                                                    ? 'bg-sky-500 text-white'
                                                                    : 'border border-black/20 dark:border-white/20 text-transparent'
                                                            }`}>
                                                                <Check className="w-3.5 h-3.5" weight="bold" />
                                                            </div>
                                                            <div className="min-w-0">
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <span className="font-bold text-xs text-light-text dark:text-dark-text">
                                                                        {f.identifier || f.provider || 'Flight'}
                                                                    </span>
                                                                    {f.provider && f.identifier && (
                                                                        <span className="text-2xs text-light-text-secondary dark:text-dark-text-secondary">
                                                                            ({f.provider})
                                                                        </span>
                                                                    )}
                                                                    <span className="font-mono text-2xs font-bold px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 text-light-text dark:text-dark-text">
                                                                        {f.origin || '???'} → {f.destination || '???'}
                                                                    </span>
                                                                </div>
                                                                <div className="flex items-center gap-2 mt-1 text-2xs text-light-text-secondary dark:text-dark-text-secondary flex-wrap">
                                                                    <span className="flex items-center gap-1">
                                                                        <CalendarBlank className="w-3 h-3" />
                                                                        {formatDate(f.departureDate, 'short-with-year')}
                                                                        {f.departureTime && ` • ${f.departureTime}`}
                                                                    </span>
                                                                    {f.travelClass && (
                                                                        <span>• {f.travelClass}</span>
                                                                    )}
                                                                    {f.seatNumber && (
                                                                        <span>• Seat {f.seatNumber}</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="shrink-0 text-right">
                                                            <span className={`px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider ${
                                                                f.isIndependent 
                                                                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                                                                    : 'bg-black/5 dark:bg-white/5 text-light-text-secondary dark:text-dark-text-secondary border border-black/5 dark:border-white/5'
                                                            }`}>
                                                                {f.isIndependent ? 'Independent' : `From ${f.tripName || 'Trip'}`}
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* 2. Routes & Transports List */}
                                {routes.length > 0 && (
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2 text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
                                            <Train className="w-3.5 h-3.5 text-amber-500" />
                                            <span>Registered Land & Sea Routes</span>
                                        </div>
                                        <div className="space-y-2">
                                            {routes.map(r => {
                                                const key = `route-${r.id}`;
                                                const isSelected = selectedIds.has(key);
                                                const RouteIcon = getModeIcon(r.mode);
                                                return (
                                                    <div
                                                        key={key}
                                                        onClick={() => toggleSelection(key)}
                                                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                                                            isSelected
                                                                ? 'bg-amber-500/10 dark:bg-amber-500/15 border-amber-500/35 shadow-xs'
                                                                : 'bg-white/40 dark:bg-white/[0.03] border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5'
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-3 min-w-0">
                                                            <div className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                                                                isSelected
                                                                    ? 'bg-amber-500 text-white'
                                                                    : 'border border-black/20 dark:border-white/20 text-transparent'
                                                            }`}>
                                                                <Check className="w-3.5 h-3.5" weight="bold" />
                                                            </div>
                                                            <div className="min-w-0">
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <span className="flex items-center gap-1 font-bold text-xs text-light-text dark:text-dark-text">
                                                                        <RouteIcon className="w-3.5 h-3.5 text-amber-500" />
                                                                        {r.identifier || r.provider || r.mode}
                                                                    </span>
                                                                    <span className="font-mono text-2xs font-bold px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 text-light-text dark:text-dark-text">
                                                                        {r.origin || 'Start'} → {r.destination || 'End'}
                                                                    </span>
                                                                </div>
                                                                <div className="flex items-center gap-2 mt-1 text-2xs text-light-text-secondary dark:text-dark-text-secondary flex-wrap">
                                                                    <span className="flex items-center gap-1">
                                                                        <CalendarBlank className="w-3 h-3" />
                                                                        {formatDate(r.departureDate, 'short-with-year')}
                                                                        {r.departureTime && ` • ${r.departureTime}`}
                                                                    </span>
                                                                    {r.provider && <span>• {r.provider}</span>}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="shrink-0 text-right">
                                                            <span className="px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-black/5 dark:bg-white/5 text-light-text-secondary dark:text-dark-text-secondary border border-black/5 dark:border-white/5">
                                                                From {r.tripName}
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* 3. Accommodations List */}
                                {stays.length > 0 && (
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2 text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
                                            <Bed className="w-3.5 h-3.5 text-emerald-500" />
                                            <span>Registered Accommodations</span>
                                        </div>
                                        <div className="space-y-2">
                                            {stays.map(s => {
                                                const key = `stay-${s.id}`;
                                                const isSelected = selectedIds.has(key);
                                                return (
                                                    <div
                                                        key={key}
                                                        onClick={() => toggleSelection(key)}
                                                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                                                            isSelected
                                                                ? 'bg-emerald-500/10 dark:bg-emerald-500/15 border-emerald-500/35 shadow-xs'
                                                                : 'bg-white/40 dark:bg-white/[0.03] border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5'
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-3 min-w-0">
                                                            <div className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                                                                isSelected
                                                                    ? 'bg-emerald-500 text-white'
                                                                    : 'border border-black/20 dark:border-white/20 text-transparent'
                                                            }`}>
                                                                <Check className="w-3.5 h-3.5" weight="bold" />
                                                            </div>
                                                            <div className="min-w-0">
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <span className="font-bold text-xs text-light-text dark:text-dark-text">
                                                                        {s.name}
                                                                    </span>
                                                                    <span className="px-1.5 py-0.5 rounded text-2xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                                                        {s.type}
                                                                    </span>
                                                                </div>
                                                                <div className="flex items-center gap-2 mt-1 text-2xs text-light-text-secondary dark:text-dark-text-secondary flex-wrap">
                                                                    <span className="flex items-center gap-1">
                                                                        <CalendarBlank className="w-3 h-3" />
                                                                        {formatDateRange(s.checkInDate, s.checkOutDate)}
                                                                    </span>
                                                                    {s.address && (
                                                                        <span className="flex items-center gap-0.5 truncate max-w-[200px]">
                                                                            <MapPin className="w-3 h-3 shrink-0" />
                                                                            <span className="truncate">{s.address}</span>
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="shrink-0 text-right">
                                                            <span className="px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-black/5 dark:bg-white/5 text-light-text-secondary dark:text-dark-text-secondary border border-black/5 dark:border-white/5">
                                                                From {s.tripName}
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                            </div>

                            {/* Bottom Action Footer */}
                            <div className="p-4 sm:p-5 bg-black/[0.02] dark:bg-white/[0.02] border-t border-black/5 dark:border-white/5 flex items-center justify-between gap-3 flex-wrap">
                                <div className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                                    <span className="font-bold text-light-text dark:text-dark-text">{selectedCount}</span> of {totalCount} selected
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setIsDismissed(true)}
                                        className={`${BTN_SECONDARY_STYLE} !h-10 !px-4 text-xs font-bold uppercase tracking-wider cursor-pointer`}
                                    >
                                        Skip
                                    </button>
                                    <GlassButton
                                        variant="primary"
                                        size="md"
                                        color="primary"
                                        onClick={() => handleApply(false)}
                                        disabled={selectedCount === 0}
                                        icon={<Plus className="w-4 h-4" weight="bold" />}
                                        className="!h-10 !px-5 text-xs font-bold uppercase tracking-wider"
                                    >
                                        Add {selectedCount} to Trip
                                    </GlassButton>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </GlassPanel>
        </motion.div>
    );
};
export default ExistingBookingsSuggestions;
