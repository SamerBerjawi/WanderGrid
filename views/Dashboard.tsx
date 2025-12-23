
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

const DonutChart: React.FC<{ percentage: number; colorClass: string; size?: number }> = ({ percentage, colorClass, size = 60 }) => {
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle
          className="text-gray-100 dark:text-gray-800"
          strokeWidth={strokeWidth}
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        <circle
          className={`transition-all duration-700 ease-out ${colorClass}`}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
      </svg>
      <span className="absolute text-[10px] font-bold text-gray-700 dark:text-gray-300">
        {percentage === Infinity ? '∞' : `${Math.round(percentage)}%`}
      </span>
    </div>
  );
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

  const getUserLieuEarned = (userId: string, year: number) => {
    const user = users.find(u => u.id === userId);
    if (!user || user.holidayWeekendRule !== 'lieu') return 0;
    let earned = 0;
    const processed = new Set<string>();
    holidays.forEach(h => {
        const d = new Date(h.date);
        if (d.getFullYear() === year && h.isIncluded && user.holidayConfigIds?.includes(h.configId || '')) {
            const day = d.getDay();
            if ((day === 0 || day === 6) && !processed.has(h.date)) {
                earned += 1;
                processed.add(h.date);
            }
        }
    });
    return earned;
  };

  const calculateDuration = (
      startDate: string, endDate: string, mode: string = 'all_full',
      startPortion: string = 'full', endPortion: string = 'full', userId: string,
      filterYear?: number
    ) => {
    if (!startDate || !endDate || !workspaceConfig || !userId) return 0;
    const { holidayMap, shiftedMap } = getUserEffectiveHolidays(userId);
    const parseLocal = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
    const start = parseLocal(startDate);
    const end = parseLocal(endDate);
    if (end.getTime() < start.getTime()) return 0;
    let total = 0;
    const current = new Date(start);
    while (current <= end) {
        const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
        const dayOfWeek = current.getDay();
        const currentYear = current.getFullYear();
        if (filterYear === undefined || currentYear === filterYear) {
            const isWorkingDay = workspaceConfig.workingDays.includes(dayOfWeek);
            const isActualHoliday = holidayMap.has(dateStr);
            const isShiftedHoliday = shiftedMap.has(dateStr);
            if (isWorkingDay && !isActualHoliday && !isShiftedHoliday) {
                let weight = 1;
                if (mode === 'all_am' || mode === 'all_pm' || mode === 'single_am' || mode === 'single_pm') weight = 0.5;
                else if (mode === 'custom') {
                    const isStart = current.getTime() === start.getTime();
                    const isEnd = current.getTime() === end.getTime();
                    if (isStart && isEnd) { if (startPortion === 'pm' || endPortion === 'am') weight = 0.5; }
                    else { if (isStart && startPortion === 'pm') weight = 0.5; else if (isEnd && endPortion === 'am') weight = 0.5; }
                }
                total += weight;
            }
        }
        current.setDate(current.getDate() + 1);
    }
    return total;
  };

  const getUsedBalanceByYear = (userId: string, entitlementId: string, year: number) => {
      const userTrips = trips.filter(t => t.participants.includes(userId) && t.status !== 'Planning');
      let used = 0;
      userTrips.forEach(t => {
           if (t.allocations && t.allocations.length > 0) {
               // Check if there is an explicit strict-year allocation for this year
               const strictAlloc = t.allocations.find(a => a.entitlementId === entitlementId && a.targetYear === year);
               
               if (strictAlloc) {
                   // Strict mode: Only count the allocated amount, no calculation needed
                   used += strictAlloc.days;
               } else {
                   // Fallback or Legacy: Proportional split or standard split without year target
                   const alloc = t.allocations.find(a => a.entitlementId === entitlementId && !a.targetYear);
                   if (alloc) {
                        const totalTripDays = calculateDuration(t.startDate, t.endDate, t.durationMode, t.startPortion || 'full', t.endPortion || 'full', userId);
                        const daysInYear = calculateDuration(t.startDate, t.endDate, t.durationMode, t.startPortion || 'full', t.endPortion || 'full', userId, year);
                        if (totalTripDays > 0) used += (alloc.days * (daysInYear / totalTripDays));
                   }
               }
           } else if (t.entitlementId === entitlementId) {
               used += calculateDuration(t.startDate, t.endDate, t.durationMode, t.startPortion || 'full', t.endPortion || 'full', userId, year);
           }
      });
      return used;
  };

  const getBaseAllowance = (userId: string, entitlementId: string, year: number) => {
    const user = users.find(u => u.id === userId);
    const ent = entitlements.find(e => e.id === entitlementId);
    if (!user || !ent) return 0;
    
    const policy = user.policies?.find(p => p.entitlementId === ent.id && p.year === year);
    if (!policy || !policy.isActive) return 0;
    
    // Respect per-policy unlimited flag if set, otherwise fallback to global entitlement setting
    const isUnlimited = policy.isUnlimited !== undefined ? policy.isUnlimited : ent.isUnlimited;
    if (isUnlimited) return Infinity;
    
    if (ent.id === 'e2' || ent.category === 'Lieu') return (user.lieuBalance || 0) + getUserLieuEarned(userId, year);

    return policy.accrual.amount;
  };

  // RECURSIVE TOTAL ALLOWANCE (Fixes carry-over bug)
  const getTotalAllowance = (userId: string, entId: string, year: number, depth = 0): number => {
      if (depth > 5) return 0; // Prevent infinite loop
      
      const base = getBaseAllowance(userId, entId, year);
      if (base === Infinity) return Infinity;

      let carryOverAmount = 0;
      const user = users.find(u => u.id === userId);
      const policy = user?.policies?.find(p => p.entitlementId === entId && p.year === year);
      
      if (policy && policy.carryOver.enabled) {
           const prevYear = year - 1;
           const prevPolicies = user?.policies?.filter(p => p.year === prevYear && p.carryOver.enabled) || [];
           
           prevPolicies.forEach(prevP => {
                const targetsSelf = !prevP.carryOver.targetEntitlementId || prevP.carryOver.targetEntitlementId === prevP.entitlementId;
                const isTarget = prevP.carryOver.targetEntitlementId === entId;

                if ((targetsSelf && prevP.entitlementId === entId) || isTarget) {
                    // Recursive call to get Total Allowance of previous year
                    const prevTotal = getTotalAllowance(userId, prevP.entitlementId, prevYear, depth + 1);
                    
                    if (prevTotal !== Infinity) {
                        const prevUsed = getUsedBalanceByYear(userId, prevP.entitlementId, prevYear);
                        const remaining = Math.max(0, prevTotal - prevUsed);
                        const carried = Math.min(remaining, prevP.carryOver.maxDays);
                        carryOverAmount += carried;
                    }
                }
           });
      }
      
      return base + carryOverAmount;
  };

  const getEntitlementAllowance = (userId: string, entitlementId: string, year: number) => {
    return getTotalAllowance(userId, entitlementId, year);
  };

  // --- Modal Handlers ---

  const handleOpenRequest = () => {
    setEditingTrip(undefined);
    setIsRequestModalOpen(true);
  };

  const handleOpenTrip = () => {
    setEditingTrip(undefined);
    setIsTripModalOpen(true);
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

  const handleSaveTrip = async (tripData: Trip) => {
    if (tripData.id && trips.some(t => t.id === tripData.id)) {
        await dataService.updateTrip(tripData);
    } else {
        await dataService.addTrip(tripData);
    }
    refreshData();
    setIsTripModalOpen(false);
  };

  const handleDeleteTrip = async (tripId: string) => {
      await dataService.deleteTrip(tripId);
      refreshData();
      setIsTripModalOpen(false);
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
    } as any); // Partial trip for pre-fill
    
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
  const isDateInRange = (checkDate: Date, startStr: string, endStr: string) => {
    const start = new Date(startStr); const end = new Date(endStr);
    const check = new Date(checkDate.getFullYear(), checkDate.getMonth(), checkDate.getDate());
    const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    return check >= s && check <= e;
  };

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
      if (calendarView === 'year') return null; // handled differently in UI
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

  const renderDayCell = (date: Date, minHeightClass: string = 'min-h-[120px]', showDate = true, size: 'normal' | 'compact' = 'normal') => {
      const isToday = isSameDay(date, new Date());
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const dayHolidays = new Map<string, string>(); 
      users.forEach(u => {
        const { holidayMap, shiftedMap } = getUserEffectiveHolidays(u.id);
        if (holidayMap.has(dateKey)) holidayMap.get(dateKey)?.forEach(n => dayHolidays.set(n, 'actual'));
        if (shiftedMap.has(dateKey)) shiftedMap.get(dateKey)?.forEach(n => dayHolidays.set(n, 'shifted'));
      });
      const dayTrips = trips.filter(t => isDateInRange(date, t.startDate, t.endDate));
      const holidayList = Array.from(dayHolidays.entries());
      const holidayNames = holidayList.map(([name, type]) => `${name}${type === 'shifted' ? ' (Observed)' : ''}`).join(', ');
      const hasActual = holidayList.some(([_, type]) => type === 'actual');
      const hasShifted = holidayList.some(([_, type]) => type === 'shifted');
      const isSelected = isDateInSelection(date);

      // Working day logic
      const isWorkingDay = workspaceConfig?.workingDays.includes(date.getDay());
      
      let cellBackground = isToday 
          ? 'bg-white border-blue-400 ring-2 ring-blue-100 dark:bg-gray-800 dark:border-blue-600 dark:ring-blue-900/30 shadow-inner' 
          : !isWorkingDay 
            ? 'bg-gray-100/80 border-gray-200/50 dark:bg-black/60 dark:border-white/5' 
            : 'bg-white border-gray-100 dark:bg-gray-900/40 dark:border-white/5';

      if (hasActual) cellBackground = 'bg-rose-50 border-rose-200 dark:bg-rose-950/20 dark:border-rose-900/40';
      else if (hasShifted) cellBackground = 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/40';

      if (isSelected) cellBackground = 'bg-blue-100 border-blue-300 dark:bg-blue-900/50 dark:border-blue-700';

      if (size === 'compact') {
          // If a day has a trip without entitlement (general event), color it gray/slate
          const hasEvent = dayTrips.some(t => !t.entitlementId);
          const hasTrip = dayTrips.some(t => !!t.entitlementId);
          
          let intensity = '';
          if (hasTrip) intensity = 'bg-blue-500';
          else if (hasEvent) intensity = 'bg-slate-400';
          else if (hasActual) intensity = 'bg-rose-500';
          else if (hasShifted) intensity = 'bg-amber-500';

          return (
            <div 
                key={dateKey}
                onMouseDown={() => onDayMouseDown(date)}
                onMouseEnter={() => onDayMouseEnter(date)}
                className={`relative w-full h-8 flex items-center justify-center border rounded-lg transition-all text-[9px] font-bold ${cellBackground} hover:scale-105 hover:z-10 cursor-pointer ${intensity ? 'ring-1 ring-offset-1 ring-offset-white dark:ring-offset-gray-900 ring-opacity-50' : ''}`}
                title={`${dateKey}${holidayNames ? ' • ' + holidayNames : ''}`}
            >
                {date.getDate()}
                {dayTrips.length > 0 && (
                    <div className={`absolute bottom-1 w-1 h-1 rounded-full ${hasTrip ? 'bg-blue-500' : 'bg-slate-500'}`} />
                )}
                {holidayList.length > 0 && <div className="absolute top-1 right-1 w-1 h-1 bg-rose-500 rounded-full" />}
            </div>
          );
      }

      return (
        <div 
          key={dateKey} 
          title={holidayNames || undefined}
          onMouseDown={() => onDayMouseDown(date)}
          onMouseEnter={() => onDayMouseEnter(date)}
          className={`relative ${minHeightClass} p-2 rounded-2xl border transition-all hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-xl group flex flex-col gap-1 overflow-visible cursor-pointer select-none ${cellBackground}`}
        >
          {showDate && (
              <div className="flex justify-between items-start pointer-events-none">
                <span className={`text-xs font-black w-6 h-6 flex items-center justify-center rounded-lg transition-colors
                  ${isToday ? 'bg-blue-600 text-white shadow-lg' : !isWorkingDay ? 'text-gray-300 dark:text-gray-600' : 'text-gray-400 group-hover:text-blue-500 dark:text-gray-500'}
                  ${isSelected ? '!bg-blue-600 !text-white' : ''}
                `}>
                  {date.getDate()}
                </span>
              </div>
          )}

          <div className="flex-1 space-y-1 mt-1 overflow-hidden pointer-events-none">
            {holidayList.map(([name, type]) => (
                <div key={name} className={`text-[9px] px-1.5 py-1 rounded-lg font-bold tracking-tight border truncate transition-all 
                    ${type === 'actual' ? 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-500/10 dark:text-rose-200 dark:border-rose-500/20' : 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:border-amber-500/20'}`}>
                  ★ {name}
                </div>
            ))}
            
            <div className="pointer-events-auto">
                {dayTrips.map(t => {
                    const isAM = t.durationMode === 'single_am' || t.durationMode === 'all_am';
                    const isPM = t.durationMode === 'single_pm' || t.durationMode === 'all_pm';
                    const hasEntitlement = !!t.entitlementId;

                    let bgClass = hasEntitlement 
                        ? 'bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20'
                        : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';

                    const displayName = t.name.includes(':') ? t.name.substring(t.name.indexOf(':') + 1).trim() : t.name;

                    return (
                        <button 
                          key={t.id} 
                          onClick={(e) => { e.stopPropagation(); handleEditRequest(t); }}
                          className={`w-full text-left text-[9px] px-1.5 py-1 mb-1 rounded-lg border flex items-center gap-1 hover:brightness-95 active:scale-[0.98] transition-all truncate ${bgClass}`} 
                        >
                          <span className="flex-shrink-0">{t.icon || '✈'}</span>
                          <span className="flex-1 truncate">{displayName}{isAM ? ' (AM)' : isPM ? ' (PM)' : ''}</span>
                        </button>
                    );
                })}
            </div>
          </div>
        </div>
      );
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12 max-w-[1600px] mx-auto">
      {/* ... Header and User Grid ... */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white/40 dark:bg-gray-900/40 p-6 rounded-[2rem] backdrop-blur-xl border border-white/50 dark:border-white/5 shadow-2xl">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h2 className="text-4xl font-black text-gray-900 dark:text-white tracking-tight">Command Center</h2>
            <div className="flex items-center gap-1.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 px-3 py-1 rounded-full border border-blue-200/50 dark:border-blue-900/50">
                <span className="material-icons-outlined text-sm">auto_awesome</span>
                <span className="text-xs font-bold uppercase tracking-widest">{activeYear} Horizon</span>
            </div>
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Tracking family velocity and upcoming expedition logistics.</p>
        </div>
        <div className="flex items-center gap-4">
           <div className="hidden lg:flex flex-col items-end px-6 border-r border-gray-200 dark:border-white/10">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Trips</span>
                <span className="text-2xl font-black text-gray-800 dark:text-white">{trips.filter(t => t.status !== 'Planning').length}</span>
           </div>
           
           <div className="flex gap-2">
                <Button 
                    variant="primary" 
                    size="lg" 
                    className="shadow-xl shadow-blue-500/20 hover:shadow-blue-500/40" 
                    icon={<span className="material-icons-outlined">add_task</span>} 
                    onClick={handleOpenRequest}
                >
                    New Time Off
                </Button>
                <Button 
                    variant="secondary" 
                    size="lg" 
                    className="shadow-sm border-2" 
                    icon={<span className="material-icons-outlined">add_location_alt</span>} 
                    onClick={handleOpenTrip}
                >
                    New Trip
                </Button>
           </div>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {users.map((user) => {
          const userEntitlements = entitlements.filter(ent => {
             // Policy exists for this year, OR allowance > 0 (inherited global)
             const policy = user.policies?.find(p => p.entitlementId === ent.id && p.year === activeYear);
             // Show if policy exists and is active
             return policy && policy.isActive;
          }).map(ent => {
              const allowance = getEntitlementAllowance(user.id, ent.id, activeYear);
              const used = getUsedBalanceByYear(user.id, ent.id, activeYear);
              return { ...ent, allowance, used };
          });

          const mainPolicy = userEntitlements[0] || { id: 'legacy', name: 'Annual Leave', allowance: 0, used: 0, color: 'blue' };
          const remaining = mainPolicy.allowance === Infinity ? Infinity : Math.max(0, mainPolicy.allowance - mainPolicy.used);
          const percentUsed = mainPolicy.allowance === Infinity ? 0 : (mainPolicy.allowance === 0 ? 100 : (mainPolicy.used / mainPolicy.allowance) * 100);
          
          return (
            <div 
                key={user.id} 
                onClick={() => onUserClick && onUserClick(user.id)}
                className="relative overflow-hidden p-6 rounded-[2rem] bg-white border border-gray-100 shadow-sm hover:shadow-2xl hover:-translate-y-1 transition-all dark:bg-gray-900/60 dark:border-white/5 group cursor-pointer"
            >
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-500/5 to-transparent rounded-bl-full pointer-events-none" />
                
                <div className="flex items-start justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black text-white shadow-lg transition-transform group-hover:rotate-3
                            ${user.role === 'Partner' ? 'bg-gradient-to-br from-blue-500 to-indigo-700' : 'bg-gradient-to-br from-emerald-400 to-teal-600'}`}>
                            {user.name.charAt(0)}
                        </div>
                        <div>
                            <h4 className="font-black text-lg text-gray-800 dark:text-white leading-none">{user.name}</h4>
                            <span className={`text-[10px] uppercase font-black tracking-[0.2em] mt-2 block ${user.role === 'Partner' ? 'text-blue-500' : 'text-emerald-500'}`}>{user.role}</span>
                        </div>
                    </div>
                    <DonutChart 
                        percentage={mainPolicy.allowance === Infinity ? Infinity : (100 - percentUsed)} 
                        colorClass={remaining < 5 ? 'text-rose-500' : 'text-blue-500'} 
                        size={64}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100 dark:border-white/10">
                    <div className="space-y-1">
                        <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Available</span>
                        <span className="text-2xl font-black text-gray-900 dark:text-white leading-none">{remaining === Infinity ? '∞' : Math.floor(remaining)} <span className="text-xs font-medium text-gray-400">days</span></span>
                    </div>
                    <div className="space-y-1 text-right">
                        <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Consumption</span>
                        <span className="text-2xl font-black text-gray-900 dark:text-white leading-none">{Math.floor(mainPolicy.used)} <span className="text-xs font-medium text-gray-400">used</span></span>
                    </div>
                </div>

                <div className="flex flex-wrap gap-1.5 mt-6">
                    {userEntitlements.slice(1).map((ent: any) => (
                        <div key={ent.id} className={`px-2.5 py-1 rounded-lg border text-[8px] font-black uppercase tracking-wider bg-${ent.color}-50 text-${ent.color}-700 border-${ent.color}-200/50 dark:bg-${ent.color}-500/10 dark:text-${ent.color}-300 dark:border-${ent.color}-500/20`}>
                            {ent.name}: {Math.floor(ent.used)}/{ent.allowance === Infinity ? '∞' : Math.floor(ent.allowance)}
                        </div>
                    ))}
                    {userEntitlements.length === 0 && (
                        <div className="text-[9px] text-gray-400 italic">No protocols defined for {activeYear}</div>
                    )}
                </div>
            </div>
          );
        })}
      </section>

      <Card noPadding className="rounded-[2rem] border-white/50 dark:border-white/5 overflow-visible shadow-2xl">
         {/* ... Calendar Header REDESIGNED ... */}
         <div className="p-5 md:p-8 border-b border-gray-100 dark:border-white/10 bg-white/40 dark:bg-white/5 rounded-t-[2rem]">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
                
                {/* Title & Date Context */}
                <div className="space-y-1 min-w-0">
                    <h3 className="text-2xl md:text-3xl lg:text-4xl font-black text-gray-900 dark:text-white tracking-tight leading-none truncate">
                        {getCalendarTitle() || 'Year Overview'}
                    </h3>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] pl-1">
                        Expedition Schedule
                    </p>
                </div>

                {/* Controls Group - Always Horizontal */}
                <div className="flex items-center gap-2 md:gap-3 overflow-x-auto pb-2 -mb-2 lg:pb-0 lg:mb-0 w-full lg:w-auto scrollbar-hide mask-fade-right">
                    
                    {/* 1. Year Selector */}
                    <div className="shrink-0 flex items-center p-1 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
                        <button
                            onClick={() => {
                                const next = new Date(viewDate);
                                next.setFullYear(next.getFullYear() - 1);
                                setViewDate(next);
                            }}
                            className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-500 dark:hover:text-white dark:hover:bg-gray-700 transition-all"
                            aria-label="Previous Year"
                        >
                            <span className="material-icons-outlined text-lg">chevron_left</span>
                        </button>
                        
                        <input 
                            type="number"
                            className="w-14 text-center bg-transparent font-black text-sm md:text-base text-gray-800 dark:text-gray-100 border-none outline-none focus:ring-0 appearance-none p-0"
                            value={viewDate.getFullYear()}
                            onChange={(e) => {
                                const val = parseInt(e.target.value);
                                if (!isNaN(val) && val > 0 && val < 9999) {
                                    const next = new Date(viewDate);
                                    next.setFullYear(val);
                                    setViewDate(next);
                                }
                            }}
                        />

                        <button
                            onClick={() => {
                                const next = new Date(viewDate);
                                next.setFullYear(next.getFullYear() + 1);
                                setViewDate(next);
                            }}
                            className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-500 dark:hover:text-white dark:hover:bg-gray-700 transition-all"
                            aria-label="Next Year"
                        >
                            <span className="material-icons-outlined text-lg">chevron_right</span>
                        </button>
                    </div>

                    {/* 2. Navigation (Prev/Today/Next) */}
                    <div className="shrink-0 flex items-center bg-white dark:bg-gray-800 p-1 rounded-2xl border border-gray-200 dark:border-white/10 shadow-sm">
                        <button 
                            onClick={() => handleNavigate(-1)} 
                            className="w-8 h-8 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl transition-all text-gray-400 hover:text-gray-900 dark:text-gray-500 dark:hover:text-white active:scale-95"
                            title="Previous"
                        >
                            <span className="material-icons-outlined text-lg">chevron_left</span>
                        </button>
                        <div className="w-px h-4 bg-gray-200 dark:bg-white/10 mx-1" />
                        <button 
                            onClick={() => setViewDate(new Date())} 
                            className="px-3 md:px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition-colors"
                        >
                            Today
                        </button>
                        <div className="w-px h-4 bg-gray-200 dark:bg-white/10 mx-1" />
                        <button 
                            onClick={() => handleNavigate(1)} 
                            className="w-8 h-8 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl transition-all text-gray-400 hover:text-gray-900 dark:text-gray-500 dark:hover:text-white active:scale-95"
                            title="Next"
                        >
                            <span className="material-icons-outlined text-lg">chevron_right</span>
                        </button>
                    </div>

                    {/* 3. View Switcher */}
                    <div className="shrink-0 flex p-1 bg-gray-100 dark:bg-gray-800/60 rounded-2xl border border-gray-200/50 dark:border-white/5">
                        {['week', 'month', 'year'].map(v => (
                            <button 
                                key={v}
                                onClick={() => setCalendarView(v as any)}
                                className={`px-3 md:px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all duration-300 ${
                                    calendarView === v 
                                    ? 'bg-white shadow-md text-blue-600 dark:bg-gray-700 dark:text-white dark:shadow-none' 
                                    : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                                }`}
                            >
                                {v}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
         </div>
         
         <div className="p-8 bg-gray-50/20 dark:bg-black/10 rounded-b-[2rem] select-none">
            {/* ... Calendar Grids ... */}
            {calendarView === 'month' && (
                <div className="grid grid-cols-7 gap-3 lg:gap-5">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <div key={day} className="text-center text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">{day}</div>)}
                    {Array.from({ length: 42 }).map((_, i) => {
                        const first = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
                        const startOffset = (first.getDay() === 0 ? 6 : first.getDay() - 1);
                        const d = new Date(viewDate.getFullYear(), viewDate.getMonth(), i + 1 - startOffset);
                        const isCurrentMonth = d.getMonth() === viewDate.getMonth();
                        if (!isCurrentMonth && i >= 35) return null; 
                        return (
                          <div key={i} className={`transition-all duration-300 ${!isCurrentMonth ? 'opacity-60 scale-95 blur-[1px]' : 'hover:z-10'}`}>
                             {renderDayCell(d, 'min-h-[140px]')}
                          </div>
                        );
                    })}
                </div>
            )}

            {calendarView === 'week' && (
                <div className="grid grid-cols-1 md:grid-cols-7 gap-x-5 gap-y-2 h-[calc(100vh-25rem)]">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <div key={day} className="text-center text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] hidden md:block">{day}</div>)}
                    {Array.from({ length: 7 }).map((_, i) => {
                        const d = getStartOfWeek(viewDate);
                        d.setDate(d.getDate() + i);
                        return (
                          <div key={i} className="flex flex-col gap-2 h-full">
                             <div className="md:hidden text-xs font-black text-gray-400 uppercase text-center py-2">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i]}</div>
                             {renderDayCell(d, 'h-full')}
                          </div>
                        );
                    })}
                </div>
            )}

            {calendarView === 'year' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-10">
                    {Array.from({ length: 12 }).map((_, monthIdx) => {
                        const firstOfMonth = new Date(viewDate.getFullYear(), monthIdx, 1);
                        return (
                            <div key={monthIdx} className="space-y-4 bg-white/50 dark:bg-white/5 p-4 rounded-3xl border border-gray-100 dark:border-white/5 shadow-sm">
                                <button 
                                    onClick={() => { setViewDate(firstOfMonth); setCalendarView('month'); }}
                                    className="text-xs font-black text-gray-900 dark:text-gray-100 hover:text-blue-600 transition-colors uppercase tracking-[0.2em] w-full text-left flex items-center justify-between"
                                >
                                    {firstOfMonth.toLocaleString('default', { month: 'long' })}
                                    <span className="material-icons-outlined text-sm opacity-30 group-hover:opacity-100">arrow_forward</span>
                                </button>
                                <div className="grid grid-cols-7 gap-1">
                                    {Array.from({ length: new Date(viewDate.getFullYear(), monthIdx + 1, 0).getDate() }).map((_, dayIdx) => {
                                        const d = new Date(viewDate.getFullYear(), monthIdx, dayIdx + 1);
                                        return renderDayCell(d, 'h-6', false, 'compact');
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
         </div>
      </Card>

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

      <TripModal 
        isOpen={isTripModalOpen}
        onClose={() => setIsTripModalOpen(false)}
        onSubmit={handleSaveTrip}
        onDelete={handleDeleteTrip}
        initialData={editingTrip} // Reusing editingTrip logic if applicable, or null
        users={users}
      />
    </div>
  );
};
