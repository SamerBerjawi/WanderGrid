import React, { useState } from 'react';
import { Card, Button, Input, Select, Modal } from './ui';
import { User, WorkspaceSettings, SavedConfig } from '../types';
import { ImportState } from '../services/mockDb';

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

    const handleWipeDatabase = () => {
        if (resetConfirmText === 'DELETE') {
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('wandergrid_') || key === 'flightFormDraft') {
                    localStorage.removeItem(key);
                }
            });
            window.location.reload();
        }
    };

    return (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
            <div className="xl:col-span-8 space-y-8">
                <Card noPadding className="rounded-[2rem] overflow-visible">
                    <div className="p-8 border-b border-gray-100 dark:border-white/5 bg-gradient-to-r from-blue-500/5 to-indigo-500/5 rounded-t-[2rem]">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                            <div className="flex items-center gap-6">
                                <div className="w-20 h-20 rounded-[2rem] bg-gradient-to-br from-blue-600 to-indigo-700 shadow-2xl flex items-center justify-center text-white text-3xl font-black rotate-3">
                                    {config.orgName.charAt(0) || 'W'}
                                </div>
                                <div className="space-y-1">
                                    <h3 className="text-2xl font-black text-gray-900 dark:text-white leading-none">Workspace Identity</h3>
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Global Identity & Region</p>
                                </div>
                            </div>
                            <Button variant="primary" size="lg" className="!rounded-2xl shadow-xl shadow-blue-500/20" onClick={handleSaveOrgSettings} isLoading={isSavingOrg} icon={<span className="material-icons-outlined">check_circle</span>}>Commit Changes</Button>
                        </div>
                    </div>

                    <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Input label="Workspace Name" placeholder="WanderGrid Workspace" value={config.orgName} onChange={e => setConfig({...config, orgName: e.target.value})} />
                        <Select label="Locality: Currency" value={config.currency} onChange={e => setConfig({...config, currency: e.target.value})} options={[{ label: 'AUD', value: 'AUD' }, { label: 'EUR', value: 'EUR' }, { label: 'GBP', value: 'GBP' }, { label: 'USD', value: 'USD' }]} />
                        <Select label="Temporal Format" value={config.dateFormat} onChange={e => setConfig({...config, dateFormat: e.target.value})} options={[{ label: 'MM/DD/YYYY', value: 'MM/DD/YYYY' }, { label: 'DD/MM/YYYY', value: 'DD/MM/YYYY' }, { label: 'YYYY-MM-DD', value: 'YYYY-MM-DD' }]} />
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
                    </div>
                    
                    <div className="p-8 border-t border-gray-100 dark:border-white/5 bg-gray-50/30 dark:bg-white/5 space-y-6">
                        <h4 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest">System Integrations</h4>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* OpenStreetMap - Always Active */}
                            <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-white/10 rounded-2xl">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                                        <span className="material-icons-outlined">map</span>
                                    </div>
                                    <div>
                                        <h5 className="font-bold text-gray-900 dark:text-white text-sm">OpenStreetMap</h5>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">Geocoding & Location</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 rounded-lg border border-emerald-100 dark:border-emerald-900/30">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                    <span className="text-[10px] font-black uppercase tracking-wider">Active</span>
                                </div>
                            </div>

                            {/* Open-Meteo */}
                            <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-white/10 rounded-2xl">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 flex items-center justify-center">
                                        <span className="material-icons-outlined">thermostat</span>
                                    </div>
                                    <div>
                                        <h5 className="font-bold text-gray-900 dark:text-white text-sm">Open-Meteo</h5>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">Live Weather Recon</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 rounded-lg border border-emerald-100 dark:border-emerald-900/30">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                    <span className="text-[10px] font-black uppercase tracking-wider">Active</span>
                                </div>
                            </div>

                            {/* Gemini AI */}
                            <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-white/10 rounded-2xl space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                                            <span className="material-icons-outlined">auto_awesome</span>
                                        </div>
                                        <div>
                                            <h5 className="font-bold text-gray-900 dark:text-white text-sm">Google Gemini</h5>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">Generative AI Models</p>
                                        </div>
                                    </div>
                                    
                                    <div className={`flex items-center gap-2 px-3 py-1 rounded-lg border ${isGeminiActive ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-100 dark:border-emerald-900/30' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-100 dark:border-amber-900/30'}`}>
                                        <div className={`w-2 h-2 rounded-full ${isGeminiActive ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                                        <span className="text-[10px] font-black uppercase tracking-wider">
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
                                            <span className="material-icons-outlined">flight</span>
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
                                        className="text-[10px] font-bold text-blue-500 hover:underline uppercase tracking-wider flex items-center gap-1"
                                    >
                                        Get Key <span className="material-icons-outlined text-[10px]">open_in_new</span>
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
                                            <span className="material-icons-outlined">image</span>
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
                                        className="text-[10px] font-bold text-blue-500 hover:underline uppercase tracking-wider flex items-center gap-1"
                                    >
                                        Get Key <span className="material-icons-outlined text-[10px]">open_in_new</span>
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
                        </div>
                    </div>
                </Card>

                <Card noPadding className="rounded-[2rem]">
                    <div className="p-8 border-b border-gray-100 dark:border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1">
                            <h3 className="text-2xl font-black text-gray-900 dark:text-white leading-none">Personnel Roster</h3>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Management of workspace inhabitants</p>
                        </div>
                        <Button variant="secondary" className="!rounded-xl border-2" icon={<span className="material-icons-outlined text-lg">person_add</span>} onClick={handleCreateUser}>Enroll New Member</Button>
                    </div>

                    <div className="p-4 space-y-3">
                        {users.length === 0 ? (
                            <div className="py-16 text-center">
                                <span className="material-icons-outlined text-gray-200 dark:text-gray-800 text-6xl">person_off</span>
                                <p className="text-gray-400 mt-4 font-bold uppercase tracking-widest text-xs">No active personnel data</p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {users.map(user => {
                                    const selectedHolidays = savedConfigs.filter(c => user.holidayConfigIds?.includes(c.id));
                                    return (
                                        <div key={user.id} className="group relative flex flex-col lg:flex-row lg:items-center justify-between p-4 rounded-2xl bg-white border border-gray-100 dark:bg-gray-900/60 dark:border-white/5 hover:border-blue-200 dark:hover:border-blue-800 transition-all hover:shadow-xl hover:translate-x-1">
                                            <div className="flex items-center gap-4 flex-1">
                                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-black text-white shadow-lg transition-transform group-hover:scale-110 ${user.role === 'Partner' ? 'bg-gradient-to-br from-blue-500 to-indigo-600' : 'bg-gradient-to-br from-emerald-500 to-teal-600'}`}>
                                                    {user.name?.charAt(0) || '?'}
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-gray-800 dark:text-white text-base leading-none">{user.name}</h4>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className={`text-[9px] font-black uppercase tracking-widest ${user.role === 'Partner' ? 'text-blue-500' : 'text-emerald-500'}`}>{user.role}</span>
                                                        {user.email && (
                                                            <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest px-1 border-l border-gray-300 dark:border-white/10">
                                                                {user.email}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <div className="flex items-center gap-1 mt-4 lg:mt-0 pl-4 border-l border-gray-100 dark:border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => handleEditUser(user)} className="p-2 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg"><span className="material-icons-outlined text-lg">edit</span></button>
                                                <button onClick={() => initiateDeleteMember(user)} className="p-2 text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg"><span className="material-icons-outlined text-lg">delete</span></button>
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
                <Card noPadding className="rounded-[2rem] border-white/50 dark:border-white/10 shadow-2xl">
                    <div className="p-8 border-b border-gray-100 dark:border-white/5 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-white/5 dark:to-transparent">
                        <h3 className="text-2xl font-black text-gray-900 dark:text-white leading-none">Data Operations</h3>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-2">Persistence & Migration</p>
                    </div>
                    
                    <div className="p-6 space-y-8">
                        {/* Backup Section */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center">
                                    <span className="material-icons-outlined text-sm">settings_backup_restore</span>
                                </div>
                                <h4 className="text-sm font-black text-gray-800 dark:text-white uppercase tracking-widest">Database Lifecycle</h4>
                            </div>

                            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30">
                                <div className="flex items-start gap-3">
                                    <span className="material-icons-outlined text-amber-500 mt-0.5">warning</span>
                                    <div className="space-y-1">
                                        <p className="text-xs font-bold text-amber-800 dark:text-amber-200">System Caution</p>
                                        <p className="text-[10px] text-amber-700/70 dark:text-amber-300/60 leading-relaxed font-medium">Restoring from a backup will overwrite all current users, trips, and workspace settings. Ensure you have a recent export.</p>
                                    </div>
                                </div>
                            </div>

                             <div className="grid grid-cols-1 gap-3">
                                <Button 
                                    onClick={handleExport} 
                                    variant="primary" 
                                    className="h-14 !rounded-2xl shadow-lg shadow-blue-500/20" 
                                    icon={<span className="material-icons-outlined">download</span>}
                                >
                                    Generate Backup JSON
                                </Button>
                                <Button 
                                    onClick={handleImportTrigger} 
                                    variant="danger" 
                                    className="h-14 !rounded-2xl border-dashed border-2 bg-transparent hover:bg-rose-50 dark:hover:bg-rose-900/10" 
                                    icon={<span className="material-icons-outlined">upload</span>}
                                >
                                    Overwrite & Restore
                                </Button>
                                <Button 
                                    onClick={() => setIsResetModalOpen(true)} 
                                    variant="danger" 
                                    className="h-14 !rounded-2xl border-2 border-red-200 dark:border-red-900/40 bg-red-50/50 hover:bg-red-100 text-red-600 dark:bg-red-505/10 dark:text-red-400 font-bold flex items-center justify-center gap-2" 
                                    icon={<span className="material-icons-outlined">delete_forever</span>}
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
                                    <span className="material-icons-outlined text-sm">event_note</span>
                                </div>
                                <h4 className="text-sm font-black text-gray-800 dark:text-white uppercase tracking-widest">Calendar Sync</h4>
                            </div>
                            
                            <div className="grid grid-cols-1 gap-3">
                                <Button onClick={handleCalendarExport} variant="ghost" className="bg-gray-50 dark:bg-white/5 h-12 text-[10px] font-black uppercase tracking-wider !rounded-xl">
                                    <span className="material-icons-outlined text-sm mr-2">file_download</span> Download .ICS File
                                </Button>
                                <Button onClick={handleCopySubscriptionLink} variant="ghost" className="bg-gray-50 dark:bg-white/5 h-12 text-[10px] font-black uppercase tracking-wider !rounded-xl">
                                    <span className="material-icons-outlined text-sm mr-2">rss_feed</span> Copy Sync Link
                                </Button>
                            </div>
                        </div>

                        {/* Flight Data Section */}
                        <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-white/5">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-600 flex items-center justify-center">
                                        <span className="material-icons-outlined text-sm">flight</span>
                                    </div>
                                    <h4 className="text-sm font-black text-gray-800 dark:text-white uppercase tracking-widest">Flight Imports & Backups</h4>
                                </div>
                            </div>

                            {/* New Flight Custom Ingestion & Field Mapper trigger block */}
                            <div className="space-y-3 bg-gradient-to-r from-blue-500/5 to-indigo-500/5 p-5 rounded-3xl border border-indigo-500/10 shadow-sm">
                                <span className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">Unified Flight Ingestion Engine</span>
                                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
                                    Upload XLS/XLSX, CSV, or custom JSON flight rosters. Map spreadsheet columns to WanderGrid fields, validate records, deselect individual flights, and auto-compile them into organized trip folders.
                                </p>
                                <Button 
                                    onClick={onOpenFlightWizard} 
                                    variant="primary" 
                                    className="w-full h-11 text-xs font-black uppercase tracking-wider !rounded-2xl shadow-lg shadow-blue-500/15 flex items-center justify-center gap-2"
                                >
                                    <span className="material-icons-outlined text-sm">auto_fix_high</span>
                                    Load Flight File & Map Fields
                                </Button>
                            </div>

                             {/* Export / Backups Area */}
                            <div className="space-y-3 bg-slate-50 dark:bg-slate-950/40 p-5 rounded-3xl border border-slate-200/50 dark:border-white/5">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Roster Exports & Backups</span>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                    <Button 
                                        onClick={() => handleFlightExport('xlsx')} 
                                        variant="secondary" 
                                        className="h-10 text-[10px] font-black uppercase tracking-wider !rounded-xl"
                                    >
                                        Excel (.xlsx)
                                    </Button>
                                    <Button 
                                        onClick={() => handleFlightExport('csv')} 
                                        variant="secondary" 
                                        className="h-10 text-[10px] font-black uppercase tracking-wider !rounded-xl"
                                    >
                                        CSV Table
                                    </Button>
                                    <Button 
                                        onClick={() => handleFlightExport('json')} 
                                        variant="secondary" 
                                        className="h-10 text-[10px] font-black uppercase tracking-wider !rounded-xl"
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
                                    <span className="text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400">Processing Import</span>
                                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{importState.progress}%</span>
                                </div>
                                <div className="h-1.5 w-full bg-blue-100 dark:bg-blue-900/30 rounded-full overflow-hidden">
                                    <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${importState.progress}%` }} />
                                </div>
                                <p className="text-[10px] text-blue-500 mt-2 truncate">{importState.status}</p>
                            </div>
                        )}
                    </div>
                </Card>
            </div>

            <Modal isOpen={isResetModalOpen} onClose={() => { setIsResetModalOpen(false); setResetConfirmText(''); }} title="Consequences: Wipe Database">
                <div className="space-y-6 text-left">
                    <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30">
                        <div className="flex items-start gap-3">
                            <span className="material-icons-outlined text-red-500 mt-0.5">warning</span>
                            <div className="space-y-1">
                                <p className="text-sm font-black text-red-800 dark:text-red-400 uppercase tracking-wider">Dangerous Action</p>
                                <p className="text-[11px] text-red-700/80 dark:text-red-350/60 leading-relaxed font-semibold">
                                    This operation is permanent. It will irreversibly delete all listed trips, independent flights (even independent ones), user records, custom configurations, and assets.
                                </p>
                            </div>
                        </div>
                    </div>
                    
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase ml-1">Confirm deletion</label>
                        <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-normal ml-1 mb-2">
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
