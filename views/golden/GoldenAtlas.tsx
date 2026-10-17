import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { Compass, Plus, Trash, Check, MagnifyingGlass } from '@/components/ui/hugeicons';
import { dataService } from '../../services/mockDb';
import { confirmDialog } from '../../services/confirm';
import { affectsCollections } from '../../hooks/useWanderSync';
import { getFlagEmoji, getRegion } from '../../services/geoData';
import { refineUKCountry, STATIC_GEO_DATA } from '../../services/geocoding';
import {
  mergeCountryRecords, normalizeCountryCode, canonicalCountryName, countryId, findCountryRecord, ukNationsFromCities, type MergedCountry,
} from '../../services/countryRegistry';
import { getResidenceStatuses, type CountryResidenceStatus, type Trip, type VisitedItem } from '../../types';
import { buildTrackedCities } from '../../utils/atlasCities';
import { formatDate } from '../../utils/formatters';
import { Modal } from '../../components/ui';
import { GhButton, GhChip, GhEmpty, GhPage, GhTabs, type GhTone } from '../../components/golden/Gh';
import type { GoldenViewProps } from './registry';

/** Golden Hour Atlas: postcard country stamps and big colourful counters. */

type TabId = 'visited' | 'layovers' | 'wishlist' | 'cities';
const STAMP_TONES: GhTone[] = ['coral', 'sun', 'teal', 'lilac'];
const TILT = ['-rotate-1', 'rotate-1', 'rotate-0', '-rotate-2', 'rotate-2'];
const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 11);

const FIELD = 'w-full min-h-[44px] rounded-2xl bg-sunset-sand dark:bg-sunset-dusk text-sunset-ink dark:text-white placeholder:text-sunset-ink/50 dark:placeholder:text-white/50 px-4 text-sm font-semibold outline-none focus:ring-2 focus:ring-sunset-coral dark:[color-scheme:dark]';

const Counter: React.FC<{ tone: GhTone; label: string; value: React.ReactNode; hint: string }> = ({ tone, label, value, hint }) => {
  const bg = { coral: 'bg-sunset-orange text-white', sun: 'bg-sunset-sun text-sunset-ink', teal: 'bg-sunset-teal text-sunset-ink', lilac: 'bg-sunset-lilac text-sunset-ink', surface: '', ink: '' }[tone];
  return (
    <div className={clsx('rounded-3xl p-4 sm:p-5', bg)}>
      <div className="text-xs font-semibold uppercase tracking-wider opacity-85">{label}</div>
      <div className="text-5xl sm:text-6xl font-black tracking-tighter leading-none mt-2">{value}</div>
      <div className="text-xs font-semibold opacity-85 mt-2">{hint}</div>
    </div>
  );
};

