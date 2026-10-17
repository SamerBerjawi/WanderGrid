import { useState, useEffect, useRef, useMemo } from 'react';
import { mergeCountryRecords } from '../services/countryRegistry';
import { toast, errorMessage } from '../services/toast';
import { dataService, isTripRoad, isTripAir } from '../services/mockDb';
import { calendarService } from '../services/calendarExport';
import { User, WorkspaceSettings, EntitlementType, SavedConfig, Trip, BackupSelectionOptions } from '../types';

/**
 * Settings state and handlers shared by the Golden Hour settings page. This mirrors the logic of
 * views/Settings.tsx (kept untouched so the flag-off app is unchanged); keep the two in step.
 */
export const useSettingsController = (onThemeChange?: (theme: 'light' | 'dark' | 'auto') => void) => {
  const [users, setUsers] = useState<User[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [visitedCount, setVisitedCount] = useState<number>(0);
  const [rosterSearch, setRosterSearch] = useState('');
  const [entitlements, setEntitlements] = useState<EntitlementType[]>([]);
  const [savedConfigs, setSavedConfigs] = useState<SavedConfig[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Personnel dialog controls
  const [memberToDelete, setMemberToDelete] = useState<User | null>(null);
  const [deleteMemberError, setDeleteMemberError] = useState('');
  const [memberFormError, setMemberFormError] = useState('');
  const [calendarLinkError, setCalendarLinkError] = useState('');
  const [resetCodeInfo, setResetCodeInfo] = useState<{ name: string; code: string; expiresAt: string } | null>(null);
  const sessionUserId = useMemo(() => {
      try { return JSON.parse(localStorage.getItem('wandergrid_session_user') || 'null')?.id || null; } catch (e) { return null; }
  }, []);
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [editingUser, setEditingUser] = useState<Partial<User>>({});
  
  // Workspace Config States
  // Snapshot of the settings as loaded, so a save sends only the fields edited on this page.
  const loadedConfigRef = useRef<WorkspaceSettings | null>(null);
  const [config, setConfig] = useState<WorkspaceSettings>({
      orgName: '',
      currency: 'USD',
      dateFormat: 'ddd D MMM, YYYY',
      autoSync: false,
      theme: 'light',
      workingDays: [1, 2, 3, 4, 5],
      aviationStackApiKey: '',
      aeroDataBoxApiKey: '',
      aeroDataBoxEndpoint: 'rapidapi',
      openAipApiKey: '',
      brandfetchApiKey: '',
      googleGeminiApiKey: '',
      cartoApiKey: '',
      masterPackingList: [],
      carriers: [],
      defaultTravelClass: 'Economy',
      defaultStartingAirport: '',
      defaultLandTransportMethod: 'Train',
      defaultBasemapLight: 'liberty',
      defaultBasemapDark: 'citylights'
  });
  const [isSavingOrg, setIsSavingOrg] = useState(false);
  const [saveToast, setSaveToast] = useState(false);

  // Password / Key visibility toggles
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const toggleKeyVisibility = (key: string) => {
    setVisibleKeys(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // P-06 Live Data Providers Diagnostics State
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [providerResults, setProviderResults] = useState<Record<string, {
    success: boolean;
    latencyMs: number;
    message: string;
    timestamp: number;
  }>>({});

  // P-06 Direct client-side provider ping fallbacks when running Vite standalone without backend
  const DIRECT_PROVIDER_PINGS: Record<string, () => Promise<{ success: boolean; latencyMs: number; message: string }>> = {
    adsbdb: async () => {
      const t0 = performance.now();
      const res = await fetch('https://api.adsbdb.com/v0/callsign/AAL1', { signal: AbortSignal.timeout(4000) });
      const latencyMs = Math.round(performance.now() - t0);
      const isOk = res.ok || res.status === 404;
      return {
        success: isOk,
        latencyMs,
        message: isOk ? 'ADSBdb Flight Telemetry operational' : `ADSBdb returned HTTP ${res.status}`
      };
    },
    osrm: async () => {
      const t0 = performance.now();
      const res = await fetch('https://routing.openstreetmap.de/routed-car/route/v1/driving/2.3522,48.8566;2.3600,48.8600?overview=false', { signal: AbortSignal.timeout(5000) });
      const latencyMs = Math.round(performance.now() - t0);
      return {
        success: res.ok,
        latencyMs,
        message: res.ok ? 'FOSSGIS OSRM Road Routing operational' : `OSRM returned HTTP ${res.status}`
      };
    },
    geocoding: async () => {
      const t0 = performance.now();
      const res = await fetch('https://geocoding-api.open-meteo.com/v1/search?name=London&count=1&language=en&format=json', { signal: AbortSignal.timeout(4000) });
      const latencyMs = Math.round(performance.now() - t0);
      return {
        success: res.ok,
        latencyMs,
        message: res.ok ? 'Open-Meteo Geocoding Chain operational' : `Open-Meteo returned HTTP ${res.status}`
      };
    },
    openfreemap: async () => {
      const t0 = performance.now();
      const res = await fetch('https://tiles.openfreemap.org/styles/liberty', { signal: AbortSignal.timeout(4000) });
      const latencyMs = Math.round(performance.now() - t0);
      return {
        success: res.ok,
        latencyMs,
        message: res.ok ? 'OpenFreeMap Vector Tiles operational' : `OpenFreeMap returned HTTP ${res.status}`
      };
    },
    gibs: async () => {
      const t0 = performance.now();
      const d = new Date();
      d.setDate(d.getDate() - 1);
      const yesterday = d.toISOString().split('T')[0];
      const res = await fetch(`https://gibs-a.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA21_CorrectedReflectance_TrueColor/default/${yesterday}/GoogleMapsCompatible_Level9/0/0/0.jpg`, { signal: AbortSignal.timeout(5000) });
      const latencyMs = Math.round(performance.now() - t0);
      return {
        success: res.ok,
        latencyMs,
        message: res.ok ? 'NASA GIBS Earth Observation operational' : `NASA GIBS returned HTTP ${res.status}`
      };
    }
  };

  const handleTestProvider = async (providerKey: string) => {
    setTestingProvider(providerKey);
    try {
      // 1. Try backend proxy route first
      let data: any = null;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3500);
        const token = localStorage.getItem('wandergrid_session_token');
        const res = await fetch(`/api/proxy/test/${providerKey}`, {
          signal: controller.signal,
          headers: token ? { Authorization: `Bearer ${token}` } : undefined
        });
        clearTimeout(timer);
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          data = await res.json();
        }
      } catch {
        // Fallback to client-side direct ping
      }

      if (data && typeof data.success === 'boolean') {
        setProviderResults(prev => ({
          ...prev,
          [providerKey]: {
            success: Boolean(data.success),
            latencyMs: data.latencyMs || 0,
            message: data.message || (data.success ? 'Operational' : 'Unavailable'),
            timestamp: Date.now()
          }
        }));
        return;
      }

      // 2. Direct client-side ping fallback (works standalone without Express server)
      const directPing = DIRECT_PROVIDER_PINGS[providerKey];
      if (directPing) {
        const pingResult = await directPing();
        setProviderResults(prev => ({
          ...prev,
          [providerKey]: {
            success: pingResult.success,
            latencyMs: pingResult.latencyMs,
            message: pingResult.message,
            timestamp: Date.now()
          }
        }));
        return;
      }

      setProviderResults(prev => ({
        ...prev,
        [providerKey]: {
          success: false,
          latencyMs: 0,
          message: 'Provider test unavailable',
          timestamp: Date.now()
        }
      }));
    } catch (err: any) {
      setProviderResults(prev => ({
        ...prev,
        [providerKey]: {
          success: false,
          latencyMs: 0,
          message: err.message || 'Connection failed',
          timestamp: Date.now()
        }
      }));
    } finally {
      setTestingProvider(null);
    }
  };

  const handleTestAllProviders = async () => {
    const keys = ['adsbdb', 'osrm', 'geocoding', 'openfreemap', 'gibs'];
    for (const key of keys) {
      await handleTestProvider(key);
    }
  };

  // Calendar copy feedback
  const [copiedCalendar, setCopiedCalendar] = useState(false);

  // Backup file & granularity controls
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [backupCategories, setBackupCategories] = useState<Required<BackupSelectionOptions>>({
    flights: true,
    roadTrips: true,
    visited: true,
    settings: true,
    users: true,
    calendar: true
  });
  const [isExporting, setIsExporting] = useState(false);

  // Restore file & granularity controls
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingBackupData, setPendingBackupData] = useState<any | null>(null);
  const [restoreMode, setRestoreMode] = useState<'merge' | 'replace'>('replace');
  const [restoreCategories, setRestoreCategories] = useState<Required<BackupSelectionOptions>>({
    flights: true,
    roadTrips: true,
    visited: true,
    settings: true,
    users: true,
    calendar: true
  });
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
        dataService.getWorkspaceSettings(),
        dataService.getTrips(),
        dataService.getVisited()
    ]).then(([u, ents, configs, settings, t, v]) => {
        setUsers(u);
        setEntitlements(ents);
        setSavedConfigs(configs);
        setConfig(settings);
        loadedConfigRef.current = settings;
        setTrips(t || []);
        setVisitedCount(Array.isArray(v) ? v.filter((i: any) => i.type !== 'country').length + mergeCountryRecords(v).length : 0);
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
      setMemberFormError('');
      setIsEditingUser(true);
  };

  const handleEditUser = (u: User) => { 
      setEditingUser({
          ...u,
          email: u.email ?? '',
          password: '', // blank = keep the current password
          holidayConfigIds: u.holidayConfigIds ?? []
      }); 
      setMemberFormError('');
      setIsEditingUser(true); 
  };

  const handleSaveUser = async () => { 
      if (!editingUser.name) return;
      
      const emailVal = (editingUser.email || '').trim().toLowerCase();
      const finalEmail = emailVal || `${editingUser.name?.toLowerCase().replace(/\s/g, '.')}@wandergrid.local`;
      const password = (editingUser.password || '').trim();

      const duplicate = users.find(u => u.email?.toLowerCase().trim() === finalEmail && u.id !== editingUser.id);
      if (duplicate) {
          setMemberFormError(`Another member already uses ${finalEmail}. Use a different email.`);
          return;
      }

      if (password && password.length < 8) {
          setMemberFormError('Password must be at least 8 characters.');
          return;
      }
      if (!editingUser.id && !password) {
          setMemberFormError('Set a password so the new member can sign in.');
          return;
      }

      try {
      if (editingUser.id) {
          await dataService.updateUser({
              ...editingUser,
              email: finalEmail,
              password // empty keeps the member's current password
          } as User);
      } else {
          const newUser: User = {
              ...editingUser,
              id: 'u_' + Date.now(),
              email: finalEmail,
              password,
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
      } catch (err: any) {
          setMemberFormError(err?.message || 'Could not save this member.');
          return;
      }
      setIsEditingUser(false);
      refreshData();
  };

  const handleIssueResetCode = async (member: User) => {
      try {
          const { code, expiresAt } = await dataService.createPasswordResetCode(member.id);
          setResetCodeInfo({ name: member.name, code, expiresAt });
      } catch (err) {
          toast.error(`Couldn't create a reset code: ${errorMessage(err)}`);
      }
  };

  const handleConfirmDeleteMember = async () => {
      if (memberToDelete?.id) {
          try {
              await dataService.deleteUser(memberToDelete.id);
              setMemberToDelete(null);
              setDeleteMemberError('');
              refreshData();
          } catch (err: any) {
              setDeleteMemberError(err?.message || 'Could not remove this member.');
          }
      }
  };

  const handleSaveOrgSettings = async () => { 
      setIsSavingOrg(true);
      try {
          const loaded = loadedConfigRef.current;
          const changes = loaded
              ? (Object.fromEntries(Object.entries(config).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify((loaded as any)[k]))) as Partial<WorkspaceSettings>)
              : config;
          delete (changes as any).configuredKeys;
          await dataService.updateWorkspaceSettings(changes);
          loadedConfigRef.current = config;
          if (onThemeChange && 'theme' in changes) onThemeChange(config.theme);
          setSaveToast(true);
          setTimeout(() => setSaveToast(false), 2500);
      } catch (err) {
          toast.error(`Couldn't save settings: ${errorMessage(err, 'please try again.')}`);
      } finally {
          setIsSavingOrg(false);
      }
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

  // --- Computed Metrics for Backup & Restore Granularity ---
  const currentDbStats = useMemo(() => {
    const airTrips = trips.filter(isTripAir).length;
    const roadTrips = trips.filter(isTripRoad).length;
    const usersCount = users.length;
    const visited = visitedCount;
    const calendarCount = entitlements.length + savedConfigs.length;
    const hasSettings = !!config && Object.keys(config).length > 0;
    return {
      flights: airTrips,
      roadTrips,
      visited,
      users: usersCount,
      calendar: calendarCount,
      settings: hasSettings ? 1 : 0
    };
  }, [trips, users, visitedCount, entitlements, savedConfigs, config]);

  const detectedRestoreStats = useMemo(() => {
    if (!pendingBackupData) return null;
    const tList = Array.isArray(pendingBackupData.trips) ? pendingBackupData.trips : [];
    const fList = Array.isArray(pendingBackupData.flights) ? pendingBackupData.flights : [];
    const airTrips = tList.filter(isTripAir).length + fList.filter((f: any) => !f.mode || f.mode === 'Flight').length;
    const roadTrips = tList.filter(isTripRoad).length + fList.filter((f: any) => f.mode && f.mode !== 'Flight').length;
    const visited = Array.isArray(pendingBackupData.visited) ? pendingBackupData.visited.length : 0;
    const usersCount = Array.isArray(pendingBackupData.users) ? pendingBackupData.users.length : 0;
    const calCount = (Array.isArray(pendingBackupData.events) ? pendingBackupData.events.length : 0) +
                     (Array.isArray(pendingBackupData.entitlements) ? pendingBackupData.entitlements.length : 0) +
                     (Array.isArray(pendingBackupData.configs) ? pendingBackupData.configs.length : 0);
    const hasSettings = pendingBackupData.workspaceSettings && typeof pendingBackupData.workspaceSettings === 'object' && Object.keys(pendingBackupData.workspaceSettings).length > 0;
    return {
      flights: airTrips,
      roadTrips,
      visited,
      users: usersCount,
      calendar: calCount,
      settings: hasSettings ? 1 : 0,
      version: pendingBackupData.version || null,
      timestamp: pendingBackupData.timestamp || null
    };
  }, [pendingBackupData]);

  // --- Import/Export Handlers (Backup JSON) ---
  const handleDownloadBackup = async () => { 
      const selectedCount = Object.values(backupCategories).filter(Boolean).length;
      if (selectedCount === 0) return;
      setIsExporting(true);
      try {
          const json = await dataService.exportFullState(backupCategories);
          const blob = new Blob([json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `wandergrid-backup-${new Date().toISOString().split('T')[0]}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          setIsBackupModalOpen(false);
      } catch (err: any) {
          console.error("Backup export failed:", err);
      } finally {
          setIsExporting(false);
      }
  };

  const handleExport = () => {
      setIsBackupModalOpen(true);
  };

  const handleImportTrigger = () => fileInputRef.current?.click();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => { 
      const file = e.target.files?.[0];
      if (!file) return;
      setPendingFile(file);
      setRestoreStatus('idle');
      setRestoreErrorMessage('');
      setPendingBackupData(null);
      setIsRestoreModalOpen(true);

      const reader = new FileReader();
      reader.onload = (ev) => {
          try {
              const content = ev.target?.result as string;
              if (!content) throw new Error('Selected backup file is empty');
              const parsed = JSON.parse(content.trim().replace(/^\uFEFF/, ''));
              setPendingBackupData(parsed);

              // Auto-detect populated categories in the backup file
              const tList = Array.isArray(parsed.trips) ? parsed.trips : [];
              const fList = Array.isArray(parsed.flights) ? parsed.flights : [];
              const hasAir = tList.some(isTripAir) || fList.some((f: any) => !f.mode || f.mode === 'Flight');
              const hasRoad = tList.some(isTripRoad) || fList.some((f: any) => f.mode && f.mode !== 'Flight');
              const hasVisited = Array.isArray(parsed.visited) && parsed.visited.length > 0;
              const hasUsers = Array.isArray(parsed.users) && parsed.users.length > 0;
              const hasCal = (Array.isArray(parsed.events) && parsed.events.length > 0) ||
                             (Array.isArray(parsed.entitlements) && parsed.entitlements.length > 0) ||
                             (Array.isArray(parsed.configs) && parsed.configs.length > 0);
              const hasSettings = parsed.workspaceSettings && typeof parsed.workspaceSettings === 'object' && Object.keys(parsed.workspaceSettings).length > 0;

              setRestoreCategories({
                  flights: hasAir,
                  roadTrips: hasRoad,
                  visited: hasVisited,
                  users: hasUsers,
                  calendar: hasCal,
                  settings: !!hasSettings
              });
          } catch (err: any) {
              setRestoreStatus('error');
              setRestoreErrorMessage(err instanceof SyntaxError
                  ? "Invalid backup file: it isn't valid JSON. Choose a file exported from WanderGrid."
                  : (err.message || 'Invalid or unparseable JSON file'));
          }
      };
      reader.readAsText(file);
      e.target.value = ''; 
  };

  const handleConfirmRestore = async () => { 
      if (!pendingBackupData) return;
      setRestoreStatus('importing');
      try {
          const content = JSON.stringify(pendingBackupData);
          await dataService.importFullState(content, {
              mode: restoreMode,
              selectedCategories: restoreCategories
          });

          // The server keeps the signed-in account through a restore, so the session stays as it is.
          // Never clear the token or swap the session user here: the backup's records carry no
          // credentials, so doing so only signs the person out (the page reload re-validates via /auth/me).

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

  const handleCalendarExport = async () => {
      const trips = await dataService.getTrips();
      const ics = calendarService.generateIcsContent(trips, config.orgName || 'WanderGrid');
      calendarService.downloadIcs(ics, `wandergrid-calendar-${new Date().toISOString().split('T')[0]}.ics`);
  };

  // The subscription URL contains a private per-user token; anyone holding it can read your trips.
  const copyCalendarUrl = async (token: string) => {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      await navigator.clipboard.writeText(`${origin}/api/calendar/${token}/feed.ics`);
      setCopiedCalendar(true);
      setTimeout(() => setCopiedCalendar(false), 2000);
  };

  const handleCopySubscriptionLink = async () => {
      setCalendarLinkError('');
      try {
          await copyCalendarUrl(await dataService.getCalendarFeedToken());
      } catch (e: any) {
          console.warn('Copying the calendar link failed:', e);
          setCalendarLinkError(e?.message || 'Could not copy the calendar link.');
      }
  };

  const handleResetSubscriptionLink = async () => {
      setCalendarLinkError('');
      try {
          await copyCalendarUrl(await dataService.rotateCalendarFeedToken());
      } catch (e: any) {
          setCalendarLinkError(e?.message || 'Could not reset the calendar link.');
      }
  };

  const hasEnvKey = Boolean(config.configuredKeys?.googleGeminiApiKey) && !config.googleGeminiApiKey;
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

  return {
    users, trips, rosterSearch, setRosterSearch, entitlements, savedConfigs, loading, filteredUsers,
    memberToDelete, setMemberToDelete, deleteMemberError, setDeleteMemberError, memberFormError,
    calendarLinkError, resetCodeInfo, setResetCodeInfo, sessionUserId, isEditingUser, setIsEditingUser,
    editingUser, setEditingUser, config, setConfig, isSavingOrg, saveToast,
    visibleKeys, toggleKeyVisibility, testingProvider, providerResults, handleTestProvider, handleTestAllProviders,
    copiedCalendar, isBackupModalOpen, setIsBackupModalOpen, backupCategories, setBackupCategories, isExporting,
    fileInputRef, isRestoreModalOpen, setIsRestoreModalOpen, pendingFile, restoreMode, setRestoreMode,
    restoreCategories, setRestoreCategories, restoreStatus, setRestoreStatus, restoreErrorMessage,
    isFlightWizardOpen, setIsFlightWizardOpen, isResetModalOpen, setIsResetModalOpen, resetConfirmText, setResetConfirmText,
    refreshData, handleCreateUser, handleEditUser, handleSaveUser, handleIssueResetCode, handleConfirmDeleteMember,
    handleSaveOrgSettings, toggleWorkingDay, handleWipeDatabase, currentDbStats, detectedRestoreStats,
    handleDownloadBackup, handleExport, handleImportTrigger, handleFileSelect, handleConfirmRestore,
    handleCalendarExport, handleCopySubscriptionLink, handleResetSubscriptionLink,
    hasEnvKey, hasUserKey, isGeminiActive, pendingBackupData,
  };
};
