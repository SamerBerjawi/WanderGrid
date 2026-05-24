
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Card, Button, Badge, Tabs, Input, Select, Modal } from '../components/ui';
import { dataService, ImportState } from '../services/mockDb';
import { flightImporter } from '../services/flightImportExport';
import { calendarService } from '../services/calendarExport';
import { User, WorkspaceSettings, EntitlementType, SavedConfig, Trip, PackingItem } from '../types';
import { GearSettingsTab } from '../components/GearSettingsTab';
import { WorkspaceSettingsTab } from '../components/WorkspaceSettingsTab';
import { FlightImportWizard } from '../components/FlightImportWizard';

interface SettingsProps {
    onThemeChange?: (theme: 'light' | 'dark' | 'auto') => void;
}

export const Settings: React.FC<SettingsProps> = ({ onThemeChange }) => {
  const [activeTab, setActiveTab] = useState('general');
  const [users, setUsers] = useState<User[]>([]);
  const [entitlements, setEntitlements] = useState<EntitlementType[]>([]);
  const [savedConfigs, setSavedConfigs] = useState<SavedConfig[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isDeletingMember, setIsDeletingMember] = useState<string | null>(null);
  const [memberToDelete, setMemberToDelete] = useState<User | null>(null);
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [editingUser, setEditingUser] = useState<Partial<User>>({});
  
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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [restoreStatus, setRestoreStatus] = useState<'idle' | 'reading' | 'importing' | 'success' | 'error'>('idle');
  const [restoreErrorMessage, setRestoreErrorMessage] = useState('');

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

  const handleCreateUser = () => {
      setEditingUser({ 
          name: '', 
          email: '',
          password: '',
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
      setEditingUser({
          ...u,
          email: u.email ?? '',
          password: u.password ?? ''
      }); 
      setIsEditingUser(true); 
  };

  const handleSaveUser = async () => { 
      if (!editingUser.name) return;
      if (editingUser.id) {
          await dataService.updateUser(editingUser as User);
      } else {
          // New User
          const email = editingUser.email?.trim();
          const password = editingUser.password?.trim();
          const newUser: User = {
              ...editingUser,
              id: Math.random().toString(36).substr(2, 9),
              email: email || `${editingUser.name?.toLowerCase().replace(/\s/g, '.')}@wandergrid.local`, // Mock email
              password: password || 'password', // Mock password
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

  // --- Import/Export Handlers (Existing) ---
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

  if (loading) return <div className="p-8 text-gray-400 animate-pulse">Initializing Systems...</div>;

  const hasEnvKey = !!process.env.API_KEY;
  const hasUserKey = !!config.googleGeminiApiKey;
  const isGeminiActive = hasEnvKey || hasUserKey;

  return (
    <div className="space-y-8 animate-fade-in max-w-[87.5rem] mx-auto pb-12 flex flex-col h-full">
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
            { id: 'gear', label: 'Gear & Assets', icon: <span className="material-icons-outlined">backpack</span> },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
        className="shrink-0"
      />

      {activeTab === 'general' && (
          <WorkspaceSettingsTab 
              config={config}
              setConfig={setConfig}
              handleSaveOrgSettings={handleSaveOrgSettings}
              isSavingOrg={isSavingOrg}
              toggleWorkingDay={toggleWorkingDay}
              users={users}
              savedConfigs={savedConfigs}
              handleCreateUser={handleCreateUser}
              handleEditUser={handleEditUser}
              initiateDeleteMember={initiateDeleteMember}
              handleExport={handleExport}
              handleImportTrigger={handleImportTrigger}
              fileInputRef={fileInputRef}
              handleFileSelect={handleFileSelect}
              handleCalendarExport={handleCalendarExport}
              handleCopySubscriptionLink={handleCopySubscriptionLink}
              onOpenFlightWizard={() => setIsFlightWizardOpen(true)}
              handleFlightExport={handleFlightExport}
              importState={importState}
              isGeminiActive={isGeminiActive}
              hasUserKey={hasUserKey}
              hasEnvKey={hasEnvKey}
          />
      )}
      

      {activeTab === 'gear' && (
          <GearSettingsTab 
              config={config} 
              setConfig={setConfig} 
              handleSaveOrgSettings={handleSaveOrgSettings} 
              isSavingOrg={isSavingOrg} 
          />
      )}

      <Modal isOpen={isRestoreModalOpen} onClose={() => setIsRestoreModalOpen(false)} title="Restore Database">
          <div className="space-y-6">
              {restoreStatus === 'idle' && (
                  <>
                      <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30">
                          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                              Confirm restoration from <span className="font-bold">{pendingFile?.name}</span>?
                          </p>
                      </div>
                      <div className="flex gap-4">
                          <Button variant="ghost" className="flex-1" onClick={() => setIsRestoreModalOpen(false)}>Cancel</Button>
                          <Button variant="danger" className="flex-1" onClick={handleConfirmRestore}>Yes, Overwrite</Button>
                      </div>
                  </>
              )}
              {restoreStatus === 'reading' && <div className="text-center py-8"><span className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin block mx-auto mb-2" /><p>Reading file...</p></div>}
              {restoreStatus === 'importing' && <div className="text-center py-8"><span className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin block mx-auto mb-2" /><p>Importing data...</p></div>}
              {restoreStatus === 'success' && <div className="text-center py-8 text-emerald-500"><span className="material-icons-outlined text-4xl mb-2">check_circle</span><p className="font-bold">Restore Complete!</p><p className="text-xs text-gray-500 mt-2">Reloading application...</p></div>}
              {restoreStatus === 'error' && <div className="text-center py-8 text-rose-500"><span className="material-icons-outlined text-4xl mb-2">error</span><p className="font-bold">Restore Failed</p><p className="text-xs mt-2">{restoreErrorMessage}</p><Button variant="ghost" className="mt-4" onClick={() => setRestoreStatus('idle')}>Try Again</Button></div>}
          </div>
      </Modal>

      <FlightImportWizard 
          isOpen={isFlightWizardOpen} 
          onClose={() => setIsFlightWizardOpen(false)} 
          onImportComplete={refreshData} 
          users={users} 
      />
    </div>
  );
};
