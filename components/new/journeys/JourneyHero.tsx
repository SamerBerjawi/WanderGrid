import React, { useMemo, useState } from 'react';
import NumberFlow from '@number-flow/react';
import { BarChart } from '../../bklit/bar-chart';
import { RoutesMap } from './RoutesMap';
import { RpChip } from '../ui';
import { Airplane, Path } from '../../ui/hugeicons';
import { journeyTotals, routeLines, totalsByYear, type JourneyRecord } from '../../../utils/journeysModel';

/**
 * The hero card of the Flights page: where the flights went (a still map of the routes) beside how much
 * was flown each year, one chart at a time (flights or kilometres, BklitUI bars) with its total and the
 * busiest year. On phones the chart sits under the map. Everything follows the page's filters.
 */

type Metric = 'count' | 'km';
const KEY = 'wandergrid_flights_new_hero_metric';
const read = (): Metric => { try { return localStorage.getItem(KEY) === 'km' ? 'km' : 'count'; } catch { return 'count'; } };

export const JourneyHero: React.FC<{ items: JourneyRecord[] }> = ({ items }) => {
    const [metric, setMetric] = useState<Metric>(read);
    const change = (m: Metric) => { setMetric(m); try { localStorage.setItem(KEY, m); } catch { /* storage unavailable */ } };
    const years = useMemo(() => totalsByYear(items), [items]);
    const routes = useMemo(() => routeLines(items), [items]);
    const totals = useMemo(() => journeyTotals(items), [items]);
    const best = years.reduce((a, b) => (b[metric] > a[metric] ? b : a), years[0]);
    const span = `over ${years.length} ${years.length === 1 ? 'year' : 'years'}`;
    const isKm = metric === 'km';

    return (
        <section aria-label="Routes and years" className="grid gap-4 rounded-rp-card bg-rp-surface p-4 rp-shadow-rest sm:p-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-6">
            <div className="flex min-w-0 flex-col gap-2">
                <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="rp-tabular text-[1.75rem] leading-none font-medium text-rp-ink"><NumberFlow value={routes.length} /></span>
                    <span className="text-sm text-rp-muted">{routes.length === 1 ? 'route' : 'routes'} between {totals.airports} {totals.airports === 1 ? 'airport' : 'airports'}</span>
                </div>
                {routes.length > 0
                    ? <RoutesMap routes={routes} className="h-48 sm:h-60 lg:h-full lg:min-h-64" label={`Map of ${routes.length} routes between ${totals.airports} airports`} />
                    : <p className="py-10 text-center text-sm text-rp-muted">No flights with known airports to draw.</p>}
            </div>

            <div className="flex min-w-0 flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div role="group" aria-label="Chart" className="flex gap-2">
                        <RpChip selected={!isKm} onClick={() => change('count')}><Airplane size={16} aria-hidden /> Flights</RpChip>
                        <RpChip selected={isKm} onClick={() => change('km')}><Path size={16} aria-hidden /> Kilometres</RpChip>
                    </div>
                </div>
                <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="rp-tabular text-[1.75rem] leading-none font-medium text-rp-ink">
                        <NumberFlow value={isKm ? totals.km : totals.count} format={{ maximumFractionDigits: 0 }} />
                    </span>
                    <span className="text-sm text-rp-muted">{isKm ? 'km' : totals.count === 1 ? 'flight' : 'flights'} {span}{best && years.length > 1 ? ` · most in ${best.year}` : ''}</span>
                </div>
                <BarChart
                    className="h-48 lg:h-full lg:min-h-48"
                    color={isKm ? 'green' : 'rust'}
                    label={isKm ? 'Kilometres per year' : 'Flights per year'}
                    format={isKm ? (v => (v >= 10000 ? `${Math.round(v / 1000)}k` : v.toLocaleString('en-US'))) : undefined}
                    data={years.map(y => ({ label: y.year, value: y[metric] }))}
                />
            </div>
        </section>
    );
};
