import React, { useState, useEffect } from 'react';
import { Button, Input } from './ui';
import GlassPanel from './glass/GlassPanel';
import StandardDrawer from './StandardDrawer';
import { EmptyState } from './EmptyState';
import { WorkspaceSettings, Carrier } from '../types';
import { dataService } from '../services/mockDb';
import { getMerchantLogoUrl } from '../utils/brandfetch';
import { getCarrierName } from '../utils/flightData';
import {
    Airplane,
    ArrowsClockwise,
    FloppyDisk,
    MagnifyingGlass,
    Trash,
    PencilSimple,
    CheckCircle,
    WarningCircle,
    Info,
    X,
    ArrowSquareOut,
    Plus,
    SquaresFour,
    Table,
    Check,
    Sparkle
} from '@phosphor-icons/react';

interface CarriersTabProps {
    config: WorkspaceSettings;
    setConfig: (config: WorkspaceSettings) => void;
    handleSaveOrgSettings: () => Promise<void>;
    isSavingOrg: boolean;
}

interface CarrierImageProps {
    domain: string;
    alt: string;
    className?: string;
    apiKey?: string;
    fill?: boolean;
}

const CarrierImage: React.FC<CarrierImageProps> = ({ domain, alt, className = "w-12 h-12", apiKey, fill = false }) => {
    const [src, setSrc] = useState<string>('');
    const [attempt, setAttempt] = useState(0);

    const getUrl = (d: string, att: number): string => {
        const cleanDomain = d.trim().toLowerCase();
        const steps: string[] = [];

        if (apiKey) {
            const bfUrl = getMerchantLogoUrl(cleanDomain, apiKey, {}, { type: 'icon', fallback: '404' });
            if (bfUrl) steps.push(bfUrl);
        }

        steps.push(`https://logo.clearbit.com/${cleanDomain}`);
        steps.push(`https://asset.brandfetch.io/${cleanDomain}/logo?theme=light`);
        steps.push(`https://www.google.com/s2/favicons?sz=128&domain=${cleanDomain}`);

        return steps[att] || '';
    };

    useEffect(() => {
        if (domain) {
            setSrc(getUrl(domain, 0));
            setAttempt(0);
        }
    }, [domain, apiKey]);

    const handleError = () => {
        const maxAttempts = apiKey ? 3 : 2;
        if (attempt < maxAttempts) {
            const next = attempt + 1;
            setAttempt(next);
            setSrc(getUrl(domain, next));
        } else {
            setSrc('__failed__');
        }
    };

    if (!domain || src === '__failed__') {
        return (
            <div className={`${className} bg-light-fill border border-black/5 dark:bg-dark-fill dark:border-white/5 rounded-2xl flex items-center justify-center ${fill ? 'p-0' : 'p-2'} text-light-text-secondary dark:text-dark-text-secondary shrink-0`}>
                <Airplane className="w-5 h-5 text-light-text-secondary dark:text-dark-text-secondary" weight="duotone" />
            </div>
        );
    }

    return (
        <div className={`${className} bg-white border border-black/5 rounded-2xl flex items-center justify-center ${fill ? 'p-0' : 'p-1.5'} dark:bg-dark-card dark:border-white/5 overflow-hidden shadow-xs shrink-0`}>
            <img
                src={src || getUrl(domain, 0)}
                alt={alt}
                className={`w-full h-full ${fill ? 'object-cover' : 'object-contain'}`}
                referrerPolicy="no-referrer"
                onError={handleError}
            />
        </div>
    );
};

const POPULAR_CARRIERS = [
    { name: 'Delta Air Lines', code: 'DL', domain: 'delta.com' },
    { name: 'United Airlines', code: 'UA', domain: 'united.com' },
    { name: 'American Airlines', code: 'AA', domain: 'aa.com' },
    { name: 'British Airways', code: 'BA', domain: 'britishairways.com' },
    { name: 'Lufthansa', code: 'LH', domain: 'lufthansa.com' },
    { name: 'Emirates', code: 'EK', domain: 'emirates.com' },
    { name: 'Air France', code: 'AF', domain: 'airfrance.com' },
    { name: 'Qatar Airways', code: 'QR', domain: 'qatarairways.com' },
    { name: 'Singapore Airlines', code: 'SQ', domain: 'singaporeair.com' },
    { name: 'KLM', code: 'KL', domain: 'klm.com' },
    { name: 'Cathay Pacific', code: 'CX', domain: 'cathaypacific.com' },
    { name: 'Southwest Airlines', code: 'WN', domain: 'southwest.com' },
];

