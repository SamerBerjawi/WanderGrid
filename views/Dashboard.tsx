
import React, { useEffect, useState, useRef } from 'react';
import { Card, Button } from '../components/ui';
import { LeaveRequestModal } from '../components/LeaveRequestModal';
import { TripModal } from '../components/TripModal';
import { dataService } from '../services/mockDb';
import { User, Trip, PublicHoliday, CustomEvent, EntitlementType, WorkspaceSettings, TripAllocation, SavedConfig } from '../types';

type CalendarViewType = 'week' | 'month' | 'year';

interface DashboardProps {
    onUserClick?: (userId: string) => void;
    onTripClick?: (tripId: string) => void;
}

const getCategoryClasses = (color?: string, isFullDay = true) => {
    const map: any = {
        blue: isFullDay 
            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-100 border-l-4 border-blue-500' 
            : 'bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800',
        green: isFullDay 
            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-100 border-l-4 border-emerald-500' 
            : 'bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800',
        amber: isFullDay 
            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-100 border-l-4 border-amber-500' 
            : 'bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800',
        purple: isFullDay 
            ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-100 border-l-4 border-purple-500' 
            : 'bg-purple-100 text-purple-700 border border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-800',
        red: isFullDay 
            ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-100 border-l-4 border-rose-500' 
            : 'bg-rose-100 text-rose-700 border border-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-800',
        indigo: isFullDay 
            ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-100 border-l-4 border-indigo-500' 
            : 'bg-indigo-100 text-indigo-700 border border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-300 dark:border-indigo-800',
        gray: isFullDay 
            ? 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-100 border-l-4 border-gray-500' 
            : 'bg-gray-100 text-gray-700 border border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600',
        pink: isFullDay 
            ? 'bg-pink-100 text-pink-800 dark:bg-pink-900/60 dark:text-pink-100 border-l-4 border-pink-500' 
            : 'bg-pink-100 text-pink-700 border border-pink-200 dark:bg-pink-900/40 dark:text-pink-300 dark:border-pink-800',
        teal: isFullDay 
            ? 'bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-100 border-l-4 border-teal-500' 
            : 'bg-teal-100 text-teal-700 border border-teal-200 dark:bg-teal-900/40 dark:text-teal-300 dark:border-teal-800',
        cyan: isFullDay 
            ? 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/60 dark:text-cyan-100 border-l-4 border-cyan-500' 
            : 'bg-cyan-100 text-cyan-700 border border-cyan-200 dark:bg-cyan-900/40 dark:text-cyan-300 dark:border-cyan-800',
    };
    
    // Fallback for General Events
    const defaultStyle = isFullDay
        ? 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-100 border-l-4 border-slate-500'
        : 'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';

    return map[color || ''] || defaultStyle;
};

const getProgressBarColor = (color: string) => {
    const map: Record<string, string> = {
        blue: 'bg-blue-500', green: 'bg-emerald-500', amber: 'bg-amber-500',
        purple: 'bg-purple-500', red: 'bg-rose-500', indigo: 'bg-indigo-500',
        gray: 'bg-gray-500', pink: 'bg-pink-500', teal: 'bg-teal-500', cyan: 'bg-cyan-500'
    };
    return map[color] || 'bg-blue-500';
};

