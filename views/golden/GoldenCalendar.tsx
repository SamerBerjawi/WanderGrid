import React, { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { CalendarBlank, CaretLeft, CaretRight, Airplane, Star } from '@/components/ui/hugeicons';
import { dataService } from '../../services/mockDb';
import { useWanderSync } from '../../hooks/useWanderSync';
import { formatDate, formatDateRange } from '../../utils/formatters';
import { GhButton, GhCard, GhChip, GhEmpty, GhPage, GhStat, type GhTone } from '../../components/golden/Gh';
import type { GoldenViewProps } from './registry';

/** Golden Hour Calendar: a warm month grid with trip ribbons and chunky leave tiles. */

const RIBBON: Record<string, string> = {
  coral: 'bg-sunset-orange text-white',
  sun: 'bg-sunset-sun text-sunset-ink',
  teal: 'bg-sunset-teal text-sunset-ink',
  lilac: 'bg-sunset-lilac text-sunset-ink',
  sand: 'bg-sunset-dusk text-white',
};
const ROTATION = ['coral', 'teal', 'sun', 'lilac'];
const ENT_TONE: Record<string, string> = {
  blue: 'teal', green: 'teal', cyan: 'teal', teal: 'teal',
  amber: 'sun', red: 'coral', purple: 'lilac', indigo: 'lilac', pink: 'lilac', gray: 'sand',
};
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MAX_LANES = 3;
const DAY_MS = 86400000;

const parseDay = (s: string) => {
  const [y, m, d] = (s || '').split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : new Date(NaN);
};
const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

interface Ribbon { id: string; name: string; tone: string; start: number; end: number; startsHere: boolean; endsHere: boolean; lane: number }

export const GoldenCalendar: React.FC<GoldenViewProps> = ({ onTripClick }) => {
  const { data: rawTrips, loading } = useWanderSync('trips', () => dataService.getTrips(), [], { collections: ['trips'] });
  const { data: users } = useWanderSync('users', () => dataService.getUsers(), [], { collections: ['users'] });
  const { data: entitlements } = useWanderSync('entitlements', () => dataService.getEntitlementTypes(), [], { collections: ['entitlements'] });
  const { data: savedConfigs } = useWanderSync('configs', () => dataService.getSavedConfigs(), [], { collections: ['configs'] });
  const { data: customEvents } = useWanderSync('events', () => dataService.getCustomEvents(), [], { collections: ['events'] });
  const { data: settings } = useWanderSync('settings', () => dataService.getWorkspaceSettings(), [], { collections: ['settings'] });

  const [cursor, setCursor] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [entFilter, setEntFilter] = useState('all');
  const [selectedDay, setSelectedDay] = useState<Date | null>(() => new Date());

  useEffect(() => {
    if (users && users.length > 0 && selectedUsers.size === 0) setSelectedUsers(new Set(users.map(u => u.id)));
  }, [users]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const today = new Date();

  const toggleUser = (id: string) => {
    const next = new Set(selectedUsers);
    if (next.has(id)) { if (next.size > 1) next.delete(id); } else next.add(id);
    setSelectedUsers(next);
  };

  const toneFor = (trip: { id: string; entitlementId?: string }) => {
    const ent = trip.entitlementId ? entitlements?.find(e => e.id === trip.entitlementId) : undefined;
    return ent ? (ENT_TONE[ent.color] || 'sun') : ROTATION[hash(trip.id) % ROTATION.length];
  };

  const trips = useMemo(() => (rawTrips || []).filter(t => !(t as any).isBundleOnly && !(t as any).hideInPlanner && !t.archived), [rawTrips]);
  const publicHolidays = useMemo(() => (savedConfigs || []).flatMap(c => c.holidays.map(h => ({ ...h, configId: c.id }))), [savedConfigs]);
  const showExtras = entFilter === 'all';

  const filteredTrips = useMemo(() => trips.filter(t => {
    if (!t.participants?.some(uid => selectedUsers.has(uid))) return false;
    return entFilter === 'all' || t.entitlementId === entFilter;
  }), [trips, selectedUsers, entFilter]);

  // Leave tiles, summed over the people in view
  const leave = useMemo(() => {
    const people = (users || []).filter(u => selectedUsers.has(u.id));
    const allowance = people.reduce((s, u) => s + (u.allowance || 0), 0);
    const taken = people.reduce((s, u) => s + (u.takenLeave || 0), 0);
    const planned = people.reduce((sum, u) => sum + trips
      .filter(t => t.participants?.includes(u.id) && !!t.entitlementId && parseDay(t.startDate).getFullYear() === year)
      .reduce((a, t) => {
        const d = Math.round((parseDay(t.endDate).getTime() - parseDay(t.startDate).getTime()) / DAY_MS) + 1;
        return a + (isNaN(d) ? 0 : d);
      }, 0), 0);
    const left = Math.max(0, allowance - taken - planned);
    const used = allowance > 0 ? Math.min(100, Math.round(((taken + planned) / allowance) * 100)) : 0;
    return { people: people.length, allowance, taken, planned, left, used };
  }, [users, selectedUsers, trips, year]);

  // Month → weeks of 7 cells (null padding), each with packed ribbon lanes
  const weeks = useMemo(() => {
    const first = new Date(year, month, 1);
    const count = new Date(year, month + 1, 0).getDate();
    const cells: (Date | null)[] = [...Array(first.getDay()).fill(null), ...Array.from({ length: count }, (_, i) => new Date(year, month, i + 1))];
    while (cells.length % 7) cells.push(null);
    const spans = filteredTrips
      .map(t => ({ t, s: parseDay(t.startDate), e: parseDay(t.endDate) }))
      .filter(x => !isNaN(x.s.getTime()) && !isNaN(x.e.getTime()))
      .sort((a, b) => a.s.getTime() - b.s.getTime() || b.e.getTime() - a.e.getTime());

    const out: { days: (Date | null)[]; ribbons: Ribbon[]; hidden: number[] }[] = [];
    for (let w = 0; w < cells.length; w += 7) {
      const days = cells.slice(w, w + 7);
      const real = days.filter((d): d is Date => !!d);
      const wStart = real[0].getTime();
      const wEnd = real[real.length - 1].getTime();
      const lanes: number[][] = [];
      const ribbons: Ribbon[] = [];
      const hidden = [0, 0, 0, 0, 0, 0, 0];
      spans.forEach(({ t, s, e }) => {
        if (e.getTime() < wStart || s.getTime() > wEnd) return;
        const cs = days.findIndex(d => d && d.getTime() >= s.getTime());
        const rev = [...days].reverse().findIndex(d => d && d.getTime() <= e.getTime());
        const ce = rev === -1 ? -1 : 6 - rev;
        if (cs === -1 || ce === -1 || ce < cs) return;
        let lane = lanes.findIndex(l => l.every(c => c < cs || c > ce) || !l.some(c => c >= cs && c <= ce));
        if (lane === -1) { lanes.push([]); lane = lanes.length - 1; }
        for (let c = cs; c <= ce; c++) lanes[lane].push(c);
        if (lane >= MAX_LANES) { for (let c = cs; c <= ce; c++) hidden[c]++; return; }
        ribbons.push({
          id: t.id, name: t.name, tone: toneFor(t), start: cs, end: ce, lane,
          startsHere: s.getTime() >= wStart, endsHere: e.getTime() <= wEnd,
        });
      });
      out.push({ days, ribbons, hidden });
    }
    return out;
  }, [year, month, filteredTrips, entitlements]);

  // Holidays and events by day key
  const marks = useMemo(() => {
    const map = new Map<string, { kind: 'holiday' | 'event'; name: string }[]>();
    if (!showExtras) return map;
    const add = (date: string, kind: 'holiday' | 'event', name: string) => {
      const d = parseDay(date);
      if (isNaN(d.getTime())) return;
      const k = dayKey(d);
      map.set(k, [...(map.get(k) || []), { kind, name }]);
    };
    publicHolidays.forEach(h => add(h.date, 'holiday', h.name));
    (customEvents || []).forEach(e => add(e.date, 'event', e.name));
    return map;
  }, [publicHolidays, customEvents, showExtras]);

  const upcoming = useMemo(() => {
    const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return filteredTrips
      .map(t => ({ t, s: parseDay(t.startDate), e: parseDay(t.endDate) }))
      .filter(x => !isNaN(x.e.getTime()) && x.e >= now)
      .sort((a, b) => a.s.getTime() - b.s.getTime())
      .slice(0, 4)
      .map(x => ({ ...x, away: x.s <= now, days: Math.max(0, Math.ceil((x.s.getTime() - now.getTime()) / DAY_MS)) }));
  }, [filteredTrips]);

  const dayItems = useMemo(() => {
    if (!selectedDay) return { trips: [], marks: [] };
    const t = selectedDay.getTime();
    return {
      trips: filteredTrips.filter(x => parseDay(x.startDate).getTime() <= t && parseDay(x.endDate).getTime() >= t),
      marks: marks.get(dayKey(selectedDay)) || [],
    };
  }, [selectedDay, filteredTrips, marks]);

  const chip = (active: boolean) => clsx(
    'min-h-[44px] px-4 rounded-full text-sm font-semibold cursor-pointer transition-colors whitespace-nowrap',
    active ? 'bg-sunset-coral text-white shadow-card' : 'bg-sunset-sand dark:bg-sunset-dusk text-sunset-ink dark:text-white'
  );
  const iconBtn = 'min-h-[44px] min-w-[44px] rounded-full inline-flex items-center justify-center bg-sunset-sand dark:bg-sunset-dusk text-sunset-ink dark:text-white cursor-pointer active:scale-95 transition-transform';

  const controls = (
    <div className="flex items-center gap-2">
      <button type="button" aria-label="Previous month" className={iconBtn} onClick={() => setCursor(new Date(year, month - 1, 1))}><CaretLeft size={20} /></button>
      <div className="min-w-[9rem] text-center text-lg sm:text-xl font-black text-sunset-ink dark:text-white">{formatDate(cursor, 'month-year', settings)}</div>
      <button type="button" aria-label="Next month" className={iconBtn} onClick={() => setCursor(new Date(year, month + 1, 1))}><CaretRight size={20} /></button>
    </div>
  );

  return (
    <GhPage
      title="Calendar"
      icon={<CalendarBlank size={32} weight="duotone" />}
      action={<GhButton onClick={() => { setCursor(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedDay(today); }}>Today</GhButton>}
      controls={controls}
    >
      {/* Leave tiles */}
      <section aria-label="Leave balance" className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <GhStat tone="teal" label="Days left" value={leave.left} hint={`of ${leave.allowance} this year`} />
        <GhStat tone="sun" label="Planned" value={leave.planned} hint="booked leave days" />
        <GhStat tone="lilac" label="Taken" value={leave.taken} hint="already enjoyed" />
        <div className="rounded-3xl p-4 bg-sunset-orange text-white">
          <div className="text-xs font-semibold uppercase tracking-wider opacity-90">Allowance used</div>
          <div className="text-3xl font-black tracking-tight mt-1">{leave.used}%</div>
          <div className="mt-2 h-3 rounded-full bg-white/30 overflow-hidden" role="progressbar" aria-valuenow={leave.used} aria-valuemin={0} aria-valuemax={100} aria-label="Allowance used">
            <div className="h-full rounded-full bg-white" style={{ width: `${leave.used}%` }} />
          </div>
        </div>
      </section>

      {/* Filters */}
      <section aria-label="Filters" className="flex flex-col gap-3">
        {users && users.length > 1 && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-2 px-2 sm:mx-0 sm:px-0">
            {users.map(u => (
              <button key={u.id} type="button" aria-pressed={selectedUsers.has(u.id)} onClick={() => toggleUser(u.id)} className={chip(selectedUsers.has(u.id))}>{u.name.split(' ')[0]}</button>
            ))}
          </div>
        )}
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-2 px-2 sm:mx-0 sm:px-0">
          <button type="button" aria-pressed={entFilter === 'all'} onClick={() => setEntFilter('all')} className={chip(entFilter === 'all')}>Everything</button>
          {(entitlements || []).map(e => (
            <button key={e.id} type="button" aria-pressed={entFilter === e.id} onClick={() => setEntFilter(e.id)} className={chip(entFilter === e.id)}>
              <span className={clsx('inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle', RIBBON[ENT_TONE[e.color] || 'sun'].split(' ')[0])} />
              {e.name}
            </button>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_22rem] gap-5 sm:gap-6 items-start">
        {/* Month grid */}
        <GhCard className="!p-2 sm:!p-4">
          <div className="grid grid-cols-7 mb-1" aria-hidden="true">
            {WEEKDAYS.map((d, i) => <div key={i} className="text-center text-xs font-bold uppercase text-sunset-ink/60 dark:text-white/60 py-1">{d}</div>)}
          </div>
          {loading && !rawTrips?.length ? (
            <div className="h-64 rounded-2xl bg-sunset-sand dark:bg-sunset-dusk animate-pulse" />
          ) : (
            <div className="flex flex-col gap-1">
              {weeks.map((w, wi) => (
                <div key={wi} className="rounded-2xl bg-sunset-cream dark:bg-sunset-night p-1">
                  <div className="grid grid-cols-7">
                    {w.days.map((d, i) => {
                      if (!d) return <div key={i} className="min-h-[44px]" />;
                      const isToday = dayKey(d) === dayKey(today);
                      const isSel = selectedDay && dayKey(d) === dayKey(selectedDay);
                      const m = marks.get(dayKey(d));
                      return (
                        <button
                          key={i}
                          type="button"
                          aria-label={formatDate(d, 'weekday-long', settings)}
                          onClick={() => setSelectedDay(d)}
                          className={clsx(
                            'min-h-[44px] rounded-xl flex flex-col items-center justify-start pt-1 cursor-pointer transition-colors',
                            isSel ? 'bg-sunset-sand dark:bg-sunset-dusk' : 'hover:bg-sunset-sand/60 dark:hover:bg-sunset-dusk/60'
                          )}
                        >
                          <span className={clsx(
                            'w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold',
                            isToday ? 'bg-sunset-coral text-white' : 'text-sunset-ink dark:text-white'
                          )}>{d.getDate()}</span>
                          <span className="h-2 flex items-center gap-0.5 mt-0.5">
                            {m?.some(x => x.kind === 'holiday') && <span className="w-1.5 h-1.5 rounded-full bg-sunset-sun" />}
                            {m?.some(x => x.kind === 'event') && <span className="w-1.5 h-1.5 rounded-full bg-sunset-lilac" />}
                            {w.hidden[i] > 0 && <span className="text-2xs font-black leading-none text-sunset-coral">+{w.hidden[i]}</span>}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-7 gap-y-1 mt-1 pb-1" style={{ gridTemplateRows: `repeat(${Math.max(1, Math.min(MAX_LANES, Math.max(0, ...w.ribbons.map(r => r.lane + 1))))}, 1.5rem)` }}>
                    {w.ribbons.map(r => (
                      <button
                        key={`${r.id}-${wi}`}
                        type="button"
                        onClick={() => onTripClick?.(r.id)}
                        aria-label={`Open ${r.name}`}
                        style={{ gridColumn: `${r.start + 1} / ${r.end + 2}`, gridRow: r.lane + 1 }}
                        className={clsx(
                          'h-6 px-2 text-2xs font-bold truncate text-left cursor-pointer hover:brightness-105',
                          RIBBON[r.tone],
                          r.startsHere ? 'rounded-l-full ml-0.5' : '',
                          r.endsHere ? 'rounded-r-full mr-0.5' : ''
                        )}
                      >
                        {r.startsHere || r.start === 0 ? r.name : ' '}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </GhCard>

        <div className="flex flex-col gap-5">
          {/* Selected day */}
          <GhCard tone="sun">
            <div className="text-xs font-semibold uppercase tracking-wider opacity-80">{selectedDay ? formatDate(selectedDay, 'weekday-long', settings) : 'Pick a day'}</div>
            {dayItems.trips.length === 0 && dayItems.marks.length === 0 ? (
              <div className="text-xl font-black mt-1">Nothing planned. Wide open.</div>
            ) : (
              <ul className="mt-2 flex flex-col gap-2">
                {dayItems.marks.map((m, i) => (
                  <li key={i} className="flex items-center gap-2 text-base font-black"><Star size={18} />{m.name}<span className="text-xs font-semibold opacity-70">{m.kind === 'holiday' ? 'Holiday' : 'Event'}</span></li>
                ))}
                {dayItems.trips.map(t => (
                  <li key={t.id}>
                    <button type="button" onClick={() => onTripClick?.(t.id)} className="min-h-[44px] w-full flex items-center gap-2 text-left text-base font-black cursor-pointer">
                      <Airplane size={18} /><span className="truncate">{t.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </GhCard>

          {/* Coming up */}
          <section aria-label="Coming up" className="flex flex-col gap-3">
            <h2 className="text-2xl font-black text-sunset-ink dark:text-white">Coming up</h2>
            {upcoming.length === 0 ? (
              <GhEmpty title="Where next?" hint="No trips on the horizon yet." />
            ) : upcoming.map(({ t, s, e, away, days }) => (
              <GhCard key={t.id} onClick={() => onTripClick?.(t.id)} label={`Open ${t.name}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-lg font-black truncate">{t.icon ? `${t.icon} ` : ''}{t.name}</div>
                    <div className="text-sm opacity-70">{formatDateRange(s, e, settings)}</div>
                  </div>
                  <GhChip tone={away ? 'teal' : (RIBBON[toneFor(t)].includes('orange') ? 'coral' : (toneFor(t) as GhTone))}>
                    {away ? 'Away now' : days === 0 ? 'Today' : `${days}d`}
                  </GhChip>
                </div>
              </GhCard>
            ))}
          </section>
        </div>
      </div>
    </GhPage>
  );
};