export const CarriersTab: React.FC<CarriersTabProps> = ({ config, setConfig, handleSaveOrgSettings, isSavingOrg }) => {
    // Drawer & Form State
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formName, setFormName] = useState('');
    const [formCode, setFormCode] = useState('');
    const [formDomain, setFormDomain] = useState('');

    // Table / Cards View Mode
    const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

    // Search & Filter
    const [searchQuery, setSearchQuery] = useState('');

    // Status & Modals
    const [isScanning, setIsScanning] = useState(false);
    const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
    const [deletingCarrier, setDeletingCarrier] = useState<Carrier | null>(null);

    const carriers = config.carriers || [];

    useEffect(() => {
        if (notification) {
            const timer = setTimeout(() => setNotification(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [notification]);

    const handleOpenAddDrawer = () => {
        setEditingId(null);
        setFormName('');
        setFormCode('');
        setFormDomain('');
        setIsDrawerOpen(true);
    };

    const handleOpenEditDrawer = (c: Carrier) => {
        setEditingId(c.id);
        let initialName = c.name;
        if (initialName.length <= 3 && initialName === initialName.toUpperCase() || initialName === c.code) {
            const resolved = getCarrierName(c.code);
            if (resolved && resolved !== c.code) {
                initialName = resolved;
            }
        }
        setFormName(initialName);
        setFormCode(c.code);
        setFormDomain(c.domain);
        setIsDrawerOpen(true);
    };

    const handleSaveCarrierFromDrawer = () => {
        if (!formName.trim() || !formCode.trim() || !formDomain.trim()) return;

        const codeUpper = formCode.trim().toUpperCase();
        let updatedCarriers: Carrier[];

        if (editingId) {
            updatedCarriers = carriers.map(c =>
                c.id === editingId
                    ? { ...c, name: formName.trim(), code: codeUpper, domain: formDomain.trim().toLowerCase() }
                    : c
            );
            setNotification({ type: 'success', text: `Updated carrier: ${formName.trim()} (${codeUpper})` });
        } else {
            if (carriers.some(c => c.code === codeUpper)) {
                setNotification({ type: 'error', text: `Carrier code "${codeUpper}" is already registered.` });
                return;
            }

            const newCarrier: Carrier = {
                id: Math.random().toString(36).substr(2, 9),
                name: formName.trim(),
                code: codeUpper,
                domain: formDomain.trim().toLowerCase()
            };
            updatedCarriers = [...carriers, newCarrier];
            setNotification({ type: 'success', text: `Added carrier: ${formName.trim()} (${codeUpper})` });
        }

        setConfig({ ...config, carriers: updatedCarriers });
        setIsDrawerOpen(false);
    };

    const handleConfirmDelete = () => {
        if (!deletingCarrier) return;
        const targetId = deletingCarrier.id;
        const targetName = deletingCarrier.name;
        const updatedCarriers = carriers.filter(c => c.id !== targetId);
        setConfig({ ...config, carriers: updatedCarriers });
        setDeletingCarrier(null);
        setNotification({ type: 'info', text: `Removed carrier: ${targetName}` });

        if (editingId === targetId) {
            setIsDrawerOpen(false);
        }
    };

    const handleAutoPopulate = async () => {
        setIsScanning(true);
        setNotification(null);
        try {
            const [trips, independentFlights] = await Promise.all([
                dataService.getTrips(),
                dataService.getFlights()
            ]);

            const allFlights: any[] = [];

            trips.forEach((t: any) => {
                if (t.transports) {
                    t.transports.forEach((transport: any) => {
                        if (transport.mode === 'Flight') {
                            allFlights.push(transport);
                        }
                    });
                }
            });

            independentFlights.forEach((f: any) => {
                allFlights.push(f);
            });

            if (allFlights.length === 0) {
                setNotification({ type: 'info', text: 'No flight records found to auto-populate from.' });
                setIsScanning(false);
                return;
            }

            const mappings: Record<string, string> = {
                'deltaairlines': 'delta.com', 'delta': 'delta.com', 'americanairlines': 'aa.com', 'american': 'aa.com',
                'unitedairlines': 'united.com', 'united': 'united.com', 'southwestairlines': 'southwest.com', 'southwest': 'southwest.com',
                'britishairways': 'britishairways.com', 'emirates': 'emirates.com', 'qatarairways': 'qatarairways.com', 'qatar': 'qatarairways.com',
                'lufthansa': 'lufthansa.com', 'airfrance': 'airfrance.com', 'klm': 'klm.com', 'singaporeairlines': 'singaporeair.com',
                'cathaypacific': 'cathaypacific.com', 'ana': 'ana.co.jp', 'japanairlines': 'jal.com', 'jal': 'jal.com',
                'ryanair': 'ryanair.com', 'easyjet': 'easyjet.com'
            };

            const extractedCarriers: Map<string, { name: string; code: string; domain: string }> = new Map();

            allFlights.forEach(f => {
                const rawName = f.carrierName || f.operator || f.airline || '';
                const rawCode = f.carrierCode || f.flightNumber?.substring(0, 2) || '';

                if (rawCode && rawCode.length >= 2) {
                    const codeClean = rawCode.trim().toUpperCase();
                    if (!carriers.some(c => c.code === codeClean) && !extractedCarriers.has(codeClean)) {
                        const lookupName = rawName || getCarrierName(codeClean) || codeClean;
                        const simplified = lookupName.toLowerCase().replace(/[^a-z0-9]/g, '');
                        const mappedDomain = mappings[simplified] || `${simplified || 'airline'}.com`;

                        extractedCarriers.set(codeClean, {
                            name: lookupName,
                            code: codeClean,
                            domain: mappedDomain
                        });
                    }
                }
            });

            if (extractedCarriers.size === 0) {
                setNotification({ type: 'info', text: 'No new carriers detected from your flight records.' });
            } else {
                const newEntries: Carrier[] = Array.from(extractedCarriers.values()).map(c => ({
                    id: Math.random().toString(36).substr(2, 9),
                    ...c
                }));
                setConfig({ ...config, carriers: [...carriers, ...newEntries] });
                setNotification({ type: 'success', text: `Auto-populated ${newEntries.length} new carriers!` });
            }
        } catch (e: any) {
            setNotification({ type: 'error', text: `Error auto-populating: ${e.message}` });
        } finally {
            setIsScanning(false);
        }
    };

    const handleSelectPreset = (preset: { name: string; code: string; domain: string }) => {
        setFormName(preset.name);
        setFormCode(preset.code);
        setFormDomain(preset.domain);
    };

    const filteredCarriers = carriers.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.domain.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const getCleanName = (c: Carrier) => {
        let displayName = c.name;
        if (displayName.length <= 3 && displayName === displayName.toUpperCase() || displayName === c.code) {
            const resolved = getCarrierName(c.code);
            if (resolved && resolved !== c.code) {
                displayName = resolved;
            }
        }
        return displayName;
    };

    return (
        <div className="h-full animate-fade-in pb-8">
            <div className="flex flex-col overflow-hidden rounded-[28px]">
                <GlassPanel
                    className="wg-glass-card shadow-glass-card flex flex-col h-full overflow-hidden border border-black/5 dark:border-white/10"
                    overrides={{ borderRadius: 28 }}
                    padding="0px"
                >
                    <div className="flex flex-col h-full w-full overflow-hidden rounded-[28px]">
                        {/* Header Banner */}
                        <div className="p-4 sm:p-6 border-b border-black/5 dark:border-white/5 bg-gradient-to-r from-blue-500/10 via-blue-500/5 to-transparent shrink-0">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">

                                {/* Title & Badge */}
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20 shrink-0">
                                        <Airplane className="w-6 h-6" weight="duotone" />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-base sm:text-lg font-bold text-light-text dark:text-dark-text tracking-tight truncate">
                                                Operating Carriers
                                            </h3>
                                            <span className="px-2.5 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-500/20">
                                                {carriers.length}
                                            </span>
                                        </div>
                                        <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary font-medium truncate mt-0.5">
                                            Manage airline codes, provider mappings, and Brandfetch vector logos
                                        </p>
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="flex items-center gap-2 sm:gap-2.5 w-full md:w-auto shrink-0 flex-wrap sm:flex-nowrap">
                                    <Button
                                        variant="secondary"
                                        onClick={handleAutoPopulate}
                                        isLoading={isScanning}
                                        className="shrink-0"
                                        icon={<ArrowsClockwise className="w-4 h-4" weight="duotone" />}
                                    >
                                        Auto-Fill
                                    </Button>

                                    <Button
                                        variant="primary"
                                        onClick={handleOpenAddDrawer}
                                        className="shrink-0"
                                        icon={<Plus className="w-4 h-4" />}
                                    >
                                        Add Carrier
                                    </Button>

                                    <Button
                                        variant="secondary"
                                        onClick={handleSaveOrgSettings}
                                        isLoading={isSavingOrg}
                                        className="shrink-0"
                                        icon={<FloppyDisk className="w-4 h-4" weight="duotone" />}
                                    >
                                        Save
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {/* Notification Toast */}
                        {notification && (
                            <div className={`px-4 sm:px-6 py-3 shrink-0 flex items-center justify-between border-b text-xs font-bold font-sans ${notification.type === 'success'
                                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                                    : notification.type === 'error'
                                        ? 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400'
                                        : 'bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400'
                                }`}>
                                <div className="flex items-center gap-2 min-w-0">
                                    {notification.type === 'success' ? (
                                        <CheckCircle className="w-4 h-4 shrink-0" weight="duotone" />
                                    ) : notification.type === 'error' ? (
                                        <WarningCircle className="w-4 h-4 shrink-0" weight="duotone" />
                                    ) : (
                                        <Info className="w-4 h-4 shrink-0" weight="duotone" />
                                    )}
                                    <span className="truncate">{notification.text}</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setNotification(null)}
                                    className="min-w-[44px] min-h-[44px] flex items-center justify-center opacity-60 hover:opacity-100 cursor-pointer text-current"
                                    aria-label="Dismiss notification"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        )}

                        {/* Search & View Toolbar */}
                        <div className="p-4 sm:p-5 border-b border-black/5 dark:border-white/5 bg-light-fill/30 dark:bg-dark-fill/20 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
                            <div className="w-full sm:max-w-md">
                                <Input
                                    type="text"
                                    placeholder="Filter by carrier name, code, domain..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    leftElement={<MagnifyingGlass className="text-light-text-secondary dark:text-dark-text-secondary w-4 h-4" />}
                                    rightElement={
                                        searchQuery ? (
                                            <button
                                                type="button"
                                                onClick={() => setSearchQuery('')}
                                                className="min-w-[36px] min-h-[36px] flex items-center justify-center text-light-text-secondary hover:text-light-text dark:hover:text-dark-text cursor-pointer"
                                                aria-label="Clear search"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        ) : undefined
                                    }
                                    className="text-xs"
                                />
                            </div>

                            <div className="flex items-center justify-between sm:justify-end gap-3">
                                <span className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
                                    {filteredCarriers.length} of {carriers.length} Carriers
                                </span>

                                {/* View Switcher (Visible on tablet/desktop) */}
                                <div className="hidden sm:flex items-center bg-black/5 dark:bg-white/5 p-1 rounded-xl border border-black/5 dark:border-white/5">
                                    <button
                                        type="button"
                                        onClick={() => setViewMode('cards')}
                                        className={`min-h-[36px] px-3 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${viewMode === 'cards'
                                                ? 'bg-white dark:bg-dark-card text-primary-500 shadow-xs'
                                                : 'text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text'
                                            }`}
                                        aria-label="Grid view"
                                    >
                                        <SquaresFour className="w-4 h-4" />
                                        <span>Cards</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setViewMode('table')}
                                        className={`min-h-[36px] px-3 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${viewMode === 'table'
                                                ? 'bg-white dark:bg-dark-card text-primary-500 shadow-xs'
                                                : 'text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text'
                                            }`}
                                        aria-label="Table view"
                                    >
                                        <Table className="w-4 h-4" />
                                        <span>Table</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 p-4 sm:p-6 overflow-y-auto custom-scrollbar min-h-[420px]">
                            {carriers.length === 0 ? (
                                <EmptyState
                                    icon={<Airplane className="w-7 h-7 text-primary-500" weight="duotone" />}
                                    title="No Operating Carriers Configured"
                                    description="Auto-detect operating airlines from your existing flight log, or register custom IATA codes and Brandfetch domains."
                                    action={{
                                        label: "Add First Carrier",
                                        onClick: handleOpenAddDrawer,
                                        icon: <Plus className="w-4 h-4" />
                                    }}
                                    secondaryAction={{
                                        label: "Auto-Fill from Flights",
                                        onClick: handleAutoPopulate,
                                        icon: <ArrowsClockwise className="w-4 h-4" weight="duotone" />
                                    }}
                                />
                            ) : filteredCarriers.length === 0 ? (
                                <EmptyState
                                    icon={<MagnifyingGlass className="w-7 h-7 text-primary-500" />}
                                    title="No Matching Carriers"
                                    description={`We couldn't find any carriers matching "${searchQuery}". Try a different airline name or code.`}
                                    action={{
                                        label: "Clear Search",
                                        onClick: () => setSearchQuery(''),
                                        icon: <X className="w-4 h-4" />
                                    }}
                                />
                            ) : viewMode === 'cards' ? (
                                /* Responsive Mobile-First Card Grid */
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 sm:gap-4">
                                    {filteredCarriers.map(c => {
                                        const displayName = getCleanName(c);
                                        return (
                                            <div
                                                key={c.id}
                                                className="p-4 rounded-2xl bg-light-fill/40 dark:bg-dark-fill/30 border border-black/5 dark:border-white/5 hover:border-primary-500/20 hover:shadow-glass-card transition-all flex flex-col justify-between gap-4 group"
                                            >
                                                {/* Card Header & Identity */}
                                                <div className="flex items-start gap-3 min-w-0">
                                                    <CarrierImage
                                                        domain={c.domain}
                                                        alt={displayName}
                                                        className="w-12 h-12 shrink-0"
                                                        apiKey={config.brandfetchApiKey}
                                                        fill
                                                    />
                                                    <div className="min-w-0 flex-1">
                                                        <h4 className="text-sm font-bold text-light-text dark:text-dark-text truncate leading-tight">
                                                            {displayName}
                                                        </h4>
                                                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                                            <span className="text-2xs font-mono font-bold px-2 py-0.5 rounded-lg bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-500/20 uppercase shrink-0">
                                                                {c.code}
                                                            </span>
                                                            <a
                                                                href={`https://${c.domain}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-2xs font-mono text-light-text-secondary hover:text-primary-500 transition-colors inline-flex items-center gap-1 truncate max-w-[140px]"
                                                            >
                                                                <span className="truncate">{c.domain}</span>
                                                                <ArrowSquareOut className="w-3 h-3 shrink-0" />
                                                            </a>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Card Footer Actions (Apple HIG 44px targets) */}
                                                <div className="flex items-center justify-end gap-2 pt-3 border-t border-black/5 dark:border-white/5">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenEditDrawer(c)}
                                                        className="min-h-[44px] px-3.5 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-light-text dark:text-dark-text flex items-center gap-1.5 text-xs font-bold transition-all cursor-pointer"
                                                        aria-label={`Edit ${displayName}`}
                                                    >
                                                        <PencilSimple className="w-4 h-4 text-primary-500" />
                                                        <span>Edit</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setDeletingCarrier(c)}
                                                        className="min-h-[44px] min-w-[44px] px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 flex items-center justify-center gap-1 text-xs font-bold transition-all cursor-pointer"
                                                        aria-label={`Delete ${displayName}`}
                                                    >
                                                        <Trash className="w-4 h-4" />
                                                        <span className="hidden xs:inline">Delete</span>
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                /* Dense Desktop Table View */
                                <div className="bg-white/40 dark:bg-dark-card/40 border border-black/5 dark:border-white/5 rounded-2xl overflow-y-auto overflow-x-auto custom-scrollbar">
                                    <table className="w-full text-left border-collapse min-w-[540px]">
                                        <thead className="sticky top-0 z-10 bg-light-fill/90 dark:bg-dark-fill/90 backdrop-blur-md">
                                            <tr className="border-b border-black/5 dark:border-white/5 text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
                                                <th className="py-3.5 pl-4 w-[68px]">Logo</th>
                                                <th className="py-3.5 px-3">Carrier Name</th>
                                                <th className="py-3.5 px-3 w-[110px]">IATA Code</th>
                                                <th className="py-3.5 px-3">Brandfetch Domain</th>
                                                <th className="py-3.5 pr-4 w-[120px] text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-black/5 dark:divide-white/5">
                                            {filteredCarriers.map(c => {
                                                const displayName = getCleanName(c);
                                                return (
                                                    <tr key={c.id} className="hover:bg-black/2 dark:hover:bg-white/2 transition-colors">
                                                        <td className="py-3 pl-4">
                                                            <CarrierImage domain={c.domain} alt={displayName} className="w-9 h-9 shrink-0" apiKey={config.brandfetchApiKey} fill />
                                                        </td>
                                                        <td className="py-3 px-3 align-middle">
                                                            <span className="font-bold text-light-text dark:text-dark-text text-xs block">{displayName}</span>
                                                        </td>
                                                        <td className="py-3 px-3 align-middle">
                                                            <span className="text-2xs font-mono font-bold px-2 py-0.5 rounded-lg bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-500/20 uppercase shrink-0">
                                                                {c.code}
                                                            </span>
                                                        </td>
                                                        <td className="py-3 px-3 align-middle font-mono">
                                                            <a
                                                                href={`https://${c.domain}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-2xs text-light-text-secondary hover:text-primary-500 transition-colors inline-flex items-center gap-1"
                                                            >
                                                                <span>{c.domain}</span>
                                                                <ArrowSquareOut className="w-3 h-3" />
                                                            </a>
                                                        </td>
                                                        <td className="py-3 pr-4 align-middle text-right">
                                                            <div className="flex gap-1.5 justify-end">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleOpenEditDrawer(c)}
                                                                    className="min-w-[44px] min-h-[44px] rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 flex items-center justify-center text-light-text-secondary hover:text-primary-500 transition-colors cursor-pointer"
                                                                    aria-label={`Edit ${displayName}`}
                                                                >
                                                                    <PencilSimple className="w-4 h-4" />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setDeletingCarrier(c)}
                                                                    className="min-w-[44px] min-h-[44px] rounded-xl bg-rose-500/10 hover:bg-rose-500/20 flex items-center justify-center text-rose-500 transition-colors cursor-pointer"
                                                                    aria-label={`Delete ${displayName}`}
                                                                >
                                                                    <Trash className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </GlassPanel>
            </div>

            {/* Standard Slide-Out Drawer for Registering / Editing Carrier */}
            <StandardDrawer
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                title={editingId ? 'Edit Carrier' : 'Register Carrier'}
                subtitle={editingId ? `Update ${formName || 'carrier'} settings` : 'Configure airline code and Brandfetch domain mapping'}
                tag={formCode.trim() ? formCode.trim().toUpperCase() : 'NEW'}
                icon="airplane"
                footerActions={
                    <div className="flex items-center justify-between gap-3 w-full">
                        <Button
                            variant="secondary"
                            onClick={() => setIsDrawerOpen(false)}
                            className="shrink-0"
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleSaveCarrierFromDrawer}
                            disabled={!formName.trim() || !formCode.trim() || !formDomain.trim()}
                            className="shrink-0"
                            icon={<Check className="w-4 h-4" />}
                        >
                            <span>{editingId ? 'Save Changes' : 'Register Carrier'}</span>
                        </Button>
                    </div>
                }
            >
                <div className="space-y-6">
                    {/* Primary Identifier Hero Input */}
                    <div className="space-y-2">
                        <label className="block text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
                            Carrier Name <span className="text-rose-500">*</span>
                        </label>
                        <Input
                            type="text"
                            placeholder="e.g. British Airways"
                            value={formName}
                            onChange={e => setFormName(e.target.value)}
                            required
                            autoFocus
                        />
                    </div>

                    {/* Airline Code & Brandfetch Domain Group */}
                    <div className="p-5 rounded-3xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5 space-y-4">
                        <span className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block">
                            Provider Parameters
                        </span>

                        <div className="space-y-1.5">
                            <label className="block text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
                                Airline Code / IATA <span className="text-rose-500">*</span>
                            </label>
                            <Input
                                type="text"
                                placeholder="e.g. BA"
                                value={formCode}
                                onChange={e => setFormCode(e.target.value.toUpperCase())}
                                maxLength={3}
                                className="font-mono font-bold uppercase"
                                required
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="block text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
                                Brandfetch Domain <span className="text-rose-500">*</span>
                            </label>
                            <Input
                                type="text"
                                placeholder="e.g. britishairways.com"
                                value={formDomain}
                                onChange={e => setFormDomain(e.target.value.toLowerCase())}
                                className="font-mono"
                                required
                            />
                        </div>
                    </div>

                    {/* Live Identity Preview Card */}
                    {formDomain.trim() && (
                        <div className="p-4 rounded-2xl bg-white/70 dark:bg-dark-card/70 border border-black/5 dark:border-white/10 flex items-center gap-3.5 shadow-sm">
                            <CarrierImage
                                domain={formDomain}
                                alt={formName || "Preview"}
                                className="w-12 h-12 shrink-0"
                                apiKey={config.brandfetchApiKey}
                                fill
                            />
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-light-text dark:text-dark-text truncate">
                                        {formName.trim() || 'Carrier Name'}
                                    </span>
                                    {formCode.trim() && (
                                        <span className="text-2xs font-mono font-bold px-2 py-0.5 rounded bg-primary-500/10 text-primary-500 uppercase">
                                            {formCode.trim().toUpperCase()}
                                        </span>
                                    )}
                                </div>
                                <span className="text-2xs font-mono text-light-text-secondary dark:text-dark-text-secondary truncate block mt-0.5">
                                    {formDomain.trim().toLowerCase()}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Popular Quick Presets (Shown when adding new carrier) */}
                    {!editingId && (
                        <div className="p-4 rounded-2xl bg-light-fill/50 dark:bg-dark-fill/30 border border-black/5 dark:border-white/5 space-y-2.5">
                            <div className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
                                <Sparkle className="w-3.5 h-3.5 text-primary-500" />
                                <span>Popular Presets</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {POPULAR_CARRIERS.map(preset => (
                                    <button
                                        key={preset.code}
                                        type="button"
                                        onClick={() => handleSelectPreset(preset)}
                                        className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-dark-card hover:bg-primary-500/10 dark:hover:bg-primary-500/20 text-light-text dark:text-dark-text hover:text-primary-500 border border-black/5 dark:border-white/5 text-2xs font-semibold transition-all cursor-pointer flex items-center gap-1.5"
                                    >
                                        <span className="font-mono font-bold text-primary-500">{preset.code}</span>
                                        <span>{preset.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </StandardDrawer>

            {/* Remove Confirmation Modal */}
            {deletingCarrier && (
                <div className="fixed inset-0 z-modal flex items-center justify-center p-4">
                    <div
                        className="fixed inset-0 bg-gray-900/50 dark:bg-black/80 backdrop-blur-md transition-opacity"
                        style={{ WebkitBackdropFilter: 'blur(12px)' }}
                        onClick={() => setDeletingCarrier(null)}
                    />
                    <div className="relative w-full max-w-sm">
                        <GlassPanel className="wg-glass-card shadow-2xl p-6 rounded-3xl" overrides={{ borderRadius: 24 }} padding="0px">
                            <div className="p-6 flex flex-col items-center text-center">
                                <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center mb-4">
                                    <Trash className="w-6 h-6" />
                                </div>
                                <h3 className="text-base font-bold text-light-text dark:text-dark-text">Remove Carrier?</h3>
                                <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-1.5">
                                    Are you sure you want to remove <span className="font-bold text-light-text dark:text-dark-text">{deletingCarrier.name}</span> ({deletingCarrier.code})?
                                </p>
                                <div className="flex items-center gap-3 mt-6 w-full">
                                    <Button
                                        variant="secondary"
                                        className="flex-1"
                                        onClick={() => setDeletingCarrier(null)}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        variant="danger"
                                        className="flex-1"
                                        onClick={handleConfirmDelete}
                                    >
                                        Remove
                                    </Button>
                                </div>
                            </div>
                        </GlassPanel>
                    </div>
                </div>
            )}
        </div>
    );
};
