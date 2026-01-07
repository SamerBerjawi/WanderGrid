
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Card, Button, Badge, Input, Select, Modal } from '../components/ui';
import { dataService } from '../services/mockDb';
import { User, Trip, PublicHoliday, EntitlementType, WorkspaceSettings, SavedConfig, UserPolicy, CarryOverExpiryType, AccrualPeriod } from '../types';

interface UserDetailProps {
    userId: string;
    onBack: () => void;
}

const COLORS = ['blue', 'green', 'amber', 'purple', 'red', 'indigo', 'gray', 'pink', 'teal', 'cyan'];

const getColorClasses = (color: string) => {
    const maps: Record<string, string> = {
        blue: 'bg-blue-500 shadow-blue-500/40',
        green: 'bg-emerald-500 shadow-emerald-500/40',
        amber: 'bg-amber-500 shadow-amber-500/40',
        purple: 'bg-purple-500 shadow-purple-500/40',
        red: 'bg-rose-500 shadow-rose-500/40',
        indigo: 'bg-indigo-500 shadow-indigo-500/40',
        gray: 'bg-gray-500 shadow-gray-500/40',
        pink: 'bg-pink-500 shadow-pink-500/40',
        teal: 'bg-teal-500 shadow-teal-500/40',
        cyan: 'bg-cyan-500 shadow-cyan-500/40',
    };
    return maps[color] || maps.blue;
};

