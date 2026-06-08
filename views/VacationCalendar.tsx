import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Users, 
  Sparkles, 
  Info, 
  Plane, 
  Clock, 
  AlertCircle, 
  Search, 
  Filter, 
  Check, 
  MapPin, 
  Layers, 
  Grid,
  List,
  Compass,
  ArrowRight
} from 'lucide-react';
import { Button, Badge, Card, Modal, Select } from '../components/ui';
import { dataService } from '../services/mockDb';
import { useWanderSync } from '../hooks/useWanderSync';
import { Trip, User, EntitlementType, SavedConfig, CustomEvent as TripCustomEvent } from '../types';

interface VacationCalendarProps {
  onTripClick?: (tripId: string) => void;
}

// Map color tokens to Tailwind css styles
const ENTITLEMENT_COLORS: Record<string, { bg: string; text: string; border: string; dot: string; hover: string; accent: string }> = {
  blue: { 
    bg: 'bg-blue-50/70 dark:bg-blue-950/20', 
    text: 'text-blue-700 dark:text-blue-300', 
    border: 'border-blue-200/50 dark:border-blue-800/30', 
    dot: 'bg-blue-500',
    hover: 'hover:bg-blue-100 dark:hover:bg-blue-950/40',
    accent: 'bg-blue-500/20'
  },
  green: { 
    bg: 'bg-emerald-50/70 dark:bg-emerald-950/20', 
    text: 'text-emerald-700 dark:text-emerald-300', 
    border: 'border-emerald-200/50 dark:border-emerald-800/30', 
    dot: 'bg-emerald-500',
    hover: 'hover:bg-emerald-100 dark:hover:bg-emerald-950/40',
    accent: 'bg-emerald-500/20'
  },
  amber: { 
    bg: 'bg-amber-50/70 dark:bg-amber-950/20', 
    text: 'text-amber-700 dark:text-amber-300', 
    border: 'border-amber-200/50 dark:border-amber-800/30', 
    dot: 'bg-amber-500',
    hover: 'hover:bg-amber-100 dark:hover:bg-amber-950/40',
    accent: 'bg-amber-500/20'
  },
  gray: { 
    bg: 'bg-zinc-100/70 dark:bg-zinc-800/40', 
    text: 'text-zinc-700 dark:text-zinc-300', 
    border: 'border-zinc-200/50 dark:border-zinc-700/30', 
    dot: 'bg-zinc-500',
    hover: 'hover:bg-zinc-200 dark:hover:bg-zinc-800/60',
    accent: 'bg-zinc-500/20'
  },
  purple: { 
    bg: 'bg-purple-50/70 dark:bg-purple-950/20', 
    text: 'text-purple-700 dark:text-purple-300', 
    border: 'border-purple-200/50 dark:border-purple-800/30', 
    dot: 'bg-purple-500',
    hover: 'hover:bg-purple-100 dark:hover:bg-purple-950/40',
    accent: 'bg-purple-500/20'
  },
  red: { 
    bg: 'bg-rose-50/70 dark:bg-rose-950/20', 
    text: 'text-rose-700 dark:text-rose-300', 
    border: 'border-rose-200/50 dark:border-rose-800/30', 
    dot: 'bg-rose-500',
    hover: 'hover:bg-rose-100 dark:hover:bg-rose-950/40',
    accent: 'bg-rose-500/20'
  },
  indigo: { 
    bg: 'bg-indigo-50/70 dark:bg-indigo-950/20', 
    text: 'text-indigo-700 dark:text-indigo-300', 
    border: 'border-indigo-200/50 dark:border-indigo-800/30', 
    dot: 'bg-indigo-505',
    hover: 'hover:bg-indigo-150 dark:hover:bg-indigo-950/40',
    accent: 'bg-indigo-500/20'
  },
  pink: { 
    bg: 'bg-pink-50/70 dark:bg-pink-950/20', 
    text: 'text-pink-700 dark:text-pink-300', 
    border: 'border-pink-200/50 dark:border-pink-800/30', 
    dot: 'bg-pink-500',
    hover: 'hover:bg-pink-100 dark:hover:bg-pink-950/40',
    accent: 'bg-pink-500/20'
  },
  teal: { 
    bg: 'bg-teal-50/70 dark:bg-teal-950/20', 
    text: 'text-teal-700 dark:text-teal-300', 
    border: 'border-teal-200/50 dark:border-teal-800/30', 
    dot: 'bg-teal-500',
    hover: 'hover:bg-teal-100 dark:hover:bg-teal-950/40',
    accent: 'bg-teal-500/20'
  },
  cyan: { 
    bg: 'bg-cyan-50/70 dark:bg-cyan-950/20', 
    text: 'text-cyan-700 dark:text-cyan-300', 
    border: 'border-cyan-200/50 dark:border-cyan-800/30', 
    dot: 'bg-cyan-500',
    hover: 'hover:bg-cyan-100 dark:hover:bg-cyan-950/40',
    accent: 'bg-cyan-500/20'
  },
};

const DEFAULT_COLOR = ENTITLEMENT_COLORS.blue;

