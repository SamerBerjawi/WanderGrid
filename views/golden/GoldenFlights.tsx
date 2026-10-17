import React, { Suspense, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import {
  Airplane, AirplaneTakeoff, ArrowDown, ArrowUp, Check, CaretDown, CaretUp, Compass, FolderMinus, FolderPlus, List, MagnifyingGlass,
  PencilSimple, PencilSimpleLine, Plus, SquaresFour, Trash, UploadSimple, X,
} from '@/components/ui/hugeicons';
import { Modal, GlassSelect, Autocomplete } from '../../components/ui';
import { Transport } from '../../types';
import { formatDate, formatCurrency } from '../../utils/formatters';
import { getCityName, getCarrierName, getFlightStatusTags, getFlightDepartureUtcDate } from '../../utils/flightData';
import { isFeatureEnabled } from '../../config/featureFlags';
import { LogoChip } from '../../components/golden/LogoChip';
import { GhFlightBoard } from '../../components/golden/GhFlightBoard';
import { useBentoStats, COUNTRY_NAMES } from '../../components/FlightyPassport';
import { FlightTrackerModal } from '../../components/FlightTrackerModal';
import {
  useFlightLog, extractIata, fetchAirlineSuggestions, fetchAirportSuggestions, formatFlightDuration, getLayoverMinutes, isUnassigned,
  FlightRecord, SortField,
} from '../../hooks/useFlightLog';
import { GhButton, GhCard, GhChip, GhEmpty, GhPage, GhStat, GhTabs, GhTone } from '../../components/golden/Gh';
import { GhTextInput } from '../../components/golden/GhTextInput';
import { GhField } from '../../components/golden/GhField';
import { GhSegmented } from '../../components/golden/GhSegmented';
import { GhToggle } from '../../components/golden/GhToggle';
import { GhStamp, SunsetScene } from '../../components/golden/SunsetScene';
import type { GoldenViewProps } from './registry';

const FlightImportWizard = React.lazy(() => import('../../components/FlightImportWizard').then(m => ({ default: m.FlightImportWizard })));

type ViewMode = 'board' | 'list' | 'cards';

const SORTS: { value: string; label: string; field: SortField; sub: string }[] = [
  { value: 'timing:departure', label: 'Departure time', field: 'timing', sub: 'departure' },
  { value: 'timing:departureHour', label: 'Departure hour', field: 'timing', sub: 'departureHour' },
  { value: 'timing:arrival', label: 'Arrival time', field: 'timing', sub: 'arrival' },
  { value: 'timing:duration', label: 'Duration', field: 'timing', sub: 'duration' },
  { value: 'flight:airline', label: 'Airline', field: 'flight', sub: 'airline' },
  { value: 'flight:identifier', label: 'Flight number', field: 'flight', sub: 'identifier' },
  { value: 'flight:pnr', label: 'Booking code', field: 'flight', sub: 'pnr' },
  { value: 'sector:route', label: 'Origin', field: 'sector', sub: 'route' },
  { value: 'sector:destination', label: 'Destination', field: 'sector', sub: 'destination' },
  { value: 'status:statusLabel', label: 'Status', field: 'status', sub: 'statusLabel' },
  { value: 'status:scheduledFirst', label: 'Scheduled first', field: 'status', sub: 'scheduledFirst' },
  { value: 'status:canceledFirst', label: 'Canceled first', field: 'status', sub: 'canceledFirst' },
  { value: 'seat:seatNumber', label: 'Seat', field: 'seat', sub: 'seatNumber' },
  { value: 'seat:cabinTier', label: 'Cabin', field: 'seat', sub: 'cabinTier' },
  { value: 'seat:cost', label: 'Ticket price', field: 'seat', sub: 'cost' },
];

const STATUS_TONE: Record<string, GhTone> = { CANCELED: 'coral', LATE: 'sun', EARLY: 'teal', 'ON TIME': 'teal', SCHEDULED: 'lilac' };

const toCode = (v: string) => {
  const s = (v || '').trim();
  return s.length <= 4 ? s.toUpperCase() : s.slice(0, 3).toUpperCase();
};

const daysUntil = (f: Transport) => Math.ceil((getFlightDepartureUtcDate(f).getTime() - Date.now()) / 86_400_000);

/** Airline badge: a round monogram, tone picked from the carrier name so each airline keeps its colour. */
const AirlineBadge: React.FC<{ name?: string }> = ({ name }) => {
  const label = (getCarrierName(name || '') || name || '?').trim();
  const tones = ['bg-sunset-teal', 'bg-sunset-sun', 'bg-sunset-lilac', 'bg-sunset-orange'];
  const tone = tones[label.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % tones.length];
  // Real airline logo; the coloured initials stand in until one resolves.
  return (
    <LogoChip
      provider={name}
      size="lg"
      className="rounded-full"
      fallback={<span className={clsx('w-full h-full rounded-full flex items-center justify-center text-sm font-black text-sunset-ink', tone)}>{label.slice(0, 2).toUpperCase()}</span>}
    />
  );
};

const IconBtn: React.FC<{ label: string; onClick: () => void; children: React.ReactNode; tone?: 'plain' | 'danger' }> = ({ label, onClick, children, tone = 'plain' }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={e => { e.stopPropagation(); onClick(); }}
    className={clsx(
      'w-11 h-11 rounded-full inline-flex items-center justify-center cursor-pointer transition-transform active:scale-95 shrink-0',
      tone === 'danger' ? 'bg-sunset-coral/15 text-sunset-coral' : 'bg-sunset-sand dark:bg-sunset-dusk text-sunset-ink dark:text-white'
    )}
  >
    {children}
  </button>
);

/** Next flight as a big boarding pass: coral body, cream stub with the countdown. */
const BoardingPass: React.FC<{ record: FlightRecord; onOpen: () => void; onTrack: () => void }> = ({ record, onOpen, onTrack }) => {
  const f = record.flight;
  const days = daysUntil(f);
  return (
    <div className="rounded-3xl overflow-hidden flex flex-col sm:flex-row shadow-card bg-sunset-orange text-white">
      <button type="button" onClick={onOpen} aria-label={`Edit ${f.origin} to ${f.destination}`} className="flex-1 min-w-0 text-left p-5 sm:p-7 cursor-pointer relative overflow-hidden">
        <svg viewBox="0 0 300 140" preserveAspectRatio="xMaxYMax slice" aria-hidden="true" className="absolute inset-0 w-full h-full opacity-25 pointer-events-none">
          <circle cx="240" cy="48" r="38" className="fill-white" />
          <path d="M0 140 Q80 80 160 118 T300 96 V140Z" className="fill-white" />
        </svg>
        <div className="relative">
          <GhChip tone="sun">Next up</GhChip>
          <div className="mt-3 text-xs font-bold uppercase tracking-wider opacity-90 truncate">
            {getCarrierName(f.provider) || f.provider} {f.identifier}
          </div>
          <div className="flex items-center gap-3 sm:gap-5 my-1">
            <span className="text-5xl sm:text-7xl font-black tracking-tight">{toCode(f.origin)}</span>
            <AirplaneTakeoff className="w-8 h-8 sm:w-10 sm:h-10 shrink-0" />
            <span className="text-5xl sm:text-7xl font-black tracking-tight">{toCode(f.destination)}</span>
          </div>
          <div className="text-sm sm:text-base font-semibold opacity-95 truncate">
            {getCityName(f.origin) || f.origin} to {getCityName(f.destination) || f.destination}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <GhChip tone="ink">{formatDate(f.departureDate, 'short')} · {f.departureTime || '--:--'}</GhChip>
            {f.seatNumber && <GhChip tone="ink">Seat {f.seatNumber}</GhChip>}
            {f.travelClass && <GhChip tone="ink">{f.travelClass}</GhChip>}
            {f.confirmationCode && <GhChip tone="ink">{f.confirmationCode}</GhChip>}
          </div>
        </div>
      </button>
      <div className="sm:w-48 shrink-0 bg-sunset-cream text-sunset-ink sm:border-l-4 border-t-4 sm:border-t-0 border-dashed border-sunset-orange p-5 flex sm:flex-col items-center justify-between sm:justify-center gap-3 text-center">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider opacity-70">{days > 0 ? 'Days to go' : days === 0 ? 'Departing' : 'Landed'}</div>
          <div className="text-5xl sm:text-6xl font-black leading-none">{days > 0 ? days : days === 0 ? 'Today' : '–'}</div>
        </div>
        <GhButton variant="soft" onClick={onTrack} icon={<Airplane className="w-4 h-4" />} label="Track this flight live">Track</GhButton>
      </div>
    </div>
  );
};

interface RowProps {
  flight: Transport;
  prev?: Transport;
  selecting: boolean;
  selected: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onTrack: () => void;
  card?: boolean;
}

/** One journey leg. `card` renders the postcard variant, otherwise a split-flap style row. */
const FlightRow: React.FC<RowProps> = ({ flight: f, prev, selecting, selected, onToggle, onEdit, onDelete, onTrack, card }) => {
  const status = getFlightStatusTags(f);
  const past = getFlightDepartureUtcDate(f).getTime() < Date.now();
  const layover = prev ? getLayoverMinutes(prev, f) : 0;
  const open = selecting ? onToggle : onEdit;
  return (
    <>
      {layover > 0 && (
        <div className="flex justify-center -my-1"><GhChip tone="sun">{formatFlightDuration(layover)} layover in {getCityName(f.origin) || f.origin}</GhChip></div>
      )}
      <div
        className={clsx(
          'rounded-3xl p-3 sm:p-4 flex flex-col gap-3 transition-colors', !card && '2xl:flex-row 2xl:items-center',
          card ? 'bg-sunset-teal text-sunset-ink' : 'bg-sunset-ink text-sunset-sun',
          selected && 'ring-4 ring-sunset-coral',
          past && !card && 'opacity-80'
        )}
      >
        <button type="button" onClick={open} aria-label={`${selecting ? 'Select' : 'Edit'} ${f.origin} to ${f.destination} on ${f.departureDate}`} className="flex flex-1 min-w-0 items-center gap-3 text-left cursor-pointer min-h-[44px]">
          {selecting && (
            <span className={clsx('w-7 h-7 rounded-full shrink-0 flex items-center justify-center', selected ? 'bg-sunset-coral text-white' : 'bg-white/90 text-sunset-ink')} aria-hidden="true">
              {selected && <Check className="w-4 h-4" />}
            </span>
          )}
          <AirlineBadge name={f.provider} />
          <span className="flex-1 min-w-0">
            <span className="flex items-center gap-2 font-black text-2xl sm:text-3xl tracking-tight leading-none">
              {toCode(f.origin)}
              <Airplane className="w-5 h-5 rotate-45 shrink-0 opacity-80" />
              {toCode(f.destination)}
            </span>
            <span className="block text-xs font-semibold opacity-80 truncate mt-1">
              {getCityName(f.origin) || f.origin} to {getCityName(f.destination) || f.destination}
            </span>
          </span>
        </button>
        <div className={clsx('grid grid-cols-2 gap-x-4 gap-y-2 text-xs font-semibold', !card && 'sm:grid-cols-4 2xl:flex-1')}>
          <span><span className="block opacity-70 uppercase tracking-wider">Date</span><b className="text-sm">{formatDate(f.departureDate, 'short')}</b></span>
          <span><span className="block opacity-70 uppercase tracking-wider">Time</span><b className="text-sm">{f.departureTime || '--:--'} → {f.arrivalTime || '--:--'}</b></span>
          <span><span className="block opacity-70 uppercase tracking-wider">Flight</span><b className="text-sm">{f.identifier || '—'}</b></span>
          <span><span className="block opacity-70 uppercase tracking-wider">Cabin</span><b className="text-sm">{f.travelClass || '—'}</b></span>
          {f.seatNumber && <span><span className="block opacity-70 uppercase tracking-wider">Seat</span><b className="text-sm">{f.seatNumber}{f.seatType ? ` · ${f.seatType}` : ''}</b></span>}
        </div>
        <div className={clsx('flex items-center gap-2 justify-between flex-wrap', !card && '2xl:justify-end')}>
          <div className="flex flex-wrap gap-1.5">
            <GhChip tone={STATUS_TONE[status.label] || 'lilac'}>{status.label}</GhChip>
            {f.duration ? <GhChip tone="plain">{formatFlightDuration(f.duration)}</GhChip> : null}
            {f.cost ? <GhChip tone="plain">{formatCurrency(f.cost)}</GhChip> : null}
          </div>
          {!selecting && (
            <div className="flex gap-1.5">
              <IconBtn label="Track flight" onClick={onTrack}><Airplane className="w-4 h-4" /></IconBtn>
              <IconBtn label="Edit flight" onClick={onEdit}><PencilSimple className="w-4 h-4" /></IconBtn>
              <IconBtn label="Delete flight" onClick={onDelete} tone="danger"><Trash className="w-4 h-4" /></IconBtn>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

/** Tiny cabin preview around the chosen seat (cosmetic only, same layouts as the original form). */
const SeatPreview: React.FC<{ cabin: string; seat: string }> = ({ cabin, seat }) => {
  const m = (seat || '').trim().toUpperCase().match(/^(\d+)([A-Z])$/);
  const centre = m ? parseInt(m[1], 10) : cabin === 'First' || cabin === 'Business' ? 2 : cabin === 'Premium Economy' ? 10 : 22;
  const col = m ? m[2] : '';
  const rows = [Math.max(1, centre - 1), Math.max(1, centre - 1) + 1, Math.max(1, centre - 1) + 2];
  const cols = cabin === 'First' || cabin === 'Business' ? ['A', '', 'D', 'G', '', 'K'] : cabin === 'Premium Economy' ? ['A', 'C', '', 'D', 'E', 'F', 'G', '', 'H', 'K'] : ['A', 'B', 'C', '', 'D', 'E', 'F'];
  return (
    <div className="rounded-3xl bg-sunset-sand dark:bg-sunset-dusk p-4 flex flex-col items-center gap-1" aria-label="Cabin seat preview">
      <span className="text-xs font-bold uppercase tracking-wider text-sunset-ink/70 dark:text-white/70 mb-1">Your seat</span>
      {rows.map(r => (
        <div key={r} className="flex items-center gap-1">
          <span className="w-6 text-right text-2xs font-bold text-sunset-ink/70 dark:text-white/70 mr-1">{r}</span>
          {cols.map((c, i) => c === '' ? <span key={i} className="w-3" /> : (
            <span key={i} className={clsx('w-6 h-6 rounded-md text-2xs font-black flex items-center justify-center', r === centre && c === col ? 'bg-sunset-coral text-white' : 'bg-white dark:bg-sunset-plum text-sunset-ink/60 dark:text-white/60')}>{c}</span>
          ))}
        </div>
      ))}
    </div>
  );
};

const FormLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="block text-xs font-bold uppercase tracking-wider text-sunset-ink/70 dark:text-white/70 mb-1.5 px-1">{children}</span>
);

export const GoldenFlights: React.FC<GoldenViewProps> = ({ onTripClick }) => {
  const L = useFlightLog();
  const [viewMode, setViewMode] = useState<ViewMode>(isFeatureEnabled('UI_DEPARTURE_BOARD') ? 'board' : 'list');
  const [showMore, setShowMore] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [tracker, setTracker] = useState<{ open: boolean; suggested?: { iata: string; origin: string; destination: string; date: string } }>({ open: false });

  const { filteredFlights, flights, selectedFlightIds, isMultiEditing } = L;
  const statsFlights = useMemo(() => filteredFlights.map(i => i.flight), [filteredFlights]);
  const stats = useBentoStats(statsFlights);
  const upcomingCount = useMemo(() => {
    const t0 = new Date();
    t0.setHours(0, 0, 0, 0);
    return flights.filter(i => getFlightDepartureUtcDate(i.flight) >= t0).length;
  }, [flights]);
  const maxMonth = Math.max(1, ...L.monthlyData.map(m => m.flights));
  const effectiveView: ViewMode = viewMode;

  const topCountries = useMemo(() => stats.flags.slice(0, 3), [stats.flags]);
  const airtimeDays = Math.floor(stats.hours / 24);
  const airtimeHours = Math.floor(stats.hours % 24);

  const trackFor = (f: Transport) => setTracker({ open: true, suggested: { iata: f.identifier || '', origin: f.origin, destination: f.destination, date: f.departureDate } });
  const selectedBundled = Array.from(selectedFlightIds).filter(id => {
    const r = flights.find(x => x.flight.id === id);
    return r && !isUnassigned(r.trip.id);
  }).length;
  const recordOf = (flight: Transport, tripId: string): FlightRecord | undefined => flights.find(r => r.flight.id === flight.id && (r.trip.id === tripId || tripId.startsWith('unassigned')));
  const toggleSelected = (id: string) => L.setSelectedFlightIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const sortValue = `${L.sortField}:${L.sortSubOption}`;
  const form = L.form;

  const openTrip = (id: string) => { if (onTripClick && !id.startsWith('unassigned')) onTripClick(id); };

  const renderGroups = (card: boolean) => (
    <div className="flex flex-col gap-8">
      {L.groupedByYear.map(({ year, groups }) => (
        <section key={year} className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-sunset-ink dark:text-white">{year}</h2>
            <GhChip tone="sun">{groups.reduce((n, g) => n + g.flights.length, 0)}</GhChip>
          </div>
          <div className={clsx('grid grid-cols-1 gap-4', card && 'xl:grid-cols-2')}>
            {groups.map(g => (
              <div key={g.trip.id} className={clsx('rounded-3xl p-3 sm:p-4 flex flex-col gap-3', g.isIndependent ? 'bg-transparent p-0 sm:p-0' : 'bg-sunset-sand dark:bg-sunset-dusk')}>
                {!g.isIndependent && (
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <div className="text-lg sm:text-xl font-black tracking-tight text-sunset-ink dark:text-white truncate">{g.trip.originalName || 'Trip'}</div>
                      <div className="text-xs font-semibold text-sunset-ink/70 dark:text-white/70 truncate">{g.trip.name}</div>
                    </div>
                    <div className="flex gap-1.5">
                      <GhButton variant="soft" className="!px-4" onClick={() => L.openBundleEditor(g.trip)} icon={<PencilSimple className="w-4 h-4" />} label="Edit bundle">Edit</GhButton>
                      {onTripClick && <GhButton variant="soft" className="!px-4" onClick={() => openTrip(g.trip.id)} icon={<Compass className="w-4 h-4" />} label="Open trip">Trip</GhButton>}
                    </div>
                  </div>
                )}
                {g.flights.map((f, i) => (
                  <FlightRow
                    key={f.id}
                    flight={f}
                    prev={i > 0 ? g.flights[i - 1] : undefined}
                    card={card}
                    selecting={isMultiEditing}
                    selected={selectedFlightIds.has(f.id)}
                    onToggle={() => toggleSelected(f.id)}
                    onEdit={() => { const r = recordOf(f, g.trip.id); if (r) L.openFlightForm(r); }}
                    onDelete={() => { const r = recordOf(f, g.trip.id); if (r) L.setDeleteConfirmTarget({ type: 'single', singleRecord: r }); }}
                    onTrack={() => trackFor(f)}
                  />
                ))}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );

  const controls = (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 items-center">
      <GhTabs
        tabs={[
          { id: 'all', label: 'All', count: flights.length },
          { id: 'upcoming', label: 'Coming up', count: upcomingCount },
          { id: 'past', label: 'Flown', count: flights.length - upcomingCount },
        ]}
        active={L.timeFilter}
        onChange={id => L.setTimeFilter(id as 'all' | 'upcoming' | 'past')}
      />
      <div className="flex gap-2 flex-wrap justify-center">
        <GhButton variant="soft" onClick={() => setImportOpen(true)} icon={<UploadSimple className="w-4 h-4" />} label="Import flights">Import</GhButton>
        <GhButton variant="soft" onClick={() => setTracker({ open: true })} icon={<Airplane className="w-4 h-4" />} label="Track a flight">Track</GhButton>
        <GhButton
          variant={isMultiEditing ? 'primary' : 'soft'}
          onClick={() => { L.setIsMultiEditing(!isMultiEditing); L.setSelectedFlightIds(new Set()); }}
          icon={isMultiEditing ? <Check className="w-4 h-4" /> : <PencilSimpleLine className="w-4 h-4" />}
          label={isMultiEditing ? 'Done selecting' : 'Select flights'}
        >
          {isMultiEditing ? 'Done' : 'Select'}
        </GhButton>
      </div>
    </div>
  );

  return (
    <GhPage
      title="Flights"
      icon={<AirplaneTakeoff className="w-8 h-8 sm:w-10 sm:h-10" />}
      action={<GhButton onClick={() => L.openFlightForm()} icon={<Plus className="w-4 h-4" />} label="Add a flight">Add flight</GhButton>}
      controls={controls}
    >
      {/* Hero: next boarding pass, or an invitation */}
      {(L.nextUpcomingFlight ? (
        <BoardingPass record={L.nextUpcomingFlight} onOpen={() => L.openFlightForm(L.nextUpcomingFlight!)} onTrack={() => trackFor(L.nextUpcomingFlight!.flight)} />
      ) : flights.length > 0 ? (
        <div className="rounded-3xl overflow-hidden relative h-40 sm:h-48 shadow-card">
          <SunsetScene />
          <div className="absolute inset-0 p-5 sm:p-7 flex flex-col justify-start">
            <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-sunset-ink dark:text-white">Where next?</h2>
            <p className="text-sm font-semibold text-sunset-ink/80 dark:text-white/80">Nothing booked ahead.</p>
          </div>
        </div>
      ) : null)}

      {/* Stat tiles */}
      {flights.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <GhStat tone="teal" label="Distance" value={<>{stats.distance.toLocaleString()}<span className="text-lg ml-1">km</span></>} hint={`${(stats.distance / 40075).toFixed(1)}× round the world`} />
          <GhStat tone="sun" label="Airtime" value={airtimeDays > 0 ? `${airtimeDays}d ${airtimeHours}h` : `${airtimeHours}h`} hint={`${L.metrics.total} flights`} />
          <GhStat tone="lilac" label="Airlines" value={stats.airlines} hint={L.metrics.topAirline !== 'None' ? `Mostly ${getCarrierName(L.metrics.topAirline) || L.metrics.topAirline}` : undefined} />
          <GhStat tone="coral" label="Countries" value={stats.flags.length} hint={`${stats.airports} airports`} />
        </div>
      )}

      {/* Passport postcard and the year in months */}
      {flights.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-5">
          <div className="lg:col-span-3 rounded-3xl overflow-hidden relative shadow-card min-h-[15rem]">
            <SunsetScene className="absolute inset-0" />
            <div className="relative p-5 sm:p-7 flex flex-col gap-4 h-full">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-sunset-ink/70 dark:text-white/70">Passport</div>
                <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-sunset-ink dark:text-white truncate">{L.currentUser?.name || 'Traveller'}</h2>
                <div className="text-sm font-semibold text-sunset-ink/80 dark:text-white/80">{L.yearFilter === 'all' ? 'All time' : L.yearFilter}</div>
              </div>
              <div className="flex gap-3 sm:gap-4 items-center flex-wrap">
                {topCountries.map((c, i) => (
                  <GhStamp key={c.code} label={`${c.flag} ${COUNTRY_NAMES[c.code] || c.code}`} tone={(['coral', 'teal', 'lilac'] as const)[i % 3]} rotate={[-6, 4, -3][i % 3]} />
                ))}
                {stats.flags.length > 3 && <GhChip tone="ink">+{stats.flags.length - 3} more</GhChip>}
              </div>
              <div className="flex flex-wrap gap-1.5 text-2xl" aria-label="Countries visited">{stats.flags.map(c => <span key={c.code} title={COUNTRY_NAMES[c.code] || c.code}>{c.flag}</span>)}</div>
            </div>
          </div>
          <GhCard className="lg:col-span-2 flex flex-col gap-4">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <h2 className="text-xl font-black tracking-tight">By month</h2>
              <span className="text-xs font-semibold opacity-70">{L.metrics.upcoming} ahead · {L.metrics.past} flown</span>
            </div>
            <div className="flex items-end gap-1.5 h-32" role="img" aria-label="Flights per month">
              {L.monthlyData.map((m, i) => (
                <div key={m.month} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
                  <div className={clsx('w-full rounded-full', ['bg-sunset-coral', 'bg-sunset-sun', 'bg-sunset-teal', 'bg-sunset-lilac'][i % 4])} style={{ height: `${m.flights === 0 ? 4 : Math.max(10, (m.flights / maxMonth) * 100)}%`, opacity: m.flights === 0 ? 0.25 : 1 }} title={`${m.month}: ${m.flights}`} />
                  <span className="text-2xs font-bold opacity-70">{m.month[0]}</span>
                </div>
              ))}
            </div>
            {L.metrics.spend > 0 && (
              <div className="rounded-2xl bg-sunset-sand dark:bg-sunset-dusk px-4 py-3 flex justify-between items-baseline">
                <span className="text-xs font-bold uppercase tracking-wider opacity-70">Spent on tickets</span>
                <span className="text-2xl font-black">{formatCurrency(L.metrics.spend)}</span>
              </div>
            )}
          </GhCard>
        </div>
      )}

      {/* Search and filters */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col md:flex-row gap-3 md:items-end">
          <div className="flex-1 min-w-0">
            <GhTextInput
              aria-label="Search flights"
              placeholder="Search airline, code, city or booking…"
              value={L.searchQuery}
              onChange={e => L.setSearchQuery(e.target.value)}
              trailing={<MagnifyingGlass className="w-5 h-5 mr-3 opacity-60" />}
            />
          </div>
          <div className="grid grid-cols-2 md:flex gap-3 md:w-auto">
            <div className="md:w-44">
              <GlassSelect aria-label="Filter by cabin class" value={L.classFilter} onChange={e => L.setClassFilter(e.target.value)}>
                <option value="all">Any cabin</option>
                <option value="Economy">Economy</option>
                <option value="Premium Economy">Premium Economy</option>
                <option value="Business">Business</option>
                <option value="First">First</option>
              </GlassSelect>
            </div>
            <div className="md:w-40">
              <GlassSelect aria-label="Filter by year" value={L.yearFilter} onChange={e => L.setYearFilter(e.target.value)}>
                <option value="all">All years</option>
                {L.uniqueYears.map(y => <option key={y} value={y}>{y}</option>)}
              </GlassSelect>
            </div>
          </div>
          <div className="flex gap-2 justify-center">
            <GhButton variant="ghost" onClick={() => setShowMore(s => !s)} icon={showMore ? <CaretUp className="w-4 h-4" /> : <CaretDown className="w-4 h-4" />} label="Toggle more filters">More</GhButton>
            {L.hasActiveFilters && <GhButton variant="soft" onClick={L.resetFilters} icon={<X className="w-4 h-4" />} label="Reset all filters">Reset</GhButton>}
          </div>
        </div>
        {showMore && (
          <GhCard className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <GhTextInput label="Airline or flight no." placeholder="e.g. Delta, DL102" value={L.colFilterFlight} onChange={e => L.setColFilterFlight(e.target.value)} />
            <GhTextInput label="Route or city" placeholder="e.g. JFK, London" value={L.colFilterSector} onChange={e => L.setColFilterSector(e.target.value)} />
            <GlassSelect label="Status" value={L.colFilterStatus} onChange={e => L.setColFilterStatus(e.target.value)}>
              <option value="all">Any status</option>
              <option value="scheduled">Scheduled</option>
              <option value="on time">On time</option>
              <option value="early">Early</option>
              <option value="late">Late</option>
              <option value="canceled">Canceled</option>
            </GlassSelect>
            <GlassSelect label="Seat and cabin" value={L.colFilterSeat} onChange={e => L.setColFilterSeat(e.target.value)}>
              <option value="all">Any seat</option>
              <option value="assigned">Seat assigned</option>
              <option value="unassigned">No seat yet</option>
              <option value="class-economy">Economy</option>
              <option value="class-premium">Premium Economy</option>
              <option value="class-business">Business</option>
              <option value="class-first">First</option>
            </GlassSelect>
            <GlassSelect label="Day of week" value={L.colFilterTimingDay} onChange={e => L.setColFilterTimingDay(e.target.value)}>
              <option value="all">Any day</option>
              {['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(d => <option key={d} value={d}>{{ mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' }[d]}</option>)}
            </GlassSelect>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <GlassSelect
                  label="Sort by"
                  value={sortValue}
                  onChange={e => { const s = SORTS.find(x => x.value === e.target.value); if (s) { L.setSortField(s.field); L.setSortSubOption(s.sub); } }}
                >
                  {SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </GlassSelect>
              </div>
              <IconBtn label={L.sortAsc ? 'Sorted ascending, switch to descending' : 'Sorted descending, switch to ascending'} onClick={() => L.setSortAsc(!L.sortAsc)}>
                {L.sortAsc ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
              </IconBtn>
            </div>
          </GhCard>
        )}
      </div>

      {/* Board header with view switch */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-sunset-ink dark:text-white">Departures</h2>
          <GhChip tone="coral">{filteredFlights.length}</GhChip>
        </div>
        <GhSegmented<ViewMode>
          label="View"
          value={effectiveView}
          onChange={setViewMode}
          options={[
            ...(isFeatureEnabled('UI_DEPARTURE_BOARD') ? [{ value: 'board' as const, label: 'Board', icon: <Airplane className="w-4 h-4" /> }] : []),
            { value: 'list', label: 'List', icon: <List className="w-4 h-4" /> },
            { value: 'cards', label: 'Cards', icon: <SquaresFour className="w-4 h-4" /> },
          ]}
        />
      </div>

      {L.loadError && flights.length === 0 ? (
        <GhEmpty title="Couldn't load your flights" hint={L.loadError} action={<GhButton onClick={L.refreshData}>Try again</GhButton>} />
      ) : !L.loaded ? (
        <div className="h-40 rounded-3xl bg-sunset-sand dark:bg-sunset-dusk animate-pulse" aria-busy="true" />
      ) : filteredFlights.length === 0 ? (
        <GhEmpty
          title={flights.length === 0 ? 'Where next?' : 'No flights match'}
          hint={flights.length === 0 ? 'Add your first boarding pass.' : 'Try loosening the filters.'}
          action={flights.length === 0 ? <GhButton onClick={() => L.openFlightForm()} icon={<Plus className="w-4 h-4" />}>Add flight</GhButton> : <GhButton variant="soft" onClick={L.resetFilters}>Reset filters</GhButton>}
        />
      ) : effectiveView === 'board' ? (
        <GhFlightBoard
          groups={L.groupedFlights}
          selecting={isMultiEditing}
          selectedIds={selectedFlightIds}
          onToggle={toggleSelected}
          onEdit={(f, tripId) => { const r = recordOf(f, tripId); if (r) L.openFlightForm(r); }}
          onDelete={(f, tripId) => { const r = recordOf(f, tripId); if (r) L.setDeleteConfirmTarget({ type: 'single', singleRecord: r }); }}
          onTrack={trackFor}
          onEditBundle={L.openBundleEditor}
          onOpenTrip={onTripClick ? openTrip : undefined}
        />
      ) : (
        renderGroups(effectiveView === 'cards')
      )}

      {/* Selection bar */}
      {isMultiEditing && (
        <div className="fixed bottom-24 sm:bottom-6 left-1/2 -translate-x-1/2 z-float max-w-[calc(100vw-1rem)] rounded-3xl bg-sunset-ink text-white shadow-card p-2 flex items-center gap-1.5 flex-wrap justify-center">
          <span className="px-3 text-sm font-black">{selectedFlightIds.size} selected</span>
          <GhButton variant="ghost" className="!text-white hover:!bg-white/10" onClick={() => L.setSelectedFlightIds(new Set(filteredFlights.map(f => f.flight.id)))}>All</GhButton>
          <GhButton variant="ghost" className="!text-white hover:!bg-white/10" onClick={() => L.setSelectedFlightIds(new Set())}>None</GhButton>
          <GhButton variant="primary" onClick={() => selectedFlightIds.size > 0 && L.setIsBundling(true)} icon={<FolderPlus className="w-4 h-4" />} label="Bundle selected flights into a trip" className={selectedFlightIds.size === 0 ? 'opacity-40' : ''}>Bundle</GhButton>
          <GhButton variant="soft" onClick={() => selectedBundled > 0 && L.setUnbundleConfirmTarget(selectedBundled)} icon={<FolderMinus className="w-4 h-4" />} label="Unbundle selected flights" className={selectedBundled === 0 ? 'opacity-40' : ''}>Unbundle</GhButton>
          <GhButton variant="soft" onClick={() => selectedFlightIds.size > 0 && L.setDeleteConfirmTarget({ type: 'multi', multiCount: selectedFlightIds.size })} icon={<Trash className="w-4 h-4 text-sunset-coral" />} label="Delete selected flights" className={selectedFlightIds.size === 0 ? 'opacity-40' : ''}>Delete</GhButton>
        </div>
      )}

      {/* Flight form */}
      <Modal
        isOpen={L.isEditing}
        onClose={() => L.setIsEditing(false)}
        title={L.editingFlight ? 'Edit flight' : 'New flight'}
        subtitle="Route, times and boarding details"
        icon={<Airplane className="w-5 h-5 rotate-45" />}
        maxWidth="max-w-2xl"
        footerActions={
          <>
            <GhButton variant="ghost" onClick={() => L.setIsEditing(false)}>Cancel</GhButton>
            <GhButton onClick={() => L.saveFlight()} label={L.editingFlight ? 'Save flight' : 'Add flight'}>{L.isSavingFlight ? 'Saving…' : L.editingFlight ? 'Save flight' : 'Add flight'}</GhButton>
          </>
        }
      >
        <form onSubmit={L.saveFlight} onBlurCapture={L.saveDraft} className="flex flex-col gap-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
            {(['origin', 'destination'] as const).map(k => (
              <div key={k}>
                <Autocomplete
                  label={k === 'origin' ? 'From' : 'To'}
                  placeholder={k === 'origin' ? 'JFK or New York' : 'LHR or London'}
                  value={form[k]}
                  onChange={val => L.patchForm({ [k]: val })}
                  fetchSuggestions={fetchAirportSuggestions}
                />
                <div className="min-h-[20px] mt-1 px-1 text-xs font-bold">
                  {form[k] && (extractIata(form[k]) === (getCityName(extractIata(form[k])) || '').toUpperCase()
                    ? <span className="text-sunset-coral">Unrecognised code</span>
                    : <span className="text-sunset-ink/80 dark:text-sunset-teal">{getCityName(extractIata(form[k]))}</span>)}
                </div>
              </div>
            ))}
            <GhField label="Departure date" type="date" name="gf-dep-date" value={form.departureDate} onChange={e => L.patchForm({ departureDate: e.target.value })} />
          </div>

          <div className="rounded-3xl bg-sunset-sand dark:bg-sunset-dusk p-4 flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="font-black">Find flight times</div>
                <div className="text-xs font-medium opacity-70">Look up airline schedules on this route and date.</div>
              </div>
              <GhButton variant="soft" onClick={L.searchRouteFlights} icon={<MagnifyingGlass className="w-4 h-4" />} label="Search schedules">{L.isRouteSearching ? 'Searching…' : 'Search'}</GhButton>
            </div>
            {L.routeSearchError && <p role="alert" className="text-xs font-semibold text-sunset-coral">{L.routeSearchError}</p>}
            {L.searchedFlights && L.searchedFlights.length > 0 && (
              <ul className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                {L.searchedFlights.map((fl, i) => {
                  const dep = fl.departure?.scheduled?.split('T')[1]?.substring(0, 5) || '--:--';
                  const arr = fl.arrival?.scheduled?.split('T')[1]?.substring(0, 5) || '--:--';
                  return (
                    <li key={i}>
                      <button type="button" onClick={() => L.selectRouteFlight(fl)} className="w-full min-h-[44px] rounded-2xl bg-white dark:bg-sunset-plum p-3 flex items-center justify-between gap-3 text-left cursor-pointer">
                        <span className="min-w-0">
                          <span className="block font-black truncate">{fl.airline?.name || 'Airline'} <span className="font-semibold opacity-70">{fl.flight?.iata || fl.flight?.number}</span></span>
                          <span className="block text-xs opacity-70">{fl.departure?.iata} → {fl.arrival?.iata}</span>
                        </span>
                        <GhChip tone="sun">{dep} → {arr}</GhChip>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <button type="button" onClick={() => L.setShowManualFields(!L.showManualFields)} className="self-start min-h-[44px] px-4 rounded-full bg-sunset-sand dark:bg-sunset-dusk text-sm font-semibold inline-flex items-center gap-2 cursor-pointer" aria-expanded={L.showManualFields}>
            {L.showManualFields ? <CaretUp className="w-4 h-4" /> : <CaretDown className="w-4 h-4" />}
            {L.showManualFields ? 'Hide details' : 'More details'}
          </button>

          {L.showManualFields && (
            <div className="flex flex-col gap-4">
              <GlassSelect label="Link to trip" value={form.tripId} onChange={e => L.patchForm({ tripId: e.target.value })}>
                <option value="unassigned">Independent flight</option>
                {L.trips.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </GlassSelect>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Autocomplete label="Airline" placeholder="Delta or DL" value={form.airline} onChange={val => L.patchForm({ airline: val })} fetchSuggestions={fetchAirlineSuggestions} />
                <GhField label="Flight number" name="gf-num" placeholder="DL102" value={form.flightNum} onChange={e => L.patchForm({ flightNum: e.target.value })} />
                <GhField label="Booking code" name="gf-pnr" placeholder="ABC123" value={form.confirmation} onChange={e => L.patchForm({ confirmation: e.target.value })} />
                <GhField label="Ticket price" name="gf-cost" type="number" min="0" step="0.01" value={form.cost} onChange={e => L.patchForm({ cost: e.target.value })} />
                <GhField label="Departs" name="gf-dep-time" type="time" value={form.departureTime} onChange={e => L.patchForm({ departureTime: e.target.value })} />
                <GhField label="Arrival date" name="gf-arr-date" type="date" value={form.arrivalDate} onChange={e => L.patchForm({ arrivalDate: e.target.value })} />
                <GhField label="Arrives" name="gf-arr-time" type="time" value={form.arrivalTime} onChange={e => L.patchForm({ arrivalTime: e.target.value })} />
                <GhField label="Duration (minutes)" name="gf-dur" type="number" min="0" value={String(form.duration)} onChange={e => L.patchForm({ duration: parseInt(e.target.value, 10) || 0 })} />
                <GhField label="Actual departure" name="gf-act-dep" type="time" value={form.actualDepartureTime} onChange={e => L.patchForm({ actualDepartureTime: e.target.value })} />
                <GhField label="Actual arrival" name="gf-act-arr" type="time" value={form.actualArrivalTime} onChange={e => L.patchForm({ actualArrivalTime: e.target.value })} />
              </div>
              <div>
                <FormLabel>Cabin</FormLabel>
                <GhSegmented
                  label="Cabin"
                  wrap
                  value={form.travelClass}
                  onChange={v => L.patchForm({ travelClass: v })}
                  options={[{ value: 'Economy', label: 'Economy' }, { value: 'Premium Economy', label: 'Premium' }, { value: 'Business', label: 'Business' }, { value: 'First', label: 'First' }]}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                <GhField label="Seat" name="gf-seat" placeholder="14A" value={form.seatNumber} onChange={e => L.patchForm({ seatNumber: e.target.value })} />
                <div>
                  <FormLabel>Seat type</FormLabel>
                  <GhSegmented label="Seat type" fill value={form.seatType} onChange={v => L.patchForm({ seatType: v })} options={[{ value: 'Window', label: 'Window' }, { value: 'Middle', label: 'Middle' }, { value: 'Aisle', label: 'Aisle' }]} />
                </div>
              </div>
              <SeatPreview cabin={form.travelClass} seat={form.seatNumber} />
            </div>
          )}
          {L.flightFormError && <p role="alert" className="text-sm font-semibold text-sunset-coral">{L.flightFormError}</p>}
        </form>
      </Modal>

      {/* Delete confirmation */}
      <Modal
        isOpen={!!L.deleteConfirmTarget}
        onClose={() => L.setDeleteConfirmTarget(null)}
        title={L.deleteConfirmTarget?.type === 'multi' ? `Delete ${L.deleteConfirmTarget.multiCount} ${L.deleteConfirmTarget.multiCount === 1 ? 'flight' : 'flights'}?` : 'Delete this flight?'}
        subtitle="This cannot be undone."
        icon={<Trash className="w-5 h-5" />}
        footerActions={
          <>
            <GhButton variant="ghost" onClick={() => L.setDeleteConfirmTarget(null)}>Keep</GhButton>
            <GhButton
              onClick={() => { const t = L.deleteConfirmTarget; if (!t) return; if (t.type === 'multi') L.executeMultiDelete(); else if (t.singleRecord) L.executeSingleDelete(t.singleRecord); }}
              icon={<Trash className="w-4 h-4" />}
            >
              Delete
            </GhButton>
          </>
        }
      >
        {L.deleteConfirmTarget?.singleRecord ? (
          <p className="text-sm font-medium">
            {toCode(L.deleteConfirmTarget.singleRecord.flight.origin)} → {toCode(L.deleteConfirmTarget.singleRecord.flight.destination)} on {formatDate(L.deleteConfirmTarget.singleRecord.flight.departureDate, 'short')} will be removed.
          </p>
        ) : <p className="text-sm font-medium">The selected flights will be removed from your log.</p>}
      </Modal>

      {/* Bundle */}
      <Modal
        isOpen={L.isBundling}
        onClose={() => L.setIsBundling(false)}
        title="Bundle into a trip"
        subtitle={`${selectedFlightIds.size} flights`}
        icon={<FolderPlus className="w-5 h-5" />}
        footerActions={
          <>
            <GhButton variant="ghost" onClick={() => L.setIsBundling(false)}>Cancel</GhButton>
            <GhButton onClick={L.executeBundle} label="Create bundle">{L.isBundlingInFlight ? 'Creating…' : 'Create bundle'}</GhButton>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <GhField label="Trip name" name="gf-bundle-name" value={L.bundleName} onChange={e => L.setBundleName(e.target.value)} />
          <GhField label="Where" name="gf-bundle-loc" value={L.bundleLocation} onChange={e => L.setBundleLocation(e.target.value)} />
          <label className="flex items-center justify-between gap-3 min-h-[44px]">
            <span className="text-sm font-semibold">Also show it in the Planner</span>
            <GhToggle checked={L.createTripInPlanner} onChange={L.setCreateTripInPlanner} label="Show bundle in the Planner" />
          </label>
        </div>
      </Modal>

      {/* Edit bundle */}
      <Modal
        isOpen={L.isEditingBundle}
        onClose={() => { L.setIsEditingBundle(false); L.setEditingBundleId(''); }}
        title="Edit bundle"
        icon={<Compass className="w-5 h-5" />}
        footerActions={
          <>
            <GhButton variant="soft" onClick={L.disassembleBundle} icon={<FolderMinus className="w-4 h-4" />} label="Disassemble bundle into independent flights">Disassemble</GhButton>
            <GhButton onClick={L.saveBundleSettings}>Save</GhButton>
          </>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2"><GhField label="Trip name" name="gf-eb-name" value={L.bundleForm.name} onChange={e => L.setBundleForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div className="sm:col-span-2"><GhField label="Where" name="gf-eb-loc" value={L.bundleForm.location} onChange={e => L.setBundleForm(f => ({ ...f, location: e.target.value }))} /></div>
          <GhField label="Start" type="date" name="gf-eb-start" value={L.bundleForm.startDate} onChange={e => L.setBundleForm(f => ({ ...f, startDate: e.target.value }))} />
          <GhField label="End" type="date" name="gf-eb-end" value={L.bundleForm.endDate} onChange={e => L.setBundleForm(f => ({ ...f, endDate: e.target.value }))} />
        </div>
      </Modal>

      {/* Unbundle */}
      <Modal
        isOpen={L.unbundleConfirmTarget !== null}
        onClose={() => L.setUnbundleConfirmTarget(null)}
        title="Unbundle flights?"
        icon={<FolderMinus className="w-5 h-5" />}
        footerActions={
          <>
            <GhButton variant="ghost" onClick={() => L.setUnbundleConfirmTarget(null)}>Cancel</GhButton>
            <GhButton onClick={L.executeUnbundle}>Unbundle</GhButton>
          </>
        }
      >
        <p className="text-sm font-medium">{L.unbundleConfirmTarget} flights will become independent. Trips left empty are removed.</p>
      </Modal>

      <FlightTrackerModal isOpen={tracker.open} onClose={() => setTracker({ open: false })} suggestedFlight={tracker.suggested} />
      {importOpen && (
        <Suspense fallback={null}>
          <FlightImportWizard isOpen={importOpen} onClose={() => setImportOpen(false)} onImportComplete={() => L.refreshData()} users={L.users} />
        </Suspense>
      )}
    </GhPage>
  );
};