export const UserDetail: React.FC<UserDetailProps> = ({ userId, onBack }) => {
    const [user, setUser] = useState<User | null>(null);
    const [trips, setTrips] = useState<Trip[]>([]);
    const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
    const [allSavedConfigs, setAllSavedConfigs] = useState<SavedConfig[]>([]);
    const [entitlements, setEntitlements] = useState<EntitlementType[]>([]);
    const [config, setConfig] = useState<WorkspaceSettings | null>(null);
    const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const [availableCountries, setAvailableCountries] = useState<{label: string, value: string}[]>([]);
    
    const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);
    const [tempPolicy, setTempPolicy] = useState<UserPolicy | null>(null);
    
    const [isCreateProtocolOpen, setIsCreateProtocolOpen] = useState(false);
    const [newProtocolForm, setNewProtocolForm] = useState({
        isNewCategory: false,
        categoryId: '',
        newCategoryName: '',
        newCategoryColor: 'blue' as const,
    });
    
    const [isAddYearModalOpen, setIsAddYearModalOpen] = useState(false);
    const [newYearForm, setNewYearForm] = useState({
        year: new Date().getFullYear() + 1,
        countryCode: '',
        replicate: false,
    });

    const [isAddCustomHolidayOpen, setIsAddCustomHolidayOpen] = useState(false);
    const [customHolidayForm, setCustomHolidayForm] = useState({ name: '', date: '' });
    const daysCacheRef = useRef(new Map<string, number>());

    // -- COMPUTED VALUES (Moved Up to avoid ReferenceError) --

    const visibleYears = useMemo(() => {
        if (!user) return [new Date().getFullYear()];
        const years = new Set<number>();
        years.add(new Date().getFullYear()); 
        if (user.activeYears) user.activeYears.forEach(y => years.add(y));
        user.policies?.forEach(p => years.add(p.year));
        if (user.holidayConfigIds) {
            user.holidayConfigIds.forEach(id => {
                const cfg = allSavedConfigs.find(c => c.id === id);
                if (cfg) years.add(cfg.year);
            });
        }
        years.add(selectedYear);
        return Array.from(years).sort((a, b) => a - b);
    }, [user, allSavedConfigs, selectedYear]);

    const activePolicies = useMemo(() => {
        return user?.policies?.filter(p => p.year === selectedYear) || [];
    }, [user, selectedYear]);

    const activeConfig = useMemo(() => {
        if (!user || !user.holidayConfigIds) return null;
        return allSavedConfigs.find(c => c.year === selectedYear && user.holidayConfigIds?.includes(c.id));
    }, [user, allSavedConfigs, selectedYear]);

    const sortedHolidays = useMemo(() => {
        if (!activeConfig) return [];
        return [...activeConfig.holidays].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [activeConfig]);

    const holidayCount = useMemo(() => {
        return activeConfig?.holidays.filter(h => h.isIncluded).length || 0;
    }, [activeConfig]);

    // -- EFFECTS --

    useEffect(() => {
        loadData();
        fetchCountries();
    }, [userId]);

    useEffect(() => {
        daysCacheRef.current.clear();
    }, [config, user, activeConfig, trips]);

    const fetchCountries = () => {
        // Add timeout to prevent hanging on slow network
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 5000);

        fetch('https://date.nager.at/api/v3/AvailableCountries', { signal: controller.signal })
            .then(res => res.json())
            .then(data => {
                clearTimeout(id);
                setAvailableCountries(data.map((c:any) => ({ label: c.name, value: c.countryCode })));
            })
            .catch(() => {
                clearTimeout(id);
                setAvailableCountries([{label: 'Belgium', value: 'BE'}, {label: 'US', value: 'US'}]);
            });
    };

    const loadData = () => {
        setLoading(true);
        Promise.all([
            dataService.getUsers(),
            dataService.getTrips(),
            dataService.getSavedConfigs(),
            dataService.getEntitlementTypes(),
            dataService.getWorkspaceSettings()
        ]).then(([users, allTrips, configs, ents, settings]) => {
            const foundUser = users.find(u => u.id === userId);
            setUser(foundUser || null);
            setTrips(allTrips.filter(t => t.participants.includes(userId)));
            setAllSavedConfigs(configs);
            setEntitlements(ents);
            setConfig(settings);
            
            const flatHolidays = configs.flatMap(c => c.holidays.map(h => ({ ...h, configId: c.id })));
            setHolidays(flatHolidays);
            
            setLoading(false);
        }).catch(err => {
            console.error("Failed to load data", err);
            setLoading(false); // Ensure UI unblocks even on error
        });
    };

    const handleSaveUserConfig = async (updatedUser: User) => {
        setIsSaving(true);
        await dataService.updateUser(updatedUser);
        setUser(updatedUser);
        setTimeout(() => setIsSaving(false), 500);
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

    const calculateDaysForTrip = (trip: Trip, year: number) => {
        if (!config || !user) return 0;
        const cacheKey = `${trip.id}-${year}`;
        if (daysCacheRef.current.has(cacheKey)) {
            return daysCacheRef.current.get(cacheKey) || 0;
        }
        
        const holidaySet = new Set<string>();
        if (activeConfig) {
            activeConfig.holidays.forEach(h => {
                if (h.isIncluded) {
                    holidaySet.add(h.date);
                    if (user.holidayWeekendRule === 'monday') {
                        const d = new Date(h.date);
                        if (d.getDay() === 0 || d.getDay() === 6) {
                            holidaySet.add(getNextMonday(h.date));
                        }
                    }
                }
            });
        }

        const parseDate = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
        const start = parseDate(trip.startDate);
        const end = parseDate(trip.endDate);
        
        let days = 0;
        const current = new Date(start);
        
        while (current <= end) {
            if (current.getFullYear() === year) {
                const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
                const day = current.getDay();
                const isWeekend = !config.workingDays.includes(day);
                const isHoliday = holidaySet.has(dateStr);
                const isExcluded = trip.excludedDates?.includes(dateStr);
                
                if (!isWeekend && !isHoliday && !isExcluded) {
                    let weight = 1;
                    if (trip.durationMode?.includes('am') || trip.durationMode?.includes('pm')) weight = 0.5;
                    else if (trip.durationMode === 'custom') {
                         const isStart = current.getTime() === start.getTime();
                         const isEnd = current.getTime() === end.getTime();
                         if (isStart && isEnd) {
                             if (trip.startPortion === 'pm' || trip.endPortion === 'am') weight = 0.5;
                         } else {
                             if (isStart && trip.startPortion === 'pm') weight = 0.5;
                             else if (isEnd && trip.endPortion === 'am') weight = 0.5;
                         }
                    }
                    days += weight;
                }
            }
            current.setDate(current.getDate() + 1);
        }
        daysCacheRef.current.set(cacheKey, days);
        return days;
    };

    const getUsedBalanceForYear = (entId: string, year: number) => {
        let used = 0;
        trips.forEach(t => {
            if (t.status === 'Cancelled') return;
            
            if (t.allocations && t.allocations.length > 0) {
                const strictAlloc = t.allocations.find(a => a.entitlementId === entId && a.targetYear === year);
                if (strictAlloc) {
                    used += strictAlloc.days;
                } else {
                    const alloc = t.allocations.find(a => a.entitlementId === entId && !a.targetYear);
                    if (alloc) {
                        const totalDur = calculateDaysForTrip(t, year);
                        if (totalDur > 0) used += alloc.days; 
                    }
                }
            } else if (t.entitlementId === entId) {
                used += calculateDaysForTrip(t, year);
            }
        });
        return used;
    };

    const entitlementBreakdown = useMemo(() => {
        if (!user) return [];
        
        // Cache for recursive results within a single calculation pass to prevent O(E * Y) duplication
        const balanceCache = new Map<string, number>();

        const getTotalAllowanceRecursive = (entId: string, year: number, depth = 0): number => {
            const cacheKey = `${entId}-${year}`;
            if (balanceCache.has(cacheKey)) return balanceCache.get(cacheKey)!;
            if (depth > 5) return 0; 
            
            const ent = entitlements.find(e => e.id === entId);
            if (!ent) return 0;

            const policy = user?.policies?.find(p => p.entitlementId === entId && p.year === year);
            let base = 0;
            if (policy) {
                if (policy.isUnlimited) return Infinity;
                base = policy.accrual.amount;
            } else if (ent.isUnlimited) {
                return Infinity;
            }

            if (ent.category === 'Lieu') {
                base = user?.lieuBalance || 0;
                if (user?.holidayWeekendRule === 'lieu') {
                     const accrued = holidays.filter(h => {
                         if (!h.isIncluded) return false;
                         if (!user.holidayConfigIds?.includes(h.configId || '')) return false;
                         
                         const [y, m, d] = h.date.split('-').map(Number);
                         if (y !== year) return false;
                         
                         const date = new Date(y, m - 1, d);
                         const day = date.getDay();
                         return day === 0 || day === 6; 
                     }).length;
                     base += accrued;
                }
            }

            let carryOver = 0;
            const prevYear = year - 1;
            const prevPolicies = user?.policies?.filter(p => p.year === prevYear && p.carryOver.enabled) || [];
            
            prevPolicies.forEach(prevP => {
                const targetsSelf = !prevP.carryOver.targetEntitlementId || prevP.carryOver.targetEntitlementId === prevP.entitlementId;
                const isTarget = prevP.carryOver.targetEntitlementId === entId;
                
                if ((targetsSelf && prevP.entitlementId === entId) || isTarget) {
                    const prevTotal = getTotalAllowanceRecursive(prevP.entitlementId, prevYear, depth + 1);
                    if (prevTotal !== Infinity) {
                        const used = getUsedBalanceForYear(prevP.entitlementId, prevYear);
                        const remaining = Math.max(0, prevTotal - used);
                        carryOver += Math.min(remaining, prevP.carryOver.maxDays);
                    }
                }
            });

            const result = base + carryOver;
            balanceCache.set(cacheKey, result);
            return result;
        };

        return activePolicies.map(p => {
            const ent = entitlements.find(e => e.id === p.entitlementId);
            const total = getTotalAllowanceRecursive(p.entitlementId, selectedYear);
            const used = getUsedBalanceForYear(p.entitlementId, selectedYear);
            
            const base = p.accrual.amount;
            const carryOver = total - base; 

            return {
                id: p.entitlementId,
                name: ent?.name || 'Unknown',
                category: ent?.category,
                color: ent?.color || 'gray',
                used,
                allowance: total,
                breakdown: {
                    base,
                    carryOver,
                    lieu: ent?.category === 'Lieu' ? (user.lieuBalance || 0) : 0,
                    expiryLabel: p.carryOver.expiryType !== 'none' ? `${p.carryOver.expiryValue} ${p.carryOver.expiryType}` : ''
                }
            };
        });
    }, [activePolicies, entitlements, trips, holidays, user, selectedYear]); 

    const totalAllowance = entitlementBreakdown.reduce((sum, item) => sum + (item.allowance === Infinity ? 0 : item.allowance), 0);

    const openAddYearModal = () => {
        setNewYearForm({ year: selectedYear + 1, countryCode: activeConfig?.countryCode || 'BE', replicate: true });
        setIsAddYearModalOpen(true);
    };

    const handleInitializeYear = async () => {
        if (!user) return;
        const year = newYearForm.year;
        
        let configId = `${newYearForm.countryCode}-${year}`;
        const existingConfig = allSavedConfigs.find(c => c.id === configId);
        
        if (!existingConfig) {
            try {
                const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${newYearForm.countryCode}`);
                if (res.ok) {
                    const data = await res.json();
                    const holidays: PublicHoliday[] = data.map((h: any, i: number) => ({
                        id: `nag-${newYearForm.countryCode}-${year}-${i}`,
                        name: h.name,
                        date: h.date,
                        countryCode: newYearForm.countryCode,
                        isIncluded: true,
                        isWeekend: new Date(h.date).getDay() === 0 || new Date(h.date).getDay() === 6
                    }));
                    
                    const countryName = availableCountries.find(c => c.value === newYearForm.countryCode)?.label || newYearForm.countryCode;
                    const newConfig: SavedConfig = {
                        id: configId,
                        countryCode: newYearForm.countryCode,
                        countryName,
                        year,
                        holidays,
                        updatedAt: new Date().toISOString()
                    };
                    await dataService.saveConfig(newConfig);
                    setAllSavedConfigs(prev => [...prev, newConfig]);
                }
            } catch (e) { console.error("Holiday fetch failed", e); }
        }

        let newPolicies: UserPolicy[] = [];
        if (newYearForm.replicate) {
            const sourcePolicies = user.policies?.filter(p => p.year === selectedYear) || [];
            newPolicies = sourcePolicies.map(p => ({ ...p, year }));
        } else {
            newPolicies = entitlements.map(ent => ({
                entitlementId: ent.id,
                year,
                isActive: true,
                isUnlimited: ent.isUnlimited,
                accrual: { ...ent.accrual },
                carryOver: { ...ent.carryOver }
            }));
        }

        const updatedUser: User = {
            ...user,
            activeYears: Array.from(new Set([...(user.activeYears || []), year])),
            holidayConfigIds: Array.from(new Set([...(user.holidayConfigIds || []), configId])),
            policies: [...(user.policies || []), ...newPolicies]
        };

        await handleSaveUserConfig(updatedUser);
        setSelectedYear(year);
        setIsAddYearModalOpen(false);
    };

    const handleWeekendRuleChange = (rule: 'monday' | 'lieu' | 'none') => {
        if (user) handleSaveUserConfig({ ...user, holidayWeekendRule: rule });
    };

    const openCreateProtocol = () => {
        setNewProtocolForm({ isNewCategory: false, categoryId: entitlements[0]?.id || '', newCategoryName: '', newCategoryColor: 'blue' });
        setIsCreateProtocolOpen(true);
    };

    const handleCreateProtocol = async () => {
        if (!user) return;
        
        let entId = newProtocolForm.categoryId;
        
        if (newProtocolForm.isNewCategory) {
            const newEnt: EntitlementType = {
                id: Math.random().toString(36).substr(2, 9),
                name: newProtocolForm.newCategoryName,
                category: 'Custom',
                color: newProtocolForm.newCategoryColor,
                accrual: { period: 'lump_sum', amount: 0 },
                carryOver: { enabled: false, maxDays: 0, expiryType: 'none' }
            };
            await dataService.saveEntitlementType(newEnt);
            setEntitlements(prev => [...prev, newEnt]);
            entId = newEnt.id;
        }

        const newPolicy: UserPolicy = {
            entitlementId: entId,
            year: selectedYear,
            isActive: true,
            accrual: { period: 'lump_sum', amount: 20 },
            carryOver: { enabled: false, maxDays: 0, expiryType: 'none' }
        };

        const updatedPolicies = [...(user.policies || []), newPolicy];
        await handleSaveUserConfig({ ...user, policies: updatedPolicies });
        setIsCreateProtocolOpen(false);
    };

    const openPolicyEditor = (entitlementId: string) => {
        const policy = user?.policies?.find(p => p.entitlementId === entitlementId && p.year === selectedYear);
        if (policy) {
            setTempPolicy({ ...policy });
            setEditingPolicyId(entitlementId);
        }
    };

    const savePolicy = async () => {
        if (!user || !tempPolicy || !editingPolicyId) return;
        const updatedPolicies = user.policies?.map(p => 
            (p.entitlementId === editingPolicyId && p.year === selectedYear) ? tempPolicy : p
        ) || [];
        await handleSaveUserConfig({ ...user, policies: updatedPolicies });
        setEditingPolicyId(null);
    };

    const togglePolicyActive = () => {
        if (tempPolicy) setTempPolicy({ ...tempPolicy, isActive: !tempPolicy.isActive });
    };

    const handleAddCustomHoliday = async () => {
        if (!user || !activeConfig) return;
        const newHoliday: PublicHoliday = {
            id: `custom-${Date.now()}`,
            name: customHolidayForm.name,
            date: customHolidayForm.date,
            countryCode: activeConfig.countryCode,
            isIncluded: true,
            isWeekend: false,
            configId: activeConfig.id
        };
        
        const updatedConfig = { ...activeConfig, holidays: [...activeConfig.holidays, newHoliday] };
        await dataService.saveConfig(updatedConfig);
        
        const idx = allSavedConfigs.findIndex(c => c.id === updatedConfig.id);
        const newConfigs = [...allSavedConfigs];
        newConfigs[idx] = updatedConfig;
        setAllSavedConfigs(newConfigs);
        
        setIsAddCustomHolidayOpen(false);
        setCustomHolidayForm({ name: '', date: '' });
    };

    const handleDeleteCustomHoliday = async (hId: string) => {
        if (!activeConfig) return;
        const updatedConfig = { ...activeConfig, holidays: activeConfig.holidays.filter(h => h.id !== hId) };
        await dataService.saveConfig(updatedConfig);
        
        const idx = allSavedConfigs.findIndex(c => c.id === updatedConfig.id);
        const newConfigs = [...allSavedConfigs];
        newConfigs[idx] = updatedConfig;
        setAllSavedConfigs(newConfigs);
    };

    const toggleHolidayInclusion = async (hId: string) => {
        if (!activeConfig) return;
        const updatedHolidays = activeConfig.holidays.map(h => 
            h.id === hId ? { ...h, isIncluded: !h.isIncluded } : h
        );
        const updatedConfig = { ...activeConfig, holidays: updatedHolidays };
        await dataService.saveConfig(updatedConfig);
        
        const idx = allSavedConfigs.findIndex(c => c.id === updatedConfig.id);
        const newConfigs = [...allSavedConfigs];
        newConfigs[idx] = updatedConfig;
        setAllSavedConfigs(newConfigs);
    };

    const formatHolidayDate = (dateStr: string) => {
        const [y, m, d] = dateStr.split('-').map(Number);
        const date = new Date(y, m - 1, d);
        return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    };

    if (loading || !user) return <div className="p-8 text-gray-400 animate-pulse">Loading Identity Data...</div>;

    const uniqueCountriesList = availableCountries.length > 0 ? availableCountries : [{ label: 'Belgium', value: 'BE' }, { label: 'US', value: 'US' }];

    return (
        <div className="space-y-8 animate-fade-in max-w-[100rem] mx-auto pb-12">
            
            {/* HERO CARD */}
            <div className="relative w-full rounded-[2.5rem] bg-white dark:bg-gray-900 shadow-2xl border border-gray-100 dark:border-white/5 overflow-hidden group">
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.03] dark:opacity-[0.05] pointer-events-none" />
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/3 pointer-events-none" />
                
                <div className="relative p-8 lg:p-12 flex flex-col gap-10">
                    <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-8">
                        <div className="flex flex-col md:flex-row items-start md:items-center gap-8 w-full xl:w-auto">
                            <button onClick={onBack} className="group/btn relative w-14 h-14 rounded-2xl bg-white dark:bg-gray-800 shadow-lg border border-gray-100 dark:border-white/5 flex items-center justify-center transition-all hover:scale-110 hover:border-blue-200 dark:hover:border-blue-800 z-10">
                                <span className="material-icons-outlined text-gray-400 group-hover/btn:text-blue-500 transition-colors text-xl">arrow_back</span>
                            </button>
                            
                            <div className="flex items-center gap-6">
                                <div className="relative">
                                    <div className={`w-28 h-28 rounded-[2rem] flex items-center justify-center text-5xl font-black text-white shadow-2xl transition-transform group-hover:scale-105 group-hover:rotate-3
                                        ${user.role === 'Partner' ? 'bg-gradient-to-br from-blue-600 to-indigo-700' : 'bg-gradient-to-br from-emerald-500 to-teal-700'}`}>
                                        {user.name?.charAt(0) || '?'}
                                    </div>
                                    <div className="absolute -bottom-3 -right-3 bg-white dark:bg-gray-800 px-4 py-1.5 rounded-xl shadow-lg border border-gray-100 dark:border-white/10 flex items-center gap-1.5">
                                        <div className={`w-2 h-2 rounded-full ${user.role === 'Partner' ? 'bg-blue-500' : 'bg-emerald-500'} animate-pulse`} />
                                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-600 dark:text-gray-300">{user.role}</span>
                                    </div>
                                </div>
                                
                                <div className="space-y-2">
                                    <h1 className="text-4xl md:text-5xl font-black text-gray-900 dark:text-white tracking-tight">{user.name}</h1>
                                    <div className="flex flex-wrap gap-2">
                                        {activeConfig && (
                                            <Badge color="amber" className="!text-[10px] !px-2 !py-1 flex items-center gap-1">
                                                <span className="material-icons-outlined text-[10px]">public</span>
                                                {activeConfig.countryName}
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
                             <div className="flex p-1.5 bg-gray-100 dark:bg-black/40 rounded-2xl border border-gray-200 dark:border-white/5 overflow-x-auto max-w-full">
                                {visibleYears.map(y => (
                                    <button
                                        key={y}
                                        onClick={() => setSelectedYear(y)}
                                        className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                                            selectedYear === y 
                                            ? 'bg-white text-gray-900 shadow-lg dark:bg-gray-800 dark:text-white scale-105' 
                                            : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                                        }`}
                                    >
                                        {y}
                                    </button>
                                ))}
                                <button 
                                    onClick={() => openAddYearModal()}
                                    className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-white dark:hover:bg-gray-800 text-gray-400 hover:text-blue-500 transition-all ml-1"
                                >
                                    <span className="material-icons-outlined text-lg">add_circle</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 p-4 rounded-3xl bg-gray-50/50 dark:bg-white/5 border border-gray-100 dark:border-white/5 backdrop-blur-md">
                        <div className="col-span-1 p-3 rounded-2xl bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 flex flex-col justify-center items-center text-center gap-1 group transition-all hover:scale-105">
                            <div className="text-amber-500 mb-1">
                                <span className="material-icons-outlined text-2xl">event</span>
                            </div>
                            <span className="text-2xl font-black text-gray-800 dark:text-white leading-none">{holidayCount}</span>
                            <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest">Public Holidays</span>
                        </div>

                        <div className="col-span-1 p-3 rounded-2xl bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 flex flex-col justify-center items-center text-center gap-1 group transition-all hover:scale-105">
                            <div className="text-blue-500 mb-1">
                                <span className="material-icons-outlined text-2xl">stars</span>
                            </div>
                            <span className="text-2xl font-black text-gray-800 dark:text-white leading-none">{totalAllowance === Infinity ? '∞' : totalAllowance}</span>
                            <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">Total Days</span>
                        </div>

                        {entitlementBreakdown.map(item => {
                            const percent = item.allowance === Infinity ? 0 : (item.used / item.allowance) * 100;
                            const isLow = item.allowance !== Infinity && (item.allowance - item.used) < 3;
                            
                            return (
                                <div key={item.id} className="col-span-1 p-3 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-white/5 flex flex-col justify-between transition-all hover:shadow-lg cursor-pointer" onClick={() => openPolicyEditor(item.id)}>
                                    <div className="flex items-center justify-between w-full mb-2">
                                        <div className={`w-2.5 h-2.5 rounded-full bg-${item.color}-500 shadow-[0_0_8px_rgba(var(--color-${item.color}-500),0.4)]`} />
                                        <span className={`text-[10px] font-black uppercase tracking-widest ${isLow ? 'text-rose-500' : 'text-emerald-500'}`}>
                                            {item.allowance === Infinity ? '∞' : (item.allowance - item.used).toFixed(1)} Left
                                        </span>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-lg font-black text-gray-900 dark:text-white leading-none mb-1">
                                            <span className="text-gray-400 dark:text-gray-500 text-sm">{Math.floor(item.used)}</span>
                                            <span className="text-gray-300 dark:text-gray-600 mx-1">/</span>
                                            {item.allowance === Infinity ? '∞' : item.allowance}
                                        </div>
                                        <p className="text-[9px] font-bold text-gray-400 uppercase truncate px-1" title={item.name}>{item.name}</p>
                                    </div>
                                    <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full mt-3 overflow-hidden">
                                        <div 
                                            className={`h-full rounded-full transition-all duration-700 ease-out bg-${item.color}-500`} 
                                            style={{ width: `${Math.min(100, percent)}%` }} 
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
                {/* REGIONAL STATUTORY CARD */}
                <Card noPadding className="xl:col-span-5 rounded-[2.5rem] flex flex-col h-[45rem] overflow-hidden">
                    <div className="p-8 border-b border-gray-100 dark:border-white/5 bg-amber-500/5 flex justify-between items-center shrink-0">
                        <div>
                            <h3 className="text-xl font-black text-gray-900 dark:text-white leading-none">Regional Statutory</h3>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-2">Calendar & Protocol for {selectedYear}</p>
                        </div>
                        <div className="flex items-center gap-3">
                            {activeConfig && (
                                <Button 
                                    variant="ghost" 
                                    size="sm"
                                    className="!w-10 !h-10 !p-0 rounded-xl text-amber-600 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/20"
                                    onClick={() => {
                                        setCustomHolidayForm({ name: '', date: `${selectedYear}-12-24` });
                                        setIsAddCustomHolidayOpen(true);
                                    }}
                                    title="Add Extra Day"
                                >
                                    <span className="material-icons-outlined">add</span>
                                </Button>
                            )}
                            {activeConfig && (
                                <div className="px-3 py-1.5 bg-amber-100 dark:bg-amber-900/40 rounded-xl text-amber-700 dark:text-amber-300 text-xs font-black uppercase">
                                    {activeConfig.countryCode}
                                </div>
                            )}
                        </div>
                    </div>
                    
                    {activeConfig ? (
                        <div className="flex-1 flex flex-col min-h-0 bg-gray-50/20 dark:bg-white/5">
                            <div className="px-8 py-6 bg-white/40 dark:bg-black/20 border-b border-gray-100 dark:border-white/5">
                                <Select 
                                    label="Weekend Protocol (Observed Rules)" 
                                    className="!rounded-2xl !py-3 !text-sm font-bold shadow-sm"
                                    value={user.holidayWeekendRule || 'none'}
                                    onChange={e => handleWeekendRuleChange(e.target.value as any)}
                                    options={[
                                        { label: 'Do Nothing (Forfeit)', value: 'none' },
                                        { label: 'Move to Next Working Day (Monday)', value: 'monday' },
                                        { label: 'Accrue to Lieu Balance', value: 'lieu' },
                                    ]}
                                />
                                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-3 ml-1">Behavior for holidays falling on non-working days</p>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                                {sortedHolidays.map(h => {
                                    const isCustom = h.id.startsWith('custom-');
                                    return (
                                        <div key={h.id} className={`group flex justify-between items-center p-4 rounded-2xl border transition-all duration-300 ${
                                            h.isIncluded 
                                            ? 'bg-white dark:bg-gray-800/40 border-gray-100 dark:border-white/5 shadow-sm hover:shadow-md' 
                                            : 'bg-gray-50/50 dark:bg-black/20 opacity-50 grayscale border-transparent'
                                        }`}>
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3">
                                                    <span className={`text-sm font-black ${h.isIncluded ? 'text-gray-800 dark:text-gray-100' : 'text-gray-500'}`}>{h.name}</span>
                                                    {h.isWeekend && <Badge color="amber" className="!text-[8px]">Weekend</Badge>}
                                                    {isCustom && <Badge color="purple" className="!text-[8px]">Custom</Badge>}
                                                </div>
                                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1.5 block">{formatHolidayDate(h.date)}</span>
                                            </div>
                                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                                {!isCustom ? (
                                                    <button 
                                                        onClick={() => toggleHolidayInclusion(h.id)}
                                                        className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${h.isIncluded ? 'text-gray-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20' : 'text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'}`}
                                                        title={h.isIncluded ? "Exclude" : "Include"}
                                                    >
                                                        <span className="material-icons-outlined text-lg">{h.isIncluded ? 'block' : 'add_task'}</span>
                                                    </button>
                                                ) : (
                                                    <button onClick={() => handleDeleteCustomHoliday(h.id)} className="w-9 h-9 rounded-xl flex items-center justify-center text-rose-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all" title="Delete Custom Holiday">
                                                        <span className="material-icons-outlined text-lg">delete_outline</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full opacity-50 space-y-6 p-12 text-center bg-gray-50 dark:bg-black/20">
                            <span className="material-icons-outlined text-7xl text-amber-500/20">public_off</span>
                            <div className="space-y-2">
                                <p className="text-sm font-black uppercase tracking-[0.2em] text-gray-400">Regional Protocol Undefined</p>
                                <p className="text-xs text-gray-500 max-w-xs font-medium">Initialize the statutory calendar to manage public holidays for this period.</p>
                            </div>
                            <Button variant="secondary" className="!rounded-xl px-8" onClick={() => openAddYearModal()}>Configure {selectedYear}</Button>
                        </div>
                    )}
                </Card>

                {/* PROTOCOL MATRIX CARD */}
                <Card noPadding className="xl:col-span-7 rounded-[2.5rem] flex flex-col h-[45rem] overflow-hidden">
                    <div className="p-8 border-b border-gray-100 dark:border-white/5 bg-blue-500/5 flex justify-between items-center shrink-0">
                        <div>
                            <h3 className="text-xl font-black text-gray-900 dark:text-white leading-none">Protocol Matrix</h3>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-2">Active entitlements for {selectedYear}</p>
                        </div>
                        <Button variant="secondary" className="!rounded-xl" onClick={openCreateProtocol} icon={<span className="material-icons-outlined">add_moderator</span>}>Deploy New Protocol</Button>
                    </div>
                    
                    <div className="p-8 flex-1 space-y-4 overflow-y-auto custom-scrollbar bg-gray-50/20 dark:bg-white/5">
                        {activePolicies.map(policy => {
                            const ent = entitlements.find(e => e.id === policy.entitlementId);
                            if (!ent) return null;
                            const isActive = policy.isActive;
                            const breakdown = entitlementBreakdown.find(b => b.id === policy.entitlementId);
                            const total = breakdown?.allowance || 0;
                            const used = breakdown?.used || 0;
                            const remaining = total === Infinity ? Infinity : total - used;
                            
                            return (
                                <div 
                                    key={ent.id} 
                                    onClick={() => openPolicyEditor(ent.id)} 
                                    className={`group relative p-6 rounded-3xl border transition-all duration-300 cursor-pointer ${
                                        isActive 
                                        ? 'bg-white dark:bg-gray-800 border-gray-100 dark:border-white/5 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-xl hover:-translate-y-1' 
                                        : 'bg-gray-50/50 dark:bg-black/20 border-transparent opacity-60 grayscale'
                                    }`}
                                >
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center gap-5">
                                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black text-white shadow-2xl transition-transform group-hover:rotate-3 ${getColorClasses(ent.color)}`}>
                                                {ent.name.charAt(0)}
                                            </div>
                                            <div className="space-y-1.5">
                                                <h4 className="text-lg font-black text-gray-900 dark:text-white leading-none">{ent.name}</h4>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="text-[9px] font-black uppercase tracking-widest bg-gray-100 dark:bg-white/10 px-2.5 py-1 rounded-lg text-gray-500 dark:text-gray-400">
                                                        {policy.isUnlimited ? 'Infinite' : `${policy.accrual.amount}d / ${policy.accrual.period === 'lump_sum' ? 'Year' : 'Month'}`}
                                                    </span>
                                                    {policy.carryOver.enabled && (
                                                        <span className="text-[9px] font-black uppercase tracking-widest bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-1 rounded-lg text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                                            <span className="material-icons-outlined text-[10px]">sync</span> Carry-Over
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="text-right">
                                            <div className={`text-2xl font-black ${remaining === Infinity ? 'text-blue-500' : remaining < 3 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                                {remaining === Infinity ? '∞' : remaining.toFixed(1)}
                                            </div>
                                            <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Available</div>
                                        </div>
                                    </div>

                                    {/* Mini Progress bar in card */}
                                    {total !== Infinity && total > 0 && (
                                        <div className="mt-6 space-y-2">
                                            <div className="flex justify-between text-[8px] font-black uppercase tracking-widest text-gray-400 px-1">
                                                <span>Utilized: {used.toFixed(1)}d</span>
                                                <span>Capacity: {total.toFixed(1)}d</span>
                                            </div>
                                            <div className="h-1.5 w-full bg-gray-100 dark:bg-gray-700/50 rounded-full overflow-hidden">
                                                <div 
                                                    className={`h-full rounded-full transition-all duration-1000 ${getColorClasses(ent.color)}`}
                                                    style={{ width: `${Math.min(100, (used / total) * 100)}%` }}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {activePolicies.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-full opacity-30 grayscale py-20">
                                <span className="material-icons-outlined text-7xl mb-4">folder_shared</span>
                                <p className="text-xs font-black uppercase tracking-[0.3em] text-center">No Active Protocols Found</p>
                            </div>
                        )}
                    </div>
                </Card>
            </div>

            {/* MODALS */}
            
            <Modal isOpen={isAddYearModalOpen} onClose={() => setIsAddYearModalOpen(false)} title="Initialize Fiscal Year" maxWidth="max-w-md">
                <div className="space-y-6">
                    <Input 
                        label="Target Cycle Year" 
                        type="number" 
                        className="!rounded-2xl !py-4 !text-lg font-black text-center"
                        value={newYearForm.year} 
                        onChange={e => setNewYearForm({...newYearForm, year: parseInt(e.target.value)})} 
                    />
                    
                    <Select 
                        label="Holidays Jurisdiction" 
                        className="!rounded-2xl"
                        value={newYearForm.countryCode} 
                        onChange={e => setNewYearForm({...newYearForm, countryCode: e.target.value})} 
                        options={[{label: 'Select Country...', value: ''}, ...uniqueCountriesList]}
                    />

                    <div 
                        className={`flex items-center gap-4 p-5 rounded-3xl border transition-all cursor-pointer ${newYearForm.replicate ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/10 dark:border-blue-800' : 'bg-gray-50 dark:bg-white/5 border-gray-100 dark:border-white/10 opacity-70'}`} 
                        onClick={() => setNewYearForm({...newYearForm, replicate: !newYearForm.replicate})}
                    >
                        <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${newYearForm.replicate ? 'bg-blue-600 border-blue-600' : 'bg-white dark:bg-gray-800 border-gray-300'}`}>
                            {newYearForm.replicate && <span className="material-icons-outlined text-white text-sm font-bold">check</span>}
                        </div>
                        <div>
                            <span className="block text-sm font-black text-gray-800 dark:text-white leading-none">Replicate Matrix</span>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1.5 block">Clone active protocols from {selectedYear}</span>
                        </div>
                    </div>

                    <div className="flex gap-4 pt-4">
                        <Button variant="ghost" className="flex-1 !rounded-2xl" onClick={() => setIsAddYearModalOpen(false)}>Abort</Button>
                        <Button variant="primary" className="flex-2 shadow-xl shadow-blue-500/20 !rounded-2xl" onClick={handleInitializeYear} disabled={!newYearForm.countryCode}>
                            Initialize Year {newYearForm.year}
                        </Button>
                    </div>
                </div>
            </Modal>
            
             <Modal isOpen={isAddCustomHolidayOpen} onClose={() => setIsAddCustomHolidayOpen(false)} title="Append Extra Day">
                <div className="space-y-6">
                    <Input label="Protocol Event Name" placeholder="e.g. Christmas Eve" value={customHolidayForm.name} onChange={e => setCustomHolidayForm({...customHolidayForm, name: e.target.value})} />
                    <Input label="Target Date" type="date" value={customHolidayForm.date} onChange={e => setCustomHolidayForm({...customHolidayForm, date: e.target.value})} />
                    <div className="flex gap-4 pt-4 border-t border-gray-100 dark:border-white/5">
                         <Button variant="ghost" className="flex-1" onClick={() => setIsAddCustomHolidayOpen(false)}>Cancel</Button>
                         <Button variant="primary" className="flex-1" onClick={handleAddCustomHoliday} disabled={!customHolidayForm.name || !customHolidayForm.date}>Append Day</Button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={isCreateProtocolOpen} onClose={() => setIsCreateProtocolOpen(false)} title="Deploy Policy Protocol" maxWidth="max-w-lg">
                 <div className="space-y-8">
                     <div className="flex p-1.5 bg-gray-100 dark:bg-black/40 rounded-2xl border border-gray-200 dark:border-white/5">
                         <button onClick={() => setNewProtocolForm({...newProtocolForm, isNewCategory: false})} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${!newProtocolForm.isNewCategory ? 'bg-white shadow-lg text-blue-600 dark:bg-gray-800 dark:text-white' : 'text-gray-400 hover:text-gray-600'}`}>Existing Type</button>
                         <button onClick={() => setNewProtocolForm({...newProtocolForm, isNewCategory: true})} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${newProtocolForm.isNewCategory ? 'bg-white shadow-lg text-blue-600 dark:bg-gray-800 dark:text-white' : 'text-gray-400 hover:text-gray-600'}`}>Unique Type</button>
                     </div>
                     
                     {newProtocolForm.isNewCategory ? (
                         <div className="space-y-6 animate-fade-in">
                            <Input label="New Category Label" placeholder="e.g. Sabbatical Leave" value={newProtocolForm.newCategoryName} onChange={e => setNewProtocolForm({...newProtocolForm, newCategoryName: e.target.value})} />
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1 block mb-4">Identity Color Code</label>
                                <div className="flex flex-wrap gap-4 justify-center">
                                    {COLORS.map(c => (
                                        <button 
                                            key={c} 
                                            onClick={() => setNewProtocolForm({...newProtocolForm, newCategoryColor: c as any})} 
                                            className={`w-10 h-10 rounded-xl transition-all duration-300 ${getColorClasses(c)} ${newProtocolForm.newCategoryColor === c ? 'scale-125 ring-4 ring-blue-500/20 z-10 shadow-2xl' : 'opacity-40 hover:opacity-100 hover:scale-110'}`} 
                                        />
                                    ))}
                                </div>
                            </div>
                         </div>
                     ) : (
                         <Select 
                            label="Target Policy Category" 
                            className="!rounded-2xl !py-4"
                            value={newProtocolForm.categoryId} 
                            onChange={e => setNewProtocolForm({...newProtocolForm, categoryId: e.target.value})} 
                            options={[{label: 'Select leaves category...', value: ''}, ...entitlements.filter(e => !activePolicies.some(p => p.entitlementId === e.id)).map(e => ({ label: e.name, value: e.id }))]} 
                         />
                     )}
                     
                     <div className="flex gap-4 pt-4">
                         <Button variant="ghost" className="flex-1 !rounded-2xl" onClick={() => setIsCreateProtocolOpen(false)}>Cancel</Button>
                         <Button variant="primary" className="flex-2 shadow-xl shadow-blue-500/20 !rounded-2xl" onClick={handleCreateProtocol} disabled={newProtocolForm.isNewCategory ? !newProtocolForm.newCategoryName : !newProtocolForm.categoryId}>Deploy Protocol</Button>
                     </div>
                 </div>
            </Modal>

            <Modal isOpen={!!editingPolicyId} onClose={() => setEditingPolicyId(null)} title="Protocol Operational Parameters" maxWidth="max-w-2xl">
                {tempPolicy && (
                    <div className="space-y-10">
                        <div className="flex items-center justify-between p-6 bg-gray-50 dark:bg-white/5 rounded-3xl border border-gray-100 dark:border-white/10">
                            <div className="flex items-center gap-4">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${tempPolicy.isActive ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-200 text-gray-400'}`}>
                                    <span className="material-icons-outlined">{tempPolicy.isActive ? 'verified_user' : 'disabled_by_default'}</span>
                                </div>
                                <div>
                                    <span className="block font-black text-gray-900 dark:text-white leading-none">Active Matrix Node</span>
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1 block">Toggle protocol participation</span>
                                </div>
                            </div>
                            <button onClick={togglePolicyActive} className={`w-14 h-8 rounded-full p-1.5 transition-all flex items-center ${tempPolicy.isActive ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-700'}`}>
                                <div className={`w-5 h-5 bg-white rounded-full shadow-lg transition-transform ${tempPolicy.isActive ? 'translate-x-6' : ''}`} />
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-6">
                                <div className="flex items-center gap-3 ml-1">
                                    <span className="material-icons-outlined text-blue-500 text-sm">auto_graph</span>
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Accrual Hierarchy</h4>
                                </div>
                                <div className="space-y-4 p-6 bg-blue-50/30 dark:bg-blue-900/10 rounded-[2rem] border border-blue-100 dark:border-blue-900/30">
                                    <div className="relative">
                                        <Input 
                                            label="Allowance Threshold (Days)" 
                                            type="number" 
                                            className="!rounded-2xl !py-3 font-black text-xl pr-12"
                                            value={tempPolicy.accrual.amount} 
                                            onChange={e => setTempPolicy({...tempPolicy, accrual: { ...tempPolicy.accrual, amount: Number(e.target.value) }})} 
                                        />
                                        <span className="absolute right-4 bottom-4 text-[9px] font-black text-gray-300 uppercase">Days</span>
                                    </div>
                                    <Select 
                                        label="Generation Frequency" 
                                        className="!rounded-2xl"
                                        value={tempPolicy.accrual.period} 
                                        onChange={e => setTempPolicy({...tempPolicy, accrual: { ...tempPolicy.accrual, period: e.target.value as AccrualPeriod }})} 
                                        options={[{label: 'Lump Sum Provision', value: 'lump_sum'}, {label: 'Annual Cycle', value: 'yearly'}, {label: 'Monthly Delta', value: 'monthly'}]} 
                                    />
                                    <button 
                                        onClick={() => setTempPolicy({...tempPolicy, isUnlimited: !tempPolicy.isUnlimited})}
                                        className={`w-full p-4 rounded-2xl border transition-all flex items-center gap-3 ${tempPolicy.isUnlimited ? 'bg-indigo-600 text-white border-indigo-400 shadow-lg' : 'bg-white dark:bg-black/20 text-gray-500 border-gray-100 dark:border-white/10'}`}
                                    >
                                        <div className={`w-5 h-5 rounded-lg border flex items-center justify-center ${tempPolicy.isUnlimited ? 'bg-white border-white' : 'border-gray-200'}`}>
                                            {tempPolicy.isUnlimited && <span className="material-icons-outlined text-indigo-600 text-xs font-bold">check</span>}
                                        </div>
                                        <span className="text-[10px] font-black uppercase tracking-widest">Infinite Reserve Cap</span>
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <div className="flex items-center gap-3 ml-1">
                                    <span className="material-icons-outlined text-emerald-500 text-sm">forward</span>
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Carry-Over Protocol</h4>
                                </div>
                                <div className="space-y-4 p-6 bg-emerald-50/30 dark:bg-emerald-900/10 rounded-[2rem] border border-emerald-100 dark:border-emerald-900/30">
                                    <div className="flex justify-between items-center px-1 mb-2">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400">Logic Status</span>
                                        <button 
                                            onClick={() => setTempPolicy({...tempPolicy, carryOver: { ...tempPolicy.carryOver, enabled: !tempPolicy.carryOver.enabled }})} 
                                            className={`text-[9px] font-black uppercase tracking-widest transition-all px-3 py-1 rounded-full ${tempPolicy.carryOver.enabled ? 'bg-emerald-500 text-white shadow-lg' : 'bg-gray-100 dark:bg-gray-800 text-gray-400 hover:text-gray-600'}`}
                                        >
                                            {tempPolicy.carryOver.enabled ? 'Active' : 'Disabled'}
                                        </button>
                                    </div>
                                    
                                    {tempPolicy.carryOver.enabled && (
                                        <div className="space-y-4 animate-fade-in">
                                            <div className="relative">
                                                <Input 
                                                    label="Max Transferable Load" 
                                                    type="number" 
                                                    className="!rounded-2xl !py-3 font-black text-xl pr-12"
                                                    value={tempPolicy.carryOver.maxDays} 
                                                    onChange={e => setTempPolicy({...tempPolicy, carryOver: { ...tempPolicy.carryOver, maxDays: Number(e.target.value) }})} 
                                                />
                                                <span className="absolute right-4 bottom-4 text-[9px] font-black text-gray-300 uppercase">Days</span>
                                            </div>
                                            <Select 
                                                label="Expiry Deadline Mode" 
                                                className="!rounded-2xl"
                                                value={tempPolicy.carryOver.expiryType} 
                                                onChange={e => updateCarryOverExpiryType(e.target.value as CarryOverExpiryType)} 
                                                options={[{label: 'Permanent Persistence', value: 'none'}, {label: 'Months from Jan 1st', value: 'months'}, {label: 'Fixed Monthly/Day', value: 'fixed_date'}]} 
                                            />
                                            {tempPolicy.carryOver.expiryType !== 'none' && (
                                                <Input 
                                                    label={tempPolicy.carryOver.expiryType === 'months' ? 'Temporal Window (Months)' : 'Fixed Threshold (MM-DD)'} 
                                                    className="!rounded-2xl font-bold"
                                                    value={tempPolicy.carryOver.expiryValue as string} 
                                                    onChange={e => setTempPolicy({...tempPolicy, carryOver: { ...tempPolicy.carryOver, expiryValue: tempPolicy.carryOver.expiryType === 'months' ? Number(e.target.value) : e.target.value }})} 
                                                />
                                            )}
                                        </div>
                                    )}
                                    {!tempPolicy.carryOver.enabled && (
                                        <div className="py-12 flex items-center justify-center opacity-20 grayscale grayscale-100">
                                            <span className="material-icons-outlined text-5xl">sync_disabled</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-4 pt-6 border-t border-gray-100 dark:border-white/5">
                             <Button variant="ghost" className="flex-1 !rounded-2xl" onClick={() => setEditingPolicyId(null)}>Discard</Button>
                             <Button variant="primary" className="flex-2 shadow-xl shadow-blue-500/20 !rounded-2xl" onClick={savePolicy} isLoading={isSaving}>Deploy Operational Update</Button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );

    function updateCarryOverExpiryType(type: CarryOverExpiryType) {
        if (!tempPolicy) return;
        setTempPolicy({
            ...tempPolicy,
            carryOver: {
                ...tempPolicy.carryOver,
                expiryType: type,
                expiryValue: type === 'months' ? 3 : type === 'fixed_date' ? '03-31' : undefined
            }
        });
    }
};