export const VacationCalendar: React.FC<VacationCalendarProps> = ({ onTripClick }) => {
  // Query state with useWanderSync
  const { data: rawTrips, loading: tripsLoading } = useWanderSync('trips', () => dataService.getTrips());
  const { data: users, loading: usersLoading } = useWanderSync('users', () => dataService.getUsers());
  const { data: entitlements, loading: entitlementsLoading } = useWanderSync('entitlements', () => dataService.getEntitlementTypes());
  const { data: savedConfigs, loading: configsLoading } = useWanderSync('configs', () => dataService.getSavedConfigs());
  const { data: customEvents, loading: eventsLoading } = useWanderSync('events', () => dataService.getCustomEvents());
  const { data: settings, loading: settingsLoading } = useWanderSync('settings', () => dataService.getWorkspaceSettings());

  // Date controls
  const [currentDate, setCurrentDate] = useState<Date>(new Date(2026, 5, 7)); // Default to June 2026 as per local clock
  const [activeTab, setActiveTab] = useState<'timeline' | 'grid' | 'agenda' | 'optimizer'>('timeline');
  
  // Filtering and Selection States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEntitlementFilter, setSelectedEntitlementFilter] = useState('all');
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [selectedItemDetails, setSelectedItemDetails] = useState<{
    type: 'trip' | 'holiday' | 'event';
    title: string;
    description?: string;
    startDate?: string;
    endDate?: string;
    colorClass?: { bg: string; text: string; border: string; dot: string };
    meta?: any;
  } | null>(null);

  // Set default selected users when users are retrieved
  useEffect(() => {
    if (users && users.length > 0 && selectedUsers.size === 0) {
      setSelectedUsers(new Set(users.map(u => u.id)));
    }
  }, [users]);

  // Clean local split date parsing to bypass client browser timezone sliding
  const parseDateResilient = (dateStr: string) => {
    if (!dateStr) return new Date();
    const parts = dateStr.split('-');
    if (parts.length !== 3) return new Date(dateStr);
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    return new Date(year, month, day);
  };

  const trips = useMemo(() => {
    if (!rawTrips) return [];
    return rawTrips.filter(t => !(t as any).isBundleOnly && !(t as any).hideInPlanner);
  }, [rawTrips]);

  // Public holidays flattened
  const publicHolidays = useMemo(() => {
    if (!savedConfigs) return [];
    return savedConfigs.flatMap(c => c.holidays.map(h => ({ ...h, configId: c.id })));
  }, [savedConfigs]);

  // Active dates calculated
  const activeYear = currentDate.getFullYear();
  const activeMonth = currentDate.getMonth(); // 0-based index

  const daysInMonth = useMemo(() => {
    return new Date(activeYear, activeMonth + 1, 0).getDate();
  }, [activeYear, activeMonth]);

  const monthFirstDayIndex = useMemo(() => {
    return new Date(activeYear, activeMonth, 1).getDay(); // 0=Sun, 1=Mon...
  }, [activeYear, activeMonth]);

  // Header display name of month
  const monthName = useMemo(() => {
    return currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });
  }, [currentDate]);

  // Navigation handlers
  const handlePrevMonth = () => {
    setCurrentDate(new Date(activeYear, activeMonth - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(activeYear, activeMonth + 1, 1));
  };

  const handleJumpToToday = () => {
    setCurrentDate(new Date(2026, 5, 7)); // June 7, 2026
  };

  const toggleUserFilter = (userId: string) => {
    const newSet = new Set(selectedUsers);
    if (newSet.has(userId)) {
      if (newSet.size > 1) newSet.delete(userId); // Ensure at least one is focused
    } else {
      newSet.add(userId);
    }
    setSelectedUsers(newSet);
  };

  const toggleSelectAllUsers = () => {
    if (!users) return;
    if (selectedUsers.size === users.length) {
      // Focus on current logged-in user or first user only
      const defaultUser = localStorage.getItem('wandergrid_session_user');
      if (defaultUser) {
        try {
          const parsed = JSON.parse(defaultUser);
          setSelectedUsers(new Set([parsed.id]));
          return;
        } catch {}
      }
      setSelectedUsers(new Set([users[0].id]));
    } else {
      setSelectedUsers(new Set(users.map(u => u.id)));
    }
  };

  // Resolve matching entitlement details safely
  const getEntitlementStyle = (entTypeId?: string) => {
    if (!entTypeId || !entitlements) return DEFAULT_COLOR;
    const matched = entitlements.find(e => e.id === entTypeId);
    if (!matched) return DEFAULT_COLOR;
    return ENTITLEMENT_COLORS[matched.color] || DEFAULT_COLOR;
  };

  const getEntitlementName = (entTypeId?: string) => {
    if (!entTypeId || !entitlements) return 'General Trip';
    const matched = entitlements.find(e => e.id === entTypeId);
    return matched ? `${matched.name} Leave` : 'General Trip';
  };

  // Core filter logic matching user intent
  const holidayMatchesFilter = useMemo(() => {
    return selectedEntitlementFilter === 'all' || selectedEntitlementFilter === 'holiday';
  }, [selectedEntitlementFilter]);

  const customEventsMatchesFilter = useMemo(() => {
    return selectedEntitlementFilter === 'all' || selectedEntitlementFilter === 'event';
  }, [selectedEntitlementFilter]);

  const filteredTrips = useMemo(() => {
    return trips.filter(trip => {
      // 1. Participant mapping
      const hasActiveUser = trip.participants?.some(uid => selectedUsers.has(uid));
      if (!hasActiveUser) return false;

      // 2. Search query mapping
      const matchesSearch = !searchQuery || 
        trip.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        (trip.location && trip.location.toLowerCase().includes(searchQuery.toLowerCase()));
      if (!matchesSearch) return false;

      // 3. Entitlement mapping
      if (selectedEntitlementFilter !== 'all') {
        if (selectedEntitlementFilter === 'holiday' || selectedEntitlementFilter === 'event') return false;
        if (trip.entitlementId !== selectedEntitlementFilter) return false;
      }

      return true;
    });
  }, [trips, selectedUsers, searchQuery, selectedEntitlementFilter]);

  // Aggregate stats showing leave allocations
  const activeUserStats = useMemo(() => {
    if (!users || !entitlements) return [];
    
    return users.filter(u => selectedUsers.has(u.id)).map(user => {
      // Find all upcoming trips of this year for active user
      const userTripsThisYear = trips.filter(t => {
        if (!t.participants?.includes(user.id)) return false;
        const startY = new Date(t.startDate).getFullYear();
        return startY === activeYear;
      });

      const personalLeaveTrips = userTripsThisYear.filter(t => !!t.entitlementId);

      // Total days planned using leave entitlements
      const totalLeaveDaysPlanned = personalLeaveTrips.reduce((sum, t) => {
        const d = Math.ceil((new Date(t.endDate).getTime() - new Date(t.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1;
        return sum + (isNaN(d) ? 0 : d);
      }, 0);

      const balanceText = `${user.allowance - user.takenLeave} remaining of ${user.allowance} days`;
      const currentQuotaProgress = user.allowance > 0 ? Math.round(((totalLeaveDaysPlanned + user.takenLeave) / user.allowance) * 100) : 0;

      return {
        user,
        plannedDays: totalLeaveDaysPlanned,
        takenDays: user.takenLeave,
        quotaProgress: Math.min(100, currentQuotaProgress),
        remainingDays: Math.max(0, user.allowance - user.takenLeave),
        balanceText
      };
    });
  }, [users, entitlements, trips, selectedUsers, activeYear]);

  // Grid Cell mapper (grouping all aggregated schedules by Day)
  const cellSchedulesByDay = useMemo(() => {
    const map: Record<number, Array<{
      type: 'trip' | 'holiday' | 'event';
      id: string;
      title: string;
      colorClass: { bg: string; text: string; border: string; dot: string; hover: string };
      meta: any;
    }>> = {};

    for (let day = 1; day <= daysInMonth; day++) {
      map[day] = [];
    }

    const startOfMonth = new Date(activeYear, activeMonth, 1);
    const endOfMonth = new Date(activeYear, activeMonth, daysInMonth, 23, 59, 59);

    // 1. Process Trips
    filteredTrips.forEach(trip => {
      const sDate = parseDateResilient(trip.startDate);
      const eDate = parseDateResilient(trip.endDate);

      // Check month boundary overlap
      if (sDate <= endOfMonth && eDate >= startOfMonth) {
        const entStyle = getEntitlementStyle(trip.entitlementId);
        
        // Find which days of active month are overlapped
        const overlapStart = Math.max(1, sDate.getMonth() === activeMonth ? sDate.getDate() : 1);
        const overlapEnd = Math.min(daysInMonth, eDate.getMonth() === activeMonth ? eDate.getDate() : daysInMonth);

        for (let day = overlapStart; day <= overlapEnd; day++) {
          map[day].push({
            type: 'trip',
            id: trip.id,
            title: trip.name,
            colorClass: entStyle,
            meta: trip
          });
        }
      }
    });

    // 2. Process Public Holidays
    if (holidayMatchesFilter && publicHolidays) {
      publicHolidays.forEach(holiday => {
        const hDate = parseDateResilient(holiday.date);
        if (hDate.getFullYear() === activeYear && hDate.getMonth() === activeMonth) {
          const day = hDate.getDate();
          if (map[day]) {
            map[day].push({
              type: 'holiday',
              id: holiday.id,
              title: holiday.name,
              colorClass: {
                bg: 'bg-amber-100/50 dark:bg-amber-950/15',
                text: 'text-amber-800 dark:text-amber-400',
                border: 'border-amber-250/30 dark:border-amber-900/20',
                dot: 'bg-amber-400',
                hover: 'hover:bg-amber-150'
              },
              meta: holiday
            });
          }
        }
      });
    }

    // 3. Process Custom Events
    if (customEventsMatchesFilter && customEvents) {
      customEvents.forEach(event => {
        const evDate = parseDateResilient(event.date);
        if (evDate.getFullYear() === activeYear && evDate.getMonth() === activeMonth) {
          const day = evDate.getDate();
          if (map[day]) {
            map[day].push({
              type: 'event',
              id: event.id,
              title: event.name,
              colorClass: {
                bg: 'bg-indigo-50/70 dark:bg-indigo-950/10',
                text: 'text-indigo-800 dark:text-indigo-400',
                border: 'border-indigo-200/50 dark:border-indigo-900/10',
                dot: 'bg-indigo-400',
                hover: 'hover:bg-indigo-100'
              },
              meta: event
            });
          }
        }
      });
    }

    return map;
  }, [activeYear, activeMonth, daysInMonth, filteredTrips, publicHolidays, customEvents, holidayMatchesFilter, customEventsMatchesFilter, entitlements]);


  // Agenda stream aggregated and sorted chronologically
  const sortedAgendaEvents = useMemo(() => {
    const list: Array<{
      type: 'trip' | 'holiday' | 'event';
      id: string;
      title: string;
      dateText: string;
      daysCount: number;
      startDateObj: Date;
      endDateObj: Date;
      isMultiDay: boolean;
      colorClass: { bg: string; text: string; border: string; dot: string; hover: string };
      meta: any;
      countdownDays: number;
    }> = [];

    const today = new Date(2026, 5, 7); // Active time anchor June 7, 2026

    // Add filtered trips
    filteredTrips.forEach(trip => {
      const sDate = parseDateResilient(trip.startDate);
      const eDate = parseDateResilient(trip.endDate);
      const daysCount = Math.ceil((eDate.getTime() - sDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      // Only show upcoming or active trips
      if (eDate >= today) {
        const entStyle = getEntitlementStyle(trip.entitlementId);
        const diffTime = sDate.getTime() - today.getTime();
        const countdownDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        list.push({
          type: 'trip',
          id: trip.id,
          title: trip.name,
          dateText: `${sDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${eDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`,
          daysCount,
          startDateObj: sDate,
          endDateObj: eDate,
          isMultiDay: daysCount > 1,
          colorClass: entStyle,
          meta: trip,
          countdownDays: countdownDays > 0 ? countdownDays : 0
        });
      }
    });

    // Add upcoming public holidays
    if (holidayMatchesFilter && publicHolidays) {
      publicHolidays.forEach(holiday => {
        const hDate = parseDateResilient(holiday.date);
        
        if (hDate >= today) {
          const diffTime = hDate.getTime() - today.getTime();
          const countdownDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          list.push({
            type: 'holiday',
            id: holiday.id,
            title: holiday.name,
            dateText: hDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }),
            daysCount: 1,
            startDateObj: hDate,
            endDateObj: hDate,
            isMultiDay: false,
            colorClass: {
              bg: 'bg-amber-100/50 dark:bg-amber-955/15 hover:bg-amber-150',
              text: 'text-amber-850 dark:text-amber-400',
              border: 'border-amber-250/30 dark:border-amber-900/20',
              dot: 'bg-amber-400',
              hover: 'hover:bg-amber-250/30'
            },
            meta: holiday,
            countdownDays
          });
        }
      });
    }

    // Add upcoming custom events
    if (customEventsMatchesFilter && customEvents) {
      customEvents.forEach(event => {
        const evDate = parseDateResilient(event.date);
        
        if (evDate >= today) {
          const diffTime = evDate.getTime() - today.getTime();
          const countdownDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          list.push({
            type: 'event',
            id: event.id,
            title: event.name,
            dateText: evDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }),
            daysCount: 1,
            startDateObj: evDate,
            endDateObj: evDate,
            isMultiDay: false,
            colorClass: {
              bg: 'bg-indigo-50/70 dark:bg-indigo-950/10 hover:bg-indigo-100',
              text: 'text-indigo-850 dark:text-indigo-400',
              border: 'border-indigo-200/50 dark:border-indigo-900/10',
              dot: 'bg-indigo-400',
              hover: 'hover:bg-indigo-150'
            },
            meta: event,
            countdownDays
          });
        }
      });
    }

    // Sort chronologically
    return list.sort((a, b) => a.startDateObj.getTime() - b.startDateObj.getTime());
  }, [filteredTrips, publicHolidays, customEvents, holidayMatchesFilter, customEventsMatchesFilter, entitlements]);


  // Leave Bridge and Weekends Optimizations Engine (MASSIVE architectural value-add!)
  const bridgeOptimizationGuides = useMemo(() => {
    if (!publicHolidays) return [];
    
    const recommendations: Array<{
      id: string;
      holidayName: string;
      holidayDate: string;
      dayOfWeek: string;
      bridgeDate: string;
      bridgeDay: string;
      suggestedLeaveDays: number;
      totalDaysRested: number;
      spanText: string;
      reason: string;
      type: 'bridge' | 'sandwich' | 'info';
    }> = [];

    const today = new Date(2026, 5, 7); // June 7, 2026 
    const isWeekendDay = (date: Date) => {
      const idx = date.getDay();
      return idx === 0 || idx === 6; // Sun or Sat
    };

    // Scan throughout the next 6 months to find optimizations
    const scanLimit = new Date(today.getFullYear(), today.getMonth() + 6, today.getDate());

    publicHolidays.forEach(holiday => {
      const hDate = parseDateResilient(holiday.date);
      
      if (hDate >= today && hDate <= scanLimit) {
        const dayIdx = hDate.getDay(); // 0 = Sun, 4 = Thu, 2 = Tue, etc.
        const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayName = weekdays[dayIdx];

        const prevDay = new Date(hDate.getFullYear(), hDate.getMonth(), hDate.getDate() - 1);
        const nextDay = new Date(hDate.getFullYear(), hDate.getMonth(), hDate.getDate() + 1);

        if (dayIdx === 4) { // Thursday holiday: Bridge Friday
          const friDateStr = nextDay.toISOString().split('T')[0];
          recommendations.push({
            id: `opt-${holiday.id}`,
            holidayName: holiday.name,
            holidayDate: holiday.date,
            dayOfWeek: dayName,
            bridgeDate: friDateStr,
            bridgeDay: 'Friday',
            suggestedLeaveDays: 1,
            totalDaysRested: 4,
            spanText: `Thurs [${holiday.name}] to Sun`,
            reason: `Request Friday off to link Thursday's ${holiday.name} directly with the weekend for a premium 4-day vacation!`,
            type: 'bridge'
          });
        } else if (dayIdx === 2) { // Tuesday holiday: Bridge Monday
          const monDateStr = prevDay.toISOString().split('T')[0];
          recommendations.push({
            id: `opt-${holiday.id}`,
            holidayName: holiday.name,
            holidayDate: holiday.date,
            dayOfWeek: dayName,
            bridgeDate: monDateStr,
            bridgeDay: 'Monday',
            suggestedLeaveDays: 1,
            totalDaysRested: 4,
            spanText: `Sat to Tues [${holiday.name}]`,
            reason: `Apply for Monday off to merge the weekend with Tuesday's public holiday ${holiday.name} into a 4-day retreat.`,
            type: 'bridge'
          });
        } else if (dayIdx === 3) { // Wednesday holiday: Midweek sandwich
          const monTueStr = `${prevDay.toLocaleDateString(undefined, {month: 'numeric', day: 'numeric'})} & ${new Date(prevDay.getFullYear(), prevDay.getMonth(), prevDay.getDate() - 1).toLocaleDateString(undefined, {day: 'numeric'})}`;
          recommendations.push({
            id: `opt-${holiday.id}`,
            holidayName: holiday.name,
            holidayDate: holiday.date,
            dayOfWeek: dayName,
            bridgeDate: nextDay.toISOString().split('T')[0], // Suggest either Thu or Fri
            bridgeDay: 'Thursday & Friday',
            suggestedLeaveDays: 2,
            totalDaysRested: 5,
            spanText: `Wed [${holiday.name}] to Sun`,
            reason: `Midweek holiday on Wednesday! Requesting Thursday & Friday off lets you stand down for 5 consecutive days of rest.`,
            type: 'sandwich'
          });
        } else if (dayIdx === 1 || dayIdx === 5) { // Monday or Friday holiday: Standard long weekend
          recommendations.push({
            id: `opt-${holiday.id}`,
            holidayName: holiday.name,
            holidayDate: holiday.date,
            dayOfWeek: dayName,
            bridgeDate: '',
            bridgeDay: '',
            suggestedLeaveDays: 0,
            totalDaysRested: 3,
            spanText: dayIdx === 1 ? 'Sat to Mon' : 'Fri to Sun',
            reason: `Excellent news! This creates a natural 3-day long weekend without drawing from your personal leave balances.`,
            type: 'info'
          });
        }
      }
    });

    return recommendations;
  }, [publicHolidays]);

  // Handle cell click details
  const handleCellItemClick = (e: React.MouseEvent, eventObj: any) => {
    e.stopPropagation();
    
    if (eventObj.type === 'trip') {
      const trip = eventObj.meta as Trip;
      const duration = Math.ceil((new Date(trip.endDate).getTime() - new Date(trip.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1;
      setSelectedItemDetails({
        type: 'trip',
        title: trip.name,
        description: `Scheduled trip to ${trip.location || 'various destinations'}.`,
        startDate: trip.startDate,
        endDate: trip.endDate,
        colorClass: eventObj.colorClass,
        meta: {
          ...trip,
          duration,
          participantsNames: trip.participants?.map(uid => users?.find(u => u.id === uid)?.name).filter(Boolean).join(', ')
        }
      });
    } else if (eventObj.type === 'holiday') {
      const holiday = eventObj.meta as PublicHoliday;
      setSelectedItemDetails({
        type: 'holiday',
        title: holiday.name,
        description: `Official Public Holiday in selected territory (${holiday.countryCode}).`,
        startDate: holiday.date,
        endDate: holiday.date,
        colorClass: eventObj.colorClass,
        meta: holiday
      });
    } else if (eventObj.type === 'event') {
      const ev = eventObj.meta as TripCustomEvent;
      setSelectedItemDetails({
        type: 'event',
        title: ev.name,
        description: ev.isWorkingDay ? 'Special Custom Working Day.' : 'Custom Non-working organizational event offsite.',
        startDate: ev.date,
        endDate: ev.date,
        colorClass: eventObj.colorClass,
        meta: ev
      });
    }
  };

  const isWeekendColumn = (dayIndex: number) => {
    // 0 = Sun, 6 = Sat
    const tempDate = new Date(activeYear, activeMonth, dayIndex);
    const day = tempDate.getDay();
    return day === 0 || day === 6;
  };

  const getDayLabelShort = (dayIndex: number) => {
    const tempDate = new Date(activeYear, activeMonth, dayIndex);
    return tempDate.toLocaleString('default', { weekday: 'narrow' });
  };

  const isLoading = tripsLoading || usersLoading || entitlementsLoading || configsLoading || eventsLoading || settingsLoading;

  if (isLoading) {
    return (
      <div className="w-full h-[60vh] flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 border-4 border-[#fa9a1d] border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-400">Loading Vacation Map...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-[1450px] mx-auto pb-24 relative select-none animate-fade-in text-gray-900 dark:text-gray-100">
      
      {/* Header Banner - Premium Glassmorphic */}
      <header className="relative overflow-hidden bg-white/40 dark:bg-zinc-900/40 p-6 md:p-8 rounded-[2.5rem] backdrop-blur-2xl border border-white/50 dark:border-white/5 shadow-xl flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-500/5 dark:bg-indigo-500/10 rounded-full blur-[140px] pointer-events-none translate-x-[20%] -translate-y-[20%]" />
        
        <div className="space-y-2 relative z-10 w-full lg:w-auto">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-505 animate-pulse" />
            <span className="text-[10px] font-black uppercase text-indigo-550 dark:text-indigo-400 tracking-[0.2em]">Schedules & Leaves Sync</span>
          </div>
          <h2 className="text-4xl lg:text-5xl font-black text-gray-900 dark:text-white tracking-tight">Vacation Calendar</h2>
          <p className="text-sm font-medium text-gray-500 dark:text-zinc-400 max-w-xl">
            Aggregate co-travelers, lock team out-of-office slots, optimize weekend bridges, and synchronize flight dates on a single continuous timeline.
          </p>
        </div>
        
        {/* Navigation / Month-Selection Controls */}
        <div className="flex flex-wrap items-center gap-3 relative z-10 w-full lg:w-auto">
          <div className="flex items-center gap-1.5 bg-gray-100/80 dark:bg-zinc-950/45 p-1.5 rounded-2xl border border-zinc-200/50 dark:border-white/10 shadow-inner">
            <Button 
              variant="ghost" 
              size="sm" 
              className="p-1 rounded-xl h-8 w-8 text-gray-600 dark:text-gray-300" 
              onClick={handlePrevMonth}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-xs font-black min-w-[120px] text-center text-gray-800 dark:text-white uppercase tracking-wider">
              {monthName}
            </span>
            <Button 
              variant="ghost" 
              size="sm" 
              className="p-1 rounded-xl h-8 w-8 text-gray-600 dark:text-gray-300" 
              onClick={handleNextMonth}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          
          <Button 
            variant="secondary" 
            size="md" 
            className="rounded-2xl border-zinc-200 dark:border-zinc-800 text-xs font-black uppercase text-zinc-700 dark:text-zinc-200"
            onClick={handleJumpToToday}
          >
            Today
          </Button>
        </div>
      </header>

      {/* Grid of filtering rails */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Left Side: Filter and Configuration Sidebar */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* User Multi-select Filter Panel */}
          <div className="bg-white/60 dark:bg-zinc-900/60 rounded-[2.25rem] border border-zinc-100 dark:border-white/5 p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-500" />
                <span>Travelers</span>
              </h3>
              <button 
                onClick={toggleSelectAllUsers}
                className="text-[10px] font-black uppercase text-indigo-500 dark:text-indigo-400 hover:underline"
              >
                {users && selectedUsers.size === users.length ? 'Filter None' : 'Unify All'}
              </button>
            </div>
            
            <div className="space-y-2 max-h-[220px] overflow-y-auto custom-scrollbar pr-1">
              {users?.map(user => {
                const isSelected = selectedUsers.has(user.id);
                return (
                  <button
                    key={user.id}
                    onClick={() => toggleUserFilter(user.id)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-left transition-all ${
                      isSelected 
                        ? 'bg-indigo-50/50 dark:bg-indigo-950/15 border-indigo-200 dark:border-indigo-900/30' 
                        : 'border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-7 h-7 rounded-lg text-[10px] font-black text-white flex items-center justify-center shrink-0 shadow-sm ${
                        user.role === 'Partner' ? 'bg-[#fa9a1d]' : user.role === 'Admin' ? 'bg-sky-500' : 'bg-emerald-500'
                      }`}>
                        {user.name.charAt(0)}
                      </div>
                      <div className="truncate min-w-0">
                        <p className="text-xs font-black text-gray-900 dark:text-white truncate">{user.name}</p>
                        <p className="text-[10px] font-medium text-gray-400 dark:text-zinc-500 capitalize">{user.role}</p>
                      </div>
                    </div>
                    {isSelected && (
                      <div className="w-5 h-5 bg-indigo-500 dark:bg-indigo-600 rounded-full flex items-center justify-center text-white shrink-0">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Entitlement Categories filter */}
          <div className="bg-white/60 dark:bg-zinc-900/60 rounded-[2.25rem] border border-zinc-100 dark:border-white/5 p-6 space-y-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-500" />
              <span>Leave Types</span>
            </h3>

            <div className="space-y-1.5">
              <button
                onClick={() => setSelectedEntitlementFilter('all')}
                className={`w-full text-left px-3 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
                  selectedEntitlementFilter === 'all' 
                    ? 'bg-zinc-100 text-gray-950 dark:bg-zinc-800 dark:text-white font-extrabold' 
                    : 'text-gray-500 dark:text-gray-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
                }`}
              >
                <div className="w-2.5 h-2.5 rounded-full bg-indigo-505" />
                <span>All Calendar Items</span>
              </button>

              {entitlements?.map(ent => {
                const colMeta = ENTITLEMENT_COLORS[ent.color] || DEFAULT_COLOR;
                const isSelected = selectedEntitlementFilter === ent.id;
                return (
                  <button
                    key={ent.id}
                    onClick={() => setSelectedEntitlementFilter(ent.id)}
                    className={`w-full text-left px-3 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
                      isSelected 
                        ? 'bg-zinc-100 text-gray-950 dark:bg-zinc-800 dark:text-white font-extrabold' 
                        : 'text-gray-500 dark:text-gray-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
                    }`}
                  >
                    <div className={`w-2.5 h-2.5 rounded-full ${colMeta.dot}`} />
                    <span className="truncate">{ent.name}</span>
                  </button>
                );
              })}

              <button
                onClick={() => setSelectedEntitlementFilter('holiday')}
                className={`w-full text-left px-3 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
                  selectedEntitlementFilter === 'holiday' 
                    ? 'bg-zinc-100 text-gray-950 dark:bg-zinc-800 dark:text-white font-extrabold' 
                    : 'text-gray-500 dark:text-gray-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
                }`}
              >
                <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                <span>Public Holidays Only</span>
              </button>

              <button
                onClick={() => setSelectedEntitlementFilter('event')}
                className={`w-full text-left px-3 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
                  selectedEntitlementFilter === 'event' 
                    ? 'bg-zinc-100 text-gray-950 dark:bg-zinc-800 dark:text-white font-extrabold' 
                    : 'text-gray-500 dark:text-gray-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
                }`}
              >
                <div className="w-2.5 h-2.5 rounded-full bg-indigo-400" />
                <span>Custom Events Only</span>
              </button>
            </div>
          </div>

          {/* Quick Search Widget */}
          <div className="bg-white/60 dark:bg-zinc-900/60 rounded-[2.25rem] border border-zinc-100 dark:border-white/5 p-4">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search vacations, destinations..."
                className="w-full pl-9 pr-3 py-2 text-xs font-bold rounded-xl bg-gray-50/50 dark:bg-zinc-950/30 border border-zinc-200/50 dark:border-white/5 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

        </div>

        {/* Right Side: Primary Board Area */}
        <div className="lg:col-span-3 space-y-6">
          
          {/* Calendar Layout Navigation Header Tabs */}
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center bg-white/40 dark:bg-zinc-900/30 p-2 border border-zinc-100 dark:border-white/5 rounded-[2rem] gap-2">
            <div className="flex p-1 bg-gray-100/80 dark:bg-zinc-950/45 rounded-2xl gap-1 border border-zinc-200/20 dark:border-white/5">
              <button
                onClick={() => setActiveTab('timeline')}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-black uppercase rounded-xl tracking-wider transition-all duration-300 ${
                  activeTab === 'timeline' 
                    ? 'bg-white text-gray-950 shadow-md dark:bg-zinc-800 dark:text-white' 
                    : 'text-gray-500 dark:text-gray-450 hover:text-gray-800 dark:hover:text-gray-200'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Timeline Schedule</span>
              </button>
              
              <button
                onClick={() => setActiveTab('grid')}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-black uppercase rounded-xl tracking-wider transition-all duration-300 ${
                  activeTab === 'grid' 
                    ? 'bg-white text-gray-950 shadow-md dark:bg-zinc-800 dark:text-white' 
                    : 'text-gray-500 dark:text-gray-450 hover:text-gray-800 dark:hover:text-gray-200'
                }`}
              >
                <Grid className="w-3.5 h-3.5" />
                <span>Grid Calendar</span>
              </button>

              <button
                onClick={() => setActiveTab('agenda')}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-black uppercase rounded-xl tracking-wider transition-all duration-300 ${
                  activeTab === 'agenda' 
                    ? 'bg-white text-gray-950 shadow-md dark:bg-zinc-800 dark:text-white' 
                    : 'text-gray-500 dark:text-gray-450 hover:text-gray-800 dark:hover:text-gray-200'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span>Agenda stream</span>
              </button>

              <button
                onClick={() => setActiveTab('optimizer')}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-black uppercase rounded-xl tracking-wider transition-all duration-300 relative ${
                  activeTab === 'optimizer' 
                    ? 'bg-white text-gray-150 shadow-md dark:bg-zinc-800 dark:text-white' 
                    : 'text-gray-500 dark:text-gray-450 hover:text-gray-800 dark:hover:text-gray-200'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-[#fa9a1d]" />
                <span>Bridge Optimizer</span>
                <span className="absolute -top-1.5 -right-1 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
              </button>
            </div>
            
            <div className="px-3 text-right">
              <span className="text-[10px] font-black uppercase tracking-widest text-[#fa9a1d]">
                Active Filter / {filteredTrips.length} Trips Plotted
              </span>
            </div>
          </div>

          <AnimatePresence mode="wait">
            
            {/* View Render Option 1: Gantt-style Timeline Schedule Tape */}
            {activeTab === 'timeline' && (
              <motion.div
                key="timeline"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="bg-white/40 dark:bg-zinc-900/45 rounded-[2.25rem] border border-zinc-150/40 dark:border-white/5 shadow-lg overflow-hidden flex flex-col"
              >
                <div className="p-5 border-b border-zinc-100 dark:border-white/5 bg-white/30 dark:bg-[#fa9a1d]/5 flex items-center justify-between">
                  <h3 className="text-sm font-black uppercase tracking-wider text-gray-800 dark:text-white flex items-center gap-2">
                    <Clock className="w-4.5 h-4.5 text-indigo-550" />
                    <span>Active month Timeline tape</span>
                  </h3>
                  <div className="text-[10px] text-gray-400 font-extrabold flex items-center gap-3">
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-zinc-100 dark:bg-zinc-800 border dark:border-transparent inline-block" /> Workday</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-[#fa9a1d]/10 inline-block" /> Weekend</span>
                  </div>
                </div>

                {/* Horizontal Gantt Core Structure */}
                <div className="overflow-x-auto no-scrollbar custom-scrollbar">
                  <div className="min-w-[850px] divide-y divide-zinc-100 dark:divide-white/5">
                    
                    {/* Month Days Header row */}
                    <div className="flex bg-zinc-50/50 dark:bg-zinc-950/20 py-2 pt-3 shrink-0">
                      <div className="w-36 px-4 shrink-0 font-black text-[10px] uppercase text-gray-400 tracking-wider flex items-center">
                        Active Travelers
                      </div>
                      <div className="flex-1 flex gap-px px-1">
                        {Array.from({ length: daysInMonth }).map((_, idx) => {
                          const fileIndex = idx + 1;
                          const isWeekend = isWeekendColumn(fileIndex);
                          const isToday = fileIndex === 7 && activeMonth === 5 && activeYear === 2026; // June 7, 2026
                          
                          return (
                            <div 
                              key={idx} 
                              className={`flex-1 min-w-[20px] text-center p-1 rounded-lg ${
                                isToday ? 'bg-indigo-500/10 border border-indigo-505/30' : ''
                              }`}
                            >
                              <span className={`block text-[9px] font-black uppercase tracking-wide leading-none ${
                                isWeekend ? 'text-[#fa9a1d]' : 'text-gray-400'
                              }`}>
                                {getDayLabelShort(fileIndex)}
                              </span>
                              <span className={`block text-[11px] font-extrabold mt-1 leading-none ${
                                isToday 
                                  ? 'text-indigo-600 dark:text-indigo-400 rounded-full bg-indigo-500/20 px-1 py-0.5 inline-block text-[10px] font-black' 
                                  : isWeekend ? 'text-[#fa9a1d]' : 'text-gray-700 dark:text-gray-300'
                              }`}>
                                {fileIndex}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Timeline row per active user */}
                    {users?.filter(u => selectedUsers.has(u.id)).map(user => {
                      return (
                        <div key={user.id} className="flex py-3.5 items-center bg-white/30 dark:bg-transparent hover:bg-zinc-100/[0.02]">
                          <div className="w-36 px-4 shrink-0 flex items-center gap-2.5 min-w-0">
                            <div className={`w-8 h-8 rounded-full text-[11px] font-black text-white flex items-center justify-center shrink-0 shadow-sm ${
                              user.role === 'Partner' ? 'bg-[#fa9a1d]' : user.role === 'Admin' ? 'bg-sky-505' : 'bg-emerald-505'
                            }`}>
                              {user.name.charAt(0)}
                            </div>
                            <div className="truncate min-w-0">
                              <p className="text-xs font-black text-gray-900 dark:text-white truncate" title={user.name}>
                                {user.name}
                              </p>
                              <span className="inline-block text-[8px] font-black uppercase text-gray-400 bg-gray-50 dark:bg-zinc-800 pr-1 py-0.2 select-none">
                                {user.role}
                              </span>
                            </div>
                          </div>

                          {/* Gantt cells sequence mapping */}
                          <div className="flex-1 flex gap-px px-1 items-stretch min-h-[38px]">
                            {Array.from({ length: daysInMonth }).map((_, idx) => {
                              const dayNum = idx + 1;
                              const isWeekend = isWeekendColumn(dayNum);
                              const daySchedules = cellSchedulesByDay[dayNum] || [];
                              
                              // Check if there's an active vacation/leave segment of this user
                              const activeSchedule = daySchedules.find(s => {
                                if (s.type === 'trip') {
                                  const tripMeta = s.meta as Trip;
                                  return tripMeta.participants?.includes(user.id);
                                }
                                return false; // holidays / global events are in cells but not personal Gantt segments
                              });

                              // Identify matching holiday/event overlaying the same day
                              const globalOverlay = daySchedules.find(s => s.type === 'holiday' || s.type === 'event');

                              const cellKey = `gantt-${user.id}-${dayNum}`;

                              if (activeSchedule) {
                                const trip = activeSchedule.meta as Trip;
                                const isStart = parseDateResilient(trip.startDate).getDate() === dayNum && parseDateResilient(trip.startDate).getMonth() === activeMonth;
                                const style = activeSchedule.colorClass;
                                
                                return (
                                  <div
                                    key={cellKey}
                                    onClick={(e) => handleCellItemClick(e, activeSchedule)}
                                    className={`flex-1 min-w-[20px] relative rounded-md transition-all cursor-pointer flex items-center justify-center border ${
                                      style.bg
                                    } ${style.border} ${style.hover}`}
                                    title={`${trip.name}: ${trip.startDate} to ${trip.endDate}`}
                                  >
                                    {isStart && (
                                      <span className="absolute left-1 flex items-center gap-1.5 pointer-events-none z-10 text-[9px] font-black truncate max-w-[130px] select-none text-gray-850 dark:text-white leading-none">
                                        <span className="filter drop-shadow-xs leading-none shrink-0">{trip.icon || '✈️'}</span>
                                        <span className="hidden md:inline leading-none truncate whitespace-nowrap">{trip.name}</span>
                                      </span>
                                    )}
                                  </div>
                                );
                              }

                              return (
                                <div
                                  key={cellKey}
                                  className={`flex-1 min-w-[20px] rounded-md transition-all text-center flex flex-col items-center justify-center relative p-0.5 border border-transparent ${
                                    isWeekend 
                                      ? 'bg-amber-100/10 dark:bg-amber-955/5 hover:bg-amber-200/20' 
                                      : 'bg-zinc-150/10 dark:bg-zinc-950/20 hover:bg-zinc-150/30 dark:hover:bg-zinc-800/20'
                                  }`}
                                >
                                  {globalOverlay && (
                                    <div 
                                      onClick={(e) => handleCellItemClick(e, globalOverlay)}
                                      className={`w-2.5 h-2.5 rounded-full ${globalOverlay.colorClass.dot} cursor-pointer hover:scale-125 transition-transform shrink-0`} 
                                      title={globalOverlay.title}
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}

                  </div>
                </div>

                <div className="p-4 bg-zinc-50/50 dark:bg-zinc-950/20 border-t border-zinc-100 dark:border-white/5 text-xs font-bold text-gray-400 tracking-wide">
                  💡 Drag horizontally or hover cells to track overlapping vacation slots. Click populated segments for detail parameters.
                </div>
              </motion.div>
            )}

            {/* View Render Option 2: Classic Grid Calendars */}
            {activeTab === 'grid' && (
              <motion.div
                key="grid"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-4"
              >
                
                {/* 7-column Calendar structure card */}
                <div className="bg-white/40 dark:bg-zinc-900/40 rounded-[2.5rem] p-6 border border-zinc-100 dark:border-white/5 shadow-xl">
                  
                  {/* Days of week titles header */}
                  <div className="grid grid-cols-7 gap-3 mb-4 text-center">
                    {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, idx) => (
                      <div key={idx} className="text-xs font-black uppercase text-gray-400 tracking-widest py-1">
                        {day}
                      </div>
                    ))}
                  </div>

                  {/* Grid cells containing events */}
                  <div className="grid grid-cols-7 gap-3 auto-rows-[110px]">
                    
                    {/* Padding cells */}
                    {Array.from({ length: monthFirstDayIndex }).map((_, idx) => (
                      <div key={`pad-${idx}`} className="bg-zinc-50/20 dark:bg-zinc-950/5 rounded-2xl border border-dotted border-zinc-100 dark:border-zinc-900 opacity-40 shrink-0" />
                    ))}

                    {/* Plotted month days sequence */}
                    {Array.from({ length: daysInMonth }).map((_, idx) => {
                      const dayVal = idx + 1;
                      const isToday = dayVal === 7 && activeMonth === 5 && activeYear === 2026; // June 7, 2026
                      const daySchedules = cellSchedulesByDay[dayVal] || [];
                      const isWeekend = isWeekendColumn(dayVal);

                      return (
                        <div
                          key={`day-${dayVal}`}
                          className={`rounded-[1.5rem] border p-3 flex flex-col justify-between transition-all relative ${
                            isToday
                              ? 'bg-indigo-50/50 dark:bg-indigo-950/10 border-indigo-500/40 ring-4 ring-indigo-500/10 shadow-lg'
                              : isWeekend
                              ? 'bg-[#fa9a1d]/5 dark:bg-[#fa9a1d]/10 border-[#fa9a1d]/20 hover:border-[#fa9a1d]/40'
                              : 'bg-white/30 dark:bg-zinc-950/25 border-zinc-150/30 dark:border-white/5 hover:border-zinc-300 dark:hover:border-zinc-800'
                          }`}
                        >
                          {/* Date label header inside cell */}
                          <div className="flex justify-between items-center mb-1 select-none">
                            <span className={`text-xs font-black flex items-center justify-center w-6 h-6 rounded-full ${
                              isToday 
                                ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/30' 
                                : isWeekend ? 'text-[#fa9a1d]' : 'text-gray-700 dark:text-gray-300'
                            }`}>
                              {dayVal}
                            </span>
                            {isToday && (
                              <span className="text-[8px] font-black uppercase text-indigo-500 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30 px-1.5 py-0.5 rounded border border-indigo-300/20">
                                Today
                              </span>
                            )}
                          </div>

                          {/* Render aggregated schedules stack inside cell */}
                          <div className="space-y-1 overflow-y-auto no-scrollbar flex-1 max-h-[70px] pr-0.5 select-none scrollbar-none">
                            {daySchedules.map((item, idX) => (
                              <button
                                key={`${item.type}-${item.id}`}
                                onClick={(e) => handleCellItemClick(e, item)}
                                className={`w-full text-left truncate p-1 px-2 rounded-lg text-[9px] font-black border tracking-wide transition-all ${
                                  item.colorClass.bg
                                } ${item.colorClass.border} ${item.colorClass.text} ${item.colorClass.hover}`}
                                title={item.title}
                              >
                                <span className="flex items-center gap-1">
                                  {item.type === 'trip' && <span className="text-[10px] filter leading-none shrink-0">{item.meta.icon || '✈️'}</span>}
                                  {item.type === 'holiday' && <span className="text-[10px] leading-none shrink-0">🇲🇨</span>}
                                  {item.type === 'event' && <span className="text-[10px] leading-none shrink-0">🏛️</span>}
                                  <span className="truncate leading-none">{item.title}</span>
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}

                  </div>

                </div>

              </motion.div>
            )}

            {/* View Render Option 3: Clean Agenda Feed stream */}
            {activeTab === 'agenda' && (
              <motion.div
                key="agenda"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-4"
              >
                {sortedAgendaEvents.length === 0 ? (
                  <div className="bg-white/40 dark:bg-zinc-900/40 rounded-[2.5rem] p-12 text-center border">
                    <CalendarIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm font-black text-gray-500 uppercase tracking-widest">No plans found matching filters</p>
                    <p className="text-xs text-gray-400 mt-1">Adjust entitlement parameters or user selects above.</p>
                  </div>
                ) : (
                  <div className="relative border-l border-zinc-200/50 dark:border-zinc-800 ml-4.5 pl-6.5 space-y-6">
                    {sortedAgendaEvents.map(event => {
                      const isTripType = event.type === 'trip';
                      const isHolidayType = event.type === 'holiday';
                      const isCustomEventType = event.type === 'event';
                      const style = event.colorClass;
                      const hasEnded = event.endDateObj < new Date(2026, 5, 7); // June 7, 2026

                      return (
                        <motion.div 
                          key={`${event.type}-${event.id}`}
                          className={`relative bg-white/50 dark:bg-zinc-900/50 p-5 rounded-[1.8rem] border shadow-xs hover:shadow-lg transition-all border-zinc-150/20 dark:border-white/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 ${
                            hasEnded ? 'opacity-65' : ''
                          }`}
                          whileHover={{ scale: 1.01 }}
                        >
                          {/* Left dot representation on line */}
                          <div className={`absolute -left-[35px] w-5 h-5 rounded-full border-4 border-zinc-50 dark:border-zinc-950 flex items-center justify-center shadow-xs ${style.dot}`} />

                          {/* Item Left Info */}
                          <div className="space-y-1.5 flex-1 min-w-0">
                            <div className="flex items-center gap-2.5 flex-wrap">
                              <span className="text-[10px] font-black uppercase text-gray-400 block tracking-widest">
                                {event.dateText}
                              </span>
                              <Badge color={isTripType ? (event.meta.entitlementId ? 'blue' : 'gray') : isHolidayType ? 'amber' : 'indigo'}>
                                {isTripType 
                                  ? getEntitlementName(event.meta.entitlementId) 
                                  : isHolidayType ? `Public Holiday (${event.meta.countryCode})` : 'Custom Org Event'}
                              </Badge>
                              {event.countdownDays === 0 && !hasEnded && (
                                <span className="inline-block text-[9px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/10 px-2 rounded-md py-0.5 animate-pulse">
                                  Ongoing
                                </span>
                              )}
                            </div>
                            
                            <h4 className="text-lg font-black text-gray-950 dark:text-white flex items-center gap-2">
                              {isTripType && <span className="text-xl filter drop-shadow inline-block">{event.meta.icon || '✈️'}</span>}
                              <span className="truncate">{event.title}</span>
                            </h4>

                            {isTripType && (
                              <div className="text-[11px] font-bold text-gray-500 dark:text-zinc-400 mt-1 flex items-center gap-1.5 flex-wrap">
                                <span className="flex items-center gap-0.5"><MapPin className="w-3.5 h-3.5 text-indigo-500" /> {event.meta.location}</span>
                                <span className="w-1 h-1 rounded-full bg-zinc-350 dark:bg-zinc-800" />
                                <span>{event.daysCount} Days</span>
                              </div>
                            )}
                          </div>

                          {/* Right Stats and counts */}
                          <div className="flex items-center gap-4 shrink-0 w-full md:w-auto justify-between md:justify-end border-t md:border-t-0 border-zinc-100 dark:border-white/5 pt-3 md:pt-0">
                            
                            {/* Faces overlay */}
                            {isTripType && event.meta.participants && (
                              <div className="flex -space-x-2">
                                {event.meta.participants.map((pid: string) => {
                                  const pObj = users?.find(u => u.id === pid);
                                  if (!pObj) return null;
                                  return (
                                    <div 
                                      key={pid}
                                      className="w-7 h-7 rounded-full bg-indigo-505 border-2 border-white dark:border-zinc-900 text-[10px] font-black text-white flex items-center justify-center capitalize cursor-help shrink-0 shadow-sm"
                                      title={pObj.name}
                                    >
                                      {pObj.name.charAt(0)}
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* Detail Drill Button */}
                            <div className="text-right">
                              {event.countdownDays > 0 ? (
                                <p className="text-xs font-black text-gray-500 dark:text-zinc-400">
                                  In <span className="text-sm font-extrabold text-indigo-505">{event.countdownDays}</span> Days
                                </p>
                              ) : hasEnded ? (
                                <p className="text-xs font-bold text-gray-400 dark:text-zinc-650 italic">Completed</p>
                              ) : (
                                <p className="text-xs font-black text-emerald-500">Happening now</p>
                              )}
                              
                              <button
                                onClick={(e) => handleCellItemClick(e, event)}
                                className="text-[10px] font-black uppercase text-indigo-500 dark:text-indigo-400 hover:underline flex items-center gap-1 mt-1 shrink-0 ml-auto"
                              >
                                <span>Inspect Details</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            </div>

                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}

            {/* View Render Option 4: Smart Leave Bridge Optimizer */}
            {activeTab === 'optimizer' && (
              <motion.div
                key="optimizer"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-6"
              >
                {/* Intro Insight header info */}
                <div className="p-6 bg-gradient-to-r from-amber-500/10 via-[#fa9a1d]/10 to-indigo-500/10 rounded-[2.25rem] border border-amber-500/20 dark:border-amber-500/10 flex flex-col md:flex-row items-center gap-5 justify-between">
                  <div className="space-y-1 max-w-xl text-center md:text-left">
                    <h3 className="text-lg font-black text-gray-900 dark:text-white flex items-center justify-center md:justify-start gap-2">
                      <Sparkles className="w-5 h-5 text-amber-505" />
                      <span>Smart Bridge Leaving Optimizer</span>
                    </h3>
                    <p className="text-xs font-medium text-gray-500 dark:text-zinc-400">
                      We scanned the regional calendars for upcoming official public holidays that land near weekends. Merging these allows you to book ultra-long vacay spells by claiming minimal annual balance days!
                    </p>
                  </div>
                  <div className="bg-white/80 dark:bg-zinc-805 px-4 py-2.5 rounded-2xl shadow-sm text-center shrink-0 border border-zinc-200/50">
                    <span className="text-[10px] font-black uppercase block tracking-wider text-gray-400">Average Bridge Savings</span>
                    <span className="text-2xl font-black text-emerald-500 block leading-none mt-1">+4 Days Off</span>
                  </div>
                </div>

                {/* Recommendations Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {bridgeOptimizationGuides.length === 0 ? (
                    <div className="col-span-2 bg-white/40 dark:bg-zinc-900/40 p-8 rounded-2xl text-center border text-xs font-bold text-gray-400">
                      No bridge suggestions in the immediate period ahead. We check up to 6 months in advance.
                    </div>
                  ) : (
                    bridgeOptimizationGuides.map(guide => {
                      const isBridge = guide.type === 'bridge';
                      const isSandwich = guide.type === 'sandwich';
                      
                      return (
                        <div 
                          key={guide.id}
                          className={`p-5 rounded-3xl border flex flex-col justify-between gap-4 transition-all relative ${
                            isBridge 
                              ? 'bg-amber-400/[0.04] dark:bg-amber-400/[0.02] border-amber-302/50 dark:border-amber-900/20' 
                              : isSandwich
                              ? 'bg-purple-400/[0.04] dark:bg-purple-400/[0.02] border-purple-302/50 dark:border-purple-900/20'
                              : 'bg-zinc-50/50 dark:bg-zinc-950/20 border-zinc-200/50 dark:border-zinc-800'
                          }`}
                        >
                          <div className="space-y-1.5">
                            <div className="flex justify-between items-start gap-2">
                              <Badge color={isBridge ? 'amber' : isSandwich ? 'purple' : 'gray'}>
                                {isBridge ? 'Bridge Day Opportunity' : isSandwich ? 'Work Sandwich Span' : 'Long Weekend Info'}
                              </Badge>
                              
                              {guide.suggestedLeaveDays > 0 && (
                                <span className="text-[10px] font-black px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/10 rounded-lg shrink-0">
                                  Claims {guide.suggestedLeaveDays} Day Leave
                                </span>
                              )}
                            </div>

                            <h4 className="text-base font-black text-gray-950 dark:text-white leading-tight mt-1">
                              {guide.holidayName}
                            </h4>
                            
                            <p className="text-[10px] font-extrabold text-gray-400 flex items-center gap-1">
                              <span>Lands on {guide.dayOfWeek}, {parseDateResilient(guide.holidayDate).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}</span>
                            </p>

                            <p className="text-xs font-medium text-gray-500 dark:text-zinc-400 mt-2">
                              {guide.reason}
                            </p>
                          </div>

                          {/* Footer stats row of optimal block */}
                          <div className="flex justify-between items-center bg-white/70 dark:bg-zinc-950/45 p-3 rounded-2xl border border-zinc-150/40 dark:border-white/5 mt-2">
                            <div>
                              <span className="text-[8px] font-black uppercase text-gray-400 block tracking-wider">Span duration</span>
                              <span className="text-xs font-black text-gray-900 dark:text-white block mt-0.5">{guide.spanText}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-[8px] font-black uppercase text-gray-400 block tracking-wider">Rested time</span>
                              <span className="text-sm font-black text-indigo-505 block mt-0.5">{guide.totalDaysRested} Days Consecutive</span>
                            </div>
                          </div>

                        </div>
                      );
                    })
                  )}
                </div>

              </motion.div>
            )}

          </AnimatePresence>

          {/* Quick Stats overview panel */}
          <div className="bg-white/40 dark:bg-zinc-900/30 rounded-[2.5rem] border border-zinc-100 dark:border-white/5 p-6 space-y-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-indigo-550 dark:text-indigo-400 flex items-center gap-1.5">
              <Users className="w-4 h-4" />
              <span>Leave Summary Allocation ({activeYear})</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeUserStats.map(stat => (
                <div key={stat.user.id} className="p-4 bg-white/50 dark:bg-zinc-950/45 border rounded-2xl flex flex-col justify-between gap-3 shadow-xs">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <div className="w-6.5 h-6.5 rounded-lg bg-emerald-500 text-white font-black text-[9px] flex items-center justify-center">
                        {stat.user.name.charAt(0)}
                      </div>
                      <span className="text-sm font-extrabold text-gray-900 dark:text-white truncate">{stat.user.name}</span>
                    </div>
                    <span className="text-xs font-bold text-gray-400">{stat.balanceText}</span>
                  </div>

                  <div className="space-y-1 pt-1">
                    <div className="flex justify-between text-[10px] font-black uppercase text-zinc-400">
                      <span>Roster Quota Used</span>
                      <span>{stat.quotaProgress}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div 
                        className="bg-indigo-500 h-full rounded-full transition-all duration-1000"
                        style={{ width: `${stat.quotaProgress}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] font-bold text-gray-400 pt-0.5">
                      <span>Taken: {stat.takenDays} d</span>
                      <span>Planned: {stat.plannedDays} d</span>
                      <span className="text-indigo-550 dark:text-indigo-400">Remaining: {stat.remainingDays} d</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>

      {/* Dynamic Item Details Modal Drawer */}
      <Modal
        isOpen={selectedItemDetails !== null}
        onClose={() => setSelectedItemDetails(null)}
        title={selectedItemDetails?.type === 'trip' ? 'Trip Assignment Parameters' : 'Calendar Event Specifications'}
      >
        {selectedItemDetails && (
          <div className="space-y-5 text-gray-800 dark:text-zinc-200 animate-fade-in select-text">
            
            <div className="space-y-1.5">
              <Badge color={selectedItemDetails.type === 'trip' ? 'blue' : selectedItemDetails.type === 'holiday' ? 'amber' : 'indigo'}>
                {selectedItemDetails.type}
              </Badge>
              <h3 className="text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2 mt-1">
                {selectedItemDetails.type === 'trip' && <span className="text-2xl filter drop-shadow inline-block">{selectedItemDetails.meta?.icon || '✈️'}</span>}
                <span>{selectedItemDetails.title}</span>
              </h3>
              
              {selectedItemDetails.startDate && (
                <p className="text-xs font-black text-indigo-505 flex items-center gap-1 pt-1 uppercase tracking-wide">
                  <CalendarIcon className="w-3.5 h-3.5 leading-none shrink-0" />
                  <span>
                    {selectedItemDetails.startDate === selectedItemDetails.endDate 
                      ? selectedItemDetails.startDate 
                      : `${selectedItemDetails.startDate} to ${selectedItemDetails.endDate}`}
                  </span>
                </p>
              )}
            </div>

            <p className="text-sm font-medium leading-relaxed text-gray-600 dark:text-zinc-400 border-l-2 border-zinc-200 dark:border-zinc-800 pl-3 italic">
              {selectedItemDetails.description || 'No description assigned.'}
            </p>

            {/* Render Trip Specifics fields */}
            {selectedItemDetails.type === 'trip' && selectedItemDetails.meta && (
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-3.5">
                  <div className="p-3 bg-gray-55/75 dark:bg-zinc-855 rounded-xl border border-zinc-200/50">
                    <span className="text-[9px] font-black uppercase text-gray-400 block tracking-wider">Destination Spot</span>
                    <span className="text-xs font-black text-gray-800 dark:text-white block mt-0.5">{selectedItemDetails.meta.location}</span>
                  </div>
                  <div className="p-3 bg-gray-55/75 dark:bg-zinc-855 rounded-xl border border-zinc-200/50">
                    <span className="text-[9px] font-black uppercase text-gray-400 block tracking-wider">Event Span</span>
                    <span className="text-xs font-black text-[#fa9a1d] block mt-0.5">{selectedItemDetails.meta.duration} Days</span>
                  </div>
                  <div className="p-3 bg-gray-55/75 dark:bg-zinc-855 rounded-xl border border-zinc-200/50 col-span-2">
                    <span className="text-[9px] font-black uppercase text-gray-400 block tracking-wider">Co-Travelers participating</span>
                    <span className="text-xs font-black text-gray-800 dark:text-zinc-200 block mt-0.5">{selectedItemDetails.meta.participantsNames || 'Only myself'}</span>
                  </div>
                </div>

                <div className="flex gap-2 justify-end pt-3 border-t border-zinc-150/40 dark:border-zinc-810">
                  <Button 
                    variant="secondary" 
                    size="md" 
                    className="rounded-xl text-xs font-black uppercase"
                    onClick={() => setSelectedItemDetails(null)}
                  >
                    Dismiss
                  </Button>
                  
                  {onTripClick && (
                    <Button 
                      variant="primary" 
                      size="md" 
                      className="rounded-xl text-xs font-black uppercase bg-gradient-to-r from-blue-600 to-indigo-600 border-none shadow-md"
                      onClick={() => {
                        onTripClick(selectedItemDetails.meta.id);
                        setSelectedItemDetails(null);
                      }}
                    >
                      Inspect Trip Logistics
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Clear Holiday Details fields */}
            {selectedItemDetails.type === 'holiday' && (
              <div className="space-y-4 pt-1">
                <div className="p-3.5 bg-amber-400/[0.04] rounded-2xl border border-amber-300/30 text-xs font-medium text-amber-800 dark:text-amber-400 leading-relaxed flex gap-2.5 items-start">
                  <Info className="w-5 h-5 shrink-0" />
                  <span>Public holidays do not count as a personal out-of-office balance claim, they are automatically configured on calculation.</span>
                </div>
                <div className="flex gap-2 justify-end pt-3">
                  <Button 
                    variant="secondary" 
                    size="md" 
                    className="rounded-xl text-xs font-black uppercase w-full"
                    onClick={() => setSelectedItemDetails(null)}
                  >
                    Got It
                  </Button>
                </div>
              </div>
            )}

            {/* Clear Event Details fields */}
            {selectedItemDetails.type === 'event' && (
              <div className="space-y-4 pt-1">
                <div className="p-3.5 bg-indigo-400/[0.04] rounded-2xl border border-indigo-300/30 text-xs font-medium text-indigo-800 dark:text-indigo-400 leading-relaxed flex gap-2.5 items-start">
                  <Info className="w-5 h-5 shrink-0" />
                  <span>This non-working event has been mapped within the team schedule to align offsite projects.</span>
                </div>
                <div className="flex gap-2 justify-end pt-3">
                  <Button 
                    variant="secondary" 
                    size="md" 
                    className="rounded-xl text-xs font-black uppercase w-full"
                    onClick={() => setSelectedItemDetails(null)}
                  >
                    Got It
                  </Button>
                </div>
              </div>
            )}

          </div>
        )}
      </Modal>

    </div>
  );
};
