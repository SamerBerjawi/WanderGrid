
import React, { useEffect, useState, useMemo } from 'react';
import { Card, Button, Badge, Input, Tabs } from '../components/ui';
import { LeaveRequestModal } from '../components/LeaveRequestModal';
import { dataService } from '../services/mockDb';
import { Trip, User, EntitlementType, WorkspaceSettings, PublicHoliday } from '../types';

const COLORS = ['blue', 'green', 'amber', 'purple', 'red', 'indigo', 'gray', 'pink', 'teal', 'cyan'];

const getEntitlementColorClass = (color?: string) => {
    const map: any = { 
        blue: 'bg-blue-500', green: 'bg-emerald-500', amber: 'bg-amber-500', 
        purple: 'bg-purple-500', red: 'bg-rose-500', indigo: 'bg-indigo-500', 
        gray: 'bg-gray-500', pink: 'bg-pink-500', teal: 'bg-teal-500', cyan: 'bg-cyan-500'
    };
    return map[color || 'gray'] || 'bg-gray-500';
};

const getEntitlementTextClass = (color?: string) => {
    const map: any = { 
        blue: 'text-blue-600 dark:text-blue-400', green: 'text-emerald-600 dark:text-emerald-400', 
        amber: 'text-amber-600 dark:text-amber-400', purple: 'text-purple-600 dark:text-purple-400', 
        red: 'text-rose-600 dark:text-rose-400', indigo: 'text-indigo-600 dark:text-indigo-400', 
        gray: 'text-gray-600 dark:text-gray-400', pink: 'text-pink-600 dark:text-pink-400', 
        teal: 'text-teal-600 dark:text-teal-400', cyan: 'text-cyan-600 dark:text-cyan-400'
    };
    return map[color || 'gray'] || 'text-gray-600';
};

// Calendar Helpers
const getCategoryClasses = (color?: string, isFullDay = true) => {
    const map: any = {
        blue: isFullDay ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-100 border-l-4 border-blue-500' : 'bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800',
        green: isFullDay ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-100 border-l-4 border-emerald-500' : 'bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800',
        amber: isFullDay ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-100 border-l-4 border-amber-500' : 'bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800',
        purple: isFullDay ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-100 border-l-4 border-purple-500' : 'bg-purple-100 text-purple-700 border border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-800',
        red: isFullDay ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-100 border-l-4 border-rose-500' : 'bg-rose-100 text-rose-700 border border-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-800',
        indigo: isFullDay ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-100 border-l-4 border-indigo-500' : 'bg-indigo-100 text-indigo-700 border border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-300 dark:border-indigo-800',
        gray: isFullDay ? 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-100 border-l-4 border-gray-500' : 'bg-gray-100 text-gray-700 border border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600',
        pink: isFullDay ? 'bg-pink-100 text-pink-800 dark:bg-pink-900/60 dark:text-pink-100 border-l-4 border-pink-500' : 'bg-pink-100 text-pink-700 border border-pink-200 dark:bg-pink-900/40 dark:text-pink-300 dark:border-pink-800',
        teal: isFullDay ? 'bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-100 border-l-4 border-teal-500' : 'bg-teal-100 text-teal-700 border border-teal-200 dark:bg-teal-900/40 dark:text-teal-300 dark:border-teal-800',
        cyan: isFullDay ? 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/60 dark:text-cyan-100 border-l-4 border-cyan-500' : 'bg-cyan-100 text-cyan-700 border border-cyan-200 dark:bg-cyan-900/40 dark:text-cyan-300 dark:border-cyan-800',
    };
    return map[color || ''] || map.gray;
};

interface TimeOffProps {
    onTripClick?: (tripId: string) => void;
}

type CalendarViewType = 'week' | 'month' | 'year';

