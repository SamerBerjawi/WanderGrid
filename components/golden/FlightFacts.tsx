import React from 'react';
import { Airplane, AirplaneTilt, Buildings, CalendarBlank, Clock, Crown, CurrencyDollar, Flag, Hourglass, Path, Seat, Suitcase, Ticket } from '../ui/hugeicons';
import { Transport } from '../../types';
import { formatCurrency } from '../../utils/formatters';

export interface Fact { key: string; icon: React.ReactNode; label: string; value: string }

const ic = 'w-4 h-4 shrink-0';
const fmtDuration = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${Math.round(m % 60)}m` : ''}` : `${Math.round(m)}m`);

/** Baggage belt is not a stored field; accept it when an import or the user saved it as a custom field. */
const customValue = (f: Transport, re: RegExp): string | undefined =>
  f.customFields?.find(c => re.test(c.key) && c.value)?.value;

/** The details of one flight as icon + label + value facts. Only facts that have a value are returned. */
export const flightFacts = (f: Transport, opts: { include?: Array<'seat' | 'cabin' | 'terminal' | 'gate' | 'belt' | 'aircraft' | 'pnr' | 'distance' | 'duration' | 'cost'> } = {}): Fact[] => {
  const want = (k: string) => !opts.include || (opts.include as string[]).includes(k);
  const out: Fact[] = [];
  const add = (k: string, icon: React.ReactNode, label: string, value?: string | null) => { if (want(k) && value) out.push({ key: k, icon, label, value }); };
  add('seat', <Seat className={ic} />, 'Seat', f.seatNumber ? `${f.seatNumber}${f.seatType ? ` · ${f.seatType}` : ''}${f.isExitRow ? ' · Exit row' : ''}` : '');
  add('cabin', <Crown className={ic} />, 'Cabin', f.travelClass);
  add('terminal', <Buildings className={ic} />, 'Terminal', f.departureTerminal);
  add('gate', <Flag className={ic} />, 'Gate', f.departureGate);
  add('belt', <Suitcase className={ic} />, 'Baggage belt', customValue(f, /baggage|belt|carousel/i));
  add('aircraft', <AirplaneTilt className={ic} />, 'Aircraft', [f.vehicleModel, f.tailNumber].filter(Boolean).join(' · '));
  add('pnr', <Ticket className={ic} />, 'Booking', f.confirmationCode);
  add('distance', <Path className={ic} />, 'Distance', f.distance ? `${Math.round(f.distance).toLocaleString()} km` : '');
  add('duration', <Hourglass className={ic} />, 'Duration', f.duration ? fmtDuration(f.duration) : '');
  add('cost', <CurrencyDollar className={ic} />, 'Cost', f.cost ? formatCurrency(f.cost) : '');
  return out;
};

export const dateTimeIcons = { date: <CalendarBlank className={ic} />, time: <Clock className={ic} />, flight: <Airplane className={ic} /> };

/** Compact fact: icon, small label, value. `tone` follows the surface it sits on. */
export const FactItem: React.FC<{ fact: Pick<Fact, 'icon' | 'label' | 'value'>; className?: string }> = ({ fact, className }) => (
  <span className={`inline-flex items-center gap-1.5 min-w-0 ${className || ''}`} title={fact.label}>
    <span className="opacity-70">{fact.icon}</span>
    <span className="min-w-0">
      <span className="block text-2xs uppercase tracking-wider opacity-70 leading-none">{fact.label}</span>
      <b className="block text-sm leading-tight truncate">{fact.value}</b>
    </span>
  </span>
);
