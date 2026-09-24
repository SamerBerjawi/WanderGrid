import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
    CalendarBlank as CalendarIcon, 
    CaretDown as ChevronDown, 
    CaretRight as ChevronRight, 
    MagnifyingGlass as Search, 
    Funnel as Filter, 
    Plus, 
    CheckCircle as CheckCircle2, 
    Clock, 
    MapPin, 
    Airplane as Plane, 
    Train, 
    Car, 
    Boat as Ship, 
    Stack as Layers, 
    SquaresFour as Grid3X3, 
    List, 
    Users, 
    Sparkle as Sparkles, 
    WarningCircle as AlertCircle, 
    SlidersHorizontal, 
    ArrowRight, 
    CurrencyDollar as DollarSign, 
    ShieldCheck as Shield, 
    Lock, 
    Globe, 
    ArrowsOut as Maximize2, 
    Check, 
    X, 
    GitMerge as Merge, 
    ArrowCounterClockwise as RotateCcw, 
    Gear as Settings, 
    PencilSimpleLine as Edit3, 
    Trash as Trash2, 
    Eye, 
    Compass, 
    SuitcaseSimple as Briefcase,
    TrendUp as TrendingUp,
    Sun,
    CalendarCheck,
    Path as Route,
    ArrowsDownUp as ArrowUpDown,
    ClockCounterClockwise
} from '@phosphor-icons/react';
import { Button, Badge, Modal, BentoGrid, BentoCard } from '../components/ui';
import { GlassPanel } from '../components/glass/GlassPanel';
import { VirtualListItem } from '../components/ui/VirtualListItem';
import { TripModal } from '../components/TripModal';
import { TripSetupBoard } from '../components/TripSetupBoard';
import { dataService } from '../services/mockDb';
import { useWanderSync } from '../hooks/useWanderSync';
import { Trip, User, WorkspaceSettings, EntitlementType, PublicHoliday, Transport } from '../types';
import { getCoordinatesSync, calculateDistance, formatPlaceName } from '../services/geocoding';
import { getFlagEmoji, getRegion } from '../services/geoData';
import { formatDate, formatDateRange, formatCurrency } from '../utils/formatters';
import { 
    INPUT_BASE_STYLE, 
    BTN_PRIMARY_STYLE, 
    BTN_SECONDARY_STYLE, 
    CARD_ELEVATED_STYLE, 
    CARD_FILL_STYLE,
    HEADER_BANNER_STYLE
} from '../constants';

interface VacationPlannerProps {
    onTripClick?: (tripId: string) => void;
}

type ViewMode = 'grid' | 'timeline' | 'table';
type SortOption = 'date_asc' | 'date_desc' | 'duration_desc' | 'budget_desc' | 'completeness_asc';

