import React, { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { Airplane, Check, Compass, PencilSimple, Seat, Trash } from '../ui/hugeicons';
import { Transport, Trip } from '../../types';
import { LogoChip } from './LogoChip';
import { FactItem, flightFacts } from './FlightFacts';
import { formatDate, formatCurrency } from '../../utils/formatters';
import { getCarrierName, getCityName, getFlightArrivalUtcDate, getFlightDepartureUtcDate, getFlightStatusTags } from '../../utils/flightData';

/**
 * Airport departures board: dark panel, amber split-flap characters, column headers, one section per trip.
 * Uses the fixed `board-*` palette (same in light and dark), like components/DepartureBoard.tsx.
 */

export interface BoardGroup {
  trip: Trip & { originalName?: string };
  flights: Transport[];
  isIndependent: boolean;
}

interface Props {
  groups: BoardGroup[];
  selecting: boolean;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onEdit: (flight: Transport, tripId: string) => void;
  onDelete: (flight: Transport, tripId: string) => void;
  onTrack: (flight: Transport) => void;
  onEditBundle: (trip: BoardGroup['trip']) => void;
  onOpenTrip?: (tripId: string) => void;
}

const toCode = (v: string) => {
  const s = (v || '').trim();
  return s.length <= 4 ? s.toUpperCase() : s.slice(0, 3).toUpperCase();
};

/** One split-flap tile per character, with the hinge line across the middle. */
const Flap: React.FC<{ text: string; className?: string; min?: number }> = ({ text, className, min = 0 }) => {
  const chars = text.toUpperCase().padEnd(min, ' ').split('');
  return (
    <span className={clsx('inline-flex items-center font-mono font-bold', className)} role="text" aria-label={text}>
      {chars.map((c, i) => (
        <span key={i} aria-hidden="true" className="relative inline-flex items-center justify-center w-[0.9em] h-[1.3em] mx-px rounded-[3px] bg-board-line text-board-amber leading-none">
          {c === ' ' ? ' ' : c}
          <span className="absolute inset-x-0 top-1/2 h-px bg-board-bg" />
        </span>
      ))}
    </span>
  );
};

const statusOf = (f: Transport): { text: string; cls: string } => {
  const tag = getFlightStatusTags(f).label;
  const dep = getFlightDepartureUtcDate(f).getTime();
  const arr = getFlightArrivalUtcDate(f).getTime();
  const now = Date.now();
  if (tag === 'CANCELED') return { text: 'CANCELLED', cls: 'text-sunset-coral' };
  if (now > arr) return { text: 'ARRIVED', cls: 'text-board-muted' };
  if (now > dep) return { text: 'IN AIR', cls: 'text-board-amber' };
  const mins = (dep - now) / 60000;
  if (mins < 60) return { text: 'BOARDING', cls: 'text-board-amber animate-pulse' };
  if (tag === 'LATE') return { text: 'DELAYED', cls: 'text-board-amber' };
  return { text: 'ON TIME', cls: 'text-board-ok' };
};

const dur = (m?: number) => (m ? `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m` : '');

const BoardBtn: React.FC<{ label: string; onClick: () => void; children: React.ReactNode; danger?: boolean }> = ({ label, onClick, children, danger }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={e => { e.stopPropagation(); onClick(); }}
    className={clsx('w-11 h-11 rounded-full inline-flex items-center justify-center cursor-pointer hover:bg-white/10 shrink-0', danger ? 'text-sunset-coral' : 'text-board-muted hover:text-board-amber')}
  >
    {children}
  </button>
);

const Clock: React.FC = () => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return <Flap text={now.toTimeString().slice(0, 5)} className="text-lg sm:text-2xl" />;
};

