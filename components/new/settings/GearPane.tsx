import React, { useEffect, useMemo, useState } from 'react';
import type { PackingItem, WorkspaceSettings } from '../../../types';
import type { SettingsData } from '../../../hooks/useSettingsData';
import { StackPanel, type StackPage, type StackRow } from '../../kokonutui/stack-panel';
import ParticleButton from '../../kokonutui/particle-button';
import { RpChip, RpEmpty, RpSheet } from '../ui';
import { RP_FIELD, RpField } from '../fields';
import { useUndoToast } from '../UndoToast';
import { Backpack, Drop, DeviceMobile, DotsThreeCircle, FileText, FirstAid, Plus, TShirt, X, type Icon } from '../../ui/hugeicons';
import { errorMessage, toast } from '../../../services/toast';
import { cn } from '../../../utils/cn';
import { card, CANCEL_BTN, PaneHeader } from './SettingsParts';

const CATEGORIES: Array<{ id: string; icon: Icon }> = [
    { id: 'Clothing', icon: TShirt },
    { id: 'Toiletries', icon: Drop },
    { id: 'Electronics', icon: DeviceMobile },
    { id: 'Documents', icon: FileText },
    { id: 'Health', icon: FirstAid },
    { id: 'Misc', icon: DotsThreeCircle },
];
const SHOWN = 8;

const newId = () => Math.random().toString(36).slice(2, 11);

/** Add one item to the master list: a name and a category. */
const ItemSheet: React.FC<{ open: boolean; category: string; onClose: () => void; onAdd: (text: string, category: string) => Promise<void> }> = ({ open, category, onClose, onAdd }) => {
    const [text, setText] = useState('');
    const [cat, setCat] = useState(category);
    const [error, setError] = useState('');
    useEffect(() => { if (open) { setText(''); setCat(category); setError(''); } }, [open, category]);

    const save = async () => {
        if (!text.trim()) { setError('Name the item.'); throw new Error('Name the item'); }
        try {
            await onAdd(text.trim(), cat);
            onClose();
        } catch (e) {
            setError(errorMessage(e, "That didn't save. Try again."));
            throw e;
        }
    };

    return (
        <RpSheet
            open={open}
            onClose={onClose}
            title="Add gear"
            subtitle="New trips start with the master list."
            footer={
                <>
                    <button type="button" onClick={onClose} className={CANCEL_BTN}>Cancel</button>
                    <ParticleButton onClick={save} successDuration={700} onError={() => undefined} className="!min-h-11">Add item</ParticleButton>
                </>
            }
        >
            <div className="flex flex-col gap-2">
                <RpField label="Item" error={error}>
                    {id => (
                        <input
                            id={id}
                            value={text}
                            onChange={e => setText(e.target.value)}
                            placeholder="Universal travel adapter"
                            autoFocus
                            autoComplete="off"
                            onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
                            className={RP_FIELD}
                        />
                    )}
                </RpField>
                <div className="flex flex-col gap-1.5 py-1.5">
                    <span className="text-xs text-rp-muted" id="gear-category">Category</span>
                    <div role="group" aria-labelledby="gear-category" className="flex flex-wrap gap-2">
                        {CATEGORIES.map(c => (
                            <RpChip key={c.id} selected={cat === c.id} onClick={() => setCat(c.id)}>
                                <c.icon size={16} aria-hidden /> {c.id}
                            </RpChip>
                        ))}
                    </div>
                </div>
            </div>
        </RpSheet>
    );
};

export const GearPane: React.FC<{ data: SettingsData }> = ({ data }) => {
    const { settings } = data;
    const undo = useUndoToast();
    const [adding, setAdding] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

    const list = settings?.masterPackingList ?? [];
    const grouped = useMemo(() => {
        const groups: Record<string, PackingItem[]> = Object.fromEntries(CATEGORIES.map(c => [c.id, [] as PackingItem[]]));
        list.forEach(i => { (groups[groups[i.category] ? i.category : 'Misc']).push(i); });
        return groups;
    }, [list]);
    if (!settings) return null;

    const persist = (next: PackingItem[]) => data.save({ masterPackingList: next } as Partial<WorkspaceSettings>);
    const add = async (text: string, category: string) => {
        await persist([...list, { id: newId(), text, category, isChecked: false }]);
    };
    const remove = async (item: PackingItem) => {
        try {
            await persist(list.filter(i => i.id !== item.id));
            undo.show(`Removed ${item.text}`, async () => { await persist([...list]); });
        } catch (e) {
            toast.error(errorMessage(e, "The item couldn't be removed."));
        }
    };

    const addButton = (
        <button type="button" onClick={() => setAdding('Clothing')} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-rp-ink px-5 text-sm font-medium text-rp-on-ink outline-none hover:bg-rp-ink/90 focus-visible:ring-2 focus-visible:ring-rp-muted focus-visible:ring-offset-2 focus-visible:ring-offset-rp-canvas">
            <Plus size={16} aria-hidden /> Add gear
        </button>
    );

    const pages: Record<string, StackPage> = {
        gear: {
            title: 'Master gear list',
            sections: [{
                rows: CATEGORIES.map(c => ({ id: c.id, icon: c.icon, label: c.id, detail: grouped[c.id].length, to: c.id })),
                footer: 'New trips start with these items.',
            }],
        },
    };
    CATEGORIES.forEach(c => {
        const items = grouped[c.id];
        const all = expanded[c.id];
        const shown = all ? items : items.slice(0, SHOWN);
        const rows: StackRow[] = shown.map(item => ({
            id: item.id,
            label: item.text,
            trailing: (
                <button
                    type="button"
                    aria-label={`Remove ${item.text}`}
                    onClick={() => void remove(item)}
                    className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-rp-muted outline-none hover:bg-rp-line hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted"
                >
                    <X size={16} aria-hidden />
                </button>
            ),
        }));
        if (items.length > SHOWN) {
            rows.push({ id: '__more', label: all ? 'Show fewer' : `Show all ${items.length}`, onSelect: () => setExpanded(e => ({ ...e, [c.id]: !all })) });
        }
        pages[c.id] = {
            title: c.id,
            sections: [
                ...(rows.length > 0 ? [{ rows }] : []),
                { rows: [{ id: '__add', icon: Plus, label: `Add to ${c.id}`, onSelect: () => setAdding(c.id) }] },
            ],
        };
    });

    return (
        <section aria-label="Gear">
            <PaneHeader icon={Backpack} title="Gear" count={list.length} actions={addButton} />
            {list.length === 0 ? (
                <div className={card}>
                    <RpEmpty title="No gear yet" action={<button type="button" onClick={() => setAdding('Clothing')} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-rp-ink px-5 text-sm font-medium text-rp-on-ink"><Plus size={16} aria-hidden /> Add gear</button>}>
                        Items you always pack, ready for every new trip.
                    </RpEmpty>
                </div>
            ) : (
                <div className={cn(card, 'p-2 sm:p-3')}>
                    <StackPanel pages={pages} root="gear" bare />
                </div>
            )}
            <ItemSheet open={adding !== null} category={adding ?? 'Clothing'} onClose={() => setAdding(null)} onAdd={add} />
            {undo.host}
        </section>
    );
};
