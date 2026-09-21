import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
    Gear, 
    Users, 
    Plugs, 
    SuitcaseSimple, 
    Airplane, 
    Database, 
    Sparkle, 
    Plus, 
    Check, 
    MagnifyingGlass as Search, 
    PencilSimpleLine as Edit3, 
    Trash as Trash2, 
    WarningCircle, 
    Eye, 
    EyeSlash, 
    MapPin, 
    Globe, 
    Compass, 
    ArrowSquareOut, 
    DownloadSimple, 
    UploadSimple, 
    CalendarBlank, 
    Warning, 
    CheckCircle,
    Copy,
    Sun,
    Moon,
    Clock,
    CaretDown
} from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'motion/react';
import GlassPanel from '../components/glass/GlassPanel';
import { Modal, Badge, Button, Input, Select } from '../components/ui';
import { dataService, ImportState } from '../services/mockDb';
import { calendarService } from '../services/calendarExport';
import { User, WorkspaceSettings, EntitlementType, SavedConfig, Trip } from '../types';
import { GearSettingsTab } from '../components/GearSettingsTab';
import { CarriersTab } from '../components/CarriersTab';
import { 
    INPUT_BASE_STYLE, 
    BTN_PRIMARY_STYLE, 
    BTN_SECONDARY_STYLE 
} from '../constants';

const FlightImportWizard = React.lazy(() => import('../components/FlightImportWizard').then(m => ({ default: m.FlightImportWizard })));

interface SettingsProps {
    onThemeChange?: (theme: 'light' | 'dark' | 'auto') => void;
}

type TabType = 'workspace' | 'personnel' | 'integrations' | 'gear' | 'carriers' | 'data';

