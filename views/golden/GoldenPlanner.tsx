import React, { useEffect, useMemo, useState } from 'react';
import { confirmDialog } from '../../services/confirm';
import { Archive, CalendarBlank, Check, MagnifyingGlass, MapPin, MapTrifold, Plus, X } from '@/components/ui/hugeicons';
import { useWanderSync } from '../../hooks/useWanderSync';
import { dataService } from '../../services/mockDb';
import { Trip, User } from '../../types';
import { formatDateRange } from '../../utils/formatters';
import { TripSetupBoard, readTripDraft, clearTripDraft } from '../../components/TripSetupBoard';
import { GhButton, GhCard, GhChip, GhEmpty, GhPage, GhStat, GhTabs, GhTone } from '../../components/golden/Gh';
import type { GoldenViewProps } from './registry';

type TabKey = 'all' | 'planned' | 'confirmed' | 'past';

const TABS: { id: TabKey; label: string }[] = [
  { id: 'all', label: 'Everything' },
  { id: 'confirmed', label: 'Booked' },
  { id: 'planned', label: 'Dreaming' },
  { id: 'past', label: 'Been there' },
];

/** Each trip gets a sunset postcard tone, cycled so neighbours differ. */
const POSTCARD_TONES: GhTone[] = ['coral', 'teal', 'sun', 'lilac'];

const dayCount = (t: Trip): number => {
  if (!t.startDate || !t.endDate) return 0;
  const s = new Date(t.startDate).getTime();
  const e = new Date(t.endDate).getTime();
  return !isNaN(s) && !isNaN(e) && e >= s ? Math.round((e - s) / 86_400_000) + 1 : 0;
};

const daysUntil = (t: Trip): number | null => {
  if (!t.startDate) return null;
  const start = new Date(t.startDate);
  start.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((start.getTime() - now.getTime()) / 86_400_000);
};

const destinationsOf = (t: Trip): string[] =>
  t.locations && t.locations.length > 0
    ? t.locations.map(l => l.name).filter(Boolean)
    : (t.location || '').split(',').map(s => s.trim()).filter(Boolean);

const Postcard: React.FC<{
  trip: Trip; tone: GhTone; selecting: boolean; selected: boolean; onOpen: () => void; onSelect: () => void;
}> = ({ trip, tone, selecting, selected, onOpen, onSelect }) => {
  const until = daysUntil(trip);
  const isPast = trip.status === 'Past' || (trip.endDate && trip.endDate < new Date().toISOString().split('T')[0]);
  const badge = isPast ? 'Been there' : until !== null && until >= 0 ? (until === 0 ? 'Today' : `${until} days to go`) : trip.status === 'Upcoming' ? 'Booked' : 'Dreaming';
  const nights = dayCount(trip);
  return (
    <GhCard tone={tone} onClick={selecting ? onSelect : onOpen} pressed={selecting ? selected : undefined} label={selecting ? `Select ${trip.name}` : `Open ${trip.name}`} className={`relative overflow-hidden min-h-[11rem] flex flex-col justify-between ${selecting && selected ? 'ring-4 ring-sunset-ink dark:ring-white' : ''}`}>
      <svg viewBox="0 0 300 120" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 w-full h-full opacity-30 pointer-events-none" aria-hidden="true">
        <circle cx="240" cy="40" r="32" className="fill-white" />
        <path d="M0 120 Q80 70 160 100 T300 80 L300 120Z" className="fill-white" />
      </svg>
      <div className="relative flex items-start justify-between gap-2">
        <GhChip>{badge}</GhChip>
        {selecting && (
          <span aria-hidden="true" className={`w-7 h-7 rounded-full flex items-center justify-center ${selected ? 'bg-sunset-ink text-white dark:bg-white dark:text-sunset-ink' : 'bg-white text-sunset-ink'}`}>
            {selected && <Check className="w-4 h-4" />}
          </span>
        )}
      </div>
      <div className="relative">
        <h3 className="text-xl sm:text-2xl font-black tracking-tight leading-tight line-clamp-2">{trip.name}</h3>
        <p className="text-sm font-medium opacity-90 truncate flex items-center gap-1.5">
          <MapPin className="w-4 h-4 shrink-0" weight="duotone" />
          <span className="truncate">{destinationsOf(trip).slice(0, 3).join(' · ') || 'Somewhere nice'}</span>
        </p>
        <p className="text-xs font-semibold opacity-80 mt-1 flex items-center gap-1.5">
          <CalendarBlank className="w-4 h-4 shrink-0" weight="duotone" />
          <span>{formatDateRange(trip.startDate, trip.endDate)}{nights > 0 ? ` · ${nights} days` : ''}</span>
        </p>
      </div>
    </GhCard>
  );
};

