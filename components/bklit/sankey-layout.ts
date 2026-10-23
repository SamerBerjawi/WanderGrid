/**
 * The layout of a vertical three-layer Sankey (nodes across the top, one band in the middle, nodes
 * across the bottom), as pure functions. BklitUI's sankey-chart lays out with d3-sankey, which needs
 * at least one link on each side of the middle node and spreads the layers along the x axis; a place
 * with only arrivals or only departures is common here, so this places the three layers itself.
 *
 * Every node's width is proportional to its value, apart from a floor so the smallest stay visible.
 * A link is as wide as the node it belongs to at both ends.
 */

export interface Slot { x: number; w: number }

export interface FlowLayout {
    /** Pixels per unit of value (before the floor). */
    k: number;
    /** Where each top node sits, and the matching slot it feeds in the middle band. */
    top: { node: Slot; band: Slot }[];
    bottom: { node: Slot; band: Slot }[];
}

/** Widths for one side at a given scale: value × k, but never below the floor. */
const widthsAt = (values: number[], k: number, minW: number) => values.map(v => Math.max(v * k, minW));

const needed = (values: number[], k: number, minW: number, gap: number) =>
    widthsAt(values, k, minW).reduce((s, w) => s + w, 0) + Math.max(0, values.length - 1) * gap;

/** The largest scale at which one side (nodes, floors and gaps) still fits in `width`. */
export const scaleFor = (values: number[], width: number, gap: number, minW: number): number => {
    if (!values.length) return Infinity;
    const total = values.reduce((s, v) => s + v, 0);
    if (total <= 0) return 0;
    let lo = 0;
    let hi = width / total;
    // `needed` only grows with k, so a bisection finds the biggest k that fits.
    for (let i = 0; i < 40; i += 1) {
        const mid = (lo + hi) / 2;
        if (needed(values, mid, minW, gap) <= width) lo = mid; else hi = mid;
    }
    return lo;
};

const place = (values: number[], k: number, width: number, gap: number, minW: number) => {
    const widths = widthsAt(values, k, minW);
    const span = widths.reduce((s, w) => s + w, 0) + Math.max(0, widths.length - 1) * gap;
    let x = (width - span) / 2;
    const nodes: Slot[] = widths.map(w => {
        const slot = { x, w };
        x += w + gap;
        return slot;
    });
    // Slots in the middle band are packed edge to edge and centred.
    const packed = widths.reduce((s, w) => s + w, 0);
    let bx = (width - packed) / 2;
    const band: Slot[] = widths.map(w => {
        const slot = { x: bx, w };
        bx += w;
        return slot;
    });
    return nodes.map((node, i) => ({ node, band: band[i] }));
};

export const layoutFlow = (topValues: number[], bottomValues: number[], width: number, gap = 4, minW = 8): FlowLayout => {
    const k = Math.min(scaleFor(topValues, width, gap, minW), scaleFor(bottomValues, width, gap, minW));
    const scale = Number.isFinite(k) ? k : 0;
    return {
        k: scale,
        top: place(topValues, scale, width, gap, minW),
        bottom: place(bottomValues, scale, width, gap, minW),
    };
};

/** A ribbon from a node's slot (at y0) to its slot in the middle band (at y1), as a filled path. */
export const ribbonPath = (from: Slot, to: Slot, y0: number, y1: number): string => {
    const ym = (y0 + y1) / 2;
    const f = (n: number) => Math.round(n * 100) / 100;
    const [a0, a1] = [from.x, from.x + from.w];
    const [b0, b1] = [to.x, to.x + to.w];
    return `M${f(a0)},${f(y0)} C${f(a0)},${f(ym)} ${f(b0)},${f(ym)} ${f(b0)},${f(y1)} L${f(b1)},${f(y1)} C${f(b1)},${f(ym)} ${f(a1)},${f(ym)} ${f(a1)},${f(y0)} Z`;
};

export interface LabelSpot { index: number; x: number; row: number }

/**
 * Picks which node labels fit. The biggest nodes are placed first, on the first row if the text does
 * not touch a neighbour, else on a second row; a label that fits neither is left out (it still shows in
 * the tooltip). Text width is estimated from the character count.
 */
export const placeLabels = (centres: number[], labels: string[], priority: number[], width: number, charW = 7.4, pad = 8): LabelSpot[] => {
    const rows: [number, number][][] = [[], []];
    const out: LabelSpot[] = [];
    const order = centres.map((_, i) => i).sort((a, b) => priority[b] - priority[a] || a - b);
    order.forEach(i => {
        const w = labels[i].length * charW + pad;
        const x = Math.min(Math.max(centres[i], w / 2), width - w / 2);
        const lo = x - w / 2;
        const hi = x + w / 2;
        const row = rows.findIndex(r => r.every(([a, b]) => hi <= a || lo >= b));
        if (row < 0) return;
        rows[row].push([lo, hi]);
        out.push({ index: i, x, row });
    });
    return out;
};
