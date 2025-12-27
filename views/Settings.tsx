
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Card, Button, Badge, Tabs, Input, Select, Modal } from '../components/ui';
import { dataService, ImportState } from '../services/mockDb';
import { flightImporter } from '../services/flightImportExport';
import { User, WorkspaceSettings, EntitlementType, SavedConfig, Trip } from '../types';
import { EntitlementsManager } from '../components/EntitlementsManager';
import { PublicHolidaysManager } from '../components/PublicHolidaysManager';

interface SettingsProps {
    onThemeChange?: (theme: 'light' | 'dark' | 'auto') => void;
}

export const Settings: React.FC<SettingsProps> = ({ onThemeChange }) => {
  const [activeTab, setActiveTab] = useState('general');
  const [users, setUsers] = useState<User[]>([]);
  const [entitlements, setEntitlements] = useState<EntitlementType[]>([]);
  const [savedConfigs, setSavedConfigs] = useState<SavedConfig[]>([]);
  const [loading, setLoading] = useState(true);
  
  // User Management State
  const [isDeletingMember, setIsDeletingMember] = useState<string | null>(null);
  const [memberToDelete, setMemberToDelete] = useState<User | null>(null);
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [editingUser, setEditingUser] = useState<Partial<User>>({});
  
  // Org Settings State
  const [config, setConfig] = useState<WorkspaceSettings>({
      orgName: '',
      currency: 'USD',
      dateFormat: 'MM/DD/YYYY',
      autoSync: false,
      theme: 'light',
      workingDays: [1, 2, 3, 4, 5],
      aviationStackApiKey: '',
      brandfetchApiKey: ''
  });
  const [isSavingOrg, setIsSavingOrg] = useState(false);

  // Backup & Restore State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [restoreStatus, setRestoreStatus] = useState<'idle' | 'reading' | 'importing' | 'success' | 'error'>('idle');
  const [restoreErrorMessage, setRestoreErrorMessage] = useState('');

  // Flight Import State
  const flightJsonInputRef = useRef<HTMLInputElement>(null);
  const flightCsvInputRef = useRef<HTMLInputElement>(null);
  const [importState, setImportState] = useState<ImportState>(dataService.getImportState());
  const [isImportVerifyOpen, setIsImportVerifyOpen] = useState(false);
  const [proposedTrips, setProposedTrips] = useState<Trip[]>([]);
  const [selectedTripIds, setSelectedTripIds] = useState<Set<string>>(new Set());
  const [importFilters, setImportFilters] = useState({ search: '', minDate: '', maxDate: '' });

  useEffect(() => {
    refreshData();
    const unsubscribe = dataService.subscribeToImport((state) => {
        setImportState(state);
    });
    return unsubscribe;
  }, []);

  const refreshData = () => {
    setLoading(true);
    Promise.all([
        dataService.getUsers(),
        dataService.getEntitlementTypes(),
        dataService.getSavedConfigs(),
        dataService.getWorkspaceSettings()
    ]).then(([u, ents, configs, settings]) => {
        setUsers(u);
        setEntitlements(ents);
        setSavedConfigs(configs);
        setConfig(settings);
        setLoading(false);
    });
  };

  // --- User Management Handlers ---

  const handleCreateUser = () => {
      setEditingUser({ 
          name: '', 
          role: 'Partner', 
          leaveBalance: 0, 
          takenLeave: 0, 
          allowance: 0, 
          policies: [], 
          holidayConfigIds: [], 
          holidayWeekendRule: 'none',
          activeYears: [new Date().getFullYear()]
      });
      setIsEditingUser(true);
  };

  const handleEditUser = (u: User) => { 
      setEditingUser({...u}); 
      setIsEditingUser(true); 
  };

  const handleSaveUser = async () => { 
      if (!editingUser.name) return;
      if (editingUser.id) {
          await dataService.updateUser(editingUser as User);
      } else {
          // New User
          const newUser: User = {
              ...editingUser,
              id: Math.random().toString(36).substr(2, 9),
              email: `${editingUser.name?.toLowerCase().replace(/\s/g, '.')}@wandergrid.local`, // Mock email
              password: 'password', // Mock password
          } as User;
          await dataService.addUser(newUser);
      }
      refreshData();
      setIsEditingUser(false); 
  };

  const initiateDeleteMember = (u: User) => setMemberToDelete(u);

  const handleConfirmDeleteMember = async () => { 
      if (memberToDelete) {
          await dataService.deleteUser(memberToDelete.id);
          setMemberToDelete(null);
          refreshData();
      }
  };

  // --- Org Settings Handlers ---

  const handleSaveOrgSettings = async () => { 
      setIsSavingOrg(true);
      await dataService.updateWorkspaceSettings(config);
      if (onThemeChange) onThemeChange(config.theme);
      setTimeout(() => setIsSavingOrg(false), 500);
  };

  const toggleWorkingDay = (d: number) => { 
      const newDays = config.workingDays.includes(d) 
          ? config.workingDays.filter(day => day !== d)
          : [...config.workingDays, d].sort();
      setConfig({...config, workingDays: newDays});
  };

  // --- Backup & Restore Handlers ---

  const handleExport = async () => { 
      const json = await dataService.exportFullState();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `wandergrid-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  const handleImportTrigger = () => fileInputRef.current?.click();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => { 
      const file = e.target.files?.[0];
      if (!file) return;
      setPendingFile(file);
      setRestoreStatus('idle');
      setRestoreErrorMessage('');
      setIsRestoreModalOpen(true);
      e.target.value = ''; // Reset input
  };

  const handleConfirmRestore = async () => { 
      if (!pendingFile) return;
      setRestoreStatus('reading');
      
      const reader = new FileReader();
      reader.onload = async (e) => {
          const content = e.target?.result as string;
          try {
              setRestoreStatus('importing');
              await dataService.importFullState(content);
              setRestoreStatus('success');
              setTimeout(() => {
                  setIsRestoreModalOpen(false);
                  refreshData();
                  // Force theme update if it changed
                  dataService.getWorkspaceSettings().then(s => {
                      if (onThemeChange) onThemeChange(s.theme);
                  });
              }, 1000);
          } catch (err) {
              console.error(err);
              setRestoreStatus('error');
              setRestoreErrorMessage(err instanceof Error ? err.message : "Unknown error");
          }
      };
      reader.onerror = () => {
          setRestoreStatus('error');
          setRestoreErrorMessage("Failed to read file");
      };
      reader.readAsText(pendingFile);
  };

  // --- Flight Import Handlers ---

  const handleFlightImport = (e: React.ChangeEvent<HTMLInputElement>, type: 'json' | 'csv') => { 
      const file = e.target.files?.[0];
      if (!file || users.length === 0) return;
      
      const reader = new FileReader();
      reader.onload = async (evt) => {
          const content = evt.target?.result as string;
          // Use first user as default participant for imports
          const defaultUserId = users[0].id; 
          
          let candidates: Trip[] = [];
          if (type === 'json') {
              candidates = await flightImporter.importJson(content, defaultUserId);
          } else {
              candidates = await flightImporter.importCsv(content, defaultUserId);
          }

          if (candidates.length > 0) {
              setProposedTrips(candidates);
              setSelectedTripIds(new Set(candidates.map(t => t.id)));
              setImportFilters({ search: '', minDate: '', maxDate: '' });
              setIsImportVerifyOpen(true);
          } else {
              alert("No valid trips found in file.");
          }
      };
      reader.readAsText(file);
      e.target.value = '';
  };

  const handleConfirmFlightImport = async () => { 
      const toImport = proposedTrips.filter(t => selectedTripIds.has(t.id));
      await dataService.addTrips(toImport);
      setIsImportVerifyOpen(false);
      setProposedTrips([]);
      refreshData();
  };

  const handleFlightExport = async (type: 'json' | 'csv') => { 
      const allTrips = await dataService.getTrips();
      let content = '';
      let filename = '';
      
      if (type === 'json') {
          content = flightImporter.exportJson(allTrips);
          filename = 'flights-export.json';
      } else {
          content = flightImporter.exportCsv(allTrips);
          filename = 'flights-export.csv';
      }

      const blob = new Blob([content], { type: type === 'json' ? 'application/json' : 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
  };

  const filteredImportCandidates = useMemo(() => {
        return proposedTrips.filter(t => {
            const searchLower = importFilters.search.toLowerCase();
            const matchesSearch = !searchLower || 
                t.name.toLowerCase().includes(searchLower) ||
                t.transports?.some(tr => 
                    tr.provider.toLowerCase().includes(searchLower) || 
                    tr.identifier.toLowerCase().includes(searchLower) ||
                    tr.origin.toLowerCase().includes(searchLower) ||
                    tr.destination.toLowerCase().includes(searchLower)
                );

            const start = new Date(t.startDate);
            const end = new Date(t.endDate);
            const matchesMin = !importFilters.minDate || end >= new Date(importFilters.minDate);
            const matchesMax = !importFilters.maxDate || start <= new Date(importFilters.maxDate);

            return matchesSearch && matchesMin && matchesMax;
        });
    }, [proposedTrips, importFilters]);

  const toggleImportSelection = (id: string) => { 
      const newSet = new Set(selectedTripIds);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      setSelectedTripIds(newSet);
  };

  const toggleAllImportSelection = () => { 
      const filteredIds = filteredImportCandidates.map(t => t.id);
      const allSelected = filteredIds.every(id => selectedTripIds.has(id));
      
      const newSet = new Set(selectedTripIds);
      if (allSelected) {
          filteredIds.forEach(id => newSet.delete(id));
      } else {
          filteredIds.forEach(id => newSet.add(id));
      }
      setSelectedTripIds(newSet);
  };

  if (loading) return <div className="p-8 text-gray-400 animate-pulse">Initializing Systems...</div>;

  return (
    <div className="space-y-8 animate-fade-in max-w-[1400px] mx-auto pb-12 flex flex-col h-full">
       <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white/40 dark:bg-gray-900/40 p-6 rounded-[2rem] backdrop-blur-xl border border-white/50 dark:border-white/5 shadow-2xl shrink-0">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h2 className="text-4xl font-black text-gray-900 dark:text-white tracking-tight">Systems Core</h2>
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Fine-tune your workspace environment.</p>
        </div>
      </header>

      <Tabs 
        tabs={[
            { id: 'general', label: 'Workspace & Users', icon: <span className="material-icons-outlined">domain</span> },
            { id: 'policies', label: 'Leave Definitions', icon: <span className="material-icons-outlined">category</span> },
            { id: 'calendars', label: 'Public Holidays', icon: <span className="material-icons-outlined">public</span> },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
        className="shrink-0"
      />

      {activeTab === 'general' && (
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
                        
                        <div className="grid grid-cols-1 gap-4">
                            {/* OpenStreetMap - Always Active */}
                            <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-white/10 rounded-2xl">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                                        <span className="material-icons-outlined">map</span>
                                    </div>
                                    <div>
                                        <h5 className="font-bold text-gray-900 dark:text-white text-sm">OpenStreetMap</h5>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">Geocoding & Location Services</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 rounded-lg border border-emerald-100 dark:border-emerald-900/30">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                    <span className="text-[10px] font-black uppercase tracking-wider">Active</span>
                                </div>
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
                                            <p className="text-xs text-gray-500 dark:text-gray-400">Real-time flight status & schedules</p>
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
                                        <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                                            <span className="material-icons-outlined">image</span>
                                        </div>
                                        <div>
                                            <h5 className="font-bold text-gray-900 dark:text-white text-sm">Brandfetch</h5>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">Asset & Logo retrieval</p>
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
                                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-black text-white shadow-lg transition-transform group-hover:scale-110 ${user.role === 'Partner' ? 'bg-gradient-to-br from-blue-500 to-indigo-600' : 'bg-gradient-to-br from-emerald-400 to-teal-600'}`}>
                                                    {user.name?.charAt(0) || '?'}
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-gray-800 dark:text-white text-base leading-none">{user.name}</h4>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className={`text-[9px] font-black uppercase tracking-widest ${user.role === 'Partner' ? 'text-blue-500' : 'text-emerald-500'}`}>{user.role}</span>
                                                        <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest px-1 border-l border-gray-300 dark:border-white/10">
                                                            {user.policies?.length || 0} Policies • {selectedHolidays.length} Calendars
                                                        </span>
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
                <Card noPadding className="rounded-[2rem]">
                    <div className="p-8 border-b border-gray-100 dark:border-white/5">
                        <h3 className="text-2xl font-black text-gray-900 dark:text-white leading-none">Data Operations</h3>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-2">Import, Export & Backup</p>
                    </div>
                    
                    <div className="p-6 space-y-6">
                        {/* Backup Section */}
                        <div className="space-y-3">
                            <h4 className="text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">System Backup</h4>
                            <div className="grid grid-cols-2 gap-3">
                                <Button onClick={handleExport} variant="secondary" className="h-12 border-dashed" icon={<span className="material-icons-outlined">download</span>}>Backup JSON</Button>
                                <Button onClick={handleImportTrigger} variant="secondary" className="h-12 border-dashed" icon={<span className="material-icons-outlined">upload</span>}>Restore JSON</Button>
                                <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleFileSelect} />
                            </div>
                        </div>

                        {/* Flight Data Section */}
                        <div className="space-y-3">
                            <h4 className="text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">Flight Data</h4>
                            <div className="grid grid-cols-2 gap-3">
                                <Button onClick={() => flightJsonInputRef.current?.click()} variant="ghost" className="bg-gray-50 dark:bg-white/5 h-10 text-xs">Import JSON</Button>
                                <Button onClick={() => flightCsvInputRef.current?.click()} variant="ghost" className="bg-gray-50 dark:bg-white/5 h-10 text-xs">Import CSV</Button>
                                <Button onClick={() => handleFlightExport('json')} variant="ghost" className="bg-gray-50 dark:bg-white/5 h-10 text-xs text-gray-400">Export JSON</Button>
                                <Button onClick={() => handleFlightExport('csv')} variant="ghost" className="bg-gray-50 dark:bg-white/5 h-10 text-xs text-gray-400">Export CSV</Button>
                                
                                <input type="file" ref={flightJsonInputRef} className="hidden" accept=".json" onChange={(e) => handleFlightImport(e, 'json')} />
                                <input type="file" ref={flightCsvInputRef} className="hidden" accept=".csv" onChange={(e) => handleFlightImport(e, 'csv')} />
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
        </div>
      )}
      
      {activeTab === 'policies' && <div className="h-[800px] animate-fade-in"><EntitlementsManager /></div>}
      {activeTab === 'calendars' && <div className="h-[800px] animate-fade-in"><PublicHolidaysManager /></div>}
       
       {/* User Edit Modal */}
       <Modal isOpen={isEditingUser} onClose={() => setIsEditingUser(false)} title="Member Access Control">
            <div className="space-y-6">
                <div className="space-y-4 animate-fade-in">
                    <Input label="Identity: Name" className="!rounded-2xl" value={editingUser.name || ''} onChange={e => setEditingUser({...editingUser, name: e.target.value})} />
                    <Select label="Clearance Level" className="!rounded-2xl" value={editingUser.role || 'Partner'} onChange={e => setEditingUser({...editingUser, role: e.target.value as any})} options={[{ label: 'Partner', value: 'Partner' }, { label: 'Child', value: 'Child' }, { label: 'Admin', value: 'Admin' }]} />
                </div>
                <div className="flex gap-3 pt-6 border-t border-gray-100 dark:border-white/5">
                    <Button variant="ghost" className="flex-1 !rounded-2xl" onClick={() => setIsEditingUser(false)}>Discard</Button>
                    <Button variant="primary" className="flex-1 !rounded-2xl shadow-xl shadow-blue-500/20" onClick={handleSaveUser}>Authorize Profile</Button>
                </div>
            </div>
       </Modal>
       
       {/* User Delete Modal */}
       <Modal isOpen={!!memberToDelete} onClose={() => setMemberToDelete(null)} title="Personnel Termination">
            <div className="space-y-6 text-center">
                <h4 className="text-2xl font-black text-gray-900 dark:text-white leading-none">Sever Identity?</h4>
                <p className="text-gray-500 dark:text-gray-400 mt-3 text-sm leading-relaxed">
                    Remove <span className="font-bold text-gray-900 dark:text-white">{memberToDelete?.name}</span> from the roster?
                </p>
                <div className="flex gap-3 pt-2">
                    <Button variant="ghost" className="flex-1 !rounded-xl" onClick={() => setMemberToDelete(null)}>Cancel</Button>
                    <Button variant="danger" className="flex-1 !rounded-xl shadow-lg shadow-rose-500/20" onClick={handleConfirmDeleteMember}>Confirm Removal</Button>
                </div>
            </div>
       </Modal>

       {/* Restore Modal */}
       <Modal isOpen={isRestoreModalOpen} onClose={() => setIsRestoreModalOpen(false)} title="System Restore">
            <div className="text-center space-y-6">
                <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mx-auto text-blue-500 animate-pulse">
                    <span className="material-icons-outlined text-3xl">history</span>
                </div>
                <div>
                    <h4 className="text-xl font-bold text-gray-900 dark:text-white">Confirm Overwrite</h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                        Restoring <strong>{pendingFile?.name}</strong> will replace all current data. This action is irreversible.
                    </p>
                </div>
                {restoreStatus === 'error' && (
                    <div className="p-3 bg-rose-50 text-rose-600 rounded-xl text-xs font-bold border border-rose-100">
                        {restoreErrorMessage}
                    </div>
                )}
                <div className="flex gap-3 pt-2">
                    <Button variant="ghost" className="flex-1" onClick={() => setIsRestoreModalOpen(false)}>Cancel</Button>
                    <Button 
                        variant="primary" 
                        className="flex-1" 
                        onClick={handleConfirmRestore} 
                        isLoading={restoreStatus === 'reading' || restoreStatus === 'importing'}
                        disabled={restoreStatus === 'success'}
                    >
                        {restoreStatus === 'success' ? 'Restored!' : 'Proceed'}
                    </Button>
                </div>
            </div>
       </Modal>

       {/* Import Verification Modal */}
       <Modal isOpen={isImportVerifyOpen} onClose={() => setIsImportVerifyOpen(false)} title="Verify Flight Import" maxWidth="max-w-2xl">
            <div className="space-y-6">
                {/* Filter Bar */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/5">
                    <Input 
                        placeholder="Search Airline / City..." 
                        value={importFilters.search} 
                        onChange={e => setImportFilters({...importFilters, search: e.target.value})}
                        className="!py-2 !text-xs"
                    />
                    <Input 
                        type="date" 
                        placeholder="From"
                        value={importFilters.minDate}
                        onChange={e => setImportFilters({...importFilters, minDate: e.target.value})}
                        className="!py-2 !text-xs"
                    />
                    <Input 
                        type="date" 
                        placeholder="To"
                        value={importFilters.maxDate}
                        onChange={e => setImportFilters({...importFilters, maxDate: e.target.value})}
                        className="!py-2 !text-xs"
                    />
                </div>

                <div className="flex justify-between items-center bg-gray-50 dark:bg-white/5 p-4 rounded-xl border border-gray-100 dark:border-white/5">
                    <span className="text-sm font-bold text-gray-700 dark:text-gray-200">
                        Showing {filteredImportCandidates.length} of {proposedTrips.length} Trips
                    </span>
                    <button onClick={toggleAllImportSelection} className="text-xs font-bold text-blue-500 hover:underline uppercase tracking-wider">
                        {filteredImportCandidates.every(t => selectedTripIds.has(t.id)) && filteredImportCandidates.length > 0 ? 'Deselect All' : 'Select All'}
                    </button>
                </div>
                
                <div className="max-h-[400px] overflow-y-auto custom-scrollbar space-y-3">
                    {filteredImportCandidates.map(trip => (
                        <div key={trip.id} onClick={() => toggleImportSelection(trip.id)} className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all ${selectedTripIds.has(trip.id) ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/10 dark:border-blue-800' : 'bg-white border-gray-100 dark:bg-gray-800 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5'}`}>
                            <div className={`w-5 h-5 rounded border flex items-center justify-center ${selectedTripIds.has(trip.id) ? 'bg-blue-500 border-blue-500' : 'bg-white border-gray-300'}`}>
                                {selectedTripIds.has(trip.id) && <span className="material-icons-outlined text-white text-xs">check</span>}
                            </div>
                            <div className="flex-1">
                                <h4 className="font-bold text-sm text-gray-900 dark:text-white">{trip.name}</h4>
                                <p className="text-xs text-gray-500 mt-0.5">{new Date(trip.startDate).toLocaleDateString()} - {new Date(trip.endDate).toLocaleDateString()} • {trip.transports?.length} Flights</p>
                            </div>
                        </div>
                    ))}
                    {filteredImportCandidates.length === 0 && (
                        <div className="text-center py-8 text-gray-400 text-xs italic">No trips match your filters</div>
                    )}
                </div>

                <div className="flex gap-3 pt-4 border-t border-gray-100 dark:border-white/5">
                    <Button variant="ghost" className="flex-1" onClick={() => setIsImportVerifyOpen(false)}>Discard</Button>
                    <Button variant="primary" className="flex-1" onClick={handleConfirmFlightImport} disabled={selectedTripIds.size === 0}>Import {selectedTripIds.size} Trips</Button>
                </div>
            </div>
       </Modal>
    </div>
  );
};
