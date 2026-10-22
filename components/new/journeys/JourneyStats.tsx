import React, { useMemo } from 'react';
import NumberFlow from '@number-flow/react';
import { BarChart } from '../../bklit/bar-chart';
import { RoutesMap } from './RoutesMap';
import { Airplane, Globe, Path, type Icon } from '../../ui/hugeicons';
import { journeyTotals, routeLines, totalsByYear, type JourneyRecord } from '../../../utils/journeysModel';

/**
 * The Stats view: where the flights went (a still map of the routes) and how much was flown each year
 * (flights and kilometres, BklitUI bars). Everything follows the page's filters, like the totals.
 */

const Card: React.FC<{ title: string; icon: Icon; hero?: React.ReactNode; qualifier?: string; children: React.ReactNode; className?: string }> = ({ title, icon: IconC, hero, qualifier, children, className }) => (
    <section aria-label={title} className={`flex min-w-0 flex-col gap-3 rounded-rp-card bg-rp-surface p-4 rp-shadow-rest sm:p-6 ${className ?? ''}`}>
        <div className="flex items-center gap-2 text-sm font-medium text-rp-ink">
            <IconC size={16} className="text-rp-muted" aria-hidden /> {title}
        </div>
        {hero ? (
            <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="rp-tabular text-[1.75rem] leading-none font-medium text-rp-ink">{hero}</span>
                {qualifier ? <span className="text-sm text-rp-muted">{qualifier}</span> : null}
            </div>
        ) : null}
        {children}
    </section>
);

export const JourneyStats: React.FC<{ items: JourneyRecord[] }> = ({ items }) => {
    const years = useMemo(() => totalsByYear(items), [items]);
    const routes = useMemo(() => routeLines(items), [items]);
    const totals = useMemo(() => journeyTotals(items), [items]);
    const mostFlights = years.reduce((a, b) => (b.count > a.count ? b : a), years[0]);
    const mostKm = years.reduce((a, b) => (b.km > a.km ? b : a), years[0]);
    const span = `over ${years.length} ${years.length === 1 ? 'year' : 'years'}`;

    return (
        <div className="grid gap-3 lg:grid-cols-2 lg:gap-6">
            <Card
                title="Routes"
                icon={Globe}
                hero={<NumberFlow value={routes.length} />}
                qualifier={`${routes.length === 1 ? 'route' : 'routes'} between ${totals.airports} ${totals.airports === 1 ? 'airport' : 'airports'}`}
                className="lg:col-span-2"
            >
                {routes.length > 0
                    ? <RoutesMap routes={routes} className="h-56 sm:h-72 lg:h-80" label={`Map of ${routes.length} routes between ${totals.airports} airports`} />
                    : <p className="py-10 text-center text-sm text-rp-muted">No flights with known airports to draw.</p>}
            </Card>
            <Card title="Flights per year" icon={Airplane} hero={<NumberFlow value={totals.count} />} qualifier={mostFlights ? `${span} · most in ${mostFlights.year} (${mostFlights.count})` : undefined}>
                <BarChart className="h-48" color="rust" label="Flights per year" data={years.map(y => ({ label: y.year, value: y.count }))} />
            </Card>
            <Card title="Kilometres per year" icon={Path} hero={<NumberFlow value={totals.km} format={{ maximumFractionDigits: 0 }} />} qualifier={mostKm ? `km ${span} · most in ${mostKm.year}` : undefined}>
                <BarChart className="h-48" color="green" label="Kilometres per year" format={v => (v >= 10000 ? `${Math.round(v / 1000)}k` : v.toLocaleString('en-US'))} data={years.map(y => ({ label: y.year, value: y.km }))} />
            </Card>
        </div>
    );
};
