
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Modal, Button, Select, Input, Autocomplete } from './ui';
import { Trip, User, EntitlementType, WorkspaceSettings, PublicHoliday, TripAllocation } from '../types';
import { searchLocations } from '../services/geocoding';

interface LeaveRequestModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (tripData: Trip) => Promise<void>;
    onDelete?: (tripId: string) => Promise<void>;
    initialData?: Partial<Trip>;
    users: User[];
    entitlements: EntitlementType[];
    trips: Trip[]; 
    holidays: PublicHoliday[]; 
    workspaceConfig: WorkspaceSettings | null;
}

interface CrossYearConfig {
    year1: number;
    days1: number;
    entitlement1: string;
    year2: number;
    days2: number;
    entitlement2: string;
}

interface RequestFormState {
    id?: string;
    userId: string;
    entitlementId: string;
    reason: string;
    location: string;
    startDate: string;
    endDate: string;
    mode: 'all_full' | 'all_am' | 'all_pm' | 'single_am' | 'single_pm' | 'custom';
    startPortion: 'full' | 'pm'; 
    endPortion: 'full' | 'am';
    icon: string;
    allocations: TripAllocation[]; 
    useMultiCategory: boolean;
    crossYearMode: boolean;
    crossYearConfig?: CrossYearConfig;
    isTravel: boolean;
}

interface DayBreakdown {
    date: string; 
    year: number;
    weight: number; 
    isWeekend: boolean;
    isHoliday: boolean;
    holidayName?: string;
    dayName: string; 
    dayNumber: number;
}

const EMOJI_PRESETS = ['✈️', '🚗', '🏖️', '🤒', '🏠', '🎉', '🎿', '🏕️', '🧘', '🏥'];
const NO_IMPACT_KEY = 'NO_IMPACT_EVENT';

const CATEGORY_ORDER = [
    "Smileys & Emotion",
    "People & Body",
    "Animals & Nature",
    "Food & Drink",
    "Travel & Places",
    "Activities",
    "Objects",
    "Symbols",
    "Flags"
];

