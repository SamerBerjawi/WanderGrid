import { formatProperLocationName } from '../../../services/geocoding';
import type { LegMode, MapRoute } from './mapModel';

/**
 * What the place sheet's Sankey draws, as plain data: for one place, the other ends of the trips that
 * arrived (top) and departed (bottom), weighted by how many times each was travelled in that direction.
 * Long tails are grouped into one "+N others" node per side so 200 routes stay readable.
 */

export type FlowSide = 'in' | 'out';

export interface FlowNode {
    /** Stable key: side, mode and the other end ("in:flight:LHR"), or "in:others". */
    key: string;
    side: FlowSide;
    /** Short text for the chart (an IATA code, or a shortened name). */
    label: string;
    /** Full name for the tooltip and the screen-reader description. */
    name: string;
    /** Times travelled in this direction (the node's weight). */
    count: number;
    mode: LegMode;
    /** The route to open when the node is chosen; absent for the grouped node. */
    route?: MapRoute;
    /** True for the "+N others" node. */
    others?: boolean;
    /** How many routes the grouped node stands for. */
    groupSize?: number;
    /** Routes inside the grouped node. */
    groupRoutes?: MapRoute[];
    /** The other end's id, as the route names it. */
    otherId?: string;
    /** The same other end also appears on the opposite side (a round trip). */
    roundTrip?: boolean;
}

export interface PlaceFlows {
    incoming: FlowNode[];
    outgoing: FlowNode[];
    /** Arrivals and departures in total, and the number of distinct routes (other ends) on each side. */
    totals: { in: number; out: number; inRoutes: number; outRoutes: number };
}

export const DEFAULT_TOP = 8;

/** An IATA-like code stays as is; anything else is shortened to a readable first word or two. */
export const shortPlaceLabel = (id: string, max = 10): string => {
    const raw = (id || '').trim();
    if (/^[A-Za-z]{3,4}$/.test(raw)) return raw.toUpperCase();
    const proper = formatProperLocationName(raw);
    const head = proper.split(/[,(·]/)[0].trim();
    if (head.length <= max) return head;
    const first = head.split(/\s+/)[0];
    return (first.length <= max ? first : first.slice(0, max - 1)) + (first.length <= max ? '' : '…');
};

interface Tally { route: MapRoute; other: string; count: number }

const tally = (placeId: string, routes: MapRoute[], side: FlowSide): Tally[] => {
    const out: Tally[] = [];
    routes.forEach(route => {
        // Legs know their direction; a route (one per corridor and mode) holds both ways.
        const legs = route.legs.filter(l => (side === 'in' ? l.destination === placeId : l.origin === placeId));
        if (!legs.length) return;
        // The other end is the opposite endpoint of the route's legs.
        const other = side === 'in' ? legs[0].origin : legs[0].destination;
        if (other === placeId) return;
        out.push({ route, other, count: legs.length });
    });
    return out.sort((a, b) => b.count - a.count || a.other.localeCompare(b.other));
};

const sideNodes = (items: Tally[], side: FlowSide, top: number): FlowNode[] => {
    const toNode = (t: Tally): FlowNode => ({
        key: `${side}:${t.route.mode}:${t.other}`,
        side,
        label: shortPlaceLabel(t.other),
        name: formatProperLocationName(t.other),
        count: t.count,
        mode: t.route.mode,
        route: t.route,
        otherId: t.other,
    });
    // One "+N others" node only when it replaces at least two routes; a lone leftover is shown itself.
    if (items.length <= top + 1) return items.map(toNode);
    const shown = items.slice(0, top).map(toNode);
    const rest = items.slice(top);
    const count = rest.reduce((s, t) => s + t.count, 0);
    shown.push({
        key: `${side}:others`,
        side,
        label: `+${rest.length}`,
        name: `${rest.length} other routes`,
        count,
        mode: rest[0].route.mode,
        others: true,
        groupSize: rest.length,
        groupRoutes: rest.map(t => t.route),
    });
    return shown;
};

export const buildPlaceFlows = (placeId: string, routes: MapRoute[], top = DEFAULT_TOP): PlaceFlows => {
    const mine = routes.filter(r => r.origin === placeId || r.destination === placeId);
    const ins = tally(placeId, mine, 'in');
    const outs = tally(placeId, mine, 'out');
    const incoming = sideNodes(ins, 'in', top);
    const outgoing = sideNodes(outs, 'out', top);
    const mark = (nodes: FlowNode[], opposite: Tally[]) => {
        const ends = new Set(opposite.map(t => t.other));
        nodes.forEach(n => { if (n.otherId && ends.has(n.otherId)) n.roundTrip = true; });
    };
    mark(incoming, outs);
    mark(outgoing, ins);
    return {
        incoming,
        outgoing,
        totals: {
            in: ins.reduce((s, t) => s + t.count, 0),
            out: outs.reduce((s, t) => s + t.count, 0),
            inRoutes: ins.length,
            outRoutes: outs.length,
        },
    };
};

/** The sentence a screen reader gets for the chart. */
export const describeFlows = (code: string, f: PlaceFlows): string => {
    const part = (n: number, routes: number, dir: string, prep: string) => `${n} ${dir} ${prep} ${routes} ${routes === 1 ? 'place' : 'places'}`;
    const bits = [
        f.totals.in ? part(f.totals.in, f.totals.inRoutes, f.totals.in === 1 ? 'arrival' : 'arrivals', 'from') : '',
        f.totals.out ? part(f.totals.out, f.totals.outRoutes, f.totals.out === 1 ? 'departure' : 'departures', 'to') : '',
    ].filter(Boolean);
    return `Sankey of routes at ${code}: ${bits.join(', ') || 'no routes'}`;
};
