
import React, { useState, useEffect, useRef } from 'react';
import { Card, Button, Badge, Tabs, Input, Select, Modal } from '../components/ui';
import { dataService } from '../services/mockDb';
import { User, WorkspaceSettings, EntitlementType, SavedConfig } from '../types';
import { EntitlementsManager } from '../components/EntitlementsManager';
import { PublicHolidaysManager } from '../components/PublicHolidaysManager';

interface SettingsProps {
    onThemeChange?: (theme: 'light' | 'dark' | 'auto') => void;
}

export const Settings: React.FC<SettingsProps> = ({ onThemeChange }) => {
  const [activeTab, setActiveTab] = useState('general');
  const [activeModalTab, setActiveModalTab] = useState('profile');
  const [users, setUsers] = useState<User[]>([]);
  const [entitlements, setEntitlements] = useState<EntitlementType[]>([]);
  const [savedConfigs, setSavedConfigs] = useState<SavedConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDeletingMember, setIsDeletingMember] = useState<string | null>(null);
  const [memberToDelete, setMemberToDelete] = useState<User | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [config, setConfig] = useState<WorkspaceSettings>({
      orgName: '',
      currency: 'USD',
      dateFormat: 'MM/DD/YYYY',
      autoSync: false,
      theme: 'light',
      workingDays: [1, 2, 3, 4, 5],
      aviationStackApiKey: ''
  });

  const [isEditingUser, setIsEditingUser] = useState(false);
  const [editingUser, setEditingUser] = useState<Partial<User>>({});
  const [isSavingOrg, setIsSavingOrg] = useState(false);

  // Restore Modal State
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [restoreStatus, setRestoreStatus] = useState<'idle' | 'reading' | 'importing' | 'success' | 'error'>('idle');
  const [restoreErrorMessage, setRestoreErrorMessage] = useState('');

  useEffect(() => {
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
  }, []);

  const refreshUsers = () => {
      dataService.getUsers().then(setUsers);
  };

  const handleEditUser = (user: User) => {
      setEditingUser({ ...user });
      setActiveModalTab('profile');
      setIsEditingUser(true);
  };

  const handleCreateUser = () => {
      setEditingUser({ 
          name: '', 
          role: 'Partner', 
          leaveBalance: 0, 
          takenLeave: 0, 
          allowance: 0,
          policies: [],
          holidayConfigIds: [],
          holidayWeekendRule: 'none'
      });
      setActiveModalTab('profile');
      setIsEditingUser(true);
  };

  const handleSaveUser = async () => {
      if (!editingUser.name) return;
      
      const cleanPolicies = editingUser.policies || [];

      if (editingUser.id) {
          await dataService.updateUser({ ...editingUser, policies: cleanPolicies } as User);
      } else {
          const newUser: User = {
              id: Math.random().toString(36).substr(2, 9),
              name: editingUser.name,
              role: editingUser.role as any || 'Partner',
              leaveBalance: 0, 
              takenLeave: 0, 
              allowance: 0,
              policies: cleanPolicies,
              holidayConfigIds: editingUser.holidayConfigIds || [],
              holidayWeekendRule: editingUser.holidayWeekendRule || 'none'
          };
          await dataService.addUser(newUser);
      }
      setIsEditingUser(false);
      refreshUsers();
  };

  const initiateDeleteMember = (user: User) => {
      setMemberToDelete(user);
  };

  const handleConfirmDeleteMember = async () => {
      if (!memberToDelete || isDeletingMember) return;
      
      setIsDeletingMember(memberToDelete.id);
      try {
          await dataService.deleteUser(memberToDelete.id);
          setMemberToDelete(null);
          refreshUsers();
      } catch (error) {
          console.error("Delete user failed", error);
      } finally {
          setIsDeletingMember(null);
      }
  };

  const handleSaveOrgSettings = async () => {
      setIsSavingOrg(true);
      try {
          await dataService.updateWorkspaceSettings(config);
          if (onThemeChange) onThemeChange(config.theme);
          setTimeout(() => setIsSavingOrg(false), 300);
      } catch (e) {
          console.error("Save failed", e);
          setIsSavingOrg(false);
      }
  };

  const toggleWorkingDay = (dayIndex: number) => {
      const current = config.workingDays || [];
      let next;
      if (current.includes(dayIndex)) {
          next = current.filter(d => d !== dayIndex);
      } else {
          next = [...current, dayIndex].sort();
      }
      setConfig({ ...config, workingDays: next });
  };

  const handleExport = async () => {
      try {
          const json = await dataService.exportFullState();
          const blob = new Blob([json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          
          const a = document.createElement('a');
          const date = new Date().toISOString().split('T')[0];
          a.href = url;
          a.download = `wandergrid-backup-${date}.json`;
          
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          
          setTimeout(() => URL.revokeObjectURL(url), 100);
      } catch (e) {
          alert("Export failed: " + e);
      }
  };

  const handleImportTrigger = () => {
      if (fileInputRef.current) {
          fileInputRef.current.value = ''; // Ensure clear before click
          fileInputRef.current.click();
      }
  };

  // 1. Initial File Selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setPendingFile(file);
      setRestoreStatus('idle');
      setRestoreErrorMessage('');
      setIsRestoreModalOpen(true);
      
      // Reset input value to ensure onChange fires again if user retries with same file
      e.target.value = '';
  };

  // 2. Confirmed Restore Logic
  const handleConfirmRestore = async () => {
      if (!pendingFile) return;

      setRestoreStatus('reading');

      const reader = new FileReader();
      
      reader.onload = async (event) => {
          const content = event.target?.result;
          try {
              if (typeof content !== 'string' || !content) {
                  throw new Error("Failed to read file content or file is empty.");
              }
              
              setRestoreStatus('importing');
              
              // Small delay to allow UI to render "Importing" state
              await new Promise(resolve => setTimeout(resolve, 300));

              await dataService.importFullState(content);
              
              setRestoreStatus('success');
              
              // Reload page after success to reflect new state
              setTimeout(() => {
                  window.location.reload();
              }, 1200);
          } catch (err) {
              console.error("Restore logic failed", err);
              setRestoreStatus('error');
              setRestoreErrorMessage(err instanceof Error ? err.message : "The backup file appears to be invalid or corrupted.");
          }
      };

      reader.onerror = () => {
          setRestoreStatus('error');
          setRestoreErrorMessage("Browser failed to read the file.");
      };

      reader.readAsText(pendingFile);
  };

  if (loading) return <div className="p-8 text-gray-400 animate-pulse">Initializing Systems...</div>;

  const workingDayUiOrder = [
      { label: 'M', value: 1 },
      { label: 'T', value: 2 },
      { label: 'W', value: 3 },
      { label: 'T', value: 4 },
      { label: 'F', value: 5 },
      { label: 'S', value: 6 },
      { label: 'S', value: 0 },
  ];

  return (
    <div className="space-y-8 animate-fade-in max-w-[1400px] mx-auto pb-12 flex flex-col h-full">
       <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white/40 dark:bg-gray-900/40 p-6 rounded-[2rem] backdrop-blur-xl border border-white/50 dark:border-white/5 shadow-2xl shrink-0">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h2 className="text-4xl font-black text-gray-900 dark:text-white tracking-tight">Systems Core</h2>
            <div className="flex items-center gap-1.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-3 py-1 rounded-full border border-indigo-200/50 dark:border-indigo-900/50">
                <span className="material-icons-outlined text-sm">settings_suggest</span>
                <span className="text-xs font-bold uppercase tracking-widest">Workspace v2.1</span>
            </div>
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
            {/* LEFT COLUMN: Workspace Identity & Personnel */}
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
                            <Button 
                                variant="primary" 
                                size="lg" 
                                className="!rounded-2xl shadow-xl shadow-blue-500/20"
                                onClick={handleSaveOrgSettings}
                                isLoading={isSavingOrg}
                                icon={<span className="material-icons-outlined">check_circle</span>}
                            >
                                Commit Changes
                            </Button>
                        </div>
                    </div>
                    <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Input 
                            label="Workspace Name" 
                            placeholder="WanderGrid Workspace"
                            value={config.orgName}
                            onChange={e => setConfig({...config, orgName: e.target.value})}
                        />
                        <Select 
                            label="Locality: Currency"
                            value={config.currency}
                            onChange={e => setConfig({...config, currency: e.target.value})}
                            options={[
                                { label: 'AUD - Australian Dollar', value: 'AUD' },
                                { label: 'EUR - Euro', value: 'EUR' },
                                { label: 'GBP - British Pound', value: 'GBP' },
                                { label: 'USD - US Dollar', value: 'USD' },
                            ]}
                        />
                        <Select 
                            label="Temporal Format"
                            value={config.dateFormat}
                            onChange={e => setConfig({...config, dateFormat: e.target.value})}
                            options={[
                                { label: 'MM/DD/YYYY (12/25/2026)', value: 'MM/DD/YYYY' },
                                { label: 'DD/MM/YYYY (25/12/2026)', value: 'DD/MM/YYYY' },
                                { label: 'YYYY-MM-DD (2026-12-25)', value: 'YYYY-MM-DD' },
                            ]}
                        />
                    </div>
                </Card>

                {/* External Integrations Section */}
                <Card noPadding className="rounded-[2rem]">
                    <div className="p-8 border-b border-gray-100 dark:border-white/5">
                        <div className="flex items-center gap-3">
                             <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-600 flex items-center justify-center">
                                <span className="material-icons-outlined">api</span>
                             </div>
                             <div>
                                <h3 className="text-2xl font-black text-gray-900 dark:text-white leading-none">Integrations</h3>
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">External Data Providers</p>
                             </div>
                        </div>
                    </div>
                    <div className="p-8">
                        <Input 
                            label="AviationStack API Key (Flight Data)" 
                            placeholder="e.g. 840d..."
                            value={config.aviationStackApiKey || ''}
                            onChange={e => setConfig({...config, aviationStackApiKey: e.target.value})}
                            rightElement={
                                <a href="https://aviationstack.com/" target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-500 font-bold uppercase hover:underline mr-2">Get Key</a>
                            }
                        />
                        <p className="text-[10px] text-gray-400 mt-2">Required for retrieving real-time flight schedules and airline details in the Planner.</p>
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
                                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-black text-white shadow-lg transition-transform group-hover:scale-110
                                                    ${user.role === 'Partner' ? 'bg-gradient-to-br from-blue-500 to-indigo-600' : 'bg-gradient-to-br from-emerald-400 to-teal-600'}`}>
                                                    {user.name.charAt(0)}
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-gray-800 dark:text-white text-base leading-none">{user.name}</h4>
                                                    <div className="flex items-center gap-2 mt-1">
                                                    <span className={`text-[9px] font-black uppercase tracking-widest ${user.role === 'Partner' ? 'text-blue-500' : 'text-emerald-500'}`}>{user.role}</span>
                                                    {user.holidayWeekendRule && user.holidayWeekendRule !== 'none' && (
                                                        <Badge color="amber" className="!text-[8px] !py-0 !px-1">Weekend: {user.holidayWeekendRule}</Badge>
                                                    )}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-6 mt-4 lg:mt-0 lg:mr-4">
                                                <div className="flex items-center gap-2">
                                                    {selectedHolidays.length === 0 && <span className="text-[9px] text-gray-300 font-bold uppercase tracking-widest">No Region</span>}
                                                    {selectedHolidays.slice(0, 3).map(c => (
                                                        <div key={c.id} title={c.countryName} className="px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-[9px] font-bold text-gray-500 uppercase">
                                                            {c.countryCode}-{c.year}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-1 mt-4 lg:mt-0 pl-4 border-l border-gray-100 dark:border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => handleEditUser(user)} className="p-2 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg dark:bg-blue-900/20 dark:hover:bg-blue-900/40 dark:text-blue-400 transition-colors">
                                                    <span className="material-icons-outlined text-lg">edit</span>
                                                </button>
                                                <button onClick={() => initiateDeleteMember(user)} className="p-2 text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg dark:bg-rose-900/20 dark:hover:bg-rose-900/40 dark:text-rose-400 transition-colors">
                                                    <span className="material-icons-outlined text-lg">delete</span>
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </Card>
            </div>

            {/* RIGHT COLUMN: Operational Preferences & Tools */}
            <div className="xl:col-span-4 space-y-8">
                <Card noPadding className="rounded-[2rem]">
                    <div className="p-8 border-b border-gray-100 dark:border-white/5">
                        <h3 className="text-2xl font-black text-gray-900 dark:text-white leading-none">Working Matrix</h3>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-2">Active operating windows</p>
                    </div>
                    <div className="p-8 space-y-8">
                        <div className="space-y-4">
                            <div className="flex justify-between items-center bg-gray-100 dark:bg-gray-800 p-1.5 rounded-[1.5rem] border border-gray-200/50 dark:border-white/5">
                                {workingDayUiOrder.map((dayObj) => {
                                    const isActive = config.workingDays?.includes(dayObj.value);
                                    return (
                                        <button
                                            key={dayObj.value}
                                            onClick={() => toggleWorkingDay(dayObj.value)}
                                            className={`w-10 h-10 rounded-xl text-xs font-black transition-all flex items-center justify-center
                                                ${isActive 
                                                    ? 'bg-white shadow-xl text-blue-600 dark:bg-gray-700 dark:text-white scale-110' 
                                                    : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                                                }
                                            `}
                                        >
                                            {dayObj.label}
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest text-center italic">Selected days represent standard labor duration</p>
                        </div>

                        <div className="space-y-3">
                            <Select 
                                label="App Interface Protocol"
                                value={config.theme}
                                onChange={e => {
                                    const newTheme = e.target.value as any;
                                    setConfig({...config, theme: newTheme});
                                    // Trigger immediate visual feedback
                                    if (onThemeChange) onThemeChange(newTheme);
                                }}
                                className="!rounded-2xl"
                                options={[
                                    { label: 'System Automatic', value: 'auto' },
                                    { label: 'Solaric (Light)', value: 'light' },
                                    { label: 'Obscura (Dark)', value: 'dark' },
                                ]}
                            />
                        </div>
                    </div>
                </Card>

                <Card noPadding className="rounded-[2rem] border-rose-500/20">
                    <div className="p-8 border-b border-rose-500/10 bg-rose-500/5 rounded-t-[2rem]">
                        <h3 className="text-2xl font-black text-rose-900 dark:text-rose-400 leading-none">Systems Vault</h3>
                        <p className="text-[10px] font-black text-rose-500/50 uppercase tracking-widest mt-2">Data persistence & integrity</p>
                    </div>
                    <div className="p-8 space-y-4">
                        <Button 
                            variant="secondary" 
                            className="w-full !rounded-2xl border-2 py-4" 
                            icon={<span className="material-icons-outlined">cloud_download</span>}
                            onClick={handleExport}
                        >
                            Export Database State
                        </Button>
                        <div className="relative group">
                            {/* Modified Input: Removed onChange direct logic, now calls state setter */}
                            <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleFileSelect} />
                            <Button 
                                variant="outline" 
                                className="w-full !rounded-2xl border-rose-500/30 text-rose-600 hover:bg-rose-500 hover:text-white transition-all py-4" 
                                icon={<span className="material-icons-outlined">history</span>}
                                onClick={handleImportTrigger}
                            >
                                Restore from Snapshot
                            </Button>
                            <p className="text-[9px] text-center text-rose-400 font-bold uppercase tracking-widest mt-3">Warning: Snapshot restore is destructive</p>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
      )}
      
      {/* ... Rest of tabs ... */}
      {activeTab === 'policies' && (
          <div className="h-[800px] animate-fade-in">
              <EntitlementsManager />
          </div>
      )}

      {activeTab === 'calendars' && (
          <div className="h-[800px] animate-fade-in">
              <PublicHolidaysManager />
          </div>
      )}
       
       {/* Modal: Member Access Control */}
       <Modal isOpen={isEditingUser} onClose={() => setIsEditingUser(false)} title="Member Access Control">
            <div className="space-y-6 max-h-[75vh] overflow-y-auto px-1 custom-scrollbar">
                <div className="space-y-4 animate-fade-in">
                    <Input 
                        label="Identity: Name" 
                        className="!rounded-2xl"
                        value={editingUser.name || ''} 
                        onChange={e => setEditingUser({...editingUser, name: e.target.value})} 
                    />
                    <Select 
                        label="Clearance Level"
                        className="!rounded-2xl"
                        value={editingUser.role || 'Partner'}
                        onChange={e => setEditingUser({...editingUser, role: e.target.value as any})}
                        options={[
                            { label: 'Partner (Executive)', value: 'Partner' },
                            { label: 'Child (Standard)', value: 'Child' },
                            { label: 'Admin (System)', value: 'Admin' },
                        ]}
                    />
                </div>

                <div className="flex gap-3 pt-6 border-t border-gray-100 dark:border-white/5">
                    <Button variant="ghost" className="flex-1 !rounded-2xl" onClick={() => setIsEditingUser(false)}>Discard</Button>
                    <Button variant="primary" className="flex-1 !rounded-2xl shadow-xl shadow-blue-500/20" onClick={handleSaveUser}>Authorize Profile</Button>
                </div>
            </div>
       </Modal>
       
       {/* Modal: Personnel Termination */}
       <Modal isOpen={!!memberToDelete} onClose={() => setMemberToDelete(null)} title="Personnel Termination">
            <div className="space-y-6 text-center">
                <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center mx-auto text-rose-600 animate-bounce">
                    <span className="material-icons-outlined text-4xl">person_remove</span>
                </div>
                <div>
                    <h4 className="text-2xl font-black text-gray-900 dark:text-white leading-none">Sever Identity?</h4>
                    <p className="text-gray-500 dark:text-gray-400 mt-3 text-sm leading-relaxed">
                        You are about to remove <span className="font-bold text-gray-900 dark:text-white">{memberToDelete?.name}</span> from the roster. This will purge all associated historical data.
                    </p>
                </div>
                <div className="flex gap-3 pt-2">
                    <Button variant="ghost" className="flex-1 !rounded-xl" onClick={() => setMemberToDelete(null)}>Cancel</Button>
                    <Button variant="danger" className="flex-1 !rounded-xl shadow-lg shadow-rose-500/20" onClick={handleConfirmDeleteMember} isLoading={isDeletingMember !== null}>
                        Confirm Removal
                    </Button>
                </div>
            </div>
       </Modal>

       {/* Modal: Backup Restoration Confirmation */}
       <Modal isOpen={isRestoreModalOpen} onClose={() => { if(restoreStatus !== 'importing') setIsRestoreModalOpen(false); }} title="System Restoration">
            <div className="space-y-6 text-center">
                {restoreStatus === 'success' ? (
                    <div className="py-6 animate-fade-in">
                        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-emerald-600 mb-4 animate-bounce">
                            <span className="material-icons-outlined text-4xl">check_circle</span>
                        </div>
                        <h4 className="text-xl font-black text-gray-900 dark:text-white">Restoration Complete</h4>
                        <p className="text-sm text-gray-500 mt-2">System rebooting...</p>
                    </div>
                ) : restoreStatus === 'importing' || restoreStatus === 'reading' ? (
                    <div className="py-6 flex flex-col items-center gap-4">
                        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-sm font-bold text-gray-600 dark:text-gray-400 uppercase tracking-widest">
                            {restoreStatus === 'reading' ? 'Analyzing File...' : 'Overwriting Database...'}
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto text-amber-600 animate-pulse">
                            <span className="material-icons-outlined text-4xl">warning_amber</span>
                        </div>
                        <div>
                            <h4 className="text-2xl font-black text-gray-900 dark:text-white leading-none">Overwrite Database?</h4>
                            <p className="text-gray-500 dark:text-gray-400 mt-4 text-sm leading-relaxed">
                                You are about to replace all current application data with the selected backup file. 
                                <br/><span className="font-bold text-rose-500">Current data will be permanently lost.</span>
                            </p>
                            {restoreErrorMessage && (
                                <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-600">
                                    Error: {restoreErrorMessage}
                                </div>
                            )}
                        </div>
                        <div className="flex gap-3 pt-2">
                            <Button variant="ghost" className="flex-1 !rounded-xl" onClick={() => setIsRestoreModalOpen(false)}>Cancel</Button>
                            <Button variant="primary" className="flex-1 !rounded-xl shadow-lg shadow-amber-500/20 bg-amber-500 hover:bg-amber-600 dark:bg-amber-600 dark:hover:bg-amber-500" onClick={handleConfirmRestore}>
                                Confirm & Restore
                            </Button>
                        </div>
                    </>
                )}
            </div>
       </Modal>
    </div>
  );
};
