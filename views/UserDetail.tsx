
import React, { useEffect, useState, useMemo } from 'react';
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

    // Fetching state
    const [availableCountries, setAvailableCountries] = useState<{label: string, value: string}[]>([]);
    
    // Modal States
    const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);
    const [tempPolicy, setTempPolicy] = useState<UserPolicy | null>(null);
    const [tempWeekendRule, setTempWeekendRule] = useState<'monday' | 'lieu' | 'none'>('none'); 
    
    const [isCreateProtocolOpen, setIsCreateProtocolOpen] = useState(false);
    const [newProtocolForm, setNewProtocolForm] = useState({
        isNewCategory: false,
        categoryId: '',
        newCategoryName: '',
        newCategoryColor: 'blue' as const,
    });
    
    // Add Year State
    const [isAddYearModalOpen, setIsAddYearModalOpen] = useState(false);
    const [newYearForm, setNewYearForm] = useState({
        year: new Date().getFullYear() + 1,
        countryCode: '',
        replicate: false,
    });

    // Custom Holiday State
    const [isAddCustomHolidayOpen, setIsAddCustomHolidayOpen] = useState(false);
    const [customHolidayForm, setCustomHolidayForm] = useState({ name: '', date: '' });

    useEffect(() => {
        loadData();
        fetchCountries();
    }, [userId]);

    const fetchCountries = () => {
        fetch('https://date.nager.at/api/v3/AvailableCountries')
            .then(res => res.json())
            .then(data => setAvailableCountries(data.map((c:any) => ({ label: c.name, value: c.countryCode }))))
            .catch(() => setAvailableCountries([{label: 'Belgium', value: 'BE'}, {label: 'US', value: 'US'}]));
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
        });
    };

    const handleSaveUserConfig = async (updatedUser: User) => {
        setIsSaving(true);
        await dataService.updateUser(updatedUser);
        setUser(updatedUser);
        setTimeout(() => setIsSaving(false), 500);
    };

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

    const holidayCount = useMemo(() => {
        return activeConfig?.holidays.filter(h => h.isIncluded).length || 0;
    }, [activeConfig]);

    // --- Calculation Logic ---

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
        
        // Holiday Map for current year context
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
        return days;
    };

    const getUsedBalanceForYear = (entId: string, year: number) => {
        let used = 0;
        trips.forEach(t => {
            if (t.status === 'Cancelled') return;
            
            // Check if allocation overrides exist
            if (t.allocations && t.allocations.length > 0) {
                const strictAlloc = t.allocations.find(a => a.entitlementId === entId && a.targetYear === year);
                if (strictAlloc) {
                    used += strictAlloc.days;
                } else {
                    // Fallback to simple allocation if no year specified (split proportionally if crossing years)
                    const alloc = t.allocations.find(a => a.entitlementId === entId && !a.targetYear);
                    if (alloc) {
                        const totalDur = calculateDaysForTrip(t, year); // days in THIS year
                        // This logic is simplified; strict allocation is preferred for cross-year
                        if (totalDur > 0) used += alloc.days; // Rough approx if not strict
                    }
                }
            } else if (t.entitlementId === entId) {
                used += calculateDaysForTrip(t, year);
            }
        });
        return used;
    };

    const calculateCarryOverAmount = (userId: string, entId: string, fromYear: number) => {
        const policy = user?.policies?.find(p => p.entitlementId === entId && p.year === fromYear);
        if (!policy || !policy.carryOver.enabled) return 0;

        const totalAllowance = getTotalAllowanceRecursive(userId, entId, fromYear);
        if (totalAllowance === Infinity) return 0;

        const used = getUsedBalanceForYear(entId, fromYear);
        const remaining = Math.max(0, totalAllowance - used);
        
        // Check Expiry
        if (policy.carryOver.expiryType === 'months' && policy.carryOver.expiryValue) {
            const expiryMonth = (policy.carryOver.expiryValue as number) - 1; // 0-indexed
            const now = new Date();
            // If we are past the expiry month in the target year (fromYear + 1), expire it
            // For simplicity in this view, we assume valid if viewing the target year context
        }

        return Math.min(remaining, policy.carryOver.maxDays);
    };

    const getTotalAllowanceRecursive = (userId: string, entId: string, year: number, depth = 0): number => {
        if (depth > 5) return 0; // Break cycles
        
        const ent = entitlements.find(e => e.id === entId);
        if (!ent) return 0;

        // Base Allowance from Policy
        const policy = user?.policies?.find(p => p.entitlementId === entId && p.year === year);
        let base = 0;
        if (policy) {
            if (policy.isUnlimited) return Infinity;
            base = policy.accrual.amount;
        } else if (ent.isUnlimited) {
            return Infinity;
        }

        // Lieu Exception
        if (ent.category === 'Lieu') {
            base = user?.lieuBalance || 0;
            // Add accrued lieu from weekends if rule active
            if (user?.holidayWeekendRule === 'lieu') {
                 // Logic to count weekend holidays in this year
                 // (Simplified for this view: base is manually managed mostly)
            }
        }

        // Carry Over from Previous Year
        let carryOver = 0;
        const prevYear = year - 1;
        // Find policies in prevYear that target THIS entId
        const prevPolicies = user?.policies?.filter(p => p.year === prevYear && p.carryOver.enabled) || [];
        
        prevPolicies.forEach(prevP => {
            const targetsSelf = !prevP.carryOver.targetEntitlementId || prevP.carryOver.targetEntitlementId === prevP.entitlementId;
            const isTarget = prevP.carryOver.targetEntitlementId === entId;
            
            if ((targetsSelf && prevP.entitlementId === entId) || isTarget) {
                // Calculate how much was left in that previous bucket
                carryOver += calculateCarryOverAmount(userId, prevP.entitlementId, prevYear);
            }
        });

        return base + carryOver;
    };

    const entitlementBreakdown = useMemo(() => {
        if (!user) return [];
        
        return activePolicies.map(p => {
            const ent = entitlements.find(e => e.id === p.entitlementId);
            const total = getTotalAllowanceRecursive(user.id, p.entitlementId, selectedYear);
            const used = getUsedBalanceForYear(p.entitlementId, selectedYear);
            
            // Calculate components for display
            const base = p.accrual.amount;
            const carryOver = total - base; // Simplified

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
    }, [activePolicies, entitlements, trips]); // Dependency on trips to refresh usage

    const totalAllowance = entitlementBreakdown.reduce((sum, item) => sum + (item.allowance === Infinity ? 0 : item.allowance), 0);

    // --- Actions ---

    const openAddYearModal = () => {
        setNewYearForm({ year: selectedYear + 1, countryCode: activeConfig?.countryCode || 'BE', replicate: true });
        setIsAddYearModalOpen(true);
    };

    const handleInitializeYear = async () => {
        if (!user) return;
        const year = newYearForm.year;
        
        // 1. Fetch/Create Holiday Config
        let configId = `${newYearForm.countryCode}-${year}`;
        const existingConfig = allSavedConfigs.find(c => c.id === configId);
        
        if (!existingConfig) {
            // Fetch and save
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

        // 2. Create Policies
        let newPolicies: UserPolicy[] = [];
        if (newYearForm.replicate) {
            // Copy from selectedYear
            const sourcePolicies = user.policies?.filter(p => p.year === selectedYear) || [];
            newPolicies = sourcePolicies.map(p => ({ ...p, year }));
        } else {
            // Create fresh defaults based on Entitlements
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
        
        // We need to update the SavedConfig in DB
        const updatedConfig = { ...activeConfig, holidays: [...activeConfig.holidays, newHoliday] };
        await dataService.saveConfig(updatedConfig);
        
        // Refresh local state
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

    if (loading || !user) return <div className="p-8 text-gray-400 animate-pulse">Loading Identity Data...</div>;

    const uniqueCountries = availableCountries.length > 0 ? availableCountries : [{ label: 'Belgium', value: 'BE' }, { label: 'US', value: 'US' }];

    return (
        <div className="space-y-8 animate-fade-in max-w-[1600px] mx-auto pb-12">
            
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
                                        <div className={`w-2 h-2 rounded-full bg-${item.color}-500`} />
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
                                    <div className="w-full h-1 bg-gray-100 dark:bg-gray-700 rounded-full mt-3 overflow-hidden">
                                        <div 
                                            className={`h-full rounded-full transition-all duration-500 bg-${item.color}-500`} 
                                            style={{ width: `${Math.min(100, percent)}%` }} 
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                <Card noPadding className="xl:col-span-5 rounded-[2rem] flex flex-col h-[600px]">
                    <div className="p-6 border-b border-gray-100 dark:border-white/5 bg-amber-500/5 flex justify-between items-center shrink-0">
                        <div>
                            <h3 className="text-lg font-black text-gray-900 dark:text-white leading-none">Regional Statutory</h3>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Calendar & Protocol for {selectedYear}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            {activeConfig && (
                                <Button 
                                    variant="ghost" 
                                    size="sm"
                                    className="!p-2 text-amber-600 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/20"
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
                                <Badge color="amber">{activeConfig.countryCode}</Badge>
                            )}
                        </div>
                    </div>
                    
                    {activeConfig ? (
                        <div className="flex-1 flex flex-col min-h-0">
                            <div className="px-6 py-4 bg-gray-50/50 dark:bg-white/5 border-b border-gray-100 dark:border-white/5">
                                <Select 
                                    label="Weekend Protocol (If Holiday falls on Sat/Sun)" 
                                    className="!rounded-2xl !py-2 !text-xs font-bold"
                                    value={user.holidayWeekendRule || 'none'}
                                    onChange={e => handleWeekendRuleChange(e.target.value as any)}
                                    options={[
                                        { label: 'Do Nothing (Forfeit)', value: 'none' },
                                        { label: 'Move to Next Working Day (Monday)', value: 'monday' },
                                        { label: 'Accrue to Lieu Balance', value: 'lieu' },
                                    ]}
                                />
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                                {activeConfig.holidays.map(h => (
                                    <div key={h.id} className="group flex justify-between items-center p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 border border-transparent hover:border-gray-100 dark:hover:border-white/5 transition-all">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold text-gray-800 dark:text-gray-200">{h.name}</span>
                                                {h.isWeekend && <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-600 text-[9px] font-black uppercase">Weekend</span>}
                                            </div>
                                            <span className="text-[10px] text-gray-400 font-mono">{h.date}</span>
                                        </div>
                                        {h.id.startsWith('custom-') && (
                                            <button onClick={() => handleDeleteCustomHoliday(h.id)} className="text-rose-400 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <span className="material-icons-outlined text-sm">delete</span>
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full opacity-50 space-y-4 p-8">
                            <span className="material-icons-outlined text-4xl text-amber-500">public_off</span>
                            <div className="text-center">
                                <p className="text-xs font-bold uppercase tracking-widest">No Statutory Defined</p>
                            </div>
                            <Button size="sm" variant="secondary" onClick={() => openAddYearModal()}>Configure {selectedYear}</Button>
                        </div>
                    )}
                </Card>

                <Card noPadding className="xl:col-span-7 rounded-[2rem] flex flex-col h-[600px]">
                    <div className="p-6 border-b border-gray-100 dark:border-white/5 bg-blue-500/5 flex justify-between items-center shrink-0">
                        <div>
                            <h3 className="text-lg font-black text-gray-900 dark:text-white leading-none">Protocol Matrix</h3>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Active entitlements for {selectedYear}</p>
                        </div>
                        <Button variant="secondary" size="sm" onClick={openCreateProtocol}>Deploy Protocol</Button>
                    </div>
                    <div className="p-6 flex-1 space-y-3 overflow-y-auto custom-scrollbar">
                        {activePolicies.map(policy => {
                            const ent = entitlements.find(e => e.id === policy.entitlementId);
                            if (!ent) return null;
                            const isActive = policy.isActive;
                            
                            return (
                                <div key={ent.id} onClick={() => openPolicyEditor(ent.id)} className={`group relative p-5 rounded-2xl border transition-all cursor-pointer ${isActive ? 'bg-white dark:bg-gray-800 border-gray-100 dark:border-white/5 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md' : 'bg-gray-50 dark:bg-white/5 border-transparent opacity-60 grayscale'}`}>
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center gap-4">
                                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-black text-white ${getColorClasses(ent.color)}`}>
                                                {ent.name.charAt(0)}
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-gray-900 dark:text-white">{ent.name}</h4>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-[10px] font-bold uppercase tracking-wider bg-gray-100 dark:bg-white/10 px-2 py-0.5 rounded text-gray-600 dark:text-gray-300">
                                                        {policy.isUnlimited ? 'Unlimited' : `${policy.accrual.amount} Days / ${policy.accrual.period === 'lump_sum' ? 'Year' : 'Month'}`}
                                                    </span>
                                                    {policy.carryOver.enabled && (
                                                        <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded text-emerald-600 dark:text-emerald-400">
                                                            Carry-Over Active
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <span className="material-icons-outlined text-gray-300 group-hover:text-blue-500 transition-colors">edit</span>
                                    </div>
                                </div>
                            );
                        })}
                        {activePolicies.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-full opacity-30">
                                <span className="material-icons-outlined text-4xl mb-2">rule_folder</span>
                                <p className="text-xs font-black uppercase tracking-widest">No Active Policies</p>
                            </div>
                        )}
                    </div>
                </Card>
            </div>

            <Modal isOpen={isAddYearModalOpen} onClose={() => setIsAddYearModalOpen(false)} title="Configure Fiscal Year">
                <div className="space-y-4">
                    <Input label="Target Year" type="number" value={newYearForm.year} onChange={e => setNewYearForm({...newYearForm, year: parseInt(e.target.value)})} />
                    <Select 
                        label="Jurisdiction (Holidays)" 
                        value={newYearForm.countryCode} 
                        onChange={e => setNewYearForm({...newYearForm, countryCode: e.target.value})} 
                        options={uniqueCountries}
                    />
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/10" onClick={() => setNewYearForm({...newYearForm, replicate: !newYearForm.replicate})}>
                        <div className={`w-5 h-5 rounded border flex items-center justify-center cursor-pointer ${newYearForm.replicate ? 'bg-blue-600 border-blue-600' : 'bg-white'}`}>
                            {newYearForm.replicate && <span className="material-icons-outlined text-white text-xs">check</span>}
                        </div>
                        <span className="text-sm font-bold text-gray-700 dark:text-gray-300 select-none">Replicate protocols from {selectedYear}?</span>
                    </div>
                    <div className="flex justify-end pt-4">
                        <Button onClick={handleInitializeYear} disabled={!newYearForm.countryCode}>Initialize {newYearForm.year}</Button>
                    </div>
                </div>
            </Modal>
            
             <Modal isOpen={isAddCustomHolidayOpen} onClose={() => setIsAddCustomHolidayOpen(false)} title="Add Extra Day">
                <div className="space-y-4">
                    <Input label="Event Name" value={customHolidayForm.name} onChange={e => setCustomHolidayForm({...customHolidayForm, name: e.target.value})} />
                    <Input label="Date" type="date" value={customHolidayForm.date} onChange={e => setCustomHolidayForm({...customHolidayForm, date: e.target.value})} />
                    <div className="flex justify-end pt-4">
                        <Button onClick={handleAddCustomHoliday} disabled={!customHolidayForm.name || !customHolidayForm.date}>Add Day</Button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={isCreateProtocolOpen} onClose={() => setIsCreateProtocolOpen(false)} title="Deploy Protocol">
                 <div className="space-y-4">
                     <div className="flex bg-gray-100 dark:bg-white/5 p-1 rounded-xl mb-4">
                         <button onClick={() => setNewProtocolForm({...newProtocolForm, isNewCategory: false})} className={`flex-1 py-2 text-xs font-bold uppercase rounded-lg transition-all ${!newProtocolForm.isNewCategory ? 'bg-white shadow text-blue-600 dark:bg-gray-700 dark:text-white' : 'text-gray-500'}`}>Existing Category</button>
                         <button onClick={() => setNewProtocolForm({...newProtocolForm, isNewCategory: true})} className={`flex-1 py-2 text-xs font-bold uppercase rounded-lg transition-all ${newProtocolForm.isNewCategory ? 'bg-white shadow text-blue-600 dark:bg-gray-700 dark:text-white' : 'text-gray-500'}`}>New Category</button>
                     </div>
                     
                     {newProtocolForm.isNewCategory ? (
                         <>
                            <Input label="Category Name" placeholder="e.g. Sabbatical" value={newProtocolForm.newCategoryName} onChange={e => setNewProtocolForm({...newProtocolForm, newCategoryName: e.target.value})} />
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase ml-1 block mb-2">Color Tag</label>
                                <div className="flex flex-wrap gap-2">
                                    {COLORS.map(c => (
                                        <button key={c} onClick={() => setNewProtocolForm({...newProtocolForm, newCategoryColor: c as any})} className={`w-8 h-8 rounded-full ${getColorClasses(c)} ${newProtocolForm.newCategoryColor === c ? 'ring-2 ring-offset-2 ring-blue-500' : 'opacity-50'}`} />
                                    ))}
                                </div>
                            </div>
                         </>
                     ) : (
                         <Select label="Select Category" value={newProtocolForm.categoryId} onChange={e => setNewProtocolForm({...newProtocolForm, categoryId: e.target.value})} options={entitlements.map(e => ({ label: e.name, value: e.id }))} />
                     )}
                     
                     <div className="flex justify-end pt-4">
                         <Button onClick={handleCreateProtocol} disabled={newProtocolForm.isNewCategory ? !newProtocolForm.newCategoryName : !newProtocolForm.categoryId}>Deploy</Button>
                     </div>
                 </div>
            </Modal>

            <Modal isOpen={!!editingPolicyId} onClose={() => setEditingPolicyId(null)} title="Policy Configuration">
                {tempPolicy && (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-white/5 rounded-xl border border-gray-100 dark:border-white/10">
                            <span className="font-bold text-gray-900 dark:text-white">Policy Active Status</span>
                            <button onClick={togglePolicyActive} className={`w-12 h-6 rounded-full p-1 transition-all ${tempPolicy.isActive ? 'bg-green-500' : 'bg-gray-300'}`}>
                                <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${tempPolicy.isActive ? 'translate-x-6' : ''}`} />
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <Input label="Allowance Amount" type="number" value={tempPolicy.accrual.amount} onChange={e => setTempPolicy({...tempPolicy, accrual: { ...tempPolicy.accrual, amount: Number(e.target.value) }})} />
                            <Select label="Accrual Period" value={tempPolicy.accrual.period} onChange={e => setTempPolicy({...tempPolicy, accrual: { ...tempPolicy.accrual, period: e.target.value as AccrualPeriod }})} options={[{label: 'Lump Sum', value: 'lump_sum'}, {label: 'Yearly', value: 'yearly'}, {label: 'Monthly', value: 'monthly'}]} />
                        </div>

                        <div className="p-4 rounded-xl border border-gray-200 dark:border-white/10 space-y-4">
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Carry Over Rules</span>
                                <button onClick={() => setTempPolicy({...tempPolicy, carryOver: { ...tempPolicy.carryOver, enabled: !tempPolicy.carryOver.enabled }})} className={`text-xs font-bold uppercase ${tempPolicy.carryOver.enabled ? 'text-blue-600' : 'text-gray-400'}`}>{tempPolicy.carryOver.enabled ? 'Enabled' : 'Disabled'}</button>
                            </div>
                            
                            {tempPolicy.carryOver.enabled && (
                                <div className="grid grid-cols-2 gap-4 animate-fade-in">
                                    <Input label="Max Days" type="number" value={tempPolicy.carryOver.maxDays} onChange={e => setTempPolicy({...tempPolicy, carryOver: { ...tempPolicy.carryOver, maxDays: Number(e.target.value) }})} />
                                    <Select label="Expiry" value={tempPolicy.carryOver.expiryType} onChange={e => setTempPolicy({...tempPolicy, carryOver: { ...tempPolicy.carryOver, expiryType: e.target.value as CarryOverExpiryType }})} options={[{label: 'Never', value: 'none'}, {label: 'Months', value: 'months'}, {label: 'Fixed Date', value: 'fixed_date'}]} />
                                    {tempPolicy.carryOver.expiryType !== 'none' && (
                                        <Input label={tempPolicy.carryOver.expiryType === 'months' ? 'Months' : 'Date (MM-DD)'} value={tempPolicy.carryOver.expiryValue as string} onChange={e => setTempPolicy({...tempPolicy, carryOver: { ...tempPolicy.carryOver, expiryValue: tempPolicy.carryOver.expiryType === 'months' ? Number(e.target.value) : e.target.value }})} />
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end pt-4">
                            <Button onClick={savePolicy}>Save Changes</Button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};
