import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Card, Button, Badge, Input, Select, Modal } from '../components/ui';
import { dataService, ImportState } from '../services/mockDb';
import { flightImporter } from '../services/flightImportExport';
import { calendarService } from '../services/calendarExport';
import { User, WorkspaceSettings, EntitlementType, SavedConfig, Trip } from '../types';
import { GearSettingsTab } from '../components/GearSettingsTab';
import { WorkspaceSettingsTab } from '../components/WorkspaceSettingsTab';
import { FlightImportWizard } from '../components/FlightImportWizard';
import { CarriersTab } from '../components/CarriersTab';

interface SettingsProps {
    onThemeChange?: (theme: 'light' | 'dark' | 'auto') => void;
}

export const Settings: React.FC<SettingsProps> = ({ onThemeChange }) => {
  const [activeTab, setActiveTab] = useState<string>('menu');
  const [users, setUsers] = useState<User[]>([]);
  const [rosterSearch, setRosterSearch] = useState('');
  const [entitlements, setEntitlements] = useState<EntitlementType[]>([]);
  const [savedConfigs, setSavedConfigs] = useState<SavedConfig[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Personnel dialog controls
  const [isDeletingMember, setIsDeletingMember] = useState<string | null>(null);
  const [memberToDelete, setMemberToDelete] = useState<User | null>(null);
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [editingUser, setEditingUser] = useState<Partial<User>>({});
  
  // Workspace Config States
  const [config, setConfig] = useState<WorkspaceSettings>({
      orgName: '',
      currency: 'USD',
      dateFormat: 'MM/DD/YYYY',
      autoSync: false,
      theme: 'light',
      workingDays: [1, 2, 3, 4, 5],
      aviationStackApiKey: '',
      brandfetchApiKey: '',
      googleGeminiApiKey: '',
      masterPackingList: []
  });
  const [isSavingOrg, setIsSavingOrg] = useState(false);

  // Backup file controls
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [restoreStatus, setRestoreStatus] = useState<'idle' | 'reading' | 'importing' | 'success' | 'error'>('idle');
  const [restoreErrorMessage, setRestoreErrorMessage] = useState('');

  // Sheet flight imports
  const [importState, setImportState] = useState<ImportState>(dataService.getImportState());
  const [isFlightWizardOpen, setIsFlightWizardOpen] = useState(false);
  const [proposedTrips, setProposedTrips] = useState<Trip[]>([]);
  const [selectedTripIds, setSelectedTripIds] = useState<Set<string>>(new Set());
  const [importFilters, setImportFilters] = useState({
      search: '',
      minDate: '',
      maxDate: '',
      minLegs: '0',
      carrierSearch: ''
  });
  const [isImportVerifyOpen, setIsImportVerifyOpen] = useState(false);

  // Database Reset Danger workflow
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');

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
    }).catch(err => {
        console.error("Failed to load settings data:", err);
        setLoading(false);
    });
  };

  const handleCreateUser = () => {
      setEditingUser({ 
          name: '', 
          email: '',
          password: '',
          role: 'Partner', 
          leaveBalance: 25, 
          takenLeave: 0, 
          allowance: 25, 
          policies: [], 
          holidayConfigIds: [], 
          holidayWeekendRule: 'none',
          activeYears: [new Date().getFullYear()]
      });
      setIsEditingUser(true);
  };

  const handleEditUser = (u: User) => { 
      setEditingUser({
          ...u,
          email: u.email ?? '',
          password: u.password ?? '',
          holidayConfigIds: u.holidayConfigIds ?? []
      }); 
      setIsEditingUser(true); 
  };

  const handleSaveUser = async () => { 
      if (!editingUser.name) return;
      
      const emailVal = (editingUser.email || '').trim().toLowerCase();
      const finalEmail = emailVal || `${editingUser.name?.toLowerCase().replace(/\s/g, '.')}@wandergrid.local`;
      const password = (editingUser.password || '').trim();

      // Enforce unique email check in memory roster
      const duplicate = users.find(u => u.email?.toLowerCase().trim() === finalEmail && u.id !== editingUser.id);
      if (duplicate) {
          alert(`Conflict: A user of the roster already uses the email '${finalEmail}'. Please specify a unique email.`);
          return;
      }

      if (editingUser.id) {
          await dataService.updateUser({
              ...editingUser,
              email: finalEmail,
              password: password || 'password'
          } as User);
      } else {
          // New User
          const newUser: User = {
              ...editingUser,
              id: finalEmail,
              email: finalEmail,
              password: password || 'password', 
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

  // --- Import/Export Handlers (Backup JSON) ---
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
      e.target.value = ''; 
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
              
              localStorage.removeItem('wandergrid_session_user');
              localStorage.removeItem('wandergrid_dashboard_cache_v1');

              setTimeout(() => {
                  setIsRestoreModalOpen(false);
                  window.location.reload();
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

  const handleFlightImport = (e: React.ChangeEvent<HTMLInputElement>, type: 'json' | 'csv' | 'airtrail') => { 
      const file = e.target.files?.[0];
      if (!file || users.length === 0) return;
      
      const reader = new FileReader();
      reader.onload = async (evt) => {
          const content = evt.target?.result as string;
          const defaultUserId = users[0].id; 
          
          let candidates: Trip[] = [];
          if (type === 'json') {
              candidates = await flightImporter.importJson(content, defaultUserId);
          } else if (type === 'airtrail') {
              candidates = await flightImporter.importAirTrailJson(content, defaultUserId);
          } else {
              candidates = await flightImporter.importCsv(content, defaultUserId);
          }

          if (candidates.length > 0) {
              setProposedTrips(candidates);
              setSelectedTripIds(new Set(candidates.map(t => t.id)));
              setImportFilters({ search: '', minDate: '', maxDate: '', minLegs: '0', carrierSearch: '' });
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

  const handleFlightExport = async (type: 'json' | 'csv' | 'airtrail' | 'xlsx') => { 
      const allTrips = await dataService.getTrips();
      
      if (type === 'xlsx') {
          const buffer = flightImporter.exportXlsx(allTrips);
          const blob = new Blob([buffer], { type: 'application/octet-stream' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `flights-export.xlsx`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          return;
      }

      let content = '';
      let filename = '';
      
      if (type === 'json') {
          content = flightImporter.exportJson(allTrips);
          filename = 'flights-export.json';
      } else if (type === 'airtrail') {
          content = flightImporter.exportAirTrailJson(allTrips);
          filename = `airtrail-backup-${new Date().toISOString().split('T')[0]}.json`;
      } else {
          content = flightImporter.exportCsv(allTrips);
          filename = 'flights-export.csv';
      }

      const blob = new Blob([content], { type: type === 'json' || type === 'airtrail' ? 'application/json' : 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
  };

  const handleCalendarExport = async () => {
      const allTrips = await dataService.getTrips();
      const icsContent = calendarService.generateIcsContent(allTrips, config.orgName);
      calendarService.downloadIcs(icsContent, 'wandergrid-calendar.ics');
  };

  const handleCopySubscriptionLink = () => {
      if (users.length > 0) {
          const url = `${window.location.origin}/api/calendar/${users[0].id}/feed.ics`;
          navigator.clipboard.writeText(url);
          alert("Sync Link copied to clipboard! Paste this into Google Calendar or iCal.");
      }
  };

  // Filter proposed candidates in sheet import
  const filteredImportCandidates = useMemo(() => {
        return proposedTrips.filter(t => {
            const searchLower = importFilters.search.toLowerCase();
            const carrierLower = importFilters.carrierSearch.toLowerCase();
            
            const matchesSearch = !searchLower || 
                t.name.toLowerCase().includes(searchLower) ||
                t.location.toLowerCase().includes(searchLower);

            const matchesCarrier = !carrierLower ||
                t.transports?.some(tr => 
                    tr.provider.toLowerCase().includes(carrierLower) || 
                    tr.identifier.toLowerCase().includes(carrierLower)
                );

            const start = new Date(t.startDate);
            const end = new Date(t.endDate);
            const matchesMin = !importFilters.minDate || end >= new Date(importFilters.minDate);
            const matchesMax = !importFilters.maxDate || start <= new Date(importFilters.maxDate);
            
            const matchesLegs = (t.transports?.length || 0) >= parseInt(importFilters.minLegs);

            return matchesSearch && matchesCarrier && matchesMin && matchesMax && matchesLegs;
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

  if (loading) return (
    <div className="flex flex-col items-center justify-center p-24 h-[60vh] space-y-4 text-center">
      <span className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin block" />
      <p className="font-extrabold text-lg text-gray-500 animate-pulse uppercase tracking-wider">Loading System Parameters...</p>
    </div>
  );

  const hasEnvKey = !!process.env.API_KEY;
  const hasUserKey = !!config.googleGeminiApiKey;
  const isGeminiActive = hasEnvKey || hasUserKey;

  // Settings Pages Structure
  const settingTabs = [
    { id: 'workspace', label: 'Workspace Profile', description: 'Global style identity & locale rules', icon: 'business' },
    { id: 'personnel', label: 'Personnel Roster', description: 'Manage members & leave structures', icon: 'people' },
    { id: 'integrations', label: 'Integrations & APIs', description: 'Google Gemini & tracking keys', icon: 'hub' },
    { id: 'gear', label: 'Master Gear', description: 'Global packing categories & templates', icon: 'backpack' },
    { id: 'carriers', label: 'Operating Carriers', description: 'Carrier logos & provider overwrites', icon: 'flight_takeoff' },
    { id: 'data', label: 'Database & Sync', description: 'JSON backups, calendar, & flight sheets', icon: 'storage' },
  ];

  return (
    <div className="animate-fade-in w-full max-w-[90rem] mx-auto pb-16 flex flex-col h-full space-y-8 px-4 md:px-6">
      
      {/* Visual Header Grid Panel */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white/45 dark:bg-gray-900/40 p-8 rounded-[2rem] backdrop-blur-3xl border border-gray-200/50 dark:border-white/5 shadow-25 shrink-0 transition-all">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-500 to-indigo-650 flex items-center justify-center text-white text-xl font-black shadow-lg">
              <span className="material-icons-outlined text-lg">settings</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white tracking-tight">Systems Core</h2>
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-sm font-semibold max-w-xl">Configure system keys, roster parameters, brand mappings, and master inventories of your WanderGrid workspace.</p>
        </div>
        
        {/* Quick Identity Panel snippet */}
        <div className="flex items-center gap-4 bg-gray-50/50 dark:bg-black/20 p-3 rounded-2xl border border-gray-200/30 dark:border-white/5">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-black">
            {config.orgName.charAt(0) || 'W'}
          </div>
          <div className="text-left leading-none space-y-1">
            <span className="text-[10px] font-mono tracking-widest text-zinc-400 dark:text-zinc-500 uppercase block font-black">Active Workspace</span>
            <span className="text-sm font-extrabold text-gray-800 dark:text-zinc-200 truncate max-w-[140px] block">{config.orgName || 'WanderGrid'}</span>
          </div>
        </div>
      </header>

      {/* Redesigned Single-Column Responsive Layout */}
      <div className="w-full">
        <main className="w-full animate-fade-in-up space-y-8">
          
          {/* Universal Sticky/Clean Back Navigation Row */}
          {activeTab !== 'menu' && (
            <div className="flex items-center justify-between bg-zinc-100/60 dark:bg-zinc-900/40 backdrop-blur-xl p-4 rounded-3xl border border-zinc-200/40 dark:border-white/5 backdrop-filter sticky top-[76px] z-40 shadow-sm animate-fade-in">
              <button 
                onClick={() => setActiveTab('menu')}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-white hover:bg-zinc-100 dark:bg-zinc-850 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 transition-all font-black text-xs uppercase tracking-wide cursor-pointer shadow-sm border border-zinc-200/50 dark:border-white/10 active:scale-95"
              >
                <span className="material-icons-outlined text-base">arrow_back</span>
                Back to Control Panel
              </button>
              <div className="flex items-center gap-2 mr-2">
                <span className="material-icons-outlined text-zinc-400 dark:text-zinc-500 text-lg">
                  {settingTabs.find(t => t.id === activeTab)?.icon}
                </span>
                <span className="text-xs font-mono font-black uppercase text-zinc-500 dark:text-zinc-400 tracking-wider">
                  {settingTabs.find(t => t.id === activeTab)?.label}
                </span>
              </div>
            </div>
          )}

          {/* Centralized Categories Bento/Grid Menu (Always active when state is 'menu') */}
          {activeTab === 'menu' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-zinc-50 dark:bg-zinc-900/30 p-6 rounded-3xl border border-zinc-200/50 dark:border-white/5 text-center max-w-2xl mx-auto">
                <span className="text-[11px] font-mono font-black uppercase text-zinc-400 dark:text-zinc-500 tracking-widest block">Systems Directory</span>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5 font-semibold leading-relaxed">Select a category below to configure system keys, roster parameters, brand mappings, and master inventories.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {settingTabs.map((tab) => {
                  const bgColors: Record<string, string> = {
                    workspace: 'from-blue-500/10 to-indigo-500/5 border-blue-500/10 hover:border-blue-500/30 text-blue-600 dark:text-blue-400',
                    personnel: 'from-emerald-500/10 to-teal-500/5 border-emerald-500/10 hover:border-emerald-500/30 text-emerald-600 dark:text-emerald-400',
                    integrations: 'from-purple-500/10 to-pink-500/5 border-purple-500/10 hover:border-purple-500/30 text-purple-600 dark:text-purple-400',
                    gear: 'from-cyan-500/10 to-blue-500/5 border-cyan-500/10 hover:border-cyan-500/30 text-cyan-600 dark:text-cyan-400',
                    carriers: 'from-indigo-500/10 to-purple-500/5 border-indigo-500/10 hover:border-indigo-500/30 text-indigo-600 dark:text-indigo-400',
                    data: 'from-gray-500/10 to-slate-500/5 border-gray-500/10 hover:border-gray-500/30 text-slate-600 dark:text-slate-400',
                  };
                  const iconColors: Record<string, string> = {
                    workspace: 'bg-blue-600 text-white',
                    personnel: 'bg-emerald-600 text-white',
                    integrations: 'bg-purple-650 text-white',
                    gear: 'bg-cyan-650 text-white',
                    carriers: 'bg-indigo-650 text-white',
                    data: 'bg-slate-600 text-white',
                  };
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex flex-col justify-between p-6 rounded-[2.2rem] bg-gradient-to-br ${bgColors[tab.id]} border-2 transition-all duration-300 text-left cursor-pointer hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] group relative overflow-hidden`}
                    >
                      <div className="space-y-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-md ${iconColors[tab.id]}`}>
                          <span className="material-icons-outlined text-2xl">{tab.icon}</span>
                        </div>
                        <div className="space-y-1">
                          <span className="text-base font-black block tracking-tight text-gray-900 dark:text-white group-hover:text-current transition-colors">{tab.label}</span>
                          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 leading-normal block">{tab.description}</span>
                        </div>
                      </div>
                      <div className="mt-6 flex items-center justify-between text-xs font-bold text-gray-400 dark:text-zinc-500 group-hover:text-current transition-colors">
                        <span className="uppercase tracking-widest text-[9px] font-mono font-black">Configure Parameters</span>
                        <div className="w-8 h-8 rounded-full bg-white dark:bg-zinc-800 border border-zinc-200/50 dark:border-white/5 flex items-center justify-center shrink-0 group-hover:translate-x-1 transition-all">
                          <span className="material-icons-outlined text-base">arrow_forward</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          
          {/* SECTION 1: Workspace & Identity Style */}
          {activeTab === 'workspace' && (
            <div className="space-y-8">
              <Card noPadding className="rounded-[2.2rem]">
                <div className="p-8 border-b border-gray-150/40 dark:border-white/5 bg-gradient-to-r from-blue-500/5 via-indigo-500/5 to-purple-500/5">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-6">
                      <div className="w-16 h-16 rounded-[1.5rem] bg-gradient-to-br from-blue-600 to-indigo-700 shadow-xl flex items-center justify-center text-white text-2xl font-black rotate-2 hover:rotate-6 transition-all border border-white/25">
                        {config.orgName.charAt(0) || 'W'}
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-xl font-black text-gray-900 dark:text-white">Workspace Identity</h3>
                        <p className="text-[10px] font-mono tracking-widest font-bold text-gray-400 uppercase">Global Localisation Controls</p>
                      </div>
                    </div>
                    <Button 
                      variant="primary" 
                      size="md" 
                      className="!rounded-xl shadow-lg border-none" 
                      onClick={handleSaveOrgSettings} 
                      isLoading={isSavingOrg} 
                      icon={<span className="material-icons-outlined text-sm">check_circle</span>}
                    >
                      Commit Changes
                    </Button>
                  </div>
                </div>

                <div className="p-8 space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Input 
                      label="Workspace Name" 
                      placeholder="e.g. WanderGrid HQ" 
                      value={config.orgName} 
                      onChange={e => setConfig({...config, orgName: e.target.value})} 
                    />
                    <Select 
                      label="Locality: Currency" 
                      value={config.currency} 
                      onChange={e => setConfig({...config, currency: e.target.value})} 
                      options={[
                        { label: 'USD - United States Dollar ($)', value: 'USD' }, 
                        { label: 'EUR - Euro (€)', value: 'EUR' }, 
                        { label: 'GBP - British Pound Sterling (£)', value: 'GBP' }, 
                        { label: 'AUD - Australian Dollar ($)', value: 'AUD' }
                      ]} 
                    />
                    <Select 
                      label="Temporal Format" 
                      value={config.dateFormat} 
                      onChange={e => setConfig({...config, dateFormat: e.target.value})} 
                      options={[
                        { label: 'MM/DD/YYYY (e.g. 05/25/2026)', value: 'MM/DD/YYYY' }, 
                        { label: 'DD/MM/YYYY (e.g. 25/05/2026)', value: 'DD/MM/YYYY' }, 
                        { label: 'YYYY-MM-DD (e.g. 2026-05-25)', value: 'YYYY-MM-DD' }
                      ]} 
                    />
                    <Select 
                      label="UI Theme Preset" 
                      value={config.theme} 
                      onChange={e => setConfig({...config, theme: e.target.value as any})} 
                      options={[
                        { label: 'System Automatic Theme', value: 'auto' }, 
                        { label: 'Comfortable Dark Mode', value: 'dark' }, 
                        { label: 'Pure Light Mode', value: 'light' }
                      ]} 
                    />
                  </div>

                  {/* Defaults Section */}
                  <div className="pt-6 border-t border-gray-100 dark:border-white/5 space-y-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest block">Transit & Travel Defaults</label>
                      <p className="text-[11px] text-gray-400">Establish fallback rules for booking classes, starting points, and land connections inside planners.</p>
                    </div>
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
                        label="Default Land Transport Mode" 
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

                  {/* Operational Days section */}
                  <div className="pt-6 border-t border-gray-100 dark:border-white/5 space-y-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Workspace Operational Days</label>
                      <p className="text-[11px] text-gray-400">Specify standard workdays used in planning and leave allocation calculators.</p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 pt-1">
                      {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((d, i) => (
                          <button 
                              key={i} 
                              onClick={() => toggleWorkingDay(i)}
                              className={`py-3 px-3 rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer border ${
                                config.workingDays.includes(i) 
                                ? 'bg-blue-600 text-white shadow-md border-transparent' 
                                : 'bg-gray-100/50 dark:bg-zinc-800/40 text-gray-405 dark:text-zinc-500 border-zinc-200/50 dark:border-white/5 hover:bg-gray-150'
                              }`}
                          >
                            <span className="material-icons-outlined text-sm leading-none">
                              {config.workingDays.includes(i) ? 'check_box' : 'check_box_outline_blank'}
                            </span>
                            <span className="truncate">{d}</span>
                          </button>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* SECTION 2: Personnel Roster */}
          {activeTab === 'personnel' && (
            <div className="space-y-8">
              <Card noPadding className="rounded-[2.2rem]">
                <div className="p-8 border-b border-gray-150/40 dark:border-white/5 bg-gradient-to-r from-emerald-500/5 to-teal-500/5 flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="space-y-1">
                    <h3 className="text-xl font-black text-gray-900 dark:text-white">Personnel Roster</h3>
                    <p className="text-[10px] font-mono tracking-widest font-bold text-gray-400 uppercase">Inhabitants configurations</p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto items-stretch sm:items-center">
                    <div className="relative flex-1 sm:w-64">
                      <span className="material-icons-outlined text-gray-450 absolute left-3 top-1/2 -translate-y-1/2 text-sm">search</span>
                      <input 
                        type="text"
                        placeholder="Search roster..."
                        value={rosterSearch}
                        onChange={e => setRosterSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 border border-zinc-200 dark:border-white/5 focus:ring-1 focus:ring-teal-500 focus:outline-none focus:border-transparent text-xs font-semibold rounded-xl bg-gray-50/50 dark:bg-black/10 text-gray-805 dark:text-zinc-200"
                      />
                    </div>
                    <Button 
                      variant="primary" 
                      className="!rounded-xl shadow-lg border-none" 
                      icon={<span className="material-icons-outlined text-md">person_add</span>} 
                      onClick={handleCreateUser}
                    >
                      Enroll New Member
                    </Button>
                  </div>
                </div>

                <div className="p-6 space-y-4">
                  {users.filter(user => {
                    const search = rosterSearch.toLowerCase().trim();
                    return !search || 
                      user.name?.toLowerCase().includes(search) || 
                      user.email?.toLowerCase().includes(search) || 
                      user.role?.toLowerCase().includes(search);
                  }).length === 0 ? (
                    <div className="py-16 text-center">
                      <span className="material-icons-outlined text-gray-200 dark:text-gray-800 text-6xl">person_off</span>
                      <p className="text-gray-400 mt-4 font-bold uppercase tracking-widest text-xs">No active personnel matching filters</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {users.filter(user => {
                        const search = rosterSearch.toLowerCase().trim();
                        return !search || 
                          user.name?.toLowerCase().includes(search) || 
                          user.email?.toLowerCase().includes(search) || 
                          user.role?.toLowerCase().includes(search);
                      }).map(user => (
                        <div key={user.id || user.email} className="group relative flex flex-col p-5 rounded-2xl bg-white border border-gray-200/50 dark:bg-gray-900/40 dark:border-white/5 hover:border-blue-300 dark:hover:border-blue-800 transition-all shadow-sm">
                          {/* Card Header row with user info and actions */}
                          <div className="flex items-start justify-between gap-3 flex-1">
                            <div className="flex items-start gap-4 min-w-0">
                              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 text-lg font-black text-white shadow-md uppercase ${
                                user.role === 'Admin' ? 'bg-gradient-to-br from-purple-500 to-indigo-650' : 
                                user.role === 'Partner' ? 'bg-gradient-to-br from-blue-500 to-indigo-600' : 
                                'bg-gradient-to-br from-emerald-500 to-teal-600'
                              }`}>
                                {user.name?.charAt(0) || '?'}
                              </div>
                              <div className="min-w-0 space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h4 className="font-extrabold text-gray-800 dark:text-white text-base leading-none truncate max-w-[120px] sm:max-w-[160px]" title={user.name}>{user.name}</h4>
                                  <Badge color={user.role === 'Partner' ? 'blue' : user.role === 'Admin' ? 'purple' : 'green'}>{user.role}</Badge>
                                </div>
                                <p className="text-xs text-slate-400 dark:text-zinc-500 truncate leading-none mt-1">{user.email || 'No email registered'}</p>
                                <div className="pt-1 select-none">
                                  <span className="text-[9px] font-mono font-black text-zinc-400 dark:text-zinc-500 tracking-wider">SYNC-ID: {user.id}</span>
                                </div>
                              </div>
                            </div>

                            {/* Safe touch-friendly Action Buttons */}
                            <div className="flex items-center gap-1.5 shrink-0 self-start md:opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={() => handleEditUser(user)} 
                                className="p-2 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg cursor-pointer dark:bg-blue-500/15 dark:hover:bg-blue-500/35 border-none dark:text-blue-300"
                                title="Edit member profile"
                              >
                                <span className="material-icons-outlined text-sm block">edit</span>
                              </button>
                              <button 
                                onClick={() => initiateDeleteMember(user)} 
                                className="p-2 text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg cursor-pointer dark:bg-rose-500/15 dark:hover:bg-rose-500/35 border-none dark:text-rose-450"
                                title="Remove member"
                              >
                                <span className="material-icons-outlined text-sm block">delete</span>
                              </button>
                            </div>
                          </div>

                          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-white/5 grid grid-cols-2 gap-2 text-left bg-gray-50/50 dark:bg-black/20 p-3 rounded-xl">
                            <div>
                              <span className="text-[10px] text-zinc-400 font-bold block uppercase tracking-wide">Accrued Balance</span>
                              <span className="text-sm font-extrabold text-gray-800 dark:text-zinc-200">{user.leaveBalance} Days</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-zinc-400 font-bold block uppercase tracking-wide">Taken Leave</span>
                              <span className="text-sm font-extrabold text-gray-800 dark:text-zinc-200">{user.takenLeave} Days</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            </div>
          )}

          {/* SECTION 3: System Integrations */}
          {activeTab === 'integrations' && (
            <div className="space-y-8">
              <Card noPadding className="rounded-[2.2rem]">
                <div className="p-8 border-b border-gray-150/40 dark:border-white/5 bg-gradient-to-r from-purple-500/5 via-indigo-500/5 to-blue-500/5 flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="space-y-1">
                    <h3 className="text-xl font-black text-gray-900 dark:text-white">System Integrations</h3>
                    <p className="text-[10px] font-mono tracking-widest font-bold text-gray-400 uppercase font-mono">Secret Keys & Microservices</p>
                  </div>
                  <Button 
                    variant="primary" 
                    size="md" 
                    className="!rounded-xl border-none shadow-lg" 
                    onClick={handleSaveOrgSettings} 
                    isLoading={isSavingOrg}
                    icon={<span className="material-icons-outlined text-sm">save</span>}
                  >
                    Save API Credentials
                  </Button>
                </div>

                <div className="p-8 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                    {/* OpenStreetMap Card */}
                    <div className="flex items-center justify-between p-5 bg-zinc-50/50 dark:bg-zinc-800/10 border border-gray-200/50 dark:border-white/5 rounded-2xl relative shadow-sm">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-inner">
                          <span className="material-icons-outlined text-xl">map</span>
                        </div>
                        <div>
                          <h5 className="font-extrabold text-gray-900 dark:text-white text-sm">OpenStreetMap API</h5>
                          <p className="text-xs text-gray-400 leading-normal">Geocoding & spatial positioning</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 rounded-lg border border-emerald-100 dark:border-emerald-900/30">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[9px] font-black uppercase tracking-wider font-mono">Active</span>
                      </div>
                    </div>

                    {/* Open-Meteo Card */}
                    <div className="flex items-center justify-between p-5 bg-zinc-50/50 dark:bg-zinc-800/10 border border-gray-200/50 dark:border-white/5 rounded-2xl relative shadow-sm">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-orange-100 dark:bg-orange-950/20 text-orange-600 dark:text-orange-400 flex items-center justify-center shadow-inner">
                          <span className="material-icons-outlined text-xl font-black">thermostat</span>
                        </div>
                        <div>
                          <h5 className="font-extrabold text-gray-900 dark:text-white text-sm">Open-Meteo Weather</h5>
                          <p className="text-xs text-gray-400 leading-normal">Real-time local meteorology</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 rounded-lg border border-emerald-100 dark:border-emerald-900/30">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[9px] font-black uppercase tracking-wider font-mono">Active</span>
                      </div>
                    </div>

                    {/* Gemini AI Card */}
                    <div className="p-6 bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-white/5 rounded-2xl relative shadow-md md:col-span-2 space-y-4">
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400 flex items-center justify-center shadow-inner">
                            <span className="material-icons-outlined text-xl">auto_awesome</span>
                          </div>
                          <div>
                            <h5 className="font-extrabold text-gray-900 dark:text-white text-sm flex items-center gap-2">
                              Google Gemini Core Engine
                            </h5>
                            <p className="text-xs text-gray-400 leading-relaxed max-w-lg mt-0.5">Powers vacation recommendation engines, automatic destination classifications, packing list compiling, and smart itinerary generation.</p>
                          </div>
                        </div>
                        
                        <div className={`flex items-center gap-2 px-3  py-1.5 border rounded-xl font-mono ${isGeminiActive ? 'bg-emerald-50 dark:bg-emerald-950/25 text-emerald-600 dark:text-emerald-450 border-emerald-100 dark:border-emerald-900/30' : 'bg-rose-50 dark:bg-rose-950/25 text-rose-600 dark:text-rose-450 border-rose-100 dark:border-rose-900/30'}`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${isGeminiActive ? 'bg-emerald-550 animate-pulse' : 'bg-rose-500'}`} />
                          <span className="text-[10px] font-black uppercase tracking-wider">
                            {hasUserKey ? 'Key Configured' : hasEnvKey ? 'Active (Host)' : 'Inactive'}
                          </span>
                        </div>
                      </div>

                      <div className="max-w-2xl">
                        <Input 
                          placeholder="Your User Gemini API Key (Optional Override)" 
                          type="password"
                          value={config.googleGeminiApiKey || ''} 
                          onChange={e => setConfig({...config, googleGeminiApiKey: e.target.value})} 
                          className="!bg-gray-50 dark:!bg-black/20 font-mono text-sm leading-none py-3"
                          label="Custom User API Key Overwrite"
                        />
                        <p className="text-[10px] text-zinc-400 mt-2 font-mono leading-tight">Provide key override to replace host key. Leave blank to inherit systems default setting.</p>
                      </div>
                    </div>

                    {/* AviationStack Card */}
                    <div className="p-6 bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-white/5 rounded-2xl shadow-md space-y-4">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                            <span className="material-icons-outlined text-lg">flight</span>
                          </div>
                          <div>
                            <h5 className="font-extrabold text-gray-900 dark:text-white text-sm">AviationStack API</h5>
                            <p className="text-xs text-gray-400">Flight schedule telemetry</p>
                          </div>
                        </div>
                        <a 
                          href="https://aviationstack.com" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-[10px] font-black text-blue-500 hover:underline hover:text-blue-600 uppercase tracking-widest flex items-center gap-1 font-mono"
                        >
                          REGISTER <span className="material-icons-outlined text-[11px] block">open_in_new</span>
                        </a>
                      </div>
                      <Input 
                        placeholder="Paste Key (e.g. ce50...)" 
                        type="password"
                        value={config.aviationStackApiKey || ''} 
                        onChange={e => setConfig({...config, aviationStackApiKey: e.target.value})} 
                        className="!bg-gray-50 dark:!bg-black/20 font-mono text-xs leading-none py-3.5"
                      />
                    </div>

                    {/* Brandfetch Card */}
                    <div className="p-6 bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-white/5 rounded-2xl shadow-md space-y-4">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-pink-100 dark:bg-pink-950/20 text-pink-600 dark:text-pink-400 flex items-center justify-center">
                            <span className="material-icons-outlined text-lg">image</span>
                          </div>
                          <div>
                            <h5 className="font-extrabold text-gray-900 dark:text-white text-sm">Brandfetch Credentials</h5>
                            <p className="text-xs text-gray-400 font-sans">High-res airline branding vector logos</p>
                          </div>
                        </div>
                        <a 
                          href="https://brandfetch.com/developers" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-[10px] font-black text-pink-500 hover:underline hover:text-pink-650 uppercase tracking-widest flex items-center gap-1 font-mono"
                        >
                          REGISTER <span className="material-icons-outlined text-[11px] block font-black">open_in_new</span>
                        </a>
                      </div>
                      <Input 
                        placeholder="Paste Brandfetch Developer Key..." 
                        type="password"
                        value={config.brandfetchApiKey || ''} 
                        onChange={e => setConfig({...config, brandfetchApiKey: e.target.value})} 
                        className="!bg-gray-50 dark:!bg-black/20 font-mono text-xs leading-none py-3.5"
                      />
                    </div>

                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* SECTION 4: Master Gear */}
          {activeTab === 'gear' && (
            <div className="space-y-8">
              <GearSettingsTab 
                config={config} 
                setConfig={setConfig} 
                handleSaveOrgSettings={handleSaveOrgSettings} 
                isSavingOrg={isSavingOrg} 
              />
            </div>
          )}

          {/* SECTION 5: Operating Carriers */}
          {activeTab === 'carriers' && (
            <div className="space-y-8">
              <CarriersTab 
                config={config} 
                setConfig={setConfig} 
                handleSaveOrgSettings={handleSaveOrgSettings} 
                isSavingOrg={isSavingOrg} 
              />
            </div>
          )}

          {/* SECTION 6: Data & Backups */}
          {activeTab === 'data' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                
                {/* Database Lifecycle Card */}
                <Card noPadding className="rounded-[2.2rem]">
                  <div className="p-8 border-b border-gray-100 dark:border-white/5 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-white/5 dark:to-transparent">
                    <h3 className="text-lg font-black text-gray-900 dark:text-white leading-none">Database Lifecycle</h3>
                    <p className="text-[10px] font-mono tracking-widest leading-relaxed font-bold text-gray-400 uppercase mt-2">Persistence & Migration</p>
                  </div>

                  <div className="p-6 space-y-6">
                    <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30">
                      <div className="flex items-start gap-3">
                        <span className="material-icons-outlined text-amber-500 mt-1">warning</span>
                        <div className="space-y-1">
                          <p className="text-xs font-black text-amber-800 dark:text-amber-200 tracking-wide uppercase">System Warning</p>
                          <p className="text-[10px] text-amber-700/80 dark:text-amber-300/60 leading-normal font-semibold">Restoring from a backup will completely overwrite your database including all registered personnel roster accounts and trips.</p>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/20 border border-zinc-200 dark:border-zinc-800 space-y-2">
                      <p className="text-xs font-black text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">Unified Backup Features:</p>
                      <p className="text-[10px] text-zinc-500 font-medium leading-relaxed">Generates a secure offline file containing all personal records from server state maps:</p>
                      <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-zinc-650 dark:text-zinc-400 font-bold font-mono">
                        <li className="flex items-center gap-1.5"><span className="text-blue-500 text-base">•</span> Travel Atlas (visited)</li>
                        <li className="flex items-center gap-1.5"><span className="text-blue-500 text-base">•</span> Flight Log Boards</li>
                        <li className="flex items-center gap-1.5"><span className="text-blue-500 text-base">•</span> Trip & Route Rosters</li>
                        <li className="flex items-center gap-1.5"><span className="text-blue-500 text-base">•</span> Custom Event Boards</li>
                        <li className="flex items-center gap-1.5"><span className="text-blue-500 text-base">•</span> Team User Profiles</li>
                        <li className="flex items-center gap-1.5"><span className="text-blue-500 text-base">•</span> Workspace Settings</li>
                      </ul>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                      <Button 
                        onClick={handleExport} 
                        variant="primary" 
                        className="h-12 !rounded-xl text-xs font-bold font-sans tracking-wide border-none bg-blue-600 shadow-md shadow-blue-500/10 active:scale-95" 
                        icon={<span className="material-icons-outlined text-base">download</span>}
                      >
                        Generate Backup Database
                      </Button>
                      
                      <Button 
                        onClick={handleImportTrigger} 
                        variant="danger" 
                        className="h-12 !rounded-xl text-xs font-bold leading-none cursor-pointer border-dashed border bg-rose-50/20 text-rose-600 dark:bg-rose-950/25 dark:text-rose-400 border-rose-350 dark:border-rose-900 group-hover:bg-rose-50" 
                        icon={<span className="material-icons-outlined text-base">upload</span>}
                      >
                        Restore From Backup File
                      </Button>

                      <Button 
                        onClick={() => setIsResetModalOpen(true)} 
                        variant="danger" 
                        className="h-12 !rounded-xl text-xs font-bold border !bg-red-50/40 text-red-600 border-red-200 dark:!bg-red-955/20 dark:text-red-400 dark:border-red-900 flex items-center justify-center gap-2 hover:bg-red-50" 
                        icon={<span className="material-icons-outlined text-base">delete_forever</span>}
                      >
                        Wipe & Reset Application
                      </Button>

                      <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleFileSelect} />
                    </div>
                  </div>
                </Card>

                {/* Calendar Feeds Card */}
                <Card noPadding className="rounded-[2.2rem] h-full flex flex-col justify-between">
                  <div className="p-8 border-b border-gray-100 dark:border-white/5 bg-gradient-to-br from-teal-500/5 to-emerald-500/5">
                    <h3 className="text-lg font-black text-gray-900 dark:text-white leading-none">External Calendar Sync</h3>
                    <p className="text-[10px] font-mono font-bold tracking-widest text-teal-500 dark:text-teal-400 uppercase mt-2">Personal Synced Feeds</p>
                  </div>

                  <div className="p-6 space-y-6 flex-1 flex flex-col justify-between">
                    <div>
                      <p className="text-xs text-zinc-500 leading-relaxed font-semibold">Integrate WanderGrid trips dynamically with your personal tools like Google Calendar, Outlook, and Apple iCal.</p>
                    </div>

                    <div className="space-y-3 pt-4">
                      <Button onClick={handleCalendarExport} variant="secondary" className="w-full h-11 text-xs font-bold !rounded-xl">
                        <span className="material-icons-outlined text-base mr-2">event_note</span>
                        Download static .ICS calendar
                      </Button>
                      <Button onClick={handleCopySubscriptionLink} variant="secondary" className="w-full h-11 text-xs font-bold !rounded-xl">
                        <span className="material-icons-outlined text-base mr-2">rss_feed</span>
                        Copy subscription URL
                      </Button>
                    </div>
                  </div>
                </Card>

                {/* Spreadsheet Flight Ingestion */}
                <Card noPadding className="rounded-[2.2rem] md:col-span-2">
                  <div className="p-8 border-b border-zinc-100 dark:border-white/5 bg-gradient-to-r from-blue-500/5 to-indigo-500/5">
                    <h3 className="text-lg font-black text-gray-900 dark:text-white leading-none">Spreadsheet Flight Ingestion</h3>
                    <p className="text-[10px] font-mono tracking-widest font-bold text-gray-450 uppercase mt-2">Ingestion & Field Mapping Engine</p>
                  </div>

                  <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                    <div className="space-y-3">
                      <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest block font-mono">Automatic Column Mapper</span>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
                        Load Microsoft Excel (.xlsx), standard comma-separated tables (.csv), or AirTrail backup files. Map spreadsheet headers directly to internal database flight properties, select specific flight lists, and auto-compile them directly into trips.
                      </p>
                      
                      <div className="pt-2">
                        <Button 
                          onClick={() => setIsFlightWizardOpen(true)} 
                          variant="primary" 
                          className="h-11 text-xs font-bold !rounded-2xl shadow-md cursor-pointer border-none"
                        >
                          <span className="material-icons-outlined text-sm mr-2 block">auto_fix_high</span>
                          Load Spreadsheet File & Map Fields
                        </Button>
                      </div>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-950/20 p-5 rounded-2xl border border-zinc-200/50 dark:border-white/5 space-y-4">
                      <span className="text-[10px] font-mono font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest block">Roster Flight Exports</span>
                      <div className="grid grid-cols-3 gap-2">
                        <Button 
                          onClick={() => handleFlightExport('xlsx')} 
                          variant="secondary" 
                          className="h-10 text-[10px] font-bold !rounded-lg bg-white dark:bg-zinc-850"
                        >
                          Excel
                        </Button>
                        <Button 
                          onClick={() => handleFlightExport('csv')} 
                          variant="secondary" 
                          className="h-10 text-[10px] font-bold !rounded-lg bg-white dark:bg-zinc-850"
                        >
                          CSV
                        </Button>
                        <Button 
                          onClick={() => handleFlightExport('json')} 
                          variant="secondary" 
                          className="h-10 text-[10px] font-bold !rounded-lg bg-white dark:bg-zinc-850"
                        >
                          JSON
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>

              </div>
            </div>
          )}

        </main>
      </div>

      {/* MODAL: Restore Backup JSON Confirmation */}
      <Modal isOpen={isRestoreModalOpen} onClose={() => setIsRestoreModalOpen(false)} title="Restore Database Backup">
          <div className="space-y-6">
              {restoreStatus === 'idle' && (
                  <>
                      <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-900/30">
                          <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                              Confirm overwriting database state with restore file <span className="font-bold underline">{pendingFile?.name}</span>? All existing trips, flight statistics, and personnel rosters will be replaced.
                          </p>
                      </div>
                      <div className="flex gap-4">
                          <Button variant="ghost" className="flex-1 !rounded-xl" onClick={() => setIsRestoreModalOpen(false)}>Cancel</Button>
                          <Button variant="danger" className="flex-1 !rounded-xl border-none" onClick={handleConfirmRestore}>Yes, Overwrite State</Button>
                      </div>
                  </>
              )}
              {restoreStatus === 'reading' && <div className="text-center py-8"><span className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin block mx-auto mb-2" /><p className="font-bold text-sm">Reading file...</p></div>}
              {restoreStatus === 'importing' && <div className="text-center py-8"><span className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin block mx-auto mb-2" /><p className="font-bold text-sm">Parsing state database tables...</p></div>}
              {restoreStatus === 'success' && <div className="text-center py-8 text-emerald-500"><span className="material-icons-outlined text-4xl mb-2 block">check_circle</span><p className="font-extrabold">Restore Succeeded!</p><p className="text-xs text-gray-500 mt-2">Reloading current session parameters...</p></div>}
              {restoreStatus === 'error' && <div className="text-center py-8 text-rose-500"><span className="material-icons-outlined text-4xl mb-2">error</span><p className="font-bold">Restore Failed</p><p className="text-xs mt-2">{restoreErrorMessage}</p><Button variant="ghost" className="mt-4" onClick={() => setRestoreStatus('idle')}>Try Again</Button></div>}
          </div>
      </Modal>

      {/* MODAL: Wipe Application Data Danger Sequence */}
      <Modal isOpen={isResetModalOpen} onClose={() => { setIsResetModalOpen(false); setResetConfirmText(''); }} title="Dangerous Area: Wipe Database State">
          <div className="space-y-6 text-left">
              <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30">
                  <div className="flex items-start gap-3">
                      <span className="material-icons-outlined text-red-500 mt-0.5">warning</span>
                      <div className="space-y-1">
                          <p className="text-xs font-black text-red-800 dark:text-red-400 uppercase tracking-widest">Permanent Destruction Warning</p>
                          <p className="text-[11px] text-red-700/80 dark:text-red-350/60 leading-relaxed font-semibold">
                              This workflow is permanent and completely irreversible. It immediately destroys all registered personnel folders, calendar feeds, custom carrier configs, map paths, and independent flights.
                          </p>
                      </div>
                  </div>
              </div>
              
              <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase ml-1 block">To unlock Wipe Process, type DELETE below:</label>
                  <Input 
                      placeholder="Type DELETE" 
                      value={resetConfirmText} 
                      onChange={(e) => setResetConfirmText(e.target.value)} 
                      className="font-mono text-center uppercase font-bold"
                  />
              </div>

              <div className="flex gap-4 pt-4 border-t border-gray-100 dark:border-white/5">
                  <Button 
                      variant="ghost" 
                      className="flex-1 !rounded-xl" 
                      onClick={() => { setIsResetModalOpen(false); setResetConfirmText(''); }}
                  >
                      Abort
                  </Button>
                  <Button 
                      variant="danger" 
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/10 disabled:opacity-40 disabled:bg-gray-200 dark:disabled:bg-gray-800 !rounded-xl font-bold border-none" 
                      onClick={handleWipeDatabase}
                      disabled={resetConfirmText !== 'DELETE'}
                  >
                      WIPE DATABASE
                  </Button>
              </div>
          </div>
      </Modal>

      {/* MODAL: Enroll & Edit Personnel Account - Redesigned and Added Functional Component */}
      <Modal 
        isOpen={isEditingUser} 
        onClose={() => setIsEditingUser(false)} 
        title={editingUser.id ? "Edit Inhabitant Profile" : "Enroll Workspace Inhabitant"}
      >
        <div className="space-y-6 text-left">
          
          <div className="space-y-4">
            <Input 
              label="Personnel Name" 
              placeholder="e.g. Elena Rostova" 
              value={editingUser.name || ''} 
              onChange={e => setEditingUser({...editingUser, name: e.target.value})} 
            />

            <Input 
              label="Discovered Email Address" 
              placeholder="e.g. elena@wandergrid.abc" 
              value={editingUser.email || ''} 
              onChange={e => setEditingUser({...editingUser, email: e.target.value})} 
            />

            <Input 
              label="Portal Password" 
              type="password"
              placeholder="e.g. min 6 characters" 
              value={editingUser.password || ''} 
              onChange={e => setEditingUser({...editingUser, password: e.target.value})} 
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select 
                label="Roster Role" 
                value={editingUser.role || 'Partner'} 
                onChange={e => setConfig({...config})} // Avoid direct override crash, but set local
                onInput={(e: any) => setEditingUser({...editingUser, role: e.target.value})}
                options={[
                  { label: 'Admin (System)', value: 'Admin' },
                  { label: 'Partner (Associate)', value: 'Partner' },
                  { label: 'Child (Guest)', value: 'Child' }
                ]}
              />

              <Select 
                label="Holiday Weekend Rule" 
                value={editingUser.holidayWeekendRule || 'none'} 
                onInput={(e: any) => setEditingUser({...editingUser, holidayWeekendRule: e.target.value})}
                options={[
                  { label: 'Standard No Override', value: 'none' },
                  { label: 'Cycle Monday Policy', value: 'monday' },
                  { label: 'Compensate Lieu Rule', value: 'lieu' }
                ]}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input 
                label="Annual Accrual Balance (Days)" 
                type="number" 
                value={editingUser.leaveBalance ?? 25} 
                onChange={e => setEditingUser({...editingUser, leaveBalance: parseInt(e.target.value) || 0})}
              />

              <Input 
                label="Taken Vacation Days" 
                type="number" 
                value={editingUser.takenLeave ?? 0} 
                onChange={e => setEditingUser({...editingUser, takenLeave: parseInt(e.target.value) || 0})}
              />
            </div>

            {/* Custom Interactive Holiday Config selector checkbox container */}
            <div className="space-y-2 pt-2">
              <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide ml-1">Discovered Holiday Configurations ({savedConfigs.length})</span>
              <p className="text-[10px] text-zinc-400 font-sans leading-normal ml-1">Attach specific country legislative calendars for automated holiday calculation syncs:</p>
              
              <div className="bg-slate-50/50 dark:bg-black/20 p-3 rounded-xl border border-zinc-200/50 dark:border-white/5 max-h-36 overflow-y-auto space-y-2.5 custom-scrollbar">
                {savedConfigs.length === 0 ? (
                  <span className="text-[10px] font-mono text-zinc-400 block text-center py-4">No countries configs saved. Register them in planners.</span>
                ) : (
                  savedConfigs.map(sc => {
                    const activeIds = editingUser.holidayConfigIds ?? [];
                    const isChecked = activeIds.includes(sc.id);
                    return (
                      <label key={sc.id} className="flex items-center gap-3 p-1 rounded hover:bg-zinc-150/40 cursor-pointer transition-colors">
                        <input 
                          type="checkbox" 
                          checked={isChecked}
                          className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                          onChange={() => {
                            const nextIds = isChecked 
                              ? activeIds.filter(id => id !== sc.id)
                              : [...activeIds, sc.id];
                            setEditingUser({...editingUser, holidayConfigIds: nextIds});
                          }}
                        />
                        <div className="leading-tight">
                          <span className="text-xs font-bold text-gray-800 dark:text-zinc-200 block">{sc.countryName} ({sc.year})</span>
                          <span className="text-[9px] font-mono text-zinc-400 tracking-wider">CODE: {sc.countryCode} · {sc.holidays?.length || 0} statutory holidays</span>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

          </div>

          <div className="flex gap-4 pt-4 border-t border-gray-150/50 dark:border-white/10 shrink-0">
            <Button variant="ghost" className="flex-1 !rounded-xl cursor-pointer" onClick={() => setIsEditingUser(false)}>Cancel</Button>
            <Button 
              variant="primary" 
              className="flex-1 border-none !rounded-xl text-white font-bold cursor-pointer bg-blue-600 shadow-md shadow-blue-500/10" 
              disabled={!editingUser.name}
              onClick={handleSaveUser}
            >
              Commit & Persistence
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODAL: Delete inhabitant account confirmation */}
      <Modal isOpen={!!memberToDelete} onClose={() => setMemberToDelete(null)} title="Revoke Personnel Account">
        <div className="space-y-6 text-left">
          <div className="p-4 rounded-xl bg-red-50 dark:bg-red-955/20 border border-red-200 dark:border-red-900/30">
            <p className="text-sm font-semibold text-red-800 dark:text-red-400">
              Confirm revoking membership access and deletion of account for <span className="font-bold underline">{memberToDelete?.name}</span>? This does not delete associated individual flights, but details won't match.
            </p>
          </div>
          <div className="flex gap-4">
            <Button variant="ghost" className="flex-1 !rounded-xl" onClick={() => setMemberToDelete(null)}>Cancel</Button>
            <Button variant="danger" className="flex-1 !rounded-xl text-white font-bold border-none bg-red-650" onClick={handleConfirmDeleteMember}>Confirm Revocation</Button>
          </div>
        </div>
      </Modal>

      {/* Unified Flight Sheet Mapper wizard triggers */}
      <FlightImportWizard 
          isOpen={isFlightWizardOpen} 
          onClose={() => setIsFlightWizardOpen(false)} 
          onImportComplete={refreshData} 
          users={users} 
      />
    </div>
  );
};
