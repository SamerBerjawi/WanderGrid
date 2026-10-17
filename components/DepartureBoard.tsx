import React, { useMemo } from 'react';
import { Airplane, Boat, Bus, Car, Train } from './ui/hugeicons';
import { Transport, Trip, TransportMode } from '../types';
import { formatDate } from '../utils/formatters';
import { getFlightDepartureUtcDate } from '../utils/flightData';

export interface BoardItem {
  flight: Transport;
  /** Parent trip, when the journey belongs to one (road, rail and sea journeys may be independent). */
  trip?: Pick<Trip, 'name'>;
}

interface DepartureBoardProps<T extends BoardItem> {
  items: T[];
  onSelect?: (item: T) => void;
}

const MODE_ICON: Record<TransportMode, React.ElementType> = {
  Flight: Airplane,
  Train,
  Bus,
  'Car Rental': Car,
  'Personal Car': Car,
  Cruise: Boat,
  Ferry: Boat,
};

/** IATA-style code when the value is short, otherwise a truncated place name. */
const toCode = (value: string): string => {
  const v = (value || '').trim();
  return v.length <= 4 ? v.toUpperCase() : v.slice(0, 3).toUpperCase();
};

const daysUntil = (item: BoardItem): number => {
  const ms = getFlightDepartureUtcDate(item.flight).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
};

const BoardingPass = <T extends BoardItem>({ item, onSelect }: { item: T; onSelect?: (i: T) => void }) => {
  const { flight } = item;
  const Icon = MODE_ICON[flight.mode] ?? Airplane;
  const days = daysUntil(item);
  const countdown = days > 0 ? String(days) : days === 0 ? '0' : '-';
  const countdownLabel = days > 0 ? 'days' : days === 0 ? 'today' : 'done';

  return (
    <button
      type="button"
      onClick={() => onSelect?.(item)}
      aria-label={`${flight.origin} to ${flight.destination}, ${flight.identifier}`}
      className="w-full min-h-[44px] flex text-left rounded-2xl overflow-hidden bg-board-paper text-board-ink shadow-lg cursor-pointer hover:-translate-y-0.5 transition-transform"
    >
      <div className="flex-1 min-w-0 p-4 sm:p-5">
        <div className="text-2xs tracking-[0.15em] text-board-muted uppercase font-mono truncate">
          {flight.provider || flight.mode} {flight.identifier}
        </div>
        <div className="flex items-center gap-3 my-2 font-mono">
          <span className="text-2xl sm:text-4xl font-medium">{toCode(flight.origin)}</span>
          <span className="flex-1 border-t-2 border-dotted border-board-ink relative h-0">
            <Icon className={`w-6 h-6 absolute left-1/2 -translate-x-1/2 -top-3 bg-board-paper px-1 ${flight.mode === 'Flight' ? 'rotate-45' : ''}`} />
          </span>
          <span className="text-2xl sm:text-4xl font-medium">{toCode(flight.destination)}</span>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs font-mono text-board-muted">
          <span>
            DATE<br />
            <b className="text-board-ink font-medium text-sm">{formatDate(flight.departureDate, 'short')}</b>
          </span>
          <span>
            TIME<br />
            <b className="text-board-ink font-medium text-sm">{flight.departureTime || '--:--'}</b>
          </span>
          {flight.seatNumber && (
            <span>
              SEAT<br />
              <b className="text-board-ink font-medium text-sm">{flight.seatNumber}</b>
            </span>
          )}
        </div>
      </div>
      <div className="w-0 border-l-2 border-dashed border-board-ink my-3" aria-hidden="true" />
      <div className="wg-ticket-stub w-20 sm:w-24 shrink-0 flex flex-col items-center justify-center font-mono">
        <span className="text-2xs tracking-wider">T-MINUS</span>
        <span className="text-3xl font-medium">{countdown}</span>
        <span className="text-2xs tracking-wider uppercase">{countdownLabel}</span>
      </div>
    </button>
  );
};

/** Departure Board: the next journey as a boarding pass, then the rest as a split-flap list. */
export const DepartureBoard = <T extends BoardItem>({ items, onSelect }: DepartureBoardProps<T>) => {
  const { next, rest } = useMemo(() => {
    const sorted = [...items].sort(
      (a, b) => getFlightDepartureUtcDate(a.flight).getTime() - getFlightDepartureUtcDate(b.flight).getTime()
    );
    const nextIdx = sorted.findIndex(i => daysUntil(i) >= 0);
    if (nextIdx === -1) return { next: null, rest: sorted.reverse() };
    return {
      next: sorted[nextIdx],
      rest: [...sorted.slice(nextIdx + 1), ...sorted.slice(0, nextIdx).reverse()],
    };
  }, [items]);

  return (
    <div className="wg-board rounded-3xl p-4 sm:p-6 flex flex-col gap-4">
      <div className="flex justify-between text-xs tracking-[0.2em] text-board-muted">
        <span>DEPARTURES</span>
        <span>{items.length}</span>
      </div>

      {next && <BoardingPass item={next} onSelect={onSelect} />}

      <ul className="flex flex-col">
        {rest.map(item => {
          const past = daysUntil(item) < 0;
          const Icon = MODE_ICON[item.flight.mode] ?? Airplane;
          return (
            <li key={item.flight.id} className="border-b border-board-line last:border-b-0">
              <button
                type="button"
                onClick={() => onSelect?.(item)}
                className="w-full min-h-[44px] flex items-center gap-3 py-2 text-left text-sm cursor-pointer hover:bg-white/5 rounded-lg px-2 -mx-2"
              >
                <span className="w-24 shrink-0 text-board-muted">{formatDate(item.flight.departureDate, 'short')}</span>
                <Icon className="w-4 h-4 shrink-0 text-board-muted" />
                <span className="flex-1 min-w-0 truncate uppercase">
                  {toCode(item.flight.origin)} → {toCode(item.flight.destination)}
                  {item.trip?.name && <span className="hidden sm:inline text-board-muted"> · {item.trip.name}</span>}
                </span>
                <span className={past ? 'text-board-muted' : 'text-board-ok'}>{past ? 'DEPARTED' : 'ON TIME'}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default DepartureBoard;