export const TimeOff: React.FC<TimeOffProps> = ({ onTripClick }) => {
    // ... (State logic unchanged)
    const [trips, setTrips] = useState<Trip[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [entitlements, setEntitlements] = useState<EntitlementType[]>([]);
    const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
    const [workspaceConfig, setWorkspaceConfig] = useState<WorkspaceSettings | null>(null);
    
    const [filterUser, setFilterUser] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'calendar' | 'upcoming' | 'history'>('calendar');

    const [viewDate, setViewDate] = useState(new Date());
    const [calendarView, setCalendarView] = useState<CalendarViewType>('month');
    const [isDragging, setIsDragging] = useState(false);
    const [selectionStart, setSelectionStart] = useState<Date | null>(null);
    const [selectionEnd, setSelectionEnd] = useState<Date | null>(null);
    const activeYear = viewDate.getFullYear();
    const yearRange = Array.from({ length: 11 }, (_, i) => activeYear - 5 + i);

    const [collapsedYears, setCollapsedYears] = useState<Set<number>>(new Set());

    const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
    const [editingTrip, setEditingTrip] = useState<Trip | undefined>(undefined);

    useEffect(() => {
        refreshData();
    }, []);

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
            dataService.getTrips(),
            dataService.getUsers(),
            dataService.getEntitlementTypes(),
            dataService.getSavedConfigs(),
            dataService.getWorkspaceSettings()
        ]).then(([t, u, ents, configs, config]) => {
            setTrips(t.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()));
            setUsers(u);
            setEntitlements(ents);
            const allHolidays = configs.flatMap(c => c.holidays.map(h => ({ ...h, configId: c.id })));
            setHolidays(allHolidays);
            setWorkspaceConfig(config);
        });
    };

    // ... (Helpers and Logic unchanged)
    const getNextMonday = (dateStr: string) => {
        const d = new Date(dateStr);
        const day = d.getDay();
        const diff = day === 0 ? 1 : (day === 6 ? 2 : 0);
        if (diff === 0) return dateStr;
        const next = new Date(d);
        next.setDate(d.getDate() + diff);
        return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
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

    const handleOpenRequest = () => {
        setEditingTrip(undefined);
        setIsRequestModalOpen(true);
    };

    const handleEditRequest = (trip: Trip) => {
        setEditingTrip(trip);
        setIsRequestModalOpen(true);
    };

    const handleSubmitRequest = async (tripData: Trip) => {
        let savedTrip: Trip;
        if (tripData.id && trips.some(t => t.id === tripData.id)) {
            savedTrip = await dataService.updateTrip(tripData);
        } else {
            savedTrip = await dataService.addTrip(tripData);
        }
        
        refreshData();
        setIsRequestModalOpen(false);

        if (onTripClick && savedTrip && savedTrip.location && savedTrip.location !== 'Time Off' && savedTrip.location !== 'Remote') {
            onTripClick(savedTrip.id);
        }
    };

    const handleDeleteRequest = async (tripId: string) => {
        await dataService.deleteTrip(tripId);
        refreshData();
        setIsRequestModalOpen(false);
    };

    const onDayMouseDown = (date: Date) => { setIsDragging(true); setSelectionStart(date); setSelectionEnd(date); };
    const onDayMouseEnter = (date: Date) => { if (isDragging) setSelectionEnd(date); };
    const handleSelectionComplete = () => {
        if (!selectionStart || !selectionEnd) return;
        const start = selectionStart < selectionEnd ? selectionStart : selectionEnd;
        const end = selectionStart < selectionEnd ? selectionEnd : selectionStart;
        const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        setEditingTrip({ startDate: fmt(start), endDate: fmt(end) } as any); 
        setIsRequestModalOpen(true);
        setSelectionStart(null); setSelectionEnd(null); setIsDragging(false);
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

    const renderDayCell = (date: Date, minHeightClass: string = 'min-h-[8.75rem]', showDate = true, size: 'normal' | 'compact' = 'normal') => {
        const isToday = isSameDay(date, new Date());
        const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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
        
        const dayTrips = trips.filter(t => {
            const matchesUser = filterUser === 'all' || t.participants.includes(filterUser);
            const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase()) || t.location.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesUser && matchesSearch && isDateInRange(date, t.startDate, t.endDate);
        });

        const fullDayTrips: Trip[] = [];
        const amTrips: Trip[] = [];
        const pmTrips: Trip[] = [];
        dayTrips.forEach(t => {
            const portion = getDayPortion(date, t);
            if (portion === 'Full') fullDayTrips.push(t);
            if (portion === 'AM') amTrips.push(t);
            if (portion === 'PM') pmTrips.push(t);
        });

        const isSelected = isDateInSelection(date);
        const isWorkingDay = workspaceConfig?.workingDays.includes(date.getDay());
        let cellBackground = 'bg-white dark:bg-gray-900/40';
        if (isToday) cellBackground = 'bg-white ring-2 ring-blue-400 dark:bg-gray-800 dark:ring-blue-600';
        else if (isSelected) cellBackground = 'bg-blue-50 dark:bg-blue-900/50';
        else if (isActualHoliday) cellBackground = 'bg-rose-50 dark:bg-rose-900/20';
        else if (isShiftedHoliday) cellBackground = 'bg-amber-50 dark:bg-amber-900/20';
        else if (!isWorkingDay) cellBackground = 'bg-gray-50/50 dark:bg-black/40';
        
        const borderColor = isSelected ? 'border-blue-300 dark:border-blue-700' : 'border-gray-100 dark:border-white/5';
        
        if (size === 'compact') {
            const hasTrip = dayTrips.length > 0;
            let intensity = '';
            if (hasTrip) intensity = 'bg-blue-500 shadow-sm shadow-blue-500/50';
            else if (isActualHoliday) intensity = 'bg-rose-500 shadow-sm shadow-rose-500/50';
            else if (isShiftedHoliday) intensity = 'bg-amber-500';
            return (
              <div key={dateKey} onMouseDown={() => onDayMouseDown(date)} onMouseEnter={() => onDayMouseEnter(date)} className={`relative w-full h-8 flex items-center justify-center border rounded-lg transition-all text-[9px] font-bold ${cellBackground} ${borderColor} hover:scale-105 hover:z-10 cursor-pointer ${intensity ? 'text-white border-transparent' : 'text-gray-700 dark:text-gray-300'}`} title={`${dateKey}${holidayNames ? ' • ' + holidayNames : ''}`}>
                  {date.getDate()}
                  {intensity && <div className={`absolute inset-0 rounded-lg ${intensity} opacity-20`} />}
              </div>
            );
        }
        return (
          <div key={dateKey} title={holidayNames || undefined} onMouseDown={() => onDayMouseDown(date)} onMouseEnter={() => onDayMouseEnter(date)} className={`relative ${minHeightClass} rounded-2xl border transition-all hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-xl group flex flex-col overflow-hidden cursor-pointer ${cellBackground} ${borderColor}`}>
              <div className="absolute top-2 right-3 z-20 pointer-events-none"><span className={`text-sm font-bold ${isToday ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'} ${(!isWorkingDay && !isActualHoliday && !isShiftedHoliday) ? 'opacity-50' : ''}`}>{date.getDate()}</span></div>
              {holidayNames && <div className="absolute bottom-1 left-2 z-20 max-w-[80%] truncate pointer-events-none"><span className={`text-[9px] font-black uppercase tracking-tight leading-none ${isActualHoliday ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`}>{holidayNames}</span></div>}
              <div className="flex flex-col h-full w-full z-10 relative">
                  {fullDayTrips.length > 0 ? (
                      fullDayTrips.map((trip) => {
                          const ent = entitlements.find(e => e.id === trip.entitlementId);
                          const styleClass = getCategoryClasses(ent?.color, true);
                          return <div key={trip.id} onClick={(e) => { e.stopPropagation(); handleEditRequest(trip); }} className={`flex-1 flex flex-col justify-center px-3 py-1 w-full cursor-pointer hover:brightness-95 transition-all ${styleClass}`}><div className="font-bold text-xs truncate leading-tight"><span className="mr-1">{trip.icon}</span>{trip.name}</div><div className="text-[9px] opacity-80 uppercase tracking-wider font-bold">{ent?.name || 'Event'}</div></div>;
                      })
                  ) : (
                      <>
                          <div className="flex-1 w-full flex flex-col min-h-0 border-b border-dashed border-gray-400/20 dark:border-white/10">
                              {amTrips.length > 0 ? amTrips.map(trip => {
                                  const ent = entitlements.find(e => e.id === trip.entitlementId);
                                  const styleClass = getCategoryClasses(ent?.color, true);
                                  return <div key={trip.id} onClick={(e) => { e.stopPropagation(); handleEditRequest(trip); }} className={`flex-1 flex flex-col justify-center px-3 py-0.5 w-full cursor-pointer hover:brightness-95 transition-all ${styleClass}`}><div className="font-bold text-[10px] truncate leading-tight flex items-center gap-1"><span>{trip.icon}</span><span>{trip.name}</span></div></div>;
                              }) : null}
                          </div>
                          <div className="flex-1 w-full flex flex-col min-h-0">
                              {pmTrips.length > 0 ? pmTrips.map(trip => {
                                  const ent = entitlements.find(e => e.id === trip.entitlementId);
                                  const styleClass = getCategoryClasses(ent?.color, true);
                                  return <div key={trip.id} onClick={(e) => { e.stopPropagation(); handleEditRequest(trip); }} className={`flex-1 flex flex-col justify-center px-3 py-0.5 w-full cursor-pointer hover:brightness-95 transition-all ${styleClass}`}><div className="font-bold text-[10px] truncate leading-tight flex items-center gap-1"><span>{trip.icon}</span><span>{trip.name}</span></div></div>;
                              }) : null}
                          </div>
                      </>
                  )}
              </div>
          </div>
        );
    };

    const renderMonthView = () => {
        const year = viewDate.getFullYear(); const month = viewDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const startDay = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const grid: React.ReactNode[] = [];
        for (let i = 0; i < startDay; i++) grid.push(<div key={`empty-${i}`} className="min-h-[8.75rem] bg-gray-50/20 dark:bg-white/5 rounded-2xl" />);
        for (let d = 1; d <= daysInMonth; d++) grid.push(renderDayCell(new Date(year, month, d)));
        return <div className="grid grid-cols-7 gap-3">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (<div key={d} className="text-center py-3 text-xs font-black text-gray-400 uppercase tracking-widest">{d}</div>))}{grid}</div>;
    };

    const toggleYearCollapse = (year: number) => {
        const newSet = new Set(collapsedYears);
        if (newSet.has(year)) { newSet.delete(year); } else { newSet.add(year); }
        setCollapsedYears(newSet);
    };

    const filteredTrips = useMemo(() => {
        return trips.filter(t => {
            const matchesUser = filterUser === 'all' || t.participants.includes(filterUser);
            const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase()) || t.location.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesUser && matchesSearch;
        });
    }, [trips, filterUser, searchQuery]);

    const upcomingTrips = filteredTrips.filter(t => new Date(t.endDate) >= new Date()).sort((a,b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    const pastTrips = filteredTrips.filter(t => new Date(t.endDate) < new Date()).sort((a,b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

    const pastTripsByYear = useMemo(() => {
        return pastTrips.reduce((groups, trip) => {
            const year = new Date(trip.startDate).getFullYear();
            if (!groups[year]) groups[year] = [];
            groups[year].push(trip);
            return groups;
        }, {} as Record<number, Trip[]>);
    }, [pastTrips]);

    const years = Object.keys(pastTripsByYear).map(Number).sort((a, b) => b - a);

    const renderTripCard = (trip: Trip) => {
        const d = new Date(trip.startDate);
        const day = d.getDate();
        const month = d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase();
        const weekday = d.toLocaleDateString(undefined, { weekday: 'short' });
        const start = new Date(trip.startDate);
        const end = new Date(trip.endDate);
        const duration = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        const ent = entitlements.find(e => e.id === trip.entitlementId);
        const colorClass = getEntitlementColorClass(ent?.color);
        const textClass = getEntitlementTextClass(ent?.color);
        const displayName = trip.name.includes(':') ? trip.name.substring(trip.name.indexOf(':') + 1).trim() : trip.name;
        
        return (
            <div key={trip.id} onClick={() => handleEditRequest(trip)} className="group relative flex flex-col sm:flex-row bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden cursor-pointer hover:-translate-y-1">
                <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${colorClass} opacity-80 group-hover:opacity-100`} />
                <div className="flex sm:flex-col items-center justify-center p-4 sm:p-6 bg-gray-50/50 dark:bg-black/20 border-b sm:border-b-0 sm:border-r border-gray-100 dark:border-white/5 min-w-[100px] gap-2 sm:gap-0">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{month}</span>
                    <span className="text-3xl font-black text-gray-800 dark:text-white leading-none sm:my-1">{day}</span>
                    <span className="text-xs font-bold text-gray-400 uppercase">{weekday}</span>
                </div>
                <div className="flex-1 p-5 flex flex-col justify-center">
                    <div className="flex justify-between items-start">
                        <div><h4 className="font-bold text-lg text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{trip.icon} {displayName}</h4><div className="flex items-center gap-2 mt-1.5"><span className={`text-[10px] font-black uppercase tracking-wider bg-gray-100 dark:bg-white/10 px-2 py-0.5 rounded ${textClass}`}>{ent?.name || 'Event'}</span>{trip.allocations && trip.allocations.length > 1 && (<span className="text-[9px] font-bold text-gray-400 bg-gray-100 dark:bg-white/5 px-2 py-0.5 rounded">+ Split</span>)}</div></div>
                        <div className="text-right space-y-1"><div className="text-xs font-bold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-white/5 px-3 py-1 rounded-lg" title="Calendar Duration">{duration} Days Total</div></div>
                    </div>
                    <div className="flex items-center justify-between mt-4">
                        <div className="flex -space-x-2">{trip.participants.map((pid, idx) => { const user = users.find(u => u.id === pid); if (!user) return null; return (<div key={idx} title={user.name} className={`w-7 h-7 rounded-lg border-2 border-white dark:border-gray-800 flex items-center justify-center text-[10px] font-black text-white shadow-sm ${user.role === 'Partner' ? 'bg-gradient-to-br from-blue-500 to-indigo-600' : 'bg-gradient-to-br from-emerald-500 to-teal-600'}`}>{user.name.charAt(0)}</div>) })}</div>
                        <div className="text-[10px] font-bold text-gray-400 group-hover:text-blue-500 transition-colors uppercase tracking-widest flex items-center gap-1">Edit <span className="material-icons-outlined text-xs">arrow_forward</span></div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-8 animate-fade-in max-w-[100rem] mx-auto pb-12">
            
            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-end gap-6 bg-white/40 dark:bg-gray-900/40 p-6 rounded-[2rem] backdrop-blur-xl border border-white/50 dark:border-white/5 shadow-xl">
                <div className="space-y-2 w-full md:w-auto">
                    <h2 className="text-4xl font-black text-gray-900 dark:text-white tracking-tight">Expedition Log</h2>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Manage time off requests and view travel history.</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                     <div className="relative group w-full sm:w-64">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 material-icons-outlined">search</span>
                        <input type="text" placeholder="Search trips..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-3 rounded-2xl bg-white/80 dark:bg-black/20 border border-gray-200 dark:border-white/10 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-sm font-medium"/>
                     </div>
                     <Button variant="primary" size="lg" className="shadow-xl shadow-blue-500/20" icon={<span className="material-icons-outlined">add_location_alt</span>} onClick={handleOpenRequest}>New Request</Button>
                </div>
            </div>

            {/* User Filter */}
            <div className="bg-white/60 dark:bg-gray-900/60 backdrop-blur-xl border border-white/50 dark:border-white/5 rounded-2xl p-2 flex items-center overflow-x-auto">
                <div className="flex gap-2 p-2 custom-scrollbar w-full">
                    <button onClick={() => setFilterUser('all')} className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all whitespace-nowrap ${filterUser === 'all' ? 'bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-gray-900' : 'bg-transparent text-gray-500 border-transparent hover:bg-gray-100 dark:hover:bg-white/10'}`}><span className="material-icons-outlined text-sm">groups</span><span className="text-xs font-bold uppercase tracking-wider">All Members</span></button>
                    <div className="w-px h-6 bg-gray-200 dark:bg-white/10 mx-1 shrink-0 self-center" />
                    {users.map(u => (
                        <button key={u.id} onClick={() => setFilterUser(u.id)} className={`flex items-center gap-2 pr-4 pl-1.5 py-1.5 rounded-xl border transition-all whitespace-nowrap ${filterUser === u.id ? 'bg-white shadow-md border-gray-200 dark:bg-gray-800 dark:border-white/10' : 'bg-transparent border-transparent hover:bg-gray-100 dark:hover:bg-white/5 opacity-60 hover:opacity-100'}`}>
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black text-white ${u.role === 'Partner' ? 'bg-gradient-to-br from-blue-500 to-indigo-600' : 'bg-gradient-to-br from-emerald-500 to-teal-600'}`}>{u.name.charAt(0)}</div>
                            <span className={`text-xs font-bold ${filterUser === u.id ? 'text-gray-900 dark:text-white' : 'text-gray-500'}`}>{u.name}</span>
                        </button>
                    ))}
                </div>
            </div>

            <Tabs 
                activeTab={viewMode}
                onChange={setViewMode as any}
                tabs={[
                    { id: 'calendar', label: 'Calendar', icon: <span className="material-icons-outlined">calendar_month</span> },
                    { id: 'upcoming', label: 'Upcoming', icon: <span className="material-icons-outlined">upcoming</span> },
                    { id: 'history', label: 'History', icon: <span className="material-icons-outlined">history</span> }
                ]}
            />

            <div className="min-h-[37.5rem]">
                {viewMode === 'calendar' && (
                    <Card noPadding className="rounded-[2.5rem] overflow-hidden shadow-2xl border border-gray-200/50 dark:border-white/5 bg-white/40 dark:bg-gray-900/40 backdrop-blur-3xl">
                        <div className="px-8 py-6 border-b border-white/20 dark:border-white/5 flex flex-col xl:flex-row justify-between items-center gap-6 bg-white/40 dark:bg-white/5 backdrop-blur-2xl sticky top-0 z-30 transition-all">
                            <div className="flex flex-col sm:flex-row items-center gap-6 w-full xl:w-auto">
                                <div className="flex items-center bg-white/80 dark:bg-black/40 rounded-full p-1 border border-gray-200/50 dark:border-white/10 shadow-sm backdrop-blur-md">
                                    <button onClick={() => handleNavigate(-1)} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 dark:text-gray-400 transition-all active:scale-90"><span className="material-icons-outlined text-sm">chevron_left</span></button>
                                    <button onClick={() => setViewDate(new Date())} className="px-5 text-[10px] font-black uppercase tracking-widest text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Today</button>
                                    <button onClick={() => handleNavigate(1)} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 dark:text-gray-400 transition-all active:scale-90"><span className="material-icons-outlined text-sm">chevron_right</span></button>
                                </div>
                                <div className="flex items-baseline gap-3">
                                    <h2 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 tracking-tight drop-shadow-sm min-w-[100px] text-center sm:text-left">{getCalendarTitle() || <span className="opacity-50">Overview</span>}</h2>
                                    <div className="relative group"><select value={activeYear} onChange={(e) => { const newDate = new Date(viewDate); newDate.setFullYear(parseInt(e.target.value)); setViewDate(newDate); }} className="appearance-none bg-transparent text-4xl font-black text-gray-200 dark:text-gray-700 hover:text-blue-500 dark:hover:text-blue-500 cursor-pointer outline-none pr-0 transition-colors">{yearRange.map(y => <option key={y} value={y}>{y}</option>)}</select></div>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 w-full xl:w-auto justify-center xl:justify-end">
                                <div className="flex bg-gray-100/50 dark:bg-black/20 rounded-2xl p-1.5 border border-white/20 dark:border-white/5 backdrop-blur-md">{['month', 'year'].map((v) => (<button key={v} onClick={() => setCalendarView(v as any)} className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${calendarView === v ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-lg shadow-blue-500/10 scale-105 ring-1 ring-black/5 dark:ring-white/10' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-white/50 dark:hover:bg-white/5'}`}>{v}</button>))}</div>
                            </div>
                        </div>
                        <div className="p-6 bg-white/60 dark:bg-gray-900/60 min-h-[37.5rem] backdrop-blur-md">
                            {calendarView === 'month' && renderMonthView()}
                            {calendarView === 'year' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">{Array.from({ length: 12 }).map((_, i) => { const monthDate = new Date(activeYear, i, 1); const daysInMonth = new Date(activeYear, i + 1, 0).getDate(); const startDay = monthDate.getDay() === 0 ? 6 : monthDate.getDay() - 1; return (<div key={i} className="bg-gray-50/50 dark:bg-white/5 rounded-2xl p-4 border border-gray-100 dark:border-white/5 hover:border-blue-200 dark:hover:border-blue-800 transition-colors"><h4 className="text-sm font-black text-gray-900 dark:text-white mb-3 uppercase tracking-widest cursor-pointer hover:text-blue-500 transition-colors" onClick={() => { const newDate = new Date(viewDate); newDate.setMonth(i); setViewDate(newDate); setCalendarView('month'); }}>{monthDate.toLocaleString('default', { month: 'long' })}</h4><div className="grid grid-cols-7 gap-1">{Array.from({ length: startDay }).map((_, k) => <div key={k} />)}{Array.from({ length: daysInMonth }).map((_, d) => renderDayCell(new Date(activeYear, i, d + 1), 'h-8', false, 'compact'))}</div></div>); })}</div>
                            )}
                        </div>
                    </Card>
                )}

                {viewMode === 'upcoming' && (
                    <div className="space-y-8 animate-fade-in">
                        {upcomingTrips.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-center opacity-40"><div className="w-24 h-24 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-6"><span className="material-icons-outlined text-4xl text-gray-400">flight_takeoff</span></div><h3 className="text-xl font-black text-gray-900 dark:text-white">No Upcoming Expeditions</h3><p className="text-sm font-bold text-gray-400 uppercase tracking-widest mt-2">Time to plan your next adventure</p></div>
                        ) : (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">{upcomingTrips.map(trip => renderTripCard(trip))}</div>
                        )}
                    </div>
                )}

                {viewMode === 'history' && (
                    <div className="space-y-12 animate-fade-in relative">
                        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-800 hidden md:block" />
                        {years.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-center opacity-40"><span className="material-icons-outlined text-4xl text-gray-400 mb-4">history_edu</span><h3 className="text-xl font-black text-gray-900 dark:text-white">Archive Empty</h3></div>
                        ) : (
                            years.map(year => { const isCollapsed = collapsedYears.has(year); return (<div key={year} className="relative md:pl-12"><button onClick={() => toggleYearCollapse(year)} className="absolute left-0 top-0 w-8 h-8 rounded-full bg-white dark:bg-gray-900 border-4 border-gray-100 dark:border-gray-800 text-gray-400 hover:text-blue-500 hover:border-blue-100 dark:hover:border-blue-900 transition-all flex items-center justify-center z-10 hidden md:flex active:scale-95" title={isCollapsed ? "Expand Year" : "Collapse Year"}><span className="material-icons-outlined text-sm transform transition-transform duration-300" style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>expand_more</span></button><div className="flex items-center gap-4 mb-6 cursor-pointer group select-none" onClick={() => toggleYearCollapse(year)}><h3 className="text-2xl font-black text-gray-900 dark:text-white opacity-40 group-hover:opacity-100 transition-opacity">{year}</h3><div className="h-px bg-gray-100 dark:bg-white/5 flex-1" /></div><div className={`grid grid-cols-1 lg:grid-cols-2 gap-6 transition-all duration-500 ease-in-out origin-top ${isCollapsed ? 'opacity-0 scale-y-0 h-0 overflow-hidden' : 'opacity-100 scale-y-100 h-auto'}`}>{pastTripsByYear[year].map(trip => renderTripCard(trip))}</div></div>) })
                        )}
                    </div>
                )}
            </div>

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