export const Dashboard: React.FC<DashboardProps> = ({ onUserClick, onTripClick }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
  const [customEvents, setCustomEvents] = useState<CustomEvent[]>([]);
  const [entitlements, setEntitlements] = useState<EntitlementType[]>([]);
  const [workspaceConfig, setWorkspaceConfig] = useState<WorkspaceSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const [viewDate, setViewDate] = useState(new Date());
  const [calendarView, setCalendarView] = useState<CalendarViewType>('month');

  // Drag Selection State
  const [isDragging, setIsDragging] = useState(false);
  const [selectionStart, setSelectionStart] = useState<Date | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<Date | null>(null);

  const activeYear = viewDate.getFullYear();
  // Generate a dynamic range of years centered on current view
  const yearRange = Array.from({ length: 11 }, (_, i) => activeYear - 5 + i);

  // Modal State
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [isTripModalOpen, setIsTripModalOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState<Trip | undefined>(undefined);

  useEffect(() => {
    refreshData();
  }, []);

  // Global mouse up to finish dragging if cursor leaves cells
  useEffect(() => {
    const handleGlobalMouseUp = () => {
        if (isDragging && selectionStart && selectionEnd) {
            handleSelectionComplete();
        }
        setIsDragging(false);
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [isDragging, selectionStart, selectionEnd]);

  const refreshData = () => {
    Promise.all([
      dataService.getUsers(), dataService.getTrips(), dataService.getSavedConfigs(),
      dataService.getCustomEvents(), dataService.getEntitlementTypes(), dataService.getWorkspaceSettings()
    ]).then(([u, t, configs, e, ents, config]) => {
      setUsers(u);
      setTrips(t);
      const allHolidays = configs.flatMap(c => c.holidays.map(h => ({ ...h, configId: c.id })));
      setHolidays(allHolidays);
      setCustomEvents(e);
      setEntitlements(ents);
      setWorkspaceConfig(config);
      setLoading(false);
    });
  };

  const getNextMonday = (dateStr: string) => {
    const d = new Date(dateStr);
    const day = d.getDay(); 
    const diff = day === 0 ? 1 : (day === 6 ? 2 : 0);
    if (diff === 0) return dateStr;
    const next = new Date(d);
    next.setDate(d.getDate() + diff);
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
  };

  const getUserEffectiveHolidays = (userId: string) => {
    const user = users.find(u => u.id === userId);
    if (!user) return { holidayMap: new Map<string, string[]>(), shiftedMap: new Map<string, string[]>() };
    const holidayMap = new Map<string, string[]>(); 
    const shiftedMap = new Map<string, string[]>(); 
    holidays.forEach(h => {
      if (h.isIncluded && user.holidayConfigIds?.includes(h.configId || '')) {
        const dateKey = h.date;
        const current = holidayMap.get(dateKey) || [];
        if (!current.includes(h.name)) holidayMap.set(dateKey, [...current, h.name]);
        if (user.holidayWeekendRule === 'monday') {
          const d = new Date(dateKey);
          if (d.getDay() === 0 || d.getDay() === 6) {
            const mondayKey = getNextMonday(dateKey);
            const currentShifted = shiftedMap.get(mondayKey) || [];
            if (!currentShifted.includes(h.name)) shiftedMap.set(mondayKey, [...currentShifted, `${h.name} (Observed)`]);
          }
        }
      }
    });
    return { holidayMap, shiftedMap };
  };

  const calculateUsedDays = (userId: string, entId: string, year: number) => {
      const user = users.find(u => u.id === userId);
      if (!user) return 0;

      // Filter relevant trips
      const relevantTrips = trips.filter(t => 
          t.participants.includes(userId) && 
          t.status !== 'Cancelled' && 
          (t.entitlementId === entId || t.allocations?.some(a => a.entitlementId === entId))
      );

      // Build holiday set for accuracy
      const holidaySet = new Set<string>();
      holidays.forEach(h => {
          if (h.isIncluded && user.holidayConfigIds?.includes(h.configId || '')) {
              holidaySet.add(h.date);
              if (user.holidayWeekendRule === 'monday') {
                  const d = new Date(h.date);
                  if (d.getDay() === 0 || d.getDay() === 6) {
                      holidaySet.add(getNextMonday(h.date));
                  }
              }
          }
      });

      let totalUsed = 0;

      relevantTrips.forEach(trip => {
          // If explicit allocation exists, use it directly if year matches
          const alloc = trip.allocations?.find(a => a.entitlementId === entId);
          if (alloc) {
              if (alloc.targetYear === year) {
                  totalUsed += alloc.days;
                  return;
              }
              // If no target year in allocation, assume proportional or check date overlap
              if (!alloc.targetYear) {
                  // Simplified: Check if trip falls in year. If mostly in year, count it.
                  const startYear = new Date(trip.startDate).getFullYear();
                  if (startYear === year) {
                      totalUsed += alloc.days; 
                      return;
                  }
              }
          } else if (trip.entitlementId === entId) {
              // Iterate days to check validity
              const start = new Date(trip.startDate);
              const end = new Date(trip.endDate);
              const cur = new Date(start);
              
              while (cur <= end) {
                  if (cur.getFullYear() === year) {
                      const dStr = cur.toISOString().split('T')[0];
                      const day = cur.getDay();
                      const isWork = workspaceConfig?.workingDays.includes(day);
                      const isHol = holidaySet.has(dStr);
                      const isEx = trip.excludedDates?.includes(dStr);
                      
                      if (isWork && !isHol && !isEx) {
                          let w = 1;
                          if (trip.durationMode?.includes('am') || trip.durationMode?.includes('pm')) w = 0.5;
                          totalUsed += w;
                      }
                  }
                  cur.setDate(cur.getDate() + 1);
              }
          }
      });

      return totalUsed;
  };

  const isDateInRange = (checkDate: Date, startStr: string, endStr: string) => {
    const start = new Date(startStr); const end = new Date(endStr);
    const check = new Date(checkDate.getFullYear(), checkDate.getMonth(), checkDate.getDate());
    const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    return check >= s && check <= e;
  };

  const getDayPortion = (date: Date, trip: Trip): 'Full' | 'AM' | 'PM' => {
      if (!trip.durationMode || trip.durationMode === 'all_full') return 'Full';
      
      const dateStr = date.toISOString().split('T')[0];
      const isStart = dateStr === trip.startDate;
      const isEnd = dateStr === trip.endDate;

      if (trip.durationMode === 'all_am') return 'AM';
      if (trip.durationMode === 'all_pm') return 'PM';
      if (trip.durationMode === 'single_am') return 'AM';
      if (trip.durationMode === 'single_pm') return 'PM';

      if (trip.durationMode === 'custom') {
          if (isStart && trip.startPortion === 'pm') return 'PM';
          if (isEnd && trip.endPortion === 'am') return 'AM';
      }
      
      return 'Full';
  };

  // --- Modal Handlers ---

  const handleOpenRequest = () => {
    setEditingTrip(undefined);
    setIsRequestModalOpen(true);
  };

  const handleEditRequest = (trip: Trip) => {
    if (onTripClick) {
        onTripClick(trip.id);
    } else {
        setEditingTrip(trip);
        setIsRequestModalOpen(true);
    }
  };

  const handleSubmitRequest = async (tripData: Trip) => {
    if (tripData.id && trips.some(t => t.id === tripData.id)) {
        await dataService.updateTrip(tripData);
    } else {
        await dataService.addTrip(tripData);
    }
    refreshData();
    setIsRequestModalOpen(false);
  };

  const handleDeleteRequest = async (tripId: string) => {
      await dataService.deleteTrip(tripId);
      refreshData();
      setIsRequestModalOpen(false);
  };

  // --- Selection Logic ---

  const handleSelectionComplete = () => {
    if (!selectionStart || !selectionEnd) return;
    
    // Determine strict start/end order
    const start = selectionStart < selectionEnd ? selectionStart : selectionEnd;
    const end = selectionStart < selectionEnd ? selectionEnd : selectionStart;
    
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    
    setEditingTrip({
        startDate: fmt(start),
        endDate: fmt(end)
    } as any); 
    
    setIsRequestModalOpen(true);
    setSelectionStart(null);
    setSelectionEnd(null);
    setIsDragging(false);
  };

  const onDayMouseDown = (date: Date) => {
      setIsDragging(true);
      setSelectionStart(date);
      setSelectionEnd(date);
  };

  const onDayMouseEnter = (date: Date) => {
      if (isDragging) {
          setSelectionEnd(date);
      }
  };

  // --- Calendar Helpers ---

  const isSameDay = (d1: Date, d2: Date) => d1.getDate() === d2.getDate() && d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear();
 
  const isDateInSelection = (date: Date) => {
      if (!selectionStart || !selectionEnd) return false;
      const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const s = new Date(selectionStart.getFullYear(), selectionStart.getMonth(), selectionStart.getDate());
      const e = new Date(selectionEnd.getFullYear(), selectionEnd.getMonth(), selectionEnd.getDate());
      const start = s < e ? s : e;
      const end = s < e ? e : s;
      return d >= start && d <= end;
  };

  const getCalendarTitle = () => {
      if (calendarView === 'year') return null; 
      if (calendarView === 'month') return viewDate.toLocaleString('default', { month: 'long' });
      if (calendarView === 'week') {
        const first = getStartOfWeek(viewDate);
        const last = new Date(first); last.setDate(first.getDate() + 6);
        return `${first.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${last.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
      }
      return 'Calendar';
  };

  const getStartOfWeek = (d: Date) => {
    const date = new Date(d); const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); 
    return new Date(date.setDate(diff));
  };

  const handleNavigate = (direction: number) => {
    const next = new Date(viewDate);
    if (calendarView === 'month') next.setMonth(next.getMonth() + direction);
    else if (calendarView === 'week') next.setDate(next.getDate() + (direction * 7));
    else if (calendarView === 'year') next.setFullYear(next.getFullYear() + direction);
    setViewDate(next);
  };

  const renderDayCell = (date: Date, minHeightClass: string = 'min-h-[140px]', showDate = true, size: 'normal' | 'compact' = 'normal') => {
      const isToday = isSameDay(date, new Date());
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      
      // Determine holidays
      const dayHolidays = new Map<string, string>(); 
      users.forEach(u => {
        const { holidayMap, shiftedMap } = getUserEffectiveHolidays(u.id);
        if (holidayMap.has(dateKey)) holidayMap.get(dateKey)?.forEach(n => dayHolidays.set(n, 'actual'));
        if (shiftedMap.has(dateKey)) shiftedMap.get(dateKey)?.forEach(n => dayHolidays.set(n, 'shifted'));
      });
      
      const holidayList = Array.from(dayHolidays.entries());
      const holidayNames = holidayList.map(([name, type]) => `${name}${type === 'shifted' ? ' (Observed)' : ''}`).join(', ');
      
      const isActualHoliday = holidayList.some(([_, type]) => type === 'actual');
      const isShiftedHoliday = holidayList.some(([_, type]) => type === 'shifted');

      const dayTrips = trips.filter(t => isDateInRange(date, t.startDate, t.endDate));
      
      // Bucket trips by type
      const fullDayTrips: Trip[] = [];
      const amTrips: Trip[] = [];
      const pmTrips: Trip[] = [];

      dayTrips.forEach(t => {
          const portion = getDayPortion(date, t);
          if (portion === 'Full') fullDayTrips.push(t);
          if (portion === 'AM') amTrips.push(t);
          if (portion === 'PM') pmTrips.push(t);
      });

      // Calculate Day Weight - Only count if deductible (Working day, No holiday, Has entitlement)
      const isTripDeductible = (t: Trip) => {
          if (!t.entitlementId) return false;
          if (t.excludedDates?.includes(dateKey)) return false;
          
          const dayOfWeek = date.getDay();
          if (!workspaceConfig?.workingDays.includes(dayOfWeek)) return false; // Weekend/Non-working
          
          const uid = t.participants[0];
          const user = users.find(u => u.id === uid);
          if (user) {
              const userHolidays = holidays.filter(h => h.isIncluded && user.holidayConfigIds?.includes(h.configId || ''));
              const isHol = userHolidays.some(h => {
                  if (h.date === dateKey) return true;
                  if (user.holidayWeekendRule === 'monday') {
                      const d = new Date(h.date);
                      const dDay = d.getDay();
                      if ((dDay===0 || dDay===6) && getNextMonday(h.date) === dateKey) return true;
                  }
                  return false;
              });
              if (isHol) return false;
          }
          return true;
      };

      let dayWeight = 0;
      if (fullDayTrips.some(isTripDeductible)) dayWeight = 1;
      else {
          if (amTrips.some(isTripDeductible)) dayWeight += 0.5;
          if (pmTrips.some(isTripDeductible)) dayWeight += 0.5;
      }

      const isSelected = isDateInSelection(date);
      const isWorkingDay = workspaceConfig?.workingDays.includes(date.getDay());
      
      // Background Logic
      let cellBackground = 'bg-white dark:bg-gray-900/40';
      if (isToday) {
          cellBackground = 'bg-white ring-2 ring-blue-400 dark:bg-gray-800 dark:ring-blue-600';
      } else if (isSelected) {
          cellBackground = 'bg-blue-50 dark:bg-blue-900/50';
      } else if (isActualHoliday) {
          cellBackground = 'bg-rose-50 dark:bg-rose-900/20';
      } else if (isShiftedHoliday) {
          cellBackground = 'bg-amber-50 dark:bg-amber-900/20';
      } else if (!isWorkingDay) {
          cellBackground = 'bg-gray-50/50 dark:bg-black/40';
      }

      const borderColor = isSelected ? 'border-blue-300 dark:border-blue-700' : 'border-gray-100 dark:border-white/5';

      // --- COMPACT VIEW (Year) ---
      if (size === 'compact') {
          const hasTrip = dayTrips.length > 0;
          let intensity = '';
          if (hasTrip) intensity = 'bg-blue-500 shadow-sm shadow-blue-500/50';
          else if (isActualHoliday) intensity = 'bg-rose-500 shadow-sm shadow-rose-500/50';
          else if (isShiftedHoliday) intensity = 'bg-amber-500';

          return (
            <div 
                key={dateKey}
                onMouseDown={() => onDayMouseDown(date)}
                onMouseEnter={() => onDayMouseEnter(date)}
                className={`relative w-full h-8 flex items-center justify-center border rounded-lg transition-all text-[9px] font-bold ${cellBackground} ${borderColor} hover:scale-105 hover:z-10 cursor-pointer ${intensity ? 'text-white border-transparent' : 'text-gray-700 dark:text-gray-300'}`}
                title={`${dateKey}${holidayNames ? ' • ' + holidayNames : ''}`}
            >
                {date.getDate()}
                {intensity && <div className={`absolute inset-0 rounded-lg ${intensity} opacity-20`} />}
            </div>
          );
      }

      // --- NORMAL VIEW (Month) ---
      return (
        <div 
          key={dateKey} 
          title={holidayNames || undefined}
          onMouseDown={() => onDayMouseDown(date)}
          onMouseEnter={() => onDayMouseEnter(date)}
          className={`relative ${minHeightClass} rounded-2xl border transition-all hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-xl group flex flex-col overflow-hidden cursor-pointer ${cellBackground} ${borderColor}`}
        >
            {/* Date Number - Always Visible on Top Right */}
            <div className="absolute top-2 right-3 z-20 pointer-events-none">
                <span className={`text-sm font-bold ${isToday ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'} ${(!isWorkingDay && !isActualHoliday && !isShiftedHoliday) ? 'opacity-50' : ''}`}>{date.getDate()}</span>
            </div>

            {/* Day Weight Label - Top Left */}
            {dayWeight > 0 && (
                <div className="absolute top-2 left-3 z-20 pointer-events-none">
                    <span className="text-[10px] font-black text-gray-400 dark:text-white/30 tracking-tight">
                        {dayWeight}
                    </span>
                </div>
            )}

            {/* Holiday Label - Absolute Bottom Left */}
            {holidayNames && (
                <div className="absolute bottom-1 left-2 z-20 max-w-[80%] truncate pointer-events-none">
                    <span className={`text-[9px] font-black uppercase tracking-tight leading-none ${isActualHoliday ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`}>
                        {holidayNames}
                    </span>
                </div>
            )}

            {/* Content Container */}
            <div className="flex flex-col h-full w-full z-10 relative">
                {fullDayTrips.length > 0 ? (
                    fullDayTrips.map((trip) => {
                        const ent = entitlements.find(e => e.id === trip.entitlementId);
                        const styleClass = getCategoryClasses(ent?.color, true);
                        return (
                            <div 
                                key={trip.id}
                                onClick={(e) => { e.stopPropagation(); handleEditRequest(trip); }}
                                className={`flex-1 flex flex-col justify-center px-3 py-1 w-full cursor-pointer hover:brightness-95 transition-all ${styleClass}`}
                            >
                                <div className="font-bold text-xs truncate leading-tight">
                                    <span className="mr-1">{trip.icon}</span>
                                    {trip.name}
                                </div>
                                <div className="text-[9px] opacity-80 uppercase tracking-wider font-bold">
                                    {ent?.name || 'Event'}
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <>
                        {/* Upper Half (AM) */}
                        <div className="flex-1 w-full flex flex-col min-h-0 border-b border-dashed border-gray-400/20 dark:border-white/10">
                            {amTrips.length > 0 ? amTrips.map(trip => {
                                const ent = entitlements.find(e => e.id === trip.entitlementId);
                                const styleClass = getCategoryClasses(ent?.color, true);
                                return (
                                    <div 
                                        key={trip.id}
                                        onClick={(e) => { e.stopPropagation(); handleEditRequest(trip); }}
                                        className={`flex-1 flex flex-col justify-center px-3 py-0.5 w-full cursor-pointer hover:brightness-95 transition-all ${styleClass}`}
                                    >
                                        <div className="font-bold text-[10px] truncate leading-tight flex items-center gap-1">
                                            <span>{trip.icon}</span>
                                            <span>{trip.name}</span>
                                        </div>
                                    </div>
                                );
                            }) : null}
                        </div>

                        {/* Lower Half (PM) */}
                        <div className="flex-1 w-full flex flex-col min-h-0">
                            {pmTrips.length > 0 ? pmTrips.map(trip => {
                                const ent = entitlements.find(e => e.id === trip.entitlementId);
                                const styleClass = getCategoryClasses(ent?.color, true);
                                return (
                                    <div 
                                        key={trip.id}
                                        onClick={(e) => { e.stopPropagation(); handleEditRequest(trip); }}
                                        className={`flex-1 flex flex-col justify-center px-3 py-0.5 w-full cursor-pointer hover:brightness-95 transition-all ${styleClass}`}
                                    >
                                        <div className="font-bold text-[10px] truncate leading-tight flex items-center gap-1">
                                            <span>{trip.icon}</span>
                                            <span>{trip.name}</span>
                                        </div>
                                    </div>
                                );
                            }) : null}
                        </div>
                    </>
                )}
            </div>
        </div>
      );
  };

  const renderMonthView = () => {
      const year = viewDate.getFullYear();
      const month = viewDate.getMonth();
      const firstDay = new Date(year, month, 1);
      const startDay = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1; // Mon=0
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      
      const grid: React.ReactNode[] = [];
      for (let i = 0; i < startDay; i++) {
          grid.push(<div key={`empty-${i}`} className="min-h-[140px] bg-gray-50/20 dark:bg-white/5 rounded-2xl" />);
      }
      for (let d = 1; d <= daysInMonth; d++) {
          grid.push(renderDayCell(new Date(year, month, d)));
      }

      return (
          <div className="grid grid-cols-7 gap-3">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                  <div key={d} className="text-center py-3 text-xs font-black text-gray-400 uppercase tracking-widest">{d}</div>
              ))}
              {grid}
          </div>
      );
  };

  const renderUserCard = (user: User) => {
    const currentYear = new Date().getFullYear();
    const isPartner = user.role === 'Partner';
    const gradient = isPartner ? 'from-blue-600 to-indigo-600' : 'from-emerald-500 to-teal-600';
    const shadowColor = isPartner ? 'shadow-blue-500/30' : 'shadow-emerald-500/30';
    const lightBg = isPartner ? 'bg-blue-50 dark:bg-blue-900/10' : 'bg-emerald-50 dark:bg-emerald-900/10';
    const textColor = isPartner ? 'text-blue-600 dark:text-blue-400' : 'text-emerald-600 dark:text-emerald-400';

    // Get Active Entitlements for this User for the current year
    // Filter to only include those in user.policies OR 'Lieu' if balance > 0
    const userPolicies = user.policies?.filter(p => p.year === currentYear) || [];
    const activeEntitlements = entitlements.filter(e => {
        if (e.category === 'Lieu') return true; 
        return userPolicies.some(p => p.entitlementId === e.id);
    });

    const upcomingCount = trips.filter(t => t.participants.includes(user.id) && new Date(t.endDate) >= new Date() && t.status !== 'Cancelled').length;
    const totalDaysOff = trips.filter(t => t.participants.includes(user.id) && new Date(t.startDate).getFullYear() === currentYear && t.status !== 'Cancelled').reduce((acc, t) => {
        // Simple day calc for total visual
        return acc + (Math.ceil((new Date(t.endDate).getTime() - new Date(t.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1);
    }, 0);

    return (
        <Card 
            key={user.id} 
            noPadding 
            className="group cursor-pointer hover:-translate-y-1 transition-all overflow-visible h-full flex flex-col"
            onClick={() => onUserClick && onUserClick(user.id)}
        >
            <div className="p-6 relative overflow-hidden rounded-[2rem] flex flex-col h-full">
                {/* Background Blob */}
                <div className={`absolute -right-10 -top-10 w-40 h-40 bg-gradient-to-br ${gradient} opacity-10 rounded-full blur-3xl group-hover:opacity-20 transition-opacity`} />

                {/* Header */}
                <div className="flex items-center gap-4 mb-6 relative z-10 shrink-0">
                    <div className={`w-16 h-16 rounded-[1.2rem] bg-gradient-to-br ${gradient} flex items-center justify-center text-3xl font-black text-white shadow-xl ${shadowColor} transform group-hover:scale-105 group-hover:rotate-3 transition-all`}>
                        {user.name?.charAt(0) || '?'}
                    </div>
                    <div>
                        <h3 className="text-xl font-black text-gray-900 dark:text-white leading-none tracking-tight">{user.name}</h3>
                        <div className="flex items-center gap-2 mt-1.5">
                            <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md ${lightBg} ${textColor}`}>
                                {user.role}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Balance List */}
                <div className="flex-1 space-y-3 relative z-10 overflow-y-auto custom-scrollbar pr-1 min-h-[140px]">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 sticky top-0 bg-white/95 dark:bg-[#121212]/95 backdrop-blur-sm pb-1 z-10">Leave Balances ({currentYear})</p>
                    {activeEntitlements.map(ent => {
                        // Calculate Balance Logic Inline for Dashboard
                        const policy = userPolicies.find(p => p.entitlementId === ent.id);
                        
                        let allowance = 0;
                        if (policy) {
                            if (policy.isUnlimited) allowance = Infinity;
                            else allowance = policy.accrual.amount; 
                            // Add simplistic carry over approximation if enabled (detailed logic in UserDetail is better but complex to dupe here perfectly without bloating)
                            if (policy.carryOver.enabled) {
                                // Assume some carry over for visualization or just show base
                                // To keep dashboard lightweight, we rely on the primary accrual mostly
                            }
                        } else if (ent.category === 'Lieu') {
                            allowance = user.lieuBalance || 0;
                        }

                        const used = calculateUsedDays(user.id, ent.id, currentYear);
                        const remaining = allowance === Infinity ? Infinity : Math.max(0, allowance - used);
                        const percent = allowance === Infinity || allowance === 0 ? 0 : Math.min(100, (used / allowance) * 100);
                        const barColor = getProgressBarColor(ent.color);

                        return (
                            <div key={ent.id} className="flex flex-col gap-1.5">
                                <div className="flex justify-between items-end text-xs">
                                    <span className="font-bold text-gray-700 dark:text-gray-300">{ent.name}</span>
                                    <span className={`font-black ${allowance !== Infinity && remaining < 3 ? 'text-rose-500' : 'text-gray-900 dark:text-white'}`}>
                                        {allowance === Infinity ? '∞' : remaining.toFixed(1)} <span className="text-[9px] font-normal text-gray-400 uppercase">Left</span>
                                    </span>
                                </div>
                                <div className="h-1.5 w-full bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${percent}%` }} />
                                </div>
                            </div>
                        );
                    })}
                    {activeEntitlements.length === 0 && (
                        <div className="flex items-center justify-center h-full text-[10px] text-gray-400 italic">No policies active for {currentYear}</div>
                    )}
                </div>

                {/* Footer Stats */}
                <div className="grid grid-cols-2 gap-4 border-t border-gray-100 dark:border-white/5 pt-4 mt-4 relative z-10 shrink-0">
                    <div>
                        <div className="text-xl font-black text-gray-900 dark:text-white leading-none">{upcomingCount}</div>
                        <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">Upcoming</div>
                    </div>
                    <div className="text-right">
                        <div className="text-xl font-black text-gray-900 dark:text-white leading-none">{totalDaysOff}</div>
                        <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">Days Off</div>
                    </div>
                </div>
            </div>
        </Card>
    );
  };

  if (loading) return <div className="p-8 text-gray-400 animate-pulse">Synchronizing Dashboard...</div>;

  // Responsive Grid Logic based on user count
  // 1 User: Max width constrained, centered.
  // 2 Users: 2 cols, centered.
  // 3+ Users: Standard responsive grid.
  const gridClass = users.length === 1 
      ? 'max-w-xl mx-auto' 
      : users.length === 2 
          ? 'grid-cols-1 md:grid-cols-2 max-w-5xl mx-auto' 
          : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

  return (
    <div className="space-y-8 animate-fade-in max-w-[1600px] mx-auto pb-12">
        
        {/* TEAM HEADER */}
        <div className={`grid gap-6 ${gridClass}`}>
            {users.map(user => renderUserCard(user))}
            
            {/* Add User Stub - Only show if > 0 users to avoid weird empty state, usually init has 1 */}
            <button className="group flex flex-col items-center justify-center p-6 rounded-[2rem] border-2 border-dashed border-gray-200 dark:border-white/10 text-gray-400 hover:text-blue-500 hover:border-blue-300 hover:bg-blue-50/50 dark:hover:bg-white/5 transition-all gap-2 h-full min-h-[300px]">
                <div className="w-16 h-16 rounded-full bg-gray-50 dark:bg-white/5 group-hover:bg-white dark:group-hover:bg-white/10 flex items-center justify-center transition-colors">
                    <span className="material-icons-outlined text-3xl">person_add</span>
                </div>
                <span className="text-xs font-bold uppercase tracking-widest">Invite Member</span>
            </button>
        </div>

        {/* CALENDAR SECTION */}
        <Card noPadding className="rounded-[2.5rem] overflow-hidden shadow-2xl border border-gray-200/50 dark:border-white/5">
            <div className="p-6 border-b border-gray-100 dark:border-white/5 flex flex-col md:flex-row justify-between items-center gap-4 bg-white/50 dark:bg-white/5 backdrop-blur-xl sticky top-0 z-20">
                <div className="flex items-center gap-4">
                    <div className="flex bg-gray-100 dark:bg-black/40 rounded-2xl p-1">
                        <button onClick={() => handleNavigate(-1)} className="p-2 hover:bg-white dark:hover:bg-gray-800 rounded-xl transition-all shadow-sm"><span className="material-icons-outlined text-sm">chevron_left</span></button>
                        <button onClick={() => setViewDate(new Date())} className="px-4 text-xs font-bold uppercase tracking-wider hover:text-blue-500 transition-colors">Today</button>
                        <button onClick={() => handleNavigate(1)} className="p-2 hover:bg-white dark:hover:bg-gray-800 rounded-xl transition-all shadow-sm"><span className="material-icons-outlined text-sm">chevron_right</span></button>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">
                            {getCalendarTitle()}
                        </h2>
                        <div className="relative group">
                             <select
                                value={activeYear}
                                onChange={(e) => {
                                    const newDate = new Date(viewDate);
                                    newDate.setFullYear(parseInt(e.target.value));
                                    setViewDate(newDate);
                                }}
                                className="appearance-none bg-transparent text-2xl font-black text-gray-400 hover:text-blue-500 cursor-pointer outline-none pr-6 transition-colors"
                            >
                                {yearRange.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                            <span className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 material-icons-outlined text-sm opacity-50 group-hover:opacity-100 transition-opacity">expand_more</span>
                        </div>
                    </div>
                </div>

                <div className="flex gap-2">
                    <Button variant="primary" size="sm" icon={<span className="material-icons-outlined text-sm">add</span>} onClick={handleOpenRequest}>
                        Book Time Off
                    </Button>
                    <div className="flex bg-gray-100 dark:bg-black/40 rounded-2xl p-1">
                        <button onClick={() => setCalendarView('month')} className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${calendarView === 'month' ? 'bg-white shadow text-blue-600 dark:bg-gray-800 dark:text-white' : 'text-gray-500'}`}>Month</button>
                        <button onClick={() => setCalendarView('year')} className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${calendarView === 'year' ? 'bg-white shadow text-blue-600 dark:bg-gray-800 dark:text-white' : 'text-gray-500'}`}>Year</button>
                    </div>
                </div>
            </div>

            <div className="p-6 bg-white dark:bg-gray-900/50 min-h-[600px]">
                {calendarView === 'month' && renderMonthView()}
                
                {calendarView === 'year' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {Array.from({ length: 12 }).map((_, i) => {
                            const monthDate = new Date(activeYear, i, 1);
                            const daysInMonth = new Date(activeYear, i + 1, 0).getDate();
                            const startDay = monthDate.getDay() === 0 ? 6 : monthDate.getDay() - 1;
                            
                            return (
                                <div key={i} className="bg-gray-50/50 dark:bg-white/5 rounded-2xl p-4 border border-gray-100 dark:border-white/5">
                                    <h4 
                                        className="text-sm font-black text-gray-900 dark:text-white mb-3 uppercase tracking-widest cursor-pointer hover:text-blue-500 transition-colors"
                                        onClick={() => {
                                            const newDate = new Date(viewDate);
                                            newDate.setMonth(i);
                                            setViewDate(newDate);
                                            setCalendarView('month');
                                        }}
                                    >
                                        {monthDate.toLocaleString('default', { month: 'long' })}
                                    </h4>
                                    <div className="grid grid-cols-7 gap-1">
                                        {Array.from({ length: startDay }).map((_, k) => <div key={k} />)}
                                        {Array.from({ length: daysInMonth }).map((_, d) => {
                                            const date = new Date(activeYear, i, d + 1);
                                            return renderDayCell(date, 'h-8', false, 'compact');
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </Card>

        {/* MODALS */}
        <LeaveRequestModal 
            isOpen={isRequestModalOpen}
            onClose={() => setIsRequestModalOpen(false)}
            onSubmit={handleSubmitRequest}
            onDelete={handleDeleteRequest}
            initialData={editingTrip}
            users={users}
            entitlements={entitlements}
            trips={trips}
            holidays={holidays}
            workspaceConfig={workspaceConfig}
        />
    </div>
  );
};
