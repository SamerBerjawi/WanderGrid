
import React, { useState, useEffect } from 'react';
import { Card, Button, Badge, Select, Input, Modal } from './ui';
import { dataService } from '../services/mockDb';
import { PublicHoliday, SavedConfig, User } from '../types';

export const PublicHolidaysManager: React.FC = () => {
  const [selectedCountry, setSelectedCountry] = useState('BE');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [availableCountries, setAvailableCountries] = useState<{label: string, value: string}[]>([
      { label: 'Belgium', value: 'BE' }
  ]);
  
  const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
  const [savedConfigs, setSavedConfigs] = useState<SavedConfig[]>([]);
  const [loadingHolidays, setLoadingHolidays] = useState(false);
  const [users, setUsers] = useState<User[]>([]);

  // Custom Holiday State
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
  const [customForm, setCustomForm] = useState({ name: '', date: '' });

  useEffect(() => {
    dataService.getUsers().then(setUsers);
    
    const fetchCountries = async () => {
        try {
            const res = await fetch('https://date.nager.at/api/v3/AvailableCountries');
            if (res.ok) {
                const data = await res.json();
                const formatted = data.map((c: any) => ({ label: c.name, value: c.countryCode }));
                setAvailableCountries(formatted);
            }
        } catch (e) {
            setAvailableCountries([{ label: 'Belgium', value: 'BE' }]);
        }
    };
    fetchCountries();
    
    const loadSaved = async () => {
        const configs = await dataService.getSavedConfigs();
        setSavedConfigs(configs);
    };
    loadSaved();
  }, []);

  useEffect(() => {
    const fetchHolidays = async () => {
      if (!selectedCountry || !selectedYear || isNaN(selectedYear)) {
          setHolidays([]);
          return;
      }

      setLoadingHolidays(true);
      try {
          const saved = savedConfigs.find(c => c.countryCode === selectedCountry && c.year === selectedYear);
          if (saved && saved.holidays.length > 0) {
              setHolidays(saved.holidays);
              setLoadingHolidays(false);
              return; 
          }

          const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${selectedYear}/${selectedCountry}`);
          if (res.ok) {
              const data = await res.json();
              const formatted = data.map((h: any, i: number) => {
                 const d = new Date(h.date);
                 const day = d.getDay();
                 return {
                     id: `nag-${selectedCountry}-${selectedYear}-${i}`,
                     name: h.name,
                     date: h.date,
                     countryCode: selectedCountry,
                     isIncluded: true,
                     isWeekend: day === 0 || day === 6
                 };
              });
              setHolidays(formatted);
          }
      } catch (e) {
          console.error("Fetch failed", e);
      }
      setLoadingHolidays(false);
    };

    fetchHolidays();
  }, [selectedCountry, selectedYear, savedConfigs.length]); 

  const toggleHolidayInclusion = (id: string) => {
    setHolidays(prev => prev.map(h => 
        h.id === id ? { ...h, isIncluded: !h.isIncluded } : h
    ));
  };

  const handleAddCustom = () => {
      if (!customForm.name || !customForm.date) return;
      
      const d = new Date(customForm.date);
      const day = d.getDay();
      const year = d.getFullYear();

      // Warning if year doesn't match
      if (year !== selectedYear) {
          if (!confirm(`The date selected (${year}) does not match the current cycle year (${selectedYear}). Add anyway?`)) {
              return;
          }
      }

      const newHoliday: PublicHoliday = {
          id: `custom-${Date.now()}`,
          name: customForm.name,
          date: customForm.date,
          countryCode: selectedCountry,
          isIncluded: true,
          isWeekend: day === 0 || day === 6
      };

      setHolidays(prev => [...prev, newHoliday].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
      setIsCustomModalOpen(false);
      setCustomForm({ name: '', date: '' });
  };

  const handleDeleteCustom = (id: string) => {
      setHolidays(prev => prev.filter(h => h.id !== id));
  };

  const handleSaveHolidays = async () => {
    const currentConfigId = `${selectedCountry}-${selectedYear}`;
    const countryName = availableCountries.find(c => c.value === selectedCountry)?.label || selectedCountry;
    const newConfig: SavedConfig = {
        id: currentConfigId,
        countryCode: selectedCountry,
        countryName,
        year: selectedYear,
        holidays: holidays,
        updatedAt: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString()
    };
    
    await dataService.saveConfig(newConfig);
    const updatedConfigs = await dataService.getSavedConfigs();
    setSavedConfigs(updatedConfigs);
  };

  const handleDeleteConfig = async (id: string) => {
    await dataService.deleteConfig(id);
    const updatedConfigs = await dataService.getSavedConfigs();
    setSavedConfigs(updatedConfigs);
  };

  const handleLoadConfig = (config: SavedConfig) => {
      setSelectedCountry(config.countryCode);
      setSelectedYear(config.year);
  };

  const sortedHolidays = [...holidays].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <div className="space-y-8 h-full flex flex-col">
       <Card noPadding className="rounded-[2rem] border-white/50 dark:border-white/10 overflow-visible shadow-2xl flex-1 flex flex-col">
           <div className="p-8 border-b border-gray-100 dark:border-white/5 bg-gradient-to-br from-amber-500/5 to-orange-500/5 rounded-t-[2rem]">
               <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white shadow-xl flex items-center justify-center">
                        <span className="material-icons-outlined">public</span>
                    </div>
                    <div>
                        <h3 className="text-2xl font-black text-gray-900 dark:text-white leading-none">Global Calendars</h3>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-2">Regional statutory holidays</p>
                    </div>
               </div>
               
               <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                   <div className="md:col-span-8">
                       <Select 
                           label="Locale Definition"
                           options={availableCountries}
                           value={selectedCountry}
                           onChange={(e) => setSelectedCountry(e.target.value)}
                           className="!rounded-2xl"
                       />
                   </div>
                   <div className="md:col-span-4">
                       <Input 
                           label="Cycle Year"
                           type="number"
                           className="!rounded-2xl text-center font-bold"
                           value={isNaN(selectedYear) ? '' : selectedYear}
                           onChange={e => setSelectedYear(parseInt(e.target.value))}
                       />
                   </div>
               </div>
           </div>

           <div className="px-8 py-4 bg-gray-50/50 dark:bg-white/5 border-b border-gray-100 dark:border-white/5 flex justify-between items-center">
               <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{sortedHolidays.length} Entries Found</span>
               <Button 
                   size="sm" 
                   variant="secondary" 
                   icon={<span className="material-icons-outlined text-sm">add</span>}
                   onClick={() => {
                       setCustomForm({ name: '', date: `${selectedYear}-12-24` });
                       setIsCustomModalOpen(true);
                   }}
               >
                   Add Extra Day
               </Button>
           </div>
           
           <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
               {loadingHolidays ? (
                   <div className="h-full flex flex-col items-center justify-center gap-4 py-20">
                       <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                       <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Polling Statutory Records...</p>
                   </div>
               ) : (
                   <div className="space-y-2">
                       {sortedHolidays.map(holiday => {
                           const isCustom = holiday.id.startsWith('custom-');
                           return (
                               <div 
                                 key={holiday.id} 
                                 className={`group flex items-center justify-between p-3 rounded-2xl border transition-all duration-300 ${
                                     holiday.isIncluded 
                                     ? 'bg-white border-gray-100 dark:bg-white/5 dark:border-white/10 shadow-sm hover:shadow-md' 
                                     : 'bg-gray-50 border-transparent opacity-40 grayscale dark:bg-black/20'
                                 }`}
                               >
                                   <div className="flex items-center gap-4">
                                       <div className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-colors ${holiday.isWeekend ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30'}`}>
                                           <span className="text-[8px] font-black uppercase tracking-tighter">{new Date(holiday.date).toLocaleDateString(undefined, { month: 'short' })}</span>
                                           <span className="text-lg font-black leading-none">{new Date(holiday.date).getDate()}</span>
                                       </div>
                                       <div>
                                           <div className="flex items-center gap-2">
                                                <p className={`text-sm font-black ${holiday.isIncluded ? 'text-gray-800 dark:text-white' : 'text-gray-500'}`}>{holiday.name}</p>
                                                {isCustom && <Badge color="purple" className="!px-1 !py-0 !text-[8px]">Custom</Badge>}
                                           </div>
                                           <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{new Date(holiday.date).toLocaleDateString(undefined, { weekday: 'long' })}</span>
                                                {holiday.isWeekend && <Badge color="amber" className="!px-1 !py-0 !text-[8px]">Weekend</Badge>}
                                           </div>
                                       </div>
                                   </div>
                                   {isCustom ? (
                                       <button 
                                           onClick={() => handleDeleteCustom(holiday.id)}
                                           className="w-10 h-10 rounded-xl flex items-center justify-center transition-all text-gray-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                                           title="Delete Custom Day"
                                       >
                                           <span className="material-icons-outlined text-xl">delete</span>
                                       </button>
                                   ) : (
                                       <button 
                                           onClick={() => toggleHolidayInclusion(holiday.id)}
                                           className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                                               holiday.isIncluded 
                                               ? 'text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20' 
                                               : 'text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                                           }`}
                                           title={holiday.isIncluded ? "Exclude" : "Include"}
                                       >
                                           <span className="material-icons-outlined text-xl">{holiday.isIncluded ? 'block' : 'add_task'}</span>
                                       </button>
                                   )}
                               </div>
                           );
                       })}
                       {sortedHolidays.length === 0 && (
                            <div className="py-20 text-center opacity-30">
                                <span className="material-icons-outlined text-6xl">travel_explore</span>
                                <p className="text-xs font-black uppercase tracking-[0.2em] mt-4">Awaiting definitions</p>
                            </div>
                       )}
                   </div>
               )}
           </div>

           <div className="p-8 border-t border-gray-100 dark:border-white/5 bg-white/40 dark:bg-white/5 rounded-b-[2rem]">
               <Button 
                variant="primary"
                className="w-full !rounded-2xl py-4 shadow-xl shadow-amber-500/20" 
                onClick={handleSaveHolidays}
                disabled={sortedHolidays.length === 0}
               >
                   Save Regional Definition
               </Button>
           </div>
       </Card>

       <Card noPadding className="rounded-[2rem] border-white/50 dark:border-white/10 shadow-xl max-h-[400px]">
           <div className="p-6 border-b border-gray-100 dark:border-white/5">
                <h3 className="text-xl font-black text-gray-800 dark:text-white leading-none">Active Protocols</h3>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-2">Saved regional clusters</p>
           </div>
           <div className="p-4 space-y-3 overflow-y-auto custom-scrollbar">
               {savedConfigs.length === 0 ? (
                   <div className="p-10 text-center opacity-30 grayscale italic text-[10px] font-black uppercase tracking-widest">No deployed protocols</div>
               ) : (
                   savedConfigs.map(config => (
                       <div key={config.id} className="flex items-center justify-between p-4 rounded-2xl bg-white border border-gray-100 dark:bg-white/5 dark:border-white/10 hover:shadow-lg transition-all">
                           <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400">
                                    <span className="material-icons-outlined text-lg">flag</span>
                                </div>
                                <div>
                                    <p className="font-black text-gray-800 dark:text-white text-sm leading-none">{config.countryName}</p>
                                    <div className="flex items-center gap-2 mt-2">
                                        <Badge color="blue" className="!px-1.5 !py-0 !text-[8px]">{config.year}</Badge>
                                        <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">{config.holidays.filter(h => h.isIncluded).length} Statutory Entries</span>
                                    </div>
                                </div>
                           </div>
                           <div className="flex gap-2">
                               <button 
                                onClick={() => handleLoadConfig(config)}
                                className="p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400"
                               >
                                    <span className="material-icons-outlined text-lg">settings_backup_restore</span>
                               </button>
                               <button 
                                onClick={() => handleDeleteConfig(config.id)} 
                                className="p-2 text-gray-300 hover:text-rose-500 transition-colors"
                               >
                                    <span className="material-icons-outlined text-lg">delete_outline</span>
                               </button>
                           </div>
                       </div>
                   ))
               )}
           </div>
       </Card>

       <Modal isOpen={isCustomModalOpen} onClose={() => setIsCustomModalOpen(false)} title="Add Extra Day Off">
            <div className="space-y-6">
                <div className="bg-purple-50 dark:bg-purple-900/10 p-4 rounded-2xl border border-purple-100 dark:border-purple-900/30 flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-purple-500 text-white flex items-center justify-center shrink-0">
                        <span className="material-icons-outlined">celebration</span>
                    </div>
                    <div>
                        <h4 className="font-bold text-gray-900 dark:text-white">Custom Holiday</h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Add a custom non-working day (e.g. Christmas Eve) that will be treated as a public holiday.
                        </p>
                    </div>
                </div>

                <div className="space-y-4">
                    <Input 
                        label="Name of Event" 
                        placeholder="e.g. Company Retreat"
                        className="!rounded-2xl"
                        value={customForm.name} 
                        onChange={e => setCustomForm({...customForm, name: e.target.value})} 
                    />
                    
                    <Input 
                        label="Date" 
                        type="date"
                        className="!rounded-2xl font-bold"
                        value={customForm.date} 
                        onChange={e => setCustomForm({...customForm, date: e.target.value})} 
                    />
                </div>

                <div className="flex gap-3 pt-4 border-t border-gray-100 dark:border-white/5">
                    <Button variant="ghost" className="flex-1" onClick={() => setIsCustomModalOpen(false)}>Cancel</Button>
                    <Button variant="primary" className="flex-1" onClick={handleAddCustom} disabled={!customForm.name || !customForm.date}>
                        Add to List
                    </Button>
                </div>
            </div>
       </Modal>
    </div>
  );
};