export const VacationPlanner: React.FC<VacationPlannerProps> = ({ onTripClick }) => {
    // 1. SWR Data Synchronization
    const { data: tripsData, refetch: refetchTrips } = useWanderSync<Trip[]>('planner_trips', () => dataService.getTrips());
    const { data: usersData } = useWanderSync<User[]>('planner_users', () => dataService.getUsers());
    const { data: settingsData } = useWanderSync<WorkspaceSettings | null>('planner_settings', () => dataService.getWorkspaceSettings());
    const { data: entitlementsData } = useWanderSync<EntitlementType[]>('planner_entitlements', () => dataService.getEntitlementTypes());
    const { data: savedConfigsData } = useWanderSync<any[]>('planner_configs', () => dataService.getSavedConfigs());
    const { data: flightsData } = useWanderSync<Transport[]>('planner_flights', () => dataService.getFlights());

    const trips = useMemo(() => tripsData || [], [tripsData]);
    const users = useMemo(() => usersData || [], [usersData]);
    const settings = settingsData;
    const entitlements = useMemo(() => entitlementsData || [], [entitlementsData]);
    
    // Flatten holidays across all configured country calendars
    const holidays: PublicHoliday[] = useMemo(() => {
        if (!savedConfigsData) return [];
        return savedConfigsData.flatMap(c => (c.holidays || []).map((h: any) => ({ ...h, configId: c.id })));
    }, [savedConfigsData]);

    // 2. Navigation, View Mode & Tab States
    const [activeTab, setActiveTab] = useState<'Planned' | 'Confirmed' | 'History'>('Planned');
    const [viewMode, setViewMode] = useState<ViewMode>('grid');
    const [sortBy, setSortBy] = useState<SortOption>('date_asc');

    // 3. Modals & Editing State
    const [isCreateTripOpen, setIsCreateTripOpen] = useState(false);
    const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
    const [collapsedYears, setCollapsedYears] = useState<Set<number>>(new Set());

    // 4. Batch Selection & Consolidation State
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedTripIds, setSelectedTripIds] = useState<Set<string>>(new Set());
    const [customMergeName, setCustomMergeName] = useState('');
    const [isMerging, setIsMerging] = useState(false);

    // 5. Multi-Facet Filtering States
    const [searchQuery, setSearchQuery] = useState('');
    const [filterYear, setFilterYear] = useState<string>('all');
    const [filterPrivacy, setFilterPrivacy] = useState<string>('all');
    const [filterUser, setFilterUser] = useState<string>('all');
    const [filterTransportMode, setFilterTransportMode] = useState<string>('all');
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

    // Background Auto-Reconciliation of Independent Flights into Matching Trips
    useEffect(() => {
        const autoReconcileFlights = async () => {
            if (!flightsData || flightsData.length === 0 || trips.length === 0) return;
            const independent = flightsData.filter(f => (!f.tripId || f.tripId === 'unassigned') && f.departureDate);
            if (independent.length === 0) return;

            let modifiedTrips: Trip[] = [];
            const deletedFlightIds: string[] = [];

            for (const flight of independent) {
                const fDate = new Date(flight.departureDate);
                if (isNaN(fDate.getTime())) continue;

                const match = trips.find(t => {
                    if (!t.startDate || !t.endDate) return false;
                    const s = new Date(t.startDate);
                    const e = new Date(t.endDate);
                    return fDate >= s && fDate <= e;
                });

                if (match) {
                    const currentTransports = match.transports ? [...match.transports] : [];
                    if (!currentTransports.some(item => item.id === flight.id)) {
                        currentTransports.push({ ...flight, mode: 'Flight' });
                        const updatedTrip = { ...match, transports: currentTransports };
                        modifiedTrips.push(updatedTrip);
                        deletedFlightIds.push(flight.id);
                    }
                }
            }

            if (modifiedTrips.length > 0) {
                for (const t of modifiedTrips) {
                    await dataService.updateTrip(t);
                }
                for (const fId of deletedFlightIds) {
                    await dataService.deleteFlight(fId);
                }
                window.dispatchEvent(new CustomEvent('wandergrid_db_updated'));
            }
        };

        const timer = setTimeout(autoReconcileFlights, 600);
        return () => clearTimeout(timer);
    }, [flightsData, trips]);

    // -------------------------------------------------------------
    // Helper & Intelligence Calculations
    // -------------------------------------------------------------

    // Currency Formatter
    const formatCurrency = useCallback((amount: number) => {
        const curr = settings?.currency || 'USD';
        try {
            return new Intl.NumberFormat('en-US', { style: 'currency', currency: curr, maximumFractionDigits: 0 }).format(amount);
        } catch {
            return `${curr} ${Math.round(amount).toLocaleString()}`;
        }
    }, [settings]);

    // Location & Geo Information Resolver
    const resolveLocationInfo = useCallback((locationStr: string) => {
        if (!locationStr) return { name: 'Unassigned', flag: '🌍', region: 'Global', countryCode: '' };
        const geo = getCoordinatesSync(locationStr);
        const countryCode = geo?.countryCode || '';
        const flag = countryCode ? getFlagEmoji(countryCode) : '📍';
        const region = countryCode ? getRegion(countryCode) : 'Global Expedition';
        return {
            name: formatPlaceName(locationStr),
            flag,
            region,
            countryCode
        };
    }, []);

    // Date & Working Days / Holiday Intelligence
    const calculateDateIntelligence = useCallback((startDateStr: string, endDateStr: string) => {
        if (!startDateStr || !endDateStr) return { totalDays: 0, weekdays: 0, weekendDays: 0, matchingHolidays: [] };

        const start = new Date(startDateStr);
        const end = new Date(endDateStr);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return { totalDays: 0, weekdays: 0, weekendDays: 0, matchingHolidays: [] };
        }

        const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
        let weekdays = 0;
        let weekendDays = 0;
        const matchingHolidays: { name: string; date: string }[] = [];

        const curr = new Date(start);
        while (curr <= end) {
            const dayOfWeek = curr.getDay(); // 0 = Sun, 6 = Sat
            if (dayOfWeek === 0 || dayOfWeek === 6) {
                weekendDays++;
            } else {
                weekdays++;
            }

            const isoDate = curr.toISOString().split('T')[0];
            const foundHoliday = holidays.find(h => h.date === isoDate);
            if (foundHoliday && !matchingHolidays.some(h => h.date === isoDate)) {
                matchingHolidays.push({ name: foundHoliday.name, date: foundHoliday.date });
            }

            curr.setDate(curr.getDate() + 1);
        }

        return { totalDays, weekdays, weekendDays, matchingHolidays };
    }, [holidays]);

    // Completeness Score (0-100%)
    const calculateCompleteness = useCallback((trip: Trip) => {
        let score = 0;
        if (trip.startDate && trip.endDate) score += 20;
        if (trip.location && trip.location.trim().length > 0) score += 20;
        if (trip.transports && trip.transports.length > 0) score += 20;
        if (trip.accommodations && trip.accommodations.length > 0) score += 20;
        if (trip.participants && trip.participants.length > 0) score += 20;
        return score;
    }, []);

    // Transport & Transit Distance Breakdown
    const calculateTransportMetrics = useCallback((trip: Trip) => {
        const transports = trip.transports || [];
        let totalDistanceKm = 0;
        let flightCount = 0;
        let trainCount = 0;
        let carCount = 0;
        let ferryCount = 0;

        transports.forEach(t => {
            const dist = t.distance || (t.originLat && t.originLng && t.destLat && t.destLng 
                ? calculateDistance(t.originLat, t.originLng, t.destLat, t.destLng) 
                : 0);
            totalDistanceKm += dist;

            const mode = (t.mode || 'Flight').toLowerCase();
            if (mode === 'flight') flightCount++;
            else if (mode === 'train') trainCount++;
            else if (mode === 'car' || mode === 'drive' || mode === 'road') carCount++;
            else if (mode === 'ferry' || mode === 'ship') ferryCount++;
        });

        const transportCost = transports.reduce((s, t) => s + (t.cost || 0), 0);
        const stayCost = (trip.accommodations || []).reduce((s, a) => s + (a.cost || 0), 0);
        const activityCost = (trip.activities || []).reduce((s, act) => s + ((act as any).cost || 0), 0);
        const totalBudget = transportCost + stayCost + activityCost;

        return {
            totalDistanceKm: Math.round(totalDistanceKm),
            flightCount,
            trainCount,
            carCount,
            ferryCount,
            transportCount: transports.length,
            accommodationCount: trip.accommodations?.length || 0,
            activityCount: trip.activities?.length || 0,
            totalBudget
        };
    }, []);

    // Schedule Conflict Checker
    const getTripConflicts = useCallback((targetTrip: Trip) => {
        if (!targetTrip.startDate || !targetTrip.endDate) return [];
        const tStart = new Date(targetTrip.startDate).getTime();
        const tEnd = new Date(targetTrip.endDate).getTime();

        return trips.filter(other => {
            if (other.id === targetTrip.id) return false;
            if ((other as any).isBundleOnly || (other as any).hideInPlanner) return false;
            if (other.status === 'Cancelled') return false;
            if (!other.startDate || !other.endDate) return false;

            const oStart = new Date(other.startDate).getTime();
            const oEnd = new Date(other.endDate).getTime();
            // Check intersection [tStart, tEnd] and [oStart, oEnd]
            return tStart <= oEnd && tEnd >= oStart;
        });
    }, [trips]);

    // -------------------------------------------------------------
    // Trip Actions (Status update, Create, Edit, Delete, Merge)
    // -------------------------------------------------------------

    const handleUpdateStatus = async (trip: Trip, newStatus: 'Planning' | 'Upcoming' | 'Past') => {
        try {
            await dataService.updateTrip({ ...trip, status: newStatus });
            window.dispatchEvent(new CustomEvent('wandergrid_db_updated'));
            refetchTrips(true);
        } catch (e) {
            console.error("Failed to update trip status:", e);
        }
    };

    const handleSaveTrip = async (tripData: Trip, unassignedFlightsToRemove?: string[]) => {
        try {
            if (tripData.id && trips.some(t => t.id === tripData.id)) {
                await dataService.updateTrip(tripData);
            } else {
                await dataService.addTrip(tripData);
            }

            if (unassignedFlightsToRemove && unassignedFlightsToRemove.length > 0) {
                for (const fId of unassignedFlightsToRemove) {
                    await dataService.deleteFlight(fId);
                }
            }

            window.dispatchEvent(new CustomEvent('wandergrid_db_updated'));
            refetchTrips(true);
            setEditingTrip(null);
            setIsCreateTripOpen(false);
        } catch (e) {
            console.error("Failed to save trip:", e);
        }
    };

    const handleDeleteTrip = async (tripId: string) => {
        try {
            await dataService.deleteTrip(tripId);
            window.dispatchEvent(new CustomEvent('wandergrid_db_updated'));
            refetchTrips(true);
            setEditingTrip(null);
        } catch (e) {
            console.error("Failed to delete trip:", e);
        }
    };

    const handleEditTrip = (trip: Trip) => {
        if (isSelectionMode) {
            toggleTripSelection(trip.id);
        } else {
            setEditingTrip(trip);
            setIsCreateTripOpen(true);
        }
    };

    const toggleTripSelection = (id: string) => {
        setSelectedTripIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleSelectionMode = () => {
        if (isSelectionMode) {
            setIsSelectionMode(false);
            setSelectedTripIds(new Set());
            setCustomMergeName('');
        } else {
            setIsSelectionMode(true);
        }
    };

    const handleMergeTrips = async () => {
        if (selectedTripIds.size < 2) return;
        setIsMerging(true);
        try {
            const tripsToMerge = trips.filter(t => selectedTripIds.has(t.id));
            if (tripsToMerge.length < 2) return;

            tripsToMerge.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
            const primary = tripsToMerge[0];

            const allStartDates = tripsToMerge.map(t => new Date(t.startDate).getTime()).filter(n => !isNaN(n));
            const allEndDates = tripsToMerge.map(t => new Date(t.endDate).getTime()).filter(n => !isNaN(n));
            const minStart = new Date(Math.min(...allStartDates));
            const maxEnd = new Date(Math.max(...allEndDates));
            const fmt = (d: Date) => d.toISOString().split('T')[0];

            const mergedTransports = tripsToMerge.flatMap(t => t.transports || []);
            const mergedAccommodations = tripsToMerge.flatMap(t => t.accommodations || []);
            const mergedActivities = tripsToMerge.flatMap(t => t.activities || []);
            const mergedLocations = tripsToMerge.flatMap(t => t.locations || []);
            const mergedParticipants = Array.from(new Set(tripsToMerge.flatMap(t => t.participants || [])));

            const newName = customMergeName.trim() || `Merged: ${primary.name} + ${tripsToMerge.length - 1} Itineraries`;

            const mergedTrip: Trip = {
                ...primary,
                id: 'merged-' + Date.now(),
                name: newName,
                startDate: fmt(minStart),
                endDate: fmt(maxEnd),
                transports: mergedTransports,
                accommodations: mergedAccommodations,
                activities: mergedActivities,
                locations: mergedLocations,
                participants: mergedParticipants,
                status: 'Planning'
            };

            await dataService.addTrip(mergedTrip);
            for (const t of tripsToMerge) {
                await dataService.deleteTrip(t.id);
            }

            window.dispatchEvent(new CustomEvent('wandergrid_db_updated'));
            refetchTrips(true);
            setIsSelectionMode(false);
            setSelectedTripIds(new Set());
            setCustomMergeName('');
        } catch (e) {
            console.error("Failed to merge trips:", e);
        } finally {
            setIsMerging(false);
        }
    };

    const toggleYearCollapse = (year: number) => {
        setCollapsedYears(prev => {
            const next = new Set(prev);
            if (next.has(year)) next.delete(year);
            else next.add(year);
            return next;
        });
    };

    // -------------------------------------------------------------
    // Filtering & Sorting Pipelines
    // -------------------------------------------------------------

    const availableYears = useMemo(() => {
        const years = new Set<number>();
        trips.forEach(t => {
            if (t.startDate) {
                const y = new Date(t.startDate).getFullYear();
                if (!isNaN(y)) years.add(y);
            }
        });
        return Array.from(years).sort((a, b) => b - a);
    }, [trips]);

    const filteredTrips = useMemo(() => {
        return trips.filter(t => {
            if ((t as any).isBundleOnly || (t as any).hideInPlanner) return false;

            // Search query
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const nameMatch = (t.name || '').toLowerCase().includes(q);
                const locMatch = (t.location || '').toLowerCase().includes(q);
                const stopsMatch = (t.locations || []).some(l => (l.name || '').toLowerCase().includes(q));
                const notesMatch = ((t.notes || t.description) || '').toLowerCase().includes(q);
                if (!nameMatch && !locMatch && !stopsMatch && !notesMatch) return false;
            }

            // Year filter
            if (filterYear !== 'all') {
                const y = t.startDate ? new Date(t.startDate).getFullYear().toString() : '';
                if (y !== filterYear) return false;
            }

            // Privacy filter
            if (filterPrivacy === 'public' && t.privacy !== 'Public') return false;
            if (filterPrivacy === 'private' && t.privacy === 'Public') return false;

            // Co-traveler filter
            if (filterUser !== 'all') {
                if (!(t.participants || []).includes(filterUser)) return false;
            }

            // Transport Mode filter
            if (filterTransportMode !== 'all') {
                const transports = t.transports || [];
                if (filterTransportMode === 'flight' && !transports.some(tr => (tr.mode || 'Flight').toLowerCase() === 'flight')) return false;
                if (filterTransportMode === 'train' && !transports.some(tr => (tr.mode || '').toLowerCase() === 'train')) return false;
                if (filterTransportMode === 'road' && !transports.some(tr => ['car', 'drive', 'road', 'bus'].includes((tr.mode || '').toLowerCase()))) return false;
                if (filterTransportMode === 'ferry' && !transports.some(tr => ['ferry', 'ship'].includes((tr.mode || '').toLowerCase()))) return false;
            }

            return true;
        });
    }, [trips, searchQuery, filterYear, filterPrivacy, filterUser, filterTransportMode]);

    // Split into Tabs
    const plannedTrips = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return filteredTrips.filter(t => {
            if (t.status !== 'Planning') return false;
            // Ensure planned trip is future (not expired in the past)
            if (t.endDate && new Date(t.endDate) < today) return false;
            if (t.startDate && new Date(t.startDate) < today && (!t.endDate || new Date(t.endDate) < today)) return false;
            return true;
        });
    }, [filteredTrips]);

    const confirmedTrips = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return filteredTrips.filter(t => t.status !== 'Planning' && (!t.endDate || new Date(t.endDate) >= today));
    }, [filteredTrips]);

    const historyTrips = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return filteredTrips.filter(t => {
            if (t.status === 'Past') return true;
            if (t.endDate && new Date(t.endDate) < today) return true;
            if (t.startDate && new Date(t.startDate) < today && (!t.endDate || new Date(t.endDate) < today)) return true;
            return false;
        });
    }, [filteredTrips]);

    // Active Tab Set with Sorting
    const activeTripsList = useMemo(() => {
        let list: Trip[] = [];
        if (activeTab === 'Planned') list = [...plannedTrips];
        else if (activeTab === 'Confirmed') list = [...confirmedTrips];
        else list = [...historyTrips];

        return list.sort((a, b) => {
            const timeA = a.startDate ? new Date(a.startDate).getTime() : 0;
            const timeB = b.startDate ? new Date(b.startDate).getTime() : 0;

            if (sortBy === 'date_asc') return timeA - timeB;
            if (sortBy === 'date_desc') return timeB - timeA;
            if (sortBy === 'duration_desc') {
                const durA = (a.startDate && a.endDate) ? new Date(a.endDate).getTime() - timeA : 0;
                const durB = (b.startDate && b.endDate) ? new Date(b.endDate).getTime() - timeB : 0;
                return durB - durA;
            }
            if (sortBy === 'budget_desc') {
                const costA = (a.transports || []).reduce((s, t) => s + (t.cost || 0), 0) + (a.accommodations || []).reduce((s, ac) => s + (ac.cost || 0), 0);
                const costB = (b.transports || []).reduce((s, t) => s + (t.cost || 0), 0) + (b.accommodations || []).reduce((s, ac) => s + (ac.cost || 0), 0);
                return costB - costA;
            }
            if (sortBy === 'completeness_asc') {
                return calculateCompleteness(a) - calculateCompleteness(b);
            }
            return 0;
        });
    }, [activeTab, plannedTrips, confirmedTrips, historyTrips, sortBy, calculateCompleteness]);

    // Grouping by Year for Timeline Rail
    const timelineTripsByYear = useMemo(() => {
        const groups: Record<number, Trip[]> = {};
        activeTripsList.forEach(t => {
            const year = t.startDate ? new Date(t.startDate).getFullYear() : new Date().getFullYear();
            if (!groups[year]) groups[year] = [];
            groups[year].push(t);
        });
        return groups;
    }, [activeTripsList]);

    const timelineYears = useMemo(() => {
        const years = Object.keys(timelineTripsByYear).map(Number);
        return activeTab === 'History' ? years.sort((a, b) => b - a) : years.sort((a, b) => a - b);
    }, [timelineTripsByYear, activeTab]);

    // -------------------------------------------------------------
    // Bento Dashboard Metrics
    // -------------------------------------------------------------

    const nextTripCountdown = useMemo(() => {
        const candidateTrips = [...confirmedTrips, ...plannedTrips].filter(t => t.startDate);
        if (candidateTrips.length === 0) return null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const sorted = [...candidateTrips].sort((a, b) => {
            const timeA = a.startDate ? new Date(a.startDate).getTime() : 0;
            const timeB = b.startDate ? new Date(b.startDate).getTime() : 0;
            return timeA - timeB;
        });

        const next = sorted.find(t => new Date(t.startDate) >= today) || sorted[0];
        if (!next || !next.startDate) return null;

        const diffTime = new Date(next.startDate).getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const loc = resolveLocationInfo(next.location);

        return {
            id: next.id,
            name: next.name,
            days: diffDays > 0 ? diffDays : 0,
            location: loc.name,
            flag: loc.flag,
            region: loc.region,
            icon: next.icon || '✈️',
            startDate: next.startDate
        };
    }, [confirmedTrips, resolveLocationInfo]);

    const totalCommittedBudget = useMemo(() => {
        const targetTrips = [...plannedTrips, ...confirmedTrips];
        return targetTrips.reduce((sum, t) => {
            const tCost = (t.transports || []).reduce((s, tr) => s + (tr.cost || 0), 0);
            const aCost = (t.accommodations || []).reduce((s, ac) => s + (ac.cost || 0), 0);
            return sum + tCost + aCost;
        }, 0);
    }, [plannedTrips, confirmedTrips]);

    const totalHolidaySavingsCount = useMemo(() => {
        let total = 0;
        [...plannedTrips, ...confirmedTrips].forEach(t => {
            const { matchingHolidays } = calculateDateIntelligence(t.startDate, t.endDate);
            total += matchingHolidays.length;
        });
        return total;
    }, [plannedTrips, confirmedTrips, calculateDateIntelligence]);

    // -------------------------------------------------------------
    // Render Functions: Trip Card, Timeline, Table
    // -------------------------------------------------------------

    const renderTripCard = (trip: Trip) => {
        const isSelected = selectedTripIds.has(trip.id);
        const { totalDays, weekdays, matchingHolidays } = calculateDateIntelligence(trip.startDate, trip.endDate);
        const { totalDistanceKm, transportCount, accommodationCount, activityCount, totalBudget } = calculateTransportMetrics(trip);
        const completeness = calculateCompleteness(trip);
        const loc = resolveLocationInfo(trip.location);
        const conflicts = getTripConflicts(trip);
        const isPast = activeTab === 'History';

        return (
            <VirtualListItem key={trip.id} minHeight={380}>
                <motion.div
                    layout
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    onClick={() => {
                        if (isSelectionMode) {
                            toggleTripSelection(trip.id);
                        } else if (onTripClick) {
                            onTripClick(trip.id);
                        } else {
                            handleEditTrip(trip);
                        }
                    }}
                    whileHover={{ y: -4 }}
                    className="h-full"
                >
                    <GlassPanel className={`group relative wg-glass-card rounded-[28px] overflow-hidden shadow-glass-card hover:shadow-2xl transition-all duration-300 cursor-pointer flex flex-col h-full ${
                        isSelectionMode && isSelected 
                            ? 'border-primary-500 ring-4 ring-primary-500/20 scale-[1.02]' 
                            : 'border-black/5 dark:border-white/10 hover:border-black/15 dark:hover:border-white/20'
                    }`}>
                        {/* Floating Batch Selection Checkbox */}
                        {isSelectionMode && (
                            <div className="absolute top-4 right-4 z-20">
                                <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all ${
                                    isSelected 
                                        ? 'bg-primary-500 border-primary-500 text-white shadow-md shadow-primary-500/30' 
                                        : 'bg-white dark:bg-dark-card border-black/20 dark:border-white/20'
                                }`}>
                                    {isSelected && <Check className="w-4 h-4 text-white stroke-[3]" />}
                                </div>
                            </div>
                        )}

                        {/* Accent Top Gradient Strip */}
                        <div className={`h-2 w-full shrink-0 ${
                            trip.status === 'Planning'
                                ? 'bg-gradient-to-r from-amber-400 via-orange-500 to-amber-500'
                                : trip.status === 'Upcoming'
                                ? 'bg-gradient-to-r from-emerald-400 via-teal-500 to-emerald-600'
                                : 'bg-gradient-to-r from-indigo-400 via-purple-500 to-indigo-600'
                        }`} />

                        {/* Card Header Frame */}
                        <div className="p-6 pb-3 flex items-start justify-between gap-4">
                            <div className="flex items-center gap-3.5 min-w-0">
                                <div className="w-13 h-13 rounded-2xl bg-light-fill dark:bg-dark-fill/50 border border-black/10 dark:border-white/10 text-2xl flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                                    {trip.icon || loc.flag}
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-base font-bold text-light-text dark:text-dark-text tracking-tight truncate group-hover:text-primary-500 transition-colors">
                                            {trip.name}
                                        </h3>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5 truncate font-medium">
                                        <span className="text-sm leading-none">{loc.flag}</span>
                                        <span className="truncate">{loc.name}</span>
                                        <span>•</span>
                                        <span className="text-2xs uppercase tracking-wider font-bold opacity-75">{loc.region}</span>
                                    </div>
                                </div>
                            </div>

                            {!isSelectionMode && (
                                <span className={`px-2.5 py-1 rounded-full text-2xs font-bold uppercase tracking-wider shrink-0 flex items-center gap-1 border ${
                                    trip.privacy === 'Public'
                                        ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20'
                                        : 'bg-black/5 dark:bg-white/5 text-light-text-secondary dark:text-dark-text-secondary border-black/10 dark:border-white/10'
                                }`}>
                                    {trip.privacy === 'Public' ? <Globe className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                                    <span>{trip.privacy || 'Private'}</span>
                                </span>
                            )}
                        </div>

                        {/* Dates & Duration Banner */}
                        <div className="px-6 py-2">
                            <div className="p-3 rounded-2xl bg-light-fill dark:bg-dark-fill/50 border border-black/10 dark:border-white/10 flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2 min-w-0">
                                    <CalendarIcon className="w-4 h-4 text-primary-500 shrink-0" />
                                    <span className="font-mono font-bold text-xs text-light-text dark:text-dark-text truncate">
                                        {formatDateRange(trip.startDate, trip.endDate, settingsData)}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="px-2.5 py-0.5 rounded-lg bg-black/5 dark:bg-white/10 text-light-text dark:text-dark-text text-2xs font-mono font-bold">
                                        {totalDays} {totalDays === 1 ? 'Day' : 'Days'}
                                    </span>
                                    {weekdays > 0 && (
                                        <span className="text-2xs font-mono text-light-text-secondary dark:text-dark-text-secondary font-semibold hidden sm:inline">
                                            ({weekdays} PTO {weekdays === 1 ? 'day' : 'days'})
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Public Holiday Matcher & Conflict Alerts */}
                        {(matchingHolidays.length > 0 || conflicts.length > 0) && (
                            <div className="px-6 py-1 space-y-1.5">
                                {matchingHolidays.length > 0 && (
                                    <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-2xs font-bold flex items-center gap-1.5">
                                        <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                        <span className="truncate">
                                            {matchingHolidays.length} Public {matchingHolidays.length === 1 ? 'Holiday' : 'Holidays'} ({matchingHolidays.map(h => h.name).join(', ')})
                                        </span>
                                    </div>
                                )}
                                {conflicts.length > 0 && (
                                    <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 text-2xs font-bold flex items-center gap-1.5">
                                        <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                                        <span className="truncate">
                                            Schedule Conflict with: {conflicts.map(c => c.name).join(', ')}
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Completion Pipeline Bar */}
                        <div className="px-6 py-2">
                            <div className="flex items-center justify-between text-2xs font-mono font-bold text-light-text-secondary dark:text-dark-text-secondary mb-1.5 uppercase">
                                <span>Itinerary Completeness</span>
                                <span className={completeness === 100 ? 'text-emerald-500 font-bold' : 'text-primary-500'}>
                                    {completeness}%
                                </span>
                            </div>
                            <div className="h-1.5 w-full bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
                                <div 
                                    className={`h-full rounded-full transition-all duration-500 ${
                                        completeness === 100 
                                            ? 'bg-emerald-500' 
                                            : completeness >= 50 
                                            ? 'bg-primary-500' 
                                            : 'bg-amber-500'
                                    }`} 
                                    style={{ width: `${completeness}%` }} 
                                />
                            </div>
                        </div>

                        {/* Co-Travelers */}
                        <div className="px-6 py-2 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary font-mono">
                                    Co-Travelers
                                </span>
                                <div className="flex -space-x-2">
                                    {(trip.participants || []).slice(0, 4).map((pid) => {
                                        const u = users.find(user => user.id === pid);
                                        if (!u) return null;
                                        return (
                                            <div 
                                                key={pid} 
                                                className="w-6.5 h-6.5 rounded-full border-2 border-white dark:border-dark-card flex items-center justify-center text-2xs font-bold text-white shrink-0 shadow-xs bg-primary-500"
                                                title={u.name}
                                            >
                                                {u.name.charAt(0).toUpperCase()}
                                            </div>
                                        );
                                    })}
                                    {(trip.participants || []).length > 4 && (
                                        <div className="w-6.5 h-6.5 rounded-full border-2 border-white dark:border-dark-card bg-black/60 dark:bg-white/20 text-white flex items-center justify-center text-2xs font-bold shrink-0">
                                            +{(trip.participants || []).length - 4}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Footer Logistics & Action Strip */}
                        <div className="mt-auto bg-light-fill/80 dark:bg-dark-fill/50 border-t border-black/10 dark:border-white/5 p-4 space-y-3">
                            {/* Live Counts & Budget Strip */}
                            <div className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2 text-light-text-secondary dark:text-dark-text-secondary font-semibold">
                                    <span title="Transports" className="flex items-center gap-0.5">
                                        <Plane className="w-3.5 h-3.5" />
                                        <span>{transportCount}</span>
                                    </span>
                                    <span>•</span>
                                    <span title="Stays" className="flex items-center gap-0.5">
                                        <Briefcase className="w-3.5 h-3.5" />
                                        <span>{accommodationCount}</span>
                                    </span>
                                    <span>•</span>
                                    <span title="Activities" className="flex items-center gap-0.5">
                                        <Compass className="w-3.5 h-3.5" />
                                        <span>{activityCount}</span>
                                    </span>
                                </div>
                                <div className="text-right">
                                    <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                        {formatCurrency(totalBudget)}
                                    </span>
                                </div>
                            </div>

                            {/* Interactive Action Buttons */}
                            {!isSelectionMode && (
                                <div className="flex items-center gap-2 pt-1">
                                    {!isPast && (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleUpdateStatus(trip, trip.status === 'Planning' ? 'Upcoming' : 'Planning');
                                            }}
                                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 min-h-[38px] rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                                trip.status === 'Planning'
                                                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25'
                                                    : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 hover:bg-amber-500/25'
                                            }`}
                                        >
                                            {trip.status === 'Planning' ? (
                                                <>
                                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                                    <span>Lock In</span>
                                                </>
                                            ) : (
                                                <>
                                                    <RotateCcw className="w-3.5 h-3.5" />
                                                    <span>Draft</span>
                                                </>
                                            )}
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (onTripClick) onTripClick(trip.id);
                                            else handleEditTrip(trip);
                                        }}
                                        className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 min-h-[38px] rounded-xl text-xs font-bold bg-primary-500 hover:bg-primary-600 text-white shadow-sm transition-all cursor-pointer"
                                    >
                                        <Eye className="w-3.5 h-3.5" />
                                        <span>Manage</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleEditTrip(trip);
                                        }}
                                        className="w-9 h-9 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-xl text-light-text-secondary dark:text-dark-text-secondary hover:bg-black/5 dark:hover:bg-white/5 hover:text-light-text dark:hover:text-dark-text transition-colors cursor-pointer"
                                        title="Edit Itinerary Config"
                                        aria-label="Edit Itinerary Config"
                                    >
                                        <Settings className="w-4 h-4" />
                                    </button>
                                </div>
                            )}
                        </div>
                    </GlassPanel>
                </motion.div>
            </VirtualListItem>
        );
    };

    // Compact Logistics Table View
    const renderTableView = () => {
        return (
            <GlassPanel className="wg-glass-card rounded-[28px] overflow-hidden shadow-glass-card">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="border-b border-black/5 dark:border-white/10 bg-light-fill/50 dark:bg-dark-fill/30 text-light-text-secondary dark:text-dark-text-secondary uppercase text-2xs font-mono font-bold tracking-wider">
                                {isSelectionMode && <th className="p-4 w-10">Select</th>}
                                <th className="p-4">Itinerary</th>
                                <th className="p-4">Destination</th>
                                <th className="p-4">Dates</th>
                                <th className="p-4">Duration</th>
                                <th className="p-4">Logistics</th>
                                <th className="p-4">Completeness</th>
                                <th className="p-4">Est. Budget</th>
                                <th className="p-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-black/5 dark:divide-white/5 font-medium">
                            {activeTripsList.map(trip => {
                                const isSelected = selectedTripIds.has(trip.id);
                                const loc = resolveLocationInfo(trip.location);
                                const { totalDays, weekdays, matchingHolidays } = calculateDateIntelligence(trip.startDate, trip.endDate);
                                const { transportCount, accommodationCount, activityCount, totalBudget, totalDistanceKm } = calculateTransportMetrics(trip);
                                const completeness = calculateCompleteness(trip);

                                return (
                                    <tr 
                                        key={trip.id} 
                                        onClick={() => {
                                            if (isSelectionMode) toggleTripSelection(trip.id);
                                            else if (onTripClick) onTripClick(trip.id);
                                        }}
                                        className={`hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors cursor-pointer ${
                                            isSelected ? 'bg-primary-500/10' : ''
                                        }`}
                                    >
                                        {isSelectionMode && (
                                            <td className="p-4" onClick={(e) => e.stopPropagation()}>
                                                <input 
                                                    type="checkbox" 
                                                    checked={isSelected} 
                                                    onChange={() => toggleTripSelection(trip.id)} 
                                                    className="rounded border-black/20 text-primary-500 focus:ring-primary-500 cursor-pointer"
                                                />
                                            </td>
                                        )}
                                        <td className="p-4">
                                            <div className="flex items-center gap-3">
                                                <span className="text-xl shrink-0">{trip.icon || loc.flag}</span>
                                                <div>
                                                    <p className="font-bold text-xs text-light-text dark:text-dark-text tracking-tight">{trip.name}</p>
                                                    <p className="text-2xs font-mono uppercase font-bold text-light-text-secondary dark:text-dark-text-secondary">{trip.privacy || 'Private'}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-1.5 text-light-text dark:text-dark-text">
                                                <span>{loc.flag}</span>
                                                <span className="font-semibold text-xs">{loc.name}</span>
                                            </div>
                                            <p className="text-2xs font-mono uppercase text-light-text-secondary dark:text-dark-text-secondary">{loc.region}</p>
                                        </td>
                                        <td className="p-4">
                                            <p className="text-light-text dark:text-dark-text font-mono font-bold text-xs">
                                                {formatDateRange(trip.startDate, trip.endDate, settingsData)}
                                            </p>
                                            {matchingHolidays.length > 0 && (
                                                <p className="text-2xs text-amber-600 dark:text-amber-400 font-bold font-mono mt-0.5">
                                                    ✨ {matchingHolidays.length} Holiday savings
                                                </p>
                                            )}
                                        </td>
                                        <td className="p-4">
                                            <span className="px-2.5 py-0.5 rounded-lg bg-black/5 dark:bg-white/10 font-mono font-bold text-2xs">
                                                {totalDays} Days
                                            </span>
                                            <p className="text-2xs font-mono text-light-text-secondary dark:text-dark-text-secondary mt-0.5 font-semibold">
                                                {weekdays} Weekdays
                                            </p>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-2 text-2xs font-semibold text-light-text-secondary dark:text-dark-text-secondary">
                                                <span>✈️ {transportCount}</span>
                                                <span>🏨 {accommodationCount}</span>
                                                <span>🎯 {activityCount}</span>
                                            </div>
                                            {totalDistanceKm > 0 && (
                                                <p className="text-2xs font-mono font-bold text-primary-600 dark:text-primary-400 mt-0.5">
                                                    {totalDistanceKm.toLocaleString()} km
                                                </p>
                                            )}
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-2 min-w-[100px]">
                                                <div className="flex-1 h-1.5 bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
                                                    <div 
                                                        className={`h-full ${completeness === 100 ? 'bg-emerald-500' : 'bg-primary-500'}`} 
                                                        style={{ width: `${completeness}%` }} 
                                                    />
                                                </div>
                                                <span className="text-2xs font-mono font-bold">{completeness}%</span>
                                            </div>
                                        </td>
                                        <td className="p-4 font-mono font-bold text-xs text-emerald-600 dark:text-emerald-400">
                                            {formatCurrency(totalBudget)}
                                        </td>
                                        <td className="p-4 text-right" onClick={(e) => e.stopPropagation()}>
                                            <div className="flex items-center justify-end gap-1.5">
                                                <button
                                                    onClick={() => handleUpdateStatus(trip, trip.status === 'Planning' ? 'Upcoming' : 'Planning')}
                                                    className="p-1.5 rounded-lg text-xs font-bold bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer"
                                                    title={trip.status === 'Planning' ? 'Lock In Itinerary' : 'Revert to Draft'}
                                                    aria-label={trip.status === 'Planning' ? 'Lock In Itinerary' : 'Revert to Draft'}
                                                >
                                                    {trip.status === 'Planning' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <RotateCcw className="w-3.5 h-3.5 text-amber-500" />}
                                                </button>
                                                <button
                                                    onClick={() => handleEditTrip(trip)}
                                                    className="p-1.5 rounded-lg text-xs font-bold bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer"
                                                    title="Configure Trip"
                                                    aria-label="Configure Trip"
                                                >
                                                    <Edit3 className="w-3.5 h-3.5 text-primary-500" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </GlassPanel>
        );
    };

    if (isCreateTripOpen && !editingTrip) {
        return (
            <TripSetupBoard
                isOpen={isCreateTripOpen}
                users={users}
                onClose={() => setIsCreateTripOpen(false)}
                onTripCreated={(savedTrip) => {
                    handleSaveTrip(savedTrip);
                    setIsCreateTripOpen(false);
                }}
            />
        );
    }

    return (
        <div className="w-full max-w-[1680px] mx-auto pt-2 sm:pt-4 px-1 sm:px-4 md:px-6 lg:px-8 flex flex-col gap-5 sm:gap-6 animate-fadeIn pb-16">
            
            {/* Header: Universal Page Blueprint */}
            <div className="flex flex-row items-center justify-between gap-2.5 sm:gap-4 w-full pt-1 pb-1">
                {/* Left: Pure Icon + Responsive Scaled Title (Aligned Left) */}
                <div className="flex items-center justify-start gap-2 sm:gap-3 md:gap-4 min-w-0">
                    <Compass className="w-6 h-6 sm:w-9 sm:h-9 md:w-12 md:h-12 text-primary-500 shrink-0" weight="duotone" />
                    <div className="min-w-0">
                        <h1 className="text-xl sm:text-3xl md:text-5xl font-black tracking-tight text-light-text dark:text-dark-text leading-tight sm:leading-none truncate sm:overflow-visible">
                            Vacation Planner
                        </h1>
                        <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary font-medium mt-0.5 truncate">
                            Expedition blueprints & timeline tracks
                        </p>
                    </div>
                </div>

                {/* Right: Primary Action Buttons (Aligned Right on Mobile & Desktop) */}
                <div className="flex items-center justify-end shrink-0 gap-2 sm:gap-3">
                    <button
                        type="button"
                        onClick={toggleSelectionMode}
                        aria-label={isSelectionMode ? 'Cancel Batch' : 'Batch Merge'}
                        className={`${BTN_SECONDARY_STYLE} min-h-[44px] px-3 sm:px-4 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 sm:gap-2 cursor-pointer shrink-0`}
                    >
                        <Merge className="w-4 h-4 text-primary-500" weight="duotone" />
                        <span className="hidden sm:inline">{isSelectionMode ? 'Cancel Batch' : 'Batch Merge'}</span>
                    </button>

                    <Button
                        variant="primary"
                        color="primary"
                        onClick={() => { setEditingTrip(null); setIsCreateTripOpen(true); }}
                        aria-label="New Expedition"
                        icon={<Plus className="w-4 h-4" />}
                        className="shrink-0 min-h-[44px]"
                    >
                        New Trip
                    </Button>
                </div>
            </div>

            {/* Bento Analytics Overview (MagicUI Bento Grid) */}
            <BentoGrid className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                
                {/* 1. Next Launch Countdown */}
                <BentoCard
                    className="min-h-[145px]"
                    background={
                        <div className="absolute top-0 right-0 w-36 h-36 bg-sky-500/10 dark:bg-sky-500/15 rounded-full blur-2xl translate-x-8 -translate-y-8 pointer-events-none group-hover:scale-125 transition-transform duration-500" />
                    }
                >
                    <div className="flex items-start justify-between">
                        <div className="w-11 h-11 rounded-2xl bg-sky-500/10 text-sky-500 flex items-center justify-center text-lg shadow-inner">
                            <Plane className="w-5 h-5" />
                        </div>
                        {nextTripCountdown ? (
                            <div className="text-right">
                                <span className="text-2xl sm:text-3xl font-black font-mono text-sky-600 dark:text-sky-400 tracking-tight">
                                    {nextTripCountdown.days}
                                </span>
                                <span className="text-2xs font-mono font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block mt-0.5">
                                    Days to Launch
                                </span>
                            </div>
                        ) : (
                            <span className="text-2xs font-mono font-bold uppercase tracking-wider text-amber-500 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
                                Standby
                            </span>
                        )}
                    </div>
                    <div className="mt-3">
                        <p className="text-xs font-bold text-light-text dark:text-dark-text truncate">
                            {nextTripCountdown ? nextTripCountdown.name : "No upcoming departures scheduled"}
                        </p>
                        <p className="text-2xs font-medium text-light-text-secondary dark:text-dark-text-secondary truncate mt-0.5">
                            {nextTripCountdown ? `${nextTripCountdown.flag} ${nextTripCountdown.location} (${nextTripCountdown.region})` : "Draft a blueprint to initiate timeline"}
                        </p>
                    </div>
                </BentoCard>

                {/* 2. Confirmed / Locked Timeline */}
                <BentoCard
                    className="min-h-[145px]"
                    background={
                        <div className="absolute top-0 right-0 w-36 h-36 bg-emerald-500/10 dark:bg-emerald-500/15 rounded-full blur-2xl translate-x-8 -translate-y-8 pointer-events-none group-hover:scale-125 transition-transform duration-500" />
                    }
                >
                    <div className="flex items-start justify-between">
                        <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-lg shadow-inner">
                            <CheckCircle2 className="w-5 h-5" />
                        </div>
                        <div className="text-right">
                            <span className="text-2xl sm:text-3xl font-black font-mono text-emerald-600 dark:text-emerald-400 tracking-tight">
                                {confirmedTrips.length}
                            </span>
                            <span className="text-2xs font-mono font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block mt-0.5">
                                Locked In
                            </span>
                        </div>
                    </div>
                    <div className="mt-3">
                        <p className="text-xs font-bold text-light-text dark:text-dark-text truncate">
                            Confirmed & Calendar Synchronized
                        </p>
                        <p className="text-2xs font-medium text-light-text-secondary dark:text-dark-text-secondary truncate mt-0.5">
                            Ready for baggage & check-in
                        </p>
                    </div>
                </BentoCard>

                {/* 3. Draft Blueprints */}
                <BentoCard
                    className="min-h-[145px]"
                    background={
                        <div className="absolute top-0 right-0 w-36 h-36 bg-amber-500/10 dark:bg-amber-500/15 rounded-full blur-2xl translate-x-8 -translate-y-8 pointer-events-none group-hover:scale-125 transition-transform duration-500" />
                    }
                >
                    <div className="flex items-start justify-between">
                        <div className="w-11 h-11 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center text-lg shadow-inner">
                            <Compass className="w-5 h-5" />
                        </div>
                        <div className="text-right">
                            <span className="text-2xl sm:text-3xl font-black font-mono text-amber-600 dark:text-amber-400 tracking-tight">
                                {plannedTrips.length}
                            </span>
                            <span className="text-2xs font-mono font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block mt-0.5">
                                In Draft
                            </span>
                        </div>
                    </div>
                    <div className="mt-3">
                        <p className="text-xs font-bold text-light-text dark:text-dark-text truncate">
                            Active Itinerary Blueprints
                        </p>
                        <p className="text-2xs font-medium text-light-text-secondary dark:text-dark-text-secondary truncate mt-0.5">
                            Refining routes, dates, and stays
                        </p>
                    </div>
                </BentoCard>

                {/* 4. Financial Pipeline */}
                <BentoCard
                    className="min-h-[145px]"
                    background={
                        <div className="absolute top-0 right-0 w-36 h-36 bg-purple-500/10 dark:bg-purple-500/15 rounded-full blur-2xl translate-x-8 -translate-y-8 pointer-events-none group-hover:scale-125 transition-transform duration-500" />
                    }
                >
                    <div className="flex items-start justify-between">
                        <div className="w-11 h-11 rounded-2xl bg-purple-500/10 text-purple-500 flex items-center justify-center text-lg shadow-inner">
                            <DollarSign className="w-5 h-5" />
                        </div>
                        <div className="text-right">
                            <span className="text-xl sm:text-2xl font-black font-mono text-purple-600 dark:text-purple-400 tracking-tight">
                                {formatCurrency(totalCommittedBudget)}
                            </span>
                            <span className="text-2xs font-mono font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block mt-0.5">
                                Budget Committed
                            </span>
                        </div>
                    </div>
                    <div className="mt-3">
                        <p className="text-xs font-bold text-light-text dark:text-dark-text truncate">
                            Transit & Accommodation Estimate
                        </p>
                        <p className="text-2xs font-medium text-light-text-secondary dark:text-dark-text-secondary truncate mt-0.5">
                            {totalHolidaySavingsCount > 0 ? `✨ ${totalHolidaySavingsCount} Holiday PTO savings detected` : 'Across all planned trips'}
                        </p>
                    </div>
                </BentoCard>

            </BentoGrid>

            {/* Filter, Search & View Mode Toolbar */}
            <div className="space-y-3">
                <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
                    
                    {/* Status Tabs (Segmented Switcher) */}
                    <GlassPanel
                        className="wg-glass-pill shadow-lg shadow-black/5 dark:shadow-black/25 shrink-0"
                        padding="4px 6px"
                        overrides={{ borderRadius: 9999 }}
                    >
                        <div className="flex gap-1 relative items-center">
                            <button
                                type="button"
                                onClick={() => setActiveTab('History')}
                                className={`relative px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer z-10 ${
                                    activeTab === 'History'
                                        ? 'text-primary-600 dark:text-primary-400 font-extrabold'
                                        : 'text-light-text-secondary dark:text-dark-text-secondary opacity-70 hover:opacity-100'
                                }`}
                            >
                                {activeTab === 'History' && (
                                    <motion.div
                                        layoutId="vacationPlannerActiveTab"
                                        className="absolute inset-0 bg-white dark:bg-dark-card rounded-full shadow-sm -z-10"
                                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                    />
                                )}
                                <ClockCounterClockwise className="w-4 h-4" weight={activeTab === 'History' ? 'duotone' : 'regular'} />
                                <span>Archive Chronology</span>
                                <span className="px-2 py-0.5 rounded-full text-2xs bg-primary-500/15 text-primary-600 dark:text-primary-400 font-mono font-bold">
                                    {historyTrips.length}
                                </span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setActiveTab('Confirmed')}
                                className={`relative px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer z-10 ${
                                    activeTab === 'Confirmed'
                                        ? 'text-primary-600 dark:text-primary-400 font-extrabold'
                                        : 'text-light-text-secondary dark:text-dark-text-secondary opacity-70 hover:opacity-100'
                                }`}
                            >
                                {activeTab === 'Confirmed' && (
                                    <motion.div
                                        layoutId="vacationPlannerActiveTab"
                                        className="absolute inset-0 bg-white dark:bg-dark-card rounded-full shadow-sm -z-10"
                                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                    />
                                )}
                                <CheckCircle2 className="w-4 h-4" weight={activeTab === 'Confirmed' ? 'duotone' : 'regular'} />
                                <span>Locked Timeline</span>
                                <span className="px-2 py-0.5 rounded-full text-2xs bg-primary-500/15 text-primary-600 dark:text-primary-400 font-mono font-bold">
                                    {confirmedTrips.length}
                                </span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setActiveTab('Planned')}
                                className={`relative px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer z-10 ${
                                    activeTab === 'Planned'
                                        ? 'text-primary-600 dark:text-primary-400 font-extrabold'
                                        : 'text-light-text-secondary dark:text-dark-text-secondary opacity-70 hover:opacity-100'
                                }`}
                            >
                                {activeTab === 'Planned' && (
                                    <motion.div
                                        layoutId="vacationPlannerActiveTab"
                                        className="absolute inset-0 bg-white dark:bg-dark-card rounded-full shadow-sm -z-10"
                                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                    />
                                )}
                                <Compass className="w-4 h-4" weight={activeTab === 'Planned' ? 'duotone' : 'regular'} />
                                <span>Draft Blueprints</span>
                                <span className="px-2 py-0.5 rounded-full text-2xs bg-primary-500/15 text-primary-600 dark:text-primary-400 font-mono font-bold">
                                    {plannedTrips.length}
                                </span>
                            </button>
                        </div>
                    </GlassPanel>

                    {/* Search & View Switcher */}
                    <div className="flex items-center gap-2.5 flex-1 max-w-xl">
                        <div className="relative flex-1">
                            <Search className="w-4 h-4 text-light-text-secondary dark:text-dark-text-secondary absolute left-3.5 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                placeholder="Search expeditions, stops, notes..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className={`${INPUT_BASE_STYLE} pl-10 min-h-[40px] text-xs font-semibold`}
                            />
                            {searchQuery && (
                                <button 
                                    onClick={() => setSearchQuery('')}
                                    aria-label="Clear search"
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text cursor-pointer"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>

                        {/* View Switcher Controls */}
                        <GlassPanel
                            className="wg-glass-pill shadow-lg shadow-black/5 dark:shadow-black/25 shrink-0"
                            padding="4px 6px"
                            overrides={{ borderRadius: 9999 }}
                        >
                            <div className="flex gap-1 relative items-center">
                                <button
                                    type="button"
                                    onClick={() => setViewMode('grid')}
                                    aria-label="Grid cards view"
                                    className={`p-2 rounded-full transition-all cursor-pointer ${
                                        viewMode === 'grid' 
                                            ? 'bg-white dark:bg-dark-card text-primary-500 shadow-sm' 
                                            : 'text-light-text-secondary dark:text-dark-text-secondary opacity-60 hover:opacity-100'
                                    }`}
                                    title="Grid Cards View"
                                >
                                    <Grid3X3 className="w-4 h-4" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setViewMode('timeline')}
                                    aria-label="Timeline rail view"
                                    className={`p-2 rounded-full transition-all cursor-pointer ${
                                        viewMode === 'timeline' 
                                            ? 'bg-white dark:bg-dark-card text-primary-500 shadow-sm' 
                                            : 'text-light-text-secondary dark:text-dark-text-secondary opacity-60 hover:opacity-100'
                                    }`}
                                    title="Timeline Rail View"
                                >
                                    <Route className="w-4 h-4" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setViewMode('table')}
                                    aria-label="Logistics table view"
                                    className={`p-2 rounded-full transition-all cursor-pointer ${
                                        viewMode === 'table' 
                                            ? 'bg-white dark:bg-dark-card text-primary-500 shadow-sm' 
                                            : 'text-light-text-secondary dark:text-dark-text-secondary opacity-60 hover:opacity-100'
                                    }`}
                                    title="Logistics Table View"
                                >
                                    <List className="w-4 h-4" />
                                </button>
                            </div>
                        </GlassPanel>

                        {/* Filter Toggle */}
                        <button
                            type="button"
                            onClick={() => setShowAdvancedFilters(prev => !prev)}
                            aria-label="Toggle filters"
                            className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                                showAdvancedFilters || filterYear !== 'all' || filterPrivacy !== 'all' || filterUser !== 'all' || filterTransportMode !== 'all'
                                    ? 'bg-primary-500/15 border-primary-500 text-primary-600 dark:text-primary-400'
                                    : 'bg-white/80 dark:bg-dark-card/80 border-black/10 dark:border-white/10 text-light-text-secondary'
                            }`}
                            title="Toggle Filters"
                        >
                            <SlidersHorizontal className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Collapsible Filter & Sort Bar */}
                <AnimatePresence>
                    {showAdvancedFilters && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="p-4 rounded-2xl bg-white/80 dark:bg-dark-card/80 backdrop-blur-xl border border-black/5 dark:border-white/10 shadow-sm grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
                                
                                {/* Year Filter */}
                                <div>
                                    <label className="block text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary mb-1">
                                        Departure Year
                                    </label>
                                    <select
                                        value={filterYear}
                                        onChange={e => setFilterYear(e.target.value)}
                                        className="w-full p-2 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-light-text dark:text-dark-text font-semibold outline-none cursor-pointer"
                                    >
                                        <option value="all">All Years ({availableYears.length})</option>
                                        {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                                    </select>
                                </div>

                                {/* Privacy Filter */}
                                <div>
                                    <label className="block text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary mb-1">
                                        Privacy Tag
                                    </label>
                                    <select
                                        value={filterPrivacy}
                                        onChange={e => setFilterPrivacy(e.target.value)}
                                        className="w-full p-2 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-light-text dark:text-dark-text font-semibold outline-none cursor-pointer"
                                    >
                                        <option value="all">All Privacy</option>
                                        <option value="public">🌍 Public Expeditions</option>
                                        <option value="private">🔒 Private Only</option>
                                    </select>
                                </div>

                                {/* Co-traveler Filter */}
                                <div>
                                    <label className="block text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary mb-1">
                                        Co-Traveler
                                    </label>
                                    <select
                                        value={filterUser}
                                        onChange={e => setFilterUser(e.target.value)}
                                        className="w-full p-2 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-light-text dark:text-dark-text font-semibold outline-none cursor-pointer"
                                    >
                                        <option value="all">All Travelers</option>
                                        {users.map(u => (
                                            <option key={u.id} value={u.id}>{u.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Transport Mode Filter */}
                                <div>
                                    <label className="block text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary mb-1">
                                        Transit Mode
                                    </label>
                                    <select
                                        value={filterTransportMode}
                                        onChange={e => setFilterTransportMode(e.target.value)}
                                        className="w-full p-2 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-light-text dark:text-dark-text font-semibold outline-none cursor-pointer"
                                    >
                                        <option value="all">All Transports</option>
                                        <option value="flight">✈️ Flights Included</option>
                                        <option value="train">🚆 Trains Included</option>
                                        <option value="road">🚗 Road Trips</option>
                                        <option value="ferry">⛴️ Ferries / Cruises</option>
                                    </select>
                                </div>

                                {/* Sort By */}
                                <div>
                                    <label className="block text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary mb-1">
                                        Sort Sequence
                                    </label>
                                    <select
                                        value={sortBy}
                                        onChange={e => setSortBy(e.target.value as SortOption)}
                                        className="w-full p-2 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-light-text dark:text-dark-text font-semibold outline-none cursor-pointer"
                                    >
                                        <option value="date_asc">📅 Date (Earliest First)</option>
                                        <option value="date_desc">📅 Date (Latest First)</option>
                                        <option value="duration_desc">⏳ Duration (Longest)</option>
                                        <option value="budget_desc">💰 Budget (Highest)</option>
                                        <option value="completeness_asc">🎯 Completeness (Needs Work)</option>
                                    </select>
                                </div>

                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Main Stage Presentation */}
            <AnimatePresence mode="wait">
                {activeTripsList.length === 0 ? (
                    <motion.div
                        key="empty-stage"
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -15 }}
                        className="py-20 text-center bg-white/40 dark:bg-dark-card/40 border border-dashed border-black/20 dark:border-white/15 rounded-3xl p-8"
                    >
                        <Compass className="w-12 h-12 mx-auto text-primary-500 opacity-60 mb-3" />
                        <h3 className="text-lg font-bold text-light-text dark:text-dark-text">No Expeditions Match Current View</h3>
                        <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary max-w-sm mx-auto mt-1 font-medium">
                            {searchQuery ? 'Try modifying your search keywords or clearing active filters.' : 'Draft your next journey to establish routing tracks and integrate flights.'}
                        </p>
                        <button
                            type="button"
                            onClick={() => { setEditingTrip(null); setIsCreateTripOpen(true); }}
                            className="mt-6 px-6 py-2.5 rounded-full bg-primary-500 hover:bg-primary-600 text-white text-xs font-bold uppercase tracking-wider transition-all shadow-md shadow-primary-500/20 active:scale-95 inline-flex items-center gap-2 cursor-pointer"
                        >
                            <Plus className="w-4 h-4" />
                            <span>Draft Expedition</span>
                        </button>
                    </motion.div>
                ) : viewMode === 'table' ? (
                    <motion.div
                        key="table-view"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                    >
                        {renderTableView()}
                    </motion.div>
                ) : viewMode === 'timeline' ? (
                    <motion.div
                        key="timeline-view"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-12 relative"
                    >
                        {/* Central Route Spine */}
                        <div className="absolute left-6 md:left-24 top-6 bottom-6 w-0.5 bg-gradient-to-b from-primary-500/50 via-primary-500/20 to-transparent hidden md:block" />

                        {timelineYears.map(year => {
                            const isCollapsed = collapsedYears.has(year);
                            const yearTrips = timelineTripsByYear[year] || [];

                            return (
                                <div key={year} className="relative md:pl-32">
                                    {/* Year Station Marker */}
                                    <button
                                        type="button"
                                        onClick={() => toggleYearCollapse(year)}
                                        className={`absolute left-[81px] top-1.5 w-10 h-10 rounded-full border-4 items-center justify-center z-10 hidden md:flex transition-all cursor-pointer ${
                                            isCollapsed
                                                ? 'bg-light-fill dark:bg-dark-fill border-black/10 dark:border-white/10 text-light-text-secondary'
                                                : 'bg-white dark:bg-dark-card border-primary-500 text-primary-500 shadow-md shadow-primary-500/20'
                                        }`}
                                        title={isCollapsed ? 'Expand Year' : 'Collapse Year'}
                                        aria-label={isCollapsed ? `Expand ${year}` : `Collapse ${year}`}
                                    >
                                        <ChevronDown 
                                            className={`w-4 h-4 transition-transform duration-300 ${isCollapsed ? '-rotate-90' : 'rotate-0'}`} 
                                        />
                                    </button>

                                    {/* Year Label Header */}
                                    <div 
                                        className="flex items-center gap-4 mb-6 cursor-pointer group select-none"
                                        onClick={() => toggleYearCollapse(year)}
                                    >
                                        <div className="text-left shrink-0 md:absolute md:left-0 md:top-2 md:w-20 md:text-right">
                                            <span className="text-2xl sm:text-3xl font-black font-mono text-primary-500/70 group-hover:text-primary-500 transition-colors">
                                                {year}
                                            </span>
                                        </div>
                                        <div className="h-px bg-black/5 dark:bg-white/10 flex-1 hidden md:block" />
                                        <span className="text-2xs font-mono font-bold uppercase tracking-widest text-light-text-secondary dark:text-dark-text-secondary">
                                            {yearTrips.length} {yearTrips.length === 1 ? 'Expedition' : 'Expeditions'}
                                        </span>
                                    </div>

                                    {!isCollapsed && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                                            {yearTrips.map(trip => renderTripCard(trip))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </motion.div>
                ) : (
                    <motion.div
                        key="grid-view"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6"
                    >
                        {activeTripsList.map(trip => renderTripCard(trip))}

                        {/* Blank Canvas Draft Invitation Card */}
                        <motion.button
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            onClick={() => { setEditingTrip(null); setIsCreateTripOpen(true); }}
                            className="min-h-[360px] rounded-3xl border-2 border-dashed border-black/20 dark:border-white/15 hover:border-primary-500/50 dark:hover:border-primary-500/50 p-8 flex flex-col items-center justify-center gap-4 group transition-all duration-200 bg-white/40 dark:bg-dark-card/40 cursor-pointer text-center"
                        >
                            <div className="w-14 h-14 rounded-2xl bg-black/5 dark:bg-white/5 group-hover:bg-primary-500 text-light-text-secondary dark:text-dark-text-secondary group-hover:text-white flex items-center justify-center transition-all duration-200 shadow-sm">
                                <Plus className="w-6 h-6" />
                            </div>
                            <div className="space-y-1">
                                <span className="font-bold text-xs uppercase tracking-wider text-light-text dark:text-dark-text block group-hover:text-primary-500 transition-colors">
                                    Draft New Expedition
                                </span>
                                <span className="text-2xs text-light-text-secondary dark:text-dark-text-secondary max-w-[200px] block font-medium">
                                    Establish routes, align public holidays, link flights, and assign co-travelers.
                                </span>
                            </div>
                        </motion.button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Floating Batch Consolidation Dock */}
            <AnimatePresence>
                {isSelectionMode && (
                    <motion.div
                        initial={{ y: 80, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 80, opacity: 0 }}
                        className="fixed bottom-6 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:max-w-2xl z-50 pointer-events-auto"
                    >
                        <div className="bg-gray-900/95 dark:bg-black/95 text-white backdrop-blur-2xl px-6 py-4 rounded-3xl border border-white/10 shadow-glass-modal flex flex-col md:flex-row gap-4 items-center justify-between">
                            <div className="flex items-center gap-3 min-w-0 self-start md:self-auto">
                                <div className="w-10 h-10 rounded-xl bg-primary-500/20 text-primary-400 flex items-center justify-center text-lg shrink-0">
                                    <Merge className="w-5 h-5" />
                                </div>
                                <div className="min-w-0">
                                    <div className="text-2xs font-mono font-bold uppercase tracking-widest text-primary-400">Batch Integrator</div>
                                    <p className="text-xs font-medium text-zinc-300 truncate">
                                        {selectedTripIds.size === 0 
                                            ? 'Click cards to select itineraries for consolidation' 
                                            : `${selectedTripIds.size} itineraries selected`}
                                    </p>
                                </div>
                            </div>

                            {selectedTripIds.size >= 2 ? (
                                <div className="w-full md:w-auto flex flex-col gap-2 shrink-0">
                                    <input
                                        type="text"
                                        placeholder="Consolidated Journey Title..."
                                        value={customMergeName}
                                        onChange={e => setCustomMergeName(e.target.value)}
                                        className="w-full bg-white/10 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder-zinc-400 outline-none focus:border-primary-500 font-medium"
                                    />
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={toggleSelectionMode}
                                            className="flex-1 py-1.5 px-3 rounded-xl text-xs font-bold uppercase tracking-wider text-zinc-400 hover:text-white transition-colors cursor-pointer"
                                        >
                                            Dismiss
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleMergeTrips}
                                            disabled={isMerging}
                                            className="flex-1 py-1.5 px-4 bg-primary-500 hover:bg-primary-600 rounded-xl text-xs font-bold uppercase tracking-wider text-white transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                                        >
                                            <Merge className="w-3.5 h-3.5" />
                                            <span>{isMerging ? 'Merging...' : 'Consolidate'}</span>
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={toggleSelectionMode}
                                    className="px-4 py-2 bg-white/10 hover:bg-white/15 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
                                >
                                    Exit Selection
                                </button>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Create & Edit Trip Configurator Wizard Modal */}
            <TripModal
                isOpen={isCreateTripOpen}
                onClose={() => setIsCreateTripOpen(false)}
                onSubmit={handleSaveTrip}
                onDelete={handleDeleteTrip}
                users={users}
                initialData={editingTrip}
            />

        </div>
    );
};
