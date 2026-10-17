import React, { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { Backpack, Check, Plus, Sparkle, X } from '@/components/ui/hugeicons';
import { confirmDialog } from '../../services/confirm';
import { toast } from '../../services/toast';
import { dataService } from '../../services/mockDb';
import { PackingItem, Trip } from '../../types';
import { GhButton, GhCard, GhChip, GhEmpty, GhTone } from './Gh';

const CATEGORIES: { id: string; label: string; tone: GhTone }[] = [
  { id: 'Clothing', label: 'Clothes', tone: 'sun' },
  { id: 'Toiletries', label: 'Wash bag', tone: 'teal' },
  { id: 'Electronics', label: 'Gadgets', tone: 'lilac' },
  { id: 'Documents', label: 'Papers', tone: 'coral' },
  { id: 'Health', label: 'Health', tone: 'teal' },
  { id: 'Misc', label: 'Other', tone: 'sun' },
];

const newId = () => Math.random().toString(36).slice(2, 11);

/** Golden Hour packing checklist. Same behaviour as components/PackingList.tsx: toggle, add, delete, clear, master list, AI fill. */
export const GoldenPacking: React.FC<{ trip: Trip; onUpdate: (items: PackingItem[]) => void }> = ({ trip, onUpdate }) => {
  const [text, setText] = useState('');
  const [category, setCategory] = useState('Clothing');
  const [generating, setGenerating] = useState(false);
  const [masterList, setMasterList] = useState<PackingItem[]>([]);

  useEffect(() => {
    dataService.getWorkspaceSettings().then(s => { if (s.masterPackingList) setMasterList(s.masterPackingList); });
  }, []);

  const items = trip.packingList || [];
  const packed = items.filter(i => i.isChecked).length;
  const percent = items.length === 0 ? 0 : Math.round((packed / items.length) * 100);

  const grouped = useMemo(() => {
    const groups: Record<string, PackingItem[]> = {};
    CATEGORIES.forEach(c => { groups[c.id] = []; });
    items.forEach(i => { groups[groups[i.category] ? i.category : 'Misc'].push(i); });
    return groups;
  }, [items]);

  const add = () => {
    if (!text.trim()) return;
    onUpdate([...items, { id: newId(), text, category, isChecked: false }]);
    setText('');
  };

  const importMaster = () => {
    if (masterList.length === 0) return;
    const have = new Set(items.map(i => i.text.toLowerCase()));
    const fresh = masterList.filter(m => !have.has(m.text.toLowerCase())).map(m => ({ ...m, id: newId(), isChecked: false }));
    if (fresh.length > 0) onUpdate([...items, ...fresh]);
    else toast.info('All master list items are already added.');
  };

  const generate = async () => {
    setGenerating(true);
    try {
      const prompt = `
        Generate a comprehensive packing list for a trip to ${trip.location}.
        Dates: ${trip.startDate} to ${trip.endDate}.
        Activities: ${trip.activities?.map(a => a.title).join(', ') || 'General sightseeing'}.
        Accommodation: ${trip.accommodations?.map(a => a.type).join(', ') || 'Hotel'}.

        Provide a list of 15-20 essential items grouped by category (Clothing, Toiletries, Electronics, Documents, Health, Misc).
        Return ONLY a JSON array of objects with "category" and "item" string fields.
      `;
      const reply = await dataService.generateAI([{ role: 'user', text: prompt }], 'application/json');
      const raw = JSON.parse(reply || '[]');
      const fresh: PackingItem[] = raw.map((e: any) => ({ id: newId(), text: e.item, category: e.category, isChecked: false }));
      onUpdate([...items, ...fresh]);
    } catch (e: any) {
      console.error('AI Generation failed', e);
      toast.error(e?.message || 'Could not generate list. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const clearAll = async () => {
    if (items.length === 0) return;
    if (await confirmDialog({ title: 'Clear packing list?', message: `Remove all ${items.length} item${items.length === 1 ? '' : 's'} from this packing list? This can't be undone.`, confirmLabel: 'Clear All', danger: true })) onUpdate([]);
  };

  return (
    <div className="flex flex-col gap-5 animate-fadeIn">
      <GhCard tone="teal" className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
        <div className="relative w-24 h-24 shrink-0">
          <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90" aria-hidden="true">
            <circle cx="18" cy="18" r="15.9" fill="none" strokeWidth="4" className="stroke-white/50" />
            <circle cx="18" cy="18" r="15.9" fill="none" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${percent}, 100`} className="stroke-sunset-ink transition-all duration-700" />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-2xl font-black">{percent}%</div>
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight">{items.length === 0 ? 'Time to pack!' : packed === items.length ? 'All packed. Go!' : 'Packing up'}</h2>
          <p className="font-semibold opacity-80">{packed} of {items.length} things in the bag</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <GhButton variant="soft" onClick={generate} icon={<Sparkle className="w-4 h-4" />} label="Fill the list with suggestions">{generating ? 'Thinking…' : 'Suggest items'}</GhButton>
          {masterList.length > 0 && <GhButton variant="soft" onClick={importMaster} icon={<Backpack className="w-4 h-4" />}>Master list</GhButton>}
          {items.length > 0 && <GhButton variant="ghost" onClick={clearAll}>Clear all</GhButton>}
        </div>
      </GhCard>

      <GhCard className="flex flex-col gap-3">
        <div className="flex gap-2">
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()}
            placeholder="Add something to pack"
            aria-label="New packing item"
            className="flex-1 min-w-0 min-h-[48px] rounded-2xl px-4 text-base font-semibold bg-sunset-sand dark:bg-sunset-dusk text-sunset-ink dark:text-white placeholder:text-sunset-ink/40 dark:placeholder:text-white/40 outline-none focus:ring-2 focus:ring-sunset-coral"
          />
          <GhButton onClick={add} icon={<Plus className="w-5 h-5" />} label="Add packing item">Add</GhButton>
        </div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Category">
          {CATEGORIES.map(c => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={category === c.id}
              onClick={() => setCategory(c.id)}
              className={clsx('min-h-[44px] px-4 rounded-full text-sm font-semibold cursor-pointer', category === c.id ? 'bg-sunset-ink text-white dark:bg-white dark:text-sunset-ink' : 'bg-sunset-sand dark:bg-sunset-dusk text-sunset-ink dark:text-white')}
            >
              {c.label}
            </button>
          ))}
        </div>
      </GhCard>

      {items.length === 0 ? (
        <GhEmpty title="Your bag is empty" hint="Add things by hand, or let us suggest a list." action={<GhButton onClick={generate}>Suggest a list</GhButton>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {CATEGORIES.filter(c => grouped[c.id].length > 0).map(c => (
            <GhCard key={c.id} tone={c.tone} className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black">{c.label}</h3>
                <GhChip>{grouped[c.id].filter(i => i.isChecked).length}/{grouped[c.id].length}</GhChip>
              </div>
              <ul className="flex flex-col gap-2">
                {grouped[c.id].map(item => (
                  <li key={item.id} className="flex items-center gap-1 rounded-2xl bg-white text-sunset-ink">
                    <button
                      type="button"
                      onClick={() => onUpdate(items.map(i => (i.id === item.id ? { ...i, isChecked: !i.isChecked } : i)))}
                      aria-pressed={item.isChecked}
                      className="flex-1 min-w-0 min-h-[44px] flex items-center gap-3 px-3 text-left cursor-pointer"
                    >
                      <span className={clsx('w-6 h-6 rounded-full flex items-center justify-center shrink-0', item.isChecked ? 'bg-sunset-ink text-white' : 'bg-sunset-sand')}>
                        {item.isChecked && <Check className="w-4 h-4" />}
                      </span>
                      <span className={clsx('flex-1 truncate font-semibold', item.isChecked && 'line-through opacity-50')}>{item.text}</span>
                    </button>
                    <button type="button" onClick={() => onUpdate(items.filter(i => i.id !== item.id))} aria-label={`Delete ${item.text}`} className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full opacity-60 hover:opacity-100 cursor-pointer">
                      <X className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </GhCard>
          ))}
        </div>
      )}
    </div>
  );
};