const Section: React.FC<{ title: string; count: number; tone: GhTone; children: React.ReactNode }> = ({ title, count, tone, children }) => (
  <section className="flex flex-col gap-3">
    <div className="flex items-center gap-2">
      <h2 className="text-xl sm:text-2xl font-black tracking-tight text-sunset-ink dark:text-white">{title}</h2>
      <GhChip tone={tone}>{count}</GhChip>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">{children}</div>
  </section>
);

export const GoldenPlanner: React.FC<GoldenViewProps> = ({ onTripClick }) => {
  const { data: tripsData } = useWanderSync<Trip[]>('planner_trips', () => dataService.getTrips(), [], { collections: ['trips'] });
  const { data: usersData } = useWanderSync<User[]>('planner_users', () => dataService.getUsers(), [], { collections: ['users'] });
  const trips = useMemo(() => tripsData || [], [tripsData]);
  const users = useMemo(() => usersData || [], [usersData]);

  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [isNewTripOpen, setIsNewTripOpen] = useState(() => !!readTripDraft());
  const [drawerStatus, setDrawerStatus] = useState<'Planning' | 'Upcoming' | 'Past'>('Planning');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const years = useMemo(() => {
    const set = new Set<string>();
    trips.forEach(t => {
      if (t.startDate) set.add(t.startDate.slice(0, 4));
      if (t.endDate) set.add(t.endDate.slice(0, 4));
    });
    return Array.from(set).filter(y => y && !isNaN(Number(y))).sort((a, b) => b.localeCompare(a));
  }, [trips]);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return trips.filter(t => {
      if (t.status === 'Cancelled') return false;
      if (Boolean(t.archived) !== showArchived) return false;
      if (q) {
        const hay = `${t.name} ${t.subtitle || ''} ${t.description || ''} ${t.location || ''} ${(t.locations || []).map(l => l.name).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (selectedYear !== 'all' && t.startDate?.slice(0, 4) !== selectedYear && t.endDate?.slice(0, 4) !== selectedYear) return false;
      return true;
    });
  }, [trips, showArchived, searchQuery, selectedYear]);

  const { planned, confirmed, past } = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const p: Trip[] = [], c: Trip[] = [], pa: Trip[] = [];
    filtered.forEach(t => {
      const hasPastDates = Boolean((t.endDate && t.endDate < today) || (t.startDate && t.startDate < today && (!t.endDate || t.endDate < today)));
      if (t.status === 'Past' || hasPastDates) pa.push(t);
      else if (t.status === 'Upcoming') c.push(t);
      else p.push(t);
    });
    p.sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
    c.sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
    pa.sort((a, b) => (b.endDate || b.startDate || '').localeCompare(a.endDate || a.startDate || ''));
    return { planned: p, confirmed: c, past: pa };
  }, [filtered]);

  const stats = useMemo(() => {
    const places = new Set<string>();
    let days = 0;
    trips.forEach(t => { days += dayCount(t); destinationsOf(t).forEach(d => places.add(d)); });
    return { trips: trips.length, days, places: places.size, ahead: confirmed.length + planned.length };
  }, [trips, confirmed.length, planned.length]);

  const openNewTrip = (status: 'Planning' | 'Upcoming' | 'Past' = 'Planning') => { setDrawerStatus(status); setIsNewTripOpen(true); };

  // The wizard owns a history entry so browser Back closes it instead of leaving the Planner.
  useEffect(() => {
    if (!isNewTripOpen) return;
    if (!window.history.state?.wgTripWizard) window.history.pushState({ wgTripWizard: true }, '', window.location.pathname);
    const onPop = () => { clearTripDraft(); setIsNewTripOpen(false); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [isNewTripOpen]);

  const closeNewTrip = () => {
    clearTripDraft();
    if (window.history.state?.wgTripWizard) window.history.back();
    else setIsNewTripOpen(false);
  };

  const toggleSelected = (id: string) =>
    setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  const bulkArchive = async () => {
    if (selectedIds.size === 0) return;
    const n = selectedIds.size;
    const label = `${n} trip${n > 1 ? 's' : ''}`;
    const ok = await confirmDialog({
      title: showArchived ? 'Restore trips?' : 'Archive trips?',
      message: showArchived ? `Restore ${label} to the planner?` : `Archive ${label}? You can bring them back from Archived.`,
      confirmLabel: showArchived ? 'Restore' : 'Archive',
    });
    if (!ok) return;
    await dataService.setTripsArchived(Array.from(selectedIds), !showArchived);
    setSelectedIds(new Set());
    setSelecting(false);
  };

  if (isNewTripOpen) {
    return (
      <TripSetupBoard
        isOpen={isNewTripOpen}
        initialStatus={drawerStatus}
        users={users}
        onClose={closeNewTrip}
        onTripCreated={(saved) => {
          clearTripDraft();
          if (window.history.state?.wgTripWizard) window.history.replaceState({}, '', window.location.pathname);
          setIsNewTripOpen(false);
          if (onTripClick && saved?.id) onTripClick(saved.id);
        }}
      />
    );
  }

  const renderGroup = (list: Trip[], offset: number) =>
    list.map((t, i) => (
      <Postcard
        key={t.id}
        trip={t}
        tone={POSTCARD_TONES[(i + offset) % POSTCARD_TONES.length]}
        selecting={selecting}
        selected={selectedIds.has(t.id)}
        onOpen={() => onTripClick?.(t.id)}
        onSelect={() => toggleSelected(t.id)}
      />
    ));

  const show = (k: TabKey) => activeTab === 'all' || activeTab === k;
  const nothing = filtered.length === 0;

  return (
    <GhPage
      title="Where next?"
      icon={<MapTrifold className="w-8 h-8 sm:w-12 sm:h-12" weight="duotone" />}
      action={<GhButton onClick={() => openNewTrip()} icon={<Plus className="w-4 h-4" />}>New trip</GhButton>}
      controls={
        <GhTabs
          tabs={TABS.map(t => ({ ...t, count: t.id === 'all' ? filtered.length : t.id === 'past' ? past.length : t.id === 'confirmed' ? confirmed.length : planned.length }))}
          active={activeTab}
          onChange={id => setActiveTab(id as TabKey)}
        />
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <GhStat label="Trips" value={stats.trips} hint={`${stats.ahead} ahead`} tone="lilac" />
        <GhStat label="Days away" value={stats.days} tone="teal" />
        <GhStat label="Places" value={stats.places} tone="sun" />
        <GhStat label="Coming up" value={stats.ahead} tone="coral" />
      </div>

      <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
        <label className="relative lg:flex-1 lg:min-w-[14rem] min-w-0">
          <span className="sr-only">Search trips</span>
          <MagnifyingGlass className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-sunset-ink/60 dark:text-white/60 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by trip or place"
            className="w-full min-h-[44px] pl-11 pr-4 rounded-full bg-white dark:bg-sunset-plum text-sunset-ink dark:text-white placeholder:text-sunset-ink/50 dark:placeholder:text-white/50 text-sm font-medium shadow-card focus:outline-none focus:ring-2 focus:ring-sunset-coral"
          />
        </label>
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 px-1 -mx-1 min-w-0">
          {['all', ...years].map(y => (
            <button
              key={y}
              type="button"
              onClick={() => setSelectedYear(y)}
              aria-pressed={selectedYear === y}
              className={`min-h-[44px] px-4 rounded-full text-sm font-semibold whitespace-nowrap cursor-pointer ${selectedYear === y ? 'bg-sunset-coral text-white shadow-card ring-2 ring-sunset-coral ring-offset-2 ring-offset-sunset-cream dark:ring-offset-sunset-night' : 'bg-white dark:bg-sunset-dusk text-sunset-ink dark:text-white shadow-card'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-coral`}
            >
              {y === 'all' ? 'Any year' : y}
            </button>
          ))}
          <GhButton variant="soft" pressed={showArchived} onClick={() => { setShowArchived(v => !v); setSelectedIds(new Set()); }} icon={<Archive className="w-4 h-4" />} label="Show archived trips">
            {showArchived ? 'Back to trips' : 'Archived'}
          </GhButton>
          <GhButton variant="soft" pressed={selecting} onClick={() => { setSelecting(v => !v); setSelectedIds(new Set()); }}>
            {selecting ? 'Done' : 'Select'}
          </GhButton>
        </div>
      </div>

      {selecting && selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-full bg-sunset-ink text-white px-4 py-2 self-start">
          <span className="text-sm font-semibold">{selectedIds.size} selected</span>
          <GhButton onClick={bulkArchive} icon={<Archive className="w-4 h-4" />}>{showArchived ? 'Restore' : 'Archive'}</GhButton>
          <button type="button" aria-label="Clear selection" onClick={() => setSelectedIds(new Set())} className="min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {nothing ? (
        <GhEmpty
          title={showArchived ? 'Nothing archived' : 'Your next adventure starts here'}
          hint={showArchived ? undefined : 'Add a trip and it lands on this board.'}
          action={!showArchived && <GhButton onClick={() => openNewTrip()} icon={<Plus className="w-4 h-4" />}>New trip</GhButton>}
        />
      ) : (
        <div className="flex flex-col gap-8">
          {show('confirmed') && confirmed.length > 0 && <Section title="Booked" count={confirmed.length} tone="coral">{renderGroup(confirmed, 0)}</Section>}
          {show('planned') && planned.length > 0 && <Section title="Dreaming" count={planned.length} tone="sun">{renderGroup(planned, 1)}</Section>}
          {show('past') && past.length > 0 && <Section title="Been there" count={past.length} tone="teal">{renderGroup(past, 2)}</Section>}
        </div>
      )}
    </GhPage>
  );
};
