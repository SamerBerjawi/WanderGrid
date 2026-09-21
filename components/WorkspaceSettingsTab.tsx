import React, { useState } from 'react';
import { 
    CheckCircle, 
    GearSix, 
    MapTrifold, 
    Thermometer, 
    Sparkle, 
    AirplaneTilt, 
    ArrowSquareOut, 
    Image, 
    UserPlus, 
    UserMinus, 
    PencilSimple, 
    Trash, 
    DownloadSimple, 
    UploadSimple, 
    Warning,
    CalendarBlank,
    Rss,
    MagicWand,
    ArrowsClockwise,
    DeviceMobile,
    HardDrive,
    WifiHigh,
    WifiSlash
} from '@phosphor-icons/react';
import { Card, Button, Input, Select, Modal } from './ui';
import { User, WorkspaceSettings, SavedConfig } from '../types';
import { ImportState, dataService } from '../services/mockDb';
import { usePWA, StorageEstimateInfo } from '../hooks/usePWA';

interface WorkspaceSettingsTabProps {
    config: WorkspaceSettings;
    setConfig: (config: WorkspaceSettings) => void;
    handleSaveOrgSettings: () => Promise<void>;
    isSavingOrg: boolean;
    toggleWorkingDay: (d: number) => void;
    users: User[];
    savedConfigs: SavedConfig[];
    handleCreateUser: () => void;
    handleEditUser: (u: User) => void;
    initiateDeleteMember: (u: User) => void;
    handleExport: () => Promise<void>;
    handleImportTrigger: () => void;
    fileInputRef: React.RefObject<HTMLInputElement>;
    handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleCalendarExport: () => Promise<void>;
    handleCopySubscriptionLink: () => void;
    onOpenFlightWizard: () => void;
    handleFlightExport: (type: 'json' | 'csv' | 'airtrail' | 'xlsx') => Promise<void>;
    importState: ImportState;
    isGeminiActive: boolean;
    hasUserKey: boolean;
    hasEnvKey: boolean;
}

