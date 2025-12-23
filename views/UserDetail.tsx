
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
    const [tempWeekendRule, setTempWeekendRule] = useState<'monday' | 'lieu' | 'none'>('none'); // Local state for modal
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
        year: new Date().getFullYear(),
        countryCode: '',
        replicate: false,
    });

    // Custom Holiday State (User Detail View)
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
            .catch(() => setAvailableCountries([{label: 'Belgium', value: 'BE'}, {label: 'US', value: 'US'}, {label: 'UK', value: 'GB'}, {label: 'France', value: 'FR'}, {label: 'Germany', value: 'DE'}]));
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

    // --- Dynamic Year Calculation ---
    const visibleYears = useMemo(() => {
        if (!user) return [new Date().getFullYear()];
        const years = new Set<number>();
        years.add(new Date().getFullYear()); // Always show current
        
        // Add years from activeYears (Persisted State)
        if (user.activeYears) {
            user.activeYears.forEach(y => years.add(y));
        }

        // Add years from policies (Legacy data support)
        user.policies?.forEach(p => years.add(p.year));

        // Add years from assigned holiday configs (Legacy data support)
        if (user.holidayConfigIds) {
            user.holidayConfigIds.forEach(id => {
                const cfg = allSavedConfigs.find(c => c.id === id);
                if (cfg) years.add(cfg.year);
            });
        }
        
        // Ensure selectedYear is visible if set
        years.add(selectedYear);

        return Array.from(years).sort((a, b) => a - b);
    }, [user, allSavedConfigs, selectedYear]);

    // --- Derived Data for UI ---
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

    // --- Calculation Logic for Stats ---

    const getNextMonday = (dateStr: string) => {
        const d = new Date(dateStr);
        const day = d.getDay();
        const diff = day === 0 ? 1 : (day === 6 ? 2 : 0);
        if (diff === 0) return dateStr;
        const next = new Date(d);
        next.setDate(d.getDate() + diff);
        return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
    };

    // Updated: Memoize holidays across ALL years to support recursive calculation safely
    const allEffectiveHolidayDates = useMemo(() => {
        const dates = new Set<string>();
        if (!user || !user.holidayConfigIds) return dates;
        
        // Filter holidays to only those in the user's configs
        const userHolidays = holidays.filter(h => user.holidayConfigIds?.includes(h.configId || ''));
        
        userHolidays.forEach(h => {
            if (h.isIncluded) {
                dates.add(h.date);
                if (user.holidayWeekendRule === 'monday' && h.isWeekend) {
                    dates.add(getNextMonday(h.date));
                }
            }
        });
        return dates;
    }, [user, holidays]);

    const getLieuEarnedForYear = (year: number) => {
        const configForYear = allSavedConfigs.find(c => c.year === year && user?.holidayConfigIds?.includes(c.id));
        if (!configForYear) return 0;
        return configForYear.holidays.filter(h => h.isIncluded && h.isWeekend).length;
    };

    const calculateDaysForTrip = (trip: Trip, entId: string, year: number) => {
        if (!config) return 0;
        
        // If split allocation
        let allocDays = 0;
        let isSplit = false;
        
        if (trip.allocations && trip.allocations.length > 0) {
            // Check for strict year allocation first
            const strictAlloc = trip.allocations.find(a => a.entitlementId === entId && a.targetYear === year);
            if (strictAlloc) {
                return strictAlloc.days;
            }

            // Fallback to legacy/general split
            const alloc = trip.allocations.find(a => a.entitlementId === entId && !a.targetYear);
            if (!alloc) return 0;
            
            allocDays = alloc.days;
            isSplit = true;
        } else {
            if (trip.entitlementId !== entId) return 0;
        }

        const start = new Date(trip.startDate);
        const end = new Date(trip.endDate);
        if (end < start) return 0;

        let totalWorkingDays = 0;
        let daysInYear = 0;
        const current = new Date(start);

        // Scan the trip duration
        while (current <= end) {
            const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
            const isHoliday = allEffectiveHolidayDates.has(dateStr);
            const isWorkingDay = config.workingDays.includes(current.getDay());

            if (isWorkingDay && !isHoliday) {
                let weight = 1;
                // Simplified weight logic for stats
                if (trip.durationMode?.includes('am') || trip.durationMode?.includes('pm')) weight = 0.5;
                if (trip.durationMode === 'custom') {
                     // simplified for stats overview
                     if (current.getTime() === start.getTime() && trip.startPortion === 'pm') weight = 0.5;
                     if (current.getTime() === end.getTime() && trip.endPortion === 'am') weight = 0.5;
                }
                
                totalWorkingDays += weight;
                if (current.getFullYear() === year) {
                    daysInYear += weight;
                }
            }
            current.setDate(current.getDate() + 1);
        }

        if (totalWorkingDays === 0) return 0;

        // If it was a split allocation, we need to proportionalize the days falling in this year
        if (isSplit) {
            return allocDays * (daysInYear / totalWorkingDays);
        }

        return daysInYear;
    };

    const getUsedBalanceForYear = (userId: string, entId: string, year: number) => {
        return trips
            .filter(t => t.status !== 'Planning' && t.participants.includes(userId))
            .reduce((sum, t) => sum + calculateDaysForTrip(t, entId, year), 0);
    };

    const getTotalAllowanceRecursive = (userId: string, entId: string, year: number, depth: number = 0): number => {
        if (depth > 5) return 0; // Limit recursion

        const userObj = userId === user?.id ? user : null; 
        if (!userObj) return 0;

        const policy = userObj.policies?.find(p => p.entitlementId === entId && p.year === year);
        const entDef = entitlements.find(e => e.id === entId);

        // Unlimited check
        const isUnlimited = policy?.isUnlimited !== undefined ? policy.isUnlimited : entDef?.isUnlimited;
        if (isUnlimited) return Infinity;

        // 1. Base
        let total = policy ? policy.accrual.amount : 0;
        
        // 2. Lieu
        if (entDef?.category === 'Lieu' && userObj.holidayWeekendRule === 'lieu') {
             total += getLieuEarnedForYear(year);
        }

        // 3. Carry Over (Recursive)
        if (policy && policy.carryOver.enabled) {
            const prevYear = year - 1;
            const prevPolicies = userObj.policies?.filter(p => p.year === prevYear && p.carryOver.enabled) || [];
            
            prevPolicies.forEach(prevP => {
                const targetsSelf = !prevP.carryOver.targetEntitlementId || prevP.carryOver.targetEntitlementId === prevP.entitlementId;
                const isTarget = prevP.carryOver.targetEntitlementId === entId;
                
                if ((targetsSelf && prevP.entitlementId === entId) || isTarget) {
                    // Get Previous Total Available
                    const prevTotal = getTotalAllowanceRecursive(userId, prevP.entitlementId, prevYear, depth + 1);
                    
                    if (prevTotal !== Infinity) {
                        // Get Previous Usage
                        const prevUsed = getUsedBalanceForYear(userId, prevP.entitlementId, prevYear);
                        
                        const remaining = Math.max(0, prevTotal - prevUsed);
                        const carried = Math.min(remaining, prevP.carryOver.maxDays);
                        total += carried;
                    }
                }
            });
        }
        
        return total;
    };

    const calculateCarryOverAmount = (userId: string, targetEntId: string, year: number) => {
        let total = 0;
        const prevYear = year - 1;
        const prevPolicies = user?.policies?.filter(p => p.year === prevYear && p.carryOver.enabled) || [];
        
        prevPolicies.forEach(prevP => {
             const targetsSelf = !prevP.carryOver.targetEntitlementId || prevP.carryOver.targetEntitlementId === prevP.entitlementId;
             const isTarget = prevP.carryOver.targetEntitlementId === targetEntId;
             
             if ((targetsSelf && prevP.entitlementId === targetEntId) || isTarget) {
                 // RECURSIVE CALL HERE
                 const prevTotal = getTotalAllowanceRecursive(userId, prevP.entitlementId, prevYear);
                 const prevUsed = getUsedBalanceForYear(userId, prevP.entitlementId, prevYear);
                 
                 const remaining = Math.max(0, prevTotal - prevUsed);
                 const carried = Math.min(remaining, prevP.carryOver.maxDays);
                 total += carried;

                 // Set expiry text logic if needed, but we handle it simply here
             }
        });
        return total;
    }

    const getEntitlementStats = (entId: string) => {
        if (!user) return { used: 0, allowance: 0, breakdown: { base: 0, carryOver: 0, lieu: 0, expiryLabel: '' } };

        const stats = {
            used: 0,
            allowance: 0,
            breakdown: {
                base: 0,
                carryOver: 0,
                lieu: 0,
                expiryLabel: ''
            }
        };

        // Usage
        stats.used = getUsedBalanceForYear(user.id, entId, selectedYear);

        // Allowance Components
        const policy = user.policies?.find(p => p.entitlementId === entId && p.year === selectedYear);
        const definition = entitlements.find(e => e.id === entId);
        
        const isUnlimited = policy?.isUnlimited !== undefined ? policy.isUnlimited : definition?.isUnlimited;
        if (isUnlimited) {
            stats.allowance = Infinity;
            return stats;
        }

        if (!policy) return stats;

        // Base
        stats.breakdown.base = policy.accrual.amount;

        // Lieu
        if (definition?.category === 'Lieu' && user.holidayWeekendRule === 'lieu') {
            stats.breakdown.lieu = getLieuEarnedForYear(selectedYear);
        }

        // Carry Over (Recursive)
        if (policy.carryOver.enabled) {
            stats.breakdown.carryOver = calculateCarryOverAmount(user.id, entId, selectedYear);
            
            // Re-find prev policy just for label text (expiry)
            const prevYear = selectedYear - 1;
            const prevP = user.policies?.find(p => p.year === prevYear && p.entitlementId === entId && p.carryOver.enabled);
            if (prevP) {
                 if (prevP.carryOver.expiryType === 'months') {
                     stats.breakdown.expiryLabel = `Expires after ${prevP.carryOver.expiryValue} months`;
                 } else if (prevP.carryOver.expiryType === 'fixed_date') {
                     stats.breakdown.expiryLabel = `Expires on ${prevP.carryOver.expiryValue}`;
                 }
            }
        }

        stats.allowance = stats.breakdown.base + stats.breakdown.carryOver + stats.breakdown.lieu;
        return stats;
    };

    const entitlementBreakdown = useMemo(() => {
        return activePolicies.map(p => {
            const ent = entitlements.find(e => e.id === p.entitlementId);
            const stats = getEntitlementStats(p.entitlementId);
            return {
                id: p.entitlementId,
                name: ent?.name || 'Unknown',
                category: ent?.category,
                color: ent?.color || 'gray',
                ...stats
            };
        });
    }, [activePolicies, entitlements, trips, selectedYear, user?.holidayWeekendRule, allSavedConfigs]);

    const totalAllowance = entitlementBreakdown.reduce((sum, item) => sum + (item.allowance === Infinity ? 0 : item.allowance), 0);

    // --- Add Year Workflow ---

    const openAddYearModal = (yearToConfigure?: number) => {
        const maxYear = Math.max(...visibleYears);
        const targetYear = yearToConfigure || (maxYear + 1);
        const prevYear = targetYear - 1;
        
        // Detect previous config
        const prevConfig = allSavedConfigs.find(c => c.year === prevYear && user?.holidayConfigIds?.includes(c.id));
        const hasPolicies = user?.policies?.some(p => p.year === prevYear);

        setNewYearForm({
            year: targetYear,
            countryCode: prevConfig ? prevConfig.countryCode : '',
            replicate: !!(prevConfig || hasPolicies),
        });
        setIsAddYearModalOpen(true);
    };

    const handleInitializeYear = async () => {
        if (!user) return;
        setLoading(true);

        const targetYear = newYearForm.year;
        const updates: Partial<User> = {};

        // 0. Replicate Policies Logic
        let updatedPolicies = user.policies || [];
        if (newYearForm.replicate) {
             const prevYear = targetYear - 1;
             const prevPolicies = updatedPolicies.filter(p => p.year === prevYear);
             if (prevPolicies.length > 0) {
                 const newPolicies = prevPolicies.map(p => ({
                     ...p,
                     year: targetYear
                 }));
                 // Merge, removing any potential duplicates for the new year if they existed (though likely 0)
                 updatedPolicies = updatedPolicies.filter(p => p.year !== targetYear);
                 updatedPolicies = [...updatedPolicies, ...newPolicies];
                 updates.policies = updatedPolicies;
             }
        }

        // 1. Fetch & Save Config if country selected
        let configIdToAdd = null;
        if (newYearForm.countryCode) {
            const countryName = availableCountries.find(c => c.value === newYearForm.countryCode)?.label || newYearForm.countryCode;
            const configId = `${newYearForm.countryCode}-${newYearForm.year}`;
            
            let existing = allSavedConfigs.find(c => c.id === configId);
            
            if (!existing) {
                try {
                    const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${newYearForm.year}/${newYearForm.countryCode}`);
                    if (!res.ok) throw new Error("Fetch failed");
                    const data = await res.json();
                    const holidays: PublicHoliday[] = data.map((h: any, i: number) => {
                         const d = new Date(h.date);
                         const day = d.getDay();
                         return {
                             id: `nag-${newYearForm.countryCode}-${newYearForm.year}-${i}`,
                             name: h.name,
                             date: h.date,
                             countryCode: newYearForm.countryCode,
                             isIncluded: true,
                             isWeekend: day === 0 || day === 6
                         };
                    });

                    const newConfig: SavedConfig = {
                        id: configId,
                        countryCode: newYearForm.countryCode,
                        countryName,
                        year: newYearForm.year,
                        holidays: holidays,
                        updatedAt: new Date().toISOString()
                    };

                    await dataService.saveConfig(newConfig);
                    const updatedConfigs = await dataService.getSavedConfigs();
                    setAllSavedConfigs(updatedConfigs);
                    const flatHolidays = updatedConfigs.flatMap(c => c.holidays.map(h => ({ ...h, configId: c.id })));
                    setHolidays(flatHolidays);
                } catch (e) {
                    console.error("Error fetching holidays", e);
                }
            }
            configIdToAdd = configId;
        }

        // 2. Update User (Persist Active Year)
        const currentActiveYears = new Set<number>(user.activeYears || []);
        currentActiveYears.add(newYearForm.year);
        updates.activeYears = Array.from(currentActiveYears);

        if (configIdToAdd) {
            const currentIds = user.holidayConfigIds || [];
            if (!currentIds.includes(configIdToAdd)) {
                updates.holidayConfigIds = [...currentIds, configIdToAdd];
            }
        }
        
        await handleSaveUserConfig({ ...user, ...updates });

        setSelectedYear(newYearForm.year);
        setIsAddYearModalOpen(false);
        setLoading(false);
    };

    // --- Holiday Management (In-Card) ---
    
    const toggleHoliday = async (holidayId: string) => {
        if (!activeConfig) return;
        const updatedHolidays = activeConfig.holidays.map(h => 
            h.id === holidayId ? { ...h, isIncluded: !h.isIncluded } : h
        );
        const updatedConfig = { ...activeConfig, holidays: updatedHolidays };
        
        // Optimistic UI update
        const newConfigs = allSavedConfigs.map(c => c.id === activeConfig.id ? updatedConfig : c);
        setAllSavedConfigs(newConfigs);
        const flatHolidays = newConfigs.flatMap(c => c.holidays.map(h => ({ ...h, configId: c.id })));
        setHolidays(flatHolidays);

        // Persist
        await dataService.saveConfig(updatedConfig);
    };

    const handleAddCustomHoliday = async () => {
        if (!activeConfig || !customHolidayForm.name || !customHolidayForm.date) return;
        
        const d = new Date(customHolidayForm.date);
        const day = d.getDay();
        
        // Validation: Ensure year matches selectedYear
        if (d.getFullYear() !== selectedYear) {
             if (!confirm(`The date selected (${d.getFullYear()}) does not match the current view year (${selectedYear}). Add anyway?`)) {
                return;
             }
        }

        const newHoliday: PublicHoliday = {
            id: `custom-${Date.now()}`,
            name: customHolidayForm.name,
            date: customHolidayForm.date,
            countryCode: activeConfig.countryCode,
            isIncluded: true,
            isWeekend: day === 0 || day === 6,
            configId: activeConfig.id
        };

        const updatedHolidays = [...activeConfig.holidays, newHoliday].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const updatedConfig = { ...activeConfig, holidays: updatedHolidays };

        await dataService.saveConfig(updatedConfig);
        
        // Refresh local state
        const newConfigs = allSavedConfigs.map(c => c.id === activeConfig.id ? updatedConfig : c);
        setAllSavedConfigs(newConfigs);
        const flatHolidays = newConfigs.flatMap(c => c.holidays.map(h => ({ ...h, configId: c.id })));
        setHolidays(flatHolidays);

        setIsAddCustomHolidayOpen(false);
        setCustomHolidayForm({ name: '', date: '' });
    };

    const handleDeleteCustomHoliday = async (holidayId: string) => {
        if (!activeConfig) return;
        if (!confirm("Remove this custom holiday permanently?")) return;

        const updatedHolidays = activeConfig.holidays.filter(h => h.id !== holidayId);
        const updatedConfig = { ...activeConfig, holidays: updatedHolidays };

        await dataService.saveConfig(updatedConfig);
        
        // Refresh local state
        const newConfigs = allSavedConfigs.map(c => c.id === activeConfig.id ? updatedConfig : c);
        setAllSavedConfigs(newConfigs);
        const flatHolidays = newConfigs.flatMap(c => c.holidays.map(h => ({ ...h, configId: c.id })));
        setHolidays(flatHolidays);
    };

    const handleWeekendRuleChange = async (rule: 'monday' | 'lieu' | 'none') => {
        if (!user) return;
        let updatedPolicies = user.policies || [];

        // If switching TO lieu, ensure a Lieu policy exists
        if (rule === 'lieu') {
             const lieuEnt = entitlements.find(e => e.category === 'Lieu');
             if (lieuEnt) {
                 const exists = updatedPolicies.find(p => p.entitlementId === lieuEnt.id && p.year === selectedYear);
                 if (!exists) {
                     // Create new default policy for Lieu
                     updatedPolicies = [...updatedPolicies, {
                         entitlementId: lieuEnt.id,
                         year: selectedYear,
                         isActive: true,
                         accrual: { period: 'lump_sum', amount: 0 },
                         carryOver: { enabled: false, maxDays: 0, expiryType: 'none' }
                     }];
                 }
             }
        }

        await handleSaveUserConfig({ ...user, holidayWeekendRule: rule, policies: updatedPolicies });
    };

    // --- Policy & Protocol Management ---

    const openCreateProtocol = () => {
        setNewProtocolForm({
            isNewCategory: false,
            categoryId: entitlements.length > 0 ? entitlements[0].id : '',
            newCategoryName: '',
            newCategoryColor: 'blue'
        });
        setIsCreateProtocolOpen(true);
    };

    const handleCreateProtocol = async () => {
        if (!user) return;
        let finalEntitlementId = newProtocolForm.categoryId;

        // If creating new category
        if (newProtocolForm.isNewCategory) {
            if (!newProtocolForm.newCategoryName) return;
            const newEnt: EntitlementType = {
                id: Math.random().toString(36).substr(2, 9),
                name: newProtocolForm.newCategoryName,
                category: 'Custom',
                color: newProtocolForm.newCategoryColor,
                accrual: { period: 'lump_sum', amount: 0 },
                carryOver: { enabled: false, maxDays: 0, expiryType: 'none' }
            };
            await dataService.saveEntitlementType(newEnt);
            setEntitlements([...entitlements, newEnt]);
            finalEntitlementId = newEnt.id;
        }

        // Check if policy already exists for this year
        const exists = user.policies?.find(p => p.entitlementId === finalEntitlementId && p.year === selectedYear);
        if (exists) {
            alert("A policy for this category and year already exists.");
            return;
        }

        // Create initial policy
        const newPolicy: UserPolicy = {
            entitlementId: finalEntitlementId,
            year: selectedYear,
            isActive: true,
            isUnlimited: entitlements.find(e => e.id === finalEntitlementId)?.isUnlimited,
            accrual: { period: 'lump_sum', amount: 0 },
            carryOver: { enabled: false, maxDays: 0, expiryType: 'none' }
        };

        const currentPolicies = user.policies || [];
        await handleSaveUserConfig({ ...user, policies: [...currentPolicies, newPolicy] });
        
        setIsCreateProtocolOpen(false);
        // Immediately open editor for detailed config
        openPolicyEditor(finalEntitlementId);
    };

    const openPolicyEditor = (entId: string) => {
        if (!user) return;
        const existingPolicy = user.policies?.find(p => p.entitlementId === entId && p.year === selectedYear);
        if (existingPolicy) {
            setTempPolicy({ ...existingPolicy });
            setEditingPolicyId(entId);
            setTempWeekendRule(user.holidayWeekendRule || 'none');
        }
    };

    const savePolicy = async () => {
        if (!user || !tempPolicy) return;
        const currentPolicies = user.policies || [];
        const filteredPolicies = currentPolicies.filter(p => !(p.entitlementId === tempPolicy.entitlementId && p.year === tempPolicy.year));
        const newPolicies = [...filteredPolicies, tempPolicy];
        
        // Handle Weekend Rule sync from modal
        let ruleToSave = user.holidayWeekendRule;
        const ent = entitlements.find(e => e.id === tempPolicy.entitlementId);
        if (ent?.category === 'Lieu') {
            ruleToSave = tempWeekendRule;
        }

        await handleSaveUserConfig({ ...user, policies: newPolicies, holidayWeekendRule: ruleToSave });
        setEditingPolicyId(null);
        setTempPolicy(null);
    };

    const togglePolicyActive = () => {
        if (tempPolicy) {
            setTempPolicy({ ...tempPolicy, isActive: !tempPolicy.isActive });
        }
    };

    if (loading || !user) return <div className="p-8 text-gray-400 animate-pulse">Loading Identity Data...</div>;

    const uniqueCountries = availableCountries.length > 0 ? availableCountries : [{ label: 'Belgium', value: 'BE' }, { label: 'US', value: 'US' }];
    const prevYear = newYearForm.year - 1;

    return (
        <div className="space-y-8 animate-fade-in max-w-[1600px] mx-auto pb-12">
            
            {/* HERO CARD */}
            <div className="relative w-full rounded-[2.5rem] bg-white dark:bg-gray-900 shadow-2xl border border-gray-100 dark:border-white/5 overflow-hidden group">
                {/* Background FX */}
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.03] dark:opacity-[0.05] pointer-events-none" />
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/3 pointer-events-none" />
                
                <div className="relative p-8 lg:p-12 flex flex-col gap-10">
                    
                    {/* Top Row: Identity & Primary Controls */}
                    <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-8">
                        {/* Identity Section */}
                        <div className="flex flex-col md:flex-row items-start md:items-center gap-8 w-full xl:w-auto">
                            <button onClick={onBack} className="group/btn relative w-14 h-14 rounded-2xl bg-white dark:bg-gray-800 shadow-lg border border-gray-100 dark:border-white/5 flex items-center justify-center transition-all hover:scale-110 hover:border-blue-200 dark:hover:border-blue-800 z-10">
                                <span className="material-icons-outlined text-gray-400 group-hover/btn:text-blue-500 transition-colors text-xl">arrow_back</span>
                            </button>
                            
                            <div className="flex items-center gap-6">
                                <div className="relative">
                                    <div className={`w-28 h-28 rounded-[2rem] flex items-center justify-center text-5xl font-black text-white shadow-2xl transition-transform group-hover:scale-105 group-hover:rotate-3
                                        ${user.role === 'Partner' ? 'bg-gradient-to-br from-blue-600 to-indigo-700' : 'bg-gradient-to-br from-emerald-500 to-teal-700'}`}>
                                        {user.name.charAt(0)}
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
                                        {entitlementBreakdown.length === 0 && (
                                            <Badge color="gray" className="!text-[10px] !px-2 !py-1">No Active Protocols</Badge>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Year Selector */}
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

                    {/* Bottom Row: Detailed Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 p-4 rounded-3xl bg-gray-50/50 dark:bg-white/5 border border-gray-100 dark:border-white/5 backdrop-blur-md">
                        {/* 1. Public Holidays Count */}
                        <div className="col-span-1 p-3 rounded-2xl bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 flex flex-col justify-center items-center text-center gap-1 group transition-all hover:scale-105">
                            <div className="text-amber-500 mb-1">
                                <span className="material-icons-outlined text-2xl">event</span>
                            </div>
                            <span className="text-2xl font-black text-gray-800 dark:text-white leading-none">{holidayCount}</span>
                            <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest">Public Holidays</span>
                        </div>

                        {/* 2. Total Allowance Summary */}
                        <div className="col-span-1 p-3 rounded-2xl bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 flex flex-col justify-center items-center text-center gap-1 group transition-all hover:scale-105">
                            <div className="text-blue-500 mb-1">
                                <span className="material-icons-outlined text-2xl">stars</span>
                            </div>
                            <span className="text-2xl font-black text-gray-800 dark:text-white leading-none">{totalAllowance}</span>
                            <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">Total Days</span>
                        </div>

                        {/* 3. Entitlement Breakdowns */}
                        {entitlementBreakdown.map(item => {
                            const percent = item.allowance === Infinity ? 0 : (item.used / item.allowance) * 100;
                            const isLow = item.allowance !== Infinity && (item.allowance - item.used) < 3;
                            
                            return (
                                <div key={item.id} className="col-span-1 p-3 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-white/5 flex flex-col justify-between transition-all hover:shadow-lg">
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
                                        
                                        {/* CARRY OVER DISPLAY */}
                                        {item.breakdown.carryOver > 0 && (
                                            <div className="mt-1 flex flex-col items-center">
                                                <Badge color="purple" className="!px-1 !py-0 !text-[8px] flex items-center gap-0.5 opacity-80">
                                                    <span>+{item.breakdown.carryOver} Carried</span>
                                                </Badge>
                                                {item.breakdown.expiryLabel && (
                                                    <span className="text-[7px] text-rose-500 font-bold mt-0.5 leading-tight">{item.breakdown.expiryLabel}</span>
                                                )}
                                            </div>
                                        )}
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

            {/* --- CONFIGURATION MATRIX --- */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                
                {/* 1. Regional Configuration */}
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
                            {/* Weekend Protocol Selector */}
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

                            {/* Scrollable Holiday List */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                                {activeConfig.holidays.map(h => {
                                    const d = new Date(h.date);
                                    const fullDate = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
                                    const weekendRule = user.holidayWeekendRule || 'none';
                                    const isCustom = h.id.startsWith('custom-');
                                    
                                    return (
                                        <div 
                                            key={h.id} 
                                            className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                                                h.isIncluded 
                                                ? 'bg-white border-gray-200 dark:bg-white/5 dark:border-white/10' 
                                                : 'bg-gray-50 border-transparent opacity-50 dark:bg-black/20'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <div className={`shrink-0 w-10 h-10 rounded-lg flex flex-col items-center justify-center text-[10px] font-black leading-tight ${h.isWeekend ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}>
                                                    <span className="text-[8px] uppercase opacity-70">{d.toLocaleDateString('en-US', { month: 'short' })}</span>
                                                    <span className="text-base">{d.getDate()}</span>
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-sm font-bold text-gray-800 dark:text-white truncate">{h.name}</p>
                                                        {isCustom && <Badge color="purple" className="!px-1 !py-0 !text-[8px]">Custom</Badge>}
                                                    </div>
                                                    <div className="flex items-center flex-wrap gap-1">
                                                        <p className="text-[10px] text-gray-500 font-medium">{fullDate}</p>
                                                        {h.isWeekend && h.isIncluded && weekendRule === 'monday' && (
                                                            <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">Moved to Monday</span>
                                                        )}
                                                        {h.isWeekend && h.isIncluded && weekendRule === 'lieu' && (
                                                            <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">Added to In Lieu</span>
                                                        )}
                                                         {h.isWeekend && h.isIncluded && weekendRule === 'none' && (
                                                            <span className="text-[8px] font-bold uppercase tracking-wider text-gray-400 ml-1">(Forfeit)</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="pl-2 flex items-center gap-2">
                                                {isCustom && (
                                                     <button 
                                                        onClick={() => handleDeleteCustomHoliday(h.id)}
                                                        className="text-gray-300 hover:text-rose-500 transition-colors p-1"
                                                        title="Delete Custom Day"
                                                    >
                                                        <span className="material-icons-outlined text-sm">delete</span>
                                                    </button>
                                                )}
                                                <input 
                                                    type="checkbox" 
                                                    className="w-5 h-5 accent-blue-600 cursor-pointer"
                                                    checked={h.isIncluded}
                                                    onChange={() => toggleHoliday(h.id)}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full opacity-50 space-y-4 p-8">
                            <span className="material-icons-outlined text-4xl text-amber-500">public_off</span>
                            <div className="text-center">
                                <p className="text-xs font-bold uppercase tracking-widest">No Statutory Defined</p>
                                <p className="text-[10px] mt-1 max-w-[200px]">Configure a region to automatically track public holidays for {selectedYear}.</p>
                            </div>
                            <Button size="sm" variant="secondary" onClick={() => openAddYearModal(selectedYear)}>Configure {selectedYear}</Button>
                        </div>
                    )}
                </Card>

                {/* 2. Protocol Matrix (Entitlements) */}
                <Card noPadding className="xl:col-span-7 rounded-[2rem] flex flex-col h-[600px]">
                    <div className="p-6 border-b border-gray-100 dark:border-white/5 bg-blue-500/5 flex justify-between items-center shrink-0">
                        <div>
                            <h3 className="text-lg font-black text-gray-900 dark:text-white leading-none">Protocol Matrix</h3>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Active entitlements for {selectedYear}</p>
                        </div>
                        <Button 
                            variant="secondary" 
                            size="sm" 
                            className="!rounded-xl border-blue-200 text-blue-600 hover:bg-blue-50"
                            icon={<span className="material-icons-outlined text-sm">add_circle</span>}
                            onClick={openCreateProtocol}
                        >
                            Deploy Protocol
                        </Button>
                    </div>
                    <div className="p-6 flex-1 space-y-3 overflow-y-auto custom-scrollbar">
                        <div className="grid grid-cols-12 gap-4 px-4 py-2 text-[10px] font-bold uppercase text-gray-400 tracking-widest border-b border-gray-100 dark:border-white/5">
                             <div className="col-span-4">Category</div>
                             <div className="col-span-3 text-center">Protocol</div>
                             <div className="col-span-3 text-center">Volume</div>
                             <div className="col-span-2 text-right">Action</div>
                        </div>
                        {user.policies?.filter(p => p.year === selectedYear).map(policy => {
                            const ent = entitlements.find(e => e.id === policy.entitlementId);
                            if (!ent) return null;
                            const isUnlimited = policy.isUnlimited !== undefined ? policy.isUnlimited : ent.isUnlimited;

                            return (
                                <div key={ent.id} className={`grid grid-cols-12 gap-4 p-4 rounded-2xl items-center transition-all border ${
                                    policy.isActive 
                                    ? 'bg-white border-gray-100 dark:bg-white/5 dark:border-white/10 hover:shadow-md' 
                                    : 'bg-gray-50 border-transparent opacity-50 grayscale dark:bg-black/20'
                                }`}>
                                    <div className="col-span-4 flex items-center gap-3">
                                         <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-black shadow-sm ${getColorClasses(ent.color)}`}>
                                            {ent.name.charAt(0)}
                                         </div>
                                         <span className="font-bold text-sm text-gray-800 dark:text-white truncate">{ent.name}</span>
                                    </div>
                                    <div className="col-span-3 text-center">
                                        <div className="flex flex-col items-center">
                                            <span className="text-[9px] font-bold text-gray-500 uppercase">{policy.accrual.period === 'lump_sum' ? 'Lump Sum' : policy.accrual.period}</span>
                                            {policy.carryOver.enabled && (
                                                <Badge color="purple" className="!px-1 !py-0 !text-[8px] mt-1">Carry Over</Badge>
                                            )}
                                        </div>
                                    </div>
                                    <div className="col-span-3 text-center flex flex-col items-center">
                                        <span className="font-black text-gray-900 dark:text-white text-lg">{isUnlimited ? '∞' : policy.accrual.amount}</span>
                                        <span className="text-[8px] text-gray-400 font-bold uppercase">Days</span>
                                    </div>
                                    <div className="col-span-2 text-right">
                                        <Button size="sm" variant="ghost" className="!p-2" onClick={() => openPolicyEditor(ent.id)}>
                                            <span className="material-icons-outlined">tune</span>
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                        {(!user.policies || user.policies.filter(p => p.year === selectedYear).length === 0) && (
                            <div className="text-center py-20 opacity-30">
                                <span className="material-icons-outlined text-4xl">rule_folder</span>
                                <p className="text-[10px] font-black uppercase tracking-widest mt-4">No protocols active for {selectedYear}</p>
                            </div>
                        )}
                    </div>
                </Card>
            </div>

            {/* Modal: New Year Configuration */}
            <Modal isOpen={isAddYearModalOpen} onClose={() => setIsAddYearModalOpen(false)} title="Configure Fiscal Year">
                {/* ... (Existing Modal Content) ... */}
                <div className="space-y-6">
                    <div className="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-2xl border border-blue-100 dark:border-blue-900/30 flex items-start gap-4">
                        <div className="w-10 h-10 rounded-xl bg-blue-500 text-white flex items-center justify-center shrink-0">
                            <span className="material-icons-outlined">calendar_today</span>
                        </div>
                        <div>
                            <h4 className="font-bold text-gray-900 dark:text-white">Initialize New Period</h4>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                Create a configuration context for a specific year.
                            </p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <Input 
                            label="Fiscal Year" 
                            type="number" 
                            className="!rounded-2xl font-bold"
                            value={newYearForm.year} 
                            onChange={e => setNewYearForm({...newYearForm, year: parseInt(e.target.value)})} 
                        />
                        
                        <Select 
                            label="Regional Statutory (Optional)" 
                            className="!rounded-2xl"
                            options={[{ label: 'No Statutory (Policies Only)', value: '' }, ...uniqueCountries]}
                            value={newYearForm.countryCode}
                            onChange={e => setNewYearForm({...newYearForm, countryCode: e.target.value})}
                        />
                        
                        <label className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-white/10 cursor-pointer">
                             <input 
                                type="checkbox" 
                                className="w-5 h-5 accent-blue-600 cursor-pointer"
                                checked={newYearForm.replicate}
                                onChange={e => setNewYearForm({...newYearForm, replicate: e.target.checked})}
                             />
                             <div>
                                 <span className="block text-sm font-bold text-gray-800 dark:text-white">Copy Protocols from {newYearForm.year - 1}</span>
                                 <span className="text-[10px] text-gray-500 uppercase tracking-widest">Replicates all entitlements and accrual rules</span>
                             </div>
                        </label>
                    </div>

                    <div className="flex gap-3 pt-4 border-t border-gray-100 dark:border-white/5">
                        <Button variant="ghost" className="flex-1" onClick={() => setIsAddYearModalOpen(false)}>Cancel</Button>
                        <Button variant="primary" className="flex-1" onClick={handleInitializeYear} isLoading={loading}>
                            {newYearForm.countryCode ? 'Fetch Holidays & Create' : 'Initialize Year'}
                        </Button>
                    </div>
                </div>
            </Modal>
            
            {/* Modal: Add Custom Holiday (User Detail View) */}
             <Modal isOpen={isAddCustomHolidayOpen} onClose={() => setIsAddCustomHolidayOpen(false)} title="Add Extra Day">
                {/* ... (Existing Modal Content) ... */}
                <div className="space-y-6">
                    <div className="bg-amber-50 dark:bg-amber-900/10 p-4 rounded-2xl border border-amber-100 dark:border-amber-900/30 flex items-start gap-4">
                        <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                            <span className="material-icons-outlined">celebration</span>
                        </div>
                        <div>
                            <h4 className="font-bold text-gray-900 dark:text-white">Custom Holiday</h4>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                Add a specific non-working day for this region/year configuration (e.g. Christmas Eve).
                            </p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <Input 
                            label="Event Name" 
                            placeholder="e.g. Company Holiday"
                            className="!rounded-2xl"
                            value={customHolidayForm.name} 
                            onChange={e => setCustomHolidayForm({...customHolidayForm, name: e.target.value})} 
                        />
                        
                        <Input 
                            label="Date" 
                            type="date" 
                            className="!rounded-2xl font-bold"
                            value={customHolidayForm.date} 
                            onChange={e => setCustomHolidayForm({...customHolidayForm, date: e.target.value})} 
                        />
                    </div>

                    <div className="flex gap-3 pt-4 border-t border-gray-100 dark:border-white/5">
                        <Button variant="ghost" className="flex-1" onClick={() => setIsAddCustomHolidayOpen(false)}>Cancel</Button>
                        <Button variant="primary" className="flex-1 bg-amber-500 hover:bg-amber-600 border-transparent shadow-amber-500/20" onClick={handleAddCustomHoliday} disabled={!customHolidayForm.name || !customHolidayForm.date}>
                            Add to Calendar
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Modal: Create Protocol */}
            <Modal isOpen={isCreateProtocolOpen} onClose={() => setIsCreateProtocolOpen(false)} title="Deploy Protocol">
                 {/* ... (Existing Modal Content) ... */}
                 <div className="space-y-6">
                     <div className="bg-gray-100 dark:bg-gray-800 p-1 rounded-xl flex">
                         <button 
                             onClick={() => setNewProtocolForm({...newProtocolForm, isNewCategory: false})}
                             className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase transition-all ${!newProtocolForm.isNewCategory ? 'bg-white shadow text-blue-600 dark:bg-gray-700 dark:text-white' : 'text-gray-500'}`}
                         >
                             Select Existing
                         </button>
                         <button 
                             onClick={() => setNewProtocolForm({...newProtocolForm, isNewCategory: true})}
                             className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase transition-all ${newProtocolForm.isNewCategory ? 'bg-white shadow text-blue-600 dark:bg-gray-700 dark:text-white' : 'text-gray-500'}`}
                         >
                             Create New Category
                         </button>
                     </div>

                     {!newProtocolForm.isNewCategory ? (
                         <div className="space-y-4">
                             <Select 
                                 label="Category Definition"
                                 className="!rounded-2xl"
                                 value={newProtocolForm.categoryId}
                                 onChange={e => setNewProtocolForm({...newProtocolForm, categoryId: e.target.value})}
                                 options={entitlements.map(e => ({ label: e.name, value: e.id }))}
                             />
                             {entitlements.length === 0 && <p className="text-xs text-rose-500">No categories exist yet. Please create one.</p>}
                         </div>
                     ) : (
                         <div className="space-y-4 animate-fade-in">
                             <Input 
                                 label="Category Name"
                                 className="!rounded-2xl"
                                 placeholder="e.g. Sabbatical"
                                 value={newProtocolForm.newCategoryName}
                                 onChange={e => setNewProtocolForm({...newProtocolForm, newCategoryName: e.target.value})}
                             />
                             
                             <div>
                                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide ml-1 mb-2 block">Color Tag</label>
                                <div className="flex flex-wrap gap-3">
                                    {COLORS.map(c => (
                                         <button
                                             key={c}
                                             onClick={() => setNewProtocolForm({...newProtocolForm, newCategoryColor: c as any})}
                                             className={`w-10 h-10 rounded-xl transition-all duration-300 flex items-center justify-center ${getColorClasses(c)} ${newProtocolForm.newCategoryColor === c ? 'scale-110 ring-4 ring-offset-2 ring-blue-500/20 dark:ring-offset-gray-900 z-10' : 'opacity-40 hover:opacity-100 hover:scale-105'}`}
                                         >
                                             {newProtocolForm.newCategoryColor === c && <span className="material-icons-outlined text-white text-sm font-bold">check</span>}
                                         </button>
                                    ))}
                                </div>
                             </div>
                         </div>
                     )}

                     <div className="flex gap-3 pt-4 border-t border-gray-100 dark:border-white/5">
                        <Button variant="ghost" className="flex-1" onClick={() => setIsCreateProtocolOpen(false)}>Cancel</Button>
                        <Button variant="primary" className="flex-1" onClick={handleCreateProtocol}>
                            Initialize Config
                        </Button>
                    </div>
                 </div>
            </Modal>

            {/* Modal: Policy Editor */}
            <Modal isOpen={!!editingPolicyId} onClose={() => setEditingPolicyId(null)} title="Policy Configuration">
                {tempPolicy && (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between bg-gray-50 dark:bg-white/5 p-4 rounded-2xl border border-gray-100 dark:border-white/5">
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-black ${getColorClasses(entitlements.find(e => e.id === tempPolicy.entitlementId)?.color || 'blue')}`}>
                                    {entitlements.find(e => e.id === tempPolicy.entitlementId)?.name.charAt(0)}
                                </div>
                                <div>
                                    <h4 className="font-bold text-gray-900 dark:text-white">
                                        {entitlements.find(e => e.id === tempPolicy.entitlementId)?.name}
                                    </h4>
                                    <p className="text-[10px] text-gray-500 uppercase tracking-widest">Configuration for {selectedYear}</p>
                                </div>
                            </div>
                            <Button 
                                variant={tempPolicy.isActive ? 'primary' : 'secondary'} 
                                size="sm" 
                                onClick={togglePolicyActive}
                            >
                                {tempPolicy.isActive ? 'Active' : 'Inactive'}
                            </Button>
                        </div>

                        {tempPolicy.isActive && (
                            <div className="space-y-6 animate-fade-in">
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h5 className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Accrual Logic</h5>
                                        
                                        {/* Unlimited Toggle */}
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <span className="text-[10px] font-bold text-gray-400 uppercase">Unlimited Allowance</span>
                                            <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${tempPolicy.isUnlimited ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-700'}`}>
                                                <div className={`w-3 h-3 bg-white rounded-full shadow transition-transform ${tempPolicy.isUnlimited ? 'translate-x-4' : 'translate-x-0'}`} />
                                            </div>
                                            <input 
                                                type="checkbox" 
                                                className="hidden" 
                                                checked={!!tempPolicy.isUnlimited}
                                                onChange={e => setTempPolicy({
                                                    ...tempPolicy,
                                                    isUnlimited: e.target.checked
                                                })}
                                            />
                                        </label>
                                    </div>

                                    {!tempPolicy.isUnlimited && (
                                        <div className="grid grid-cols-2 gap-4 animate-fade-in">
                                            <Select 
                                                label="Frequency"
                                                className="!rounded-2xl"
                                                value={tempPolicy.accrual.period}
                                                onChange={e => setTempPolicy({
                                                    ...tempPolicy,
                                                    accrual: { ...tempPolicy.accrual!, period: e.target.value as AccrualPeriod }
                                                })}
                                                options={[
                                                    { label: 'Lump Sum (Yearly)', value: 'lump_sum' },
                                                    { label: 'Monthly Accrual', value: 'monthly' },
                                                ]}
                                            />
                                            <div className="relative">
                                                 <Input 
                                                    label="Amount" 
                                                    type="number" 
                                                    className="!rounded-2xl font-bold"
                                                    value={tempPolicy.accrual.amount}
                                                    onChange={e => setTempPolicy({
                                                        ...tempPolicy,
                                                        accrual: { ...tempPolicy.accrual!, amount: Number(e.target.value) }
                                                    })}
                                                 />
                                                 <div className="absolute right-4 top-9 text-xs font-bold text-gray-400">Days</div>
                                            </div>
                                        </div>
                                    )}
                                    
                                    {/* Specific Logic for Lieu Category */}
                                    {entitlements.find(e => e.id === tempPolicy.entitlementId)?.category === 'Lieu' && !tempPolicy.isUnlimited && (
                                        <div className="p-4 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30 rounded-2xl flex items-center justify-between">
                                            <div>
                                                <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300">Accrue Weekend Public Holidays</p>
                                                <p className="text-[9px] text-emerald-600/70 dark:text-emerald-400/60 mt-0.5">Automatically adds included holidays falling on weekends</p>
                                            </div>
                                            <div onClick={() => setTempWeekendRule(prev => prev === 'lieu' ? 'none' : 'lieu')} className={`w-10 h-6 rounded-full p-1 cursor-pointer transition-colors ${tempWeekendRule === 'lieu' ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-700'}`}>
                                                <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${tempWeekendRule === 'lieu' ? 'translate-x-4' : 'translate-x-0'}`} />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-white/5">
                                    <div className="flex items-center justify-between">
                                        <h5 className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Carry Over Rules</h5>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <span className="text-[10px] font-bold text-gray-400 uppercase">Enable Logic</span>
                                            <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${tempPolicy.carryOver.enabled ? 'bg-blue-600' : 'bg-gray-300'}`}>
                                                <div className={`w-3 h-3 bg-white rounded-full shadow transition-transform ${tempPolicy.carryOver.enabled ? 'translate-x-4' : 'translate-x-0'}`} />
                                            </div>
                                            <input 
                                                type="checkbox" 
                                                className="hidden" 
                                                checked={tempPolicy.carryOver.enabled}
                                                onChange={e => setTempPolicy({
                                                    ...tempPolicy,
                                                    carryOver: { ...tempPolicy.carryOver!, enabled: e.target.checked }
                                                })}
                                                disabled={!!tempPolicy.isUnlimited}
                                            />
                                        </label>
                                    </div>

                                    {tempPolicy.carryOver.enabled && !tempPolicy.isUnlimited && (
                                        <div className="p-4 bg-gray-50 dark:bg-white/5 rounded-2xl space-y-4 border border-gray-100 dark:border-white/5">
                                             <div className="grid grid-cols-2 gap-4">
                                                 <Input 
                                                    label="Max Carry Over" 
                                                    type="number"
                                                    value={tempPolicy.carryOver.maxDays}
                                                    onChange={e => setTempPolicy({
                                                        ...tempPolicy,
                                                        carryOver: { ...tempPolicy.carryOver!, maxDays: Number(e.target.value) }
                                                    })}
                                                 />
                                                 <Select 
                                                    label="Expiry" 
                                                    options={[
                                                        { label: 'None', value: 'none' },
                                                        { label: 'Months', value: 'months' },
                                                        { label: 'Fixed Date', value: 'fixed_date' },
                                                    ]}
                                                    value={tempPolicy.carryOver.expiryType}
                                                    onChange={e => setTempPolicy({
                                                        ...tempPolicy,
                                                        carryOver: { ...tempPolicy.carryOver!, expiryType: e.target.value as CarryOverExpiryType }
                                                    })}
                                                 />
                                             </div>
                                             {tempPolicy.carryOver.expiryType === 'months' && (
                                                  <Input 
                                                    label="Expiry after (Months)" 
                                                    type="number"
                                                    value={tempPolicy.carryOver.expiryValue || 0}
                                                    onChange={e => setTempPolicy({
                                                        ...tempPolicy,
                                                        carryOver: { ...tempPolicy.carryOver!, expiryValue: Number(e.target.value) }
                                                    })}
                                                 />
                                             )}
                                             {tempPolicy.carryOver.expiryType === 'fixed_date' && (
                                                  <Input 
                                                    label="Expiry Date (MM-DD)" 
                                                    placeholder="06-30"
                                                    value={tempPolicy.carryOver.expiryValue || ''}
                                                    onChange={e => setTempPolicy({
                                                        ...tempPolicy,
                                                        carryOver: { ...tempPolicy.carryOver!, expiryValue: e.target.value }
                                                    })}
                                                 />
                                             )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                        
                        <div className="flex gap-3 pt-4">
                            <Button variant="ghost" className="flex-1" onClick={() => setEditingPolicyId(null)}>Cancel</Button>
                            <Button variant="primary" className="flex-1" onClick={savePolicy}>Apply Configuration</Button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};
