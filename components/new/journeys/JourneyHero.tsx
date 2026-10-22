import React, { useMemo, useState } from 'react';
import { cn } from '../../../utils/cn';
import NumberFlow from '@number-flow/react';
import { BarChart } from '../../bklit/bar-chart';
import { RoutesMap } from './RoutesMap';
import { Airplane, Buildings, Clock, CurrencyDollar, Globe, Seat, type Icon } from '../../ui/hugeicons';
import { getActiveCurrency, formatCurrency } from '../../../utils/formatters';
import { aroundTheWorld, byAirport, byCarrier, byClass, byMode, journeyTotals, routeLines, totalsByYear, type JourneyRecord, type Tally } from '../../../utils/journeysModel';

/**
 * The hero card of the Flights page, holding every number: three totals (flights, kilometres, hours in
 * the air, filled with their accent), a still map of where the flights went, and the year-by-year bars.
 * The three totals are also the chart's switch: tap one to chart it per year. On phones the chart sits
 * under the map. Everything follows the page's filters.
 */

type Metric = 'count' | 'km' | 'minutes' | 'cost';
const KEY = 'wandergrid_flights_new_hero_metric';
const keyFor = (land: boolean) => (land ? 'wandergrid_roadtrips_new_hero_metric' : KEY);
const read = (land: boolean): Metric => { try { const v = localStorage.getItem(keyFor(land)); return v === 'km' || v === 'minutes' || v === 'cost' ? v : 'count'; } catch { return 'count'; } };

/** The totals are filled with their accent: ink, green and mustard, each with its own readable text. */
const TONE = {
    ink: { card: 'bg-rp-ink text-rp-on-ink', muted: 'text-rp-on-ink/70', circle: 'bg-rp-on-ink/15', ring: 'ring-rp-ink' },
    green: { card: 'bg-rp-green text-rp-paper', muted: 'text-rp-paper/80', circle: 'bg-rp-paper/20', ring: 'ring-rp-green' },
    mustard: { card: 'bg-rp-mustard text-rp-on-mustard', muted: 'text-rp-on-mustard/70', circle: 'bg-rp-on-mustard/10', ring: 'ring-rp-mustard' },
    rust: { card: 'bg-rp-rust text-rp-paper', muted: 'text-rp-paper/80', circle: 'bg-rp-paper/20', ring: 'ring-rp-rust' },
} as const;

const Total: React.FC<{ icon: Icon; tone: keyof typeof TONE; value: number; unit: string; money?: boolean; sub: string; subShort: string; selected: boolean; onSelect: () => void; label: string }> = ({ icon: IconC, tone, value, unit, money, sub, subShort, selected, onSelect, label }) => {
    const t = TONE[tone];
    return (
        <button
            type="button"
            aria-pressed={selected}
            aria-label={label}
            onClick={onSelect}
            className={cn(
                'flex min-w-0 items-center gap-3 rounded-rp-tile p-3 text-left outline-none transition-[box-shadow,transform] duration-150 sm:p-4',
                'focus-visible:ring-2 focus-visible:ring-rp-muted active:scale-[0.99]',
                t.card,
                selected ? `ring-2 ring-offset-2 ring-offset-rp-surface ${t.ring}` : 'hover:-translate-y-0.5'
            )}
        >
            <span className={cn('hidden size-10 shrink-0 items-center justify-center rounded-full sm:flex', t.circle)}><IconC size={18} aria-hidden /></span>
            <span className="min-w-0">
                <span className="flex flex-wrap items-baseline gap-x-1.5">
                    <NumberFlow value={value} format={money ? { style: 'currency', currency: getActiveCurrency(), maximumFractionDigits: 0 } : { maximumFractionDigits: 0 }} className="rp-tabular text-xl leading-tight font-semibold" />
                    {unit ? <span className={cn('text-sm', t.muted)}>{unit}</span> : null}
                </span>
                <span className={cn('block truncate text-xs leading-snug', t.muted)}><span className="sm:hidden">{subShort}</span><span className="hidden sm:inline">{sub}</span></span>
            </span>
        </button>
    );
};