export const Settings: React.FC<SettingsProps> = ({ onThemeChange }) => {
  const [activeTab, setActiveTab] = useState<TabType>('workspace');
  const [users, setUsers] = useState<User[]>([]);
  const [rosterSearch, setRosterSearch] = useState('');
  const [entitlements, setEntitlements] = useState<EntitlementType[]>([]);
  const [savedConfigs, setSavedConfigs] = useState<SavedConfig[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Personnel dialog controls
  const [memberToDelete, setMemberToDelete] = useState<User | null>(null);
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [editingUser, setEditingUser] = useState<Partial<User>>({});
  
  // Workspace Config States
  const [config, setConfig] = useState<WorkspaceSettings>({
      orgName: '',
      currency: 'USD',
      dateFormat: 'ddd D MMM, YYYY',
      autoSync: false,
      theme: 'light',
      workingDays: [1, 2, 3, 4, 5],
      aviationStackApiKey: '',
      brandfetchApiKey: '',
      googleGeminiApiKey: '',
      cartoApiKey: '',
      masterPackingList: [],
      carriers: [],
      defaultTravelClass: 'Economy',
      defaultStartingAirport: '',
      defaultLandTransportMethod: 'Train',
      defaultBasemapLight: 'snow',
      defaultBasemapDark: 'onyx'
  });
  const [isSavingOrg, setIsSavingOrg] = useState(false);
  const [saveToast, setSaveToast] = useState(false);

  // Password / Key visibility toggles
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const toggleKeyVisibility = (key: string) => {
    setVisibleKeys(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Calendar copy feedback
  const [copiedCalendar, setCopiedCalendar] = useState(false);

  // Backup file controls
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [restoreStatus, setRestoreStatus] = useState<'idle' | 'reading' | 'importing' | 'success' | 'error'>('idle');
  const [restoreErrorMessage, setRestoreErrorMessage] = useState('');

  // Flight Wizard
  const [isFlightWizardOpen, setIsFlightWizardOpen] = useState(false);

  // Database Reset Danger workflow
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');

  useEffect(() => {
    refreshData();
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
          const newUser: User = {
              ...editingUser,
              id: 'u_' + Date.now(),
              email: finalEmail,
              password: password || 'password',
              profilePicture: editingUser.profilePicture || '',
              role: editingUser.role || 'Partner',
              leaveBalance: editingUser.leaveBalance ?? 25,
              takenLeave: 0,
              allowance: editingUser.allowance ?? 25,
              policies: editingUser.policies || [],
              holidayConfigIds: editingUser.holidayConfigIds || [],
              holidayWeekendRule: editingUser.holidayWeekendRule || 'none',
              activeYears: editingUser.activeYears || [new Date().getFullYear()]
          } as User;
          await dataService.addUser(newUser);
      }
      setIsEditingUser(false);
      refreshData();
  };

  const handleConfirmDeleteMember = async () => {
      if (memberToDelete?.id) {
          await dataService.deleteUser(memberToDelete.id);
          setMemberToDelete(null);
          refreshData();
      }
  };

  const handleSaveOrgSettings = async () => { 
      setIsSavingOrg(true);
      await dataService.updateWorkspaceSettings(config);
      if (onThemeChange) onThemeChange(config.theme);
      setIsSavingOrg(false);
      setSaveToast(true);
      setTimeout(() => setSaveToast(false), 2500);
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

  const handleConfirmRestore = () => { 
      if (!pendingFile) return;
      setRestoreStatus('reading');
      const reader = new FileReader();
      reader.onload = async (ev) => {
          const content = ev.target?.result as string;
          if (!content) {
              setRestoreStatus('error');
              setRestoreErrorMessage('Could not read file payload.');
              return;
          }
          setRestoreStatus('importing');
          try {
              await dataService.importFullState(content);
              setRestoreStatus('success');
              setTimeout(() => {
                  setIsRestoreModalOpen(false);
                  window.location.reload();
              }, 1200);
          } catch (err: any) {
              setRestoreStatus('error');
              setRestoreErrorMessage(err.message || 'Corrupt schema or unrecognized data format.');
          }
      };
      reader.readAsText(pendingFile);
  };

  const handleCalendarExport = async () => {
      const trips = await dataService.getTrips();
      const ics = calendarService.generateIcsContent(trips, config.orgName || 'WanderGrid');
      calendarService.downloadIcs(ics, `wandergrid-calendar-${new Date().toISOString().split('T')[0]}.ics`);
  };

  const handleCopySubscriptionLink = async () => {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const url = `${origin}/api/calendar.ics`;
      try {
          await navigator.clipboard.writeText(url);
          setCopiedCalendar(true);
          setTimeout(() => setCopiedCalendar(false), 2000);
      } catch (e) {
          console.warn('Clipboard write failed:', e);
      }
  };

  const hasEnvKey = !!process.env.API_KEY;
  const hasUserKey = !!config.googleGeminiApiKey;
  const isGeminiActive = hasEnvKey || hasUserKey;

  const filteredUsers = useMemo(() => {
      const search = rosterSearch.toLowerCase().trim();
      return users.filter(user => {
          return !search || 
              user.name?.toLowerCase().includes(search) || 
              user.email?.toLowerCase().includes(search) || 
              user.role?.toLowerCase().includes(search);
      });
  }, [users, rosterSearch]);

  const tabs: { id: TabType; label: string; icon: React.ReactNode; badge?: number | string }[] = [
    { id: 'workspace', label: 'Workspace', icon: <Gear className="w-4 h-4" /> },
    { id: 'personnel', label: 'Personnel', icon: <Users className="w-4 h-4" />, badge: users.length },
    { id: 'integrations', label: 'Integrations', icon: <Plugs className="w-4 h-4" />, badge: isGeminiActive ? 'Live' : undefined },
    { id: 'gear', label: 'Gear', icon: <SuitcaseSimple className="w-4 h-4" />, badge: config.masterPackingList?.length || 0 },
    { id: 'carriers', label: 'Carriers', icon: <Airplane className="w-4 h-4" />, badge: config.carriers?.length || 0 },
    { id: 'data', label: 'Data Management', icon: <Database className="w-4 h-4" /> }
  ];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-24 h-[60vh] space-y-4 text-center">
        <span className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin block" />
        <p className="font-bold text-xs uppercase tracking-widest text-light-text-secondary dark:text-dark-text-secondary animate-pulse">
          Loading Workspace Configuration...
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1680px] mx-auto pt-2 sm:pt-4 px-1 sm:px-4 md:px-6 lg:px-8 flex flex-col gap-5 sm:gap-6 animate-fadeIn pb-16 font-sans select-none">
      
      {/* ========================================================================= */}
      {/* HERO HEADER: Title Aligned Left, Button Aligned Right on Mobile & Desktop */}
      {/* ========================================================================= */}
      <div className="flex flex-row items-center justify-between gap-2.5 sm:gap-4 w-full pt-1 pb-1">
        {/* Left: Pure Icon + Responsive Page Name (Aligned Left) */}
        <div className="flex items-center justify-start gap-2 sm:gap-3 md:gap-4 min-w-0">
          <Gear 
            className="w-6 h-6 sm:w-9 sm:h-9 md:w-12 md:h-12 text-primary-500 shrink-0" 
            weight="duotone" 
          />
          <h1 className="text-xl sm:text-3xl md:text-5xl font-black text-light-text dark:text-white tracking-tight leading-tight sm:leading-none truncate sm:overflow-visible">
            Workspace Settings
          </h1>
        </div>

        {/* Right: Save Settings Action Button (Aligned Right on Mobile & Desktop) */}
        <div className="flex items-center justify-end gap-2 shrink-0">
          {saveToast && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold border border-emerald-500/20 animate-fade-in">
              <CheckCircle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Saved</span>
            </span>
          )}
          <Button
            variant="primary"
            className="shrink-0"
            onClick={handleSaveOrgSettings}
            disabled={isSavingOrg}
            icon={isSavingOrg ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
          >
            {isSavingOrg ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* FLOATING MAP-STYLE TAB SELECTOR                                          */}
      {/* ========================================================================= */}
      <div className="flex items-center justify-center sm:justify-start overflow-x-auto sm:overflow-visible no-scrollbar p-3 -m-3 shrink-0 w-full sm:w-auto">
        <GlassPanel
          className="wg-glass-pill shadow-lg shadow-black/5 dark:shadow-black/25 shrink-0"
          padding="4px 6px"
          overrides={{ borderRadius: 9999 }}
        >
          <div className="flex gap-1 relative items-center">
            {tabs.map((tab) => {
              const isSelected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  title={tab.label}
                  className={`relative rounded-full text-xs font-bold transition-all duration-200 flex items-center justify-center cursor-pointer select-none active:scale-95 ${
                    isSelected
                      ? 'text-primary-600 dark:text-primary-400 px-4 sm:px-5 py-2.5'
                      : 'text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text px-3 sm:px-5 py-2.5'
                  }`}
                >
                  {isSelected && (
                    <motion.div
                      layoutId="activeSettingsTabIndicator"
                      className="absolute inset-0 rounded-full bg-primary-500/15 dark:bg-primary-500/20 backdrop-blur-md border border-primary-500/30 shadow-sm z-0"
                      style={{ WebkitBackdropFilter: 'blur(12px)' }}
                      transition={{ type: "spring", stiffness: 450, damping: 32 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-2 sm:gap-2.5">
                    {React.cloneElement(tab.icon as React.ReactElement<any>, {
                      className: `w-4 h-4 shrink-0 transition-colors ${isSelected ? 'text-primary-500 dark:text-primary-400' : ''}`,
                      weight: 'duotone'
                    })}
                    <span className={`tracking-tight ${isSelected ? 'inline' : 'hidden sm:inline'}`}>
                      {tab.label}
                    </span>
                    {tab.badge !== undefined && (
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold border transition-colors ${
                        isSelected
                          ? 'bg-primary-500/20 text-primary-700 dark:text-primary-300 border-primary-500/30'
                          : 'bg-black/5 dark:bg-white/5 text-light-text-secondary dark:text-dark-text-secondary border-black/5 dark:border-white/10 hidden sm:inline'
                      }`}>
                        {tab.badge}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </GlassPanel>
      </div>

      {/* ========================================================================= */}
      {/* SUB-PAGE 1: WORKSPACE IDENTITY & LOCALIZATION                             */}
      {/* ========================================================================= */}
      {activeTab === 'workspace' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-fade-in">
          
          {/* Left Column: Identity & Cartography Defaults */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            
            {/* Identity & Localization */}
            <div className="flex flex-col overflow-hidden rounded-[28px]">
              <GlassPanel
                className="wg-glass-card shadow-glass-card flex flex-col h-full overflow-hidden border border-black/5 dark:border-white/10"
                overrides={{ borderRadius: 28 }}
                padding="0px"
              >
                <div className="flex flex-col h-full w-full overflow-hidden rounded-[28px]">
                  {/* Card Header Banner */}
                  <div className="p-5 border-b border-black/5 dark:border-white/5 flex items-center justify-between bg-gradient-to-r from-primary-500/10 via-primary-500/5 to-transparent shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-white bg-gradient-to-br from-primary-500 to-indigo-600 shadow-md shadow-primary-500/20 shrink-0">
                        <Gear className="w-5 h-5" weight="duotone" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h2 className="text-base font-bold text-light-text dark:text-dark-text tracking-tight">
                            Identity &amp; Localization
                          </h2>
                          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-primary-500/15 text-primary-700 dark:text-primary-300 border border-primary-500/25">
                            Core
                          </span>
                        </div>
                        <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary font-medium truncate mt-0.5">
                          Workspace branding, currency, date formatting, and appearance
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-5 sm:p-6 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Input
                        label="Workspace Name"
                        type="text"
                        value={config.orgName}
                        placeholder="WanderGrid Workspace"
                        onChange={e => setConfig({ ...config, orgName: e.target.value })}
                        containerClassName="sm:col-span-2"
                      />

                      <Select
                        label="Locality Currency"
                        value={config.currency}
                        onChange={e => setConfig({ ...config, currency: e.target.value })}
                      >
                        <option value="USD">USD ($) United States Dollar</option>
                        <option value="EUR">EUR (€) Euro</option>
                        <option value="GBP">GBP (£) British Pound</option>
                        <option value="AUD">AUD ($) Australian Dollar</option>
                        <option value="CAD">CAD ($) Canadian Dollar</option>
                        <option value="CHF">CHF (Fr) Swiss Franc</option>
                        <option value="JPY">JPY (¥) Japanese Yen</option>
                        <option value="AED">AED (د.إ) UAE Dirham</option>
                        <option value="SGD">SGD ($) Singapore Dollar</option>
                      </Select>

                      <Select
                        label="Default Date Format"
                        value={config.dateFormat || 'ddd D MMM, YYYY'}
                        onChange={e => setConfig({ ...config, dateFormat: e.target.value })}
                      >
                        <option value="ddd D MMM, YYYY">Mon 21 Sep, 2026 (Default)</option>
                        <option value="MM/DD/YYYY">MM/DD/YYYY (e.g. 05/25/2026)</option>
                        <option value="DD/MM/YYYY">DD/MM/YYYY (e.g. 25/05/2026)</option>
                        <option value="YYYY-MM-DD">YYYY-MM-DD (e.g. 2026-05-25)</option>
                      </Select>

                      <Select
                        label="Interface Theme"
                        value={config.theme}
                        onChange={e => setConfig({ ...config, theme: e.target.value as any })}
                        containerClassName="sm:col-span-2"
                      >
                        <option value="auto">System Automatic (Match Device)</option>
                        <option value="light">Light Mode</option>
                        <option value="dark">Dark Mode</option>
                      </Select>
                    </div>
                  </div>
                </div>
              </GlassPanel>
            </div>

            {/* Cartographic Basemaps (Light & Dark Defaults) */}
            <div className="flex flex-col overflow-hidden rounded-[28px]">
              <GlassPanel
                className="wg-glass-card shadow-glass-card flex flex-col h-full overflow-hidden border border-black/5 dark:border-white/10"
                overrides={{ borderRadius: 28 }}
                padding="0px"
              >
                <div className="flex flex-col h-full w-full overflow-hidden rounded-[28px]">
                  {/* Card Header Banner */}
                  <div className="p-5 border-b border-black/5 dark:border-white/5 flex items-center justify-between bg-gradient-to-r from-sky-500/10 via-sky-500/5 to-transparent shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-white bg-gradient-to-br from-sky-500 to-blue-600 shadow-md shadow-sky-500/20 shrink-0">
                        <Globe className="w-5 h-5" weight="duotone" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h2 className="text-base font-bold text-light-text dark:text-dark-text tracking-tight">
                            Cartographic Basemaps
                          </h2>
                          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/25">
                            Cartography
                          </span>
                        </div>
                        <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary font-medium truncate mt-0.5">
                          Default map visual schemes for daytime and nighttime surfaces
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-5 sm:p-6 space-y-6">
                    {/* Light Mode Default Basemap Selection */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Sun className="w-4 h-4 text-amber-500" weight="duotone" />
                        <span className="text-xs font-bold uppercase tracking-wider text-light-text dark:text-dark-text">
                          Default Basemap (Light Mode)
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {[
                          { id: 'snow', label: 'Snow', desc: 'Clean Positron' },
                          { id: 'vibrant', label: 'Vibrant', desc: 'Voyager Detailed' },
                          { id: 'ocean', label: 'Ocean', desc: 'Nautical Marine' }
                        ].map(b => {
                          const isSelected = (config.defaultBasemapLight || 'snow') === b.id;
                          return (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => setConfig({ ...config, defaultBasemapLight: b.id as any })}
                              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                                isSelected
                                  ? 'bg-primary-500/10 border-primary-500 ring-2 ring-primary-500/20 text-primary-600 dark:text-primary-400'
                                  : 'bg-black/5 dark:bg-white/5 border-black/5 dark:border-white/5 hover:border-black/15 dark:hover:border-white/15'
                              }`}
                            >
                              <div className="flex items-center justify-between w-full">
                                <span className="text-xs font-bold uppercase tracking-wider">{b.label}</span>
                                <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                                  isSelected ? 'border-primary-500 bg-primary-500' : 'border-black/30 dark:border-white/30'
                                }`}>
                                  {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                </div>
                              </div>
                              <span className="text-2xs font-mono text-light-text-secondary dark:text-dark-text-secondary mt-1">
                                {b.desc}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Dark Mode Default Basemap Selection */}
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center gap-2">
                        <Moon className="w-4 h-4 text-indigo-400" weight="duotone" />
                        <span className="text-xs font-bold uppercase tracking-wider text-light-text dark:text-dark-text">
                          Default Basemap (Dark Mode)
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {[
                          { id: 'onyx', label: 'Onyx', desc: 'Dark Matter Minimal' },
                          { id: 'citylights', label: 'City Lights', desc: 'Nocturnal Glow' },
                          { id: 'satellite', label: 'Satellite', desc: 'Orbital Photoreal' }
                        ].map(b => {
                          const isSelected = (config.defaultBasemapDark || 'onyx') === b.id;
                          return (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => setConfig({ ...config, defaultBasemapDark: b.id as any })}
                              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                                isSelected
                                  ? 'bg-primary-500/10 border-primary-500 ring-2 ring-primary-500/20 text-primary-600 dark:text-primary-400'
                                  : 'bg-black/5 dark:bg-white/5 border-black/5 dark:border-white/5 hover:border-black/15 dark:hover:border-white/15'
                              }`}
                            >
                              <div className="flex items-center justify-between w-full">
                                <span className="text-xs font-bold uppercase tracking-wider">{b.label}</span>
                                <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                                  isSelected ? 'border-primary-500 bg-primary-500' : 'border-black/30 dark:border-white/30'
                                }`}>
                                  {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                </div>
                              </div>
                              <span className="text-2xs font-mono text-light-text-secondary dark:text-dark-text-secondary mt-1">
                                {b.desc}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </GlassPanel>
            </div>

          </div>

          {/* Right Column: Travel Defaults & Workdays */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            
            {/* Travel Defaults */}
            <div className="flex flex-col overflow-hidden rounded-[28px]">
              <GlassPanel
                className="wg-glass-card shadow-glass-card flex flex-col h-full overflow-hidden border border-black/5 dark:border-white/10"
                overrides={{ borderRadius: 28 }}
                padding="0px"
              >
                <div className="flex flex-col h-full w-full overflow-hidden rounded-[28px]">
                  {/* Card Header Banner */}
                  <div className="p-5 border-b border-black/5 dark:border-white/5 flex items-center justify-between bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-white bg-gradient-to-br from-emerald-500 to-teal-600 shadow-md shadow-emerald-500/20 shrink-0">
                        <Airplane className="w-5 h-5" weight="duotone" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h2 className="text-base font-bold text-light-text dark:text-dark-text tracking-tight">
                            Travel Defaults
                          </h2>
                          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
                            Travel
                          </span>
                        </div>
                        <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary font-medium truncate mt-0.5">
                          Default cabin tier, departure aerodrome, and ground transport
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-5 sm:p-6 space-y-4">
                    <Select
                      label="Default Flight Cabin Class"
                      value={config.defaultTravelClass || 'Economy'}
                      onChange={e => setConfig({ ...config, defaultTravelClass: e.target.value as any })}
                    >
                      <option value="Economy">Economy</option>
                      <option value="Premium Economy">Premium Economy</option>
                      <option value="Business">Business</option>
                      <option value="First">First</option>
                    </Select>

                    <Input
                      label="Default Starting Airport (IATA)"
                      type="text"
                      maxLength={3}
                      placeholder="e.g. LAX, LHR, SYD"
                      value={config.defaultStartingAirport || ''}
                      onChange={e => setConfig({ ...config, defaultStartingAirport: e.target.value.toUpperCase() })}
                      className="font-mono uppercase"
                    />

                    <Select
                      label="Default Land Transit Mode"
                      value={config.defaultLandTransportMethod || 'Train'}
                      onChange={e => setConfig({ ...config, defaultLandTransportMethod: e.target.value as any })}
                    >
                      <option value="Train">Train</option>
                      <option value="Bus">Bus</option>
                      <option value="Car Rental">Car Rental</option>
                      <option value="Personal Car">Personal Car</option>
                      <option value="Cruise">Cruise</option>
                      <option value="Ferry">Ferry</option>
                    </Select>
                  </div>
                </div>
              </GlassPanel>
            </div>

            {/* Operational Workdays */}
            <div className="flex flex-col overflow-hidden rounded-[28px]">
              <GlassPanel
                className="wg-glass-card shadow-glass-card flex flex-col h-full overflow-hidden border border-black/5 dark:border-white/10"
                overrides={{ borderRadius: 28 }}
                padding="0px"
              >
                <div className="flex flex-col h-full w-full overflow-hidden rounded-[28px]">
                  {/* Card Header Banner */}
                  <div className="p-5 border-b border-black/5 dark:border-white/5 flex items-center justify-between bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-white bg-gradient-to-br from-amber-500 to-orange-500 shadow-md shadow-amber-500/20 shrink-0">
                        <Clock className="w-5 h-5" weight="duotone" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h2 className="text-base font-bold text-light-text dark:text-dark-text tracking-tight">
                            Operational Workdays
                          </h2>
                          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25">
                            {config.workingDays.length} of 7 active
                          </span>
                        </div>
                        <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary font-medium truncate mt-0.5">
                          Weekly working calendar schedule for PTO &amp; leave tracking
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-5 sm:p-6 space-y-4">
                    <div className="grid grid-cols-7 gap-2">
                      {[
                        { index: 0, label: 'S' },
                        { index: 1, label: 'M' },
                        { index: 2, label: 'T' },
                        { index: 3, label: 'W' },
                        { index: 4, label: 'T' },
                        { index: 5, label: 'F' },
                        { index: 6, label: 'S' }
                      ].map(d => {
                        const isActive = config.workingDays.includes(d.index);
                        return (
                          <button
                            key={d.index}
                            type="button"
                            onClick={() => toggleWorkingDay(d.index)}
                            className={`h-11 rounded-xl font-mono text-xs font-black transition-all cursor-pointer ${
                              isActive
                                ? 'bg-primary-500 text-white shadow-md shadow-primary-500/30'
                                : 'bg-black/5 dark:bg-white/5 text-light-text-secondary dark:text-dark-text-secondary hover:bg-black/10 dark:hover:bg-white/10'
                            }`}
                          >
                            {d.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </GlassPanel>
            </div>

          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-PAGE 2: PERSONNEL ROSTER                                              */}
      {/* ========================================================================= */}
      {activeTab === 'personnel' && (
        <div className="space-y-6 animate-fade-in">
          
          {/* Action Toolbar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <div className="flex-1 max-w-md">
              <Input
                type="text"
                placeholder="Search team members by name, email, or role..."
                value={rosterSearch}
                onChange={e => setRosterSearch(e.target.value)}
                leftElement={<Search className="w-4 h-4" />}
              />
            </div>

            <Button
              variant="primary"
              onClick={handleCreateUser}
              className="h-11 px-5 rounded-2xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shrink-0"
              icon={<Plus className="w-4 h-4" />}
            >
              Enroll Member
            </Button>
          </div>

          {/* Members Grid */}
          {filteredUsers.length === 0 ? (
            <div className="flex flex-col overflow-hidden rounded-[28px]">
              <GlassPanel
                className="wg-glass-card shadow-glass-card flex flex-col p-12 text-center border border-black/5 dark:border-white/10"
                overrides={{ borderRadius: 28 }}
                padding="48px"
              >
                <Users className="w-12 h-12 text-light-text-secondary dark:text-dark-text-secondary mx-auto opacity-40 mb-3" weight="duotone" />
                <p className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
                  No active personnel matching filters
                </p>
              </GlassPanel>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredUsers.map(user => (
                <div key={user.id || user.email} className="flex flex-col overflow-hidden rounded-[28px]">
                  <GlassPanel
                    className="wg-glass-card shadow-glass-card flex flex-col h-full overflow-hidden border border-black/5 dark:border-white/10 hover:border-black/15 dark:hover:border-white/20 transition-all"
                    overrides={{ borderRadius: 28 }}
                    padding="0px"
                  >
                    <div className="flex flex-col h-full w-full overflow-hidden rounded-[28px] p-5 justify-between space-y-4">
                      <div className="space-y-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-white text-base shrink-0 shadow-md ${
                              user.role === 'Admin' 
                                ? 'bg-gradient-to-br from-purple-500 to-indigo-600 shadow-purple-500/20' 
                                : user.role === 'Partner' 
                                ? 'bg-gradient-to-br from-blue-500 to-indigo-600 shadow-blue-500/20' 
                                : 'bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/20'
                            }`}>
                              {user.name?.charAt(0) || '?'}
                            </div>
                            <div className="min-w-0">
                              <h4 className="font-bold text-sm text-light-text dark:text-dark-text truncate">
                                {user.name}
                              </h4>
                              <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary truncate mt-0.5 font-medium">
                                {user.email || 'No email registered'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleEditUser(user)}
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-light-text-secondary hover:text-primary-500 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                              title="Edit member"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setMemberToDelete(user)}
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-light-text-secondary hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                              title="Delete member"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-full text-2xs font-mono font-bold uppercase tracking-wider bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-500/20">
                            {user.role}
                          </span>
                          <span className="text-2xs font-mono text-light-text-secondary/70 dark:text-dark-text-secondary/70">
                            ID: {user.id}
                          </span>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-black/5 dark:border-white/5 grid grid-cols-2 gap-2 text-left bg-black/5 dark:bg-white/5 p-3 rounded-2xl">
                        <div>
                          <span className="text-2xs text-light-text-secondary dark:text-dark-text-secondary font-bold uppercase tracking-wider block">
                            Accrued Balance
                          </span>
                          <span className="text-sm font-black text-light-text dark:text-dark-text">
                            {user.leaveBalance} Days
                          </span>
                        </div>
                        <div>
                          <span className="text-2xs text-light-text-secondary dark:text-dark-text-secondary font-bold uppercase tracking-wider block">
                            Taken Leave
                          </span>
                          <span className="text-sm font-black text-light-text dark:text-dark-text">
                            {user.takenLeave} Days
                          </span>
                        </div>
                      </div>
                    </div>
                  </GlassPanel>
                </div>
              ))}
            </div>
          )}

        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-PAGE 3: SYSTEM INTEGRATIONS                                           */}
      {/* ========================================================================= */}
      {activeTab === 'integrations' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
          
          {/* Google Gemini AI */}
          <div className="md:col-span-2 flex flex-col overflow-hidden rounded-[28px]">
            <GlassPanel
              className="wg-glass-card shadow-glass-card flex flex-col h-full overflow-hidden border border-black/5 dark:border-white/10"
              overrides={{ borderRadius: 28 }}
              padding="0px"
            >
              <div className="flex flex-col h-full w-full overflow-hidden rounded-[28px]">
                <div className="p-5 border-b border-black/5 dark:border-white/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-gradient-to-r from-purple-500/10 via-purple-500/5 to-transparent shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 text-white shadow-md shadow-purple-500/20 flex items-center justify-center shrink-0">
                      <Sparkle className="w-5 h-5" weight="duotone" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-light-text dark:text-dark-text tracking-tight">
                        Google Gemini Core Engine
                      </h3>
                      <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary font-medium truncate mt-0.5">
                        Autonomous trip planning and intelligent route parsing engine
                      </p>
                    </div>
                  </div>

                  <span className={`px-2.5 py-1 rounded-full text-2xs font-mono font-bold uppercase tracking-wider border ${
                    isGeminiActive 
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' 
                      : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                  }`}>
                    {hasUserKey ? 'Key Configured' : hasEnvKey ? 'Active (Host)' : 'Inactive'}
                  </span>
                </div>

                <div className="p-5 sm:p-6 max-w-xl">
                  <Input
                    label="Custom Gemini API Key"
                    type={visibleKeys['gemini'] ? 'text' : 'password'}
                    placeholder="Paste Gemini API Key..."
                    value={config.googleGeminiApiKey || ''}
                    onChange={e => setConfig({ ...config, googleGeminiApiKey: e.target.value })}
                    className="font-mono"
                    rightElement={
                      <button
                        type="button"
                        onClick={() => toggleKeyVisibility('gemini')}
                        className="text-light-text-secondary hover:text-light-text dark:hover:text-dark-text p-1 cursor-pointer"
                        aria-label="Toggle Gemini API key visibility"
                      >
                        {visibleKeys['gemini'] ? <EyeSlash className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    }
                  />
                </div>
              </div>
            </GlassPanel>
          </div>

          {/* AviationStack API */}
          <div className="flex flex-col overflow-hidden rounded-[28px]">
            <GlassPanel
              className="wg-glass-card shadow-glass-card flex flex-col h-full overflow-hidden border border-black/5 dark:border-white/10"
              overrides={{ borderRadius: 28 }}
              padding="0px"
            >
              <div className="flex flex-col h-full w-full overflow-hidden rounded-[28px]">
                <div className="p-5 border-b border-black/5 dark:border-white/5 flex items-center justify-between bg-gradient-to-r from-blue-500/10 via-blue-500/5 to-transparent shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-500/20 flex items-center justify-center shrink-0">
                      <Airplane className="w-5 h-5" weight="duotone" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-light-text dark:text-dark-text tracking-tight">
                        AviationStack API
                      </h3>
                      <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary font-medium truncate mt-0.5">
                        Live commercial flight tracking and aerodrome telemetry
                      </p>
                    </div>
                  </div>
                  <a
                    href="https://aviationstack.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono font-bold text-primary-500 hover:underline flex items-center gap-1 shrink-0"
                  >
                    <span>DOCS</span>
                    <ArrowSquareOut className="w-3.5 h-3.5" />
                  </a>
                </div>

                <div className="p-5 sm:p-6">
                  <Input
                    label="API Key"
                    type={visibleKeys['aviation'] ? 'text' : 'password'}
                    placeholder="Paste AviationStack Key..."
                    value={config.aviationStackApiKey || ''}
                    onChange={e => setConfig({ ...config, aviationStackApiKey: e.target.value })}
                    className="font-mono"
                    rightElement={
                      <button
                        type="button"
                        onClick={() => toggleKeyVisibility('aviation')}
                        className="text-light-text-secondary hover:text-light-text dark:hover:text-dark-text p-1 cursor-pointer"
                        aria-label="Toggle AviationStack API key visibility"
                      >
                        {visibleKeys['aviation'] ? <EyeSlash className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    }
                  />
                </div>
              </div>
            </GlassPanel>
          </div>

          {/* Brandfetch API */}
          <div className="flex flex-col overflow-hidden rounded-[28px]">
            <GlassPanel
              className="wg-glass-card shadow-glass-card flex flex-col h-full overflow-hidden border border-black/5 dark:border-white/10"
              overrides={{ borderRadius: 28 }}
              padding="0px"
            >
              <div className="flex flex-col h-full w-full overflow-hidden rounded-[28px]">
                <div className="p-5 border-b border-black/5 dark:border-white/5 flex items-center justify-between bg-gradient-to-r from-pink-500/10 via-pink-500/5 to-transparent shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600 text-white shadow-md shadow-pink-500/20 flex items-center justify-center shrink-0">
                      <Globe className="w-5 h-5" weight="duotone" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-light-text dark:text-dark-text tracking-tight">
                        Brandfetch Credentials
                      </h3>
                      <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary font-medium truncate mt-0.5">
                        High-resolution carrier branding and airline tail icons
                      </p>
                    </div>
                  </div>
                  <a
                    href="https://brandfetch.com/developers"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono font-bold text-pink-500 hover:underline flex items-center gap-1 shrink-0"
                  >
                    <span>DOCS</span>
                    <ArrowSquareOut className="w-3.5 h-3.5" />
                  </a>
                </div>

                <div className="p-5 sm:p-6">
                  <Input
                    label="Developer API Key"
                    type={visibleKeys['brandfetch'] ? 'text' : 'password'}
                    placeholder="Paste Brandfetch Key..."
                    value={config.brandfetchApiKey || ''}
                    onChange={e => setConfig({ ...config, brandfetchApiKey: e.target.value })}
                    className="font-mono"
                    rightElement={
                      <button
                        type="button"
                        onClick={() => toggleKeyVisibility('brandfetch')}
                        className="text-light-text-secondary hover:text-light-text dark:hover:text-dark-text p-1 cursor-pointer"
                        aria-label="Toggle Brandfetch API key visibility"
                      >
                        {visibleKeys['brandfetch'] ? <EyeSlash className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    }
                  />
                </div>
              </div>
            </GlassPanel>
          </div>

          {/* CARTO Maps API */}
          <div className="flex flex-col overflow-hidden rounded-[28px]">
            <GlassPanel
              className="wg-glass-card shadow-glass-card flex flex-col h-full overflow-hidden border border-black/5 dark:border-white/10"
              overrides={{ borderRadius: 28 }}
              padding="0px"
            >
              <div className="flex flex-col h-full w-full overflow-hidden rounded-[28px]">
                <div className="p-5 border-b border-black/5 dark:border-white/5 flex items-center justify-between bg-gradient-to-r from-cyan-500/10 via-cyan-500/5 to-transparent shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/20 flex items-center justify-center shrink-0">
                      <MapPin className="w-5 h-5" weight="duotone" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-light-text dark:text-dark-text tracking-tight">
                        CARTO Maps API
                      </h3>
                      <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary font-medium truncate mt-0.5">
                        High-throughput vector basemaps and geographical tile feeds
                      </p>
                    </div>
                  </div>
                  <a
                    href="https://carto.com/basemaps/apikey/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono font-bold text-cyan-500 hover:underline flex items-center gap-1 shrink-0"
                  >
                    <span>DOCS</span>
                    <ArrowSquareOut className="w-3.5 h-3.5" />
                  </a>
                </div>

                <div className="p-5 sm:p-6">
                  <Input
                    label="API Key (Optional)"
                    type={visibleKeys['carto'] ? 'text' : 'password'}
                    placeholder="Paste CARTO API Key..."
                    value={config.cartoApiKey || ''}
                    onChange={e => setConfig({ ...config, cartoApiKey: e.target.value })}
                    className="font-mono"
                    rightElement={
                      <button
                        type="button"
                        onClick={() => toggleKeyVisibility('carto')}
                        className="text-light-text-secondary hover:text-light-text dark:hover:text-dark-text p-1 cursor-pointer"
                        aria-label="Toggle CARTO API key visibility"
                      >
                        {visibleKeys['carto'] ? <EyeSlash className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    }
                  />
                </div>
              </div>
            </GlassPanel>
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-PAGE 4: MASTER GEAR                                                   */}
      {/* ========================================================================= */}
      {activeTab === 'gear' && (
        <div className="animate-fade-in">
          <GearSettingsTab 
            config={config} 
            setConfig={setConfig} 
            handleSaveOrgSettings={handleSaveOrgSettings} 
            isSavingOrg={isSavingOrg} 
          />
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-PAGE 5: CARRIERS DIRECTORY                                            */}
      {/* ========================================================================= */}
      {activeTab === 'carriers' && (
        <div className="animate-fade-in">
          <CarriersTab 
            config={config} 
            setConfig={setConfig} 
            handleSaveOrgSettings={handleSaveOrgSettings} 
            isSavingOrg={isSavingOrg} 
          />
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-PAGE 6: DATA MANAGEMENT                                               */}
      {/* ========================================================================= */}
      {activeTab === 'data' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-fade-in">
          
          {/* Left Column: Backup & Flight Importer */}
          <div className="lg:col-span-6 flex flex-col gap-6">
            
            {/* Database Lifecycle & Backup */}
            <div className="flex flex-col overflow-hidden rounded-[28px]">
              <GlassPanel
                className="wg-glass-card shadow-glass-card flex flex-col h-full overflow-hidden border border-black/5 dark:border-white/10"
                overrides={{ borderRadius: 28 }}
                padding="0px"
              >
                <div className="flex flex-col h-full w-full overflow-hidden rounded-[28px]">
                  <div className="p-5 border-b border-black/5 dark:border-white/5 flex items-center gap-3 bg-gradient-to-r from-blue-500/10 via-blue-500/5 to-transparent shrink-0">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-500/20 flex items-center justify-center shrink-0">
                      <Database className="w-5 h-5" weight="duotone" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-light-text dark:text-dark-text tracking-tight">
                        Database Snapshots
                      </h3>
                      <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary font-medium truncate mt-0.5">
                        Export JSON snapshots or restore previously saved application state
                      </p>
                    </div>
                  </div>

                  <div className="p-5 sm:p-6 space-y-3">
                    <Button
                      variant="primary"
                      onClick={handleExport}
                      className="w-full h-11 justify-center rounded-2xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer"
                      icon={<DownloadSimple className="w-4 h-4" />}
                    >
                      Download Backup JSON
                    </Button>

                    <Button
                      variant="secondary"
                      onClick={handleImportTrigger}
                      className="w-full h-11 justify-center rounded-2xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer"
                      icon={<UploadSimple className="w-4 h-4" />}
                    >
                      Restore From File
                    </Button>
                    <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleFileSelect} />
                  </div>
                </div>
              </GlassPanel>
            </div>

            {/* Spreadsheet Flight Ingestion */}
            <div className="flex flex-col overflow-hidden rounded-[28px]">
              <GlassPanel
                className="wg-glass-card shadow-glass-card flex flex-col h-full overflow-hidden border border-black/5 dark:border-white/10"
                overrides={{ borderRadius: 28 }}
                padding="0px"
              >
                <div className="flex flex-col h-full w-full overflow-hidden rounded-[28px]">
                  <div className="p-5 border-b border-black/5 dark:border-white/5 flex items-center gap-3 bg-gradient-to-r from-indigo-500/10 via-indigo-500/5 to-transparent shrink-0">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-500/20 flex items-center justify-center shrink-0">
                      <Airplane className="w-5 h-5" weight="duotone" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-light-text dark:text-dark-text tracking-tight">
                        Flight Manifest Ingestion
                      </h3>
                      <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary font-medium truncate mt-0.5">
                        Bulk parse airline itineraries from spreadsheets or CSV documents
                      </p>
                    </div>
                  </div>

                  <div className="p-5 sm:p-6">
                    <Button
                      variant="secondary"
                      onClick={() => setIsFlightWizardOpen(true)}
                      className="w-full h-11 justify-center rounded-2xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer"
                      icon={<Compass className="w-4 h-4 text-primary-500" />}
                    >
                      Launch Flight Wizard (.xlsx, .csv, airtrail)
                    </Button>
                  </div>
                </div>
              </GlassPanel>
            </div>

          </div>

          {/* Right Column: Calendar Feeds & Danger Zone */}
          <div className="lg:col-span-6 flex flex-col gap-6">
            
            {/* Calendar Synchronization */}
            <div className="flex flex-col overflow-hidden rounded-[28px]">
              <GlassPanel
                className="wg-glass-card shadow-glass-card flex flex-col h-full overflow-hidden border border-black/5 dark:border-white/10"
                overrides={{ borderRadius: 28 }}
                padding="0px"
              >
                <div className="flex flex-col h-full w-full overflow-hidden rounded-[28px]">
                  <div className="p-5 border-b border-black/5 dark:border-white/5 flex items-center gap-3 bg-gradient-to-r from-teal-500/10 via-teal-500/5 to-transparent shrink-0">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-md shadow-teal-500/20 flex items-center justify-center shrink-0">
                      <CalendarBlank className="w-5 h-5" weight="duotone" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-light-text dark:text-dark-text tracking-tight">
                        External Calendar Sync
                      </h3>
                      <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary font-medium truncate mt-0.5">
                        Synchronize expeditions with Apple Calendar, Google Calendar, or Outlook
                      </p>
                    </div>
                  </div>

                  <div className="p-5 sm:p-6 space-y-3">
                    <Button
                      variant="secondary"
                      onClick={handleCalendarExport}
                      className="w-full h-11 justify-center rounded-2xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer"
                      icon={<DownloadSimple className="w-4 h-4" />}
                    >
                      Download .ICS Calendar File
                    </Button>

                    <Button
                      variant="secondary"
                      onClick={handleCopySubscriptionLink}
                      className="w-full h-11 justify-center rounded-2xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer"
                      icon={copiedCalendar ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                    >
                      {copiedCalendar ? 'URL Copied to Clipboard' : 'Copy iCal Subscription URL'}
                    </Button>
                  </div>
                </div>
              </GlassPanel>
            </div>

            {/* Danger Zone: Factory Reset */}
            <div className="flex flex-col overflow-hidden rounded-[28px]">
              <GlassPanel
                className="wg-glass-card shadow-glass-card flex flex-col h-full overflow-hidden border border-rose-500/20"
                overrides={{ borderRadius: 28 }}
                padding="0px"
              >
                <div className="flex flex-col h-full w-full overflow-hidden rounded-[28px]">
                  <div className="p-5 border-b border-rose-500/10 flex items-center gap-3 bg-gradient-to-r from-rose-500/10 via-rose-500/5 to-transparent shrink-0">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-md shadow-rose-500/20 flex items-center justify-center shrink-0">
                      <Warning className="w-5 h-5" weight="duotone" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-rose-600 dark:text-rose-400 tracking-tight">
                        Danger Zone
                      </h3>
                      <p className="text-2xs text-rose-500/80 font-medium truncate mt-0.5">
                        Irreversible database reset and application wiping
                      </p>
                    </div>
                  </div>

                  <div className="p-5 sm:p-6">
                    <button
                      type="button"
                      onClick={() => setIsResetModalOpen(true)}
                      className="w-full h-11 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold uppercase tracking-wider transition-all shadow-md shadow-rose-500/20 cursor-pointer flex items-center justify-center gap-2 active:scale-95"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Wipe &amp; Reset Application</span>
                    </button>
                  </div>
                </div>
              </GlassPanel>
            </div>

          </div>

        </div>
      )}

      {/* MODAL: Restore Backup JSON Confirmation */}
      <Modal 
        isOpen={isRestoreModalOpen} 
        onClose={() => setIsRestoreModalOpen(false)} 
        title="Restore Database Backup"
        subtitle="Overwrite Current Database State"
        icon="settings_backup_restore"
      >
        <div className="space-y-6 font-sans">
          {restoreStatus === 'idle' && (
            <>
              <div className="p-5 rounded-3xl bg-amber-500/10 border border-amber-500/20">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 leading-relaxed">
                  Confirm overwriting database state with restore file <span className="font-bold underline">{pendingFile?.name}</span>? All existing trips, flight statistics, and personnel rosters will be replaced.
                </p>
              </div>
              <div className="flex gap-3 justify-end pt-4 border-t border-black/5 dark:border-white/5">
                <button
                  type="button"
                  onClick={() => setIsRestoreModalOpen(false)}
                  className={`${BTN_SECONDARY_STYLE} px-4 py-2 text-xs font-bold uppercase tracking-wider`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmRestore}
                  className="px-5 py-2 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold uppercase tracking-wider shadow-md"
                >
                  Yes, Overwrite State
                </button>
              </div>
            </>
          )}
          {restoreStatus === 'reading' && (
            <div className="text-center py-8">
              <span className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin block mx-auto mb-2" />
              <p className="font-bold text-xs text-light-text dark:text-dark-text">Reading file...</p>
            </div>
          )}
          {restoreStatus === 'importing' && (
            <div className="text-center py-8">
              <span className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin block mx-auto mb-2" />
              <p className="font-bold text-xs text-light-text dark:text-dark-text">Restoring database tables...</p>
            </div>
          )}
          {restoreStatus === 'success' && (
            <div className="text-center py-8 text-emerald-600 dark:text-emerald-400">
              <CheckCircle className="w-10 h-10 mx-auto mb-2" />
              <p className="font-bold text-sm">Restore Succeeded</p>
              <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-1">Reloading session...</p>
            </div>
          )}
          {restoreStatus === 'error' && (
            <div className="text-center py-8 text-rose-500">
              <WarningCircle className="w-10 h-10 mx-auto mb-2" />
              <p className="font-bold text-sm">Restore Failed</p>
              <p className="text-xs mt-1">{restoreErrorMessage}</p>
              <button
                type="button"
                onClick={() => setRestoreStatus('idle')}
                className={`${BTN_SECONDARY_STYLE} mt-4 px-4 py-2 text-xs font-bold uppercase`}
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </Modal>

      {/* MODAL: Wipe Application Data Danger Sequence */}
      <Modal 
        isOpen={isResetModalOpen} 
        onClose={() => { setIsResetModalOpen(false); setResetConfirmText(''); }} 
        title="Wipe Database State"
        subtitle="Irreversible Database Factory Reset"
        icon="warning"
      >
        <div className="space-y-6 text-left font-sans">
          <div className="p-5 rounded-3xl bg-rose-500/10 border border-rose-500/20">
            <p className="text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider mb-1">
              Permanent Destruction Warning
            </p>
            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary leading-relaxed font-medium">
              This workflow is permanent and completely irreversible. It immediately destroys all registered personnel folders, calendar feeds, custom carrier configs, map paths, and independent flights.
            </p>
          </div>
          
          <Input 
            label="To unlock Wipe Process, type DELETE below:"
            placeholder="Type DELETE" 
            value={resetConfirmText} 
            onChange={(e) => setResetConfirmText(e.target.value)} 
            className="font-mono text-center uppercase font-bold"
          />

          <div className="flex gap-3 pt-4 border-t border-black/5 dark:border-white/5 justify-end">
            <button 
              type="button"
              onClick={() => { setIsResetModalOpen(false); setResetConfirmText(''); }}
              className={`${BTN_SECONDARY_STYLE} px-4 py-2 text-xs font-bold uppercase`}
            >
              Abort
            </button>
            <button 
              type="button"
              onClick={handleWipeDatabase}
              disabled={resetConfirmText !== 'DELETE'}
              className="px-5 py-2 rounded-2xl bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white text-xs font-bold uppercase tracking-wider shadow-md"
            >
              Wipe Database
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL: Enroll & Edit Personnel Account */}
      <Modal 
        isOpen={isEditingUser} 
        onClose={() => setIsEditingUser(false)} 
        title={editingUser.id ? "Edit Personnel Profile" : "Enroll Personnel Member"}
        subtitle="Credentials & Work Roster"
        icon="badge"
      >
        <div className="space-y-6 text-left font-sans">
          <div className="space-y-4">
            <Input 
              label="Personnel Name *"
              type="text"
              placeholder="e.g. Elena Rostova" 
              value={editingUser.name || ''} 
              onChange={e => setEditingUser({ ...editingUser, name: e.target.value })} 
              className="font-bold"
              autoFocus
            />

            <Input 
              label="Email Address"
              type="email"
              placeholder="e.g. elena@wandergrid.abc" 
              value={editingUser.email || ''} 
              onChange={e => setEditingUser({ ...editingUser, email: e.target.value })} 
            />

            <Input 
              label="Portal Password"
              type="password"
              placeholder="e.g. min 6 characters" 
              value={editingUser.password || ''} 
              onChange={e => setEditingUser({ ...editingUser, password: e.target.value })} 
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Roster Role"
                value={editingUser.role || 'Partner'} 
                onChange={e => setEditingUser({ ...editingUser, role: e.target.value as any })}
              >
                <option value="Admin">Admin (Full Access)</option>
                <option value="Partner">Partner (Associate)</option>
                <option value="Child">Child (Guest)</option>
              </Select>

              <Select
                label="Holiday Weekend Policy"
                value={editingUser.holidayWeekendRule || 'none'} 
                onChange={e => setEditingUser({ ...editingUser, holidayWeekendRule: e.target.value as any })}
              >
                <option value="none">Standard (No Override)</option>
                <option value="monday">Cycle Monday Policy</option>
                <option value="lieu">Compensate Lieu Rule</option>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input 
                label="Annual Accrual Balance (Days)"
                type="number" 
                value={editingUser.leaveBalance ?? 25} 
                onChange={e => setEditingUser({ ...editingUser, leaveBalance: parseInt(e.target.value) || 0 })}
              />

              <Input 
                label="Taken Vacation Days"
                type="number" 
                value={editingUser.takenLeave ?? 0} 
                onChange={e => setEditingUser({ ...editingUser, takenLeave: parseInt(e.target.value) || 0 })}
              />
            </div>

            {/* Holiday Configs */}
            <div className="p-4 rounded-3xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 space-y-2.5">
              <span className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block">
                Country Holiday Calendars ({savedConfigs.length})
              </span>
              
              <div className="bg-white dark:bg-dark-card p-2 rounded-2xl border border-black/5 dark:border-white/5 max-h-36 overflow-y-auto space-y-1 custom-scrollbar">
                {savedConfigs.length === 0 ? (
                  <span className="text-2xs font-bold text-light-text-secondary dark:text-dark-text-secondary block text-center py-4 uppercase tracking-wider">
                    No country configurations saved
                  </span>
                ) : (
                  savedConfigs.map(sc => {
                    const activeIds = editingUser.holidayConfigIds ?? [];
                    const isChecked = activeIds.includes(sc.id);
                    return (
                      <label key={sc.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors">
                        <input 
                          type="checkbox" 
                          checked={isChecked}
                          className="rounded text-primary-500 focus:ring-primary-500 w-4 h-4 cursor-pointer"
                          onChange={() => {
                            const nextIds = isChecked 
                              ? activeIds.filter(id => id !== sc.id)
                              : [...activeIds, sc.id];
                            setEditingUser({ ...editingUser, holidayConfigIds: nextIds });
                          }}
                        />
                        <div className="leading-tight">
                          <span className="text-xs font-bold text-light-text dark:text-dark-text block">
                            {sc.countryName} ({sc.year})
                          </span>
                          <span className="text-2xs font-mono text-light-text-secondary dark:text-dark-text-secondary">
                            CODE: {sc.countryCode} · {sc.holidays?.length || 0} holidays
                          </span>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

          </div>

          <div className="flex gap-3 pt-4 border-t border-black/5 dark:border-white/5 shrink-0 justify-end">
            <button
              type="button"
              onClick={() => setIsEditingUser(false)}
              className={`${BTN_SECONDARY_STYLE} px-4 py-2 text-xs font-bold uppercase`}
            >
              Cancel
            </button>
            <button 
              type="button"
              disabled={!editingUser.name}
              onClick={handleSaveUser}
              className={`${BTN_PRIMARY_STYLE} px-6 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-50`}
            >
              Save Member
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL: Delete member confirmation */}
      <Modal 
        isOpen={!!memberToDelete} 
        onClose={() => setMemberToDelete(null)} 
        title="Revoke Member Account"
        subtitle="Permanent Member Removal"
        icon="person_remove"
        maxWidth="max-w-md"
      >
        <div className="space-y-6 text-left font-sans">
          <div className="p-5 rounded-3xl bg-rose-500/10 border border-rose-500/20">
            <p className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary leading-relaxed">
              Confirm revoking membership access and deletion of account for <span className="font-bold underline text-light-text dark:text-dark-text">{memberToDelete?.name}</span>? This does not delete associated independent flights.
            </p>
          </div>
          <div className="flex gap-3 justify-end pt-4 border-t border-black/5 dark:border-white/5">
            <button
              type="button"
              onClick={() => setMemberToDelete(null)}
              className={`${BTN_SECONDARY_STYLE} px-4 py-2 text-xs font-bold uppercase`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmDeleteMember}
              className="px-5 py-2 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold uppercase tracking-wider shadow-md"
            >
              Confirm Removal
            </button>
          </div>
        </div>
      </Modal>

      {/* Flight Sheet Mapper wizard */}
      {isFlightWizardOpen && (
        <React.Suspense fallback={null}>
          <FlightImportWizard 
              isOpen={isFlightWizardOpen} 
              onClose={() => setIsFlightWizardOpen(false)} 
              onImportComplete={refreshData} 
              users={users} 
          />
        </React.Suspense>
      )}

    </div>
  );
};