const Row: React.FC<{ f: Transport; tripId: string; isNext: boolean } & Pick<Props, 'selecting' | 'onToggle' | 'onEdit' | 'onDelete' | 'onTrack'> & { selected: boolean }> = ({
  f, tripId, isNext, selecting, selected, onToggle, onEdit, onDelete, onTrack,
}) => {
  const st = statusOf(f);
  const airline = getCarrierName(f.provider) || f.provider;
  const open = () => (selecting ? onToggle(f.id) : onEdit(f, tripId));
  const flightNo = (f.identifier || '').replace(/\s+/g, '');
  const facts = flightFacts(f, { include: ['terminal', 'gate', 'belt', 'aircraft', 'pnr', 'distance'] });
  return (
    <li className={clsx('rounded-2xl bg-board-bg/60 border-l-4', isNext ? 'border-board-amber' : 'border-transparent', selected && 'ring-2 ring-sunset-coral')}>
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={open}
          aria-pressed={selecting ? selected : undefined}
          aria-label={`${selecting ? 'Select' : 'Edit'} ${f.origin} to ${f.destination} on ${f.departureDate}`}
          className="flex-1 min-w-0 text-left p-3 sm:p-4 cursor-pointer grid gap-x-4 gap-y-2 grid-cols-[1fr_auto] xl:grid-cols-[7.5rem_5.5rem_7rem_1fr_5rem_6rem_7rem] xl:items-center font-mono"
        >
          {/* Date + time */}
          <span className="xl:contents">
            <span className="text-xs text-board-muted uppercase flex items-center gap-2">
              {selecting && (
                <span className={clsx('w-5 h-5 rounded-full inline-flex items-center justify-center shrink-0', selected ? 'bg-sunset-coral text-white' : 'bg-board-line text-board-muted')} aria-hidden="true">
                  {selected && <Check className="w-3 h-3" />}
                </span>
              )}
              {formatDate(f.departureDate, 'short')}
            </span>
          </span>
          <span className="text-right xl:text-left "><Flap text={f.departureTime || '--:--'} className="text-lg sm:text-xl" /></span>
          {/* Flight: logo beside the number and airline name */}
          <span className="col-span-2 xl:col-span-1 flex items-center gap-2.5 min-w-0">
            <LogoChip provider={f.provider} size="md" fallback={<Airplane className="w-4 h-4 rotate-45" />} />
            <span className="min-w-0">
              <span className="block text-board-amber text-sm font-bold leading-tight">{flightNo || '—'}</span>
              <span className="block text-2xs text-board-muted uppercase truncate leading-tight">{airline}</span>
            </span>
          </span>
          {/* Route */}
          <span className="col-span-2 xl:col-span-1 min-w-0">
            <span className="flex items-center gap-2 text-2xl sm:text-3xl">
              <Flap text={toCode(f.origin)} />
              <Airplane className="w-5 h-5 text-board-muted rotate-45 shrink-0" />
              <Flap text={toCode(f.destination)} />
            </span>
            <span className="block text-2xs text-board-muted uppercase truncate mt-1">
              {getCityName(f.origin) || f.origin} to {getCityName(f.destination) || f.destination}
            </span>
          </span>
          {/* Seat, cabin, status */}
          <span className="text-2xs text-board-muted uppercase">
            <span className="inline-flex items-center gap-1.5"><Seat className="w-4 h-4" /><span>Seat<br /><b className="text-board-amber text-sm">{f.seatNumber || '—'}</b></span></span>
          </span>
          <span className="text-2xs text-board-muted uppercase">
            {f.travelClass || 'Economy'}
            {f.duration ? <><br /><b className="text-board-paper text-xs">{dur(f.duration)}</b></> : null}
            {f.cost ? <><br /><b className="text-board-paper text-xs">{formatCurrency(f.cost)}</b></> : null}
          </span>
          <span className={clsx('text-xs sm:text-sm font-bold tracking-wider col-span-2 xl:col-span-1', st.cls)}>{st.text}</span>
          {facts.length > 0 && (
            <span className="col-span-full flex flex-wrap gap-x-5 gap-y-2 pt-2 border-t border-board-line text-board-paper">
              {facts.map(x => <FactItem key={x.key} fact={x} />)}
            </span>
          )}
        </button>
        {!selecting && (
          <div className="flex flex-col sm:flex-row items-center justify-center pr-1">
            <BoardBtn label="Track flight" onClick={() => onTrack(f)}><Airplane className="w-4 h-4" /></BoardBtn>
            <BoardBtn label="Edit flight" onClick={() => onEdit(f, tripId)}><PencilSimple className="w-4 h-4" /></BoardBtn>
            <BoardBtn label="Delete flight" onClick={() => onDelete(f, tripId)} danger><Trash className="w-4 h-4" /></BoardBtn>
          </div>
        )}
      </div>
    </li>
  );
};

