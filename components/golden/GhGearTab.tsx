import React, { useMemo, useState } from 'react';
import { Check, Plus, X, TShirt, Drop, DeviceMobile, FileText, FirstAid, DotsThreeCircle } from '@/components/ui/hugeicons';
import { WorkspaceSettings, PackingItem } from '../../types';
import { GhButton, GhTone } from './Gh';
import { GhTextInput } from './GhTextInput';
import { GhSegmented } from './GhSegmented';

const CATEGORIES: { id: string; icon: React.ElementType; tone: GhTone }[] = [
  { id: 'Clothing', icon: TShirt, tone: 'coral' },
  { id: 'Toiletries', icon: Drop, tone: 'teal' },
  { id: 'Electronics', icon: DeviceMobile, tone: 'lilac' },
  { id: 'Documents', icon: FileText, tone: 'sun' },
  { id: 'Health', icon: FirstAid, tone: 'coral' },
  { id: 'Misc', icon: DotsThreeCircle, tone: 'lilac' },
];

const TILE: Record<string, string> = {
  coral: 'bg-sunset-orange text-white',
  teal: 'bg-sunset-teal text-sunset-ink',
  lilac: 'bg-sunset-lilac text-sunset-ink',
  sun: 'bg-sunset-sun text-sunset-ink',
};

/** Golden / Board master packing list editor (the classic GearSettingsTab is glass-styled). */
export const GhGearTab: React.FC<{
  config: WorkspaceSettings;
  setConfig: (config: WorkspaceSettings) => void;
  handleSaveOrgSettings: () => Promise<void>;
  isSavingOrg: boolean;
}> = ({ config, setConfig, handleSaveOrgSettings, isSavingOrg }) => {
  const [text, setText] = useState('');
  const [category, setCategory] = useState('Clothing');

  const add = () => {
    if (!text.trim()) return;
    const item: PackingItem = { id: Math.random().toString(36).slice(2, 11), text: text.trim(), category, isChecked: false };
    setConfig({ ...config, masterPackingList: [...(config.masterPackingList || []), item] });
    setText('');
  };
  const remove = (id: string) => setConfig({ ...config, masterPackingList: (config.masterPackingList || []).filter(i => i.id !== id) });

  const groups = useMemo(() => {
    const g: Record<string, PackingItem[]> = {};
    CATEGORIES.forEach(c => { g[c.id] = []; });
    (config.masterPackingList || []).forEach(i => { g[g[i.category] ? i.category : 'Misc'].push(i); });
    return g;
  }, [config.masterPackingList]);

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-3xl bg-white dark:bg-sunset-plum shadow-card p-5 flex flex-col gap-4 text-sunset-ink dark:text-white">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black">Master packing list</h2>
            <p className="text-sm opacity-70">Starting items for every new trip.</p>
          </div>
          <GhButton onClick={() => void handleSaveOrgSettings()} icon={<Check className="w-4 h-4" />}>{isSavingOrg ? 'Saving…' : 'Save list'}</GhButton>
        </div>
        <form onSubmit={e => { e.preventDefault(); add(); }} className="flex flex-col gap-3">
          <GhTextInput aria-label="New packing item" placeholder="Add an item, like a travel adapter" value={text} onChange={e => setText(e.target.value)} />
          <GhSegmented wrap label="Category" value={category} onChange={setCategory} options={CATEGORIES.map(c => ({ value: c.id, label: c.id }))} />
          <GhButton type="submit" icon={<Plus className="w-4 h-4" />} className={!text.trim() ? 'opacity-50' : ''}>Add item</GhButton>
        </form>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {CATEGORIES.map(cat => {
          const items = groups[cat.id] || [];
          const Icon = cat.icon;
          return (
            <section key={cat.id} aria-label={cat.id} className="rounded-3xl bg-white dark:bg-sunset-plum shadow-card p-4 text-sunset-ink dark:text-white flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className={`w-10 h-10 rounded-2xl flex items-center justify-center ${TILE[cat.tone]}`}><Icon className="w-5 h-5" /></span>
                <h3 className="font-black flex-1">{cat.id}</h3>
                <span className="rounded-full bg-sunset-sand dark:bg-sunset-dusk px-3 py-1 text-xs font-black">{items.length}</span>
              </div>
              {items.length === 0 ? (
                <div className="rounded-2xl bg-sunset-sand dark:bg-sunset-dusk p-4 text-sm font-semibold text-center opacity-80">Nothing here yet</div>
              ) : (
                <ul className="flex flex-col gap-2 max-h-72 overflow-y-auto">
                  {items.map(item => (
                    <li key={item.id} className="flex items-center justify-between gap-2 rounded-2xl bg-sunset-sand dark:bg-sunset-dusk pl-4 pr-1 min-h-[44px]">
                      <span className="text-sm font-semibold truncate">{item.text}</span>
                      <button type="button" onClick={() => remove(item.id)} aria-label={`Remove ${item.text}`} className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center cursor-pointer hover:bg-white/60 dark:hover:bg-white/10 text-sunset-coral">
                        <X className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
};

export default GhGearTab;
