import React, { useMemo, useState } from 'react';
import { cn } from '../../../utils/cn';
import NumberFlow from '@number-flow/react';
import { BarChart } from '../../bklit/bar-chart';
import { RoutesMap } from './RoutesMap';
import { Airplane, Clock, Globe, type Icon } from '../../ui/hugeicons';
import { aroundTheWorld, journeyTotals, routeLines, totalsByYear, type JourneyRecord } from '../../../utils/journeysModel';

/**
 * The hero card of the Flights page, holding every number: three totals (flights, kilometres, hours in
 * the air, filled with their accent), a still map of where the flights went, and the year-by-year bars.
 * The three totals are also the chart's switch: tap one to chart it per year. On phones the chart sits
 * under the map. Everything follows the page's filters.
 */

type Metric = 'count' | 'km' | 'minutes';
const KEY = 'wandergrid_flights_new_hero_metric';
const read = (): Metric => { try { const v = localStorage.getItem(KEY); return v === 'km' || v === 'minutes' ? v : 'count'; } catch { return 'count'; } };

/** The totals are filled with their accent: ink, green and mustard, each with its own readable text. */
const TONE = {
    ink: { card: 'bg-rp-ink text-rp-on-ink', muted: 'text-rp-on-ink/70', circle: 'bg-rp-on-ink/15', ring: 'ring-rp-ink' },
    green: { card: 'bg-rp-green text-rp-paper', muted: 'text-rp-paper/80', circle: 'bg-rp-paper/20', ring: 'ring-rp-green' },
    mustard: { card: 'bg-rp-mustard text-rp-on-mustard', muted: 'text-rp-on-mustard/70', circle: 'bg-rp-on-mustard/10', ring: 'ring-rp-mustard' },
} as const;

const Total: React.FC<{ icon: Icon; tone: keyof typeof TONE; value: number; unit: string; sub: string; subShort: string; selected: boolean; onSelect: () => void; label: string }> = ({ icon: IconC, tone, value, unit, sub, subShort, selected, onSelect, label }) => {
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
                    <NumberFlow value={value} format={{ maximumFractionDigits: 0 }} className="rp-tabular text-xl leading-tight font-semibold" />
                    <span className={cn('text-sm', t.muted)}>{unit}</span>
                </span>
                <span className={cn('block truncate text-xs leading-snug', t.muted)}><span className="sm:hidden">{subShort}</span><span className="hidden sm:inline">{sub}</span></span>
            </span>
        </button>
    );
};

const TITLE: Record<Metric, string> = { count: 'Flights per year', km: 'Kilometres per year', minutes: 'Hours in the air per year' };

export const JourneyHero: React.FC<{ items: JourneyRecord[] }> = ({ items }) => {
    const [metric, setMetric] = useState<Metric>(read);
    const change = (m: Metric) => { setMetric(m); try { localStorage.setItem(KEY, m); } catch { /* storage unavailable */ } };
    const years = useMemo(() => totalsByYear(items), [items]);
    const routes = useMemo(() => routeLines(items), [items]);
    const totals = useMemo(() => journeyTotals(items), [items]);
    const best = years.reduce((a, b) => (b[metric] > a[metric] ? b : a), years[0]);
    const earth = aroundTheWorld(totals.km);
    const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
    const hours = (v: number) => Math.round(v / 60);

    return (
        <section aria-label="Flight statistics" className="flex flex-col gap-4 rounded-rp-card bg-rp-surface p-3 rp-shadow-rest sm:p-5 lg:gap-5 lg:p-6">
            <div role="group" aria-label="Totals. Choose one to chart it per year" className="grid grid-cols-3 gap-2 sm:gap-3 lg:gap-4">
                <Total
                    tone="ink" icon={Airplane} label="Flights" selected={metric === 'count'} onSelect={() => change('count')}
                    value={totals.count} unit={totals.count === 1 ? 'flight' : 'flights'}
                    sub={[totals.upcoming > 0 ? `${totals.upcoming} upcoming` : '', plural(totals.carriers, 'airline', 'airlines')].filter(Boolean).join(' · ')}
                    subShort={totals.upcoming > 0 ? `${totals.upcoming} upcoming` : plural(totals.carriers, 'airline', 'airlines')}
                />
                <Total
                    tone="green" icon={Globe} label="Kilometres" selected={metric === 'km'} onSelect={() => change('km')}
                    value={totals.km} unit="km"
                    sub={[plural(totals.airports, 'airport', 'airports'), earth >= 0.1 ? `${earth.toFixed(1)}× the Earth` : ''].filter(Boolean).join(' · ')}
                    subShort={plural(totals.airports, 'airport', 'airports')}
                />
                <Total
                    tone="mustard" icon={Clock} label="Hours in the air" selected={metric === 'minutes'} onSelect={() => change('minutes')}
                    value={hours(totals.minutes)} unit="hours"
                    sub={plural(totals.countries, 'country', 'countries')} subShort={plural(totals.countries, 'country', 'countries')}
                />
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-6">
                <div className="flex min-w-0 flex-col gap-2 px-1">
                    <p className="text-sm text-rp-muted"><span className="rp-tabular font-medium text-rp-ink">{routes.length}</span> {routes.length === 1 ? 'route' : 'routes'} between {plural(totals.airports, 'airport', 'airports')}</p>
                    {routes.length > 0
                        ? <RoutesMap routes={routes} className="h-48 sm:h-60 lg:h-full lg:min-h-64" label={`Map of ${routes.length} routes between ${totals.airports} airports`} />
                        : <p className="py-10 text-center text-sm text-rp-muted">No flights with known airports to draw.</p>}
                </div>
                <div className="flex min-w-0 flex-col gap-2 px-1">
                    <p className="text-sm text-rp-muted"><span className="font-medium text-rp-ink">{TITLE[metric]}</span>{best && years.length > 1 ? ` · most in ${best.year}` : ''}</p>
                    <BarChart
                        className="h-48 lg:h-full lg:min-h-48"
                        color={metric === 'count' ? 'rust' : metric === 'km' ? 'green' : 'mustard'}
                        label={TITLE[metric]}
                        format={metric === 'km' ? (v => (v >= 10000 ? `${Math.round(v / 1000)}k` : v.toLocaleString('en-US'))) : undefined}
                        data={years.map(y => ({ label: y.year, value: metric === 'minutes' ? hours(y.minutes) : y[metric] }))}
                    />
                </div>
            </div>
        </section>
    );
};
