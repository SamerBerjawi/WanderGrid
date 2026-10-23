import React, { useMemo } from 'react';
import { AirplaneLanding, AirplaneTakeoff } from '../../ui/hugeicons';
import { SankeyChart, type SankeyAccent, type SankeyFlowNode } from '../../bklit/sankey-chart';
import type { LegMode, MapRoute } from './mapModel';
import { buildPlaceFlows, describeFlows, shortPlaceLabel, type FlowNode } from './placeFlows';

/** The place sheet's Sankey: arrivals across the top, the place in the middle band, departures below. */

const MODE_ACCENT: Record<LegMode, SankeyAccent> = { flight: 'rust', rail: 'green', road: 'ochre', sea: 'sea' };
const MODE_WORD: Record<LegMode, [string, string]> = {
    flight: ['flight', 'flights'], rail: ['train trip', 'train trips'], road: ['road trip', 'road trips'], sea: ['sea trip', 'sea trips'],
};

const toChartNode = (n: FlowNode): SankeyFlowNode => {
    const [one, many] = MODE_WORD[n.mode];
    const word = n.others ? 'trips' : n.count === 1 ? one : many;
    const dir = n.side === 'in' ? 'arrived from' : 'departed to';
    const extra = n.roundTrip ? ' · also the other way' : '';
    return {
        key: n.key,
        label: n.others ? n.label : n.label,
        title: n.name,
        detail: `${n.count} ${word}${extra}`,
        ariaLabel: n.others
            ? `${n.name}: ${n.count} ${word} ${n.side === 'in' ? 'arrived' : 'departed'}. Show all routes`
            : `${n.name}: ${n.count} ${word} ${dir} here${extra}. Open route`,
        value: n.count,
        accent: n.others ? 'muted' : MODE_ACCENT[n.mode],
    };
};

export interface PlaceFlowChartProps {
    placeId: string;
    routes: MapRoute[];
    onOpenRoute: (route: MapRoute) => void;
    /** The grouped "+N others" node was chosen. */
    onShowOthers: () => void;
}

const PlaceFlowChart: React.FC<PlaceFlowChartProps> = ({ placeId, routes, onOpenRoute, onShowOthers }) => {
    const flows = useMemo(() => buildPlaceFlows(placeId, routes), [placeId, routes]);
    const nodes = useMemo(() => new Map([...flows.incoming, ...flows.outgoing].map(n => [n.key, n])), [flows]);
    const top = useMemo(() => flows.incoming.map(toChartNode), [flows]);
    const bottom = useMemo(() => flows.outgoing.map(toChartNode), [flows]);
    const code = shortPlaceLabel(placeId, 12);
    const { totals } = flows;
    if (!top.length && !bottom.length) return null;

    const open = (key: string) => {
        const n = nodes.get(key);
        if (!n) return;
        if (n.route) onOpenRoute(n.route);
        else onShowOthers();
    };

    return (
        <div className="flex flex-col gap-1 pb-1">
            {top.length ? (
                <p className="flex items-center gap-1.5 px-1 text-xs font-medium text-rp-muted">
                    <AirplaneLanding size={14} aria-hidden /> Arrivals · <span className="rp-tabular text-rp-ink">{totals.in}</span>
                    <span className="font-normal">from {totals.inRoutes} {totals.inRoutes === 1 ? 'place' : 'places'}</span>
                </p>
            ) : null}
            <SankeyChart
                top={top}
                bottom={bottom}
                centerLabel={`${code} · ${totals.in} in · ${totals.out} out`}
                label={describeFlows(code, flows)}
                onSelect={open}
            />
            {bottom.length ? (
                <p className="flex items-center gap-1.5 px-1 text-xs font-medium text-rp-muted">
                    <AirplaneTakeoff size={14} aria-hidden /> Departures · <span className="rp-tabular text-rp-ink">{totals.out}</span>
                    <span className="font-normal">to {totals.outRoutes} {totals.outRoutes === 1 ? 'place' : 'places'}</span>
                </p>
            ) : null}
        </div>
    );
};

export default PlaceFlowChart;