export const WorkspaceSettingsTab: React.FC<WorkspaceSettingsTabProps> = ({
    config, setConfig, handleSaveOrgSettings, isSavingOrg, toggleWorkingDay,
    users, savedConfigs, handleCreateUser, handleEditUser, initiateDeleteMember,
    handleExport, handleImportTrigger, fileInputRef, handleFileSelect,
    handleCalendarExport, handleCopySubscriptionLink, onOpenFlightWizard, handleFlightExport, importState,
    isGeminiActive, hasUserKey, hasEnvKey
}) => {
    const [isResetModalOpen, setIsResetModalOpen] = useState(false);
    const [resetConfirmText, setResetConfirmText] = useState('');
    const [storageInfo, setStorageInfo] = useState<StorageEstimateInfo | null>(null);
    const [isClearingCache, setIsClearingCache] = useState(false);

    const { 
        isInstalled, 
        isInstallable, 
        isOnline, 
        isUpdateAvailable, 
        platform, 
        promptInstall, 
        updateApp, 
        getStorageEstimate, 
        clearAppCache 
    } = usePWA();

    React.useEffect(() => {
        getStorageEstimate().then(setStorageInfo);
    }, [getStorageEstimate]);

    const handleClearCache = async () => {
        if (window.confirm("Are you sure you want to clear the offline cache and reload? Any unsaved changes may be lost.")) {
            setIsClearingCache(true);
            await clearAppCache();
        }
    };

    const handleWipeDatabase = async () => {
        if (resetConfirmText === 'DELETE') {
            try {
                await dataService.wipeDatabase();
            } catch (e) {
                console.error("Wipe failed", e);
            }
            window.location.reload();
        }
    };

    return (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
            <div className="xl:col-span-8 space-y-8">
                <Card noPadding className="rounded-3xl overflow-visible">
                    <div className="p-8 border-b border-gray-100 dark:border-white/5 bg-gradient-to-r from-blue-500/5 to-indigo-500/5 rounded-t-3xl">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                            <div className="flex items-center gap-6">
                                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 shadow-2xl flex items-center justify-center text-white text-3xl font-black rotate-3">
                                    {config.orgName.charAt(0) || 'W'}
                                </div>
                                <div className="space-y-1">
                                    <h3 className="text-2xl font-black text-gray-900 dark:text-white leading-none">Workspace Identity</h3>
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Global Identity & Region</p>
                                </div>
                            </div>
                            <Button variant="primary" size="lg" className="!rounded-2xl shadow-xl shadow-blue-500/20" onClick={handleSaveOrgSettings} isLoading={isSavingOrg} icon={<CheckCircle weight="bold" className="text-lg" />}>Commit Changes</Button>
                        </div>
                    </div>

                    <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Input label="Workspace Name" placeholder="WanderGrid Workspace" value={config.orgName} onChange={e => setConfig({...config, orgName: e.target.value})} />
                        <Select label="Locality: Currency" value={config.currency} onChange={e => setConfig({...config, currency: e.target.value})} options={[{ label: 'AUD', value: 'AUD' }, { label: 'EUR', value: 'EUR' }, { label: 'GBP', value: 'GBP' }, { label: 'USD', value: 'USD' }]} />
                        <Select label="Temporal Format" value={config.dateFormat || 'ddd D MMM, YYYY'} onChange={e => setConfig({...config, dateFormat: e.target.value})} options={[{ label: 'Mon 21 Sep, 2026 (Default)', value: 'ddd D MMM, YYYY' }, { label: 'MM/DD/YYYY', value: 'MM/DD/YYYY' }, { label: 'DD/MM/YYYY', value: 'DD/MM/YYYY' }, { label: 'YYYY-MM-DD', value: 'YYYY-MM-DD' }]} />
                        <Select label="UI Theme" value={config.theme} onChange={e => setConfig({...config, theme: e.target.value as any})} options={[{ label: 'System Auto', value: 'auto' }, { label: 'Dark Mode', value: 'dark' }, { label: 'Light Mode', value: 'light' }]} />
                        <div className="md:col-span-2">
                            <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide ml-1">Operational Days</label>
                            <div className="flex gap-2 mt-2">
                                {['S','M','T','W','T','F','S'].map((d, i) => (
                                    <button 
                                        key={i} 
                                        onClick={() => toggleWorkingDay(i)}
                                        className={`w-10 h-10 rounded-xl font-black text-sm transition-all ${config.workingDays.includes(i) ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'bg-gray-100 dark:bg-white/5 text-gray-400'}`}
                                    >
                                        {d}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Defaults Section */}
                        <div className="border-t border-gray-100 dark:border-white/5 pt-6 md:col-span-3 space-y-4">
                            <h4 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
                                <GearSix weight="duotone" className="text-lg text-blue-500" />
                                Transit & Travel Defaults
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <Select 
                                    label="Default Travel Class" 
                                    value={config.defaultTravelClass || 'Economy'} 
                                    onChange={e => setConfig({...config, defaultTravelClass: e.target.value as any})} 
                                    options={[
                                        { label: 'Economy', value: 'Economy' },
                                        { label: 'Premium Economy', value: 'Premium Economy' },
                                        { label: 'Business', value: 'Business' },
                                        { label: 'First', value: 'First' }
                                    ]} 
                                />
                                <Input 
                                    label="Default Starting Airport (IATA)" 
                                    placeholder="e.g. LAX, LHR, SYD" 
                                    maxLength={3}
                                    value={config.defaultStartingAirport || ''} 
                                    onChange={e => setConfig({...config, defaultStartingAirport: e.target.value.toUpperCase()})} 
                                />
                                <Select 
                                    label="Default Land Transport" 
                                    value={config.defaultLandTransportMethod || 'Train'} 
                                    onChange={e => setConfig({...config, defaultLandTransportMethod: e.target.value as any})} 
                                    options={[
                                        { label: 'Train', value: 'Train' },
                                        { label: 'Bus', value: 'Bus' },
                                        { label: 'Car Rental', value: 'Car Rental' },
                                        { label: 'Personal Car', value: 'Personal Car' },
                                        { label: 'Cruise', value: 'Cruise' },
                                        { label: 'Ferry', value: 'Ferry' }
                                    ]} 
                                />
                            </div>
                        </div>
                    </div>
                    
                    <div className="p-8 border-t border-gray-100 dark:border-white/5 bg-gray-50/30 dark:bg-white/5 space-y-6">
                        <h4 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest">System Integrations</h4>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* OpenStreetMap - Always Active */}
                            <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-white/10 rounded-2xl">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                                        <MapTrifold weight="duotone" className="text-xl" />
                                    </div>
                                    <div>
                                        <h5 className="font-bold text-gray-900 dark:text-white text-sm">OpenStreetMap</h5>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">Geocoding & Location</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 rounded-lg border border-emerald-100 dark:border-emerald-900/30">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                    <span className="text-2xs font-bold uppercase tracking-wider">Active</span>
                                </div>
                            </div>

                            {/* Open-Meteo */}
                            <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-white/10 rounded-2xl">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 flex items-center justify-center">
                                        <Thermometer weight="duotone" className="text-xl" />
                                    </div>
                                    <div>
                                        <h5 className="font-bold text-gray-900 dark:text-white text-sm">Open-Meteo</h5>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">Live Weather Recon</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 rounded-lg border border-emerald-100 dark:border-emerald-900/30">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                    <span className="text-2xs font-bold uppercase tracking-wider">Active</span>
                                </div>
                            </div>

                            {/* Gemini AI */}
                            <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-white/10 rounded-2xl space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                                            <Sparkle weight="duotone" className="text-xl" />
                                        </div>
                                        <div>
                                            <h5 className="font-bold text-gray-900 dark:text-white text-sm">Google Gemini</h5>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">Generative AI Models</p>
                                        </div>
                                    </div>
                                    
                                    <div className={`flex items-center gap-2 px-3 py-1 rounded-lg border ${isGeminiActive ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-100 dark:border-emerald-900/30' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-100 dark:border-amber-900/30'}`}>
                                        <div className={`w-2 h-2 rounded-full ${isGeminiActive ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                                        <span className="text-2xs font-bold uppercase tracking-wider">
                                            {hasUserKey ? 'Active (User)' : hasEnvKey ? 'Active (Env)' : 'No API Key'}
                                        </span>
                                    </div>
                                </div>
                                <Input 
                                    placeholder="Paste Gemini API Key..." 
                                    type="password"
                                    value={config.googleGeminiApiKey || ''} 
                                    onChange={e => setConfig({...config, googleGeminiApiKey: e.target.value})} 
                                    className="!bg-gray-50 dark:!bg-black/20"
                                />
                            </div>

                            {/* AviationStack */}
                            <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-white/10 rounded-2xl space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                                            <AirplaneTilt weight="duotone" className="text-xl" />
                                        </div>
                                        <div>
                                            <h5 className="font-bold text-gray-900 dark:text-white text-sm">AviationStack</h5>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">Flight Status</p>
                                        </div>
                                    </div>
                                    <a 
                                        href="https://aviationstack.com" 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-xs font-bold text-blue-500 hover:underline uppercase tracking-wider flex items-center gap-1"
                                    >
                                        Get Key <ArrowSquareOut weight="bold" className="text-xs" />
                                    </a>
                                </div>
                                <Input 
                                    placeholder="Paste API Key..." 
                                    type="password"
                                    value={config.aviationStackApiKey || ''} 
                                    onChange={e => setConfig({...config, aviationStackApiKey: e.target.value})} 
                                    className="!bg-gray-50 dark:!bg-black/20"
                                />
                            </div>

                            {/* Brandfetch */}
                            <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-white/10 rounded-2xl space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400 flex items-center justify-center">
                                            <Image weight="duotone" className="text-xl" />
                                        </div>
                                        <div>
                                            <h5 className="font-bold text-gray-900 dark:text-white text-sm">Brandfetch</h5>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">Logos & Assets</p>
                                        </div>
                                    </div>
                                    <a 
                                        href="https://brandfetch.com/developers" 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-xs font-bold text-blue-500 hover:underline uppercase tracking-wider flex items-center gap-1"
                                    >
                                        Get Key <ArrowSquareOut weight="bold" className="text-xs" />
                                    </a>
                                </div>
                                <Input 
                                    placeholder="Paste API Key..." 
                                    type="password"
                                    value={config.brandfetchApiKey || ''} 
                                    onChange={e => setConfig({...config, brandfetchApiKey: e.target.value})} 
                                    className="!bg-gray-50 dark:!bg-black/20"
                                />
                            </div>

                            {/* CARTO Maps API */}
                            <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-white/10 rounded-2xl space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 flex items-center justify-center">
                                            <MapTrifold weight="duotone" className="text-xl" />
                                        </div>
                                        <div>
                                            <h5 className="font-bold text-gray-900 dark:text-white text-sm">CARTO Maps API</h5>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">High-contrast basemaps & custom cartography</p>
                                        </div>
                                    </div>
                                    <a 
                                        href="https://carto.com/basemaps/apikey/" 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-xs font-bold text-blue-500 hover:underline uppercase tracking-wider flex items-center gap-1"
                                    >
                                        Get Key <ArrowSquareOut weight="bold" className="text-xs" />
                                    </a>
                                </div>
                                <Input 
                                    placeholder="Optional CARTO API Key..." 
                                    type="password"
                                    value={config.cartoApiKey || ''} 
                                    onChange={e => setConfig({...config, cartoApiKey: e.target.value})} 
                                    className="!bg-gray-50 dark:!bg-black/20"
                                />
                            </div>
                        </div>
                    </div>
                </Card>

                <Card noPadding className="rounded-3xl">
                    <div className="p-8 border-b border-gray-100 dark:border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1">
                            <h3 className="text-2xl font-black text-gray-900 dark:text-white leading-none">Personnel Roster</h3>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Management of workspace inhabitants</p>
                        </div>
                        <Button variant="secondary" className="!rounded-xl border-2" icon={<UserPlus weight="bold" className="text-lg" />} onClick={handleCreateUser}>Enroll New Member</Button>
                    </div>

                    <div className="p-4 space-y-3">
                        {users.length === 0 ? (
                            <div className="py-16 text-center">
                                <UserMinus weight="duotone" className="text-gray-200 dark:text-gray-800 text-6xl mx-auto" />
                                <p className="text-gray-400 mt-4 font-bold uppercase tracking-widest text-xs">No active personnel data</p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {users.map(user => {
                                    return (
                                        <div key={user.id} className="group relative flex flex-col lg:flex-row lg:items-center justify-between p-4 rounded-2xl bg-white border border-gray-100 dark:bg-gray-900/60 dark:border-white/5 hover:border-blue-200 dark:hover:border-blue-800 transition-all hover:shadow-xl hover:translate-x-1">
                                            <div className="flex items-center gap-4 flex-1">
                                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-black text-white shadow-lg transition-transform group-hover:scale-110 ${user.role === 'Partner' ? 'bg-gradient-to-br from-blue-500 to-indigo-600' : 'bg-gradient-to-br from-emerald-500 to-teal-600'}`}>
                                                    {user.name?.charAt(0) || '?'}
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-gray-800 dark:text-white text-base leading-none">{user.name}</h4>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className={`text-2xs font-bold uppercase tracking-widest ${user.role === 'Partner' ? 'text-blue-500' : 'text-emerald-500'}`}>{user.role}</span>
                                                        {user.email && (
                                                            <span className="text-2xs text-gray-400 font-bold uppercase tracking-widest px-1 border-l border-gray-300 dark:border-white/10">
                                                                {user.email}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <div className="flex items-center gap-1 mt-4 lg:mt-0 pl-4 border-l border-gray-100 dark:border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => handleEditUser(user)} className="p-2 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg" aria-label="Edit user"><PencilSimple weight="bold" className="text-lg" /></button>
                                                <button onClick={() => initiateDeleteMember(user)} className="p-2 text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg" aria-label="Delete user"><Trash weight="bold" className="text-lg" /></button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </Card>
            </div>

            <div className="xl:col-span-4 space-y-8">
                {/* Data Operations Card */}
                <Card noPadding className="rounded-3xl border-white/50 dark:border-white/10 shadow-2xl">
                    <div className="p-8 border-b border-gray-100 dark:border-white/5 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-white/5 dark:to-transparent">
                        <h3 className="text-2xl font-black text-gray-900 dark:text-white leading-none">Data Operations</h3>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-2">Persistence & Migration</p>
                    </div>
                    
                    <div className="p-6 space-y-8">
                        {/* Backup Section */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center">
                                    <ArrowsClockwise weight="duotone" className="text-lg text-blue-600" />
                                </div>
                                <h4 className="text-sm font-black text-gray-800 dark:text-white uppercase tracking-widest">Database Lifecycle</h4>
                            </div>

                            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30">
                                <div className="flex items-start gap-3">
                                    <Warning weight="fill" className="text-amber-500 text-lg mt-0.5" />
                                    <div className="space-y-1">
                                        <p className="text-xs font-bold text-amber-800 dark:text-amber-200">System Caution</p>
                                        <p className="text-xs text-amber-700/70 dark:text-amber-300/60 leading-relaxed font-medium">Restoring from a backup will overwrite all current users, trips, and workspace settings. Ensure you have a recent export.</p>
                                    </div>
                                </div>
                            </div>

                             <div className="grid grid-cols-1 gap-3">
                                <Button 
                                    onClick={handleExport} 
                                    variant="primary" 
                                    className="h-14 !rounded-2xl shadow-lg shadow-blue-500/20" 
                                    icon={<DownloadSimple weight="bold" className="text-lg" />}
                                >
                                    Generate Backup JSON
                                </Button>
                                <Button 
                                    onClick={handleImportTrigger} 
                                    variant="danger" 
                                    className="h-14 !rounded-2xl border-dashed border-2 bg-transparent hover:bg-rose-50 dark:hover:bg-rose-900/10" 
                                    icon={<UploadSimple weight="bold" className="text-lg" />}
                                >
                                    Overwrite & Restore
                                </Button>
                                <Button 
                                    onClick={() => setIsResetModalOpen(true)} 
                                    variant="danger" 
                                    className="h-14 !rounded-2xl border-2 border-red-200 dark:border-red-900/40 bg-red-50/50 hover:bg-red-100 text-red-600 dark:bg-red-505/10 dark:text-red-400 font-bold flex items-center justify-center gap-2" 
                                    icon={<Trash weight="fill" className="text-lg" />}
                                >
                                    Wipe & Reset Application Data
                                </Button>
                                <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleFileSelect} />
                            </div>
                        </div>

                        {/* Calendar Sync Section */}
                        <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-white/5">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-teal-500/10 text-teal-600 flex items-center justify-center">
                                    <CalendarBlank weight="duotone" className="text-lg text-teal-600" />
                                </div>
                                <h4 className="text-sm font-black text-gray-800 dark:text-white uppercase tracking-widest">Calendar Sync</h4>
                            </div>
                            
                            <div className="grid grid-cols-1 gap-3">
                                <Button onClick={handleCalendarExport} variant="ghost" className="bg-gray-50 dark:bg-white/5 h-12 text-xs font-bold uppercase tracking-wider !rounded-xl">
                                    <DownloadSimple weight="bold" className="text-sm mr-2" /> Download .ICS File
                                </Button>
                                <Button onClick={handleCopySubscriptionLink} variant="ghost" className="bg-gray-50 dark:bg-white/5 h-12 text-xs font-bold uppercase tracking-wider !rounded-xl">
                                    <Rss weight="bold" className="text-sm mr-2" /> Copy Sync Link
                                </Button>
                            </div>
                        </div>

                        {/* Progressive Web App & Offline Hub */}
                        <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-white/5">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center">
                                        <DeviceMobile weight="duotone" className="text-lg text-amber-600" />
                                    </div>
                                    <h4 className="text-sm font-black text-gray-800 dark:text-white uppercase tracking-widest">PWA & Offline Hub</h4>
                                </div>
                                <span className={`px-2.5 py-1 rounded-full text-2xs font-bold uppercase tracking-wider ${
                                    isInstalled 
                                        ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' 
                                        : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                                }`}>
                                    {isInstalled ? 'Installed App' : 'Browser Mode'}
                                </span>
                            </div>

                            <div className="p-4 rounded-2xl bg-gray-50 dark:bg-white/5 border border-gray-200/60 dark:border-white/5 space-y-3">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-gray-500 dark:text-gray-400 font-medium">Connectivity:</span>
                                    <span className={`font-bold flex items-center gap-1.5 ${isOnline ? 'text-emerald-500' : 'text-amber-500'}`}>
                                        {isOnline ? <WifiHigh weight="bold" /> : <WifiSlash weight="bold" />}
                                        {isOnline ? 'Connected Online' : 'Offline Mode (Cached)'}
                                    </span>
                                </div>

                                {storageInfo && (
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-gray-500 dark:text-gray-400 font-medium">Storage Cache:</span>
                                        <span className="font-mono font-bold text-gray-700 dark:text-gray-300">
                                            {storageInfo.usageMB} MB / {storageInfo.quotaMB.toLocaleString()} MB ({storageInfo.percentage}%)
                                        </span>
                                    </div>
                                )}

                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-gray-500 dark:text-gray-400 font-medium">Device Platform:</span>
                                    <span className="font-bold text-gray-700 dark:text-gray-300 capitalize">
                                        {platform}
                                    </span>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-2">
                                {!isInstalled && (
                                    <Button 
                                        onClick={() => promptInstall()} 
                                        variant="primary" 
                                        className="h-12 !rounded-xl text-xs font-bold uppercase tracking-wider"
                                        icon={<DownloadSimple weight="bold" className="text-sm" />}
                                    >
                                        Install WanderGrid App
                                    </Button>
                                )}
                                {isUpdateAvailable && (
                                    <Button 
                                        onClick={updateApp} 
                                        variant="primary" 
                                        className="h-12 !rounded-xl text-xs font-bold uppercase tracking-wider bg-sky-500 hover:bg-sky-600"
                                        icon={<ArrowsClockwise weight="bold" className="text-sm" />}
                                    >
                                        Update Available &bull; Reload
                                    </Button>
                                )}
                                <Button 
                                    onClick={handleClearCache} 
                                    variant="ghost" 
                                    className="h-12 !rounded-xl text-xs font-bold uppercase tracking-wider text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                                    icon={<HardDrive weight="bold" className="text-sm" />}
                                    isLoading={isClearingCache}
                                >
                                    Clear Offline Cache & Reload
                                </Button>
                            </div>
                        </div>

                        {/* Flight Data Section */}
                        <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-white/5">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-600 flex items-center justify-center">
                                        <AirplaneTilt weight="duotone" className="text-lg text-indigo-600" />
                                    </div>
                                    <h4 className="text-sm font-black text-gray-800 dark:text-white uppercase tracking-widest">Flight Imports & Backups</h4>
                                </div>
                            </div>

                            {/* New Flight Custom Ingestion & Field Mapper trigger block */}
                            <div className="space-y-3 bg-gradient-to-r from-blue-500/5 to-indigo-500/5 p-5 rounded-3xl border border-indigo-500/10 shadow-sm">
                                <span className="text-2xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">Unified Flight Ingestion Engine</span>
                                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
                                    Upload XLS/XLSX, CSV, or custom JSON flight rosters. Map spreadsheet columns to WanderGrid fields, validate records, deselect individual flights, and auto-compile them into organized trip folders.
                                </p>
                                <Button 
                                    onClick={onOpenFlightWizard} 
                                    variant="primary" 
                                    className="w-full h-11 text-xs font-black uppercase tracking-wider !rounded-2xl shadow-lg shadow-blue-500/15 flex items-center justify-center gap-2"
                                >
                                    <MagicWand weight="duotone" className="text-sm" />
                                    Load Flight File & Map Fields
                                </Button>
                            </div>

                             {/* Export / Backups Area */}
                            <div className="space-y-3 bg-slate-50 dark:bg-slate-950/40 p-5 rounded-3xl border border-slate-200/50 dark:border-white/5">
                                <span className="text-2xs font-bold text-slate-400 uppercase tracking-widest">Roster Exports & Backups</span>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                    <Button 
                                        onClick={() => handleFlightExport('xlsx')} 
                                        variant="secondary" 
                                        className="h-10 text-xs font-bold uppercase tracking-wider !rounded-xl"
                                    >
                                        Excel (.xlsx)
                                    </Button>
                                    <Button 
                                        onClick={() => handleFlightExport('csv')} 
                                        variant="secondary" 
                                        className="h-10 text-xs font-bold uppercase tracking-wider !rounded-xl"
                                    >
                                        CSV Table
                                    </Button>
                                    <Button 
                                        onClick={() => handleFlightExport('json')} 
                                        variant="secondary" 
                                        className="h-10 text-xs font-bold uppercase tracking-wider !rounded-xl"
                                    >
                                        JSON Data
                                    </Button>
                                </div>
                            </div>
                        </div>

                         {/* Progress Indicator */}
                        {importState.isActive && (
                            <div className="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-100 dark:border-blue-900/30">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-2xs font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">Processing Import</span>
                                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{importState.progress}%</span>
                                </div>
                                <div className="h-1.5 w-full bg-blue-100 dark:bg-blue-900/30 rounded-full overflow-hidden">
                                    <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${importState.progress}%` }} />
                                </div>
                                <p className="text-xs text-blue-500 mt-2 truncate">{importState.status}</p>
                            </div>
                        )}
                    </div>
                </Card>
            </div>

            <Modal isOpen={isResetModalOpen} onClose={() => { setIsResetModalOpen(false); setResetConfirmText(''); }} title="Consequences: Wipe Database">
                <div className="space-y-6 text-left">
                    <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30">
                        <div className="flex items-start gap-3">
                            <Warning weight="fill" className="text-red-500 text-lg mt-0.5" />
                            <div className="space-y-1">
                                <p className="text-sm font-black text-red-800 dark:text-red-400 uppercase tracking-wider">Dangerous Action</p>
                                <p className="text-xs text-red-700/80 dark:text-red-350/60 leading-relaxed font-semibold">
                                    This operation is permanent. It will irreversibly delete all listed trips, independent flights (even independent ones), user records, custom configurations, and assets.
                                </p>
                            </div>
                        </div>
                    </div>
                    
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase ml-1">Confirm deletion</label>
                        <p className="text-xs text-gray-400 dark:text-gray-500 leading-normal ml-1 mb-2">
                            Type <span className="font-extrabold text-red-600 dark:text-red-400 select-all border border-red-200 dark:border-red-905 px-1 bg-red-50 dark:bg-black/20 rounded">DELETE</span> to unlock the wipes process.
                        </p>
                        <Input 
                            placeholder="Type DELETE here" 
                            value={resetConfirmText} 
                            onChange={(e) => setResetConfirmText(e.target.value)} 
                        />
                    </div>

                    <div className="flex gap-4 pt-4 border-t border-gray-100 dark:border-white/5">
                        <Button 
                            variant="ghost" 
                            className="flex-1" 
                            onClick={() => { setIsResetModalOpen(false); setResetConfirmText(''); }}
                        >
                            Cancel
                        </Button>
                        <Button 
                            variant="danger" 
                            className="flex-1 bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/20 disabled:opacity-50 disabled:bg-gray-300 dark:disabled:bg-gray-800" 
                            onClick={handleWipeDatabase}
                            disabled={resetConfirmText !== 'DELETE'}
                        >
                            YES, WIPE DATABASE
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