export const GoldenAtlas: React.FC<GoldenViewProps> = () => {
  const [visitedItems, setVisitedItems] = useState<VisitedItem[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [flights, setFlights] = useState<any[]>([]);
  const [roadTrips, setRoadTrips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<any>(null);
  const [tab, setTab] = useState<TabId>('visited');
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState('All');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<VisitedItem | null>(null);
  const [fCode, setFCode] = useState('');
  const [fName, setFName] = useState('');
  const [fDate, setFDate] = useState('');
  const [fNotes, setFNotes] = useState('');
  const [fStatus, setFStatus] = useState<CountryResidenceStatus>('visited');

  const loadData = useCallback(async () => {
    try {
      const [visited, allTrips, allFlights, allRoad, ws] = await Promise.all([
        dataService.getVisited(), dataService.getTrips(), dataService.getFlights(), dataService.getRoadTrips(), dataService.getWorkspaceSettings(),
      ]);
      setVisitedItems(visited || []);
      setTrips(allTrips || []);
      setFlights(allFlights || []);
      setRoadTrips(allRoad || []);
      setSettings(ws);
    } catch (e) {
      console.error('Failed to load Travel Atlas data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);
  useEffect(() => {
    const onUpdate = (e: Event) => { if (affectsCollections(e, ['visited', 'trips', 'flights'])) void loadData(); };
    window.addEventListener('wandergrid_db_updated', onUpdate);
    return () => window.removeEventListener('wandergrid_db_updated', onUpdate);
  }, [loadData]);

  const resolveAirportCity = useCallback((code: string) => {
    const ap = (STATIC_GEO_DATA as any)[code];
    if (!ap?.city) return undefined;
    return { city: ap.city as string, countryCode: ap.iso as string, lat: parseFloat(ap.lat), lng: parseFloat(ap.lon) };
  }, []);

  const countryRecords = useMemo(
    () => mergeCountryRecords(visitedItems, { ukConstituentsFor: () => ukNationsFromCities(visitedItems, name => refineUKCountry(name, 'United Kingdom', 'GB').countryCode) }),
    [visitedItems]
  );
  const cities = useMemo(() => buildTrackedCities(visitedItems, trips, roadTrips, flights, resolveAirportCity), [visitedItems, trips, roadTrips, flights, resolveAirportCity]);

  const lists = useMemo(() => ({
    visited: countryRecords.filter(i => getResidenceStatuses(i).some(s => s === 'visited' || s === 'lived_past' || s === 'lived_current')),
    layovers: countryRecords.filter(i => getResidenceStatuses(i).includes('layover') || i.isTransit === true),
    wishlist: countryRecords.filter(i => getResidenceStatuses(i).includes('wishlist')),
  }), [countryRecords]);

  const regions = useMemo(() => ['All', ...Array.from(new Set(lists.visited.concat(lists.layovers, lists.wishlist).map(i => getRegion(i.code))))], [lists]);

  const q = query.trim().toLowerCase();
  const shown = useMemo(() => {
    const list = tab === 'cities' ? [] : lists[tab];
    return list
      .filter(i => (!q || i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q)) && (region === 'All' || getRegion(i.code) === region))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [lists, tab, q, region]);
  const shownCities = useMemo(
    () => cities.filter(c => !q || c.name.toLowerCase().includes(q) || (c.countryName || '').toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name)),
    [cities, q]
  );

  const worldPct = Math.max(0, Math.min(100, Math.round((lists.visited.length / 198) * 1000) / 10));
  const regionCount = new Set(lists.visited.map(i => getRegion(i.code)).filter(r => r !== 'Unknown')).size;

  const toStored = (item: VisitedItem): VisitedItem => { const { duplicateIds: _d, ...rest } = item as MergedCountry; return rest; };
  const removeDuplicatesOf = async (item: VisitedItem) => {
    const stored = new Set(visitedItems.map(v => v.id));
    for (const id of ((item as MergedCountry).duplicateIds || []).filter(id => stored.has(id))) await dataService.deleteVisited(id);
  };
  const refresh = () => { void loadData(); window.dispatchEvent(new CustomEvent('wandergrid_db_updated')); };

  const openAdd = () => {
    setEditing(null); setFCode(''); setFName(''); setFNotes('');
    setFDate(new Date().toISOString().split('T')[0]);
    setFStatus(tab === 'wishlist' ? 'wishlist' : tab === 'layovers' ? 'layover' : 'visited');
    setModalOpen(true);
  };
  const openEdit = (item: VisitedItem) => {
    setEditing(item); setFCode(item.countryCode || item.code); setFName(item.countryName || item.name);
    setFDate(item.visitDate || ''); setFNotes(item.notes || '');
    const s = getResidenceStatuses(item);
    setFStatus(s.includes('wishlist') ? 'wishlist' : s.includes('layover') || item.isTransit ? 'layover' : 'visited');
    setModalOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const code = normalizeCountryCode(fCode);
      const existing = editing ? undefined : findCountryRecord(visitedItems, code, fName);
      const target = editing || existing;
      const payload: VisitedItem = {
        id: target?.id || countryId(code), type: 'country', code, name: canonicalCountryName(code, fName),
        visitDate: fDate, notes: fNotes, isTransit: fStatus === 'layover', residenceStatus: fStatus, residenceStatuses: [fStatus],
        excluded: false, isManual: target ? target.isManual : true,
      };
      if (target) { await dataService.updateVisited({ ...toStored(target), ...payload }); await removeDuplicatesOf(target); }
      else await dataService.addVisited(payload);
      setModalOpen(false);
      refresh();
    } catch (err) { console.error('Failed to save country:', err); }
  };

  const promote = async (item: VisitedItem) => {
    try {
      const kept = getResidenceStatuses(item).filter(s => s !== 'wishlist' && s !== 'layover');
      const next = kept.length > 0 ? kept : ['visited' as CountryResidenceStatus];
      await dataService.updateVisited({
        ...toStored(item), residenceStatus: next[0], residenceStatuses: next, isTransit: false,
        visitDate: item.visitDate || new Date().toISOString().split('T')[0],
      });
      await removeDuplicatesOf(item);
      refresh();
    } catch (err) { console.error('Failed to promote country:', err); }
  };

  const remove = async (item: VisitedItem) => {
    if (!(await confirmDialog({ title: 'Remove from Atlas?', message: 'Remove this item from your Atlas? Your maps and statistics update straight away.', confirmLabel: 'Remove', danger: true }))) return;
    try {
      await dataService.deleteVisited(item.id);
      await removeDuplicatesOf(item);
      refresh();
    } catch (err) { console.error('Failed to delete item:', err); }
  };

  const chip = (active: boolean) => clsx(
    'min-h-[44px] px-4 rounded-full text-sm font-semibold cursor-pointer whitespace-nowrap transition-colors',
    active ? 'bg-sunset-coral text-white shadow-card' : 'bg-sunset-sand dark:bg-sunset-dusk text-sunset-ink dark:text-white'
  );

  const tabs = [
    { id: 'visited', label: 'Visited', count: lists.visited.length },
    { id: 'layovers', label: 'Layovers', count: lists.layovers.length },
    { id: 'wishlist', label: 'Wishlist', count: lists.wishlist.length },
    { id: 'cities', label: 'Cities', count: cities.length },
  ];

  return (
    <GhPage
      title="Atlas"
      icon={<Compass size={32} weight="duotone" />}
      action={<GhButton onClick={openAdd} icon={<Plus size={18} />} label="Add a country"><span>Add<span className="hidden sm:inline"> a country</span></span></GhButton>}
      controls={<GhTabs tabs={tabs} active={tab} onChange={id => { setTab(id as TabId); setRegion('All'); }} />}
    >
      {/* Hero postcard: flat sun and hills behind the headline */}
      <section aria-label="Your travel totals" className="flex flex-col gap-3 sm:gap-4">
        <div className="relative overflow-hidden rounded-3xl bg-sunset-lilac text-sunset-ink p-5 sm:p-8 min-h-[11rem]">
          <svg className="absolute right-0 bottom-0 h-full w-full sm:w-3/5" viewBox="0 0 400 160" preserveAspectRatio="xMaxYMax slice" aria-hidden="true">
            <circle cx="320" cy="70" r="46" className="fill-sunset-sun" />
            <path d="M0 160 L0 120 Q70 70 150 118 T300 112 T400 100 L400 160 Z" className="fill-sunset-orange" />
            <path d="M0 160 L0 140 Q90 105 190 138 T400 128 L400 160 Z" className="fill-sunset-coral" />
          </svg>
          <div className="relative">
            <div className="text-xs font-semibold uppercase tracking-wider opacity-80">Your passport so far</div>
            <div className="text-5xl sm:text-7xl font-black tracking-tighter leading-none mt-2">{loading ? '…' : lists.visited.length}</div>
            <div className="text-xl sm:text-2xl font-black mt-1">{lists.visited.length === 1 ? 'country stamped' : 'countries stamped'}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Counter tone="sun" label="Cities" value={cities.length} hint="places you have been" />
          <Counter tone="teal" label="World" value={`${worldPct}%`} hint={`${regionCount} ${regionCount === 1 ? 'region' : 'regions'} explored`} />
          <Counter tone="coral" label="Wishlist" value={lists.wishlist.length} hint="still to go" />
          <Counter tone="lilac" label="Layovers" value={lists.layovers.length} hint="touched down" />
        </div>
      </section>

      {/* Search + regions */}
      <section aria-label="Filters" className="flex flex-col gap-3">
        <div className="relative">
          <MagnifyingGlass size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-sunset-ink/60 dark:text-white/60 pointer-events-none" />
          <input type="search" aria-label="Search the atlas" placeholder="Search places" value={query} onChange={e => setQuery(e.target.value)} className={clsx(FIELD, 'pl-11')} />
        </div>
        {tab !== 'cities' && regions.length > 2 && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-2 px-2 sm:mx-0 sm:px-0">
            {regions.map(r => <button key={r} type="button" aria-pressed={region === r} onClick={() => setRegion(r)} className={chip(region === r)}>{r}</button>)}
          </div>
        )}
      </section>

      {/* Stamps / cities */}
      {tab === 'cities' ? (
        shownCities.length === 0 ? (
          <GhEmpty title="No cities yet" hint="Trips and flights add them for you." />
        ) : (
          <ul className="flex flex-wrap gap-2">
            {shownCities.map(c => (
              <li key={c.id}>
                <GhChip tone={STAMP_TONES[hash(c.id) % STAMP_TONES.length]} className="!text-sm !px-4 !py-2">
                  {c.countryCode && c.countryCode !== 'XX' ? getFlagEmoji(c.countryCode) : '📍'} {c.name}
                </GhChip>
              </li>
            ))}
          </ul>
        )
      ) : shown.length === 0 ? (
        <GhEmpty
          title={tab === 'wishlist' ? 'Where next?' : tab === 'layovers' ? 'No layovers logged' : 'Your first stamp awaits'}
          hint={q || region !== 'All' ? 'Nothing matches those filters.' : 'Add a country to start your collection.'}
          action={<GhButton onClick={openAdd} icon={<Plus size={18} />}>Add a country</GhButton>}
        />
      ) : (
        <ul className="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-5 pt-1">
          {shown.map(item => {
            const h = hash(item.id);
            const tone = STAMP_TONES[h % STAMP_TONES.length];
            const bg = { coral: 'bg-sunset-orange text-white', sun: 'bg-sunset-sun text-sunset-ink', teal: 'bg-sunset-teal text-sunset-ink', lilac: 'bg-sunset-lilac text-sunset-ink', surface: '', ink: '' }[tone];
            return (
              <li key={item.id} className={clsx('relative rounded-3xl p-4 sm:p-5 shadow-card transition-transform hover:rotate-0 hover:-translate-y-1', bg, TILT[h % TILT.length])}>
                <button type="button" onClick={() => openEdit(item)} aria-label={`Edit ${item.name}`} className="w-full text-left cursor-pointer min-h-[44px]">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-6xl leading-none" aria-hidden="true">{getFlagEmoji(item.code)}</span>
                    <span className="rounded-lg border-2 border-dashed border-current px-2 py-0.5 text-2xs font-black uppercase tracking-widest opacity-80 -rotate-6">{item.code}</span>
                  </div>
                  <div className="text-2xl font-black tracking-tight mt-3 truncate">{item.name}</div>
                  <div className="text-xs font-semibold opacity-85 mt-1">
                    {getRegion(item.code)}{item.visitDate ? ` · ${formatDate(item.visitDate, 'short-with-year', settings)}` : ''}
                  </div>
                </button>
                <div className="flex items-center justify-between gap-2 mt-3">
                  {tab !== 'visited' ? (
                    <button type="button" onClick={() => void promote(item)} className="min-h-[44px] px-4 rounded-full bg-white/90 text-sunset-ink text-sm font-bold inline-flex items-center gap-2 cursor-pointer active:scale-95 transition-transform">
                      <Check size={16} /> I have been
                    </button>
                  ) : <span />}
                  <button type="button" onClick={() => void remove(item)} aria-label={`Remove ${item.name}`} className="min-h-[44px] min-w-[44px] rounded-full inline-flex items-center justify-center bg-white/90 text-sunset-ink cursor-pointer active:scale-95 transition-transform">
                    <Trash size={18} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit stamp' : 'New stamp'}
        subtitle="Country"
        maxWidth="max-w-md"
        footerActions={<GhButton type="submit" label="Save" onClick={() => { void save({ preventDefault() {} } as React.FormEvent); }}>Save stamp</GhButton>}
      >
        <form onSubmit={save} className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wider text-sunset-ink dark:text-white">
              Code
              <input required maxLength={6} placeholder="PT" value={fCode} onChange={e => setFCode(e.target.value.toUpperCase())} className={FIELD} />
            </label>
            <label className="col-span-2 flex flex-col gap-1 text-xs font-bold uppercase tracking-wider text-sunset-ink dark:text-white">
              Country
              <input required placeholder="Portugal" value={fName} onChange={e => setFName(e.target.value)} className={FIELD} />
            </label>
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {([['visited', 'Visited'], ['layover', 'Layover'], ['wishlist', 'Wishlist']] as const).map(([id, label]) => (
              <button key={id} type="button" aria-pressed={fStatus === id} onClick={() => setFStatus(id)} className={chip(fStatus === id)}>{label}</button>
            ))}
          </div>
          <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wider text-sunset-ink dark:text-white">
            When
            <input type="date" value={fDate} onChange={e => setFDate(e.target.value)} className={FIELD} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wider text-sunset-ink dark:text-white">
            Notes
            <input placeholder="Best pastel de nata" value={fNotes} onChange={e => setFNotes(e.target.value)} className={FIELD} />
          </label>
        </form>
      </Modal>
    </GhPage>
  );
};