const TITLE: Record<Metric, string> = { count: 'Flights per year', km: 'Kilometres per year', minutes: 'Hours in the air per year', cost: 'Spend per year' };
const TITLE_LAND: Record<Metric, string> = { count: 'Journeys per year', km: 'Kilometres per year', minutes: 'Hours travelling per year', cost: 'Spend per year' };

/** Top few with a bar for how many, then "+N more". */
const Breakdown: React.FC<{ title: string; icon: Icon; rows: Tally[]; unit: string }> = ({ title, icon: IconC, rows, unit }) => {
    const top = rows.slice(0, 3);
    const max = Math.max(1, ...top.map(r => r.count));
    return (
        <div className="flex min-w-0 flex-col gap-2 rounded-rp-inset bg-rp-inset/60 p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-rp-muted"><IconC size={14} className="text-rp-ochre" aria-hidden /> {title}</p>
            {top.length === 0 ? <p className="text-sm text-rp-muted">None yet</p> : (
                <ul className="flex flex-col gap-2">
                    {top.map(r => (
                        <li key={r.key} className="flex flex-col gap-1">
                            <span className="flex items-baseline justify-between gap-2 text-sm"><span className="truncate text-rp-ink">{r.label}</span><span className="rp-tabular shrink-0 font-medium text-rp-ink">{r.count}<span className="font-normal text-rp-muted"> {unit}</span></span></span>
                            <span className="h-1.5 rounded-full bg-rp-line"><span className="block h-full rounded-full bg-rp-ink" style={{ width: `${(r.count / max) * 100}%` }} /></span>
                        </li>
                    ))}
                </ul>
            )}
            {rows.length > top.length ? <p className="rp-tabular text-xs text-rp-muted">+{rows.length - top.length} more</p> : null}
        </div>
    );
};