export const LeaveRequestModal: React.FC<LeaveRequestModalProps> = ({
    isOpen, onClose, onSubmit, onDelete, initialData, users, entitlements, trips, holidays, workspaceConfig
}) => {
    const [submitting, setSubmitting] = useState(false);
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    
    // Emoji Picker State
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [emojiSearch, setEmojiSearch] = useState('');
    const [allEmojis, setAllEmojis] = useState<any[]>([]);
    const [groupedEmojis, setGroupedEmojis] = useState<Record<string, any[]>>({});
    const [filteredEmojis, setFilteredEmojis] = useState<any[]>([]);
    const [isLoadingEmojis, setIsLoadingEmojis] = useState(false);
    
    // Refs for Portal Positioning
    const emojiPickerButtonRef = useRef<HTMLButtonElement>(null);
    const emojiPickerMenuRef = useRef<HTMLDivElement>(null);
    const [pickerPosition, setPickerPosition] = useState<{top: number, left: number} | null>(null);

    const [requestForm, setRequestForm] = useState<RequestFormState>({
        userId: '', entitlementId: '', reason: '', location: '', startDate: '', endDate: '', mode: 'all_full',
        startPortion: 'full', endPortion: 'full', icon: '✈️', allocations: [], useMultiCategory: false,
        crossYearMode: false, isTravel: false
    });

    const [excludedDates, setExcludedDates] = useState<Set<string>>(new Set());
    const [dailyBreakdown, setDailyBreakdown] = useState<DayBreakdown[]>([]);
    const [totalDeduction, setTotalDeduction] = useState<number>(0);

    // Reset or Load Data
    useEffect(() => {
        if (isOpen) {
            setIsDeleteConfirmOpen(false);
            setShowEmojiPicker(false);
            
            if (initialData) {
                const cleanReason = initialData.name?.includes(':') ? initialData.name.substring(initialData.name.indexOf(':') + 1).trim() : (initialData.name || '');
                const initialAllocations = initialData.allocations ? [...initialData.allocations] : [];
                setExcludedDates(new Set(initialData.excludedDates || []));

                const hasYearTargets = initialAllocations.some(a => a.targetYear !== undefined);
                let crossYearData = undefined;
                if (hasYearTargets && initialAllocations.length === 2) {
                    crossYearData = {
                        year1: initialAllocations[0].targetYear!,
                        days1: initialAllocations[0].days,
                        entitlement1: initialAllocations[0].entitlementId,
                        year2: initialAllocations[1].targetYear!,
                        days2: initialAllocations[1].days,
                        entitlement2: initialAllocations[1].entitlementId
                    };
                }

                // Determine if this is a "Trip" (Has location)
                const isTravelTrip = !!initialData.location && initialData.location !== 'Time Off' && initialData.location !== 'Remote';

                setRequestForm({
                    id: initialData.id,
                    userId: initialData.participants?.[0] || users[0]?.id || '',
                    entitlementId: initialData.entitlementId || NO_IMPACT_KEY,
                    reason: cleanReason,
                    location: initialData.location || '',
                    startDate: initialData.startDate || new Date().toISOString().split('T')[0],
                    endDate: initialData.endDate || new Date().toISOString().split('T')[0],
                    mode: initialData.durationMode || 'all_full',
                    startPortion: initialData.startPortion || 'full',
                    endPortion: initialData.endPortion || 'full',
                    icon: initialData.icon || '✈️',
                    useMultiCategory: initialAllocations.length > 0 && !hasYearTargets, 
                    allocations: initialAllocations,
                    crossYearMode: hasYearTargets,
                    crossYearConfig: crossYearData,
                    isTravel: isTravelTrip
                });
            } else {
                setExcludedDates(new Set());
                const defaultUser = users[0];
                const defaultEnts = defaultUser ? getUserEntitlements(defaultUser.id) : [];
                setRequestForm({
                    id: undefined,
                    userId: defaultUser?.id || '',
                    entitlementId: defaultEnts[0]?.id || entitlements[0]?.id || NO_IMPACT_KEY,
                    reason: '',
                    location: '',
                    startDate: new Date().toISOString().split('T')[0],
                    endDate: '',
                    mode: 'all_full',
                    startPortion: 'full',
                    endPortion: 'full',
                    icon: '✈️',
                    allocations: [],
                    useMultiCategory: false,
                    crossYearMode: false,
                    isTravel: false
                });
            }
        }
    }, [isOpen, initialData, users]);

    useEffect(() => {
        const isSingle = requestForm.startDate && requestForm.endDate && requestForm.startDate === requestForm.endDate;
        if (!isSingle && (requestForm.mode === 'single_am' || requestForm.mode === 'single_pm')) {
             setRequestForm(prev => ({ ...prev, mode: 'all_full' }));
        }

        if (requestForm.startDate && requestForm.endDate) {
            const startYear = parseInt(requestForm.startDate.split('-')[0]);
            const endYear = parseInt(requestForm.endDate.split('-')[0]);
            
            if (startYear !== endYear && startYear < endYear) {
                const currentY1 = requestForm.crossYearConfig?.year1;
                const currentY2 = requestForm.crossYearConfig?.year2;
                
                if (!requestForm.crossYearMode || currentY1 !== startYear || currentY2 !== endYear) {
                    setRequestForm(prev => {
                        const defaultEnt = prev.entitlementId !== NO_IMPACT_KEY ? prev.entitlementId : (getUserEntitlements(prev.userId)[0]?.id || NO_IMPACT_KEY);
                        return {
                            ...prev,
                            crossYearMode: true,
                            useMultiCategory: false, 
                            crossYearConfig: {
                                year1: startYear,
                                days1: 0,
                                entitlement1: prev.crossYearConfig?.entitlement1 || defaultEnt,
                                year2: endYear,
                                days2: 0,
                                entitlement2: prev.crossYearConfig?.entitlement2 || defaultEnt
                            }
                        }
                    });
                }
            } else {
                if (requestForm.crossYearMode) {
                    setRequestForm(prev => ({ ...prev, crossYearMode: false, crossYearConfig: undefined }));
                }
            }
        }
    }, [requestForm.startDate, requestForm.endDate, requestForm.mode, requestForm.startPortion, requestForm.endPortion]);

    useEffect(() => {
        if (!requestForm.startDate || !workspaceConfig || !requestForm.userId) return;

        const effectiveEndDate = requestForm.endDate || requestForm.startDate;
        const holidayDates = getUserEffectiveHolidaysMap(requestForm.userId);
        
        const parseDate = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
        const start = parseDate(requestForm.startDate);
        const end = parseDate(effectiveEndDate);
        
        if (end.getTime() < start.getTime()) return;

        const breakdown: DayBreakdown[] = [];
        const current = new Date(start);

        while (current <= end) {
            const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
            const dayOfWeek = current.getDay();
            const year = current.getFullYear();
            const isWeekend = !workspaceConfig.workingDays.includes(dayOfWeek);
            const holidayName = holidayDates.get(dateStr);
            const isHoliday = !!holidayName;

            let weight = 1;
            if (requestForm.mode === 'all_am' || requestForm.mode === 'all_pm' || requestForm.mode === 'single_am' || requestForm.mode === 'single_pm') {
                weight = 0.5;
            } else if (requestForm.mode === 'custom') {
                const isStart = current.getTime() === start.getTime();
                const isEnd = current.getTime() === end.getTime();
                if (isStart && isEnd) {
                    if (requestForm.startPortion === 'pm' || requestForm.endPortion === 'am') weight = 0.5;
                } else {
                    if (isStart && requestForm.startPortion === 'pm') weight = 0.5;
                    else if (isEnd && requestForm.endPortion === 'am') weight = 0.5;
                }
            }

            breakdown.push({
                date: dateStr,
                year,
                weight,
                isWeekend,
                isHoliday,
                holidayName,
                dayName: current.toLocaleDateString('en-US', { weekday: 'short' }),
                dayNumber: current.getDate()
            });

            current.setDate(current.getDate() + 1);
        }

        setDailyBreakdown(breakdown);
    }, [
        requestForm.startDate, requestForm.endDate, requestForm.mode, 
        requestForm.startPortion, requestForm.endPortion, requestForm.userId, 
        workspaceConfig, holidays
    ]);

    useEffect(() => {
        recalculateTotals(dailyBreakdown, excludedDates);
    }, [dailyBreakdown, excludedDates, requestForm.crossYearConfig?.year1, requestForm.crossYearConfig?.year2, requestForm.crossYearMode]);

    const recalculateTotals = (breakdown: DayBreakdown[], exclusions: Set<string>) => {
        let total = 0;
        let y1Total = 0;
        let y2Total = 0;

        breakdown.forEach(day => {
            const isNaturallyOff = day.isWeekend || day.isHoliday;
            const isException = exclusions.has(day.date);
            const isActive = isNaturallyOff ? isException : !isException;

            if (isActive) {
                total += day.weight;
                if (requestForm.crossYearConfig) {
                    if (day.year === requestForm.crossYearConfig.year1) y1Total += day.weight;
                    if (day.year === requestForm.crossYearConfig.year2) y2Total += day.weight;
                }
            }
        });

        setTotalDeduction(total);

        if (requestForm.crossYearConfig) {
            if (requestForm.crossYearConfig.days1 !== y1Total || requestForm.crossYearConfig.days2 !== y2Total) {
                setRequestForm(prev => ({
                    ...prev,
                    crossYearConfig: {
                        ...prev.crossYearConfig!,
                        days1: y1Total,
                        days2: y2Total
                    }
                }));
            }
        } 
    };

    const toggleDate = (dateStr: string) => {
        const newSet = new Set(excludedDates);
        if (newSet.has(dateStr)) {
            newSet.delete(dateStr);
        } else {
            newSet.add(dateStr);
        }
        setExcludedDates(newSet);
    };

    const getUserEntitlements = (userId: string) => {
        const user = users.find(u => u.id === userId);
        return user ? entitlements.filter(ent => user.policies?.some(p => p.entitlementId === ent.id)) : [];
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

    const getUserEffectiveHolidaysMap = (userId: string) => {
        const user = users.find(u => u.id === userId);
        const holidayMap = new Map<string, string>();
        if (!user || !user.holidayConfigIds) return holidayMap;
        holidays.forEach(h => {
            if (h.isIncluded && user.holidayConfigIds?.includes(h.configId || '')) {
                holidayMap.set(h.date, h.name);
                if (user.holidayWeekendRule === 'monday') {
                    const d = new Date(h.date);
                    if (d.getDay() === 0 || d.getDay() === 6) {
                        holidayMap.set(getNextMonday(h.date), h.name + ' (Observed)');
                    }
                }
            }
        });
        return holidayMap;
    };

    // --- Emoji Logic ---
    useEffect(() => {
        if (showEmojiPicker && allEmojis.length === 0) {
            setIsLoadingEmojis(true);
            fetch('https://unpkg.com/emoji.json@12.1.0/emoji.json')
                .then(res => res.json())
                .then(data => {
                    setAllEmojis(data);
                    const groups: Record<string, any[]> = {};
                    data.forEach((e: any) => {
                         const rawCat = e.category || e.group || 'Other';
                         const mainCat = rawCat.split('(')[0].trim();
                         if (!groups[mainCat]) groups[mainCat] = [];
                         groups[mainCat].push(e);
                    });
                    setGroupedEmojis(groups);
                    setFilteredEmojis(data.slice(0, 100)); 
                    setIsLoadingEmojis(false);
                })
                .catch(err => {
                    console.error("Failed to fetch emojis", err);
                    setIsLoadingEmojis(false);
                });
        }
    }, [showEmojiPicker]);

    // Position Calculation for Portal
    useEffect(() => {
        if (showEmojiPicker && emojiPickerButtonRef.current) {
            const rect = emojiPickerButtonRef.current.getBoundingClientRect();
            // Align Bottom-Right relative to button
            let top = rect.bottom + 5;
            let left = rect.right - 320; // 320px width
            
            // Check Flip
            if (top + 320 > window.innerHeight) {
                 top = rect.top - 320 - 5; // Go up
            }

            // Check Horizontal
            if (left < 10) left = 10;

            setPickerPosition({ top, left });
        }
    }, [showEmojiPicker]);

    useEffect(() => {
        if (!emojiSearch) {
            setFilteredEmojis(allEmojis.slice(0, 100));
        } else {
            const query = emojiSearch.toLowerCase();
            const results = allEmojis.filter(e => e.name.toLowerCase().includes(query)).slice(0, 100);
            setFilteredEmojis(results);
        }
    }, [emojiSearch, allEmojis]);

    // Update Click Outside to support Portal
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (
                emojiPickerButtonRef.current && 
                !emojiPickerButtonRef.current.contains(event.target as Node) &&
                emojiPickerMenuRef.current &&
                !emojiPickerMenuRef.current.contains(event.target as Node)
            ) {
                setShowEmojiPicker(false);
            }
        }
        if (showEmojiPicker) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [showEmojiPicker]);

    const calculateTripDuration = (t: Trip, year: number) => {
        if (!workspaceConfig || !t.participants[0]) return 0;
        
        const holidayMap = getUserEffectiveHolidaysMap(t.participants[0]);
        const parseDate = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
        const start = parseDate(t.startDate);
        const end = parseDate(t.endDate);
        
        let days = 0;
        const current = new Date(start);
        
        while (current <= end) {
            if (current.getFullYear() === year) {
                const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
                const day = current.getDay();
                const isWeekend = !workspaceConfig.workingDays.includes(day);
                const isHoliday = holidayMap.has(dateStr);
                
                if (!isWeekend && !isHoliday) {
                    let weight = 1;
                    if (t.durationMode?.includes('am') || t.durationMode?.includes('pm')) weight = 0.5;
                    else if (t.durationMode === 'custom') {
                         const isStart = current.getTime() === start.getTime();
                         const isEnd = current.getTime() === end.getTime();
                         if (isStart && isEnd) {
                             if (t.startPortion === 'pm' || t.endPortion === 'am') weight = 0.5;
                         } else {
                             if (isStart && t.startPortion === 'pm') weight = 0.5;
                             else if (isEnd && t.endPortion === 'am') weight = 0.5;
                         }
                    }
                    days += weight;
                }
            }
            current.setDate(current.getDate() + 1);
        }
        return days;
    };

    const getBaseAllowance = (userId: string, entitlementId: string, year: number) => {
        if (entitlementId === NO_IMPACT_KEY) return Infinity; 

        const user = users.find(u => u.id === userId);
        const ent = entitlements.find(e => e.id === entitlementId);
        if (!user || !ent) return 0;
        
        if (ent.id === 'e2' || ent.category === 'Lieu') {
            let total = (user.lieuBalance || 0);
            if (user.holidayWeekendRule === 'lieu') {
                 const relevantHolidays = holidays.filter(h => 
                     user.holidayConfigIds?.includes(h.configId || '') && 
                     h.isIncluded &&
                     new Date(h.date).getFullYear() === year
                 );
                 const earned = relevantHolidays.filter(h => {
                     if (h.isWeekend !== undefined) return h.isWeekend;
                     const d = new Date(h.date);
                     return d.getDay() === 0 || d.getDay() === 6;
                 }).length;
                 total += earned;
            }
            return total;
        }

        const policy = user.policies?.find(p => p.entitlementId === ent.id && p.year === year);
        
        if (policy && policy.isActive) {
             if (policy.isUnlimited) return Infinity;
             return policy.accrual.amount;
        }
        
        if (ent.isUnlimited) return Infinity;
        return 0;
    };

    const getUsedBalanceByYear = (userId: string, entitlementId: string, year: number) => {
        if (entitlementId === NO_IMPACT_KEY) return 0; 

        const userTrips = trips.filter(t => t.participants.includes(userId) && (t.status === 'Upcoming' || t.status === 'Past'));
        let used = 0;
        userTrips.forEach(t => {
             if (t.id === requestForm.id) return;
             
             if (t.allocations?.length) {
                 const strictAlloc = t.allocations.find(a => a.entitlementId === entitlementId && a.targetYear === year);
                 if (strictAlloc) {
                     used += strictAlloc.days;
                 } else {
                     const alloc = t.allocations.find(a => a.entitlementId === entitlementId && !a.targetYear);
                     if (alloc) {
                        const totalDur = calculateTripDuration(t, year); 
                        const startYear = new Date(t.startDate).getFullYear();
                        const endYear = new Date(t.endDate).getFullYear();
                        let fullTripDur = calculateTripDuration(t, startYear);
                        if (endYear !== startYear) {
                            fullTripDur += calculateTripDuration(t, endYear);
                        }
                        
                        if (fullTripDur > 0) {
                            used += alloc.days * (totalDur / fullTripDur); 
                        }
                     }
                 }
             } else if (t.entitlementId === entitlementId) {
                 used += calculateTripDuration(t, year);
             }
        });
        return used;
    };

    const getTotalAllowance = (userId: string, entId: string, year: number, depth = 0): number => {
        if (depth > 5) return 0;
        
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

    const getBalanceForEntitlement = (entId: string, targetYearOverride?: number): number => {
        if (entId === NO_IMPACT_KEY) return Infinity; 
        
        let year = targetYearOverride;
        if (!year) {
            if (requestForm.startDate) {
                year = parseInt(requestForm.startDate.split('-')[0]);
            } else {
                year = new Date().getFullYear();
            }
        }

        const total = getTotalAllowance(requestForm.userId, entId, year);
        if (total === Infinity) return Infinity;
        
        const used = getUsedBalanceByYear(requestForm.userId, entId, year);
        
        return Math.max(0, total - used);
    };

    const handleFormSubmit = async () => {
        if (!requestForm.userId || !requestForm.reason || !requestForm.startDate) return;
        setSubmitting(true);
        let primaryEntId = requestForm.entitlementId;
        if (requestForm.useMultiCategory && requestForm.allocations.length > 0) primaryEntId = requestForm.allocations[0].entitlementId;
        if (requestForm.crossYearMode && requestForm.crossYearConfig) primaryEntId = requestForm.crossYearConfig.entitlement1;
        
        const finalEndDate = requestForm.endDate || requestForm.startDate;

        let finalAllocations: TripAllocation[] | undefined = undefined;
        
        if (requestForm.crossYearMode && requestForm.crossYearConfig) {
            finalAllocations = [
                { 
                    entitlementId: requestForm.crossYearConfig.entitlement1, 
                    days: requestForm.crossYearConfig.days1,
                    targetYear: requestForm.crossYearConfig.year1 
                },
                { 
                    entitlementId: requestForm.crossYearConfig.entitlement2, 
                    days: requestForm.crossYearConfig.days2,
                    targetYear: requestForm.crossYearConfig.year2 
                }
            ];
        } else if (requestForm.useMultiCategory) {
            finalAllocations = requestForm.allocations;
        } else if (totalDeduction !== 0 && primaryEntId !== NO_IMPACT_KEY) {
            finalAllocations = [{ entitlementId: primaryEntId, days: totalDeduction }];
        }

        const tripData: Trip = {
            id: requestForm.id || Math.random().toString(36).substr(2, 9),
            name: requestForm.reason,
            startDate: requestForm.startDate,
            endDate: finalEndDate,
            location: requestForm.isTravel ? requestForm.location : 'Time Off',
            status: 'Upcoming',
            participants: [requestForm.userId],
            icon: requestForm.icon,
            durationMode: requestForm.mode,
            startPortion: requestForm.startPortion,
            endPortion: requestForm.endPortion,
            entitlementId: primaryEntId === NO_IMPACT_KEY ? undefined : primaryEntId,
            allocations: finalAllocations,
            excludedDates: Array.from(excludedDates)
        };
        await onSubmit(tripData);
        setSubmitting(false);
        onClose();
    };

    const handleDelete = async () => {
        if (!requestForm.id || !onDelete) return;
        setSubmitting(true);
        await onDelete(requestForm.id);
        setSubmitting(false);
        setIsDeleteConfirmOpen(false);
        onClose();
    };
    
    const currentRemainingBalance = getBalanceForEntitlement(requestForm.entitlementId);
    let exceedsBalance = false;
    
    if (requestForm.crossYearMode && requestForm.crossYearConfig) {
        const bal1 = getBalanceForEntitlement(requestForm.crossYearConfig.entitlement1, requestForm.crossYearConfig.year1);
        const bal2 = getBalanceForEntitlement(requestForm.crossYearConfig.entitlement2, requestForm.crossYearConfig.year2);
        
        if (requestForm.crossYearConfig.entitlement1 === requestForm.crossYearConfig.entitlement2 && bal1 !== Infinity) {
             if (requestForm.crossYearConfig.days1 > bal1 || requestForm.crossYearConfig.days2 > bal2) exceedsBalance = true;
        } else {
             if (bal1 !== Infinity && requestForm.crossYearConfig.days1 > bal1) exceedsBalance = true;
             if (bal2 !== Infinity && requestForm.crossYearConfig.days2 > bal2) exceedsBalance = true;
        }
    } else {
        exceedsBalance = requestForm.entitlementId !== NO_IMPACT_KEY && 
                           currentRemainingBalance !== Infinity && 
                           !requestForm.useMultiCategory && 
                           totalDeduction > currentRemainingBalance;
    }
    
    const isSingleDay = requestForm.startDate && (!requestForm.endDate || requestForm.startDate === requestForm.endDate);
    const isDateInvalid = requestForm.startDate && requestForm.endDate && new Date(requestForm.endDate) < new Date(requestForm.startDate);

    const totalAllocated = requestForm.useMultiCategory 
      ? requestForm.allocations.reduce((sum, a) => sum + Number(a.days), 0)
      : 0;
    
    const handleAddAllocation = () => {
        const userEnts = getUserEntitlements(requestForm.userId);
        const usedIds = requestForm.allocations.map(a => a.entitlementId);
        const nextEnt = userEnts.find(e => !usedIds.includes(e.id)) || userEnts[0];
        setRequestForm({
            ...requestForm,
            allocations: [...requestForm.allocations, { entitlementId: nextEnt?.id || '', days: 0 }]
        });
    };

    const handleUpdateAllocation = (index: number, field: keyof TripAllocation, value: any) => {
        const newAllocations = [...requestForm.allocations];
        newAllocations[index] = { ...newAllocations[index], [field]: value };
        setRequestForm({ ...requestForm, allocations: newAllocations });
    };

    const convertToSplitMode = () => {
        const availablePrimary = currentRemainingBalance;
        const remaining = Math.max(0, totalDeduction - availablePrimary);
        const userEnts = getUserEntitlements(requestForm.userId);
        const secondaryEnt = userEnts.find(e => e.id !== requestForm.entitlementId) || userEnts[0];
        setRequestForm({
            ...requestForm,
            useMultiCategory: true,
            allocations: [
                { entitlementId: requestForm.entitlementId, days: Math.max(0, availablePrimary) },
                { entitlementId: secondaryEnt?.id || requestForm.entitlementId, days: remaining }
            ]
        });
    };

    const fetchLocationSuggestions = async (query: string): Promise<string[]> => {
        return searchLocations(query);
    };

    const isInvalidAllocation = requestForm.useMultiCategory 
        ? Math.abs(totalAllocated - totalDeduction) > 0.1 
        : exceedsBalance;

    const leaveOptions = [
        ...getUserEntitlements(requestForm.userId).map(e => ({ label: e.name, value: e.id })),
        { label: '📅 General Event (No Impact)', value: NO_IMPACT_KEY }
    ];

    const suggestion = useMemo(() => {
        if (!requestForm.startDate || !requestForm.userId || requestForm.useMultiCategory || requestForm.crossYearMode) return null;
        
        const currentYear = parseInt(requestForm.startDate.split('-')[0]);
        const tripStart = new Date(requestForm.startDate);
        const user = users.find(u => u.id === requestForm.userId);
        if (!user) return null;

        // Check other entitlements
        const userEnts = getUserEntitlements(requestForm.userId);
        
        for (const ent of userEnts) {
            if (ent.id === requestForm.entitlementId) continue; // Skip current

            const prevYear = currentYear - 1;
            const prevPolicies = user.policies?.filter(p => p.year === prevYear && p.carryOver.enabled) || [];

            for (const prevP of prevPolicies) {
                const targetId = prevP.carryOver.targetEntitlementId || prevP.entitlementId;
                
                if (targetId === ent.id) {
                     const balance = getBalanceForEntitlement(ent.id, currentYear);
                     if (balance <= 0) continue;

                     let expiryDate: Date | null = null;
                     if (prevP.carryOver.expiryType === 'fixed_date' && prevP.carryOver.expiryValue) {
                         const [m, d] = (prevP.carryOver.expiryValue as string).split('-').map(Number);
                         expiryDate = new Date(currentYear, m - 1, d);
                     } else if (prevP.carryOver.expiryType === 'months' && prevP.carryOver.expiryValue) {
                         expiryDate = new Date(currentYear, 0, 1);
                         expiryDate.setMonth(expiryDate.getMonth() + (prevP.carryOver.expiryValue as number));
                     }

                     if (expiryDate && tripStart <= expiryDate) {
                         return {
                             entitlementId: ent.id,
                             name: ent.name,
                             expiryDate,
                             balance
                         };
                     }
                }
            }
        }
        return null;
    }, [requestForm.startDate, requestForm.userId, requestForm.entitlementId, requestForm.useMultiCategory, requestForm.crossYearMode, users, entitlements]);

    return (
        <>
            <Modal isOpen={isOpen} onClose={onClose} title={requestForm.id ? "Edit Request" : "New Leave Request"} maxWidth="max-w-4xl">
                {/* ... (Existing Modal JSX remains unchanged) ... */}
                <div className="flex flex-col h-full">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 flex-1">
                        
                        <div className="space-y-5">
                            <div className="grid grid-cols-2 gap-4">
                                <Select 
                                    label="For Who?" 
                                    options={users.map(u => ({ label: u.name, value: u.id }))} 
                                    value={requestForm.userId} 
                                    onChange={e => setRequestForm({...requestForm, userId: e.target.value, entitlementId: getUserEntitlements(e.target.value)[0]?.id || NO_IMPACT_KEY})} 
                                />
                                {!requestForm.useMultiCategory && !requestForm.crossYearMode ? (
                                    <div className="flex flex-col gap-1.5 w-full">
                                        <Select 
                                            label="Leave Type" 
                                            options={leaveOptions} 
                                            value={requestForm.entitlementId} 
                                            onChange={e => setRequestForm({...requestForm, entitlementId: e.target.value})} 
                                        />
                                        {suggestion && (
                                            <div className="flex items-center justify-between p-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 animate-fade-in">
                                                <div className="flex items-center gap-2 text-xs font-medium text-amber-800 dark:text-amber-300">
                                                    <span className="material-icons-outlined text-sm">lightbulb</span>
                                                    <span>
                                                        <strong>{Math.floor(suggestion.balance)}d</strong> in {suggestion.name} expire soon!
                                                    </span>
                                                </div>
                                                <button 
                                                    onClick={() => setRequestForm({...requestForm, entitlementId: suggestion.entitlementId})}
                                                    className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide bg-white dark:bg-black/20 text-amber-700 dark:text-amber-400 rounded-lg shadow-sm hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
                                                >
                                                    Switch
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex flex-col justify-end">
                                        <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide ml-1 mb-1.5">Allocation Mode</label>
                                        <div className="text-xs font-black text-blue-600 bg-blue-50 dark:bg-blue-900/20 px-3 py-3 rounded-2xl border border-blue-200 dark:border-blue-900/50 flex justify-between items-center">
                                            <span>{requestForm.crossYearMode ? 'Split Year' : 'Split Category'}</span>
                                            {!requestForm.crossYearMode && (
                                                <button onClick={() => setRequestForm({...requestForm, useMultiCategory: false, allocations: []})} className="text-[10px] uppercase underline hover:text-blue-800">Reset</button>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* ... Cross Year & Allocations Logic ... */}
                            {requestForm.crossYearMode && requestForm.crossYearConfig && (
                                <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-3xl space-y-3 border border-indigo-100 dark:border-indigo-900/30 animate-fade-in">
                                    <div className="flex items-center gap-2 mb-2 text-indigo-700 dark:text-indigo-300">
                                        <span className="material-icons-outlined text-sm">date_range</span>
                                        <span className="text-[10px] font-black uppercase tracking-widest">Cross-Year Booking Detected</span>
                                    </div>
                                    <div className="flex gap-2 items-center">
                                        <div className="flex-1">
                                            <label className="text-[10px] font-bold text-gray-500 uppercase ml-1 mb-1 block">{requestForm.crossYearConfig.year1} Allocation</label>
                                            <Select className="!mb-0 !bg-white" options={leaveOptions} value={requestForm.crossYearConfig.entitlement1} onChange={e => setRequestForm({...requestForm, crossYearConfig: { ...requestForm.crossYearConfig!, entitlement1: e.target.value }})} />
                                            <div className="text-[9px] text-gray-400 mt-1 pl-1 font-medium">Remaining: {getBalanceForEntitlement(requestForm.crossYearConfig.entitlement1, requestForm.crossYearConfig.year1) === Infinity ? '∞' : getBalanceForEntitlement(requestForm.crossYearConfig.entitlement1, requestForm.crossYearConfig.year1).toFixed(1)}</div>
                                        </div>
                                        <div className="w-16 self-start mt-5"><div className="px-3 py-3 bg-white/50 border rounded-2xl text-center text-sm font-bold text-gray-700">{requestForm.crossYearConfig.days1}d</div></div>
                                    </div>
                                    <div className="flex gap-2 items-center">
                                        <div className="flex-1">
                                            <label className="text-[10px] font-bold text-gray-500 uppercase ml-1 mb-1 block">{requestForm.crossYearConfig.year2} Allocation</label>
                                            <Select className="!mb-0 !bg-white" options={leaveOptions} value={requestForm.crossYearConfig.entitlement2} onChange={e => setRequestForm({...requestForm, crossYearConfig: { ...requestForm.crossYearConfig!, entitlement2: e.target.value }})} />
                                            <div className="text-[9px] text-gray-400 mt-1 pl-1 font-medium">Remaining: {getBalanceForEntitlement(requestForm.crossYearConfig.entitlement2, requestForm.crossYearConfig.year2) === Infinity ? '∞' : getBalanceForEntitlement(requestForm.crossYearConfig.entitlement2, requestForm.crossYearConfig.year2).toFixed(1)}</div>
                                        </div>
                                        <div className="w-16 self-start mt-5"><div className="px-3 py-3 bg-white/50 border rounded-2xl text-center text-sm font-bold text-gray-700">{requestForm.crossYearConfig.days2}d</div></div>
                                    </div>
                                </div>
                            )}

                            {requestForm.useMultiCategory && !requestForm.crossYearMode && (
                                <div className="bg-gray-50 dark:bg-gray-800/30 p-4 rounded-3xl space-y-3 border border-gray-200 dark:border-gray-700 animate-fade-in">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Days Breakdown</span>
                                        <span className={`text-xs font-bold ${Math.abs(totalAllocated - totalDeduction) > 0.1 ? 'text-rose-500' : 'text-emerald-500'}`}>{totalAllocated} / {totalDeduction} Days</span>
                                    </div>
                                    {requestForm.allocations.map((alloc, idx) => {
                                        const balance = getBalanceForEntitlement(alloc.entitlementId);
                                        return (
                                            <div key={idx} className="flex gap-2 items-center">
                                                <div className="flex-1">
                                                    <Select className="!mb-0" options={getUserEntitlements(requestForm.userId).map(e => ({ label: e.name, value: e.id }))} value={alloc.entitlementId} onChange={e => handleUpdateAllocation(idx, 'entitlementId', e.target.value)} />
                                                    <div className="text-[9px] text-gray-400 mt-1 pl-1 font-medium">Available: <span className={balance < alloc.days ? 'text-rose-500 font-bold' : 'text-gray-600 dark:text-gray-300 font-bold'}>{balance === Infinity ? '∞' : balance.toFixed(2)}</span></div>
                                                </div>
                                                <div className="w-20 self-start"><Input type="number" className="!py-3 font-bold text-center" value={alloc.days} onChange={e => handleUpdateAllocation(idx, 'days', Number(e.target.value))} /></div>
                                                {requestForm.allocations.length > 1 && (<button onClick={() => { const newAlloc = requestForm.allocations.filter((_, i) => i !== idx); setRequestForm({...requestForm, allocations: newAlloc}); }} className="p-2 self-start mt-1 text-rose-400 hover:bg-rose-50 rounded-2xl transition-all"><span className="material-icons-outlined">close</span></button>)}
                                            </div>
                                        );
                                    })}
                                    <Button variant="ghost" size="sm" className="w-full mt-2 border-dashed border-2" onClick={handleAddAllocation} icon={<span className="material-icons-outlined">add</span>}>Add Category</Button>
                                </div>
                            )}

                            <Input label="Reason / Notes" value={requestForm.reason} onChange={e => setRequestForm({...requestForm, reason: e.target.value})} placeholder="e.g. Summer Vacation" />
                            
                            <div className="flex items-center gap-3">
                                <label className="flex items-center gap-2 cursor-pointer bg-gray-50 dark:bg-white/5 px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 h-[50px] mt-1.5">
                                    <span className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">Traveling?</span>
                                    <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${requestForm.isTravel ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
                                        <div className={`w-3 h-3 bg-white rounded-full shadow transform transition-transform ${requestForm.isTravel ? 'translate-x-4' : 'translate-x-0'}`} />
                                    </div>
                                    <input 
                                        type="checkbox" 
                                        className="hidden" 
                                        checked={requestForm.isTravel}
                                        onChange={e => setRequestForm({...requestForm, isTravel: e.target.checked})}
                                    />
                                </label>
                                
                                {requestForm.isTravel && (
                                    <div className="flex-1 animate-fade-in">
                                        <Autocomplete 
                                            label="Destination" 
                                            placeholder="e.g. Paris"
                                            value={requestForm.location}
                                            onChange={val => setRequestForm({...requestForm, location: val})}
                                            fetchSuggestions={fetchLocationSuggestions}
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <Input label="From" type="date" value={requestForm.startDate} onChange={e => { const newStart = e.target.value; setRequestForm(prev => { const shouldSync = prev.endDate === ''; return { ...prev, startDate: newStart, endDate: shouldSync ? newStart : prev.endDate }; }); }} />
                                <Input label="To" type="date" value={requestForm.endDate} min={requestForm.startDate} onChange={e => setRequestForm({...requestForm, endDate: e.target.value})} />
                            </div>
                        </div>

                        {/* RIGHT COLUMN */}
                        <div className="space-y-6">
                            <div className="py-0">
                                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide ml-1 mb-2 block">Duration & Timing</label>
                                {isSingleDay ? (
                                    <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl mb-4">
                                        {['all_full', 'single_am', 'single_pm'].map(m => {
                                            let label = m === 'single_am' ? 'AM' : m === 'single_pm' ? 'PM' : 'Full';
                                            return <button key={m} onClick={() => setRequestForm(prev => ({ ...prev, mode: m as any }))} className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase transition-all ${requestForm.mode === m ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}>{label}</button>
                                        })}
                                    </div>
                                ) : (
                                    <div className="space-y-3 mb-4">
                                        <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
                                            {[{ id: 'standard', label: 'Full Days' }, { id: 'all_am', label: 'AM Only' }, { id: 'all_pm', label: 'PM Only' }].map(opt => {
                                                const isActive = (opt.id === 'standard' && (requestForm.mode === 'all_full' || requestForm.mode === 'custom')) || requestForm.mode === opt.id;
                                                return <button key={opt.id} onClick={() => opt.id === 'standard' ? setRequestForm(prev => ({ ...prev, mode: 'all_full', startPortion: 'full', endPortion: 'full' })) : setRequestForm(prev => ({ ...prev, mode: opt.id as any }))} className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase transition-all ${isActive ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}>{opt.label}</button>
                                            })}
                                        </div>
                                        {(requestForm.mode === 'all_full' || requestForm.mode === 'custom') && (
                                            <div className="space-y-3 bg-gray-50 dark:bg-gray-800/50 p-4 rounded-2xl border border-gray-100 dark:border-white/5 animate-fade-in">
                                                <label className="flex items-center justify-between cursor-pointer group">
                                                    <div><span className="block text-sm font-bold text-gray-700 dark:text-gray-200">Start Half Day</span><span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Start PM</span></div>
                                                    <div className={`w-12 h-6 rounded-full p-1 transition-all ${requestForm.startPortion === 'pm' ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}`}><div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform ${requestForm.startPortion === 'pm' ? 'translate-x-6' : 'translate-x-0'}`} /></div>
                                                    <input type="checkbox" className="hidden" checked={requestForm.startPortion === 'pm'} onChange={e => setRequestForm(prev => ({ ...prev, mode: 'custom', startPortion: e.target.checked ? 'pm' : 'full' }))} />
                                                </label>
                                                <div className="h-px bg-gray-200 dark:bg-white/10" />
                                                <label className="flex items-center justify-between cursor-pointer group">
                                                    <div><span className="block text-sm font-bold text-gray-700 dark:text-gray-200">End Half Day</span><span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">End AM</span></div>
                                                    <div className={`w-12 h-6 rounded-full p-1 transition-all ${requestForm.endPortion === 'am' ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}`}><div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform ${requestForm.endPortion === 'am' ? 'translate-x-6' : 'translate-x-0'}`} /></div>
                                                    <input type="checkbox" className="hidden" checked={requestForm.endPortion === 'am'} onChange={e => setRequestForm(prev => ({ ...prev, mode: 'custom', endPortion: e.target.checked ? 'am' : 'full' }))} />
                                                </label>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Icon Picker */}
                                <div>
                                    <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide ml-1 mb-2 block">Icon Marker</label>
                                    <div className="grid grid-cols-6 gap-2">
                                        {EMOJI_PRESETS.slice(0, 5).map(emo => (
                                            <button key={emo} onClick={() => setRequestForm({...requestForm, icon: emo})} className={`aspect-square rounded-xl text-xl flex items-center justify-center transition-all ${requestForm.icon === emo ? 'bg-blue-600 text-white shadow-lg scale-110' : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-700'}`}>{emo}</button>
                                        ))}
                                        
                                        {/* Custom Picker Button */}
                                        <button
                                            ref={emojiPickerButtonRef}
                                            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                                            className={`w-full aspect-square rounded-xl flex items-center justify-center text-xl transition-all border-2 border-dashed
                                                ${showEmojiPicker ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600 dark:border-white/10 dark:text-gray-500 dark:hover:border-white/20'}
                                            `}
                                            title="Search Icons"
                                        >
                                            {showEmojiPicker ? <span className="material-icons-outlined">close</span> : <span className="material-icons-outlined">add_reaction</span>}
                                        </button>
                                        
                                        {/* Emoji Popover (Portal) */}
                                        {showEmojiPicker && pickerPosition && createPortal(
                                            <div 
                                                ref={emojiPickerMenuRef}
                                                className="fixed w-80 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-white/10 p-4 z-[9999] animate-fade-in origin-top-right"
                                                style={{ top: pickerPosition.top, left: pickerPosition.left }}
                                            >
                                                <div className="flex gap-2 mb-3">
                                                    <Input placeholder="Search..." autoFocus value={emojiSearch} onChange={e => setEmojiSearch(e.target.value)} className="!py-2 !text-xs !rounded-xl flex-1" />
                                                </div>
                                                <button onClick={() => { setRequestForm({...requestForm, icon: ''}); setShowEmojiPicker(false); }} className="w-full flex items-center justify-center gap-2 py-2 mb-3 bg-gray-50 dark:bg-white/5 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 text-xs font-bold text-gray-500 transition-colors"><span className="material-icons-outlined text-sm">block</span>No Icon</button>

                                                <div className="h-64 overflow-y-auto custom-scrollbar">
                                                    {isLoadingEmojis ? (
                                                        <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/></div>
                                                    ) : emojiSearch ? (
                                                        <div className="grid grid-cols-6 gap-1 content-start">
                                                            {filteredEmojis.map((e, i) => (
                                                                <button key={i} onClick={() => { setRequestForm({...requestForm, icon: e.char}); setShowEmojiPicker(false); }} className="aspect-square flex items-center justify-center text-xl hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors" title={e.name}>{e.char}</button>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div className="space-y-4">
                                                            {CATEGORY_ORDER.map(cat => {
                                                                const emojis = groupedEmojis[cat];
                                                                if (!emojis || emojis.length === 0) return null;
                                                                return (
                                                                    <div key={cat}>
                                                                        <h5 className="sticky top-0 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm py-1 mb-1 text-[10px] font-black text-gray-400 uppercase tracking-widest z-10 border-b border-gray-100 dark:border-white/5">{cat}</h5>
                                                                        <div className="grid grid-cols-6 gap-1 content-start">
                                                                            {emojis.map((e, i) => (
                                                                                <button key={`${cat}-${i}`} onClick={() => { setRequestForm({...requestForm, icon: e.char}); setShowEmojiPicker(false); }} className="aspect-square flex items-center justify-center text-xl hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors" title={e.name}>{e.char}</button>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                            {groupedEmojis['Other'] && (
                                                                <div>
                                                                    <h5 className="sticky top-0 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm py-1 mb-1 text-[10px] font-black text-gray-400 uppercase tracking-widest z-10 border-b border-gray-100 dark:border-white/5">Others</h5>
                                                                    <div className="grid grid-cols-6 gap-1 content-start">
                                                                        {groupedEmojis['Other'].map((e, i) => (
                                                                            <button key={`other-${i}`} onClick={() => { setRequestForm({...requestForm, icon: e.char}); setShowEmojiPicker(false); }} className="aspect-square flex items-center justify-center text-xl hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors" title={e.name}>{e.char}</button>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                    {!isLoadingEmojis && filteredEmojis.length === 0 && emojiSearch && <div className="text-center text-[10px] text-gray-400 py-6 uppercase font-bold tracking-wider">No matches</div>}
                                                </div>
                                            </div>,
                                            document.body
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Balance Feedback Section */}
                            <div className={`p-4 rounded-2xl border ${isInvalidAllocation || isDateInvalid ? 'bg-rose-50 border-rose-200 dark:bg-rose-900/10 dark:border-rose-900/30' : 'bg-blue-50/50 border-blue-100 dark:bg-blue-900/10 dark:border-blue-900/30'}`}>
                                <div className="flex justify-between items-end mb-4">
                                    <div className="space-y-1">
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Deduction Weight</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-3xl font-black text-blue-600 dark:text-blue-400">{totalDeduction}</span>
                                            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">days</span>
                                        </div>
                                    </div>
                                    <div className="text-right space-y-1">
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Reserve Available</span>
                                        <div className="text-sm font-bold text-gray-700 dark:text-gray-300">
                                            {requestForm.entitlementId === NO_IMPACT_KEY ? 'No Limit (Event)' : requestForm.useMultiCategory || requestForm.crossYearMode ? 'Split Mode' : (currentRemainingBalance === Infinity ? '∞' : Math.floor(currentRemainingBalance * 10) / 10) + ' Days'}
                                        </div>
                                    </div>
                                </div>

                                {dailyBreakdown.length > 0 && (
                                    <div className="grid grid-cols-7 gap-1 p-2 bg-white/60 dark:bg-black/20 rounded-xl border border-blue-100 dark:border-white/5">
                                        {dailyBreakdown.map((day) => {
                                            const isNaturallyOff = day.isWeekend || day.isHoliday;
                                            const isException = excludedDates.has(day.date);
                                            const isActive = isNaturallyOff ? isException : !isException;
                                            let bgClass = isActive ? 'bg-blue-500 text-white shadow-md' : isNaturallyOff ? 'bg-transparent text-gray-400 opacity-50 hover:bg-gray-100 dark:hover:bg-white/10' : 'bg-gray-200 text-gray-500 dark:bg-white/10 dark:text-gray-400';
                                            if (day.isHoliday && !isActive) bgClass = 'bg-amber-100 text-amber-600 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-900/30';

                                            return <button key={day.date} onClick={() => toggleDate(day.date)} className={`flex flex-col items-center justify-center p-1.5 rounded-lg text-xs transition-all ${bgClass}`} title={`${day.date} ${day.holidayName ? '- ' + day.holidayName : ''}`}><span className="text-[8px] font-black uppercase opacity-80">{day.dayName}</span><span className="font-bold">{day.dayNumber}</span></button>;
                                        })}
                                    </div>
                                )}
                                
                                {isDateInvalid && <div className="flex items-center gap-2 text-rose-600 mt-4 p-3 bg-white/60 dark:bg-black/20 rounded-2xl text-xs font-bold border border-rose-200/50 animate-pulse"><span className="material-icons-outlined text-sm">event_busy</span>End date cannot be earlier than start date.</div>}
                                {exceedsBalance && !requestForm.useMultiCategory && !requestForm.crossYearMode && !isDateInvalid && <div className="mt-4 p-3 bg-white/60 dark:bg-black/20 rounded-2xl border border-rose-200/50 flex flex-col gap-2"><div className="flex items-center gap-2 text-rose-600 text-xs font-bold"><span className="material-icons-outlined text-sm">warning</span>Insufficient allowance reserves.</div><Button size="sm" variant="secondary" className="w-full text-xs font-black uppercase tracking-widest" onClick={convertToSplitMode}>Split Allocation</Button></div>}
                                {exceedsBalance && requestForm.crossYearMode && <div className="mt-4 p-3 bg-rose-100/50 dark:bg-rose-900/20 rounded-2xl border border-rose-200/50 flex flex-col gap-2"><div className="flex items-center gap-2 text-rose-600 text-xs font-bold"><span className="material-icons-outlined text-sm">warning</span>One or more years exceed allowance.</div></div>}
                                {requestForm.useMultiCategory && Math.abs(totalAllocated - totalDeduction) > 0.1 && <div className="flex items-center gap-2 text-rose-600 mt-4 p-3 bg-rose-100/50 rounded-2xl text-xs font-bold border border-rose-200"><span className="material-icons-outlined text-sm">error</span>Allocation sum must equal deduction weight ({totalDeduction}).</div>}
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-between pt-2 mt-4 border-t border-gray-100 dark:border-white/5">
                        {requestForm.id && onDelete && <Button variant="danger" onClick={() => setIsDeleteConfirmOpen(true)}>Delete</Button>}
                        <div className="flex gap-3 ml-auto w-full md:w-auto">
                            <Button variant="ghost" onClick={onClose} className="flex-1 md:flex-initial">Cancel</Button>
                            <Button variant="primary" onClick={handleFormSubmit} disabled={submitting || isInvalidAllocation || !!isDateInvalid || exceedsBalance} className="flex-1 md:flex-initial">{submitting ? 'Saving...' : 'Save Request'}</Button>
                        </div>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={isDeleteConfirmOpen} onClose={() => setIsDeleteConfirmOpen(false)} title="Confirm Deletion">
                <div className="text-center space-y-6">
                    <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center mx-auto text-rose-600"><span className="material-icons-outlined text-4xl">delete_forever</span></div>
                    <div className="space-y-2"><h4 className="text-xl font-bold text-gray-900 dark:text-white">Remove Time Off?</h4><p className="text-sm text-gray-500 dark:text-gray-400">This action cannot be undone. All balance adjustments related to this entry will be restored.</p></div>
                    <div className="flex gap-3 pt-2"><Button variant="ghost" className="flex-1" onClick={() => setIsDeleteConfirmOpen(false)}>Keep It</Button><Button variant="danger" className="flex-1" onClick={handleDelete} isLoading={submitting}>Yes, Delete</Button></div>
                </div>
            </Modal>
        </>
    );
};