export const GhFlightBoard: React.FC<Props> = props => {
  const { groups, selectedIds } = props;

  const sections = useMemo(() => {
    const bundles = groups.filter(g => !g.isIndependent);
    const loose = groups.filter(g => g.isIndependent).flatMap(g => g.flights.map(f => ({ f, tripId: g.trip.id })));
    return { bundles, loose };
  }, [groups]);

  const nextId = useMemo(() => {
    const t0 = new Date();
    t0.setHours(0, 0, 0, 0);
    let best: Transport | null = null;
    groups.forEach(g => g.flights.forEach(f => {
      const d = getFlightDepartureUtcDate(f);
      if (d >= t0 && (!best || d < getFlightDepartureUtcDate(best))) best = f;
    }));
    return (best as Transport | null)?.id;
  }, [groups]);

  const total = groups.reduce((n, g) => n + g.flights.length, 0);

  return (
    <div className="wg-board rounded-3xl p-3 sm:p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-board-amber">
          <Airplane className="w-6 h-6 sm:w-8 sm:h-8 -rotate-45" />
          <span className="text-lg sm:text-2xl font-bold tracking-[0.2em]">DEPARTURES</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline text-2xs tracking-[0.2em] text-board-muted">{total} FLIGHTS</span>
          <Clock />
        </div>
      </div>

      <div className="hidden xl:grid grid-cols-[7.5rem_5.5rem_7rem_1fr_5rem_6rem_7rem] gap-x-4 px-4 pr-[8.5rem] text-2xs tracking-[0.2em] text-board-muted border-b border-board-line pb-2" aria-hidden="true">
        <span>DATE</span><span>TIME</span><span>FLIGHT</span><span>FROM → TO</span><span>SEAT</span><span>CLASS</span><span>STATUS</span>
      </div>

      {sections.bundles.map(g => (
        <section key={g.trip.id} className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="min-w-0 text-board-paper">
              <div className="text-sm sm:text-base font-bold uppercase tracking-wider truncate">{g.trip.originalName || 'Trip'}</div>
              <div className="text-2xs text-board-muted uppercase truncate">{g.trip.name} · {g.flights.length} {g.flights.length === 1 ? 'flight' : 'flights'}</div>
            </div>
            {!props.selecting && (
              <div className="flex shrink-0">
                <BoardBtn label="Edit bundle" onClick={() => props.onEditBundle(g.trip)}><PencilSimple className="w-4 h-4" /></BoardBtn>
                {props.onOpenTrip && <BoardBtn label="Open trip" onClick={() => props.onOpenTrip!(g.trip.id)}><Compass className="w-4 h-4" /></BoardBtn>}
              </div>
            )}
          </div>
          <ul className="flex flex-col gap-2">
            {g.flights.map(f => (
              <Row key={f.id} f={f} tripId={g.trip.id} isNext={f.id === nextId} selected={selectedIds.has(f.id)} {...props} />
            ))}
          </ul>
        </section>
      ))}

      {sections.loose.length > 0 && (
        <section className="flex flex-col gap-2">
          {sections.bundles.length > 0 && (
            <div className="px-1 text-sm sm:text-base font-bold uppercase tracking-wider text-board-paper">Independent flights</div>
          )}
          <ul className="flex flex-col gap-2">
            {sections.loose.map(({ f, tripId }) => (
              <Row key={f.id} f={f} tripId={tripId} isNext={f.id === nextId} selected={selectedIds.has(f.id)} {...props} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};