/** `kind` = 'land' words and breakdowns it for land and sea journeys (Road trips); flights by default. */
export const JourneyHero: React.FC<{ items: JourneyRecord[]; kind?: 'flight' | 'land' }> = ({ items, kind = 'flight' }) => {
    const land = kind === 'land';
    const titles = land ? TITLE_LAND : TITLE;
    const [metric, setMetric] = useState<Metric>(() => read(land));
    const change = (m: Metric) => { setMetric(m); try { localStorage.setItem(keyFor(land), m); } catch { /* storage unavailable */ } };
    const years = useMemo(() => totalsByYear(items), [items]);
    const routes = useMemo(() => routeLines(items), [items]);
    const totals = useMemo(() => journeyTotals(items), [items]);
    const best = years.reduce((a, b) => (b[metric] > a[metric] ? b : a), years[0]);
    const earth = aroundTheWorld(totals.km);
    const carriers = useMemo(() => byCarrier(items), [items]);
    const airports = useMemo(() => byAirport(items), [items]);
    const classes = useMemo(() => byClass(items).filter(c => c.key !== 'Unknown'), [items]);
    const modes = useMemo(() => byMode(items), [items]);
    const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
    const hours = (v: number) => Math.round(v / 60);

    return (
        <section aria-label="Flight statistics" className="flex flex-col gap-4 rounded-rp-card bg-rp-surface p-3 rp-shadow-rest sm:p-5 lg:gap-5 lg:p-6">
            <div role="group" aria-label="Totals. Choose one to chart it per year" className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 lg:gap-4">
                <Total
                    tone="ink" icon={Airplane} label={land ? 'Journeys' : 'Flights'} selected={metric === 'count'} onSelect={() => change('count')}
                    value={totals.count} unit={land ? (totals.count === 1 ? 'journey' : 'journeys') : totals.count === 1 ? 'flight' : 'flights'}
                    sub={[totals.upcoming > 0 ? `${totals.upcoming} upcoming` : '', (land ? plural(totals.carriers, 'operator', 'operators') : plural(totals.carriers, 'airline', 'airlines'))].filter(Boolean).join(' · ')}
                    subShort={totals.upcoming > 0 ? `${totals.upcoming} upcoming` : land ? plural(totals.carriers, 'operator', 'operators') : plural(totals.carriers, 'airline', 'airlines')}
                />
                <Total
                    tone="green" icon={Globe} label="Kilometres" selected={metric === 'km'} onSelect={() => change('km')}
                    value={totals.km} unit="km"
                    sub={[land ? plural(totals.airports, 'place', 'places') : plural(totals.airports, 'airport', 'airports'), earth >= 0.1 ? `${earth.toFixed(1)}× the Earth` : ''].filter(Boolean).join(' · ')}
                    subShort={land ? plural(totals.airports, 'place', 'places') : plural(totals.airports, 'airport', 'airports')}
                />
                <Total
                    tone="mustard" icon={Clock} label={land ? 'Hours travelling' : 'Hours in the air'} selected={metric === 'minutes'} onSelect={() => change('minutes')}
                    value={hours(totals.minutes)} unit="hours"
                    sub={plural(totals.countries, 'country', 'countries')} subShort={plural(totals.countries, 'country', 'countries')}
                />
                <Total
                    tone="rust" icon={CurrencyDollar} label="Spend" selected={metric === 'cost'} onSelect={() => change('cost')}
                    value={totals.cost} unit="" money
                    sub={totals.count > 0 && totals.cost > 0 ? `${formatCurrency(Math.round(totals.cost / totals.count))} a flight` : 'No costs logged'}
                    subShort={totals.count > 0 && totals.cost > 0 ? `${formatCurrency(Math.round(totals.cost / totals.count))} a flight` : 'No costs'}
                />
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-6">
                <div className="flex min-w-0 flex-col gap-2 px-1">
                    <p className="text-sm text-rp-muted"><span className="rp-tabular font-medium text-rp-ink">{routes.length}</span> {routes.length === 1 ? 'route' : 'routes'} between {land ? plural(totals.airports, 'place', 'places') : plural(totals.airports, 'airport', 'airports')}</p>
                    {routes.length > 0
                        ? <RoutesMap routes={routes} className="h-48 sm:h-60 lg:h-full lg:min-h-64" label={`Map of ${routes.length} routes between ${totals.airports} places`} />
                        : <p className="py-10 text-center text-sm text-rp-muted">No flights with known airports to draw.</p>}
                </div>
                <div className="flex min-w-0 flex-col gap-2 px-1">
                    <p className="text-sm text-rp-muted"><span className="font-medium text-rp-ink">{titles[metric]}</span>{best && years.length > 1 ? ` · most in ${best.year}` : ''}</p>
                    <BarChart
                        className="h-48 lg:h-full lg:min-h-48"
                        color={metric === 'count' ? 'ink' : metric === 'km' ? 'green' : metric === 'minutes' ? 'mustard' : 'rust'}
                        label={titles[metric]}
                        format={metric === 'km' || metric === 'cost' ? (v => (v >= 10000 ? `${Math.round(v / 1000)}k` : v.toLocaleString('en-US'))) : undefined}
                        data={years.map(y => ({ label: y.year, value: metric === 'minutes' ? hours(y.minutes) : y[metric] }))}
                    />
                </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3 sm:gap-3">
                <Breakdown title={land ? 'Operators' : 'Airlines'} icon={Buildings} rows={carriers} unit={land ? 'journeys' : 'flights'} />
                <Breakdown title={land ? 'Places' : 'Airports'} icon={Airplane} rows={airports} unit="visits" />
                {land ? <Breakdown title="Mode" icon={Airplane} rows={modes} unit="journeys" /> : <Breakdown title="Cabin class" icon={Seat} rows={classes} unit="flights" />}
            </div>
        </section>
    );
};
