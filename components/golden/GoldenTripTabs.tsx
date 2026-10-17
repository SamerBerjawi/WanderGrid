import React, { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import {
  AirplaneTakeoff, ArrowRight, Backpack, Buildings, CaretLeft, CaretRight, Compass, Globe, Moon, MapPin, PencilSimple, Plus, Trash, UploadSimple,
} from '@/components/ui/hugeicons';
import { DepartureBoard, BoardItem } from '../DepartureBoard';
import { VirtualListItem } from '../ui/VirtualListItem';
import { Accommodation, Activity, Transport, Trip, WorkspaceSettings } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { formatProperLocationName } from '../../services/geocoding';
import { GhButton, GhCard, GhChip, GhEmpty, GhStat, GhTabs, GhTone } from './Gh';
import {
  CarrierLogo, DayItem, KIND_STYLE, TripIcon, calculateDuration, calculateNights, compareTransports, formatTime, getDayItems, todayString,
} from './tripUtils';

const DAY_TONES: GhTone[] = ['coral', 'sun', 'teal', 'lilac'];
const DAY_BAND: Record<string, string> = {
  coral: 'bg-sunset-orange text-white', sun: 'bg-sunset-sun text-sunset-ink', teal: 'bg-sunset-teal text-sunset-ink', lilac: 'bg-sunset-lilac text-sunset-ink',
};

const MUTED = 'text-sunset-ink/70 dark:text-white/70';

interface PlanHandlers {
  onEditTransports: (transports: Transport[]) => void;
  onEditStay: () => void;
  onOpenActivity: (dateStr: string, activity?: Activity) => void;
  onDeleteActivity: (id: string) => void;
}

const openItem = (item: DayItem, dateStr: string, h: PlanHandlers) => {
  if (item.type === 'Transport') h.onEditTransports([item.ref as Transport]);
  else if (item.type === 'Accommodation') h.onEditStay();
  else h.onOpenActivity(dateStr, item.ref as Activity);
};

const DayCard: React.FC<{ trip: Trip; dateStr: string; index: number; settings: WorkspaceSettings | null; isToday: boolean } & PlanHandlers> = ({
  trip, dateStr, index, settings, isToday, ...h
}) => {
  const items = getDayItems(trip, dateStr);
  const place = trip.locations?.find(l => dateStr >= l.startDate && dateStr <= l.endDate);
  const band = DAY_BAND[DAY_TONES[index % DAY_TONES.length]];
  return (
    <GhCard className={clsx('!p-0 overflow-hidden', isToday && 'ring-4 ring-sunset-coral')}>
      <div className={clsx('p-4 sm:p-5 flex items-center gap-4', band)}>
        <div className="w-16 h-16 rounded-2xl bg-white text-sunset-ink flex flex-col items-center justify-center shrink-0">
          <span className="text-2xs font-bold uppercase tracking-wider leading-none">{formatDate(dateStr, 'month-short', settings)}</span>
          <span className="text-2xl font-black leading-none mt-0.5">{Number(dateStr.slice(8, 10))}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-xl sm:text-2xl font-black tracking-tight">Day {index + 1}</h3>
            {isToday && <GhChip tone="ink">Today</GhChip>}
          </div>
          <p className="text-sm font-semibold opacity-90 truncate">{formatDate(dateStr, 'weekday-short', settings)}{place ? ` · ${place.name}` : ''}</p>
        </div>
        <GhButton variant="soft" onClick={() => h.onOpenActivity(dateStr)} icon={<Plus className="w-4 h-4" />} label={`Add item to Day ${index + 1}`}>
          <span className="hidden sm:inline">Add</span>
        </GhButton>
      </div>
      <div className="p-3 sm:p-4 flex flex-col gap-2">
        {items.length === 0 ? (
          <div className="rounded-2xl bg-sunset-sand dark:bg-sunset-dusk p-5 text-center">
            <p className="font-bold">Nothing planned yet</p>
            <p className={clsx('text-sm', MUTED)}>A free day. Lovely.</p>
          </div>
        ) : items.map(item => (
          <div key={item.id} className="flex items-center rounded-2xl bg-sunset-sand dark:bg-sunset-dusk">
            <button type="button" onClick={() => openItem(item, dateStr, h)} className="flex-1 min-w-0 min-h-[56px] flex items-center gap-3 p-2 text-left cursor-pointer">
              <span className={clsx('w-11 h-11 rounded-2xl flex items-center justify-center shrink-0', KIND_STYLE[item.type])}><TripIcon name={item.icon} className="w-5 h-5" /></span>
              <span className="flex-1 min-w-0">
                <span className="flex items-baseline gap-2">
                  {!item.isOvernight && <span className="text-xs font-black whitespace-nowrap">{formatTime(item.time)}</span>}
                  <span className="font-bold text-sm truncate">{item.title}</span>
                </span>
                {(item.meta || item.location) && (
                  <span className={clsx('block text-xs font-medium truncate', MUTED)}>
                    {item.meta}{item.meta && item.location ? ' · ' : ''}{item.location}
                  </span>
                )}
              </span>
              {item.cost ? <span className="text-sm font-black whitespace-nowrap pr-1">{formatCurrency(item.cost)}</span> : null}
            </button>
            <button type="button" onClick={() => openItem(item, dateStr, h)} aria-label={`Edit ${item.title}`} className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full cursor-pointer opacity-70 hover:opacity-100">
              <PencilSimple className="w-4 h-4" />
            </button>
            {item.type !== 'Transport' && item.type !== 'Accommodation' && (
              <button type="button" onClick={() => h.onDeleteActivity((item.ref as Activity).id)} aria-label={`Delete ${item.title}`} className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full cursor-pointer opacity-70 hover:opacity-100">
                <Trash className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    </GhCard>
  );
};

const MonthView: React.FC<{ trip: Trip; settings: WorkspaceSettings | null } & PlanHandlers> = ({ trip, ...h }) => {
  const [cursor, setCursor] = useState(() => new Date(trip.startDate));
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const lead = new Date(year, month, 1).getDay() === 0 ? 6 : new Date(year, month, 1).getDay() - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = todayString();
  const move = (dir: number) => { const d = new Date(cursor); d.setMonth(d.getMonth() + dir); setCursor(d); };

  const cells: React.ReactNode[] = [];
  for (let i = 0; i < lead; i++) cells.push(<div key={`e${i}`} />);
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const inTrip = dateStr >= trip.startDate && dateStr <= trip.endDate;
    const items = getDayItems(trip, dateStr).filter(i => !i.isOvernight);
    cells.push(
      <div key={d} className={clsx('rounded-2xl p-1 sm:p-2 min-h-[4.5rem] sm:min-h-[7rem] flex flex-col gap-1', inTrip ? 'bg-sunset-sand dark:bg-sunset-dusk' : 'opacity-50', dateStr === today && 'ring-4 ring-sunset-coral')}>
        {inTrip ? (
          <button type="button" onClick={() => h.onOpenActivity(dateStr)} aria-label={`Add item to ${dateStr}`} className="min-h-[28px] sm:min-h-[32px] flex items-center justify-between px-1 text-sm font-black cursor-pointer">
            <span>{d}</span><Plus className="w-3.5 h-3.5 opacity-60" />
          </button>
        ) : <span className="px-1 text-sm font-black">{d}</span>}
        <div className="hidden sm:flex flex-col gap-1">
          {items.slice(0, 3).map(item => (
            <button key={item.id} type="button" onClick={() => openItem(item, dateStr, h)} className={clsx('rounded-full px-2 py-1 text-2xs font-bold truncate text-left cursor-pointer', KIND_STYLE[item.type])}>
              {formatTime(item.time)} {item.title}
            </button>
          ))}
          {items.length > 3 && <span className={clsx('text-2xs font-bold px-1', MUTED)}>+{items.length - 3} more</span>}
        </div>
        <div className="flex sm:hidden flex-wrap gap-1 px-1">
          {items.slice(0, 4).map(item => <span key={item.id} className={clsx('w-2.5 h-2.5 rounded-full', KIND_STYLE[item.type])} />)}
        </div>
      </div>
    );
  }
  return (
    <GhCard className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => move(-1)} aria-label="Previous month" className="w-11 h-11 rounded-full bg-sunset-sand dark:bg-sunset-dusk flex items-center justify-center cursor-pointer"><CaretLeft className="w-4 h-4" /></button>
        <div className="text-center">
          <h3 className="text-xl font-black">{cursor.toLocaleString('default', { month: 'long', year: 'numeric' })}</h3>
          <button type="button" onClick={() => setCursor(new Date(trip.startDate))} className="min-h-[44px] text-xs font-bold text-sunset-coral cursor-pointer">Back to trip start</button>
        </div>
        <button type="button" onClick={() => move(1)} aria-label="Next month" className="w-11 h-11 rounded-full bg-sunset-sand dark:bg-sunset-dusk flex items-center justify-center cursor-pointer"><CaretRight className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-2 text-center text-2xs font-bold uppercase tracking-wider opacity-70">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-2">{cells}</div>
    </GhCard>
  );
};

export const DaysTab: React.FC<{ trip: Trip; tripDates: string[]; settings: WorkspaceSettings | null } & PlanHandlers> = ({ trip, tripDates, settings, ...h }) => {
  const [view, setView] = useState<'days' | 'month'>('days');
  const today = todayString();
  return (
    <div className="flex flex-col gap-4 animate-fadeIn">
      <div className="flex justify-center sm:justify-start">
        <GhTabs tabs={[{ id: 'days', label: 'Day by day' }, { id: 'month', label: 'Month' }]} active={view} onChange={id => setView(id as 'days' | 'month')} />
      </div>
      {view === 'month' ? <MonthView trip={trip} settings={settings} {...h} /> : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
          {tripDates.map((dateStr, i) => (
            <VirtualListItem key={dateStr} minHeight={160}>
              <DayCard trip={trip} dateStr={dateStr} index={i} settings={settings} isToday={dateStr === today} {...h} />
            </VirtualListItem>
          ))}
        </div>
      )}
    </div>
  );
};

/* ───────────────────────── Bookings ───────────────────────── */

const Chip: React.FC<{ children: React.ReactNode; tone?: GhTone | 'plain' }> = ({ children, tone = 'plain' }) => (
  <GhChip tone={tone} className={tone === 'plain' ? '!bg-sunset-sand dark:!bg-sunset-dusk !text-sunset-ink dark:!text-white' : ''}>{children}</GhChip>
);

const LegRow: React.FC<{ t: Transport; previous?: Transport; settings: WorkspaceSettings | null }> = ({ t, previous, settings }) => (
  <div className="flex flex-col gap-3">
    {previous && (
      <div className="flex justify-center">
        <Chip tone="lilac">Return · {Math.ceil((new Date(t.departureDate).getTime() - new Date(previous.arrivalDate).getTime()) / 86_400_000)} days later</Chip>
      </div>
    )}
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
      <div className="min-w-0">
        <p className="text-2xs font-bold uppercase tracking-wider opacity-70">Leaves</p>
        <p className="text-lg sm:text-xl font-black leading-tight break-words">{formatProperLocationName(t.origin)}</p>
        <p className={clsx('text-xs font-semibold', MUTED)}>
          {formatTime(t.departureTime)} · {formatDate(t.departureDate, 'weekday-short', settings)}
          {t.departureTerminal && ` · Term ${t.departureTerminal}`}{t.departureGate && ` · Gate ${t.departureGate}`}
        </p>
      </div>
      <div className="flex flex-col items-center gap-1 shrink-0">
        <span className="text-2xs font-bold">{calculateDuration(t)}</span>
        <span className="w-9 h-9 rounded-full bg-sunset-teal text-sunset-ink flex items-center justify-center"><ArrowRight className="w-4 h-4" /></span>
      </div>
      <div className="min-w-0 text-right">
        <p className="text-2xs font-bold uppercase tracking-wider opacity-70">Arrives</p>
        <p className="text-lg sm:text-xl font-black leading-tight break-words">{formatProperLocationName(t.destination)}</p>
        <p className={clsx('text-xs font-semibold', MUTED)}>
          {formatTime(t.arrivalTime)} · {formatDate(t.arrivalDate, 'weekday-short', settings)}
          {t.arrivalTerminal && ` · Term ${t.arrivalTerminal}`}{t.arrivalGate && ` · Gate ${t.arrivalGate}`}
        </p>
      </div>
    </div>
    {(t.travelClass || t.seatNumber || t.vehicleModel || t.pickupLocation) && (
      <div className="flex flex-wrap gap-2">
        {t.travelClass && <Chip>{t.travelClass}</Chip>}
        {t.seatNumber && <Chip tone="sun">Seat {t.seatNumber}{t.seatType && ` (${t.seatType})`}{t.isExitRow && ' · Exit row'}</Chip>}
        {t.vehicleModel && <Chip tone="teal">{t.vehicleModel}</Chip>}
        {t.pickupLocation && <Chip>Pickup: {formatProperLocationName(t.pickupLocation)}</Chip>}
      </div>
    )}
    {t.waypoints && t.waypoints.length > 0 && (
      <div className="flex flex-col gap-2">
        <span className="text-2xs font-bold uppercase tracking-wider opacity-70 flex items-center gap-1.5"><Compass className="w-3.5 h-3.5" /> Pit stops ({t.waypoints.length})</span>
        <div className="flex flex-wrap gap-2">
          {t.waypoints.map((wp, i) => (
            <Chip key={wp.id || i} tone="sun">
              {i + 1}. {wp.name}{wp.type && wp.type !== 'Stop' ? ` · ${wp.type}` : ''}{wp.addToVisited !== false ? ' ✓' : ''}
            </Chip>
          ))}
        </div>
      </div>
    )}
  </div>
);

const SectionHead: React.FC<{ title: string; hint: string; actions: React.ReactNode }> = ({ title, hint, actions }) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
    <div>
      <h2 className="text-2xl sm:text-3xl font-black tracking-tight">{title}</h2>
      <p className={clsx('text-sm font-medium', MUTED)}>{hint}</p>
    </div>
    <div className="flex flex-wrap gap-2">{actions}</div>
  </div>
);

export const BookingsTab: React.FC<{
  trip: Trip; settings: WorkspaceSettings | null;
  onEditTransports: (transports?: Transport[]) => void; onEditStay: () => void; onImport: () => void;
}> = ({ trip, settings, onEditTransports, onEditStay, onImport }) => {
  // Personal Car is a personal road trip, not a booking.
  const bookings = useMemo(() => (trip.transports || []).filter(t => t.mode !== 'Personal Car'), [trip.transports]);
  const groups = useMemo(() => {
    const map: Record<string, Transport[]> = {};
    [...bookings].sort(compareTransports).forEach(t => { (map[t.itineraryId || 'misc'] ||= []).push(t); });
    return Object.entries(map).sort((a, b) => (a[1][0] && b[1][0] ? compareTransports(a[1][0], b[1][0]) : 0));
  }, [bookings]);
  const boardItems: BoardItem[] = useMemo(() => bookings.map(flight => ({ flight, trip: { name: trip.name } })), [bookings, trip.name]);
  const stays = useMemo(() => [...(trip.accommodations || [])].sort((a, b) => `${a.checkInDate || '1970-01-01'}${a.checkInTime || '00:00'}`.localeCompare(`${b.checkInDate || '1970-01-01'}${b.checkInTime || '00:00'}`)), [trip.accommodations]);

  return (
    <div className="flex flex-col gap-8 animate-fadeIn">
      <section className="flex flex-col gap-4">
        <SectionHead
          title="Getting there"
          hint="Flights, trains, ferries and rental cars"
          actions={<>
            <GhButton variant="soft" onClick={onImport} icon={<UploadSimple className="w-4 h-4" />}>Import</GhButton>
            <GhButton onClick={() => onEditTransports()} icon={<Plus className="w-4 h-4" />}>Add booking</GhButton>
          </>}
        />
        {groups.length === 0 ? (
          <GhEmpty title="No journeys yet" hint="Add a flight, train or rental to see your departure board." action={<GhButton onClick={() => onEditTransports()} icon={<Plus className="w-4 h-4" />}>Add booking</GhButton>} />
        ) : (
          <>
            <DepartureBoard
              items={boardItems}
              onSelect={item => {
                const group = groups.find(([, g]) => g.some(t => t.id === item.flight.id));
                onEditTransports(group ? group[1] : [item.flight]);
              }}
            />
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
              {groups.map(([id, group]) => {
                const first = group[0];
                return (
                  <VirtualListItem key={id} minHeight={180}>
                    <GhCard className="flex flex-col gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-sunset-teal text-sunset-ink flex items-center justify-center overflow-hidden shrink-0 p-1.5">
                          {first.mode === 'Flight' ? (
                            <CarrierLogo provider={first.provider} brandfetchApiKey={settings?.brandfetchApiKey} carriers={settings?.carriers} fallback={<AirplaneTakeoff className="w-6 h-6" weight="duotone" />} />
                          ) : first.logoUrl ? (
                            <img referrerPolicy="no-referrer" src={first.logoUrl} alt="" className="w-full h-full object-contain" />
                          ) : <TripIcon name={first.mode} className="w-6 h-6" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-black leading-tight truncate">{first.provider}</h3>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            <Chip>{first.identifier || 'No ID'}</Chip>
                            <Chip>{first.type}</Chip>
                            {first.confirmationCode && <Chip tone="sun">CONF {first.confirmationCode}</Chip>}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-xl font-black">{formatCurrency(group.reduce((acc, t) => acc + (t.cost || 0), 0))}</div>
                          <button type="button" onClick={() => onEditTransports(group)} aria-label="Edit transport details" className="min-h-[44px] px-2 text-xs font-bold text-sunset-coral inline-flex items-center gap-1 cursor-pointer">
                            <PencilSimple className="w-3.5 h-3.5" /> Edit
                          </button>
                        </div>
                      </div>
                      {group.map((t, idx) => <LegRow key={t.id} t={t} previous={idx > 0 ? group[idx - 1] : undefined} settings={settings} />)}
                    </GhCard>
                  </VirtualListItem>
                );
              })}
            </div>
          </>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <SectionHead title="Where you'll sleep" hint="Hotels, resorts and rentals" actions={<GhButton variant="soft" onClick={onEditStay} icon={<Plus className="w-4 h-4" />}>Add stay</GhButton>} />
        {stays.length === 0 ? (
          <GhEmpty title="No stays yet" hint="Add a hotel or rental to track check-in and check-out." action={<GhButton variant="soft" onClick={onEditStay} icon={<Buildings className="w-4 h-4" />}>Add stay</GhButton>} />
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
            {stays.map((stay: Accommodation) => {
              const nights = calculateNights(stay.checkInDate, stay.checkOutDate);
              return (
                <VirtualListItem key={stay.id} minHeight={160}>
                  <GhCard className="!p-0 overflow-hidden">
                    <div className="bg-sunset-lilac text-sunset-ink p-4 flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center overflow-hidden shrink-0">
                        {stay.logoUrl ? <img referrerPolicy="no-referrer" src={stay.logoUrl} alt="" className="w-full h-full object-cover" /> : <TripIcon name={stay.type} className="w-6 h-6" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-black leading-tight truncate">{stay.name}</h3>
                        <div className="flex flex-wrap gap-1.5 mt-1"><GhChip>{stay.type}</GhChip>{stay.confirmationCode && <GhChip tone="sun">CONF {stay.confirmationCode}</GhChip>}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xl font-black">{stay.cost ? formatCurrency(stay.cost, settings?.currency) : 'Unpriced'}</div>
                        {stay.cost && nights > 0 ? <div className="text-2xs font-bold opacity-80">{formatCurrency(Math.round(stay.cost / nights), settings?.currency)} / night</div> : null}
                      </div>
                    </div>
                    <div className="p-4 flex flex-col gap-3">
                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                        <div>
                          <p className="text-2xs font-bold uppercase tracking-wider opacity-70">Check-in</p>
                          <p className="font-black">{formatDate(stay.checkInDate, 'weekday-short', settings)}</p>
                          <p className={clsx('text-xs font-semibold', MUTED)}>{stay.checkInTime ? formatTime(stay.checkInTime) : 'From 15:00'}</p>
                        </div>
                        <span className="px-3 py-1.5 rounded-full bg-sunset-sun text-sunset-ink text-xs font-black inline-flex items-center gap-1"><Moon className="w-3.5 h-3.5" weight="fill" />{nights}</span>
                        <div className="text-right">
                          <p className="text-2xs font-bold uppercase tracking-wider opacity-70">Check-out</p>
                          <p className="font-black">{formatDate(stay.checkOutDate, 'weekday-short', settings)}</p>
                          <p className={clsx('text-xs font-semibold', MUTED)}>{stay.checkOutTime ? formatTime(stay.checkOutTime) : 'Until 11:00'}</p>
                        </div>
                      </div>
                      <p className={clsx('text-xs font-semibold flex items-center gap-1.5 min-w-0', MUTED)}><MapPin className="w-3.5 h-3.5 shrink-0" /><span className="truncate select-all">{formatProperLocationName(stay.address)}</span></p>
                      {stay.notes && <p className={clsx('text-xs italic', MUTED)}>{stay.notes}</p>}
                      <div className="flex flex-wrap gap-2">
                        <GhButton variant="soft" onClick={onEditStay} icon={<PencilSimple className="w-4 h-4" />} label="Edit stay details">Edit</GhButton>
                        {stay.website && (
                          <a href={stay.website} target="_blank" rel="noopener noreferrer" className="min-h-[44px] px-5 rounded-full inline-flex items-center gap-2 text-sm font-semibold bg-sunset-sand dark:bg-sunset-dusk">
                            <Globe className="w-4 h-4" /> Website
                          </a>
                        )}
                      </div>
                    </div>
                  </GhCard>
                </VirtualListItem>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

/* ───────────────────────── Budget ───────────────────────── */

export const BudgetTab: React.FC<{ trip: Trip; transportCost: number; stayCost: number; activityCost: number; bookingCount: number; duration: number }> = ({
  trip, transportCost, stayCost, activityCost, bookingCount, duration,
}) => {
  const totalCost = transportCost + stayCost + activityCost;
  const travelers = (trip.participants || []).length;
  const costPerPerson = travelers > 0 ? totalCost / travelers : 0;
  const costPerDay = duration > 0 ? totalCost / duration : 0;
  const custom = (trip as any).customFields?.find((f: any) => f.key === 'targetBudget')?.value;
  const target = (custom ? Number(custom) : 0) || Math.max(1000, Math.round(totalCost > 0 ? totalCost * 1.15 : 2500));
  const under = totalCost <= target;
  const pct = Math.round((totalCost / Math.max(1, target)) * 100);

  const circumference = 251.327;
  const parts = [
    { key: 'Transport', value: transportCost, stroke: 'stroke-sunset-teal', dot: 'bg-sunset-teal' },
    { key: 'Stays', value: stayCost, stroke: 'stroke-sunset-lilac', dot: 'bg-sunset-lilac' },
    { key: 'Activities', value: activityCost, stroke: 'stroke-sunset-sun', dot: 'bg-sunset-sun' },
  ];
  let offset = 0;

  return (
    <div className="flex flex-col gap-5 animate-fadeIn">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <GhStat label="Total trip cost" value={formatCurrency(totalCost)} hint="Transport, stays and excursions" tone="sun" />
        <GhStat label="Per person" value={formatCurrency(costPerPerson)} hint={`${travelers || 1} traveller${(travelers || 1) === 1 ? '' : 's'}`} tone="teal" />
        <GhStat label="Per day" value={formatCurrency(costPerDay)} hint={`${duration} days`} tone="lilac" />
      </div>

      <GhCard className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xl font-black">Budget check</h3>
          <GhChip tone={under ? 'teal' : 'coral'}>{under ? `${formatCurrency(target - totalCost)} to spare` : `${formatCurrency(totalCost - target)} over`}</GhChip>
        </div>
        <div className="h-5 rounded-full bg-sunset-sand dark:bg-sunset-dusk overflow-hidden" role="progressbar" aria-valuenow={Math.min(100, pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Budget used">
          <div className={clsx('h-full rounded-full transition-all duration-700', under ? 'bg-sunset-teal' : 'bg-sunset-coral')} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
        <div className="flex justify-between text-xs font-bold opacity-80">
          <span>Spent {formatCurrency(totalCost)}</span>
          <span>Goal {formatCurrency(target)} ({pct}%)</span>
        </div>
      </GhCard>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <GhCard className="flex flex-col items-center gap-4">
          <h3 className="w-full text-xl font-black">Where it goes</h3>
          <div className="relative w-52 h-52">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90" aria-hidden="true">
              <circle cx="50" cy="50" r="40" fill="none" strokeWidth="14" className="stroke-sunset-sand dark:stroke-sunset-dusk" />
              {parts.map(p => {
                const dash = totalCost > 0 ? (p.value / totalCost) * circumference : 0;
                const el = dash > 0 ? <circle key={p.key} cx="50" cy="50" r="40" fill="none" strokeWidth="14" strokeDasharray={`${dash} ${circumference}`} strokeDashoffset={-offset} className={clsx(p.stroke, 'transition-all duration-700')} /> : null;
                offset += dash;
                return el;
              })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-black">{formatCurrency(totalCost)}</span>
              <span className="text-2xs font-bold uppercase tracking-wider opacity-70">Total spend</span>
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-3 text-xs font-bold">
            {parts.map(p => (
              <span key={p.key} className="inline-flex items-center gap-1.5"><span className={clsx('w-3 h-3 rounded-full', p.dot)} />{p.key} {totalCost > 0 ? Math.round((p.value / totalCost) * 100) : 0}%</span>
            ))}
          </div>
        </GhCard>

        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-4">
          {[
            { tone: 'teal' as GhTone, title: 'Transport', sub: `${bookingCount} booking${bookingCount === 1 ? '' : 's'}`, value: transportCost, icon: <AirplaneTakeoff className="w-6 h-6" weight="duotone" /> },
            { tone: 'lilac' as GhTone, title: 'Stays', sub: `${trip.accommodations?.length || 0} propert${(trip.accommodations?.length || 0) === 1 ? 'y' : 'ies'}`, value: stayCost, icon: <Buildings className="w-6 h-6" weight="duotone" /> },
            { tone: 'sun' as GhTone, title: 'Activities & tours', sub: `${trip.activities?.length || 0} planned`, value: activityCost, icon: <Backpack className="w-6 h-6" weight="duotone" /> },
          ].map(row => (
            <GhCard key={row.title} tone={row.tone} className="flex items-center gap-4">
              <span className="w-12 h-12 rounded-2xl bg-white/60 flex items-center justify-center shrink-0">{row.icon}</span>
              <div className="flex-1 min-w-0">
                <h4 className="font-black truncate">{row.title}</h4>
                <p className="text-xs font-semibold opacity-80">{row.sub}</p>
              </div>
              <div className="text-2xl font-black">{formatCurrency(row.value)}</div>
            </GhCard>
          ))}
        </div>
      </div>
    </div>
  );
};
